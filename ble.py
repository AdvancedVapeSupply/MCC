import bluetooth
from machine import Timer
from micropython import const
import json
from machine import Pin
import struct
import time
from improv import ImprovWiFi

# BLE service and characteristic UUIDs
_MCT_SERVICE_UUID = bluetooth.UUID('6e6b5e65-5af0-4dba-8d75-27e0dfadeb00')
_MCT_CHAR_UUID = bluetooth.UUID('6e6b5e65-5af0-4dba-8d75-27e0dfadeb01')

# BLE flags
_FLAG_WRITE = const(0x0008)
_FLAG_NOTIFY = const(0x0010)
_FLAG_READ = const(0x0002)

# BLE IRQ Events
_IRQ_CENTRAL_CONNECT = const(1)
_IRQ_CENTRAL_DISCONNECT = const(2)
_IRQ_GATTS_WRITE = const(3)

# Global variables that can be monitored
monitored_vars = {}
update_timer = None

class BLEServer:
    def __init__(self):
        self._ble = bluetooth.BLE()
        self._ble.active(True)
        self._ble.irq(self._irq)
        self._connections = set()
        self._write_callback = None
        self._handles = {}
        
        # Initialize Improv WiFi first
        self._improv = ImprovWiFi(self._ble)
        print("BLE server initialized with Improv WiFi support")
        
        # Then setup MCT service and start advertising
        self._setup_services()
        self._start_advertising()

    def _irq(self, event, data):
        if event == _IRQ_CENTRAL_CONNECT:
            conn_handle, _, _ = data
            self._connections.add(conn_handle)
            print(f"New connection: {conn_handle}")
            
        elif event == _IRQ_CENTRAL_DISCONNECT:
            conn_handle, _, _ = data
            if conn_handle in self._connections:
                self._connections.remove(conn_handle)
            self._start_advertising()
            print(f"Disconnected: {conn_handle}")
            
        elif event == _IRQ_GATTS_WRITE:
            conn_handle, value_handle = data
            
            if value_handle == self._handles['command']:
                # Handle Improv command
                buffer = self._ble.gatts_read(value_handle)
                self._improv.handle_command(buffer)
            
            elif value_handle == self._handles['tx']:
                if self._write_callback:
                    buffer = self._ble.gatts_read(value_handle)
                    self._write_callback(buffer)

    def _setup_services(self):
        # MCT Service
        mct_service = (
            _MCT_SERVICE_UUID,
            (
                (_MCT_CHAR_UUID, bluetooth.FLAG_WRITE | bluetooth.FLAG_NOTIFY),
            ),
        )
        
        # Register MCT service
        ((self._handles['tx'],),) = self._ble.gatts_register_services([mct_service])
        print("MCT service registered")

    def _start_advertising(self):
        name = "MCT"
        service_uuid = _MCT_SERVICE_UUID.bin[2:4]  # Use 16-bit UUID
        improv_uuid = bytes.fromhex('6228')  # 16-bit UUID for Improv service
        
        # Construct advertising payload
        adv_data = bytearray([
            0x02, 0x01, 0x06,  # General discoverable mode
            0x05, 0x03] + list(service_uuid) + list(improv_uuid) +  # Complete list of 16-bit UUIDs
            [len(name) + 1, 0x09] + [ord(c) for c in name]  # Complete local name
        )
        
        self._ble.gap_advertise(100000, adv_data)
        print("Started BLE advertising")

    def send(self, data):
        for conn_handle in self._connections:
            self._ble.gatts_notify(conn_handle, self._handles['tx'], data)

    def on_write(self, callback):
        self._write_callback = callback

# Create and start the BLE server
server = BLEServer()
print('BLE server started')

def start_ble_server():
    global update_timer
    server = BLEServer()
    server.setup()
    
    # Setup timer for periodic variable updates
    def send_updates(t):
        if server._connections:
            server._send_vars()
    
    update_timer = Timer(1)
    update_timer.init(period=1000, mode=Timer.PERIODIC, callback=send_updates)
    
    return server

# Helper function to monitor a variable
def monitor_var(name, value):
    monitored_vars[name] = value
    return value

# Start the server when this module is imported
ble_server = start_ble_server() 