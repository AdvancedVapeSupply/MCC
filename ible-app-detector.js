/**
 * iBLE App Detector
 * 
 * This script can be included on any website to detect if the iBLE app is installed
 * and show appropriate "Open in App" or "Install App" buttons.
 * 
 * Usage:
 * <script src="https://ible.app/detector.js"></script>
 * <script>
 *   iBLEAppDetector.detect({
 *     appUrl: 'ible://advancedvapesupply.github.io/MCC/mcc-ble.html',
 *     installUrl: 'https://apps.apple.com/app/ible',
 *     buttonText: 'Open in iBLE App',
 *     installText: 'Install iBLE App'
 *   });
 * </script>
 */

(function() {
    'use strict';
    
    window.iBLEAppDetector = {
        config: {
            appUrl: 'ible://advancedvapesupply.github.io/MCC/mcc-ble.html',
            installUrl: 'https://apps.apple.com/app/ible',
            buttonText: 'Open in iBLE App',
            installText: 'Install iBLE App',
            timeout: 5000, // Increased timeout for better detection
            buttonClass: 'ible-app-button',
            installClass: 'ible-install-button'
        },
        
        // Main detection function
        detect: function(options = {}) {
            // Merge options with defaults
            this.config = { ...this.config, ...options };
            
            // Don't detect if already detected
            if (this.detected) return;
            
            // Only run on mobile devices
            if (!this.isMobile()) {
                console.log('iBLE app detector: Desktop detected, skipping');
                return;
            }
            
            // Check if WebBLE is supported
            if (!this.supportsWebBLE()) {
                console.log('iBLE app detector: WebBLE not supported, showing install button');
                this.showInstallButton();
                return;
            }
            
            // Store original page state
            this.originalTitle = document.title;
            this.originalHref = window.location.href;
            
            // Try to detect if app is installed
            this.attemptDetection();
        },
        
        // Attempt to detect if app is installed
        attemptDetection: function() {
            console.log('iBLE app detector: Starting detection...');
            
            // Method 1: Check if already in the app (most reliable)
            if (this.isInWebApp()) {
                console.log('iBLE app detector: Already in app, calling onAppDetected');
                this.onAppDetected();
                return;
            }
            
            console.log('iBLE app detector: Not in app, trying custom URL scheme');
            // Method 2: Try custom URL scheme
            this.tryCustomScheme();
        },
        
        // Try custom URL scheme detection
        tryCustomScheme: function() {
            console.log('iBLE app detector: Trying custom URL scheme...');
            
            // Method 1: Check if we're already in the app
            if (this.isInWebApp()) {
                console.log('iBLE app detector: Already in app detected');
                this.onAppDetected();
                return;
            }
            
            // Method 2: Try direct link click (most reliable)
            const link = document.createElement('a');
            link.href = this.config.appUrl;
            link.style.display = 'none';
            document.body.appendChild(link);
            
            // Listen for page visibility changes (app opened)
            const visibilityHandler = () => {
                if (document.hidden) {
                    console.log('iBLE app detector: Page hidden, app likely opened');
                    this.onAppDetected();
                    document.removeEventListener('visibilitychange', visibilityHandler);
                }
            };
            document.addEventListener('visibilitychange', visibilityHandler);
            
            // Listen for page blur (app opened)
            const blurHandler = () => {
                console.log('iBLE app detector: Page blurred, app likely opened');
                this.onAppDetected();
                window.removeEventListener('blur', blurHandler);
            };
            window.addEventListener('blur', blurHandler);
            
            // Simulate click
            setTimeout(() => {
                link.click();
                if (document.body.contains(link)) {
                    document.body.removeChild(link);
                }
            }, 100);
            
            // Set up detection timeout
            this.detectionTimeout = setTimeout(() => {
                if (!this.detected) {
                    console.log('iBLE app detector: Timeout reached, app not detected');
                    document.removeEventListener('visibilitychange', visibilityHandler);
                    window.removeEventListener('blur', blurHandler);
                    this.onAppNotDetected();
                }
            }, this.config.timeout);
        },
        
        // Check if running on mobile device
        isMobile: function() {
            return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
                   (window.innerWidth <= 768 && window.innerHeight <= 1024);
        },
        
        // Check if Web Bluetooth API is supported
        supportsWebBLE: function() {
            return 'bluetooth' in navigator && 
                   'requestDevice' in navigator.bluetooth &&
                   navigator.bluetooth.availability !== 'unavailable';
        },
        
        // Check if running in web app mode
        isInWebApp: function() {
            console.log('iBLE app detector: Checking if in web app...');
            console.log('iBLE app detector: window.navigator.standalone:', window.navigator.standalone);
            console.log('iBLE app detector: window.Capacitor:', window.Capacitor);
            console.log('iBLE app detector: window.webkit:', window.webkit);
            console.log('iBLE app detector: document.referrer:', document.referrer);
            console.log('iBLE app detector: window.location.href:', window.location.href);
            
            // Check if running in standalone mode (PWA) or in Capacitor WebView
            const inStandalone = 'standalone' in window.navigator && window.navigator.standalone === true;
            const inDisplayMode = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
            const inCapacitor = window.Capacitor !== undefined;
            const inWebKit = window.webkit !== undefined;
            const hasIbleReferrer = document.referrer && document.referrer.includes('ible');
            const hasIbleUrl = window.location.href.includes('ible://');
            
            console.log('iBLE app detector: inStandalone:', inStandalone);
            console.log('iBLE app detector: inDisplayMode:', inDisplayMode);
            console.log('iBLE app detector: inCapacitor:', inCapacitor);
            console.log('iBLE app detector: inWebKit:', inWebKit);
            console.log('iBLE app detector: hasIbleReferrer:', hasIbleReferrer);
            console.log('iBLE app detector: hasIbleUrl:', hasIbleUrl);
            
            const result = inStandalone || inDisplayMode || inCapacitor || inWebKit || hasIbleReferrer || hasIbleUrl;
            console.log('iBLE app detector: Final result:', result);
            
            return result;
        },
        
        // Try Universal Links detection
        tryUniversalLinks: function() {
            // Listen for page visibility changes
            document.addEventListener('visibilitychange', () => {
                if (document.hidden && !this.detected) {
                    this.onAppDetected();
                }
            });
            
            // Listen for page focus/blur
            window.addEventListener('blur', () => {
                if (!this.detected) {
                    this.onAppDetected();
                }
            });
        },
        
        // App detected successfully
        onAppDetected: function() {
            this.detected = true;
            this.clearTimeout();
            console.log('iBLE app detected!');
            this.showAppButton();
        },
        
        // App not detected
        onAppNotDetected: function() {
            this.detected = true;
            this.clearTimeout();
            console.log('iBLE app not detected');
            this.showInstallButton();
        },
        
        // Show "Open in App" button
        showAppButton: function() {
            if (this.buttonCreated) return;
            
            const button = this.createButton(
                this.config.buttonText,
                this.config.buttonClass,
                () => window.location.href = this.config.appUrl
            );
            
            this.insertButton(button);
            this.buttonCreated = true;
        },
        
        // Show "Install App" button
        showInstallButton: function() {
            if (this.buttonCreated) return;
            
            const button = this.createButton(
                this.config.installText,
                this.config.installClass,
                () => window.open(this.config.installUrl, '_blank')
            );
            
            this.insertButton(button);
            this.buttonCreated = true;
        },
        
        // Show both options (Open in App / Install App)
        showBothOptions: function() {
            console.log('iBLE app detector: showBothOptions called');
            if (this.buttonCreated) {
                console.log('iBLE app detector: Button already created, returning');
                return;
            }
            
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
            
            const openButton = this.createButton(
                this.config.buttonText,
                this.config.buttonClass,
                () => window.location.href = this.config.appUrl
            );
            
            const installButton = this.createButton(
                this.config.installText,
                this.config.installClass,
                () => window.open(this.config.installUrl, '_blank')
            );
            
            // Manual URL entry section
            const urlSection = document.createElement('div');
            urlSection.style.cssText = `
                margin-top: 12px;
                padding-top: 12px;
                border-top: 1px solid rgba(255, 255, 255, 0.2);
            `;
            
            const urlLabel = document.createElement('div');
            urlLabel.textContent = 'Or enter custom URL:';
            urlLabel.style.cssText = `
                color: white;
                font-size: 12px;
                margin-bottom: 4px;
            `;
            
            const urlInput = document.createElement('input');
            urlInput.type = 'text';
            urlInput.placeholder = 'ible://your-custom-url';
            urlInput.value = this.config.appUrl;
            urlInput.style.cssText = `
                width: 100%;
                padding: 8px 12px;
                border: 1px solid rgba(255, 255, 255, 0.3);
                border-radius: 6px;
                background: rgba(255, 255, 255, 0.1);
                color: white;
                font-size: 14px;
                margin-bottom: 8px;
            `;
            
            const urlButton = document.createElement('button');
            urlButton.textContent = 'Open URL';
            urlButton.style.cssText = `
                background: #667eea;
                color: white;
                border: none;
                border-radius: 6px;
                padding: 8px 16px;
                font-size: 14px;
                cursor: pointer;
                width: 100%;
            `;
            urlButton.onclick = () => {
                const url = urlInput.value.trim();
                if (url) {
                    window.location.href = url;
                }
            };
            
            buttonRow.appendChild(openButton);
            buttonRow.appendChild(installButton);
            
            urlSection.appendChild(urlLabel);
            urlSection.appendChild(urlInput);
            urlSection.appendChild(urlButton);
            
            container.appendChild(title);
            container.appendChild(buttonRow);
            container.appendChild(urlSection);
            
            document.body.appendChild(container);
            this.buttonCreated = true;
        },
        
        // Create button element
        createButton: function(text, className, onClick) {
            const button = document.createElement('button');
            button.textContent = text;
            button.className = className;
            button.onclick = onClick;
            
            // Add default styles
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
            
            // Add hover effect
            button.addEventListener('mouseenter', () => {
                button.style.background = '#5a6fd8';
                button.style.transform = 'translateY(-2px)';
            });
            
            button.addEventListener('mouseleave', () => {
                button.style.background = '#667eea';
                button.style.transform = 'translateY(0)';
            });
            
            return button;
        },
        
        // Insert button into page
        // Insert button into page
        insertButton: function(button) {
            // Add timestamp at the bottom of the page
            const timestamp = document.createElement("div");
            timestamp.style.cssText = `
                position: fixed;
                bottom: 10px;
                right: 10px;
                background: rgba(0,0,0,0.8);
                color: white;
                padding: 5px;
                font-size: 10px;
                border-radius: 3px;
                z-index: 1000;
            `;
            timestamp.textContent = "Version: " + "2025-07-28 14:35:07";
            document.body.appendChild(timestamp);
            
            // Insert button at the top of the page
            const firstElement = document.body.firstChild;
            if (firstElement) {
                document.body.insertBefore(button, firstElement);
            } else {
                document.body.appendChild(button);
            }
        },
        
        // Clear detection timeout
        clearTimeout: function() {
            if (this.detectionTimeout) {
                clearTimeout(this.detectionTimeout);
                this.detectionTimeout = null;
            }
        },
        
        // Manual trigger for app opening
        openInApp: function() {
            window.location.href = this.config.appUrl;
        },
        
        // Manual trigger for app installation
        installApp: function() {
            window.open(this.config.installUrl, '_blank');
        }
    };
    
    // Auto-detect on page load if no manual detection is called
    document.addEventListener('DOMContentLoaded', function() {
        // Only auto-detect if no manual detection has been called
        setTimeout(() => {
            if (!window.iBLEAppDetector.detected) {
                window.iBLEAppDetector.detect();
            }
        }, 1000);
    });
    
})(); 