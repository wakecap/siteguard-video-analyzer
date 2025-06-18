import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let db;

export async function initializeDatabase() {
  try {
    // Open database connection
    db = await open({
      filename: path.join(__dirname, '../../data/siteguard.db'),
      driver: sqlite3.Database,
    });

    // Create tables
    await createTables();
    
    console.log('✅ Database tables created successfully');
    return db;
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    throw error;
  }
}

async function createTables() {
  // Videos table - stores video metadata
  await db.exec(`
    CREATE TABLE IF NOT EXISTS videos (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      original_filename TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      duration REAL,
      mime_type TEXT NOT NULL,
      upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      processing_status TEXT DEFAULT 'pending',
      processed_filename TEXT,
      storage_path TEXT,
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Analysis reports table - stores analysis results
  await db.exec(`
    CREATE TABLE IF NOT EXISTS analysis_reports (
      id TEXT PRIMARY KEY,
      video_id TEXT NOT NULL,
      gemini_raw_response TEXT,
      summary TEXT,
      safety_score INTEGER,
      analysis_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      processing_time REAL,
      status TEXT DEFAULT 'completed',
      error_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (video_id) REFERENCES videos (id)
    )
  `);

  // Violations table - stores individual violations
  await db.exec(`
    CREATE TABLE IF NOT EXISTS violations (
      id TEXT PRIMARY KEY,
      report_id TEXT NOT NULL,
      description TEXT NOT NULL,
      severity TEXT NOT NULL,
      start_time_seconds REAL NOT NULL,
      end_time_seconds REAL NOT NULL,
      duration_seconds REAL NOT NULL,
      on_screen_start_time TEXT,
      on_screen_end_time TEXT,
      thumbnail_path TEXT,
      evidence_frame_path TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (report_id) REFERENCES analysis_reports (id)
    )
  `);

  // Positive observations table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS positive_observations (
      id TEXT PRIMARY KEY,
      report_id TEXT NOT NULL,
      observation TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (report_id) REFERENCES analysis_reports (id)
    )
  `);

  // Report metadata table - stores additional report information
  await db.exec(`
    CREATE TABLE IF NOT EXISTS report_metadata (
      id TEXT PRIMARY KEY,
      report_id TEXT NOT NULL,
      operator_comments TEXT,
      report_status TEXT DEFAULT 'pending_review',
      jsa_context TEXT,
      user_instructions TEXT,
      tags TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (report_id) REFERENCES analysis_reports (id)
    )
  `);

  // Create indexes for better performance
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_videos_upload_date ON videos (upload_date);
    CREATE INDEX IF NOT EXISTS idx_videos_processing_status ON videos (processing_status);
    CREATE INDEX IF NOT EXISTS idx_reports_video_id ON analysis_reports (video_id);
    CREATE INDEX IF NOT EXISTS idx_reports_analysis_date ON analysis_reports (analysis_date);
    CREATE INDEX IF NOT EXISTS idx_violations_report_id ON violations (report_id);
    CREATE INDEX IF NOT EXISTS idx_violations_severity ON violations (severity);
    CREATE INDEX IF NOT EXISTS idx_metadata_report_id ON report_metadata (report_id);
    CREATE INDEX IF NOT EXISTS idx_metadata_status ON report_metadata (report_status);
  `);

  // Create triggers for updated_at timestamps
  await db.exec(`
    CREATE TRIGGER IF NOT EXISTS update_videos_timestamp 
    AFTER UPDATE ON videos
    BEGIN
      UPDATE videos SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;
  `);

  await db.exec(`
    CREATE TRIGGER IF NOT EXISTS update_reports_timestamp 
    AFTER UPDATE ON analysis_reports
    BEGIN
      UPDATE analysis_reports SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;
  `);

  await db.exec(`
    CREATE TRIGGER IF NOT EXISTS update_metadata_timestamp 
    AFTER UPDATE ON report_metadata
    BEGIN
      UPDATE report_metadata SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;
  `);
}

export async function getDatabase() {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return db;
}

export async function closeDatabase() {
  if (db) {
    await db.close();
    console.log('✅ Database connection closed');
  }
} 