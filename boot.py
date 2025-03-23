# This file is executed on every boot (including wake-boot from deepsleep)
import esp
esp.osdebug(None)     # Turn off vendor O/S debugging messages
import gc
gc.collect()          # Run a garbage collection

# Import and initialize BLE
from ble import BLE
ble = BLE()

# Import and initialize Improv
from improv import ImprovWiFi
improv = ImprovWiFi(ble)

print('Boot complete - BLE and Improv initialized') 