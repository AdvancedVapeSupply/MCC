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
VERSION_INFO=$(execute_on_device "import sys; print(sys.implementation.version)" | tr -dc '[:print:]\n')

if [ $? -eq 0 ]; then
    echo_status "$GREEN" "REPL test successful"
    test_upy=true
    
    # Get device info for first registry update - capture the MAC address without status messages
    MAC_CLEAN=$(get_clean_mac | tail -n 1)
    VERSION_CLEAN=$(git rev-parse --short HEAD | tr -dc '[:print:]')
    TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    
    # Create JSON payload for MicroPython test
    JSON_PAYLOAD=$(create_payload "$MAC_CLEAN" "micropython_ok" \
        "test_upy" true)

    # Register MicroPython test
    register_data "$JSON_PAYLOAD" "MICROPYTHON TEST" || exit 1

    # Test NVS functionality
    echo_status "$BLUE" "Testing NVS functionality..."
    
    # Initialize NVS with test values
    echo_status "$BLUE" "Initializing NVS values..."
    execute_on_device "import nvs; nvs.set_nvs('wifi.ssid', 'AVS'); nvs.set_nvs('wifi.passwd', 'Advanced'); nvs.set_nvs('serial.board', '5024-0011m'); nvs.set_nvs('serial.mfg', '5024-0008')"
    
    # Verify NVS values
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

    # Initialize WiFi using NVS parameters
    echo_status "$BLUE" "Initializing WiFi..."
    WIFI_INIT=$(execute_on_device "
import mct_ota
try:
    if mct_ota.connect_wifi():
        print('success')
    else:
        raise Exception('Failed to connect to WiFi')
except Exception as e:
    print('Error:', str(e))
")

    echo_status "$BLUE" "WiFi initialization output:"
    echo "$WIFI_INIT"

    if ! echo "$WIFI_INIT" | grep -q "success"; then
        echo_status "$RED" "WiFi initialization failed"
        test_wifi=false
        
        # Create JSON payload for WiFi failure
        JSON_PAYLOAD=$(create_payload "$MAC_CLEAN" "wifi_fail" \
            "test_wifi" false \
            "error" "\"$(echo "$WIFI_INIT" | grep "Error:" | cut -d':' -f2- | tr -d '\n' | tr -dc '[:print:]')\"")

        # Register WiFi failure
        register_data "$JSON_PAYLOAD" "WIFI FAILURE" || exit 1
        exit 1
    else
        echo_status "$GREEN" "WiFi initialization successful"
        test_wifi=true
        
        # Create JSON payload for WiFi success
        JSON_PAYLOAD=$(create_payload "$MAC_CLEAN" "wifi_ok" \
            "test_wifi" true)

        # Register WiFi success
        register_data "$JSON_PAYLOAD" "WIFI SUCCESS" || exit 1
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
        # Capture test results and clean up any control characters
        TEST_RESULTS=$(execute_on_device "import json; from MCT import MCT; m=MCT(); print(m.test())" | tail -n 1 | tr -dc '[:print:]\n')

        # Verify we got valid JSON
        if ! echo "$TEST_RESULTS" | jq . >/dev/null 2>&1; then
            echo_status "$RED" "Failed to get valid JSON test results"
            echo_status "$BLUE" "Raw test results:"
            echo "$TEST_RESULTS"
            exit 1
        fi

        echo_status "$BLUE" "Test results received:"
        echo "$TEST_RESULTS" | jq .

        # Create JSON payload for MCT success - using a temporary file to ensure proper JSON handling
        echo "$TEST_RESULTS" > /tmp/test_results.json
        JSON_PAYLOAD=$(jq --arg uuid "$MAC_CLEAN" \
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
                         }' /tmp/test_results.json)
        rm -f /tmp/test_results.json

        # Register MCT success
        register_data "$JSON_PAYLOAD" "MCT SUCCESS" || exit 1

        # Test UI functionality
        echo_status "$BLUE" "Testing UI functionality..."
        UI_TEST=$(execute_on_device "
import main
try:
    main.main()
    print('success')
except Exception as e:
    print('Error:', str(e))
")

        echo_status "$BLUE" "UI test output:"
        echo "$UI_TEST"

        if echo "$UI_TEST" | grep -q "success"; then
            echo_status "$GREEN" "UI test successful"
            test_ui=true
        else
            echo_status "$RED" "UI test failed"
            test_ui=false
            echo_status "$RED" "Error: $(echo "$UI_TEST" | grep "Error:" | cut -d':' -f2-)"
        fi

        # Now test OTA functionality after UI test
        echo_status "$BLUE" "Testing OTA functionality..."
        OTA_TEST=$(execute_on_device "
import mct_ota
try:
    updater = mct_ota.OTAUpdater()
    if updater.test():
        print('success')
    else:
        raise Exception('OTA tests failed')
except Exception as e:
    print('Error:', str(e))
")

        echo_status "$BLUE" "OTA test output:"
        echo "$OTA_TEST"

        if echo "$OTA_TEST" | grep -q "success"; then
            echo_status "$GREEN" "OTA test successful"
            test_ota=true
            
            # Create JSON payload for OTA success
            JSON_PAYLOAD=$(create_payload "$MAC_CLEAN" "ota_ok" \
                "test_ota" true)

            # Register OTA success
            register_data "$JSON_PAYLOAD" "OTA SUCCESS" || exit 1
        else
            echo_status "$RED" "OTA test failed"
            test_ota=false
            
            # Create JSON payload for OTA failure
            JSON_PAYLOAD=$(create_payload "$MAC_CLEAN" "ota_fail" \
                "test_ota" false \
                "error" "\"$(echo "$OTA_TEST" | grep "Error:" | cut -d':' -f2- | tr -d '\n' | tr -dc '[:print:]')\"")

            # Register OTA failure
            register_data "$JSON_PAYLOAD" "OTA FAILURE" || exit 1
        fi

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