export class SignalingChannel {
    constructor() {
        this.peer = null;
        this.connections = new Map(); // peerId -> DataConnection
        this.onConnected = null;
        this.onMessage = null;
        this.blockedPeers = new Set(); // peerIds that were intentionally disconnected
    }

    isPeerBlocked(peerId) {
        return this.blockedPeers.has(peerId);
    }

    blockPeer(peerId) {
        this.blockedPeers.add(peerId);
    }

    unblockPeer(peerId) {
        this.blockedPeers.delete(peerId);
    }

    clearBlockedPeers() {
        this.blockedPeers.clear();
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
            this.setupConnection(conn);
        });
        return id;
    }

    async initJoiner(hostId, options = {}) {
        if (this.peer && !this.peer.destroyed) this.peer.destroy();

        // Joiner uses a server-assigned ID by passing undefined
        const { peer } = await this._createPeer(undefined);
        this.peer = peer;

        const conn = this.peer.connect(hostId, options);
        this.setupConnection(conn);
    }

    setupConnection(conn) {
        if (conn.metadata && conn.metadata.manual) {
            this.unblockPeer(conn.peer);
        }

        if (this.isPeerBlocked(conn.peer)) {
            console.log(`Rejecting connection from blocked peer: ${conn.peer}`);
            conn.close();
            return;
        }

        this.connections.set(conn.peer, conn);

        conn.on('open', () => {
            console.log(`Signaling Channel Open with ${conn.peer}`);
            if (this.onConnected) this.onConnected(conn.peer);
        });
        conn.on('data', (data) => {
            if (this.onMessage) this.onMessage(data, conn.peer);
        });
        conn.on('close', () => {
            console.log(`Signaling Channel Closed with ${conn.peer}`);
            this.connections.delete(conn.peer);
        });
        conn.on('error', (err) => {
            console.error(`Signaling Channel Error with ${conn.peer}:`, err);
        });
    }

    send(data, peerId) {
        const conn = this.connections.get(peerId);
        if (conn && conn.open) conn.send(data);
    }
}