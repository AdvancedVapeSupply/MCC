import os
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import time
import argparse
from datetime import datetime

# Remote script to get files and their info
REMOTE_SCRIPT = """
import os
import json
import hashlib

def bytes_to_hex(bytes_obj):
    return ''.join('{:02x}'.format(b) for b in bytes_obj)

def get_files_info(directory='.'):
    files_info = {}
    def scan_dir(path):
        for entry in os.ilistdir(path):
            name = entry[0]
            full_path = path + '/' + name if path != '.' else name
            if entry[1] & 0x4000:  # Directory
                scan_dir(full_path)
            else:  # File
                try:
                    stat = os.stat(full_path)
                    with open(full_path, 'rb') as f:
                        content = f.read()  # Read entire file for accurate hash
                        hash_value = bytes_to_hex(hashlib.md5(content).digest())
                    files_info[full_path] = {
                        'size': stat[6],
                        'mtime': stat[8],
                        'hash': hash_value
                    }
                except Exception as e:
                    print(f"Error reading {full_path}: {str(e)}")
                    continue
    
    scan_dir('.')
    print(json.dumps(files_info))

get_files_info()
"""

# Files to ignore (similar to create_MCT_bin)
IGNORE_PATTERNS = [
    '.git',
    '__pycache__',
    '.DS_Store',
    '.pytest_cache',
    'tests',
    'README',
    '.gitignore'
]

def should_ignore(path):
    return any(pattern in str(path) for pattern in IGNORE_PATTERNS)

def get_local_files(directory):
    files_info = {}
    for path in Path(directory).rglob('*'):
        if path.is_file() and not should_ignore(path):
            rel_path = str(path.relative_to(directory))
            try:
                with open(path, 'rb') as f:
                    content = f.read()  # Read entire file for accurate hash
                    hash_value = hashlib.md5(content).hexdigest()
                files_info[rel_path] = {
                    'size': path.stat().st_size,
                    'hash': hash_value,
                    'path': str(path)
                }
            except Exception as e:
                print(f"Error reading {path}: {str(e)}")
                continue
    return files_info

def find_esp32():
    """Find the ESP32 device port using same logic as create_MCT_bin"""
    import serial.tools.list_ports
    
    # Print available ports for debugging
    print("\nAvailable ports:")
    for port in serial.tools.list_ports.comports():
        print(f"- {port.device}: {port.description}")
    
    # Extended list of common ESP32 identifiers
    esp_identifiers = [
        "CP210", 
        "SLAB_USBtoUART",
        "Silicon Labs CP210x",
        "USB Serial",
        "UART",
        "ESP32",
        "Espressif"
    ]
    
    for port in serial.tools.list_ports.comports():
        if any(id in port.description for id in esp_identifiers):
            return port.device
    return None

def get_remote_files():
    port = find_esp32()
    if not port:
        print("Error: ESP32 device not found")
        sys.exit(1)
        
    # Try to detect if REPL is in use
    try:
        # Quick test connection
        result = subprocess.run(['mpremote', f'connect', port, 'exec', '1'],
                              capture_output=True, text=True, timeout=2)
        if "Could not enter raw repl" in result.stderr:
            print("Error: ESP32 REPL is in use. Please exit any active REPL sessions.")
            sys.exit(1)
    except subprocess.TimeoutExpired:
        print("Error: ESP32 REPL is in use. Please exit any active REPL sessions.")
        sys.exit(1)
    
    # Save remote script temporarily
    with open('_temp_remote.py', 'w') as f:
        f.write(REMOTE_SCRIPT)
    
    try:
        # Run remote script and capture output
        result = subprocess.run(['mpremote', f'connect', port, 'run', '_temp_remote.py'],
                              capture_output=True, text=True)
        
        # Add debug information
        print("\nCommand output:")
        print("stdout:", result.stdout)
        print("stderr:", result.stderr)
        
        if result.stdout.strip():
            return json.loads(result.stdout)
        else:
            print("Error: No output received from ESP32")
            sys.exit(1)
    finally:
        # Clean up temporary script
        os.remove('_temp_remote.py')

