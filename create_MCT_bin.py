import os
import subprocess
import shutil
import json
import hashlib
import math
from tempfile import mkdtemp
from datetime import datetime
import glob
import sys
import time
import serial

# Define the paths
mct_directory = "../MCT"
output_image = "mct.bin"
output_size = 2 * 1024 * 1024  # Set the size of the image to 2MB
manifest_file = "manifest.json"
micropython_firmware_source = "../lvgl_micropython/build/lvgl_micropy_ESP32_GENERIC_S3-SPIRAM_OCT-16.bin"
micropython_firmware_dest = "lvgl_micropy_ESP32`_GENERIC_S3-SPIRAM_OCT-16.bin"

# Path to fatfsgen.py (now in fatfs directory)
fatfsgen_script = "fatfs/fatfsgen.py"

def calculate_md5(filename):
    hash_md5 = hashlib.md5()
    with open(filename, "rb") as f:
        for chunk in iter(lambda: f.read(4096), b""):
            hash_md5.update(chunk)
    return hash_md5.hexdigest()

def parse_partition_table(firmware_file):
    try:
        result = subprocess.run(
            ["esptool.py", "image_info", firmware_file],
            capture_output=True,
            text=True,
            check=True
        )
        lines = result.stdout.splitlines()
        for i, line in enumerate(lines):
            if "Partition Table:" in line:
                for j in range(i+1, len(lines)):
                    if "vfs" in lines[j].lower():
                        parts = lines[j].split()
                        for k, part in enumerate(parts):
                            if part.lower() == "vfs":
                                # The offset should be the first item in the line
                                return int(parts[0], 16)
        print("Warning: 'vfs' partition not found in the partition table.")
        return None
    except subprocess.CalledProcessError as e:
        print(f"Error parsing partition table: {e}")
        print(f"esptool.py output: {e.stdout}")
        print(f"esptool.py error: {e.stderr}")
        return None

def get_next_aligned_address(address, alignment=0x1000):
    return math.ceil(address / alignment) * alignment

# Copy the MicroPython firmware to the current working directory
shutil.copy2(micropython_firmware_source, micropython_firmware_dest)

# Verify the integrity of the copied file
source_md5 = calculate_md5(micropython_firmware_source)
dest_md5 = calculate_md5(micropython_firmware_dest)

if source_md5 != dest_md5:
    print("Error: MicroPython firmware file corrupted during copy.")
    print(f"Source MD5: {source_md5}")
    print(f"Destination MD5: {dest_md5}")
    exit(1)

print("MicroPython firmware copied successfully and verified.")

# Parse the partition table to get the VFS offset
micropython_size = os.path.getsize(micropython_firmware_dest)
vfs_offset = get_next_aligned_address(micropython_size)

print(f"MicroPython firmware size: 0x{micropython_size:x}")
print(f"Calculated VFS offset: 0x{vfs_offset:x}")

# Create a temporary directory to hold filtered files
temp_directory = mkdtemp()

def copy_filtered_files(src_dir, dest_dir):
    for root, dirs, files in os.walk(src_dir):
        # Filter out dotfiles and directories
        dirs[:] = [d for d in dirs if not d.startswith('.')]
        files = [f for f in files if not f.startswith('.') and '__' not in f]

        # Create corresponding directories in the temp directory
        for dir_name in dirs:
            os.makedirs(os.path.join(dest_dir, os.path.relpath(os.path.join(root, dir_name), src_dir)), exist_ok=True)

        # Copy filtered files to the temp directory
        for file_name in files:
            src_file = os.path.join(root, file_name)
            dest_file = os.path.join(dest_dir, os.path.relpath(src_file, src_dir))
            shutil.copy2(src_file, dest_file)

# Copy the filtered files to the temporary directory
copy_filtered_files(mct_directory, temp_directory)

# Create the FAT filesystem image using the fatfsgen.py script
command = [
    "python",
    fatfsgen_script,
    temp_directory,
    "--output_file", output_image,
    "--partition_size", str(output_size),
    "--long_name_support"
]

# Execute the command
try:
    print(f"Executing command: {' '.join(command)}")
    result = subprocess.run(command, check=True, capture_output=True, text=True)
    print("FAT filesystem image created successfully.")
    print(result.stdout)
except subprocess.CalledProcessError as e:
    print("Failed to create FAT filesystem image.")
    print(f"Command: {' '.join(command)}")
    print(f"Return code: {e.returncode}")
    print(f"stdout: {e.stdout}")
    print(f"stderr: {e.stderr}")
    exit(1)
