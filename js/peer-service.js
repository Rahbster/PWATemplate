let peerPrefix = 'app-';
let peerConfig = {};
let peer = null;
let connections = [];
let peerId = null;
let onConnectionChangeCallback = () => {};

/**
 * Configures the peer service with a specific prefix and PeerJS options.
 * @param {string} prefix - The prefix to use for peer IDs (e.g., 'myapp-').
 * @param {object} config - Configuration object for the Peer constructor.
 */
export function initialize(prefix, config = {}) {
    if (prefix) peerPrefix = prefix;
    peerConfig = config;
}

/**
 * Initializes the PeerJS object for the host and sets up event listeners.
 * @param {function} onOpen - Callback function when the peer connection is open, receives the peer ID.
 * @param {function} onConnect - Callback function when a data connection is established.
 * @param {function} onData - Callback function when data is received.
 * @param {function} onError - Callback function for any PeerJS errors.
 * @param {function} onConnectionChange - Callback function when the number of connections changes.
 * @param {string} [customId] - Optional custom ID to use instead of a random one.
 */
export function createHost(onOpen, onConnect, onData, onError, onConnectionChange, customId = null) {
    destroyPeer(); // Ensure any existing peer is destroyed
    onConnectionChangeCallback = onConnectionChange || (() => {});
    peerId = customId ? `${peerPrefix}${customId}` : `${peerPrefix}${Math.floor(100000 + Math.random() * 900000)}`;
    peer = new Peer(peerId, peerConfig);

    peer.on('open', (id) => {
        console.log('PeerJS Host is open. ID:', id);
        if (onOpen) onOpen(id.replace(peerPrefix, ''));
    });

    peer.on('connection', (conn) => {
        console.log('Incoming connection...');
        connections.push(conn);
        onConnectionChangeCallback(connections.length);
        setupConnectionEvents(conn, onConnect, onData);
    });

    peer.on('error', (err) => {
        console.error('PeerJS Host Error:', err);
        if (onError) onError(err.type);
    });
}

/**
 * Initializes the PeerJS object for the joiner and connects to a host.
 * @param {string} hostId - The ID of the host to connect to.
 * @param {function} onConnect - Callback function when the data connection is established.
 * @param {function} onData - Callback function when data is received.
 * @param {function} onError - Callback function for any PeerJS errors.
 * @param {function} onConnectionChange - Callback function when the number of connections changes.
 */
export function joinHost(hostId, onConnect, onData, onError, onConnectionChange) {
    destroyPeer(); // Ensure any existing peer is destroyed
    onConnectionChangeCallback = onConnectionChange || (() => {});
    peer = new Peer(peerConfig); // Joiner gets a random ID from the server

    peer.on('open', () => {
        console.log('PeerJS Joiner is open. Connecting to host:', hostId);
        const fullHostId = `${peerPrefix}${hostId}`;
        const conn = peer.connect(fullHostId, { reliable: true });
        connections.push(conn);
        onConnectionChangeCallback(connections.length);
        setupConnectionEvents(conn, onConnect, onData);
    });

    peer.on('error', (err) => {
        console.error('PeerJS Joiner Error:', err);
        if (onError) onError(err.type);
    });
}

/**
 * Sets up the event listeners for a new data connection.
 * @param {object} conn - The PeerJS connection object.
 * @param {function} onConnect - Callback for connection open.
 * @param {function} onData - Callback for received data.
 */
function setupConnectionEvents(conn, onConnect, onData) {
    if (!conn) return;

    conn.on('open', () => {
        console.log('Data connection is open.');
        if (onConnect) onConnect();
    });

    conn.on('data', (data) => {
        console.log('Data received:', data);
        if (onData) onData(data);
    });

    conn.on('close', () => {
        console.log('Connection closed.');
        connections = connections.filter(c => c.connectionId !== conn.connectionId);
        onConnectionChangeCallback(connections.length);
    });
}

/**
 * Sends data to the connected peer.
 * @param {object} data - The data object to send.
 * @returns {boolean} - True if data was sent, false otherwise.
 */
export function sendData(data) {
    if (connections.length > 0) {
        connections.forEach(conn => {
            if (conn && conn.open) {
                conn.send(data);
            }
        });
    }
    console.warn('Cannot send data, no open connection.');
    return false;
}

/**
 * Destroys the current PeerJS instance and cleans up connections.
 */
export function destroyPeer() {
    if (connections.length > 0) {
        connections.forEach(conn => conn.close());
        connections = [];
        onConnectionChangeCallback(0);
    }
    if (peer) {
        peer.destroy();
        peer = null;
    }
    console.log('Peer instance destroyed.');
}