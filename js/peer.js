/**
 * WebRTC Peer Connection Manager
 * Adapted from TeamSudoku logic (Native WebRTC)
 */
import { getIdentity } from './app.js';

export class PeerManager {
    constructor() {
        this.connections = new Map(); // peerId -> { connection, dataChannel }
        this.onMessageCallback = null;
        this.onStatusChangeCallback = null;
    }

    // Initializes the WebRTC PeerConnection
    // Corresponds to initializeWebRTC in TeamSudoku
    _initializeWebRTC(peerId) {
        const config = {
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        };

        const connection = new RTCPeerConnection(config);

        connection.onicecandidate = event => {
            if (event.candidate) {
                console.log('New ICE candidate:', event.candidate);
            }
        };

        connection.onconnectionstatechange = () => {
            console.log(`WebRTC Connection State: ${connection.connectionState}`);
            if (this.onStatusChangeCallback) {
                this.onStatusChangeCallback(connection.connectionState, peerId);
            }
        };

        connection.ondatachannel = event => {
            this._setupDataChannel(event.channel, peerId);
        };

        return connection;
    }

    // Sets up event handlers for the data channel
    // Corresponds to setupDataChannel in TeamSudoku
    _setupDataChannel(channel, peerId) {
        const connObj = this.connections.get(peerId);
        if (connObj) {
            connObj.dataChannel = channel;
        }

        channel.onopen = () => {
            console.log('Data Channel is open!');
            if (this.onStatusChangeCallback) this.onStatusChangeCallback('datachannelopen', peerId);
            // Once the data channel is open, exchange identities
            this.sendIdentity(peerId);
        };

        channel.onmessage = (event) => {
            this._handleIncomingMessage(event, peerId);
        };
    }

    // Handles incoming messages
    // Corresponds to handleIncomingMessage in TeamSudoku
    _handleIncomingMessage(event, peerId) {
        try {
            const data = JSON.parse(event.data);
            if (this.onMessageCallback) {
                this.onMessageCallback(data, peerId);
            }
        } catch (e) {
            console.error("Error parsing incoming message:", e);
        }
    }

    // Creates an offer and waits for ICE gathering
    // Corresponds to createOffer in TeamSudoku
    async createOffer(peerId) {
        const connection = this._initializeWebRTC(peerId);
        // Store connection immediately
        this.connections.set(peerId, { connection, dataChannel: null });

        const channel = connection.createDataChannel('pwa-data-channel');
        this._setupDataChannel(channel, peerId);

        const offer = await connection.createOffer();
        await connection.setLocalDescription(offer);
        
        // Wait until ICE gathering is complete before returning
        await this._waitForIceGathering(connection);
        
        // Return the full SDP (including candidates) as a string
        return JSON.stringify(connection.localDescription);
    }

    // Creates an answer given an offer string
    // Corresponds to createAnswer in TeamSudoku
    async createAnswer(offerStr, peerId) {
        const connection = this._initializeWebRTC(peerId);
        this.connections.set(peerId, { connection, dataChannel: null });
        
        const offer = JSON.parse(offerStr);
        await connection.setRemoteDescription(new RTCSessionDescription(offer));
        
        const answer = await connection.createAnswer();
        await connection.setLocalDescription(answer);
        
        // Wait until ICE gathering is complete
        await this._waitForIceGathering(connection);
        
        return JSON.stringify(connection.localDescription);
    }

    // Accepts an answer to establish the connection (Host side)
    async acceptAnswer(answerStr, peerId) {
        const connObj = this.connections.get(peerId);
        if (!connObj || !connObj.connection) throw new Error("No connection initialized for " + peerId);
        const answer = JSON.parse(answerStr);
        await connObj.connection.setRemoteDescription(new RTCSessionDescription(answer));
    }

    // Helper to ensure ICE gathering is complete
    _waitForIceGathering(connection) {
        return new Promise(resolve => {
            if (connection.iceGatheringState === 'complete') {
                resolve();
            } else {
                const checkState = () => {
                    if (connection.iceGatheringState === 'complete') {
                        connection.removeEventListener('icegatheringstatechange', checkState);
                        resolve();
                    }
                };
                connection.addEventListener('icegatheringstatechange', checkState);
            }
        });
    }

    // Public API to send data
    send(data, peerId = null) {
        const msg = JSON.stringify(data);
        if (peerId) {
            const connObj = this.connections.get(peerId);
            if (connObj && connObj.dataChannel && connObj.dataChannel.readyState === 'open') {
                connObj.dataChannel.send(msg);
            }
        } else {
            // Broadcast to all
            this.connections.forEach(connObj => {
                if (connObj.dataChannel && connObj.dataChannel.readyState === 'open') {
                    connObj.dataChannel.send(msg);
                }
            });
        }
    }

    disconnect(peerId) {
        const connObj = this.connections.get(peerId);
        if (connObj) {
            if (connObj.dataChannel) connObj.dataChannel.close();
            if (connObj.connection) connObj.connection.close();
            this.connections.delete(peerId);
            if (this.onStatusChangeCallback) this.onStatusChangeCallback('closed', peerId);
        }
    }

    // Sends this user's identity to the connected peer
    sendIdentity(peerId) {
        const identity = getIdentity();
        this.send({
            type: 'identity',
            guid: identity.guid,
            name: identity.name
        }, peerId);
    }

    // Register callbacks
    onMessage(cb) { this.onMessageCallback = cb; }
    onStatusChange(cb) { this.onStatusChangeCallback = cb; }
}