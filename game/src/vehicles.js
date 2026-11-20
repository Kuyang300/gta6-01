// Cars: the mesh factory, the arcade driving model for the player's car, and
// the traffic that circulates on the road grid. Every vehicle is a group of
// boxes — body, cabin, wheels, lights — so the whole fleet comes from one
// builder, and a pickup variant adds a bed and its own handling tune.

import * as THREE from 'three';
import { CAR, PALETTE, ROAD_LINES } from './config.js';
import { pick, range } from './random.js';
import { clampToCity, resolveCircle } from './city.js';

const unitBox = new THREE.BoxGeometry(1, 1, 1);

// Handling per body style. The sedan is the all-rounder; the pickup is
// quicker on a straight road but lazier to turn and slower to get moving.
const TUNING = {
  sedan: {
    maxSpeed: CAR.maxSpeed,
    reverseMax: CAR.reverseMax,
    accel: CAR.accel,
    brake: CAR.brake,
    drag: CAR.drag,
    steer: CAR.steer,
    radius: CAR.radius,
  },
  pickup: {
    maxSpeed: 42,
    reverseMax: 11,
    accel: 13,
    brake: 30,
    drag: 0.5,
    steer: 1.55,
    radius: 2.3,
  },
};

function wheelSet(group, darkMat, halfWidth, frontZ, backZ, radius = 0.36) {
  const geo = new THREE.CylinderGeometry(radius, radius, 0.3, 10);
  geo.rotateZ(Math.PI / 2);
  for (const [x, z] of [[-halfWidth, frontZ], [halfWidth, frontZ], [-halfWidth, backZ], [halfWidth, backZ]]) {
    const wheel = new THREE.Mesh(geo, darkMat);
    wheel.position.set(x, radius, z);
    wheel.castShadow = true;
    group.add(wheel);
  }
}

function lampPair(group, headMat, tailMat, zFront, zBack) {
  for (const x of [-0.6, 0.6]) {
    const head = new THREE.Mesh(unitBox, headMat);
    head.scale.set(0.4, 0.18, 0.1);
    head.position.set(x, 0.6, zFront);
    group.add(head);
    const tail = new THREE.Mesh(unitBox, tailMat);
    tail.scale.set(0.4, 0.18, 0.1);
    tail.position.set(x, 0.6, zBack);
    group.add(tail);
  }
}

export function makeCarMesh(paint, isPolice = false, kind = 'sedan') {
  const group = new THREE.Group();
  const paintMat = new THREE.MeshLambertMaterial({ color: isPolice ? 0xf2f2f2 : paint });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x16181d });
  const glassMat = new THREE.MeshLambertMaterial({ color: PALETTE.glass });
  const headMat = new THREE.MeshLambertMaterial({ color: 0xfff6c0, emissive: 0xaa9900, emissiveIntensity: 0.6 });
  const tailMat = new THREE.MeshLambertMaterial({ color: 0xcc1111, emissive: 0x550000 });

  const body = new THREE.Mesh(unitBox, paintMat);
  if (kind === 'pickup') {
    // A truck: short cab up front, open bed behind it with low walls.
    body.scale.set(2.0, 0.62, 5.0);
    body.position.y = 0.55;
    body.castShadow = true;
    group.add(body);
    const cab = new THREE.Mesh(unitBox, glassMat);
    cab.scale.set(1.7, 0.6, 1.5);
    cab.position.set(0, 1.15, 1.35);
    cab.castShadow = true;
    group.add(cab);
    const bedFloor = new THREE.Mesh(unitBox, darkMat);
    bedFloor.scale.set(1.8, 0.1, 2.2);
    bedFloor.position.set(0, 0.9, -1.2);
    group.add(bedFloor);
    for (const [x, z, w, d] of [[-0.95, -1.2, 0.1, 2.2], [0.95, -1.2, 0.1, 2.2], [0, -2.25, 2.0, 0.1]]) {
      const wall = new THREE.Mesh(unitBox, paintMat);
      wall.scale.set(w, 0.55, d);
      wall.position.set(x, 1.15, z);
      group.add(wall);
    }
    wheelSet(group, darkMat, 0.98, 1.7, -1.7, 0.42);
    lampPair(group, headMat, tailMat, 2.52, -2.52);
  } else {
    body.scale.set(2.0, 0.62, 4.2);
    body.position.y = 0.55;
    body.castShadow = true;
    group.add(body);
    const cabin = new THREE.Mesh(unitBox, glassMat);
    cabin.scale.set(1.7, 0.55, 2.1);
    cabin.position.set(0, 1.1, -0.2);
    cabin.castShadow = true;
    group.add(cabin);
    wheelSet(group, darkMat, 0.95, 1.35, -1.35);
    lampPair(group, headMat, tailMat, 2.12, -2.12);
  }

  if (isPolice) {
    const stripe = new THREE.Mesh(unitBox, new THREE.MeshLambertMaterial({ color: 0x1c3a6e }));
    stripe.scale.set(2.02, 0.22, 4.22);
    stripe.position.y = 0.72;
    group.add(stripe);
    const bar = new THREE.Mesh(unitBox, darkMat);
    bar.scale.set(1.2, 0.16, 0.5);
    bar.position.set(0, 1.45, -0.2);
    group.add(bar);
    const red = new THREE.Mesh(unitBox, new THREE.MeshLambertMaterial({ color: 0xff2222, emissive: 0xaa0000 }));
    red.scale.set(0.55, 0.18, 0.5);
    red.position.set(-0.32, 1.5, -0.2);
    const blue = new THREE.Mesh(unitBox, new THREE.MeshLambertMaterial({ color: 0x2244ff, emissive: 0x0011aa }));
    blue.scale.set(0.55, 0.18, 0.5);
    blue.position.set(0.32, 1.5, -0.2);
    group.add(red, blue);
    group.userData.lightRed = red;
    group.userData.lightBlue = blue;
  }

  group.userData.body = body;
  group.userData.kind = kind;
  return group;
}

