/**
 * iBLE App Detector
 * Simple and reliable app detection for iBLE
 */

const iBLEAppDetector = {
    config: {
        appUrl: 'ible://advancedvapesupply.github.io/MCC/mcc-ble.html',
        buttonText: 'Open in iBLE App',
        installText: 'Install iBLE App',
        installUrl: 'https://apps.apple.com/app/ible/id1234567890', // Placeholder
        timeout: 3000
    },
    
    buttonCreated: false,
    
    // Initialize the detector
    detect: function() {
        console.log('iBLE app detector: Starting detection...');
        
        // Check if already in the app
        if (this.isInWebApp()) {
            console.log('iBLE app detector: Already in app');
            return;
        }
        
        // Check if mobile device
        if (!this.isMobile()) {
            console.log('iBLE app detector: Not mobile device');
            return;
        }
        
        // Check if WebBLE is supported
        if (!this.supportsWebBLE()) {
            console.log('iBLE app detector: WebBLE not supported');
            this.showInstallButton();
            return;
        }
        
        // Show both options immediately
        this.showBothOptions();
    },
    
    // Check if running in the iBLE app
    isInWebApp: function() {
        console.log('iBLE app detector: Checking if in web app...');
        console.log('iBLE app detector: window.Capacitor:', !!window.Capacitor);
        console.log('iBLE app detector: window.webkit:', !!window.webkit);
        console.log('iBLE app detector: document.referrer:', document.referrer);
        console.log('iBLE app detector: window.location.href:', window.location.href);
        console.log('iBLE app detector: navigator.userAgent:', navigator.userAgent);
        
        // Check for Capacitor (most reliable indicator)
        if (window.Capacitor) {
            console.log('iBLE app detector: Capacitor detected');
            return true;
        }
        
        // Check for WebKit (iOS WebView)
        if (window.webkit && window.webkit.messageHandlers) {
            console.log('iBLE app detector: WebKit detected');
            return true;
        }
        
        // Check for Android WebView
        if (window.Android) {
            console.log('iBLE app detector: Android WebView detected');
            return true;
        }
        
        // Check referrer for ible:// scheme
        if (document.referrer && document.referrer.includes('ible://')) {
            console.log('iBLE app detector: iBLE referrer detected');
            return true;
        }
        
        // Check current URL for ible:// scheme
        if (window.location.href.includes('ible://')) {
            console.log('iBLE app detector: iBLE URL detected');
            return true;
        }
        
        // Check user agent for WebView indicators
        const userAgent = navigator.userAgent.toLowerCase();
        if (userAgent.includes('wv') || userAgent.includes('webview')) {
            console.log('iBLE app detector: WebView user agent detected');
            return true;
        }
        
        console.log('iBLE app detector: Not in web app');
        return false;
    },
    
    // Check if mobile device
    isMobile: function() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
               (window.innerWidth <= 768);
    },
    
    // Check if WebBLE is supported
    supportsWebBLE: function() {
        return !!navigator.bluetooth;
    },
    
    // Show both Open and Install options
    showBothOptions: function() {
        if (this.buttonCreated) return;
        
        const container = document.createElement('div');
        container.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 20px;
            right: 20px;
            background: rgba(0, 0, 0, 0.9);
            border: 2px solid #667eea;
            border-radius: 12px;
            padding: 16px;
            display: flex;
            flex-direction: column;
            gap: 12px;
            z-index: 10000;
            backdrop-filter: blur(10px);
        `;
        
        const title = document.createElement('div');
        title.textContent = 'iBLE App Options';
        title.style.cssText = `
            color: white;
            font-weight: 600;
            font-size: 16px;
            margin-bottom: 8px;
            text-align: center;
        `;
        
        const buttonRow = document.createElement('div');
        buttonRow.style.cssText = `
            display: flex;
            gap: 8px;
            justify-content: center;
        `;
        
        const openButton = document.createElement('button');
        openButton.textContent = this.config.buttonText;
        openButton.style.cssText = `
            flex: 1;
            padding: 12px;
            background: #667eea;
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
        `;
        openButton.onclick = () => window.location.href = this.config.appUrl;
        
        const installButton = document.createElement('button');
        installButton.textContent = this.config.installText;
        installButton.style.cssText = `
            flex: 1;
            padding: 12px;
            background: rgba(255, 255, 255, 0.2);
            color: white;
            border: 1px solid rgba(255, 255, 255, 0.3);
            border-radius: 8px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
        `;
        installButton.onclick = () => window.open(this.config.installUrl, '_blank');
        
        // Add hover effects
        openButton.addEventListener('mouseenter', () => {
            openButton.style.background = '#5a6fd8';
        });
        openButton.addEventListener('mouseleave', () => {
            openButton.style.background = '#667eea';
        });
        
        installButton.addEventListener('mouseenter', () => {
            installButton.style.background = 'rgba(255, 255, 255, 0.3)';
        });
        installButton.addEventListener('mouseleave', () => {
            installButton.style.background = 'rgba(255, 255, 255, 0.2)';
        });
        
        // Assemble the UI
        container.appendChild(title);
        buttonRow.appendChild(openButton);
        buttonRow.appendChild(installButton);
        container.appendChild(buttonRow);
        
        // Add timestamp
        const timestamp = document.createElement("div");
        timestamp.style.cssText = `
            position: fixed;
            top: calc(60px + env(safe-area-inset-top));
            left: 10px;
            background: rgba(0, 0, 0, 0.8);
            color: #00ff00;
            padding: 5px 10px;
            font-size: 12px;
            font-family: monospace;
            border: 1px solid #00ff00;
            border-radius: 3px;
            z-index: 1000;
        `;
        timestamp.textContent = "Version: 2025-07-28 16:00:00";
        
        document.body.appendChild(timestamp);
        document.body.appendChild(container);
        this.buttonCreated = true;
        
        console.log('iBLE app detector: Both options displayed');
    },
    
    // Show install button only
    showInstallButton: function() {
        if (this.buttonCreated) return;
        
        const button = document.createElement('button');
        button.textContent = this.config.installText;
        button.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 20px;
            right: 20px;
            background: rgba(0, 0, 0, 0.9);
            color: white;
            border: 2px solid #667eea;
            border-radius: 12px;
            padding: 16px 20px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            backdrop-filter: blur(10px);
            text-align: center;
            z-index: 10000;
            transition: all 0.3s ease;
        `;
        
        button.onclick = () => window.open(this.config.installUrl, '_blank');
        
        // Add hover effect
        button.addEventListener('mouseenter', () => {
            button.style.background = '#5a6fd8';
            button.style.transform = 'translateY(-2px)';
        });
        
        button.addEventListener('mouseleave', () => {
            button.style.background = '#667eea';
            button.style.transform = 'translateY(0)';
        });
        
        // Add timestamp
        const timestamp = document.createElement("div");
        timestamp.style.cssText = `
            position: fixed;
            top: calc(60px + env(safe-area-inset-top));
            left: 10px;
            background: rgba(0, 0, 0, 0.8);
            color: #00ff00;
            padding: 5px 10px;
            font-size: 12px;
            font-family: monospace;
            border: 1px solid #00ff00;
            border-radius: 3px;
            z-index: 1000;
        `;
        timestamp.textContent = "Version: 2025-07-28 16:00:00";
        
        document.body.appendChild(timestamp);
        document.body.appendChild(button);
        this.buttonCreated = true;
        
        console.log('iBLE app detector: Install button displayed');
    }
};

// Auto-initialize when script loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        iBLEAppDetector.detect();
    });
} else {
    iBLEAppDetector.detect();
} 