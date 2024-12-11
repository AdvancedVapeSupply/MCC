#!/usr/bin/env python3

"""
MCT Binary Creation and Flashing Script

This script automates the process of creating and optionally flashing a binary image
for the MCT (MicroPython Control Tool) project. It performs the following steps:

1. Update version files: Updates version.py in the MCT repository and manifest.json
   in the current directory with a new version number.
2. Commit and push MCT: Commits the version changes to the MCT repository and pushes them.
3. Clone MCT repository: Clones or updates the MCT repository.
4. Checkout specific commit or tag: Checks out a specified commit or tag in the MCT repository.
5. Validate version files: Ensures all necessary version files are present and valid.
6. Create FAT filesystem image: Generates a FAT filesystem image containing MCT files.
7. Commit and push changes in current working directory: Commits and pushes changes made
   in the script's working directory.
8. Flash ESP32-S3 (optional): If the --flash flag is used, erases and flashes the
   ESP32-S3 device with the created image.

Usage:
    python3 create_MCT_bin.py [--flash]

Options:
    --flash     Erase and flash the device after creating the image

Note: This script requires various dependencies and assumes a specific project structure.
Ensure all prerequisites are met before running.
"""

import os
import subprocess
import shutil
import json
import hashlib
import math
from tempfile import mkdtemp
from datetime import datetime, timezone
import glob
import sys
import time
import serial
import argparse
import struct
import tempfile

print("\nActivating virtual environment...")
print("Please run: source .venv/bin/activate")
subprocess.run(["source", ".venv/bin/activate"], shell=True)

try:
    import requests
except ImportError:
    print("\nError: Missing requests module")
    print("Please run: source .venv/bin/activate")
    print("If that doesn't work, try: pip install requests\n")
    sys.exit(1)
    
from typing import Optional

# Define paths
MPY_DIR = os.path.abspath("../lvgl_micropython")
MCT_DIR = os.path.abspath("../MCT")
mct_path = MCT_DIR

# Update firmware paths for ESP32
FIRMWARE_FILENAME = "lvgl_micropy_ESP32_GENERIC.bin"  # Changed from ESP32-S3 version
firmware_source = os.path.join(LVGL_MICROPYTHON_DIR, "build", FIRMWARE_FILENAME)
firmware_dest = FIRMWARE_FILENAME

# Argument parsing
def parse_arguments():
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(description='Create and flash MCT filesystem image')
    parser.add_argument('--flash', action='store_true', help='Flash the device after creating the image')
    return parser.parse_args()

# Serial port functions
def find_esp32_port():
    """Find the ESP32 serial port."""
    if sys.platform.startswith('win'):
        ports = ['COM%s' % (i + 1) for i in range(256)]
    elif sys.platform.startswith('linux') or sys.platform.startswith('cygwin'):
        # Added ttyUSB for ESP32
        ports = glob.glob('/dev/ttyUSB[0-9]*') + glob.glob('/dev/ttyACM[0-9]*')
    elif sys.platform.startswith('darwin'):
        ports = glob.glob('/dev/tty.SLAB*') + glob.glob('/dev/tty.usbserial*') + glob.glob('/dev/tty.wchusbserial*')
    else:
        raise EnvironmentError('Unsupported platform')

    for port in ports:
        try:
            s = serial.Serial(port)
            s.close()
            return port
        except (OSError, serial.SerialException):
            continue
    
    return None

[... rest of the original file content remains unchanged ...]


