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
            
            // Only run on mobile devices with WebBLE support
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
            
            // Try to detect app
            this.attemptDetection();
        },
        
        // Attempt to detect if app is installed
        attemptDetection: function() {
            // Method 1: Check if already in the app (most reliable)
            if (this.isInWebApp()) {
                this.onAppDetected();
                return;
            }
            
            // Method 2: Try custom URL scheme
            this.tryCustomScheme();
            
            // Method 3: Universal Links detection
            this.tryUniversalLinks();
        },
        
        // Try custom URL scheme detection
        tryCustomScheme: function() {
            // Create hidden iframe to avoid page navigation
            const iframe = document.createElement('iframe');
            iframe.style.display = 'none';
            iframe.src = this.config.appUrl;
            document.body.appendChild(iframe);
            
            // Remove iframe after attempt
            setTimeout(() => {
                if (document.body.contains(iframe)) {
                    document.body.removeChild(iframe);
                }
            }, 100);
            
            // Set up detection timeout
            this.detectionTimeout = setTimeout(() => {
                if (!this.detected) {
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
            // Check if running in standalone mode (PWA) or in Capacitor WebView
            return (
                'standalone' in window.navigator && 
                window.navigator.standalone === true
            ) || (
                window.matchMedia && 
                window.matchMedia('(display-mode: standalone)').matches
            ) || (
                window.Capacitor !== undefined
            ) || (
                window.webkit !== undefined
            ) || (
                document.referrer && document.referrer.includes('ible')
            ) || (
                window.location.href.includes('ible://')
            );
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
        
        // Create button element
        createButton: function(text, className, onClick) {
            const button = document.createElement('button');
            button.textContent = text;
            button.className = className;
            button.onclick = onClick;
            
            // Add default styles
            button.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: #667eea;
                color: white;
                border: none;
                border-radius: 8px;
                padding: 12px 20px;
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
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
        insertButton: function(button) {
            // Try to insert at the top of the page
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