#!/usr/bin/env python3

import os
import sys
print(f"DEBUG: Script loaded, PID={os.getpid()}, ARGV={sys.argv}")
import time
import subprocess
import logging
from datetime import datetime
from pathlib import Path
import json
import venv
import shutil
from typing import Optional, Tuple

# Guard against accidental import – this script should only be executed, not imported.
if __name__ != "__main__":
    sys.exit(0)

# Color definitions for terminal output
class Colors:
    RED = '\033[0;31m'
    GREEN = '\033[0;32m'
    YELLOW = '\033[1;33m'
    BLUE = '\033[0;34m'
    NC = '\033[0m'  # No Color

# ------------------------- Argument parsing ------------------------------
import argparse

# ----------------------- Constants / defaults ----------------------------
DEFAULT_WIFI_SSID = "AVS"
DEFAULT_WIFI_PASS = "Advanced"
# Registry endpoint from register.sh
SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxqaIPGjRak5-k41r5-p2yAavuSaxmHkiAIBc9fr3PDGShNkjRZCoyencZPPduzV8geww/exec"

def setup_logging() -> Tuple[Path, logging.Logger]:
    """Set up logging configuration."""
    mcc_root = Path(__file__).parent
    logs_dir = mcc_root / "logs"
    logs_dir.mkdir(exist_ok=True)
    
    log_file = logs_dir / f"mct_flash_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"
    
    logger = logging.getLogger()  # Use root logger
    logger.setLevel(logging.INFO)

    # Remove all handlers associated with the logger
    if logger.hasHandlers():
        logger.handlers.clear()
    
    # File handler
    file_handler = logging.FileHandler(log_file)
    file_handler.setLevel(logging.INFO)
    
    # Console handler
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.INFO)
    
    # Create formatter
    formatter = logging.Formatter('%(message)s')
    file_handler.setFormatter(formatter)
    console_handler.setFormatter(formatter)
    
    # Add handlers
    logger.addHandler(file_handler)
    logger.addHandler(console_handler)
    
    return log_file, logger

def echo_status(logger: logging.Logger, color: str, message: str):
    """Log message only (no print)."""
    logger.info(message)

def run_cmd(cmd, description, logger):
    """Run a command and log its output."""
    echo_status(logger, Colors.BLUE, f"=== {description} ===")
    echo_status(logger, Colors.BLUE, f"Command: {cmd}")
    
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
        output = result.stdout + result.stderr
        
        echo_status(logger, Colors.BLUE, f"Output:\n{output}")
        echo_status(logger, Colors.BLUE, "===================")
        
        return result.returncode, output
    except Exception as e:
        echo_status(logger, Colors.RED, f"Error executing command: {str(e)}")
        return -1, str(e)

def setup_virtual_environment(logger: logging.Logger) -> None:
    """Create and activate virtual environment if it doesn't exist."""
    mcc_root = Path(__file__).parent
    venv_dir = mcc_root / ".venv"
    
    if not venv_dir.exists():
        echo_status(logger, Colors.BLUE, "Creating virtual environment...")
        venv.create(venv_dir, with_pip=True)
    
    # Install required packages
    echo_status(logger, Colors.BLUE, "Installing required packages...")
    run_cmd('pip install "git+https://github.com/espressif/esptool.git@a32988e2d5f02845ce16e22022f5b64368f12572#egg=esptool"', "Install esptool", logger)
    run_cmd("pip install mpremote", "Install mpremote", logger)

