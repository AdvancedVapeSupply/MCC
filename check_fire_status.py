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
    print("Checking Fire System Status")
    
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
    
    # Create status check script
    status_script = '''
import MCT

print("=== Fire System Status ===")
print(f"Fire system active: {MCT.fire.is_firing}")
print(f"Fire system ABORT: {MCT.fire.ABORT}")
print(f"Output control duty: {MCT.output_ctrl.duty()}")
print(f"Motor PWM duty: {MCT.motor_pwm.duty()}")
print(f"Motor PWM freq: {MCT.motor_pwm.freq()}Hz")

if hasattr(MCT.fire, 'motor_start_time'):
    print(f"Motor start time: {MCT.fire.motor_start_time}")
    if MCT.fire.motor_start_time:
        import time
        elapsed = (time.ticks_ms() - MCT.fire.motor_start_time) / 1000
        print(f"Motor elapsed time: {elapsed:.1f}s")

print("\\n=== State Information ===")
print(f"Temperature set: {MCT.state.Tset.F}°F")
print(f"Temperature current: {MCT.state.Tescc.F}°F")
print(f"Power set: {MCT.state.Pset}W")
print(f"Power real: {MCT.state.Preal}W")
print(f"Fire time: {MCT.state.tFire_s:.1f}s")
print(f"Fire time set: {MCT.state.tFset_s}s")

print("\\n=== Boost Status ===")
print(f"Boost enabled: {MCT.boost_en.value()}")
print(f"Boost control duty: {MCT.boost_ctrl_v.duty()}")

print("\\n=== Motor Control Constants ===")
print(f"MOTOR_HAPTIC: {MCT.fire.MOTOR_HAPTIC}")
print(f"MOTOR_MAX: {MCT.fire.MOTOR_MAX}")
print(f"MOTOR_STARTUP_TIME: {MCT.fire.MOTOR_STARTUP_TIME}s")
print(f"MOTOR_FULL_DURATION: {MCT.fire.MOTOR_FULL_DURATION}s")
'''

    # Write status script to file
    with open("fire_status_script.py", "w") as f:
        f.write(status_script)
    
    # Upload and run status script
    ret, output = run_cmd(f"mpremote connect {mct_port} cp fire_status_script.py :fire_status_script.py", "Upload Status Script")
    if ret != 0:
        print("Failed to upload status script")
        return False
    
    ret, output = run_cmd(f"mpremote connect {mct_port} run fire_status_script.py", "Check Fire Status")
    
    # Clean up
    run_cmd(f"mpremote connect {mct_port} rm fire_status_script.py", "Clean Up Status Script")
    
    return True

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1) 