// Socket.io Multiplayer Network Bridge
class NetworkClient {
  constructor() {
    this.socket = io();
    this.currentRoom = null;
    this.lastTransformSent = 0;
    this.setupListeners();
  }

  setupListeners() {
    this.socket.on('connect', () => {
      console.log('Connected to server with ID:', this.socket.id);
    });

    // Lobby updates
    this.socket.on('lobby_list_update', (rooms) => {
      window.authUI.renderLobbyList(rooms);
    });

    // Room responses
    this.socket.on('create_room_response', (res) => {
      if (res.success) {
        window.authUI.showRoomScreen(res.room);
        window.showToast(`Room created! Code: ${res.room.id}`, 'success', 'ROOM READY');
      } else {
        window.showToast(res.message, 'error', 'ROOM ERROR');
      }
    });

    this.socket.on('join_room_response', (res) => {
      if (res.success) {
        this.currentRoom = res.room;
        if (res.room.state === 'HIDING' || res.room.state === 'HUNTING') {
          // If match is already in progress, enter game immediately
          window.authUI.launchGameScreen(res.room);
          if (window.game) {
            window.game.setLocalPlayer(res.player);
            (res.room.players || []).forEach(p => {
              if (p.id !== this.socket.id) {
                window.game.updateRemotePlayer(p);
              }
            });
          }
          window.showToast(`Joined ongoing match in Room ${res.room.id}!`, 'success', 'IN-GAME');
        } else {
          window.authUI.showRoomScreen(res.room);
          window.showToast(`Joined Room ${res.room.id}!`, 'success', 'CONNECTED');
        }
      } else {
        window.showToast(res.message, 'warning', 'CANNOT JOIN');
      }
    });

    this.socket.on('room_update', (room) => {
      this.currentRoom = room;
      window.authUI.updateRoomScreen(room);
    });

    // Remote player joined while match is already active
    this.socket.on('player_joined_midgame', (player) => {
      if (window.game) {
        window.game.updateRemotePlayer(player);
        window.showToast(`${player.displayName} joined the match as a Prop!`, 'info');
      }
    });

    // Match Start
    this.socket.on('game_started', (room) => {
      this.currentRoom = room;
      window.authUI.launchGameScreen(room);

      const myData = (room.players || []).find(p => p.id === this.socket.id);
      if (myData && window.game) {
        window.game.setLocalPlayer(myData);
      }

      // Spawn all other multiplayer agents in 3D scene
      if (window.game && room.players) {
        room.players.forEach(p => {
          if (p.id !== this.socket.id) {
            window.game.updateRemotePlayer(p);
          }
        });
      }
    });

    // Hunting Phase Started (Hunter released!)
    this.socket.on('hunting_phase_started', (data) => {
      const banner = document.getElementById('phase-announcement');
      if (banner) {
        banner.innerText = '🚨 HUNTER IS RELEASED! RUN & HIDE! 🚨';
        banner.style.display = 'block';
        setTimeout(() => banner.style.display = 'none', 4000);
      }
    });

    // Timer tick
    this.socket.on('timer_tick', (data) => {
      const timerElem = document.getElementById('hud-timer');
      const phaseElem = document.getElementById('hud-phase');
      if (timerElem) {
        const mins = Math.floor(data.timer / 60);
        const secs = (data.timer % 60).toString().padStart(2, '0');
        timerElem.innerText = `${mins}:${secs}`;
      }
      if (phaseElem) {
        phaseElem.innerText = data.state === 'HIDING' ? 'HIDING PHASE ⏳' : 'HUNTING PHASE 🔍';
      }
    });

    // Player Movement Sync
    this.socket.on('player_moved', (data) => {
      if (window.game) {
        window.game.updateRemotePlayer(data);
      }
    });

    // Prop type changed
    this.socket.on('player_prop_changed', (data) => {
      if (window.game) {
        window.game.updateRemotePlayer(data);
      }
    });

    // Hunter fired laser
    this.socket.on('hunter_fired', (data) => {
      if (window.game && data.hunterId !== this.socket.id) {
        window.game.createLaserBeam(data.origin, data.direction);
        window.soundFX.laser();
      }
    });

    // Damage & misfire
    this.socket.on('player_damaged', (data) => {
      if (data.targetId === this.socket.id && window.game) {
        window.game.localPlayer.health = data.health;
        window.game.updateHUD();
        window.soundFX.hit();
      }
    });

    this.socket.on('hunter_misfire', (data) => {
      if (data.hunterId === this.socket.id && window.game) {
        window.game.localPlayer.health = data.health;
        window.game.updateHUD();
        window.soundFX.misfire();
      }
    });

    // Player eliminated
    this.socket.on('player_eliminated', (data) => {
      window.soundFX.eliminated();
      if (data.targetId === this.socket.id && window.game) {
        window.game.localPlayer.role = 'spectator';
        window.game.updateHUD();
        window.showToast('You were found and eliminated! Spectating remaining props...', 'error', 'ELIMINATED');
      } else {
        window.game.removeRemotePlayer(data.targetId);
      }

      // Kill feed notice
      const feed = document.getElementById('kill-feed');
      if (feed) {
        const msg = document.createElement('div');
        msg.className = 'kill-feed-item';
        msg.innerText = `💥 ${data.hunterName} blasted disguised prop ${data.targetName}!`;
        feed.appendChild(msg);
        setTimeout(() => msg.remove(), 4000);
      }
    });

    // Taunts
    this.socket.on('taunt_emitted', (data) => {
      window.soundFX.taunt(data.soundType);
      if (window.game) {
        window.game.createTauntRipple(data.x, data.y, data.z);
      }

      // Show alert on screen
      const tauntNotice = document.getElementById('taunt-feed');
      if (tauntNotice) {
        tauntNotice.innerText = `📢 ${data.playerName} made a ${data.soundType.toUpperCase()} sound!`;
        tauntNotice.style.display = 'block';
        setTimeout(() => tauntNotice.style.display = 'none', 3000);
      }
    });

    // Chat
    this.socket.on('chat_message', (data) => {
      window.authUI.appendChatMessage(data);
    });

    // Game Over & AI Free Rewards!
    this.socket.on('game_over', (data) => {
      window.soundFX.victoryFanfare();
      window.authUI.showGameOverModal(data);
    });
  }

  // Emitters
  createRoom(roomId, roomName, user) {
    this.socket.emit('create_room', { roomId, roomName, user });
  }

  joinRoom(roomId, user) {
    this.socket.emit('join_room', { roomId, user });
  }

  leaveRoom() {
    this.socket.emit('leave_room');
  }

  startGame() {
    this.socket.emit('start_game');
  }

  emitTransform(data) {
    const now = performance.now();
    if (now - this.lastTransformSent > 45) { // 22 updates/sec
      this.lastTransformSent = now;
      this.socket.emit('update_transform', data);
    }
  }

  changeProp(propType) {
    this.socket.emit('change_prop', propType);
  }

  emitHunterAttack(data) {
    this.socket.emit('hunter_attack', data);
  }

  emitTaunt(soundType) {
    this.socket.emit('trigger_taunt', soundType);
  }

  sendChat(sender, message) {
    this.socket.emit('send_chat', { sender, message });
  }
}

window.network = new NetworkClient();