def find_bootloader_port(logger: logging.Logger) -> Optional[str]:
    """Find the bootloader port for the ESP32 device."""
    known_pids = "1001|2008|0002|0001"
    
    # Get device info
    _, device_info = run_cmd("mpremote devs", "Check Device Info", logger)
    echo_status(logger, Colors.BLUE, "mpremote devs output:")
    echo_status(logger, Colors.NC, device_info)
    
    # Try to find a port with VID 303a and a known PID, excluding debug console
    bootloader_port = None
    for line in device_info.splitlines():
        port = line.split()[0]
        if "debug-console" in port:
            continue
        if "usbmodem" in port:
            bootloader_port = port
            break
        if f"303a:({known_pids})" in line:
            bootloader_port = port
            break
    
    if not bootloader_port:
        # Fallback to any port with VID 303a, still excluding debug console
        for line in device_info.splitlines():
            port = line.split()[0]
            if "debug-console" in port:
                continue
            if "303a:" in line:
                bootloader_port = port
                break
        
        if bootloader_port:
            echo_status(logger, Colors.BLUE, "Attempting to reset device into bootloader mode...")
            
            # First try watchdog reset to enter bootloader mode
            run_cmd(f"esptool.py --chip esp32s3 --port \"{bootloader_port}\" --before default_reset --after watchdog_reset chip_id",
                   "Reset Device with Watchdog", logger)
            
            time.sleep(2)
            
            # Check if device is now in bootloader mode
            _, device_info = run_cmd("mpremote devs", "Check Device Info After Reset", logger)
            for line in device_info.splitlines():
                port = line.split()[0]
                if "debug-console" in port:
                    continue
                if f"303a:({known_pids})" in line:
                    bootloader_port = port
                    break
            
            if not bootloader_port:
                # Try to force download mode using watchdog reset
                echo_status(logger, Colors.BLUE, "First reset attempt failed, trying to force download mode...")
                run_cmd(f"esptool.py --chip esp32s3 --port \"{bootloader_port}\" --before no_reset --after watchdog_reset write_flash 0x0 /dev/zero 0x1000",
                       "Force Download Mode", logger)
                
                time.sleep(2)
                
                # Check if device is now in bootloader mode
                _, device_info = run_cmd("mpremote devs", "Check Device Info After Force Download", logger)
                for line in device_info.splitlines():
                    port = line.split()[0]
                    if "debug-console" in port:
                        continue
                    if f"303a:({known_pids})" in line:
                        bootloader_port = port
                        break
                
                if not bootloader_port:
                    echo_status(logger, Colors.RED, "Could not reset device into bootloader mode. Please try manually by:")
                    echo_status(logger, Colors.RED, "1. Hold down the BOOT button")
                    echo_status(logger, Colors.RED, "2. Press and release the EN button")
                    echo_status(logger, Colors.RED, "3. Release the BOOT button")
                    return None
    
    if not bootloader_port:
        bootloader_port = "/dev/cu.usbmodem1101"
        echo_status(logger, Colors.YELLOW, f"Defaulting serial port to {bootloader_port}")
    else:
        echo_status(logger, Colors.GREEN, f"Found Espressif device on port: {bootloader_port}")
    
    return bootloader_port

def get_mac_address(port: str, logger: logging.Logger) -> Optional[str]:
    """Get MAC address from device using esptool."""
    _, output = run_cmd(f"esptool.py --port \"{port}\" chip_id", "Get MAC Address", logger)
    mac_addr = None
    
    for line in output.splitlines():
        if "MAC:" in line:
            mac_addr = line.split("MAC:")[1].strip()
            break
    
    if not mac_addr:
        echo_status(logger, Colors.RED, "Failed to get MAC address before flashing. Cannot proceed.")
        return None
    
    echo_status(logger, Colors.GREEN, f"Device MAC address: {mac_addr}")
    return mac_addr

