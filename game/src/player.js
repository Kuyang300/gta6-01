// Jax Marlowe on foot: a third-person walker with run, punch and a hitscan
// pistol. Movement is relative to the camera yaw; the mesh turns toward where
// Jax walks. Shooting traces a ray from the camera through the screen centre
// and asks the pedestrians, the police and the parked cars who it hit.

import * as THREE from 'three';
import { PLAYER } from './config.js';
import { clampToCity, resolveCircle } from './city.js';

const boxGeo = new THREE.BoxGeometry(1, 1, 1);

export function makePlayerMesh() {
  const group = new THREE.Group();
  const teal = new THREE.MeshLambertMaterial({ color: 0x1f8a7a });
  const dark = new THREE.MeshLambertMaterial({ color: 0x2c3242 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xc98d64 });
  const legs = new THREE.Mesh(boxGeo, dark);
  legs.scale.set(0.55, 0.85, 0.36);
  legs.position.y = 0.42;
  const torso = new THREE.Mesh(boxGeo, teal);
  torso.scale.set(0.68, 0.75, 0.4);
  torso.position.y = 1.22;
  torso.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 10), skin);
  head.position.y = 1.82;
  head.castShadow = true;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.1, 12), new THREE.MeshLambertMaterial({ color: 0xe8b93b }));
  cap.position.y = 2.02;
  const brim = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0xe8b93b }));
  brim.scale.set(0.3, 0.05, 0.3);
  brim.position.set(0, 1.98, 0.3);
  group.add(legs, torso, head, cap, brim);
  group.userData.legs = legs;
  group.userData.torso = torso;
  return group;
}

export function createPlayer(scene) {
  const mesh = makePlayerMesh();
  scene.add(mesh);
  const state = {
    mesh,
    pos: new THREE.Vector3(-140, 0, 100),
    heading: 0,
    speed: 0,
    walkBob: 0,
    punchCooldown: 0,
    shootCooldown: 0,
  };

  return {
    state,
    get pos() { return state.pos; },
    get heading() { return state.heading; },
    update(dt, input, cameraYaw, colliders) {
      state.punchCooldown -= dt;
      state.shootCooldown -= dt;
      let mx = 0;
      let mz = 0;
      if (input.forward) mz -= 1;
      if (input.back) mz += 1;
      if (input.left) mx -= 1;
      if (input.right) mx += 1;
      const moving = mx !== 0 || mz !== 0;
      const targetSpeed = moving ? (input.run ? PLAYER.runSpeed : PLAYER.walkSpeed) : 0;
      state.speed += (targetSpeed - state.speed) * Math.min(1, dt * 10);
      if (moving) {
        const len = Math.hypot(mx, mz);
        mx /= len;
        mz /= len;
        // Camera-relative: the camera looks along (sin yaw, cos yaw), so W
        // (mz = -1) must move the player along that vector, and D (mx = +1)
        // along the camera's right, (-cos yaw, sin yaw).
        const sin = Math.sin(cameraYaw);
        const cos = Math.cos(cameraYaw);
        const wx = -mx * cos - mz * sin;
        const wz = mx * sin - mz * cos;
        state.pos.x += wx * state.speed * dt;
        state.pos.z += wz * state.speed * dt;
        clampToCity(state.pos, 4);
        // resolveCircle pushes the player out of any building; never restore
        // the old position, or a spawn inside a collider traps the player.
        resolveCircle(state.pos, PLAYER.radius, colliders);
        const targetHeading = Math.atan2(wx, wz);
        let diff = targetHeading - state.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        state.heading += diff * Math.min(1, dt * PLAYER.turnSpeed);
        state.walkBob += dt * state.speed * 1.6;
      }
      mesh.position.set(state.pos.x, Math.abs(Math.sin(state.walkBob)) * 0.05, state.pos.z);
      mesh.rotation.y = state.heading;
      mesh.visible = true;
    },
    shoot(camera, game) {
      if (state.shootCooldown > 0) return;
      state.shootCooldown = 0.28;
      const origin = camera.position.clone();
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      const flat = new THREE.Vector3(dir.x, 0, dir.z).normalize();
      game.audio.gunshot();
      game.addTracer(origin, flat);
      game.addMuzzle(camera);
      // Nearest hit among pedestrians, police and stealable cars.
      const pedHit = game.peds.nearestShootable(origin, flat, 45);
      const policeHit = game.police.shootAt(origin, flat, 45);
      let carHit = null;
      let carDist = 45;
      for (const car of game.stealableCars) {
        const dx = car.pos.x - origin.x;
        const dz = car.pos.z - origin.z;
        const along = dx * flat.x + dz * flat.z;
        if (along < 1 || along > carDist) continue;
        const perp = Math.abs(dx * flat.z - dz * flat.x);
        if (perp < 2.2) { carDist = along; carHit = car; }
      }
      const hits = [];
      if (pedHit) hits.push({ dist: pedHit.dist, kind: 'ped', target: pedHit.ped });
      if (policeHit) hits.push({ dist: policeHit.dist, kind: 'police', target: policeHit.unit });
      if (carHit) hits.push({ dist: carDist, kind: 'car', target: carHit });
      hits.sort((a, b) => a.dist - b.dist);
      const hit = hits[0];
      if (hit) {
        if (hit.kind === 'ped') {
          game.peds.knockDown(hit.target.pos, 0.1);
          game.addWanted(1, 'You shot a local!');
        } else if (hit.kind === 'police') {
          game.police.damage(hit.target);
          game.addWanted(1, 'You shot a cop car!');
        } else {
          hit.target.damage(34);
          game.addWanted(1, 'You shot up a car!');
        }
        game.peds.scare();
      }
    },
    punch(game) {
      if (state.punchCooldown > 0) return;
      state.punchCooldown = 0.45;
      game.audio.punch();
      const hit = game.peds.knockDown(state.pos, 2.4);
      if (hit) {
        game.addWanted(1, 'You decked a local!');
        game.peds.scare();
      }
    },
    hide() { mesh.visible = false; },
    show() { mesh.visible = true; },
  };
}
