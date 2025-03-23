import bluetooth
from micropython import const
import network
import json
import time

# Improv Service UUID and Characteristics
_IMPROV_SERVICE_UUID = bluetooth.UUID('00467768-6228-2272-4663-277478268000')
_IMPROV_STATUS_UUID = bluetooth.UUID('00467768-6228-2272-4663-277478268001')
_IMPROV_ERROR_UUID = bluetooth.UUID('00467768-6228-2272-4663-277478268002')
_IMPROV_RPC_COMMAND_UUID = bluetooth.UUID('00467768-6228-2272-4663-277478268003')
_IMPROV_RPC_RESULT_UUID = bluetooth.UUID('00467768-6228-2272-4663-277478268004')
_IMPROV_CAPABILITIES_UUID = bluetooth.UUID('00467768-6228-2272-4663-277478268005')
_IMPROV_CURRENT_STATE_UUID = bluetooth.UUID('00467768-6228-2272-4663-277478268006')

# Improv States
STATE_READY = const(0x02)
STATE_PROVISIONING = const(0x03)
STATE_PROVISIONED = const(0x04)

# Improv Commands
CMD_IDENTIFY = const(0x01)
CMD_WIFI_SETTINGS = const(0x02)

# Improv Capabilities
CAP_IDENTIFY = const(0x01)

class ImprovWiFi:
    def __init__(self, ble):
        self._ble = ble
        self._connections = set()
        self._handles = {}
        self._wifi = network.WLAN(network.STA_IF)
        self._current_state = STATE_READY
        self._setup_service()
    
    def _setup_service(self):
        # Define service
        improv_service = (
            _IMPROV_SERVICE_UUID,
            (
                (_IMPROV_STATUS_UUID, bluetooth.FLAG_READ | bluetooth.FLAG_NOTIFY),
                (_IMPROV_ERROR_UUID, bluetooth.FLAG_READ | bluetooth.FLAG_NOTIFY),
                (_IMPROV_RPC_COMMAND_UUID, bluetooth.FLAG_WRITE),
                (_IMPROV_RPC_RESULT_UUID, bluetooth.FLAG_READ | bluetooth.FLAG_NOTIFY),
                (_IMPROV_CAPABILITIES_UUID, bluetooth.FLAG_READ),
                (_IMPROV_CURRENT_STATE_UUID, bluetooth.FLAG_READ | bluetooth.FLAG_NOTIFY),
            ),
        )
        
        # Register service
        ((
            self._handles['status'],
            self._handles['error'],
            self._handles['command'],
            self._handles['result'],
            self._handles['capabilities'],
            self._handles['state']
        ),) = self._ble.gatts_register_services([improv_service])
        
        # Set initial values
        self._ble.gatts_write(self._handles['capabilities'], bytes([CAP_IDENTIFY]))
        self._update_state(STATE_READY)
        print("Improv service registered")
    
    def _update_state(self, state):
        self._current_state = state
        self._ble.gatts_write(self._handles['state'], bytes([state]))
        # Only notify if there are connected clients
        if self._connections:
            self._ble.gatts_notify(0, self._handles['state'], bytes([state]))
    
    def _handle_identify(self):
        # Flash LED or make sound for identification
        print("Device identified")
        return True
    
    def _connect_wifi(self, ssid, password):
        self._update_state(STATE_PROVISIONING)
        
        try:
            self._wifi.active(True)
            self._wifi.connect(ssid, password)
            
            # Wait for connection
            max_wait = 10
            while max_wait > 0:
                if self._wifi.isconnected():
                    self._update_state(STATE_PROVISIONED)
                    
                    # Send result with connection info
                    result = {
                        "ssid": ssid,
                        "ip": self._wifi.ifconfig()[0]
                    }
                    result_json = json.dumps(result).encode()
                    self._ble.gatts_write(self._handles['result'], result_json)
                    self._ble.gatts_notify(0, self._handles['result'], result_json)
                    return True
                    
                max_wait -= 1
                time.sleep(1)
            
            raise Exception("Connection timeout")
            
        except Exception as e:
            self._update_state(STATE_READY)
            error_msg = str(e).encode()
            self._ble.gatts_write(self._handles['error'], error_msg)
            self._ble.gatts_notify(0, self._handles['error'], error_msg)
            return False
    
    def handle_command(self, data):
        command = data[0]
        if command == CMD_IDENTIFY:
            return self._handle_identify()
        elif command == CMD_WIFI_SETTINGS:
            # Parse WiFi settings command
            # Format: [Command(1), Length(1), SSID Length(1), SSID, Password Length(1), Password]
            ssid_len = data[2]
            ssid = data[3:3+ssid_len].decode()
            pass_len = data[3+ssid_len]
            password = data[4+ssid_len:4+ssid_len+pass_len].decode()
            
            # Connect to WiFi
            return self._connect_wifi(ssid, password)
        return False 