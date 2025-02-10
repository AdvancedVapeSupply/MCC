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

# Source common registration functions
source "$(dirname "$0")/register.sh"

# Get the MCC root directory
MCC_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Create virtual environment if it doesn't exist
VENV_DIR="${MCC_ROOT}/.venv"
if [ ! -d "$VENV_DIR" ]; then
    echo_status "$BLUE" "Creating virtual environment..."
    python3 -m venv "$VENV_DIR"
fi

# Activate virtual environment and install dependencies
source "${VENV_DIR}/bin/activate"

# Install required packages
echo_status "$BLUE" "Installing required packages..."
pip install "git+https://github.com/espressif/esptool.git@a32988e2d5f02845ce16e22022f5b64368f12572#egg=esptool"
pip install mpremote

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
        --wifi_ssid)
            WIFI_SSID="$2"
            shift 2
            ;;
        --wifi_pass)
            WIFI_PASS="$2"
            shift 2
            ;;
        *)
            echo_status "$RED" "Unknown argument: $1"
            exit 1
            ;;
    esac
done

# Set default WiFi credentials if not provided
WIFI_SSID="${WIFI_SSID:-AVS}"
WIFI_PASS="${WIFI_PASS:-Advanced}"

# Remove NVS-related sections
if [ -z "$SN_MCT" ]; then
    echo_status "$RED" "--sn_mct is required"
    exit 1
fi

# Set SN_LED to SN_MCT if not provided
if [ -z "$SN_LED" ]; then
    SN_LED="$SN_MCT"
fi

# Run mpremote devs once and save its output
DEVICE_INFO=$(mpremote devs)
echo_status "$BLUE" "mpremote devs output:"
echo "$DEVICE_INFO"

# Get MAC address early while device is in a known state
echo_status "$BLUE" "Getting MAC address before flashing..."
MAC_CLEAN=$(echo "$DEVICE_INFO" | grep '303a:' | awk '{print $2}' | cut -c1-12 | sed 's/\(..\)/\1:/g;s/:$//' | tr '[:upper:]' '[:lower:]')
if [ -z "$MAC_CLEAN" ] || [ "$MAC_CLEAN" = "unknown" ]; then
    echo_status "$RED" "Failed to get MAC address before flashing. Cannot proceed."
    exit 1
fi
echo_status "$GREEN" "Got MAC address: $MAC_CLEAN"

# Get version info from version_info.json
if [ ! -f "${MCC_ROOT}/firmware/version_info.json" ]; then
    echo_status "$RED" "version_info.json not found"
    exit 1
fi

# Read version info using jq
MCT_VERSION=$(jq -r '.mct_commit' "${MCC_ROOT}/firmware/version_info.json")
LVGL_VERSION=$(jq -r '.lvgl_commit' "${MCC_ROOT}/firmware/version_info.json")

if [ -z "$MCT_VERSION" ] || [ -z "$LVGL_VERSION" ]; then
    echo_status "$RED" "Failed to read version info from version_info.json"
    exit 1
fi

# Determine the correct port for bootloader mode
BOOTLOADER_PORT=$(echo "$DEVICE_INFO" | grep '303a:1001' | grep -oE '/dev/cu\.[^ ]+')
echo_status "$BLUE" "Using bootloader port: $BOOTLOADER_PORT"

# Determine the correct port for REPL mode
REPL_PORT=$(echo "$DEVICE_INFO" | grep '303a:0420' | grep -oE '/dev/cu\.[^ ]+')
echo_status "$BLUE" "Using REPL port: $REPL_PORT"

# Ensure the device is in bootloader mode
if [ -z "$BOOTLOADER_PORT" ]; then
    echo_status "$YELLOW" "Device not in bootloader mode, attempting to enter bootloader..."
    mpremote connect "$REPL_PORT" bootloader
    sleep 2
    DEVICE_INFO=$(mpremote devs)
    echo_status "$BLUE" "mpremote devs output after attempting bootloader entry:"
    echo "$DEVICE_INFO"
    BOOTLOADER_PORT=$(echo "$DEVICE_INFO" | grep '303a:1001' | grep -oE '/dev/cu\.[^ ]+')
    if [ -z "$BOOTLOADER_PORT" ]; then
        echo_status "$RED" "Failed to enter bootloader mode. Please manually reset the device while holding the BOOT button."
        exit 1
    fi
    echo_status "$GREEN" "Successfully entered bootloader mode"
fi

