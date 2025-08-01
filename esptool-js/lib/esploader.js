import { ESPError } from "./types/error.js";
import { deflate, Inflate } from "pako";
import { Transport } from "./webserial.js";
import { ClassicReset, CustomReset, HardReset, UsbJtagSerialReset } from "./reset.js";
import { getStubJsonByChipName } from "./stubFlasher.js";
import { padTo } from "./util.js";
/**
 * Return the chip ROM based on the given magic number
 * @param {number} magic - magic hex number to select ROM.
 * @returns {ROM} The chip ROM class related to given magic hex number.
 */
async function magic2Chip(magic) {
    switch (magic) {
        case 0x00f01d83: {
            const { ESP32ROM } = await import("./targets/esp32.js");
            return new ESP32ROM();
        }
        case 0xc21e06f:
        case 0x6f51306f:
        case 0x7c41a06f: {
            const { ESP32C2ROM } = await import("./targets/esp32c2.js");
            return new ESP32C2ROM();
        }
        case 0x6921506f:
        case 0x1b31506f:
        case 0x4881606f:
        case 0x4361606f: {
            const { ESP32C3ROM } = await import("./targets/esp32c3.js");
            return new ESP32C3ROM();
        }
        case 0x2ce0806f: {
            const { ESP32C6ROM } = await import("./targets/esp32c6.js");
            return new ESP32C6ROM();
        }
        case 0x2421606f:
        case 0x33f0206f:
        case 0x4f81606f: {
            const { ESP32C61ROM } = await import("./targets/esp32c61.js");
            return new ESP32C61ROM();
        }
        case 0x1101406f:
        case 0x63e1406f:
        case 0x5fd1406f: {
            const { ESP32C5ROM } = await import("./targets/esp32c5.js");
            return new ESP32C5ROM();
        }
        case 0xd7b73e80:
        case 0x97e30068: {
            const { ESP32H2ROM } = await import("./targets/esp32h2.js");
            return new ESP32H2ROM();
        }
        case 0x09: {
            const { ESP32S3ROM } = await import("./targets/esp32s3.js");
            return new ESP32S3ROM();
        }
        case 0x000007c6: {
            const { ESP32S2ROM } = await import("./targets/esp32s2.js");
            return new ESP32S2ROM();
        }
        case 0xfff0c101: {
            const { ESP8266ROM } = await import("./targets/esp8266.js");
            return new ESP8266ROM();
        }
        case 0x0:
        case 0x0addbad0:
        case 0x7039ad9: {
            const { ESP32P4ROM } = await import("./targets/esp32p4.js");
            return new ESP32P4ROM();
        }
        default:
            return null;
    }
}
export class ESPLoader {
    /**
     * Create a new ESPLoader to perform serial communication
     * such as read/write flash memory and registers using a LoaderOptions object.
     * @param {LoaderOptions} options - LoaderOptions object argument for ESPLoader.
     * ```
     * const myLoader = new ESPLoader({ transport: Transport, baudrate: number, terminal?: IEspLoaderTerminal });
     * ```
     */
    constructor(options) {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        this.ESP_RAM_BLOCK = 0x1800;
        this.ESP_FLASH_BEGIN = 0x02;
        this.ESP_FLASH_DATA = 0x03;
        this.ESP_FLASH_END = 0x04;
        this.ESP_MEM_BEGIN = 0x05;
        this.ESP_MEM_END = 0x06;
        this.ESP_MEM_DATA = 0x07;
        this.ESP_WRITE_REG = 0x09;
        this.ESP_READ_REG = 0x0a;
        this.ESP_SPI_ATTACH = 0x0d;
        this.ESP_CHANGE_BAUDRATE = 0x0f;
        this.ESP_FLASH_DEFL_BEGIN = 0x10;
        this.ESP_FLASH_DEFL_DATA = 0x11;
        this.ESP_FLASH_DEFL_END = 0x12;
        this.ESP_SPI_FLASH_MD5 = 0x13;
        // Only Stub supported commands
        this.ESP_ERASE_FLASH = 0xd0;
        this.ESP_ERASE_REGION = 0xd1;
        this.ESP_READ_FLASH = 0xd2;
        this.ESP_RUN_USER_CODE = 0xd3;
        this.ESP_IMAGE_MAGIC = 0xe9;
        this.ESP_CHECKSUM_MAGIC = 0xef;
        // Response code(s) sent by ROM
        this.ROM_INVALID_RECV_MSG = 0x05; // response if an invalid message is received
        this.DEFAULT_TIMEOUT = 3000;
        this.ERASE_REGION_TIMEOUT_PER_MB = 30000;
        this.ERASE_WRITE_TIMEOUT_PER_MB = 40000;
        this.MD5_TIMEOUT_PER_MB = 8000;
        this.CHIP_ERASE_TIMEOUT = 120000;
        this.FLASH_READ_TIMEOUT = 100000;
        this.MAX_TIMEOUT = this.CHIP_ERASE_TIMEOUT * 2;
        this.CHIP_DETECT_MAGIC_REG_ADDR = 0x40001000;
        this.DETECTED_FLASH_SIZES = {
            0x12: "256KB",
            0x13: "512KB",
            0x14: "1MB",
            0x15: "2MB",
            0x16: "4MB",
            0x17: "8MB",
            0x18: "16MB",
        };
        this.DETECTED_FLASH_SIZES_NUM = {
            0x12: 256,
            0x13: 512,
            0x14: 1024,
            0x15: 2048,
            0x16: 4096,
            0x17: 8192,
            0x18: 16384,
        };
        this.USB_JTAG_SERIAL_PID = 0x1001;
        this.romBaudrate = 115200;
        this.debugLogging = false;
        this.syncStubDetected = false;
        /**
         * Get flash size bytes from flash size string.
         * @param {string} flashSize Flash Size string
         * @returns {number} Flash size bytes
         */
        this.flashSizeBytes = function (flashSize) {
            let flashSizeB = -1;
            if (flashSize.indexOf("KB") !== -1) {
                flashSizeB = parseInt(flashSize.slice(0, flashSize.indexOf("KB"))) * 1024;
            }
            else if (flashSize.indexOf("MB") !== -1) {
                flashSizeB = parseInt(flashSize.slice(0, flashSize.indexOf("MB"))) * 1024 * 1024;
            }
            return flashSizeB;
        };
        this.IS_STUB = false;
        this.FLASH_WRITE_SIZE = 0x4000;
        this.transport = options.transport;
        this.baudrate = options.baudrate;
        this.resetConstructors = {
            classicReset: (transport, resetDelay) => new ClassicReset(transport, resetDelay),
            customReset: (transport, sequenceString) => new CustomReset(transport, sequenceString),
            hardReset: (transport, usingUsbOtg) => new HardReset(transport, usingUsbOtg),
            usbJTAGSerialReset: (transport) => new UsbJtagSerialReset(transport),
        };
        if (options.serialOptions) {
            this.serialOptions = options.serialOptions;
        }
        if (options.romBaudrate) {
            this.romBaudrate = options.romBaudrate;
        }
        if (options.terminal) {
            this.terminal = options.terminal;
            this.terminal.clean();
        }
        if (typeof options.debugLogging !== "undefined") {
            this.debugLogging = options.debugLogging;
        }
        if (options.port) {
            this.transport = new Transport(options.port);
        }
        if (typeof options.enableTracing !== "undefined") {
            this.transport.tracing = options.enableTracing;
        }
        if ((_a = options.resetConstructors) === null || _a === void 0 ? void 0 : _a.classicReset) {
            this.resetConstructors.classicReset = (_b = options.resetConstructors) === null || _b === void 0 ? void 0 : _b.classicReset;
        }
        if ((_c = options.resetConstructors) === null || _c === void 0 ? void 0 : _c.customReset) {
            this.resetConstructors.customReset = (_d = options.resetConstructors) === null || _d === void 0 ? void 0 : _d.customReset;
        }
        if ((_e = options.resetConstructors) === null || _e === void 0 ? void 0 : _e.hardReset) {
            this.resetConstructors.hardReset = (_f = options.resetConstructors) === null || _f === void 0 ? void 0 : _f.hardReset;
        }
        if ((_g = options.resetConstructors) === null || _g === void 0 ? void 0 : _g.usbJTAGSerialReset) {
            this.resetConstructors.usbJTAGSerialReset = (_h = options.resetConstructors) === null || _h === void 0 ? void 0 : _h.usbJTAGSerialReset;
        }
        this.info("esptool.js");
        this.info("Serial port " + this.transport.getInfo());
    }
    _sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
    /**
     * Write to ESP Loader constructor's terminal with or without new line.
     * @param {string} str - String to write.
     * @param {boolean} withNewline - Add new line at the end ?
     */
    write(str, withNewline = true) {
        if (this.terminal) {
            if (withNewline) {
                this.terminal.writeLine(str);
            }
            else {
                this.terminal.write(str);
            }
        }
        else {
            // eslint-disable-next-line no-console
            console.log(str);
        }
    }
    /**
     * Write error message to ESP Loader constructor's terminal with or without new line.
     * @param {string} str - String to write.
     * @param {boolean} withNewline - Add new line at the end ?
     */
    error(str, withNewline = true) {
        this.write(`Error: ${str}`, withNewline);
    }
    /**
     * Write information message to ESP Loader constructor's terminal with or without new line.
     * @param {string} str - String to write.
     * @param {boolean} withNewline - Add new line at the end ?
     */
    info(str, withNewline = true) {
        this.write(str, withNewline);
    }
    /**
     * Write debug message to ESP Loader constructor's terminal with or without new line.
     * @param {string} str - String to write.
     * @param {boolean} withNewline - Add new line at the end ?
     */
    debug(str, withNewline = true) {
        if (this.debugLogging) {
            this.write(`Debug: ${str}`, withNewline);
        }
    }
    /**
     * Convert short integer to byte array
     * @param {number} i - Number to convert.
     * @returns {Uint8Array} Byte array.
     */
    _shortToBytearray(i) {
        return new Uint8Array([i & 0xff, (i >> 8) & 0xff]);
    }
    /**
     * Convert an integer to byte array
     * @param {number} i - Number to convert.
     * @returns {ROM} The chip ROM class related to given magic hex number.
     */
    _intToByteArray(i) {
        return new Uint8Array([i & 0xff, (i >> 8) & 0xff, (i >> 16) & 0xff, (i >> 24) & 0xff]);
    }
    /**
     * Convert a byte array to short integer.
     * @param {number} i - Number to convert.
     * @param {number} j - Number to convert.
     * @returns {number} Return a short integer number.
     */
    _byteArrayToShort(i, j) {
        return i | (j >> 8);
    }
    /**
     * Convert a byte array to integer.
     * @param {number} i - Number to convert.
     * @param {number} j - Number to convert.
     * @param {number} k - Number to convert.
     * @param {number} l - Number to convert.
     * @returns {number} Return a integer number.
     */
    _byteArrayToInt(i, j, k, l) {
        return i | (j << 8) | (k << 16) | (l << 24);
    }
    /**
     * Append a buffer array after another buffer array
     * @param {ArrayBuffer} buffer1 - First array buffer.
     * @param {ArrayBuffer} buffer2 - magic hex number to select ROM.
     * @returns {ArrayBufferLike} Return an array buffer.
     */
    _appendBuffer(buffer1, buffer2) {
        const tmp = new Uint8Array(buffer1.byteLength + buffer2.byteLength);
        tmp.set(new Uint8Array(buffer1), 0);
        tmp.set(new Uint8Array(buffer2), buffer1.byteLength);
        return tmp.buffer;
    }
    /**
     * Append a buffer array after another buffer array
     * @param {Uint8Array} arr1 - First array buffer.
     * @param {Uint8Array} arr2 - magic hex number to select ROM.
     * @returns {Uint8Array} Return a 8 bit unsigned array.
     */
    _appendArray(arr1, arr2) {
        const c = new Uint8Array(arr1.length + arr2.length);
        c.set(arr1, 0);
        c.set(arr2, arr1.length);
        return c;
    }
    /**
     * Convert a unsigned 8 bit integer array to byte string.
     * @param {Uint8Array} u8Array - magic hex number to select ROM.
     * @returns {string} Return the equivalent string.
     */
    ui8ToBstr(u8Array) {
        let bStr = "";
        for (let i = 0; i < u8Array.length; i++) {
            bStr += String.fromCharCode(u8Array[i]);
        }
        return bStr;
    }
    /**
     * Convert a byte string to unsigned 8 bit integer array.
     * @param {string} bStr - binary string input
     * @returns {Uint8Array} Return a 8 bit unsigned integer array.
     */
    bstrToUi8(bStr) {
        const u8Array = new Uint8Array(bStr.length);
        for (let i = 0; i < bStr.length; i++) {
            u8Array[i] = bStr.charCodeAt(i);
        }
        return u8Array;
    }
    /**
     * Flush the serial input by raw read with 200 ms timeout.
     */
    async flushInput() {
        try {
            await this.transport.flushInput();
        }
        catch (e) {
            this.error(e.message);
        }
    }
    /**
     * Use the device serial port read function with given timeout to create a valid packet.
     * @param {number} op Operation number
     * @param {number} timeout timeout number in milliseconds
     * @returns {[number, Uint8Array]} valid response packet.
     */
    async readPacket(op = null, timeout = this.DEFAULT_TIMEOUT) {
        // Check up-to next 100 packets for valid response packet
        for (let i = 0; i < 100; i++) {
            const { value: p } = await this.transport.read(timeout).next();
            if (!p || p.length < 8) {
                continue;
            }
            const resp = p[0];
            if (resp !== 1) {
                continue;
            }
            const opRet = p[1];
            const val = this._byteArrayToInt(p[4], p[5], p[6], p[7]);
            const data = p.slice(8);
            if (resp == 1) {
                if (op == null || opRet == op) {
                    return [val, data];
                }
                else if (data[0] != 0 && data[1] == this.ROM_INVALID_RECV_MSG) {
                    await this.flushInput();
                    throw new ESPError("unsupported command error");
                }
            }
        }
        throw new ESPError("invalid response");
    }
    /**
     * Write a serial command to the chip
     * @param {number} op - Operation number
     * @param {Uint8Array} data - Unsigned 8 bit array
     * @param {number} chk - channel number
     * @param {boolean} waitResponse - wait for response ?
     * @param {number} timeout - timeout number in milliseconds
     * @returns {Promise<[number, Uint8Array]>} Return a number and a 8 bit unsigned integer array.
     */
    async command(op = null, data = new Uint8Array(0), chk = 0, waitResponse = true, timeout = this.DEFAULT_TIMEOUT) {
        if (op != null) {
            if (this.transport.tracing) {
                this.transport.trace(`command op:0x${op.toString(16).padStart(2, "0")} data len=${data.length} wait_response=${waitResponse ? 1 : 0} timeout=${(timeout / 1000).toFixed(3)} data=${this.transport.hexConvert(data)}`);
            }
            const pkt = new Uint8Array(8 + data.length);
            pkt[0] = 0x00;
            pkt[1] = op;
            pkt[2] = this._shortToBytearray(data.length)[0];
            pkt[3] = this._shortToBytearray(data.length)[1];
            pkt[4] = this._intToByteArray(chk)[0];
            pkt[5] = this._intToByteArray(chk)[1];
            pkt[6] = this._intToByteArray(chk)[2];
            pkt[7] = this._intToByteArray(chk)[3];
            let i;
            for (i = 0; i < data.length; i++) {
                pkt[8 + i] = data[i];
            }
            await this.transport.write(pkt);
        }
        if (!waitResponse) {
            return [0, new Uint8Array(0)];
        }
        return this.readPacket(op, timeout);
    }
    /**
     * Read a register from chip.
     * @param {number} addr - Register address number
     * @param {number} timeout - Timeout in milliseconds (Default: 3000ms)
     * @returns {number} - Command number value
     */
    async readReg(addr, timeout = this.DEFAULT_TIMEOUT) {
        const pkt = this._intToByteArray(addr);
        const val = await this.command(this.ESP_READ_REG, pkt, undefined, undefined, timeout);
        return val[0];
    }
    /**
     * Write a number value to register address in chip.
     * @param {number} addr - Register address number
     * @param {number} value - Number value to write in register
     * @param {number} mask - Hex number for mask
     * @param {number} delayUs Delay number
     * @param {number} delayAfterUs Delay after previous delay
     */
    async writeReg(addr, value, mask = 0xffffffff, delayUs = 0, delayAfterUs = 0) {
        let pkt = this._appendArray(this._intToByteArray(addr), this._intToByteArray(value));
        pkt = this._appendArray(pkt, this._intToByteArray(mask));
        pkt = this._appendArray(pkt, this._intToByteArray(delayUs));
        if (delayAfterUs > 0) {
            pkt = this._appendArray(pkt, this._intToByteArray(this.chip.UART_DATE_REG_ADDR));
            pkt = this._appendArray(pkt, this._intToByteArray(0));
            pkt = this._appendArray(pkt, this._intToByteArray(0));
            pkt = this._appendArray(pkt, this._intToByteArray(delayAfterUs));
        }
        await this.checkCommand("write target memory", this.ESP_WRITE_REG, pkt);
    }
    /**
     * Sync chip by sending sync command.
     * @returns {[number, Uint8Array]} Command result
     */
    async sync() {
        this.debug("Sync");
        const cmd = new Uint8Array(36);
        let i;
        cmd[0] = 0x07;
        cmd[1] = 0x07;
        cmd[2] = 0x12;
        cmd[3] = 0x20;
        for (i = 0; i < 32; i++) {
            cmd[4 + i] = 0x55;
        }
        try {
            let resp = await this.command(0x08, cmd, undefined, undefined, 100);
            // ROM bootloaders send some non-zero "val" response. The flasher stub sends 0.
            // If we receive 0 then it probably indicates that the chip wasn't or couldn't be
            // reset properly and esptool is talking to the flasher stub.
            this.syncStubDetected = resp[0] === 0;
            for (let i = 0; i < 7; i++) {
                resp = await this.command();
                this.syncStubDetected = this.syncStubDetected && resp[0] === 0;
            }
            return resp;
        }
        catch (e) {
            this.debug("Sync err " + e);
            throw e;
        }
    }
    /**
     * Attempt to connect to the chip by sending a reset sequence and later a sync command.
     * @param {string} mode - Reset mode to use
     * @param {ResetStrategy} resetStrategy - Reset strategy class to use for connect
     * @returns {string} - Returns 'success' or 'error' message.
     */
    async _connectAttempt(mode = "default_reset", resetStrategy) {
        this.debug("_connect_attempt " + mode);
        if (resetStrategy) {
            await resetStrategy.reset();
        }
        const waitingBytes = this.transport.inWaiting();
        const readBytes = await this.transport.newRead(waitingBytes > 0 ? waitingBytes : 1, this.DEFAULT_TIMEOUT);
        const binaryString = Array.from(readBytes, (byte) => String.fromCharCode(byte)).join("");
        const regex = /boot:(0x[0-9a-fA-F]+)(.*waiting for download)?/;
        const match = binaryString.match(regex);
        let bootLogDetected = false, bootMode = "", downloadMode = false;
        if (match) {
            bootLogDetected = true;
            bootMode = match[1];
            downloadMode = !!match[2];
        }
        let lastError = "";
        for (let i = 0; i < 5; i++) {
            try {
                this.debug(`Sync connect attempt ${i}`);
                const resp = await this.sync();
                this.debug(resp[0].toString());
                return "success";
            }
            catch (error) {
                this.debug(`Error at sync ${error}`);
                if (error instanceof Error) {
                    lastError = error.message;
                }
                else if (typeof error === "string") {
                    lastError = error;
                }
                else {
                    lastError = JSON.stringify(error);
                }
            }
        }
        if (bootLogDetected) {
            lastError = `Wrong boot mode detected (${bootMode}).
        This chip needs to be in download mode.`;
            if (downloadMode) {
                lastError = `Download mode successfully detected, but getting no sync reply:
           The serial TX path seems to be down.`;
            }
        }
        return lastError;
    }
    /**
     * Constructs a sequence of reset strategies based on the OS,
     * used ESP chip, external settings, and environment variables.
     * Returns a tuple of one or more reset strategies to be tried sequentially.
     * @param {string} mode - Reset mode to use
     * @returns {ResetStrategy[]} - Array of reset strategies
     */
    constructResetSequence(mode) {
        if (mode !== "no_reset") {
            if (mode === "usb_reset" || this.transport.getPid() === this.USB_JTAG_SERIAL_PID) {
                // Custom reset sequence, which is required when the device
                // is connecting via its USB-JTAG-Serial peripheral
                if (this.resetConstructors.usbJTAGSerialReset) {
                    this.debug("using USB JTAG Serial Reset");
                    return [this.resetConstructors.usbJTAGSerialReset(this.transport)];
                }
            }
            else {
                const DEFAULT_RESET_DELAY = 50;
                const EXTRA_DELAY = DEFAULT_RESET_DELAY + 500;
                if (this.resetConstructors.classicReset) {
                    this.debug("using Classic Serial Reset");
                    return [
                        this.resetConstructors.classicReset(this.transport, DEFAULT_RESET_DELAY),
                        this.resetConstructors.classicReset(this.transport, EXTRA_DELAY),
                    ];
                }
            }
        }
        return [];
    }
    /**
     * Perform a connection to chip.
     * @param {string} mode - Reset mode to use. Example: 'default_reset' | 'no_reset'
     * @param {number} attempts - Number of connection attempts
     * @param {boolean} detecting - Detect the connected chip
     */
    async connect(mode = "default_reset", attempts = 7, detecting = true) {
        let resp;
        this.info("Connecting...", false);
        await this.transport.connect(this.romBaudrate, this.serialOptions);
        const resetSequences = this.constructResetSequence(mode);
        for (let i = 0; i < attempts; i++) {
            const resetSequence = resetSequences.length > 0 ? resetSequences[i % resetSequences.length] : null;
            resp = await this._connectAttempt(mode, resetSequence);
            if (resp === "success") {
                break;
            }
        }
        if (resp !== "success") {
            throw new ESPError("Failed to connect with the device");
        }
        this.debug("Connect attempt successful.");
        this.info("\n\r", false);
        if (detecting) {
            const chipMagicValue = (await this.readReg(this.CHIP_DETECT_MAGIC_REG_ADDR)) >>> 0;
            this.debug("Chip Magic " + chipMagicValue.toString(16));
            const chip = await magic2Chip(chipMagicValue);
            if (this.chip === null) {
                throw new ESPError(`Unexpected CHIP magic value ${chipMagicValue}. Failed to autodetect chip type.`);
            }
            else {
                this.chip = chip;
            }
        }
    }
    /**
     * Connect and detect the existing chip.
     * @param {string} mode Reset mode to use for connection.
     */
    async detectChip(mode = "default_reset") {
        await this.connect(mode);
        this.info("Detecting chip type... ", false);
        if (this.chip != null) {
            this.info(this.chip.CHIP_NAME);
        }
        else {
            this.info("unknown!");
        }
    }
    /**
     * Execute the command and check the command response.
     * @param {string} opDescription Command operation description.
     * @param {number} op Command operation number
     * @param {Uint8Array} data Command value
     * @param {number} chk Checksum to use
     * @param {number} timeout TImeout number in milliseconds (ms)
     * @returns {number} Command result
     */
    async checkCommand(opDescription = "", op = null, data = new Uint8Array(0), chk = 0, timeout = this.DEFAULT_TIMEOUT) {
        this.debug("check_command " + opDescription);
        const resp = await this.command(op, data, chk, undefined, timeout);
        if (resp[1].length > 4) {
            return resp[1];
        }
        else {
            return resp[0];
        }
    }
    /**
     * Start downloading an application image to RAM
     * @param {number} size Image size number
     * @param {number} blocks Number of data blocks
     * @param {number} blocksize Size of each data block
     * @param {number} offset Image offset number
     */
    async memBegin(size, blocks, blocksize, offset) {
        /* XXX: Add check to ensure that STUB is not getting overwritten */
        if (this.IS_STUB) {
            const loadStart = offset;
            const loadEnd = offset + size;
            const stub = await getStubJsonByChipName(this.chip.CHIP_NAME);
            if (stub) {
                const areasToCheck = [
                    [stub.bss_start || stub.data_start, stub.data_start + stub.decodedData.length],
                    [stub.text_start, stub.text_start + stub.decodedText.length],
                ];
                for (const [stubStart, stubEnd] of areasToCheck) {
                    if (loadStart < stubEnd && loadEnd > stubStart) {
                        throw new ESPError(`Software loader is resident at 0x${stubStart.toString(16).padStart(8, "0")}-0x${stubEnd
                            .toString(16)
                            .padStart(8, "0")}.
            Can't load binary at overlapping address range 0x${loadStart.toString(16).padStart(8, "0")}-0x${loadEnd
                            .toString(16)
                            .padStart(8, "0")}.
            Either change binary loading address, or use the no-stub option to disable the software loader.`);
                    }
                }
            }
        }
        this.debug("mem_begin " + size + " " + blocks + " " + blocksize + " " + offset.toString(16));
        let pkt = this._appendArray(this._intToByteArray(size), this._intToByteArray(blocks));
        pkt = this._appendArray(pkt, this._intToByteArray(blocksize));
        pkt = this._appendArray(pkt, this._intToByteArray(offset));
        await this.checkCommand("enter RAM download mode", this.ESP_MEM_BEGIN, pkt);
    }
    /**
     * Get the checksum for given unsigned 8-bit array
     * @param {Uint8Array} data Unsigned 8-bit integer array
     * @param {number} state Initial checksum
     * @returns {number} - Array checksum
     */
    checksum(data, state = this.ESP_CHECKSUM_MAGIC) {
        for (let i = 0; i < data.length; i++) {
            state ^= data[i];
        }
        return state;
    }
    /**
     * Send a block of image to RAM
     * @param {Uint8Array} buffer Unsigned 8-bit array
     * @param {number} seq Sequence number
     */
    async memBlock(buffer, seq) {
        let pkt = this._appendArray(this._intToByteArray(buffer.length), this._intToByteArray(seq));
        pkt = this._appendArray(pkt, this._intToByteArray(0));
        pkt = this._appendArray(pkt, this._intToByteArray(0));
        pkt = this._appendArray(pkt, buffer);
        const checksum = this.checksum(buffer);
        await this.checkCommand("write to target RAM", this.ESP_MEM_DATA, pkt, checksum);
    }
    /**
     * Leave RAM download mode and run application
     * @param {number} entrypoint - Entrypoint number
     */
    async memFinish(entrypoint) {
        const isEntry = entrypoint === 0 ? 1 : 0;
        const pkt = this._appendArray(this._intToByteArray(isEntry), this._intToByteArray(entrypoint));
        await this.checkCommand("leave RAM download mode", this.ESP_MEM_END, pkt, undefined, 200); // XXX: handle non-stub with diff timeout
    }
    /**
     * Configure SPI flash pins
     * @param {number} hspiArg -  Argument for SPI attachment
     */
    async flashSpiAttach(hspiArg) {
        const pkt = this._intToByteArray(hspiArg);
        await this.checkCommand("configure SPI flash pins", this.ESP_SPI_ATTACH, pkt);
    }
    /**
     * Scale timeouts which are size-specific.
     * @param {number} secondsPerMb Seconds per megabytes as number
     * @param {number} sizeBytes Size bytes number
     * @returns {number} - Scaled timeout for specified size.
     */
    timeoutPerMb(secondsPerMb, sizeBytes) {
        const result = secondsPerMb * (sizeBytes / 1000000);
        if (result < 3000) {
            return 3000;
        }
        else {
            return result;
        }
    }
    /**
     * Start downloading to Flash (performs an erase)
     * @param {number} size Size to erase
     * @param {number} offset Offset to erase
     * @returns {number} Number of blocks (of size self.FLASH_WRITE_SIZE) to write.
     */
    async flashBegin(size, offset) {
        const numBlocks = Math.floor((size + this.FLASH_WRITE_SIZE - 1) / this.FLASH_WRITE_SIZE);
        const eraseSize = this.chip.getEraseSize(offset, size);
        const d = new Date();
        const t1 = d.getTime();
        let timeout = 3000;
        if (this.IS_STUB == false) {
            timeout = this.timeoutPerMb(this.ERASE_REGION_TIMEOUT_PER_MB, size);
        }
        this.debug("flash begin " + eraseSize + " " + numBlocks + " " + this.FLASH_WRITE_SIZE + " " + offset + " " + size);
        let pkt = this._appendArray(this._intToByteArray(eraseSize), this._intToByteArray(numBlocks));
        pkt = this._appendArray(pkt, this._intToByteArray(this.FLASH_WRITE_SIZE));
        pkt = this._appendArray(pkt, this._intToByteArray(offset));
        if (this.IS_STUB == false) {
            pkt = this._appendArray(pkt, this._intToByteArray(0)); // XXX: Support encrypted
        }
        await this.checkCommand("enter Flash download mode", this.ESP_FLASH_BEGIN, pkt, undefined, timeout);
        const t2 = d.getTime();
        if (size != 0 && this.IS_STUB == false) {
            this.info("Took " + (t2 - t1) / 1000 + "." + ((t2 - t1) % 1000) + "s to erase flash block");
        }
        return numBlocks;
    }
    /**
     * Start downloading compressed data to Flash (performs an erase)
     * @param {number} size Write size
     * @param {number} compsize Compressed size
     * @param {number} offset Offset for write
     * @returns {number} Returns number of blocks (size self.FLASH_WRITE_SIZE) to write.
     */
    async flashDeflBegin(size, compsize, offset) {
        const numBlocks = Math.floor((compsize + this.FLASH_WRITE_SIZE - 1) / this.FLASH_WRITE_SIZE);
        const eraseBlocks = Math.floor((size + this.FLASH_WRITE_SIZE - 1) / this.FLASH_WRITE_SIZE);
        const d = new Date();
        const t1 = d.getTime();
        let writeSize, timeout;
        if (this.IS_STUB) {
            writeSize = size;
            timeout = this.DEFAULT_TIMEOUT;
        }
        else {
            writeSize = eraseBlocks * this.FLASH_WRITE_SIZE;
            timeout = this.timeoutPerMb(this.ERASE_REGION_TIMEOUT_PER_MB, writeSize);
        }
        this.info("Compressed " + size + " bytes to " + compsize + "...");
        let pkt = this._appendArray(this._intToByteArray(writeSize), this._intToByteArray(numBlocks));
        pkt = this._appendArray(pkt, this._intToByteArray(this.FLASH_WRITE_SIZE));
        pkt = this._appendArray(pkt, this._intToByteArray(offset));
        if ((this.chip.CHIP_NAME === "ESP32-S2" ||
            this.chip.CHIP_NAME === "ESP32-S3" ||
            this.chip.CHIP_NAME === "ESP32-C3" ||
            this.chip.CHIP_NAME === "ESP32-C2") &&
            this.IS_STUB === false) {
            pkt = this._appendArray(pkt, this._intToByteArray(0));
        }
        await this.checkCommand("enter compressed flash mode", this.ESP_FLASH_DEFL_BEGIN, pkt, undefined, timeout);
        const t2 = d.getTime();
        if (size != 0 && this.IS_STUB === false) {
            this.info("Took " + (t2 - t1) / 1000 + "." + ((t2 - t1) % 1000) + "s to erase flash block");
        }
        return numBlocks;
    }
    /**
     * Write block to flash, retry if fail
     * @param {Uint8Array} data Unsigned 8-bit array data.
     * @param {number} seq Sequence number
     * @param {number} timeout Timeout in milliseconds (ms)
     */
    async flashBlock(data, seq, timeout) {
        let pkt = this._appendArray(this._intToByteArray(data.length), this._intToByteArray(seq));
        pkt = this._appendArray(pkt, this._intToByteArray(0));
        pkt = this._appendArray(pkt, this._intToByteArray(0));
        pkt = this._appendArray(pkt, data);
        const checksum = this.checksum(data);
        await this.checkCommand("write to target Flash after seq " + seq, this.ESP_FLASH_DATA, pkt, checksum, timeout);
    }
    /**
     * Write block to flash, send compressed, retry if fail
     * @param {Uint8Array} data Unsigned int 8-bit array data to write
     * @param {number} seq Sequence number
     * @param {number} timeout Timeout in milliseconds (ms)
     */
    async flashDeflBlock(data, seq, timeout) {
        let pkt = this._appendArray(this._intToByteArray(data.length), this._intToByteArray(seq));
        pkt = this._appendArray(pkt, this._intToByteArray(0));
        pkt = this._appendArray(pkt, this._intToByteArray(0));
        pkt = this._appendArray(pkt, data);
        const checksum = this.checksum(data);
        this.debug("flash_defl_block " + data[0].toString(16) + " " + data[1].toString(16));
        await this.checkCommand("write compressed data to flash after seq " + seq, this.ESP_FLASH_DEFL_DATA, pkt, checksum, timeout);
    }
    /**
     * Leave flash mode and run/reboot
     * @param {boolean} reboot Reboot after leaving flash mode ?
     */
    async flashFinish(reboot = false) {
        const val = reboot ? 0 : 1;
        const pkt = this._intToByteArray(val);
        await this.checkCommand("leave Flash mode", this.ESP_FLASH_END, pkt);
    }
    /**
     * Leave compressed flash mode and run/reboot
     * @param {boolean} reboot Reboot after leaving flash mode ?
     */
    async flashDeflFinish(reboot = false) {
        const val = reboot ? 0 : 1;
        const pkt = this._intToByteArray(val);
        await this.checkCommand("leave compressed flash mode", this.ESP_FLASH_DEFL_END, pkt);
    }
    /**
     * Run an arbitrary SPI flash command.
     *
     * This function uses the "USR_COMMAND" functionality in the ESP
     * SPI hardware, rather than the precanned commands supported by
     * hardware. So the value of spiflashCommand is an actual command
     * byte, sent over the wire.
     *
     * After writing command byte, writes 'data' to MOSI and then
     * reads back 'readBits' of reply on MISO. Result is a number.
     * @param {number} spiflashCommand Command to execute in SPI
     * @param {Uint8Array} data Data to send
     * @param {number} readBits Number of bits to read
     * @returns {number} Register SPI_W0_REG value
     */
    async runSpiflashCommand(spiflashCommand, data, readBits) {
        // SPI_USR register flags
        const SPI_USR_COMMAND = 1 << 31;
        const SPI_USR_MISO = 1 << 28;
        const SPI_USR_MOSI = 1 << 27;
        // SPI registers, base address differs ESP32* vs 8266
        const base = this.chip.SPI_REG_BASE;
        const SPI_CMD_REG = base + 0x00;
        const SPI_USR_REG = base + this.chip.SPI_USR_OFFS;
        const SPI_USR1_REG = base + this.chip.SPI_USR1_OFFS;
        const SPI_USR2_REG = base + this.chip.SPI_USR2_OFFS;
        const SPI_W0_REG = base + this.chip.SPI_W0_OFFS;
        let setDataLengths;
        if (this.chip.SPI_MOSI_DLEN_OFFS != null) {
            setDataLengths = async (mosiBits, misoBits) => {
                const SPI_MOSI_DLEN_REG = base + this.chip.SPI_MOSI_DLEN_OFFS;
                const SPI_MISO_DLEN_REG = base + this.chip.SPI_MISO_DLEN_OFFS;
                if (mosiBits > 0) {
                    await this.writeReg(SPI_MOSI_DLEN_REG, mosiBits - 1);
                }
                if (misoBits > 0) {
                    await this.writeReg(SPI_MISO_DLEN_REG, misoBits - 1);
                }
            };
        }
        else {
            setDataLengths = async (mosiBits, misoBits) => {
                const SPI_DATA_LEN_REG = SPI_USR1_REG;
                const SPI_MOSI_BITLEN_S = 17;
                const SPI_MISO_BITLEN_S = 8;
                const mosiMask = mosiBits === 0 ? 0 : mosiBits - 1;
                const misoMask = misoBits === 0 ? 0 : misoBits - 1;
                const val = (misoMask << SPI_MISO_BITLEN_S) | (mosiMask << SPI_MOSI_BITLEN_S);
                await this.writeReg(SPI_DATA_LEN_REG, val);
            };
        }
        const SPI_CMD_USR = 1 << 18;
        const SPI_USR2_COMMAND_LEN_SHIFT = 28;
        if (readBits > 32) {
            throw new ESPError("Reading more than 32 bits back from a SPI flash operation is unsupported");
        }
        if (data.length > 64) {
            throw new ESPError("Writing more than 64 bytes of data with one SPI command is unsupported");
        }
        const dataBits = data.length * 8;
        const oldSpiUsr = await this.readReg(SPI_USR_REG);
        const oldSpiUsr2 = await this.readReg(SPI_USR2_REG);
        let flags = SPI_USR_COMMAND;
        let i;
        if (readBits > 0) {
            flags |= SPI_USR_MISO;
        }
        if (dataBits > 0) {
            flags |= SPI_USR_MOSI;
        }
        await setDataLengths(dataBits, readBits);
        await this.writeReg(SPI_USR_REG, flags);
        let val = (7 << SPI_USR2_COMMAND_LEN_SHIFT) | spiflashCommand;
        await this.writeReg(SPI_USR2_REG, val);
        if (dataBits == 0) {
            await this.writeReg(SPI_W0_REG, 0);
        }
        else {
            if (data.length % 4 != 0) {
                const padding = new Uint8Array(data.length % 4);
                data = this._appendArray(data, padding);
            }
            let nextReg = SPI_W0_REG;
            for (i = 0; i < data.length - 4; i += 4) {
                val = this._byteArrayToInt(data[i], data[i + 1], data[i + 2], data[i + 3]);
                await this.writeReg(nextReg, val);
                nextReg += 4;
            }
        }
        await this.writeReg(SPI_CMD_REG, SPI_CMD_USR);
        for (i = 0; i < 10; i++) {
            val = (await this.readReg(SPI_CMD_REG)) & SPI_CMD_USR;
            if (val == 0) {
                break;
            }
        }
        if (i === 10) {
            throw new ESPError("SPI command did not complete in time");
        }
        const stat = await this.readReg(SPI_W0_REG);
        await this.writeReg(SPI_USR_REG, oldSpiUsr);
        await this.writeReg(SPI_USR2_REG, oldSpiUsr2);
        return stat;
    }
    /**
     * Read flash id by executing the SPIFLASH_RDID flash command.
     * @returns {Promise<number>} Register SPI_W0_REG value
     */
    async readFlashId() {
        const SPIFLASH_RDID = 0x9f;
        const pkt = new Uint8Array(0);
        return await this.runSpiflashCommand(SPIFLASH_RDID, pkt, 24);
    }
    /**
     * Execute the erase flash command
     * @returns {Promise<number | Uint8Array>} Erase flash command result
     */
    async eraseFlash() {
        this.info("Erasing flash (this may take a while)...");
        let d = new Date();
        const t1 = d.getTime();
        const ret = await this.checkCommand("erase flash", this.ESP_ERASE_FLASH, undefined, undefined, this.CHIP_ERASE_TIMEOUT);
        d = new Date();
        const t2 = d.getTime();
        this.info("Chip erase completed successfully in " + (t2 - t1) / 1000 + "s");
        return ret;
    }
    /**
     * Convert a number or unsigned 8-bit array to hex string
     * @param {number | Uint8Array } buffer Data to convert to hex string.
     * @returns {string} A hex string
     */
    toHex(buffer) {
        return Array.prototype.map.call(buffer, (x) => ("00" + x.toString(16)).slice(-2)).join("");
    }
    /**
     * Calculate the MD5 Checksum command
     * @param {number} addr Address number
     * @param {number} size Package size
     * @returns {string} MD5 Checksum string
     */
    async flashMd5sum(addr, size) {
        const timeout = this.timeoutPerMb(this.MD5_TIMEOUT_PER_MB, size);
        let pkt = this._appendArray(this._intToByteArray(addr), this._intToByteArray(size));
        pkt = this._appendArray(pkt, this._intToByteArray(0));
        pkt = this._appendArray(pkt, this._intToByteArray(0));
        let res = await this.checkCommand("calculate md5sum", this.ESP_SPI_FLASH_MD5, pkt, undefined, timeout);
        if (res instanceof Uint8Array && res.length > 16) {
            res = res.slice(0, 16);
        }
        const strmd5 = this.toHex(res);
        return strmd5;
    }
    async readFlash(addr, size, onPacketReceived = null) {
        let pkt = this._appendArray(this._intToByteArray(addr), this._intToByteArray(size));
        pkt = this._appendArray(pkt, this._intToByteArray(0x1000));
        pkt = this._appendArray(pkt, this._intToByteArray(1024));
        const res = await this.checkCommand("read flash", this.ESP_READ_FLASH, pkt);
        if (res != 0) {
            throw new ESPError("Failed to read memory: " + res);
        }
        let resp = new Uint8Array(0);
        while (resp.length < size) {
            const { value: packet } = await this.transport.read(this.FLASH_READ_TIMEOUT).next();
            if (packet instanceof Uint8Array) {
                if (packet.length > 0) {
                    resp = this._appendArray(resp, packet);
                    await this.transport.write(this._intToByteArray(resp.length));
                    if (onPacketReceived) {
                        onPacketReceived(packet, resp.length, size);
                    }
                }
            }
            else {
                throw new ESPError("Failed to read memory: " + packet);
            }
        }
        return resp;
    }
    /**
     * Upload the flasher ROM bootloader (flasher stub) to the chip.
     * @returns {ROM} The Chip ROM
     */
    async runStub() {
        if (this.syncStubDetected) {
            this.info("Stub is already running. No upload is necessary.");
            return this.chip;
        }
        this.info("Uploading stub...");
        const stubFlasher = await getStubJsonByChipName(this.chip.CHIP_NAME);
        if (stubFlasher === undefined) {
            this.debug("Error loading Stub json");
            throw new Error("Error loading Stub json");
        }
        const stub = [stubFlasher.decodedText, stubFlasher.decodedData];
        for (let i = 0; i < stub.length; i++) {
            if (stub[i]) {
                const offs = i === 0 ? stubFlasher.text_start : stubFlasher.data_start;
                const length = stub[i].length;
                const blocks = Math.floor((length + this.ESP_RAM_BLOCK - 1) / this.ESP_RAM_BLOCK);
                await this.memBegin(length, blocks, this.ESP_RAM_BLOCK, offs);
                for (let seq = 0; seq < blocks; seq++) {
                    const fromOffs = seq * this.ESP_RAM_BLOCK;
                    const toOffs = fromOffs + this.ESP_RAM_BLOCK;
                    await this.memBlock(stub[i].slice(fromOffs, toOffs), seq);
                }
            }
        }
        this.info("Running stub...");
        await this.memFinish(stubFlasher.entry);
        const { value: packetResult } = await this.transport.read(this.DEFAULT_TIMEOUT).next();
        const packetStr = String.fromCharCode(...packetResult);
        if (packetStr !== "OHAI") {
            throw new ESPError(`Failed to start stub. Unexpected response ${packetStr}`);
        }
        this.info("Stub running...");
        this.IS_STUB = true;
        return this.chip;
    }
    /**
     * Change the chip baudrate.
     */
    async changeBaud() {
        this.info("Changing baudrate to " + this.baudrate);
        const secondArg = this.IS_STUB ? this.romBaudrate : 0;
        const pkt = this._appendArray(this._intToByteArray(this.baudrate), this._intToByteArray(secondArg));
        await this.command(this.ESP_CHANGE_BAUDRATE, pkt);
        this.info("Changed");
        await this.transport.disconnect();
        await this._sleep(50);
        await this.transport.connect(this.baudrate, this.serialOptions);
    }
    /**
     * Execute the main function of ESPLoader.
     * @param {string} mode Reset mode to use
     * @returns {string} chip ROM
     */
    async main(mode = "default_reset") {
        await this.detectChip(mode);
        const chip = await this.chip.getChipDescription(this);
        this.info("Chip is " + chip);
        this.info("Features: " + (await this.chip.getChipFeatures(this)));
        this.info("Crystal is " + (await this.chip.getCrystalFreq(this)) + "MHz");
        this.info("MAC: " + (await this.chip.readMac(this)));
        await this.chip.readMac(this);
        if (typeof this.chip.postConnect != "undefined") {
            await this.chip.postConnect(this);
        }
        await this.runStub();
        if (this.romBaudrate !== this.baudrate) {
            await this.changeBaud();
        }
        return chip;
    }
    /**
     * Parse a given flash size string to a number
     * @param {string} flsz Flash size to request
     * @returns {number} Flash size number
     */
    parseFlashSizeArg(flsz) {
        if (typeof this.chip.FLASH_SIZES[flsz] === "undefined") {
            throw new ESPError("Flash size " + flsz + " is not supported by this chip type. Supported sizes: " + this.chip.FLASH_SIZES);
        }
        return this.chip.FLASH_SIZES[flsz];
    }
    /**
     * Update the image flash parameters with given arguments.
     * @param {string} image binary image as string
     * @param {number} address flash address number
     * @param {string} flashSize Flash size string
     * @param {string} flashMode Flash mode string
     * @param {string} flashFreq Flash frequency string
     * @returns {string} modified image string
     */
    _updateImageFlashParams(image, address, flashSize, flashMode, flashFreq) {
        this.debug("_update_image_flash_params " + flashSize + " " + flashMode + " " + flashFreq);
        if (image.length < 8) {
            return image;
        }
        if (address != this.chip.BOOTLOADER_FLASH_OFFSET) {
            return image;
        }
        if (flashSize === "keep" && flashMode === "keep" && flashFreq === "keep") {
            this.info("Not changing the image");
            return image;
        }
        const magic = parseInt(image[0]);
        let aFlashMode = parseInt(image[2]);
        const flashSizeFreq = parseInt(image[3]);
        if (magic !== this.ESP_IMAGE_MAGIC) {
            this.info("Warning: Image file at 0x" +
                address.toString(16) +
                " doesn't look like an image file, so not changing any flash settings.");
            return image;
        }
        /* XXX: Yet to implement actual image verification */
        if (flashMode !== "keep") {
            const flashModes = { qio: 0, qout: 1, dio: 2, dout: 3 };
            aFlashMode = flashModes[flashMode];
        }
        let aFlashFreq = flashSizeFreq & 0x0f;
        if (flashFreq !== "keep") {
            const flashFreqs = { "40m": 0, "26m": 1, "20m": 2, "80m": 0xf };
            aFlashFreq = flashFreqs[flashFreq];
        }
        let aFlashSize = flashSizeFreq & 0xf0;
        if (flashSize !== "keep") {
            aFlashSize = this.parseFlashSizeArg(flashSize);
        }
        const flashParams = (aFlashMode << 8) | (aFlashFreq + aFlashSize);
        this.info("Flash params set to " + flashParams.toString(16));
        if (parseInt(image[2]) !== aFlashMode << 8) {
            image = image.substring(0, 2) + (aFlashMode << 8).toString() + image.substring(2 + 1);
        }
        if (parseInt(image[3]) !== aFlashFreq + aFlashSize) {
            image = image.substring(0, 3) + (aFlashFreq + aFlashSize).toString() + image.substring(3 + 1);
        }
        return image;
    }
    /**
     * Write set of file images into given address based on given FlashOptions object.
     * @param {FlashOptions} options FlashOptions to configure how and what to write into flash.
     */
    async writeFlash(options) {
        this.debug("EspLoader program");
        if (options.flashSize !== "keep") {
            const flashEnd = this.flashSizeBytes(options.flashSize);
            for (let i = 0; i < options.fileArray.length; i++) {
                if (options.fileArray[i].data.length + options.fileArray[i].address > flashEnd) {
                    throw new ESPError(`File ${i + 1} doesn't fit in the available flash`);
                }
            }
        }
        if (this.IS_STUB === true && options.eraseAll === true) {
            await this.eraseFlash();
        }
        let image, address;
        for (let i = 0; i < options.fileArray.length; i++) {
            this.debug("Data Length " + options.fileArray[i].data.length);
            image = options.fileArray[i].data;
            this.debug("Image Length " + image.length);
            if (image.length === 0) {
                this.debug("Warning: File is empty");
                continue;
            }
            image = this.ui8ToBstr(padTo(this.bstrToUi8(image), 4));
            address = options.fileArray[i].address;
            image = this._updateImageFlashParams(image, address, options.flashSize, options.flashMode, options.flashFreq);
            let calcmd5 = null;
            if (options.calculateMD5Hash) {
                calcmd5 = options.calculateMD5Hash(image);
                this.debug("Image MD5 " + calcmd5);
            }
            const uncsize = image.length;
            let blocks;
            if (options.compress) {
                const uncimage = this.bstrToUi8(image);
                image = this.ui8ToBstr(deflate(uncimage, { level: 9 }));
                blocks = await this.flashDeflBegin(uncsize, image.length, address);
            }
            else {
                blocks = await this.flashBegin(uncsize, address);
            }
            let seq = 0;
            let bytesSent = 0;
            const totalBytes = image.length;
            if (options.reportProgress)
                options.reportProgress(i, 0, totalBytes);
            let d = new Date();
            const t1 = d.getTime();
            let timeout = 5000;
            // Create a decompressor to keep track of the size of uncompressed data
            // to be written in each chunk.
            const inflate = new Inflate({ chunkSize: 1 });
            let totalLenUncompressed = 0;
            inflate.onData = function (chunk) {
                totalLenUncompressed += chunk.byteLength;
            };
            while (image.length > 0) {
                this.debug("Write loop " + address + " " + seq + " " + blocks);
                this.info("Writing at 0x" +
                    (address + totalLenUncompressed).toString(16) +
                    "... (" +
                    Math.floor((100 * (seq + 1)) / blocks) +
                    "%)");
                const block = this.bstrToUi8(image.slice(0, this.FLASH_WRITE_SIZE));
                if (options.compress) {
                    const lenUncompressedPrevious = totalLenUncompressed;
                    inflate.push(block, false);
                    const blockUncompressed = totalLenUncompressed - lenUncompressedPrevious;
                    let blockTimeout = 3000;
                    if (this.timeoutPerMb(this.ERASE_WRITE_TIMEOUT_PER_MB, blockUncompressed) > 3000) {
                        blockTimeout = this.timeoutPerMb(this.ERASE_WRITE_TIMEOUT_PER_MB, blockUncompressed);
                    }
                    if (this.IS_STUB === false) {
                        // ROM code writes block to flash before ACKing
                        timeout = blockTimeout;
                    }
                    await this.flashDeflBlock(block, seq, timeout);
                    if (this.IS_STUB) {
                        // Stub ACKs when block is received, then writes to flash while receiving the block after it
                        timeout = blockTimeout;
                    }
                }
                else {
                    throw new ESPError("Yet to handle Non Compressed writes");
                }
                bytesSent += block.length;
                image = image.slice(this.FLASH_WRITE_SIZE, image.length);
                seq++;
                if (options.reportProgress)
                    options.reportProgress(i, bytesSent, totalBytes);
            }
            if (this.IS_STUB) {
                await this.readReg(this.CHIP_DETECT_MAGIC_REG_ADDR, timeout);
            }
            d = new Date();
            const t = d.getTime() - t1;
            if (options.compress) {
                this.info("Wrote " +
                    uncsize +
                    " bytes (" +
                    bytesSent +
                    " compressed) at 0x" +
                    address.toString(16) +
                    " in " +
                    t / 1000 +
                    " seconds.");
            }
            if (calcmd5) {
                const res = await this.flashMd5sum(address, uncsize);
                if (new String(res).valueOf() != new String(calcmd5).valueOf()) {
                    this.info("File  md5: " + calcmd5);
                    this.info("Flash md5: " + res);
                    throw new ESPError("MD5 of file does not match data in flash!");
                }
                else {
                    this.info("Hash of data verified.");
                }
            }
        }
        this.info("Leaving...");
        if (this.IS_STUB) {
            await this.flashBegin(0, 0);
            if (options.compress) {
                await this.flashDeflFinish();
            }
            else {
                await this.flashFinish();
            }
        }
    }
    /**
     * Read SPI flash manufacturer and device id.
     */
    async flashId() {
        this.debug("flash_id");
        const flashid = await this.readFlashId();
        this.info("Manufacturer: " + (flashid & 0xff).toString(16));
        const flidLowbyte = (flashid >> 16) & 0xff;
        this.info("Device: " + ((flashid >> 8) & 0xff).toString(16) + flidLowbyte.toString(16));
        this.info("Detected flash size: " + this.DETECTED_FLASH_SIZES[flidLowbyte]);
    }
    async getFlashSize() {
        this.debug("flash_id");
        const flashid = await this.readFlashId();
        const flidLowbyte = (flashid >> 16) & 0xff;
        return this.DETECTED_FLASH_SIZES_NUM[flidLowbyte];
    }
    /**
     * Soft reset the device chip. Soft reset with run user code is the closest.
     * @param {boolean} stayInBootloader Flag to indicate if to stay in bootloader
     */
    async softReset(stayInBootloader) {
        if (!this.IS_STUB) {
            if (stayInBootloader) {
                return; // ROM bootloader is already in bootloader!
            }
            // "run user code" is as close to a soft reset as we can do
            await this.flashBegin(0, 0);
            await this.flashFinish(false);
        }
        else if (this.chip.CHIP_NAME != "ESP8266") {
            throw new ESPError("Soft resetting is currently only supported on ESP8266");
        }
        else {
            if (stayInBootloader) {
                // soft resetting from the stub loader
                // will re-load the ROM bootloader
                await this.flashBegin(0, 0);
                await this.flashFinish(true);
            }
            else {
                // running user code from stub loader requires some hacks
                // in the stub loader
                await this.command(this.ESP_RUN_USER_CODE, undefined, undefined, false);
            }
        }
    }
    /**
     * Execute this function to execute after operation reset functions.
     * @param {After} mode After operation mode. Default is 'hard_reset'.
     * @param { boolean } usingUsbOtg For 'hard_reset' to specify if using USB-OTG
     */
    async after(mode = "hard_reset", usingUsbOtg) {
        switch (mode) {
            case "hard_reset":
                if (this.resetConstructors.hardReset) {
                    this.info("Hard resetting via RTS pin...");
                    const hardReset = this.resetConstructors.hardReset(this.transport, usingUsbOtg);
                    await hardReset.reset();
                }
                break;
            case "soft_reset":
                this.info("Soft resetting...");
                await this.softReset(false);
                break;
            case "no_reset_stub":
                this.info("Staying in flasher stub.");
                break;
            default:
                this.info("Staying in bootloader.");
                if (this.IS_STUB) {
                    this.softReset(true);
                }
                break;
        }
    }
}
