import time
import MCT

# Initialize MCT
mct = MCT.MCT()

# Enable timing in update_state
def timed_update_state():
    start_time = time.ticks_us()
    mct.state.update_state(timing=True)
    end_time = time.ticks_us()
    total_time = time.ticks_diff(end_time, start_time)
    return total_time

print("Running performance analysis...")
print("=" * 50)

# Run multiple iterations to get timing data
times = []
for i in range(10):
    print(f"Iteration {i+1}/10...")
    t = timed_update_state()
    times.append(t)
    time.sleep_ms(100)  # Small delay between measurements

print("\nPerformance Results:")
print(f"Average time: {sum(times)/len(times):.2f} us")
print(f"Min time: {min(times):.2f} us")
print(f"Max time: {max(times):.2f} us")
print(f"Standard deviation: {((sum((x - sum(times)/len(times))**2 for x in times)/len(times))**0.5):.2f} us")

# Test individual components
print("\nTesting individual components...")

# Test ADC reading
print("\n1. Testing ADC reading (mct.R()):")
adc_times = []
for i in range(5):
    start = time.ticks_us()
    r = mct.R(debug=False)
    end = time.ticks_us()
    adc_times.append(time.ticks_diff(end, start))
    print(f"  R() call {i+1}: {adc_times[-1]} us, R = {r:.2f} Ω")

print(f"  ADC average: {sum(adc_times)/len(adc_times):.2f} us")

# Test temperature reading
print("\n2. Testing temperature reading:")
temp_times = []
for i in range(5):
    start = time.ticks_us()
    try:
        temp_C, _, _ = mct.temperature.read()
    except:
        temp_C = 25.0
    end = time.ticks_us()
    temp_times.append(time.ticks_diff(end, start))
    print(f"  Temperature read {i+1}: {temp_times[-1]} us, T = {temp_C:.1f}°C")

print(f"  Temperature average: {sum(temp_times)/len(temp_times):.2f} us")

# Test power measurements
print("\n3. Testing power measurements:")
power_times = []
for i in range(5):
    start = time.ticks_us()
    vbat = mct.power_in.bus_voltage()
    ibat = mct.power_in.current()
    vout = mct.power_out.bus_voltage()
    iout = mct.power_out.current()
    end = time.ticks_us()
    power_times.append(time.ticks_diff(end, start))
    print(f"  Power read {i+1}: {power_times[-1]} us, Vbat={vbat:.2f}V, Ibat={ibat:.3f}A, Vout={vout:.2f}V, Iout={iout:.3f}A")

print(f"  Power average: {sum(power_times)/len(power_times):.2f} us")

# Test ESCC update
print("\n4. Testing ESCC update:")
escc_times = []
for i in range(5):
    start = time.ticks_us()
    mct.escc.update_T(0.0)  # Update with 0 power
    end = time.ticks_us()
    escc_times.append(time.ticks_diff(end, start))
    print(f"  ESCC update {i+1}: {escc_times[-1]} us")

print(f"  ESCC average: {sum(escc_times)/len(escc_times):.2f} us")

print("\n" + "=" * 50)
print("Analysis complete!") 