# SiteGuard Video Analyzer Backend

A robust Node.js/Express backend service for the SiteGuard Video Analyzer platform. This service handles video processing, AI analysis, database management, and provides a RESTful API for the frontend application.

## 🏗️ Architecture

### Core Components

1. **Video Processing Service** - Handles ffmpeg operations for video pre-processing
2. **Database Service** - SQLite database for storing reports and metadata
3. **AI Analysis Service** - Google Gemini AI integration for safety analysis
4. **File Storage Service** - Manages video uploads and processed files
5. **REST API** - Comprehensive endpoints for all operations

### Technology Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Database**: SQLite with better-sqlite3
- **Video Processing**: FFmpeg with fluent-ffmpeg
- **AI**: Google Gemini 2.0 Flash
- **File Upload**: Multer
- **Security**: Helmet, CORS, Rate Limiting
- **Validation**: Express-validator

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- FFmpeg installed on the system
- Google Gemini API key

### Installation

1. **Install dependencies**:
   ```bash
   cd backend
   npm install
   ```

2. **Install FFmpeg**:
   ```bash
   # macOS
   brew install ffmpeg
   
   # Ubuntu/Debian
   sudo apt update && sudo apt install ffmpeg
   
   # Windows
   # Download from https://ffmpeg.org/download.html
   ```

3. **Configure environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Start the server**:
   ```bash
   npm run dev
   ```

The server will start on `http://localhost:3001`

## 📋 API Endpoints

### Video Management

- `POST /api/video/upload` - Upload and process video
- `GET /api/video/:videoId` - Get video information
- `GET /api/video/:videoId/stream` - Stream video file
- `DELETE /api/video/:videoId` - Delete video
- `GET /api/video` - List all videos

### Analysis

- `POST /api/analysis/analyze` - Analyze video with Gemini AI
- `GET /api/analysis/:reportId` - Get analysis report

### Reports

- `GET /api/reports` - List all reports with filtering
- `GET /api/reports/:reportId` - Get detailed report
- `PUT /api/reports/:reportId` - Update report metadata
- `DELETE /api/reports/:reportId` - Delete report
- `GET /api/reports/stats/summary` - Get summary statistics

### Health & Monitoring

- `GET /api/health` - Basic health check
- `GET /api/health/detailed` - Detailed health check
- `GET /api/health/metrics` - System metrics

## 🎥 Video Processing Pipeline

### 1. Upload & Validation
- File type validation (MP4, WebM, OGG, etc.)
- File size limits (100MB max)
- Rate limiting (10 uploads per hour)

### 2. Audio Stream Analysis
The system automatically detects and fixes common audio issues:

- **Invalid channel count** (0 channels → 2 channels)
- **Low sample rate** (1000Hz → 44.1kHz)
- **Missing audio codec** (adds AAC codec)

### 3. Processing
- FFmpeg processing with proper audio streams
- Thumbnail generation for violations
- Metadata extraction and storage

### 4. AI Analysis
- Google Gemini 2.0 Flash for safety analysis
- Structured JSON response parsing
- Violation detection with timestamps
- Safety scoring (0-100)

## 🗄️ Database Schema

### Tables

1. **videos** - Video metadata and processing status
2. **analysis_reports** - Analysis results and AI responses
3. **violations** - Individual safety violations with timestamps
4. **positive_observations** - Positive safety practices
5. **report_metadata** - Additional report information

### Key Features

- **Foreign key relationships** for data integrity
- **Automatic timestamps** for created_at/updated_at
- **Indexes** for optimal query performance
- **JSON metadata storage** for flexible data

## 🔧 Configuration

### Environment Variables

```bash
# Server
PORT=3001
NODE_ENV=development

# Frontend
FRONTEND_URL=http://localhost:5173

# Database
DATABASE_PATH=./data/siteguard.db

# AI
GEMINI_API_KEY=your_api_key_here

# Security
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

### File Structure

```
backend/
├── src/
│   ├── server.js              # Main server file
│   ├── database/
│   │   └── setup.js           # Database initialization
│   ├── routes/
│   │   ├── video.js           # Video endpoints
│   │   ├── analysis.js        # Analysis endpoints
│   │   ├── reports.js         # Report endpoints
│   │   └── health.js          # Health check endpoints
│   ├── services/
│   │   └── videoProcessor.js  # Video processing service
│   └── middleware/
│       └── errorHandler.js    # Error handling
├── data/                      # SQLite database files
├── uploads/                   # Video storage
│   ├── temp/                  # Temporary uploads
│   ├── processed/             # Processed videos
│   └── thumbnails/            # Violation thumbnails
└── logs/                      # Application logs
```

## 🚀 Deployment

### Development

```bash
npm run dev
```

### Production

```bash
npm start
```

### Docker (Recommended for production)

```dockerfile
FROM node:18-alpine

# Install FFmpeg
RUN apk add --no-cache ffmpeg

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN mkdir -p data uploads logs

EXPOSE 3001
CMD ["npm", "start"]
```

### Cloud Deployment

The backend is designed for cloud deployment with:

- **Stateless design** for horizontal scaling
- **Environment-based configuration**
- **Health checks** for load balancers
- **Rate limiting** for API protection
- **CORS configuration** for frontend integration

## 🔒 Security Features

- **Helmet.js** for security headers
- **CORS** configuration
- **Rate limiting** to prevent abuse
- **Input validation** with express-validator
- **File upload restrictions**
- **Error handling** without information leakage

## 📊 Monitoring

### Health Checks

- Database connectivity
- Storage directory access
- FFmpeg availability
- Gemini API key validation

### Metrics

- Request/response times
- Database query performance
- Storage usage
- System resource utilization

### Logging

- Request logging with Morgan
- Error logging with stack traces
- Processing time tracking
- Security event logging

## 🐛 Troubleshooting

### Common Issues

1. **FFmpeg not found**
   ```bash
   # Install FFmpeg
   brew install ffmpeg  # macOS
   sudo apt install ffmpeg  # Ubuntu
   ```

2. **Database errors**
   ```bash
   # Reset database
   rm -rf data/siteguard.db
   npm run setup-db
   ```

3. **Video processing fails**
   - Check FFmpeg installation
   - Verify file permissions
   - Check available disk space

4. **Gemini API errors**
   - Verify API key in .env
   - Check API quota limits
   - Ensure video format is supported

### Debug Mode

```bash
NODE_ENV=development DEBUG=* npm run dev
```

## 🤝 Integration

### Frontend Integration

The backend is designed to work seamlessly with the React frontend:

```javascript
// Example API call
const response = await fetch('http://localhost:3001/api/video/upload', {
  method: 'POST',
  body: formData
});

const result = await response.json();
```

### External Services

- **Google Gemini AI** for video analysis
- **FFmpeg** for video processing
- **SQLite** for data persistence

## 📈 Performance

### Optimizations

- **Streaming video** for large files
- **Database indexes** for fast queries
- **Compression middleware** for responses
- **Rate limiting** to prevent overload
- **File cleanup** for temporary files

### Scaling Considerations

- **Horizontal scaling** with load balancers
- **Database migration** to PostgreSQL/MySQL
- **Cloud storage** for video files
- **CDN integration** for static assets
- **Caching** with Redis

## 📄 License

MIT License - see LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📞 Support

For issues and questions:

1. Check the troubleshooting section
2. Review the API documentation
3. Check the health endpoints
4. Review the logs in `./logs/` 