set -x  # Enable debug mode to see what's executing

# Exit virtual environment if we're in one
if [[ -n "$VIRTUAL_ENV" ]]; then
    deactivate
fi

# Add sed command to modify esp32.py
sed -i '' 's/vfs,data,fat,/vfs,data,spiffs,/' ../lvgl_micropython/builder/esp32.py

cd ../lvgl_micropython

# Run make and capture the output
BUILD_OUTPUT=$(python3 make.py esp32 BOARD=ESP32_GENERIC_S3 BOARD_VARIANT=SPIRAM_OCT --flash-size=16 DISPLAY=ST7735 --usb-otg --ota-app --dual-core-threads)

# Find the ESP32 port automatically
PORT=$(ls /dev/tty.usbmodem* 2>/dev/null | head -n 1)
if [ -z "$PORT" ]; then
    echo "Error: No ESP32 device found at /dev/tty.usbmodem*"
    exit 1
fi

# Extract the flash command from the build output and replace (PORT) with actual port
FLASH_CMD=$(echo "$BUILD_OUTPUT" | grep "python.*esptool.*write_flash" | sed "s|(PORT)|$PORT|g")

# Execute the flash command
eval "$FLASH_CMD"
