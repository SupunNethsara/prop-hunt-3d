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
      sens: 0.0025
    };

    this.raycaster = new THREE.Raycaster();
    this.hunterFlashlight = null;

    this.init();
  }

  init() {
    // 1. Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0c14);
    this.scene.fog = new THREE.FogExp2(0x0a0c14, 0.02);

    // 2. Camera
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 200);
    this.camera.position.set(0, 2, 5);

    // 3. Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    // 4. Lighting - Bright & Colorful Arcade Feel
    const ambient = new THREE.AmbientLight(0x8ba2c4, 1.1);
    this.scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight.position.set(20, 45, 20);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    this.scene.add(dirLight);

    // Hemispheric light for beautiful sky-ground bounce
    const hemiLight = new THREE.HemisphereLight(0x3a506b, 0x1c2541, 0.8);
    this.scene.add(hemiLight);

    // Atmospheric neon colored point lights
    const p1 = new THREE.PointLight(0x00f0ff, 1.5, 30);
    p1.position.set(-15, 4, -15);
    const p2 = new THREE.PointLight(0xff0077, 1.5, 30);
    p2.position.set(15, 4, 15);
    const p3 = new THREE.PointLight(0xffea00, 1.2, 30);
    p3.position.set(0, 4, 0);
    this.scene.add(p1, p2, p3);

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

    document.addEventListener('mousemove', (e) => {
      if (this.mouse.isLocked) {
        this.localPlayer.rotY -= e.movementX * this.mouse.sens;
        this.localPlayer.pitch -= e.movementY * this.mouse.sens;
      } else if (isMouseDown && document.getElementById('game-screen').classList.contains('active')) {
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        lastX = e.clientX;
        lastY = e.clientY;
        this.localPlayer.rotY -= dx * this.mouse.sens * 1.5;
        this.localPlayer.pitch -= dy * this.mouse.sens * 1.5;
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
          if (this.localPlayer.role === 'prop') {
            this.localPlayer.isFrozen = !this.localPlayer.isFrozen;
            const freezeStatus = document.getElementById('hud-freeze-status');
            if (freezeStatus) {
              freezeStatus.innerText = this.localPlayer.isFrozen ? 'LOCKED / FROZEN 🔒' : 'UNLOCKED 🏃';
              freezeStatus.className = this.localPlayer.isFrozen ? 'badge-locked' : 'badge-unlocked';
            }
          }
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

    // Mouse click for Hunter attacks
    window.addEventListener('mousedown', (e) => {
      if (e.button === 0 && this.mouse.isLocked) {
        if (this.localPlayer.role === 'hunter') {
          this.fireHunterBlaster();
        }
      }
    });
  }

  // Set Local Player Profile & Role
  setLocalPlayer(data) {
    this.localPlayer.id = data.id || this.localPlayer.id;
    this.localPlayer.username = data.username || this.localPlayer.username;
    this.localPlayer.role = data.role || this.localPlayer.role;
    this.localPlayer.propType = data.propType || this.localPlayer.propType;
    this.localPlayer.health = data.health !== undefined ? data.health : 100;
    this.localPlayer.isFrozen = false;

    // Rebuild local mesh
    if (this.localPlayer.mesh) {
      this.scene.remove(this.localPlayer.mesh);
      this.localPlayer.mesh = null;
    }

    if (this.localPlayer.role === 'prop') {
      this.localPlayer.mesh = window.PropBuilder.createProp(this.localPlayer.propType);
      this.scene.add(this.localPlayer.mesh);
    } else if (this.localPlayer.role === 'hunter') {
      // Hunter character
      this.localPlayer.mesh = window.PropBuilder.createHunter();
      this.scene.add(this.localPlayer.mesh);
    }

    this.updateHUD();
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
    window.soundFX.laser();

    // Raycast from camera center
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    const intersects = this.raycaster.intersectObjects(this.scene.children, true);

    let hitPlayerId = null;
    let hitStaticProp = false;
    let hitPoint = null;

    for (let i = 0; i < intersects.length; i++) {
      const hit = intersects[i];
      if (hit.distance > 35) break; // range limit

      // Check if hit object belongs to local player
      if (this.localPlayer.mesh && (hit.object === this.localPlayer.mesh || this.localPlayer.mesh.children.includes(hit.object))) {
        continue;
      }

      hitPoint = hit.point;

      // Find root parent group
      let root = hit.object;
      while (root.parent && root.parent !== this.scene) {
        root = root.parent;
      }

      if (root.playerId && root.isPlayerProp) {
        hitPlayerId = root.playerId;
        break;
      } else if (root.isStaticProp) {
        hitStaticProp = true;
        break;
      } else {
        // Hit a wall/floor
        break;
      }
    }

    // Spawn Laser Tracer Beam
    const origin = this.camera.position.clone().add(new THREE.Vector3(0.2, -0.2, 0).applyQuaternion(this.camera.quaternion));
    const target = hitPoint || this.camera.position.clone().add(this.camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(30));
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
      window.soundFX.hit();
      this.createHitSparks(target, 0x00ff88);
    } else if (hitStaticProp) {
      window.soundFX.misfire();
      this.createHitSparks(target, 0xff0055);
    }
  }

  createLaserBeam(from, to) {
    const geom = new THREE.BufferGeometry().setFromPoints([from, to]);
    const mat = new THREE.LineBasicMaterial({ color: 0x00f0ff, linewidth: 3 });
    const line = new THREE.Line(geom, mat);
    this.scene.add(line);
    setTimeout(() => this.scene.remove(line), 90);
  }

  createHitSparks(pos, colorHex) {
    const count = 12;
    const geom = new THREE.BufferGeometry();
    const positions = [];
    for (let i = 0; i < count; i++) {
      positions.push(pos.x, pos.y, pos.z);
    }
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color: colorHex, size: 0.15 });
    const points = new THREE.Points(geom, mat);
    this.scene.add(points);
    setTimeout(() => this.scene.remove(points), 250);
  }

  // Create Visual 3D Expanding Taunt Wave
  createTauntRipple(x, y, z) {
    const geo = new THREE.RingGeometry(0.2, 0.4, 24);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffff00, side: THREE.DoubleSide, transparent: true, opacity: 0.8 });
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

    // W = Forward, S = Backward, D = Right, A = Left
    let forward = 0;
    if (this.keys.forward) forward += 1;
    if (this.keys.backward) forward -= 1;

    let strafe = 0;
    if (this.keys.right) strafe += 1;
    if (this.keys.left) strafe -= 1;

    if (forward !== 0 || strafe !== 0) {
      // Normalize input so diagonal movement isn't faster
      const len = Math.hypot(forward, strafe);
      const normF = forward / len;
      const normS = strafe / len;

      // Standard 3D orientation:
      // Looking down -Z when rotY = 0
      const fX = -Math.sin(lp.rotY);
      const fZ = -Math.cos(lp.rotY);
      const rX = Math.cos(lp.rotY);
      const rZ = -Math.sin(lp.rotY);

      const moveX = (fX * normF + rX * normS) * speed;
      const moveZ = (fZ * normF + rZ * normS) * speed;

      const nextX = lp.x + moveX;
      const nextZ = lp.z + moveZ;

      // Check collision with arena walls
      if (!window.MapBuilder.checkCollision(nextX, lp.z)) {
        lp.x = nextX;
      }
      if (!window.MapBuilder.checkCollision(lp.x, nextZ)) {
        lp.z = nextZ;
      }

      // Prop model faces look direction
      lp.mesh.rotation.y = lp.rotY;
    }

    // Gravity & Jump
    const gravity = 25 * delta;
    lp.vy -= gravity;
    lp.y += lp.vy * delta;

    const groundY = 0.0;
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
      const camHeight = 1.6;
      // Camera is placed behind the player (in direction opposite to forward)
      const cx = lp.x + Math.sin(lp.rotY) * camDist * Math.cos(lp.pitch);
      const cz = lp.z + Math.cos(lp.rotY) * camDist * Math.cos(lp.pitch);
      const cy = lp.y + camHeight + Math.sin(lp.pitch) * camDist;

      this.camera.position.set(cx, Math.max(0.3, cy), cz);
      this.camera.lookAt(lp.x, lp.y + 0.6, lp.z);
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

    if (roleElem) {
      roleElem.innerText = this.localPlayer.role.toUpperCase();
      roleElem.className = this.localPlayer.role === 'hunter' ? 'role-hunter' : 'role-prop';
    }

    if (healthBar) {
      healthBar.style.width = `${Math.max(0, this.localPlayer.health)}%`;
    }
    if (healthText) {
      healthText.innerText = `${this.localPlayer.health} HP`;
    }

    if (propElem) {
      propElem.innerText = this.localPlayer.role === 'prop' ? `Prop: ${this.localPlayer.propType}` : 'Role: Ace Hunter';
    }
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    const delta = Math.min(this.clock.getDelta(), 0.1);

    this.updatePhysics(delta);
    this.updateCamera();
    this.updateRemotePlayers(delta);

    this.renderer.render(this.scene, this.camera);
  }
}

window.GameEngine = GameEngine;
