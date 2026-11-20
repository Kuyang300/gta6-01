// The Sunhaven police: patrol cars that spawn at the city edge when the wanted
// level rises, chase the player along the roads, ram the player's car, and bust
// the player when they catch them slow and close. Their light bars flash red
// and blue. A unit that loses sight of the player for long enough gives up the
// chase and cruises the roads until the player comes back into range.

import * as THREE from 'three';
import { POLICE, ROAD_LINES } from './config.js';
import { makeCarMesh } from './vehicles.js';
import { clampToCity, resolveCircle } from './city.js';
import { range } from './random.js';

const CHASE_SIGHT = 70; // inside this, the unit has the player in sight
const GIVE_UP_AFTER = 6; // seconds out of sight before the unit gives up
const REACQUIRE = 55; // a patrolling unit re-engages inside this distance
const RAM_RANGE = 4.5;
const BUST_RANGE = 5;
const BUST_SPEED = 1.5;

function nearestRoadLine(v) {
  let best = ROAD_LINES[0];
  for (const line of ROAD_LINES) {
    if (Math.abs(line - v) < Math.abs(best - v)) best = line;
  }
  return best;
}

// A point on the road grid that heads toward the player: if the player is
// standing on a road, the player themself; otherwise the nearest road point
// between the unit and the player, so the unit drives around the blocks
// instead of pushing through buildings to cut the corner.
function roadTarget(from, to) {
  const onRoadX = ROAD_LINES.some((l) => Math.abs(to.x - l) < 7);
  const onRoadZ = ROAD_LINES.some((l) => Math.abs(to.z - l) < 7);
  if (onRoadX && onRoadZ) return { x: to.x, z: to.z };
  const viaX = nearestRoadLine(to.x);
  const viaZ = nearestRoadLine(to.z);
  const dxRoad = Math.abs(from.x - viaX);
  const dzRoad = Math.abs(from.z - viaZ);
  if (dxRoad < dzRoad) return { x: viaX, z: to.z };
  return { x: to.x, z: viaZ };
}

function turnToward(unit, targetX, targetZ, dt, turnRate) {
  const dx = targetX - unit.pos.x;
  const dz = targetZ - unit.pos.z;
  const want = Math.atan2(dx, dz);
  let diff = want - unit.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  unit.heading += Math.max(-turnRate * dt, Math.min(turnRate * dt, diff));
  return Math.hypot(dx, dz);
}

