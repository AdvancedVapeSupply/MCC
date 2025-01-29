import time
print(f"{time.ticks_ms() / 1000:6.2f} boot.py")

import sys
# Add required paths - tiles after lib/ui so it can use UI components
sys.path.extend(['/', '/lib', '/lib/mp', '/lib/ui', '/lib/io', '/lib/ui/tiles'])

from version import __version__, __commit_url__
print(f"{__version__} url:{__commit_url__}")

from X import x

# PIN_INOKB = const(42)
# import machine
# if machine.Pin(PIN_INOKB).value() == 0:
#     log.info(f"{time.ticks_ms() / 1000:6.2f} Suspect power on on via USB")
#     mct.led.all = 0x00FFFF
# else:
#     log.info(f"{time.ticks_ms() / 1000:6.2f} Suspect power on via battery")
#     mct.led.all = 0x00FF00

# import MCT
# mct = MCT.MCT()



