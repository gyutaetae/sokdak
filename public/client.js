// Socket.io 연결
const socket = io();

// URL에서 파라미터 추출
const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get('room');
const isCreator = urlParams.get('create') === 'true';

// DOM 요소
const roomName = document.getElementById('roomName');
const connectionStatus = document.getElementById('connectionStatus');
const userCount = document.getElementById('userCount');
const messagesContainer = document.getElementById('messagesContainer');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const imageBtn = document.getElementById('imageBtn');
const imageInput = document.getElementById('imageInput');
const deleteTimer = document.getElementById('deleteTimer');
const showQRBtn = document.getElementById('showQRBtn');
const leaveRoomBtn = document.getElementById('leaveRoomBtn');
const qrModal = document.getElementById('qrModal');
const sessionExpired = document.getElementById('sessionExpired');

// 상태 관리
let mySocketId = null;
let peers = new Map();
let dataChannels = new Map();
let currentUserCount = 0;
let encryptionReady = new Map();
const MAX_USERS = 3;

// WebRTC 설정
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// 유틸리티 함수
function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function isNearBottom() {
    return messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight < 100;
}

function updateUserCount(count) {
    currentUserCount = count;
    userCount.textContent = `👥 ${currentUserCount}/${MAX_USERS}`;
}

function updateConnectionStatus(text, className) {
    connectionStatus.textContent = text;
    connectionStatus.className = className;
}

async function ensureEncryption() {
    if (!cryptoUtils.keyPair) {
        await cryptoUtils.generateKeyPair();
    }
}

async function sendPublicKey(to = null) {
    await ensureEncryption();
    const publicKey = await cryptoUtils.exportPublicKey();
    socket.emit('public-key', to ? { to, publicKey } : { publicKey });
}

async function connectToUsers(userIds) {
    if (!userIds || userIds.length === 0) return;
    for (const userId of userIds) {
        await createPeerConnection(userId, true);
    }
}

// 초기화
function init() {
    if (!roomId) {
        alert('방 ID가 없습니다.');
        window.location.href = '/';
        return;
    }
    roomName.textContent = `방: ${roomId}`;
    initializeRoom();
}

// 모바일 입력 설정
if (messageInput) {
    ['autocomplete', 'autocapitalize', 'autocorrect', 'spellcheck'].forEach(attr => {
        messageInput.setAttribute(attr, attr === 'spellcheck' ? 'false' : 'off');
    });
    messageInput.addEventListener('touchstart', (e) => e.target.focus(), { passive: true });
    messageInput.addEventListener('click', (e) => e.target.focus());
}

function initializeRoom() {
    socket.emit(isCreator ? 'create-room' : 'join-room', roomId);
}

// Socket.io 이벤트 핸들러
socket.on('connect', async () => {
    mySocketId = socket.id;
    console.log('Connected to server:', mySocketId);
    await ensureEncryption();
});

socket.on('room-created', async (data) => {
    updateConnectionStatus('연결됨', 'status connected');
    showSystemMessage('방이 생성되었습니다. 다른 사용자를 초대하세요.');
    await sendPublicKey();
    await connectToUsers(data.existingUsers);
});

socket.on('room-joined', async (data) => {
    if (data.userCount > MAX_USERS) {
        alert(`이 방은 최대 ${MAX_USERS}명까지만 입장할 수 있습니다.`);
        window.location.href = '/';
        return;
    }
    updateConnectionStatus('연결됨', 'status connected');
    updateUserCount(data.userCount);
    showSystemMessage('방에 입장했습니다.');
    await sendPublicKey();
    await connectToUsers(data.existingUsers);
});

socket.on('room-not-found', () => {
    alert('방을 찾을 수 없습니다.');
    window.location.href = '/';
});

socket.on('room-full', (data) => {
    alert(`이 방은 가득 찼습니다. (최대 ${data.maxUsers}명)`);
    window.location.href = '/';
});

