// 3D Arena Map Builder with rooms, static deco props, and collision boxes
const MapBuilder = {
  colliders: [],
  staticProps: [],

  buildMap(scene) {
    this.colliders = [];
    this.staticProps = [];

    const mapGroup = new THREE.Group();

    // 1. Floor
    const floorGeo = new THREE.PlaneGeometry(60, 60);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x1f242d,
      roughness: 0.8,
      metalness: 0.2
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    mapGroup.add(floor);

    // Floor grid lines
    const grid = new THREE.GridHelper(60, 30, 0x00f0ff, 0x2a364f);
    grid.position.y = 0.01;
    mapGroup.add(grid);

    // 2. Outer Perimeter Walls
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x2b303c, roughness: 0.7 });
    const wallHeight = 4.5;
    const wallThick = 1;

    // North, South, East, West
    this.createWall(mapGroup, 0, wallHeight / 2, -30, 60, wallHeight, wallThick, wallMat);
    this.createWall(mapGroup, 0, wallHeight / 2, 30, 60, wallHeight, wallThick, wallMat);
    this.createWall(mapGroup, -30, wallHeight / 2, 0, wallThick, wallHeight, 60, wallMat);
    this.createWall(mapGroup, 30, wallHeight / 2, 0, wallThick, wallHeight, 60, wallMat);

    // 3. Interior Walls (Creating 4 Distinct Themed Zones)
    // Storage Room (Top-Left)
    this.createWall(mapGroup, -15, wallHeight / 2, -10, 20, wallHeight, wallThick, wallMat);
    this.createWall(mapGroup, -5, wallHeight / 2, -20, wallThick, wallHeight, 15, wallMat);

    // Office & Lounge (Top-Right)
    this.createWall(mapGroup, 15, wallHeight / 2, -10, 20, wallHeight, wallThick, wallMat);
    this.createWall(mapGroup, 5, wallHeight / 2, -20, wallThick, wallHeight, 15, wallMat);

    // Botanical / Courtyard (Bottom-Left)
    this.createWall(mapGroup, -15, wallHeight / 2, 10, 20, wallHeight, wallThick, wallMat);
    this.createWall(mapGroup, -5, wallHeight / 2, 20, wallThick, wallHeight, 15, wallMat);

    // Workshop & Garage (Bottom-Right)
    this.createWall(mapGroup, 15, wallHeight / 2, 10, 20, wallHeight, wallThick, wallMat);
    this.createWall(mapGroup, 5, wallHeight / 2, 20, wallThick, wallHeight, 15, wallMat);

    // Center Pillars
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x3d4454 });
    const pillarCoords = [
      { x: -8, z: -8 }, { x: 8, z: -8 },
      { x: -8, z: 8 }, { x: 8, z: 8 }
    ];
    pillarCoords.forEach(p => {
      this.createWall(mapGroup, p.x, wallHeight / 2, p.z, 2, wallHeight, 2, pillarMat);
    });

    // 4. Hunter Waiting Cage (Suspended in Sky)
    const cageFloor = new THREE.Mesh(
      new THREE.BoxGeometry(8, 0.4, 8),
      new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.8 })
    );
    cageFloor.position.set(0, 14, 0);
    mapGroup.add(cageFloor);

    // Glass walls for cage
    const glassMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.3, wireframe: true });
    const cageWall = new THREE.Mesh(new THREE.BoxGeometry(8, 3, 8), glassMat);
    cageWall.position.set(0, 15.5, 0);
    mapGroup.add(cageWall);

    // 5. Populate Arena with REAL Inanimate Static Props!
    // Disguised players will look identical to these props
    const decoProps = [
      // Boxes in storage
      { type: 'box', x: -18, z: -22, r: 0.2 },
      { type: 'box', x: -19, z: -21, r: -0.4 },
      { type: 'box', x: -18, z: -21, y: 0.8, r: 0.1 }, // stacked
      { type: 'box', x: -12, z: -25, r: 0.7 },
      { type: 'box', x: 2, z: -5, r: 0 },
      { type: 'box', x: 22, z: 22, r: 0.5 },
      
      // Barrels
      { type: 'barrel', x: -22, z: -15, r: 0 },
      { type: 'barrel', x: -21, z: -16, r: 0.8 },
      { type: 'barrel', x: 18, z: 24, r: 0 },
      { type: 'barrel', x: 20, z: 23, r: 0.3 },

      // Chairs in office & lobby
      { type: 'chair', x: 18, z: -22, r: Math.PI / 4 },
      { type: 'chair', x: 22, z: -20, r: -Math.PI / 3 },
      { type: 'chair', x: 14, z: -24, r: 0 },
      { type: 'chair', x: -2, z: 2, r: Math.PI },

      // Plants in courtyard & lounge
      { type: 'plant', x: -22, z: 22, r: 0 },
      { type: 'plant', x: -15, z: 24, r: 0.4 },
      { type: 'plant', x: -24, z: 16, r: -0.2 },
      { type: 'plant', x: 10, z: -12, r: 0 },
      { type: 'plant', x: -10, z: -12, r: 0 },

      // Trash cans
      { type: 'trash', x: 4, z: -9, r: 0 },
      { type: 'trash', x: -4, z: 9, r: 0 },
      { type: 'trash', x: 27, z: -27, r: 0 },
      { type: 'trash', x: -27, z: 27, r: 0 },

      // Watermelons in pantry
      { type: 'watermelon', x: 24, z: -14, r: 0.2 },
      { type: 'watermelon', x: 25, z: -15, r: -0.5 },

      // Tires in workshop
      { type: 'tire', x: 24, z: 18, r: 0.1 },
      { type: 'tire', x: 25, z: 17, r: 0.7 },
      { type: 'tire', x: 24.5, z: 17.5, y: 0.35, r: 0.3 },

      // Toilets in restrooms
      { type: 'toilet', x: -26, z: -5, r: Math.PI / 2 },
      { type: 'toilet', x: -26, z: 5, r: Math.PI / 2 }
    ];

    decoProps.forEach(dp => {
      const propMesh = window.PropBuilder.createProp(dp.type);
      propMesh.position.set(dp.x, dp.y || 0, dp.z);
      if (dp.r) propMesh.rotation.y = dp.r;
      propMesh.isStaticProp = true;
      mapGroup.add(propMesh);
      this.staticProps.push(propMesh);
    });

    scene.add(mapGroup);
    return mapGroup;
  },

  // Helper to create walls with bounding boxes
  createWall(group, x, y, z, w, h, d, mat) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const wall = new THREE.Mesh(geo, mat);
    wall.position.set(x, y, z);
    wall.castShadow = true;
    wall.receiveShadow = true;
    group.add(wall);

    // Save bounding box for collision checking
    this.colliders.push({
      minX: x - w / 2 - 0.4,
      maxX: x + w / 2 + 0.4,
      minZ: z - d / 2 - 0.4,
      maxZ: z + d / 2 + 0.4
    });
  },

  // Check collision with walls
  checkCollision(x, z) {
    // Outer bounds
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
