import express from 'express';
import { getDatabase } from '../database/setup.js';
import { body, validationResult } from 'express-validator';

const router = express.Router();

/**
 * @route GET /api/reports
 * @desc Get all reports with pagination and filtering
 * @access Public
 */
router.get('/', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      status, 
      severity, 
      startDate, 
      endDate,
      search 
    } = req.query;
    
    const offset = (page - 1) * limit;
    const db = await getDatabase();
    
    let whereConditions = [];
    let params = [];
    
    // Build WHERE clause
    if (status) {
      whereConditions.push('rm.report_status = ?');
      params.push(status);
    }
    
    if (startDate) {
      whereConditions.push('ar.analysis_date >= ?');
      params.push(startDate);
    }
    
    if (endDate) {
      whereConditions.push('ar.analysis_date <= ?');
      params.push(endDate);
    }
    
    if (search) {
      whereConditions.push('(ar.summary LIKE ? OR v.description LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }
    
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    
    // Get reports with video information
    const reports = await db.all(`
      SELECT 
        ar.id,
        ar.video_id,
        ar.summary,
        ar.safety_score,
        ar.analysis_date,
        ar.processing_time,
        ar.status,
        v.original_filename,
        v.duration,
        rm.report_status,
        rm.operator_comments,
        COUNT(viol.id) as violation_count
      FROM analysis_reports ar
      LEFT JOIN videos v ON ar.video_id = v.id
      LEFT JOIN report_metadata rm ON ar.id = rm.report_id
      LEFT JOIN violations viol ON ar.id = viol.report_id
      ${whereClause}
      GROUP BY ar.id
      ORDER BY ar.analysis_date DESC
      LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), offset]);

    // Get total count
    const totalCount = await db.get(`
      SELECT COUNT(DISTINCT ar.id) as count
      FROM analysis_reports ar
      LEFT JOIN videos v ON ar.video_id = v.id
      LEFT JOIN report_metadata rm ON ar.id = rm.report_id
      LEFT JOIN violations viol ON ar.id = viol.report_id
      ${whereClause}
    `, params);

    // Filter by severity if specified
    let filteredReports = reports;
    if (severity) {
      const severityReports = await db.all(`
        SELECT DISTINCT ar.id
        FROM analysis_reports ar
        JOIN violations v ON ar.id = v.report_id
        WHERE v.severity = ?
      `, [severity]);
      
      const severityIds = severityReports.map(r => r.id);
      filteredReports = reports.filter(report => severityIds.includes(report.id));
    }

    res.json({
      success: true,
      data: {
        reports: filteredReports,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalCount.count,
          pages: Math.ceil(totalCount.count / limit)
        }
      }
    });

  } catch (error) {
    console.error('❌ Error fetching reports:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch reports',
      error: error.message
    });
  }
});

/**
 * @route GET /api/reports/:reportId
 * @desc Get detailed report with all violations and metadata
 * @access Public
 */
router.get('/:reportId', async (req, res) => {
  try {
    const { reportId } = req.params;
    const db = await getDatabase();

    // Get complete report data
    const report = await db.get(`
      SELECT 
        ar.*,
        v.original_filename,
        v.duration,
        v.mime_type,
        rm.operator_comments,
        rm.report_status,
        rm.jsa_context,
        rm.user_instructions,
        rm.tags
      FROM analysis_reports ar
      LEFT JOIN videos v ON ar.video_id = v.id
      LEFT JOIN report_metadata rm ON ar.id = rm.report_id
      WHERE ar.id = ?
    `, [reportId]);

    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }

    // Get violations
    const violations = await db.all(`
      SELECT * FROM violations 
      WHERE report_id = ?
      ORDER BY start_time_seconds
    `, [reportId]);

    // Get positive observations
    const positiveObservations = await db.all(`
      SELECT observation FROM positive_observations 
      WHERE report_id = ?
    `, [reportId]);

    res.json({
      success: true,
      data: {
        ...report,
        violations,
        positiveObservations: positiveObservations.map(obs => obs.observation)
      }
    });

  } catch (error) {
    console.error('❌ Error fetching report:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch report',
      error: error.message
    });
  }
});

/**
 * @route PUT /api/reports/:reportId
 * @desc Update report metadata
 * @access Public
 */
router.put('/:reportId',
  [
    body('operatorComments').optional().isString().trim(),
    body('reportStatus').optional().isIn(['pending_review', 'reviewed', 'action_required', 'resolved']),
    body('tags').optional().isString().trim(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ 
          success: false, 
          errors: errors.array() 
        });
      }

      const { reportId } = req.params;
      const { operatorComments, reportStatus, tags } = req.body;
      const db = await getDatabase();

      // Check if report exists
      const report = await db.get('SELECT id FROM analysis_reports WHERE id = ?', [reportId]);
      if (!report) {
        return res.status(404).json({
          success: false,
          message: 'Report not found'
        });
      }

      // Update report metadata
      await db.run(`
        UPDATE report_metadata 
        SET operator_comments = ?, report_status = ?, tags = ?, updated_at = CURRENT_TIMESTAMP
        WHERE report_id = ?
      `, [
        operatorComments || null,
        reportStatus || 'pending_review',
        tags || null,
        reportId
      ]);

      res.json({
        success: true,
        message: 'Report updated successfully'
      });

    } catch (error) {
      console.error('❌ Error updating report:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update report',
        error: error.message
      });
    }
  }
);

/**
 * @route DELETE /api/reports/:reportId
 * @desc Delete report and associated data
 * @access Public
 */
router.delete('/:reportId', async (req, res) => {
  try {
    const { reportId } = req.params;
    const db = await getDatabase();

    // Check if report exists
    const report = await db.get('SELECT id FROM analysis_reports WHERE id = ?', [reportId]);
    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }

    // Delete associated data (cascade delete)
    await db.run('DELETE FROM violations WHERE report_id = ?', [reportId]);
    await db.run('DELETE FROM positive_observations WHERE report_id = ?', [reportId]);
    await db.run('DELETE FROM report_metadata WHERE report_id = ?', [reportId]);
    await db.run('DELETE FROM analysis_reports WHERE id = ?', [reportId]);

    res.json({
      success: true,
      message: 'Report deleted successfully'
    });

  } catch (error) {
    console.error('❌ Error deleting report:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete report',
      error: error.message
    });
  }
});

/**
 * @route GET /api/reports/stats/summary
 * @desc Get summary statistics
 * @access Public
 */
router.get('/stats/summary', async (req, res) => {
  try {
    const db = await getDatabase();

    // Get various statistics
    const totalReports = await db.get('SELECT COUNT(*) as count FROM analysis_reports');
    const totalVideos = await db.get('SELECT COUNT(*) as count FROM videos');
    const totalViolations = await db.get('SELECT COUNT(*) as count FROM violations');
    
    const avgSafetyScore = await db.get(`
      SELECT AVG(safety_score) as avg_score 
      FROM analysis_reports 
      WHERE safety_score IS NOT NULL
    `);

    const severityBreakdown = await db.all(`
      SELECT severity, COUNT(*) as count
      FROM violations
      GROUP BY severity
      ORDER BY count DESC
    `);

    const recentReports = await db.all(`
      SELECT 
        ar.id,
        ar.analysis_date,
        ar.safety_score,
        v.original_filename,
        COUNT(viol.id) as violation_count
      FROM analysis_reports ar
      LEFT JOIN videos v ON ar.video_id = v.id
      LEFT JOIN violations viol ON ar.id = viol.report_id
      GROUP BY ar.id
      ORDER BY ar.analysis_date DESC
      LIMIT 5
    `);

    res.json({
      success: true,
      data: {
        totalReports: totalReports.count,
        totalVideos: totalVideos.count,
        totalViolations: totalViolations.count,
        averageSafetyScore: Math.round(avgSafetyScore.avg_score || 0),
        severityBreakdown,
        recentReports
      }
    });

  } catch (error) {
    console.error('❌ Error fetching statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch statistics',
      error: error.message
    });
  }
});

export default router; 