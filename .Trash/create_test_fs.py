#!/usr/bin/env python3
import os
import subprocess
import tempfile
from parse_partition import parse_partition_table

def create_test_files():
    """Create test files in a temporary directory."""
    temp_dir = tempfile.mkdtemp()
    print(f"\nCreating test files in {temp_dir}")
    
    # Test files
    test_files = [
        ("ThisIsAVeryLongFileName.txt", b"Testing long filename"),
        ("test.txt", b"lowercase test"),
        ("TEST.TXT", b"uppercase test"),
        ("Test.txt", b"mixed case test"),
        ("Test File With Spaces.txt", b"Testing spaces in filename"),
        ("Special&Chars!.txt", b"Testing special characters")
    ]
    
    for name, content in test_files:
        path = os.path.join(temp_dir, name)
        print(f"Creating: {name}")
        with open(path, 'wb') as f:
            f.write(content)
    
    return temp_dir

def run_fatfsgen(source_dir, size):
    """Run fatfsgen.py from ESP-IDF."""
    esp_idf_path = os.getenv('IDF_PATH', '/opt/esp-idf')
    fatfsgen = os.path.join(esp_idf_path, 'components/fatfs/fatfsgen.py')
    
    cmd = [
        'python3', fatfsgen,
        source_dir,
        '--partition_size', str(size),
        '--sector_size', '4096',
        '--output_file', 'test_fs.bin'
    ]
    
    print("\nRunning fatfsgen:")
    print(' '.join(cmd))
    
    try:
        subprocess.run(cmd, check=True)
        if os.path.exists('test_fs.bin'):
            print(f"\nCreated test_fs.bin: {os.path.getsize('test_fs.bin'):,} bytes")
            return True
    except subprocess.CalledProcessError as e:
        print(f"Error running fatfsgen: {e}")
    return False

if __name__ == "__main__":
    # Get VFS partition size from firmware
    firmware = "lvgl_micropy_ESP32_GENERIC_S3-SPIRAM_OCT-16.bin"
    partitions = parse_partition_table(firmware)
    vfs = next((p for p in partitions if p.name == "vfs"), None)
    
    if not vfs:
        print("Error: No VFS partition found in firmware")
        exit(1)
    
    print(f"VFS partition size: 0x{vfs.size:x}")
    
    # Create test files
    temp_dir = create_test_files()
    
    # Create filesystem
    if run_fatfsgen(temp_dir, vfs.size):
        print("\nFATFS image created successfully!")
    else:
        print("\nError creating FATFS image")