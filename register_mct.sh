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

# Get the MCC root directory
MCC_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Create virtual environment if it doesn't exist
VENV_DIR="${MCC_ROOT}/.venv"
if [ ! -d "$VENV_DIR" ]; then
    echo_status "$BLUE" "Creating virtual environment..."
    python3 -m venv "$VENV_DIR"
# Install required packages
    echo_status "$BLUE" "Installing required packages..."
    pip install "git+https://github.com/espressif/esptool.git@a32988e2d5f02845ce16e22022f5b64368f12572#egg=esptool"

fi

# Activate virtual environment and install dependencies
source "${VENV_DIR}/bin/activate"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --sn_mct)
            SN_MCT="$2"
            shift 2
            ;;
        --sn_led)
            SN_LED="$2"
            shift 2
            ;;
        *)
            echo_status "$RED" "Unknown argument: $1"
            exit 1
            ;;
    esac
done

# Validate required arguments
if [ -z "$SN_MCT" ]; then
    echo_status "$RED" "--sn_mct is required"
    exit 1
fi

# Set SN_LED to SN_MCT if not provided
if [ -z "$SN_LED" ]; then
    SN_LED="$SN_MCT"
fi

# Get MAC address from device
echo_status "$BLUE" "Reading MAC address..."
MAC_ADDRESS=$(esptool.py --chip esp32s3 read_mac | grep -oE "([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}" || echo "unknown")

if [ "$MAC_ADDRESS" = "unknown" ]; then
    echo_status "$RED" "Failed to read MAC address. Make sure device is connected and in bootloader mode."
    exit 1
fi

echo_status "$GREEN" "MAC Address: $MAC_ADDRESS"

# Create JSON payload for registry
MAC_CLEAN=$(echo "$MAC_ADDRESS" | tr -dc '[:print:]')
VERSION_CLEAN=$(git rev-parse --short HEAD | tr -dc '[:print:]')
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

JSON_PAYLOAD=$(cat << EOF
{
    "uuid": "${MAC_CLEAN}",
    "timestamp": "${TIMESTAMP}",
    "version": "${VERSION_CLEAN}",
    "test_status": "registered",
    "sn_mct": "${SN_MCT}",
    "sn_led": "${SN_LED}"
}
EOF
)

# Update registry
echo_status "$BLUE" "Updating registry..."
SCRIPT_URL="https://script.google.com/macros/s/AKfycbzfspd7-OfU1iAJ38KzMCmmUVFSNepLeSrU4sEnr9zAxaQxWzUxVsJSyS9OwiKiy58VOg/exec"

RESPONSE=$(curl -s -L -H "Content-Type: application/json" \
    -H "X-Requested-With: XMLHttpRequest" \
    -d "$JSON_PAYLOAD" \
    "$SCRIPT_URL")

if echo "$RESPONSE" | grep -q "success" 2>/dev/null; then
    echo_status "$GREEN" "Registry updated successfully"
else
    echo_status "$RED" "Error updating registry:"
    echo "$RESPONSE"
    exit 1
fi 