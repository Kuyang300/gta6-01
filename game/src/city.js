// Sunhaven itself: a sun-soaked coastal city on a road grid, built from boxes,
// procedural facade textures and a painted ground map. No loaded assets — every
// texture is drawn on a canvas at runtime. Returns the building colliders the
// cars and the player push against, plus the landmark positions.

import * as THREE from 'three';
import { CITY_HALF, PALETTE, ROAD_LINES, ROAD_WIDTH, WATER_X } from './config.js';
import { pick, range } from './random.js';

const BLOCK_CENTERS = [];
for (const x of ROAD_LINES) {
  for (const z of ROAD_LINES) {
    BLOCK_CENTERS.push({ x: x + 20, z: z + 20 });
  }
}

const LANDMARK_BLOCKS = new Set([
  '-140,140', // Vera's garage
  '140,-140', // Harbor Bank
  '-140,-140', // safehouse
  '0,0', // central park
]);

function groundTexture() {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  const toPx = (v) => ((v + CITY_HALF) / (CITY_HALF * 2)) * size;

  // Base: warm concrete.
  g.fillStyle = '#a89f92';
  g.fillRect(0, 0, size, size);

  // Beach and sea on the east edge.
  g.fillStyle = '#e8d3a2';
  g.fillRect(toPx(190), 0, toPx(CITY_HALF) - toPx(190), size);
  g.fillStyle = '#2e7f9e';
  g.fillRect(toPx(WATER_X), 0, size - toPx(WATER_X), size);
  g.fillStyle = '#5fb3c9';
  for (let i = 0; i < 40; i++) {
    const y = (i / 40) * size;
    g.fillRect(toPx(WATER_X) + 4, y, 26, 3);
  }

  // Roads: dark strips with pale sidewalks.
  for (const line of ROAD_LINES) {
    g.fillStyle = '#b8b0a4';
    g.fillRect(toPx(line - ROAD_WIDTH / 2 - 3), 0, (ROAD_WIDTH + 6) / (CITY_HALF * 2) * size, size);
    g.fillRect(0, toPx(line - ROAD_WIDTH / 2 - 3), size, (ROAD_WIDTH + 6) / (CITY_HALF * 2) * size);
    g.fillStyle = '#33363d';
    g.fillRect(toPx(line - ROAD_WIDTH / 2), 0, ROAD_WIDTH / (CITY_HALF * 2) * size, size);
    g.fillRect(0, toPx(line - ROAD_WIDTH / 2), size, ROAD_WIDTH / (CITY_HALF * 2) * size);
  }

  // Centre dashes and crosswalks.
  g.fillStyle = '#f2d06b';
  for (const line of ROAD_LINES) {
    for (let v = -CITY_HALF; v < CITY_HALF; v += 16) {
      if (ROAD_LINES.some((r) => Math.abs(v + 4 - r) < 9)) continue;
      g.fillRect(toPx(line) - 1, toPx(v), 2, 7);
      g.fillRect(toPx(v), toPx(line) - 1, 7, 2);
    }
  }
  g.fillStyle = '#e8e4da';
  for (const x of ROAD_LINES) {
    for (const z of ROAD_LINES) {
      for (let i = -2; i <= 2; i++) {
        g.fillRect(toPx(x + i * 2.4) - 2, toPx(z - ROAD_WIDTH / 2 - 2), 4, 3);
        g.fillRect(toPx(x + i * 2.4) - 2, toPx(z + ROAD_WIDTH / 2 - 1), 4, 3);
        g.fillRect(toPx(x - ROAD_WIDTH / 2 - 2), toPx(z + i * 2.4) - 2, 3, 4);
        g.fillRect(toPx(x + ROAD_WIDTH / 2 - 1), toPx(z + i * 2.4) - 2, 3, 4);
      }
    }
  }

  // Central park.
  g.fillStyle = '#6fae5e';
  g.fillRect(toPx(-14), toPx(-14), toPx(14) - toPx(-14), toPx(14) - toPx(-14));
  g.fillStyle = '#8ec9ee';
  g.beginPath();
  g.arc(toPx(4), toPx(-4), 10, 0, Math.PI * 2);
  g.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function facadeTexture(wallColor) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  g.fillStyle = `#${wallColor.toString(16).padStart(6, '0')}`;
  g.fillRect(0, 0, 128, 256);
  g.fillStyle = 'rgba(0,0,0,0.12)';
  g.fillRect(0, 0, 128, 10);
  const cols = 4;
  const rows = 8;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lit = Math.random() < 0.22;
      g.fillStyle = lit ? '#ffe9a8' : '#202c3a';
      g.fillRect(12 + c * 28, 22 + r * 28, 18, 16);
    }
  }
  g.fillStyle = 'rgba(255,255,255,0.18)';
  g.fillRect(0, 120, 128, 3);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makePalm() {
  const group = new THREE.Group();
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6d4b });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x3f9e4d });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.3, 5, 6), trunkMat);
  trunk.position.y = 2.5;
  trunk.rotation.z = 0.08;
  group.add(trunk);
  for (let i = 0; i < 6; i++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.5, 3.2, 4), leafMat);
    const angle = (i / 6) * Math.PI * 2;
    leaf.position.set(Math.cos(angle) * 1.1, 5.2, Math.sin(angle) * 1.1);
    leaf.rotation.z = Math.cos(angle) * 1.1;
    leaf.rotation.x = -Math.sin(angle) * 1.1;
    group.add(leaf);
  }
  return group;
}

