import { PeerManager } from './peer.js';
import { SignalingChannel } from './SignalingChannel.js';
import { ChatManager } from './ChatManager.js';
import { ToastManager } from './ToastManager.js';

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
    if (connectionRole) {
        renderPeerList(connectionRole);
    }
}

function getPeers() {
    return JSON.parse(localStorage.getItem('pwa_peers') || '{}');
}

function removePeer(guid) {
    let peers = getPeers();
    delete peers[guid];
    localStorage.setItem('pwa_peers', JSON.stringify(peers));
}

// Export for use in peer.js
export { getIdentity, savePeer };

const peerManager = new PeerManager();
const toastManager = new ToastManager();
const chatManager = new ChatManager(peerManager, getIdentity);
let currentRemoteName = 'Peer';

// --- Reconnection State ---
const connectedPeers = new Map(); // peerId -> { name, status }
let connectionRole = null; // 'host' or 'joiner'
let targetPeerId = null;   // Host ID
let isIntentionalDisconnect = false;
let reconnectTimer = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

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

function renderPeerList(role) {
    const peers = getPeers();
    const peerListContainer = document.getElementById('recent-peers-list');
    if (!peerListContainer) return;

    // Get filter
    const searchInput = document.getElementById('peer-search-input');
    const filter = searchInput ? searchInput.value.toLowerCase() : '';

    peerListContainer.innerHTML = '<h5>Recent Peers</h5>';
    if (Object.keys(peers).length === 0) {
        peerListContainer.innerHTML += '<p>No recent connections found.</p>';
        return;
    }

    // Helper to check if a guid is connected
    const isConnected = (guid) => {
        for (const [peerId, info] of connectedPeers.entries()) {
            if (info.guid === guid && (info.status === 'connected' || info.status === 'datachannelopen')) {
                return peerId;
            }
        }
        return null;
    };

    const filteredPeers = Object.entries(peers).filter(([guid, peer]) => 
        peer.name.toLowerCase().includes(filter)
    );

    if (filteredPeers.length === 0) {
        peerListContainer.innerHTML += '<p>No peers match your search.</p>';
        return;
    }

    filteredPeers.forEach(([guid, peer]) => {
        const item = document.createElement('div');
        item.className = 'peer-item';

        const connectedPeerId = isConnected(guid);
        let actionBtn = '';

        if (connectedPeerId) {
            actionBtn = `<button class="disconnect-peer-btn" data-peer-id="${connectedPeerId}">Disconnect</button>`;
        } else {
            actionBtn = role === 'host'
                ? `<button class="host-user-btn" data-guid="${guid}">Host</button>`
                : `<button class="join-user-btn" data-guid="${guid}">Join</button>`;
        }

        let lastSeenText = '';
        if (peer.lastSeen) {
            const date = new Date(peer.lastSeen);
            lastSeenText = date.toLocaleString();
        }

        item.innerHTML = `
            <div style="display: flex; flex-direction: column;">
                <span class="peer-name">${peer.name}</span>
                <span style="font-size: 0.75rem; opacity: 0.7;">${lastSeenText}</span>
            </div>
            <div class="peer-item-actions">
                ${actionBtn}
                <button class="remove-peer-btn" data-guid="${guid}" title="Remove Peer">&times;</button>
            </div>
        `;
        peerListContainer.appendChild(item);
    });
}