# Flash firmware
echo_status "$BLUE" "Flashing firmware..."
esptool.py --chip esp32s3 --port "$BOOTLOADER_PORT" --baud 115200 \
    --before default_reset --after watchdog_reset erase_flash

# Add a delay to allow the device to reset
sleep 2

esptool.py --chip esp32s3 --port "$BOOTLOADER_PORT" --baud 115200 \
    --before default_reset --after watchdog_reset write_flash -z \
    0x0 "${MCC_ROOT}/firmware/bootloader.bin" \
    0x8000 "${MCC_ROOT}/firmware/partition-table.bin" \
    0x20000 "${MCC_ROOT}/firmware/micropython.bin"

# Add a delay to allow the device to reset
sleep 2

if [ $? -eq 0 ]; then
    echo_status "$GREEN" "Firmware flashed successfully"

    # Function to show available devices
    show_devices() {
        echo "Available devices:"
        mpremote devs
        echo "-------------------"
    }
 
    # Show devices after reset
    show_devices

    # Check for device in REPL mode
    check_repl_mode() {
        local device_info=$(mpremote connect list | grep "AVS MCT")
        if [ -n "$device_info" ]; then
            echo "Device found in REPL mode: $device_info"
            return 0
        fi
        return 1
    }

    # Wait for device to be ready
    echo "Waiting for device to be ready..."
    attempt=1
    max_attempts=6
    while [ $attempt -le $max_attempts ]; do
        if check_repl_mode; then
            break
        fi
        echo "Device not ready, waiting... (attempt $attempt of $max_attempts)"
        sleep 2
        ((attempt++))
    done

    if [ $attempt -gt $max_attempts ]; then
        echo_status "$RED" "Error: Device not found in REPL mode after $max_attempts attempts"
        echo_status "$BLUE" "Running mpremote to check device status..."
        mpremote
        exit 1
    fi

    # Continue with setting variables only if device is in REPL mode
    echo "Setting variables on device using mpremote..."
     
    DEVICE_INFO=$(mpremote devs)
    echo "$DEVICE_INFO"

    # Execute Python code to set NVS values using get_nvs
    echo "Setting NVS values..."
    mpremote exec "import nvs; nvs.set_nvs('wifi.ssid', '$WIFI_SSID')"
    mpremote exec "import nvs; nvs.set_nvs('wifi.passwd', '$WIFI_PASS')"
    mpremote exec "import nvs; nvs.set_nvs('serial.board', '$SN_MCT')"
    mpremote exec "import nvs; nvs.set_nvs('serial.mfg', '$SN_LED')"
    echo_status "$GREEN" "NVS values set successfully"

    # Create JSON payload for flash registration (includes serial numbers)
    JSON_PAYLOAD=$(create_payload "$MAC_CLEAN" "flashed" \
        "sn_mct" "\"$SN_MCT\"" \
        "sn_led" "\"$SN_LED\"" \
        "ota_0.upy" "\"$LVGL_VERSION\"" \
        "ota_0.mct" "\"$MCT_VERSION\"")

    # Register flash
    register_data "$JSON_PAYLOAD" "FLASH" || exit 1

    # Check if device is in REPL mode
    echo_status "$BLUE" "Checking device state..."
    DEVICE_INFO=$(mpremote devs)
    echo "$DEVICE_INFO"
    
    if echo "$DEVICE_INFO" | grep -q "0420"; then
        echo_status "$GREEN" "Device is in REPL mode"
        
        # Set OTA version information
        echo_status "$BLUE" "Setting OTA version information..."
        mpremote exec "import nvs; nvs.set_nvs('ota_0.upy', '${LVGL_VERSION}')"
        mpremote exec "import nvs; nvs.set_nvs('ota_0.mct', '${MCT_VERSION}')"
        echo_status "$GREEN" "OTA version information set successfully"
        
        # Create JSON payload for REPL test (no serial numbers needed)
        JSON_PAYLOAD=$(create_payload "$MAC_CLEAN" "test_repl" \
            "ota_0.upy" "\"$LVGL_VERSION\"" \
            "ota_0.mct" "\"$MCT_VERSION\"")

        # Register REPL test
        register_data "$JSON_PAYLOAD" "REPL TEST" || exit 1
    else
        echo_status "$YELLOW" "Device not in REPL mode. Please try running tests manually."
    fi
else
    echo_status "$RED" "Failed to flash firmware"
    exit 1
fi

# Clean up NVS temporary files
# rm -rf "${MCC_ROOT}/nvs_tmp" 
# rm -rf "${MCC_ROOT}/nvs_tmp" 