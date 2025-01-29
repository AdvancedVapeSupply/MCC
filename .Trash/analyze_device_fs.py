#!/usr/bin/env python3
import os
import sys
from parse_partition import parse_partition_table

def analyze_partitions(firmware_path: str):
    """Analyze all partitions in the firmware."""
    partitions = parse_partition_table(firmware_path)
    
    print("\nPartition Table Analysis:")
    print("-------------------------")
    for p in partitions:
        print(f"\nPartition: {p.name}")
        print(f"  Type: {p.type}")
        print(f"  Subtype: {p.subtype}")
        print(f"  Offset: 0x{p.offset:x}")
        print(f"  Size: 0x{p.size:x}")
    
    # Calculate total flash size needed
    max_addr = max(p.offset + p.size for p in partitions)
    print(f"\nTotal flash size needed: 0x{max_addr:x}")
    
    # Show VFS details
    vfs = next((p for p in partitions if p.name == "vfs"), None)
    if vfs:
        print("\nVFS Partition Details:")
        print(f"  Start: 0x{vfs.offset:x}")
        print(f"  Size: 0x{vfs.size:x}")
        print(f"  End: 0x{vfs.offset + vfs.size:x}")
        
        # Calculate FATFS parameters for this size
        cluster_size = 4096  # Common cluster size
        reserved_sectors = 1
        fat_copies = 1
        root_entries = 512
        
        total_sectors = vfs.size // cluster_size
        # FAT16 needs 2 bytes per cluster
        fat_size = ((total_sectors * 2) + (cluster_size - 1)) // cluster_size
        
        print("\nRecommended FATFS Parameters:")
        print(f"  Bytes per sector: {cluster_size}")
        print(f"  Sectors per cluster: 1")
        print(f"  Reserved sectors: {reserved_sectors}")
        print(f"  Number of FATs: {fat_copies}")
        print(f"  Root entries: {root_entries}")
        print(f"  Total sectors: {total_sectors}")
        print(f"  FAT size (sectors): {fat_size}")

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python3 analyze_device_fs.py <firmware.bin>")
        sys.exit(1)
        
    firmware_path = sys.argv[1]
    analyze_partitions(firmware_path)