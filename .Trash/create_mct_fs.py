#!/usr/bin/env python3
import os
import sys
import time
import subprocess
import tempfile
from parse_partition import parse_partition_table

# Flash parameters
FLASH_SIZE = 16777216  # 16MB total flash
VFS_OFFSET = 0x4dd000  # VFS partition offset
VFS_SIZE = FLASH_SIZE - VFS_OFFSET  # Maximum size that will fit

def analyze_filesystem(image_path: str):
    """Analyze the filesystem parameters."""
    try:
        # Use 'file' command to get filesystem info
        cmd = ['file', '-k', image_path]
        print("\nAnalyzing filesystem:")
        print(' '.join(cmd))
        
        result = subprocess.run(cmd, check=True, capture_output=True, text=True)
        print(result.stdout)
        
    except subprocess.CalledProcessError as e:
        print(f"Error analyzing filesystem: {e}")
        print(e.output)

def mount_fat_filesystem(image_path: str, mount_point: str):
    """Mount the FAT filesystem image."""
    try:
        # Create mount point if it doesn't exist
        os.makedirs(mount_point, exist_ok=True)
        
        # First, attach the image to get a device
        cmd = ['hdiutil', 'attach', '-nomount', image_path]
        print("\nAttaching disk image:")
        print(' '.join(cmd))
        result = subprocess.run(cmd, check=True, capture_output=True, text=True)
        device = result.stdout.strip()
        
        if not device:
            print("Error: No device created")
            return None
            
        print(f"Created device: {device}")
        
        # Now mount the device
        cmd = ['diskutil', 'mount', '-mountPoint', mount_point, device]
        print("\nMounting filesystem:")
        print(' '.join(cmd))
        
        subprocess.run(cmd, check=True)
        print(f"\nMounted at: {mount_point}")
        return device
        
    except subprocess.CalledProcessError as e:
        print(f"Error mounting filesystem: {e}")
        return None

def unmount_filesystem(device: str, mount_point: str):
    """Unmount the filesystem."""
    try:
        # Unmount the filesystem
        cmd = ['diskutil', 'unmount', mount_point]
        subprocess.run(cmd, check=True)
        
        # Detach the device
        cmd = ['hdiutil', 'detach', device]
        subprocess.run(cmd, check=True)
        
        print(f"\nUnmounted and detached: {mount_point}")
        return True
    except subprocess.CalledProcessError as e:
        print(f"Error unmounting filesystem: {e}")
        return False

def create_fat_filesystem(image_path: str):
    """Create a FAT filesystem image using fatfsgen."""
    print("\nStarting create_fat_filesystem...")
    try:
        cmd = [
            'python', 'fatfs/fatfsgen.py',
            '../MCT',  # Source directory
            '--output_file', image_path,
            '--partition_size', str(2 * 1024 * 1024),  # 2MB should be plenty
            '--sector_size', '4096',
            '--sectors_per_cluster', '1',
            '--long_name_support',
            '--use_default_datetime',
            '--fat_type', '16'
        ]
        
        print("\nRunning fatfsgen (2MB):")
        print(' '.join(cmd))
        
        subprocess.run(cmd, check=True)
        
        if os.path.exists(image_path):
            size = os.path.getsize(image_path)
            print(f"\nCreated {image_path}: {size:,} bytes")
            
            if size > VFS_SIZE:
                print(f"Warning: File is too large ({size:,} bytes) to fit in VFS partition ({VFS_SIZE:,} bytes)")
                return False
                
            return True
            
    except subprocess.CalledProcessError as e:
        print(f"Error running fatfsgen: {e}")
    return False

def find_esp32_port():
    """Find the ESP32-S3 port."""
    try:
        # List all potential ports
        cmd = ['ls', '/dev/tty.*']
        result = subprocess.run(cmd, check=True, capture_output=True, text=True)
        ports = result.stdout.strip().split('\n')
        
        # Filter for likely ESP32 ports
        esp_ports = [p for p in ports if 'usbmodem' in p.lower()]
        
        if not esp_ports:
            print("No ESP32 device found. Available ports:")
            for port in ports:
                print(f"  {port}")
            return None
            
        if len(esp_ports) > 1:
            print("Multiple potential ESP32 ports found:")
            for i, port in enumerate(esp_ports):
                print(f"  {i+1}: {port}")
            return esp_ports[0]  # Use first one by default
            
        return esp_ports[0]
        
    except subprocess.CalledProcessError as e:
        print(f"Error finding ESP32 port: {e}")
        return None

def flash_device(firmware_file: str, mct_file: str):
    """Flash the firmware and MCT image."""
    try:
        # Find ESP32 port
        port = find_esp32_port()
        if not port:
            print("Cannot flash: No ESP32 device found")
            return False
            
        print(f"\nUsing ESP32 port: {port}")
        
        # First, try to erase flash
        erase_cmd = [
            'esptool.py',
            '--chip', 'esp32s3',
            '--port', port,
            '--baud', '115200',
            'erase_flash'
        ]
        
        print("\nErasing flash...")
        print(' '.join(erase_cmd))
        
        result = subprocess.run(erase_cmd, check=True)
        
        # Wait longer after erase
        print("Waiting for device reset (5 seconds)...")
        time.sleep(5)
        
        # Then flash firmware and MCT image
        flash_cmd = [
            'esptool.py',
            '--chip', 'esp32s3',
            '--port', port,
            '--baud', '115200',
            'write_flash',
            '-z',
            '0x0', firmware_file,
            hex(VFS_OFFSET), mct_file
        ]
        
        print("\nFlashing firmware and MCT image...")
        print(' '.join(flash_cmd))
        
        result = subprocess.run(flash_cmd, capture_output=True, text=True)
        print("\nOutput from esptool:")
        print(result.stdout)
        if result.stderr:
            print("\nErrors from esptool:")
            print(result.stderr)
            
        if result.returncode != 0:
            print(f"\nError: Flash command failed with return code {result.returncode}")
            return False
            
        print("Flash completed successfully!")
        return True
        
    except subprocess.CalledProcessError as e:
        print(f"Error during flashing: {e}")
        print(f"stderr: {e.stderr if hasattr(e, 'stderr') else 'No stderr'}")
        print(f"stdout: {e.stdout if hasattr(e, 'stdout') else 'No stdout'}")
        return False

def main():
    # Format the filesystem
    if not create_fat_filesystem("mct.bin"):
        sys.exit(1)
    
    # Create temporary mount point
    mount_point = tempfile.mkdtemp()
    print(f"\nCreated mount point: {mount_point}")
    
    try:
        # Mount filesystem
        device = mount_fat_filesystem("mct.bin", mount_point)
        if device:
            print("\nFilesystem mounted successfully!")
            print(f"\nCopy your MCT files to: {mount_point}")
            print("\nPress Enter when finished copying files...")
            input()
            # Unmount filesystem
            unmount_filesystem(device, mount_point)
    finally:
        # Clean up mount point
        os.rmdir(mount_point)

if __name__ == "__main__":
    main()
