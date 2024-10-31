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
from typing import Optional

# Define paths
MPY_DIR = os.path.abspath("../lvgl_micropython")
MCT_DIR = os.path.abspath("../MCT")
mct_path = MCT_DIR  # This is what was missing

# Argument parsing
def parse_arguments():
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(description='Create and flash MCT filesystem image')
    parser.add_argument('--flash', action='store_true', help='Flash the device after creating the image')
    return parser.parse_args()

# Serial port functions
def find_esp32_port():
    """Find the ESP32-S3 serial port."""
    if sys.platform.startswith('win'):
        ports = ['COM%s' % (i + 1) for i in range(256)]
    elif sys.platform.startswith('linux') or sys.platform.startswith('cygwin'):
        ports = glob.glob('/dev/ttyACM[0-9]*')
    elif sys.platform.startswith('darwin'):
        ports = glob.glob('/dev/tty.usbmodem*')
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

# Filesystem functions
def create_littlefs_image(image_path, source_dir, partition_size):
    """Create a LittleFS image from the source directory."""
    # Get absolute path to mklittlefs binary
    mklittlefs_path = os.path.abspath("./mklittlefs/mklittlefs")
    if not os.path.exists(mklittlefs_path):
        print(f"\nError: mklittlefs binary not found at {mklittlefs_path}!")
        print("Please ensure you've built mklittlefs in the ./mklittlefs directory")
        return False
        
    print(f"\nCreating LittleFS image: {image_path}")
    print(f"Partition size: {partition_size:,} bytes")
    print(f"Source directory: {source_dir}")
    
    # Check if source directory contents will fit
    total_size = get_directory_size(source_dir)
    if total_size > partition_size:
        print(f"Error: Source directory ({total_size:,} bytes) is larger than partition size ({partition_size:,} bytes)")
        return False
    
    print(f"Source directory size: {total_size:,} bytes")
    print(f"Available space: {partition_size - total_size:,} bytes")
    
    # Use parameters from Makefile
    mklfs_cmd = [
        mklittlefs_path,     # Use full path to binary
        "-c", source_dir,    # source directory
        "-p", "256",         # page size (from Makefile)
        "-b", "4096",        # block size (from Makefile)
        "-s", str(partition_size), # filesystem size from partition table
        image_path           # output file
    ]
    
    print(f"\nCreating image with command: {' '.join(mklfs_cmd)}")
    result = run_command(mklfs_cmd)
    if result is None:
        print("Failed to create LittleFS image")
        return False
    
    # Verify the image was created and size is correct
    if not os.path.exists(image_path):
        print(f"Error: {image_path} was not created")
        return False
    
    created_size = os.path.getsize(image_path)
    if created_size != partition_size:
        print(f"Warning: Created image size ({created_size:,} bytes) doesn't match partition size ({partition_size:,} bytes)")
        return False
    
    print(f"Created LittleFS image: {image_path}")
    print(f"Size: {created_size:,} bytes")
    return True

def create_fat_image(image_path, source_dir, size_mb=2):
    """Create a FAT filesystem image as a fallback."""
    print(f"\nCreating FAT image: {image_path}")
    print(f"Size: {size_mb}MB")
    print(f"Source directory: {source_dir}")
    
    # Calculate size in bytes
    size_bytes = size_mb * 1024 * 1024
    
    # Use fatfsgen.py script
    fatfsgen_path = os.path.abspath("./fatfs/fatfsgen.py")
    if not os.path.exists(fatfsgen_path):
        print(f"Error: fatfsgen.py not found at {fatfsgen_path}")
        return False
    
    fatfs_cmd = [
        "python3",
        fatfsgen_path,
        "--sector-size", "4096",
        "--partition-size", str(size_bytes),
        "--output", image_path,
        source_dir
    ]
    
    print(f"\nCreating image with command: {' '.join(fatfs_cmd)}")
    result = run_command(fatfs_cmd)
    if result is None:
        print("Failed to create FAT image")
        return False
    
    return True

