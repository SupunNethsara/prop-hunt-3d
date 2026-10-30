// WebRTC Live Peer-to-Peer Voice Chat Manager (Discord Style)
class VoiceChatManager {
  constructor() {
    this.localStream = null;
    this.isMuted = true; // Starts muted for privacy until user clicks Mic
    this.isDeafened = false;
    this.hasPermission = false;
    this.peers = new Map(); // socketId -> { pc, audio, displayName, isSpeaking, isMuted }
    this.currentRoom = null;

    // Voice Activity Detection (VAD)
    this.audioContext = null;
    this.analyser = null;
    this.vadInterval = null;
    this.isSpeakingLocally = false;
    this.speakingTimeout = null;

    // STUN config (Free public Google STUN servers)
    this.rtcConfig = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' }
      ]
    };

    // Container for remote audio elements
    this.audioContainer = document.getElementById('voice-audio-container');
    if (!this.audioContainer) {
      this.audioContainer = document.createElement('div');
      this.audioContainer.id = 'voice-audio-container';
      this.audioContainer.style.display = 'none';
      document.body.appendChild(this.audioContainer);
    }

    this.setupSocketListeners();
    this.setupUIListeners();
  }

  get socket() {
    return window.network ? window.network.socket : null;
  }

  setupSocketListeners() {
    if (!this.socket) {
      setTimeout(() => this.setupSocketListeners(), 250);
      return;
    }

    // Signaling: WebRTC Offer / Answer / ICE Candidate
    this.socket.on('voice_signal', async (data) => {
      await this.handleSignal(data);
    });

    // When another peer joins the room
    this.socket.on('voice_peer_joined', (data) => {
      this.onPeerJoined(data);
    });

    // When another peer leaves the room
    this.socket.on('voice_peer_left', (data) => {
      this.onPeerLeft(data.socketId);
    });

    // Remote speaking / mute status
    this.socket.on('voice_status', (data) => {
      this.onVoiceStatus(data);
    });
  }

  setupUIListeners() {
    // Lobby / Waiting Room Buttons
    document.getElementById('btn-lobby-mic')?.addEventListener('click', () => this.toggleMic());
    document.getElementById('btn-lobby-deafen')?.addEventListener('click', () => this.toggleDeafen());

    // In-Game HUD Buttons
    document.getElementById('btn-hud-mic')?.addEventListener('click', () => this.toggleMic());
    document.getElementById('btn-hud-deafen')?.addEventListener('click', () => this.toggleDeafen());

    // Mobile Touch Mic Button
    document.getElementById('btn-touch-mic')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggleMic();
    });
    document.getElementById('btn-touch-mic')?.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggleMic();
    }, { passive: false });

    // Global Hotkey 'V' to toggle mic
    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
        return;
      }
      if (e.code === 'KeyV' && !e.repeat) {
        // Toggle Mic
        this.toggleMic();
      }
    });
  }

  // Request or get user audio stream
  async getOrCreateLocalStream() {
    if (this.localStream) return this.localStream;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      });

      this.localStream = stream;
      this.hasPermission = true;

      // Apply initial mute state
      const track = stream.getAudioTracks()[0];
      if (track) {
        track.enabled = !this.isMuted;
      }

      // Hook up Voice Activity Detection
      this.setupVAD(stream);

      // Attach audio track to all already established peer connections
      this.peers.forEach(({ pc }) => {
        try {
          const sender = pc.getSenders().find(s => s.track && s.track.kind === 'audio') || pc.getSenders()[0];
          if (sender) {
            sender.replaceTrack(track);
          } else {
            pc.addTrack(track, stream);
          }
        } catch (err) {
          console.warn('Error attaching track to peer:', err);
        }
      });

      return stream;
    } catch (err) {
      console.warn('Microphone permission denied or unavailable:', err);
      window.showToast('Microphone access blocked. Please allow mic in browser settings to speak.', 'warning', 'MIC BLOCKED');
      return null;
    }
  }

  // Setup Voice Activity Detection (Speaking Indicator)
  setupVAD(stream) {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;

      this.audioContext = new AudioContextClass();
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }

      const source = this.audioContext.createMediaStreamSource(stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.4;
      source.connect(this.analyser);

      const bufferLength = this.analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      if (this.vadInterval) clearInterval(this.vadInterval);
      this.vadInterval = setInterval(() => {
        if (this.isMuted || !this.localStream) {
          if (this.isSpeakingLocally) {
            this.setLocalSpeaking(false);
          }
          return;
        }

        this.analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const avg = sum / bufferLength;

        // Threshold for speaking
        if (avg > 14) {
          this.setLocalSpeaking(true);
          if (this.speakingTimeout) clearTimeout(this.speakingTimeout);
          this.speakingTimeout = setTimeout(() => {
            this.setLocalSpeaking(false);
          }, 450);
        }
      }, 90);
    } catch (e) {
      console.warn('Could not setup VAD:', e);
    }
  }

  setLocalSpeaking(speaking) {
    if (this.isSpeakingLocally === speaking) return;
    this.isSpeakingLocally = speaking;

    // Notify other players
    if (this.socket) {
      this.socket.emit('voice_status', {
        isSpeaking: speaking,
        isMuted: this.isMuted
      });
    }

    this.updateUI();
  }

  // Toggle Microphone Mute
  async toggleMic() {
    if (!this.localStream) {
      // First time click: request permission and unmute!
      this.isMuted = false;
      const stream = await this.getOrCreateLocalStream();
      if (!stream) {
        this.isMuted = true;
        this.updateUI();
        return;
      }
      window.showToast('Microphone connected! You are now live in Voice Chat.', 'success', 'VOICE ACTIVE 🎙️');
    } else {
      this.isMuted = !this.isMuted;
      const track = this.localStream.getAudioTracks()[0];
      if (track) {
        track.enabled = !this.isMuted;
      }
      window.showToast(this.isMuted ? 'Microphone Muted 🔇' : 'Microphone Live 🎙️', this.isMuted ? 'warning' : 'success', 'MIC TOGGLED');
    }

    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    // Broadcast status to room
    if (this.socket) {
      this.socket.emit('voice_status', {
        isSpeaking: false,
        isMuted: this.isMuted
      });
    }

    this.updateUI();
  }

  // Toggle Deafen (Mute incoming audio)
  toggleDeafen() {
    this.isDeafened = !this.isDeafened;

    // Apply to all peer audio elements
    this.peers.forEach(({ audio }) => {
      if (audio) {
        audio.muted = this.isDeafened;
      }
    });

    window.showToast(this.isDeafened ? 'Deafened: All incoming audio muted 🔇' : 'Undeafened: Voice audio enabled 🔊', 'info', 'AUDIO');
    this.updateUI();
  }

  // Called when joining/entering a room
  enterRoom(room) {
    this.currentRoom = room;
    const myId = this.socket ? this.socket.id : null;
    if (!myId || !room || !room.players) return;

    // For every other player in room, initiate connection if our ID is higher
    room.players.forEach(p => {
      const peerId = p.id || p.socketId;
      if (!peerId || peerId === myId) return;

      if (!this.peers.has(peerId)) {
        // Deterministic initiator rule avoids offer collisions (glare)
        const isInitiator = (myId > peerId);
        this.createPeerConnection(peerId, p.displayName || p.username, isInitiator);
      }
    });

    this.updateUI();
  }

  onRoomUpdate(room) {
    this.currentRoom = room;
    if (!room || !room.players) return;
    const myId = this.socket ? this.socket.id : null;
    if (!myId) return;

    const currentPeerIds = new Set(room.players.map(p => p.id || p.socketId));

    // Remove peers that left
    this.peers.forEach((peer, peerId) => {
      if (!currentPeerIds.has(peerId)) {
        this.onPeerLeft(peerId);
      }
    });

    // Add any missing peers
    room.players.forEach(p => {
      const peerId = p.id || p.socketId;
      if (peerId && peerId !== myId && !this.peers.has(peerId)) {
        const isInitiator = (myId > peerId);
        this.createPeerConnection(peerId, p.displayName || p.username, isInitiator);
      }
    });

    this.updateUI();
  }

  // Called when server tells us a new peer joined
  onPeerJoined(data) {
    const peerId = data.socketId;
    const myId = this.socket ? this.socket.id : null;
    if (!peerId || peerId === myId) return;

    if (!this.peers.has(peerId)) {
      const isInitiator = (myId > peerId);
      this.createPeerConnection(peerId, data.displayName || 'Agent', isInitiator);
    }

    this.updateUI();
  }

  // Create an RTCPeerConnection to a remote socket
  async createPeerConnection(remoteId, displayName, isInitiator) {
    if (this.peers.has(remoteId)) return this.peers.get(remoteId);

    const pc = new RTCPeerConnection(this.rtcConfig);

    // Audio Element for remote playback
    const audio = document.createElement('audio');
    audio.autoplay = true;
    audio.playsInline = true;
    audio.muted = this.isDeafened;
    this.audioContainer.appendChild(audio);

    const peerRecord = {
      pc,
      audio,
      displayName: displayName || `Agent_${remoteId.substring(0, 4)}`,
      isSpeaking: false,
      isMuted: false
    };

    this.peers.set(remoteId, peerRecord);

    // Add local tracks if available, or add audio transceiver for receiving
    if (this.localStream) {
      const track = this.localStream.getAudioTracks()[0];
      if (track) {
        pc.addTrack(track, this.localStream);
      }
    } else {
      try {
        pc.addTransceiver('audio', { direction: 'sendrecv' });
      } catch (e) {
        console.warn('Transceiver error:', e);
      }
    }

    // ICE Candidate generation
    pc.onicecandidate = (event) => {
      if (event.candidate && this.socket) {
        this.socket.emit('voice_signal', {
          to: remoteId,
          signal: {
            type: 'candidate',
            candidate: event.candidate
          }
        });
      }
    };

    // Remote Track received
    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        audio.srcObject = event.streams[0];
        audio.play().catch(err => {
          console.log('Remote audio play interrupted, will play on next user gesture:', err);
        });
      }
    };

    // Connection state
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.onPeerLeft(remoteId);
      }
    };

    // If we are initiator, create and send Offer
    if (isInitiator) {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        if (this.socket) {
          this.socket.emit('voice_signal', {
            to: remoteId,
            signal: {
              type: 'offer',
              sdp: offer
            }
          });
        }
      } catch (err) {
        console.warn('Failed creating offer for peer:', remoteId, err);
      }
    }

    return peerRecord;
  }

  // Handle incoming WebRTC signaling message
  async handleSignal(data) {
    const { from, signal } = data;
    if (!from || !signal) return;

    let peer = this.peers.get(from);
    if (!peer) {
      // Find display name from room if possible
      let dName = `Agent_${from.substring(0, 4)}`;
      if (this.currentRoom && this.currentRoom.players) {
        const p = this.currentRoom.players.find(x => (x.id || x.socketId) === from);
        if (p) dName = p.displayName || p.username;
      }
      peer = await this.createPeerConnection(from, dName, false);
    }

    const pc = peer.pc;

    try {
      if (signal.type === 'offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));

        // If local stream was ready after connection started, ensure our track is attached
        if (this.localStream) {
          const track = this.localStream.getAudioTracks()[0];
          const sender = pc.getSenders().find(s => s.track && s.track.kind === 'audio') || pc.getSenders()[0];
          if (sender && track) {
            sender.replaceTrack(track);
          }
        }

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        if (this.socket) {
          this.socket.emit('voice_signal', {
            to: from,
            signal: {
              type: 'answer',
              sdp: answer
            }
          });
        }
      } else if (signal.type === 'answer') {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
      } else if (signal.type === 'candidate') {
        if (signal.candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
        }
      }
    } catch (err) {
      console.warn('WebRTC signal handling error from', from, err);
    }
  }

  // When a peer leaves
  onPeerLeft(remoteId) {
    const peer = this.peers.get(remoteId);
    if (peer) {
      try {
        peer.pc.close();
      } catch (e) {}
      if (peer.audio) {
        peer.audio.pause();
        peer.audio.srcObject = null;
        peer.audio.remove();
      }
      this.peers.delete(remoteId);
    }
    this.updateUI();
  }

  // When a peer's mute or speaking state changes
  onVoiceStatus(data) {
    const peer = this.peers.get(data.socketId);
    if (peer) {
      peer.isMuted = !!data.isMuted;
      peer.isSpeaking = !!data.isSpeaking;
      this.updateUI();
    }
  }

  // Clean up all connections on leaving room
  leaveRoom() {
    this.currentRoom = null;
    this.peers.forEach((peer, id) => {
      this.onPeerLeft(id);
    });
    this.peers.clear();
    this.isSpeakingLocally = false;
    this.updateUI();
  }

  // Update all UI buttons, speaking pills and player list badges
  updateUI() {
    // 1. Mic Buttons (Lobby, In-Game HUD, Mobile)
    const micButtons = [
      document.getElementById('btn-lobby-mic'),
      document.getElementById('btn-hud-mic'),
      document.getElementById('btn-touch-mic')
    ];

    const micActive = (!this.isMuted && !!this.localStream);
    const micIconHref = micActive ? '#i-mic' : '#i-mic-off';

    micButtons.forEach(btn => {
      if (!btn) return;
      btn.classList.toggle('voice-active', micActive);
      btn.classList.toggle('voice-speaking', this.isSpeakingLocally);
      btn.classList.toggle('voice-muted', !micActive);

      const useTag = btn.querySelector('use');
      if (useTag) {
        useTag.setAttribute('href', micIconHref);
      }

      const label = btn.querySelector('.btn-voice-label, .hud-btn-text, .btn-label');
      if (label) {
        label.innerText = micActive ? 'MIC ON' : 'MIC MUTE';
      }
    });

    // 2. Deafen Buttons
    const deafenButtons = [
      document.getElementById('btn-lobby-deafen'),
      document.getElementById('btn-hud-deafen')
    ];

    const deafenIconHref = this.isDeafened ? '#i-volume-x' : '#i-volume';

    deafenButtons.forEach(btn => {
      if (!btn) return;
      btn.classList.toggle('voice-deafened', this.isDeafened);
      const useTag = btn.querySelector('use');
      if (useTag) {
        useTag.setAttribute('href', deafenIconHref);
      }
      const label = btn.querySelector('.btn-deafen-label');
      if (label) {
        label.innerText = this.isDeafened ? 'DEAFENED' : 'DEAFEN';
      }
    });

    // 3. Lobby Voice Status Label
    const lobbyStatus = document.getElementById('lobby-voice-status');
    const lobbyIndicator = document.getElementById('lobby-voice-indicator');
    if (lobbyStatus) {
      if (micActive) {
        lobbyStatus.innerHTML = `🎙️ Voice Live: <strong>${this.peers.size}</strong> peer${this.peers.size === 1 ? '' : 's'} connected`;
      } else {
        lobbyStatus.innerHTML = `🎙️ Voice: <strong>Muted</strong> (Click to Unmute / Hotkey: V)`;
      }
    }
    if (lobbyIndicator) {
      lobbyIndicator.className = 'voice-pulse-indicator' + (this.isSpeakingLocally ? ' speaking' : (micActive ? ' live' : ' muted'));
    }

    // 4. Update In-Game Discord-Style Active Speakers Overlay
    const overlay = document.getElementById('voice-speakers-overlay');
    if (overlay) {
      const activeList = [];
      if (this.isSpeakingLocally) {
        activeList.push({ name: 'You', isMe: true });
      }
      this.peers.forEach(peer => {
        if (peer.isSpeaking) {
          activeList.push({ name: peer.displayName, isMe: false });
        }
      });

      if (activeList.length === 0) {
        overlay.innerHTML = '';
        overlay.style.display = 'none';
      } else {
        overlay.style.display = 'flex';
        overlay.innerHTML = activeList.map(item => `
          <div class="voice-speaker-badge ${item.isMe ? 'speaker-me' : ''}">
            <span class="speaker-wave-dot"></span>
            <svg class="icon icon-xs"><use href="#i-mic"/></svg>
            <span class="speaker-name">${item.name}</span>
          </div>
        `).join('');
      }
    }

    // 5. Update Room Waiting Screen Player Items
    document.querySelectorAll('.player-voice-indicator').forEach(elem => {
      const pId = elem.dataset.playerId;
      if (!pId) return;
      const myId = this.socket ? this.socket.id : null;

      if (pId === myId) {
        elem.className = 'player-voice-indicator' + (this.isSpeakingLocally ? ' speaking' : (micActive ? ' live' : ' muted'));
        const use = elem.querySelector('use');
        if (use) use.setAttribute('href', micActive ? '#i-mic' : '#i-mic-off');
      } else {
        const peer = this.peers.get(pId);
        const peerMuted = peer ? peer.isMuted : true;
        const peerSpeaking = peer ? peer.isSpeaking : false;
        elem.className = 'player-voice-indicator' + (peerSpeaking ? ' speaking' : (!peerMuted ? ' live' : ' muted'));
        const use = elem.querySelector('use');
        if (use) use.setAttribute('href', !peerMuted ? '#i-mic' : '#i-mic-off');
      }
    });
  }
}

// Global Voice Chat Instance
window.voiceChat = new VoiceChatManager();
