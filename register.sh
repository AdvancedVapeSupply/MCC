#!/bin/bash

# Color definitions
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Registry URL
SCRIPT_URL="https://script.google.com/macros/s/AKfycbxqaIPGjRak5-k41r5-p2yAavuSaxmHkiAIBc9fr3PDGShNkjRZCoyencZPPduzV8geww/exec"

# Helper function for colored echo
echo_status() {
    local color=$1
    local message=$2
    echo -e "${color}${message}${NC}"
}

# Function to register data with the registry
register_data() {
    local payload="$1"
    local description="$2"

    echo_status "$YELLOW" "=== REGISTERING $description ==="
    echo_status "$BLUE" "$description payload:"
    echo "$payload" | jq .

    echo_status "$BLUE" "Sending $description results..."
    local RESPONSE=$(curl -s -L -H "Content-Type: application/json" \
        -H "X-Requested-With: XMLHttpRequest" \
        -d "$payload" \
        "$SCRIPT_URL")

    if echo "$RESPONSE" | grep -q "success" 2>/dev/null; then
        echo_status "$GREEN" "$description results recorded successfully"
        return 0
    else
        echo_status "$RED" "Failed to update registry with $description. Response:"
        echo "$RESPONSE"
        return 1
    fi
}

# Function to create a JSON payload
create_payload() {
    local uuid="$1"
    local test_status="$2"
    shift 2
    local extra_args=("$@")

    # Strip ANSI color codes from inputs
    uuid=$(echo "$uuid" | sed 's/\x1b\[[0-9;]*m//g' | tr -dc '[:print:]\n')
    test_status=$(echo "$test_status" | sed 's/\x1b\[[0-9;]*m//g' | tr -dc '[:print:]\n')

    # Create JSON object directly with jq
    local json_content
    json_content=$(jq -n \
        --arg uuid "$uuid" \
        --arg timestamp "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
        --arg version "$(git rev-parse --short HEAD | tr -dc '[:print:]')" \
        --arg test_status "$test_status" \
        '{
            uuid: $uuid,
            timestamp: $timestamp,
            version: $version,
            test_status: $test_status
        }')

    # Add extra key-value pairs
    local key
    local value
    for ((i=0; i<${#extra_args[@]}; i+=2)); do
        key="${extra_args[i]}"
        value="${extra_args[i+1]}"
        
        # Handle boolean values properly
        if [[ "$value" == "true" ]] || [[ "$value" == "false" ]]; then
            json_content=$(echo "$json_content" | jq --arg k "$key" --argjson v "$value" '. + {($k): $v}')
        else
            # Strip ANSI codes if it's a string value
            value=$(echo "$value" | sed 's/\x1b\[[0-9;]*m//g' | tr -dc '[:print:]\n')
            json_content=$(echo "$json_content" | jq --arg k "$key" --arg v "$value" '. + {($k): $v}')
        fi
    done

    # Output the formatted JSON
    echo "$json_content"
}

# Function to get MAC address - uses either execute_on_device or mpremote exec
get_mac_address() {
    local command="import network; wlan = network.WLAN(network.STA_IF); wlan.active(True); mac = wlan.config('mac'); print(':'.join(['%02x' % b for b in mac]))"
    local mac
    local raw_output
    
    if type execute_on_device >/dev/null 2>&1; then
        # If execute_on_device is available (test_mct.sh), use it
        raw_output=$(execute_on_device "$command" 2>&1)
    else
        # Otherwise use mpremote directly (load_mct.sh)
        raw_output=$(mpremote exec "$command" 2>&1)
    fi

    # Extract MAC address using grep, ignoring case and removing any ANSI codes
    mac=$(echo "$raw_output" | sed 's/\x1b\[[0-9;]*m//g' | grep -iE "([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}" || echo "")

    if [ -z "$mac" ]; then
        echo_status "$RED" "Failed to get MAC address. Raw output:"
        echo "$raw_output"
        return 1
    fi
    
    # Clean the MAC address and convert to lowercase
    mac=$(echo "$mac" | tr -dc '[:alnum:]:' | tr '[:upper:]' '[:lower:]')
    echo "$mac"
}

# Function to get clean MAC for registration
get_clean_mac() {
    local mac_address
    
    # Get the MAC address without any status messages
    if ! mac_address=$(get_mac_address); then
        echo_status "$RED" "Cannot proceed without valid MAC address"
        exit 1
    fi

    # Clean the MAC address of any remaining ANSI codes and extra characters
    mac_address=$(echo "$mac_address" | tr -dc '[:alnum:]:' | tr '[:upper:]' '[:lower:]')
    
    # Only output status messages after we have the clean MAC
    echo_status "$BLUE" "Getting MAC address for registration..."
    echo_status "$GREEN" "Got MAC address: $mac_address"
    
    # Return only the clean MAC address
    echo "$mac_address"
}

# Export functions and variables for use in other scripts
export -f echo_status
export -f register_data
export -f create_payload
export -f get_mac_address
export -f get_clean_mac
export SCRIPT_URL
export RED GREEN YELLOW BLUE NC 