const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  maxHttpBufferSize: 50e6, // 50MB
  pingTimeout: 120000,
  connectTimeout: 120000,
  upgradeTimeout: 120000
});

const PORT = process.env.PORT || 3000;
const MAX_USERS_PER_ROOM = 3;
const ROOM_TIMEOUT = 24 * 60 * 60 * 1000; // 24시간
const CLEANUP_INTERVAL = 60 * 60 * 1000; // 1시간
const os = require('os');

app.use(express.static(path.join(__dirname, 'public')));

const rooms = new Map();

// 로컬 네트워크 IP 가져오기
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// IP 정보 제공 API
app.get('/api/server-info', (req, res) => {
  res.json({
    ip: getLocalIP(),
    port: PORT,
    url: `http://${getLocalIP()}:${PORT}`
  });
});

io.on('connection', (socket) => {
  console.log(`New connection: ${socket.id}`);

  // 방 생성
  socket.on('create-room', (roomId) => {
    if (!rooms.has(roomId)) {
      rooms.set(roomId, {
        users: new Set(),
        createdAt: Date.now()
      });
      console.log(`Room created: ${roomId}`);
    }
    
    const room = rooms.get(roomId);
    
    // 최대 인원 체크
    if (room.users.size >= MAX_USERS_PER_ROOM) {
      socket.emit('room-full', { maxUsers: MAX_USERS_PER_ROOM });
      console.log(`Room ${roomId} is full. Rejected user ${socket.id}`);
      return;
    }
    
    socket.join(roomId);
    room.users.add(socket.id);
    socket.roomId = roomId;
    
    socket.emit('room-created', { roomId });
    
    // 방의 다른 사용자들에게 알림
    socket.to(roomId).emit('user-joined', {
      userId: socket.id,
      userCount: room.users.size
    });
    
    console.log(`User ${socket.id} created/joined room ${roomId}. Total users: ${room.users.size}`);
  });

  // 방 입장
  socket.on('join-room', (roomId) => {
    if (!rooms.has(roomId)) {
      socket.emit('room-not-found');
      return;
    }

    const room = rooms.get(roomId);
    
    // 최대 인원 체크
    if (room.users.size >= MAX_USERS_PER_ROOM) {
      socket.emit('room-full', { maxUsers: MAX_USERS_PER_ROOM });
      console.log(`Room ${roomId} is full. Rejected user ${socket.id}`);
      return;
    }

    socket.join(roomId);
    room.users.add(socket.id);
    socket.roomId = roomId;
    
    const userCount = room.users.size;
    
    socket.emit('room-joined', { roomId, userCount });
    
    // 방의 다른 사용자들에게 알림
    socket.to(roomId).emit('user-joined', {
      userId: socket.id,
      userCount: userCount
    });
    
    console.log(`User ${socket.id} joined room ${roomId}. Total users: ${userCount}`);
  });

  // WebRTC 시그널링: offer
  socket.on('offer', (data) => {
    socket.to(data.to).emit('offer', {
      offer: data.offer,
      from: socket.id
    });
    console.log(`Offer sent from ${socket.id} to ${data.to}`);
  });

  // WebRTC 시그널링: answer
  socket.on('answer', (data) => {
    socket.to(data.to).emit('answer', {
      answer: data.answer,
      from: socket.id
    });
    console.log(`Answer sent from ${socket.id} to ${data.to}`);
  });

  // WebRTC 시그널링: ICE candidate
  socket.on('ice-candidate', (data) => {
    socket.to(data.to).emit('ice-candidate', {
      candidate: data.candidate,
      from: socket.id
    });
  });

  // 채팅 메시지 중계 (P2P 연결 실패 시 백업)
  socket.on('chat-message', (data) => {
    if (socket.roomId) {
      // 메시지를 중계하고 즉시 메모리에서 사라짐 (저장하지 않음)
      socket.to(socket.roomId).emit('chat-message', {
        message: data.message,
        from: socket.id,
        timestamp: Date.now(),
        type: data.type || 'text',
        deleteAfter: data.deleteAfter
      });
      console.log(`Message relayed in room ${socket.roomId}, will not be stored`);
    }
  });

  // 연결 해제
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    
    if (socket.roomId && rooms.has(socket.roomId)) {
      const room = rooms.get(socket.roomId);
      room.users.delete(socket.id);
      
      // 방의 다른 사용자들에게 알림
      socket.to(socket.roomId).emit('user-left', {
        userId: socket.id,
        userCount: room.users.size
      });
      
      // 방이 비었으면 삭제 (세션 소멸)
      if (room.users.size === 0) {
        rooms.delete(socket.roomId);
        console.log(`Room ${socket.roomId} deleted (session expired)`);
      }
    }
  });

  // 명시적 방 나가기
  socket.on('leave-room', () => {
    if (socket.roomId && rooms.has(socket.roomId)) {
      const room = rooms.get(socket.roomId);
      room.users.delete(socket.id);
      
      socket.to(socket.roomId).emit('user-left', {
        userId: socket.id,
        userCount: room.users.size
      });
      
      socket.leave(socket.roomId);
      
      if (room.users.size === 0) {
        rooms.delete(socket.roomId);
        console.log(`Room ${socket.roomId} deleted (session expired)`);
      }
      
      socket.roomId = null;
    }
  });
});

setInterval(() => {
  const now = Date.now();
  
  for (const [roomId, room] of rooms.entries()) {
    if (room.users.size === 0 && (now - room.createdAt) > ROOM_TIMEOUT) {
      rooms.delete(roomId);
      console.log(`Room ${roomId} cleaned up (timeout)`);
    }
  }
}, CLEANUP_INTERVAL);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Access at http://localhost:${PORT}`);
  
  const networkInterfaces = os.networkInterfaces();
  console.log('\n📱 모바일 접속 주소:');
  
  Object.keys(networkInterfaces).forEach((interfaceName) => {
    networkInterfaces[interfaceName].forEach((iface) => {
      if (iface.family === 'IPv4' && !iface.internal) {
        console.log(`   http://${iface.address}:${PORT}`);
      }
    });
  });
  console.log('');
});