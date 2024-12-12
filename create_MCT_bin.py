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
    
def validate_submodules(repo_path):
    """Validate that submodules are properly initialized and committed."""
    print("\nValidating submodules...")
    
    try:
        # Check if .gitmodules exists
        gitmodules_path = os.path.join(repo_path, ".gitmodules")
        if not os.path.exists(gitmodules_path):
            print("No .gitmodules file found - repository may not have submodules")
            return True  # Success case - no submodules is okay
            
        result = subprocess.run(
            ["git", "submodule", "status"],
            cwd=repo_path,
            capture_output=True,
            text=True
        )
        
        # If no submodules are found, that's okay
        submodules = result.stdout.strip().split('\n')
        if not submodules or submodules[0] == '':
            print("No active submodules found!")
            return True  # Changed from False to True
            
        has_errors = False
        for submodule in submodules:
            if not submodule:
                continue
                
            # Parse submodule status line
            # Format: [+-U][commit-sha] [path] [(commit description)]
            status_char = submodule[0]
            parts = submodule[1:].strip().split(' ')
            path = parts[1] if len(parts) > 1 else "unknown"
            
            if status_char == '-':
                print(f"Error: Submodule {path} is not initialized")
                has_errors = True
            elif status_char == '+':
                print(f"Warning: Submodule {path} has uncommitted changes")
                has_errors = True
                
        if has_errors:
            print("\nPlease initialize and update submodules with:")
            print("git submodule update --init --recursive")
            return False
            
        print("All submodules are properly initialized")
        return True
        
    except Exception as e:
        print(f"Error checking submodules: {str(e)}")
        return False

def commit_and_push(repo_path, version, add_new_files=False):
    """Commit and push changes to the repository and its submodules."""
    print(f"\nCommitting changes in {repo_path}")
    
    try:
        # Check if .gitmodules exists before trying to initialize
        gitmodules_path = os.path.join(repo_path, ".gitmodules")
        has_submodules = os.path.exists(gitmodules_path)
        
        if has_submodules:
            print("\nInitializing and updating submodules...")
            try:
                subprocess.run(
                    ["git", "submodule", "init"],
                    cwd=repo_path,
                    check=True,
                    capture_output=True
                )
                subprocess.run(
                    ["git", "submodule", "update", "--init", "--recursive"],
                    cwd=repo_path,
                    check=True,
                    capture_output=True
                )
            except subprocess.CalledProcessError as e:
                print(f"Warning: Submodule initialization failed: {e}")
                print("Continuing with repository operations...")
        else:
            print("\nNo .gitmodules file found - skipping submodule initialization")
        
        # Always check these known directories
        submodule_dirs = ["lib/io", "lib/ui"]
        
        # First commit changes in each directory
        for subdir in submodule_dirs:
            subdir_path = os.path.join(repo_path, subdir)
            if os.path.exists(os.path.join(subdir_path, ".git")):
                print(f"\nHandling git repository: {subdir}")
                
                try:
                    # Ensure we're on main branch and up to date
                    subprocess.run(
                        ["git", "fetch", "origin"],
                        cwd=subdir_path,
                        check=True,
                        capture_output=True
                    )
                    
                    subprocess.run(
                        ["git", "checkout", "main"],
                        cwd=subdir_path,
                        check=True,
                        capture_output=True
                    )
                    
                    subprocess.run(
                        ["git", "pull", "origin", "main"],
                        cwd=subdir_path,
                        check=True,
                        capture_output=True
                    )
                    
                    # Stage all changes
                    subprocess.run(["git", "add", "-A"], cwd=subdir_path, check=True)
                    
                    # Check if there are staged changes
                    status = subprocess.run(
                        ["git", "status", "--porcelain"],
                        cwd=subdir_path,
                        capture_output=True,
                        text=True,
                        check=True
                    ).stdout.strip()
                    
                    if status:
                        print(f"Changes detected in {subdir}:")
                        print(status)
                        
                        # Commit and push changes
                        subprocess.run(
                            ["git", "commit", "-m", f"Update {subdir} to v{version}"],
                            cwd=subdir_path,
                            check=True
                        )
                        subprocess.run(["git", "push", "origin", "main"], cwd=subdir_path, check=True)
                        print(f"Committed and pushed changes in {subdir}")
                    else:
                        print(f"No changes to commit in {subdir}")
                except subprocess.CalledProcessError as e:
                    print(f"Warning: Git operations failed in {subdir}: {e}")
                    print("Continuing with next directory...")
            else:
                print(f"\nSkipping {subdir} - not a git repository")

        # Now handle main repository
        print("\nCommitting changes in main repository...")
        if add_new_files:
            subprocess.run(["git", "add", "-A"], cwd=repo_path, check=True)
        else:
            subprocess.run(["git", "add", "-u"], cwd=repo_path, check=True)
            
        # Add known directories explicitly
        for subdir in submodule_dirs:
            try:
                subprocess.run(["git", "add", subdir], cwd=repo_path, check=True)
            except subprocess.CalledProcessError:
                print(f"Warning: Could not add {subdir}")
        
        # Check if there are changes to commit
        status = subprocess.run(
            ["git", "status", "--porcelain"],
            cwd=repo_path,
            capture_output=True,
            text=True,
            check=True
        ).stdout.strip()
        
        if status:
            print("Changes detected in main repository:")
            print(status)
            
            # Commit and push
            subprocess.run(
                ["git", "commit", "-m", f"Update version files to v{version}"],
                cwd=repo_path,
                check=True
            )
            subprocess.run(["git", "push"], cwd=repo_path, check=True)
            print(f"Successfully committed and pushed changes in {repo_path}")
        else:
            print("No changes to commit in main repository")
            
        return True
        
    except subprocess.CalledProcessError as e:
        print(f"Git command failed: {e}")
        return False
    except Exception as e:
        print(f"Error during Git operations: {str(e)}")
        return False

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
            
            print("\nPartition Table:")
            print("=" * 80)
            print(f"{'Name':<16} {'Type':<8} {'SubType':<8} {'Offset':<12} {'Size':<12} {'Flags'}")
            print("-" * 80)
            
            offset = 0
            vfs_info = None
            
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
                flags = entry_data[28]
                
                # Print partition info
                print(f"{name:<16} {type_val:<8d} {subtype:<8d} 0x{part_offset:08x} {part_size:<12,d} 0x{flags:02x}")
                
                # Store VFS partition info if found and verify type
                if name == "vfs":
                    # Type 1 is "data", subtype 130 is "spiffs"
                    if type_val != 1 or subtype != 130:
                        print("\nError: VFS partition must be type=data(1) and subtype=spiffs(130)")
                        print(f"Found type={type_val} subtype={subtype}")
                        return None
                    vfs_info = (part_offset, part_size)
                    
                offset += 32
            
            print("=" * 80)
            return vfs_info
            
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

