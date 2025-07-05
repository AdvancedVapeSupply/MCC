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
    print("Testing Motor Control and vibe() method")
    
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
    
    # Test motor PWM initialization
    ret, output = run_cmd(f"mpremote connect {mct_port} exec \"from machine import Pin, PWM; motor_pwm = PWM(Pin(45)); print('Motor PWM initialized'); print('Initial duty:', motor_pwm.duty()); print('Initial freq:', motor_pwm.freq())\"", "Test Motor PWM Initialization")
    if ret != 0:
        print("Failed to initialize motor PWM")
        return False
    
    print("Motor PWM initialization result:", output)
    
    # Test vibe() method with Timer(2)
    ret, output = run_cmd(f"mpremote connect {mct_port} exec \"from machine import Pin, PWM, Timer; motor_pwm = PWM(Pin(45)); motor_pwm.duty(512); print('Motor ON at 50% duty'); timer = Timer(2).init(period=100, mode=Timer.ONE_SHOT, callback=lambda t: motor_pwm.duty(0)); print('Timer(2) created successfully')\"", "Test vibe() Method with Timer(2)")
    if ret != 0:
        print("Failed to test vibe() method")
        return False
    
    print("vibe() method test result:", output)
    
    # Test motor PWM status after vibe
    ret, output = run_cmd(f"mpremote connect {mct_port} exec \"from machine import Pin, PWM; motor_pwm = PWM(Pin(45)); print('Current motor duty:', motor_pwm.duty()); print('Current motor freq:', motor_pwm.freq())\"", "Check Motor Status After vibe()")
    if ret != 0:
        print("Failed to check motor status")
        return False
    
    print("Motor status after vibe() test:", output)
    
    # Test MCT import and vibe method
    ret, output = run_cmd(f"mpremote connect {mct_port} exec \"import MCT; mct = MCT.MCT(); print('MCT created successfully'); print('Testing vibe(True)...'); mct.vibe(True); print('vibe(True) completed'); print('Motor duty after vibe:', mct.motor_pwm.duty())\"", "Test MCT vibe() Method")
    if ret != 0:
        print("Failed to test MCT vibe() method")
        return False
    
    print("MCT vibe() method test result:", output)
    
    print("✅ All motor control tests completed!")
    return True

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1) 