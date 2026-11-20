// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the
// renderer paints what is there. The game moves between four screens: title,
// play, paused and game over.
//
// ?seed=N fixes the city. ?shot=start|drive|chase|mission (with &seed=N)
// stages that scene instead of the title flow, paints it a few times and sets
// window.__shotReady for a screenshot.

import { STEP, STORY } from './config.js';
import { createInput, ACTION_CONFIRM, ACTION_ENTER, ACTION_MUTE, ACTION_PAUSE, ACTION_PUNCH } from './input.js';
import { createGame } from './world.js';
import { createRenderer } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const container = document.getElementById('stage');
const render = createRenderer(container);
const game = createGame(container, seed);
game.initRenderer(render);
const input = createInput(render.renderer.domElement);

const titleScreen = document.getElementById('screen-title');
const pauseScreen = document.getElementById('screen-pause');
const overScreen = document.getElementById('screen-over');
const overTitle = document.getElementById('over-title');
const overText = document.getElementById('over-text');
const statusEl = document.getElementById('status');
const btnNew = document.getElementById('btn-new');
const btnContinue = document.getElementById('btn-continue');
const btnResume = document.getElementById('btn-resume');
const btnRestart = document.getElementById('btn-restart');
const btnRespawn = document.getElementById('btn-respawn');

function showTitle() {
  game.mode = 'title';
  titleScreen.classList.add('show');
  pauseScreen.classList.remove('show');
  overScreen.classList.remove('show');
  const save = game.loadSave();
  btnContinue.style.display = save ? 'inline-block' : 'none';
  statusEl.textContent = 'Sunhaven Heat title screen. Press Enter to start.';
}

function startGame(fresh) {
  game.audio.unlock();
  game.audio.startMusic();
  if (fresh) {
    game.cash = 0;
    game.health = 100;
    game.setWanted(0);
    game.missions.load(0);
    game.heatWaveStarted = false;
    game.player.state.pos.set(-120, 0, 100);
    game.player.state.heading = 0;
    if (game.driving) game.exitCar();
    game.save();
  } else {
    game.applySave(game.loadSave());
  }
  game.mode = 'play';
  titleScreen.classList.remove('show');
  pauseScreen.classList.remove('show');
  overScreen.classList.remove('show');
  game.toast(fresh ? 'Vera: Jax, I have work for you. Start with Hot Wheels.' : 'Welcome back to Sunhaven, Jax.');
  statusEl.textContent = 'Playing Sunhaven Heat.';
}

function pauseGame() {
  if (game.mode !== 'play') return;
  game.mode = 'paused';
  pauseScreen.classList.add('show');
  statusEl.textContent = 'Paused.';
}

function resumeGame() {
  if (game.mode !== 'paused') return;
  game.mode = 'play';
  pauseScreen.classList.remove('show');
}

function showOver() {
  overTitle.textContent = game.overKind === 'busted' ? 'BUSTED' : 'WASTED';
  overText.textContent = game.overKind === 'busted'
    ? 'The Sunhaven PD caught you. Bail cost you $200 — Vera posted it.'
    : 'Jax is down. The hospital patched you up for $200.';
  overScreen.classList.add('show');
  statusEl.textContent = overTitle.textContent;
}

btnNew.addEventListener('click', () => startGame(true));
btnContinue.addEventListener('click', () => startGame(false));
btnResume.addEventListener('click', resumeGame);
btnRestart.addEventListener('click', () => {
  overScreen.classList.remove('show');
  game.respawn();
});
btnRespawn.addEventListener('click', () => {
  pauseScreen.classList.remove('show');
  game.respawn();
});

// Title screen copy, written from the story in config.js.
document.getElementById('game-title').textContent = STORY.title;
document.getElementById('game-tagline').textContent = STORY.tagline;
document.getElementById('game-intro').textContent = STORY.intro;
document.getElementById('controls-list').innerHTML = STORY.controls
  .map((c) => `<li>${c}</li>`)
  .join('');

if (shot) {
  stageShot(shot, game, render);
  if (shot === 'start') showTitle();
} else {
  showTitle();
}

// Expose a small debug handle for play-testing (read-only state, no cheats
// beyond what the game already offers through its menus).
window.__sunhaven = {
  game,
  get mode() { return game.mode; },
  get cash() { return game.cash; },
  get wanted() { return game.wanted; },
  get mission() { return game.missions.index; },
  get driving() { return game.driving; },
  get health() { return game.health; },
};

let last = performance.now();
let framesPainted = 0;
let shotReadyAt = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const elapsed = Math.min((now - last) / 1000, MAX_FRAME);
  last = now;

  const drag = input.takeDrag();
  if (drag.dx || drag.dy) render.cam.applyDrag(drag.dx, drag.dy);

  if (game.mode === 'play') {
    let steps = 0;
    let acc = elapsed;
    while (acc >= STEP && steps < 5) {
      const actions = input.takeActions();
      if (actions & ACTION_PAUSE) { pauseGame(); break; }
      if (actions & ACTION_MUTE) {
        const muted = game.audio.toggleMute();
        game.toast(muted ? 'Sound off' : 'Sound on');
      }
      if (actions & ACTION_ENTER) {
        if (game.driving) {
          game.exitCar();
        } else {
          const car = game.nearestStealable();
          if (car) {
            game.enterCar(car);
            game.addWanted(1, 'You stole a car!');
          } else {
            game.toast('No car close enough — walk up to one and press E.');
          }
        }
      }
      if (actions & ACTION_PUNCH) game.player.punch(game);
      if (input.takeClick()) game.player.shoot(render.camera, game);

      if (game.driving && game.currentCar) {
        game.currentCar.update(STEP, input, game.city.colliders);
        game.player.state.pos.copy(game.currentCar.pos);
        game.player.state.speed = game.currentCar.speed;
      } else {
        game.player.update(STEP, input, render.cam.yaw, game.city.colliders);
      }
      game.update(STEP, input);
      acc -= STEP;
      steps += 1;
    }
    if (game.mode === 'over') showOver();
  } else if (game.mode === 'title') {
    // The city stays alive behind the title card.
    game.city.update(game.time + elapsed, elapsed);
    game.traffic.update(elapsed);
    game.peds.update(elapsed, game.playerPos, false);
    game.hud.update(game);
  } else if (game.mode === 'paused') {
    const actions = input.takeActions();
    if (actions & ACTION_PAUSE) resumeGame();
    if (actions & ACTION_CONFIRM) resumeGame();
  } else if (game.mode === 'over') {
    const actions = input.takeActions();
    if (actions & ACTION_CONFIRM) {
      overScreen.classList.remove('show');
      game.respawn();
    }
  }

  const targetPos = game.playerPos;
  const targetHeading = game.driving && game.currentCar ? game.currentCar.heading : game.player.heading;
  const speed = game.driving && game.currentCar ? game.currentCar.speed : game.player.state.speed;
  render.cam.update(elapsed, targetPos, targetHeading, game.driving, speed);
  render.renderer.render(render.scene, render.camera);
  framesPainted += 1;

  if (shot && !window.__shotReady) {
    if (framesPainted === 3) shotReadyAt = now;
    if (framesPainted > 3 && now - shotReadyAt > 700) {
      window.__shotReady = true;
    }
  }
}

requestAnimationFrame(frame);
