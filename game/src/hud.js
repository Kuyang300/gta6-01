// The HUD: cash, health, wanted stars, objective, speed, crack progress and a
// live minimap — all plain DOM and a 2D canvas over the 3D view. The minimap
// draws the road grid, the landmarks, the mission beacon, traffic, police and
// the player's arrow every frame.

import { BANK_POS, CITY_HALF, DOCKS_POS, GARAGE_POS, ROAD_LINES, SAFEHOUSE_POS, WATER_X } from './config.js';

export function createHud() {
  const cashEl = document.getElementById('cash');
  const healthFill = document.getElementById('health-fill');
  const starsEl = document.getElementById('stars');
  const objectiveEl = document.getElementById('objective');
  const speedEl = document.getElementById('speed');
  const toastEl = document.getElementById('toast');
  const crackEl = document.getElementById('crack');
  const crackFill = document.getElementById('crack-fill');
  const crosshair = document.getElementById('crosshair');
  const hintEl = document.getElementById('hint');
  const map = document.getElementById('minimap');
  const mapCtx = map.getContext('2d');
  const mapSize = map.width;

  let lastCash = -1;
  let lastHealth = -1;
  let lastStars = -1;
  let lastObjective = '';
  let lastSpeed = -1;
  let toastTimer = null;

  function toMap(x, z) {
    const s = mapSize / (CITY_HALF * 2 + 40);
    return [(x + CITY_HALF + 20) * s, (z + CITY_HALF + 20) * s];
  }

  return {
    showToast(text, ms = 3600) {
      toastEl.textContent = text;
      toastEl.classList.add('show');
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
    },
    update(game) {
      if (game.cash !== lastCash) {
        cashEl.textContent = `$${game.cash.toLocaleString('en-US')}`;
        lastCash = game.cash;
      }
      const health = Math.max(0, Math.round(game.health));
      if (health !== lastHealth) {
        healthFill.style.width = `${health}%`;
        healthFill.style.background = health > 50 ? '#3aa655' : health > 25 ? '#e8b93b' : '#c23b2e';
        lastHealth = health;
      }
      if (game.wanted !== lastStars) {
        starsEl.textContent = '★'.repeat(game.wanted) + '☆'.repeat(5 - game.wanted);
        starsEl.classList.toggle('hot', game.wanted > 0);
        lastStars = game.wanted;
      }
      const objective = game.missions.stageText();
      if (objective !== lastObjective) {
        objectiveEl.textContent = objective;
        lastObjective = objective;
      }
      const speed = game.driving && game.currentCar ? Math.round(Math.abs(game.currentCar.speed) * 2.4) : -1;
      if (speed !== lastSpeed) {
        speedEl.textContent = speed >= 0 ? `${speed} km/h` : '';
        lastSpeed = speed;
      }
      if (game.crackProgress > 0) {
        crackEl.classList.add('show');
        crackFill.style.width = `${Math.round(game.crackProgress * 100)}%`;
      } else {
        crackEl.classList.remove('show');
      }
      crosshair.style.display = game.driving || game.mode !== 'play' ? 'none' : 'block';
      hintEl.textContent = game.driving
        ? 'W/S drive · A/D steer · Space brake · E exit'
        : 'WASD move · Shift run · E steal car · Click shoot · F punch';
      this.drawMap(game);
    },
    drawMap(game) {
      const ctx = mapCtx;
      const s = mapSize / (CITY_HALF * 2 + 40);
      ctx.fillStyle = 'rgba(10, 14, 20, 0.82)';
      ctx.fillRect(0, 0, mapSize, mapSize);
      // Sea.
      ctx.fillStyle = '#1c5a75';
      const [wx] = toMap(WATER_X, 0);
      ctx.fillRect(wx, 0, mapSize - wx, mapSize);
      // Roads.
      ctx.strokeStyle = '#5a6068';
      ctx.lineWidth = Math.max(2, 12 * s);
      for (const line of ROAD_LINES) {
        const [px] = toMap(line, 0);
        const [, pz] = toMap(0, line);
        ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, mapSize); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, pz); ctx.lineTo(mapSize, pz); ctx.stroke();
      }
      // Landmarks.
      const marks = [
        [GARAGE_POS, '#3aa655', 'G'],
        [BANK_POS, '#e8b93b', '$'],
        [DOCKS_POS, '#4ec3e0', 'D'],
        [SAFEHOUSE_POS, '#e07a9e', 'H'],
      ];
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const [pos, color, label] of marks) {
        const [mx, mz] = toMap(pos.x, pos.z);
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(mx, mz, 5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#0a0e14';
        ctx.fillText(label, mx, mz + 0.5);
      }
      // Mission beacon.
      if (game.missions.beacon.visible) {
        const [bx, bz] = toMap(game.missions.beacon.position.x, game.missions.beacon.position.z);
        const pulse = 6 + Math.sin(performance.now() / 200) * 2;
        ctx.strokeStyle = '#ffd23b';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(bx, bz, pulse, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#ffd23b';
        ctx.beginPath(); ctx.arc(bx, bz, 3, 0, Math.PI * 2); ctx.fill();
      }
      // Traffic (grey) and police (red).
      ctx.fillStyle = '#9aa0a6';
      for (const car of game.traffic.cars) {
        const x = car.axis === 'x' ? car.pos : car.line + car.lane;
        const z = car.axis === 'x' ? car.line + car.lane : car.pos;
        const [mx, mz] = toMap(x, z);
        ctx.fillRect(mx - 1.5, mz - 1.5, 3, 3);
      }
      ctx.fillStyle = '#ff4444';
      for (const u of game.police.units) {
        if (u.disabled) continue;
        const [mx, mz] = toMap(u.pos.x, u.pos.z);
        ctx.beginPath(); ctx.arc(mx, mz, 3, 0, Math.PI * 2); ctx.fill();
      }
      // Player arrow.
      const [px, pz] = toMap(game.playerPos.x, game.playerPos.z);
      const heading = game.driving && game.currentCar ? game.currentCar.heading : game.player.heading;
      ctx.save();
      ctx.translate(px, pz);
      ctx.rotate(Math.PI - heading);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(-5, 6); ctx.closePath();
      ctx.fill();
      ctx.restore();
    },
  };
}
