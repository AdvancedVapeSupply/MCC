#!/usr/bin/env python3
import os
import sys
from parse_partition import parse_partition_table

def create_combined_image(firmware_path: str, fs_path: str = "test_fs.bin"):
    """Combine firmware with test filesystem."""
    
    # Get VFS partition info
    partitions = parse_partition_table(firmware_path)
    vfs = next((p for p in partitions if p.name == "vfs"), None)
    
    if not vfs:
        print("Error: No VFS partition found in firmware")
        return False
        
    print(f"\nVFS Partition:")
    print(f"  Offset: 0x{vfs.offset:x}")
    print(f"  Size: 0x{vfs.size:x}")
    
    try:
        # Read the firmware
        with open(firmware_path, 'rb') as f:
            firmware_data = f.read()
        
        # Read the filesystem
        with open(fs_path, 'rb') as f:
            fs_data = f.read()
            
        if len(fs_data) > vfs.size:
            print(f"Error: Filesystem too large ({len(fs_data)} > {vfs.size})")
            return False
            
        # Create the combined image
        output_path = "mct_with_test.bin"
        with open(output_path, 'wb') as f:
            # Write firmware up to VFS partition
            f.write(firmware_data[:vfs.offset])
            
            # Write our filesystem
            f.write(fs_data)
            
            # Pad to end of VFS partition if needed
            padding_size = vfs.size - len(fs_data)
            if padding_size > 0:
                f.write(b'\xFF' * padding_size)
            
            # Write rest of firmware if any
            if len(firmware_data) > vfs.offset + vfs.size:
                f.write(firmware_data[vfs.offset + vfs.size:])
        
        print(f"\nCreated combined image: {output_path}")
        print(f"Total size: {os.path.getsize(output_path):,} bytes")
        
        print("\nTo flash the image, run:")
        print(f"esptool.py --port /dev/tty.usbmodem* write_flash 0x0 {output_path}")
        return True
        
    except Exception as e:
        print(f"Error creating combined image: {str(e)}")
        return False

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python3 flash_test_fs.py <firmware.bin>")
        sys.exit(1)
    
    firmware_path = sys.argv[1]
    if not os.path.exists(firmware_path):
        print(f"Error: Firmware file not found: {firmware_path}")
        sys.exit(1)
        
    create_combined_image(firmware_path) 