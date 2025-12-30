export class ChatManager {
    constructor(peerManager, getIdentity) {
        this.peerManager = peerManager;
        this.getIdentity = getIdentity;
        this.unreadCount = 0;
        
        this.messagesContainer = document.getElementById('messages');
        this.badge = document.getElementById('chat-badge');
        this.btnOpenChat = document.getElementById('btn-open-chat');
        this.chatModal = document.getElementById('chat-modal');

        this._setupInputListeners();
    }

    _setupInputListeners() {
        const btnSend = document.getElementById('btn-send');
        const inputMsg = document.getElementById('msg-input');

        if (btnSend && inputMsg) {
            btnSend.addEventListener('click', () => {
                this._sendMessage();
            });
            
            inputMsg.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this._sendMessage();
                }
            });
        }
    }

    _sendMessage() {
        const inputMsg = document.getElementById('msg-input');
        const text = inputMsg.value;
        if (!text) return;
        
        this.peerManager.send({ type: 'chat', content: text });
        this.addMessage(text, 'local', this.getIdentity().name);
        inputMsg.value = '';
    }

    addMessage(text, type, senderName) {
        if (!this.messagesContainer) return;
        
        const wrapper = document.createElement('div');
        wrapper.className = `message-wrapper ${type}`;

        const nameLabel = document.createElement('div');
        nameLabel.className = 'message-name';
        nameLabel.textContent = senderName;

        const bubble = document.createElement('div');
        bubble.className = `message ${type}`;
        bubble.textContent = text;

        wrapper.appendChild(nameLabel);
        wrapper.appendChild(bubble);
        this.messagesContainer.appendChild(wrapper);
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    handleIncomingMessage(content, senderName) {
        this.addMessage(content, 'remote', senderName);
        
        if (this.chatModal && this.chatModal.classList.contains('hidden')) {
            this.unreadCount++;
            this._updateBadge();
        }
    }

    _updateBadge() {
        if (this.badge) {
            this.badge.textContent = this.unreadCount;
            this.badge.classList.toggle('hidden', this.unreadCount === 0);
        }
    }

    resetUnread() {
        this.unreadCount = 0;
        this._updateBadge();
    }

    enable(isEnabled) {
        if (this.btnOpenChat) {
            this.btnOpenChat.disabled = !isEnabled;
        }
    }
}