def create_filesystem_image(image_path, source_dir, size_mb=2):
    """Try to create filesystem image, falling back to FAT if LittleFS fails."""
    # Try LittleFS first
    if create_littlefs_image(image_path, source_dir, size_mb):
        return True
        
    print("\nLittleFS creation failed, falling back to FAT filesystem...")
    # Fall back to FAT
    return create_fat_image(image_path, source_dir, size_mb)

# Git functions
def ensure_on_main_branch(repo_path):
    """Ensure we're on the main branch and it's up to date."""
    try:
        # Check current branch
        current = run_command(["git", "branch", "--show-current"], cwd=repo_path)
        if current is None:
            print("Failed to get current branch")
            return False
            
        if current.strip() != "main":
            print(f"Switching to main branch from {current}")
            if run_command(["git", "checkout", "main"], cwd=repo_path) is None:
                print("Failed to switch to main branch")
                return False
                
        # Pull latest changes
        if run_command(["git", "pull", "origin", "main"], cwd=repo_path) is None:
            print("Failed to pull latest changes")
            return False
            
        return True
        
    except Exception as e:
        print(f"Error ensuring main branch: {str(e)}")
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

def read_manifest():
    """Read and parse the manifest.json file."""
    try:
        with open('manifest.json', 'r') as f:
            manifest = json.load(f)
            
        # Validate manifest structure
        if not manifest.get('builds') or not manifest['builds'][0].get('parts'):
            print("Error: Invalid manifest.json structure")
            return None
            
        print("\nManifest information:")
        print(f"Name: {manifest.get('name')}")
        print(f"Version: {manifest.get('version')}")
        
        # Print parts information
        print("\nFlash parts:")
        for part in manifest['builds'][0]['parts']:
            print(f"  {part['path']} at offset 0x{part['offset']:x}")
            
        return manifest
    except FileNotFoundError:
        print("Error: manifest.json not found")
        return None
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON in manifest.json: {e}")
        return None
    except Exception as e:
        print(f"Error reading manifest.json: {e}")
        return None

def calculate_md5(filename):
    """Calculate MD5 hash of a file."""
    hash_md5 = hashlib.md5()
    with open(filename, "rb") as f:
        for chunk in iter(lambda: f.read(4096), b""):
            hash_md5.update(chunk)
    return hash_md5.hexdigest()

def get_partition_info(firmware_path: str) -> Optional[tuple]:
    """Get the offset and size of the VFS partition from the partition table."""
    try:
        with open(firmware_path, 'rb') as f:
            f.seek(0x8000)  # Partition table offset
            partition_data = f.read(0x1000)  # Read 4KB partition table
            
            offset = 0
            while offset < 0x1000 - 32:  # 32 bytes per entry
                entry_data = partition_data[offset:offset + 32]
                if entry_data[0:2] != b'\xaa\x50':  # Check magic number
                    break
                    
                # Parse entry fields
                type_val = entry_data[2]
                subtype = entry_data[3]
                part_offset = int.from_bytes(entry_data[4:8], 'little')
                part_size = int.from_bytes(entry_data[8:12], 'little')
                name = entry_data[12:28].split(b'\x00')[0].decode('ascii')
                
                # Check if this is the VFS partition
                if name == "vfs":
                    print(f"Found VFS partition:")
                    print(f"  Offset: 0x{part_offset:x}")
                    print(f"  Size: {part_size:,} bytes ({part_size / 1024 / 1024:.2f}MB)")
                    return (part_offset, part_size)
                    
                offset += 32
        
        return None
    except Exception as e:
        print(f"Error reading partition table: {e}")
        return None

