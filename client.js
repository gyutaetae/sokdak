// WebRTC + Socket.io 클라이언트 로직
const socket = io();

// URL 파라미터에서 방 정보 가져오기
const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get('room');
const isCreator = urlParams.get('create') === 'true';

if (!roomId) {
    window.location.href = '/';
}

// DOM 요소
const messagesContainer = document.getElementById('messagesContainer');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const roomNameEl = document.getElementById('roomName');
const connectionStatusEl = document.getElementById('connectionStatus');
const userCountEl = document.getElementById('userCount');
const deleteTimerSelect = document.getElementById('deleteTimer');
const imageInput = document.getElementById('imageInput');
const imageBtn = document.getElementById('imageBtn');
const showQRBtn = document.getElementById('showQRBtn');
const leaveRoomBtn = document.getElementById('leaveRoomBtn');
const qrModal = document.getElementById('qrModal');
const sessionExpiredOverlay = document.getElementById('sessionExpired');
const closeNowBtn = document.getElementById('closeNowBtn');

// 상태 변수
let peerConnections = new Map(); // userId -> RTCPeerConnection
let dataChannels = new Map(); // userId -> RTCDataChannel
let isP2PConnected = false;
let connectedUsers = new Set();

// WebRTC 설정
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
    ]
};

// 초기화
roomNameEl.textContent = roomId;

// 방 생성 또는 입장
if (isCreator) {
    socket.emit('create-room', roomId);
} else {
    socket.emit('join-room', roomId);
}

// Socket.io 이벤트 핸들러

socket.on('room-created', (data) => {
    console.log('Room created:', data.roomId);
    updateConnectionStatus('대기 중...', 'connecting');
    addSystemMessage('방이 생성되었습니다. 다른 사람을 초대하세요.');
});

socket.on('room-joined', (data) => {
    console.log('Room joined:', data.roomId);
    updateConnectionStatus('연결됨', 'connected');
    userCountEl.textContent = `👥 ${data.userCount}`;
    addSystemMessage('방에 입장했습니다.');
});

socket.on('room-not-found', () => {
    alert('존재하지 않는 방입니다.');
    window.location.href = '/';
});

socket.on('user-joined', async (data) => {
    console.log('User joined:', data.userId);
    connectedUsers.add(data.userId);
    userCountEl.textContent = `👥 ${data.userCount}`;
    addSystemMessage('사용자가 입장했습니다.');
    
    // WebRTC 연결 시작 (offer 생성)
    await createPeerConnection(data.userId, true);
});

socket.on('user-left', (data) => {
    console.log('User left:', data.userId);
    connectedUsers.delete(data.userId);
    userCountEl.textContent = `👥 ${data.userCount}`;
    addSystemMessage('사용자가 나갔습니다.');
    
    // 연결 정리
    closePeerConnection(data.userId);
    
    // 세션 종료 처리
    if (data.userCount === 0 || connectedUsers.size === 0) {
        showSessionExpired();
    }
});

// WebRTC 시그널링

socket.on('offer', async (data) => {
    console.log('Received offer from:', data.from);
    await createPeerConnection(data.from, false);
    
    const pc = peerConnections.get(data.from);
    await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
    
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    
    socket.emit('answer', {
        answer: answer,
        to: data.from
    });
});

socket.on('answer', async (data) => {
    console.log('Received answer from:', data.from);
    const pc = peerConnections.get(data.from);
    if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
    }
});

socket.on('ice-candidate', async (data) => {
    console.log('Received ICE candidate from:', data.from);
    const pc = peerConnections.get(data.from);
    if (pc && data.candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
});

// 백업: Socket.io를 통한 메시지 수신 (P2P 실패 시)
socket.on('chat-message', (data) => {
    if (!isP2PConnected) {
        displayMessage(data.message, data.type || 'text', false, data.timestamp, data.deleteAfter);
    }
});

// WebRTC 함수

async function createPeerConnection(userId, isInitiator) {
    const pc = new RTCPeerConnection(configuration);
    peerConnections.set(userId, pc);
    
    // ICE candidate 이벤트
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', {
                candidate: event.candidate,
                to: userId
            });
        }
    };
    
    // 연결 상태 변화
    pc.onconnectionstatechange = () => {
        console.log(`Connection state with ${userId}:`, pc.connectionState);
        
        if (pc.connectionState === 'connected') {
            updateConnectionStatus('P2P 연결됨', 'connected');
            isP2PConnected = true;
        } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
            updateConnectionStatus('연결 끊김', 'connecting');
            isP2PConnected = false;
        }
    };
    
    // Data Channel 설정
    if (isInitiator) {
        const dataChannel = pc.createDataChannel('chat');
        setupDataChannel(dataChannel, userId);
        
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        
        socket.emit('offer', {
            offer: offer,
            to: userId
        });
    } else {
        pc.ondatachannel = (event) => {
            setupDataChannel(event.channel, userId);
        };
    }
}

