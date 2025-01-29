#!/bin/bash

# Source common registration functions
source "$(dirname "$0")/../MCT/bin/register.sh"

# Define the path to the mpremote command
MPREMOTE="mpremote"

# Color definitions (copying from load_micropython.sh for consistency)
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

# Check if device is in REPL mode
check_repl_mode() {
    REPL_PORT=$(mpremote devs | grep '303a:0420' | grep -oE '/dev/cu\.[^ ]+')
    if [ -z "$REPL_PORT" ]; then
        echo_status "$RED" "Device not in REPL mode. Please ensure device is connected and running MicroPython."
        exit 1
    fi
    echo_status "$GREEN" "Device found in REPL mode at: $REPL_PORT"
}

# Function to execute a command on the MicroPython device
execute_on_device() {
    local command="$1"
    echo_status "$BLUE" "Executing: $command"
    $MPREMOTE connect $REPL_PORT exec "$command"
}

# First check REPL mode
check_repl_mode

# Test REPL by getting MicroPython version
echo_status "$BLUE" "Testing REPL communication..."
VERSION_INFO=$(execute_on_device "import sys; print(sys.implementation.version)")

if [ $? -eq 0 ]; then
    echo_status "$GREEN" "REPL test successful"
    test_upy=true
    
    # Get device info for first registry update
    MAC_CLEAN=$(get_clean_mac)
    VERSION_CLEAN=$(git rev-parse --short HEAD | tr -dc '[:print:]')
    TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    
    # Create JSON payload for MicroPython test
    JSON_PAYLOAD=$(create_payload "$MAC_CLEAN" "micropython_ok" \
        "test_upy" "$test_upy")

    # Register MicroPython test
    register_data "$JSON_PAYLOAD" "MICROPYTHON TEST" || exit 1

    # Test NVS functionality
    echo_status "$BLUE" "Testing NVS functionality..."
    execute_on_device "import nvs; print('WiFi SSID:', nvs.get_nvs('wifi.ssid'))"
    execute_on_device "import nvs; print('WiFi Password:', '*' * len(nvs.get_nvs('wifi.passwd')) if nvs.get_nvs('wifi.passwd') else 'None')"
    execute_on_device "import nvs; print('Board Serial:', nvs.get_nvs('serial.board'))"
    execute_on_device "import nvs; print('Mfg Serial:', nvs.get_nvs('serial.mfg'))"

    if [ $? -eq 0 ]; then
        echo_status "$GREEN" "NVS test successful"
    else
        echo_status "$RED" "NVS test failed"
        exit 1
    fi

    # Test MCT instantiation
    echo "Testing MCT instantiation..."
    MCT_INIT=$(mpremote exec "from MCT import MCT; m=MCT(); print('MCT=' + str(m))")
    echo "Raw MCT init output:"
    echo "$MCT_INIT"

    if echo "$MCT_INIT" | grep -q "MCT=<MCT object at"; then
        test_mct=true
        echo "MCT initialization successful"
    else
        test_mct=false
        echo "MCT initialization failed"
    fi

    # Test MCT instantiation
    echo_status "$BLUE" "Testing MCT instantiation..."
    echo_status "$BLUE" "Raw MCT init output:"
    MCT_INIT=$(execute_on_device "from MCT import MCT; m=MCT(); print('success')" 2>&1)
    echo_status "$BLUE" "MCT_INIT value: '$MCT_INIT'"

    if [[ "$MCT_INIT" == *"success"* ]]; then
        echo_status "$GREEN" "MCT initialization successful"
        test_mct="True"
        
        # Run MCT tests
        echo_status "$BLUE" "Running MCT tests..."
        TEST_RESULTS=$(execute_on_device "import json; from MCT import MCT; m=MCT(); print(json.dumps(m.test()))" | tail -n 1)

        # Verify we got valid JSON
        if ! echo "$TEST_RESULTS" | jq . >/dev/null 2>&1; then
            echo_status "$RED" "Failed to get valid JSON test results"
            exit 1
        fi

        echo_status "$BLUE" "Test results received:"
        echo "$TEST_RESULTS" | jq .

        # Create JSON payload for MCT success
        JSON_PAYLOAD=$(echo "$TEST_RESULTS" | jq --arg uuid "$MAC_CLEAN" \
                                               --arg timestamp "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
                                               --arg version "$VERSION_CLEAN" \
                                               --arg test_status "mct_ok" \
                                               --arg test_mct "$test_mct" \
                                               '. + {
                                                   uuid: $uuid,
                                                   timestamp: $timestamp,
                                                   version: $version,
                                                   test_status: $test_status,
                                                   test_mct: $test_mct
                                               }')

        # Register MCT success
        register_data "$JSON_PAYLOAD" "MCT SUCCESS" || exit 1
    else
        echo_status "$RED" "MCT initialization failed"
        test_mct="$MCT_INIT"
        
        # Create JSON payload for MCT failure
        JSON_PAYLOAD=$(create_payload "$MAC_CLEAN" "mct_fail" \
            "test_mct" "\"$test_mct\"")

        # Register MCT failure
        register_data "$JSON_PAYLOAD" "MCT FAILURE" || exit 1
    fi
else
    echo_status "$RED" "REPL test failed"
    test_upy=false
    exit 1
fi 