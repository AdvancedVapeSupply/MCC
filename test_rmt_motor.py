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
    print("Testing RMT Motor Control")
    
    # Check if device is connected
    ret, output = run_cmd("mpremote devs", "Check Device Info")
    if ret != 0:
        print("No device found")
        return False
    
    # Extract device port
    lines = output.strip().split('\n')
    mct_port = None
    for line in lines:
        if 'MCT' in line or 'usbmodem' in line:
            parts = line.split()
            if len(parts) >= 2:
                mct_port = parts[0]
                break
    
    if not mct_port:
        print("MCT device not found")
        return False
    
    print(f"Using device: {mct_port}")
    
    # Create RMT motor test script
    rmt_test_script = '''
import time
from machine import RMT, Pin

# Test RMT motor control
print("Testing RMT motor control...")

try:
    # Initialize RMT for motor control
    # Use RMT channel 0, motor PWM pin, 10MHz resolution
    motor_rmt = RMT(id=0, pin=Pin(21), clock_div=8, idle_level=False)
    print("✅ RMT initialized successfully")
    
    # Create PWM-like signal: 50% duty cycle at 5kHz
    # Period = 200us (5kHz), ON time = 100us (50% duty)
    # RMT resolution: 10MHz = 10ns per tick
    on_ticks = 10000   # 100us ON time
    off_ticks = 10000  # 100us OFF time
    
    # Generate 5 pulses (100ms total) for testing
    durations = [on_ticks, off_ticks] * 5  # 5 complete cycles
    data = [True, False] * 5  # ON, OFF, ON, OFF, ...
    
    print("Sending RMT pulses...")
    motor_rmt.write_pulses(durations, data)
    print("✅ RMT pulses sent successfully")
    
    # Wait for completion
    print("Waiting for RMT to complete...")
    if motor_rmt.wait_done(timeout=1000):
        print("✅ RMT completed successfully")
    else:
        print("⚠️ RMT timeout")
    
    # Clean up
    motor_rmt.deinit()
    print("✅ RMT cleaned up")
    
except Exception as e:
    print(f"❌ RMT test failed: {e}")
    import sys
    sys.print_exception(e)

print("RMT motor test complete")
'''
    
    # Write test script to temporary file
    with open("temp_rmt_test.py", "w") as f:
        f.write(rmt_test_script)
    
    # Upload test script
    ret, output = run_cmd(f"mpremote connect {mct_port} cp temp_rmt_test.py :test_rmt_motor.py", "Upload RMT Test Script")
    if ret != 0:
        print("Failed to upload RMT test script")
        return False
    
    print("Running RMT motor test...")
    ret, output = run_cmd(f"mpremote connect {mct_port} run test_rmt_motor.py", "Run RMT Test")
    
    # Clean up
    run_cmd(f"mpremote connect {mct_port} rm test_rmt_motor.py", "Clean Up Test Script")
    run_cmd("rm temp_rmt_test.py", "Clean Up Local File")
    
    return True

if __name__ == "__main__":
    main() 