// Deterministic screenshot scenes: ?shot=start|drive|chase|mission (with
// &seed=N) stages a fixed scene instead of the title flow, runs it for a few
// frames, then sets window.__shotReady so a screenshot tool knows the frame
// is settled. Every scene is built from the same systems the game itself uses.

import { GARAGE_POS } from './config.js';

export function stageShot(shot, game, render) {
  const { cam } = render;
  const startGame = () => {
    game.mode = 'play';
    game.audio.unlock();
    document.getElementById('screen-title').classList.remove('show');
    document.getElementById('screen-pause').classList.remove('show');
    document.getElementById('screen-over').classList.remove('show');
  };

  if (shot === 'start') {
    // Title screen over a living street: camera low on the avenue, traffic
    // rolling past, palms and towers behind the title card.
    game.mode = 'title';
    game.player.state.pos.set(-20, 0, 40);
    game.player.state.heading = Math.PI;
    cam.fixed = {
      pos: new (game.player.pos.constructor)(-14, 3.2, 52),
      look: new (game.player.pos.constructor)(-40, 6, -40),
    };
    cam.yaw = Math.PI;
    document.getElementById('screen-title').classList.add('show');
    return;
  }

  if (shot === 'drive') {
    startGame();
    const car = game.stealableCars[1];
    game.player.state.pos.set(car.pos.x, 0, car.pos.z);
    game.enterCar(car);
    car.speed = 22;
    car.heading = Math.PI / 2;
    car.pos.set(-60, 0, 0);
    cam.fixed = null;
    cam.yaw = car.heading;
    game.missions.load(0);
    game.toast('Hot Wheels: drive the car to Vera’s garage');
    return;
  }

  if (shot === 'chase') {
    startGame();
    const car = game.stealableCars[0];
    // A red getaway car reads clearly against the white police units.
    car.mesh.userData.body.material.color.set(0xc23b2e);
    game.player.state.pos.set(car.pos.x, 0, car.pos.z);
    game.enterCar(car);
    car.speed = 26;
    car.heading = 0;
    car.pos.set(0, 0, 40);
    cam.fixed = null;
    cam.yaw = car.heading;
    game.setWanted(3);
    // Park two units close behind so the chase reads in one frame.
    const units = game.police.units;
    if (units[0]) {
      units[0].pos.set(-6, 0, 62);
      units[0].heading = 0;
      units[0].speed = 30;
    }
    if (units[1]) {
      units[1].pos.set(7, 0, 58);
      units[1].heading = 0.2;
      units[1].speed = 30;
    }
    if (units[2]) {
      units[2].pos.set(-14, 0, 20);
      units[2].heading = 0.4;
      units[2].speed = 28;
    }
    game.missions.load(2);
    game.toast('Heat Wave: lose the cops and reach the safehouse');
    return;
  }

  if (shot === 'mission') {
    startGame();
    // Stand clear of the lamp at the 160/0 corner, facing the docks beacon
    // so the pier, the containers and the beam are all in frame.
    game.player.state.pos.set(172, 0, -10);
    game.player.state.heading = Math.atan2(188 - 172, 0 - (-10));
    cam.fixed = null;
    cam.yaw = game.player.state.heading;
    game.missions.load(1);
    game.toast('The Courier: pick up the package at the docks');
    return;
  }

  if (shot === 'garage') {
    startGame();
    game.player.state.pos.set(-132, 0, 120);
    game.player.state.heading = 0;
    cam.fixed = null;
    cam.yaw = 0;
    game.missions.load(0);
    return;
  }
}
