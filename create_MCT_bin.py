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
    --flash     Erase and flash the ESP32-S3 device after creating the image

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
import requests

def print_step(step_number, description):
    print(f"\n{'='*80}")
    print(f"Step {step_number}: {description}")
    print(f"{'='*80}\n")

def run_command(command, cwd=None):
    try:
        result = subprocess.run(command, check=True, cwd=cwd, capture_output=True, text=True)
        print(result.stdout)
        return result.stdout
    except subprocess.CalledProcessError as e:
        print(f"Command failed: {' '.join(command)}")
        print(f"Error: {e.stderr}")
        return None

def create_tinyurl(url):
    try:
        response = requests.get(f"http://tinyurl.com/api-create.php?url={url}")
        if response.status_code == 200:
            return response.text.strip()
        else:
            print(f"Failed to create TinyURL. Status code: {response.status_code}")
            return url
    except Exception as e:
        print(f"Error creating TinyURL: {str(e)}")
        return url

def update_version_file(repo_path, version):
    version_path = os.path.join(repo_path, "version.py")
    if os.path.exists(version_path):
        # Get the current commit hash
        commit_hash = run_command(["git", "rev-parse", "HEAD"], cwd=repo_path).strip()
        
        # Construct the URL
        commit_url = f"https://github.com/AdvancedVapeSupply/MCT/commit/{commit_hash}"
        
        # Create TinyURL
        tiny_url = create_tinyurl(commit_url)
        
        with open(version_path, 'w') as f:
            f.write(f'__version__ = "{version}"\n')
            f.write(f'__commit_url__ = "{tiny_url}"\n')
        print(f"Updated {version_path} with version {version} and TinyURL")
        return True
    return False

def update_manifest(directory, version):
    manifest_path = os.path.join(directory, "manifest.json")
    if os.path.exists(manifest_path):
        with open(manifest_path, 'r') as f:
            manifest = json.load(f)
        
        manifest['version'] = version
        
        with open(manifest_path, 'w') as f:
            json.dump(manifest, f, indent=2)
        print(f"Updated {manifest_path} with version {version}")
        return True
    else:
        print(f"Manifest file not found in {directory}")
        return False

def commit_and_push(repo_path, version, add_new_files=False):
    print(f"\nCommitting changes in {repo_path}")
    
    # Ensure we're on the main branch
    ensure_on_main_branch(repo_path)
    
    # Always stage changes
    print("Staging changes...")
    if add_new_files:
        stage_command = ["git", "add", "-A"]
    else:
        stage_command = ["git", "add", "-u"]
    
    stage_result = run_command(stage_command, cwd=repo_path)
    if stage_result is None:
        print("Failed to stage changes")
        return False
    
    # Check if there are changes to commit
    status = run_command(["git", "status", "--porcelain"], cwd=repo_path)
    if status is None:
        print("Failed to get Git status")
        return False
    
    if status.strip():
        try:
            print("Committing changes...")
            commit_message = f"v{version}"
            commit_result = run_command(["git", "commit", "-m", commit_message], cwd=repo_path)
            if commit_result is None:
                print(f"Failed to commit changes in {repo_path}")
                return False
            
            print("Pushing changes...")
            push_result = run_command(["git", "push", "origin", "main"], cwd=repo_path)
            if push_result is None:
                print(f"Failed to push changes to remote repository")
                return False
            
            print(f"Successfully committed and pushed changes in {repo_path}")
            return True
        except Exception as e:
            print(f"Error during Git operations: {str(e)}")
            return False
    else:
        print(f"No changes detected in {repo_path}")
        return True

def run_command(command, cwd=None, timeout=300):
    try:
        print(f"Running command: {' '.join(command)}")
        result = subprocess.run(command, check=True, cwd=cwd, capture_output=True, text=True, timeout=timeout)
        print(result.stdout)
        return result.stdout
    except subprocess.CalledProcessError as e:
        print(f"Command failed: {' '.join(command)}")
        print(f"Error: {e.stderr}")
        return None
    except subprocess.TimeoutExpired:
        print(f"Command timed out after {timeout} seconds: {' '.join(command)}")
        return None