function setupDataChannel(channel, userId) {
    dataChannels.set(userId, channel);
    
    channel.onopen = () => {
        console.log('Data channel opened with', userId);
        isP2PConnected = true;
        updateConnectionStatus('P2P 연결됨', 'connected');
    };
    
    channel.onclose = () => {
        console.log('Data channel closed with', userId);
        dataChannels.delete(userId);
        if (dataChannels.size === 0) {
            isP2PConnected = false;
            updateConnectionStatus('연결 끊김', 'connecting');
        }
    };
    
    channel.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            displayMessage(data.message, data.type, false, data.timestamp, data.deleteAfter);
        } catch (e) {
            console.error('Failed to parse message:', e);
        }
    };
}

function closePeerConnection(userId) {
    const pc = peerConnections.get(userId);
    if (pc) {
        pc.close();
        peerConnections.delete(userId);
    }
    
    const dc = dataChannels.get(userId);
    if (dc) {
        dc.close();
        dataChannels.delete(userId);
    }
    
    if (dataChannels.size === 0) {
        isP2PConnected = false;
    }
}

// 메시지 전송

function sendMessage() {
    const message = messageInput.value.trim();
    if (!message) return;
    
    const deleteAfter = parseInt(deleteTimerSelect.value);
    const timestamp = Date.now();
    
    const data = {
        message: message,
        type: 'text',
        timestamp: timestamp,
        deleteAfter: deleteAfter
    };
    
    // P2P로 전송
    let sentViaP2P = false;
    dataChannels.forEach((channel) => {
        if (channel.readyState === 'open') {
            channel.send(JSON.stringify(data));
            sentViaP2P = true;
        }
    });
    
    // P2P 실패 시 Socket.io로 백업 전송
    if (!sentViaP2P) {
        socket.emit('chat-message', data);
    }
    
    // 본인 화면에 표시
    displayMessage(message, 'text', true, timestamp, deleteAfter);
    
    messageInput.value = '';
}

sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

// 이미지 전송

imageBtn.addEventListener('click', () => {
    imageInput.click();
});

imageInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
        alert('이미지 파일만 전송할 수 있습니다.');
        return;
    }
    
    // 파일 크기 제한 (5MB)
    if (file.size > 5 * 1024 * 1024) {
        alert('이미지 크기는 5MB 이하여야 합니다.');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = async (event) => {
        const imageData = event.target.result;
        const deleteAfter = parseInt(deleteTimerSelect.value);
        const timestamp = Date.now();
        
        const data = {
            message: imageData,
            type: 'image',
            timestamp: timestamp,
            deleteAfter: deleteAfter
        };
        
        // P2P로 전송
        let sentViaP2P = false;
        dataChannels.forEach((channel) => {
            if (channel.readyState === 'open') {
                channel.send(JSON.stringify(data));
                sentViaP2P = true;
            }
        });
        
        // P2P 실패 시 Socket.io로 백업 전송
        if (!sentViaP2P) {
            socket.emit('chat-message', data);
        }
        
        // 본인 화면에 표시
        displayMessage(imageData, 'image', true, timestamp, deleteAfter);
    };
    
    reader.readAsDataURL(file);
    imageInput.value = '';
});

// 메시지 표시

