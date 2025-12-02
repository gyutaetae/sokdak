const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const { SERVER, ROOM } = require('./config/constants');
const { getLocalIPAddress, getAllNonInternalIPv4Addresses } = require('./utils/networkUtils');
const socketHandlers = require('./handlers/socketHandlers');
const roomService = require('./services/roomService');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: SERVER.SOCKET_IO.CORS,
  maxHttpBufferSize: SERVER.SOCKET_IO.MAX_HTTP_BUFFER_SIZE,
  pingTimeout: SERVER.SOCKET_IO.PING_TIMEOUT,
  connectTimeout: SERVER.SOCKET_IO.CONNECT_TIMEOUT,
  upgradeTimeout: SERVER.SOCKET_IO.UPGRADE_TIMEOUT
});

app.use(express.static(path.join(__dirname, 'public')));

const rooms = new Map();

function buildServerURL(host, protocol) {
  return `${protocol}://${host}`;
}

function getServerInfoFromRequest(req) {
  const host = req.get('host') || `${getLocalIPAddress()}:${SERVER.PORT}`;
  const protocol = req.protocol || 'http';
  return {
    ip: getLocalIPAddress(),
    port: SERVER.PORT,
    url: buildServerURL(host, protocol)
  };
}

app.get('/api/server-info', (req, res) => {
  const serverInfo = getServerInfoFromRequest(req);
  res.json(serverInfo);
});

function setupSocketHandlers() {
  io.on('connection', (socket) => {
    console.log(`New connection: ${socket.id}`);
    
    socket.on('create-room', (roomId) => {
      socketHandlers.handleCreateRoom(socket, roomId, rooms);
    });
    
    socket.on('join-room', (roomId) => {
      socketHandlers.handleJoinRoom(socket, roomId, rooms);
    });
    
    socket.on('offer', (data) => {
      socketHandlers.handleWebRTCOffer(socket, data);
    });
    
    socket.on('answer', (data) => {
      socketHandlers.handleWebRTCAnswer(socket, data);
    });
    
    socket.on('ice-candidate', (data) => {
      socketHandlers.handleICECandidate(socket, data);
    });
    
    socket.on('public-key', (data) => {
      socketHandlers.handlePublicKey(socket, data);
    });
    
    socket.on('chat-message', (data) => {
      socketHandlers.handleChatMessage(socket, data, rooms);
    });
    
    socket.on('disconnect', () => {
      socketHandlers.handleUserDisconnect(socket, rooms);
    });
    
    socket.on('leave-room', () => {
      socketHandlers.handleLeaveRoom(socket, rooms);
    });
  });
}

function startRoomCleanupTask() {
  setInterval(() => {
    const currentTime = Date.now();
    
    for (const [roomId, room] of rooms.entries()) {
      if (roomService.isRoomExpired(room, currentTime)) {
        rooms.delete(roomId);
        console.log(`Room ${roomId} cleaned up (timeout)`);
      }
    }
  }, ROOM.CLEANUP_INTERVAL_MS);
}

function logServerStartupInfo() {
  console.log(`Server running on port ${SERVER.PORT}`);
  console.log(`Access at http://localhost:${SERVER.PORT}`);
  
  const mobileAddresses = getAllNonInternalIPv4Addresses();
  
  if (mobileAddresses.length > 0) {
    console.log('\n📱 모바일 접속 주소:');
    mobileAddresses.forEach((address) => {
      console.log(`   http://${address}:${SERVER.PORT}`);
    });
    console.log('');
  }
}

function startServer() {
  server.listen(SERVER.PORT, '0.0.0.0', () => {
    logServerStartupInfo();
  });
}

setupSocketHandlers();
startRoomCleanupTask();
startServer();
