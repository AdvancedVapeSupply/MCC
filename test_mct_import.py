#!/usr/bin/env python3

import subprocess
import time
import sys
from pathlib import Path

def run_cmd(cmd, description):
    """Run a command and return the result."""
    print(f"=== {description} ===")
    print(f"Command: {cmd}")
    
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
        output = result.stdout + result.stderr
        print(f"Output:\n{output}")
        print("===================")
        return result.returncode, output
    except Exception as e:
        print(f"Error executing command: {str(e)}")
        return -1, str(e)

def main():
    print("Testing MCT import with filesystem.bin")
    
    # Check if device is connected
    ret, output = run_cmd("mpremote devs", "Check Device Info")
    if ret != 0:
        print("Failed to check device info")
        return False
    
    # Look for the MCT device (not in bootloader mode)
    mct_port = None
    for line in output.splitlines():
        if "303a:0420" in line and "AVS MCT" in line:
            mct_port = line.split()[0]
            print(f"Found MCT device on port: {mct_port}")
            break
    
    if not mct_port:
        print("MCT device not found. Please ensure device is connected and not in bootloader mode.")
        return False
    
    # Test basic MicroPython access
    ret, output = run_cmd(f"mpremote connect {mct_port} exec \"print('MicroPython OK')\"", "Test MicroPython Access")
    if ret != 0 or "MicroPython OK" not in output:
        print("Failed to access MicroPython REPL")
        return False
    
    print("MicroPython access successful!")
    
    # Test importing MCT
    ret, output = run_cmd(f"mpremote connect {mct_port} exec \"import MCT; print('MCT import successful')\"", "Test MCT Import")
    if ret != 0:
        print("Failed to import MCT")
        print("Error output:", output)
        return False
    
    if "MCT import successful" in output:
        print("✅ MCT import successful!")
    else:
        print("❌ MCT import failed")
        print("Error output:", output)
        return False
    
    # Test display initialization and check its attributes
    ret, output = run_cmd(f"mpremote connect {mct_port} exec \"import MCT; mct = MCT.MCT(); print('Display type:', type(mct.display)); print('Display dir:', dir(mct.display))\"", "Test Display Attributes")
    if ret != 0:
        print("Failed to check display attributes")
        return False
    
    print("Display attributes result:", output)
    
    # Test if display has a driver attribute
    ret, output = run_cmd(f"mpremote connect {mct_port} exec \"import MCT; mct = MCT.MCT(); print('Has driver attr:', hasattr(mct.display, 'driver')); print('Display attributes:', [attr for attr in dir(mct.display) if not attr.startswith('_')])\"", "Test Driver Attribute")
    if ret != 0:
        print("Failed to check driver attribute")
        return False
    
    print("Driver attribute check result:", output)
    
    # Test if MCT_DISPLAY has a display attribute
    ret, output = run_cmd(f"mpremote connect {mct_port} exec \"import MCT; mct = MCT.MCT(); print('Has display.display:', hasattr(mct.display, 'display')); print('MCT_DISPLAY attributes:', [attr for attr in dir(mct.display) if not attr.startswith('_')])\"", "Test MCT_DISPLAY Structure")
    if ret != 0:
        print("Failed to check MCT_DISPLAY structure")
        return False
    
    print("MCT_DISPLAY structure result:", output)
    
    print("✅ All tests completed successfully!")
    return True

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1) 