function makeTree() {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.28, 1.6, 6),
    new THREE.MeshLambertMaterial({ color: 0x6d4c2f }),
  );
  trunk.position.y = 0.8;
  const top = new THREE.Mesh(
    new THREE.SphereGeometry(1.5, 8, 6),
    new THREE.MeshLambertMaterial({ color: 0x4d8f3f }),
  );
  top.position.y = 2.6;
  top.scale.y = 0.85;
  group.add(trunk, top);
  return group;
}

function makeLamp() {
  const group = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.12, 5.4, 6),
    new THREE.MeshLambertMaterial({ color: 0x2c2f36 }),
  );
  pole.position.y = 2.7;
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.32, 8, 6),
    new THREE.MeshLambertMaterial({ color: 0xfff2b0, emissive: 0xffe9a0, emissiveIntensity: 0.7 }),
  );
  bulb.position.y = 5.5;
  group.add(pole, bulb);
  return group;
}

export function makeBeacon(color = 0xffd23b) {
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.6, 26, 12, 1, true), mat);
  beam.position.y = 13;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.2, 3.2, 24),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.15;
  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.5, 0.4, 12),
    new THREE.MeshBasicMaterial({ color }),
  );
  core.position.y = 0.2;
  group.add(beam, ring, core);
  group.userData.update = (t) => {
    const s = 1 + Math.sin(t * 3) * 0.12;
    ring.scale.set(s, s, 1);
    beam.material.opacity = 0.4 + Math.sin(t * 3) * 0.15;
  };
  return group;
}

