const roomService = require('../services/roomService');
const { ROOM, MESSAGE } = require('../config/constants');

function handleCreateRoom(socket, roomId, rooms) {
  const isNewRoom = roomService.createRoomIfNotExists(rooms, roomId);
  
  if (isNewRoom) {
    console.log(`Room created: ${roomId}`);
  }
  
  const room = rooms.get(roomId);
  
  if (roomService.isRoomFull(room)) {
    socket.emit('room-full', { maxUsers: ROOM.MAX_USERS_PER_ROOM });
    console.log(`Room ${roomId} is full. Rejected user ${socket.id}`);
    return;
  }
  
  joinRoom(socket, roomId, room);
  
  const existingUsers = roomService.getExistingUsersInRoom(room, socket.id);
  
  socket.emit('room-created', {
    roomId,
    existingUsers,
    userCount: room.users.size
  });
  
  notifyOtherUsersInRoom(socket, roomId, room.users.size);
  
  console.log(`User ${socket.id} created/joined room ${roomId}. Total users: ${room.users.size}`);
}

function handleJoinRoom(socket, roomId, rooms) {
  if (!rooms.has(roomId)) {
    socket.emit('room-not-found');
    return;
  }
  
  const room = rooms.get(roomId);
  
  if (roomService.isRoomFull(room)) {
    socket.emit('room-full', { maxUsers: ROOM.MAX_USERS_PER_ROOM });
    console.log(`Room ${roomId} is full. Rejected user ${socket.id}`);
    return;
  }
  
  joinRoom(socket, roomId, room);
  
  const userCount = room.users.size;
  const existingUsers = roomService.getExistingUsersInRoom(room, socket.id);
  
  socket.emit('room-joined', {
    roomId,
    userCount,
    existingUsers
  });
  
  notifyOtherUsersInRoom(socket, roomId, userCount);
  
  console.log(`User ${socket.id} joined room ${roomId}. Total users: ${userCount}`);
}

function joinRoom(socket, roomId, room) {
  socket.join(roomId);
  roomService.addUserToRoom(room, socket.id);
  socket.roomId = roomId;
}

function notifyOtherUsersInRoom(socket, roomId, userCount) {
  socket.to(roomId).emit('user-joined', {
    userId: socket.id,
    userCount
  });
}

function handleWebRTCOffer(socket, data) {
  socket.to(data.to).emit('offer', {
    offer: data.offer,
    from: socket.id
  });
  console.log(`Offer sent from ${socket.id} to ${data.to}`);
}

function handleWebRTCAnswer(socket, data) {
  socket.to(data.to).emit('answer', {
    answer: data.answer,
    from: socket.id
  });
  console.log(`Answer sent from ${socket.id} to ${data.to}`);
}

function handleICECandidate(socket, data) {
  socket.to(data.to).emit('ice-candidate', {
    candidate: data.candidate,
    from: socket.id
  });
}

function handlePublicKey(socket, data) {
  // 공개 키를 다른 사용자에게 전달 (키 교환)
  if (data.to) {
    // 특정 사용자에게 전달
    socket.to(data.to).emit('public-key', {
      publicKey: data.publicKey,
      from: socket.id,
      userId: socket.id
    });
    console.log(`Public key forwarded from ${socket.id} to ${data.to}`);
  } else {
    // 방의 모든 사용자에게 브로드캐스트
    if (socket.roomId) {
      socket.to(socket.roomId).emit('public-key', {
        publicKey: data.publicKey,
        from: socket.id,
        userId: socket.id
      });
      console.log(`Public key broadcasted from ${socket.id} to room ${socket.roomId}`);
    }
  }
}

function handleChatMessage(socket, data, rooms) {
  if (!socket.roomId) {
    return;
  }
  
  socket.to(socket.roomId).emit('chat-message', {
    message: data.message,
    from: socket.id,
    timestamp: Date.now(),
    type: data.type || MESSAGE.DEFAULT_TYPE,
    deleteAfter: data.deleteAfter
  });
  
  console.log(`Message relayed in room ${socket.roomId}, will not be stored`);
}

function handleUserDisconnect(socket, rooms) {
  console.log(`User disconnected: ${socket.id}`);
  
  if (!socket.roomId || !rooms.has(socket.roomId)) {
    return;
  }
  
  const room = rooms.get(socket.roomId);
  roomService.removeUserFromRoom(room, socket.id);
  
  socket.to(socket.roomId).emit('user-left', {
    userId: socket.id,
    userCount: room.users.size
  });
  
  if (roomService.shouldDeleteRoom(room)) {
    rooms.delete(socket.roomId);
    console.log(`Room ${socket.roomId} deleted (session expired)`);
  }
}

function handleLeaveRoom(socket, rooms) {
  if (!socket.roomId || !rooms.has(socket.roomId)) {
    return;
  }
  
  const room = rooms.get(socket.roomId);
  roomService.removeUserFromRoom(room, socket.id);
  
  socket.to(socket.roomId).emit('user-left', {
    userId: socket.id,
    userCount: room.users.size
  });
  
  socket.leave(socket.roomId);
  
  if (roomService.shouldDeleteRoom(room)) {
    rooms.delete(socket.roomId);
    console.log(`Room ${socket.roomId} deleted (session expired)`);
  }
  
  socket.roomId = null;
}

module.exports = {
  handleCreateRoom,
  handleJoinRoom,
  handleWebRTCOffer,
  handleWebRTCAnswer,
  handleICECandidate,
  handlePublicKey,
  handleChatMessage,
  handleUserDisconnect,
  handleLeaveRoom
};


