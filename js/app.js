import { PeerManager } from './peer.js';

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

// --- User Identity & Peer History ---
function getIdentity() {
    let guid = localStorage.getItem('pwa_user_guid');
    if (!guid) {
        guid = crypto.randomUUID();
        localStorage.setItem('pwa_user_guid', guid);
    }
    const name = localStorage.getItem('pwa_display_name') || 'Anonymous';
    return { guid, name };
}

function saveIdentity(name) {
    localStorage.setItem('pwa_display_name', name);
}

function savePeer(guid, name) {
    if (getIdentity().guid === guid) return; // Don't save self
    let peers = JSON.parse(localStorage.getItem('pwa_peers') || '{}');
    peers[guid] = { name, lastSeen: Date.now() };
    localStorage.setItem('pwa_peers', JSON.stringify(peers));
    loadPeerList(); // Refresh the UI
}

function getPeers() {
    return JSON.parse(localStorage.getItem('pwa_peers') || '{}');
}

// Export for use in peer.js
export { getIdentity, savePeer };

const peerManager = new PeerManager();

// --- PeerJS Signaling Helper ---
class SignalingChannel {
    constructor() {
        this.peer = null;
        this.conn = null;
        this.onConnected = null;
        this.onMessage = null;
    }

    async _createPeer(id) {
        if (!window.Peer) {
            alert("PeerJS library not found. Please add the script tag to index.html");
            throw new Error("PeerJS library not found");
        }

        return new Promise((resolve, reject) => {
            const peer = new window.Peer(id, { debug: 2 });
            peer.on('open', (id) => {
                resolve({ peer, id });
            });
            peer.on('error', (err) => {
                if (err.type === 'unavailable-id') {
                    reject(new Error(`ID "${id}" is already taken. Please try again.`));
                } else {
                    reject(err);
                }
            });
        });
    }

    async initHost(hostId = null) {
        if (this.peer && !this.peer.destroyed) this.peer.destroy();
        
        const idToUse = hostId || Math.floor(100000 + Math.random() * 900000).toString();
        const { peer, id } = await this._createPeer(idToUse);
        this.peer = peer;

        this.peer.on('connection', (conn) => {
            this.conn = conn;
            this.setupConnection();
        });
        return id;
    }

    async initJoiner(hostId) {
        if (this.peer && !this.peer.destroyed) this.peer.destroy();

        // Joiner uses a server-assigned ID by passing undefined
        const { peer } = await this._createPeer(undefined);
        this.peer = peer;

        this.conn = this.peer.connect(hostId);
        this.setupConnection();
    }

    setupConnection() {
        this.conn.on('open', () => {
            console.log("Signaling Channel Open");
            if (this.onConnected) this.onConnected();
        });
        this.conn.on('data', (data) => {
            if (this.onMessage) this.onMessage(data);
        });
    }

    send(data) {
        if (this.conn && this.conn.open) this.conn.send(data);
    }
}

const signaling = new SignalingChannel();

// --- UI Helpers ---
function show(id) { document.getElementById(id).classList.remove('hidden'); }
function hide(id) { document.getElementById(id).classList.add('hidden'); }
function getVal(id) { return document.getElementById(id).value; }
function setVal(id, val) { document.getElementById(id).value = val; }

async function copyToClipboard(id) {
    const el = document.getElementById(id);
    if (el && el.value) {
        try {
            await navigator.clipboard.writeText(el.value);
            alert("Copied to clipboard!");
        } catch (err) {
            console.error("Failed to copy", err);
            alert("Failed to copy to clipboard");
        }
    }
}