export function createCity(scene, rng) {
  const colliders = [];
  const addCollider = (x, z, hw, hd) => {
    colliders.push({ minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd });
  };

  // Ground.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY_HALF * 2, CITY_HALF * 2),
    new THREE.MeshLambertMaterial({ map: groundTexture() }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Sea plane beyond the beach, slightly below ground level.
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(220, CITY_HALF * 2 + 60),
    new THREE.MeshLambertMaterial({ color: PALETTE.water }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(WATER_X + 105, -0.4, 0);
  scene.add(sea);

  // Facade textures, one per wall colour.
  const facades = PALETTE.walls.map((c) => facadeTexture(c));
  const roofMats = PALETTE.roofs.map((c) => new THREE.MeshLambertMaterial({ color: c }));
  const facadeMats = facades.map((t) => new THREE.MeshLambertMaterial({ map: t }));

  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  function addBuilding(x, z, w, d, h, wallIndex) {
    const mats = [
      facadeMats[wallIndex], facadeMats[wallIndex],
      roofMats[wallIndex % roofMats.length], roofMats[wallIndex % roofMats.length],
      facadeMats[wallIndex], facadeMats[wallIndex],
    ];
    const mesh = new THREE.Mesh(boxGeo, mats);
    mesh.scale.set(w, h, d);
    mesh.position.set(x, h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    addCollider(x, z, w / 2, d / 2);
    // Rooftop box.
    if (h > 14 && rng() < 0.7) {
      const ac = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x9aa0a6 }));
      ac.scale.set(Math.min(3, w * 0.3), 1.2, Math.min(3, d * 0.3));
      ac.position.set(x + range(rng, -w / 4, w / 4), h + 0.6, z + range(rng, -d / 4, d / 4));
      ac.castShadow = true;
      scene.add(ac);
    }
    return mesh;
  }

  // Ordinary blocks: 2-4 buildings each, taller toward the centre.
  for (const block of BLOCK_CENTERS) {
    const key = `${block.x},${block.z}`;
    if (LANDMARK_BLOCKS.has(key)) continue;
    if (block.x > 160) continue; // docks side
    const dist = Math.hypot(block.x, block.z);
    const maxH = dist < 70 ? 42 : dist < 120 ? 28 : 18;
    const count = intCount(rng);
    const wallIndex = Math.floor(rng() * PALETTE.walls.length);
    for (let i = 0; i < count; i++) {
      const w = range(rng, 9, 15);
      const d = range(rng, 9, 15);
      const x = block.x + range(rng, -8, 8);
      const z = block.z + range(rng, -8, 8);
      addBuilding(x, z, w, d, range(rng, 8, maxH), wallIndex);
    }
  }
  function intCount(r) { return 2 + Math.floor(r() * 3); }

  // Vera's garage: low wide workshop with an orange sign slab.
  addBuilding(-140, 146, 22, 12, 7, 2);
  const sign = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0xff7a1a, emissive: 0x552200 }));
  sign.scale.set(16, 2.2, 1);
  sign.position.set(-140, 8.4, 139.5);
  scene.add(sign);

  // Harbor Bank: tall pale tower with columns.
  addBuilding(140, -146, 20, 14, 34, 0);
  const colMat = new THREE.MeshLambertMaterial({ color: 0xf2ead8 });
  for (let i = -1; i <= 1; i++) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 8, 10), colMat);
    col.position.set(140 + i * 6, 4, -138);
    col.castShadow = true;
    scene.add(col);
  }

  // Safehouse: small house with a pitched roof.
  addBuilding(-140, -140, 12, 10, 6, 4);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(9.5, 4, 4), new THREE.MeshLambertMaterial({ color: 0xb5502e }));
  roof.position.set(-140, 8, -140);
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(1, 1, 0.78);
  roof.castShadow = true;
  scene.add(roof);

  // Central park trees and benches.
  for (let i = 0; i < 9; i++) {
    const tree = makeTree();
    tree.position.set(range(rng, -13, 13), 0, range(rng, -13, 13));
    if (Math.hypot(tree.position.x - 4, tree.position.z + 4) < 5) continue;
    tree.castShadow = true;
    scene.add(tree);
  }
  for (let i = 0; i < 4; i++) {
    const bench = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x7a5230 }));
    bench.scale.set(2.4, 0.5, 0.9);
    bench.position.set(-8 + i * 5, 0.5, 10);
    scene.add(bench);
  }

  // Docks: wooden pier, crates, containers and a crane arm.
  const pier = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x8a6d4b }));
  pier.scale.set(40, 1, 56);
  pier.position.set(212, 0.4, 0);
  pier.receiveShadow = true;
  scene.add(pier);
  addCollider(212, 0, 20, 28);
  const containerColors = [0xc23b2e, 0x2e6fc2, 0xe8b93b, 0x3aa655];
  for (let i = 0; i < 8; i++) {
    const crate = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: pick(rng, containerColors) }));
    const w = range(rng, 3, 6);
    crate.scale.set(w, range(rng, 2.5, 4), range(rng, 3, 5));
    crate.position.set(range(rng, 198, 226), crate.scale.y / 2 + 0.9, range(rng, -24, 24));
    crate.rotation.y = range(rng, 0, Math.PI);
    crate.castShadow = true;
    scene.add(crate);
  }
  const craneBase = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0xe8b93b }));
  craneBase.scale.set(3, 18, 3);
  craneBase.position.set(206, 9, -18);
  craneBase.castShadow = true;
  scene.add(craneBase);
  const craneArm = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0xe8b93b }));
  craneArm.scale.set(22, 1.4, 1.4);
  craneArm.position.set(216, 18, -18);
  craneArm.rotation.z = 0.15;
  craneArm.castShadow = true;
  scene.add(craneArm);

  // Palms along the main avenue and lamps at intersections.
  for (const line of ROAD_LINES) {
    for (let v = -160; v <= 160; v += 40) {
      if (rng() < 0.5) continue;
      const palm = makePalm();
      palm.position.set(line + 9, 0, v + 9);
      palm.castShadow = true;
      scene.add(palm);
    }
  }
  for (const x of ROAD_LINES) {
    for (const z of ROAD_LINES) {
      if ((x + z) % 80 !== 0) continue;
      const lamp = makeLamp();
      lamp.position.set(x + 8, 0, z + 8);
      scene.add(lamp);
    }
  }

  // Clouds: flat white blobs drifting high above the city.
  const clouds = [];
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
  for (let i = 0; i < 10; i++) {
    const cloud = new THREE.Group();
    for (let j = 0; j < 3; j++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(range(rng, 5, 10), 8, 6), cloudMat);
      puff.position.set(j * 7 - 7, range(rng, 0, 2), range(rng, -2, 2));
      puff.scale.y = 0.45;
      cloud.add(puff);
    }
    cloud.position.set(range(rng, -200, 220), range(rng, 55, 80), range(rng, -200, 200));
    scene.add(cloud);
    clouds.push(cloud);
  }

  return {
    colliders,
    clouds,
    update(t, dt) {
      for (const cloud of clouds) {
        cloud.position.x += dt * 0.7;
        if (cloud.position.x > 240) cloud.position.x = -240;
      }
    },
  };
}

