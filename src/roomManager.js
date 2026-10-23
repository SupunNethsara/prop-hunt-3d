const Database = require('./database');

const PROP_TYPES = ['box', 'chair', 'plant', 'barrel', 'trash', 'watermelon', 'tire', 'toilet'];

// Map boundaries & spawn points
const SPAWN_POINTS_PROPS = [
  { x: -10, y: 0.5, z: -10 },
  { x: 10, y: 0.5, z: -10 },
  { x: -15, y: 0.5, z: 12 },
  { x: 12, y: 0.5, z: 15 },
  { x: 0, y: 0.5, z: 5 },
  { x: -5, y: 0.5, z: -15 },
  { x: 18, y: 0.5, z: -5 }
];

const SPAWN_HUNTER_CAGE = { x: 0, y: 15, z: 0 }; // Waiting platform up in the sky/cage
const SPAWN_HUNTER_ARENA = { x: 0, y: 1.0, z: 0 }; // Center of arena

class RoomManager {
  constructor(io) {
    this.io = io;
    this.rooms = new Map();
    this.playerRooms = new Map(); // socketId -> roomId

    // Periodic room tick (timer updates & game loop)
    setInterval(() => {
      this.tick();
    }, 1000);

    // Periodic lobby broadcast
    setInterval(() => {
      this.broadcastLobbyList();
    }, 3000);
  }

  // Create a new room
  createRoom(roomId, roomName, hostSocket, hostUser) {
    roomId = roomId.toUpperCase().trim();
    if (this.rooms.has(roomId)) {
      return { success: false, message: 'Room code already exists.' };
    }

    const room = {
      id: roomId,
      name: roomName || `Room ${roomId}`,
      hostId: hostSocket.id,
      state: 'WAITING', // 'WAITING', 'HIDING', 'HUNTING', 'GAME_OVER'
      timer: 0,
      hidingDuration: 25,
      huntingDuration: 120,
      hunterId: null,
      players: {},
      winner: null,
      rewards: []
    };

    this.rooms.set(roomId, room);
    this.joinRoom(roomId, hostSocket, hostUser);

    return { success: true, room: this.getRoomDetails(room) };
  }

  // Join existing room
  joinRoom(roomId, socket, user) {
    roomId = roomId.toUpperCase().trim();
    const room = this.rooms.get(roomId);
    if (!room) {
      return { success: false, message: 'Room not found.' };
    }

    // Leave any existing room first
    this.leaveRoom(socket);

    const isHost = room.hostId === socket.id || Object.keys(room.players).length === 0;
    if (isHost) room.hostId = socket.id;

    const defaultProp = PROP_TYPES[Math.floor(Math.random() * PROP_TYPES.length)];
    const randomSpawn = SPAWN_POINTS_PROPS[Math.floor(Math.random() * SPAWN_POINTS_PROPS.length)];

    const player = {
      socketId: socket.id,
      username: user?.username || `Guest_${socket.id.substring(0, 4)}`,
      displayName: user?.displayName || user?.username || `Guest_${socket.id.substring(0, 4)}`,
      role: 'prop', // default until game starts
      propType: defaultProp,
      x: randomSpawn.x,
      y: randomSpawn.y,
      z: randomSpawn.z,
      rotY: 0,
      isAlive: true,
      health: 100,
      score: 0,
      isFrozen: false,
      lastTauntTime: 0
    };

    room.players[socket.id] = player;
    this.playerRooms.set(socket.id, roomId);
    socket.join(roomId);

    // Notify room
    this.io.to(roomId).emit('room_update', this.getRoomDetails(room));
    if (room.state === 'HIDING' || room.state === 'HUNTING') {
      socket.to(roomId).emit('player_joined_midgame', player);
    }
    this.broadcastLobbyList();

    return { success: true, room: this.getRoomDetails(room), player };
  }