// --- Centralized Connection Logic ---
async function startHostingProcess(hostId) {
    try {
        isIntentionalDisconnect = false;
        signaling.clearBlockedPeers();
        connectionRole = 'host';

        // Attempt to restore a previous session ID if we aren't using a specific GUID
        let idToUse = hostId;
        if (!idToUse) {
            idToUse = localStorage.getItem('pwa_host_session_id');
        }

        // 1. Start PeerJS Host with a specific ID or a random one
        const id = await signaling.initHost(idToUse);
        
        // Update UI to show the correct ID
        document.getElementById('host-id-display').textContent = id;
        targetPeerId = id;

        const shareInfo = document.getElementById('host-share-info');
        if (hostId) {
            if (shareInfo) shareInfo.classList.add('hidden');
        } else {
            if (shareInfo) shareInfo.classList.remove('hidden');
        }

        // Save the session ID if we aren't using a specific GUID
        if (!hostId) {
            localStorage.setItem('pwa_host_session_id', id);
        }

        // 2. Wait for Joiner to connect via PeerJS, then send Native Offer
        signaling.onConnected = async (peerId) => {
            console.log(`Joiner ${peerId} connected to signaling. Generating Native Offer...`);
            const offer = await peerManager.createOffer(peerId);
            signaling.send({ type: 'offer', sdp: offer }, peerId);
        };

        // 3. Wait for Answer back via PeerJS to complete the connection
        signaling.onMessage = async (data, peerId) => {
            if (data.type === 'answer') {
                console.log(`Received Answer from ${peerId} via signaling. Connecting...`);
                await peerManager.acceptAnswer(data.sdp, peerId);
            }
        };
    } catch (err) {
        console.error(err);
        alert("Signaling Error: " + err.message);
        // If the error might be due to a stale ID, clear it so the user can try again
        if (!hostId) {
            localStorage.removeItem('pwa_host_session_id');
        }
    }
}

async function startJoiningProcess(hostId) {
    if (!hostId) return alert("Please provide a Host ID.");
    try {
        isIntentionalDisconnect = false;
        signaling.unblockPeer(hostId);
        connectionRole = 'joiner';
        targetPeerId = hostId;

        // 1. Connect to Host via PeerJS
        await signaling.initJoiner(hostId, { metadata: { manual: true } });

        // 2. Wait for Native WebRTC Offer to be sent over the PeerJS channel
        signaling.onMessage = async (data, peerId) => {
            if (data.type === 'offer') {
                console.log("Received Offer via signaling. Sending Answer...");
                const answer = await peerManager.createAnswer(data.sdp, peerId);
                signaling.send({ type: 'answer', sdp: answer }, peerId);
            }
        };
    } catch (err) {
        console.error(err);
        alert("Signaling Error: " + err.message);
    }
}

function attemptAutoReconnect() {
    if (connectionRole === 'joiner' && targetPeerId) {
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            const delay = 2000 * (reconnectAttempts + 1);
            toastManager.show(`Connection lost. Reconnecting in ${delay/1000}s...`, 'info');
            
            reconnectTimer = setTimeout(() => {
                reconnectAttempts++;
                console.log(`Reconnecting attempt ${reconnectAttempts} to ${targetPeerId}`);
                startJoiningProcess(targetPeerId);
            }, delay);
        } else {
            toastManager.show('Reconnection failed. Please try manually.', 'error');
        }
    } else if (connectionRole === 'host') {
        toastManager.show('Peer disconnected. Waiting for reconnection...', 'info');
    }
}

// --- PeerManager Callbacks ---
peerManager.onMessage((data, peerId) => {
    // Handle incoming data (chat or game state)
    if (data.type === 'disconnect-intent') {
        console.log(`Received disconnect intent from ${peerId}`);
        signaling.blockPeer(peerId);
        return;
    }
    if (data.type === 'chat') {
        chatManager.handleIncomingMessage(data.content, currentRemoteName);
    } else if (data.type === 'identity') {
        currentRemoteName = data.name;
        savePeer(data.guid, data.name);
        
        // Map GUID to PeerID for UI status
        if (connectedPeers.has(peerId)) {
            connectedPeers.get(peerId).guid = data.guid;
        }
        if (connectionRole) renderPeerList(connectionRole);
        console.log('Received data:', data);
    }
});

