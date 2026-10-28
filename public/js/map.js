// Ultra-Realistic 3D Arena & Environment Builder
//
// Visual pass notes: colliders, wall/furniture positions and the static prop
// list are unchanged. Purely decorative meshes added here (skirting, cushions,
// frames, stands, light cones, rooftop beacons) are excluded from raycasts so the
// hunter's shots hit exactly what they hit before.
const MapBuilder = {
  colliders: [],
  staticProps: [],

  _lin(hex) {
    return new THREE.Color(hex).convertSRGBToLinear();
  },

  _deco(mesh) {
    if (window.GFX) window.GFX.noRaycast(mesh);
    else mesh.raycast = function () {};
    return mesh;
  },

  _set(name) {
    try {
      return window.TextureGenerator.getSet(name);
    } catch (e) {
      console.warn('[map] texture set failed:', name, e);
      return null;
    }
  },

  // MeshStandardMaterial carrying a procedural PBR set when it is available.
  _std(setName, params, normalScale) {
    const p = Object.assign({}, params);
    const s = setName ? this._set(setName) : null;
    if (s) {
      p.map = s.map;
      p.normalMap = s.normalMap;
      p.roughnessMap = s.roughnessMap;
      if (normalScale) p.normalScale = new THREE.Vector2(normalScale, normalScale);
    }
    return new THREE.MeshStandardMaterial(p);
  },

  _rbox(w, h, d, r) {
    return window.GFX ? window.GFX.roundedBox(w, h, d, r) : new THREE.BoxGeometry(w, h, d);
  },

  _floor(group, w, d, x, y, z, mat, tile) {
    const geo = new THREE.PlaneGeometry(w, d);
    if (window.GFX) window.GFX.scaleUV(geo, w / tile, d / tile);
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    m.receiveShadow = true;
    group.add(m);
    return m;
  },

  buildMap(scene) {
    this.colliders = [];
    this.staticProps = [];
    const L = h => this._lin(h);
    const lowTier = window.GFX && window.GFX.quality.low;

    const mapGroup = new THREE.Group();

    // 1. Floors. One texture tile = 4 m, so planks, slabs and stones read at
    // real-world size on every surface.
    this._floor(mapGroup, 30, 30, 15, 0.01, -15,
      this._std('wood', { color: 0xffffff, roughness: 1, metalness: 0 }, 0.8), 4);
    this._floor(mapGroup, 30, 30, -15, 0.01, -15,
      this._std('concrete', { color: L(0xe6e8ee), roughness: 1, metalness: 0 }, 1), 4);
    this._floor(mapGroup, 30, 30, 15, 0.01, 15,
      this._std('concrete', { color: L(0xd8cfc2), roughness: 0.95, metalness: 0 }, 1.2), 4);
    this._floor(mapGroup, 30, 30, -15, 0.01, 15,
      this._std('stone', { color: 0xffffff, roughness: 1, metalness: 0 }, 1), 4);

    // Centre crossing: dark polished concrete that picks up reflections.
    const pathMat = this._std('concrete', { color: L(0x4a5068), roughness: 0.55, metalness: 0 }, 0.6);
    this._floor(mapGroup, 60, 6, 0, 0.015, 0, pathMat, 4);
    this._floor(mapGroup, 6, 60, 0, 0.015, 0, pathMat, 4);

    // Hazard caution line in the warehouse (texture tile is 3.2 x 0.8 m).
    const hazard = this._floor(mapGroup, 30, 0.8, -15, 0.02, -1,
      this._std('hazard', { color: 0xffffff, roughness: 1, metalness: 0 }, 0.8), 0.8);
    if (window.GFX) window.GFX.scaleUV(hazard.geometry, 0.8 / 3.2, 1);

    // 2. Walls: painted industrial brick at real scale (2.4 m tile) with a
    // dark skirting board.
    const wallMat = this._std('brick', { color: 0xffffff, roughness: 1, metalness: 0 }, 1);
    const wallHeight = 4.8;
    const wallThick = 1;

    // Perimeter Walls
    this.createWall(mapGroup, 0, wallHeight / 2, -30, 60, wallHeight, wallThick, wallMat);
    this.createWall(mapGroup, 0, wallHeight / 2, 30, 60, wallHeight, wallThick, wallMat);
    this.createWall(mapGroup, -30, wallHeight / 2, 0, wallThick, wallHeight, 60, wallMat);
    this.createWall(mapGroup, 30, wallHeight / 2, 0, wallThick, wallHeight, 60, wallMat);

    // Interior Room Dividers (with doorways)
    this.createWall(mapGroup, -18, wallHeight / 2, -10, 16, wallHeight, wallThick, wallMat);
    this.createWall(mapGroup, -5, wallHeight / 2, -20, wallThick, wallHeight, 14, wallMat);

    this.createWall(mapGroup, 18, wallHeight / 2, -10, 16, wallHeight, wallThick, wallMat);
    this.createWall(mapGroup, 5, wallHeight / 2, -20, wallThick, wallHeight, 14, wallMat);

    this.createWall(mapGroup, -18, wallHeight / 2, 10, 16, wallHeight, wallThick, wallMat);
    this.createWall(mapGroup, -5, wallHeight / 2, 20, wallThick, wallHeight, 14, wallMat);

    this.createWall(mapGroup, 18, wallHeight / 2, 10, 16, wallHeight, wallThick, wallMat);
    this.createWall(mapGroup, 5, wallHeight / 2, 20, wallThick, wallHeight, 14, wallMat);

    // Architectural support columns: board-formed concrete with steel base trim.
    const colMat = this._std('concrete', { color: L(0xa4aab8), roughness: 1, metalness: 0 }, 1.2);
    const trimMat = this._std('metal', { color: L(0x2a2f3a), roughness: 1.2, metalness: 0.8 }, 0.5);
    [
      { x: -8, z: -8 }, { x: 8, z: -8 },
      { x: -8, z: 8 }, { x: 8, z: 8 }
    ].forEach(p => {
      this.createWall(mapGroup, p.x, wallHeight / 2, p.z, 2, wallHeight, 2, colMat, { rounded: 0.05, tile: 4, skirting: false });
      const trim = new THREE.Mesh(this._rbox(2.3, 0.4, 2.3, 0.04), trimMat);
      trim.position.set(p.x, 0.2, p.z);
      trim.castShadow = true;
      trim.receiveShadow = true;
      mapGroup.add(trim);
      const cap = this._deco(new THREE.Mesh(this._rbox(2.12, 0.12, 2.12, 0.03), trimMat));
      cap.position.set(p.x, wallHeight - 0.06, p.z);
      cap.castShadow = true;
      mapGroup.add(cap);
    });

    // 3. Distant city skyline & stars.
    this.buildCitySkyline(mapGroup);

    // 4. Furniture & fixtures.
    this.buildFurniture(mapGroup, lowTier);

    // 5. Suspended hunter waiting cage: steel deck and real glass.
    const cageFloor = new THREE.Mesh(
      this._rbox(8, 0.4, 8, 0.05),
      this._std('metal', { color: L(0x2a3142), roughness: 0.9, metalness: 0.85 }, 0.6)
    );
    cageFloor.position.set(0, 14, 0);
    cageFloor.receiveShadow = true;

    const glassParams = {
      color: L(0x9fefff),
      metalness: 0,
      roughness: 0.04,
      transparent: true,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
      envMapIntensity: 1.5
    };
    const glassMat = new THREE.MeshPhysicalMaterial(glassParams);
    // r128 transmission only scales alpha by (1 - transmission + specular), which
    // is exactly the cheap glass we want; fall back to plain opacity otherwise.
    if ('transmission' in glassMat) {
      glassMat.transmission = 0.9;
      glassMat.opacity = 1;
    } else {
      glassMat.opacity = 0.28;
    }
    const cageGlass = new THREE.Mesh(new THREE.BoxGeometry(8, 3, 8), glassMat);
    cageGlass.position.set(0, 15.5, 0);
    mapGroup.add(cageFloor, cageGlass);

    // Steel frame along the glass edges.
    const frameMat = trimMat;
    const bar = (w, h, d, x, y, z) => {
      const m = this._deco(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), frameMat));
      m.position.set(x, y, z);
      mapGroup.add(m);
    };
    [-4, 4].forEach(a => [-4, 4].forEach(b => bar(0.08, 3, 0.08, a, 15.5, b)));
    [-4, 4].forEach(a => {
      bar(8, 0.08, 0.08, 0, 17, a);
      bar(0.08, 0.08, 8, a, 17, 0);
    });

    // 6. Populate with Static Camouflage Props
    this.populateStaticProps(mapGroup);

    scene.add(mapGroup);
    return mapGroup;
  },

  // City skyline: dark towers with lit-window emissive maps, rooftop beacons.
  buildCitySkyline(group) {
    const L = h => this._lin(h);
    let windows = null;
    try { windows = window.TextureGenerator.createWindowTexture(); } catch (e) { windows = null; }
    const bldgMat = new THREE.MeshStandardMaterial({
      color: L(0x121620),
      roughness: 0.7,
      metalness: 0.3,
      emissive: windows ? new THREE.Color(0xffffff) : L(0x000000),
      emissiveMap: windows,
      emissiveIntensity: 1.6
    });
    const beaconMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: L(0xff2a2a), emissiveIntensity: 4 });
    const beaconGeo = new THREE.SphereGeometry(0.35, 8, 6);

    for (let i = 0; i < 30; i++) {
      const angle = (i / 30) * Math.PI * 2;
      const dist = 55 + (i % 5) * 6;
      const h = 25 + Math.sin(i * 3) * 15;
      const w = 6 + (i % 3) * 3;

      const geo = new THREE.BoxGeometry(w, h, w);
      if (window.GFX) {
        // ~1.6 m per window column and 3 m per floor; roofs sample the black frame.
        window.GFX.boxWorldUV(geo, w, h, w, 25.6, 96);
        const uv = geo.attributes.uv;
        const per = uv.count / 6;
        const ou = (i * 0.37) % 1, ov = (i * 0.21) % 1;
        for (let k = 0; k < uv.count; k++) {
          const face = Math.floor(k / per);
          if (face === 2 || face === 3) uv.setXY(k, 0.005, 0.005);
          else uv.setXY(k, uv.getX(k) + ou, uv.getY(k) + ov);
        }
        uv.needsUpdate = true;
      }
      const bldg = new THREE.Mesh(geo, bldgMat);
      bldg.position.set(Math.cos(angle) * dist, h / 2 - 5, Math.sin(angle) * dist);
      group.add(bldg);

      if (h > 30) {
        const b = this._deco(new THREE.Mesh(beaconGeo, beaconMat));
        b.position.set(bldg.position.x, h - 5 + 0.6, bldg.position.z);
        group.add(b);
      }
    }

    // Stars: same field as before, but small and faint so the sky reads as dusk.
    const starCount = 300;
    const starGeo = new THREE.BufferGeometry();
    const starPos = [];
    for (let i = 0; i < starCount; i++) {
      starPos.push(
        (Math.random() - 0.5) * 140,
        25 + Math.random() * 40,
        (Math.random() - 0.5) * 140
      );
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({
      color: L(0xc8d8ff),
      size: 0.22,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      fog: false
    });
    group.add(new THREE.Points(starGeo, starMat));
  },

  // Furniture: desk & monitors, leather sofa, vending machine, posters, lamps.
  buildFurniture(group, lowTier) {
    const L = h => this._lin(h);
    const TG = window.TextureGenerator;
    const deco = m => this._deco(m);
    const shadow = m => { m.castShadow = true; m.receiveShadow = true; return m; };

    const deskMat = this._std('darkwood', { color: 0xffffff, roughness: 1, metalness: 0 }, 0.6);
    const metalMat = this._std('metal', { color: L(0x34373d), roughness: 1.1, metalness: 0.9 }, 0.4);
    const plasticMat = new THREE.MeshStandardMaterial({ color: L(0x17191e), roughness: 0.45, metalness: 0 });
    const screen = (accent, seed) => {
      let t = null;
      try { t = TG.createScreenTexture(accent, seed); } catch (e) { t = null; }
      return new THREE.MeshStandardMaterial({
        color: 0x000000,
        roughness: 0.2,
        metalness: 0,
        emissive: t ? new THREE.Color(0xffffff) : L(accent === '#00f0ff' ? 0x00f0ff : 0xff0077),
        emissiveMap: t,
        emissiveIntensity: 1.6
      });
    };

    // A. Executive desk with two monitors.
    const deskTop = shadow(new THREE.Mesh(this._rbox(2.4, 0.1, 1.2, 0.02), deskMat));
    deskTop.position.set(20, 0.85, -20);
    const legL = shadow(new THREE.Mesh(this._rbox(0.1, 0.85, 1.1, 0.02), metalMat));
    legL.position.set(18.9, 0.425, -20);
    const legR = legL.clone();
    legR.position.x = 21.1;
    group.add(deskTop, legL, legR);

    const kb = deco(shadow(new THREE.Mesh(this._rbox(0.45, 0.02, 0.15, 0.006), plasticMat)));
    kb.position.set(20, 0.91, -19.65);
    group.add(kb);

    [[19.6, 0.2, '#00f0ff', 3], [20.4, -0.2, '#ff2e88', 9]].forEach(([x, ry, accent, seed]) => {
      const mon = shadow(new THREE.Mesh(this._rbox(0.7, 0.45, 0.05, 0.012), plasticMat));
      mon.position.set(x, 1.2, -19.9);
      mon.rotation.y = ry;
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.65, 0.4), screen(accent, seed));
      scr.position.set(x, 1.2, -19.86);
      scr.rotation.y = ry;
      const neck = deco(shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.28, 10), metalMat)));
      neck.position.set(x, 1.0, -19.94);
      const foot = deco(shadow(new THREE.Mesh(this._rbox(0.24, 0.015, 0.16, 0.006), metalMat)));
      foot.position.set(x, 0.908, -19.94);
      foot.rotation.y = ry;
      group.add(mon, scr, neck, foot);
    });

    this.colliders.push({ minX: 18.5, maxX: 21.5, minZ: -20.8, maxZ: -19.2 });

    // B. Leather lounge sofa (outer shapes unchanged, cushions and arms added).
    const leather = new THREE.MeshPhysicalMaterial({ color: L(0x3a2c24), roughness: 0.5, metalness: 0, clearcoat: 0.25, clearcoatRoughness: 0.5 });
    const sofaBase = shadow(new THREE.Mesh(this._rbox(2.6, 0.4, 1.0, 0.06), leather));
    sofaBase.position.set(14, 0.25, -13);
    const sofaBack = shadow(new THREE.Mesh(this._rbox(2.6, 0.6, 0.3, 0.1), leather));
    sofaBack.position.set(14, 0.65, -13.35);
    group.add(sofaBase, sofaBack);
    [13.37, 14.63].forEach(x => {
      const c = deco(shadow(new THREE.Mesh(this._rbox(1.22, 0.14, 0.72, 0.06), leather)));
      c.position.set(x, 0.5, -12.88);
      group.add(c);
    });
    [12.82, 15.18].forEach(x => {
      const a = deco(shadow(new THREE.Mesh(this._rbox(0.22, 0.28, 0.98, 0.08), leather)));
      a.position.set(x, 0.58, -13.0);
      group.add(a);
    });
    [[12.85, -12.6], [15.15, -12.6], [12.85, -13.4], [15.15, -13.4]].forEach(([x, z]) => {
      const f = deco(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.025, 0.05, 8), metalMat));
      f.position.set(x, 0.025, z);
      group.add(f);
    });
    this.colliders.push({ minX: 12.5, maxX: 15.5, minZ: -13.8, maxZ: -12.3 });

    // C. Vending machine: painted steel cabinet, back-lit product window, glass.
    const vmMat = this._std('metal', { color: L(0x2e4470), roughness: 1.1, metalness: 0.3 }, 0.4);
    const vmBody = shadow(new THREE.Mesh(this._rbox(1.2, 2.2, 0.9, 0.04), vmMat));
    vmBody.position.set(-20, 1.1, 8);
    let vendTex = null;
    try { vendTex = TG.createVendingTexture(); } catch (e) { vendTex = null; }
    const vmGlass = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 1.4),
      new THREE.MeshStandardMaterial({
        color: 0x000000, roughness: 0.3, metalness: 0,
        emissive: vendTex ? new THREE.Color(0xffffff) : L(0xffea00),
        emissiveMap: vendTex,
        emissiveIntensity: 1.3
      })
    );
    vmGlass.position.set(-20, 1.2, 8.46);
    group.add(vmBody, vmGlass);
    const pane = deco(new THREE.Mesh(
      new THREE.PlaneGeometry(0.92, 1.42),
      new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.12, clearcoat: 1 })
    ));
    pane.position.set(-20, 1.2, 8.47);
    const header = deco(new THREE.Mesh(
      new THREE.PlaneGeometry(1.0, 0.18),
      new THREE.MeshStandardMaterial({ color: 0x000000, emissive: L(0xff2e5a), emissiveIntensity: 2.2 })
    ));
    header.position.set(-20, 2.03, 8.455);
    const slot = deco(new THREE.Mesh(this._rbox(0.7, 0.16, 0.04, 0.01), plasticMat));
    slot.position.set(-20, 0.3, 8.45);
    group.add(pane, header, slot);
    this.colliders.push({ minX: -20.8, maxX: -19.2, minZ: 7.3, maxZ: 8.7 });

    // D. Back-lit posters in steel frames.
    const posterGeo = new THREE.PlaneGeometry(1.6, 2.2);
    [[18, 'cyan', 0x00f0ff], [-18, 'pink', 0xff0077]].forEach(([x, theme, fallback]) => {
      let t = null;
      try { t = TG.createPosterTexture(theme); } catch (e) { t = null; }
      const mat = new THREE.MeshStandardMaterial({
        color: t ? 0xffffff : 0x000000,
        map: t,
        roughness: 0.35,
        metalness: 0,
        emissive: t ? new THREE.Color(0xffffff) : L(fallback),
        emissiveMap: t,
        emissiveIntensity: 0.7
      });
      const poster = new THREE.Mesh(posterGeo, mat);
      poster.position.set(x, 2.4, -29.4);
      const frame = deco(shadow(new THREE.Mesh(this._rbox(1.72, 2.32, 0.05, 0.015), metalMat)));
      frame.position.set(x, 2.4, -29.45);
      group.add(frame, poster);
    });

    // E. Industrial pendant lamps. Two carry the arena's cyan and magenta neon
    // lights; the other two are warm tungsten.
    const shadeMat = this._std('metal', { color: L(0x24332b), roughness: 1, metalness: 0.7, side: THREE.DoubleSide }, 0.4);
    const bulbColors = { '-15,-15': 0x00f0ff, '15,15': 0xff0077 };
    [-15, 15].forEach(x => {
      [-15, 15].forEach(z => {
        const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.8), metalMat);
        cord.position.set(x, 4.0, z);
        const lamp = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.3, 24, 1, true), shadeMat);
        lamp.position.set(x, 3.1, z);
        lamp.castShadow = true;
        const tint = bulbColors[x + ',' + z] || 0xffd9a0;
        const bulb = new THREE.Mesh(
          new THREE.SphereGeometry(0.12),
          new THREE.MeshStandardMaterial({ color: 0x000000, emissive: L(tint), emissiveIntensity: 6 })
        );
        bulb.position.set(x, 3.0, z);
        group.add(cord, lamp, bulb);

        if (!lowTier) {
          // Faint additive light cone - a cheap stand-in for volumetric haze.
          const beam = deco(new THREE.Mesh(
            new THREE.ConeGeometry(2.0, 2.9, 32, 1, true),
            new THREE.MeshBasicMaterial({
              color: L(tint),
              transparent: true,
              opacity: 0.03,
              blending: THREE.AdditiveBlending,
              depthWrite: false,
              side: THREE.DoubleSide
            })
          ));
          beam.position.set(x, 1.5, z);
          group.add(beam);
        }
      });
    });
  },

  // Populate Inanimate Static Props that players camouflage as
  populateStaticProps(group) {
    const props = [
      // Boxes in warehouse
      { type: 'box', x: -18, z: -22, r: 0.2 },
      { type: 'box', x: -19, z: -21, r: -0.4 },
      { type: 'box', x: -18, z: -21, y: 0.8, r: 0.1 },
      { type: 'box', x: -12, z: -25, r: 0.7 },
      { type: 'box', x: -25, z: -18, r: 0.3 },
      { type: 'box', x: 2, z: -5, r: 0 },
      { type: 'box', x: 22, z: 22, r: 0.5 },

      // Barrels
      { type: 'barrel', x: -22, z: -15, r: 0 },
      { type: 'barrel', x: -21, z: -16, r: 0.8 },
      { type: 'barrel', x: 18, z: 24, r: 0 },
      { type: 'barrel', x: 20, z: 23, r: 0.3 },

      // Office Chairs
      { type: 'chair', x: 20, z: -18.8, r: 0 },
      { type: 'chair', x: 16, z: -24, r: Math.PI / 4 },
      { type: 'chair', x: 22, z: -16, r: -Math.PI / 3 },
      { type: 'chair', x: -2, z: 2, r: Math.PI },

      // Plants
      { type: 'plant', x: -22, z: 22, r: 0 },
      { type: 'plant', x: -15, z: 24, r: 0.4 },
      { type: 'plant', x: -24, z: 16, r: -0.2 },
      { type: 'plant', x: 10, z: -12, r: 0 },
      { type: 'plant', x: -10, z: -12, r: 0 },

      // Trash Cans
      { type: 'trash', x: 4, z: -9, r: 0 },
      { type: 'trash', x: -4, z: 9, r: 0 },
      { type: 'trash', x: 27, z: -27, r: 0 },
      { type: 'trash', x: -27, z: 27, r: 0 },

      // Watermelons in lounge pantry
      { type: 'watermelon', x: 24, z: -14, r: 0.2 },
      { type: 'watermelon', x: 25, z: -15, r: -0.5 },

      // Tires in workshop
      { type: 'tire', x: 24, z: 18, r: 0.1 },
      { type: 'tire', x: 25, z: 17, r: 0.7 },
      { type: 'tire', x: 24.5, z: 17.5, y: 0.35, r: 0.3 },

      // Toilets
      { type: 'toilet', x: -26, z: -5, r: Math.PI / 2 },
      { type: 'toilet', x: -26, z: 5, r: Math.PI / 2 }
    ];

    props.forEach(dp => {
      const propMesh = window.PropBuilder.createProp(dp.type);
      propMesh.position.set(dp.x, dp.y || 0, dp.z);
      if (dp.r) propMesh.rotation.y = dp.r;
      propMesh.isStaticProp = true;
      group.add(propMesh);
      this.staticProps.push(propMesh);
    });
  },

  // opts: { rounded: edge radius, tile: texture metres, skirting: bool }
  createWall(group, x, y, z, w, h, d, mat, opts) {
    opts = opts || {};
    const geo = opts.rounded && window.GFX
      ? window.GFX.roundedBox(w, h, d, opts.rounded)
      : new THREE.BoxGeometry(w, h, d);
    if (window.GFX) window.GFX.boxWorldUV(geo, w, h, d, opts.tile || 2.4);
    const wall = new THREE.Mesh(geo, mat);
    wall.position.set(x, y, z);
    wall.castShadow = true;
    wall.receiveShadow = true;
    group.add(wall);

    if (opts.skirting !== false) {
      if (!this._skirtMat) {
        this._skirtMat = new THREE.MeshStandardMaterial({ color: this._lin(0x1b1d22), roughness: 0.55, metalness: 0.2 });
      }
      const skirt = this._deco(new THREE.Mesh(new THREE.BoxGeometry(w + 0.04, 0.16, d + 0.04), this._skirtMat));
      skirt.position.set(x, 0.08, z);
      skirt.receiveShadow = true;
      group.add(skirt);
    }

    this.colliders.push({
      minX: x - w / 2 - 0.4,
      maxX: x + w / 2 + 0.4,
      minZ: z - d / 2 - 0.4,
      maxZ: z + d / 2 + 0.4
    });
  },

  checkCollision(x, z) {
    if (x < -28.5 || x > 28.5 || z < -28.5 || z > 28.5) {
      return true;
    }

    for (let i = 0; i < this.colliders.length; i++) {
      const c = this.colliders[i];
      if (x >= c.minX && x <= c.maxX && z >= c.minZ && z <= c.maxZ) {
        return true;
      }
    }
    return false;
  }
};

window.MapBuilder = MapBuilder;
