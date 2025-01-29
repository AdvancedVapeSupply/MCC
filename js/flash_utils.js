import { EspLoader } from 'esp-web-flasher';

export async function getFlashId(port) {
    try {
        const loader = new EspLoader(port);
        await loader.connect();
        const flashId = await loader.flash_id();
        const manufacturer = flashId & 0xff;
        const deviceId = (flashId >> 16) & 0xff;
        await loader.disconnect();
        
        return {
            manufacturer: `0x${manufacturer.toString(16)}`,
            deviceId: `0x${deviceId.toString(16)}`,
            fullId: `0x${flashId.toString(16)}`
        };
    } catch (error) {
        console.error('Error getting flash ID:', error);
        throw error;
    }
} 