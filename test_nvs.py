import esp32
import sys

nvs = esp32.NVS('wifi')
try:
    # Get sizes first
    ssid_size = nvs.get_blob('ssid', bytearray(0))
    pass_size = nvs.get_blob('pass', bytearray(0))
    print(f'Sizes - SSID: {ssid_size}, Pass: {pass_size}')
    
    if ssid_size != 16 or pass_size != 72:
        print('Error: Invalid NVS sizes')
        sys.exit(1)
    
    # Now read with correct sizes
    ssid_bytes = bytearray(16)
    pass_bytes = bytearray(72)
    nvs.get_blob('ssid', ssid_bytes)
    nvs.get_blob('pass', pass_bytes)
    print(f'SSID: {ssid_bytes.decode().rstrip(chr(0))}, Password length: {len(pass_bytes)}')
except Exception as e:
    print(f'Error: {e}')
    sys.exit(1) 