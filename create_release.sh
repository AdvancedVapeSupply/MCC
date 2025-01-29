#!/bin/bash

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

# Set absolute paths
MCC_DIR="$HOME/GitHub/MCC"
MCT_DIR="$HOME/GitHub/MCT"
FIRMWARE_DIR="$MCC_DIR/firmware"

# Check for required tools
if ! command -v gh &> /dev/null; then
    echo_status "$RED" "Error: GitHub CLI (gh) is required but not installed."
    echo_status "$YELLOW" "Install with: brew install gh"
    exit 1
fi

if ! command -v jq &> /dev/null; then
    echo_status "$RED" "Error: jq is required but not installed."
    echo_status "$YELLOW" "Install with: brew install jq"
    exit 1
fi

# Check if required files exist
if [ ! -f "$FIRMWARE_DIR/micropython.bin" ]; then
    echo_status "$RED" "Error: $FIRMWARE_DIR/micropython.bin not found"
    exit 1
fi

if [ ! -f "$FIRMWARE_DIR/version_info.json" ]; then
    echo_status "$RED" "Error: $FIRMWARE_DIR/version_info.json not found"
    echo_status "$RED" "Please run build_mct.sh first"
    exit 1
fi

# Get version information from version_info.json
MCT_VERSION=$(jq -r '.mct_version' "$FIRMWARE_DIR/version_info.json")
LVGL_VERSION=$(jq -r '.lvgl_version' "$FIRMWARE_DIR/version_info.json")
MCT_COMMIT=$(jq -r '.mct_commit' "$FIRMWARE_DIR/version_info.json")
LVGL_COMMIT=$(jq -r '.lvgl_commit' "$FIRMWARE_DIR/version_info.json")
BUILD_DATE=$(jq -r '.build_date' "$FIRMWARE_DIR/version_info.json")

# Create release directory
RELEASE_DIR="$MCC_DIR/release_${MCT_VERSION}"
RELEASE_TAG="v${MCT_VERSION}"

echo_status "$BLUE" "Creating release for version: $MCT_VERSION"

# Create clean release directory
rm -rf "$RELEASE_DIR"
mkdir -p "$RELEASE_DIR"

# Copy firmware and version info
cp "$FIRMWARE_DIR/micropython.bin" "$RELEASE_DIR/"
cp "$FIRMWARE_DIR/version_info.json" "$RELEASE_DIR/"
cp "$FIRMWARE_DIR/bootloader.bin" "$RELEASE_DIR/"
cp "$FIRMWARE_DIR/partition-table.bin" "$RELEASE_DIR/"

# Create release archive
RELEASE_NAME="mcc_${MCT_VERSION}.zip"
cd "$MCC_DIR"  # Change to MCC directory before creating zip
zip -r "$RELEASE_NAME" "release_${MCT_VERSION}"

echo_status "$BLUE" "Creating GitHub release..."

# Create release notes
NOTES="MCT Release ${MCT_VERSION}

Build Information:
- MCT Version: ${MCT_VERSION}
- LVGL Version: ${LVGL_VERSION}
- MCT Commit: ${MCT_COMMIT}
- LVGL Commit: ${LVGL_COMMIT}
- Build Date: ${BUILD_DATE}

This release includes:
- MicroPython firmware
- Bootloader
- Partition table
"

# Create GitHub release
gh release create "$RELEASE_TAG" \
    "$RELEASE_NAME" \
    --title "MCC ${MCT_VERSION}" \
    --notes "$NOTES" \
    --draft

if [ $? -eq 0 ]; then
    echo_status "$GREEN" "Created GitHub release: $RELEASE_TAG"
    echo_status "$BLUE" "Release contents:"
    unzip -l "$RELEASE_NAME"
    echo_status "$YELLOW" "Note: This is a draft release. Review and publish it on GitHub."
else
    echo_status "$RED" "Failed to create GitHub release"
    exit 1
fi 