// One drivable car: position, heading, speed and steering. The model is
// arcade — no suspension, just accel, drag, steering that fades as speed
// rises, and a push-out against buildings that lets the car slide along a
// wall instead of wedging into it.
export function createCar(mesh, x, z, heading = 0, tune = null) {
  const t = { ...TUNING.sedan, ...(tune ?? {}) };
  const car = {
    mesh,
    kind: mesh.userData.kind ?? 'sedan',
    pos: new THREE.Vector3(x, 0, z),
    heading,
    speed: 0,
    steer: 0,
    health: 100,
    disabled: false,
    smoke: null,
    update(dt, input, colliders) {
      if (this.disabled) {
        this.speed *= Math.max(0, 1 - 2 * dt);
      } else if (input) {
        const goingForward = input.forward ? 1 : 0;
        const goingBack = input.back ? 1 : 0;
        if (goingForward) this.speed += t.accel * dt;
        if (goingBack) {
          // Backing off while rolling forward brakes; from a stop it reverses.
          this.speed -= (this.speed > 0.5 ? t.brake : t.accel * 0.7) * dt;
        }
        if (!goingForward && !goingBack) this.speed -= this.speed * t.drag * dt;
        if (input.brake) this.speed -= Math.sign(this.speed) * t.brake * dt;
        this.speed = Math.max(-t.reverseMax, Math.min(t.maxSpeed, this.speed));
        // Steering eases in, and bites less the faster the car goes, so a
        // twitch at top speed does not spin it out.
        const steerInput = (input.left ? 1 : 0) - (input.right ? 1 : 0);
        const grip = 1 - Math.min(Math.abs(this.speed) / t.maxSpeed, 1) * 0.45;
        const steerGoal = steerInput * grip * Math.min(Math.abs(this.speed) / 8, 1);
        this.steer += (steerGoal - this.steer) * Math.min(1, dt * 8);
        const reverse = this.speed < 0 ? -1 : 1;
        this.heading += this.steer * t.steer * dt * Math.sign(this.speed || 1) * reverse;
      }
      // Move one axis at a time, keeping only the axis that did not hit a
      // wall: a car slides along a building face, and only a head-on stop
      // into both axes at once costs speed and health.
      const startX = this.pos.x;
      const startZ = this.pos.z;
      const stepX = Math.sin(this.heading) * this.speed * dt;
      const stepZ = Math.cos(this.heading) * this.speed * dt;
      const impact = Math.abs(this.speed);
      this.pos.x = startX + stepX;
      const blockedX = resolveCircle(this.pos, t.radius, colliders);
      if (blockedX) {
        this.pos.x = startX;
        this.speed *= 0.92;
      }
      this.pos.z = startZ + stepZ;
      const blockedZ = resolveCircle(this.pos, t.radius, colliders);
      if (blockedZ) {
        this.pos.z = startZ;
        this.speed *= 0.92;
      }
      clampToCity(this.pos, 3);
      if (blockedX && blockedZ) {
        this.speed *= 0.5;
        if (impact > 14) this.health -= impact * 0.3;
      }
      this.mesh.position.copy(this.pos);
      this.mesh.rotation.y = this.heading;
      if (this.health <= 0 && !this.disabled) this.disable();
      if (this.smoke) {
        this.smoke.position.set(this.pos.x, 1.6, this.pos.z);
        this.smoke.material.opacity = 0.25 + Math.random() * 0.3;
        this.smoke.scale.setScalar(1 + Math.random() * 0.8);
      }
    },
    disable() {
      this.disabled = true;
      this.speed = 0;
      const smokeGeo = new THREE.SphereGeometry(1, 8, 6);
      this.smoke = new THREE.Mesh(smokeGeo, new THREE.MeshBasicMaterial({
        color: 0x555555, transparent: true, opacity: 0.4,
      }));
      this.smoke.position.set(this.pos.x, 1.6, this.pos.z);
      this.mesh.parent.add(this.smoke);
    },
    damage(amount) {
      this.health -= amount;
      if (this.health <= 0 && !this.disabled) this.disable();
    },
  };
  return car;
}

