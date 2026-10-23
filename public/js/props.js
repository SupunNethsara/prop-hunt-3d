// Procedural 3D Prop & Character Builder
const PropBuilder = {
  // Cache of materials
  materials: {
    cardboard: new THREE.MeshLambertMaterial({ color: 0xd2a679 }),
    tape: new THREE.MeshLambertMaterial({ color: 0xaa8855 }),
    chairPlastic: new THREE.MeshLambertMaterial({ color: 0x3366cc }),
    metal: new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.4, metalness: 0.6 }),
    darkMetal: new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.5, metalness: 0.5 }),
    wood: new THREE.MeshLambertMaterial({ color: 0x8B5A2B }),
    ironRing: new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.7, roughness: 0.3 }),
    plantPot: new THREE.MeshLambertMaterial({ color: 0xb55331 }),
    leaf: new THREE.MeshLambertMaterial({ color: 0x2e8b57 }),
    dirt: new THREE.MeshLambertMaterial({ color: 0x3d2817 }),
    trashBody: new THREE.MeshStandardMaterial({ color: 0x999999, metalness: 0.7, roughness: 0.3 }),
    melonRind: new THREE.MeshLambertMaterial({ color: 0x2e7d32 }),
    melonStripe: new THREE.MeshLambertMaterial({ color: 0x1b5e20 }),
    tireRubber: new THREE.MeshLambertMaterial({ color: 0x222222 }),
    toiletCeramic: new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.1, metalness: 0.1 }),
    hunterSuit: new THREE.MeshLambertMaterial({ color: 0x2b2d42 }),
    hunterVisor: new THREE.MeshBasicMaterial({ color: 0x00f0ff }),
    neonYellow: new THREE.MeshBasicMaterial({ color: 0xffea00 })
  },

  createProp(type) {
    const group = new THREE.Group();
    group.castShadow = true;
    group.receiveShadow = true;

    switch (type) {
      case 'chair':
        // Modern office/lounge chair
        const seat = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.1, 0.7), this.materials.chairPlastic);
        seat.position.y = 0.45;
        const back = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.1), this.materials.chairPlastic);
        back.position.set(0, 0.8, -0.3);
        const legCenter = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.45, 8), this.materials.metal);
        legCenter.position.y = 0.225;
        const base1 = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.05, 0.1), this.materials.metal);
        base1.position.y = 0.025;
        const base2 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.7), this.materials.metal);
        base2.position.y = 0.025;
        group.add(seat, back, legCenter, base1, base2);
        break;

      case 'plant':
        // Potted houseplant
        const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.25, 0.6, 12), this.materials.plantPot);
        pot.position.y = 0.3;
        const dirt = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.05, 12), this.materials.dirt);
        dirt.position.y = 0.58;
        group.add(pot, dirt);

        // Leaves
        for (let i = 0; i < 6; i++) {
          const angle = (i / 6) * Math.PI * 2;
          const leafStem = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.6, 5), this.materials.leaf);
          leafStem.rotation.z = Math.PI / 4;
          leafStem.rotation.y = angle;
          leafStem.position.set(Math.cos(angle) * 0.15, 0.7, Math.sin(angle) * 0.15);
          group.add(leafStem);
        }
        break;

      case 'barrel':
        // Wooden storage barrel
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.38, 0.9, 14), this.materials.wood);
        barrel.position.y = 0.45;
        const ring1 = new THREE.Mesh(new THREE.TorusGeometry(0.425, 0.02, 8, 20), this.materials.ironRing);
        ring1.rotation.x = Math.PI / 2;
        ring1.position.y = 0.25;
        const ring2 = ring1.clone();
        ring2.position.y = 0.65;
        group.add(barrel, ring1, ring2);
        break;

      case 'trash':
        // Metal trash bin
        const bin = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.3, 0.8, 14), this.materials.trashBody);
        bin.position.y = 0.4;
        const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.1, 14), this.materials.trashBody);
        lid.position.y = 0.85;
        const handle = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.02, 6, 12), this.materials.darkMetal);
        handle.rotation.x = Math.PI / 2;
        handle.position.y = 0.93;
        group.add(bin, lid, handle);
        break;

      case 'watermelon':
        // Giant round watermelon
        const melon = new THREE.Mesh(new THREE.SphereGeometry(0.45, 14, 12), this.materials.melonRind);
        melon.scale.set(1.1, 0.9, 1.1);
        melon.position.y = 0.45;
        group.add(melon);
        break;

      case 'tire':
        // Heavy vehicle tire
        const tire = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.18, 12, 24), this.materials.tireRubber);
        tire.rotation.x = Math.PI / 2;
        tire.position.y = 0.18;
        group.add(tire);
        break;

      case 'toilet':
        // Funny toilet prop
        const bowlBase = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.2, 0.45, 12), this.materials.toiletCeramic);
        bowlBase.position.y = 0.225;
        const bowlTop = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, 0.6), this.materials.toiletCeramic);
        bowlTop.position.set(0, 0.45, 0.05);
        const tank = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.25), this.materials.toiletCeramic);
        tank.position.set(0, 0.7, -0.2);
        group.add(bowlBase, bowlTop, tank);
        break;

      case 'box':
      default:
        // Classic cardboard box with tape
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), this.materials.cardboard);
        box.position.y = 0.4;
        const tape = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.1, 0.82), this.materials.tape);
        tape.position.y = 0.4;
        group.add(box, tape);
        break;
    }

    // Traverse children to enable shadows
    group.traverse(child => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    group.propType = type;
    return group;
  },

  // Create 3D Hunter Agent Model
  createHunter() {
    const hunter = new THREE.Group();

    // Body
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.25, 0.9, 10), this.materials.hunterSuit);
    body.position.y = 0.9;
    body.castShadow = true;

    // Head / Helmet
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 10), this.materials.hunterSuit);
    head.position.y = 1.5;
    head.castShadow = true;

    // Glowing Visor
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 0.15), this.materials.hunterVisor);
    visor.position.set(0, 1.5, 0.18);

    // Blaster Scanner in Hand
    const gun = new THREE.Group();
    const gunBody = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.15, 0.5), this.materials.metal);
    const gunMuzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.2, 8), this.materials.neonYellow);
    gunMuzzle.rotation.x = Math.PI / 2;
    gunMuzzle.position.set(0, 0, 0.3);
    gun.add(gunBody, gunMuzzle);
    gun.position.set(0.4, 0.9, 0.3);

    hunter.add(body, head, visor, gun);
    hunter.gunMuzzle = gunMuzzle;

    return hunter;
  }
};

window.PropBuilder = PropBuilder;