# Define the paths
mct_repo_url = "https://github.com/AdvancedVapeSupply/MCT"
mct_commit_id = "main"  # Replace with the specific commit ID or tag when ready
output_image = "mct.bin"
output_size = 4 * 1024 * 1024  # Set the size of the image to 4MB
manifest_file = "manifest.json"
micropython_firmware_source = "../lvgl_micropython/build/lvgl_micropy_ESP32_GENERIC_S3-SPIRAM_OCT-16.bin"
micropython_firmware_dest = "lvgl_micropy_ESP32_GENERIC_S3-SPIRAM_OCT-16.bin"

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

def get_directory_size(path):
    total_size = 0
    for dirpath, dirnames, filenames in os.walk(path):
        # Remove unwanted directories
        dirnames[:] = [d for d in dirnames if not d.startswith('.') and '__' not in d]
        for f in filenames:
            if not f.startswith('.') and '__' not in f:
                fp = os.path.join(dirpath, f)
                total_size += os.path.getsize(fp)
    return total_size

def clean_directory(temp_directory, mct_repo_path):
    print(f"Copying files from {mct_repo_path} to {temp_directory}")
    shutil.copytree(mct_repo_path, temp_directory, dirs_exist_ok=True)
    
    for root, dirs, files in os.walk(temp_directory, topdown=False):
        # Remove unwanted directories
        for d in dirs:
            if d.startswith('.') or d in ['__pycache__', '.vscode', '.idea', '.git']:
                dir_path = os.path.join(root, d)
                print(f"Removing directory: {dir_path}")
                shutil.rmtree(dir_path, ignore_errors=True)
        
        # Remove unwanted files
        for file in files:
            if (file.startswith('.') or 
                file.endswith('.pyc') or 
                file in ['pymakr.conf', 'MCT.code-workspace', 'make_fonts.sh', 'README.md']):
                file_path = os.path.join(root, file)
                print(f"Removing file: {file_path}")
                os.remove(file_path)

    # Remove empty directories
    for root, dirs, files in os.walk(temp_directory, topdown=False):
        for d in dirs:
            dir_path = os.path.join(root, d)
            if not os.listdir(dir_path):
                print(f"Removing empty directory: {dir_path}")
                os.rmdir(dir_path)

def print_directory_structure(startpath):
    for root, dirs, files in os.walk(startpath):
        level = root.replace(startpath, '').count(os.sep)
        indent = ' ' * 4 * (level)
        print(f'{indent}{os.path.basename(root)}/')
        subindent = ' ' * 4 * (level + 1)
        for f in files:
            print(f'{subindent}{f}')

def print_directory_with_sizes(startpath):
    for root, dirs, files in os.walk(startpath):
        level = root.replace(startpath, '').count(os.sep)
        indent = ' ' * 4 * (level)
        print(f'{indent}{os.path.basename(root)}/')
        subindent = ' ' * 4 * (level + 1)
        for f in files:
            file_path = os.path.join(root, f)
            file_size = os.path.getsize(file_path)
            print(f'{subindent}{f} ({file_size} bytes)')

def print_directory_with_details(startpath):
    for root, dirs, files in os.walk(startpath):
        level = root.replace(startpath, '').count(os.sep)
        indent = ' ' * 4 * (level)
        print(f'{indent}{os.path.basename(root)}/')
        subindent = ' ' * 4 * (level + 1)
        for f in files:
            file_path = os.path.join(root, f)
            file_size = os.path.getsize(file_path)
            print(f'{subindent}{f} ({file_size} bytes)')

def ensure_on_main_branch(repo_path):
    print(f"\nEnsuring we're on the main branch in {repo_path}")
    
    # Check current branch
    current_branch = run_command(["git", "rev-parse", "--abbrev-ref", "HEAD"], cwd=repo_path)
    if current_branch is None:
        print("Failed to get current branch")
        sys.exit(1)
    
    if current_branch == "HEAD":
        print("Currently in detached HEAD state. Attempting to switch to main branch.")
        if run_command(["git", "checkout", "main"], cwd=repo_path) is None:
            print("Failed to switch to main branch")
            sys.exit(1)
    elif current_branch != "main":
        print(f"Currently on branch {current_branch}. Switching to main branch.")
        if run_command(["git", "checkout", "main"], cwd=repo_path) is None:
            print("Failed to switch to main branch")
            sys.exit(1)
    
    # Ensure we're up to date with origin/main
    if run_command(["git", "pull", "origin", "main"], cwd=repo_path) is None:
        print("Failed to pull latest changes from origin/main")
        sys.exit(1)
    
    print("Successfully ensured we're on the up-to-date main branch")

