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

# Get absolute paths
MCC_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TRASH_DIR="${MCC_ROOT}/.Trash"

# Create .Trash directory if it doesn't exist
mkdir -p "$TRASH_DIR"

# List of files/directories to keep
KEEP_FILES=(
    "firmware/bootloader.bin"
    "firmware/partition-table.bin"
    "firmware/micropython.bin"
    "firmware/version_info.json"
    "bin/nvs_gen.py"
    ".venv"
    "load_micropython.sh"
    ".Trash"
    ".git"
    "README.md"
)

echo_status "$BLUE" "Moving unnecessary files to .Trash..."

# Function to check if a file should be kept
should_keep() {
    local file="$1"
    for keep in "${KEEP_FILES[@]}"; do
        if [[ "$file" == "$keep" ]] || [[ "$file" == *"/$keep" ]]; then
            return 0
        fi
    done
    return 1
}

# Move files to .Trash
find "$MCC_ROOT" -mindepth 1 -maxdepth 1 | while read -r file; do
    base_name=$(basename "$file")
    if ! should_keep "$base_name"; then
        echo_status "$YELLOW" "Moving $base_name to .Trash"
        mv "$file" "$TRASH_DIR/"
    else
        echo_status "$GREEN" "Keeping $base_name"
    fi
done

echo_status "$GREEN" "Done! Unnecessary files have been moved to .Trash"
echo_status "$BLUE" "You can restore files from .Trash if needed" 