  // Leave room
  leaveRoom(socket) {
    const roomId = this.playerRooms.get(socket.id);
    if (!roomId) return;

    const room = this.rooms.get(roomId);
    if (room) {
      delete room.players[socket.id];
      socket.leave(roomId);
      this.playerRooms.delete(socket.id);

      // If host left, elect new host
      const playerIds = Object.keys(room.players);
      if (playerIds.length === 0) {
        // Destroy empty room
        this.rooms.delete(roomId);
      } else {
        if (room.hostId === socket.id) {
          room.hostId = playerIds[0];
        }
        // If hunter left during game
        if (room.hunterId === socket.id && (room.state === 'HIDING' || room.state === 'HUNTING')) {
          this.endGame(room, 'props', 'Hunter disconnected! Props win!');
        } else {
          this.io.to(roomId).emit('room_update', this.getRoomDetails(room));
        }
      }
    }

    this.broadcastLobbyList();
  }

  // Start the match
  startGame(socket) {
    const roomId = this.playerRooms.get(socket.id);
    const room = this.rooms.get(roomId);
    if (!room) return { success: false, message: 'Room not found.' };

    if (room.hostId !== socket.id) {
      return { success: false, message: 'Only host can start the match.' };
    }

    const playerIds = Object.keys(room.players);
    if (playerIds.length < 1) {
      return { success: false, message: 'Need at least 1 player to test/play.' };
    }

    // Select Hunter (random or rotate)
    const hunterIndex = Math.floor(Math.random() * playerIds.length);
    const hunterSocketId = playerIds[hunterIndex];
    room.hunterId = hunterSocketId;

    // Reset players
    let spawnIdx = 0;
    playerIds.forEach(id => {
      const p = room.players[id];
      p.isAlive = true;
      p.health = 100;
      p.score = 0;
      p.isFrozen = false;
      p.lastTauntTime = 0;

      if (id === hunterSocketId) {
        p.role = 'hunter';
        p.x = SPAWN_HUNTER_CAGE.x;
        p.y = SPAWN_HUNTER_CAGE.y;
        p.z = SPAWN_HUNTER_CAGE.z;
      } else {
        p.role = 'prop';
        // Random prop or keep chosen
        p.propType = p.propType || PROP_TYPES[Math.floor(Math.random() * PROP_TYPES.length)];
        const sp = SPAWN_POINTS_PROPS[spawnIdx % SPAWN_POINTS_PROPS.length];
        p.x = sp.x + (Math.random() * 2 - 1);
        p.y = sp.y;
        p.z = sp.z + (Math.random() * 2 - 1);
        spawnIdx++;
      }
    });

    // If only 1 player testing alone, allow them to explore as Prop or Hunter
    if (playerIds.length === 1) {
      const p = room.players[playerIds[0]];
      p.role = 'prop';
      room.hunterId = null;
    }

    room.state = 'HIDING';
    room.timer = room.hidingDuration;
    room.winner = null;
    room.rewards = [];

    this.io.to(roomId).emit('game_started', this.getRoomDetails(room));
    return { success: true };
  }

  // Update player transform (position, rotation, isFrozen)
  updateTransform(socket, data) {
    const roomId = this.playerRooms.get(socket.id);
    const room = this.rooms.get(roomId);
    if (!room) return;

    const p = room.players[socket.id];
    if (!p || !p.isAlive) return;

    p.x = data.x;
    p.y = data.y;
    p.z = data.z;
    p.rotY = data.rotY;
    if (typeof data.isFrozen === 'boolean') {
      p.isFrozen = data.isFrozen;
    }

    // Broadcast transform to other players in room
    socket.to(roomId).emit('player_moved', {
      id: socket.id,
      x: p.x,
      y: p.y,
      z: p.z,
      rotY: p.rotY,
      isFrozen: p.isFrozen
    });
  }

  // Change prop model (allowed during HIDING phase)
  changeProp(socket, propType) {
    const roomId = this.playerRooms.get(socket.id);
    const room = this.rooms.get(roomId);
    if (!room || room.state !== 'HIDING' && room.state !== 'WAITING') return;

    const p = room.players[socket.id];
    if (!p || p.role !== 'prop') return;

    if (PROP_TYPES.includes(propType)) {
      p.propType = propType;
      this.io.to(roomId).emit('player_prop_changed', {
        id: socket.id,
        propType
      });
    }
  }