function addMessage(text, type) {
    const container = document.getElementById('messages');
    const div = document.createElement('div');
    div.className = `message ${type}`;
    div.textContent = text;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

function renderPeerList(role) {
    const peers = getPeers();
    const peerListContainer = document.getElementById('recent-peers-list');
    if (!peerListContainer) return;

    peerListContainer.innerHTML = '<h5>Recent Peers</h5>';
    if (Object.keys(peers).length === 0) {
        peerListContainer.innerHTML += '<p>No recent connections found.</p>';
        return;
    }

    Object.entries(peers).forEach(([guid, peer]) => {
        const item = document.createElement('div');
        item.className = 'peer-item';

        const buttonHtml = role === 'host'
            ? `<button class="host-user-btn" data-guid="${guid}">Host</button>`
            : `<button class="join-user-btn" data-guid="${guid}">Join</button>`;

        item.innerHTML = `
            <span>${peer.name}</span>
            <div class="peer-item-buttons">
                ${buttonHtml}
            </div>
            <button class="remove-peer-btn" data-guid="${guid}">&times;</button>
        `;
        peerListContainer.appendChild(item);
    });
}

// --- Centralized Connection Logic ---
async function startHostingProcess(hostId) {
    try {
        // 1. Start PeerJS Host with a specific ID or a random one
        const id = await signaling.initHost(hostId);
        
        // Update UI to show the correct ID
        if (hostId) {
            document.getElementById('host-id-display').textContent = `Hosting on My ID...`;
        } else {
            document.getElementById('host-id-display').textContent = id;
        }

        // 2. Wait for Joiner to connect via PeerJS, then send Native Offer
        signaling.onConnected = async () => {
            console.log("Joiner connected to signaling. Generating Native Offer...");
            const offer = await peerManager.createOffer();
            signaling.send({ type: 'offer', sdp: offer });
        };

        // 3. Wait for Answer back via PeerJS to complete the connection
        signaling.onMessage = async (data) => {
            if (data.type === 'answer') {
                console.log("Received Answer via signaling. Connecting...");
                await peerManager.acceptAnswer(data.sdp);
            }
        };
    } catch (err) {
        console.error(err);
        alert("Signaling Error: " + err.message);
    }
}

async function startJoiningProcess(hostId) {
    if (!hostId) return alert("Please provide a Host ID.");
    try {
        // 1. Connect to Host via PeerJS
        await signaling.initJoiner(hostId);

        // 2. Wait for Native WebRTC Offer to be sent over the PeerJS channel
        signaling.onMessage = async (data) => {
            if (data.type === 'offer') {
                console.log("Received Offer via signaling. Sending Answer...");
                const answer = await peerManager.createAnswer(data.sdp);
                signaling.send({ type: 'answer', sdp: answer });
            }
        };
    } catch (err) {
        console.error(err);
        alert("Signaling Error: " + err.message);
    }
}

// --- PeerManager Callbacks ---
peerManager.onMessage((data) => {
    // Handle incoming data (chat or game state)
    if (data.type === 'chat') {
        addMessage(data.content, 'remote');
    } else if (data.type === 'identity') {
        savePeer(data.guid, data.name);
        console.log('Received data:', data);
    }
});

peerManager.onStatusChange((status) => {
    console.log('Connection status:', status);
    if (status === 'connected') {
        hide('peer-setup');
        show('peer-chat');
    }
});

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


    // Settings View
    const settingsNameInput = document.getElementById('settings-name');
    if (settingsNameInput) {
        settingsNameInput.value = getIdentity().name;
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

    // Role Selection
    const btnSelectHost = document.getElementById('select-host');
    const btnSelectJoiner = document.getElementById('select-joiner');
    const panelHost = document.getElementById('panel-host');
    const panelJoin = document.getElementById('panel-join');

    function selectRole(role) {
        const recentPeersList = document.getElementById('recent-peers-list');
        if (role === 'host') {
            btnSelectHost.classList.add('selected');
            btnSelectJoiner.classList.remove('selected');
            panelHost.classList.remove('hidden');
            panelJoin.classList.add('hidden');
            renderPeerList('host');
            recentPeersList.classList.remove('hidden');
        } else {
            btnSelectHost.classList.remove('selected');
            btnSelectJoiner.classList.add('selected');
            panelHost.classList.add('hidden');
            panelJoin.classList.remove('hidden');
            renderPeerList('joiner');
            recentPeersList.classList.remove('hidden');
        }
    }

    if (btnSelectHost && btnSelectJoiner) {
        btnSelectHost.addEventListener('click', () => selectRole('host'));
        btnSelectJoiner.addEventListener('click', () => selectRole('joiner'));
    }

    // --- HOST FLOW ---
    const btnHostSession = document.getElementById('btn-host-session');

    if (btnHostSession) {
        btnHostSession.addEventListener('click', () => startHostingProcess(null));
    }

    // --- JOINER FLOW ---
    const joinerInput = document.getElementById('joiner-id-input');

    if (joinerInput) {
        joinerInput.addEventListener('input', async () => {
            const hostId = joinerInput.value;
            if (hostId.length !== 6) return; // Only trigger when 6 digits are entered
            startJoiningProcess(hostId);
        });
    }

    // Event delegation for peer list buttons
    const peerListContainer = document.getElementById('recent-peers-list');
    if (peerListContainer) {
        peerListContainer.addEventListener('click', async (e) => {
            const guid = e.target.dataset.guid;
            if (!guid) return;

            if (e.target.classList.contains('host-user-btn')) {
                // Update UI to show connecting state
                e.target.innerHTML = `<span></span>`;
                e.target.disabled = true;
                // Host using their own GUID, so the other person can find them.
                startHostingProcess(getIdentity().guid);
            } else if (e.target.classList.contains('join-user-btn')) {
                // Joiner connecting to the selected peer's GUID.
                e.target.disabled = true;
                startJoiningProcess(guid);
            } else if (e.target.classList.contains('remove-peer-btn')) {
                if (confirm(`Are you sure you want to remove this peer?`)) {
                    removePeer(guid);
                    e.target.closest('.peer-item').remove(); // Remove from UI immediately
                }
            }
        });
    }

    // --- CHAT ---
    const btnSend = document.getElementById('btn-send');
    const inputMsg = document.getElementById('msg-input');

    if (btnSend) {
        btnSend.addEventListener('click', () => {
            const text = inputMsg.value;
            if (!text) return;
            peerManager.send({ type: 'chat', content: text });
            addMessage(text, 'local');
            inputMsg.value = '';
        });
    }
});