// Graphics toolkit: quality tier, colour helpers, geometry helpers, sky and image-based lighting.
// Everything here is r128 core only and procedural - no add-on files, no downloaded assets.
(function () {
  const hasWindow = typeof window !== 'undefined';
  const nav = typeof navigator !== 'undefined' ? navigator : {};

  // ---------------------------------------------------------------------------
  // Quality tier. Phones and small CPUs get smaller shadow maps, a capped pixel
  // ratio, half-size textures and fewer lights. `?quality=low|high` overrides.
  // ---------------------------------------------------------------------------
  function detectQuality() {
    let forced = null;
    try {
      if (hasWindow && window.location && window.location.search) {
        forced = new URLSearchParams(window.location.search).get('quality');
      }
    } catch (e) { /* ignore */ }

    let coarse = false;
    try {
      coarse = hasWindow && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    } catch (e) { /* ignore */ }
    const cores = nav.hardwareConcurrency || 0;
    const weakCpu = cores > 0 && cores <= 4;

    let low = coarse || weakCpu;
    if (forced === 'low') low = true;
    if (forced === 'high') low = false;

    const dpr = (hasWindow && window.devicePixelRatio) || 1;
    return low ? {
      name: 'low',
      low: true,
      pixelRatio: Math.min(dpr, 1.25),
      shadowMapSize: 1024,
      softShadows: false,
      textureSize: 512,
      smallTextureSize: 256,
      skyWidth: 1024,
      maxAnisotropy: 4,
      extraLights: false,
      roundSegments: 1,
      curveSegments: 0.6
    } : {
      name: 'high',
      low: false,
      pixelRatio: Math.min(dpr, 2),
      shadowMapSize: 2048,
      softShadows: true,
      textureSize: 1024,
      smallTextureSize: 512,
      skyWidth: 2048,
      maxAnisotropy: 16,
      extraLights: true,
      roundSegments: 2,
      curveSegments: 1
    };
  }

  const quality = detectQuality();

  const GFX = {
    quality,
    renderer: null,
    envOk: false,
    // Late-dusk sun: low in the south-west so walls throw long, readable shadows.
    sunDirection: new THREE.Vector3(0.62, 0.62, 0.48).normalize(),

    // Hex colours are authored in sRGB; lighting maths happens in linear space.
    lin(hex) {
      return new THREE.Color(hex).convertSRGBToLinear();
    },

    // Segment count scaled down on the low tier, never below a sane minimum.
    seg(n, min = 6) {
      return Math.max(min, Math.round(n * quality.curveSegments));
    },

    setRenderer(renderer) {
      this.renderer = renderer;
    },

    maxAnisotropy() {
      let max = 1;
      try {
        if (this.renderer && this.renderer.capabilities && this.renderer.capabilities.getMaxAnisotropy) {
          max = this.renderer.capabilities.getMaxAnisotropy() || 1;
        }
      } catch (e) { max = 1; }
      return Math.min(max, quality.maxAnisotropy);
    },

    // Purely decorative meshes must not change what the hunter's raycast hits.
    noRaycast(mesh) {
      mesh.raycast = function () {};
      mesh.userData.noRaycast = true;
      return mesh;
    },

    // A box with rounded edges and corners, same overall size as BoxGeometry(w, h, d).
    // Port of the idea behind three's RoundedBoxGeometry (not present in r128 core).
    roundedBox(w, h, d, radius, segments) {
      const segs = Math.max(1, segments === undefined ? quality.roundSegments : segments | 0);
      const n = segs * 2 + 1;
      const r = Math.max(0.0001, Math.min(radius, w / 2 - 0.0001, h / 2 - 0.0001, d / 2 - 0.0001));
      const geo = new THREE.BoxGeometry(1, 1, 1, n, n, n);
      const pos = geo.attributes.position;
      const nor = geo.attributes.normal;
      const half = 0.5 / n;
      const bx = w / 2 - r, by = h / 2 - r, bz = d / 2 - r;
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
        v.set(px - Math.sign(px) * half, py - Math.sign(py) * half, pz - Math.sign(pz) * half).normalize();
        pos.setXYZ(i, bx * Math.sign(px) + v.x * r, by * Math.sign(py) + v.y * r, bz * Math.sign(pz) + v.z * r);
        nor.setXYZ(i, v.x, v.y, v.z);
      }
      pos.needsUpdate = true;
      nor.needsUpdate = true;
      geo.computeBoundingBox();
      geo.computeBoundingSphere();
      return geo;
    },

    scaleUV(geo, su, sv) {
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
      uv.needsUpdate = true;
      return geo;
    },

    // World-scale UVs for a BoxGeometry (plain or rounded) so one texture tile
    // covers `tile` metres on every face, whatever the box size.
    boxWorldUV(geo, w, h, d, tileU, tileV) {
      tileV = tileV || tileU;
      const uv = geo.attributes.uv;
      const perFace = uv.count / 6;
      // BoxGeometry face order: +x, -x, +y, -y, +z, -z.
      const spans = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
      for (let f = 0; f < 6; f++) {
        const su = spans[f][0] / tileU, sv = spans[f][1] / tileV;
        for (let i = f * perFace; i < (f + 1) * perFace; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
      }
      uv.needsUpdate = true;
      return geo;
    },

    // Exact vertex AABB of a flat group's meshes (Box3.setFromObject in r128 is
    // only an AABB of transformed AABBs, which overestimates rotated parts).
    preciseBox(group, filter) {
      group.updateMatrixWorld(true);
      const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
      const m = new THREE.Matrix4();
      const box = new THREE.Box3();
      const v = new THREE.Vector3();
      group.traverse(o => {
        if (!o.isMesh || (filter && !filter(o))) return;
        m.multiplyMatrices(inv, o.matrixWorld);
        const pa = o.geometry.attributes.position;
        for (let i = 0; i < pa.count; i++) box.expandByPoint(v.fromBufferAttribute(pa, i).applyMatrix4(m));
      });
      return box;
    },

    // Bake every matching direct child into group space and remap the lot so its
    // exact AABB equals `target`. Used to keep detailed props the same size as the
    // simple shapes players already know.
    fitChildrenToBox(group, target, filter) {
      const cur = this.preciseBox(group, filter);
      if (cur.isEmpty() || target.isEmpty()) return;
      const cs = cur.getSize(new THREE.Vector3());
      const ts = target.getSize(new THREE.Vector3());
      const s = new THREE.Vector3(
        cs.x > 1e-6 ? ts.x / cs.x : 1,
        cs.y > 1e-6 ? ts.y / cs.y : 1,
        cs.z > 1e-6 ? ts.z / cs.z : 1
      );
      const fit = new THREE.Matrix4()
        .makeTranslation(target.min.x, target.min.y, target.min.z)
        .multiply(new THREE.Matrix4().makeScale(s.x, s.y, s.z))
        .multiply(new THREE.Matrix4().makeTranslation(-cur.min.x, -cur.min.y, -cur.min.z));
      group.children.forEach(o => {
        if (!o.isMesh || (filter && !filter(o))) return;
        o.updateMatrix();
        const g = o.geometry.clone();
        g.applyMatrix4(o.matrix);
        g.applyMatrix4(fit);
        g.computeBoundingBox();
        g.computeBoundingSphere();
        o.geometry = g;
        o.position.set(0, 0, 0);
        o.rotation.set(0, 0, 0);
        o.scale.set(1, 1, 1);
        o.updateMatrix();
      });
      return s;
    },

    // Fit the directional light's orthographic shadow camera tightly around a
    // world-space box, seen from the light. The default frustum is 10 x 10 m.
    fitShadowCamera(light, box) {
      const cam = light.shadow.camera;
      const target = light.target.position;
      light.updateMatrixWorld(true);
      light.target.updateMatrixWorld(true);
      cam.position.copy(light.position);
      cam.lookAt(target);
      cam.updateMatrixWorld(true);
      const view = new THREE.Matrix4().copy(cam.matrixWorld).invert();
      const b = new THREE.Box3();
      const v = new THREE.Vector3();
      for (let i = 0; i < 8; i++) {
        v.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
        b.expandByPoint(v.applyMatrix4(view));
      }
      const pad = 1;
      cam.left = b.min.x - pad;
      cam.right = b.max.x + pad;
      cam.bottom = b.min.y - pad;
      cam.top = b.max.y + pad;
      cam.near = Math.max(0.5, -b.max.z - 5);
      cam.far = -b.min.z + 5;
      cam.updateProjectionMatrix();
    },

    // -------------------------------------------------------------------------
    // Sky: an inverted sphere with a painted dusk gradient and a sun glow at the
    // key light's azimuth. Follows the camera, ignores fog, never raycasts.
    // -------------------------------------------------------------------------
    createSky(radius) {
      if (typeof document === 'undefined') return null;
      const W = quality.skyWidth, H = W / 2;
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d');

      // Canvas row 0 is the zenith, row H/2 the horizon (SphereGeometry v-mapping).
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0.00, '#04060f');
      g.addColorStop(0.18, '#070b1c');
      g.addColorStop(0.32, '#0e1530');
      g.addColorStop(0.41, '#1d1f42');
      g.addColorStop(0.46, '#3a2b52');
      g.addColorStop(0.485, '#6a3f5c');
      g.addColorStop(0.50, '#8c5458');
      g.addColorStop(0.51, '#3a2a3c');
      g.addColorStop(0.60, '#1a1624');
      g.addColorStop(1.00, '#0b0a12');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      // Sun glow on the horizon at the light's azimuth. SphereGeometry places
      // u at phi where x = -cos(phi), z = sin(phi).
      const sd = this.sunDirection;
      let u = Math.atan2(sd.z, -sd.x) / (Math.PI * 2);
      if (u < 0) u += 1;
      const gx = u * W, gy = H * 0.5;
      [gx - W, gx, gx + W].forEach(x => {
        ctx.save();
        ctx.translate(x, gy);
        ctx.scale(2.6, 1);
        const rg = ctx.createRadialGradient(0, 0, 0, 0, 0, H * 0.32);
        rg.addColorStop(0, 'rgba(255,176,110,0.75)');
        rg.addColorStop(0.25, 'rgba(230,120,90,0.35)');
        rg.addColorStop(0.6, 'rgba(140,70,90,0.12)');
        rg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = rg;
        ctx.fillRect(-H, -H * 0.5, H * 2, H);
        ctx.restore();
      });

      // Cool city glow opposite the sun so the far skyline does not sit on black.
      [gx - W / 2, gx + W / 2].forEach(x => {
        ctx.save();
        ctx.translate(x, gy);
        ctx.scale(4, 1);
        const rg = ctx.createRadialGradient(0, 0, 0, 0, 0, H * 0.22);
        rg.addColorStop(0, 'rgba(90,110,190,0.30)');
        rg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = rg;
        ctx.fillRect(-H, -H * 0.5, H * 2, H);
        ctx.restore();
      });

      // Thin high cloud streaks, then a little noise to hide gradient banding.
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 40; i++) {
        const y = H * (0.25 + Math.random() * 0.22);
        const x = Math.random() * W;
        const len = W * (0.05 + Math.random() * 0.15);
        ctx.fillStyle = `rgba(120,90,130,${0.01 + Math.random() * 0.02})`;
        ctx.beginPath();
        ctx.ellipse(x, y, len, H * 0.004 + Math.random() * H * 0.006, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      const img = ctx.getImageData(0, 0, W, H);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const n = (Math.random() - 0.5) * 3;
        d[i] += n; d[i + 1] += n; d[i + 2] += n;
      }
      ctx.putImageData(img, 0, 0);

      const tex = new THREE.CanvasTexture(canvas);
      tex.encoding = THREE.sRGBEncoding;
      tex.wrapS = THREE.RepeatWrapping;
      tex.anisotropy = this.maxAnisotropy();

      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        side: THREE.BackSide,
        fog: false,
        depthWrite: false,
        toneMapped: false
      });
      const sky = new THREE.Mesh(new THREE.SphereGeometry(radius || 150, 48, 24), mat);
      sky.renderOrder = -1;
      sky.frustumCulled = false;
      sky.name = 'sky';
      this.noRaycast(sky);
      return sky;
    },

    // -------------------------------------------------------------------------
    // Image-based lighting: a hand-built "room" (box interior with emissive
    // panels, in the spirit of three's RoomEnvironment) prefiltered by PMREM.
    // Returns a texture for scene.environment, or null so the caller can fall
    // back to plain lights rather than a black screen.
    // -------------------------------------------------------------------------
    buildEnvironment(renderer) {
      if (!renderer || typeof THREE.PMREMGenerator !== 'function') return null;
      const disposables = [];
      let pmrem = null;
      try {
        const room = new THREE.Scene();
        const basic = (r, g, b) => {
          const m = new THREE.MeshBasicMaterial({ side: THREE.BackSide, toneMapped: false });
          m.color.setRGB(r, g, b);
          disposables.push(m);
          return m;
        };
        const panelMat = (r, g, b) => {
          const m = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false });
          m.color.setRGB(r, g, b);
          disposables.push(m);
          return m;
        };

        // Shell: dark asphalt floor, dim blue-grey walls, dusk-blue ceiling (sky).
        const shellGeo = new THREE.BoxGeometry(20, 10, 20);
        disposables.push(shellGeo);
        const shell = new THREE.Mesh(shellGeo, [
          basic(0.08, 0.08, 0.1), basic(0.08, 0.08, 0.1),
          basic(0.09, 0.10, 0.16), basic(0.018, 0.016, 0.02),
          basic(0.08, 0.08, 0.1), basic(0.08, 0.08, 0.1)
        ]);
        shell.position.y = 3;
        room.add(shell);

        const planeGeo = new THREE.PlaneGeometry(1, 1);
        disposables.push(planeGeo);
        const panel = (mat, w, h, x, y, z, lookX, lookY, lookZ) => {
          const p = new THREE.Mesh(planeGeo, mat);
          p.scale.set(w, h, 1);
          p.position.set(x, y, z);
          p.lookAt(lookX, lookY, lookZ);
          room.add(p);
        };

        // Broad skylight overhead.
        panel(panelMat(0.28, 0.34, 0.52), 12, 12, 0, 7.9, 0, 0, 0, 0);
        // Warm dusk sun panel low on the wall in the key light's direction.
        const sd = this.sunDirection;
        const sx = sd.x / Math.max(Math.abs(sd.x), Math.abs(sd.z)) * 9.8;
        const sz = sd.z / Math.max(Math.abs(sd.x), Math.abs(sd.z)) * 9.8;
        panel(panelMat(5.0, 2.7, 1.4), 5, 2.2, sx, 1.6, sz, 0, 1.6, 0);
        panel(panelMat(1.1, 0.6, 0.45), 12, 1.2, sx * 0.99, 0.4, sz * 0.99, 0, 0.4, 0);
        // Neon city strips: cyan and magenta, matching the arena's point lights.
        panel(panelMat(0.25, 1.6, 2.0), 7, 0.5, -9.8, 2.2, -3, 0, 2.2, -3);
        panel(panelMat(2.0, 0.25, 1.1), 7, 0.5, 3, 2.4, -9.8, 3, 2.4, 0);
        panel(panelMat(1.4, 1.2, 0.3), 3, 0.4, -4, 2.8, 9.8, -4, 2.8, 0);

        // Dark blockers break the uniform shell so reflections are not flat.
        const blockGeo = new THREE.BoxGeometry(1, 1, 1);
        disposables.push(blockGeo);
        const blockMat = new THREE.MeshBasicMaterial({ color: 0x050507, toneMapped: false });
        disposables.push(blockMat);
        [[-5, -1, 4, 3, 4, 2], [5, -1, -5, 2, 5, 3], [6, -1.5, 6, 4, 2, 2]].forEach(b => {
          const m = new THREE.Mesh(blockGeo, blockMat);
          m.position.set(b[0], b[1] + b[4] / 2, b[2]);
          m.scale.set(b[3], b[4], b[5]);
          room.add(m);
        });

        pmrem = new THREE.PMREMGenerator(renderer);
        const rt = pmrem.fromScene(room, 0.04);

        // Sanity check: a fully black result means the GPU path failed quietly.
        let ok = true;
        try {
          const px = new Uint8Array(4 * 16);
          renderer.readRenderTargetPixels(rt, 120, 120, 4, 4, px);
          ok = false;
          for (let i = 0; i < px.length; i++) if (px[i] !== 0) { ok = true; break; }
        } catch (e) { ok = true; }

        pmrem.dispose();
        disposables.forEach(x => x.dispose && x.dispose());
        if (!ok) {
          rt.dispose();
          return null;
        }
        this.envOk = true;
        return rt.texture;
      } catch (err) {
        console.warn('[graphics] Environment lighting unavailable, using lights only:', err);
        try { if (pmrem) pmrem.dispose(); } catch (e) { /* ignore */ }
        disposables.forEach(x => { try { x.dispose(); } catch (e) { /* ignore */ } });
        return null;
      }
    },

    // Soft vignette over the canvas. Pure CSS, costs nothing on the GPU.
    addVignette(container) {
      if (typeof document === 'undefined' || !container) return;
      const v = document.createElement('div');
      v.className = 'gfx-vignette';
      v.style.cssText = 'position:absolute;inset:0;pointer-events:none;' +
        'background:radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,0.38) 100%);';
      container.appendChild(v);
    }
  };

  if (hasWindow) window.GFX = GFX;
  if (typeof module !== 'undefined' && module.exports) module.exports = GFX;
})();
