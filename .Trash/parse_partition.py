#!/usr/bin/env python3
import sys
import struct
import argparse
from typing import Optional, List, Dict

# ESP32 Partition Table Constants
PARTITION_TABLE_OFFSET = 0x8000
PARTITION_TABLE_SIZE = 0x1000  # 4KB
PARTITION_ENTRY_SIZE = 32
MD5_SIZE = 16

# Partition Type Constants
PARTITION_TYPE_APP = 0x00
PARTITION_TYPE_DATA = 0x01

# Common Partition Subtypes
APP_SUBTYPES = {
    0x00: "factory",
    0x10: "ota_0",
    0x11: "ota_1",
    0x12: "ota_2",
    0x13: "ota_3",
    0x20: "test",
}

DATA_SUBTYPES = {
    0x00: "ota",
    0x01: "phy",
    0x02: "nvs",
    0x03: "coredump",
    0x04: "nvs_keys",
    0x05: "efuse",
    0x80: "esphttpd",
    0x81: "fat",
    0x82: "spiffs",
    0x83: "vfs",
}

class PartitionDefinition:
    def __init__(self, name: str, type_val: int, subtype: int, offset: int, size: int):
        self.name = name
        self.type = type_val
        self.subtype = subtype
        self.offset = offset
        self.size = size

    def __str__(self) -> str:
        """Format partition entry as CSV row."""
        type_name = "app" if self.type == PARTITION_TYPE_APP else "data"
        
        if self.type == PARTITION_TYPE_APP:
            subtype_name = APP_SUBTYPES.get(self.subtype, f"0x{self.subtype:02x}")
        else:
            subtype_name = DATA_SUBTYPES.get(self.subtype, f"0x{self.subtype:02x}")
        
        return f"{self.name},{type_name},{subtype_name},0x{self.offset:x},{format_size(self.size)},"

def format_size(size_bytes: int) -> str:
    """Convert size in bytes to human readable format with K/M suffix."""
    if size_bytes >= 1024*1024:
        return f"{size_bytes/(1024*1024):.0f}M"
    return f"{size_bytes/1024:.0f}K"

def get_partition_info(firmware_path: str, partition_name: str) -> Optional[PartitionDefinition]:
    """Get information about a specific partition by name."""
    partitions = parse_partition_table(firmware_path)
    return next((p for p in partitions if p.name == partition_name), None)

def get_vfs_offset(firmware_path: str) -> Optional[int]:
    """Get the offset of the VFS partition."""
    vfs_partition = get_partition_info(firmware_path, "vfs")
    return vfs_partition.offset if vfs_partition else None

def parse_partition_entry(data: bytes) -> Optional[PartitionDefinition]:
    """Parse a single partition entry."""
    if len(data) < PARTITION_ENTRY_SIZE:
        return None
    
    # Check if entry is empty or invalid magic
    if data[0:2] != b'\xaa\x50':
        return None
        
    try:
        # Skip magic number (aa 50) and parse fields
        type_val = data[2]
        subtype = data[3]
        offset = int.from_bytes(data[4:8], 'little')
        size = int.from_bytes(data[8:12], 'little')
        name = data[12:28].split(b'\x00')[0].decode('ascii')
        
        if not name or (offset == 0 and size == 0):
            return None
            
        return PartitionDefinition(name, type_val, subtype, offset, size)
    except Exception as e:
        print(f"Error parsing entry: {e}", file=sys.stderr)
        return None

def parse_partition_table(firmware_path: str) -> List[PartitionDefinition]:
    """Parse the partition table from a firmware file."""
    partitions = []
    
    try:
        with open(firmware_path, 'rb') as f:
            f.seek(PARTITION_TABLE_OFFSET)
            partition_data = f.read(PARTITION_TABLE_SIZE)
            
            offset = 0
            while offset < PARTITION_TABLE_SIZE - PARTITION_ENTRY_SIZE:
                entry_data = partition_data[offset:offset + PARTITION_ENTRY_SIZE]
                if entry_data[0:2] != b'\xaa\x50':  # Stop when we don't see the magic number
                    break
                
                partition = parse_partition_entry(entry_data)
                if partition is not None:
                    partitions.append(partition)
                offset += PARTITION_ENTRY_SIZE
        
        return partitions
    
    except FileNotFoundError:
        print(f"Error: Firmware file '{firmware_path}' not found", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error reading partition table: {e}", file=sys.stderr)
        sys.exit(1)

def main():
    parser = argparse.ArgumentParser(description='ESP32 Partition Table Parser')
    parser.add_argument('firmware', help='Path to the firmware file')
    parser.add_argument('--vfs-only', action='store_true', help='Only show VFS partition info')
    parser.add_argument('--offset-only', action='store_true', help='Only show VFS offset')
    args = parser.parse_args()
    
    if args.offset_only:
        offset = get_vfs_offset(args.firmware)
        if offset is not None:
            print(f"0x{offset:x}")
        sys.exit(0)
    
    partitions = parse_partition_table(args.firmware)
    partitions.sort(key=lambda x: x.offset)
    
    if args.vfs_only:
        vfs_partition = next((p for p in partitions if p.name == "vfs"), None)
        if vfs_partition:
            print(str(vfs_partition))
    else:
        print("# Name, Type, SubType, Offset, Size, Flags")
        for partition in partitions:
            print(str(partition))

if __name__ == '__main__':
    main()