# First, verify and copy the firmware
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

# Now parse the partition table from the local copy
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
        # Execute command and capture output
        process = subprocess.run(
            command,
            cwd=cwd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            check=False  # Don't raise exception on non-zero exit
        )
        
        # Print output in real-time
        if process.stdout:
            print(process.stdout.strip())
        if process.stderr:
            print(process.stderr.strip())
        
        # Check return code
        if process.returncode != 0:
            print(f"Command failed with return code: {process.returncode}")
            return None
            
        return process.stdout
        
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
        process = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=repo_path,
            capture_output=True,
            text=True,
            check=True
        )
        commit_hash = process.stdout.strip()
        
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
        print(f"Commit hash: {commit_hash}")
        return True
        
    except subprocess.CalledProcessError as e:
        print(f"Error getting git commit hash: {e}")
        return False
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
        # Changed from "frozen" to the root directory
        mct_source = source_dir
        if not os.path.exists(mct_source):
            print(f"Error: MCT source directory not found at {mct_source}")
            return False
            
        # Copy all Python files and directories, excluding git and other non-essential files
        for item in os.listdir(mct_source):
            # Skip git directory and other non-essential files
            if item.startswith('.') or item in ['__pycache__', 'tests', 'docs']:
                continue
                
            source_path = os.path.join(mct_source, item)
            dest_path = os.path.join(temp_dir, item)
            
            if os.path.isfile(source_path) and item.endswith('.py'):
                shutil.copy2(source_path, dest_path)
            elif os.path.isdir(source_path):
                shutil.copytree(source_path, dest_path, 
                              ignore=shutil.ignore_patterns('__pycache__', '*.pyc', '*.git*'))
                
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

