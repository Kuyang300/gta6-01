// The world: wires every system together — city, traffic, pedestrians, police,
// missions, the player, the HUD and the save — and owns the game state the
// others read: cash, health, wanted level, driving, mode and the save file.
//
// The heat model: a crime resets the crime clock; once the player has kept
// clean for a while and no unit is close, the wanted level cools one star at
// a time. Getting away fast cools it quicker, and during Heat Wave it cools
// faster still so the mission can end.
//
// Saves live in two slots: slot 0 is the original save key, slot 1 is a second
// slot under a derived key, so a run can be kept alongside a fresh attempt.

import * as THREE from 'three';
import {
  PLAYER, SAVE_KEY, WANTED_DECAY_SECONDS, WANTED_MISSION_DECAY_SECONDS,
} from './config.js';
import { createRandom } from './random.js';
import { createCity } from './city.js';
import { createTraffic } from './vehicles.js';
import { createPedestrians } from './pedestrians.js';
import { createPolice } from './police.js';
import { createMissions } from './missions.js';
import { createPlayer } from './player.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';

const RAM_DAMAGE = 8;
const RAM_SLOW = 0.55;
const BAIL_COST = 200;
const CLEAN_FOR = 14; // seconds with no crime before the heat starts cooling
const FLEE_SPEED = 25; // driving away this fast cools the heat quicker
const FLEE_BONUS = 1.5;

function slotKey(slot) {
  return slot === 1 ? `${SAVE_KEY}-b` : SAVE_KEY;
}