def validate_version_file(repo_path):
    version_file = os.path.join(repo_path, "version.py")
    
    if not os.path.exists(version_file):
        print(f"Error: version.py not found in {repo_path}")
        return False
    
    with open(version_file, 'r') as f:
        content = f.read()
    
    if '__version__' not in content or '__commit_url__' not in content:
        print(f"Error: version.py in {repo_path} is missing required variables")
        return False
    
    return True

def validate_manifest_file(current_dir):
    manifest_file = os.path.join(current_dir, "manifest.json")
    
    if not os.path.exists(manifest_file):
        print(f"Error: manifest.json not found in {current_dir}")
        return False
    
    return True

def read_fat_image(image_path):
    with open(image_path, 'rb') as f:
        # Read the boot sector
        boot_sector = f.read(512)
        
        # Extract some basic information
        bytes_per_sector = struct.unpack('<H', boot_sector[11:13])[0]
        sectors_per_cluster = struct.unpack('<B', boot_sector[13:14])[0]
        reserved_sectors = struct.unpack('<H', boot_sector[14:16])[0]
        number_of_fats = struct.unpack('<B', boot_sector[16:17])[0]
        root_entries = struct.unpack('<H', boot_sector[17:19])[0]
        total_sectors = struct.unpack('<H', boot_sector[19:21])[0]
        if total_sectors == 0:
            total_sectors = struct.unpack('<I', boot_sector[32:36])[0]
        fat_size = struct.unpack('<H', boot_sector[22:24])[0]
        
        print(f"Bytes per sector: {bytes_per_sector}")
        print(f"Sectors per cluster: {sectors_per_cluster}")
        print(f"Reserved sectors: {reserved_sectors}")
        print(f"Number of FATs: {number_of_fats}")
        print(f"Root entries: {root_entries}")
        print(f"Total sectors: {total_sectors}")
        print(f"FAT size (sectors): {fat_size}")
        
        # Read the root directory
        root_dir_sectors = ((root_entries * 32) + (bytes_per_sector - 1)) // bytes_per_sector
        root_dir_offset = (reserved_sectors + number_of_fats * fat_size) * bytes_per_sector
        f.seek(root_dir_offset)
        
        print("\nRoot directory structure:")
        for i in range(root_entries):
            entry = f.read(32)
            if entry[0] == 0:  # End of directory
                break
            if entry[0] != 0xE5:  # Not a deleted entry
                if entry[11] == 0x0F:  # Long filename entry
                    continue  # Skip long filename entries for now
                filename = decode_short_filename(entry[:8])
                extension = decode_short_filename(entry[8:11])
                attributes = entry[11]
                if filename:
                    if extension:
                        print(f"  {filename}.{extension}", end='')
                    else:
                        print(f"  {filename}", end='')
                    if attributes & 0x10:  # Directory
                        print("/ (Directory)")
                    else:
                        print()

def decode_short_filename(name_bytes):
    return ''.join(chr(b) if b != 0xFF else '_' for b in name_bytes).strip()

def get_mct_version(repo_path):
    try:
        with open(os.path.join(repo_path, "version.py"), 'r') as f:
            content = f.read()
        exec(content, globals())
        return globals()['__version__']
    except Exception as e:
        print(f"Error reading MCT version: {str(e)}")
        return None

# Near the top of the file, after imports
def get_mct_base_version(repo_path):
    try:
        with open(os.path.join(repo_path, "version.py"), 'r') as f:
            content = f.read()
        exec(content, globals())
        return globals()['__version__'].split('.')[0:2]  # Get only major.minor
    except Exception as e:
        print(f"Error reading MCT version: {str(e)}")
        return None

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

# Define the total flash size (16MB)
TOTAL_FLASH_SIZE = 16 * 1024 * 1024  # 16MB

# Calculate the MCT partition size
MCT_PARTITION_SIZE = TOTAL_FLASH_SIZE - vfs_offset

# Set the output size to our calculated MCT partition size
output_size = MCT_PARTITION_SIZE