def flash_firmware(port: str, logger: logging.Logger) -> bool:
    """Flash firmware to the device using watchdog reset for more reliable operation."""
    mcc_root = Path(__file__).parent
    firmware_dir = mcc_root / "firmware"
    
    echo_status(logger, Colors.BLUE, "Flashing firmware...")
    
    # Erase flash using watchdog reset
    run_cmd(f"esptool.py --chip esp32s3 --port \"{port}\" --baud 921600 --before default_reset --after watchdog_reset erase_flash",
            "Erase Flash", logger)
    
    time.sleep(5)  # Shorter delay after erase
    
    # Write flash (let esptool detect flash size automatically) using watchdog reset
    run_cmd(
        f"esptool.py --chip esp32s3 --port \"{port}\" --baud 921600 "
        f"--before default_reset --after watchdog_reset write_flash -z "
        f"--flash_mode dio --flash_freq 80m "
        f"0x0 \"{firmware_dir}/bootloader.bin\" "
        f"0x8000 \"{firmware_dir}/partition-table.bin\" "
        f"0x20000 \"{firmware_dir}/micropython.bin\"",
        "Write Flash",
        logger,
    )
    
    # Give the device time to boot into MicroPython
    echo_status(logger, Colors.BLUE, "Waiting for device to boot into MicroPython...")
    time.sleep(5)  # Shorter wait time
    
    # Tell ROM to exit bootloader and run the flashed firmware, then hard-reset
    run_cmd(
        f"esptool.py --chip esp32s3 --port \"{port}\" run",
        "Run flashed firmware",
        logger,
    )

    # Wait and rescan for CDC/REPL interface
    max_attempts = 10
    attempt = 1
    repl_port = None
    while attempt <= max_attempts and not repl_port:
        echo_status(logger, Colors.BLUE, f"Waiting for REPL port (attempt {attempt}/{max_attempts})…")
        time.sleep(2)
        _, device_info = run_cmd("mpremote devs", "Check Device Info", logger)
        for line in device_info.splitlines():
            if "303a:4001" in line:
                repl_port = line.split()[0]
                break
        if repl_port:
            break
        attempt += 1

    if repl_port:
        logger.info(f"Detected MicroPython CDC port: {repl_port}")
        globals()["_mct_repl_port"] = repl_port
    else:
        echo_status(logger, Colors.YELLOW, "REPL port not detected automatically; script will still attempt mpremote without explicit port.")
    
    return True

# --------------------- Helper functions added ----------------------------

def git_short_hash() -> str:
    """Return the short git hash of HEAD, or 'unknown' if git unreachable."""
    try:
        return (
            subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], text=True)
            .strip()
        )
    except Exception:
        return "unknown"


def create_payload(uuid: str, test_status: str, **extra_fields) -> str:
    """Create JSON payload similar to register.sh create_payload."""
    payload = {
        "uuid": uuid,
        "timestamp": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "version": git_short_hash(),
        "test_status": test_status,
    }
    payload.update(extra_fields)
    return json.dumps(payload)


def register_data(payload: str, description: str, logger) -> bool:
    """POST payload to registry and return success bool."""
    echo_status(logger, Colors.YELLOW, f"=== REGISTERING {description} ===")
    echo_status(logger, Colors.BLUE, f"{description} payload:\n{payload}")

    try:
        result = subprocess.run(
            [
                "curl",
                "-s",
                "-L",
                "-H",
                "Content-Type: application/json",
                "-H",
                "X-Requested-With: XMLHttpRequest",
                "-d",
                payload,
                SCRIPT_URL,
            ],
            capture_output=True,
            text=True,
        )
        resp = result.stdout.strip()
        if "success" in resp:
            echo_status(logger, Colors.GREEN, f"{description} results recorded successfully")
            return True
        else:
            echo_status(logger, Colors.RED, f"Failed to update registry with {description}. Response:\n{resp}")
            return False
    except Exception as e:
        echo_status(logger, Colors.RED, f"Error posting to registry: {e}")
        return False


def set_nvs_values(repl_port: Optional[str], wifi_ssid: str, wifi_pass: str, sn_mct: str, sn_led: str, logger):
    """Write NVS values on the device using mpremote."""
    echo_status(logger, Colors.BLUE, "Setting NVS values on device…")

    # Build mpremote base command
    base_cmd = "mpremote"
    if repl_port:
        base_cmd += f" connect {repl_port}"

    def exec_py(py: str) -> bool:
        cmd = f"{base_cmd} exec \"{py}\""
        ret, _ = run_cmd(cmd, "Set NVS", logger)
        return ret == 0

    cmds = [
        f"import nvs; nvs.set_nvs('wifi.ssid', '{wifi_ssid}')",
        f"import nvs; nvs.set_nvs('wifi.passwd', '{wifi_pass}')",
        f"import nvs; nvs.set_nvs('serial.board', '{sn_mct}')",
        f"import nvs; nvs.set_nvs('serial.mfg', '{sn_led}')",
    ]

    success = True
    for c in cmds:
        if not exec_py(c):
            success = False
    return success

# ------------------------- Argument parsing impl -------------------------

