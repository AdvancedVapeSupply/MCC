#!/bin/bash

# Define the path to the manifest file
MANIFEST_FILE="manifest.json"

# Get the current date and time
CURRENT_DATETIME=$(date +"%Y%m%d_%H%M")

# Extract the base version (e.g., "v0.2") from the latest version in the manifest
BASE_VERSION=$(jq -r '.versions[0].version' "$MANIFEST_FILE" | cut -d. -f1-2)

# Create the new version string using date and time
NEW_VERSION="${BASE_VERSION}.${CURRENT_DATETIME}"

# Look up the serial device (e.g., for macOS)
SERIAL_DEVICE=$(ls /dev/tty.usb* | head -n 1)

# If no serial device is found, exit with an error
if [ -z "$SERIAL_DEVICE" ]; then
  echo "Error: No serial device found. Please connect your ESP32-S3."
  exit 1
fi

# Create the flash dump with the new version name
FLASH_DUMP_PATH="MCC/flash_dump_16MB_v${NEW_VERSION}.bin"
esptool.py --chip esp32s3 --port "$SERIAL_DEVICE" --baud 460800 read_flash 0 0x1000000 "$FLASH_DUMP_PATH"

# Check if the esptool command was successful
if [ $? -ne 0 ]; then
  echo "Error: Flash dump failed. Exiting."
  exit 1
fi

# Prepare the new version entry
NEW_VERSION_ENTRY=$(jq -n \
  --arg version "$NEW_VERSION" \
  --arg path "$FLASH_DUMP_PATH" \
  '{
    "version": $version,
    "builds": [
      {
        "chipFamily": "ESP32-S3",
        "parts": [
          {
            "path": $path,
            "offset": 0
          }
        ]
      }
    ]
  }'
)

# Insert the new version entry at the top of the versions array in the manifest
jq --argjson newVersion "$NEW_VERSION_ENTRY" \
   '.versions |= [$newVersion] + .' \
   "$MANIFEST_FILE" > tmp_manifest.json && mv tmp_manifest.json "$MANIFEST_FILE"

# Add changes to git
git add "$MANIFEST_FILE" "$FLASH_DUMP_PATH"

# Commit the changes with a message that includes the new version
git commit -m "Update manifest with new version $NEW_VERSION"

# Optional: push the changes to the remote repository (uncomment if needed)
# git push origin main

echo "New flash dump created, manifest updated with version $NEW_VERSION, and changes committed to Git."
