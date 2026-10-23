const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');

const Database = require('./src/database');
const RoomManager = require('./src/roomManager');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Room manager instance
const roomManager = new RoomManager(io);

// === AUTH & USER REST APIS ===

// Register
app.post('/api/auth/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username and password required.' });
  }
  const result = Database.register(username, password);
  res.json(result);
});

// Login
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username and password required.' });
  }
  const result = Database.login(username, password);
  res.json(result);
});

// Profile & Vault (Trophies/Badges)
app.get('/api/user/profile', (req, res) => {
  const username = req.query.username;
  if (!username) {
    return res.status(400).json({ success: false, message: 'Username query param required.' });
  }
  const user = Database.getUser(username);
  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found.' });
  }
  res.json({ success: true, user });
});

// Leaderboard
app.get('/api/leaderboard', (req, res) => {
  const list = Database.getLeaderboard();
  res.json({ success: true, leaderboard: list });
});

// Dynamic AI Gift Badge generator URL
app.get('/api/rewards/generate-avatar', (req, res) => {
  const name = req.query.name || 'Agent';
  const role = req.query.role || 'Prop';
  const prop = req.query.prop || 'box';

  let prompt = '';
  if (role.toLowerCase() === 'hunter') {
    prompt = `Epic futuristic neon cyber detective agent avatar, badge with text '${name}', highly detailed 3D octane render 8k`;
  } else {
    prompt = `Hilarious cartoon 3D ${prop} wearing secret agent sunglasses and fedora hat, winner badge with text '${name}', cute 3D pixar style render`;
  }

  const encoded = encodeURIComponent(prompt);
  const imageUrl = `https://image.pollinations.ai/prompt/${encoded}?width=512&height=512&nologo=true&seed=${Math.floor(Math.random() * 999999)}`;
  res.json({ success: true, imageUrl });
});

// Active Lobby Rooms
app.get('/api/rooms', (req, res) => {
  res.json({ success: true, rooms: roomManager.getLobbyList() });
});

// === REAL-TIME SOCKET.IO MULTIPLAYER ===

io.on('connection', (socket) => {
  console.log(`[Socket Connected] ID: ${socket.id}`);

  // Send current rooms list immediately
  socket.emit('lobby_list_update', roomManager.getLobbyList());

  // Create room
  socket.on('create_room', (data) => {
    const { roomId, roomName, user } = data;
    const res = roomManager.createRoom(roomId, roomName, socket, user);
    socket.emit('create_room_response', res);
  });

  // Join room
  socket.on('join_room', (data) => {
    const { roomId, user } = data;
    const res = roomManager.joinRoom(roomId, socket, user);
    socket.emit('join_room_response', res);
  });

  // Leave room
  socket.on('leave_room', () => {
    roomManager.leaveRoom(socket);
    socket.emit('left_room');
  });

  // Start game (host only)
  socket.on('start_game', () => {
    const res = roomManager.startGame(socket);
    if (!res.success) {
      socket.emit('error_message', res.message);
    }
  });

  // Update transform (WASD, mouse look, position sync)
  socket.on('update_transform', (data) => {
    roomManager.updateTransform(socket, data);
  });

  // Change prop model
  socket.on('change_prop', (propType) => {
    roomManager.changeProp(socket, propType);
  });

  // Hunter fired blaster
  socket.on('hunter_attack', (data) => {
    roomManager.hunterAttack(socket, data);
  });

  // Prop player taunted (funny sound)
  socket.on('trigger_taunt', (soundType) => {
    roomManager.triggerTaunt(socket, soundType);
  });

  // In-game Chat message
  socket.on('send_chat', (data) => {
    const roomId = roomManager.playerRooms.get(socket.id);
    if (!roomId) return;
    io.to(roomId).emit('chat_message', {
      sender: data.sender || 'Player',
      message: data.message,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
  });

  // Disconnection
  socket.on('disconnect', () => {
    console.log(`[Socket Disconnected] ID: ${socket.id}`);
    roomManager.leaveRoom(socket);
  });
});

server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🎮 3D PROP HUNT MULTIPLAYER SERVER STARTED!`);
  console.log(`🚀 URL: http://localhost:${PORT}`);
  console.log(`======================================================\n`);
});