socket.on('user-joined', async (data) => {
    if (data.userCount > MAX_USERS) {
        showSystemMessage(`최대 인원(${MAX_USERS}명)을 초과했습니다.`);
        return;
    }
    updateUserCount(data.userCount);
    showSystemMessage('사용자가 입장했습니다.');
    await sendPublicKey(data.userId);
    await createPeerConnection(data.userId, true);
});

socket.on('public-key', async (data) => {
    const peerId = data.from || data.userId;
    try {
        await cryptoUtils.deriveSharedKey(peerId, data.publicKey);
        encryptionReady.set(peerId, true);
        if (!data.from) {
            await sendPublicKey(peerId);
        }
    } catch (error) {
        console.error(`Failed to derive shared key with ${peerId}:`, error);
    }
});

socket.on('user-left', (data) => {
    updateUserCount(data.userCount);
    showSystemMessage('사용자가 나갔습니다.');
    cryptoUtils.removeSharedKey(data.userId);
    encryptionReady.delete(data.userId);
    closePeerConnection(data.userId);
    showSessionExpired();
});

// WebRTC 시그널링
socket.on('offer', async (data) => {
    await createPeerConnection(data.from, false);
    const pc = peers.get(data.from);
    try {
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('answer', { to: data.from, answer });
    } catch (err) {
        console.error('Error handling offer:', err);
    }
});

socket.on('answer', async (data) => {
    const pc = peers.get(data.from);
    if (pc) {
        try {
            await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        } catch (err) {
            console.error('Error handling answer:', err);
        }
    }
});

socket.on('ice-candidate', async (data) => {
    const pc = peers.get(data.from);
    if (pc && data.candidate) {
        try {
            await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (err) {
            console.error('Error adding ICE candidate:', err);
        }
    }
});

socket.on('chat-message', (data) => {
    displayMessage(data.message, false, data.type, data.deleteAfter);
});

// WebRTC 함수
async function createPeerConnection(peerId, isInitiator) {
    if (peers.has(peerId)) return;
    
    const pc = new RTCPeerConnection(configuration);
    peers.set(peerId, pc);
    
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', { to: peerId, candidate: event.candidate });
        }
    };
    
    pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
            updateConnectionStatus('P2P 연결됨', 'status connected');
        } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
            updateConnectionStatus('연결 끊김', 'status disconnected');
        }
    };
    
    if (isInitiator) {
        const dataChannel = pc.createDataChannel('chat');
        setupDataChannel(peerId, dataChannel);
        try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket.emit('offer', { to: peerId, offer });
        } catch (err) {
            console.error(`Error creating offer for ${peerId}:`, err);
        }
    } else {
        pc.ondatachannel = (event) => setupDataChannel(peerId, event.channel);
    }
}

function setupDataChannel(peerId, channel) {
    dataChannels.set(peerId, channel);
    
    channel.onopen = () => {
        updateConnectionStatus('P2P 연결됨', 'status connected');
    };
    
    channel.onclose = () => {
        dataChannels.delete(peerId);
    };
    
    channel.onerror = (error) => {
        console.error(`Data channel error with ${peerId}:`, error);
    };
    
    channel.onmessage = async (event) => {
        try {
            const data = JSON.parse(event.data);
            let message = data.message;
            
            if (data.encrypted && encryptionReady.get(peerId)) {
                try {
                    message = await cryptoUtils.decryptMessage(peerId, data.message);
                } catch (err) {
                    message = '[암호화된 메시지 복호화 실패]';
                }
            }
            displayMessage(message, false, data.type, data.deleteAfter);
        } catch (err) {
            console.error('Error parsing message:', err);
        }
    };
}

function closePeerConnection(peerId) {
    const pc = peers.get(peerId);
    const dc = dataChannels.get(peerId);
    if (dc) dc.close();
    if (pc) pc.close();
    peers.delete(peerId);
    dataChannels.delete(peerId);
}