def run_flash_command(command):
    """Execute the flash command and handle the output."""
    max_retries = 3
    for attempt in range(max_retries):
        try:
            print(f"\nFlash attempt {attempt + 1} of {max_retries}")
            
            # Add a delay before starting
            time.sleep(2)
            
            # Modify the command to use a lower baud rate
            command_str = " ".join(command)
            command_str = command_str.replace("-b 460800", "-b 115200")
            modified_command = command_str.split()
            
            process = subprocess.run(
                modified_command,
                capture_output=True,
                text=True,
                check=False
            )
            
            # Print output in real-time
            if process.stdout:
                print(process.stdout)
            if process.stderr:
                print(process.stderr)
                
            # Check for specific error messages
            if "Invalid head of packet" in (process.stdout or "") + (process.stderr or ""):
                print("Communication error detected, retrying...")
                time.sleep(3)  # Wait longer before retry
                continue
                
            # Check return code
            if process.returncode != 0:
                print(f"Flash command failed with return code: {process.returncode}")
                if attempt < max_retries - 1:
                    print("Retrying...")
                    time.sleep(3)
                    continue
                return False
                
            return True
            
        except Exception as e:
            print(f"Error executing flash command: {str(e)}")
            return False


def print_partition_table(firmware_path: str):
    """Print the partition table contents from the firmware."""
    try:
        with open(firmware_path, 'rb') as f:
            f.seek(0x8000)  # Partition table offset
            partition_data = f.read(0x1000)  # Read 4KB partition table
            
            print("\nPartition Table:")
            print("=" * 80)
            print(f"{'Name':<16} {'Type':<8} {'SubType':<8} {'Offset':<10} {'Size':<12} {'Flags'}")
            print("-" * 80)
            
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
                flags = entry_data[28]
                
                print(f"{name:<16} {type_val:<8d} {subtype:<8d} 0x{part_offset:08x} {part_size:<12,d} 0x{flags:02x}")
                
                offset += 32
                
    except Exception as e:
        print(f"Error reading partition table: {e}")

def validate_mct_image(image_path: str, expected_size: int):
    """Validate the MCT filesystem image."""
    try:
        if not os.path.exists(image_path):
            print(f"Error: MCT image not found at {image_path}")
            return False
            
        actual_size = os.path.getsize(image_path)
        print("\nMCT Image Validation:")
        print("=" * 40)
        print(f"Path: {image_path}")
        print(f"Expected size: {expected_size:,} bytes")
        print(f"Actual size: {actual_size:,} bytes")
        
        if actual_size != expected_size:
            print("Error: Size mismatch!")
            return False
            
        # Read first few bytes to check if it looks like a valid filesystem
        with open(image_path, 'rb') as f:
            header = f.read(16)
            
        # Print first 16 bytes as hex
        print("\nFirst 16 bytes:")
        print(" ".join(f"{b:02x}" for b in header))
        
        # Calculate and print MD5 hash
        md5_hash = calculate_md5(image_path)
        print(f"\nMD5 Hash: {md5_hash}")
        
        return True
        
    except Exception as e:
        print(f"Error validating MCT image: {e}")
        return False

def read_partitions_csv():
    """Read the partition configuration from partitions.csv."""
    partitions_file = os.path.abspath("../lvgl_micropython/build/partitions.csv")
    print(f"\nReading partitions from: {partitions_file}")
    
    try:
        if not os.path.exists(partitions_file):
            print(f"Error: Partitions file not found: {partitions_file}")
            build_dir = os.path.dirname(partitions_file)
            if os.path.exists(build_dir):
                print(f"\nContents of {build_dir}:")
                print("\n".join(os.listdir(build_dir)))
            return None
            
        print("\nPartitions from CSV:")
        print("=" * 80)
        print(f"{'Name':<16} {'Type':<8} {'SubType':<8} {'Offset':<10} {'Size':<12}")
        print("-" * 80)
        
        partitions = []
        with open(partitions_file, 'r') as f:
            # Skip comments
            lines = [l.strip() for l in f.readlines() if l.strip() and not l.startswith('#')]
            
            for line in lines:
                # Parse the basic 5 columns: name,type,subtype,offset,size
                name, type_str, subtype, offset, size = [p.strip() for p in line.split(',')[:5]]
                
                # Convert values
                offset_val = int(offset, 16) if '0x' in offset else int(offset)
                size_val = int(size, 16) if '0x' in size else int(size)
                
                print(f"{name:<16} {type_str:<8} {subtype:<8} 0x{offset_val:08x} {size_val:<12,d}")
                partitions.append({
                    'name': name,
                    'offset': offset_val,
                    'size': size_val
                })
                
        return partitions
        
    except Exception as e:
        print(f"Error reading partitions.csv: {e}")
        return None
    

