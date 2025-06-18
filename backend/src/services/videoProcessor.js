import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../database/setup.js';

class VideoProcessor {
  constructor() {
    this.uploadDir = path.join(process.cwd(), 'uploads');
    this.processedDir = path.join(process.cwd(), 'uploads', 'processed');
    this.ensureDirectories();
  }

  async ensureDirectories() {
    try {
      await fs.mkdir(this.uploadDir, { recursive: true });
      await fs.mkdir(this.processedDir, { recursive: true });
      await fs.mkdir(path.join(process.cwd(), 'uploads', 'temp'), { recursive: true });
      await fs.mkdir(path.join(process.cwd(), 'uploads', 'thumbnails'), { recursive: true });
      console.log('✅ Upload directories created successfully');
    } catch (error) {
      console.error('❌ Error creating directories:', error);
    }
  }

  /**
   * Analyze video file to detect audio stream issues
   */
  async analyzeVideo(filePath) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          reject(new Error(`Failed to analyze video: ${err.message}`));
          return;
        }

        const audioStream = metadata.streams.find(stream => stream.codec_type === 'audio');
        const videoStream = metadata.streams.find(stream => stream.codec_type === 'video');

        const analysis = {
          duration: metadata.format.duration,
          size: metadata.format.size,
          bitrate: metadata.format.bit_rate,
          audioStream: audioStream ? {
            codec: audioStream.codec_name,
            channels: audioStream.channels,
            sampleRate: audioStream.sample_rate,
            channelLayout: audioStream.channel_layout,
            hasIssues: this.detectAudioIssues(audioStream)
          } : null,
          videoStream: videoStream ? {
            codec: videoStream.codec_name,
            width: videoStream.width,
            height: videoStream.height,
            fps: videoStream.r_frame_rate
          } : null,
          needsProcessing: this.needsGeminiProcessing()
        };

        resolve(analysis);
      });
    });
  }

  /**
   * Detect audio stream issues that would cause Gemini API to reject the video
   */
  detectAudioIssues(audioStream) {
    const issues = [];

    // Check for invalid channel count
    if (!audioStream.channels || audioStream.channels === 0) {
      issues.push('Invalid channel count (0 channels)');
    }

    // Check for low sample rate
    if (audioStream.sample_rate && parseInt(audioStream.sample_rate) < 8000) {
      issues.push(`Low sample rate (${audioStream.sample_rate}Hz < 8kHz)`);
    }

    // Check for missing codec
    if (!audioStream.codec_name) {
      issues.push('Missing audio codec');
    }

    return issues.length > 0 ? issues : null;
  }

  /**
   * Check if video needs processing for Gemini compatibility
   */
  needsGeminiProcessing() {
    // Always process videos to ensure Gemini compatibility
    // This ensures proper audio encoding and format standardization
    return true;
  }

  /**
   * Process video to fix audio stream issues and ensure Gemini compatibility
   */
  async processVideo(inputPath, outputPath, duration) {
    return new Promise((resolve, reject) => {
      console.log('🔧 Processing video for Gemini compatibility...');
      
      const command = ffmpeg(inputPath)
        // Add silent audio track if missing or problematic
        .input('anullsrc=channel_layout=stereo:sample_rate=44100')
        .inputOptions(['-f lavfi', `-t ${duration}`])
        .outputOptions([
          '-c:v libx264',      // Ensure H.264 video codec
          '-c:a aac',          // Ensure AAC audio codec
          '-b:a 128k',         // Set audio bitrate
          '-ar 44100',         // Set audio sample rate
          '-ac 2',             // Set audio channels to stereo
          '-shortest',         // Match shortest input duration
          '-movflags +faststart', // Optimize for streaming
          '-y'                 // Overwrite output file
        ])
        .output(outputPath);

      command.on('start', (commandLine) => {
        console.log('FFmpeg command:', commandLine);
      });

      command.on('progress', (progress) => {
        console.log(`Processing: ${progress.percent}% done`);
      });

      command.on('end', () => {
        console.log('✅ Video processing completed successfully');
        resolve(outputPath);
      });

      command.on('error', (err) => {
        console.error('❌ FFmpeg error:', err);
        reject(new Error(`Video processing failed: ${err.message}`));
      });

      command.run();
    });
  }

  /**
   * Generate thumbnail from video at specific time
   */
  async generateThumbnail(videoPath, outputPath, timeSeconds = 0) {
    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .seekInput(timeSeconds)
        .frames(1)
        .outputOptions([
          '-vf scale=320:240',
          '-y'
        ])
        .output(outputPath)
        .on('end', () => {
          console.log('Thumbnail generated successfully');
          resolve(outputPath);
        })
        .on('error', (err) => {
          console.error('Thumbnail generation error:', err);
          reject(new Error(`Thumbnail generation failed: ${err.message}`));
        })
        .run();
    });
  }

  /**
   * Extract frame at specific time for evidence
   */
  async extractFrame(videoPath, outputPath, timeSeconds) {
    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .seekInput(timeSeconds)
        .frames(1)
        .outputOptions([
          '-vf scale=1280:720',
          '-y'
        ])
        .output(outputPath)
        .on('end', () => {
          console.log('Frame extracted successfully');
          resolve(outputPath);
        })
        .on('error', (err) => {
          console.error('Frame extraction error:', err);
          reject(new Error(`Frame extraction failed: ${err.message}`));
        })
        .run();
    });
  }

  /**
   * Main video processing pipeline
   */
  async processVideoFile(originalFile, metadata = {}) {
    const videoId = uuidv4();
    const originalFilename = originalFile.originalname;
    const fileExtension = path.extname(originalFilename);
    const processedFilename = `${videoId}_processed${fileExtension}`;
    
    const originalPath = originalFile.path;
    const processedPath = path.join(this.processedDir, processedFilename);

    try {
      // Analyze the video
      console.log('🔍 Analyzing video file...');
      const analysis = await this.analyzeVideo(originalPath);
      
      // Update database with video metadata
      const db = await getDatabase();
      await db.run(`
        INSERT INTO videos (
          id, filename, original_filename, file_size, duration, 
          mime_type, processing_status, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        videoId,
        processedFilename,
        originalFilename,
        originalFile.size,
        analysis.duration,
        originalFile.mimetype,
        'processing',
        JSON.stringify(analysis)
      ]);

      let finalPath = originalPath;
      let processingResult = { needsProcessing: false };

      // Process video if needed
      if (analysis.needsProcessing) {
        console.log('🔧 Processing video for Gemini AI compatibility...');
        await this.processVideo(originalPath, processedPath, analysis.duration);
        finalPath = processedPath;
        processingResult = { 
          needsProcessing: true, 
          issues: analysis.audioStream ? analysis.audioStream.hasIssues : ['No audio stream'],
          processedPath 
        };
      }

      // Update database with processing status
      await db.run(`
        UPDATE videos 
        SET processing_status = ?, processed_filename = ?, storage_path = ?
        WHERE id = ?
      `, [
        'completed',
        processedFilename,
        finalPath,
        videoId
      ]);

      // Clean up original file if it was processed
      if (analysis.needsProcessing) {
        await fs.unlink(originalPath);
      }

      return {
        videoId,
        originalFilename,
        processedFilename,
        filePath: finalPath,
        analysis,
        processingResult
      };

    } catch (error) {
      // Update database with error status
      const db = await getDatabase();
      await db.run(`
        UPDATE videos 
        SET processing_status = ?, metadata = ?
        WHERE id = ?
      `, [
        'error',
        JSON.stringify({ error: error.message }),
        videoId
      ]);

      throw error;
    }
  }

  /**
   * Get video file path by ID
   */
  async getVideoPath(videoId) {
    const db = await getDatabase();
    const video = await db.get('SELECT storage_path FROM videos WHERE id = ?', [videoId]);
    return video ? video.storage_path : null;
  }

  /**
   * Delete video and associated files
   */
  async deleteVideo(videoId) {
    const db = await getDatabase();
    
    // Get video information
    const video = await db.get('SELECT storage_path, processed_filename FROM videos WHERE id = ?', [videoId]);
    
    if (!video) {
      throw new Error('Video not found');
    }

    try {
      // Delete video file
      if (video.storage_path && await fs.access(video.storage_path).then(() => true).catch(() => false)) {
        await fs.unlink(video.storage_path);
      }

      // Delete from database
      await db.run('DELETE FROM videos WHERE id = ?', [videoId]);
      
      console.log(`✅ Video ${videoId} deleted successfully`);
    } catch (error) {
      console.error(`❌ Error deleting video ${videoId}:`, error);
      throw error;
    }
  }
}

export default new VideoProcessor(); 