// Push a circle (x, z, radius) out of every building collider it overlaps.
// Returns true when a push happened, so a car can lose speed on impact.
export function resolveCircle(pos, radius, colliders) {
  let hit = false;
  for (const c of colliders) {
    const cx = Math.max(c.minX, Math.min(pos.x, c.maxX));
    const cz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= radius * radius) continue;
    hit = true;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      pos.x = cx + (dx / d) * radius;
      pos.z = cz + (dz / d) * radius;
    } else {
      // Centre inside the box: push out along the smallest penetration axis.
      const pushL = pos.x - c.minX + radius;
      const pushR = c.maxX - pos.x + radius;
      const pushU = pos.z - c.minZ + radius;
      const pushD = c.maxZ - pos.z + radius;
      const m = Math.min(pushL, pushR, pushU, pushD);
      if (m === pushL) pos.x = c.minX - radius;
      else if (m === pushR) pos.x = c.maxX + radius;
      else if (m === pushU) pos.z = c.minZ - radius;
      else pos.z = c.maxZ + radius;
    }
  }
  return hit;
}

export function clampToCity(pos, margin = 4) {
  pos.x = Math.max(-CITY_HALF + margin, Math.min(WATER_X - margin - 2, pos.x));
  pos.z = Math.max(-CITY_HALF + margin, Math.min(CITY_HALF - margin, pos.z));
}