print(f"MicroPython firmware size: 0x{micropython_size:x}")
print(f"Calculated VFS offset: 0x{vfs_offset:x}")
print(f"MCT partition size: 0x{output_size:x}")

# Ensure the output size is a multiple of the sector size
SECTOR_SIZE = 4096
output_size = (output_size // SECTOR_SIZE) * SECTOR_SIZE

print_step(1, "Update version files")
mct_path = "../MCT"
base_version = get_mct_base_version(mct_path)
if base_version is None:
    print("Failed to get MCT base version")
    sys.exit(1)

# Generate a new version number based on the current date and time
current_datetime = datetime.now()
logical_version = f"{'.'.join(base_version)}.{current_datetime.strftime('%Y%m%d_%H%M')}"

# Update version file in ../MCT
if update_version_file(mct_path, logical_version):
    print(f"Updated version file in {mct_path}")
else:
    print(f"Failed to update version file in {mct_path}")
    sys.exit(1)

# Update manifest file in the current directory
current_dir = "."
if update_manifest(current_dir, logical_version):
    print(f"Updated manifest file in {current_dir}")
else:
    print(f"Failed to update manifest file in {current_dir}")
    sys.exit(1)

print_step(2, "Commit and push MCT")
if commit_and_push("../MCT", logical_version, add_new_files=True):
    print("Successfully committed and pushed changes in MCT")
else:
    print("Failed to commit and push changes in MCT")
    sys.exit(1)

print_step(3, "Clone MCT repository")
if os.path.exists(mct_path):
    print(f"MCT repository already exists at {mct_path}")
    # Pull the latest changes
    if run_command(["git", "pull", "origin", "main"], cwd=mct_path) is None:
        print("Failed to pull latest changes from MCT repository")
        sys.exit(1)
else:
    # Clone the repository
    if run_command(["git", "clone", mct_repo_url, mct_path]) is None:
        print("Failed to clone MCT repository")
        sys.exit(1)

print_step(4, "Checkout specific commit or tag")
if run_command(["git", "checkout", mct_commit_id], cwd=mct_path) is None:
    print(f"Failed to checkout commit/tag: {mct_commit_id}")
    sys.exit(1)

print_step(5, "Validate version files")
mct_path = "../MCT"
current_dir = "."

if not validate_version_file(mct_path):
    print("Version file validation failed in MCT repository")
    sys.exit(1)

if not validate_manifest_file(current_dir):
    print("Manifest file validation failed in current directory")
    sys.exit(1)

print("Version files validation successful")

print_step(6, "Create FAT filesystem image")

# Define temp_directory
temp_directory = tempfile.mkdtemp()
print(f"Created temporary directory: {temp_directory}")

# Explicitly call clean_directory with MCT repo path
clean_directory(temp_directory, mct_path)

# Print the directory structure after cleaning
print("Contents of temporary directory after cleaning:")
print_directory_with_details(temp_directory)

# Calculate the size of the MCT content after cleaning
mct_size = get_directory_size(temp_directory)
print(f"Size of MCT content after cleaning: {mct_size} bytes")

# Set a fixed partition size of 4MB
partition_size = 4 * 1024 * 1024  # 4MB in bytes
print(f"Fixed partition size: {partition_size} bytes")

# Create the FAT filesystem image
fatfs_image = os.path.join(os.path.dirname(output_image), "mct.bin")
fatfs_cmd = [
    "python", fatfsgen_script,
    temp_directory,
    "--output_file", fatfs_image,
    "--partition_size", str(partition_size),
    "--sector_size", "4096",
    "--long_name_support",
    "--use_default_datetime"
    # Removed the --fat_type option to let the script decide
]

print(f"Executing command: {' '.join(fatfs_cmd)}")
result = run_command(fatfs_cmd)

if result is not None:
    print("Successfully created FAT filesystem image.")
    
    print("\nVerifying the contents of the created image:")
    read_fat_image(fatfs_image)
    
    # Create and write the manifest file with the correct format
    manifest_data = {
        "name": "AVS MCT",
        "version": logical_version,
        "builds": [
            {
                "chipFamily": "ESP32-S3",
                "parts": [
                    {
                        "path": micropython_firmware_dest,
                        "offset": 0
                    },
                    {
                        "path": "mct.bin",
                        "offset": vfs_offset
                    }
                ]
            }
        ]
    }
    
    with open(manifest_file, 'w') as f:
        json.dump(manifest_data, f, indent=2)
    
    print(f"Created manifest file: {manifest_file}")

    # Add this new section
    print_step(7, "Commit and push changes in current working directory")
    cwd = os.getcwd()
    if commit_and_push(cwd, logical_version, add_new_files=False):
        print("Successfully committed and pushed changes in current directory")
    else:
        print("Failed to commit and push changes in current directory")
        sys.exit(1)
else:
    print("Failed to create FAT filesystem image.")
    sys.exit(1)

# Print the contents of the directory with file sizes after cleaning
print("Directory structure with file sizes after cleaning:")
print_directory_with_sizes(temp_directory)

# Add this at the end of your script
shutil.rmtree(temp_directory)
print(f"Removed temporary directory: {temp_directory}")

# Add this near the top of the file, after imports
def parse_arguments():
    parser = argparse.ArgumentParser(description="Create and optionally flash MCT image")
    parser.add_argument("--flash", action="store_true", help="Erase and flash the ESP32-S3")
    return parser.parse_args()

# Replace the flashing process with this:
args = parse_arguments()

def find_esp32_port(attempts=10, delay=1):
    dfu_pattern = '/dev/cu.usbmodem*'
    normal_pattern = '/dev/tty.usbmodem*'
    
    for attempt in range(attempts):
        dfu_ports = glob.glob(dfu_pattern)
        normal_ports = glob.glob(normal_pattern)
        
        if dfu_ports:
            print(f"Found ESP32-S3 in DFU mode: {dfu_ports[0]}")
            return dfu_ports[0], True
        elif normal_ports:
            print(f"Found ESP32-S3 in normal mode: {normal_ports[0]}")
            return normal_ports[0], False
        
        if attempt < attempts - 1:
            print(f"No ESP32-S3 device found. Waiting {delay} seconds before next attempt...")
            time.sleep(delay)
    
    print(f"No ESP32-S3 device found after {attempts} attempts.")
    return None, False

if args.flash:
    print("Attempting to flash the ESP32-S3...")

    esp32_port, is_dfu = find_esp32_port()
    if esp32_port is None:
        print("Error: No ESP32-S3 device found. Please check the connection.")
        sys.exit(1)

    if not is_dfu:
        print("Error: ESP32-S3 is not in DFU mode. Please follow these steps:")
        print("1. Unplug the USB cable")
        print("2. Hold down the BOOT button")
        print("3. Plug in the USB cable while holding the BOOT button")
        print("4. Release the BOOT button")
        print("5. Run this script again with the --flash option")
        sys.exit(1)

    print(f"Using ESP32-S3 port in DFU mode: {esp32_port}")

    # Erase flash
    erase_command = [
        "esptool.py",
        "--chip", "esp32s3",
        "--port", esp32_port,
        "--baud", "115200",
        "erase_flash"
    ]

    print("Erasing flash...")
    result = run_command(erase_command)
    if result is None:
        print("Failed to erase flash. Aborting.")
        sys.exit(1)

    # Wait a moment after erasing
    time.sleep(2)

    # Flash firmware and MCT image
    flash_command = [
        "esptool.py",
        "--chip", "esp32s3",
        "--port", esp32_port,
        "--baud", "115200",
        "write_flash",
        "-z",
        "0x0", micropython_firmware_dest,
        f"0x{vfs_offset:x}", fatfs_image
    ]

    print("Flashing firmware and MCT image...")
    result = run_command(flash_command)
    if result is None:
        print("Failed to flash the device. Aborting.")
        sys.exit(1)

    print("ESP32-S3 flashing process completed.")
else:
    print("Skipping flash process. Use --flash to erase and flash the ESP32-S3.")

# Add this new section at the very end of the script
print_step("Final", "Version Information")
print(f"MCT Version: {logical_version}")
print(f"Manifest file: {manifest_file}")
try:
    with open(manifest_file, 'r') as f:
        manifest_content = json.load(f)
    print(f"Manifest version: {manifest_content.get('version', 'Not found')}")
except Exception as e:
    print(f"Error reading manifest file: {str(e)}")

print("Script execution completed.")