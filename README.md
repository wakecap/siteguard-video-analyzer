# SiteGuard AI - Video Analysis Platform

A comprehensive web application for advanced construction site safety video analysis using Google Gemini AI. Upload videos, provide context, and receive detailed safety reports with violation detection and timeline visualization.

## 🚀 Features

- **AI-Powered Video Analysis**: Uses Google Gemini 2.5 Pro for intelligent safety violation detection
- **Timeline Visualization**: Interactive timeline showing safety events with precise timestamps
- **Report Management**: Save, update, and review analysis reports
- **Evidence Review**: View violation evidence with video playback and thumbnails
- **Project Integration**: Link videos to construction projects and JSAs
- **Camera Management**: Manage RTSP camera feeds for continuous monitoring

## 📋 Prerequisites

### Required Software
- **Node.js 20+** (recommended: 20.17.0)
- **npm** (comes with Node.js)
- **ffmpeg** (for video pre-processing)

### API Keys
- **Google Gemini API Key** from [Google AI Studio](https://makersuite.google.com/app/apikey)

## 🛠️ Installation & Setup

### 1. Node.js Setup
```bash
# Check current Node.js version
node --version

# If using nvm, switch to Node.js 20
source ~/.nvm/nvm.sh
nvm use 20.17.0

# Or install Node.js 20 if not available
nvm install 20.17.0
nvm use 20.17.0
```

### 2. Install Dependencies
```bash
# Clean install (recommended for fresh setup)
rm -rf node_modules package-lock.json
npm install
```

### 3. Configure API Key
Create a `.env.local` file in the project root:
```bash
# Gemini API Configuration
GEMINI_API_KEY=your_actual_gemini_api_key_here
```

**Important**: Replace `your_actual_gemini_api_key_here` with your real Gemini API key from [Google AI Studio](https://makersuite.google.com/app/apikey).

### 4. Install ffmpeg (for video pre-processing)
```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt update && sudo apt install ffmpeg

# Windows
# Download from https://ffmpeg.org/download.html
```

## 🎥 Video Pre-processing

### Problem
The Gemini API may reject videos with invalid audio stream configurations:
- **Audio channels**: 0 (invalid - should be 1 or 2)
- **Sample rate**: 1000 Hz (too low - should be 44.1kHz or 48kHz)
- **Result**: Gemini's video processing pipeline rejects files due to malformed audio metadata

### Solution
Use the included pre-processing script to fix audio issues:

```bash
# Make script executable (first time only)
chmod +x scripts/preprocess-video.sh

# Process a video file
./scripts/preprocess-video.sh input_video.mp4

# Or specify output filename
./scripts/preprocess-video.sh input_video.mp4 processed_video.mp4
```

### Manual ffmpeg Command
If you prefer to use ffmpeg directly:
```bash
# Check video properties
ffprobe -hide_banner -loglevel error -show_streams input.mp4

# Fix invalid audio streams by adding silent audio
ffmpeg -i input.mp4 -f lavfi -t $(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 input.mp4) -i anullsrc=channel_layout=stereo:sample_rate=44100 -c:v copy -c:a aac -shortest output.mp4
```

## 🚀 Running the Application

### Development Mode
```bash
npm run dev
```

The application will be available at `http://localhost:5173`

### Production Build
```bash
npm run build
npm run preview
```

## 📱 Usage

### 1. Upload Video
- Click "Choose File" to select a video (MP4, WebM, OGG supported)
- For problematic videos, use the pre-processing script first

### 2. Provide Context (Optional)
- **JSA Context**: Paste Job Safety Analysis text or describe specific hazards
- **Instructions**: Add specific instructions for the AI analysis

### 3. Analyze
- Click "Upload and Analyze Video"
- Wait for Gemini AI to process the video (may take several minutes)

### 4. Review Results
- **Summary**: Overall safety assessment
- **Safety Score**: Numerical safety compliance rating (0-100)
- **Violations**: Detailed list of detected safety issues with timestamps
- **Timeline**: Interactive visualization of safety events
- **Evidence**: Click thumbnails to view video evidence

### 5. Save Report
- Add operator comments and set report status
- Save analysis for future reference

## 🏗️ Project Structure

```
siteguard-video-analyzer/
├── components/           # React components
│   ├── CameraForm.tsx   # Camera management form
│   ├── Modal.tsx        # Modal dialog component
│   ├── ProjectForm.tsx  # Project management form
│   └── VideoEventsTimeline.tsx # Timeline visualization
├── services/            # API and external services
│   ├── apiService.ts    # Mock API service
│   └── geminiService.ts # Google Gemini integration
├── scripts/             # Utility scripts
│   └── preprocess-video.sh # Video pre-processing
├── App.tsx              # Main application component
├── types.ts             # TypeScript type definitions
├── constants.tsx        # Application constants
└── vite.config.ts       # Vite configuration
```

## 🔧 Configuration

### Environment Variables
- `GEMINI_API_KEY`: Your Google Gemini API key
- `VITE_DEV_SERVER_PORT`: Development server port (default: 5173)

### Video Requirements
- **Format**: MP4, WebM, OGG
- **Audio**: Valid audio stream (1-2 channels, 44.1kHz/48kHz sample rate)
- **Size**: Up to 100MB (Gemini API limit)
- **Duration**: Up to 2 hours (Gemini API limit)

## 🐛 Troubleshooting

### Common Issues

#### 1. Node.js Version Issues
```bash
# Error: "Cannot find module" or similar
# Solution: Ensure Node.js 20+ is installed
node --version  # Should show v20.x.x
```

#### 2. API Key Not Working
```bash
# Error: "API_KEY for Gemini is not configured"
# Solution: Check .env.local file and restart dev server
cat .env.local  # Should show your actual API key
npm run dev     # Restart server
```

#### 3. Video Upload Fails
```bash
# Error: "File processing failed" from Gemini
# Solution: Pre-process video with audio issues
./scripts/preprocess-video.sh problematic_video.mp4
```

#### 4. ffmpeg Not Found
```bash
# Error: "ffmpeg is not installed"
# Solution: Install ffmpeg
brew install ffmpeg  # macOS
sudo apt install ffmpeg  # Ubuntu/Debian
```

### Development Tips

1. **Check Browser Console**: Look for error messages in browser dev tools
2. **API Key Validation**: The app shows warnings if API key is not configured
3. **Video Pre-processing**: Always test with the pre-processing script for problematic videos
4. **Network Issues**: Ensure stable internet connection for Gemini API calls

## 📄 License

This project is for educational and demonstration purposes. Please ensure compliance with Google's Gemini API terms of service.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📞 Support

For issues related to:
- **Gemini API**: Check [Google AI Studio documentation](https://ai.google.dev/)
- **Video Processing**: Use the pre-processing script or check ffmpeg documentation
- **Application**: Check browser console and ensure all prerequisites are met