# Define the firmware paths
LVGL_MICROPYTHON_DIR = "../lvgl_micropython"
FIRMWARE_FILENAME = "lvgl_micropy_ESP32_GENERIC_S3-SPIRAM_OCT-16.bin"
firmware_source = os.path.join(LVGL_MICROPYTHON_DIR, "build", FIRMWARE_FILENAME)
firmware_dest = FIRMWARE_FILENAME

def copy_firmware():
    """Copy and verify the firmware file."""
    print(f"\nCopying firmware:")
    print(f"From: {firmware_source}")
    print(f"To: {firmware_dest}")
    
    if not os.path.exists(firmware_source):
        print(f"Error: Source firmware not found at: {firmware_source}")
        print("Current directory:", os.getcwd())
        print("Directory contents:", os.listdir("../lvgl_micropython/build/"))
        sys.exit(1)
    
    try:
        # Keep existing file if it exists
        if os.path.exists(firmware_dest):
            print(f"Keeping existing firmware: {firmware_dest}")
            print(f"Size: {os.path.getsize(firmware_dest):,} bytes")
            return True
            
        # Copy if it doesn't exist
        shutil.copy2(firmware_source, firmware_dest)
        
        # Verify the copy
        if not os.path.exists(firmware_dest):
            print("Error: Firmware copy failed")
            sys.exit(1)
            
        source_size = os.path.getsize(firmware_source)
        dest_size = os.path.getsize(firmware_dest)
        
        print(f"Source size: {source_size:,} bytes")
        print(f"Copied size: {dest_size:,} bytes")
        
        if source_size != dest_size:
            print("Error: Firmware file sizes don't match")
            return False
            
        print("Firmware copied successfully")
        return True
        
    except Exception as e:
        print(f"Error copying firmware: {str(e)}")
        return False

def verify_firmware():
    """Verify the firmware file exists."""
    if not os.path.exists(firmware_path):
        print(f"Error: Firmware not found at: {firmware_path}")
        print(f"Please ensure firmware exists in: {os.path.dirname(firmware_path)}")
        print(f"Current directory: {os.getcwd()}")
        return False
    
    print(f"Found firmware: {firmware_path}")
    print(f"Size: {os.path.getsize(firmware_path):,} bytes")
    return True

# Verify firmware source exists
if not os.path.exists(micropython_firmware_source):
    print(f"Error: MicroPython firmware not found at: {micropython_firmware_source}")
    sys.exit(1)

# Copy the MicroPython firmware to the current working directory
print(f"Copying firmware from: {micropython_firmware_source}")
print(f"Copying firmware to: {micropython_firmware_dest}")
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
partition_info = get_partition_info(micropython_firmware_dest)
if partition_info is None:
    print("Failed to find VFS partition information")
    sys.exit(1)

vfs_offset, vfs_size = partition_info
print(f"Using VFS partition offset: 0x{vfs_offset:x}")
print(f"Using VFS partition size: {vfs_size:,} bytes")

# Define the total flash size (16MB)
TOTAL_FLASH_SIZE = 16 * 1024 * 1024  # 16MB

# Calculate the MCT partition size
MCT_PARTITION_SIZE = TOTAL_FLASH_SIZE - vfs_offset

# Set the output size to our calculated MCT partition size
output_size = MCT_PARTITION_SIZE

