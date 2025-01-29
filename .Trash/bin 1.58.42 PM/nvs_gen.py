#!/usr/bin/env python3

import argparse
import csv
import struct
import sys

def create_nvs_partition(input_csv, output_bin, size):
    # NVS Page size is 4096 bytes
    PAGE_SIZE = 4096
    
    # Initialize the binary data with 0xFF (erased flash state)
    partition_data = bytearray([0xFF] * size)
    
    # Write the header
    # Format version = 2
    partition_data[0:4] = struct.pack('<I', 0x46627266)  # Magic number
    partition_data[4:8] = struct.pack('<I', 2)           # Version
    
    # Current write position after header
    pos = 64  # Header size
    
    # Read CSV and write entries
    with open(input_csv, 'r') as f:
        reader = csv.DictReader(f)
        current_namespace = None
        
        for row in reader:
            key = row['key']
            type_ = row['type']
            encoding = row.get('encoding', '')
            value = row.get('value', '')
            
            if type_ == 'namespace':
                current_namespace = key
                # Write namespace entry
                ns_data = struct.pack('<BB', 0x01, len(key)) + key.encode()
                partition_data[pos:pos+len(ns_data)] = ns_data
                pos += len(ns_data)
                pos = (pos + 3) & ~3  # Align to 4 bytes
                
            elif type_ == 'data' and current_namespace:
                if encoding == 'string':
                    # Write string data entry
                    data = value.encode()
                    entry_data = struct.pack('<BBH', 0x21, len(key), len(data))
                    entry_data += key.encode() + data
                    partition_data[pos:pos+len(entry_data)] = entry_data
                    pos += len(entry_data)
                    pos = (pos + 3) & ~3  # Align to 4 bytes
    
    # Write the partition to file
    with open(output_bin, 'wb') as f:
        f.write(partition_data)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('input', help='Input CSV file')
    parser.add_argument('output', help='Output binary file')
    parser.add_argument('size', type=lambda x: int(x, 0), help='Size of partition in bytes (e.g. 0x4000)')
    
    args = parser.parse_args()
    
    try:
        create_nvs_partition(args.input, args.output, args.size)
        print(f"NVS partition generated successfully: {args.output}")
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main() 