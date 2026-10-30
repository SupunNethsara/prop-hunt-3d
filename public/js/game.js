// 3D Core Game Engine (Three.js Renderer, Controls, Raycasting & Effects)
class GameEngine {
  constructor() {
    this.container = document.getElementById('game-canvas-container');
    this.scene = null;
    this.camera = null;
    this.renderer = null;

    // Local player state
    this.localPlayer = {
      id: null,
      username: 'Guest',
      role: 'prop', // 'prop' | 'hunter' | 'spectator'
      propType: 'box',
      mesh: null,
      x: 0,
      y: 0.5,
      z: 0,
      rotY: 0,
      pitch: 0,
      isFrozen: false,
      health: 100,
      score: 0,
      isGrounded: true,
      vy: 0
    };

    // Other connected players
    this.remotePlayers = new Map(); // socketId -> { player, mesh }

    // Controls state
    this.keys = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      jump: false,
      freeze: false
    };

    this.mouse = {
      isLocked: false,
      sens: 0.0025,
      invertY: false
    };

    // Mobile Virtual Touch Joystick & Look State
    this.joystick = { x: 0, y: 0, active: false, touchId: null };
    this.lookTouch = { id: null, lastX: 0, lastY: 0 };
    this.isMobile = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || (window.innerWidth <= 1024);

    this.currentPhase = 'WAITING';
    this.isHidingPhase = false;
    this.fpvBlaster = null;

    this.raycaster = new THREE.Raycaster();
    this.hunterFlashlight = null;