// 메시지 전송
async function sendMessageData(message, type = 'text') {
    const deleteAfterSeconds = parseInt(deleteTimer.value);
    const sendPromises = [];
    let sentViaP2P = false;
    
    for (const [peerId, channel] of dataChannels.entries()) {
        if (channel.readyState === 'open') {
            sendPromises.push((async () => {
                try {
                    let encryptedMessage = message;
                    let isEncrypted = false;
                    
                    if (encryptionReady.get(peerId)) {
                        try {
                            encryptedMessage = await cryptoUtils.encryptMessage(peerId, message);
                            isEncrypted = true;
                        } catch (err) {
                            console.error(`Failed to encrypt for ${peerId}:`, err);
                        }
                    }
                    
                    channel.send(JSON.stringify({
                        message: encryptedMessage,
                        type,
                        deleteAfter: deleteAfterSeconds,
                        encrypted: isEncrypted
                    }));
                    sentViaP2P = true;
                } catch (err) {
                    console.error(`Failed to send to ${peerId}:`, err);
                }
            })());
        }
    }
    
    await Promise.all(sendPromises);
    
    if (!sentViaP2P && socket.connected) {
        socket.emit('chat-message', { message, type, deleteAfter: deleteAfterSeconds, encrypted: false });
    } else if (!socket.connected) {
        alert('서버 연결이 끊어졌습니다. 페이지를 새로고침해주세요.');
        return;
    }
    
    displayMessage(message, true, type, deleteAfterSeconds);
}

async function sendMessage() {
    const message = messageInput.value.trim();
    if (!message) return;
    
    await sendMessageData(message, 'text');
    messageInput.value = '';
    messageInput.focus({ preventScroll: true });
    setTimeout(() => messageInput.focus({ preventScroll: true }), 0);
}

