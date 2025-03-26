import network
import socket
import json
import time
from machine import Timer
from micropython import const
import struct
from improv import ImprovWiFi

# WiFi server configuration
_WIFI_PORT = const(80)
_MAX_CONNECTIONS = const(4)
_BUFFER_SIZE = const(1024)

# Global variables that can be monitored
monitored_vars = {}
update_timer = None

class WiFiServer:
    def __init__(self):
        # Initialize WiFi in AP mode
        self._wlan = network.WLAN(network.AP_IF)
        self._wlan.active(True)
        
        # Configure AP with network name "mct"
        self._wlan.config(essid='mct', password='')
        
        # Set hostname for mDNS
        self._wlan.config(hostname='mct')
        
        # Wait for AP to be active
        while not self._wlan.active():
            time.sleep(0.1)
            
        # Get IP address
        self._ip = self._wlan.ifconfig()[0]
        
        # Initialize socket server
        self._server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self._server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self._server.bind(('', _WIFI_PORT))
        self._server.listen(_MAX_CONNECTIONS)
        
        # Connection tracking
        self._connections = []
        self._monitored_vars = {}
        
        # Start update timer
        self._update_timer = Timer(0)
        self._update_timer.init(period=1000, mode=Timer.PERIODIC, callback=self._send_updates)
        
        print(f"WiFi AP started: {self._wlan.config('essid')} ({self._ip})")
        self._improv = ImprovWiFi(self._wlan)
        print("WiFi server initialized with Improv WiFi support")

    def _handle_connection(self, client_socket, addr):
        print(f"New connection from {addr}")
        self._connections.append(client_socket)
        
        try:
            while True:
                data = client_socket.recv(_BUFFER_SIZE)
                if not data:
                    break
                    
                try:
                    # Parse JSON command
                    command = json.loads(data.decode())
                    
                    # Handle different command types
                    if command.get('type') == 'repl':
                        # Execute REPL command
                        result = self._execute_repl(command.get('command'))
                        response = {'type': 'repl', 'result': result}
                        
                    elif command.get('type') == 'get_var':
                        # Get monitored variable
                        var_name = command.get('name')
                        value = self._monitored_vars.get(var_name)
                        response = {'type': 'var', 'name': var_name, 'value': value}
                        
                    elif command.get('type') == 'set_var':
                        # Set monitored variable
                        var_name = command.get('name')
                        value = command.get('value')
                        self._monitored_vars[var_name] = value
                        response = {'type': 'var', 'name': var_name, 'value': value}
                        
                    else:
                        response = {'type': 'error', 'message': 'Unknown command type'}
                    
                    # Send response
                    client_socket.send(json.dumps(response).encode() + b'\n')
                    
                except json.JSONDecodeError:
                    # Handle raw data (non-JSON)
                    if self._write_callback:
                        self._write_callback(data)
                        
        except Exception as e:
            print(f"Error handling connection: {e}")
        finally:
            client_socket.close()
            self._connections.remove(client_socket)
            print(f"Connection closed: {addr}")

    def _execute_repl(self, command):
        try:
            # Create a new local namespace for execution
            local_dict = {}
            # Execute the command
            exec(command, {}, local_dict)
            # Return the result
            return str(local_dict.get('result', None))
        except Exception as e:
            return f"Error: {str(e)}"

    def _send_updates(self, t):
        if self._connections:
            # Send monitored variables to all connected clients
            for var_name, value in self._monitored_vars.items():
                update = {
                    'type': 'var_update',
                    'name': var_name,
                    'value': value
                }
                self.send(json.dumps(update).encode() + b'\n')

    def start(self):
        # Start accepting connections
        while True:
            try:
                client_socket, addr = self._server.accept()
                self._handle_connection(client_socket, addr)
            except Exception as e:
                print(f"Error accepting connection: {e}")
                time.sleep(1)

    def send(self, data):
        # Send data to all connected clients
        for conn in self._connections:
            try:
                conn.send(data)
            except:
                # Remove failed connections
                self._connections.remove(conn)

    def on_write(self, callback):
        self._write_callback = callback

def start_wifi_server():
    server = WiFiServer()
    server.start()
    return server

# Helper function to monitor a variable
def monitor_var(name, value):
    monitored_vars[name] = value
    return value

# Start the server when this module is imported
wifi_server = start_wifi_server() 