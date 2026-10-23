// Procedural High-Res Canvas Textures for Realistic 3D Environment
const TextureGenerator = {
  // Wood floor parquet
  createWoodTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#6d4c41';
    ctx.fillRect(0, 0, 512, 512);

    // Draw planks
    const plankH = 64;
    for (let y = 0; y < 512; y += plankH) {
      for (let x = 0; x < 512; x += 128) {
        const offset = (y / plankH) % 2 === 0 ? 0 : 64;
        const px = (x + offset) % 512;

        const shade = 100 + Math.floor(Math.sin(px * 0.1 + y) * 15);
        ctx.fillStyle = `rgb(${shade + 20}, ${shade - 20}, ${shade - 40})`;
        ctx.fillRect(px + 1, y + 1, 126, plankH - 2);

        // Grain lines
        ctx.strokeStyle = 'rgba(0,0,0,0.15)';
        for (let g = 0; g < 4; g++) {
          ctx.beginPath();
          ctx.moveTo(px, y + g * 15 + Math.random() * 5);
          ctx.lineTo(px + 128, y + g * 15 + Math.random() * 5);
          ctx.stroke();
        }
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(4, 4);
    return tex;
  },

  // Concrete floor for warehouse
  createConcreteTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#2b2d42';
    ctx.fillRect(0, 0, 512, 512);

    // Noise specks
    for (let i = 0; i < 8000; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const gray = Math.floor(Math.random() * 50) + 35;
      ctx.fillStyle = `rgba(${gray}, ${gray}, ${gray + 10}, 0.25)`;
      ctx.fillRect(x, y, 2, 2);
    }

    // Tiles grid
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 512; i += 128) {
      ctx.beginPath();
      ctx.moveTo(i, 0); ctx.lineTo(i, 512);
      ctx.moveTo(0, i); ctx.lineTo(512, i);
      ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(6, 6);
    return tex;
  },

  // Hazard caution stripes
  createHazardTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#ffb703';
    ctx.fillRect(0, 0, 256, 256);

    ctx.fillStyle = '#111111';
    for (let i = -256; i < 512; i += 64) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + 32, 0);
      ctx.lineTo(i + 32 + 256, 256);
      ctx.lineTo(i + 256, 256);
      ctx.closePath();
      ctx.fill();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(4, 1);
    return tex;
  },

  // Brick / Industrial Wall Texture
  createWallTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#1c2130';
    ctx.fillRect(0, 0, 512, 512);

    const bh = 32;
    const bw = 64;
    for (let y = 0; y < 512; y += bh) {
      const offset = (y / bh) % 2 === 0 ? 0 : bw / 2;
      for (let x = -bw; x < 512 + bw; x += bw) {
        const val = 30 + Math.floor(Math.sin(x + y * 2) * 8);
        ctx.fillStyle = `rgb(${val}, ${val + 5}, ${val + 14})`;
        ctx.fillRect(x + offset + 1, y + 1, bw - 2, bh - 2);
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(5, 3);
    return tex;
  }
};

window.TextureGenerator = TextureGenerator;
