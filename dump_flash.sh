#!/bin/bash

# Identify the serial device
SERIAL_DEVICE=$(ls /dev/tty.usb* | head -n 1)

# Check if the serial device was found
if [ -z "$SERIAL_DEVICE" ]; then
  echo "No ESP32 device found at /dev/tty.usb*"
  exit 1
fi

# Set the baud rate (optional, can be adjusted)
BAUD_RATE=115200

# Set the size of the flash (in bytes, 16MB = 0x1000000)
FLASH_SIZE=0x1000000

# Specify the output file
OUTPUT_FILE="flash_dump_16MB.bin"

# Run esptool.py to read the flash
esptool.py --port "$SERIAL_DEVICE" --baud $BAUD_RATE read_flash 0x0 $FLASH_SIZE "$OUTPUT_FILE"

# Check if the esptool command was successful
if [ $? -eq 0 ]; then
  echo "Firmware successfully downloaded to $OUTPUT_FILE"

  # Increment the version in manifest.json
  MANIFEST_FILE="manifest.json"
  
  if [ -f "$MANIFEST_FILE" ]; then
    # Extract the current version
    CURRENT_VERSION=$(jq -r '.version' "$MANIFEST_FILE")

    # Split the version into its components
    IFS='.' read -r -a VERSION_PARTS <<< "$CURRENT_VERSION"

    # Increment the last part of the version
    VERSION_PARTS[2]=$((VERSION_PARTS[2] + 1))

    # Reconstruct the new version
    NEW_VERSION="${VERSION_PARTS[0]}.${VERSION_PARTS[1]}.${VERSION_PARTS[2]}"

    # Update the manifest.json file with the new version
    jq ".version = \"$NEW_VERSION\"" "$MANIFEST_FILE" > tmp_manifest.json && mv tmp_manifest.json "$MANIFEST_FILE"

    echo "Version updated to $NEW_VERSION in $MANIFEST_FILE"

    # Add changes to git
    git add "$OUTPUT_FILE" "$MANIFEST_FILE"

    # Commit the changes with a message
    git commit -m "Downloaded firmware and updated manifest.json to version $NEW_VERSION"

    # Push the changes to the remote repository
    git push

    echo "Changes committed and pushed to the remote repository."
  else
    echo "manifest.json not found, skipping version increment."
  fi
else
  echo "Failed to download firmware."
fi