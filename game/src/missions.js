// Vera's jobs: four story missions, each with stages, a beacon in the world and
// a cash reward. The state machine only watches positions and flags — the world
// owns the player, the cars and the wanted level.

import { MISSIONS } from './config.js';
import { makeBeacon } from './city.js';

export function createMissions(scene) {
  const beacon = makeBeacon(0xffd23b);
  beacon.visible = false;
  scene.add(beacon);

  const state = {
    index: 0,
    stage: 0,
    crackT: 0,
    done: false,
  };

  function current() {
    return MISSIONS[state.index];
  }

  function stageDef() {
    const mission = current();
    return mission ? mission.stages[state.stage] : null;
  }

  function stageText() {
    if (state.done) return 'All jobs done — Sunhaven is yours. Free roam!';
    const mission = current();
    const stage = stageDef();
    if (!mission || !stage) return '';
    return `${mission.title}: ${stage.text}`;
  }

  function placeBeacon() {
    const stage = stageDef();
    if (!stage || !stage.target) {
      beacon.visible = false;
      return;
    }
    beacon.position.set(stage.target.x, 0, stage.target.z);
    beacon.visible = true;
  }

  function advance(game) {
    const mission = current();
    state.stage += 1;
    state.crackT = 0;
    if (state.stage >= mission.stages.length) {
      game.cash += mission.reward;
      game.toast(`${mission.title} complete — +$${mission.reward}`);
      game.audio.missionComplete();
      game.audio.pickup();
      state.index += 1;
      state.stage = 0;
      if (state.index >= MISSIONS.length) {
        state.done = true;
        beacon.visible = false;
      }
      game.save();
    }
    placeBeacon();
  }

  placeBeacon();

  return {
    state,
    get done() { return state.done; },
    get index() { return state.index; },
    stageText,
    beacon,
    load(index) {
      state.index = Math.max(0, Math.min(index, MISSIONS.length - 1));
      state.stage = 0;
      state.crackT = 0;
      state.done = state.index >= MISSIONS.length;
      placeBeacon();
    },
    update(dt, game) {
      if (state.done) return;
      const stage = stageDef();
      if (!stage) return;
      const playerPos = game.playerPos;
      const driving = game.driving;
      const car = game.currentCar;

      if (stage.kind === 'steal') {
        if (driving && car) advance(game);
        return;
      }
      if (stage.kind === 'goto' || stage.kind === 'escape') {
        const d = Math.hypot(playerPos.x - stage.target.x, playerPos.z - stage.target.z);
        if (d < 7) {
          if (stage.kind === 'escape' && state.index === 2) {
            // Heat Wave: reaching the safehouse only counts once the heat is gone.
            if (game.wanted === 0) advance(game);
          } else {
            advance(game);
          }
        }
        return;
      }
      if (stage.kind === 'crack') {
        const d = Math.hypot(playerPos.x - stage.target.x, playerPos.z - stage.target.z);
        if (d < 8) {
          state.crackT += dt;
          game.crackProgress = state.crackT / stage.seconds;
          if (state.crackT >= stage.seconds) {
            game.crackProgress = 0;
            game.setWanted(4, 'The vault is open — run!');
            advance(game);
          }
        } else {
          state.crackT = Math.max(0, state.crackT - dt * 2);
          game.crackProgress = state.crackT / stage.seconds;
        }
      }
    },
    startHeatWave(game) {
      if (state.index === 2 && state.stage === 0) {
        game.setWanted(3, 'The cops are on you — lose them!');
      }
    },
  };
}
