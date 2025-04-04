// Import ESPLoader and Transport from esptool-js
import { ESPLoader, Transport } from 'esptool-js';

// Global variables
let activePort = null;
let portReader = null;
let portWriter = null;
let connectionState = {
    serial: false,
    esp32: false,
    python: false,
    wifi: false,
    ble: false,
    avs: false
};

// Helper functions
function logToTerminal(message, isError = false, type = 'default') {
    const terminal = document.getElementById('terminal-panel');
    if (!terminal) return;
    
    const line = document.createElement('div');
    line.className = 'terminal-line';
    
    // Add color class based on type
    if (type !== 'default') {
        line.classList.add(type);
    }
    
    // Add error class if needed
    if (isError) {
        line.classList.add('error');
    }
    
    // Handle ANSI escape codes
    let processedMessage = message;
    if (message.includes('\x1b[')) {
        // Replace ANSI color codes with CSS classes
        processedMessage = message
            .replace(/\x1b\[0m/g, '') // Reset
            .replace(/\x1b\[32m/g, '') // Green
            .replace(/\x1b\[31m/g, '') // Red
            .replace(/\x1b\[33m/g, '') // Yellow
            .replace(/\x1b\[36m/g, '') // Cyan
            .replace(/\x1b\[34m/g, '') // Blue
            .replace(/\x1b\[35m/g, '') // Magenta
            .replace(/\x1b\[37m/g, '') // White
            .replace(/\x1b\[1m/g, '') // Bold
            .replace(/\x1b\[4m/g, '') // Underline
            .replace(/\x1b\[5m/g, '') // Blink
            .replace(/\x1b\[7m/g, '') // Inverse
            .replace(/\x1b\[8m/g, '') // Hidden
            .replace(/\x1b\[K/g, '') // Clear line
            .replace(/\x1b\[2K/g, '') // Clear entire line
            .replace(/\x1b\[1K/g, '') // Clear from cursor to beginning
            .replace(/\x1b\[0K/g, '') // Clear from cursor to end
            .replace(/\x1b\[?25l/g, '') // Hide cursor
            .replace(/\x1b\[?25h/g, '') // Show cursor
            .replace(/\x1b\[\d+;\d+H/g, '') // Move cursor
            .replace(/\x1b\[\d+[ABCD]/g, '') // Move cursor up/down/left/right
            .replace(/\x1b\[\d+[JK]/g, '') // Clear screen
            .replace(/\x1b\[\d+[G]/g, '') // Move cursor to column
            .replace(/\x1b\[\d+;\d+f/g, '') // Move cursor to position
            .replace(/\x1b\[\d+[ST]/g, '') // Scroll up/down
            .replace(/\x1b\[\d+[XY]/g, '') // Move cursor to position
            .replace(/\x1b\[\d+[Z]/g, '') // Move cursor back
            .replace(/\x1b\[\d+[a-zA-Z]/g, ''); // All other escape sequences
    }
    
    line.textContent = `[${new Date().toLocaleTimeString()}] ${processedMessage}`;
    terminal.appendChild(line);
    
    // Ensure scroll to bottom
    terminal.scrollTop = terminal.scrollHeight;
    
    // Keep only last 100 lines to prevent memory issues
    while (terminal.children.length > 100) {
        terminal.removeChild(terminal.firstChild);
    }
}

function updateConnectionStatus(isConnected, type) {
    const icon = document.getElementById(`${type}-icon`);
    if (icon) {
        icon.style.display = isConnected ? 'inline' : 'none';
        if (isConnected) {
            icon.classList.add('active');
        } else {
            icon.classList.remove('active');
        }
    }
}

// Serial Manager
const USBManager = {
    connectToPort: async function(port) {
        try {
            // Check if port is already open
            if (port.readable && port.writable) {
                logToTerminal('Port is already open, using existing connection');
            } else {
                // Open the port
                await port.open({ 
                    baudRate: 115200,
                    dataBits: 8,
                    stopBits: 1,
                    parity: "none",
                    flowControl: "none"
                });
            }
            
            // Store the active port
            activePort = port;
            
            // Update USB icon and connection status
            updateConnectionStatus(true, 'serial');
            connectionState.serial = true;
            this.updateToggleState(true);
            
            // Ensure the USB icon is properly lit
            const usbIcon = document.getElementById('usb-icon');
            if (usbIcon) {
                usbIcon.classList.add('connected');
                usbIcon.style.opacity = '1';
                usbIcon.style.color = 'var(--neon-green)';
                usbIcon.style.textShadow = 'var(--neon-green-intense)';
            }
            
            // Get port info safely
            let portInfo = null;
            try {
                const info = await port.getInfo();
                if (info && info.usbVendorId && info.usbProductId) {
                    logToTerminal(`Connected to USB device (VID: ${info.usbVendorId}, PID: ${info.usbProductId})`);
                    portInfo = info;
                } else {
                    logToTerminal('Connected to port (detailed info not available)');
                }
            } catch (infoError) {
                logToTerminal('Connected to port (could not get device info)');
                console.warn('Could not get port info:', infoError);
            }
            
            // Update USB info if we have the port info
            if (portInfo) {
                try {
                    await this.updateUSBInfo(port, portInfo);
                } catch (usbInfoError) {
                    logToTerminal(`Failed to update USB info: ${usbInfoError.message}`, true);
                    // Continue anyway
                }
            }

            // Try to detect ESP32
            try {
                const esp32Detected = await this.detectESP32(port);
                if (!esp32Detected) {
                    logToTerminal('ESP32 detection did not succeed, but USB connection is established');
                }
            } catch (error) {
                logToTerminal(`ESP32 detection failed: ${error.message}`, true);
                // Continue with USB connection even if ESP32 detection fails
            }
        
            return true;
        } catch (error) {
            logToTerminal(`Failed to open port: ${error.message}`, true);
            this.updateToggleState(false);
            
            // Clean up if port was opened
            try {
                if (port.readable || port.writable) {
                    await this.cleanupPort(port);
                }
            } catch (closeError) {
                console.warn('Error while cleaning up port:', closeError);
            }
            
            return false;
        }
    },

    cleanupPort: async function(port) {
        if (!port) return;
            
        try {
            // Cancel any ongoing reads
            const reader = port.readable?.getReader();
            if (reader) {
                await reader.cancel();
                reader.releaseLock();
            }
            
            // Close any writers
            const writer = port.writable?.getWriter();
            if (writer) {
                await writer.close();
                writer.releaseLock();
            }
            
            // Close the port
            if (port.readable || port.writable) {
                await port.close();
                logToTerminal('Port closed successfully');
            }

            // Clear port variables
            if (port === activePort) {
                activePort = null;
                portReader = null;
                portWriter = null;
            }
        } catch (error) {
            console.warn('Error during port cleanup:', error);
            logToTerminal(`Failed to clean up port: ${error.message}`, true);
            throw error;
        }
    },

    detectMicroPython: async function(port) {
        try {
            logToTerminal('Checking for MicroPython...');
            
            // Create a writer
            const writer = port.writable.getWriter();
            const reader = port.readable.getReader();
            
            try {
                // Send Ctrl+C to interrupt any running program
                await writer.write(new Uint8Array([0x03]));
                await new Promise(resolve => setTimeout(resolve, 100));
                
                // Send Enter and wait for prompt
                await writer.write(new Uint8Array([0x0D]));
                await new Promise(resolve => setTimeout(resolve, 100));
                
                // Send version check command
                const cmd = new TextEncoder().encode('import sys\r\nprint(sys.implementation.name, sys.implementation.version)\r\n');
                await writer.write(cmd);
                
                // Read response with timeout
                let response = '';
                const startTime = Date.now();
                const timeout = 2000; // 2 second timeout
                
                while (Date.now() - startTime < timeout) {
                    const {value, done} = await reader.read();
                    if (done) break;
                    
                    response += new TextDecoder().decode(value);
                    if (response.includes('micropython')) {
                        // Show Python tile and icon
                        const pythonTile = document.getElementById('python-tile');
                        const pythonIcon = document.getElementById('python-icon');
                        if (pythonTile) pythonTile.style.display = 'flex';
                        if (pythonIcon) pythonIcon.style.display = 'inline';
                        
                        // Update connection state
                        connectionState.python = true;
                        updateConnectionStatus(true, 'python');
                        
                        // Extract version and update UI
                        const versionMatch = response.match(/micropython\s+([\d.]+)/i);
                        const version = versionMatch ? versionMatch[1] : 'Unknown';
                        const versionEl = document.getElementById('python-version');
                        if (versionEl) versionEl.textContent = version;
                        
                        // Get memory info
                        const memoryCmd = new TextEncoder().encode('import gc\r\nprint(f"Free: {gc.mem_free()}, Allocated: {gc.mem_alloc()}")\r\n');
                        await writer.write(memoryCmd);
                        
                        // Read memory info with timeout
                        let memoryResponse = '';
                        const memoryStartTime = Date.now();
                        const memoryTimeout = 1000;
                        
                        while (Date.now() - memoryStartTime < memoryTimeout) {
                            const {value, done} = await reader.read();
                            if (done) break;
                            
                            memoryResponse += new TextDecoder().decode(value);
                            if (memoryResponse.includes('Free:')) {
                                const memoryMatch = memoryResponse.match(/Free: (\d+), Allocated: (\d+)/);
                                if (memoryMatch) {
                                    const freeMem = parseInt(memoryMatch[1]);
                                    const allocMem = parseInt(memoryMatch[2]);
                                    const totalMem = freeMem + allocMem;
                                    const freePercent = Math.round((freeMem / totalMem) * 100);
                                    const memoryEl = document.getElementById('python-memory');
                                    if (memoryEl) memoryEl.textContent = `${freePercent}% Free`;
                                }
                                break;
                            }
                        }
                        
                        logToTerminal(`MicroPython detected: ${version}`);
                        break;
                    }
                }
            } finally {
                writer.releaseLock();
                reader.releaseLock();
            }
        } catch (error) {
            logToTerminal(`MicroPython detection failed: ${error.message}`, true);
            // Hide Python tile and icon on error
            const pythonTile = document.getElementById('python-tile');
            const pythonIcon = document.getElementById('python-icon');
            if (pythonTile) pythonTile.style.display = 'none';
            if (pythonIcon) pythonIcon.style.display = 'none';
            connectionState.python = false;
            updateConnectionStatus(false, 'python');
        }
    },

    updateUSBInfo: async function(port, portInfo = null) {
        try {
            // Use provided port info or get it from the port
            const info = portInfo || await port.getInfo();
            
            if (info) {
                const vidStr = info.usbVendorId ? `0x${info.usbVendorId.toString(16).padStart(4, '0')}` : '-';
                const pidStr = info.usbProductId ? `0x${info.usbProductId.toString(16).padStart(4, '0')}` : '-';
                
                // Get port path based on device type and platform
                let portStr = '-';
                if (info.usbVendorId === 0x303a && info.usbProductId === 0x0420) {
                    // MCT device
                    if (navigator.platform.includes('Mac')) {
                        portStr = '/dev/cu.usbmodem2101';
                    } else if (navigator.platform.includes('Win')) {
                        portStr = 'COM3';
                    } else {
                        portStr = '/dev/ttyACM0';
                    }
                } else {
                    // Other USB devices
                    if (navigator.platform.includes('Mac')) {
                        portStr = `/dev/cu.usbserial-${info.serialNumber || '0000'}`;
                    } else if (navigator.platform.includes('Win')) {
                        portStr = `COM${info.serialNumber || '1'}`;
                    } else {
                        portStr = `/dev/ttyUSB${info.serialNumber || '0'}`;
                    }
                }
                
                // Update Serial tile USB info
                const serialVidEl = document.getElementById('serial-usb-vid');
                const serialPidEl = document.getElementById('serial-usb-pid');
                const serialPortEl = document.getElementById('serial-usb-port');
                
                if (serialVidEl) serialVidEl.textContent = vidStr;
                if (serialPidEl) serialPidEl.textContent = pidStr;
                if (serialPortEl) serialPortEl.textContent = portStr;
                
                // Log the connection details
                logToTerminal(`USB device connected - VID: ${vidStr}, PID: ${pidStr}, Port: ${portStr}`);
                return true;
            }
            return false;
        } catch (error) {
            console.warn('Could not get USB info:', error);
            logToTerminal('Failed to update USB info: ' + error.message, true);
            throw error;
        }
    },

    updateToggleState: function(connected) {
        const toggle = document.getElementById('serial-toggle');
        if (toggle) {
            toggle.classList.toggle('active', connected);
        }
    },

    autoConnectToStoredPorts: async function() {
        logToTerminal('Checking for stored ports...');
        try {
            const ports = await navigator.serial.getPorts();
            
            if (ports.length > 0) {
                logToTerminal(`Found ${ports.length} stored port(s)`);
                
                // Clean up any existing connections first
                for (const port of ports) {
                    try {
                        await this.cleanupPort(port);
                    } catch (cleanupError) {
                        logToTerminal(`Port cleanup failed: ${cleanupError.message}`, true);
                        // Continue with other ports
                    }
                }
                
                // Small delay before reconnecting
                await new Promise(resolve => setTimeout(resolve, 100));
                
                // Try to connect to the first available port
                try {
                    const connected = await this.connectToPort(ports[0]);
                    if (connected) {
                        logToTerminal('Successfully connected to stored port');
                        this.updateToggleState(true);
                        return true;
                    } else {
                        logToTerminal('Connection to stored port did not complete successfully', true);
                        this.updateToggleState(false);
                        return false;
                    }
                } catch (error) {
                    logToTerminal(`Failed to connect to stored port: ${error.message}`, true);
                    this.updateToggleState(false);
                    return false;
                }
            } else {
                logToTerminal('No stored ports found');
                this.updateToggleState(false);
                return false;
            }
        } catch (error) {
            logToTerminal(`Error getting stored ports: ${error.message}`, true);
            this.updateToggleState(false);
            return false;
        }
    },

    resetESP32ToBootloader: async function(port) {
        try {
            logToTerminal('Entering bootloader mode...');
            
            // Get a writer
            const writer = port.writable.getWriter();
            
            try {
                // Use DTR/RTS to reset ESP32 into bootloader
                await port.setSignals({ dataTerminalReady: false, requestToSend: true });
                await new Promise(resolve => setTimeout(resolve, 50));
                await port.setSignals({ dataTerminalReady: true, requestToSend: true });
                await new Promise(resolve => setTimeout(resolve, 50));
                await port.setSignals({ dataTerminalReady: false, requestToSend: false });
                await new Promise(resolve => setTimeout(resolve, 50));
                await port.setSignals({ dataTerminalReady: false });
            } finally {
                writer.releaseLock();
            }
            
            // Wait for bootloader
            await new Promise(resolve => setTimeout(resolve, 500));
            
            logToTerminal('Entered bootloader mode');
        } catch (error) {
            logToTerminal(`Failed to enter bootloader mode: ${error.message}`, true);
            throw error;
        }
    },

    // ESP32 detection function
    detectESP32: async function(port) {
        try {
            logToTerminal('Detecting ESP32...');
            
            // Release existing readers/writers
            if (portReader) {
                try {
                    await portReader.cancel();
                    portReader.releaseLock();
                } catch (e) {
                    console.warn('Error releasing port reader:', e);
                }
                portReader = null;
            }
            
            if (portWriter) {
                try {
                    await portWriter.close();
                    portWriter.releaseLock();
                } catch (e) {
                    console.warn('Error releasing port writer:', e);
                }
                portWriter = null;
            }

            // Check if port is already open
            const isPortOpen = port.readable && port.writable;
            
            if (!isPortOpen) {
                try {
                    // Open port for ESP32 detection if it's not already open
                    await port.open({ 
                        baudRate: 115200,
                        dataBits: 8,
                        stopBits: 1,
                        parity: "none",
                        flowControl: "none"
                    });
                } catch (openError) {
                    if (openError.message.includes('Port is already open')) {
                        logToTerminal('Port is already open, proceeding with detection');
                    } else {
                        throw openError;
                    }
                }
            } else {
                logToTerminal('Port is already open, using existing connection');
            }
            
            let chipType, features, mac;
            
            try {
                // Create ESPLoader instance
                const loader = new ESPLoader({
                    transport: new Transport(port),
                    baudrate: 115200,
                    debug: true
                });

                // Try to connect and get chip info
                await loader.connect();
                chipType = await loader.detectChip();
                features = await loader.getChipFeatures();
                mac = await loader.readMac();
                
                // Show ESP32 tile and icon
                const esp32Tile = document.getElementById('esp32-tile');
                const esp32Icon = document.getElementById('esp32-icon');
                if (esp32Tile) {
                    esp32Tile.style.opacity = '1';
                    esp32Tile.style.filter = 'grayscale(0%)';
                    
                    // Update chip info
                    const chipTypeEl = document.getElementById('esp32-chip-type');
                    const flashEl = document.getElementById('esp32-flash');
                    const psramEl = document.getElementById('esp32-psram');
                    const macEl = document.getElementById('esp32-mac');
                    
                    if (chipTypeEl) chipTypeEl.textContent = chipType.name;
                    if (flashEl) flashEl.textContent = features.find(f => f.includes('Flash'))?.split(' ')[2] || 'N/A';
                    if (psramEl) psramEl.textContent = features.find(f => f.includes('PSRAM')) ? 'Yes' : 'No';
                    if (macEl) macEl.textContent = mac.map(b => b.toString(16).padStart(2, '0')).join(':');
                }
                if (esp32Icon) {
                    esp32Icon.style.opacity = '1';
                    esp32Icon.classList.add('connected');
                    esp32Icon.style.color = 'var(--neon-red)';
                    esp32Icon.style.textShadow = 'var(--neon-red-intense)';
                }
                
                // Update connection state
                connectionState.esp32 = true;
                updateConnectionStatus(true, 'esp32');
                
                logToTerminal(`ESP32 detected: ${chipType.name}`, false, 'esp32');
            } catch (espLoaderError) {
                logToTerminal(`ESP32 detection failed: ${espLoaderError.message}`, true);
                
                // Grey out ESP32 tile and icon on error
                const esp32Tile = document.getElementById('esp32-tile');
                const esp32Icon = document.getElementById('esp32-icon');
                if (esp32Tile) {
                    esp32Tile.style.opacity = '0.5';
                    esp32Tile.style.filter = 'grayscale(70%)';
                }
                if (esp32Icon) {
                    esp32Icon.style.opacity = '0.3';
                    esp32Icon.classList.remove('connected');
                }
                connectionState.esp32 = false;
                updateConnectionStatus(false, 'esp32');
                
                // Don't throw error, just log it and continue
                // This prevents reconnection loops
            }
            
            // Make sure port is open before creating readers/writers
            if (port.readable && port.writable) {
                // Recreate reader and writer
                try {
                    // Only create new reader/writer if they don't exist
                    if (!portReader) {
                        portReader = port.readable.getReader();
                    }
                    if (!portWriter) {
                        portWriter = port.writable.getWriter();
                    }
                
                    // Try to detect MicroPython only if ESP32 was detected
                    if (connectionState.esp32) {
                        try {
                            await this.detectMicroPython(port);
                        } catch (error) {
                            logToTerminal(`MicroPython detection failed: ${error.message}`, true);
                            // Don't throw this error, just log it
                        }
                    }
                } catch (readerWriterError) {
                    logToTerminal(`Could not create readers/writers: ${readerWriterError.message}`, true);
                    // Continue without readers/writers
                }
            } else {
                logToTerminal('Warning: Port is not open for reading/writing', true);
            }
            
            return connectionState.esp32;
        } catch (error) {
            logToTerminal(`ESP32 detection process failed: ${error.message}`, true);
            
            // Make sure connection state is updated
            connectionState.esp32 = false;
            updateConnectionStatus(false, 'esp32');
            
            // Don't throw error to prevent reconnection loops
            return false;
        }
    }
};

// Export USBManager and other helpers for use in mcc.html
window.USBManager = USBManager;
window.logToTerminal = logToTerminal;
window.updateConnectionStatus = updateConnectionStatus;

// Also export as module exports for ES modules
export { 
    USBManager,
    logToTerminal,
    updateConnectionStatus,
    connectionState
};