# Ensure the output size is a multiple of the sector size
SECTOR_SIZE = 4096
output_size = (output_size // SECTOR_SIZE) * SECTOR_SIZE

def run_command(command, cwd=None):
    """Run a command and return its output."""
    try:
        result = subprocess.run(
            command,
            cwd=cwd,
            check=True,
            capture_output=True,
            text=True
        )
        return result.stdout.strip()
    except subprocess.CalledProcessError as e:
        print(f"Command failed with error: {e}")
        print(f"Error output: {e.stderr}")
        return None
    except Exception as e:
        print(f"Error running command: {str(e)}")
        return None

def update_manifest(directory, version, vfs_offset):
    """Update manifest.json with new version information and build details."""
    manifest_path = os.path.join(directory, "manifest.json")
    
    try:
        # Create manifest data with the required structure
        manifest_data = {
            "name": "AVS MCT",
            "version": version,
            "builds": [
                {
                    "chipFamily": "ESP32-S3",
                    "parts": [
                        {
                            "path": "lvgl_micropy_ESP32_GENERIC_S3-SPIRAM_OCT-16.bin",
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
        
        # Write manifest file with proper formatting
        with open(manifest_path, 'w') as f:
            json.dump(manifest_data, f, indent=2)
            
        print(f"Updated manifest.json with version {version}")
        print(f"VFS offset: {vfs_offset} (0x{vfs_offset:x})")
        return True
        
    except Exception as e:
        print(f"Error updating manifest file: {str(e)}")
        return False

def get_mct_version(mct_path):
    """Get the version from MCT repository."""
    try:
        # First try to get version from version.py
        version_file = os.path.join(mct_path, "frozen", "version.py")
        if os.path.exists(version_file):
            # Create a temporary module namespace
            version_namespace = {}
            with open(version_file, 'r') as f:
                exec(f.read(), version_namespace)
            if 'AVSMCT_VERSION' in version_namespace:
                return version_namespace['AVSMCT_VERSION']

        # If version.py doesn't exist or doesn't contain version,
        # generate a timestamp-based version
        now = datetime.now()
        version = f"0.2.{now.strftime('%Y%m%d_%H%M')}"
        print(f"Generated new version: {version}")
        return version

    except Exception as e:
        print(f"Error getting MCT version: {str(e)}")
        print("Falling back to timestamp-based version")
        now = datetime.now()
        version = f"0.2.{now.strftime('%Y%m%d_%H%M')}"
        print(f"Generated new version: {version}")
        return version

# Add path validation
if not os.path.exists(MCT_DIR):
    print(f"Error: MCT directory not found at {MCT_DIR}")
    print("Please ensure the MCT repository is cloned at the correct location")
    sys.exit(1)

print(f"Using MCT directory: {MCT_DIR}")
def update_version_file(repo_path, version):
    """Update version.py in the MCT repository."""
    version_file = os.path.join(repo_path, "version.py")
    
    try:
        # Get the current commit hash
        commit_hash = run_command(["git", "rev-parse", "HEAD"], cwd=repo_path)
        if commit_hash is None:
            print("Failed to get current commit hash")
            return False
            
        commit_hash = commit_hash.strip()
        
        # Create the version file content
        content = f'''# MCT Version Information
__version__ = "{version}"
__commit_hash__ = "{commit_hash}"
__commit_url__ = "https://github.com/AdvancedVapeSupply/MCT/commit/{commit_hash}"
'''
        
        # Write the version file
        with open(version_file, 'w') as f:
            f.write(content)
            
        print(f"Updated version.py with version {version}")
        return True
        
    except Exception as e:
        print(f"Error updating version file: {str(e)}")
        return False
    
def validate_version_file(repo_path):
    """Validate version.py exists and has required content."""
    version_file = os.path.join(repo_path, "version.py")
    
    try:
        if not os.path.exists(version_file):
            print(f"Error: version.py not found in {repo_path}")
            return False
            
        # Read and validate file content
        with open(version_file, 'r') as f:
            content = f.read()
            
        # Check for required variables
        if '__version__' not in content:
            print("Error: __version__ not found in version.py")
            return False
            
        if '__commit_hash__' not in content:
            print("Error: __commit_hash__ not found in version.py")
            return False
            
        print(f"Version file validated: {version_file}")
        return True
        
    except Exception as e:
        print(f"Error validating version file: {str(e)}")
        return False

def validate_manifest_file(directory):
    """Validate manifest.json exists and has required structure."""
    manifest_path = os.path.join(directory, "manifest.json")
    
    try:
        if not os.path.exists(manifest_path):
            print(f"Error: manifest.json not found in {directory}")
            return False
            
        # Read and parse manifest
        with open(manifest_path, 'r') as f:
            manifest = json.load(f)
            
        # Validate required fields
        if 'name' not in manifest:
            print("Error: 'name' field missing from manifest.json")
            return False
            
        if 'version' not in manifest:
            print("Error: 'version' field missing from manifest.json")
            return False
            
        if 'builds' not in manifest or not isinstance(manifest['builds'], list):
            print("Error: 'builds' array missing from manifest.json")
            return False
            
        if not manifest['builds'] or 'parts' not in manifest['builds'][0]:
            print("Error: 'parts' missing from first build in manifest.json")
            return False
            
        print(f"Manifest file validated: {manifest_path}")
        return True
        
    except json.JSONDecodeError as e:
        print(f"Error parsing manifest.json: {e}")
        return False
    except Exception as e:
        print(f"Error validating manifest file: {str(e)}")
        return False

def clean_directory(temp_dir, source_dir):
    """Clean and prepare the temporary directory with MCT files."""
    try:
        # Clear any existing contents
        for item in os.listdir(temp_dir):
            item_path = os.path.join(temp_dir, item)
            if os.path.isfile(item_path):
                os.unlink(item_path)
            elif os.path.isdir(item_path):
                shutil.rmtree(item_path)
                
        # Copy MCT files to temp directory
        mct_source = os.path.join(source_dir, "frozen")
        if not os.path.exists(mct_source):
            print(f"Error: MCT source directory not found at {mct_source}")
            return False
            
        # Copy all files from frozen directory
        for item in os.listdir(mct_source):
            source_path = os.path.join(mct_source, item)
            dest_path = os.path.join(temp_dir, item)
            
            if os.path.isfile(source_path):
                shutil.copy2(source_path, dest_path)
            elif os.path.isdir(source_path):
                shutil.copytree(source_path, dest_path)
                
        print(f"Copied MCT files to temporary directory")
        
        # List contents of temp directory
        print("\nTemporary directory contents:")
        for item in os.listdir(temp_dir):
            item_path = os.path.join(temp_dir, item)
            if os.path.isfile(item_path):
                print(f"  File: {item} ({os.path.getsize(item_path):,} bytes)")
            elif os.path.isdir(item_path):
                print(f"  Directory: {item}")
                
        return True
        
    except Exception as e:
        print(f"Error cleaning directory: {str(e)}")
        return False


def get_directory_size(directory):
    """Calculate the total size of a directory and its contents."""
    total_size = 0
    try:
        # Walk through all files and subdirectories
        for dirpath, dirnames, filenames in os.walk(directory):
            # Add size of all files in current directory
            for filename in filenames:
                file_path = os.path.join(dirpath, filename)
                if not os.path.islink(file_path):  # Skip symbolic links
                    total_size += os.path.getsize(file_path)
                    
        return total_size
        
    except Exception as e:
        print(f"Error calculating directory size: {str(e)}")
        return 0



def print_step(step_number, step_description):
    """Print a formatted step header."""
    print(f"\nStep {step_number}: {step_description}")
    print("=" * (len(step_description) + 8))


print_step(1, "Update version files")
mct_version = get_mct_version(mct_path)
if mct_version is None:
    print("Failed to get MCT version")
    sys.exit(1)

print(f"Using MCT version: {mct_version}")

logical_version = mct_version  # Use MCT version instead of generating a new one

# Update version file in ../MCT
if update_version_file(mct_path, logical_version):
    print(f"Updated version file in {mct_path}")
else:
    print(f"Failed to update version file in {mct_path}")
    sys.exit(1)

# Update manifest file in the current directory
current_dir = "."
if update_manifest(current_dir, logical_version, vfs_offset):
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

print_step(6, "Create filesystem image")
fatfs_image = "mct.bin"

# Create temporary directory
temp_directory = tempfile.mkdtemp()
print(f"Created temporary directory: {temp_directory}")

try:
    # Clean the temporary directory
    clean_directory(temp_directory, mct_path)

    # Create the filesystem image
    if not create_littlefs_image(fatfs_image, temp_directory, vfs_size):
        print("Failed to create filesystem image")
        sys.exit(1)

    print(f"Successfully created filesystem image: {fatfs_image}")

    # Add this new section
    print_step(7, "Commit and push changes in current working directory")
    cwd = os.getcwd()
    if commit_and_push(cwd, logical_version, add_new_files=False):
        print("Successfully committed and pushed changes in current directory")
    else:
        print("Failed to commit and push changes in current directory")
        sys.exit(1)

    # Flash the device if requested (Step 8)
    args = parse_arguments()
    if args.flash:
        print_step(8, "Flash ESP32-S3")
        print("Attempting to flash the ESP32-S3...")

        # Read manifest.json
        manifest = read_manifest()
        if not manifest:
            print("Failed to read manifest.json")
            sys.exit(1)

        # Get flash parts from manifest
        flash_parts = manifest['builds'][0]['parts']
        
        esp32_port = find_esp32_port()
        if esp32_port is None:
            print("Error: No ESP32-S3 device found. Please check the connection.")
            sys.exit(1)

        print(f"Found ESP32-S3 port: {esp32_port}")
        
        # Verify all files exist before starting
        print("\nVerifying files from manifest:")
        for part in flash_parts:
            file_path = part['path']
            if not os.path.exists(file_path):
                print(f"Error: File not found: {file_path}")
                sys.exit(1)
            print(f"Found {file_path} ({os.path.getsize(file_path):,} bytes)")
            print(f"Flash offset: 0x{part['offset']:x}")

        # Erase flash with verbose output
        erase_command = [
            "esptool.py",
            "--chip", "esp32s3",
            "--port", esp32_port,
            "--baud", "115200",
            "--before", "default_reset",
            "--after", "hard_reset",
            "erase_flash"
        ]

        print("\nErasing flash with command:")
        print(" ".join(erase_command))
        result = run_command(erase_command)
        if result is None:
            print("Failed to erase flash. Aborting.")
            sys.exit(1)

        # Wait longer after erasing
        print("Waiting for device to stabilize after erase...")
        time.sleep(5)

        # Construct flash command using manifest information
        flash_command = [
            "esptool.py",
            "--chip", "esp32s3",
            "--port", esp32_port,
            "--baud", "115200",
            "--before", "default_reset",
            "--after", "hard_reset",
            "write_flash",  # Operation comes before the flash parameters
            "--flash_mode", "dio",
            "--flash_freq", "80m",
            "--flash-size", "16MB",
            "--verify",
            "-z"  # Compress data
        ]
        
        # Add each part from manifest to flash command
        for part in flash_parts:
            flash_command.extend([f"0x{part['offset']:x}", part['path']])

        print("\nFlashing files with command:")
        print(" ".join(flash_command))
        
        # Calculate and display MD5 hashes
        print("\nFile checksums:")
        for part in flash_parts:
            file_md5 = calculate_md5(part['path'])
            print(f"{part['path']}: {file_md5}")

        print("\nStarting flash process...")
        result = run_command(flash_command)
        if result is None:
            print("Failed to flash the device. Aborting.")
            sys.exit(1)

        print("\nWaiting for device to reset...")
        time.sleep(3)

        print("\nFlash completed successfully!")
        print("Please check the device for proper operation.")
        print("\nIf you still get filesystem errors, try these troubleshooting steps:")
        print("1. Use a shorter/better quality USB cable")
        print("2. Try a different USB port")
        print("3. Reduce the baud rate to 115200")
        print("4. Manually power cycle the device after flashing")

finally:
    # Clean up
    shutil.rmtree(temp_directory)
    print(f"Removed temporary directory: {temp_directory}")

print("Script execution completed.")