// Traffic: cars that loop the road grid, keeping to the right-hand lane and
// turning at intersections now and then. They never leave the roads, so they
// need no collision handling of their own.
export function createTraffic(scene, rng, colliders) {
  const cars = [];
  for (let i = 0; i < 14; i++) {
    const paint = pick(rng, PALETTE.carPaint);
    const mesh = makeCarMesh(paint);
    scene.add(mesh);
    const axis = rng() < 0.5 ? 'x' : 'z';
    const line = pick(rng, ROAD_LINES);
    const dir = rng() < 0.5 ? 1 : -1;
    cars.push({
      mesh,
      axis,
      line,
      lane: dir > 0 ? 3 : -3,
      pos: range(rng, -160, 160),
      dir,
      speed: range(rng, 9, 15),
      heading: 0,
    });
  }

  function place(car) {
    const x = car.axis === 'x' ? car.pos : car.line + car.lane;
    const z = car.axis === 'x' ? car.line + car.lane : car.pos;
    car.mesh.position.set(x, 0, z);
    car.heading = car.axis === 'x'
      ? (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2)
      : (car.dir > 0 ? 0 : Math.PI);
    car.mesh.rotation.y = car.heading;
  }

  return {
    cars,
    update(dt) {
      for (const car of cars) {
        car.pos += car.dir * car.speed * dt;
        // At an intersection, sometimes turn onto the crossing road.
        const crossing = ROAD_LINES.find((r) => Math.abs(car.pos - r) < car.speed * dt);
        if (crossing !== undefined && Math.abs(car.pos - crossing) < 0.6 && rng() < 0.004) {
          const along = car.line;
          car.axis = car.axis === 'x' ? 'z' : 'x';
          car.line = crossing;
          car.pos = along;
          car.dir = rng() < 0.5 ? 1 : -1;
          car.lane = car.dir > 0 ? 3 : -3;
        }
        if (car.pos > 168) { car.pos = 168; car.dir = -1; car.lane = -3; }
        if (car.pos < -168) { car.pos = -168; car.dir = 1; car.lane = 3; }
        place(car);
      }
    },
    // Parked cars the player can steal: a few placed beside roads. Spot 3
    // holds the pickup — faster on the straight, lazier in a turn.
    spawnParked(scene, rng, count) {
      const parked = [];
      const spots = [
        { x: -157, z: -40, heading: Math.PI / 2 },
        { x: -117, z: 80, heading: 0 },
        { x: 37, z: -157, heading: Math.PI / 2 },
        { x: 77, z: 157, heading: 0 },
        { x: 157, z: 40, heading: -Math.PI / 2 },
        { x: -37, z: 117, heading: Math.PI },
        { x: 117, z: -37, heading: Math.PI / 2 },
        { x: -77, z: -117, heading: 0 },
      ];
      for (let i = 0; i < Math.min(count, spots.length); i++) {
        const spot = spots[i];
        const isPickup = i === 3;
        const mesh = makeCarMesh(pick(rng, PALETTE.carPaint), false, isPickup ? 'pickup' : 'sedan');
        mesh.position.set(spot.x, 0, spot.z);
        mesh.rotation.y = spot.heading;
        scene.add(mesh);
        parked.push(createCar(
          mesh, spot.x, spot.z, spot.heading,
          isPickup ? TUNING.pickup : null,
        ));
      }
      return parked;
    },
  };
}
