// Procedural PBR texture sets: colour, normal (Sobel of a height field) and roughness.
// All generated on canvases at start-up; nothing is downloaded.
(function () {
  const Q = () => (window.GFX ? window.GFX.quality : { textureSize: 1024, smallTextureSize: 512 });

  // ---------------------------------------------------------------------------
  // Noise and maths helpers
  // ---------------------------------------------------------------------------
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hash2(x, y, seed) {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);
  function smooth(e0, e1, x) {
    const t = clamp01((x - e0) / (e1 - e0));
    return t * t * (3 - 2 * t);
  }

  // Tileable fractal value noise on a w x h grid, values roughly 0..1.
  // cellsX/cellsY set the base frequency; unequal values give streaks (grain).
  function fbm(w, h, cellsX, cellsY, octaves, seed, gain = 0.5) {
    const out = new Float32Array(w * h);
    let amp = 1, total = 0;
    const x0 = new Int32Array(w), x1 = new Int32Array(w), tx = new Float32Array(w);
    for (let o = 0; o < octaves; o++) {
      const cx = Math.min(w, cellsX << o), cy = Math.min(h, cellsY << o);
      const lat = new Float32Array(cx * cy);
      const r = rng(seed * 977 + o * 131 + 7);
      for (let i = 0; i < lat.length; i++) lat[i] = r();
      for (let x = 0; x < w; x++) {
        const f = (x * cx) / w, i = Math.floor(f);
        let t = f - i; t = t * t * (3 - 2 * t);
        x0[x] = i % cx; x1[x] = (i + 1) % cx; tx[x] = t;
      }
      for (let y = 0; y < h; y++) {
        const f = (y * cy) / h, j = Math.floor(f);
        let ty = f - j; ty = ty * ty * (3 - 2 * ty);
        const r0 = (j % cy) * cx, r1 = ((j + 1) % cy) * cx;
        const row = y * w;
        for (let x = 0; x < w; x++) {
          const a = lat[r0 + x0[x]], b = lat[r0 + x1[x]];
          const c = lat[r1 + x0[x]], d = lat[r1 + x1[x]];
          const top = a + (b - a) * tx[x], bot = c + (d - c) * tx[x];
          out[row + x] += amp * (top + (bot - top) * ty);
        }
      }
      total += amp;
      amp *= gain;
    }
    for (let i = 0; i < out.length; i++) out[i] /= total;
    return out;
  }

  // Draw something with the 2D API and get it back as a 0..1 alpha mask.
  function mask(w, h, draw) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    draw(ctx, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;
    const out = new Float32Array(w * h);
    for (let i = 0; i < out.length; i++) out[i] = d[i * 4 + 3] / 255;
    return out;
  }

  function canvasFrom(w, h, rgba) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(w, h);
    img.data.set(rgba);
    ctx.putImageData(img, 0, 0);
    return c;
  }

  // Tangent-space normal map from a tileable height field with a Sobel filter.
  // Canvas y runs down while texture v runs up, hence +dy on the green channel.
  function normalCanvas(w, h, height, strength) {
    const out = new Uint8ClampedArray(w * h * 4);
    const k = strength * (w / 1024);
    for (let y = 0; y < h; y++) {
      const ym = ((y - 1 + h) % h) * w, y0 = y * w, yp = ((y + 1) % h) * w;
      for (let x = 0; x < w; x++) {
        const xm = (x - 1 + w) % w, xp = (x + 1) % w;
        const tl = height[ym + xm], t = height[ym + x], tr = height[ym + xp];
        const l = height[y0 + xm], r = height[y0 + xp];
        const bl = height[yp + xm], b = height[yp + x], br = height[yp + xp];
        const dx = (tr + 2 * r + br) - (tl + 2 * l + bl);
        const dy = (bl + 2 * b + br) - (tl + 2 * t + tr);
        let nx = -dx * k, ny = dy * k, nz = 1;
        const inv = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
        nx *= inv; ny *= inv; nz *= inv;
        const o = (y0 + x) * 4;
        out[o] = (nx * 0.5 + 0.5) * 255;
        out[o + 1] = (ny * 0.5 + 0.5) * 255;
        out[o + 2] = (nz * 0.5 + 0.5) * 255;
        out[o + 3] = 255;
      }
    }
    return canvasFrom(w, h, out);
  }

  function grayCanvas(w, h, values) {
    const out = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < values.length; i++) {
      const v = clamp01(values[i]) * 255;
      out[i * 4] = v; out[i * 4 + 1] = v; out[i * 4 + 2] = v; out[i * 4 + 3] = 255;
    }
    return canvasFrom(w, h, out);
  }

  function toTexture(canvas, srgb) {
    const t = new THREE.CanvasTexture(canvas);
    if (srgb) t.encoding = THREE.sRGBEncoding;
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = window.GFX ? window.GFX.maxAnisotropy() : 1;
    return t;
  }

  // Package a generator's output as { map, normalMap, roughnessMap }.
  function buildSet(w, h, gen) {
    const color = new Uint8ClampedArray(w * h * 4);
    const height = new Float32Array(w * h);
    const rough = new Float32Array(w * h);
    const normalStrength = gen(color, height, rough, w, h);
    return {
      map: toTexture(canvasFrom(w, h, color), true),
      normalMap: toTexture(normalCanvas(w, h, height, normalStrength), false),
      roughnessMap: toTexture(grayCanvas(w, h, rough), false)
    };
  }

  function put(color, i, r, g, b) {
    const o = i * 4;
    color[o] = r; color[o + 1] = g; color[o + 2] = b; color[o + 3] = 255;
  }

  // ---------------------------------------------------------------------------
  // Generators. Each fills colour (sRGB bytes), height (0..1) and roughness
  // (0..1) and returns the normal strength.
  // ---------------------------------------------------------------------------

  // Planks. `rows` planks across the tile; `lenFrac` of the tile per plank
  // (1 = no butt joints, for barrel staves). `vertical` runs planks along v.
  function genWood(opts) {
    return (color, height, rough, w, h) => {
      const S = w, px1 = S / 1024;
      const seed = opts.seed || 11;
      const grain = fbm(S, S, 2, 64, 4, seed + 1);
      const figure = fbm(S, S, 2, 12, 3, seed + 2);
      const wearN = fbm(S, S, 4, 4, 4, seed + 3);
      const rows = opts.rows, ph = S / rows, plankLen = S * opts.lenFrac;
      const gapW = 1.6 * px1 * (opts.gapScale || 1), bevel = 5 * px1;
      const base = opts.base;
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          const a = opts.vertical ? y : x, b = opts.vertical ? x : y;
          const row = Math.floor(b / ph), bb = b - row * ph;
          const off = Math.floor(hash2(row, 0, seed) * S);
          const aa = (a + off) % S;
          const pi = Math.floor(aa / plankLen), al = aa - pi * plankLen;
          const id = hash2(row, pi, seed + 7);
          const sa = (aa + Math.floor(id * 4093)) % S, sb = (b + Math.floor(id * 2311)) % S;
          const ni = sb * S + sa;
          const g = grain[ni], f = figure[ni];
          const ring = 0.5 + 0.5 * Math.sin(g * 30 + f * 9 + id * 20);
          const de = Math.min(bb, ph - bb, opts.lenFrac >= 1 ? 1e9 : Math.min(al, plankLen - al));
          const inPlank = smooth(gapW * 0.5, gapW + bevel, de);
          const dirt = 1 - smooth(gapW, gapW + bevel * 3, de);
          const wear = smooth(0.56, 0.72, wearN[y * S + x]);
          let tone = (0.82 + 0.18 * ring) * (0.8 + 0.4 * id) * (0.9 + 0.2 * g);
          tone *= 1 - dirt * 0.25;
          let r = base[0] * tone, gg = base[1] * tone, bl = base[2] * tone;
          // Worn patches lighten and lose saturation.
          const lum = (r + gg + bl) / 3;
          r += (lum * 1.15 - r) * wear * 0.35; gg += (lum * 1.1 - gg) * wear * 0.35; bl += (lum * 1.05 - bl) * wear * 0.35;
          if (inPlank < 0.5) { r *= 0.35; gg *= 0.33; bl *= 0.3; }
          const i = y * S + x;
          put(color, i, r, gg, bl);
          height[i] = inPlank * 0.55 + g * 0.25 + ring * 0.08;
          rough[i] = (opts.roughBase || 0.42) + (1 - ring) * 0.1 + wear * 0.22 + dirt * 0.15 + (1 - inPlank) * 0.3;
        }
      }
      return opts.normal || 2.2;
    };
  }

  function genConcrete(opts) {
    return (color, height, rough, w, h) => {
      const S = w, px1 = S / 1024, seed = opts.seed || 21;
      const blot = fbm(S, S, 4, 4, 5, seed + 1);
      const mid = fbm(S, S, 16, 16, 3, seed + 2);
      const fine = fbm(S, S, 128, 128, 2, seed + 3);
      const stainN = fbm(S, S, 3, 3, 4, seed + 4);
      const r = rng(seed);
      const cracks = mask(S, S, (ctx) => {
        ctx.strokeStyle = '#fff';
        ctx.lineCap = 'round';
        for (let c = 0; c < 3; c++) {
          let x = r() * S, y = r() * S, ang = r() * Math.PI * 2;
          ctx.lineWidth = (0.8 + r() * 1.2) * px1;
          ctx.beginPath();
          ctx.moveTo(x, y);
          const steps = 20 + Math.floor(r() * 40);
          for (let s = 0; s < steps; s++) {
            ang += (r() - 0.5) * 0.9;
            x += Math.cos(ang) * 6 * px1; y += Math.sin(ang) * 6 * px1;
            ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      });
      const tint = opts.tint || [1, 1, 1];
      const seamW = 1.5 * px1;
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          const i = y * S + x;
          const de = Math.min(x, S - 1 - x, y, S - 1 - y);
          const seam = 1 - smooth(seamW * 0.5, seamW * 1.5, de);
          const stain = smooth(0.58, 0.7, stainN[i]);
          const pit = hash2(x, y, seed) < 0.0025 ? 1 : 0;
          const cr = cracks[i];
          let v = (opts.base || 104) * (0.78 + 0.44 * blot[i]) * (0.9 + 0.2 * mid[i]) * (0.94 + 0.12 * fine[i]);
          v *= 1 - stain * 0.22 - seam * 0.45 - cr * 0.25 - pit * 0.35;
          put(color, i, v * tint[0], v * tint[1], v * tint[2]);
          height[i] = 0.5 + (fine[i] - 0.5) * 0.1 + (mid[i] - 0.5) * 0.05 - seam * 0.5 - cr * 0.45 - pit * 0.3;
          rough[i] = 0.84 + (fine[i] - 0.5) * 0.2 - stain * 0.32 + cr * 0.1;
        }
      }
      return opts.normal || 2.0;
    };
  }

  // Painted industrial brick with paint peeling back to red brick, and grime.
  function genBrick(opts) {
    return (color, height, rough, w, h) => {
      const S = w, px1 = S / 1024, seed = opts.seed || 31;
      const cols = 6, courses = 18, bw = S / cols, bh = S / courses;
      const mortar = 5 * px1;
      const blot = fbm(S, S, 6, 6, 4, seed + 1);
      const fine = fbm(S, S, 96, 96, 2, seed + 2);
      const peel = fbm(S, S, 5, 5, 5, seed + 3);
      const streak = fbm(S, S, 48, 2, 3, seed + 4);
      const palette = [[104, 60, 48], [88, 52, 44], [116, 72, 58], [80, 50, 44], [70, 64, 62], [96, 64, 52]];
      const paint = opts.paint || [44, 50, 64];
      for (let y = 0; y < S; y++) {
        const course = Math.floor(y / bh), ly = y - course * bh;
        const offset = (course % 2) * bw * 0.5;
        for (let x = 0; x < S; x++) {
          const i = y * S + x;
          const xx = (x + offset) % S, col = Math.floor(xx / bw), lx = xx - col * bw;
          const id = hash2(col, course, seed);
          const de = Math.min(lx, bw - lx, ly, bh - ly) + (fine[i] - 0.5) * mortar * 1.4;
          const inBrick = smooth(mortar * 0.5, mortar * 0.5 + 6 * px1, de);
          const pc = palette[Math.floor(id * palette.length)];
          const bv = (0.8 + 0.4 * blot[i]) * (0.9 + 0.2 * fine[i]) * (0.9 + 0.2 * id);
          const mv = 0.75 + 0.4 * fine[i];
          let r = pc[0] * bv * inBrick + 92 * mv * (1 - inBrick);
          let g = pc[1] * bv * inBrick + 88 * mv * (1 - inBrick);
          let b = pc[2] * bv * inBrick + 82 * mv * (1 - inBrick);
          const painted = smooth(0.31, 0.35, peel[i]);
          const pv = 0.85 + 0.3 * blot[i];
          r += (paint[0] * pv - r) * painted; g += (paint[1] * pv - g) * painted; b += (paint[2] * pv - b) * painted;
          const grime = 0.72 + 0.28 * streak[i];
          put(color, i, r * grime, g * grime, b * grime);
          height[i] = inBrick * 0.8 + (fine[i] - 0.5) * 0.12 + painted * 0.04;
          rough[i] = (0.95 - inBrick * 0.08) * (1 - painted * 0.22) + (1 - grime) * 0.1;
        }
      }
      return 3.4;
    };
  }

  // Flagstones: jittered-grid Voronoi stones with mossy joints.
  function genStone(opts) {
    return (color, height, rough, w, h) => {
      const S = w, px1 = S / 1024, seed = opts.seed || 41;
      const cells = 6, cs = S / cells;
      const fine = fbm(S, S, 64, 64, 3, seed + 1);
      const blot = fbm(S, S, 5, 5, 4, seed + 2);
      const jx = [], jy = [];
      for (let cy = 0; cy < cells; cy++) for (let cx = 0; cx < cells; cx++) {
        jx.push(0.2 + 0.6 * hash2(cx, cy, seed)); jy.push(0.2 + 0.6 * hash2(cx, cy, seed + 1));
      }
      const palette = [[74, 80, 74], [62, 70, 66], [86, 88, 80], [58, 62, 60], [70, 76, 64], [80, 78, 72]];
      const gapW = 7 * px1;
      for (let y = 0; y < S; y++) {
        const ccy = Math.floor(y / cs);
        for (let x = 0; x < S; x++) {
          const ccx = Math.floor(x / cs);
          let d1 = 1e9, d2 = 1e9, idc = 0;
          for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
            const nx = ccx + ox, ny = ccy + oy;
            const wx = (nx + cells) % cells, wy = (ny + cells) % cells;
            const k = wy * cells + wx;
            const px = (nx + jx[k]) * cs, py = (ny + jy[k]) * cs;
            const ddx = px - x, ddy = py - y, d = ddx * ddx + ddy * ddy;
            if (d < d1) { d2 = d1; d1 = d; idc = k; } else if (d < d2) d2 = d;
          }
          const i = y * S + x;
          const edge = Math.sqrt(d2) - Math.sqrt(d1);
          const stone = smooth(gapW * 0.5, gapW * 0.5 + 10 * px1, edge + (fine[i] - 0.5) * 6 * px1);
          const id = hash2(idc, 3, seed);
          const pc = palette[Math.floor(id * palette.length)];
          const v = (0.82 + 0.36 * blot[i]) * (0.9 + 0.2 * fine[i]);
          const moss = smooth(0.45, 0.6, blot[i]);
          const gr = 44 + moss * 8, gg = 42 + moss * 28, gb = 34;
          put(color, i,
            pc[0] * v * stone + gr * (1 - stone),
            pc[1] * v * stone + gg * (1 - stone),
            pc[2] * v * stone + gb * (1 - stone));
          height[i] = stone * 0.75 + (fine[i] - 0.5) * 0.3 + (id - 0.5) * 0.08;
          rough[i] = 0.78 + (fine[i] - 0.5) * 0.15 + (1 - stone) * 0.2;
        }
      }
      return 2.4;
    };
  }

  function genCardboard(opts) {
    return (color, height, rough, w, h) => {
      const S = w, seed = opts.seed || 51;
      const fib = fbm(S, S, 8, 128, 2, seed + 1);
      const blot = fbm(S, S, 4, 4, 4, seed + 2);
      const r = rng(seed);
      const ink = mask(S, S, (ctx) => {
        ctx.fillStyle = '#000';
        ctx.strokeStyle = '#000';
        // "This side up" arrows and a fragile mark, partially faded later.
        const u = S / 512;
        ctx.lineWidth = 6 * u;
        [0, 1].forEach(k => {
          const x = S * 0.12 + k * 34 * u, y = S * 0.16;
          ctx.beginPath(); ctx.moveTo(x, y + 60 * u); ctx.lineTo(x, y + 14 * u); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(x - 14 * u, y + 22 * u); ctx.lineTo(x, y); ctx.lineTo(x + 14 * u, y + 22 * u); ctx.fill();
        });
        ctx.strokeRect(S * 0.08, S * 0.12, 86 * u, 90 * u);
        ctx.font = `bold ${Math.round(34 * u)}px Arial, sans-serif`;
        ctx.fillText('FRAGILE', S * 0.52, S * 0.86);
        ctx.font = `${Math.round(18 * u)}px Arial, sans-serif`;
        ctx.fillText('HANDLE WITH CARE', S * 0.52, S * 0.91);
        ctx.fillText('NO. ' + (1000 + Math.floor(r() * 8999)), S * 0.08, S * 0.36);
        // Water rings.
        ctx.globalAlpha = 0.06;
        ctx.lineWidth = 2 * u;
        for (let k = 0; k < 2; k++) {
          ctx.beginPath();
          ctx.arc(S * (0.3 + r() * 0.5), S * (0.4 + r() * 0.3), S * (0.05 + r() * 0.06), 0, Math.PI * 2);
          ctx.stroke();
        }
      });
      const flute = (S / 512) * 9;
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          const i = y * S + x;
          const corr = 0.5 + 0.5 * Math.sin((y / flute) * Math.PI * 2);
          const e = Math.min(x, S - 1 - x, y, S - 1 - y) / S;
          const scuff = 1 - smooth(0.0, 0.03, e);
          const fade = smooth(0.35, 0.6, blot[i]);
          const k = ink[i] * (0.55 + 0.45 * fade);
          let v = (0.84 + 0.26 * blot[i]) * (0.96 + 0.08 * fib[i]);
          v *= 1 + scuff * 0.12;
          let cr = 178 * v, cg = 133 * v, cb = 88 * v;
          cr += (58 - cr) * k; cg += (40 - cg) * k; cb += (28 - cb) * k;
          put(color, i, cr, cg, cb);
          height[i] = 0.5 + (corr - 0.5) * 0.025 + (fib[i] - 0.5) * 0.08 - scuff * 0.15;
          rough[i] = 0.9 - k * 0.15 + scuff * 0.05;
        }
      }
      return 1.4;
    };
  }

  // Brushed / galvanised metal with scratches and smudges.
  function genMetal(opts) {
    return (color, height, rough, w, h) => {
      const S = w, px1 = S / 1024, seed = opts.seed || 61;
      const brush = fbm(S, S, 2, 256, 3, seed + 1);
      const smudge = fbm(S, S, 5, 5, 4, seed + 2);
      const r = rng(seed);
      const scratch = mask(S, S, (ctx) => {
        ctx.strokeStyle = '#fff';
        for (let k = 0; k < 90; k++) {
          ctx.globalAlpha = 0.3 + r() * 0.7;
          ctx.lineWidth = (0.6 + r()) * px1 * 1.5;
          const x = r() * S, y = r() * S, a = r() * Math.PI, l = (10 + r() * 60) * px1 * 2;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
        }
      });
      const base = opts.base || [170, 172, 176];
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          const i = y * S + x;
          const sc = scratch[i];
          const v = (0.9 + 0.14 * brush[i]) * (0.9 + 0.12 * smudge[i]) * (1 + sc * 0.12);
          put(color, i, base[0] * v, base[1] * v, base[2] * v);
          height[i] = brush[i] * 0.35 - sc * 0.3;
          rough[i] = (opts.roughBase || 0.34) + (brush[i] - 0.5) * 0.18 + smudge[i] * 0.2 - sc * 0.12;
        }
      }
      return 0.8;
    };
  }

  // Caution stripes with paint worn back to concrete. 4:1 tile (3.2 x 0.8 m).
  function genHazard() {
    return (color, height, rough, w, h) => {
      const wearN = fbm(w, h, 16, 4, 5, 71);
      const fine = fbm(w, h, 128, 32, 2, 72);
      const period = Math.max(2, Math.round(h / 2));
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          const s = ((x + y) % period) / period;
          const black = s < 0.5 ? 1 : 0;
          const worn = 1 - smooth(0.32, 0.38, wearN[i]);
          const edge = Math.min(y, h - 1 - y) / h;
          const chipped = Math.max(worn, 1 - smooth(0.0, 0.05, edge + (fine[i] - 0.5) * 0.06));
          const v = 0.9 + 0.2 * fine[i];
          let r = black ? 22 : 236, g = black ? 22 : 176, b = black ? 20 : 18;
          r = (r + (100 - r) * chipped) * v; g = (g + (100 - g) * chipped) * v; b = (b + (98 - b) * chipped) * v;
          put(color, i, r, g, b);
          height[i] = 0.6 - chipped * 0.4 + (fine[i] - 0.5) * 0.2;
          rough[i] = 0.55 + chipped * 0.3 + (fine[i] - 0.5) * 0.1;
        }
      }
      return 1.5;
    };
  }

  // Tyre: u runs round the wheel, v round the tube; v = 0/1 is the tread.
  function genTire() {
    return (color, height, rough, w, h) => {
      const fine = fbm(w, h, 64, 32, 2, 81);
      const blocks = 48;
      for (let y = 0; y < h; y++) {
        const v = 1 - y / h;
        const dv = Math.min(v, 1 - v);
        const tread = 1 - smooth(0.17, 0.2, dv);
        const side = Math.abs(dv - 0.25) < 0.12 ? 1 : 0;
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          const chev = ((x / w) * blocks + dv * 6) % 1;
          const groove = tread * (chev < 0.28 ? 1 : 0);
          const centre = tread * (dv < 0.012 ? 1 : 0);
          const rib = side * (0.5 + 0.5 * Math.sin(dv * 260));
          const g = 26 + fine[i] * 10 + (1 - tread) * 4;
          const dust = (groove + centre) * 10;
          put(color, i, g + dust, g + dust * 0.9, g + 2 + dust * 0.7);
          height[i] = 0.7 - groove * 0.6 - centre * 0.5 + rib * 0.04 + (fine[i] - 0.5) * 0.1;
          rough[i] = 0.82 - tread * 0.1 + groove * 0.12;
        }
      }
      return 3.0;
    };
  }

  // Watermelon rind: wavy dark stripes running pole to pole.
  function genMelon() {
    return (color, height, rough, w, h) => {
      const wave = fbm(w, h, 4, 8, 4, 91);
      const fine = fbm(w, h, 64, 32, 2, 92);
      const n = 14;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          const s = (x / w) * n + (wave[i] - 0.5) * 1.4 + Math.sin((y / h) * Math.PI * 6) * 0.06;
          const f = s - Math.floor(s);
          const jag = (fine[i] - 0.5) * 0.25;
          const dark = smooth(0.28 + jag, 0.36 + jag, f) * (1 - smooth(0.64 - jag, 0.72 - jag, f));
          const sp = hash2(x, y, 93) < 0.004 ? 1 : 0;
          const v = 0.9 + 0.2 * fine[i];
          let r = 112 + (30 - 112) * dark, g = 162 + (74 - 162) * dark, b = 74 + (30 - 74) * dark;
          if (sp) { r += 40; g += 40; b += 30; }
          put(color, i, r * v, g * v, b * v);
          height[i] = 0.5 + (fine[i] - 0.5) * 0.15 - dark * 0.05;
          rough[i] = 0.42 + (fine[i] - 0.5) * 0.1 + dark * 0.05;
        }
      }
      return 0.9;
    };
  }

  // ---------------------------------------------------------------------------
  // Flat emissive art (screens, posters, vending machine, city windows).
  // `aspect` is the physical width/height the canvas is shown at, so artwork
  // drawn in logical units is not stretched on a power-of-two canvas.
  // ---------------------------------------------------------------------------
  function artCanvas(w, h, aspect, draw) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    const lw = w, lh = w / aspect;
    ctx.setTransform(1, 0, 0, h / lh, 0, 0);
    draw(ctx, lw, lh);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = window.GFX ? window.GFX.maxAnisotropy() : 1;
    return t;
  }

  const TextureGenerator = {
    _cache: {},

    _set(key, w, h, gen) {
      if (!this._cache[key]) this._cache[key] = buildSet(w, h, gen);
      return this._cache[key];
    },

    getSet(name) {
      const S = Q().textureSize, s = Q().smallTextureSize;
      switch (name) {
        case 'wood': return this._set(name, S, S, genWood({ rows: 12, lenFrac: 1 / 3, base: [128, 84, 52], seed: 11 }));
        case 'staves': return this._set(name, s, s, genWood({ rows: 10, lenFrac: 1, vertical: true, base: [112, 70, 40], seed: 13, gapScale: 2.5, roughBase: 0.55, normal: 3 }));
        case 'darkwood': return this._set(name, s, s, genWood({ rows: 4, lenFrac: 1, base: [86, 52, 30], seed: 17, gapScale: 0.01, roughBase: 0.3, normal: 1.2 }));
        case 'concrete': return this._set(name, S, S, genConcrete({ seed: 21 }));
        case 'brick': return this._set(name, S, S, genBrick({ seed: 31 }));
        case 'stone': return this._set(name, S, S, genStone({ seed: 41 }));
        case 'cardboard': return this._set(name, s, s, genCardboard({ seed: 51 }));
        case 'metal': return this._set(name, s, s, genMetal({ seed: 61 }));
        case 'hazard': return this._set(name, s, s / 4, genHazard());
        case 'tire': return this._set(name, s, s / 2, genTire());
        case 'melon': return this._set(name, s, s / 2, genMelon());
        default: throw new Error('Unknown texture set ' + name);
      }
    },

    // Back-compatible colour-only accessors.
    createWoodTexture() { return this.getSet('wood').map; },
    createConcreteTexture() { return this.getSet('concrete').map; },
    createHazardTexture() { return this.getSet('hazard').map; },
    createWallTexture() { return this.getSet('brick').map; },

    // Monitor UI: code lines and a little chart. accent is a CSS colour.
    createScreenTexture(accent, seed) {
      const key = 'screen' + accent;
      if (this._cache[key]) return this._cache[key];
      const r = rng(seed || 5);
      const t = artCanvas(256, 128, 0.65 / 0.4, (ctx, w, h) => {
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, '#0b1220'); g.addColorStop(1, '#05070d');
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = accent; ctx.globalAlpha = 0.9;
        ctx.fillRect(0, 0, w, 10);
        for (let i = 0; i < 14; i++) {
          ctx.globalAlpha = 0.35 + r() * 0.5;
          ctx.fillRect(10 + (i % 3) * 6, 18 + i * 9, 20 + r() * 90, 4);
        }
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = accent; ctx.lineWidth = 2;
        ctx.beginPath();
        for (let x = 0; x <= 90; x += 6) ctx.lineTo(w - 100 + x, h - 20 - r() * 50);
        ctx.stroke();
        ctx.globalAlpha = 0.25; ctx.strokeRect(w - 104, h - 80, 96, 70);
      });
      this._cache[key] = t;
      return t;
    },

    createPosterTexture(theme) {
      const key = 'poster' + theme;
      if (this._cache[key]) return this._cache[key];
      const cyan = theme === 'cyan';
      const t = artCanvas(256, 512, 1.6 / 2.2, (ctx, w, h) => {
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, cyan ? '#05203a' : '#2a0520');
        g.addColorStop(0.55, cyan ? '#0a4d6e' : '#7a0f4a');
        g.addColorStop(1, '#07060c');
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
        // Synthwave sun and perspective grid.
        const sg = ctx.createLinearGradient(0, h * 0.25, 0, h * 0.6);
        sg.addColorStop(0, '#ffd27a'); sg.addColorStop(1, cyan ? '#00e5ff' : '#ff2e88');
        ctx.fillStyle = sg;
        ctx.beginPath(); ctx.arc(w / 2, h * 0.45, w * 0.3, Math.PI, 0); ctx.fill();
        ctx.fillStyle = cyan ? '#05203a' : '#2a0520';
        for (let i = 0; i < 5; i++) ctx.fillRect(0, h * (0.36 + i * 0.02), w, 2 + i);
        ctx.strokeStyle = cyan ? '#33f0ff' : '#ff4fa3'; ctx.lineWidth = 1.5;
        for (let i = 0; i < 8; i++) {
          const y = h * 0.45 + Math.pow(i / 8, 2) * h * 0.3;
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
        }
        for (let i = -6; i <= 6; i++) {
          ctx.beginPath(); ctx.moveTo(w / 2 + i * 8, h * 0.45); ctx.lineTo(w / 2 + i * 60, h * 0.75); ctx.stroke();
        }
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.font = 'bold 34px Arial, sans-serif';
        ctx.fillText(cyan ? 'PROP HUNT' : 'HUNTER', w / 2, h * 0.86);
        ctx.font = '13px Arial, sans-serif';
        ctx.globalAlpha = 0.8;
        ctx.fillText(cyan ? 'HIDE  ·  FREEZE  ·  SURVIVE' : 'ZONE  ·  SCANNERS ACTIVE', w / 2, h * 0.92);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 3;
        ctx.strokeRect(6, 6, w - 12, h - 12);
      });
      this._cache[key] = t;
      return t;
    },

    createVendingTexture() {
      if (this._cache.vending) return this._cache.vending;
      const r = rng(77);
      const t = artCanvas(256, 512, 0.9 / 1.4, (ctx, w, h) => {
        ctx.fillStyle = '#fff3c4'; ctx.fillRect(0, 0, w, h);
        const colors = ['#e63946', '#2a9d8f', '#f4a261', '#457b9d', '#e9c46a', '#8338ec', '#06d6a0'];
        const rows = 6, cols = 5, cw = w / cols, rh = h / rows;
        for (let ry = 0; ry < rows; ry++) {
          ctx.fillStyle = 'rgba(80,60,20,0.35)';
          ctx.fillRect(0, ry * rh + rh - 6, w, 6);
          for (let cx = 0; cx < cols; cx++) {
            ctx.fillStyle = colors[Math.floor(r() * colors.length)];
            const bw = cw * 0.5, bh = rh * 0.62;
            const x = cx * cw + (cw - bw) / 2, y = ry * rh + rh - 6 - bh;
            ctx.fillRect(x, y, bw, bh);
            ctx.fillStyle = 'rgba(255,255,255,0.45)';
            ctx.fillRect(x + bw * 0.15, y + 4, bw * 0.15, bh - 8);
          }
        }
        const g = ctx.createLinearGradient(0, 0, w, h);
        g.addColorStop(0, 'rgba(255,255,255,0.0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.18)'); g.addColorStop(1, 'rgba(255,255,255,0.0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      });
      this._cache.vending = t;
      return t;
    },

    // City windows: black facade grid with a random mix of warm, cool and dark windows.
    createWindowTexture() {
      if (this._cache.windows) return this._cache.windows;
      const size = Q().smallTextureSize;
      const r = rng(99);
      const c = document.createElement('canvas');
      c.width = size; c.height = size;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, size, size);
      const cols = 16, rows = 32, cw = size / cols, rh = size / rows;
      for (let y = 0; y < rows; y++) {
        const floorLit = r() < 0.75;
        for (let x = 0; x < cols; x++) {
          if (!floorLit || r() < 0.45) continue;
          const warm = r() < 0.7;
          const k = 0.45 + r() * 0.55;
          ctx.fillStyle = warm
            ? `rgb(${Math.round(255 * k)},${Math.round(196 * k)},${Math.round(120 * k)})`
            : `rgb(${Math.round(160 * k)},${Math.round(210 * k)},${Math.round(255 * k)})`;
          ctx.fillRect(x * cw + cw * 0.2, y * rh + rh * 0.22, cw * 0.6, rh * 0.56);
        }
      }
      const t = new THREE.CanvasTexture(c);
      t.encoding = THREE.sRGBEncoding;
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = window.GFX ? window.GFX.maxAnisotropy() : 1;
      this._cache.windows = t;
      return t;
    }
  };

  window.TextureGenerator = TextureGenerator;
})();