export function createGame(container, seed) {
  const rng = createRandom(seed);
  const audio = createAudio();
  const hud = createHud();

  const game = {
    mode: 'title', // title | play | paused | over
    overKind: null, // 'busted' | 'wasted'
    cash: 0,
    health: PLAYER.maxHealth,
    wanted: 0,
    driving: false,
    currentCar: null,
    crackProgress: 0,
    time: 0,
    audio,
    hud,
    missions: null,
    peds: null,
    police: null,
    traffic: null,
    player: null,
    city: null,
    stealableCars: [],
    scene: null,
    renderer: null,
    cam: null,
    tracers: [],
    muzzle: null,
    bustTimer: 0,
    wantedTimer: 0,
    crimeTimer: 0,
    healthRegenTimer: 0,
    heatWaveStarted: false,
    saveSlot: 0,
    lastPoliceDist: Infinity,
  };

  function initRenderer(render) {
    game.renderer = render.renderer;
    game.scene = render.scene;
    game.cam = render.cam;
    game.city = createCity(render.scene, rng);
    game.traffic = createTraffic(render.scene, rng, game.city.colliders);
    game.stealableCars = game.traffic.spawnParked(render.scene, rng, 8);
    game.peds = createPedestrians(render.scene, rng);
    game.police = createPolice(render.scene, rng, game.city.colliders);
    game.player = createPlayer(render.scene);
    game.missions = createMissions(render.scene);
  }

  game.initRenderer = initRenderer;

  Object.defineProperty(game, 'playerPos', {
    get() {
      if (game.driving && game.currentCar) return game.currentCar.pos;
      return game.player ? game.player.pos : new THREE.Vector3();
    },
  });

  game.toast = (text) => hud.showToast(text);

  game.saveToSlot = (slot) => {
    try {
      window.localStorage.setItem(slotKey(slot), JSON.stringify({
        cash: game.cash,
        missionIndex: game.missions ? game.missions.index : 0,
        health: Math.round(game.health),
        slot,
        savedAt: Date.now(),
      }));
      return true;
    } catch {
      return false; // storage unavailable: the game still plays
    }
  };

  game.save = () => game.saveToSlot(game.saveSlot);

  game.loadSlot = (slot) => {
    try {
      const raw = window.localStorage.getItem(slotKey(slot));
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };

  game.loadSave = () => game.loadSlot(game.saveSlot);

  game.listSlots = () => {
    const found = [];
    for (const slot of [0, 1]) {
      const save = game.loadSlot(slot);
      if (save) found.push({ slot, save });
    }
    return found;
  };

  game.switchSlot = (slot) => {
    game.saveSlot = slot === 1 ? 1 : 0;
  };

  game.applySave = (save) => {
    if (!save) return;
    game.cash = save.cash || 0;
    game.health = save.health || PLAYER.maxHealth;
    if (game.missions) game.missions.load(save.missionIndex || 0);
  };

  game.setWanted = (level, message) => {
    game.wanted = Math.max(0, Math.min(5, level));
    game.crimeTimer = 0;
    game.wantedTimer = 0;
    game.lastPoliceDist = Infinity;
    if (message) game.toast(message);
    if (game.wanted > 0 && game.police) game.police.ensureCount(game.wanted, game.playerPos);
  };

  game.addWanted = (amount, message) => {
    if (game.wanted >= 5) return;
    game.setWanted(game.wanted + amount, message);
  };

  game.enterCar = (car) => {
    game.driving = true;
    game.currentCar = car;
    game.player.hide();
    game.cam.yaw = car.heading;
    game.audio.pickup();
  };

  game.exitCar = () => {
    if (!game.currentCar) return;
    const car = game.currentCar;
    const side = car.heading + Math.PI / 2;
    game.player.state.pos.set(
      car.pos.x + Math.sin(side) * 3,
      0,
      car.pos.z + Math.cos(side) * 3,
    );
    game.player.state.heading = car.heading;
    game.driving = false;
    game.currentCar = null;
    game.player.show();
  };

  game.nearestStealable = () => {
    let best = null;
    let bestD = 4.2;
    for (const car of game.stealableCars) {
      if (car.disabled) continue;
      const d = Math.hypot(car.pos.x - game.player.pos.x, car.pos.z - game.player.pos.z);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  };

  game.addTracer = (origin, dir) => {
    const end = origin.clone().addScaledVector(dir, 40);
    end.y = 1.4;
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(origin.x, 1.5, origin.z), end,
    ]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.9 }));
    game.scene.add(line);
    game.tracers.push({ line, t: 0.09 });
  };

  game.addMuzzle = () => {
    if (game.cam) game.cam.addShake(0.12);
  };

  game.busted = () => {
    if (game.mode !== 'play') return;
    game.mode = 'over';
    game.overKind = 'busted';
    game.cash = Math.max(0, game.cash - BAIL_COST);
    game.setWanted(0);
    if (game.police) game.police.clear();
    game.save();
  };

  game.wasted = () => {
    if (game.mode !== 'play') return;
    game.mode = 'over';
    game.overKind = 'wasted';
    game.cash = Math.max(0, game.cash - BAIL_COST);
    game.setWanted(0);
    if (game.police) game.police.clear();
    game.save();
  };

  game.respawn = () => {
    game.health = PLAYER.maxHealth;
    game.bustTimer = 0;
    if (game.driving) game.exitCar();
    game.player.state.pos.set(-120, 0, 100);
    game.player.state.heading = 0;
    game.cam.yaw = 0;
    game.mode = 'play';
  };

  // One cooling tick: how much of a star's worth of time passes this frame.
  // Clean time and distance from the nearest unit count; fleeing at speed
  // counts extra; Heat Wave counts double so the escape can actually end.
  function coolingRate(dt) {
    const inMission3 = game.missions.index === 2;
    const base = inMission3 ? WANTED_MISSION_DECAY_SECONDS : WANTED_DECAY_SECONDS;
    let rate = dt / base;
    const fleeing = game.driving && game.currentCar
      && Math.abs(game.currentCar.speed) > FLEE_SPEED;
    const nearest = game.police.nearest(game.playerPos);
    if (fleeing && nearest > game.lastPoliceDist) rate *= FLEE_BONUS;
    game.lastPoliceDist = nearest;
    return rate;
  }

  game.update = (dt, input) => {
    game.time += dt;
    game.city.update(game.time, dt);
    game.traffic.update(dt);

    const playerSpeed = game.driving && game.currentCar
      ? game.currentCar.speed
      : game.player.state.speed;
    const scared = game.wanted > 0;
    game.peds.update(dt, game.playerPos, scared);

    // Wanted decay: the heat cools once the player has kept clean for a
    // while and no unit is close. A star drops each time the cooling timer
    // fills; it resets the moment a new crime lands.
    if (game.wanted > 0) {
      game.crimeTimer += dt;
      const nearestPolice = game.police.nearest(game.playerPos);
      if (game.crimeTimer > CLEAN_FOR && nearestPolice > 45) {
        game.wantedTimer += coolingRate(dt) * WANTED_DECAY_SECONDS;
        if (game.wantedTimer >= WANTED_DECAY_SECONDS) {
          game.wantedTimer = 0;
          game.wanted -= 1;
          if (game.wanted === 0) game.toast('You lost them. The heat is off.');
        }
      } else {
        game.wantedTimer = 0;
      }
      game.police.ensureCount(game.wanted, game.playerPos);
    }

    let bustAccumulating = false;
    game.police.update(dt, game.playerPos, playerSpeed, game.driving,
      () => { bustAccumulating = true; },
      (unit) => {
        // A ram hurts and slows the player down. It never teleports the car:
        // shoving the position straight through a wall would wedge it inside
        // a building, and the chase should be won by driving, not by luck.
        game.health -= RAM_DAMAGE;
        game.audio.crash(1);
        if (game.cam) game.cam.addShake(0.5);
        if (game.driving && game.currentCar) {
          game.currentCar.speed *= RAM_SLOW;
        } else {
          game.health -= 4;
        }
        if (game.health <= 0) game.wasted();
      });

    if (bustAccumulating) {
      game.bustTimer += dt;
      if (game.bustTimer > 2.5) game.busted();
    } else {
      game.bustTimer = Math.max(0, game.bustTimer - dt * 2);
    }

    // Health slowly returns when the heat is off.
    if (game.wanted === 0 && game.health < PLAYER.maxHealth) {
      game.healthRegenTimer += dt;
      if (game.healthRegenTimer > 2) {
        game.health = Math.min(PLAYER.maxHealth, game.health + 2);
        game.healthRegenTimer = 0;
      }
    }

    // Mission 3 starts hot exactly once, the moment it becomes current.
    if (game.missions.index === 2 && game.missions.state.stage === 0 && !game.heatWaveStarted) {
      game.heatWaveStarted = true;
      game.missions.startHeatWave(game);
    }

    game.missions.update(dt, game);
    game.missions.beacon.userData.update(game.time);

    // Tracer fade.
    for (let i = game.tracers.length - 1; i >= 0; i--) {
      const tracer = game.tracers[i];
      tracer.t -= dt;
      tracer.line.material.opacity = Math.max(0, tracer.t / 0.09) * 0.9;
      if (tracer.t <= 0) {
        game.scene.remove(tracer.line);
        tracer.line.geometry.dispose();
        tracer.line.material.dispose();
        game.tracers.splice(i, 1);
      }
    }

    // Audio follows the chase.
    game.audio.setEngine(game.driving && game.currentCar ? game.currentCar.speed : 0, game.driving);
    game.audio.setSiren(game.wanted > 0, dt);

    // HUD.
    hud.update(game);
  };

  return game;
}
