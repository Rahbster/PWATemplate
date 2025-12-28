/**
 * WebRTC Peer Connection Manager using PeerJS
 * With Diagnostic Logging
 */

import { getIdentity } from './app.js';

class PeerManager {
    constructor() {
        this.peer = null;
        this.conn = null;
        this.myId = null;
    }

    log(msg) {
        const timestamp = new Date().toLocaleTimeString();
        console.log(`[${timestamp}] [PeerManager] ${msg}`);
    }

    async startHost(customId = null) {
        this.log(`startHost called. CustomID: ${customId}`);

        // Cleanup existing peer if present
        if (this.peer && !this.peer.destroyed) {
            if (customId && this.peer.id === customId) {
                this.log(`Existing peer matches requested ID ${customId}. Reusing.`);
                return this.peer.id;
            }
            this.log('Destroying existing peer instance.');
            this.peer.destroy();
        }

        return new Promise((resolve, reject) => {
            // Use customId or generate a random 6-digit code
            const idToUse = customId || Math.floor(100000 + Math.random() * 900000).toString();
            this.log(`Initializing Peer with ID: ${idToUse}`);

            this.peer = new Peer(idToUse, {
                debug: 2,
                pingInterval: 5000,
                config: {
                    iceServers: [
                        { urls: 'stun:stun.l.google.com:19302' },
                        { urls: 'stun:global.stun.twilio.com:3478' }
                    ]
                }
            });

            this.peer.on('open', (id) => {
                this.myId = id;
                this.log(`Peer opened successfully. My ID: ${id}`);
                
                this.peer.on('connection', (conn) => {
                    this.log(`Incoming connection request from: ${conn.peer}`);
                    this.handleConnection(conn);
                });

                resolve(id);
            });

            this.peer.on('error', (err) => {
                this.log(`Peer Error: ${err.type} - ${err.message}`);
                alert(`Peer Error: ${err.type}\n${err.message}`);
                reject(err);
            });

            this.peer.on('disconnected', () => {
                this.log('Peer disconnected from signaling server.');
            });
        });
    }

    async joinSession(remoteId) {
        const targetId = remoteId.trim();
        this.log(`joinSession called. Target ID: ${targetId}`);

        if (this.peer && !this.peer.destroyed) {
            this.log('Destroying existing peer instance before joining.');
            this.peer.destroy();
        }

        // Create a new peer with a random ID for the joiner
        this.peer = new Peer(undefined, {
            debug: 2,
            pingInterval: 5000,
            config: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:global.stun.twilio.com:3478' }
                ]
            }
        });

        return new Promise((resolve, reject) => {
            this.peer.on('open', (id) => {
                this.myId = id;
                this.log(`Joiner Peer opened. Ephemeral ID (not GUID): ${id}`);
                
                this.log(`Initiating connection to ${targetId}...`);
                
                // Small delay to ensure peer is ready
                setTimeout(() => {
                    const conn = this.peer.connect(targetId);
                    if (!conn) {
                        this.log('Connection creation failed (returned null).');
                        reject('Connection creation failed');
                        return;
                    }
                    this.handleConnection(conn);
                    resolve();
                }, 500);
            });

            this.peer.on('error', (err) => {
                this.log(`Peer Error (Joiner): ${err.type} - ${err.message}`);
                alert(`Peer Error: ${err.type}\n${err.message}`);
                reject(err);
            });
        });
    }

    handleConnection(conn) {
        this.conn = conn;
        this.log(`Setting up connection handlers for peer: ${conn.peer}`);
        this.log(`Connection open status: ${conn.open}`);

        // Diagnostic: Monitor ICE state
        if (conn.peerConnection) {
            const pc = conn.peerConnection;
            
            pc.addEventListener('iceconnectionstatechange', () => {
                this.log(`ICE State Change: ${pc.iceConnectionState}`);
            });
            
            pc.addEventListener('icegatheringstatechange', () => {
                this.log(`ICE Gathering State: ${pc.iceGatheringState}`);
            });

            pc.addEventListener('signalingstatechange', () => {
                this.log(`Signaling State: ${pc.signalingState}`);
            });

            pc.addEventListener('icecandidate', (event) => {
                if (event.candidate) {
                    this.log(`Generated ICE Candidate: ${event.candidate.candidate}`);
                } else {
                    this.log('End of ICE Candidates');
                }
            });
        } else {
            this.log('No peerConnection object found on DataConnection yet.');
        }

        this.conn.on('open', () => {
            this.log(`DataConnection opened with ${conn.peer}`);
            updateStatus("Connected! Exchanging Identity...");
            this.sendIdentity();
        });

        this.conn.on('data', (data) => {
            this.log(`Received data from ${conn.peer}: ${JSON.stringify(data)}`);
            
            let msg = data;
            if (msg && msg.type === 'identity') {
                this.handleIdentity(msg);
            } else {
                addMessage(msg, 'remote');
            }
        });

        this.conn.on('close', () => {
            this.log(`Connection closed with ${conn.peer}`);
            updateStatus("Connection Closed");
            this.conn = null;
        });
        
        this.conn.on('error', (err) => {
            this.log(`DataConnection Error: ${err}`);
            alert(`Connection Error: ${err}`);
        });
    }

    sendIdentity() {
        this.log('Sending identity...');
        const identity = getIdentity();
        const payload = {
            type: 'identity',
            name: identity.name,
            guid: identity.guid
        };
        
        if (this.conn && this.conn.open) {
            this.conn.send(payload);
            this.log('Identity sent.');
        } else {
            this.log('Cannot send identity: Connection not open.');
        }
    }

    handleIdentity(msg) {
        this.log(`Handling identity: ${msg.name} (${msg.guid})`);
        this.savePeer(msg.guid, msg.name);
        updateStatus(`Connected to ${msg.name}`);
        loadPeerLists();
    }

    sendMessage(msg) {
        this.log(`Sending message: ${msg}`);
        if (this.conn && this.conn.open) {
            this.conn.send(msg);
            addMessage(msg, 'local');
        } else {
            this.log('Cannot send message: Connection not open.');
            console.warn('Connection not open');
        }
    }

    savePeer(guid, name) {
        this.log(`Saving peer to history: ${name}`);
        let peers = JSON.parse(localStorage.getItem('pwa_peers') || '{}');
        peers[guid] = { name, lastSeen: Date.now() };
        localStorage.setItem('pwa_peers', JSON.stringify(peers));
    }
}

