
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

print("\n=== Debug Complete ===")
print("If motor was vibrating but duty was 0, check for:")
print("1. Hardware issues (loose connections)")
print("2. Other PWM channels interfering")
print("3. Power supply noise")
print("4. Software bugs in other modules")
