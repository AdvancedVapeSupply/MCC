#!/usr/bin/env python3

"""
ESP32 Filesystem Comparison Script

This script compares files between the local MCT repository and an ESP32's filesystem.
It uses mpremote to access the ESP32's files and performs a comparison of:
- File existence
- File sizes
- File contents (optional deep comparison)

Usage:
    ./compare_MCT_fs.py [--deep] [--port PORT]

Options:
    --deep      Perform deep comparison of file contents
    --port      Specify the serial port (default: auto-detect)
"""

import os
import sys
import hashlib
import argparse
from typing import Dict, Set, Tuple
import subprocess
from pathlib import Path

def parse_args():
    parser = argparse.ArgumentParser(description='Compare MCT repository with ESP32 filesystem')
    parser.add_argument('--deep', action='store_true', help='Perform deep comparison of file contents')
    parser.add_argument('--port', help='Serial port for ESP32 connection')
    return parser.parse_args()

def get_local_files(mct_path: str) -> Dict[str, int]:
    """Get dictionary of files and their sizes from local MCT directory."""
    print(f"Scanning local directory: {mct_path}")
    local_files = {}
    
    # Define paths to scan
    paths_to_scan = [
        '',  # Root directory
        'lib/io',
        'lib/ui',
        'lib/esp32_ulp',
        'lib/soc',
        'lib/mp',
        'data',
        'beta'
    ]
    
    # Files to ignore
    ignore_patterns = {
        '.git',
        '__pycache__',
        '.DS_Store',
        '.idea',
        '.vscode'
    }
    
    for base_path in paths_to_scan:
        full_path = os.path.join(mct_path, base_path)
        print(f"Checking path: {full_path}")
        if not os.path.exists(full_path):
            print(f"Path does not exist: {full_path}")
            continue
            
        for root, dirs, files in os.walk(full_path):
            # Remove ignored directories
            dirs[:] = [d for d in dirs if d not in ignore_patterns]
            
            for file in files:
                if any(pattern in file for pattern in ignore_patterns):
                    continue
                    
                full_file_path = os.path.join(root, file)
                relative_path = os.path.relpath(full_file_path, mct_path)
                
                # Convert Windows paths to forward slashes
                relative_path = relative_path.replace('\\', '/')
                
                try:
                    size = os.path.getsize(full_file_path)
                    local_files[relative_path] = size
                except OSError as e:
                    print(f"Error reading {relative_path}: {e}")
    
    return local_files

def get_esp32_files(port: str = None) -> Dict[str, int]:
    """Get dictionary of files and their sizes from ESP32."""
    print("Getting ESP32 files...")
    esp32_files = {}
    
    try:
        # Create a temporary script file
        with open('temp_esp32_script.py', 'w') as f:
            f.write('''
import os
def list_files(path):
    result = []
    try:
        for entry in os.ilistdir(path):
            name = entry[0]
            full_path = path + '/' + name if path != '/' else '/' + name
            if entry[1] == 0x4000:  # Directory
                result.extend(list_files(full_path))
            else:
                try:
                    size = os.stat(full_path)[6]
                    result.append((full_path, size))
                except:
                    pass
    except:
        pass
    return result

files = list_files('/')
print("=== BEGIN ESP32 FILE LISTING ===")
for path, size in sorted(files):
    if path.startswith('/'): path = path[1:]
    print(f"{size} {path}")
print("=== END ESP32 FILE LISTING ===")
''')
        
        # Build command with persistent connection
        if port:
            cmd = f"python3 -m mpremote connect {port} cp temp_esp32_script.py : && python3 -m mpremote connect {port} exec 'import temp_esp32_script'"
        else:
            cmd = f"python3 -m mpremote cp temp_esp32_script.py : && python3 -m mpremote exec 'import temp_esp32_script'"
            
        print(f"\nRunning command: {cmd}")
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
        
        # Clean up temp file
        os.remove('temp_esp32_script.py')
        
        print("\nCommand output:")
        print(result.stdout)
        print("\nCommand stderr:")
        print(result.stderr)
        
        if result.returncode != 0:
            print(f"Error accessing ESP32: {result.stderr}")
            return {}
            
        # Process the results
        in_file_listing = False
        for line in result.stdout.splitlines():
            line = line.strip()
            if line == "=== BEGIN ESP32 FILE LISTING ===":
                in_file_listing = True
                continue
            if line == "=== END ESP32 FILE LISTING ===":
                in_file_listing = False
                continue
            if not in_file_listing:
                continue
                
            try:
                size_str, path = line.split(' ', 1)
                esp32_files[path] = int(size_str)
            except ValueError as e:
                print(f"Error parsing line: {line} - {e}")
                continue
                
    except subprocess.CalledProcessError as e:
        print(f"Error running mpremote: {e}")
        return {}
        
    print(f"\nFound {len(esp32_files)} files on ESP32")
    return esp32_files

