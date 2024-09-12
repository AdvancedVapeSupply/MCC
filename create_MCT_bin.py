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

def list_files_to_commit(repo_path):
    print("Files to be committed:")
    result = run_command(["git", "status", "--porcelain"], cwd=repo_path)
    if result:
        for line in result.splitlines():
            status, filename = line.split(maxsplit=1)
            file_path = os.path.join(repo_path, filename.strip())
            if os.path.exists(file_path):
                size = os.path.getsize(file_path)
                print(f"{filename.strip()}: {size} bytes")
            else:
                print(f"{filename.strip()}: Not found")
    else:
        print("No changes to commit")

def update_version_file(repo_path, version):
    version_path = os.path.join(repo_path, "version.py")
    with open(version_path, 'w') as f:
        f.write(f'__version__ = "{version}"\n')
    print(f"Updated {version_path} with version {version}")

def commit_and_push(repo_path, commit_message):
    print(f"\nCommitting and pushing changes in {repo_path}")
    run_command(["git", "commit", "-am", commit_message], cwd=repo_path)
    run_command(["git", "push", "origin", "HEAD:main"], cwd=repo_path)

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

def clean_directory(directory):
    for root, dirs, files in os.walk(directory, topdown=False):
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
    for root, dirs, files in os.walk(directory, topdown=False):
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

# Define logical version before using it
current_datetime = datetime.now().strftime("%Y%m%d_%H%M")
logical_version = f"0.2.{current_datetime}"  # Define logical version here

# Create version content for MCT
mct_version_content = f'__version__ = "{logical_version}"\n'  # Define mct_version_content here

# Update version file in ../MCT
mct_path = "../MCT"
io_path = os.path.join(mct_path, "lib/io")
ui_path = os.path.join(mct_path, "lib/ui")

print_step(1, "Update version files in submodules")
update_version_file(io_path, logical_version)
update_version_file(ui_path, logical_version)

print_step(2, "Commit and push submodules")
commit_and_push(io_path, f"Update version to {logical_version}")
commit_and_push(ui_path, f"Update version to {logical_version}")

print("Updating submodule references in MCT")
run_command(["git", "submodule", "update", "--remote", "--merge"], cwd=mct_path)
run_command(["git", "add", "lib/io", "lib/ui"], cwd=mct_path)
run_command(["git", "commit", "-m", f"Update submodule references to {logical_version}"], cwd=mct_path)
run_command(["git", "push", "origin", "main"], cwd=mct_path)

print_step(4, "Update version file in MCT")
update_version_file(mct_path, logical_version)

print_step(5, "Commit and push MCT")
commit_and_push(mct_path, f"Update version to {logical_version}")

print_step(6, "Clone MCT to a temporary directory")
temp_directory = "/tmp/mct_temp"
run_command(["git", "clone", "--recursive", mct_path, temp_directory])

print_step(7, "Checkout the latest commit in the main repo and submodules")
run_command(["git", "checkout", "main"], cwd=temp_directory)
run_command(["git", "submodule", "update", "--init", "--recursive", "--remote"], cwd=temp_directory)

print("\n" + "="*80)
print("MCT and submodules updated, committed, pushed, and checked out successfully.")
print("="*80 + "\n")

def validate_version_files(base_path):
    """Check for the presence of version.py in specified directories."""
    required_files = [
        os.path.join(base_path, "version.py"),  # Root directory
        os.path.join(base_path, "lib/io/version.py"),  # IO submodule
        os.path.join(base_path, "lib/ui/version.py")   # UI submodule
    ]
    
    missing_files = [file for file in required_files if not os.path.isfile(file)]
    
    if missing_files:
        print("Missing version.py files in the following locations:")
        for file in missing_files:
            print(f" - {file}")
        return False
    return True

print_step(8, "Create FAT filesystem image")

# Explicitly call clean_directory
clean_directory(temp_directory)

# Print the directory structure after cleaning
print("Directory structure with file sizes after cleaning:")
print_directory_with_sizes(temp_directory)

# Calculate the size of the MCT content after cleaning
mct_size = get_directory_size(temp_directory)
print(f"Size of MCT content after cleaning: {mct_size} bytes")

# Set a fixed partition size of 1MB
partition_size = 1024 * 1024  # 1MB in bytes
print(f"Fixed partition size: {partition_size} bytes")

# Create the FAT filesystem image
fatfs_image = os.path.join(os.path.dirname(output_image), "mct.bin")
fatfs_cmd = [
    "python", fatfsgen_script,
    temp_directory,
    "--output_file", fatfs_image,
    "--partition_size", str(partition_size),
    "--long_name_support",
    "--use_default_datetime",
    "--fat_type", "12"
]

print(f"Executing command: {' '.join(fatfs_cmd)}")
result = run_command(fatfs_cmd)

if result is not None:
    print("Successfully created FAT filesystem image.")
    
    # Create and write the manifest file with the correct format
    manifest_data = {
        "name": "AVS MCT",  # Add this line
        "version": logical_version,
        "builds": [
            {
                "chipFamily": "ESP32-S3",
                "parts": [
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
    print_step(9, "Commit and push changes in current working directory")
    cwd = os.getcwd()
    list_files_to_commit(cwd)
    commit_and_push(cwd, f"Update manifest for version {logical_version}")
else:
    print("Failed to create FAT filesystem image.")
    sys.exit(1)

# Print the contents of the directory with file sizes after cleaning
print("Directory structure with file sizes after cleaning:")
print_directory_with_sizes(temp_directory)

# Add this near the top of the file, after imports
def parse_arguments():
    parser = argparse.ArgumentParser(description="Create and optionally flash MCT image")
    parser.add_argument("--flash", action="store_true", help="Erase and flash the ESP32-S3")
    return parser.parse_args()

# Replace the flashing process with this:
args = parse_arguments()

if args.flash:
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
        sys.exit(1)

    print(f"Using ESP32-S3 port: {esp32_port}")

    # Check if the port is in DFU mode
    if not esp32_port.endswith(('101', '1101', '2101')):  # Adjust the suffixes as needed
        print("The device is not in DFU mode. Skipping all esptool operations.")
        print("Flashing process skipped. Please ensure the device is in DFU mode and try again.")
    else:
        # Erase flash
        erase_command = [
            "esptool.py",
            "--chip", "esp32s3",
            "--port", esp32_port,
            "--baud", "115200",
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
            sys.exit(1)
        except subprocess.TimeoutExpired:
            print("Erase operation timed out. Please check the connection and try again.")
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
            sys.exit(1)
        except subprocess.TimeoutExpired:
            print("Flash operation timed out. Please check the connection and try again.")
            sys.exit(1)

        print("ESP32-S3 flashing process completed.")
else:
    print("Skipping flash process. Use --flash to erase and flash the ESP32-S3.")

print("Flashing completed. Please manually reset the device if necessary.")
