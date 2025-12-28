/**
 * Main Application Logic
 */

// Register Service Worker
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

// Theme Management
const themeToggle = document.getElementById('theme-toggle');

function setTheme(theme) {
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    updateThemeIcon(theme);
}

function updateThemeIcon(theme) {
    if (themeToggle) {
        themeToggle.textContent = theme === 'dark' ? '☀️' : '🌓';
    }
}

// Initialize Theme
const savedTheme = localStorage.getItem('theme');
const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)');

if (savedTheme) {
    setTheme(savedTheme);
} else {
    setTheme(prefersDarkScheme.matches ? 'dark' : 'light');
}

if (themeToggle) {
    themeToggle.addEventListener('click', () => {
        const currentTheme = document.body.getAttribute('data-theme');
        setTheme(currentTheme === 'dark' ? 'light' : 'dark');
    });
}

// User Identity & Settings
const settingsName = document.getElementById('settings-name');
const settingsGuid = document.getElementById('settings-guid');

function getIdentity() {
    let guid = localStorage.getItem('user_guid');
    if (!guid) {
        guid = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36);
        localStorage.setItem('user_guid', guid);
    }
    
    let name = localStorage.getItem('display_name') || 'Anonymous';
    return { guid, name };
}

function saveIdentity(name) {
    localStorage.setItem('display_name', name);
}

// Initialize Settings UI
const identity = getIdentity();
if (settingsName) {
    settingsName.value = identity.name;
    settingsName.addEventListener('change', (e) => {
        saveIdentity(e.target.value);
    });
}
if (settingsGuid) {
    settingsGuid.value = identity.guid;
}

// Navigation Logic
document.addEventListener('DOMContentLoaded', () => {
    const navButtons = document.querySelectorAll('.nav-btn');
    const views = document.querySelectorAll('.view');

    navButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetId = btn.getAttribute('data-target');
            
            // Update Buttons
            navButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Update Views
            views.forEach(v => {
                if (v.id === targetId) {
                    v.classList.remove('hidden');
                    v.classList.add('active');
                } else {
                    v.classList.add('hidden');
                    v.classList.remove('active');
                }
            });
        });
    });
});

export { getIdentity };