// 메시지 표시
function displayMessage(message, isMine, type = 'text', deleteAfter = 0) {
    const shouldScroll = isNearBottom() || isMine;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isMine ? 'mine' : 'theirs'}`;
    
    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';
    
    if (type === 'image') {
        const img = document.createElement('img');
        img.src = message;
        img.className = 'message-image';
        img.onclick = () => {
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.95);display:flex;align-items:center;justify-content:center;z-index:9999;cursor:pointer';
            const largeImg = document.createElement('img');
            largeImg.src = message;
            largeImg.style.cssText = 'max-width:95%;max-height:95%;object-fit:contain;border-radius:8px';
            overlay.appendChild(largeImg);
            overlay.onclick = () => overlay.remove();
            document.body.appendChild(overlay);
        };
        messageContent.appendChild(img);
    } else {
        const textDiv = document.createElement('div');
        textDiv.className = 'message-text';
        textDiv.textContent = message;
        messageContent.appendChild(textDiv);
    }
    
    const metaDiv = document.createElement('div');
    metaDiv.className = 'message-meta';
    const timeSpan = document.createElement('span');
    timeSpan.textContent = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    metaDiv.appendChild(timeSpan);
    
    let timerSpan = null;
    if (deleteAfter > 0) {
        timerSpan = document.createElement('span');
        timerSpan.className = 'delete-timer';
        timerSpan.textContent = `🔥 ${deleteAfter}초`;
        metaDiv.appendChild(timerSpan);
    }
    
    messageContent.appendChild(metaDiv);
    messageDiv.appendChild(messageContent);
    messagesContainer.appendChild(messageDiv);
    
    if (shouldScroll) {
        scrollToBottom();
        [50, 150, 300].forEach(delay => setTimeout(scrollToBottom, delay));
    }
    
    if (deleteAfter > 0) {
        let remainingTime = deleteAfter;
        const countdownInterval = setInterval(() => {
            remainingTime--;
            if (remainingTime > 0 && timerSpan) {
                timerSpan.textContent = `🔥 ${remainingTime}초`;
            } else {
                clearInterval(countdownInterval);
            }
        }, 1000);
        
        setTimeout(() => {
            clearInterval(countdownInterval);
            messageDiv.style.opacity = '0';
            messageDiv.style.transform = 'scale(0.8)';
            setTimeout(() => messageDiv.remove(), 500);
        }, deleteAfter * 1000);
    }
}

function showSystemMessage(message) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'system-message';
    messageDiv.textContent = message;
    messagesContainer.appendChild(messageDiv);
    
    if (isNearBottom()) {
        scrollToBottom();
        [50, 150].forEach(delay => setTimeout(scrollToBottom, delay));
    }
}

// 이미지 처리
imageBtn.addEventListener('click', () => imageInput.click());

imageInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
        compressAndSendImage(file);
    }
    imageInput.value = '';
});

function compressAndSendImage(file) {
    const reader = new FileReader();
    reader.onload = async (event) => {
        const img = new Image();
        img.onload = async () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const maxSize = 1200;
            let width = img.width;
            let height = img.height;
            
            if (width > height && width > maxSize) {
                height = (height * maxSize) / width;
                width = maxSize;
            } else if (height > maxSize) {
                width = (width * maxSize) / height;
                height = maxSize;
            }
            
            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);
            const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.7);
            await sendMessageData(compressedDataUrl, 'image');
        };
        img.onerror = () => alert('이미지를 불러올 수 없습니다.');
        img.src = event.target.result;
    };
    reader.onerror = () => alert('파일을 읽을 수 없습니다.');
    reader.readAsDataURL(file);
}

// 이벤트 리스너
sendBtn.addEventListener('click', (e) => {
    e.preventDefault();
    sendMessage();
});

messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        sendMessage();
    }
});

messageInput.addEventListener('focus', () => {
    setTimeout(scrollToBottom, 300);
}, { passive: true });

let resizeTimer;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(scrollToBottom, 100);
});

window.addEventListener('load', () => {
    setTimeout(scrollToBottom, 100);
});

// QR 코드
let serverURL = window.location.origin;
fetch('/api/server-info')
    .then(res => res.json())
    .then(data => {
        const currentOrigin = window.location.origin;
        if (currentOrigin !== 'http://localhost:3000' && !currentOrigin.includes('127.0.0.1') && !currentOrigin.includes('192.168.')) {
            serverURL = currentOrigin;
        } else {
            serverURL = data.url;
        }
    })
    .catch(() => {});

showQRBtn.addEventListener('click', showQRCode);

const generateQRBtn = document.getElementById('generateQRBtn');
if (generateQRBtn) {
    generateQRBtn.addEventListener('click', showQRCode);
}

function showQRCode() {
    const roomURL = `${serverURL}/room.html?room=${roomId}`;
    document.getElementById('roomURL').textContent = roomURL;
    const qrcodeContainer = document.getElementById('qrcode');
    qrcodeContainer.innerHTML = '';
    new QRCode(qrcodeContainer, {
        text: roomURL,
        width: 256,
        height: 256,
        colorDark: "#8b5cf6",
        colorLight: "#ffffff"
    });
    qrModal.style.display = 'flex';
}

document.querySelector('.close-modal').addEventListener('click', () => {
    qrModal.style.display = 'none';
});

qrModal.addEventListener('click', (e) => {
    if (e.target === qrModal) {
        qrModal.style.display = 'none';
    }
});

document.getElementById('copyURLBtn').addEventListener('click', () => {
    navigator.clipboard.writeText(document.getElementById('roomURL').textContent).then(() => {
        alert('URL이 복사되었습니다!');
    });
});

leaveRoomBtn.addEventListener('click', () => {
    if (confirm('방을 나가시겠습니까? 모든 대화 내용이 삭제됩니다.')) {
        socket.emit('leave-room');
        window.location.href = '/';
    }
});

function showSessionExpired() {
    sessionExpired.style.display = 'flex';
    let countdown = 3;
    const countdownElement = document.querySelector('.countdown');
    const interval = setInterval(() => {
        countdown--;
        countdownElement.textContent = `${countdown}초 후 대화창이 닫힙니다...`;
        if (countdown <= 0) {
            clearInterval(interval);
            window.location.href = '/';
        }
    }, 1000);
}

document.getElementById('closeNowBtn').addEventListener('click', () => {
    window.location.href = '/';
});

function cleanup() {
    socket.emit('leave-room');
    peers.forEach(pc => pc.close());
    dataChannels.forEach(dc => dc.close());
    cryptoUtils.clearAllKeys();
    encryptionReady.clear();
}

window.addEventListener('beforeunload', cleanup);
init();
