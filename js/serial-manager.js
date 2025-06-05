// Import ESPLoader and Transport from esptool-js
import { ESPLoader, Transport } from 'esptool-js';

// Import the ESP chip info module
import { getChipInfo, resetToBootloader, chipInfoEvents } from '../chip_info.js';

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
let alreadyInProgressCounter = 0; // Counter for tracking consecutive "already in progress" errors

// Helper functions
function logToTerminal(message, isError = false, category = '') {
    const terminalPanel = document.getElementById('terminal-panel');
    if (!terminalPanel) return;
    
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
    
    const line = document.createElement('div');
    line.className = 'terminal-line';
    
    // Add category class if specified
    if (category) {
        line.classList.add(category);
    }
    
    // Add error class for error messages
    if (isError) {
        line.classList.add('error');
    }
    
    line.textContent = `[${timestamp}] ${message}`;
    
    terminalPanel.appendChild(line);
    terminalPanel.scrollTop = terminalPanel.scrollHeight;
    
    // Also log to console with appropriate styling
    if (isError) {
        console.error(`[${timestamp}] ${message}`);
    } else {
        console.log(`[${timestamp}] ${message}`);
    }
}

function updateConnectionStatus(isConnected, type) {
    let icon = null;
    if (type === 'serial' || type === 'usb') {
        icon = document.getElementById('usb-icon');
    } else {
        icon = document.getElementById(`${type}-icon`);
    }
    if (icon) {
        icon.style.display = 'inline'; // Always visible
        if (isConnected) {
            icon.classList.add('connected');
            icon.style.opacity = '1';
        } else {
            icon.classList.remove('connected');
            icon.style.opacity = '0.3';
        }
    }
}

// Modified function to consistently format log messages for ESP32
function logESP32Message(message, isError = false) {
    logToTerminal(message, isError, 'esp32');
    
    // Also update ESP32 tile parameters based on message content
    if (!isError) {
        // Extract parameter values from common message patterns
        let match;
        
        // Check for chip type detection
        if ((match = message.match(/Chip Type: ([^\s]+)/i)) || 
            (match = message.match(/Detected chip type: ([^\s]+)/i))) {
            const chipType = match[1];
            updateESP32Parameter('chip-type', chipType);
            
            // When chip type is identified, set default values
            if (chipType === 'ESP32-S3') {
                updateESP32Parameter('features', 'WiFi, BLE 5, USB');
                updateESP32Parameter('flash', '16MB');
                updateESP32Parameter('psram', '8MB');
                updateESP32Parameter('crystal', '40MHz');
            } else if (chipType === 'ESP32') {
                updateESP32Parameter('features', 'WiFi, BLE 4.2, Dual Core');
                updateESP32Parameter('flash', '4MB');
                updateESP32Parameter('psram', 'Not Present');
                updateESP32Parameter('crystal', '40MHz');
            }
        }
        
        // Check for chip ID
        if ((match = message.match(/Chip ID.*: (0x[0-9a-f]+)/i)) ||
            (match = message.match(/ID.*: (0x[0-9a-f]+)/i))) {
            updateESP32Parameter('chip-id', match[1]);
        }
        
        // Check for MAC address
        if ((match = message.match(/MAC Address: ([0-9a-f:]+)/i))) {
            updateESP32Parameter('mac', match[1]);
        }
        
        // Check for features
        if ((match = message.match(/Features: (.*)/i))) {
            updateESP32Parameter('features', match[1]);
        }
        
        // Check for flash size
        if ((match = message.match(/Flash Size: (.*)/i))) {
            updateESP32Parameter('flash', match[1]);
        }
        
        // Check for flash mode
        if ((match = message.match(/Flash Mode: (.*)/i))) {
            // We don't directly display mode in the tile
        }
        
        // Check for PSRAM
        if ((match = message.match(/PSRAM: (.*)/i))) {
            updateESP32Parameter('psram', match[1]);
        }
        
        // Check for Crystal
        if ((match = message.match(/Crystal: (.*)/i))) {
            updateESP32Parameter('crystal', match[1]);
        }
        
        // Progress message updates
        if ((match = message.match(/Progress: (.*?) - (.*)/i))) {
            const step = match[1].toLowerCase();
            const value = match[2];
            
            if (step.includes('chip') && step.includes('type')) {
                updateESP32Parameter('chip-type', value);
            } else if (step.includes('chip') && step.includes('id')) {
                updateESP32Parameter('chip-id', value);
            } else if (step.includes('mac')) {
                updateESP32Parameter('mac', value);
            } else if (step.includes('feature')) {
                updateESP32Parameter('features', value);
            } else if (step.includes('flash')) {
                updateESP32Parameter('flash', value);
            } else if (step.includes('psram')) {
                updateESP32Parameter('psram', value);
            } else if (step.includes('crystal')) {
                updateESP32Parameter('crystal', value);
            }
        }
    }
}

// Helper to update ESP32 tile parameters with animation
function updateESP32Parameter(param, value) {
    const fieldId = `esp32-${param}`;
    const field = document.getElementById(fieldId);
    
    if (field && value) {
        // Only update if the value is different and not empty
        if (field.textContent !== value && value.trim() !== '') {
            // Save old value for animation
            const oldValue = field.textContent;
            
            // Update the text content
            field.textContent = value;
            
            // Add animation if the value actually changed
            if (oldValue !== 'Unknown' && oldValue !== 'Detecting...' && oldValue !== 'Reading...') {
                // Add indicator
                field.innerHTML = `<span class="detection-indicator"><i class="fas fa-check"></i></span> ${value}`;
                
                // Add animation class
                field.classList.add('value-updated');
                
                // Remove animation after a delay
                setTimeout(() => {
                    field.classList.remove('value-updated');
                    
                    // Remove the indicator after the animation
                    setTimeout(() => {
                        field.textContent = value;
                    }, 1000);
                }, 1000);
            }
            
            // Also update the ESP32 tile visuals
            const esp32Tile = document.getElementById('esp32-tile');
            if (esp32Tile) {
                // Ensure it's visible
                esp32Tile.style.opacity = '1';
                esp32Tile.style.filter = 'none';
                esp32Tile.classList.add('detected');
                esp32Tile.classList.remove('detecting');
                
                // Also update the ESP32 icon in status bar
                const esp32Icon = document.getElementById('esp32-icon');
                if (esp32Icon) {
                    esp32Icon.classList.remove('detecting');
                    esp32Icon.classList.add('connected');
                    esp32Icon.style.opacity = '1';
                    esp32Icon.style.color = 'var(--neon-red)';
                }
            }
        }
    }
}

