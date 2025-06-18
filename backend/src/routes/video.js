import express from 'express';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import videoProcessor from '../services/videoProcessor.js';
import { getDatabase } from '../database/setup.js';
import { body, validationResult } from 'express-validator';

const router = express.Router();

// Configure multer for video uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(process.cwd(), 'uploads', 'temp'));
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}_${file.originalname}`;
    cb(null, uniqueName);
  }
});

const fileFilter = (req, file, cb) => {
  // Accept video files only
  const allowedMimes = [
    'video/mp4',
    'video/webm',
    'video/ogg',
    'video/quicktime',
    'video/x-msvideo',
    'video/x-ms-wmv'
  ];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only video files are allowed.'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
    files: 1
  }
});

/**
 * @route POST /api/video/upload
 * @desc Upload and process video file
 * @access Public
 */
router.post('/upload', 
  upload.single('video'),
  [
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

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No video file uploaded'
        });
      }

      console.log('📹 Processing video upload:', req.file.originalname);

      // Process the video file
      const result = await videoProcessor.processVideoFile(req.file, {
        jsaContext: req.body.jsaContext,
        userInstructions: req.body.userInstructions
      });

      res.json({
        success: true,
        message: 'Video uploaded and processed successfully',
        data: {
          videoId: result.videoId,
          originalFilename: result.originalFilename,
          processedFilename: result.processedFilename,
          needsProcessing: result.processingResult.needsProcessing,
          issues: result.processingResult.issues,
          analysis: result.analysis
        }
      });

    } catch (error) {
      console.error('❌ Video upload error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to process video',
        error: error.message
      });
    }
  }
);

/**
 * @route GET /api/video/:videoId
 * @desc Get video information
 * @access Public
 */
router.get('/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params;
    const db = await getDatabase();
    
    const video = await db.get(`
      SELECT * FROM videos WHERE id = ?
    `, [videoId]);

    if (!video) {
      return res.status(404).json({
        success: false,
        message: 'Video not found'
      });
    }

    res.json({
      success: true,
      data: {
        ...video,
        metadata: video.metadata ? JSON.parse(video.metadata) : null
      }
    });

  } catch (error) {
    console.error('❌ Error fetching video:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch video information',
      error: error.message
    });
  }
});

/**
 * @route GET /api/video/:videoId/stream
 * @desc Stream video file
 * @access Public
 */
router.get('/:videoId/stream', async (req, res) => {
  try {
    const { videoId } = req.params;
    const videoPath = await videoProcessor.getVideoPath(videoId);

    if (!videoPath) {
      return res.status(404).json({
        success: false,
        message: 'Video file not found'
      });
    }

    // Check if file exists
    const fs = await import('fs/promises');
    try {
      await fs.access(videoPath);
    } catch (error) {
      return res.status(404).json({
        success: false,
        message: 'Video file not found on disk'
      });
    }

    // Get file stats
    const stats = await fs.stat(videoPath);
    const fileSize = stats.size;
    const range = req.headers.range;

    if (range) {
      // Handle range requests for video streaming
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;
      const file = await import('fs');
      const stream = file.createReadStream(videoPath, { start, end });

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'video/mp4',
      });

      stream.pipe(res);
    } else {
      // Send entire file
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': 'video/mp4',
      });

      const file = await import('fs');
      file.createReadStream(videoPath).pipe(res);
    }

  } catch (error) {
    console.error('❌ Error streaming video:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to stream video',
      error: error.message
    });
  }
});

/**
 * @route DELETE /api/video/:videoId
 * @desc Delete video and associated files
 * @access Public
 */
router.delete('/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params;
    
    await videoProcessor.deleteVideo(videoId);

    res.json({
      success: true,
      message: 'Video deleted successfully'
    });

  } catch (error) {
    console.error('❌ Error deleting video:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete video',
      error: error.message
    });
  }
});

/**
 * @route GET /api/video
 * @desc Get all videos with pagination
 * @access Public
 */
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const offset = (page - 1) * limit;
    
    const db = await getDatabase();
    
    let whereClause = '';
    let params = [];
    
    if (status) {
      whereClause = 'WHERE processing_status = ?';
      params.push(status);
    }

    const videos = await db.all(`
      SELECT * FROM videos 
      ${whereClause}
      ORDER BY upload_date DESC 
      LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), offset]);

    const totalCount = await db.get(`
      SELECT COUNT(*) as count FROM videos ${whereClause}
    `, params);

    res.json({
      success: true,
      data: {
        videos: videos.map(video => ({
          ...video,
          metadata: video.metadata ? JSON.parse(video.metadata) : null
        })),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalCount.count,
          pages: Math.ceil(totalCount.count / limit)
        }
      }
    });

  } catch (error) {
    console.error('❌ Error fetching videos:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch videos',
      error: error.message
    });
  }
});

export default router; 