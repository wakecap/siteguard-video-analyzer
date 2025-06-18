import express from 'express';
import { getDatabase } from '../database/setup.js';
import fs from 'fs/promises';
import path from 'path';

const router = express.Router();

/**
 * @route GET /api/health
 * @desc Basic health check
 * @access Public
 */
router.get('/', (req, res) => {
  res.json({
    success: true,
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0'
  });
});

/**
 * @route GET /api/health/detailed
 * @desc Detailed health check with system information
 * @access Public
 */
router.get('/detailed', async (req, res) => {
  try {
    const health = {
      success: true,
      status: 'OK',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      version: '1.0.0',
      checks: {
        database: 'unknown',
        storage: 'unknown',
        ffmpeg: 'unknown',
        gemini: 'unknown'
      }
    };

    // Check database
    try {
      const db = await getDatabase();
      await db.get('SELECT 1');
      health.checks.database = 'OK';
    } catch (error) {
      health.checks.database = 'ERROR';
      health.status = 'DEGRADED';
    }

    // Check storage directories
    try {
      const uploadsDir = path.join(process.cwd(), 'uploads');
      const processedDir = path.join(process.cwd(), 'uploads', 'processed');
      const tempDir = path.join(process.cwd(), 'uploads', 'temp');
      
      await fs.access(uploadsDir);
      await fs.access(processedDir);
      await fs.access(tempDir);
      
      health.checks.storage = 'OK';
    } catch (error) {
      health.checks.storage = 'ERROR';
      health.status = 'DEGRADED';
    }

    // Check ffmpeg
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      
      await execAsync('ffmpeg -version');
      health.checks.ffmpeg = 'OK';
    } catch (error) {
      health.checks.ffmpeg = 'ERROR';
      health.status = 'DEGRADED';
    }

    // Check Gemini API key
    if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'YOUR_GEMINI_API_KEY_HERE') {
      health.checks.gemini = 'OK';
    } else {
      health.checks.gemini = 'ERROR';
      health.status = 'DEGRADED';
    }

    // Set overall status
    if (health.status === 'DEGRADED') {
      res.status(503);
    }

    res.json(health);

  } catch (error) {
    console.error('❌ Health check error:', error);
    res.status(500).json({
      success: false,
      status: 'ERROR',
      message: 'Health check failed',
      error: error.message
    });
  }
});

/**
 * @route GET /api/health/metrics
 * @desc System metrics for monitoring
 * @access Public
 */
router.get('/metrics', async (req, res) => {
  try {
    const db = await getDatabase();
    
    // Get database metrics
    const totalVideos = await db.get('SELECT COUNT(*) as count FROM videos');
    const totalReports = await db.get('SELECT COUNT(*) as count FROM analysis_reports');
    const totalViolations = await db.get('SELECT COUNT(*) as count FROM violations');
    const avgProcessingTime = await db.get(`
      SELECT AVG(processing_time) as avg_time 
      FROM analysis_reports 
      WHERE processing_time IS NOT NULL
    `);

    // Get storage metrics
    const uploadsDir = path.join(process.cwd(), 'uploads');
    let storageSize = 0;
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      
      const { stdout } = await execAsync(`du -sb ${uploadsDir} 2>/dev/null || echo "0"`);
      storageSize = parseInt(stdout.split('\t')[0]) || 0;
    } catch (error) {
      storageSize = 0;
    }

    // System metrics
    const os = await import('os');
    const metrics = {
      success: true,
      timestamp: new Date().toISOString(),
      database: {
        totalVideos: totalVideos.count,
        totalReports: totalReports.count,
        totalViolations: totalViolations.count,
        avgProcessingTime: Math.round(avgProcessingTime.avg_time || 0)
      },
      storage: {
        sizeBytes: storageSize,
        sizeMB: Math.round(storageSize / (1024 * 1024) * 100) / 100
      },
      system: {
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage(),
        platform: os.platform(),
        arch: os.arch(),
        nodeVersion: process.version,
        uptime: process.uptime()
      }
    };

    res.json(metrics);

  } catch (error) {
    console.error('❌ Metrics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get metrics',
      error: error.message
    });
  }
});

export default router; 