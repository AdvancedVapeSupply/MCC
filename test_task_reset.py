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
    print("Testing Task Statistics Reset")
    
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
    
    # Test MCT_TASK reset_stats function
    ret, output = run_cmd(f"mpremote connect {mct_port} exec \"import MCT_TASK; print('MCT_TASK imported successfully'); print('Testing reset_stats()...'); MCT_TASK.reset_stats(); print('reset_stats() completed successfully')\"", "Test MCT_TASK reset_stats()")
    if ret != 0:
        print("Failed to test reset_stats()")
        return False
    
    print("reset_stats() test result:", output)
    
    # Test creating a simple task and resetting its stats
    ret, output = run_cmd(f"mpremote connect {mct_port} exec \"import MCT_TASK; def test_task(): pass; task = MCT_TASK.start_new_task(test_task, None, 100); print('Task created'); print('Call count before reset:', task.call_count); MCT_TASK.reset_stats(); print('Call count after reset:', task.call_count)\"", "Test Task Statistics Reset")
    if ret != 0:
        print("Failed to test task statistics reset")
        return False
    
    print("Task statistics reset test result:", output)
    
    # Test the full MCT system with reset_stats
    ret, output = run_cmd(f"mpremote connect {mct_port} exec \"import MCT; mct = MCT.MCT(); print('MCT created'); import MCT_TASK; print('Testing reset_stats before taskShow...'); MCT_TASK.reset_stats(); print('reset_stats completed')\"", "Test MCT with reset_stats")
    if ret != 0:
        print("Failed to test MCT with reset_stats")
        return False
    
    print("MCT with reset_stats test result:", output)
    
    print("✅ All task statistics reset tests completed!")
    return True

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1) 