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

def calculate_md5(filename):
    hash_md5 = hashlib.md5()
    with open(filename, "rb") as f:
        for chunk in iter(lambda: f.read(4096), b""):
            hash_md5.update(chunk)
    return hash_md5.hexdigest()

def parse_partition_table(firmware_file):
    try:
        print("\nAttempting to read partition table from firmware...")
        
        # Read the partition table from offset 0x8000
        with open(firmware_file, 'rb') as f:
            f.seek(0x8000)
            partition_data = f.read(0x1000)  # Read 4KB partition table
            
        # Print raw partition data in hex
        print("\nPartition Table Raw Data (first 64 bytes):")
        print(' '.join(f'{b:02x}' for b in partition_data[:64]))
        
        result = subprocess.run(
            ["esptool.py", "image_info", firmware_file],
            capture_output=True,
            text=True,
            check=True
        )
        print("\nFirmware Image Info:")
        print(result.stdout)
        
        # Try to parse partition entries
        print("\nAttempting to parse partition entries:")
        offset = 0
        while offset < len(partition_data):
            entry = partition_data[offset:offset + 32]  # Each partition entry is 32 bytes
            if all(b == 0xFF for b in entry):  # Check if entry is empty
                break
                
            name = entry[0:16].split(b'\x00')[0].decode('utf-8')
            type_val = int.from_bytes(entry[16:17], 'little')
            subtype = int.from_bytes(entry[17:18], 'little')
            offset_val = int.from_bytes(entry[18:22], 'little')
            size = int.from_bytes(entry[22:26], 'little')
            
            print(f"Partition: {name}")
            print(f"  Type: {type_val}")
            print(f"  Subtype: {subtype}")
            print(f"  Offset: 0x{offset_val:x}")
            print(f"  Size: 0x{size:x}")
            print()
            
            if name.lower() == "vfs":
                return offset_val
                
            offset += 32
            
        print("Warning: 'vfs' partition not found in the partition table.")
        return None
    except Exception as e:
        print(f"Error parsing partition table: {e}")
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
    validation_errors = []
    problem_files = {
        'length': [],
        'special_chars': [],
        'lowercase': []
    }
    
    def clean_filename(raw_name):
        """Clean the filename by removing null bytes and padding"""
        # Remove common FAT padding and special characters
        clean = raw_name.rstrip(b'\x00\xff\xe5\x05\x20'.decode('latin1'))
        return ''.join(char for char in clean if char.isprintable())
    
    with open(image_path, 'rb') as f:
        # Read the boot sector
        boot_sector = f.read(512)
        
        # Extract basic information
        bytes_per_sector = struct.unpack('<H', boot_sector[11:13])[0]
        sectors_per_cluster = struct.unpack('<B', boot_sector[13:14])[0]
        reserved_sectors = struct.unpack('<H', boot_sector[14:16])[0]
        number_of_fats = struct.unpack('<B', boot_sector[16:17])[0]
        root_entries = struct.unpack('<H', boot_sector[17:19])[0]
        total_sectors = struct.unpack('<H', boot_sector[19:21])[0]
        if total_sectors == 0:
            total_sectors = struct.unpack('<I', boot_sector[32:36])[0]
        fat_size = struct.unpack('<H', boot_sector[22:24])[0]
        
        print("\nFAT Filesystem Information:")
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
        print("Format: [Filename] (Length) <Attributes> {LFN Status}")
        
        # Keep track of long filename parts
        lfn_parts = []
        total_files = 0
        max_filename_length = 0
        has_lowercase = False
        has_special_chars = False
        
        for i in range(root_entries):
            entry = f.read(32)
            if entry[0] == 0:  # End of directory
                break
                
            if entry[0] == 0xE5:  # Deleted entry
                continue
                
            attributes = entry[11]
            if attributes == 0x0F:  # Long filename entry
                # Extract LFN part
                lfn_order = entry[0] & 0x3F
                lfn_part = entry[1:11].decode('utf-16le', errors='replace') + \
                          entry[14:26].decode('utf-16le', errors='replace') + \
                          entry[28:32].decode('utf-16le', errors='replace')
                lfn_parts.insert(0, lfn_part.rstrip('\x00'))
            else:
                # Regular entry
                short_name = decode_short_filename(entry[:8])
                short_ext = decode_short_filename(entry[8:11])
                
                # Check for lowercase flags
                case_flag = entry[12]
                name_is_lowercase = case_flag & 0x08
                ext_is_lowercase = case_flag & 0x10
                
                if name_is_lowercase or ext_is_lowercase:
                    has_lowercase = True
                
                # Construct filename
                if lfn_parts:
                    filename = ''.join(lfn_parts)
                    lfn_status = "Using LFN"
                else:
                    if short_ext:
                        filename = f"{short_name}.{short_ext}"
                    else:
                        filename = short_name
                    lfn_status = "Short name only"
                
                # Check for special characters
                if any(c in filename for c in ' -_@#$%^&()[]{}'):
                    has_special_chars = True
                
                # Update statistics
                total_files += 1
                max_filename_length = max(max_filename_length, len(filename))
                
                # Print entry details
                attr_str = []
                if attributes & 0x01: attr_str.append("RO")
                if attributes & 0x02: attr_str.append("HID")
                if attributes & 0x04: attr_str.append("SYS")
                if attributes & 0x08: attr_str.append("VOL")
                if attributes & 0x10: attr_str.append("DIR")
                if attributes & 0x20: attr_str.append("ARC")
                
                print(f"  [{filename}] ({len(filename)}) <{','.join(attr_str)}> {{{lfn_status}}}")
                
                # Clear LFN parts for next entry
                lfn_parts = []
        
        print("\nFilesystem Analysis:")
        print(f"Total files/directories: {total_files}")
        print(f"Maximum filename length: {max_filename_length}")
        print(f"Lowercase support: {'Yes' if has_lowercase else 'No'}")
        print(f"Special characters: {'Yes' if has_special_chars else 'No'}")
        
        # Convert warnings to errors
        if max_filename_length > 8:
            validation_errors.append("ERROR: Some filenames exceed 8.3 format length")
        if has_lowercase and not has_special_chars:
            validation_errors.append("ERROR: Lowercase characters detected but case preservation not enabled")
        if has_special_chars:
            validation_errors.append("ERROR: Special characters detected in filenames")
        

def decode_short_filename(name_bytes):
    # Decode the short filename, preserving case and handling special characters
    name = ''.join(chr(b) if 32 <= b <= 126 else '_' for b in name_bytes)
    return name.rstrip(' ')

def get_mct_version(repo_path):
    try:
        with open(os.path.join(repo_path, "version.py"), 'r') as f:
            content = f.read()
        exec(content, globals())
        return globals()['__version__']
    except Exception as e:
        print(f"Error reading MCT version: {str(e)}")
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

# Replace the current VFS offset calculation with:
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

def print_step(step_number, step_description):
    """Print a formatted step header."""
    print(f"\nStep {step_number}: {step_description}")
    print("=" * (len(step_description) + 8))

print_step(1, "Update version files")
# Get the version from MCT repository
mct_path = "../MCT"
mct_version = get_mct_version(mct_path)
if mct_version is None:
    print("Failed to get MCT version")
    sys.exit(1)

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
            "--flash_mode", "dio",
            "--flash_freq", "80m",
            "--flash_size", "16MB",
            "write_flash",
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
        return manifest
    except Exception as e:
        print(f"Error reading manifest.json: {e}")
        return None
