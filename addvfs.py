import os
import subprocess
import argparse
import csv

# Define paths
vfs_image = "vfs.img"
firmware_path = "../lvgl_micropython/build/lvgl_micropy_ESP32_GENERIC_S3-SPIRAM_OCT-16.bin"
output_combined_bin = "combined_firmware.bin"

def run_command(cmd):
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"Error running command: {' '.join(cmd)}")
        print(f"Error output: {result.stderr}")
        raise subprocess.CalledProcessError(result.returncode, cmd)
    return result.stdout

def get_partition_table_from_csv(csv_path):
    partitions = []
    try:
        with open(csv_path, mode='r', newline='') as csvfile:
            reader = csv.reader(csvfile)
            for row in reader:
                # Skip comment rows and header
                if row and row[0].startswith('#'):
                    continue
                if len(row) < 5:
                    continue
                
                name = row[0].strip()
                type_ = row[1].strip()
                subtype = row[2].strip()
                offset = int(row[3].strip(), 16)
                size = int(row[4].strip(), 16)
                
                if name:
                    partitions.append({
                        'name': name.lower(),  # Normalize to lowercase
                        'type': type_,
                        'subtype': subtype,
                        'offset': offset,
                        'size': size
                    })
    except FileNotFoundError:
        print(f"Error: The CSV file {csv_path} does not exist.")
        raise
    except Exception as e:
        print(f"Error reading the CSV file: {e}")
        raise
    
    print(f"Partitions extracted: {partitions}")  # Debug statement
    return partitions

def get_vfs_size_from_partition_table(partitions):
    for partition in partitions:
        print(f"Checking partition: {partition}")  # Debug statement
        if partition['name'] == 'vfs':
            return partition['size']
    print("Available partitions:")
    for partition in partitions:
        print(f"Name: {partition['name']}, Type: {partition['type']}, Size: {partition['size']}")
    raise ValueError("VFS partition not found in the partition table")

def should_include_file(file_path):
    file_name = os.path.basename(file_path)
    return not (file_name.startswith('.') or 
                '__pycache__' in file_path or 
                '.idea' in file_path)

def create_directory_in_vfs(vfs_img_path, dir_path):
    try:
        subprocess.run(["mmd", "-i", vfs_img_path, f"::{dir_path}"], check=True)
    except subprocess.CalledProcessError:
        # Directory might already exist, which is fine
        pass

def create_vfs_image(vfs_img_path, vfs_size, source_dir):
    print(f"Creating VFS image {vfs_img_path} of size {vfs_size} bytes...")
    
    if os.path.exists(vfs_img_path):
        print(f"Removing existing {vfs_img_path}")
        os.remove(vfs_img_path)
    
    subprocess.run(["mkfs.fat", "-C", vfs_img_path, str(vfs_size // 1024)], check=True)
    
    for root, dirs, files in os.walk(source_dir):
        dirs[:] = [d for d in dirs if not d.startswith('.') and d != '.idea' and d != '__pycache__']
        
        rel_dir = os.path.relpath(root, source_dir)
        if rel_dir != '.':
            vfs_dir = rel_dir.replace(os.sep, '/')
            create_directory_in_vfs(vfs_img_path, vfs_dir)
        
        for file in files:
            src_path = os.path.join(root, file)
            if should_include_file(src_path):
                dest_path = os.path.relpath(src_path, source_dir)
                dest_path = f"::{dest_path.replace(os.sep, '/')}"
                
                try:
                    subprocess.run(["mcopy", "-i", vfs_img_path, src_path, dest_path], check=True)
                except subprocess.CalledProcessError as e:
                    print(f"Error copying {src_path} to {dest_path}: {e}")

def combine_firmware(partitions, vfs_image, firmware_path, output_bin):
    print(f"Combining firmware components into {output_bin} using esptool...")
    
    # Start building the command to merge all partitions
    cmd = ["esptool.py", "--chip", "esp32s3", "merge_bin", 
           "--fill-flash-size", "16MB",
           "-o", output_bin]

    # Add each partition with its offset
    for partition in partitions:
        partition_path = f"{partition['name']}.img"
        if os.path.exists(partition_path):
            offset_hex = hex(partition['offset'])
            print(f"Adding partition {partition_path} with offset {offset_hex}")
            cmd.extend([offset_hex, partition_path])
        else:
            print(f"Partition file {partition_path} does not exist, skipping.")
    
    # Print the command for debugging
    print(f"Running command: {' '.join(cmd)}")
    
    try:
        subprocess.run(cmd, check=True)
    except subprocess.CalledProcessError as e:
        print(f"Error during firmware combination: {e}")
        print(f"Command used: {' '.join(cmd)}")
        raise

def flash_firmware(combined_firmware_bin):
    print(f"Flashing combined firmware {combined_firmware_bin}...")
    
    subprocess.run([
        "esptool.py", "--chip", "esp32s3", "--baud", "921600", "--before", "default_reset", 
        "--after", "hard_reset", "write_flash", "-z", "--flash_mode", "dio", 
        "--flash_freq", "80m", "--flash_size", "16MB", 
        "0x0", combined_firmware_bin
    ], check=True)

def main():
    parser = argparse.ArgumentParser(description="Modify firmware by combining partitions and VFS image.")
    parser.add_argument("--source_dir", type=str, default="../MCT", help="Source directory to copy files from (default: ../MCT)")
    
    args = parser.parse_args()

    partition_table_path = "../lvgl_micropython/lib/micropython/ports/esp32/partitions-16MiB.csv"
    
    partitions = get_partition_table_from_csv(partition_table_path)
    vfs_size = get_vfs_size_from_partition_table(partitions)

    create_vfs_image(vfs_image, vfs_size, args.source_dir)

    # Print partition details for debugging
    print(f"Partition table for combining firmware: {partitions}")
    
    combine_firmware(partitions, vfs_image, firmware_path, output_combined_bin)

    flash_firmware(output_combined_bin)

    # Clean up temporary files
    os.unlink(vfs_image)

    print("Firmware combination and flashing complete.")

if __name__ == "__main__":
    main()