def sync_files(local_dir):
    if not os.path.isdir(local_dir):
        print(f"Error: Directory '{local_dir}' not found")
        sys.exit(1)
        
    print("Getting local files info...")
    local_files = get_local_files(local_dir)
    
    print("Getting remote files info...")
    remote_files = get_remote_files()
    
    # Determine files to update
    to_update = []
    for local_path, local_info in local_files.items():
        if local_path not in remote_files or \
           local_info['hash'] != remote_files[local_path]['hash']:
            to_update.append((local_path, local_info['path']))
    
    # Remove files that exist on device but not locally
    to_remove = [path for path in remote_files if path not in local_files]
    
    # Perform updates
    if to_remove:
        print("\nRemoving files:")
        for path in to_remove:
            print(f"Removing {path}")
            
    if to_update:
        print(f"\nUpdating {len(to_update)} files:")
        
        # First, collect all unique directories
        directories = set()
        for remote_path, _ in to_update:
            if '/' in remote_path:
                dir_path = '/'.join(remote_path.split('/')[:-1])
                directories.add(dir_path)
        
        # Create all directories first
        if directories:
            print("Creating directories...")
            dir_script = """
import os
def ensure_dir(path):
    try:
        if not path:
            return
        if not os.stat(path)[0] & 0x4000:  # Check if it's not a directory
            os.mkdir(path)
    except OSError:  # Directory doesn't exist
        parent = '/'.join(path.split('/')[:-1])
        if parent:
            ensure_dir(parent)
        os.mkdir(path)

for dir_path in {dirs}:
    ensure_dir(dir_path)
""".format(dirs=repr(sorted(directories)))
            
            with open('_temp_mkdir.py', 'w') as f:
                f.write(dir_script)
            try:
                subprocess.run(['mpremote', 'run', '_temp_mkdir.py'],
                             capture_output=True, text=True, check=True)
            except subprocess.CalledProcessError as e:
                print(f"Warning: Error creating directories: {e.stderr}")
            finally:
                os.remove('_temp_mkdir.py')
        
        # Now copy all files
        for remote_path, local_path in to_update:
            print(f"Copying {remote_path}")
            try:
                result = subprocess.run(['mpremote', 'cp', local_path, ':' + remote_path],
                                     capture_output=True, text=True, check=True)
                if "Up to date:" in result.stderr:
                    print(f"Up to date: {remote_path}")
            except subprocess.CalledProcessError as e:
                print(f"Error copying {remote_path}:")
                print(e.stderr if hasattr(e, 'stderr') else str(e))
    
    print(f"\nSync complete at {datetime.now().strftime('%H:%M:%S')}. Updated {len(to_update)} files, removed {len(to_remove)} files.")

def background_sync(directory, interval):
    """Run sync continuously with specified interval"""
    print(f"Starting background sync for {directory}")
    print(f"Sync interval: {interval} seconds")
    print("Press Ctrl+C to stop")
    
    try:
        while True:
            try:
                sync_files(directory, verbose=False)
                time.sleep(interval)
            except Exception as e:
                print(f"Sync error: {e}")
                print("Retrying in 10 seconds...")
                time.sleep(10)
    except KeyboardInterrupt:
        print("\nBackground sync stopped")

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Sync files to ESP32')
    parser.add_argument('directory', help='Directory to sync')
    parser.add_argument('-b', '--background', action='store_true', 
                        help='Run in background mode with periodic sync')
    parser.add_argument('-i', '--interval', type=int, default=30,
                        help='Sync interval in seconds (default: 30)')
    
    args = parser.parse_args()
    
    if args.background:
        background_sync(args.directory, args.interval)
    else:
        sync_files(args.directory)
