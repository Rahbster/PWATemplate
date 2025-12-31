import * as peerService from './peer-service.js';
import { ChatManager } from './ChatManager.js';
import { ToastManager } from './ToastManager.js';
import { showPeerConnectionModal } from './modals/peer_connection_modal.js';

// --- Service Worker Registration ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(registration => {
                console.log('ServiceWorker registration successful');
            })
            .catch(err => {
                console.log('ServiceWorker registration failed: ', err);
            });
    });
}

// --- Theme Management ---
function setTheme(theme) {
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.textContent = theme === 'dark' ? '☀️' : '🌓';
    }
}

// Initialize Theme on script load to prevent flash of wrong theme
const savedTheme = localStorage.getItem('theme');
const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)');
if (savedTheme) {
    setTheme(savedTheme);
} else {
    setTheme(prefersDarkScheme.matches ? 'dark' : 'light');
}

// --- Identity Management (Simplified) ---
function saveIdentity(name) {
    localStorage.setItem('pwa_display_name', name);
}

function getDisplayName() {
    return localStorage.getItem('pwa_display_name') || 'Anonymous';
}

// Adapter to allow ChatManager to use peerService
const peerAdapter = {
    send: (data) => peerService.sendData(data)
};

const toastManager = new ToastManager();
const chatManager = new ChatManager(peerAdapter, () => ({ name: getDisplayName() }));

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    
    // Sidenav Logic
    const hamburgerBtn = document.getElementById('hamburger-btn');
    const closeSidenavBtn = document.getElementById('close-sidenav-btn');
    const sidenav = document.getElementById('sidenav');
    const overlay = document.getElementById('overlay');

    const openNav = () => { sidenav.style.width = "280px"; overlay.style.display = "block"; };
    const closeNav = () => { sidenav.style.width = "0"; overlay.style.display = "none"; };

    if (hamburgerBtn) hamburgerBtn.addEventListener('click', openNav);
    if (closeSidenavBtn) closeSidenavBtn.addEventListener('click', closeNav);
    if (overlay) overlay.addEventListener('click', closeNav);

    // Peer Modal Logic
    const btnOpenPeerModal = document.getElementById('btn-open-peer-modal');
    if (btnOpenPeerModal) {
        btnOpenPeerModal.addEventListener('click', () => {
            closeNav();
            showPeerConnectionModal(toastManager, chatManager);
        });
    }

    // Chat Modal Logic
    const chatModal = document.getElementById('chat-modal');
    const btnOpenChat = document.getElementById('btn-open-chat');
    const closeChatModalBtn = document.getElementById('close-chat-modal');

    if (btnOpenChat) {
        btnOpenChat.addEventListener('click', () => {
            closeNav();
            chatModal.classList.remove('hidden');
            chatManager.resetUnread();
        });
    }

    if (closeChatModalBtn) {
        closeChatModalBtn.addEventListener('click', () => {
            chatModal.classList.add('hidden');
        });
    }

    // Settings View
    const settingsNameInput = document.getElementById('settings-name');
    if (settingsNameInput) {
        settingsNameInput.value = getDisplayName();
        settingsNameInput.addEventListener('change', (e) => {
            saveIdentity(e.target.value);
        });
    }

    // Theme Toggle Listener
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const currentTheme = document.body.getAttribute('data-theme');
            setTheme(currentTheme === 'dark' ? 'light' : 'dark');
        });
    }

    // Disconnect Button
    const btnDisconnect = document.getElementById('btn-disconnect');
    if (btnDisconnect) {
        btnDisconnect.addEventListener('click', () => {
            peerService.destroyPeer();
        });
    }
});