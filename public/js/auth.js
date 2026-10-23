// User Auth, Lobby UI, HUD controls, and Free AI Trophy Modal
class AuthUI {
  constructor() {
    this.currentUser = JSON.parse(localStorage.getItem('prophunt_user') || 'null');
    const urlParams = new URLSearchParams(window.location.search);
    this.pendingRoom = urlParams.get('room') ? urlParams.get('room').toUpperCase() : null;
    this.currentRoomId = null;

    this.setupUI();
    this.checkLoginStatus();

    // Auto-refresh rooms in lobby every 3 seconds
    setInterval(() => {
      const lobbyScreen = document.getElementById('lobby-screen');
      if (lobbyScreen && lobbyScreen.classList.contains('active')) {
        this.fetchRoomsList();
      }
    }, 3000);
  }

  setupUI() {
    // Auth tabs
    document.getElementById('btn-tab-login')?.addEventListener('click', () => this.switchAuthTab('login'));
    document.getElementById('btn-tab-register')?.addEventListener('click', () => this.switchAuthTab('register'));

    // Auth forms
    document.getElementById('form-login')?.addEventListener('submit', (e) => this.handleLogin(e));
    document.getElementById('form-register')?.addEventListener('submit', (e) => this.handleRegister(e));
    document.getElementById('btn-guest-play')?.addEventListener('click', () => this.handleGuestPlay());
    document.getElementById('btn-logout')?.addEventListener('click', () => this.handleLogout());

    // Navigation buttons
    document.getElementById('btn-show-vault')?.addEventListener('click', () => this.openVaultModal());
    document.getElementById('btn-show-leaderboard')?.addEventListener('click', () => this.openLeaderboardModal());
    document.getElementById('btn-close-modal')?.addEventListener('click', () => this.closeModals());
    document.getElementById('btn-close-leaderboard')?.addEventListener('click', () => this.closeModals());

    // Room creation & joining
    document.getElementById('btn-create-room')?.addEventListener('click', () => this.handleCreateRoom());
    document.getElementById('btn-join-code')?.addEventListener('click', () => this.handleJoinRoomByCode());
    document.getElementById('btn-start-match')?.addEventListener('click', () => window.network.startGame());
    document.getElementById('btn-leave-room')?.addEventListener('click', () => this.handleLeaveRoom());
    document.getElementById('btn-refresh-rooms')?.addEventListener('click', () => this.fetchRoomsList());

    // Copy Invite Link Button
    document.getElementById('btn-copy-invite')?.addEventListener('click', () => {
      if (this.currentRoomId) {
        const inviteUrl = `${window.location.origin}/?room=${this.currentRoomId}`;
        navigator.clipboard.writeText(inviteUrl).then(() => {
          alert(`📋 Invite link copied!\n\n${inviteUrl}\n\nSend this link to friends on WhatsApp/Discord to join directly!`);
        }).catch(() => {
          prompt('Copy this room invite link:', inviteUrl);
        });
      }
    });

    // Prop selection buttons
    const propButtons = document.querySelectorAll('.prop-selector-btn');
    propButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const type = btn.dataset.prop;
        propButtons.forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        window.network.changeProp(type);
        if (window.game && window.game.localPlayer.role === 'prop') {
          window.game.setLocalPlayer({ propType: type });
        }
      });
    });

    // In-game taunt buttons
    const tauntButtons = document.querySelectorAll('.taunt-btn');
    tauntButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.sound;
        window.network.emitTaunt(type);
      });
    });

    // Chat input
    document.getElementById('chat-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = document.getElementById('chat-input');
      const text = input.value.trim();
      if (text) {
        window.network.sendChat(this.currentUser?.displayName || 'Player', text);
        input.value = '';
      }
    });

    // Modal Close
    document.querySelectorAll('.close-modal-btn').forEach(btn => {
      btn.addEventListener('click', () => this.closeModals());
    });
  }

  switchAuthTab(tab) {
    const loginForm = document.getElementById('form-login');
    const registerForm = document.getElementById('form-register');
    const tabLogin = document.getElementById('btn-tab-login');
    const tabRegister = document.getElementById('btn-tab-register');

    if (tab === 'login') {
      loginForm.style.display = 'flex';
      registerForm.style.display = 'none';
      tabLogin.classList.add('active');
      tabRegister.classList.remove('active');
    } else {
      loginForm.style.display = 'none';
      registerForm.style.display = 'flex';
      tabRegister.classList.add('active');
      tabLogin.classList.remove('active');
    }
  }

  async handleLogin(e) {
    e.preventDefault();
    const u = document.getElementById('login-username').value.trim();
    const p = document.getElementById('login-password').value;

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, password: p })
      });
      const data = await res.json();
      if (data.success) {
        this.currentUser = data.user;
        localStorage.setItem('prophunt_user', JSON.stringify(data.user));
        window.showToast(`Welcome, Agent ${data.user.displayName}!`, 'success', 'ACCESS GRANTED');
        this.checkLoginStatus();
      } else {
        window.showToast(data.message, 'error', 'AUTHENTICATION FAILED');
      }
    } catch (err) {
      window.showToast('Login server error. Please try again.', 'error');
    }
  }

  async handleRegister(e) {
    e.preventDefault();
    const u = document.getElementById('reg-username').value.trim();
    const p = document.getElementById('reg-password').value;

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, password: p })
      });
      const data = await res.json();
      if (data.success) {
        this.currentUser = data.user;
        localStorage.setItem('prophunt_user', JSON.stringify(data.user));
        window.showToast(`Agent profile registered successfully for ${data.user.displayName}!`, 'success', 'ACCOUNT CREATED');
        this.checkLoginStatus();
      } else {
        window.showToast(data.message, 'warning', 'REGISTRATION NOTICE');
      }
    } catch (err) {
      window.showToast('Registration error. Please try again.', 'error');
    }
  }

  handleGuestPlay() {
    const guestId = 'Agent_' + Math.floor(1000 + Math.random() * 9000);
    this.currentUser = {
      username: guestId,
      displayName: guestId,
      stats: { wins: 0, matchesPlayed: 0 },
      trophies: []
    };
    this.checkLoginStatus();
  }

  handleLogout() {
    this.currentUser = null;
    localStorage.removeItem('prophunt_user');
    this.checkLoginStatus();
  }

  checkLoginStatus() {
    const authScreen = document.getElementById('auth-modal');
    const lobbyScreen = document.getElementById('lobby-screen');
    const userBarName = document.getElementById('user-bar-name');

    if (this.currentUser) {
      authScreen.style.display = 'none';
      lobbyScreen.classList.add('active');
      if (userBarName) userBarName.innerText = this.currentUser.displayName || this.currentUser.username;

      // Check if there was an invite link (?room=CODE)
      if (this.pendingRoom) {
        const joinCode = this.pendingRoom;
        this.pendingRoom = null;
        window.network.joinRoom(joinCode, this.currentUser);
      } else {
        // Fetch active rooms immediately
        this.fetchRoomsList();
      }
    } else {
      authScreen.style.display = 'flex';
      lobbyScreen.classList.remove('active');
    }
  }

  // Fetch rooms list from REST API
  async fetchRoomsList() {
    try {
      const res = await fetch('/api/rooms');
      const data = await res.json();
      if (data.success && data.rooms) {
        this.renderLobbyList(data.rooms);
      }
    } catch (e) {
      console.error('Failed to fetch rooms list:', e);
    }
  }

  // Lobby & Rooms
  renderLobbyList(rooms) {
    const container = document.getElementById('lobby-rooms-list');
    if (!container) return;

    if (!rooms || rooms.length === 0) {
      container.innerHTML = '<div class="empty-lobby">No active rooms found. Create one to play with friends!</div>';
      return;
    }

    container.innerHTML = '';
    rooms.forEach(r => {
      const card = document.createElement('div');
      card.className = 'room-card';
      card.innerHTML = `
        <div class="room-info">
          <h4>${r.name}</h4>
          <span class="room-code">Code: ${r.id}</span>
          <span class="room-host">Host: ${r.hostName}</span>
        </div>
        <div class="room-stats">
          <span class="badge-players">${r.playerCount} Players</span>
          <span class="badge-status ${r.state.toLowerCase()}">${r.state}</span>
          <button class="btn-join-room btn-neon" data-id="${r.id}">JOIN</button>
        </div>
      `;

      card.querySelector('.btn-join-room').addEventListener('click', () => {
        window.network.joinRoom(r.id, this.currentUser);
      });

      container.appendChild(card);
    });
  }

  handleCreateRoom() {
    const nameInput = document.getElementById('input-room-name');
    const roomName = nameInput.value.trim() || 'Athal Room';
    const randomCode = 'ATHAL-' + Math.floor(100 + Math.random() * 900);
    window.network.createRoom(randomCode, roomName, this.currentUser);
  }

  handleJoinRoomByCode() {
    const codeInput = document.getElementById('input-join-code');
    const code = codeInput.value.trim().toUpperCase();
    if (code) {
      window.network.joinRoom(code, this.currentUser);
    }
  }

  handleLeaveRoom() {
    this.currentRoomId = null;
    window.network.leaveRoom();
    document.getElementById('room-screen').classList.remove('active');
    document.getElementById('game-screen').classList.remove('active');
    document.getElementById('lobby-screen').classList.add('active');
    this.fetchRoomsList();
  }

  // Room Screen
  showRoomScreen(room) {
    this.currentRoomId = room.id;
    document.getElementById('lobby-screen').classList.remove('active');
    document.getElementById('room-screen').classList.add('active');
    document.getElementById('room-title-code').innerText = room.id;
    this.updateRoomScreen(room);
  }

  updateRoomScreen(room) {
    this.currentRoomId = room.id;
    const playerList = document.getElementById('room-players-list');
    if (!playerList) return;

    playerList.innerHTML = '';
    const players = room.players || [];
    players.forEach(p => {
      const item = document.createElement('div');
      item.className = 'player-item';
      item.innerHTML = `
        <span class="player-name">${p.displayName}</span>
        <span class="player-prop-badge">${p.propType || 'Random'}</span>
        ${p.id === room.hostId ? '<span class="badge-host">👑 HOST</span>' : ''}
      `;
      playerList.appendChild(item);
    });

    const isHost = (window.network.socket.id === room.hostId);
    const startBtn = document.getElementById('btn-start-match');
    if (startBtn) {
      startBtn.style.display = isHost ? 'block' : 'none';
    }
  }

  // Launch into 3D Game Canvas
  launchGameScreen(room) {
    document.getElementById('room-screen').classList.remove('active');
    document.getElementById('game-screen').classList.add('active');

    // Initialize 3D Engine if not already
    if (!window.game) {
      window.game = new window.GameEngine();
    }
  }

  appendChatMessage(data) {
    const box = document.getElementById('chat-messages');
    if (!box) return;

    const row = document.createElement('div');
    row.className = 'chat-row';
    row.innerHTML = `<span class="chat-time">${data.time}</span> <strong>${data.sender}:</strong> <span>${data.message}</span>`;
    box.appendChild(row);
    box.scrollTop = box.scrollHeight;
  }

  // Game Over & Free AI Trophy Modal
  showGameOverModal(data) {
    const modal = document.getElementById('modal-gameover');
    const title = document.getElementById('gameover-winner-title');
    const msg = document.getElementById('gameover-msg');
    const trophyImg = document.getElementById('gameover-trophy-img');
    const trophyLabel = document.getElementById('gameover-trophy-title');

    title.innerText = (data.winner === 'hunter') ? '🏆 THE ACE HUNTER WON! 🏆' : '🏆 SNEAKY PROPS SURVIVED! 🏆';
    title.className = (data.winner === 'hunter') ? 'winner-hunter-text' : 'winner-props-text';
    msg.innerText = data.message;

    if (data.reward) {
      trophyLabel.innerText = `🎁 FREE GIFT REWARD: ${data.reward.title}`;
      trophyImg.src = data.reward.trophyImageUrl;
      trophyImg.style.display = 'block';

      // Setup Download button
      const dlBtn = document.getElementById('btn-download-trophy');
      dlBtn.onclick = () => {
        window.open(data.reward.trophyImageUrl, '_blank');
      };
    }

    modal.style.display = 'flex';
  }

  // Secret Agent Vault (Saved AI Trophies & Stats)
  async openVaultModal() {
    if (!this.currentUser) return;
    const modal = document.getElementById('modal-vault');
    const list = document.getElementById('vault-trophies-list');

    try {
      const res = await fetch(`/api/user/profile?username=${this.currentUser.username}`);
      const data = await res.json();
      if (data.success && data.user) {
        document.getElementById('vault-wins').innerText = data.user.stats.wins || 0;
        document.getElementById('vault-matches').innerText = data.user.stats.matchesPlayed || 0;
        document.getElementById('vault-kills').innerText = data.user.stats.hunterKills || 0;

        const trophies = data.user.trophies || [];
        if (trophies.length === 0) {
          list.innerHTML = '<div class="empty-notice">No AI Trophies earned yet! Win matches as Hunter or Prop to unlock AI Art gifts!</div>';
        } else {
          list.innerHTML = '';
          trophies.forEach(t => {
            const card = document.createElement('div');
            card.className = 'trophy-card';
            card.innerHTML = `
              <img src="${t.imageUrl}" alt="${t.title}" />
              <h4>${t.title}</h4>
              <span>Unlocked: ${t.matchDate || 'Recent'}</span>
              <button class="btn-neon-small" onclick="window.open('${t.imageUrl}', '_blank')">Download HD</button>
            `;
            list.appendChild(card);
          });
        }
      }
    } catch (e) {
      console.error(e);
    }

    modal.style.display = 'flex';
  }

  // Leaderboard Modal
  async openLeaderboardModal() {
    const modal = document.getElementById('modal-leaderboard');
    const body = document.getElementById('leaderboard-body');

    try {
      const res = await fetch('/api/leaderboard');
      const data = await res.json();
      if (data.success && data.leaderboard) {
        body.innerHTML = '';
        data.leaderboard.forEach((p, idx) => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>#${idx + 1}</td>
            <td><strong>${p.displayName}</strong></td>
            <td>${p.wins}</td>
            <td>${p.trophiesCount} 🎁</td>
          `;
          body.appendChild(tr);
        });
      }
    } catch (e) {
      console.error(e);
    }

    modal.style.display = 'flex';
  }

  closeModals() {
    document.querySelectorAll('.app-modal').forEach(m => m.style.display = 'none');
  }
}

window.authUI = new AuthUI();
