// Pedestrians: Sunhaven locals strolling the sidewalks. They pick a corner,
// walk to it, pick another. A gunshot or a punch nearby makes them flee; a
// bullet or a punch puts them down, and they get back up elsewhere later.

import * as THREE from 'three';
import { PED_COUNT, ROAD_LINES } from './config.js';
import { pick, range } from './random.js';
import { clampToCity } from './city.js';

const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const SHIRTS = [0xe05a4e, 0x4e7de0, 0x53b06a, 0xe8b93b, 0x9e4ed0, 0xffffff, 0x3aa655, 0xe07a9e];

function makePedMesh(shirt) {
  const group = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xc98d64 });
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const pantsMat = new THREE.MeshLambertMaterial({ color: 0x2c3242 });
  const legs = new THREE.Mesh(boxGeo, pantsMat);
  legs.scale.set(0.5, 0.8, 0.32);
  legs.position.y = 0.4;
  const torso = new THREE.Mesh(boxGeo, shirtMat);
  torso.scale.set(0.62, 0.7, 0.36);
  torso.position.y = 1.15;
  torso.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), skin);
  head.position.y = 1.72;
  head.castShadow = true;
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.27, 10, 8), new THREE.MeshLambertMaterial({ color: 0x2a2018 }));
  hair.position.y = 1.78;
  hair.scale.set(1, 0.6, 1);
  group.add(legs, torso, head, hair);
  group.userData.torso = torso;
  return group;
}

export function createPedestrians(scene, rng) {
  const peds = [];
  for (let i = 0; i < PED_COUNT; i++) {
    const mesh = makePedMesh(pick(rng, SHIRTS));
    scene.add(mesh);
    const ped = {
      mesh,
      pos: new THREE.Vector3(range(rng, -160, 160), 0, range(rng, -160, 160)),
      target: new THREE.Vector3(),
      heading: 0,
      speed: range(rng, 1.1, 1.8),
      state: 'walk',
      stateT: 0,
      downT: 0,
      bob: rng() * 10,
    };
    pickTarget(ped);
    peds.push(ped);
  }

  function pickTarget(ped) {
    ped.target.set(
      pick(rng, ROAD_LINES) + range(rng, -6, 6),
      0,
      pick(rng, ROAD_LINES) + range(rng, -6, 6),
    );
  }

  return {
    peds,
    update(dt, playerPos, scared) {
      for (const ped of peds) {
        ped.bob += dt * 8;
        if (ped.state === 'down') {
          ped.downT -= dt;
          ped.mesh.rotation.x = -Math.PI / 2 + 0.15;
          ped.mesh.position.y = 0.25;
          if (ped.downT <= 0) {
            ped.state = 'walk';
            ped.mesh.rotation.x = 0;
            ped.mesh.position.y = 0;
            ped.pos.set(range(rng, -160, 160), 0, range(rng, -160, 160));
            pickTarget(ped);
          }
          continue;
        }
        const toPlayer = Math.hypot(ped.pos.x - playerPos.x, ped.pos.z - playerPos.z);
        if (scared && toPlayer < 26) ped.state = 'flee';
        if (ped.state === 'flee') {
          ped.stateT -= dt;
          const away = Math.atan2(ped.pos.x - playerPos.x, ped.pos.z - playerPos.z);
          ped.heading = away;
          ped.pos.x += Math.sin(away) * 4.5 * dt;
          ped.pos.z += Math.cos(away) * 4.5 * dt;
          if (ped.stateT <= 0) { ped.state = 'walk'; pickTarget(ped); }
        } else {
          const dx = ped.target.x - ped.pos.x;
          const dz = ped.target.z - ped.pos.z;
          const dist = Math.hypot(dx, dz);
          if (dist < 1.5) {
            pickTarget(ped);
          } else {
            ped.heading = Math.atan2(dx, dz);
            ped.pos.x += (dx / dist) * ped.speed * dt;
            ped.pos.z += (dz / dist) * ped.speed * dt;
          }
        }
        clampToCity(ped.pos, 6);
        ped.mesh.position.set(ped.pos.x, Math.abs(Math.sin(ped.bob)) * 0.04, ped.pos.z);
        ped.mesh.rotation.y = ped.heading;
      }
    },
    scare() {
      for (const ped of this.peds) {
        ped.state = 'flee';
        ped.stateT = 4;
      }
    },
    knockDown(pos, radius) {
      let hit = null;
      let best = radius;
      for (const ped of this.peds) {
        if (ped.state === 'down') continue;
        const d = Math.hypot(ped.pos.x - pos.x, ped.pos.z - pos.z);
        if (d < best) { best = d; hit = ped; }
      }
      if (hit) {
        hit.state = 'down';
        hit.downT = 10;
        return hit;
      }
      return null;
    },
    nearestShootable(origin, dir, maxDist) {
      let hit = null;
      let best = maxDist;
      for (const ped of this.peds) {
        if (ped.state === 'down') continue;
        const dx = ped.pos.x - origin.x;
        const dz = ped.pos.z - origin.z;
        const along = dx * dir.x + dz * dir.z;
        if (along < 1 || along > best) continue;
        const perp = Math.abs(dx * dir.z - dz * dir.x);
        if (perp < 1.6) { best = along; hit = ped; }
      }
      return hit ? { ped: hit, dist: best } : null;
    },
  };
}
