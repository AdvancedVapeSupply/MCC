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
    print("Debugging Motor Vibration - Monitoring PWM State")
    
    # Check if device is connected
    ret, output = run_cmd("mpremote devs", "Check Device Info")
    if ret != 0:
        print("Failed to check device info")
        return False
    
    # Look for the MCT device
    mct_port = None
    for line in output.splitlines():
        if "303a:0420" in line and "AVS MCT" in line:
            mct_port = line.split()[0]
            print(f"Found MCT device on port: {mct_port}")
            break
    
    if not mct_port:
        print("MCT device not found. Please ensure device is connected.")
        return False
    
    # Create debug script to monitor motor PWM
    debug_script = '''
import time
import machine
from machine import PWM, Pin

# Pin 16 is the motor PWM pin
MOTOR_PIN = 16

print("=== Motor PWM Debug Monitor ===")
print("Monitoring motor PWM state every 500ms...")
print("Press Ctrl+C to stop")
print()

# Get the motor PWM object
motor_pwm = PWM(Pin(MOTOR_PIN))

# Monitor for 30 seconds
start_time = time.ticks_ms()
duration = 30000  # 30 seconds

while time.ticks_diff(time.ticks_ms(), start_time) < duration:
    current_time = time.ticks_ms()
    duty = motor_pwm.duty()
    freq = motor_pwm.freq()
    
    if duty > 0:
        print(f"[{current_time/1000:.1f}s] MOTOR ACTIVE - Duty: {duty}, Freq: {freq}Hz")
    else:
        print(f"[{current_time/1000:.1f}s] Motor idle - Duty: {duty}, Freq: {freq}Hz")
    
    time.sleep_ms(500)

print("\\n=== Debug Complete ===")
print("If motor was vibrating but duty was 0, check for:")
print("1. Hardware issues (loose connections)")
print("2. Other PWM channels interfering")
print("3. Power supply noise")
print("4. Software bugs in other modules")
'''

    # Write debug script to file
    with open("motor_debug_script.py", "w") as f:
        f.write(debug_script)
    
    # Upload and run debug script
    ret, output = run_cmd(f"mpremote connect {mct_port} cp motor_debug_script.py :motor_debug_script.py", "Upload Debug Script")
    if ret != 0:
        print("Failed to upload debug script")
        return False
    
    print("Running motor PWM debug monitor for 30 seconds...")
    print("This will show you the motor PWM duty cycle and frequency every 500ms")
    print("If the motor is vibrating but duty is 0, it's likely a hardware issue")
    print()
    
    ret, output = run_cmd(f"mpremote connect {mct_port} run motor_debug_script.py", "Run Motor Debug")
    
    # Clean up
    run_cmd(f"mpremote connect {mct_port} rm motor_debug_script.py", "Clean Up Debug Script")
    
    return True

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1) 