peerManager.onStatusChange((status, peerId) => {
    console.log(`Connection status for ${peerId}:`, status);
    
    // Update internal map
    if (!connectedPeers.has(peerId)) {
        connectedPeers.set(peerId, { name: 'Connecting...', status: status });
    }
    const peerInfo = connectedPeers.get(peerId);
    peerInfo.status = status;

    if (status === 'connected') {
        chatManager.enable(true);
        toastManager.show('Connected to peer!', 'success');
        reconnectAttempts = 0;
        if (reconnectTimer) clearTimeout(reconnectTimer);
    } else if (status === 'disconnected' || status === 'closed' || status === 'failed') {
        connectedPeers.delete(peerId);
        console.log(`Peer ${peerId} connection lost`);
        
        if (connectedPeers.size === 0) {
            show('peer-setup');
            chatManager.enable(false);
        }
        
        if (!isIntentionalDisconnect && !signaling.isPeerBlocked(peerId)) {
            attemptAutoReconnect();
        }
    }
    if (connectionRole) renderPeerList(connectionRole);
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

    // Modal Logic
    const peerModal = document.getElementById('peer-modal');
    const btnOpenPeerModal = document.getElementById('btn-open-peer-modal');
    const closePeerModalBtn = document.getElementById('close-peer-modal');

    if (btnOpenPeerModal) {
        btnOpenPeerModal.addEventListener('click', () => {
            closeNav();
            peerModal.classList.remove('hidden');
        });
    }

    if (closePeerModalBtn) {
        closePeerModalBtn.addEventListener('click', () => {
            peerModal.classList.add('hidden');
        });
    }

    // Peer Info Modal Logic
    const peerInfoModal = document.getElementById('peer-info-modal');
    const btnPeerInfo = document.getElementById('btn-peer-info');
    const closePeerInfoModalBtn = document.getElementById('close-peer-info-modal');

    if (btnPeerInfo) {
        btnPeerInfo.addEventListener('click', () => {
            peerInfoModal.classList.remove('hidden');
        });
    }

    if (closePeerInfoModalBtn) {
        closePeerInfoModalBtn.addEventListener('click', () => {
            peerInfoModal.classList.add('hidden');
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
        const peerSearchInput = document.getElementById('peer-search-input');
        
        if (role === 'host') {
            btnSelectHost.classList.add('selected');
            btnSelectJoiner.classList.remove('selected');
            panelHost.classList.remove('hidden');
            panelJoin.classList.add('hidden');
            renderPeerList('host');
            recentPeersList.classList.remove('hidden');
            if (peerSearchInput) peerSearchInput.classList.remove('hidden');
        } else {
            btnSelectHost.classList.remove('selected');
            btnSelectJoiner.classList.add('selected');
            panelHost.classList.add('hidden');
            panelJoin.classList.remove('hidden');
            renderPeerList('joiner');
            recentPeersList.classList.remove('hidden');
            if (peerSearchInput) peerSearchInput.classList.remove('hidden');
        }
    }

    if (btnSelectHost && btnSelectJoiner) {
        btnSelectHost.addEventListener('click', () => selectRole('host'));
        btnSelectJoiner.addEventListener('click', () => selectRole('joiner'));
    }

    // Peer Search Listener
    const peerSearchInput = document.getElementById('peer-search-input');
    if (peerSearchInput) {
        peerSearchInput.addEventListener('input', () => {
            const btnSelectHost = document.getElementById('select-host');
            const role = btnSelectHost.classList.contains('selected') ? 'host' : 'joiner';
            renderPeerList(role);
        });
    }

    // --- HOST FLOW ---
    const btnHostSession = document.getElementById('btn-host-session');

    if (btnHostSession) {
        btnHostSession.addEventListener('click', () => startHostingProcess(null));
    }

    // Disconnect Button
    const btnDisconnect = document.getElementById('btn-disconnect');
    if (btnDisconnect) {
        btnDisconnect.addEventListener('click', () => {
            isIntentionalDisconnect = true;
            // Clear the persisted session ID so we don't get stuck with it if we want a new one later
            localStorage.removeItem('pwa_host_session_id');
            location.reload();
        });
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
            const peerId = e.target.dataset.peerId;
            if (!guid && !peerId) return;

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
            } else if (e.target.classList.contains('disconnect-peer-btn')) {
                if (peerId) {
                    signaling.blockPeer(peerId);
                    peerManager.send({ type: 'disconnect-intent' }, peerId);
                    setTimeout(() => peerManager.disconnect(peerId), 100);
                }
            } else if (e.target.classList.contains('remove-peer-btn')) {
                if (confirm(`Are you sure you want to remove this peer?`)) {
                    removePeer(guid);
                    e.target.closest('.peer-item').remove(); // Remove from UI immediately
                }
            }
        });
    }
});