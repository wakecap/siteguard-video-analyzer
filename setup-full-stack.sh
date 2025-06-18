#!/bin/bash

# SiteGuard Video Analyzer - Full Stack Setup Script
# This script sets up both frontend and backend for the complete application

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check Node.js version
check_node_version() {
    if ! command_exists node; then
        print_error "Node.js is not installed"
        return 1
    fi
    
    local node_version=$(node --version | cut -d'v' -f2)
    local major_version=$(echo $node_version | cut -d'.' -f1)
    
    if [ "$major_version" -lt 18 ]; then
        print_error "Node.js version $node_version is too old. Required: 18+ (recommended: 20+)"
        return 1
    fi
    
    print_success "Node.js version $node_version is compatible"
    return 0
}

# Check ffmpeg
check_ffmpeg() {
    if ! command_exists ffmpeg; then
        print_warning "ffmpeg is not installed. Video processing features will not work."
        print_status "To install ffmpeg:"
        echo "  macOS: brew install ffmpeg"
        echo "  Ubuntu/Debian: sudo apt install ffmpeg"
        echo "  Windows: Download from https://ffmpeg.org/download.html"
        return 1
    fi
    
    print_success "ffmpeg is available"
    return 0
}

# Setup frontend
setup_frontend() {
    print_status "Setting up frontend..."
    
    # Check if frontend dependencies are installed
    if [ ! -d "node_modules" ]; then
        print_status "Installing frontend dependencies..."
        npm install
    else
        print_status "Frontend dependencies already installed"
    fi
    
    # Create environment file if it doesn't exist
    if [ ! -f ".env.local" ]; then
        print_status "Creating frontend environment file..."
        cat > .env.local << EOF
# Gemini API Configuration
# Replace with your actual Gemini API key from https://makersuite.google.com/app/apikey
GEMINI_API_KEY=YOUR_GEMINI_API_KEY_HERE

# Backend API URL
VITE_API_URL=http://localhost:3001/api
EOF
        print_warning "Remember to replace YOUR_GEMINI_API_KEY_HERE with your actual Gemini API key"
    fi
    
    print_success "Frontend setup completed"
}

# Setup backend
setup_backend() {
    print_status "Setting up backend..."
    
    if [ ! -d "backend" ]; then
        print_error "Backend directory not found. Please ensure you're in the project root."
        return 1
    fi
    
    cd backend
    
    # Install backend dependencies
    if [ ! -d "node_modules" ]; then
        print_status "Installing backend dependencies..."
        npm install
    else
        print_status "Backend dependencies already installed"
    fi
    
    # Create environment file if it doesn't exist
    if [ ! -f ".env" ]; then
        print_status "Creating backend environment file..."
        cat > .env << EOF
# SiteGuard Video Analyzer Backend Configuration

# Server Configuration
PORT=3001
NODE_ENV=development

# Frontend URL (for CORS)
FRONTEND_URL=http://localhost:5173

# Database Configuration
DATABASE_PATH=./data/siteguard.db

# Google Gemini AI Configuration
GEMINI_API_KEY=AIzaSyCoLFohgH8uOcCk58HJGCTTgJ0zLxQfXdo

# File Upload Configuration
MAX_FILE_SIZE=104857600  # 100MB in bytes
UPLOAD_DIR=./uploads

# Security Configuration
RATE_LIMIT_WINDOW_MS=900000  # 15 minutes
RATE_LIMIT_MAX_REQUESTS=100
UPLOAD_RATE_LIMIT_MAX_REQUESTS=10

# Logging Configuration
LOG_LEVEL=info
LOG_FILE=./logs/app.log

# Monitoring Configuration
ENABLE_METRICS=true
METRICS_PORT=9090
EOF
        print_warning "Remember to replace YOUR_GEMINI_API_KEY_HERE with your actual Gemini API key"
    fi
    
    # Create necessary directories
    print_status "Creating backend directories..."
    mkdir -p data uploads/temp uploads/processed uploads/thumbnails logs
    
    cd ..
    print_success "Backend setup completed"
}

# Setup Docker (optional)
setup_docker() {
    if command_exists docker; then
        print_status "Docker is available. You can use Docker Compose for easy deployment."
        print_status "To start with Docker:"
        echo "  cd backend"
        echo "  docker-compose up -d"
    else
        print_warning "Docker not found. You can install Docker for containerized deployment."
    fi
}

# Show next steps
show_next_steps() {
    echo
    print_success "Full stack setup completed successfully!"
    echo
    print_status "Next steps:"
    echo "1. Get your Gemini API key from: https://makersuite.google.com/app/apikey"
    echo "2. Update environment files:"
    echo "   - Frontend: .env.local"
    echo "   - Backend: backend/.env"
    echo "3. Start the backend server:"
    echo "   cd backend && npm run dev"
    echo "4. Start the frontend server:"
    echo "   npm run dev"
    echo "5. Open http://localhost:5173 in your browser"
    echo
    print_status "Alternative deployment options:"
    echo "  Docker: cd backend && docker-compose up -d"
    echo "  Production: Follow the deployment guides in README files"
    echo
    print_status "API Documentation:"
    echo "  Backend API: http://localhost:3001/api"
    echo "  Health Check: http://localhost:3001/api/health"
    echo
    print_status "For help:"
    echo "  Frontend: README.md"
    echo "  Backend: backend/README.md"
}

# Main setup function
main() {
    print_status "Starting SiteGuard Video Analyzer full stack setup..."
    echo
    
    # Check prerequisites
    print_status "Checking prerequisites..."
    
    if ! check_node_version; then
        print_error "Node.js version check failed"
        exit 1
    fi
    
    if ! command_exists npm; then
        print_error "npm is not installed"
        exit 1
    fi
    
    check_ffmpeg  # Warning only, not critical
    
    echo
    
    # Setup frontend
    setup_frontend
    
    echo
    
    # Setup backend
    setup_backend
    
    echo
    
    # Setup Docker (optional)
    setup_docker
    
    echo
    
    # Show next steps
    show_next_steps
}

# Run main function
main "$@" 