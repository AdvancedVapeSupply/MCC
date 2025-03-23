// ESP Web Flasher Library
export class ESPLoader {
    // ROM bootloader protocol constants
    static SYNC_PACKET = new Uint8Array([0x07, 0x07, 0x12, 0x20]);
    static CHIP_DETECT_MAGIC_REG_ADDR = 0x40001000;  // ESP32 chip detection register
    static UART_DATE_REG_ADDR = 0x60000078;  // UART peripheral register
    
    constructor(port, options = {}) {
        this.port = port;
        this.baudRate = options.baudRate || 115200;
        this.reader = null;
        this.writer = null;
    }

    async connect() {
        try {
            this.reader = this.port.readable.getReader();
            this.writer = this.port.writable.getWriter();
            
            // Sync with ROM bootloader
            await this.sync();
            
            // Get chip info after successful sync
            await this.detectChip();
            
            return true;
        } catch (error) {
            if (this.reader) this.reader.releaseLock();
            if (this.writer) this.writer.releaseLock();
            throw error;
        }
    }

    async sync() {
        // Send sync packet up to 5 times
        for (let i = 0; i < 5; i++) {
            await this.sendCommand(0x08, ESPLoader.SYNC_PACKET);
            try {
                const resp = await this.readResponse(0x08, 100); // 100ms timeout
                if (resp) return true;
            } catch (e) {
                console.warn(`Sync attempt ${i + 1} failed:`, e);
            }
            await new Promise(r => setTimeout(r, 100));
        }
        throw new Error('Failed to sync with ESP32 ROM bootloader');
    }

    async detectChip() {
        // Read chip detect register
        const magicValue = await this.readRegister(ESPLoader.CHIP_DETECT_MAGIC_REG_ADDR);
        const uartDate = await this.readRegister(ESPLoader.UART_DATE_REG_ADDR);
        
        // Determine chip type from magic values
        this.chipInfo = this.determineChipType(magicValue, uartDate);
    }

    async chipType() {
        if (!this.chipInfo) {
            throw new Error('Chip not detected - call connect() first');
        }
        return this.chipInfo;
    }

    async flashId() {
        // Read flash ID command
        const resp = await this.sendCommand(0x9F, new Uint8Array([0x00]));
        if (!resp || resp.length < 4) {
            throw new Error('Invalid response reading flash ID');
        }
        return (resp[0] << 16) | (resp[1] << 8) | resp[2];
    }

    async readRegister(addr) {
        // Read memory command
        const buf = new ArrayBuffer(4);
        const view = new DataView(buf);
        view.setUint32(0, addr, true); // Little-endian
        const resp = await this.sendCommand(0x0A, new Uint8Array(buf));
        if (!resp || resp.length < 4) {
            throw new Error('Invalid response reading register');
        }
        return new DataView(resp.buffer).getUint32(0, true);
    }

    async disconnect() {
        if (this.reader) {
            this.reader.releaseLock();
            this.reader = null;
        }
        if (this.writer) {
            this.writer.releaseLock();
            this.writer = null;
        }
        return true;
    }

    // Helper method to determine chip type from magic values
    determineChipType(magic, uartDate) {
        // ESP32-S3 specific detection
        if ((magic & 0xffffff00) === 0x6b900100) {
            return {
                name: 'ESP32-S3',
                features: ['WiFi', 'BLE'],
                hasPSRAM: (uartDate & 0x10) !== 0
            };
        }
        // Add other chip type detection as needed
        throw new Error('Unknown or unsupported ESP chip type');
    }

    // Low-level communication methods
    async sendCommand(opcode, data, checksum = 0) {
        // Implement SLIP encoding and command packet structure
        const packet = this.encodeSlipPacket(opcode, data, checksum);
        await this.writer.write(packet);
        return await this.readResponse(opcode);
    }

    async readResponse(expectedOpcode, timeout = 1000) {
        // Implement SLIP decoding and response packet handling
        const startTime = Date.now();
        const chunks = [];
        
        while (Date.now() - startTime < timeout) {
            const { value, done } = await this.reader.read();
            if (done) break;
            
            chunks.push(...value);
            if (value.includes(0xC0)) { // SLIP end marker
                const packet = this.decodeSlipPacket(new Uint8Array(chunks));
                if (packet.opcode === expectedOpcode) {
                    return packet.data;
                }
            }
        }
        throw new Error('Timeout waiting for response');
    }

    // SLIP encoding/decoding helpers
    encodeSlipPacket(opcode, data, checksum) {
        // Implement SLIP packet encoding
        const packet = new Uint8Array(data.length + 8);
        packet[0] = 0xC0; // Start
        packet[1] = opcode;
        packet[2] = data.length & 0xFF;
        packet[3] = (data.length >> 8) & 0xFF;
        packet.set(data, 4);
        packet[packet.length - 4] = checksum;
        packet[packet.length - 3] = 0x00;
        packet[packet.length - 2] = 0x00;
        packet[packet.length - 1] = 0xC0; // End
        return packet;
    }

    decodeSlipPacket(data) {
        // Implement SLIP packet decoding
        if (data[0] !== 0xC0 || data[data.length - 1] !== 0xC0) {
            throw new Error('Invalid SLIP packet');
        }
        
        const opcode = data[1];
        const length = data[2] | (data[3] << 8);
        const payload = data.slice(4, 4 + length);
        
        return {
            opcode,
            data: payload
        };
    }
}

// Transport class for WebSerial communication
export class Transport {
    constructor(port) {
        this.port = port;
    }
} 