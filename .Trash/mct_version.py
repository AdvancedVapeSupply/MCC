# This file is auto-generated during build
MCT_GIT_COMMIT = "${MCT_GIT_COMMIT}"
MCT_GIT_BRANCH = "${MCT_GIT_BRANCH}"
MCT_BUILD_DATE = "${MCT_BUILD_DATE}"
MCT_VERSION = "${MCT_VERSION}"  # From manifest.json

try:
    import esp32
    from esp32 import NVS
    _nvs = NVS("mct")
    MCT_BOARD_SERIAL = _nvs.get_str("mct_serial") if _nvs.get_str("mct_serial") else "UNSET"
    LED_BOARD_SERIAL = _nvs.get_str("led_serial") if _nvs.get_str("led_serial") else "UNSET"
except (ImportError, OSError):
    # Default values if NVS read fails or we're not on ESP32
    MCT_BOARD_SERIAL = "UNSET"
    LED_BOARD_SERIAL = "UNSET"

def get_mct_version():
    return {
        "git_commit": MCT_GIT_COMMIT,
        "git_branch": MCT_GIT_BRANCH,
        "build_date": MCT_BUILD_DATE,
        "version": MCT_VERSION,
        "mct_serial": MCT_BOARD_SERIAL,
        "led_serial": LED_BOARD_SERIAL
    } 