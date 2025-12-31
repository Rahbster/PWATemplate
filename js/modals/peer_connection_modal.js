import * as peerService from '../peer-service.js';

// --- Identity & Peer History ---
function getIdentity() {
    let guid = localStorage.getItem('pwa_user_guid');
    if (!guid) {
        guid = crypto.randomUUID();
        localStorage.setItem('pwa_user_guid', guid);
    }
    const name = localStorage.getItem('pwa_display_name') || 'Anonymous';
    return { guid, name };
}

function getPeers() {
    return JSON.parse(localStorage.getItem('pwa_peers') || '{}');
}

function savePeer(guid, name) {
    if (getIdentity().guid === guid) return; // Don't save self
    let peers = getPeers();
    peers[guid] = { name, lastSeen: Date.now() };
    localStorage.setItem('pwa_peers', JSON.stringify(peers));
}

function removePeer(guid) {
    let peers = getPeers();
    delete peers[guid];
    localStorage.setItem('pwa_peers', JSON.stringify(peers));
}

export function showPeerConnectionModal(toastManager, chatManager) {
    if (document.getElementById('peer-modal')) return;

    const modalHTML = `
        <div id="peer-modal" class="modal">
            <div class="modal-content">
                <span id="close-peer-modal" class="close-modal">&times;</span>
                <h2>Peer Connection <button id="btn-peer-info" class="info-icon" title="How it works">ℹ️</button></h2>
                <div class="peer-controls">
                    <div id="peer-setup">
                        <div class="role-selector">
                            <button id="select-host" class="role-btn">Host</button>
                            <button id="select-joiner" class="role-btn">Joiner</button>
                        </div>
                        <div id="panel-host" class="role-panel hidden">
                            <div class="step-box">
                                <h4>Host Session</h4>
                                <button id="btn-host-session">Start Hosting</button>
                                <div id="host-share-info" class="hidden">
                                    <p>Share this ID with the Joiner:</p>
                                    <div id="host-id-display" class="code-display">------</div>
                                </div>
                            </div>
                        </div>
                        <div id="panel-join" class="role-panel hidden">
                            <div class="step-box">
                                <h4>Join Session</h4>
                                <p>Enter 6-Digit Host ID:</p>
                                <input type="text" id="joiner-id-input" class="sdp-box" placeholder="Enter Host ID" maxlength="6" style="text-align: center; font-size: 1.5rem; letter-spacing: 4px;">
                            </div>
                        </div>
                        <input type="text" id="peer-search-input" class="sdp-box hidden" placeholder="Search peers..." style="margin-bottom: 0.5rem;">
                        <div id="recent-peers-list" class="step-box hidden"></div>
                    </div>
                </div>
            </div>
        </div>
        <div id="peer-info-modal" class="modal hidden">
            <div class="modal-content">
                <span id="close-peer-info-modal" class="close-modal">&times;</span>
                <h2>How it Works</h2>
                <div class="info-content">
                    <h3>Host</h3>
                    <p>The Host initiates the session. They generate a unique ID (or use their own) which must be shared with the Joiner.</p>
                    <h3>Joiner</h3>
                    <p>The Joiner connects to a Host by entering the Host's 6-digit ID.</p>
                    <h3>Direct Connection</h3>
                    <p>Once connected, data is exchanged directly between devices (Peer-to-Peer) without going through a central server.</p>
                    <h3>Recent Peers</h3>
                    <p>When a connection is established, the Host and Joiner exchange their display names and a unique internal ID. This information is saved to your "Recent Peers" list, allowing you to easily reconnect or host the same person again without re-entering codes.</p>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    let connectionRole = null;
    let isConnected = false;
    let currentRemoteName = 'Peer';

    const dom = {
        peerModal: document.getElementById('peer-modal'),
        closePeerModalBtn: document.getElementById('close-peer-modal'),
        peerInfoModal: document.getElementById('peer-info-modal'),
        btnPeerInfo: document.getElementById('btn-peer-info'),
        closePeerInfoModalBtn: document.getElementById('close-peer-info-modal'),
        selectHostBtn: document.getElementById('select-host'),
        selectJoinerBtn: document.getElementById('select-joiner'),
        panelHost: document.getElementById('panel-host'),
        panelJoin: document.getElementById('panel-join'),
        btnHostSession: document.getElementById('btn-host-session'),
        hostShareInfo: document.getElementById('host-share-info'),
        hostIdDisplay: document.getElementById('host-id-display'),
        joinerIdInput: document.getElementById('joiner-id-input'),
        peerSearchInput: document.getElementById('peer-search-input'),
        recentPeersList: document.getElementById('recent-peers-list'),
    };

    function destroyModal() {
        dom.peerModal?.remove();
        dom.peerInfoModal?.remove();
    }

    function renderPeerList(role) {
        const peers = getPeers();
        const filter = dom.peerSearchInput.value.toLowerCase();
        let listHTML = '<h5>Recent Peers</h5>';

        const filteredPeers = Object.entries(peers).filter(([, p]) => p.name.toLowerCase().includes(filter));

        if (Object.keys(peers).length === 0) {
            listHTML += '<p>No recent connections found.</p>';
        } else if (filteredPeers.length === 0) {
            listHTML += '<p>No peers match your search.</p>';
        } else {
            filteredPeers.forEach(([guid, peer]) => {
                const actionBtn = isConnected ? `<span style="font-size:0.8em; color:green;">Connected</span>` :
                    role === 'host' ? `<button class="host-user-btn" data-guid="${guid}">Host</button>` :
                    `<button class="join-user-btn" data-guid="${guid}">Join</button>`;
                const lastSeenText = peer.lastSeen ? new Date(peer.lastSeen).toLocaleString() : '';

                listHTML += `
                    <div class="peer-item">
                        <div style="display: flex; flex-direction: column;">
                            <span class="peer-name">${peer.name}</span>
                            <span style="font-size: 0.75rem; opacity: 0.7;">${lastSeenText}</span>
                        </div>
                        <div class="peer-item-actions">
                            ${actionBtn}
                            <button class="remove-peer-btn" data-guid="${guid}" title="Remove Peer">&times;</button>
                        </div>
                    </div>`;
            });
        }
        dom.recentPeersList.innerHTML = listHTML;
    }

    function selectRole(role) {
        connectionRole = role;
        dom.selectHostBtn.classList.toggle('selected', role === 'host');
        dom.selectJoinerBtn.classList.toggle('selected', role !== 'host');
        dom.panelHost.classList.toggle('hidden', role !== 'host');
        dom.panelJoin.classList.toggle('hidden', role === 'host');
        dom.recentPeersList.classList.remove('hidden');
        dom.peerSearchInput.classList.remove('hidden');
        renderPeerList(role);
    }

    function updateConnectionStatus(count) {
        isConnected = count > 0;
        chatManager.enable(isConnected);
        if (connectionRole) renderPeerList(connectionRole);
    }

    function handleDataReceived(data) {
        if (data.type === 'chat') {
            chatManager.handleIncomingMessage(data.content, currentRemoteName);
        } else if (data.type === 'identity') {
            currentRemoteName = data.name;
            savePeer(data.guid, data.name);
            renderPeerList(connectionRole);
            toastManager.show(`Connected with ${data.name}`, 'info');
        }
    }

    function handleConnectionEstablished() {
        toastManager.show('Connected to peer!', 'success');
        isConnected = true;
        chatManager.enable(true);
        const identity = getIdentity();
        peerService.sendData({ type: 'identity', guid: identity.guid, name: identity.name });
        destroyModal();
    }

    function startHostingProcess(customId = null) {
        peerService.createHost(
            (id) => {
                dom.hostIdDisplay.textContent = id;
                dom.hostShareInfo.classList.remove('hidden');
                toastManager.show('Session started. Waiting for peer...', 'info');
            },
            handleConnectionEstablished, handleDataReceived,
            (err) => toastManager.show(`Error: ${err.type || err}`, 'error'),
            updateConnectionStatus, customId
        );
    }

    function startJoiningProcess(hostId) {
        if (!hostId) return;
        peerService.joinHost(hostId,
            handleConnectionEstablished, handleDataReceived,
            (err) => toastManager.show(`Error: ${err.type || err}`, 'error'),
            updateConnectionStatus
        );
    }

    // --- Setup Event Listeners ---
    dom.closePeerModalBtn.addEventListener('click', destroyModal);
    dom.peerModal.addEventListener('click', (e) => { if (e.target === dom.peerModal) destroyModal(); });
    dom.btnPeerInfo.addEventListener('click', () => dom.peerInfoModal.classList.remove('hidden'));
    dom.closePeerInfoModalBtn.addEventListener('click', () => dom.peerInfoModal.classList.add('hidden'));
    dom.peerInfoModal.addEventListener('click', (e) => { if (e.target === dom.peerInfoModal) dom.peerInfoModal.classList.add('hidden'); });
    dom.selectHostBtn.addEventListener('click', () => selectRole('host'));
    dom.selectJoinerBtn.addEventListener('click', () => selectRole('joiner'));
    dom.peerSearchInput.addEventListener('input', () => renderPeerList(connectionRole));
    dom.btnHostSession.addEventListener('click', () => startHostingProcess());
    dom.joinerIdInput.addEventListener('input', () => {
        if (dom.joinerIdInput.value.length === 6) startJoiningProcess(dom.joinerIdInput.value);
    });
    dom.recentPeersList.addEventListener('click', (e) => {
        const guid = e.target.dataset.guid;
        if (!guid) return;
        if (e.target.classList.contains('remove-peer-btn')) {
            if (confirm(`Are you sure you want to remove this peer?`)) {
                removePeer(guid);
                e.target.closest('.peer-item').remove();
            }
        } else if (e.target.classList.contains('host-user-btn')) {
            startHostingProcess(getIdentity().guid);
        } else if (e.target.classList.contains('join-user-btn')) {
            startJoiningProcess(guid);
        }
    });

    // Initialize
    selectRole('host');
    peerService.initialize('pwa-');
}