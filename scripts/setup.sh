#!/bin/bash

# SiteGuard Video Analyzer - Automated Setup Script
# This script helps set up the project with all required dependencies

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

# Check npm
check_npm() {
    if ! command_exists npm; then
        print_error "npm is not installed"
        return 1
    fi
    
    print_success "npm is available"
    return 0
}

# Check ffmpeg
check_ffmpeg() {
    if ! command_exists ffmpeg; then
        print_warning "ffmpeg is not installed. Video pre-processing features will not work."
        print_status "To install ffmpeg:"
        echo "  macOS: brew install ffmpeg"
        echo "  Ubuntu/Debian: sudo apt install ffmpeg"
        echo "  Windows: Download from https://ffmpeg.org/download.html"
        return 1
    fi
    
    print_success "ffmpeg is available"
    return 0
}

# Install dependencies
install_dependencies() {
    print_status "Installing npm dependencies..."
    
    # Clean install
    if [ -d "node_modules" ]; then
        print_status "Removing existing node_modules..."
        rm -rf node_modules
    fi
    
    if [ -f "package-lock.json" ]; then
        print_status "Removing existing package-lock.json..."
        rm -f package-lock.json
    fi
    
    # Install dependencies
    npm install
    
    if [ $? -eq 0 ]; then
        print_success "Dependencies installed successfully"
    else
        print_error "Failed to install dependencies"
        return 1
    fi
}

# Setup environment file
setup_environment() {
    print_status "Setting up environment configuration..."
    
    if [ -f ".env.local" ]; then
        print_warning ".env.local already exists"
        read -p "Overwrite? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            print_status "Skipping environment setup"
            return 0
        fi
    fi
    
    # Create .env.local
    cat > .env.local << EOF
# Gemini API Configuration
# Replace with your actual Gemini API key from https://makersuite.google.com/app/apikey
GEMINI_API_KEY=YOUR_GEMINI_API_KEY_HERE

# Optional: Development server configuration
VITE_DEV_SERVER_PORT=5173
EOF
    
    print_success "Environment file created: .env.local"
    print_warning "Remember to replace YOUR_GEMINI_API_KEY_HERE with your actual Gemini API key"
}

# Make scripts executable
make_scripts_executable() {
    print_status "Making utility scripts executable..."
    
    if [ -f "scripts/preprocess-video.sh" ]; then
        chmod +x scripts/preprocess-video.sh
        print_success "preprocess-video.sh is now executable"
    fi
    
    if [ -f "scripts/setup.sh" ]; then
        chmod +x scripts/setup.sh
        print_success "setup.sh is now executable"
    fi
}

# Show next steps
show_next_steps() {
    echo
    print_success "Setup completed successfully!"
    echo
    print_status "Next steps:"
    echo "1. Get your Gemini API key from: https://makersuite.google.com/app/apikey"
    echo "2. Edit .env.local and replace YOUR_GEMINI_API_KEY_HERE with your actual API key"
    echo "3. Run the development server: npm run dev"
    echo "4. Open http://localhost:5173 in your browser"
    echo
    print_status "For video pre-processing:"
    echo "  ./scripts/preprocess-video.sh your_video.mp4"
    echo
    print_status "For help:"
    echo "  ./scripts/preprocess-video.sh --help"
    echo "  npm run dev --help"
}

# Main setup function
main() {
    print_status "Starting SiteGuard Video Analyzer setup..."
    echo
    
    # Check prerequisites
    print_status "Checking prerequisites..."
    
    if ! check_node_version; then
        print_error "Node.js version check failed"
        exit 1
    fi
    
    if ! check_npm; then
        print_error "npm check failed"
        exit 1
    fi
    
    check_ffmpeg  # Warning only, not critical
    
    echo
    
    # Install dependencies
    if ! install_dependencies; then
        print_error "Dependency installation failed"
        exit 1
    fi
    
    echo
    
    # Setup environment
    setup_environment
    
    echo
    
    # Make scripts executable
    make_scripts_executable
    
    echo
    
    # Show next steps
    show_next_steps
}

# Run main function
main "$@" 