    this.init();
  }

  init() {
    const GFX = window.GFX;
    const Q = GFX.quality;
    const lin = hex => GFX.lin(hex);

    // 1. Scene: dusk sky dome with fog matched to the horizon colour.
    this.scene = new THREE.Scene();
    const fogHex = 0x2a2338;
    this.scene.background = new THREE.Color(fogHex); // seen only if the sky dome fails
    this.scene.fog = new THREE.FogExp2(lin(fogHex), 0.011);

    // 2. Camera
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 200);
    this.camera.position.set(0, 2, 5);

    // 3. Renderer: sRGB output, filmic tone mapping, physical light units.
    // Quality tier (graphics.js) caps pixel ratio and shadow cost on phones.
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Q.pixelRatio);
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.physicallyCorrectLights = true;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = Q.softShadows ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.container.appendChild(this.renderer.domElement);
    GFX.setRenderer(this.renderer);
    GFX.addVignette(this.container);

    this.sky = GFX.createSky(150);
    if (this.sky) this.scene.add(this.sky);

    // Image-based lighting from a hand-built room; null means "lights only".
    const env = GFX.buildEnvironment(this.renderer);
    if (env) this.scene.environment = env;

    // 4. Lighting (physical units). Warm low key light, cool sky fill, and
    // the neon point lights with inverse-square falloff.
    const hemiLight = new THREE.HemisphereLight(lin(0x9fb4e6), lin(0x2a2230), env ? 0.8 : 1.6);
    this.scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(lin(0xffc58f), 3.0);
    dirLight.position.copy(GFX.sunDirection).multiplyScalar(70);
    dirLight.target.position.set(0, 0, 0);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = Q.shadowMapSize;
    dirLight.shadow.mapSize.height = Q.shadowMapSize;
    dirLight.shadow.bias = -0.0004;
    if ('normalBias' in dirLight.shadow) dirLight.shadow.normalBias = 0.04;
    this.scene.add(dirLight, dirLight.target);
    // Cover the whole 60 x 60 m arena (walls up to 4.8 m, lamp cords to 4.9 m).
    GFX.fitShadowCamera(dirLight, new THREE.Box3(new THREE.Vector3(-31, 0, -31), new THREE.Vector3(31, 5, 31)));
    this.keyLight = dirLight;

    // Neon pendants sit just under their bulbs (map.js lamps at y = 3.0).
    const p1 = new THREE.PointLight(lin(0x00f0ff), 40, 26, 2);
    p1.position.set(-15, 2.8, -15);
    const p2 = new THREE.PointLight(lin(0xff0077), 40, 26, 2);
    p2.position.set(15, 2.8, 15);
    const p3 = new THREE.PointLight(lin(0xffea00), 22, 22, 2);
    p3.position.set(0, 4, 0);
    this.scene.add(p1, p2, p3);

    if (Q.extraLights) {
      // Warm tungsten pendants in the other two quadrants (desktop tier only).
      [[15, -15], [-15, 15]].forEach(([x, z]) => {
        const l = new THREE.PointLight(lin(0xffc27a), 22, 14, 2);
        l.position.set(x, 2.8, z);
        this.scene.add(l);
      });
    }

    // 5. Build Map
    window.MapBuilder.buildMap(this.scene);

    // 6. Setup input & events
    this.setupEvents();

    // 7. Start render loop
    this.clock = new THREE.Clock();
    this.animate();
  }

  setupEvents() {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // PointerLock & Mouse look for 3D camera
    const canvas = this.renderer.domElement;
    const lockOverlay = document.getElementById('click-to-play-hint');

    const requestLock = () => {
      if (document.getElementById('game-screen').classList.contains('active')) {
        try {
          canvas.requestPointerLock();
        } catch (err) {
          console.warn('Pointer lock error:', err);
        }
        if (lockOverlay) lockOverlay.style.display = 'none';
        this.mouse.isLocked = true;
      }
    };

    canvas.addEventListener('click', requestLock);
    if (lockOverlay) {
      lockOverlay.addEventListener('click', requestLock);
    }

    document.addEventListener('pointerlockchange', () => {
      this.mouse.isLocked = (document.pointerLockElement === canvas);
      if (lockOverlay && this.mouse.isLocked) {
        lockOverlay.style.display = 'none';
      }
    });

    // Support both Pointer Lock AND Mouse Drag
    let isMouseDown = false;
    let lastX = 0;
    let lastY = 0;

    window.addEventListener('mousedown', (e) => {
      isMouseDown = true;
      lastX = e.clientX;
      lastY = e.clientY;
    });

    window.addEventListener('mouseup', () => {
      isMouseDown = false;
    });

    document.getElementById('btn-toggle-inverty')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.mouse.invertY = !this.mouse.invertY;
      const btn = document.getElementById('btn-toggle-inverty');
      if (btn) btn.innerText = `Invert Y: ${this.mouse.invertY ? 'ON' : 'OFF'}`;
    });

    document.addEventListener('mousemove', (e) => {
      const multY = this.mouse.invertY ? -1 : 1;
      if (this.mouse.isLocked) {
        this.localPlayer.rotY -= e.movementX * this.mouse.sens;
        this.localPlayer.pitch -= e.movementY * this.mouse.sens * multY;
      } else if (isMouseDown && document.getElementById('game-screen').classList.contains('active')) {
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        lastX = e.clientX;
        lastY = e.clientY;
        this.localPlayer.rotY -= dx * this.mouse.sens * 1.5;
        this.localPlayer.pitch -= dy * this.mouse.sens * 1.5 * multY;
      }
      this.localPlayer.pitch = Math.max(-Math.PI / 2.3, Math.min(Math.PI / 2.3, this.localPlayer.pitch));
    });

    // Keyboard controls
    window.addEventListener('keydown', (e) => {
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          this.keys.forward = true;
          break;
        case 'KeyS':
        case 'ArrowDown':
          this.keys.backward = true;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          this.keys.left = true;
          break;
        case 'KeyD':
        case 'ArrowRight':
          this.keys.right = true;
          break;
        case 'Space':
          this.keys.jump = true;
          break;
        case 'KeyF':
        case 'KeyL':
          // Toggle freeze / lock position (for Props)
          this.toggleFreeze();
          break;
        case 'KeyT':
          // Quick taunt
          if (window.network && this.localPlayer.role === 'prop') {
            window.network.emitTaunt('whistle');
          }
          break;
      }
    });

    window.addEventListener('keyup', (e) => {
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          this.keys.forward = false;
          break;
        case 'KeyS':
        case 'ArrowDown':
          this.keys.backward = false;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          this.keys.left = false;
          break;
        case 'KeyD':
        case 'ArrowRight':
          this.keys.right = false;
          break;
        case 'Space':
          this.keys.jump = false;
          break;
      }
    });

    // Mouse click for shooting or prop feedback
    window.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      const gameScreen = document.getElementById('game-screen');
      if (!gameScreen || !gameScreen.classList.contains('active')) return;

      // Ignore clicks on UI elements (buttons, inputs, chat, modals, touch controls)
      if (e.target.closest('button, input, form, #modal-gameover, #role-briefing-modal, #touch-joystick-zone, .mobile-action-buttons')) {
        return;
      }

      // If pointer is not locked yet, request lock for 3D look
      if (!this.mouse.isLocked) {
        try {
          this.renderer.domElement.requestPointerLock();
        } catch (err) {}
      }

      // Handle action based on role
      if (this.localPlayer.role === 'hunter') {
        this.fireHunterBlaster();
      } else if (this.localPlayer.role === 'prop') {
        this.showPropShootHint();
      }
    });

    // 8. Initialize Mobile Touch Controls
    this.setupTouchControls();
  }

  // Toggle Freeze for Disguised Props (Both Desktop [F/L] & Mobile Touch [LOCK])
  toggleFreeze() {
    if (this.localPlayer.role !== 'prop') return;
    this.localPlayer.isFrozen = !this.localPlayer.isFrozen;
    const freezeStatus = document.getElementById('hud-freeze-status');
    const freezeBtn = document.getElementById('btn-touch-freeze');

    if (freezeStatus) {
      freezeStatus.innerText = this.localPlayer.isFrozen ? 'LOCKED / FROZEN 🔒' : 'UNLOCKED 🏃';
      freezeStatus.className = this.localPlayer.isFrozen ? 'badge-locked' : 'badge-unlocked';
    }

    if (freezeBtn) {
      const label = freezeBtn.querySelector('.btn-label');
      if (label) label.innerText = this.localPlayer.isFrozen ? 'UNLOCK' : 'LOCK';
      freezeBtn.classList.toggle('locked-active', this.localPlayer.isFrozen);
    }
  }

  // Mobile Touch Virtual Joystick, Camera Look Drag & Action Buttons
  setupTouchControls() {
    if (this.isMobile) {
      document.body.classList.add('has-touch-controls');
    }

    // A. Virtual Movement Joystick (Bottom Left)
    const zone = document.getElementById('touch-joystick-zone');
    const thumb = document.getElementById('touch-joystick-thumb');

    if (zone && thumb) {
      const updateThumb = (touch) => {
        const rect = zone.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const dx = touch.clientX - centerX;
        const dy = touch.clientY - centerY;
        const dist = Math.hypot(dx, dy);
        const maxR = 40;
        const clamped = Math.min(dist, maxR);
        const angle = Math.atan2(dy, dx);
        const tx = Math.cos(angle) * clamped;
        const ty = Math.sin(angle) * clamped;
        thumb.style.transform = `translate(${tx}px, ${ty}px)`;
        this.joystick.x = tx / maxR;
        this.joystick.y = ty / maxR;
      };

      zone.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.joystick.touchId === null && e.changedTouches.length > 0) {
          const t = e.changedTouches[0];
          this.joystick.touchId = t.identifier;
          this.joystick.active = true;
          updateThumb(t);
        }
      }, { passive: false });

      window.addEventListener('touchmove', (e) => {
        if (!this.joystick.active || this.joystick.touchId === null) return;
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          if (t.identifier === this.joystick.touchId) {
            updateThumb(t);
            break;
          }
        }
      }, { passive: false });

      const onJoystickEnd = (e) => {
        if (this.joystick.touchId === null) return;
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          if (t.identifier === this.joystick.touchId) {
            this.joystick.touchId = null;
            this.joystick.active = false;
            this.joystick.x = 0;
            this.joystick.y = 0;
            thumb.style.transform = 'translate(0px, 0px)';
            break;
          }
        }
      };

      window.addEventListener('touchend', onJoystickEnd, { passive: true });
      window.addEventListener('touchcancel', onJoystickEnd, { passive: true });
    }

    // B. Right-Screen Touch Camera Look (Swipe / Drag to Look around)
    window.addEventListener('touchstart', (e) => {
      const gameScreen = document.getElementById('game-screen');
      if (!gameScreen || !gameScreen.classList.contains('active')) return;

      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.target.closest('#touch-joystick-zone, .mobile-action-buttons, button, input, form, #modal-gameover, #role-briefing-modal')) {
          continue;
        }
        if (this.lookTouch.id === null) {
          this.lookTouch.id = t.identifier;
          this.lookTouch.lastX = t.clientX;
          this.lookTouch.lastY = t.clientY;
          break;
        }
      }
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      if (this.lookTouch.id === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === this.lookTouch.id) {
          const dx = t.clientX - this.lookTouch.lastX;
          const dy = t.clientY - this.lookTouch.lastY;
          this.lookTouch.lastX = t.clientX;
          this.lookTouch.lastY = t.clientY;

          const touchSens = 0.0055;
          const multY = this.mouse.invertY ? -1 : 1;
          this.localPlayer.rotY -= dx * touchSens;
          this.localPlayer.pitch -= dy * touchSens * multY;
          this.localPlayer.pitch = Math.max(-Math.PI / 2.3, Math.min(Math.PI / 2.3, this.localPlayer.pitch));
          break;
        }
      }
    }, { passive: true });

    const onLookEnd = (e) => {
      if (this.lookTouch.id === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === this.lookTouch.id) {
          this.lookTouch.id = null;
          break;
        }
      }
    };

    window.addEventListener('touchend', onLookEnd, { passive: true });
    window.addEventListener('touchcancel', onLookEnd, { passive: true });

    // C. Mobile Action Buttons
    const shootBtn = document.getElementById('btn-touch-shoot');
    const jumpBtn = document.getElementById('btn-touch-jump');
    const freezeBtn = document.getElementById('btn-touch-freeze');
    const tauntBtn = document.getElementById('btn-touch-taunt');
    const chatToggle = document.getElementById('btn-mobile-chat-toggle');
    const touchToggle = document.getElementById('btn-toggle-touch');

    shootBtn?.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.localPlayer.role === 'hunter') {
        this.fireHunterBlaster();
      }
    }, { passive: false });

    shootBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      if (this.localPlayer.role === 'hunter') {
        this.fireHunterBlaster();
      }
    });

    const triggerJumpStart = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.keys.jump = true;
    };
    const triggerJumpEnd = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.keys.jump = false;
    };

    jumpBtn?.addEventListener('touchstart', triggerJumpStart, { passive: false });
    jumpBtn?.addEventListener('touchend', triggerJumpEnd, { passive: false });
    jumpBtn?.addEventListener('mousedown', triggerJumpStart);
    jumpBtn?.addEventListener('mouseup', triggerJumpEnd);

    freezeBtn?.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggleFreeze();
    }, { passive: false });

    freezeBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      this.toggleFreeze();
    });

    tauntBtn?.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (window.network && this.localPlayer.role === 'prop') {
        window.network.emitTaunt('whistle');
      }
    }, { passive: false });

    tauntBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      if (window.network && this.localPlayer.role === 'prop') {
        window.network.emitTaunt('whistle');
      }
    });

    chatToggle?.addEventListener('click', (e) => {
      e.preventDefault();
      const chat = document.querySelector('.game-chat');
      if (chat) chat.classList.toggle('mobile-open');
    });

    touchToggle?.addEventListener('click', (e) => {
      e.preventDefault();
      document.body.classList.toggle('has-touch-controls');
      const isNowOn = document.body.classList.contains('has-touch-controls');
      touchToggle.innerText = `Touch: ${isNowOn ? 'ON' : 'OFF'}`;
    });
  }

  // Set Local Player Profile, Spawn & Role
  setLocalPlayer(data) {
    this.localPlayer.id = data.id || this.localPlayer.id;
    this.localPlayer.username = data.username || this.localPlayer.username;
    this.localPlayer.role = data.role || this.localPlayer.role;
    this.localPlayer.propType = data.propType || this.localPlayer.propType;
    this.localPlayer.health = data.health !== undefined ? data.health : 100;
    this.localPlayer.isFrozen = false;

    if (data.x !== undefined) this.localPlayer.x = data.x;
    if (data.y !== undefined) this.localPlayer.y = data.y;
    if (data.z !== undefined) this.localPlayer.z = data.z;
    if (data.rotY !== undefined) this.localPlayer.rotY = data.rotY;
    this.localPlayer.vy = 0;

    // Rebuild local mesh
    if (this.localPlayer.mesh) {
      this.scene.remove(this.localPlayer.mesh);
      this.localPlayer.mesh = null;
    }

    const crosshairWrap = document.getElementById('crosshair-wrapper');
    const tauntPanel = document.getElementById('prop-taunt-panel');
    const touchShootBtn = document.getElementById('btn-touch-shoot');
    const touchFreezeBtn = document.getElementById('btn-touch-freeze');
    const touchTauntBtn = document.getElementById('btn-touch-taunt');

    if (this.localPlayer.role === 'prop') {
      this.localPlayer.mesh = window.PropBuilder.createProp(this.localPlayer.propType);
      this.scene.add(this.localPlayer.mesh);
      if (crosshairWrap) crosshairWrap.classList.remove('active');
      if (tauntPanel) tauntPanel.style.display = 'flex';
      if (touchShootBtn) touchShootBtn.style.display = 'none';
      if (touchFreezeBtn) touchFreezeBtn.style.display = 'flex';
      if (touchTauntBtn) touchTauntBtn.style.display = 'flex';
      this.removeFPVBlaster();
    } else if (this.localPlayer.role === 'hunter') {
      this.localPlayer.mesh = window.PropBuilder.createHunter();
      this.scene.add(this.localPlayer.mesh);
      if (crosshairWrap) crosshairWrap.classList.add('active');
      if (tauntPanel) tauntPanel.style.display = 'none';
      if (touchShootBtn) touchShootBtn.style.display = 'flex';
      if (touchFreezeBtn) touchFreezeBtn.style.display = 'none';
      if (touchTauntBtn) touchTauntBtn.style.display = 'none';
      this.setupFPVBlaster();
    }

    this.updateHUD();
  }

  // First-Person Blaster Viewmodel for Hunter
  setupFPVBlaster() {
    if (this.fpvBlaster) return;
    this.fpvBlaster = new THREE.Group();

    const GFX = window.GFX;
    const lin = hex => GFX.lin(hex);
    let metalSet = null;
    try { metalSet = window.TextureGenerator.getSet('metal'); } catch (e) { metalSet = null; }

    // Gun body: bevelled gunmetal that picks up environment reflections.
    const bodyGeo = GFX.roundedBox(0.12, 0.14, 0.45, 0.018, 2);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: lin(0x2a3240), metalness: 0.85, roughness: metalSet ? 1.0 : 0.35,
      roughnessMap: metalSet ? metalSet.roughnessMap : null,
      normalMap: metalSet ? metalSet.normalMap : null,
      normalScale: new THREE.Vector2(0.4, 0.4)
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);

    // Gun barrel
    const barrelGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.3, 20);
    const barrelMat = new THREE.MeshStandardMaterial({ color: lin(0x8a93a3), metalness: 1, roughness: 0.25 });
    const barrel = new THREE.Mesh(barrelGeo, barrelMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.02, -0.25);

    // Glowing Neon Rails
    const railMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: lin(0x00f0ff), emissiveIntensity: 3 });
    const railL = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.04, 0.35), railMat);
    railL.position.set(-0.065, 0.03, -0.05);
    const railR = railL.clone();
    railR.position.x = 0.065;

    // Holographic Scope
    const scope = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 0.08, 20),
      new THREE.MeshStandardMaterial({ color: lin(0x1a0610), emissive: lin(0xff0077), emissiveIntensity: 2.5, roughness: 0.2 })
    );
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.09, 0.02);

    // Muzzle flash point (opacity is animated in animateBlasterFire)
    const muzzleGeo = new THREE.SphereGeometry(0.09, 12, 12);
    const muzzleMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false });
    const muzzle = new THREE.Mesh(muzzleGeo, muzzleMat);
    muzzle.position.set(0, 0.02, -0.42);

    // Grip, barrel shroud fins and an energy cell (decorative, never raycast).
    const gripMat = new THREE.MeshStandardMaterial({ color: lin(0x14161b), roughness: 0.7, metalness: 0 });
    const grip = GFX.noRaycast(new THREE.Mesh(GFX.roundedBox(0.07, 0.16, 0.09, 0.02, 1), gripMat));
    grip.position.set(0, -0.12, 0.12);
    grip.rotation.x = -0.25;
    const fins = [];
    for (let i = 0; i < 4; i++) {
      const fin = GFX.noRaycast(new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.012, 20), barrelMat));
      fin.rotation.x = Math.PI / 2;
      fin.position.set(0, 0.02, -0.18 - i * 0.035);
      fins.push(fin);
    }
    const cell = GFX.noRaycast(new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.022, 0.12, 16),
      new THREE.MeshStandardMaterial({ color: 0x000000, emissive: lin(0x00f0ff), emissiveIntensity: 1.5 })
    ));
    cell.rotation.z = Math.PI / 2;
    cell.position.set(0, -0.05, 0.1);

    this.fpvBlaster.add(body, barrel, railL, railR, scope, muzzle, grip, cell, ...fins);
    this.fpvBlaster.muzzle = muzzle;

    this.fpvBlaster.position.set(0.3, -0.26, -0.6);
    this.camera.add(this.fpvBlaster);
    this.scene.add(this.camera);
  }

  removeFPVBlaster() {
    if (this.fpvBlaster) {
      this.camera.remove(this.fpvBlaster);
      this.fpvBlaster = null;
    }
  }

  animateBlasterFire() {
    if (!this.fpvBlaster) return;
    this.fpvBlaster.position.z = -0.52; // recoil kick
    if (this.fpvBlaster.muzzle) {
      this.fpvBlaster.muzzle.material.opacity = 0.9;
    }
    setTimeout(() => {
      if (this.fpvBlaster) {
        this.fpvBlaster.position.z = -0.6;
        if (this.fpvBlaster.muzzle) {
          this.fpvBlaster.muzzle.material.opacity = 0;
        }
      }
    }, 80);
  }

  showHitMarker() {
    const hm = document.getElementById('hit-marker');
    if (hm) {
      hm.classList.add('flash');
      setTimeout(() => hm.classList.remove('flash'), 180);
    }
  }

  showPropShootHint() {
    window.soundFX.clickLocked();
    window.showToast('You are a PROP! You cannot shoot — find a spot and press [F] to Freeze!', 'info', 'DISGUISED PROP');
  }

  // Update Remote Players from network
  updateRemotePlayer(data) {
    if (data.id === this.localPlayer.id) return;

    let rp = this.remotePlayers.get(data.id);
    if (!rp) {
      const mesh = (data.role === 'hunter')
        ? window.PropBuilder.createHunter()
        : window.PropBuilder.createProp(data.propType || 'box');

      mesh.castShadow = true;
      mesh.playerId = data.id;
      mesh.isPlayerProp = (data.role === 'prop');
      this.scene.add(mesh);

      rp = { player: data, mesh, targetPos: new THREE.Vector3(), targetRotY: 0 };
      this.remotePlayers.set(data.id, rp);
    }

    // Check if prop type changed
    if (data.propType && rp.player.propType !== data.propType) {
      this.scene.remove(rp.mesh);
      rp.mesh = window.PropBuilder.createProp(data.propType);
      rp.mesh.playerId = data.id;
      rp.mesh.isPlayerProp = true;
      this.scene.add(rp.mesh);
      rp.player.propType = data.propType;
    }

    if (data.x !== undefined) rp.targetPos.set(data.x, data.y, data.z);
    if (data.rotY !== undefined) rp.targetRotY = data.rotY;
    if (data.isFrozen !== undefined) rp.player.isFrozen = data.isFrozen;
  }

  removeRemotePlayer(id) {
    const rp = this.remotePlayers.get(id);
    if (rp) {
      if (rp.mesh) this.scene.remove(rp.mesh);
      this.remotePlayers.delete(id);
    }
  }

  // Hunter Shoots Scanner Blaster
  fireHunterBlaster() {
    if (this.currentPhase === 'HIDING') {
      window.soundFX.clickLocked();
      window.showToast('🔒 Weapons locked during Hiding Phase! Wait for release countdown.', 'warning', 'LOCKDOWN');
      return;
    }

    window.soundFX.laser();
    this.animateBlasterFire();

    // Raycast from camera center
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    const intersects = this.raycaster.intersectObjects(this.scene.children, true);

    let hitPlayerId = null;
    let hitStaticProp = false;
    let hitPoint = null;

    for (let i = 0; i < intersects.length; i++) {
      const hit = intersects[i];
      if (hit.distance > 40) break; // range limit

      // Check if hit object belongs to local player or fpv gun
      if (this.fpvBlaster && (hit.object === this.fpvBlaster || this.fpvBlaster.children.includes(hit.object))) {
        continue;
      }
      if (this.localPlayer.mesh && (hit.object === this.localPlayer.mesh || this.localPlayer.mesh.children.includes(hit.object))) {
        continue;
      }

      hitPoint = hit.point;

      // Climb parent hierarchy to detect if object is a disguised player or static prop
      let curr = hit.object;
      while (curr && curr !== this.scene) {
        if (curr.playerId && curr.isPlayerProp) {
          hitPlayerId = curr.playerId;
          break;
        }
        if (curr.isStaticProp) {
          hitStaticProp = true;
          break;
        }
        curr = curr.parent;
      }

      if (hitPlayerId || hitStaticProp) {
        break;
      }
      // Hit a wall, floor or boundary
      break;
    }

    // Spawn Laser Tracer Beam
    const origin = this.camera.position.clone().add(new THREE.Vector3(0.25, -0.22, -0.4).applyQuaternion(this.camera.quaternion));
    const target = hitPoint || this.camera.position.clone().add(this.camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(35));
    this.createLaserBeam(origin, target);

    // Send to server
    if (window.network) {
      window.network.emitHunterAttack({
        hitPlayerId,
        hitStaticProp,
        origin,
        direction: target
      });
    }

    if (hitPlayerId) {
      window.soundFX.hitMarker();
      this.showHitMarker();
      this.createHitSparks(target, 0x00ff88);
      window.showToast('🎯 HIT! Disguised prop detected!', 'success', 'SCANNER HIT');
    } else if (hitStaticProp) {
      window.soundFX.misfire();
      this.createHitSparks(target, 0xff0055);
      window.showToast('❌ Misfire! Shot an innocent inanimate object (-5 HP energy)', 'error', 'FALSE SCAN');
    } else {
      this.createHitSparks(target, 0x00f0ff);
    }
  }

  createLaserBeam(from, to) {
    const dist = from.distanceTo(to);
    if (dist < 0.1) return;

    // Glowing 3D Neon Laser Bolt Cylinder
    const geom = new THREE.CylinderGeometry(0.045, 0.045, dist, 8);
    const mat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.9, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false });
    const cylinder = new THREE.Mesh(geom, mat);

    // Position at midpoint and orient along ray direction
    const mid = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);
    cylinder.position.copy(mid);
    const dir = new THREE.Vector3().subVectors(to, from).normalize();
    cylinder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);

    this.scene.add(cylinder);
    setTimeout(() => {
      this.scene.remove(cylinder);
    }, 110);
  }

  createHitSparks(pos, colorHex) {
    const count = 12;
    const geom = new THREE.BufferGeometry();
    const positions = [];
    for (let i = 0; i < count; i++) {
      positions.push(pos.x, pos.y, pos.z);
    }
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color: colorHex, size: 0.15, toneMapped: false });
    const points = new THREE.Points(geom, mat);
    this.scene.add(points);
    setTimeout(() => this.scene.remove(points), 250);
  }

  // Create Visual 3D Expanding Taunt Wave
  createTauntRipple(x, y, z) {
    const geo = new THREE.RingGeometry(0.2, 0.4, 24);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffff00, side: THREE.DoubleSide, transparent: true, opacity: 0.8, toneMapped: false });
    const ring = new THREE.Mesh(geo, mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, y + 0.1, z);
    this.scene.add(ring);

    let scale = 1;
    const interval = setInterval(() => {
      scale += 0.25;
      ring.scale.set(scale, scale, scale);
      mat.opacity -= 0.05;
      if (mat.opacity <= 0) {
        clearInterval(interval);
        this.scene.remove(ring);
      }
    }, 40);
  }

  // Update physics and transforms every frame
  updatePhysics(delta) {
    const lp = this.localPlayer;
    if (!lp.mesh) return;

    // If prop is frozen/locked, skip position updates
    if (lp.role === 'prop' && lp.isFrozen) {
      lp.mesh.position.set(lp.x, lp.y, lp.z);
      return;
    }

    const speed = (lp.role === 'hunter' ? 9.5 : 7.0) * delta;

    // W = Forward, S = Backward, D = Right, A = Left (Keyboard + Mobile Joystick)
    let forward = 0;
    if (this.keys.forward) forward += 1;
    if (this.keys.backward) forward -= 1;
    if (this.joystick && this.joystick.active) {
      // Joystick Y: up on screen is negative Y in touch coords, moving forward
      forward -= this.joystick.y;
    }

    let strafe = 0;
    if (this.keys.right) strafe += 1;
    if (this.keys.left) strafe -= 1;
    if (this.joystick && this.joystick.active) {
      strafe += this.joystick.x;
    }

    if (forward !== 0 || strafe !== 0) {
      // Normalize input so diagonal movement isn't faster, but preserve analog intensity
      const len = Math.hypot(forward, strafe);
      const intensity = Math.min(1, len);
      const normF = (forward / len) * intensity;
      const normS = (strafe / len) * intensity;

      // Standard 3D orientation:
      // Looking down -Z when rotY = 0
      const fX = -Math.sin(lp.rotY);
      const fZ = -Math.cos(lp.rotY);
      const rX = Math.cos(lp.rotY);
      const rZ = -Math.sin(lp.rotY);

      const moveX = (fX * normF + rX * normS) * speed;
      const moveZ = (fZ * normF + rZ * normS) * speed;

      const inCage = (lp.role === 'hunter' && this.isHidingPhase);

      if (inCage) {
        // Confined inside suspended glass cage platform
        lp.x = Math.max(-3.4, Math.min(3.4, lp.x + moveX));
        lp.z = Math.max(-3.4, Math.min(3.4, lp.z + moveZ));
      } else {
        const nextX = lp.x + moveX;
        const nextZ = lp.z + moveZ;

        // Check collision with arena walls
        if (!window.MapBuilder.checkCollision(nextX, lp.z)) {
          lp.x = nextX;
        }
        if (!window.MapBuilder.checkCollision(lp.x, nextZ)) {
          lp.z = nextZ;
        }
      }

      // Prop model faces look direction
      lp.mesh.rotation.y = lp.rotY;
    }

    // Gravity & Jump
    const gravity = 25 * delta;
    lp.vy -= gravity;
    lp.y += lp.vy * delta;

    const groundY = (lp.role === 'hunter' && this.isHidingPhase) ? 14.2 : 0.0;
    if (lp.y <= groundY) {
      lp.y = groundY;
      lp.vy = 0;
      lp.isGrounded = true;
    }

    if (this.keys.jump && lp.isGrounded) {
      lp.vy = 8.5;
      lp.isGrounded = false;
    }

    lp.mesh.position.set(lp.x, lp.y, lp.z);

    // Sync over network (throttle handled in network.js)
    if (window.network) {
      window.network.emitTransform({
        x: lp.x,
        y: lp.y,
        z: lp.z,
        rotY: lp.rotY,
        isFrozen: lp.isFrozen
      });
    }
  }

  // Called when transition from Hiding to Hunting happens
  onHuntingPhaseStarted(data) {
    this.currentPhase = 'HUNTING';
    this.isHidingPhase = false;

    if (this.localPlayer.role === 'hunter') {
      if (data && data.hunterSpawn) {
        this.localPlayer.x = data.hunterSpawn.x;
        this.localPlayer.y = data.hunterSpawn.y;
        this.localPlayer.z = data.hunterSpawn.z;
        this.localPlayer.vy = 0;
      }
      this.showPhaseBanner('🎯 WEAPONS UNLOCKED! HUNT DOWN ALL PROPS! LEFT-CLICK TO SHOOT!', 'hunter');
    } else {
      this.showPhaseBanner('🚨 HUNTER HAS ENTERED THE ARENA! STAY FROZEN OR RUN!', 'prop');
    }

    this.updateHUD();
  }

  showPhaseBanner(text, type = 'hunter') {
    const banner = document.getElementById('phase-announcement');
    if (banner) {
      banner.innerText = text;
      banner.style.display = 'block';
      banner.style.background = (type === 'hunter') ? 'rgba(0, 240, 255, 0.95)' : 'rgba(255, 0, 119, 0.95)';
      banner.style.color = (type === 'hunter') ? '#000' : '#fff';
      setTimeout(() => {
        banner.style.display = 'none';
      }, 4500);
    }
  }

  // Update Camera based on role
  updateCamera() {
    const lp = this.localPlayer;

    if (lp.role === 'hunter') {
      // First-person view
      this.camera.position.set(lp.x, lp.y + 1.6, lp.z);
      const euler = new THREE.Euler(lp.pitch, lp.rotY, 0, 'YXZ');
      this.camera.quaternion.setFromEuler(euler);

      // Hide own hunter model in first person
      if (lp.mesh) lp.mesh.visible = false;
    } else {
      // Third-person smooth follow for Props (camera behind player looking forward)
      if (lp.mesh) lp.mesh.visible = true;

      const camDist = 3.5;
      const camHeight = 1.4;
      // Moving mouse UP points target higher and lowers camera slightly (natural look UP)
      const cx = lp.x + Math.sin(lp.rotY) * camDist * Math.cos(lp.pitch);
      const cz = lp.z + Math.cos(lp.rotY) * camDist * Math.cos(lp.pitch);
      const cy = lp.y + camHeight - Math.sin(lp.pitch) * 1.5;
      const targetY = lp.y + 0.6 + Math.sin(lp.pitch) * 2.0;

      this.camera.position.set(cx, Math.max(0.3, cy), cz);
      this.camera.lookAt(lp.x, targetY, lp.z);
    }
  }

  // Smooth remote players interpolation
  updateRemotePlayers(delta) {
    this.remotePlayers.forEach(rp => {
      if (rp.mesh) {
        rp.mesh.position.lerp(rp.targetPos, 0.2);
        // Simple slerp rotation
        rp.mesh.rotation.y = THREE.MathUtils.lerp(rp.mesh.rotation.y, rp.targetRotY, 0.2);
      }
    });
  }

  updateHUD() {
    const roleElem = document.getElementById('hud-role');
    const healthBar = document.getElementById('hud-health-bar');
    const healthText = document.getElementById('hud-health-text');
    const propElem = document.getElementById('hud-prop-type');
    const instElem = document.getElementById('hud-instructions-text');
    const phaseHint = document.getElementById('hud-phase-hint');

    if (roleElem) {
      if (this.localPlayer.role === 'hunter') {
        roleElem.innerText = '🕵️ ACE HUNTER (SEEKER)';
        roleElem.className = 'role-badge role-hunter';
      } else {
        roleElem.innerText = `📦 PROP: ${this.localPlayer.propType.toUpperCase()}`;
        roleElem.className = 'role-badge role-prop';
      }
    }

    if (healthBar) {
      healthBar.style.width = `${Math.max(0, this.localPlayer.health)}%`;
    }
    if (healthText) {
      healthText.innerText = `${this.localPlayer.health} HP`;
    }

    if (propElem) {
      propElem.innerText = this.localPlayer.role === 'prop' ? `Disguise: ${this.localPlayer.propType}` : 'Weapon: Scanner Laser';
    }

    if (instElem) {
      if (this.localPlayer.role === 'hunter') {
        instElem.innerHTML = 'WASD: Move | Space: Jump | <strong style="color:var(--cyan);">Left-Click: 🎯 Shoot</strong> | <strong>V: 🎙️ Mic</strong>';
      } else {
        instElem.innerHTML = 'WASD: Move | Space: Jump | <strong style="color:var(--pink);">F/L: 🔒 Freeze</strong> | T: 🗣️ Taunt | <strong>V: 🎙️ Mic</strong>';
      }
    }

    if (phaseHint) {
      if (this.currentPhase === 'HIDING') {
        if (this.localPlayer.role === 'hunter') {
          phaseHint.innerText = '🔒 You are in observation cage! Props are scattering below...';
        } else {
          phaseHint.innerText = '🏃 RUN & HIDE! Press [F] to Freeze disguise before Hunter is released!';
        }
      } else if (this.currentPhase === 'HUNTING') {
        if (this.localPlayer.role === 'hunter') {
          phaseHint.innerText = '🔍 Roam the map! Left-Click to Shoot suspicious objects!';
        } else {
          phaseHint.innerText = '🤫 Stay still and survive! Press [T] to taunt for bonus score!';
        }
      }
    }
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    const delta = Math.min(this.clock.getDelta(), 0.1);

    this.updatePhysics(delta);
    this.updateCamera();
    this.updateRemotePlayers(delta);

    if (this.sky) this.sky.position.copy(this.camera.position);
    this.renderer.render(this.scene, this.camera);
  }
}

window.GameEngine = GameEngine;