def parse_args():
    parser = argparse.ArgumentParser(description="Flash and configure MCT board (Python version).")
    parser.add_argument("--sn_mct", help="Serial number of the MCT board (defaults to MAC address)")
    parser.add_argument("--sn_led", help="Serial number of the LED board (defaults to sn_mct or MAC address)")
    parser.add_argument("--wifi_ssid", default=DEFAULT_WIFI_SSID, help="WiFi SSID (default: AVS)")
    parser.add_argument("--wifi_pass", default=DEFAULT_WIFI_PASS, help="WiFi password (default: Advanced)")
    return parser.parse_args()

def main():
    # Parse CLI args first
    args = parse_args()

    # Setup logging
    log_file, logger = setup_logging()
    # Only print once
    echo_status(logger, Colors.BLUE, "Running load_mct.py")
    
    # Setup virtual environment and install dependencies
    setup_virtual_environment(logger)
    
    # Find bootloader port
    port = find_bootloader_port(logger)
    if not port:
        echo_status(logger, Colors.RED, "Could not find bootloader port. Exiting.")
        return False
    
    # Get MAC address
    mac_addr = get_mac_address(port, logger)
    if not mac_addr:
        echo_status(logger, Colors.RED, "Could not get MAC address. Exiting.")
        return False
    
    # Use MAC address if no serial numbers provided
    sn_mct = args.sn_mct or mac_addr.replace(":", "")
    sn_led = args.sn_led or sn_mct
    
    # Flash firmware
    if not flash_firmware(port, logger):
        echo_status(logger, Colors.RED, "Failed to flash firmware. Exiting.")
        return False
    
    echo_status(logger, Colors.GREEN, "Firmware flashed successfully.")
    
    # Check MicroPython REPL access (use detected port if we have one)
    echo_status(logger, Colors.BLUE, "Checking MicroPython REPL access…")
    repl_cmd = "mpremote exec \"print('OK')\""
    if '_mct_repl_port' in globals():
        repl_cmd = f"mpremote connect {globals()['_mct_repl_port']} exec \"print('OK')\""

    _, output = run_cmd(repl_cmd, "Check REPL", logger)

    if "OK" not in output:
        echo_status(logger, Colors.RED, "Failed to access MicroPython REPL.")
        return False

    echo_status(logger, Colors.GREEN, "MicroPython REPL is accessible and working!")

    # ---------------- Set NVS values -----------------
    repl_port = globals().get('_mct_repl_port')
    if not set_nvs_values(
        repl_port,
        args.wifi_ssid,
        args.wifi_pass,
        sn_mct,
        sn_led,
        logger,
    ):
        echo_status(logger, Colors.RED, "Failed to set NVS values.")
        return False

    # ---------------- Registry updates ---------------
    # Load version info
    mcc_root = Path(__file__).parent
    version_file = mcc_root / "firmware" / "version_info.json"
    mct_version = lvgl_version = "unknown"
    if version_file.exists():
        try:
            data = json.loads(version_file.read_text())
            mct_version = data.get("mct_commit", "unknown")
            lvgl_version = data.get("lvgl_commit", "unknown")
        except Exception as e:
            echo_status(logger, Colors.YELLOW, f"Could not read version_info.json: {e}")

    mac_clean = mac_addr.lower().replace(":", "") if mac_addr else "unknown"

    payload_flash = create_payload(
        mac_clean,
        "flashed",
        sn_mct=sn_mct,
        sn_led=sn_led,
        **{"ota_0.upy": lvgl_version, "ota_0.mct": mct_version},
    )
    if not register_data(payload_flash, "FLASH", logger):
        echo_status(logger, Colors.YELLOW, "Registry FLASH update failed but continuing…")

    # After we have REPL and NVS set, push REPL TEST record
    payload_repl = create_payload(
        mac_clean,
        "test_repl",
        **{"ota_0.upy": lvgl_version, "ota_0.mct": mct_version},
    )
    register_data(payload_repl, "REPL TEST", logger)

    echo_status(logger, Colors.GREEN, "All steps completed successfully!")
    return True

if __name__ == "__main__":
    sys.exit(0 if main() else 1) 