function displayMessage(content, type, isOwn, timestamp, deleteAfter) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isOwn ? 'own' : ''}`;
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    
    if (type === 'text') {
        const textDiv = document.createElement('div');
        textDiv.className = 'message-text';
        textDiv.textContent = content;
        contentDiv.appendChild(textDiv);
    } else if (type === 'image') {
        const img = document.createElement('img');
        img.className = 'message-image';
        img.src = content;
        img.alt = 'Image';
        img.onclick = () => window.open(content, '_blank');
        contentDiv.appendChild(img);
    }
    
    const metaDiv = document.createElement('div');
    metaDiv.className = 'message-meta';
    
    const timeSpan = document.createElement('span');
    timeSpan.textContent = new Date(timestamp).toLocaleTimeString('ko-KR', {
        hour: '2-digit',
        minute: '2-digit'
    });
    metaDiv.appendChild(timeSpan);
    
    if (deleteAfter > 0) {
        const timerSpan = document.createElement('span');
        timerSpan.className = 'delete-timer';
        timerSpan.textContent = `🔥 ${deleteAfter}초`;
        metaDiv.appendChild(timerSpan);
        
        // 자동 삭제 타이머
        let remainingTime = deleteAfter;
        const timerInterval = setInterval(() => {
            remainingTime--;
            timerSpan.textContent = `🔥 ${remainingTime}초`;
            
            if (remainingTime <= 0) {
                clearInterval(timerInterval);
                messageDiv.style.animation = 'fadeOut 0.5s ease-out';
                setTimeout(() => {
                    messageDiv.remove();
                }, 500);
            }
        }, 1000);
    }
    
    contentDiv.appendChild(metaDiv);
    messageDiv.appendChild(contentDiv);
    
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function addSystemMessage(text) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'system-message';
    messageDiv.textContent = text;
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function updateConnectionStatus(text, status) {
    connectionStatusEl.textContent = text;
    connectionStatusEl.className = `status ${status}`;
}

// QR 코드 생성

showQRBtn.addEventListener('click', () => {
    qrModal.style.display = 'flex';
    
    // localhost를 실제 IP로 변경하여 모바일에서 접속 가능하게 함
    let roomURL = `${window.location.origin}/room.html?room=${roomId}`;
    
    // localhost인 경우 실제 네트워크 IP로 교체 (서버에서 제공받아야 하지만, 클라이언트에서는 현재 호스트 사용)
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        // localhost로 접속한 경우, 사용자에게 IP 주소 입력 요청
        const message = 'localhost로 접속하셨습니다.\n모바일에서 접속하려면 컴퓨터의 IP 주소를 입력하세요.\n\n예: 192.168.0.100 또는 117.16.154.65';
        const ipAddress = prompt(message);
        if (ipAddress) {
            roomURL = `http://${ipAddress}:${window.location.port || '3000'}/room.html?room=${roomId}`;
        }
    }
    
    document.getElementById('roomURL').textContent = roomURL;
    
    // QR 코드 생성
    const qrcodeContainer = document.getElementById('qrcode');
    qrcodeContainer.innerHTML = '';
    
    new QRCode(qrcodeContainer, {
        text: roomURL,
        width: 200,
        height: 200,
        colorDark: '#000000',
        colorLight: '#ffffff',
    });
});

document.querySelector('.close-modal').addEventListener('click', () => {
    qrModal.style.display = 'none';
});

document.getElementById('copyURLBtn').addEventListener('click', () => {
    let roomURL = `${window.location.origin}/room.html?room=${roomId}`;
    
    // localhost인 경우 실제 IP로 교체
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        const message = 'localhost로 접속하셨습니다.\n모바일에서 접속하려면 컴퓨터의 IP 주소를 입력하세요.\n\n예: 192.168.0.100 또는 117.16.154.65';
        const ipAddress = prompt(message);
        if (ipAddress) {
            roomURL = `http://${ipAddress}:${window.location.port || '3000'}/room.html?room=${roomId}`;
        }
    }
    
    navigator.clipboard.writeText(roomURL).then(() => {
        alert('URL이 복사되었습니다!');
    });
});

// 방 나가기

leaveRoomBtn.addEventListener('click', () => {
    if (confirm('채팅방을 나가시겠습니까? 모든 대화 내용이 삭제됩니다.')) {
        leaveRoom();
    }
});

function leaveRoom() {
    socket.emit('leave-room');
    
    // 모든 연결 정리
    peerConnections.forEach((pc, userId) => {
        closePeerConnection(userId);
    });
    
    window.location.href = '/';
}

// 세션 종료 처리

function showSessionExpired() {
    sessionExpiredOverlay.style.display = 'flex';
    
    let countdown = 3;
    const countdownEl = sessionExpiredOverlay.querySelector('.countdown');
    
    const countdownInterval = setInterval(() => {
        countdown--;
        countdownEl.textContent = `${countdown}초 후 대화창이 닫힙니다...`;
        
        if (countdown <= 0) {
            clearInterval(countdownInterval);
            window.location.href = '/';
        }
    }, 1000);
}

closeNowBtn.addEventListener('click', () => {
    window.location.href = '/';
});

// 페이지 나갈 때 정리
window.addEventListener('beforeunload', () => {
    socket.emit('leave-room');
});

// CSS 애니메이션 추가
const style = document.createElement('style');
style.textContent = `
    @keyframes fadeOut {
        from {
            opacity: 1;
            transform: scale(1);
        }
        to {
            opacity: 0;
            transform: scale(0.8);
        }
    }
`;
document.head.appendChild(style);