except FileNotFoundError:
    print(f"Error: The script '{fatfsgen_script}' was not found.")
    print("Please make sure the fatfsgen.py script is in the fatfs directory and try again.")
    exit(1)
finally:
    # Clean up the temporary directory
    shutil.rmtree(temp_directory)

# Update manifest
current_datetime = datetime.now().strftime("%Y%m%d_%H%M")

# Create the new version string
new_version = f"0.2.{current_datetime}"

# Prepare the new manifest content
new_manifest = {
    "name": "AVS MCT",
    "version": new_version,
    "builds": [
        {
            "chipFamily": "ESP32-S3",
            "parts": [
                {
                    "path": micropython_firmware_dest,
                    "offset": "0x0"
                },
                {
                    "path": output_image,
                    "offset": f"0x{vfs_offset:x}"
                }
            ]
        }
    ]
}

# Write the updated manifest to a temporary file
temp_manifest_file = "temp_manifest.json"
with open(temp_manifest_file, 'w') as f:
    json.dump(new_manifest, f, indent=2)

# Flashing process
print("Attempting to flash the ESP32-S3...")

def find_esp32_port(pattern='/dev/tty.usbmodem*', attempts=10, delay=1):
    for attempt in range(attempts):
        potential_ports = glob.glob(pattern)
        print(f"Attempt {attempt + 1}: Potential ports found: {potential_ports}")
        
        for port in potential_ports:
            try:
                with serial.Serial(port, 115200, timeout=1) as ser:
                    ser.close()
                print(f"Successfully opened and closed port: {port}")
                return port
            except serial.SerialException as e:
                print(f"Failed to open port {port}: {str(e)}")
        
        if attempt < attempts - 1:
            print(f"No valid ports found. Waiting {delay} seconds before next attempt...")
            time.sleep(delay)
    
    print(f"No valid ports found after {attempts} attempts.")
    return None

esp32_port = find_esp32_port()
if esp32_port is None:
    print("Error: No ESP32-S3 device found. Please check the connection.")
    exit(1)

print(f"Using ESP32-S3 port: {esp32_port}")

# Erase flash
erase_command = [
    "esptool.py",
    "--chip", "esp32s3",
    "--port", esp32_port,
    "--baud", "921600",
    "erase_flash"
]

print("Erasing flash...")
print(f"Erase command: {' '.join(erase_command)}")
try:
    result = subprocess.run(erase_command, check=True, capture_output=True, text=True, timeout=60)
    print("Flash erased successfully.")
    print("Erase output:", result.stdout)
except subprocess.CalledProcessError as e:
    print("Failed to erase flash.")
    print("Error output:", e.stderr)
    exit(1)
except subprocess.TimeoutExpired:
    print("Erase operation timed out. Please check the connection and try again.")
    exit(1)

# Wait a moment after erasing
time.sleep(2)

# Flash firmware and MCT image
flash_command = [
    "esptool.py",
    "--chip", "esp32s3",
    "--port", esp32_port,
    "--baud", "921600",
    "write_flash",
    "-z",
    "0x0", micropython_firmware_dest,
    f"0x{vfs_offset:x}", output_image
]

print("Flashing firmware and MCT image...")
print(f"Flash command: {' '.join(flash_command)}")
try:
    result = subprocess.run(flash_command, check=True, capture_output=True, text=True, timeout=300)
    print("Flashing completed successfully.")
    print("Flash output:", result.stdout)
except subprocess.CalledProcessError as e:
    print("Failed to flash the device.")
    print("Error output:", e.stderr)
    exit(1)
except subprocess.TimeoutExpired:
    print("Flash operation timed out. Please check the connection and try again.")
    exit(1)

print("ESP32-S3 flashing process completed.")

# If flashing is successful, proceed with Git operations
try:
    # Move the temporary manifest file to the final location
    shutil.move(temp_manifest_file, manifest_file)
    
    subprocess.run(["git", "add", manifest_file, output_image, micropython_firmware_dest], check=True)
    subprocess.run(["git", "commit", "-m", f"Update manifest and files with new version {new_version}"], check=True)
    subprocess.run(["git", "push", "origin", "main"], check=True)
    print(f"New MCT image created, manifest updated with version {new_version}, changes committed and pushed to Git.")
except subprocess.CalledProcessError as e:
    print("Failed to perform Git operations.")
    print(e.output)

print("Flashing completed. Please manually reset the device if necessary.")