// UI Interaction
const peerManager = new PeerManager();

function updateStatus(text) {
    console.log(`[UI Status] ${text}`);
    const el = document.getElementById('connection-state');
    if (el) el.textContent = text;
}

function addMessage(text, type) {
    const container = document.getElementById('messages');
    const div = document.createElement('div');
    div.className = `message ${type}`;
    div.textContent = text;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

function loadPeerLists() {
    const peers = JSON.parse(localStorage.getItem('pwa_peers') || '{}');
    const listHost = document.getElementById('host-peer-list');
    const listJoin = document.getElementById('join-peer-list');
    
    const createItem = (guid, peer, action) => {
        const li = document.createElement('div');
        li.className = 'peer-item';
        li.innerHTML = `<span>${peer.name}</span> <button>Connect</button>`;
        li.querySelector('button').addEventListener('click', () => action(guid));
        return li;
    };

    if (listHost) {
        listHost.innerHTML = '';
        Object.entries(peers).forEach(([guid, peer]) => {
            listHost.appendChild(createItem(guid, peer, (id) => peerManager.startHost(id)));
        });
    }

    if (listJoin) {
        listJoin.innerHTML = '';
        Object.entries(peers).forEach(([guid, peer]) => {
            listJoin.appendChild(createItem(guid, peer, (id) => peerManager.joinSession(id)));
        });
    }
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    const btnHost = document.getElementById('btn-host');
    const btnJoin = document.getElementById('btn-join');
    const btnSend = document.getElementById('btn-send');
    const inputMsg = document.getElementById('msg-input');
    
    // Role Selection
    const btnSelectHost = document.getElementById('select-host');
    const btnSelectJoiner = document.getElementById('select-joiner');
    const panelHost = document.getElementById('panel-host');
    const panelJoin = document.getElementById('panel-join');
    const btnHostMyId = document.getElementById('btn-host-myid');

    loadPeerLists();

    function selectRole(role) {
        // Reset Status and Chat views when switching roles
        document.getElementById('peer-status').classList.add('hidden');
        document.getElementById('host-info').classList.add('hidden');
        document.getElementById('peer-chat').classList.add('hidden');
        document.getElementById('peer-setup').classList.remove('hidden');

        if (role === 'host') {
            btnSelectHost.classList.add('selected');
            btnSelectJoiner.classList.remove('selected');
            panelHost.classList.remove('hidden');
            panelJoin.classList.add('hidden');
        } else {
            btnSelectHost.classList.remove('selected');
            btnSelectJoiner.classList.add('selected');
            panelHost.classList.add('hidden');
            panelJoin.classList.remove('hidden');
        }
    }

    if (btnSelectHost && btnSelectJoiner) {
        btnSelectHost.addEventListener('click', () => selectRole('host'));
        btnSelectJoiner.addEventListener('click', () => selectRole('joiner'));
    }

    if (btnHost) {
        btnHost.addEventListener('click', async () => {
            document.getElementById('peer-status').classList.remove('hidden');
            updateStatus("Initializing Host...");
            try {
                const code = await peerManager.startHost();
                document.getElementById('host-info').classList.remove('hidden');
                document.getElementById('display-code').textContent = code;
                updateStatus("Waiting for peer...");
            } catch (e) {
                updateStatus("Error initializing host.");
            }
        });
    }

    if (btnHostMyId) {
        btnHostMyId.addEventListener('click', async () => {
            document.getElementById('peer-status').classList.remove('hidden');
            updateStatus("Initializing Host (My ID)...");
            try {
                const identity = getIdentity();
                const code = await peerManager.startHost(identity.guid);
                document.getElementById('host-info').classList.remove('hidden');
                document.getElementById('display-code').textContent = "MY ID"; // Don't show full GUID
                updateStatus("Waiting for peer on My ID...");
            } catch (e) {
                updateStatus("Error initializing host.");
            }
        });
    }

    if (btnJoin) {
        btnJoin.addEventListener('click', async () => {
            const code = document.getElementById('join-code').value;
            if (!code) {
                alert("Please enter a valid code");
                return;
            }
            document.getElementById('peer-status').classList.remove('hidden');
            updateStatus("Joining...");
            try {
                await peerManager.joinSession(code);
            } catch (e) {
                updateStatus("Error joining session.");
            }
        });
    }

    if (btnSend) {
        btnSend.addEventListener('click', () => {
            const text = inputMsg.value;
            if (text) {
                peerManager.sendMessage(text);
                inputMsg.value = '';
            }
        });
        
        inputMsg.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                btnSend.click();
            }
        });
    }
});