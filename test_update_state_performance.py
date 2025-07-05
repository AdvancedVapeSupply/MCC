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
    print("Testing MCT_STATE update_state performance optimizations")
    
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
    
    # Test script to measure update_state performance
    test_script = '''
import time
import MCT

# Initialize MCT
mct = MCT.MCT()

print("Testing update_state performance...")
print("=" * 50)

# Test with timing enabled
print("\\nRunning update_state with timing enabled:")
times = []
for i in range(10):
    print(f"Iteration {i+1}/10...")
    start_time = time.ticks_us()
    mct.state.update_state(timing=True)
    end_time = time.ticks_us()
    total_time = time.ticks_diff(end_time, start_time)
    times.append(total_time)
    time.sleep_ms(100)

print("\\nPerformance Results:")
print(f"Average execution time: {sum(times)/len(times):.2f} us")
print(f"Min execution time: {min(times):.2f} us")
print(f"Max execution time: {max(times):.2f} us")
print(f"Standard deviation: {((sum((x - sum(times)/len(times))**2 for x in times)/len(times))**0.5):.2f} us")

# Check if performance is acceptable (should be under 100ms = 100,000 us)
avg_time_ms = sum(times)/len(times) / 1000
if avg_time_ms < 100:
    print(f"✅ Performance is good: {avg_time_ms:.2f} ms average")
else:
    print(f"❌ Performance is still too slow: {avg_time_ms:.2f} ms average")

# Test cache behavior
print("\\nTesting cache behavior:")
print("Running 20 iterations to see cache effects...")

cache_times = []
for i in range(20):
    start_time = time.ticks_us()
    mct.state.update_state(timing=False)  # Disable timing for cleaner output
    end_time = time.ticks_us()
    cache_times.append(time.ticks_diff(end_time, start_time))
    time.sleep_ms(50)

print("\\nCache Performance Results:")
print(f"First 5 iterations (cache miss): {sum(cache_times[:5])/5:.2f} us average")
print(f"Last 5 iterations (cache hit): {sum(cache_times[-5:])/5:.2f} us average")
print(f"Overall average: {sum(cache_times)/len(cache_times):.2f} us")

print("\\n" + "=" * 50)
print("Test complete!")
'''
    
    # Run the test
    ret, output = run_cmd(f"mpremote connect {mct_port} exec \"{test_script}\"", "Performance Test")
    if ret != 0:
        print("Failed to run performance test")
        print("Error output:", output)
        return False
    
    print("✅ Performance test completed successfully!")
    return True

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1) 