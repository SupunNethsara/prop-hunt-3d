// Procedural 3D Prop & Character Builder
//
// Each prop is two things in one group:
//  - invisible "hit proxies": the original simple shapes, unchanged, so the
//    hunter's raycast (which tests real meshes) hits exactly what it always did;
//  - visible detail meshes that never raycast, baked so their exact bounding box
//    equals the proxies' - same footprint and silhouette size players know.
// Everything stays a direct child of the group: game.js skips the local
// player's own meshes by checking `mesh.children`.
const PropBuilder = {
  _mats: null,
  _templates: {},
  _proxyMat: null,

  _lin(hex) {
    return new THREE.Color(hex).convertSRGBToLinear();
  },

  _set(name) {
    try {
      if (typeof document === 'undefined' || !window.TextureGenerator) return null;
      return window.TextureGenerator.getSet(name);
    } catch (e) {
      console.warn('[props] texture set failed:', name, e);
      return null;
    }
  },

  // Materials are built on first use (after the renderer exists) so textures
  // can pick up the GPU's anisotropy.
  mats() {
    if (this._mats) return this._mats;
    const L = h => this._lin(h);
    const withSet = (name, params, normalScale) => {
      const s = this._set(name);
      const p = Object.assign({}, params);
      if (s) {
        p.map = s.map;
        p.normalMap = s.normalMap;
        p.roughnessMap = s.roughnessMap;
        if (normalScale) p.normalScale = new THREE.Vector2(normalScale, normalScale);
      }
      return new THREE.MeshStandardMaterial(p);
    };
    const clay = this._set('concrete');

    this._mats = {
      cardboard: withSet('cardboard', { color: 0xffffff, roughness: 1, metalness: 0 }, 0.6),
      tape: new THREE.MeshStandardMaterial({ color: L(0xb08a55), roughness: 0.3, metalness: 0 }),
      chairPlastic: new THREE.MeshPhysicalMaterial({ color: L(0x2f5fb8), roughness: 0.38, metalness: 0, clearcoat: 0.3, clearcoatRoughness: 0.4 }),
      chairFabric: new THREE.MeshStandardMaterial({ color: L(0x26324a), roughness: 0.95, metalness: 0 }),
      chrome: withSet('metal', { color: L(0xe2e4e8), roughness: 0.55, metalness: 1 }, 0.3),
      metal: withSet('metal', { color: L(0xc4c7cc), roughness: 1, metalness: 1 }, 0.4),
      darkMetal: withSet('metal', { color: L(0x3a3d43), roughness: 1.3, metalness: 0.9 }, 0.4),
      wood: withSet('staves', { color: 0xffffff, roughness: 1, metalness: 0, side: THREE.DoubleSide }, 1),
      lidWood: withSet('darkwood', { color: L(0xb08060), roughness: 1, metalness: 0 }, 0.8),
      ironRing: withSet('metal', { color: L(0x34343a), roughness: 1.6, metalness: 1 }, 0.8),
      plantPot: new THREE.MeshStandardMaterial({
        color: L(0x9a5440), roughness: 0.92, metalness: 0,
        normalMap: clay ? clay.normalMap : null,
        normalScale: new THREE.Vector2(0.6, 0.6)
      }),
      leaf: new THREE.MeshStandardMaterial({ color: L(0x2f7d40), roughness: 0.5, metalness: 0, side: THREE.DoubleSide }),
      leafDark: new THREE.MeshStandardMaterial({ color: L(0x23633a), roughness: 0.55, metalness: 0, side: THREE.DoubleSide }),
      stem: new THREE.MeshStandardMaterial({ color: L(0x4f6b2a), roughness: 0.7, metalness: 0 }),
      dirt: new THREE.MeshStandardMaterial({
        color: L(0x3a2a1c), roughness: 1, metalness: 0,
        normalMap: clay ? clay.normalMap : null,
        normalScale: new THREE.Vector2(2, 2)
      }),
      trashBody: withSet('metal', { color: L(0xc9cdd2), roughness: 1.25, metalness: 1, side: THREE.DoubleSide }, 0.5),
      melonRind: withSet('melon', { color: 0xffffff, roughness: 1, metalness: 0 }, 1),
      stalk: new THREE.MeshStandardMaterial({ color: L(0x6b5a2a), roughness: 0.9, metalness: 0 }),
      tireRubber: withSet('tire', { color: 0xffffff, roughness: 1, metalness: 0 }, 1),
      toiletCeramic: new THREE.MeshPhysicalMaterial({ color: L(0xf1f1ec), roughness: 0.12, metalness: 0, clearcoat: 0.8, clearcoatRoughness: 0.08 }),
      seatPlastic: new THREE.MeshStandardMaterial({ color: L(0xe9e9e4), roughness: 0.35, metalness: 0 }),
      hunterSuit: new THREE.MeshStandardMaterial({ color: L(0x3c4258), roughness: 0.8, metalness: 0 }),
      hunterArmor: withSet('metal', { color: L(0x6a7590), roughness: 1.1, metalness: 0.45 }, 0.5),
      hunterBoot: new THREE.MeshStandardMaterial({ color: L(0x15161a), roughness: 0.6, metalness: 0 }),
      hunterVisor: new THREE.MeshStandardMaterial({ color: L(0x02181c), emissive: L(0x00f0ff), emissiveIntensity: 2.5, roughness: 0.15, metalness: 0.2 }),
      neonYellow: new THREE.MeshStandardMaterial({ color: L(0x332e00), emissive: L(0xffea00), emissiveIntensity: 3, roughness: 0.4, metalness: 0 })
    };
    return this._mats;
  },

  _mesh(group, geo, mat, x, y, z, rx, ry, rz) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x || 0, y || 0, z || 0);
    m.rotation.set(rx || 0, ry || 0, rz || 0);
    m.castShadow = true;
    m.receiveShadow = true;
    m.userData.visual = true;
    if (window.GFX) window.GFX.noRaycast(m);
    else m.raycast = function () {};
    group.add(m);
    return m;
  },

  _rbox(w, h, d, r) {
    return window.GFX ? window.GFX.roundedBox(w, h, d, r) : new THREE.BoxGeometry(w, h, d);
  },

  _seg(n, min) {
    return window.GFX ? window.GFX.seg(n, min) : n;
  },

  // A cylinder running between two points (limbs, struts).
  _limb(group, mat, ax, ay, az, bx, by, bz, r0, r1) {
    const a = new THREE.Vector3(ax, ay, az), b = new THREE.Vector3(bx, by, bz);
    const len = a.distanceTo(b);
    const m = this._mesh(group, new THREE.CylinderGeometry(r1, r0, len, this._seg(12)), mat);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    return m;
  },

  // A single leaf: tapered blade along +x, arched, with a folded midrib.
  _leafGeometry(len, width, arch, droop) {
    const n = 8;
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = t * len;
      const y = Math.sin(t * Math.PI * 0.85) * arch - t * t * droop;
      const hw = width * Math.pow(Math.sin(Math.PI * Math.min(0.98, t * 0.92 + 0.06)), 0.8);
      const fold = hw * 0.25;
      pos.push(x, y - fold * 0.2, -hw, x, y + fold, 0, x, y - fold * 0.2, hw);
      uv.push(t, 0, t, 0.5, t, 1);
      if (i < n) {
        const a = i * 3, b = (i + 1) * 3;
        idx.push(a, b, a + 1, a + 1, b, b + 1, a + 1, b + 1, a + 2, a + 2, b + 1, b + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  },

  // The original shapes, kept as invisible raycast targets (exact old hitboxes).
  _addProxies(group, type) {
    if (!this._proxyMat) this._proxyMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const pm = this._proxyMat;
    const add = (geo, x, y, z, rx, ry, rz, sx, sy, sz) => {
      const m = new THREE.Mesh(geo, pm);
      m.position.set(x || 0, y || 0, z || 0);
      m.rotation.set(rx || 0, ry || 0, rz || 0);
      if (sx) m.scale.set(sx, sy, sz);
      m.visible = false;
      m.userData.hitProxy = true;
      group.add(m);
      return m;
    };
    switch (type) {
      case 'chair':
        add(new THREE.BoxGeometry(0.7, 0.1, 0.7), 0, 0.45, 0);
        add(new THREE.BoxGeometry(0.7, 0.7, 0.1), 0, 0.8, -0.3);
        add(new THREE.CylinderGeometry(0.05, 0.05, 0.45, 8), 0, 0.225, 0);
        add(new THREE.BoxGeometry(0.7, 0.05, 0.1), 0, 0.025, 0);
        add(new THREE.BoxGeometry(0.1, 0.05, 0.7), 0, 0.025, 0);
        break;
      case 'plant':
        add(new THREE.CylinderGeometry(0.35, 0.25, 0.6, 12), 0, 0.3, 0);
        add(new THREE.CylinderGeometry(0.33, 0.33, 0.05, 12), 0, 0.58, 0);
        for (let i = 0; i < 6; i++) {
          const angle = (i / 6) * Math.PI * 2;
          add(new THREE.ConeGeometry(0.18, 0.6, 5), Math.cos(angle) * 0.15, 0.7, Math.sin(angle) * 0.15, 0, angle, Math.PI / 4);
        }
        break;
      case 'barrel': {
        add(new THREE.CylinderGeometry(0.42, 0.38, 0.9, 14), 0, 0.45, 0);
        const ring = new THREE.TorusGeometry(0.425, 0.02, 8, 20);
        add(ring, 0, 0.25, 0, Math.PI / 2);
        add(ring, 0, 0.65, 0, Math.PI / 2);
        break;
      }
      case 'trash':
        add(new THREE.CylinderGeometry(0.35, 0.3, 0.8, 14), 0, 0.4, 0);
        add(new THREE.CylinderGeometry(0.38, 0.38, 0.1, 14), 0, 0.85, 0);
        add(new THREE.TorusGeometry(0.08, 0.02, 6, 12), 0, 0.93, 0, Math.PI / 2);
        break;
      case 'watermelon':
        add(new THREE.SphereGeometry(0.45, 14, 12), 0, 0.45, 0, 0, 0, 0, 1.1, 0.9, 1.1);
        break;
      case 'tire':
        add(new THREE.TorusGeometry(0.4, 0.18, 12, 24), 0, 0.18, 0, Math.PI / 2);
        break;
      case 'toilet':
        add(new THREE.CylinderGeometry(0.25, 0.2, 0.45, 12), 0, 0.225, 0);
        add(new THREE.BoxGeometry(0.5, 0.15, 0.6), 0, 0.45, 0.05);
        add(new THREE.BoxGeometry(0.5, 0.5, 0.25), 0, 0.7, -0.2);
        break;
      case 'box':
      default:
        add(new THREE.BoxGeometry(0.8, 0.8, 0.8), 0, 0.4, 0);
        add(new THREE.BoxGeometry(0.82, 0.1, 0.82), 0, 0.4, 0);
        break;
    }
  },

  // Detailed, visible version of each prop.
  _addVisuals(group, type) {
    const M = this.mats();
    const add = (geo, mat, x, y, z, rx, ry, rz) => this._mesh(group, geo, mat, x, y, z, rx, ry, rz);
    const seg = (n, min) => this._seg(n, min);

    switch (type) {
      case 'chair': {
        add(this._rbox(0.7, 0.06, 0.7, 0.025), M.chairPlastic, 0, 0.43, 0);
        add(this._rbox(0.64, 0.07, 0.62, 0.03), M.chairFabric, 0, 0.49, 0.01);
        add(this._rbox(0.7, 0.62, 0.08, 0.035), M.chairPlastic, 0, 0.84, -0.31);
        add(this._rbox(0.6, 0.5, 0.04, 0.018), M.chairFabric, 0, 0.84, -0.255);
        add(this._rbox(0.07, 0.3, 0.03, 0.01), M.chrome, 0, 0.5, -0.31);
        add(new THREE.CylinderGeometry(0.03, 0.03, 0.26, seg(12)), M.chrome, 0, 0.24, 0);
        add(new THREE.CylinderGeometry(0.05, 0.045, 0.1, seg(12)), M.darkMetal, 0, 0.36, 0);
        add(new THREE.CylinderGeometry(0.055, 0.065, 0.06, seg(12)), M.darkMetal, 0, 0.09, 0);
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          const spoke = add(this._rbox(0.05, 0.03, 0.29, 0.012), M.chrome, Math.sin(a) * 0.15, 0.08, Math.cos(a) * 0.15);
          spoke.rotation.y = a;
          add(new THREE.SphereGeometry(0.035, seg(10), seg(8)), M.darkMetal, Math.sin(a) * 0.29, 0.035, Math.cos(a) * 0.29);
        }
        break;
      }

      case 'plant': {
        add(new THREE.CylinderGeometry(0.33, 0.25, 0.56, seg(28), 1, true), M.plantPot, 0, 0.28, 0);
        add(new THREE.CylinderGeometry(0.25, 0.25, 0.01, seg(28)), M.plantPot, 0, 0.005, 0);
        add(new THREE.TorusGeometry(0.33, 0.02, seg(8), seg(32)), M.plantPot, 0, 0.565, 0, Math.PI / 2);
        add(new THREE.CylinderGeometry(0.315, 0.315, 0.02, seg(28)), M.dirt, 0, 0.55, 0);
        // A rosette that reaches further across x than z, like the original.
        const leaves = 11;
        for (let i = 0; i < leaves; i++) {
          const a = (i / leaves) * Math.PI * 2 + 0.3;
          const reach = 1 / Math.sqrt(Math.pow(Math.cos(a) / 0.48, 2) + Math.pow(Math.sin(a) / 0.35, 2));
          const upright = i % 3 === 0;
          const len = upright ? reach * 0.75 : reach * 0.95;
          const g = this._leafGeometry(len, upright ? 0.07 : 0.085, upright ? 0.3 : 0.22, upright ? 0.05 : 0.2);
          const leaf = add(g, i % 2 ? M.leaf : M.leafDark, Math.cos(a) * 0.03, 0.56, -Math.sin(a) * 0.03);
          leaf.rotation.order = 'YXZ';
          leaf.rotation.y = a;
          leaf.rotation.x = (i % 2 ? 0.15 : -0.15);
          leaf.castShadow = true;
        }
        for (let i = 0; i < 4; i++) {
          const a = i * 1.7;
          this._limb(group, M.stem, 0, 0.55, 0, Math.cos(a) * 0.05, 0.68, Math.sin(a) * 0.05, 0.012, 0.008);
        }
        break;
      }

      case 'barrel': {
        const profile = [];
        const r = y => 0.37 + 0.06 * Math.sin((y / 0.9) * Math.PI);
        for (let i = 0; i <= 12; i++) {
          const y = (i / 12) * 0.9;
          profile.push(new THREE.Vector2(r(y), y));
        }
        add(new THREE.LatheGeometry(profile, seg(32, 12)), M.wood, 0, 0, 0);
        add(new THREE.CylinderGeometry(r(0.87) - 0.01, r(0.87) - 0.01, 0.02, seg(28)), M.lidWood, 0, 0.865, 0);
        add(new THREE.CylinderGeometry(r(0.03) - 0.01, r(0.03) - 0.01, 0.02, seg(28)), M.lidWood, 0, 0.03, 0);
        add(new THREE.CylinderGeometry(0.035, 0.035, 0.012, seg(12)), M.darkMetal, 0.15, 0.881, 0.08);
        [0.07, 0.27, 0.63, 0.83].forEach(y => {
          add(new THREE.TorusGeometry(r(y) + 0.006, 0.016, seg(6, 4), seg(36, 16)), M.ironRing, 0, y, 0, Math.PI / 2);
        });
        break;
      }

      case 'trash': {
        add(new THREE.CylinderGeometry(0.35, 0.3, 0.78, seg(32, 12), 1, true), M.trashBody, 0, 0.4, 0);
        add(new THREE.CylinderGeometry(0.3, 0.3, 0.012, seg(32, 12)), M.trashBody, 0, 0.012, 0);
        add(new THREE.TorusGeometry(0.302, 0.012, seg(6, 4), seg(32, 12)), M.trashBody, 0, 0.012, 0, Math.PI / 2);
        [0.22, 0.42, 0.62].forEach(y => {
          const rr = 0.3 + (y / 0.8) * 0.05;
          add(new THREE.TorusGeometry(rr + 0.004, 0.009, seg(6, 4), seg(32, 12)), M.trashBody, 0, y, 0, Math.PI / 2);
        });
        // Lid: rolled lip, shallow dome and a carry handle.
        add(new THREE.CylinderGeometry(0.38, 0.38, 0.05, seg(32, 12)), M.trashBody, 0, 0.825, 0);
        add(new THREE.TorusGeometry(0.37, 0.012, seg(6, 4), seg(32, 12)), M.trashBody, 0, 0.8, 0, Math.PI / 2);
        const dome = add(new THREE.SphereGeometry(0.37, seg(32, 12), seg(8, 4), 0, Math.PI * 2, 0, 0.42), M.trashBody, 0, 0.85 - 0.37 * Math.cos(0.42), 0);
        dome.scale.y = 0.9;
        add(new THREE.TorusGeometry(0.045, 0.012, seg(8, 4), seg(16, 8), Math.PI), M.darkMetal, 0, 0.9, 0);
        break;
      }

      case 'watermelon': {
        const melon = add(new THREE.SphereGeometry(0.45, seg(40, 16), seg(28, 12)), M.melonRind, 0, 0.45, 0);
        melon.scale.set(1.1, 0.9, 1.1);
        add(new THREE.CylinderGeometry(0.01, 0.016, 0.03, seg(8)), M.stalk, 0, 0.85, 0, 0.3, 0, 0.2);
        break;
      }

      case 'tire': {
        add(new THREE.TorusGeometry(0.4, 0.18, seg(20, 10), seg(56, 24)), M.tireRubber, 0, 0.18, 0, Math.PI / 2);
        break;
      }

      case 'toilet': {
        const ped = [];
        [[0.2, 0], [0.205, 0.04], [0.17, 0.12], [0.165, 0.22], [0.2, 0.32], [0.24, 0.37]].forEach(p => ped.push(new THREE.Vector2(p[0], p[1])));
        add(new THREE.LatheGeometry(ped, seg(28, 12)), M.toiletCeramic, 0, 0, 0.0);
        const bowl = add(new THREE.CylinderGeometry(0.25, 0.22, 0.15, seg(32, 12)), M.toiletCeramic, 0, 0.445, 0.05);
        bowl.scale.z = 1.2;
        const seat = add(new THREE.CylinderGeometry(0.245, 0.245, 0.03, seg(32, 12)), M.seatPlastic, 0, 0.535, 0.05);
        seat.scale.z = 1.2;
        add(this._rbox(0.5, 0.47, 0.22, 0.035), M.toiletCeramic, 0, 0.685, -0.2);
        add(this._rbox(0.5, 0.03, 0.25, 0.012), M.toiletCeramic, 0, 0.935, -0.2);
        add(this._rbox(0.06, 0.02, 0.02, 0.006), M.chrome, 0.17, 0.86, -0.085);
        add(new THREE.CylinderGeometry(0.05, 0.05, 0.12, seg(12)), M.toiletCeramic, 0, 0.47, -0.08);
        break;
      }

      case 'box':
      default: {
        add(this._rbox(0.8, 0.796, 0.8, 0.012), M.cardboard, 0, 0.398, 0);
        // Cross-taped lid: strips over the top that run down each side.
        add(new THREE.BoxGeometry(0.82, 0.004, 0.09), M.tape, 0, 0.798, 0);
        add(new THREE.BoxGeometry(0.004, 0.22, 0.09), M.tape, 0.408, 0.686, 0);
        add(new THREE.BoxGeometry(0.004, 0.22, 0.09), M.tape, -0.408, 0.686, 0);
        add(new THREE.BoxGeometry(0.09, 0.0041, 0.82), M.tape, 0, 0.798, 0);
        add(new THREE.BoxGeometry(0.09, 0.22, 0.004), M.tape, 0, 0.686, 0.408);
        add(new THREE.BoxGeometry(0.09, 0.22, 0.004), M.tape, 0, 0.686, -0.408);
        break;
      }
    }
  },

  _template(type) {
    if (this._templates[type]) return this._templates[type];
    const group = new THREE.Group();
    this._addProxies(group, type);
    this._addVisuals(group, type);
    if (window.GFX) {
      const target = window.GFX.preciseBox(group, o => o.userData.hitProxy);
      window.GFX.fitChildrenToBox(group, target, o => o.userData.visual);
    }
    this._templates[type] = group;
    return group;
  },

  // Object3D.clone() does not carry instance-level raycast overrides.
  _instance(template) {
    const g = template.clone();
    g.children.forEach(c => {
      if (c.userData.visual) c.raycast = function () {};
    });
    return g;
  },

  createProp(type) {
    const known = ['chair', 'plant', 'barrel', 'trash', 'watermelon', 'tire', 'toilet', 'box'];
    const key = known.indexOf(type) >= 0 ? type : 'box';
    const group = this._instance(this._template(key));
    group.castShadow = true;
    group.receiveShadow = true;
    group.propType = type;
    return group;
  },

  // Create 3D Hunter Agent Model
  createHunter() {
    if (!this._templates.__hunter) {
      const M = this.mats();
      const hunter = new THREE.Group();

      // Original shapes as invisible hit proxies, including the nested gun group.
      if (!this._proxyMat) this._proxyMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const pm = this._proxyMat;
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.25, 0.9, 10), pm);
      body.position.y = 0.9;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 10), pm);
      head.position.y = 1.5;
      const visor = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 0.15), pm);
      visor.position.set(0, 1.5, 0.18);
      const gun = new THREE.Group();
      const gunBody = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.15, 0.5), pm);
      const gunMuzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.2, 8), pm);
      gunMuzzle.rotation.x = Math.PI / 2;
      gunMuzzle.position.set(0, 0, 0.3);
      gunMuzzle.name = 'gunMuzzle';
      gun.add(gunBody, gunMuzzle);
      gun.position.set(0.4, 0.9, 0.3);
      [body, head, visor, gunBody, gunMuzzle].forEach(m => { m.visible = false; m.userData.hitProxy = true; });
      hunter.add(body, head, visor, gun);

      // Visible armoured agent: boots, legs, torso with vest, arms holding the
      // scanner, helmet with a glowing visor, and a backpack.
      const add = (geo, mat, x, y, z, rx, ry, rz) => this._mesh(hunter, geo, mat, x, y, z, rx, ry, rz);
      const seg = n => this._seg(n);
      [-1, 1].forEach(s => {
        add(this._rbox(0.13, 0.1, 0.25, 0.03), M.hunterBoot, s * 0.1, 0.05, 0.03);
        this._limb(hunter, M.hunterSuit, s * 0.1, 0.1, 0, s * 0.1, 0.48, 0, 0.055, 0.065);
        add(new THREE.SphereGeometry(0.07, seg(12), seg(8)), M.hunterArmor, s * 0.1, 0.49, 0.03);
        this._limb(hunter, M.hunterSuit, s * 0.1, 0.48, 0, s * 0.11, 0.88, 0, 0.065, 0.08);
      });
      add(this._rbox(0.36, 0.16, 0.22, 0.05), M.hunterSuit, 0, 0.9, 0);
      add(this._rbox(0.4, 0.05, 0.24, 0.02), M.hunterBoot, 0, 0.97, 0);
      add(this._rbox(0.42, 0.48, 0.24, 0.08), M.hunterSuit, 0, 1.2, 0);
      add(this._rbox(0.45, 0.34, 0.28, 0.06), M.hunterArmor, 0, 1.24, 0);
      add(this._rbox(0.3, 0.34, 0.12, 0.04), M.hunterArmor, 0, 1.22, -0.19);
      add(this._rbox(0.2, 0.03, 0.01, 0.005), M.hunterVisor, 0, 1.3, -0.252);
      add(new THREE.CylinderGeometry(0.06, 0.07, 0.08, seg(12)), M.hunterSuit, 0, 1.46, 0);
      const helmet = add(new THREE.SphereGeometry(0.16, seg(24), seg(16)), M.hunterArmor, 0, 1.6, 0);
      helmet.scale.set(1, 1.02, 1.08);
      add(new THREE.SphereGeometry(0.168, seg(24), seg(8), Math.PI / 2 - 0.85, 1.7, Math.PI / 2 - 0.32, 0.42), M.hunterVisor, 0, 1.6, 0.012);

      // Arms: shoulders out, forearms forward to the scanner.
      [-1, 1].forEach(s => {
        add(new THREE.SphereGeometry(0.075, seg(12), seg(8)), M.hunterArmor, s * 0.26, 1.38, 0);
        this._limb(hunter, M.hunterSuit, s * 0.27, 1.36, 0, s * 0.25, 1.12, 0.08, 0.055, 0.05);
        this._limb(hunter, M.hunterSuit, s * 0.25, 1.12, 0.08, s * 0.08 + 0.1, 1.06, 0.32, 0.05, 0.045);
        add(new THREE.SphereGeometry(0.05, seg(10), seg(8)), M.hunterBoot, s * 0.08 + 0.1, 1.06, 0.33);
      });

      // Scanner blaster.
      add(this._rbox(0.09, 0.12, 0.46, 0.02), M.darkMetal, 0.1, 1.08, 0.38);
      add(new THREE.CylinderGeometry(0.03, 0.03, 0.18, seg(12)), M.metal, 0.1, 1.1, 0.68, Math.PI / 2);
      add(this._rbox(0.012, 0.03, 0.3, 0.004), M.hunterVisor, 0.15, 1.1, 0.38);
      add(new THREE.CylinderGeometry(0.032, 0.032, 0.02, seg(12)), M.neonYellow, 0.1, 1.1, 0.78, Math.PI / 2);

      this._templates.__hunter = hunter;
    }

    const hunter = this._templates.__hunter.clone();
    hunter.traverse(c => {
      if (c.userData.visual) c.raycast = function () {};
    });
    hunter.gunMuzzle = hunter.getObjectByName('gunMuzzle');
    return hunter;
  }
};

window.PropBuilder = PropBuilder;