  // Hunter attacks (shoots scanner laser)
  hunterAttack(socket, data) {
    const roomId = this.playerRooms.get(socket.id);
    const room = this.rooms.get(roomId);
    if (!room || room.state !== 'HUNTING') return;

    const hunter = room.players[socket.id];
    if (!hunter || hunter.role !== 'hunter' || !hunter.isAlive) return;

    // data: { hitPlayerId: string|null, origin: {x,y,z}, direction: {x,y,z} }
    this.io.to(roomId).emit('hunter_fired', {
      hunterId: socket.id,
      origin: data.origin,
      direction: data.direction
    });

    if (data.hitPlayerId) {
      const target = room.players[data.hitPlayerId];
      if (target && target.role === 'prop' && target.isAlive) {
        // Successful hit on a disguised player!
        target.health -= 50;
        hunter.score += 100;

        if (target.health <= 0) {
          target.health = 0;
          target.isAlive = false;
          target.role = 'spectator';
          hunter.score += 200;

          this.io.to(roomId).emit('player_eliminated', {
            targetId: target.socketId,
            targetName: target.displayName,
            hunterId: hunter.socketId,
            hunterName: hunter.displayName
          });

          // Check if any props remain
          const livingProps = Object.values(room.players).filter(p => p.role === 'prop' && p.isAlive);
          if (livingProps.length === 0) {
            this.endGame(room, 'hunter', `Hunter ${hunter.displayName} found and eliminated all sneaky props!`);
          }
        } else {
          this.io.to(roomId).emit('player_damaged', {
            targetId: target.socketId,
            health: target.health
          });
        }
      }
    } else if (data.hitStaticProp) {
      // Hunter shot a normal fake inanimate prop! Penalize 5 HP
      hunter.health -= 5;
      this.io.to(roomId).emit('hunter_misfire', {
        hunterId: hunter.socketId,
        health: hunter.health
      });

      if (hunter.health <= 0) {
        hunter.health = 0;
        hunter.isAlive = false;
        this.endGame(room, 'props', 'The Hunter exhausted all scanner energy! Props survive and WIN!');
      }
    }
  }

  // Trigger funny taunt (quack, whistle, horn, fart, laugh)
  triggerTaunt(socket, soundType) {
    const roomId = this.playerRooms.get(socket.id);
    const room = this.rooms.get(roomId);
    if (!room || room.state !== 'HUNTING') return;

    const p = room.players[socket.id];
    if (!p || p.role !== 'prop' || !p.isAlive) return;

    const now = Date.now();
    if (now - p.lastTauntTime < 10000) { // 10s cooldown
      return;
    }

    p.lastTauntTime = now;
    p.score += 50; // reward for bravery

    this.io.to(roomId).emit('taunt_emitted', {
      playerId: socket.id,
      playerName: p.displayName,
      x: p.x,
      y: p.y,
      z: p.z,
      soundType: soundType || 'whistle'
    });
  }

  // Game tick (called every 1s)
  tick() {
    for (const [roomId, room] of this.rooms.entries()) {
      if (room.state === 'HIDING') {
        room.timer--;
        this.io.to(roomId).emit('timer_tick', { timer: room.timer, state: 'HIDING' });

        if (room.timer <= 0) {
          // Transition to HUNTING
          room.state = 'HUNTING';
          room.timer = room.huntingDuration;

          // Release hunter into arena
          if (room.hunterId && room.players[room.hunterId]) {
            const h = room.players[room.hunterId];
            h.x = SPAWN_HUNTER_ARENA.x;
            h.y = SPAWN_HUNTER_ARENA.y;
            h.z = SPAWN_HUNTER_ARENA.z;
          }

          this.io.to(roomId).emit('hunting_phase_started', {
            timer: room.timer,
            hunterSpawn: SPAWN_HUNTER_ARENA
          });
        }
      } else if (room.state === 'HUNTING') {
        room.timer--;
        this.io.to(roomId).emit('timer_tick', { timer: room.timer, state: 'HUNTING' });

        if (room.timer <= 0) {
          // Time up! Props win
          this.endGame(room, 'props', 'Time ran out! Disguised Props survived and WIN!');
        }
      }
    }
  }

