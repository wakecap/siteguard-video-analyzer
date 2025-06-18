import express from 'express';
import { GoogleGenAI } from '@google/genai';
import { getDatabase } from '../database/setup.js';
import videoProcessor from '../services/videoProcessor.js';
import { body, validationResult } from 'express-validator';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';
import path from 'path';

const router = express.Router();

// Initialize Gemini AI
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

/**
 * @route POST /api/analysis/analyze
 * @desc Analyze video with Gemini AI
 * @access Public
 */
router.post('/analyze',
  [
    body('videoId').isString().notEmpty(),
    body('jsaContext').optional().isString().trim(),
    body('userInstructions').optional().isString().trim(),
  ],
  async (req, res) => {
    try {
      // Check validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ 
          success: false, 
          errors: errors.array() 
        });
      }

      const { videoId, jsaContext, userInstructions } = req.body;
      const db = await getDatabase();

      // Get video information
      const video = await db.get('SELECT * FROM videos WHERE id = ?', [videoId]);
      if (!video) {
        return res.status(404).json({
          success: false,
          message: 'Video not found'
        });
      }

      if (video.processing_status !== 'completed') {
        return res.status(400).json({
          success: false,
          message: 'Video is still being processed'
        });
      }

      // Get video file path
      const videoPath = await videoProcessor.getVideoPath(videoId);
      if (!videoPath) {
        return res.status(404).json({
          success: false,
          message: 'Video file not found'
        });
      }

      console.log('🤖 Starting Gemini AI analysis for video:', videoId);

      // Create analysis report record
      const reportId = uuidv4();
      await db.run(`
        INSERT INTO analysis_reports (
          id, video_id, status, processing_time
        ) VALUES (?, ?, ?, ?)
      `, [reportId, videoId, 'processing', 0]);

      const startTime = Date.now();

      try {
        // Read video file as base64
        const videoBuffer = await fs.readFile(videoPath);
        const videoBase64 = videoBuffer.toString('base64');

        // Prepare prompt for Gemini
        const basePrompt = `
You are a construction site safety expert analyzing video footage for safety violations and positive practices.

Please analyze this video and provide a detailed safety assessment in the following JSON format:

{
  "summary": "Overall safety assessment summary",
  "safetyScore": 85,
  "violations": [
    {
      "description": "Worker not wearing hard hat",
      "severity": "High",
      "startTimeSeconds": 15.5,
      "endTimeSeconds": 18.2,
      "durationSeconds": 2.7,
      "onScreenStartTime": "00:15",
      "onScreenEndTime": "00:18"
    }
  ],
  "positiveObservations": [
    "Proper use of safety equipment",
    "Good housekeeping practices"
  ]
}

Severity levels: Critical, High, Medium, Low, Info

${jsaContext ? `JSA Context: ${jsaContext}` : ''}
${userInstructions ? `Specific Instructions: ${userInstructions}` : ''}

Focus on:
- Personal protective equipment (PPE) violations
- Unsafe work practices
- Equipment safety issues
- Environmental hazards
- Positive safety practices
- Compliance with safety protocols

Provide timestamps for each violation and observation.`;

        // Call Gemini AI
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        
        const result = await model.generateContent([
          basePrompt,
          {
            inlineData: {
              mimeType: video.mime_type,
              data: videoBase64
            }
          }
        ]);

        const response = await result.response;
        const text = response.text();
        
        // Parse the response
        let parsedResponse;
        try {
          // Try to extract JSON from the response
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            parsedResponse = JSON.parse(jsonMatch[0]);
          } else {
            throw new Error('No JSON found in response');
          }
        } catch (parseError) {
          console.error('Failed to parse Gemini response:', parseError);
          parsedResponse = {
            summary: text,
            safetyScore: 50,
            violations: [],
            positiveObservations: [],
            error: 'Failed to parse structured response'
          };
        }

        const processingTime = (Date.now() - startTime) / 1000;

        // Save analysis report
        await db.run(`
          UPDATE analysis_reports 
          SET gemini_raw_response = ?, summary = ?, safety_score = ?, 
              processing_time = ?, status = ?
          WHERE id = ?
        `, [
          text,
          parsedResponse.summary,
          parsedResponse.safetyScore,
          processingTime,
          'completed',
          reportId
        ]);

        // Save violations
        if (parsedResponse.violations && Array.isArray(parsedResponse.violations)) {
          for (const violation of parsedResponse.violations) {
            const violationId = uuidv4();
            await db.run(`
              INSERT INTO violations (
                id, report_id, description, severity, start_time_seconds,
                end_time_seconds, duration_seconds, on_screen_start_time,
                on_screen_end_time
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
              violationId,
              reportId,
              violation.description,
              violation.severity,
              violation.startTimeSeconds,
              violation.endTimeSeconds,
              violation.durationSeconds,
              violation.onScreenStartTime,
              violation.onScreenEndTime
            ]);

            // Generate thumbnail for violation
            try {
              const thumbnailPath = path.join(process.cwd(), 'uploads', 'thumbnails', `${violationId}.jpg`);
              await videoProcessor.generateThumbnail(videoPath, thumbnailPath, violation.startTimeSeconds);
              
              await db.run(`
                UPDATE violations 
                SET thumbnail_path = ?
                WHERE id = ?
              `, [thumbnailPath, violationId]);
            } catch (thumbnailError) {
              console.error('Failed to generate thumbnail:', thumbnailError);
            }
          }
        }

        // Save positive observations
        if (parsedResponse.positiveObservations && Array.isArray(parsedResponse.positiveObservations)) {
          for (const observation of parsedResponse.positiveObservations) {
            await db.run(`
              INSERT INTO positive_observations (id, report_id, observation)
              VALUES (?, ?, ?)
            `, [uuidv4(), reportId, observation]);
          }
        }

        // Save report metadata
        await db.run(`
          INSERT INTO report_metadata (
            id, report_id, jsa_context, user_instructions, report_status
          ) VALUES (?, ?, ?, ?, ?)
        `, [
          uuidv4(),
          reportId,
          jsaContext || null,
          userInstructions || null,
          'pending_review'
        ]);

        console.log('✅ Analysis completed successfully');

        res.json({
          success: true,
          message: 'Video analysis completed successfully',
          data: {
            reportId,
            videoId,
            summary: parsedResponse.summary,
            safetyScore: parsedResponse.safetyScore,
            violations: parsedResponse.violations || [],
            positiveObservations: parsedResponse.positiveObservations || [],
            processingTime
          }
        });

      } catch (analysisError) {
        console.error('❌ Analysis error:', analysisError);
        
        // Update report with error status
        await db.run(`
          UPDATE analysis_reports 
          SET status = ?, error_message = ?
          WHERE id = ?
        `, ['error', analysisError.message, reportId]);

        res.status(500).json({
          success: false,
          message: 'Analysis failed',
          error: analysisError.message
        });
      }

    } catch (error) {
      console.error('❌ Analysis route error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to start analysis',
        error: error.message
      });
    }
  }
);

/**
 * @route GET /api/analysis/:reportId
 * @desc Get analysis report
 * @access Public
 */
router.get('/:reportId', async (req, res) => {
  try {
    const { reportId } = req.params;
    const db = await getDatabase();

    // Get analysis report
    const report = await db.get(`
      SELECT * FROM analysis_reports WHERE id = ?
    `, [reportId]);

    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Analysis report not found'
      });
    }

    // Get violations
    const violations = await db.all(`
      SELECT * FROM violations WHERE report_id = ?
      ORDER BY start_time_seconds
    `, [reportId]);

    // Get positive observations
    const positiveObservations = await db.all(`
      SELECT * FROM positive_observations WHERE report_id = ?
    `, [reportId]);

    // Get metadata
    const metadata = await db.get(`
      SELECT * FROM report_metadata WHERE report_id = ?
    `, [reportId]);

    res.json({
      success: true,
      data: {
        ...report,
        violations,
        positiveObservations: positiveObservations.map(obs => obs.observation),
        metadata
      }
    });

  } catch (error) {
    console.error('❌ Error fetching analysis:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch analysis',
      error: error.message
    });
  }
});

export default router; 