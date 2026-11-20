// Keyboard and pointer input. Held keys give a steering direction; one-shot presses
// (enter a car, punch, pause, mute) are queued as bit flags and taken once by the
// loop, so a press between two frames is never lost and never counted twice.
// Mouse drag orbits the camera; a click (no drag) fires the player's weapon.

export const ACTION_ENTER = 1;
export const ACTION_PUNCH = 2;
export const ACTION_PAUSE = 4;
export const ACTION_MUTE = 8;
export const ACTION_CONFIRM = 16;

const FORWARD = new Set(['KeyW', 'ArrowUp']);
const BACK = new Set(['KeyS', 'ArrowDown']);
const LEFT = new Set(['KeyA', 'ArrowLeft']);
const RIGHT = new Set(['KeyD', 'ArrowRight']);
const RUN = new Set(['ShiftLeft', 'ShiftRight']);
const BRAKE = new Set(['Space']);
const ENTER = new Set(['KeyE']);
const PUNCH = new Set(['KeyF']);
const PAUSE = new Set(['KeyP', 'Escape']);
const MUTE = new Set(['KeyM']);
const CONFIRM = new Set(['Enter']);

export function createInput(target) {
  const held = new Set();
  let actions = 0;
  let dragX = 0;
  let dragY = 0;
  let dragging = false;
  let downX = 0;
  let downY = 0;
  let clicked = false;

  window.addEventListener('keydown', (event) => {
    if (event.repeat) {
      if (BRAKE.has(event.code) || FORWARD.has(event.code) || BACK.has(event.code)) {
        event.preventDefault();
      }
      return;
    }
    held.add(event.code);
    if (ENTER.has(event.code)) actions |= ACTION_ENTER;
    else if (PUNCH.has(event.code)) actions |= ACTION_PUNCH;
    else if (PAUSE.has(event.code)) actions |= ACTION_PAUSE;
    else if (MUTE.has(event.code)) actions |= ACTION_MUTE;
    else if (CONFIRM.has(event.code)) actions |= ACTION_CONFIRM;
    if (
      FORWARD.has(event.code) || BACK.has(event.code) || LEFT.has(event.code) ||
      RIGHT.has(event.code) || BRAKE.has(event.code)
    ) {
      event.preventDefault();
    }
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  window.addEventListener('blur', () => held.clear());

  target.addEventListener('pointerdown', (event) => {
    dragging = true;
    downX = event.clientX;
    downY = event.clientY;
    dragX = 0;
    dragY = 0;
  });
  window.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    dragX += event.movementX || 0;
    dragY += event.movementY || 0;
  });
  window.addEventListener('pointerup', (event) => {
    if (!dragging) return;
    dragging = false;
    const moved = Math.abs(event.clientX - downX) + Math.abs(event.clientY - downY);
    if (moved < 6) clicked = true;
  });

  return {
    get forward() { return [...held].some((c) => FORWARD.has(c)); },
    get back() { return [...held].some((c) => BACK.has(c)); },
    get left() { return [...held].some((c) => LEFT.has(c)); },
    get right() { return [...held].some((c) => RIGHT.has(c)); },
    get run() { return [...held].some((c) => RUN.has(c)); },
    get brake() { return [...held].some((c) => BRAKE.has(c)); },
    get dragging() { return dragging; },
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    takeDrag() {
      const dx = dragX;
      const dy = dragY;
      dragX = 0;
      dragY = 0;
      return { dx, dy };
    },
    takeClick() {
      const was = clicked;
      clicked = false;
      return was;
    },
  };
}
