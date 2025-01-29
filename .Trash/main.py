import time
import _thread
from logging import log_control, WARNING, DEBUG, INFO, getLogger

# Configure logger for this module
log = getLogger("MAIN")

# Switch to buffered mode and configure logging
log_control.disable_direct_write()
log_control.set_level(INFO)

# Enable debug logging for MCT_UI, MCT_FIRE, MCT_BUTTON, and MCT_FIRE_BETA2
log_control.set_level(logger="MCT", console=INFO)
log_control.set_level(logger="MCT_UI", console=DEBUG)
log_control.set_level(logger="MCT_FIRE", console=DEBUG)
log_control.set_level(logger="MCT_BUTTONS", console=INFO)
log_control.set_level(logger="MCT_FIRE_BETA2", console=DEBUG)
log_control.set_level(logger="MCT_LED_TILE", console=DEBUG)

try:
    log.info("Initializing MCT system...")
    import MCT
    mct = MCT.MCT()
    log_control.flush_all()
    
    try:
        mct.spawn()
        log.info("MCT spawn completed successfully")
    except Exception as spawn_error:
        log.error(f"Failed to spawn MCT: {spawn_error}")
        raise
    log_control.flush_all()
    
    time.sleep(1)
    
    log.info("LED")
    from tiles.led import MCT_LED_TILE
    led = MCT_LED_TILE(mct)
    
    log.info(f"UI TILE")
    from tiles.MCT_UI import MCT_UI
    ui = MCT_UI(mct)
    log.info("ui.set_tile()")
    ui.set_tile()
    log_control.flush_all()

    from tiles.xmas import XmasTile
    xmas = XmasTile(mct)
    
    log.info(f"FOOTER")
    from MCT_FOOTER import MCT_FOOTER
    footer = MCT_FOOTER(mct)
    
    mct.lcd_dim(100)
    ui.set_tile()
    
    log_control.flush_all()
    
except Exception as e:
    log_control.flush_all()
    import sys
    log.error(f"Critical error in main thread: {str(e)}")
    sys.print_exception(e)
    
    log.info("Attempting to activate error LED...")
    try:
        import MCT_LED
        led = MCT_LED.MCT_LED()
        led.all = 0xff0000
        log.info("Error LED activated")
    except Exception as led_error:
        log.error(f"Failed to activate error LED: {led_error}")

finally:
    log_control.flush_all()