  // End game & generate rewards
  endGame(room, winnerSide, message) {
    room.state = 'GAME_OVER';
    room.winner = winnerSide; // 'props' or 'hunter'

    const winners = [];
    const losers = [];

    Object.values(room.players).forEach(p => {
      const won = (winnerSide === 'props' && p.role === 'prop' && p.isAlive) ||
                  (winnerSide === 'hunter' && p.role === 'hunter');

      if (won) {
        winners.push(p);
        Database.recordMatch(p.username, true, p.role, p.role === 'hunter' ? 3 : 0, 2);
      } else {
        losers.push(p);
        Database.recordMatch(p.username, false, p.role, 0, 1);
      }
    });

    // Construct Free API Trophy URL (Pollinations.ai)
    // 100% Free, Instant, No API Key needed!
    const winningPlayer = winners[0] || Object.values(room.players)[0];
    let trophyPrompt = '';
    let trophyTitle = '';

    if (winnerSide === 'hunter') {
      trophyTitle = 'Master Ace Hunter';
      trophyPrompt = encodeURIComponent(
        `Futuristic high-tech secret agent detective holding a neon scanner weapon, golden badge medal, victorious cyberpunk trophy portrait, dark neon lighting, highly detailed 3D digital art, 8k octane render`
      );
    } else {
      const propName = winningPlayer?.propType || 'box';
      trophyTitle = 'Grand Master of Disguise';
      trophyPrompt = encodeURIComponent(
        `Cute hilarious secret agent disguised as a 3D ${propName} wearing tiny sunglasses and mustache, golden trophy stand, epic stealth champion banner, 3d pixar style render, colorful lighting`
      );
    }

    const freeTrophyUrl = `https://image.pollinations.ai/prompt/${trophyPrompt}?width=768&height=768&nologo=true&seed=${Math.floor(Math.random() * 999999)}`;

    const rewardData = {
      title: trophyTitle,
      winnerSide,
      winnerNames: winners.map(w => w.displayName),
      trophyImageUrl: freeTrophyUrl,
      awardedAt: new Date().toISOString()
    };

    // Save reward to winner's profile
    winners.forEach(w => {
      Database.addTrophy(w.username, {
        title: trophyTitle,
        imageUrl: freeTrophyUrl,
        winnerSide,
        matchDate: new Date().toLocaleDateString()
      });
    });

    room.rewards.push(rewardData);

    this.io.to(room.id).emit('game_over', {
      winner: winnerSide,
      message,
      winners: winners.map(w => ({ name: w.displayName, role: w.role, propType: w.propType })),
      reward: rewardData
    });
  }

  // Get active rooms list
  getLobbyList() {
    const list = [];
    for (const [id, room] of this.rooms.entries()) {
      list.push(this.getRoomSummary(room));
    }
    return list;
  }

  getRoomSummary(room) {
    return {
      id: room.id,
      name: room.name,
      playerCount: Object.keys(room.players).length,
      state: room.state,
      hostName: room.players[room.hostId]?.displayName || 'Host'
    };
  }

  getRoomDetails(room) {
    return {
      id: room.id,
      name: room.name,
      hostId: room.hostId,
      state: room.state,
      timer: room.timer,
      hunterId: room.hunterId,
      players: Object.values(room.players).map(p => ({
        id: p.socketId,
        username: p.username,
        displayName: p.displayName,
        role: p.role,
        propType: p.propType,
        isAlive: p.isAlive,
        health: p.health,
        score: p.score,
        isFrozen: p.isFrozen
      }))
    };
  }

  broadcastLobbyList() {
    this.io.emit('lobby_list_update', this.getLobbyList());
  }
}

module.exports = RoomManager;