def update_changes_file(version, previous_version=None):
    """Update changes.json with version history."""
    changes_file = "changes.json"
    
    try:
        # Load existing changes file if it exists
        if os.path.exists(changes_file):
            with open(changes_file, 'r') as f:
                changes_data = json.load(f)
        else:
            changes_data = {
                "versions": []
            }

        # Get modified files since last version in MCT directory
        if previous_version:
            files_cmd = ["git", "diff", "--name-only", f"{previous_version}..HEAD", "."]
        else:
            files_cmd = ["git", "diff", "--name-only", "HEAD~10..HEAD", "."]
            
        files_result = subprocess.run(
            files_cmd,
            cwd=mct_path,  # Explicitly use MCT directory
            capture_output=True,
            text=True,
            check=True
        )
        modified_files = [f for f in files_result.stdout.split('\n') if f.strip()]

        # Get commit messages since last version from MCT directory
        if previous_version:
            git_cmd = ["git", "log", f"{previous_version}..HEAD", "--pretty=format:%s", "."]
        else:
            git_cmd = ["git", "log", "-10", "--pretty=format:%s", "."]
            
        msg_result = subprocess.run(
            git_cmd,
            cwd=mct_path,  # Explicitly use MCT directory
            capture_output=True,
            text=True,
            check=True
        )
        commit_messages = [msg for msg in msg_result.stdout.split('\n') if msg.strip()]

        # Create new version entry
        new_version = {
            "version": version,
            "date": datetime.now(timezone.utc).isoformat(),
            "modified_files": modified_files,
            "changes": commit_messages
        }

        # Add new version to the beginning of the list
        changes_data["versions"].insert(0, new_version)

        # Write updated changes file
        with open(changes_file, 'w') as f:
            json.dump(changes_data, f, indent=2)

        print(f"\nUpdated changes.json with version {version}")
        if modified_files:
            print("\nModified files in MCT:")
            for file in modified_files:
                print(f"- {file}")
        print("\nChanges since last version:")
        for msg in commit_messages:
            print(f"- {msg}")

        return True

    except Exception as e:
        print(f"Error updating changes file: {str(e)}")
        return False

def compare_partitions(firmware_path):
    """Compare partitions from firmware against partitions.csv."""
    print("\nComparing partitions:")
    print("=" * 80)
    
    # Read expected partitions
    csv_partitions = read_partitions_csv()
    if not csv_partitions:
        print("Failed to read partitions.csv")
        return None
        
    # Read actual partitions from firmware
    print("\nPartitions from firmware:")
    print("-" * 80)
    print_partition_table(firmware_path)
    
    # Find VFS partition in CSV
    vfs_partition = next((p for p in csv_partitions if p['name'] == 'vfs'), None)
    if vfs_partition:
        print("\nVFS Partition from CSV:")
        print(f"Offset: 0x{vfs_partition['offset']:x}")
        print(f"Size: {vfs_partition['size']:,} bytes")
        return vfs_partition['offset'], vfs_partition['size']
    else:
        print("Error: VFS partition not found in partitions.csv")
        return None


#######################################
#######################################
#######################################


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

# Get previous version from changes.json if it exists
previous_version = None
if os.path.exists("changes.json"):
    try:
        with open("changes.json", 'r') as f:
            changes_data = json.load(f)
            if changes_data["versions"]:
                previous_version = changes_data["versions"][0]["version"]
    except Exception as e:
        print(f"Warning: Could not read previous version from changes.json: {e}")

# Update changes.json
if not update_changes_file(logical_version, previous_version):
    print("Warning: Failed to update changes.json")
    # Continue execution as this is not critical

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
            "--baud", "460800",  # Updated to higher baud rate
            "--before", "default_reset",
            "--after", "hard_reset",
            "erase_region", "0x0", "0x1000000"  # Erase first 16MB
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

        # Flash command (no need for --erase-all since we just erased)
        flash_command = [
            "python", "-m", "esptool",
            "--chip", "esp32s3",
            "-p", esp32_port,
            "-b", "460800",  # Updated to higher baud rate
            "--before", "default_reset",
            "--after", "hard_reset",
            "--no-stub",
            "write_flash",
            "--flash_mode", "dio",
            "--flash_size", "16MB",
            "--flash_freq", "80m",
            "0x0", firmware_dest,
            f"0x{vfs_offset:x}", fatfs_image
        ]

        # Print the exact command that will be executed
        print("\nExecuting flash command:")
        print(" ".join(flash_command))
        print("\nFlash output:")

        if not run_flash_command(flash_command):
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



