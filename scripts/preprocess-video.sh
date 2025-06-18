#!/bin/bash

# Video Pre-processing Script for SiteGuard Video Analyzer
# This script fixes common audio stream issues that cause Gemini API to reject videos

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

# Check if ffmpeg is installed
check_ffmpeg() {
    if ! command -v ffmpeg &> /dev/null; then
        print_error "ffmpeg is not installed. Please install ffmpeg first:"
        echo "  macOS: brew install ffmpeg"
        echo "  Ubuntu/Debian: sudo apt install ffmpeg"
        echo "  Windows: Download from https://ffmpeg.org/download.html"
        exit 1
    fi
    print_success "ffmpeg is available"
}

# Check if ffprobe is installed
check_ffprobe() {
    if ! command -v ffprobe &> /dev/null; then
        print_error "ffprobe is not installed. Please install ffmpeg (includes ffprobe) first."
        exit 1
    fi
    print_success "ffprobe is available"
}

# Analyze video file
analyze_video() {
    local input_file="$1"
    print_status "Analyzing video file: $input_file"
    
    # Get video duration
    local duration=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$input_file" 2>/dev/null)
    
    # Get audio stream info
    local audio_info=$(ffprobe -v error -select_streams a:0 -show_entries stream=channels,sample_rate,channel_layout,codec_name -of json "$input_file" 2>/dev/null)
    
    echo "$duration|$audio_info"
}

# Check if audio stream needs fixing
needs_audio_fix() {
    local audio_info="$1"
    
    # Parse audio info
    local channels=$(echo "$audio_info" | grep -o '"channels":[0-9]*' | cut -d':' -f2)
    local sample_rate=$(echo "$audio_info" | grep -o '"sample_rate":"[^"]*"' | cut -d'"' -f4)
    local codec_name=$(echo "$audio_info" | grep -o '"codec_name":"[^"]*"' | cut -d'"' -f4)
    
    # Check for problematic audio configurations
    if [[ "$channels" == "0" ]] || [[ "$sample_rate" -lt 8000 ]] || [[ -z "$codec_name" ]]; then
        return 0  # Needs fix
    fi
    
    return 1  # No fix needed
}

# Fix audio stream issues
fix_audio_stream() {
    local input_file="$1"
    local output_file="$2"
    local duration="$3"
    
    print_status "Fixing audio stream issues..."
    
    # Create a temporary file for the fixed video
    local temp_output="${output_file}.tmp"
    
    # Use ffmpeg to add proper silent audio track
    ffmpeg -i "$input_file" \
           -f lavfi -t "$duration" \
           -i "anullsrc=channel_layout=stereo:sample_rate=44100" \
           -c:v copy \
           -c:a aac \
           -shortest \
           -y "$temp_output" 2>/dev/null
    
    # Move temp file to final location
    mv "$temp_output" "$output_file"
    
    print_success "Audio stream fixed successfully"
}

# Main processing function
process_video() {
    local input_file="$1"
    local output_file="$2"
    
    # Validate input file
    if [[ ! -f "$input_file" ]]; then
        print_error "Input file does not exist: $input_file"
        exit 1
    fi
    
    # Check if output file already exists
    if [[ -f "$output_file" ]]; then
        print_warning "Output file already exists: $output_file"
        read -p "Overwrite? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            print_status "Operation cancelled"
            exit 0
        fi
    fi
    
    # Analyze the video
    local analysis_result=$(analyze_video "$input_file")
    local duration=$(echo "$analysis_result" | cut -d'|' -f1)
    local audio_info=$(echo "$analysis_result" | cut -d'|' -f2-)
    
    print_status "Video duration: ${duration}s"
    
    # Check if audio needs fixing
    if needs_audio_fix "$audio_info"; then
        print_warning "Audio stream issues detected. Fixing..."
        fix_audio_stream "$input_file" "$output_file" "$duration"
    else
        print_success "Audio stream is valid. Copying file..."
        cp "$input_file" "$output_file"
    fi
    
    # Verify the output file
    print_status "Verifying output file..."
    local output_analysis=$(analyze_video "$output_file")
    local output_audio_info=$(echo "$output_analysis" | cut -d'|' -f2-)
    
    if needs_audio_fix "$output_audio_info"; then
        print_error "Output file still has audio issues"
        exit 1
    else
        print_success "Output file is ready for Gemini API upload"
    fi
}

# Show usage
show_usage() {
    echo "Usage: $0 <input_video> [output_video]"
    echo ""
    echo "This script preprocesses video files to ensure compatibility with Gemini API."
    echo "It fixes common audio stream issues that cause upload failures."
    echo ""
    echo "Arguments:"
    echo "  input_video   Path to the input video file"
    echo "  output_video  Path to the output video file (optional, defaults to input_preprocessed.mp4)"
    echo ""
    echo "Examples:"
    echo "  $0 video.mp4"
    echo "  $0 video.mp4 processed_video.mp4"
    echo ""
    echo "Requirements:"
    echo "  - ffmpeg (with ffprobe)"
    echo "  - bash"
}

# Main script
main() {
    # Check for help flag
    if [[ "$1" == "-h" ]] || [[ "$1" == "--help" ]]; then
        show_usage
        exit 0
    fi
    
    # Check arguments
    if [[ $# -lt 1 ]]; then
        print_error "Missing input file argument"
        show_usage
        exit 1
    fi
    
    local input_file="$1"
    local output_file="${2:-${input_file%.*}_preprocessed.mp4}"
    
    print_status "Starting video pre-processing..."
    print_status "Input: $input_file"
    print_status "Output: $output_file"
    
    # Check dependencies
    check_ffmpeg
    check_ffprobe
    
    # Process the video
    process_video "$input_file" "$output_file"
    
    print_success "Video pre-processing completed successfully!"
    print_status "Output file: $output_file"
    print_status "This file is now ready for upload to Gemini API"
}

# Run main function with all arguments
main "$@" 