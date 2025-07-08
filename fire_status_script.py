
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

print("\n=== State Information ===")
print(f"Temperature set: {MCT.state.Tset.F}°F")
print(f"Temperature current: {MCT.state.Tescc.F}°F")
print(f"Power set: {MCT.state.Pset}W")
print(f"Power real: {MCT.state.Preal}W")
print(f"Fire time: {MCT.state.tFire_s:.1f}s")
print(f"Fire time set: {MCT.state.tFset_s}s")

print("\n=== Boost Status ===")
print(f"Boost enabled: {MCT.boost_en.value()}")
print(f"Boost control duty: {MCT.boost_ctrl_v.duty()}")

print("\n=== Motor Control Constants ===")
print(f"MOTOR_HAPTIC: {MCT.fire.MOTOR_HAPTIC}")
print(f"MOTOR_MAX: {MCT.fire.MOTOR_MAX}")
print(f"MOTOR_STARTUP_TIME: {MCT.fire.MOTOR_STARTUP_TIME}s")
print(f"MOTOR_FULL_DURATION: {MCT.fire.MOTOR_FULL_DURATION}s")
