#!/bin/bash
#set -x  # Enable debug mode to see what's executing

# Color definitions
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper function for colored echo
echo_status() {
    local color=$1
    local message=$2
    echo -e "${color}${message}${NC}"
}

# Get absolute paths for all directories
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GITHUB_ROOT="$HOME/GitHub"
MCT_ROOT="$GITHUB_ROOT/MCT"
LVGL_ROOT="$GITHUB_ROOT/lvgl_micropython"

echo_status "$BLUE" "Initial paths:"
echo_status "$BLUE" "SCRIPT_DIR:   $SCRIPT_DIR"
echo_status "$BLUE" "GITHUB_ROOT:  $GITHUB_ROOT"
echo_status "$BLUE" "MCT_ROOT:     $MCT_ROOT"
echo_status "$BLUE" "LVGL_ROOT:    $LVGL_ROOT"

# Verify lvgl_micropython directory exists
if [ ! -d "$LVGL_ROOT" ]; then
    echo_status "$RED" "Error: Cannot find lvgl_micropython directory at: $LVGL_ROOT"
    echo_status "$RED" "Directory contents of $GITHUB_ROOT:"
    ls -la "$GITHUB_ROOT"
    exit 1
fi

# Initialize and update submodules
echo_status "$BLUE" "Initializing and updating submodules..."
cd "$LVGL_ROOT"
git submodule update --init --recursive

# Try to find MCC relative to MCT
# ... existing code ... 