export function createPolice(scene, rng, colliders) {
  const units = [];

  function spawnAt(x, z) {
    const mesh = makeCarMesh(0, true);
    scene.add(mesh);
    const unit = {
      mesh,
      pos: new THREE.Vector3(x, 0, z),
      heading: 0,
      speed: 0,
      health: 3,
      disabled: false,
      ramCooldown: 0,
      flashT: 0,
      state: 'chase', // chase | patrol
      unseenT: 0,
      patrolX: x,
      patrolZ: z,
      smoke: null,
    };
    units.push(unit);
    return unit;
  }

  function spawnNear(playerPos) {
    // Pick a road point roughly 60 units from the player, inside the city.
    for (let tries = 0; tries < 12; tries++) {
      const x = Math.max(-160, Math.min(160, playerPos.x + range(rng, -80, 80)));
      const z = Math.max(-160, Math.min(160, playerPos.z + range(rng, -80, 80)));
      const d = Math.hypot(x - playerPos.x, z - playerPos.z);
      if (d > 45 && d < 110) return spawnAt(x, z);
    }
    return spawnAt(playerPos.x + 60, playerPos.z);
  }

  function pickPatrolPoint(unit, playerPos) {
    // A road intersection somewhere away from the player: the unit cruises
    // there instead of hovering on the player's trail.
    for (let tries = 0; tries < 8; tries++) {
      const x = ROAD_LINES[Math.floor(rng() * ROAD_LINES.length)];
      const z = ROAD_LINES[Math.floor(rng() * ROAD_LINES.length)];
      if (Math.hypot(x - playerPos.x, z - playerPos.z) > 70) {
        unit.patrolX = x;
        unit.patrolZ = z;
        return;
      }
    }
    unit.patrolX = nearestRoadLine(unit.pos.x);
    unit.patrolZ = nearestRoadLine(unit.pos.z);
  }

  return {
    units,
    get count() { return units.filter((u) => !u.disabled).length; },
    ensureCount(wanted, playerPos) {
      const want = Math.min(wanted, 5);
      while (this.count < want) spawnNear(playerPos);
    },
    clear() {
      for (const u of units) {
        scene.remove(u.mesh);
        if (u.smoke) scene.remove(u.smoke);
      }
      units.length = 0;
    },
    update(dt, playerPos, playerSpeed, playerDriving, onBust, onRam) {
      for (const u of units) {
        if (u.disabled) continue;
        u.ramCooldown -= dt;
        u.flashT += dt;
        const flash = Math.sin(u.flashT * 14) > 0;
        if (u.mesh.userData.lightRed) {
          u.mesh.userData.lightRed.material.emissiveIntensity = flash ? 2.2 : 0.2;
          u.mesh.userData.lightBlue.material.emissiveIntensity = flash ? 0.2 : 2.2;
        }

        const dist = Math.hypot(playerPos.x - u.pos.x, playerPos.z - u.pos.z);

        // Sight: the unit sees the player while close; out of sight it
        // counts down to giving up, and a patrolling unit re-engages when
        // the player wanders back into range.
        if (dist < CHASE_SIGHT) {
          u.unseenT = 0;
          if (u.state === 'patrol') u.state = 'chase';
        } else {
          u.unseenT += dt;
          if (u.state === 'chase' && u.unseenT > GIVE_UP_AFTER) {
            u.state = 'patrol';
            pickPatrolPoint(u, playerPos);
          }
        }
        if (u.state === 'patrol' && dist < REACQUIRE) {
          u.state = 'chase';
          u.unseenT = 0;
        }

        let targetX;
        let targetZ;
        let targetSpeed;
        if (u.state === 'chase') {
          const road = roadTarget(u.pos, playerPos);
          targetX = road.x;
          targetZ = road.z;
          targetSpeed = dist > 60 ? POLICE.maxSpeed : POLICE.maxSpeed * 0.85;
        } else {
          targetX = u.patrolX;
          targetZ = u.patrolZ;
          targetSpeed = POLICE.maxSpeed * 0.55;
          if (Math.hypot(targetX - u.pos.x, targetZ - u.pos.z) < 6) {
            pickPatrolPoint(u, playerPos);
          }
        }

        const toTarget = turnToward(u, targetX, targetZ, dt, 2.4);
        u.speed += (targetSpeed - u.speed) * Math.min(1, dt * 0.8);
        if (toTarget < 4) u.speed = Math.min(u.speed, 12);

        // Axis-separated movement, same as the player's car: try x, then z,
        // keeping only the axis that did not hit a wall, so the unit slides
        // along building faces instead of wedging into a block.
        const startX = u.pos.x;
        const startZ = u.pos.z;
        u.pos.x = startX + Math.sin(u.heading) * u.speed * dt;
        const blockedX = resolveCircle(u.pos, 2.1, colliders);
        if (blockedX) u.pos.x = startX;
        u.pos.z = startZ + Math.cos(u.heading) * u.speed * dt;
        const blockedZ = resolveCircle(u.pos, 2.1, colliders);
        if (blockedZ) u.pos.z = startZ;
        clampToCity(u.pos, 3);
        if (blockedX && blockedZ) {
          u.speed *= 0.5;
          u.heading += 0.5;
        }
        u.mesh.position.copy(u.pos);
        u.mesh.rotation.y = u.heading;

        // Ram: touching the player hurts and shoves. The callback owns the
        // damage; the unit only reports the hit, once per cooldown.
        if (u.state === 'chase' && dist < RAM_RANGE && u.ramCooldown <= 0) {
          u.ramCooldown = 1.2;
          onRam(u, dist);
        }
        // Bust: the player slow and a unit right on top of them.
        if (u.state === 'chase' && dist < BUST_RANGE && Math.abs(playerSpeed) < BUST_SPEED) {
          onBust(dt);
        }
      }
    },
    shootAt(origin, dir, maxDist) {
      let hit = null;
      let best = maxDist;
      for (const u of units) {
        if (u.disabled) continue;
        const dx = u.pos.x - origin.x;
        const dz = u.pos.z - origin.z;
        const along = dx * dir.x + dz * dir.z;
        if (along < 1 || along > best) continue;
        const perp = Math.abs(dx * dir.z - dz * dir.x);
        if (perp < 2.4) { best = along; hit = u; }
      }
      return hit ? { unit: hit, dist: best } : null;
    },
    damage(unit) {
      unit.health -= 1;
      if (unit.health <= 0) {
        unit.disabled = true;
        unit.speed = 0;
        const smoke = new THREE.Mesh(
          new THREE.SphereGeometry(1.2, 8, 6),
          new THREE.MeshBasicMaterial({ color: 0x444444, transparent: true, opacity: 0.4 }),
        );
        smoke.position.set(unit.pos.x, 1.6, unit.pos.z);
        scene.add(smoke);
        unit.smoke = smoke;
      }
    },
    nearest(pos) {
      let best = Infinity;
      for (const u of units) {
        if (u.disabled) continue;
        best = Math.min(best, Math.hypot(u.pos.x - pos.x, u.pos.z - pos.z));
      }
      return best;
    },
  };
}

export { ROAD_LINES };
