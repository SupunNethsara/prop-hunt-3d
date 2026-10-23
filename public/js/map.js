// Ultra-Realistic 3D Arena & Environment Builder
const MapBuilder = {
  colliders: [],
  staticProps: [],

  buildMap(scene) {
    this.colliders = [];
    this.staticProps = [];

    const mapGroup = new THREE.Group();

    // 1. Textures from Procedural Generator
    const woodTex = window.TextureGenerator.createWoodTexture();
    const concreteTex = window.TextureGenerator.createConcreteTexture();
    const hazardTex = window.TextureGenerator.createHazardTexture();
    const wallTex = window.TextureGenerator.createWallTexture();

    // 2. Realistic Themed Floors
    // Office Lounge Floor (Top Right: Wood Parquet)
    const officeFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 30),
      new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.4, metalness: 0.1 })
    );
    officeFloor.rotation.x = -Math.PI / 2;
    officeFloor.position.set(15, 0.01, -15);
    officeFloor.receiveShadow = true;
    mapGroup.add(officeFloor);

    // Warehouse Floor (Top Left: Industrial Concrete)
    const warehouseFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 30),
      new THREE.MeshStandardMaterial({ map: concreteTex, roughness: 0.7, metalness: 0.3 })
    );
    warehouseFloor.rotation.x = -Math.PI / 2;
    warehouseFloor.position.set(-15, 0.01, -15);
    warehouseFloor.receiveShadow = true;
    mapGroup.add(warehouseFloor);

    // Workshop Floor (Bottom Right: Heavy Tiles)
    const workshopFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 30),
      new THREE.MeshStandardMaterial({ map: concreteTex, roughness: 0.8, metalness: 0.2 })
    );
    workshopFloor.rotation.x = -Math.PI / 2;
    workshopFloor.position.set(15, 0.01, 15);
    workshopFloor.receiveShadow = true;
    mapGroup.add(workshopFloor);

    // Courtyard / Garden Floor (Bottom Left: Dark Flagstone)
    const courtyardFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 30),
      new THREE.MeshStandardMaterial({ color: 0x1a2e22, roughness: 0.9 })
    );
    courtyardFloor.rotation.x = -Math.PI / 2;
    courtyardFloor.position.set(-15, 0.01, 15);
    courtyardFloor.receiveShadow = true;
    mapGroup.add(courtyardFloor);

    // Center Atrium Crossing Pathways
    const pathMat = new THREE.MeshStandardMaterial({ color: 0x111625, roughness: 0.5 });
    const pathH = new THREE.Mesh(new THREE.PlaneGeometry(60, 6), pathMat);
    pathH.rotation.x = -Math.PI / 2;
    pathH.position.set(0, 0.015, 0);
    const pathV = new THREE.Mesh(new THREE.PlaneGeometry(6, 60), pathMat);
    pathV.rotation.x = -Math.PI / 2;
    pathV.position.set(0, 0.015, 0);
    mapGroup.add(pathH, pathV);

    // Hazard Caution Line in Warehouse
    const hazardLine = new THREE.Mesh(new THREE.PlaneGeometry(30, 0.8), new THREE.MeshBasicMaterial({ map: hazardTex }));
    hazardLine.rotation.x = -Math.PI / 2;
    hazardLine.position.set(-15, 0.02, -1);
    mapGroup.add(hazardLine);

    // 3. Walls with Baseboards & Brick/Panel Texture
    const wallMat = new THREE.MeshStandardMaterial({
      map: wallTex,
      roughness: 0.75,
      metalness: 0.15
    });
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

    // Architectural Support Columns
    const colMat = new THREE.MeshStandardMaterial({ color: 0x222838, roughness: 0.4, metalness: 0.5 });
    [
      { x: -8, z: -8 }, { x: 8, z: -8 },
      { x: -8, z: 8 }, { x: 8, z: 8 }
    ].forEach(p => {
      this.createWall(mapGroup, p.x, wallHeight / 2, p.z, 2, wallHeight, 2, colMat);
      // Base trim
      const trim = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.4, 2.3), colMat);
      trim.position.set(p.x, 0.2, p.z);
      mapGroup.add(trim);
    });

    // 4. Distant City Skyline & Starfield (Real World Horizon)
    this.buildCitySkyline(mapGroup);

    // 5. Rich Real-World Furniture & Fixtures
    this.buildFurniture(mapGroup);

    // 6. Suspended Hunter Waiting Glass Cage
    const cageFloor = new THREE.Mesh(
      new THREE.BoxGeometry(8, 0.4, 8),
      new THREE.MeshStandardMaterial({ color: 0x111625, metalness: 0.9, roughness: 0.2 })
    );
    cageFloor.position.set(0, 14, 0);
    const cageGlass = new THREE.Mesh(
      new THREE.BoxGeometry(8, 3, 8),
      new THREE.MeshStandardMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.35, roughness: 0.1, metalness: 0.9 })
    );
    cageGlass.position.set(0, 15.5, 0);
    mapGroup.add(cageFloor, cageGlass);

    // 7. Populate with Static Camouflage Props
    this.populateStaticProps(mapGroup);

    scene.add(mapGroup);
    return mapGroup;
  },

  // City Skyline Silhouettes for believable atmosphere
  buildCitySkyline(group) {
    const bldgMat = new THREE.MeshBasicMaterial({ color: 0x090d16 });
    const winMat = new THREE.MeshBasicMaterial({ color: 0xffea00 });

    for (let i = 0; i < 30; i++) {
      const angle = (i / 30) * Math.PI * 2;
      const dist = 55 + (i % 5) * 6;
      const h = 25 + Math.sin(i * 3) * 15;
      const w = 6 + (i % 3) * 3;

      const bldg = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), bldgMat);
      bldg.position.set(Math.cos(angle) * dist, h / 2 - 5, Math.sin(angle) * dist);
      group.add(bldg);

      // Glowing window lights
      if (i % 2 === 0) {
        const win = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, h * 0.6, 0.2), winMat);
        win.position.set(Math.cos(angle) * dist, h * 0.4, Math.sin(angle) * dist);
        win.rotation.y = angle;
        group.add(win);
      }
    }

    // Starfield particles
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
    const starMat = new THREE.PointsMaterial({ color: 0xaaccff, size: 0.35 });
    group.add(new THREE.Points(starGeo, starMat));
  },

  // Rich Real-World Furniture (Desks, Monitors, Sofas, Vending Machine)
  buildFurniture(group) {
    // A. Executive Office Desk with PC Monitors
    const deskMat = new THREE.MeshStandardMaterial({ color: 0x4a2c11, roughness: 0.3 });
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.8, roughness: 0.3 });
    const screenMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });

    // Desk Top & Legs
    const deskTop = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.1, 1.2), deskMat);
    deskTop.position.set(20, 0.85, -20);
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.85, 1.1), metalMat);
    legL.position.set(18.9, 0.425, -20);
    const legR = legL.clone();
    legR.position.x = 21.1;
    group.add(deskTop, legL, legR);

    // PC Monitors with glowing cyber screens
    const mon1 = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 0.05), metalMat);
    mon1.position.set(19.6, 1.2, -19.9);
    mon1.rotation.y = 0.2;
    const scr1 = new THREE.Mesh(new THREE.PlaneGeometry(0.65, 0.4), screenMat);
    scr1.position.set(19.6, 1.2, -19.86);
    scr1.rotation.y = 0.2;

    const mon2 = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 0.05), metalMat);
    mon2.position.set(20.4, 1.2, -19.9);
    mon2.rotation.y = -0.2;
    const scr2 = new THREE.Mesh(new THREE.PlaneGeometry(0.65, 0.4), new THREE.MeshBasicMaterial({ color: 0xff0077 }));
    scr2.position.set(20.4, 1.2, -19.86);
    scr2.rotation.y = -0.2;
    group.add(mon1, scr1, mon2, scr2);

    this.colliders.push({ minX: 18.5, maxX: 21.5, minZ: -20.8, maxZ: -19.2 });

    // B. Comfortable Leather Lounge Sofa
    const sofaMat = new THREE.MeshStandardMaterial({ color: 0x1f2421, roughness: 0.5 });
    const sofaBase = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.4, 1.0), sofaMat);
    sofaBase.position.set(14, 0.25, -13);
    const sofaBack = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.6, 0.3), sofaMat);
    sofaBack.position.set(14, 0.65, -13.35);
    group.add(sofaBase, sofaBack);
    this.colliders.push({ minX: 12.5, maxX: 15.5, minZ: -13.8, maxZ: -12.3 });

    // C. Vending Machine with glowing front
    const vmBody = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.2, 0.9), new THREE.MeshStandardMaterial({ color: 0x111625, metalness: 0.7 }));
    vmBody.position.set(-20, 1.1, 8);
    const vmGlass = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.4), new THREE.MeshBasicMaterial({ color: 0xffea00 }));
    vmGlass.position.set(-20, 1.2, 8.46);
    group.add(vmBody, vmGlass);
    this.colliders.push({ minX: -20.8, maxX: -19.2, minZ: 7.3, maxZ: 8.7 });

    // D. Wall Posters & Warning Signboards
    const posterGeo = new THREE.PlaneGeometry(1.6, 2.2);
    const poster1 = new THREE.Mesh(posterGeo, new THREE.MeshBasicMaterial({ color: 0x00f0ff }));
    poster1.position.set(18, 2.4, -29.4);
    const poster2 = new THREE.Mesh(posterGeo, new THREE.MeshBasicMaterial({ color: 0xff0077 }));
    poster2.position.set(-18, 2.4, -29.4);
    group.add(poster1, poster2);

    // E. Ceiling Industrial Hanging Lights with Warm Light Cones
    [-15, 15].forEach(x => {
      [-15, 15].forEach(z => {
        const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.8), metalMat);
        cord.position.set(x, 4.0, z);
        const lamp = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.3, 12), metalMat);
        lamp.position.set(x, 3.1, z);
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12), new THREE.MeshBasicMaterial({ color: 0xffd166 }));
        bulb.position.set(x, 3.0, z);
        group.add(cord, lamp, bulb);
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

  createWall(group, x, y, z, w, h, d, mat) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const wall = new THREE.Mesh(geo, mat);
    wall.position.set(x, y, z);
    wall.castShadow = true;
    wall.receiveShadow = true;
    group.add(wall);

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