def compare_files(local_files: Dict[str, int], esp32_files: Dict[str, int], deep: bool = False, port: str = None) -> Tuple[Set[str], Set[str], Set[str], Set[str]]:
    """Compare files between local and ESP32, returns sets of missing, extra, and different files."""
    print("Comparing files...")
    local_set = set(local_files.keys())
    esp32_set = set(esp32_files.keys())
    
    missing_files = local_set - esp32_set
    extra_files = esp32_set - local_set
    size_mismatch = set()
    content_mismatch = set()
    
    # Compare sizes for files that exist in both
    common_files = local_set & esp32_set
    for file in common_files:
        if local_files[file] != esp32_files[file]:
            size_mismatch.add(file)
            continue
            
        if deep:
            # Compare file contents
            try:
                # Get local file hash
                with open(os.path.join("../MCT", file), 'rb') as f:
                    local_hash = hashlib.md5(f.read()).hexdigest()
                    
                # Get ESP32 file hash
                port_arg = f" -p {port}" if port else ""
                cmd = f"mpremote{port_arg} cp :{file} temp_esp32_file"
                subprocess.run(cmd.split(), capture_output=True)
                
                with open("temp_esp32_file", 'rb') as f:
                    esp32_hash = hashlib.md5(f.read()).hexdigest()
                    
                os.remove("temp_esp32_file")
                
                if local_hash != esp32_hash:
                    content_mismatch.add(file)
                    
            except Exception as e:
                print(f"Error comparing {file}: {e}")
                
    return missing_files, extra_files, size_mismatch, content_mismatch

def main():
    print("Starting comparison...")
    args = parse_args()
    
    # Get MCT repository path
    mct_path = os.path.abspath("../MCT")
    if not os.path.exists(mct_path):
        print(f"Error: MCT repository not found at {mct_path}")
        sys.exit(1)
        
    print(f"\nComparing files between:")
    print(f"Local: {mct_path}")
    print(f"ESP32: {args.port if args.port else 'auto-detect'}")
    print("Performing deep comparison..." if args.deep else "Performing size comparison only...")
    
    # Get file listings
    print("\nGathering file information...")
    local_files = get_local_files(mct_path)
    print(f"Found {len(local_files)} files in local repository")
    
    esp32_files = get_esp32_files(args.port)
    print(f"Found {len(esp32_files)} files on ESP32")
    
    # Compare files
    missing, extra, size_diff, content_diff = compare_files(local_files, esp32_files, args.deep, args.port)
    
    # Print results
    print("\nResults:")
    print("=" * 80)
    
    if missing:
        print("\nFiles missing from ESP32:")
        for file in sorted(missing):
            print(f"  {file} ({local_files[file]:,} bytes)")
            
    if extra:
        print("\nExtra files on ESP32:")
        for file in sorted(extra):
            print(f"  {file} ({esp32_files[file]:,} bytes)")
            
    if size_diff:
        print("\nFiles with size differences:")
        for file in sorted(size_diff):
            print(f"  {file}")
            print(f"    Local: {local_files[file]:,} bytes")
            print(f"    ESP32: {esp32_files[file]:,} bytes")
            
    if args.deep and content_diff:
        print("\nFiles with content differences:")
        for file in sorted(content_diff):
            print(f"  {file}")
            
    if not any([missing, extra, size_diff, content_diff]):
        print("\nAll files match! 🎉")
        
    print("\nSummary:")
    print(f"  Missing files: {len(missing)}")
    print(f"  Extra files: {len(extra)}")
    print(f"  Size mismatches: {len(size_diff)}")
    if args.deep:
        print(f"  Content mismatches: {len(content_diff)}")
        
if __name__ == "__main__":
    main()
