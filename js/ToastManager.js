/**
 * Manages the creation, display, and removal of toast notifications.
 */
export class ToastManager {
    constructor() {
        this.container = null;
        this._injectStyles();
        this._createContainer();
        this.audioCtx = null;
    }

    /**
     * Creates the container element for toasts if it doesn't exist.
     * @private
     */
    _createContainer() {
        this.container = document.createElement('div');
        this.container.className = 'toast-container';
        document.body.appendChild(this.container);
    }

    /**
     * Shows a toast notification.
     * @param {string} message The message to display.
     * @param {string} [type='info'] - The type of toast ('info', 'success', 'error').
     * @param {number} [duration=3000] - How long the toast should be visible in ms.
     */
    show(message, type = 'info', duration = 3000) {
        if (!this.container) {
            this._createContainer();
        }

        this._playSound(type);

        const toast = document.createElement('div');
        toast.className = `toast-notification ${type}`;
        toast.setAttribute('role', 'status');
        toast.setAttribute('aria-live', 'polite');
        // Add a CSS variable for the duration to be used by the progress bar animation
        toast.style.setProperty('--toast-duration', `${duration}ms`);

        const iconContainer = document.createElement('div');
        iconContainer.className = 'toast-icon';
        iconContainer.innerHTML = this._getIcon(type);

        const contentContainer = document.createElement('div');
        contentContainer.className = 'toast-content';
        
        const messageEl = document.createElement('span');
        messageEl.textContent = message;

        const closeButton = document.createElement('button');
        closeButton.className = 'toast-close-btn';
        closeButton.innerHTML = '&times;';
        closeButton.setAttribute('aria-label', 'Close');

        const progressBar = document.createElement('div');
        progressBar.className = 'toast-progress-bar';

        contentContainer.appendChild(messageEl);
        toast.appendChild(iconContainer);
        toast.appendChild(contentContainer);
        toast.appendChild(closeButton);
        toast.appendChild(progressBar);

        this.container.appendChild(toast);

        // Animate in
        setTimeout(() => toast.classList.add('show'), 10);

        // Set timeout to automatically remove the toast. Store it to clear if closed manually.
        const removalTimeout = setTimeout(() => this._removeToast(toast), duration);

        closeButton.onclick = () => {
            clearTimeout(removalTimeout);
            this._removeToast(toast);
        };
    }

    _removeToast(toast) {
        toast.classList.remove('show');
        // Wait for the fade-out transition to finish before removing from the DOM
        toast.addEventListener('transitionend', () => toast.remove());
    }

    /**
     * Plays a sound effect based on the toast type using Web Audio API.
     * @param {string} type 
     */
    _playSound(type) {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;

            if (!this.audioCtx) {
                this.audioCtx = new AudioContext();
            }
            if (this.audioCtx.state === 'suspended') {
                this.audioCtx.resume().catch(() => {});
            }

            const oscillator = this.audioCtx.createOscillator();
            const gainNode = this.audioCtx.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(this.audioCtx.destination);

            const now = this.audioCtx.currentTime;

            if (type === 'success') {
                oscillator.type = 'sine';
                oscillator.frequency.setValueAtTime(523.25, now); // C5
                oscillator.frequency.exponentialRampToValueAtTime(783.99, now + 0.1); // G5
                gainNode.gain.setValueAtTime(0.05, now);
                gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
                oscillator.start(now);
                oscillator.stop(now + 0.5);
            } else if (type === 'error') {
                oscillator.type = 'triangle';
                oscillator.frequency.setValueAtTime(150, now);
                oscillator.frequency.linearRampToValueAtTime(100, now + 0.2);
                gainNode.gain.setValueAtTime(0.05, now);
                gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
                oscillator.start(now);
                oscillator.stop(now + 0.3);
            }
        } catch (e) {
            // Ignore audio errors
        }
    }

    /**
     * Returns the SVG icon markup for a given toast type.
     * @param {string} type - The type of toast ('info', 'success', 'error').
     * @returns {string} SVG string.
     * @private
     */
    _getIcon(type) {
        switch (type) {
            case 'success':
                return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
            case 'error':
                return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
            case 'info':
            default:
                return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
        }
    }

    /**
     * Injects the necessary CSS for the toast notifications into the document head.
     * This makes the component self-contained and ensures it's styled correctly.
     * @private
     */
    _injectStyles() {
        const styleId = 'toast-manager-styles';
        if (document.getElementById(styleId)) {
            return; // Styles already injected
        }

        const style = document.createElement('style');
        style.id = styleId;
        style.innerHTML = `
            .toast-container {
                position: fixed;
                bottom: 20px;
                right: 20px;
                z-index: 2000;
                display: flex;
                flex-direction: column;
                gap: 12px;
                width: 340px;
                max-width: 90vw;
            }

            .toast-notification {
                position: relative;
                display: flex;
                align-items: flex-start;
                padding: 16px;
                border-radius: 8px;
                color: #fff;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                font-size: 15px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                opacity: 0;
                transform: translateX(110%);
                transition: opacity 0.4s ease, transform 0.4s cubic-bezier(0.21, 1.02, 0.73, 1);
                overflow: hidden;
            }

            .toast-notification.show {
                opacity: 1;
                transform: translateX(0);
            }

            .toast-icon {
                flex-shrink: 0;
                margin-right: 12px;
                margin-top: 1px;
            }
            .toast-icon svg { width: 20px; height: 20px; }
            .toast-content { flex-grow: 1; line-height: 1.4; }

            .toast-notification.info { background-color: #007bff; }
            .toast-notification.success { background-color: #28a745; }
            .toast-notification.error { background-color: #dc3545; }

            .toast-close-btn {
                background: none; border: none; color: inherit;
                font-size: 24px; font-weight: bold; line-height: 1;
                margin-left: 15px; padding: 0; cursor: pointer;
                opacity: 0.7; align-self: flex-start;
            }
            .toast-close-btn:hover { opacity: 1; }

            .toast-progress-bar {
                position: absolute;
                bottom: 0;
                left: 0;
                height: 4px;
                width: 100%;
                background-color: rgba(0, 0, 0, 0.25);
                animation: toast-progress var(--toast-duration, 3000ms) linear forwards;
            }

            @keyframes toast-progress {
                from { width: 100%; }
                to { width: 0%; }
            }
        `;
        document.head.appendChild(style);
    }
}