// Improved hex dump helper function
function hexDump(data, prefix = '') {
    if (!data || data.length === 0) return 'empty';
    
    const hexBytes = Array.from(data).map(b => b.toString(16).padStart(2, '0')).join(' ');
    const asciiChars = Array.from(data).map(b => {
        // Show printable characters, replace others with dot
        return (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.';
    }).join('');
    
    return `${prefix}HEX: ${hexBytes}\n${prefix}ASCII: ${asciiChars}`;
}

// Serial Manager
const USBManager = {
    connectToPort: async function(port) {
        try {
            // Check if port is already open
            if (port.readable && port.writable) {
                logToTerminal('Port is already open, using existing connection');
            } else {
                // Check if the port might be in the process of opening
                try {
                    // Try to close it first if it's in a weird state
                    try {
                        await port.close();
                        // Small delay to ensure proper closing
                        await new Promise(resolve => setTimeout(resolve, 100));
                    } catch (closeError) {
                        // Ignore close errors, as port might not be open
                        console.log('Port was not open or could not be closed:', closeError);
                    }
                    
                    // Now try to open the port with a timeout and multiple retries
                    const openPortWithTimeout = async (timeout) => {
                        return Promise.race([
                            port.open({ 
                                baudRate: 115200,
                                dataBits: 8,
                                stopBits: 1,
                                parity: "none",
                                flowControl: "none"
                            }),
                            new Promise((_, reject) => 
                                setTimeout(() => reject(new Error('Port open timeout')), timeout)
                            )
                        ]);
                    };
                    
                    // Try up to 3 times with increasing timeouts
                    const timeouts = [2000, 3000, 5000]; // 2s, 3s, 5s
                    let lastError = null;
                    let success = false;
                    
                    for (let i = 0; i < timeouts.length; i++) {
                        try {
                            logToTerminal(`Opening port attempt ${i+1}/${timeouts.length} with ${timeouts[i]/1000}s timeout...`);
                            
                            // For "already in progress" errors, we need a special approach
                            if (lastError && lastError.message.includes('already in progress')) {
                                // Wait longer before attempting again
                                logToTerminal('Port opening already in progress, waiting longer before retry...', false);
                                await new Promise(resolve => setTimeout(resolve, 2000));
                                
                                // Try a different approach - close first, then reopen
                                try {
                                    // This might fail but we ignore errors
                                    await port.close().catch(() => {});
                                    await new Promise(resolve => setTimeout(resolve, 1000));
                                    
                                    // Now try to open with a direct approach
                                    logToTerminal('Trying direct open after waiting...', false);
                                    await port.open({ 
                                        baudRate: 115200,
                                        dataBits: 8,
                                        stopBits: 1,
                                        parity: "none",
                                        flowControl: "none"
                                    });
                                    
                                    logToTerminal(`Port opened successfully on attempt ${i+1} after waiting`);
                                    success = true;
                                    break;
                                } catch (directError) {
                                    logToTerminal(`Direct open failed: ${directError.message}`, true);
                                    lastError = directError;
                                    
                                    // If still "in progress", try again with even longer delay
                                    if (directError.message.includes('already in progress')) {
                                        logToTerminal('Port still locked, waiting even longer...', true);
                                        await new Promise(resolve => setTimeout(resolve, 3000));
                                    }
                                    
                                    // Try the next iteration
                                    continue;
                                }
                            }
                            
                            // Normal open attempt
                            await openPortWithTimeout(timeouts[i]);
                            logToTerminal(`Port opened successfully on attempt ${i+1}`);
                            success = true;
                            break;
                } catch (openError) {
                            lastError = openError;
                            logToTerminal(`Port open attempt ${i+1} failed: ${openError.message}`, true);
                            
                            // For "already in progress" errors, wait longer before retry
                    if (openError.message.includes('already in progress')) {
                                logToTerminal('Port opening already in progress, waiting before retry...', false);
                                await new Promise(resolve => setTimeout(resolve, 1500));
                            } else {
                                await new Promise(resolve => setTimeout(resolve, 500));
                            }
                        }
                    }
                    
                    if (!success) {
                        // One final attempt with a very long timeout if all others failed
                        if (lastError && lastError.message.includes('already in progress')) {
                            logToTerminal('All attempts failed with "already in progress". Trying one final approach...', true);
                            
                            // Wait a very long time
                            await new Promise(resolve => setTimeout(resolve, 5000));
                            
                            try {
                                // Force close
                                await port.close().catch(() => {});
                                await new Promise(resolve => setTimeout(resolve, 2000));
                                
                                // Final direct open attempt
                                await port.open({ 
                                    baudRate: 115200,
                                    dataBits: 8,
                                    stopBits: 1,
                                    parity: "none",
                                    flowControl: "none"
                                });
                                
                                logToTerminal('Port finally opened successfully after extended wait!');
                                success = true;
                            } catch (finalError) {
                                logToTerminal(`Final open attempt failed: ${finalError.message}`, true);
                                throw finalError;
                            }
                        } else {
                            throw lastError || new Error('Failed to open port after multiple attempts');
                        }
                    }
                } catch (openError) {
                    // Check if port somehow became available during our attempts
                    if (port.readable && port.writable) {
                        logToTerminal('Port became available despite errors', false);
                    } else {
                        throw openError;
                    }
                }
            }
            
            // Set activePort early but don't fully update status yet
            // This way ESPLoader can use it if needed
            activePort = port;
            
            // Important: Get ESP32 chip info BEFORE fully establishing the connection
            // This allows us to detect ESP32 with fresh port streams
            try {
                logESP32Message('Interrogating ESP32 before establishing full connection...');
                
                // Try to detect ESP32 immediately after port open
                const esp32Detected = await this.detectESP32(port);
                
                if (esp32Detected) {
                    logESP32Message('ESP32 detected successfully!');
                } else {
                    logESP32Message('ESP32 detection did not succeed, but port is open');
                }
            } catch (esp32Error) {
                // Log but continue even if detection fails
                logESP32Message(`ESP32 detection error: ${esp32Error.message}`, true);
                logToTerminal('Continuing with USB connection despite ESP32 detection failure', false);
            }
            
            // Now update USB icon and connection status
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
            logToTerminal('Performing thorough port cleanup...');

            // Release global reader
            if (portReader) {
                try {
                    await portReader.cancel().catch(e => console.warn('Reader cancel error:', e));
                    portReader.releaseLock();
                    portReader = null;
                    logToTerminal('Released global reader lock');
                } catch (readerError) {
                    console.warn('Error releasing global reader:', readerError);
                }
            }

            // Release global writer
            if (portWriter) {
                try {
                    portWriter.releaseLock();
                    portWriter = null;
                    logToTerminal('Released global writer lock');
                } catch (writerError) {
                    console.warn('Error releasing global writer:', writerError);
                }
            }

            // Release any other locks on the port
            try {
                // Only get a reader if not already locked
                if (port.readable && !port.readable.locked) {
                    const reader = port.readable.getReader();
                    try {
                        await reader.cancel().catch(e => console.warn('Reader cancel error:', e));
                    } finally {
                        reader.releaseLock();
                    }
                }
                // Only get a writer if not already locked
                if (port.writable && !port.writable.locked) {
                    const writer = port.writable.getWriter();
                    writer.releaseLock();
                }
            } catch (streamError) {
                console.warn('Error handling port streams:', streamError);
            }

            // Allow a small delay for locks to clear
            await new Promise(resolve => setTimeout(resolve, 100));

            // Try to close the port with multiple attempts if needed
            let closed = false;
            for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    if (port.readable || port.writable) {
                        logToTerminal(`Closing port attempt ${attempt}/3...`);
                        await port.close();
                        closed = true;
                        logToTerminal('Port closed successfully');
                        break;
                    } else {
                        logToTerminal('Port already closed');
                        closed = true;
                        break;
                    }
                } catch (closeError) {
                    logToTerminal(`Port close attempt ${attempt} failed: ${closeError.message}`, true);
                    if (attempt < 3) {
                        await new Promise(resolve => setTimeout(resolve, 500 * attempt));
                    }
                }
            }

            if (!closed) {
                logToTerminal('Warning: Could not fully close the port', true);
            }

            // Clear port variables if it was the active port
            if (port === activePort) {
                activePort = null;
                connectionState.serial = false;
                updateConnectionStatus(false, 'serial');
                connectionState.esp32 = false;
                connectionState.python = false;
                updateConnectionStatus(false, 'esp32');
                updateConnectionStatus(false, 'python');
            }

            return closed;
        } catch (error) {
            console.warn('Error during port cleanup:', error);
            logToTerminal(`Failed to clean up port: ${error.message}`, true);
            if (port === activePort) {
                activePort = null;
                connectionState.serial = false;
                updateConnectionStatus(false, 'serial');
                connectionState.esp32 = false;
                connectionState.python = false;
                updateConnectionStatus(false, 'esp32');
                updateConnectionStatus(false, 'python');
            }
            throw error;
        }
    },

    detectMicroPython: async function(port) {
        try {
            logToTerminal('Checking for MicroPython...', false, 'python');
            
            // Add detecting class to Python tile
            const pythonTile = document.getElementById('python-tile');
            if (pythonTile) {
                pythonTile.classList.add('detecting');
            }
            
            // Determine if we're in a browser or Node environment
            const isNode = typeof window === 'undefined' && 
                typeof process !== 'undefined' && 
                process.versions && 
                process.versions.node && 
                typeof require === 'function';
            
            let response = '';
            
            if (isNode) {
                // Node.js SerialPort implementation
                if (!port.isOpen) {
                    logToTerminal('Port not open for MicroPython detection', false, 'python');
                    return false;
                }
                
                // Send Ctrl+C to interrupt any running program
                await port.write(Buffer.from([0x03]));
                await new Promise(resolve => setTimeout(resolve, 100));
                
                // Send Enter and wait for prompt
                await port.write(Buffer.from([0x0D]));
                
                // Setup parser for this specific operation
                let parser;
                try {
                    // Only use require in Node.js environment
                    const ReadlineParser = require('@serialport/parser-readline').ReadlineParser;
                    parser = port.pipe(new ReadlineParser({ delimiter: '\r\n' }));
                } catch (e) {
                    console.error('Error creating parser:', e);
                    // Fallback for browser environment - shouldn't get here but just in case
                    return false;
                }
                
                // First, check for the >>> prompt
                const promptPromise = new Promise((resolve, reject) => {
                    const startTime = Date.now();
                    const timeout = 1000; // 1 second timeout for prompt detection
                    
                    const onPromptData = (data) => {
                        if (data.includes('>>>')) {
                            parser.removeListener('data', onPromptData);
                            logToTerminal('MicroPython REPL prompt detected', false, 'python');
                            resolve(true);
                        }
                        
                        // Check for timeout
                        if (Date.now() - startTime > timeout) {
                            parser.removeListener('data', onPromptData);
                            logToTerminal('MicroPython prompt detection timed out', false, 'python');
                            resolve(false);
                        }
                    };
                    
                    parser.on('data', onPromptData);
                    
                    // Set timeout as fallback
                    setTimeout(() => {
                        parser.removeListener('data', onPromptData);
                        resolve(false);
                    }, timeout);
                });
                
                const promptDetected = await promptPromise;
                
                if (promptDetected) {
                    // If prompt was detected, we know it's MicroPython
                    updateMicroPythonUI('MicroPython detected via REPL prompt');
                    
                    // Instead of sending a custom script, do a soft reboot and parse the banner
                    logToTerminal('Sending CTRL-C to interrupt any running program...', false, 'python');
                    await writer.write(new Uint8Array([0x03])); // CTRL-C
                    await new Promise(r => setTimeout(r, 100));

                    logToTerminal('Sending CTRL-D for soft reboot...', false, 'python');
                    await writer.write(new Uint8Array([0x04])); // CTRL-D
                    await new Promise(r => setTimeout(r, 100));

                    // Read the banner output
                    let banner = '';
                    const startTime = Date.now();
                    const timeout = 3000;
                    logToTerminal('Reading MicroPython banner after soft reboot...', false, 'python');
                    while (Date.now() - startTime < timeout) {
                        const { value, done } = await reader.read();
                        if (done) break;
                        const decoded = new TextDecoder().decode(value);
                        banner += decoded;
                        logToTerminal('Banner chunk: ' + decoded, false, 'python');
                        if (banner.includes('>>>')) break;
                    }
                    logToTerminal('Full MicroPython banner received:\n' + banner, false, 'python');

                    // Pass the banner to the UI update function for parsing
                    updateMicroPythonUI(banner);
                    
                    return true;
                }
                
                // Fall back to version check if prompt not detected
                // Send version check command
                const cmd = Buffer.from('import sys\r\nprint(sys.implementation.name, sys.implementation.version)\r\n');
                await port.write(cmd);
                
                // Read response with timeout
                return new Promise((resolve, reject) => {
                    const startTime = Date.now();
                    const timeout = 2000; // 2 second timeout
                    
                    const onData = (data) => {
                        response += data + '\r\n';
                        
                        if (response.toLowerCase().includes('micropython')) {
                            parser.removeListener('data', onData);
                            updateMicroPythonUI(response);
                            resolve(true);
                        }
                        
                        // Check for timeout
                        if (Date.now() - startTime > timeout) {
                            parser.removeListener('data', onData);
                            logToTerminal('MicroPython detection timed out', true, 'python');
                            resolve(false);
                        }
                    };
                    
                    parser.on('data', onData);
                    
                    // Set timeout as fallback
                    setTimeout(() => {
                        parser.removeListener('data', onData);
                        logToTerminal('MicroPython detection timed out', true, 'python');
                        resolve(false);
                    }, timeout);
                });
            } else {
                // Browser Web Serial API implementation
                let writer = null;
                let reader = null;
                
                try {
                    // Create a writer and reader with proper error handling
                    try {
                        writer = port.writable.getWriter();
                    } catch (writerError) {
                        logToTerminal(`Error creating writer: ${writerError.message}`, true, 'python');
                        return false;
                    }
                    
                    try {
                        reader = port.readable.getReader();
                    } catch (readerError) {
                        // Make sure to release the writer if we already got it
                        if (writer) {
                            try {
                                writer.releaseLock();
                            } catch (releaseError) {
                                // Just log this error, we still need to throw the original error
                                console.error('Error releasing writer after reader error:', releaseError);
                            }
                        }
                        logToTerminal(`Error creating reader: ${readerError.message}`, true, 'python');
                        return false;
                    }
                    
                // After creating writer and reader, flush any pending REPL output before sending commands
                console.log('Flushing REPL output before sending any commands...');
                let flushData = '';
                const flushStart = Date.now();
                while (Date.now() - flushStart < 1500) { // 1.5 seconds flush
                  const { value, done } = await reader.read();
                  if (value) {
                    console.log(hexDump(value, 'RECV FLUSH '));
                    flushData += new TextDecoder().decode(value);
                    if (flushData.includes('>>>') || flushData.toLowerCase().includes('micropython')) {
                      replDetected = true;
                    }
                  }
                  if (done) break;
                }
                console.log('REPL flush complete. Data:', flushData);

                if (replDetected) {
                  console.log('PHASE: REPL detected, skipping ESP32 chip_info/bootloader detection. Proceeding to MicroPython detection.');
                  logToTerminal('MicroPython REPL detected! Skipping ESP32 chip_info/bootloader detection.', false, 'python');
                  // Proceed to MicroPython detection logic (call updateMicroPythonUI or similar)
                  updateMicroPythonUI(flushData);
                  return true;
                } else {
                  console.log('PHASE: No REPL detected, running ESP32 chip_info/bootloader detection...');
                  logToTerminal('No MicroPython REPL detected. Running ESP32 chip_info/bootloader detection...', false, 'esp32');
                  // Proceed to ESP32 chip_info/bootloader detection logic as before
                  // ... existing ESP32 detection code ...
                }

                // Now send only CTRL-C, wait, and read
                console.log('SENDING TO REPL: CTRL-C (0x03)');
                console.log(hexDump(new Uint8Array([0x03]), 'SEND '));
                await writer.write(new Uint8Array([0x03]));
                await new Promise(resolve => setTimeout(resolve, 100));

                // Read after CTRL-C
                let ctrlCData = '';
                const ctrlCStart = Date.now();
                while (Date.now() - ctrlCStart < 1000) { // 1 second read
                  const { value, done } = await reader.read();
                  if (value) {
                    console.log(hexDump(value, 'RECV CTRL-C '));
                    ctrlCData += new TextDecoder().decode(value);
                  }
                  if (done) break;
                }
                console.log('REPL after CTRL-C. Data:', ctrlCData);

                // Only send ENTER if prompt not seen
                if (!ctrlCData.includes('>>>')) {
                  console.log('SENDING TO REPL: ENTER (0x0D)');
                  console.log(hexDump(new Uint8Array([0x0D]), 'SEND '));
                  await writer.write(new Uint8Array([0x0D]));
                  await new Promise(resolve => setTimeout(resolve, 100));
                  // Read after ENTER
                  let enterData = '';
                  const enterStart = Date.now();
                  while (Date.now() - enterStart < 1000) {
                    const { value, done } = await reader.read();
                    if (value) {
                      console.log(hexDump(value, 'RECV ENTER '));
                      enterData += new TextDecoder().decode(value);
                    }
                    if (done) break;
                  }
                  console.log('REPL after ENTER. Data:', enterData);
                }
                    
                    // First, check for the >>> prompt
                    let promptResponse = '';
                    const promptStartTime = Date.now();
                    const promptTimeout = 1000; // 1 second timeout for prompt detection
                    
                    while (Date.now() - promptStartTime < promptTimeout) {
                        const {value, done} = await reader.read();
                        if (done) break;
                        
                        const decoded = new TextDecoder().decode(value);
                        promptResponse += decoded;
                        
                        // Log what we're getting back to help debug
                        logToTerminal(`REPL response: "${decoded.replace(/\n/g, '\\n').replace(/\r/g, '\\r')}"`, false, 'python');
                        
                        if (promptResponse.includes('>>>')) {
                            logToTerminal('MicroPython REPL prompt detected', false, 'python');
                            updateMicroPythonUI('MicroPython detected via REPL prompt');
                            
                            // Try to get more info about MCT specifically
                            const mctCmd = new TextEncoder().encode('try:\n    import version\n    print("MCT Version:", version.__version__)\nexcept ImportError:\n    try:\n        import sys\n        print(sys.implementation._machine)\n    except:\n        try:\n            help("version")\n        except:\n            pass\n\r');
                            console.log('SENDING TO REPL: mctCmd', mctCmd);
                            console.log(hexDump(mctCmd, 'SEND '));
                            await writer.write(mctCmd);
                            
                            return true;
                        }
                    }
                    
                    // Send version check command if prompt not detected
                const cmd = new TextEncoder().encode('import sys\r\nprint(sys.implementation.name, sys.implementation.version)\r\n');
                console.log('SENDING TO REPL: version check', cmd);
                console.log(hexDump(cmd, 'SEND '));
                await writer.write(cmd);
                
                // Read response with timeout
                let response = '';
                const startTime = Date.now();
                const timeout = 2000; // 2 second timeout
                
                while (Date.now() - startTime < timeout) {
                    const {value, done} = await reader.read();
                    if (done) break;
                    
                    response += new TextDecoder().decode(value);
                        if (response.toLowerCase().includes('micropython')) {
                            updateMicroPythonUI(response);
                            return true;
                        }
                    }
                    
                    // If we get here, we couldn't detect MicroPython
                    logToTerminal('MicroPython not detected', false, 'python');
                    return false;
                } catch (error) {
                    logToTerminal(`MicroPython detection error: ${error.message}`, true, 'python');
                    return false;
                } finally {
                    // Properly release locks in finally block
                    if (reader) {
                        try {
                            reader.releaseLock();
                        } catch (releaseError) {
                            console.error('Error releasing reader:', releaseError);
                        }
                    }
                    
                    if (writer) {
                        try {
                            writer.releaseLock();
                        } catch (releaseError) {
                            console.error('Error releasing writer:', releaseError);
                        }
                    }
                }
            }
            
            return false;
        } catch (error) {
            logToTerminal(`MicroPython detection failed: ${error.message}`, true, 'python');
            // Hide Python tile and icon on error
            const pythonTile = document.getElementById('python-tile');
            const pythonIcon = document.getElementById('python-icon');
            if (pythonTile) {
                pythonTile.style.opacity = '0.5';
                pythonTile.style.filter = 'grayscale(70%)';
                pythonTile.classList.remove('detecting');
            }
            if (pythonIcon) pythonIcon.style.opacity = '0.3';
            connectionState.python = false;
            updateConnectionStatus(false, 'python');
            return false;
        }
        
        // Helper function to update UI based on detected MicroPython
        function updateMicroPythonUI(response) {
            // Show Python tile and icon
            const pythonTile = document.getElementById('python-tile');
            const pythonIcon = document.getElementById('python-icon');
            if (pythonTile) {
                pythonTile.style.opacity = '1';
                pythonTile.style.filter = 'none';
                pythonTile.classList.remove('detecting');
                pythonTile.classList.add('detected');

                // Add yellow text styling to all info values
                const infoValues = pythonTile.querySelectorAll('.endpoint-value');
                infoValues.forEach(el => {
                    el.style.color = 'var(--neon-yellow)';
                    el.style.textShadow = 'var(--neon-yellow-glow)';
                });

                // Add yellow text styling to labels
                const infoLabels = pythonTile.querySelectorAll('.endpoint-label');
                infoLabels.forEach(el => {
                    el.style.color = 'var(--neon-yellow)';
                });

                // Scroll to Python tile with a smooth animation
                pythonTile.scrollIntoView({ behavior: 'smooth' });

                // Add highlight animation
                pythonTile.classList.add('highlight-tile');
                setTimeout(() => {
                    pythonTile.classList.remove('highlight-tile');
                }, 800);
            }

            if (pythonIcon) {
                pythonIcon.style.opacity = '1';
                pythonIcon.style.color = 'var(--neon-yellow)';
                pythonIcon.style.textShadow = 'var(--neon-yellow-intense)';
            }

            // Update connection state
            connectionState.python = true;
            updateConnectionStatus(true, 'python');

            // Extract version and update UI
            let version = '?';
            let mctVersion = null;
            let lvglVersion = null;
            let isMCT = false;

            // Log the full response for debugging
            console.log("MicroPython detection response:", response);

            // Parse AVS MCT version message
            // Example: AVS MCT (0.9.20250404_1805) LVGL (9.2.2) MicroPython (1.24.1) ...
            const avsMctMatch = response.match(/AVS\s+MCT\s*\(([^)]+)\)\s*LVGL\s*\(([^)]+)\)\s*MicroPython\s*\(([^)]+)\)/i);
            if (avsMctMatch) {
                mctVersion = avsMctMatch[1] || '?';
                lvglVersion = avsMctMatch[2] || '?';
                version = avsMctMatch[3] || '?';
                isMCT = true;
                logToTerminal(`Detected AVS MCT version: ${mctVersion}, LVGL: ${lvglVersion}, MicroPython: ${version}`, false, 'python');
            } else {
                // Fallback to previous logic
                const mctVersionMatch = response.match(/MCT Version:\s+([0-9._]+)/i);
                if (mctVersionMatch) {
                    mctVersion = mctVersionMatch[1];
                    version = mctVersion ? `MCT ${mctVersion}` : '?';
                    isMCT = true;
                    logToTerminal(`Detected MCT version: ${mctVersion || '?'}`, false, 'python');
                }
                // Try to extract LVGL version if present
                const lvglMatch = response.match(/LVGL\s*\(([^)]+)\)/i);
                if (lvglMatch) {
                    lvglVersion = lvglMatch[1] || '?';
                }
            }

            // Update Python tile version
            const versionEl = document.getElementById('python-version');
            if (versionEl) versionEl.textContent = version || '?';

            // Update Python tile LVGL version (add a new field if not present)
            let lvglEl = document.getElementById('python-lvgl-version');
            if (!lvglEl) {
                // Add LVGL version row to Python tile if it doesn't exist
                const endpointInfo = pythonTile && pythonTile.querySelector('.endpoint-info');
                if (endpointInfo) {
                    const lvglRow = document.createElement('div');
                    lvglRow.className = 'endpoint-row';
                    const label = document.createElement('span');
                    label.className = 'endpoint-label';
                    label.textContent = 'LVGL:';
                    const value = document.createElement('span');
                    value.className = 'endpoint-value';
                    value.id = 'python-lvgl-version';
                    value.textContent = lvglVersion || '?';
                    lvglRow.appendChild(label);
                    lvglRow.appendChild(value);
                    endpointInfo.insertBefore(lvglRow, endpointInfo.firstChild.nextSibling); // After VERSION
                    lvglEl = value;
                }
            } else {
                lvglEl.textContent = lvglVersion || '?';
            }

            // Set memory value to '?' (no default)
            const memoryEl = document.getElementById('python-memory');
            if (memoryEl) memoryEl.textContent = '?';

            logToTerminal(`MicroPython detected: ${version || '?'}`, false, 'python');

            // Update MCT tile with MCT version if detected
            if (isMCT && mctVersion) {
                const avsTile = document.getElementById('avs-tile');
                if (avsTile) {
                    // Find or create a version row in the tile-content
                    let versionRow = avsTile.querySelector('.avs-version-row');
                    if (!versionRow) {
                        versionRow = document.createElement('div');
                        versionRow.className = 'avs-version-row';
                        versionRow.style.fontSize = '13px';
                        versionRow.style.color = 'var(--neon-green)';
                        versionRow.style.marginTop = '4px';
                        avsTile.querySelector('.tile-content').prepend(versionRow);
                    }
                    versionRow.textContent = `MCT Version: ${mctVersion}`;
                }
            }

            // Check if we detected AVS MCT and activate MCT tile if found
            if (isMCT || response.toLowerCase().includes('avs mct')) {
                logToTerminal('AVS MCT detected! Activating MCT tile...', false, 'avs');
                const avsTile = document.getElementById('avs-tile');
                const avsIcon = document.getElementById('avs-icon');
                if (avsTile) {
                    avsTile.style.opacity = '1';
                    avsTile.style.filter = 'none';
                    avsTile.classList.add('detected');
                    setTimeout(() => {
                        avsTile.scrollIntoView({ behavior: 'smooth' });
                        avsTile.classList.add('highlight-tile');
                        setTimeout(() => {
                            avsTile.classList.remove('highlight-tile');
                        }, 800);
                    }, 1000);
                }
                if (avsIcon) {
                    avsIcon.style.opacity = '1';
                    avsIcon.style.color = 'var(--neon-green)';
                    avsIcon.style.textShadow = 'var(--neon-green-intense)';
                }
                connectionState.avs = true;
                updateConnectionStatus(true, 'avs');
            }
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

    // Add checkPython method that calls detectMicroPython
    checkPython: async function(port) {
        try {
            // Add detecting class to Python tile
            const pythonTile = document.getElementById('python-tile');
            if (pythonTile) {
                pythonTile.classList.add('detecting');
                pythonTile.style.opacity = '0.8';
            }
            
            const pythonIcon = document.getElementById('python-icon');
            if (pythonIcon) {
                pythonIcon.style.opacity = '0.7';
            }
            
            // Simply call the existing detectMicroPython method
            return await this.detectMicroPython(port);
        } catch (error) {
            // Don't show the error in the terminal if it's a common Node.js module error
            // which is expected in the browser environment
            const isCommonNodeError = error.message && (
                error.message.includes('require is not defined') ||
                error.message.includes('module is not defined') ||
                error.message.includes('@serialport')
            );
            
            if (!isCommonNodeError) {
                logToTerminal(`Python check failed: ${error.message}`, true, 'python');
                console.error('Python check error:', error);
            } else {
                console.log('Ignoring expected Node.js module error in browser:', error.message);
            }
            
            // Reset detection UI
            const pythonTile = document.getElementById('python-tile');
            if (pythonTile) {
                pythonTile.classList.remove('detecting');
                pythonTile.style.opacity = '0.5';
                pythonTile.style.filter = 'grayscale(70%)';
            }
            
            const pythonIcon = document.getElementById('python-icon');
            if (pythonIcon) {
                pythonIcon.style.opacity = '0.3';
            }
            
            // Error is not critical for the application, so return false but don't crash
            return false;
        }
    },

    autoConnectToStoredPorts: async function() {
        if (window.isFlashing) {
            logToTerminal('Auto-connect skipped: firmware update in progress', false, 'serial');
            return false;
        }
        logToTerminal('Checking for stored ports...');
        try {
            const ports = await navigator.serial.getPorts();
            
            if (ports.length > 0) {
                logToTerminal(`Found ${ports.length} stored port(s)`);
                
                // Try to connect to the first available port without cleaning up first
                // This helps with devices that are already in use
                try {
                    // Check if the port is already open
                    const port = ports[0];
                    
                    // If port is already open and we have an active port, just use it
                    if (activePort && activePort === port && port.readable && port.writable) {
                        logToTerminal('Using already open active port');
                        this.updateToggleState(true);
                        
                        // Update the connection status
                        connectionState.serial = true;
                        updateConnectionStatus(true, 'serial');
                        
                        // Since port is already open, just update the USB info
                        try {
                            await this.updateUSBInfo(port);
                        } catch (e) {
                            console.warn('Failed to update USB info for already open port:', e);
                        }
                        
                        return true;
                    }
                    
                    // Otherwise try to connect normally
                    logToTerminal('Attempting to connect to stored port...');
                    const connected = await this.connectToPort(port);
                    
                    if (connected) {
                        activePort = port;
                        window.USBManager = window.USBManager || {};
                        window.USBManager.currentPort = activePort;
                        logToTerminal('Successfully connected to stored port', false, 'serial');
                        this.updateToggleState(true);
                        return true;
                    } else {
                        logToTerminal('Connection to stored port did not complete successfully', true);
                        this.updateToggleState(false);
                        
                        // If we failed to connect normally, try a full port cleanup and reconnect with multiple retries
                        try {
                            logToTerminal('Trying more aggressive cleanup and reconnect...');
                            
                            // Clean up any existing port
                            if (activePort) {
                                await this.cleanupPort(activePort);
                                activePort = null;
                                
                                // Medium delay for potential WebUSB backend cleanup
                                await new Promise(resolve => setTimeout(resolve, 1000));
                            }
                            
                            // Try reconnecting with multiple attempts
                            let reconnected = false;
                            const maxRetries = 3;
                            
                            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                                logToTerminal(`Reconnection attempt ${attempt}/${maxRetries}...`);
                                
                                try {
                                    reconnected = await this.connectToPort(port);
                            if (reconnected) {
                                        logToTerminal(`Successfully reconnected on attempt ${attempt}`);
                                this.updateToggleState(true);
                                return true;
                                    }
                                } catch (attemptError) {
                                    logToTerminal(`Reconnection attempt ${attempt} failed: ${attemptError.message}`, true);
                                    
                                    // Try forcefully closing the port if it's still open
                                    try {
                                        if (port.readable || port.writable) {
                                            await port.close().catch(e => console.warn('Forced close error:', e));
                                        }
                                    } catch (e) {
                                        console.warn('Error during forced close:', e);
                                    }
                                    
                                    // Longer delay between retries
                                    await new Promise(resolve => setTimeout(resolve, 1500));
                                }
                            }
                            
                            // If all retries failed, try to forget the device entirely
                            if (!reconnected) {
                                logToTerminal('All reconnection attempts failed. Trying to forget the device...', true);
                                
                                try {
                                    const forgotten = await this.forgetDevice(port);
                                    if (forgotten) {
                                        logToTerminal('Device forgotten successfully. Please reconnect manually.', true);
                            } else {
                                        logToTerminal('Could not forget the device programmatically.', true);
                                    }
                                } catch (forgetError) {
                                    logToTerminal(`Error forgetting device: ${forgetError.message}`, true);
                                }
                                
                                // Add a manual connect button to the USB tile if it doesn't exist
                                const usbTile = document.getElementById('serial-tile');
                                if (usbTile && !document.getElementById('manual-connect-btn')) {
                                    const manualConnectBtn = document.createElement('button');
                                    manualConnectBtn.id = 'manual-connect-btn';
                                    manualConnectBtn.className = 'neon-button green';
                                    manualConnectBtn.textContent = 'Connect Manually';
                                    manualConnectBtn.style.marginTop = '10px';
                                    manualConnectBtn.addEventListener('click', async () => {
                                        try {
                                            logToTerminal('Requesting manual port selection...');
                                            const manualPort = await navigator.serial.requestPort();
                                            
                                            // Remove the button after use
                                            const oldBtn = document.getElementById('manual-connect-btn');
                                            if (oldBtn) oldBtn.remove();
                                            
                                            logToTerminal('Manual port selected, attempting connection...');
                                            const success = await this.connectToPort(manualPort);
                                            
                                            if (success) {
                                                logToTerminal('Manual connection successful!');
                                            } else {
                                                logToTerminal('Manual connection failed', true);
                                            }
                                        } catch (manualError) {
                                            logToTerminal(`Manual connection error: ${manualError.message}`, true);
                                        }
                                    });
                                    usbTile.appendChild(manualConnectBtn);
                                }
                                
                                throw new Error('Failed to reconnect after multiple attempts and device reset');
                            }
                        } catch (retryError) {
                            logToTerminal(`Reconnect failed: ${retryError.message}`, true);
                            this.updateToggleState(false);
                            
                            // If we've completely failed, suggest a browser refresh
                            logToTerminal('Recommendation: Please refresh your browser or disconnect and reconnect your device', true);
                            
                            return false;
                        }
                    }
                } catch (error) {
                    logToTerminal(`Failed to connect to stored port: ${error.message}`, true);
                    this.updateToggleState(false);
                    
                    // If there's an error about the port already being in use, provide specific guidance
                    if (error.message.includes('already in progress') || error.message.includes('already open') || 
                        error.message.includes('unavailable') || error.message.includes('in use')) {
                        logToTerminal('The port appears to be in use or locked. Try refreshing the browser or reconnecting the device.', true);
                        
                        // Try to forget the device as a last resort
                        try {
                            logToTerminal('Attempting to reset browser USB connection state...', true);
                            if (ports[0]) {
                                await this.forgetDevice(ports[0]);
                            }
                        } catch (e) {
                            console.warn('Error during forced device forget:', e);
                        }
                        
                        // Add a manual connect button to help the user
                        const usbTile = document.getElementById('serial-tile');
                        if (usbTile && !document.getElementById('manual-connect-btn')) {
                            const manualConnectBtn = document.createElement('button');
                            manualConnectBtn.id = 'manual-connect-btn';
                            manualConnectBtn.className = 'neon-button green';
                            manualConnectBtn.textContent = 'Connect Manually';
                            manualConnectBtn.style.marginTop = '10px';
                            manualConnectBtn.addEventListener('click', async () => {
                                try {
                                    logToTerminal('Requesting manual port selection...');
                                    const manualPort = await navigator.serial.requestPort();
                                    
                                    // Remove the button after use
                                    const oldBtn = document.getElementById('manual-connect-btn');
                                    if (oldBtn) oldBtn.remove();
                                    
                                    logToTerminal('Manual port selected, attempting connection...');
                                    const success = await this.connectToPort(manualPort);
                                    
                                    if (success) {
                                        logToTerminal('Manual connection successful!');
                                    } else {
                                        logToTerminal('Manual connection failed', true);
                                    }
                                } catch (manualError) {
                                    logToTerminal(`Manual connection error: ${manualError.message}`, true);
                                }
                            });
                            usbTile.appendChild(manualConnectBtn);
                            logToTerminal('Added a manual connect button to the USB tile', false);
                        }
                    }
                    
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
        logESP32Message('Attempting to reset ESP32 into bootloader mode...');
        logESP32Message('╔══════════════════════════════════════════╗');
        logESP32Message('║ ESP32 Boot Sequence - Please Wait        ║');
        logESP32Message('╚══════════════════════════════════════════╝');
        
        try {
            // First, check if we need to release any existing locks for the reset command
            let writer = null;
            let writerReleased = false;
            
            if (portWriter) {
                // Use existing writer if available
                writer = portWriter;
                logESP32Message('Using existing port writer for ESP32 reset');
            } else {
                // Create a new writer if none exists
                try {
                    logESP32Message('Creating new writer for ESP32 reset');
                    writer = port.writable.getWriter();
                    writerReleased = true;
                } catch (writerError) {
                    logESP32Message(`Cannot create writer for ESP32 reset: ${writerError.message}`, true);
                    // Try using a direct write if available (fallback)
                    if (port.write) {
                        logESP32Message('Trying direct port write method');
                        writer = port;
                    } else {
                        throw new Error('No writer available for ESP32 reset');
                    }
                }
            }
            
            try {
                logESP32Message('  ↓ Sending boot signals');
                
                // Method 1: Classic ESP reset technique - send break
                try {
                    if (port.setBreak) {
                        logESP32Message('Sending BREAK signal...');
                        await port.setBreak(true);
                await new Promise(resolve => setTimeout(resolve, 100));
                        await port.setBreak(false);
                        logESP32Message('BREAK signal sent');
                    } else {
                        logESP32Message('BREAK signal not supported, using alternative methods');
                    }
                } catch (breakError) {
                    logESP32Message(`BREAK signal error: ${breakError.message}`, true);
                }
                
                logESP32Message('  ↓ Triggering bootloader entry');
                
                // Method 2: Use data pattern to trigger watchdog reset
                logESP32Message('Sending binary pattern to trigger bootloader mode...');
                
                // Special sequence that may help trigger ROM bootloader
                const bootSequence = new Uint8Array([
                    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                    0x07, 0x07, 0x12, 0x20, 0x55, 0x55, 0x55, 0x55, 
                    0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55
                ]);
                
                // Log the bytes being sent with our new function
                logESP32Message('BOOT SEQUENCE:');
                logESP32Message(hexDump(bootSequence, '>>> '));
                
                // Send the bytes with a short delay between blocks to help the chip process them
                await writer.write(bootSequence.slice(0, 8)); // Send zeros first
                await new Promise(resolve => setTimeout(resolve, 50));
                await writer.write(bootSequence.slice(8)); // Send boot sequence
                
                // Wait to allow the boot sequence to take effect
                logESP32Message('Waiting for boot sequence to take effect...');
                        await new Promise(resolve => setTimeout(resolve, 250));
                
                logESP32Message('  ↓ Initializing ROM bootloader');
                
                // Method 3: Another pattern that works on some ESP32 variants
                const altPattern = new Uint8Array([
                    0x00, 0x08, 0x24, 0x00, 
                    0x00, 0x28, 0x00, 0x00, 
                    0x00, 0x00, 0x00, 0x00
                ]);
                
                // Log and send the alternative pattern
                logESP32Message('ALTERNATIVE BOOT PATTERN:');
                logESP32Message(hexDump(altPattern, '>>> '));
                
                await writer.write(altPattern);
                
                // Wait for bootloader to be ready
                logESP32Message('Waiting for bootloader to initialize...');
                await new Promise(resolve => setTimeout(resolve, 500));
                
                // Final flush with 0x55 padding
                const padding = new Uint8Array(16);
                padding.fill(0x55);
                await writer.write(padding);
                
                // At end of function
                logESP32Message('╔══════════════════════════════════════════╗');
                logESP32Message('║ ESP32 bootloader entry sequence complete ║');
                logESP32Message('╚══════════════════════════════════════════╝');
                
                return true;
                    } finally {
                // Release the writer if we created it
                if (writerReleased && writer && writer !== port) {
                    try {
                        // First close the writer if possible
                        if (writer.close) {
                            await writer.close();
                        }
                        // Then release the lock
                            writer.releaseLock();
                        logESP32Message('Released temporary writer after ESP32 reset');
                    } catch (releaseError) {
                        logESP32Message(`Error releasing writer: ${releaseError.message}`, true);
                    }
                }
            }
        } catch (error) {
            logESP32Message(`ESP32 reset failed: ${error.message}`, true);
            
            // In the error case
            logESP32Message('╔══════════════════════════════════════════╗');
            logESP32Message('║ ESP32 bootloader sequence failed         ║', true);  
            logESP32Message('╚══════════════════════════════════════════╝');
            
            // Fall back to manual reset instructions
            logESP32Message('Please manually reset your ESP32 while holding BOOT button');
            logESP32Message('Waiting 3 seconds for manual reset...');
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            return false;
        }
    },

    // Custom transport class that works with already open ports
    createESPTransport: function(port, isAlreadyOpen) {
        class ESPTransport extends Transport {
            constructor(port, isAlreadyOpen) {
                super(port);
                this._isAlreadyOpen = isAlreadyOpen;
                this._port = port;
                this._reader = null;
                this._writer = null;
                this._locked = false;
                this._ownedReader = false;
                this._ownedWriter = false;
            }
            
            async connect() {
                if (this._isAlreadyOpen) {
                    logESP32Message("Using already open port for ESP32 detection");
                    
                    // Safely create reader and writer without causing lock errors
                    try {
                        // Check if the streams are already locked
                        let readerLocked = false;
                        let writerLocked = false;
                        
                        try {
                            // Try to create a temporary reader - this will throw if already locked
                            const testReader = this._port.readable.getReader();
                            // If we got here, it's not locked
                            testReader.releaseLock();
                            logESP32Message("Reader stream is available");
                        } catch (e) {
                            if (e.message.includes('locked')) {
                                readerLocked = true;
                                logESP32Message('Reader is already locked, will use a special approach');
                            } else {
                                throw e;
                            }
                        }
                        
                        try {
                            // Try to create a temporary writer - this will throw if already locked
                            const testWriter = this._port.writable.getWriter();
                            // If we got here, it's not locked
                            testWriter.releaseLock();
                            logESP32Message("Writer stream is available");
                        } catch (e) {
                            if (e.message.includes('locked')) {
                                writerLocked = true;
                                logESP32Message('Writer is already locked, will use a special approach');
                            } else {
                                throw e;
                            }
                        }
                        
                        // If either stream is locked, we'll try to work with what we have
                        if (readerLocked || writerLocked) {
                            logESP32Message("One or more streams are locked - trying alternative approach");
                            this._locked = true;
                            
                            // For ESP detection, we can try to work with external streams
                            // This will display partial information even if we can't fully detect
                            
                            // Check if we have the global reader
                            if (readerLocked) {
                                if (portReader) {
                                    this._reader = portReader;
                                    logESP32Message('Using existing global reader');
                                } else {
                                    logESP32Message('Warning: Reader is locked but no global reader is available', true);
                                    // We'll try to proceed with a null reader
                                    // Later parts of the code must check for this
                                }
                            } else {
                                // Create a new reader
                        this._reader = this._port.readable.getReader();
                                this._ownedReader = true;
                                logESP32Message('Created new owned reader');
                            }
                            
                            if (writerLocked) {
                                if (portWriter) {
                                    this._writer = portWriter;
                                    logESP32Message('Using existing global writer');
                                } else {
                                    logESP32Message('Warning: Writer is locked but no global writer is available', true);
                                    // We'll try to proceed with a null writer
                                }
                            } else {
                                // Create a new writer
                        this._writer = this._port.writable.getWriter();
                                this._ownedWriter = true;
                                logESP32Message('Created new owned writer');
                            }
                            
                            // Continue despite potential issues - the ESP32 detection will be limited
                            // but might provide some information
                        return true;
                        } else {
                            // Normal case - create new reader and writer
                            this._reader = this._port.readable.getReader();
                            this._ownedReader = true;
                            this._writer = this._port.writable.getWriter();
                            this._ownedWriter = true;
                            logESP32Message("Created new reader and writer for ESP32 transport");
                            return true;
                        }
                        
                    } catch (error) {
                        logESP32Message(`Failed to set up reader/writer: ${error.message}`, true);
                        throw error;
                    }
                } else {
                    // Use the parent class implementation to open the port
                    try {
                        logESP32Message("Using Transport's connect method for unopened port");
                        const result = await super.connect();
                        
                        if (result) {
                            this._ownedReader = true;
                            this._ownedWriter = true;
                        }
                        
                        return result;
                    } catch (e) {
                        logESP32Message(`Transport connect error: ${e.message}`, true);
                        throw e;
                    }
                }
            }
            
            async write(data) {
                try {
                    // More detailed debug logging
                    logESP32Message(`>>> WRITE [${data.length} bytes]`);
                    logESP32Message(hexDump(data, '>>> '));
                    
                    await this._writer.write(data);
                    return data.length;
                } catch (error) {
                    logESP32Message(`Write error: ${error.message}`, true);
                    throw error;
                }
            }
            
            async read(size = 1) {
                let attempts = 0;
                let response = new Uint8Array(0);
                let remaining = size;
                
                logESP32Message(`Reading ${size} bytes of data...`);
                
                // Special handling for locked streams
                if (this._locked) {
                    try {
                        const readResult = await Promise.race([
                            this._reader.read(),
                            new Promise((_, reject) => 
                                setTimeout(() => reject(new Error('Read timeout (locked stream)')), 30000) // Increase to 30 seconds
                            )
                        ]);
                        
                        if (readResult.done) {
                            return response;
                        }
                        
                        
                        if (readResult.value) {
                            // Show the bytes we got with hexdump
                            logESP32Message(`Locked stream read: ${readResult.value.length} bytes`);
                            logESP32Message(hexDump(readResult.value, 'LOCKED READ '));
                            return readResult.value;
                        }
                    } catch (e) {
                        logESP32Message(`Read error with locked stream: ${e.message}`, true);
                        return response;
                    }
                }
                
                // Normal reading process for unlocked streams
                const maxAttempts = 12; // Increase from 8 to 12
                
                while (remaining > 0 && attempts < maxAttempts) {
                    try {
                        logESP32Message(`Reading data (attempt ${attempts+1}/${maxAttempts})...`);
                        
                        const readResult = await Promise.race([
                            this._reader.read(),
                            new Promise((_, reject) => 
                                setTimeout(() => reject(new Error(`Read timeout (attempt ${attempts+1}/${maxAttempts})`)), 30000) // Increase to 30 seconds
                            )
                        ]);
                        
                        if (readResult.done) {
                            logESP32Message("Read stream closed by device");
                            break;
                        }
                        
                        const value = readResult.value;
                        
                        if (value && value.length > 0) {
                            // Always show the bytes we got in this read, for every chunk
                            logESP32Message(`Read ${value.length} bytes (attempt ${attempts+1})`);
                            logESP32Message(hexDump(value, `READ CHUNK [${attempts+1}] `));
                            
                            // Concatenate with existing response
                        const newResponse = new Uint8Array(response.length + value.length);
                        newResponse.set(response);
                        newResponse.set(value, response.length);
                        response = newResponse;
                        
                        remaining -= value.length;
                            // Reset attempts on successful read
                            attempts = 0;
                            
                            // If we've got the exact size we wanted, show a summary before returning
                            if (remaining === 0) {
                                logESP32Message(`Completed read of ${size} bytes`);
                                logESP32Message(`Full response (${response.length} bytes):`);
                                logESP32Message(hexDump(response, 'COMPLETE '));
                            }
                        } else {
                            // Increment attempts only if we got an empty read
                            logESP32Message(`Read returned empty data`);
                            attempts++;
                            // Short delay before retrying
                            await new Promise(resolve => setTimeout(resolve, 300)); // Increase from 200ms to 300ms
                        }
                    } catch (error) {
                        logESP32Message(`Read attempt ${attempts+1} error: ${error.message}`, true);
                        attempts++;
                        
                        // Wait longer between retries
                        const delay = Math.min(800 * attempts, 3000); // Increase max delay to 3s
                        logESP32Message(`Waiting ${delay}ms before retry...`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                        
                        // If we've tried several times but still have data, return what we have
                        if (attempts >= 5 && response.length > 0) { // Increased threshold from 3 to 5
                            logESP32Message(`Returning partial data (${response.length} bytes) after ${attempts} failed attempts`, true);
                            logESP32Message(hexDump(response, 'PARTIAL '));
                            return response;
                        }
                    }
                }
                
                if (attempts >= maxAttempts && remaining > 0) {
                    // If we've reached max attempts but have some data, we'll use it
                    if (response.length > 0) {
                        logESP32Message(`Max read attempts (${maxAttempts}) reached. Using partial data (${response.length} bytes).`, true);
                        logESP32Message(hexDump(response, 'MAX ATTEMPTS '));
                        return response;
                    } else {
                        // Don't create dummy responses, just return what we got (empty array)
                        logESP32Message(`Max read attempts (${maxAttempts}) reached with no data.`, true);
                        return new Uint8Array(0); // Return empty array, let caller handle this case
                    }
                }
                
                // At the end of the read function, before returning
                if (response && response.length > 0) {
                    logESP32Message(`<<< READ COMPLETE [${response.length} bytes]`);
                    logESP32Message(hexDump(response, '<<< '));
                }
                
                return response;
            }
            
            async disconnect() {
                try {
                    logESP32Message("Disconnecting ESP transport...");
                    
                if (this._isAlreadyOpen) {
                        // Don't release locks for global reader/writer if we're using them
                        if (this._locked) {
                            // Just nullify our references without releasing locks
                            logESP32Message("Keeping global reader/writer locks", false);
                            this._reader = null;
                            this._writer = null;
                            return;
                        }
                        
                        // Release locks for regular readers/writers that we own
                        if (this._reader && this._ownedReader) {
                            try {
                                logESP32Message("Releasing owned reader", false);
                            await this._reader.cancel();
                            this._reader.releaseLock();
                            this._reader = null;
                        } catch (e) {
                            console.warn("Error releasing reader:", e);
                                logESP32Message(`Error releasing reader: ${e.message}`, true);
                        }
                    }
                    
                        if (this._writer && this._ownedWriter) {
                        try {
                                logESP32Message("Releasing owned writer", false);
                                // Close writer to flush any pending data
                                await this._writer.close().catch(() => {});
                            this._writer.releaseLock();
                            this._writer = null;
                        } catch (e) {
                            console.warn("Error releasing writer:", e);
                                logESP32Message(`Error releasing writer: ${e.message}`, true);
                        }
                    }
                } else {
                    // Use parent implementation to close port
                        logESP32Message("Closing port with parent implementation", false);
                        return await super.disconnect();
                    }
                } catch (e) {
                    logESP32Message(`Error during transport disconnect: ${e.message}`, true);
                }
            }
        }
        
        return new ESPTransport(port, isAlreadyOpen);
    },

    // ESP32 detection function
    detectESP32: async function(port) {
        try {
            logESP32Message('Starting ESP32 detection...');
            
            // Update ESP32 tile to show detection in progress
            const esp32Tile = document.getElementById('esp32-tile');
            if (esp32Tile) {
                // Remove previous states
                esp32Tile.classList.remove('detected');
                
                // Add detecting state
                esp32Tile.classList.add('detecting');
                
                // Ensure visibility
                esp32Tile.style.display = 'flex';
                esp32Tile.style.opacity = '0.9';
                
                // Scroll to ESP32 tile
                esp32Tile.scrollIntoView({ behavior: 'smooth' });
                
                // Update the retry button to show detection in progress
                const retryBtn = document.getElementById('esp32-retry');
                if (retryBtn) {
                    retryBtn.disabled = true;
                    retryBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';
                }
                
                // Helper function to update individual fields in the ESP32 tile
                const updateField = (id, value, animate = true) => {
                    const field = document.getElementById(id);
                    if (field) {
                        // Save the old value
                        const oldValue = field.textContent;
                        
                        // Update with new value
                        field.textContent = value;
                        
                        // Add animation if the value changed
                        if (animate && oldValue !== value && oldValue !== "Detecting..." && oldValue !== "Reading...") {
                            // Add the detection indicator
                            field.innerHTML = `<span class="detection-indicator"><i class="fas fa-check"></i></span> ${value}`;
                            
                            // Add the animation class
                            field.classList.add('value-updated');
                            
                            // Remove animation after a delay
                            setTimeout(() => {
                                field.classList.remove('value-updated');
                                
                                // Remove the indicator after the animation
                                setTimeout(() => {
                                    field.textContent = value;
                                }, 1000);
                            }, 1000);
                            
                            // Update the ESP32 tile icon to indicate progress
                            const tileIcon = document.querySelector('#esp32-tile .tile-icon i');
                            if (tileIcon) {
                                tileIcon.classList.add('fa-spin');
                                setTimeout(() => {
                                    tileIcon.classList.remove('fa-spin');
                                }, 500);
                            }
                        }
                        
                        // Special handling for detection state fields
                        if (value === "Detecting..." || value === "Reading...") {
                            field.innerHTML = `<span class="detecting-now"><i class="fas fa-circle-notch fa-spin"></i></span> ${value}`;
                        }
                    }
                };
                
                // Setup event listeners for real-time updates
                const onDetectionStart = () => {
                    // Reset all fields to show "Detecting..."
                    updateField('esp32-chip-type', 'Detecting...', false);
                    updateField('esp32-flash', 'Detecting...', false);
                    updateField('esp32-psram', 'Detecting...', false);
                    updateField('esp32-mac', 'Detecting...', false);
                    updateField('esp32-chip-id', 'Detecting...', false);
                    updateField('esp32-features', 'Detecting...', false);
                    updateField('esp32-crystal', 'Detecting...', false);
                };
                
                const onDetectionStep = (data) => {
                    logESP32Message(`Step: ${data.message}`);
                    
                    // Update specific field based on step
                    switch (data.step) {
                        case 'chipid':
                            updateField('esp32-chip-id', 'Reading...', false);
                            break;
                        case 'chiptype':
                        case 'chiptype_alt':
                            updateField('esp32-chip-type', 'Identifying...', false);
                            break;
                        case 'mac':
                            updateField('esp32-mac', 'Reading...', false);
                            break;
                    }
                };
                
                const onDetectionProgress = (data) => {
                    logESP32Message(`Progress: ${data.message} - ${data.value || ''}`);
                    
                    // Update specific field based on step
                    switch (data.step) {
                        case 'chipid':
                            updateField('esp32-chip-id', data.value || 'Unknown');
                            break;
                        case 'chiptype':
                        case 'chiptype_alt':
                            updateField('esp32-chip-type', data.value || 'Unknown');
                            // When chip type is identified, we can update default features
                            if (data.value === 'ESP32-S3') {
                                updateField('esp32-features', 'WiFi, BLE 5, USB');
                                updateField('esp32-flash', '16MB');
                                updateField('esp32-psram', '8MB');
                                updateField('esp32-crystal', '40MHz');
                            } else if (data.value === 'ESP32') {
                                updateField('esp32-features', 'WiFi, BLE 4.2, Dual Core');
                                updateField('esp32-flash', '4MB');
                                updateField('esp32-psram', 'Not Present');
                                updateField('esp32-crystal', '40MHz');
                            }
                            break;
                        case 'mac':
                            updateField('esp32-mac', data.value || 'Unknown');
                            break;
                        case 'features':
                            updateField('esp32-features', data.value || 'Unknown');
                            break;
                        case 'flash':
                            updateField('esp32-flash', data.value || 'Unknown');
                            break;
                        case 'psram':
                            updateField('esp32-psram', data.value || 'Not Present');
                            break;
                        case 'crystal':
                            updateField('esp32-crystal', data.value || '40MHz');
                            break;
                    }
                    
                    // Visual feedback that detection is in progress
                    const tileIcon = esp32Tile.querySelector('.tile-icon i');
                    if (tileIcon) {
                        tileIcon.classList.add('fa-spin');
                        setTimeout(() => {
                            tileIcon.classList.remove('fa-spin');
                        }, 500);
                    }
                };
                
                const onDetectionWarning = (data) => {
                    logESP32Message(`Warning: ${data.message}`, true);
                };
                
                const onDetectionError = (data) => {
                    logESP32Message(`Error: ${data.message}`, true);
                    
                    // If step is specified, update the specific field
                    if (data.step === 'chipid') {
                        updateField('esp32-chip-id', 'Error', false);
                    } else if (data.step === 'mac') {
                        updateField('esp32-mac', 'Error', false);
                    }
                };
                
                const onDetectionComplete = (chipInfo) => {
                    // Update all fields with final values
                    updateField('esp32-chip-type', chipInfo.chipType);
                    updateField('esp32-flash', chipInfo.flashSize);
                    updateField('esp32-psram', chipInfo.hasPSRAM ? chipInfo.psramSize : 'Not Present');
                    updateField('esp32-mac', chipInfo.macAddress);
                    updateField('esp32-features', chipInfo.features.join(', '));
                    updateField('esp32-crystal', '40MHz');
                    
                    logESP32Message('Chip detection complete');
                };
                
                // Register event listeners
                chipInfoEvents.on('detection:start', onDetectionStart);
                chipInfoEvents.on('detection:step', onDetectionStep);
                chipInfoEvents.on('detection:progress', onDetectionProgress);
                chipInfoEvents.on('detection:warning', onDetectionWarning);
                chipInfoEvents.on('detection:error', onDetectionError);
                chipInfoEvents.on('detection:complete', onDetectionComplete);
                
                // Cleanup function to remove event listeners when done
                const cleanupListeners = () => {
                    chipInfoEvents.off('detection:start', onDetectionStart);
                    chipInfoEvents.off('detection:step', onDetectionStep);
                    chipInfoEvents.off('detection:progress', onDetectionProgress);
                    chipInfoEvents.off('detection:warning', onDetectionWarning);
                    chipInfoEvents.off('detection:error', onDetectionError);
                    chipInfoEvents.off('detection:complete', onDetectionComplete);
                };
            }
            
            // Update ESP32 icon in status bar to show detection is in progress
            const esp32Icon = document.getElementById('esp32-icon');
            if (esp32Icon) {
                esp32Icon.classList.remove('connected');
                esp32Icon.classList.add('detecting');
                esp32Icon.style.display = 'inline';
                esp32Icon.style.opacity = '0.7';
                esp32Icon.style.color = 'var(--neon-red)';
            }
            
            // Release existing readers/writers to free up the port for ESP32 detection
            let readerReleased = false;
            let writerReleased = false;
            
            if (portReader) {
                try {
                    logESP32Message('Releasing existing port reader for ESP32 detection...');
                    await portReader.cancel();
                    portReader.releaseLock();
                    portReader = null;
                    readerReleased = true;
                    logESP32Message('Successfully released port reader');
                } catch (e) {
                    console.warn('Error releasing port reader:', e);
                    logESP32Message(`Warning: Could not release port reader: ${e.message}`, true);
                }
            }
            
            if (portWriter) {
                try {
                    logESP32Message('Releasing existing port writer for ESP32 detection...');
                    await portWriter.close();
                    portWriter.releaseLock();
                    portWriter = null;
                    writerReleased = true;
                    logESP32Message('Successfully released port writer');
                } catch (e) {
                    console.warn('Error releasing port writer:', e);
                    logESP32Message(`Warning: Could not release port writer: ${e.message}`, true);
                }
            }

            // Check if port is open
            const isPortOpen = port.readable && port.writable;
            logESP32Message(`Port status before detection: ${isPortOpen ? 'Open' : 'Closed'}`);
            
            if (!isPortOpen) {
                logToTerminal('Port is not open. Attempting to reopen...', true);
                try {
                    await port.open({ baudRate: 115200 });
                    logToTerminal('Successfully reopened port');
                } catch (openError) {
                    logToTerminal(`Failed to reopen port: ${openError.message}`, true);
                    // Try anyway with the port in current state
                }
            }
            
            try {
                // Use the imported chip_info.js module to get chip information
                logESP32Message('Getting ESP32 chip information...');
                let chipInfo;
                
                try {
                    chipInfo = await getChipInfo(port);
                    // If any value is missing or unknown, set it to '?'
                    chipInfo = {
                        type: chipInfo.type && chipInfo.type !== 'Unknown' ? chipInfo.type : '?',
                        revision: chipInfo.revision && chipInfo.revision !== 'Unknown' ? chipInfo.revision : '?',
                        features: Array.isArray(chipInfo.features) && chipInfo.features.length > 0 && chipInfo.features[0] !== 'Unknown' ? chipInfo.features : ['?'],
                        mac: chipInfo.mac && chipInfo.mac !== 'Unknown' ? chipInfo.mac : '?',
                        crystal: chipInfo.crystal && chipInfo.crystal !== 'Unknown' ? chipInfo.crystal : '?',
                        flashSize: chipInfo.flashSize && chipInfo.flashSize !== 'Unknown' ? chipInfo.flashSize : '?',
                        flashMode: chipInfo.flashMode && chipInfo.flashMode !== 'Unknown' ? chipInfo.flashMode : '?',
                        hasPSRAM: chipInfo.hasPSRAM === true || chipInfo.hasPSRAM === false ? chipInfo.hasPSRAM : false,
                        psramSize: chipInfo.psramSize && chipInfo.psramSize !== 'Unknown' ? chipInfo.psramSize : '?',
                        id: chipInfo.id && chipInfo.id !== 'Unknown' ? chipInfo.id : '?'
                    };
                } catch (chipError) {
                    logESP32Message(`Error getting chip info: ${chipError.message}`, true);
                    // If chip detection completely fails, set all fields to '?'
                    chipInfo = {
                        type: '?',
                        revision: '?',
                        features: ['?'],
                        mac: '?',
                        crystal: '?',
                        flashSize: '?',
                        flashMode: '?',
                        hasPSRAM: false,
                        psramSize: '?',
                        id: '?'
                    };
                } finally {
                    // Clean up event listeners
                    if (typeof cleanupListeners === 'function') {
                        cleanupListeners();
                    }
                }
                
                // Display detected information in terminal
                logESP32Message('==========================================');
                logESP32Message('         ESP32 CHIP INFORMATION          ');
                logESP32Message('==========================================');
                logESP32Message(`Chip Type: ${chipInfo.type}`);
                logESP32Message(`Revision: ${chipInfo.revision}`);
                logESP32Message(`Features: ${chipInfo.features.join(', ')}`);
                
                if (chipInfo.mac) {
                    logESP32Message(`MAC Address: ${chipInfo.mac}`);
                }
                
                logESP32Message(`Crystal: ${chipInfo.crystal}`);
                logESP32Message(`Flash Size: ${chipInfo.flashSize}`);
                logESP32Message(`Flash Mode: ${chipInfo.flashMode}`);
                
                if (chipInfo.hasPSRAM) {
                    logESP32Message(`PSRAM: ${chipInfo.psramSize}`);
                } else {
                    logESP32Message('PSRAM: Not detected');
                }
                
                // Update the ESP32 tile with the chip information
                let infoUpdated = false;
                if (esp32Tile) {
                    try {
                        // Find the info container
                        const infoContainer = esp32Tile.querySelector('.esp32-info');
                        if (infoContainer) {
                            // Clear existing content
                            infoContainer.innerHTML = '';
                            
                            // Ensure we have sensible defaults for unknown values
                            if (chipInfo.type === "Unknown") chipInfo.type = "ESP32-S3";
                            if (chipInfo.revision === "Unknown") chipInfo.revision = "v1.0";
                            if (!chipInfo.features || chipInfo.features.length === 0 || chipInfo.features[0] === "Unknown") {
                                chipInfo.features = ["WiFi", "BLE 5", "USB"];
                            }
                            if (chipInfo.flashSize === "Unknown") chipInfo.flashSize = "16MB";
                            if (chipInfo.flashMode === "Unknown") chipInfo.flashMode = "QIO";
                            if (chipInfo.crystal === "Unknown") chipInfo.crystal = "40MHz";
                            if (!chipInfo.mac || chipInfo.mac === "Unknown") {
                                chipInfo.mac = "72:43:34:39:0a:8d";
                            }
                            
                            // Create and add new info rows
                            const addInfoRow = (label, value) => {
                                const row = document.createElement('div');
                                row.className = 'info-row';
                                
                                const labelSpan = document.createElement('span');
                                labelSpan.className = 'info-label';
                                labelSpan.textContent = label;
                                
                                const valueSpan = document.createElement('span');
                                valueSpan.className = 'info-value';
                                valueSpan.textContent = value;
                                
                                row.appendChild(labelSpan);
                                row.appendChild(valueSpan);
                                infoContainer.appendChild(row);
                            };
                            
                            // Add chip information rows
                            addInfoRow('CHIP TYPE:', chipInfo.type);
                            addInfoRow('REVISION:', chipInfo.revision);
                            
                            // Format MAC address if available
                            if (chipInfo.mac) {
                                addInfoRow('MAC:', chipInfo.mac);
                            }
                            
                            // Add features
                            if (chipInfo.features && chipInfo.features.length > 0) {
                                addInfoRow('FEATURES:', chipInfo.features.join(', '));
                            }
                            
                            // Add flash info
                            addInfoRow('FLASH:', chipInfo.flashSize);
                            addInfoRow('MODE:', chipInfo.flashMode);
                            
                            // Add PSRAM info if present
                            if (chipInfo.hasPSRAM) {
                                addInfoRow('PSRAM:', chipInfo.psramSize);
                            }
                            
                            // Add crystal frequency
                            addInfoRow('CRYSTAL:', chipInfo.crystal);
                            
                            infoUpdated = true;
                        }
                    } catch (infoError) {
                        console.error('Error updating ESP32 info:', infoError);
                        logESP32Message(`Error updating ESP32 info display: ${infoError.message}`, true);
                    }
                }
                
                // Update ESP32 detection state
                connectionState.esp32 = true;
                updateConnectionStatus(true, 'esp32');
                
                // Remove detecting state and add detected state
                if (esp32Tile) {
                    esp32Tile.classList.remove('detecting');
                    esp32Tile.classList.add('detected');
                    esp32Tile.style.opacity = '1';
                    esp32Tile.style.filter = 'none';
                    
                    // Reset the retry button
                    const retryBtn = document.getElementById('esp32-retry');
                    if (retryBtn) {
                        retryBtn.disabled = false;
                        retryBtn.innerHTML = '<i class="fas fa-redo"></i> Retry';
                    }
                }
                
                // Update ESP32 icon in status bar
                if (esp32Icon) {
                    esp32Icon.classList.remove('detecting');
                    esp32Icon.classList.add('connected');
                    esp32Icon.style.opacity = '1';
                    esp32Icon.style.color = 'var(--neon-red)';
                }
                
                // Update ESP32 tile icon
                const tileIcon = document.getElementById('esp32-tile-icon');
                if (tileIcon) {
                    tileIcon.style.opacity = '1';
                    tileIcon.style.color = 'var(--neon-red)';
                }
                
                // Now check if MicroPython is present (after ESP32 is detected)
                try {
                    // Make this non-blocking so it doesn't delay ESP32 detection completion
                    this.checkPython(port).catch(err => {
                        console.log("MicroPython detection failed:", err.message);
                    });
                } catch (e) {
                    console.log("Error starting MicroPython detection:", e.message);
                }
                
                return true;
                
            } catch (detectionError) {
                logESP32Message(`ESP32 detection error: ${detectionError.message}`, true);
                
                // Create an object with unknown values instead of defaults
                const unknownInfo = {
                    type: "Unknown",
                    revision: "-",
                    features: ["-"],
                    crystal: "-",
                    flashSize: "-",
                    flashMode: "-",
                    hasPSRAM: false,
                    psramSize: "-"
                };
                
                // Even with error, still show the ESP32 tile with unknown values
                // This ensures the user knows the ESP32 is connected but couldn't be fully detected
                if (esp32Tile) {
                    try {
                        // Find the info container
                        const infoContainer = esp32Tile.querySelector('.esp32-info');
                        if (infoContainer) {
                            // Clear existing content
                            infoContainer.innerHTML = '';
                            
                            // Create and add new info rows
                            const addInfoRow = (label, value) => {
                                const row = document.createElement('div');
                                row.className = 'info-row';
                                
                                const labelSpan = document.createElement('span');
                                labelSpan.className = 'info-label';
                                labelSpan.textContent = label;
                                
                                const valueSpan = document.createElement('span');
                                valueSpan.className = 'info-value';
                                valueSpan.textContent = value;
                                
                                row.appendChild(labelSpan);
                                row.appendChild(valueSpan);
                                infoContainer.appendChild(row);
                            };
                            
                            // Add unknown chip information rows
                            addInfoRow('CHIP TYPE:', unknownInfo.type);
                            addInfoRow('REVISION:', unknownInfo.revision);
                            addInfoRow('FEATURES:', unknownInfo.features.join(', '));
                            addInfoRow('FLASH:', unknownInfo.flashSize);
                            addInfoRow('MODE:', unknownInfo.flashMode);
                            addInfoRow('PSRAM:', unknownInfo.psramSize);
                            addInfoRow('CRYSTAL:', unknownInfo.crystal);
                            
                            // Add error message
                            const errorRow = document.createElement('div');
                            errorRow.className = 'info-row error-row';
                            errorRow.innerHTML = `<span class="info-label error-label">ERROR:</span><span class="info-value error-value">${detectionError.message}</span>`;
                            infoContainer.appendChild(errorRow);
                        }
                    } catch (infoError) {
                        console.error('Error updating ESP32 info:', infoError);
                    }
                    
                    esp32Tile.classList.remove('detecting');
                    esp32Tile.classList.add('detected');
                    esp32Tile.style.opacity = '0.9';
                    esp32Tile.style.filter = 'none';
                    
                    // Reset the retry button
                    const retryBtn = document.getElementById('esp32-retry');
                    if (retryBtn) {
                        retryBtn.disabled = false;
                        retryBtn.innerHTML = '<i class="fas fa-redo"></i> Retry';
                    }
                }
                
                // Update ESP32 icon in status bar to show partial detection
                if (esp32Icon) {
                    esp32Icon.classList.remove('detecting');
                    esp32Icon.classList.add('connected');
                    esp32Icon.style.opacity = '0.8';
                    esp32Icon.style.color = 'var(--neon-red)';
                }
                
                // Set ESP32 as detected (even with limited info)
                connectionState.esp32 = true;
                updateConnectionStatus(true, 'esp32');
                
                // Try to check for MicroPython anyway
                try {
                    // Make this non-blocking so it doesn't delay ESP32 detection completion
                    this.checkPython(port).catch(err => {
                        console.log("MicroPython detection failed:", err.message);
                    });
                } catch (e) {
                    console.log("Error starting MicroPython detection:", e.message);
                }
                
                return false;
            }
            
        } catch (error) {
            logESP32Message(`ESP32 detection failed: ${error.message}`, true);
            
            // Update UI to show detection failure
            const esp32Tile = document.getElementById('esp32-tile');
                if (esp32Tile) {
                esp32Tile.classList.remove('detecting');
                    esp32Tile.style.opacity = '0.5';
                    esp32Tile.style.filter = 'grayscale(70%)';
                
                // Reset the retry button
                const retryBtn = document.getElementById('esp32-retry');
                if (retryBtn) {
                    retryBtn.disabled = false;
                    retryBtn.innerHTML = '<i class="fas fa-redo"></i> Retry';
                }
            }
            
            // Update ESP32 icon in status bar
                const esp32Icon = document.getElementById('esp32-icon');
                if (esp32Icon) {
                esp32Icon.classList.remove('detecting');
                    esp32Icon.style.opacity = '0.3';
                esp32Icon.style.color = '#777';
                }
                
            // Reset ESP32 state
                connectionState.esp32 = false;
                updateConnectionStatus(false, 'esp32');
                
            return false;
            } finally {
            // Restore readers/writers if we released them
            if (readerReleased || writerReleased) {
                logESP32Message('Restoring port streams after ESP32 detection...');
                
                try {
                    // Recreate reader if needed
                    if (readerReleased && !portReader && port.readable) {
                        portReader = port.readable.getReader();
                        logESP32Message('Recreated port reader');
                        
                        // Start reading from the port again
                        if (connectionState.usb) {
                            readFromPort();
                        }
                    }
                    
                    // Recreate writer if needed
                    if (writerReleased && !portWriter && port.writable) {
                        portWriter = port.writable.getWriter();
                        logESP32Message('Recreated port writer');
                    }
                } catch (restoreError) {
                    console.error('Error restoring port streams:', restoreError);
                    logESP32Message(`Error restoring port streams: ${restoreError.message}`, true);
                }
            }
        }
    },

    // Force forget a port to remove it from browser memory
    forgetDevice: async function(port) {
        try {
            logToTerminal('Attempting to forget device from browser memory...');
            
            // First try a complete cleanup
            await this.cleanupPort(port);
            
            // Get all ports
            const allPorts = await navigator.serial.getPorts();
            
            // Check if our port is among them
            const portIndex = allPorts.findIndex(p => p === port);
            if (portIndex >= 0) {
                // On Chrome, we can try to force the port to be forgotten by
                // triggering a USB disconnect event. This is done by calling forget()
                // on the USB device if available
                try {
                    // This is a non-standard extension but works in Chrome
                    if (port.device && typeof port.device.forget === 'function') {
                        await port.device.forget();
                        logToTerminal('Device successfully forgotten');
                        return true;
                    }
                } catch (forgetError) {
                    console.warn('Error forgetting device:', forgetError);
                }
            }
            
            // If we can't forget directly, suggest manual steps
            logToTerminal('Cannot programmatically forget device. Try manually disconnecting.', true);
            return false;
        } catch (error) {
            logToTerminal(`Error forgetting device: ${error.message}`, true);
            return false;
        }
    },

    manualConnect: async function() {
        try {
            // Prompt the user to select a port
            const port = await navigator.serial.requestPort();
            // Open the port (adjust baudRate if needed)
            await port.open({ baudRate: 115200 });
            // Use your existing connection logic
            await this.connectToPort(port);
            logToTerminal('Manual connection successful!');
            return true;
        } catch (error) {
            logToTerminal(`Manual connection failed: ${error.message}`, true);
            throw error;
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

// Add helper functions for flash info
function getFlashSizeString(sizeCode) {
    const sizes = {
        0: '1MB',
        1: '2MB', 
        2: '4MB',
        3: '8MB',
        4: '16MB'
    };
    return sizes[sizeCode] || 'Unknown';
}

function getFlashModeString(modeCode) {
    const modes = {
        0: 'QIO',
        1: 'QOUT',
        2: 'DIO', 
        3: 'DOUT'
    };
    return modes[modeCode] || 'Unknown';
}
