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

# Validate serial numbers
if [ -z "$SN_MCT" ] || [ -z "$SN_LED" ]; then
    echo_status "$RED" "Both --sn_mct and --sn_led are required"
    exit 1
fi

# Get the MCC root directory
MCC_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MCT_ROOT="${MCC_ROOT}/../MCT"

# Create NVS partition
echo_status "$BLUE" "Creating NVS partition..."
mkdir -p "${MCC_ROOT}/nvs_tmp"

# Create CSV file for NVS data
cat > "${MCC_ROOT}/nvs_tmp/nvs_data.csv" << EOF
key,type,encoding,value
mct,namespace,,
sn,data,string,$SN_MCT
led,namespace,,
sn,data,string,$SN_LED
wifi,namespace,,
ssid,data,string,$WIFI_SSID
pass,data,string,$WIFI_PASS
EOF

# Create NVS partition using our script
"${MCC_ROOT}/bin/nvs_gen.py" \
    "${MCC_ROOT}/nvs_tmp/nvs_data.csv" \
    "${MCC_ROOT}/nvs_tmp/nvs.bin" \
    0x4000

if [ $? -ne 0 ]; then
    echo_status "$RED" "Failed to create NVS partition"
    exit 1
fi

# Get MAC address from device
MAC_ADDRESS=$("${MCT_ROOT}/bin/esptool.py" --chip esp32s3 read_mac | grep -oE "([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}" || echo "unknown")

# Flash firmware
echo_status "$BLUE" "Flashing firmware..."
"${MCT_ROOT}/bin/esptool.py" --chip esp32s3 --baud 921600 \
    --before default_reset --after watchdog_reset erase_flash && \
"${MCT_ROOT}/bin/esptool.py" --chip esp32s3 --baud 921600 \
    --before default_reset --after watchdog_reset write_flash -z \
    0x0 "${MCC_ROOT}/firmware/bootloader.bin" \
    0x8000 "${MCC_ROOT}/firmware/partition-table.bin" \
    0x9000 "${MCC_ROOT}/nvs_tmp/nvs.bin" \
    0x20000 "${MCC_ROOT}/firmware/micropython.bin"

if [ $? -eq 0 ]; then
    echo_status "$GREEN" "Firmware flashed successfully"
    
    # Create JSON payload for registry
    MAC_CLEAN=$(echo "$MAC_ADDRESS" | tr -dc '[:print:]')
    VERSION_CLEAN=$(git rev-parse --short HEAD | tr -dc '[:print:]')
    TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    
    JSON_PAYLOAD=$(cat << EOF
{
    "uuid": "${MAC_CLEAN}",
    "timestamp": "${TIMESTAMP}",
    "version": "${VERSION_CLEAN}",
    "test_status": "flashed",
    "sn_mct": "${SN_MCT}",
    "sn_led": "${SN_LED}"
}
EOF
)

    # Update registry
    SCRIPT_URL="https://script.google.com/macros/s/AKfycbzfspd7-OfU1iAJ38KzMCmmUVFSNepLeSrU4sEnr9zAxaQxWzUxVsJSyS9OwiKiy58VOg/exec"
    
    RESPONSE=$(curl -s -L -H "Content-Type: application/json" \
        -H "X-Requested-With: XMLHttpRequest" \
        -d "$JSON_PAYLOAD" \
        "$SCRIPT_URL")
    
    if echo "$RESPONSE" | grep -q "success" 2>/dev/null; then
        echo_status "$GREEN" "Registry updated successfully"
        
        # Wait for device to boot
        sleep 2
        
        # Check if device is in REPL mode
        echo_status "$BLUE" "Checking device state..."
        DEVICE_INFO=$(mpremote devs)
        echo "$DEVICE_INFO"
        
        if echo "$DEVICE_INFO" | grep -q "0420"; then
            # Device is in REPL mode, run tests
            echo_status "$BLUE" "Testing MicroPython..."
            # Copy registry.py to device
            mpremote cp "${MCT_ROOT}/lib/registry.py" :registry.py
            sleep 1
            
            # Test MicroPython and register
            mpremote exec "import registry; registry.register_test('$MAC_ADDRESS')"
            sleep 2
            
            echo_status "$BLUE" "Running MCT tests..."
            mpremote exec "from MCT import MCT; mct = MCT(); mct.test()"
        else
            echo_status "$YELLOW" "Device not in REPL mode. Please try running tests manually."
        fi
    else
        echo_status "$RED" "Error updating registry:"
        echo "$RESPONSE"
    fi
else
    echo_status "$RED" "Failed to flash firmware"
    exit 1
fi

# Clean up NVS temporary files
rm -rf "${MCC_ROOT}/nvs_tmp" 