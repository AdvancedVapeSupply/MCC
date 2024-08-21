import os

def main():
    parser = argparse.ArgumentParser(description="Modify firmware by replacing VFS partition.")
    parser.add_argument("--source_dir", type=str, default="../MCT", help="Source directory to copy files from (default: ../MCT)")
    parser.add_argument("--port", type=str, help="Serial port of the ESP32 (e.g., /dev/tty.usbmodem*)")
    parser.add_argument("--partition_table", type=str, default="partitions.csv", help="Path to the partition table CSV file")
    parser.add_argument("--skip_validation", action="store_true", help="Skip firmware image validation")
    
    args = parser.parse_args()

    if not args.port:
        default_port = find_esp32_port()
        if default_port:
            print(f"No port specified. Using detected port: {default_port}")
            args.port = default_port
        else:
            print("Error: No port specified and no ESP32 port detected automatically.")
            print("Please specify the port using the --port argument.")
            print("Example: --port /dev/tty.usbmodem*")
            return

    script_dir = os.path.dirname(os.path.abspath(__file__))
    partition_table_path = os.path.join(script_dir, args.partition_table)

    if not os.path.exists(partition_table_path):
        print(f"Error: Partition table file not found at {partition_table_path}")
        print("Please make sure the file exists or provide the correct path using --partition_table argument.")
        return

    partitions = parse_partition_table(partition_table_path)
    
    for partition in partitions:
        if partition['name'] == 'vfs':
            vfs_size = partition['size']
            create_vfs_image(f"{partition['name']}.bin", vfs_size, args.source_dir)
        elif partition['name'] == 'mct':
            create_mct_image(f"{partition['name']}.bin", partition['size'], args.source_dir)
        else:
            pass

    output_combined_bin = "merged_firmware.bin"
    merge_partitions(partitions, output_combined_bin)

    if not args.skip_validation:
        if not validate_firmware_image(output_combined_bin):
            print("Firmware image validation failed. Aborting flash process.")
            return

    flash_firmware(output_combined_bin)

    try:
        verify_vfs_contents(args.source_dir, args.port)
    except serial.SerialException as e:
        print(f"Error accessing the serial port: {e}")
        print("Please make sure the device is connected and the port is correct.")
        return

    for partition in partitions:
        os.unlink(f"{partition['name']}.bin")
    os.unlink(output_combined_bin)

    print("Firmware modification, flashing, and verification complete.")

if __name__ == "__main__":
    main()