import esp32
import sys

# Function to write WiFi credentials to NVS
def write_wifi_credentials(ssid, password):
    try:
        nvs = esp32.NVS('wifi')
        # Remove erase_all as it may not be supported

        ssid_bytes = bytearray([0] * 16)
        password_bytes = bytearray([0] * 72)
        ssid_bytes[0:len(ssid)] = ssid.encode()
        password_bytes[0:len(password)] = password.encode()

        nvs.set_blob('ssid', ssid_bytes)
        nvs.set_blob('pass', password_bytes)
        nvs.commit()
        print('WiFi credentials written successfully')
    except Exception as e:
        print(f'Error writing WiFi credentials: {e}')
        sys.exit(1)

# Function to write serial numbers to NVS
def write_serial_numbers(sn_mct, sn_led):
    try:
        nvs = esp32.NVS('serial')
        mct_padded = bytearray([0] * 16)
        led_padded = bytearray([0] * 16)
        mct_padded[0:len(sn_mct)] = sn_mct.encode()
        led_padded[0:len(sn_led)] = sn_led.encode()

        nvs.set_blob('board_serial', mct_padded)
        nvs.set_blob('mfg_serial', led_padded)
        nvs.commit()
        print('Serial numbers written successfully')
    except Exception as e:
        print(f'Error writing serial numbers: {e}')
        sys.exit(1)

# Main execution
if __name__ == '__main__':
    write_wifi_credentials('$WIFI_SSID', '$WIFI_PASS')
    write_serial_numbers('$SN_MCT', '$SN_LED') 