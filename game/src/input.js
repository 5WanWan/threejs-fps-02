// Input: pointer lock for mouse look, keyboard state, and fire buttons.
// Pointer lock is only requested from a real user gesture; shot mode never
// locks (the game drives the camera itself there).
export function createInput(canvas, onLockChange) {
  const keys = new Set();
  const state = {
    keys,
    firing: false,
    firingSecondary: false,
    lookX: 0,
    lookY: 0,
  };
  let locked = false;

  function takeLook() {
    const look = { x: state.lookX, y: state.lookY };
    state.lookX = 0;
    state.lookY = 0;
    return look;
  }

  document.addEventListener('mousemove', (event) => {
    if (!locked) return;
    state.lookX += event.movementX;
    state.lookY += event.movementY;
  });
  document.addEventListener('mousedown', (event) => {
    if (!locked) return;
    if (event.button === 0) state.firing = true;
    if (event.button === 2) state.firingSecondary = true;
  });
  document.addEventListener('mouseup', (event) => {
    if (event.button === 0) state.firing = false;
    if (event.button === 2) state.firingSecondary = false;
  });
  document.addEventListener('keydown', (event) => {
    if (event.code === 'Space') event.preventDefault();
    keys.add(event.code);
  });
  document.addEventListener('keyup', (event) => keys.delete(event.code));
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
    onLockChange?.(locked);
  });
  document.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    state,
    takeLook,
    get locked() { return locked; },
    requestLock() {
      if (document.pointerLockElement === canvas) return;
      // requestPointerLock returns a promise in current Chrome: a rejection
      // (no gesture, browser policy) is expected noise, not a game error —
      // swallow it instead of logging an uncaught rejection. The paused
      // overlay offers a second try when the lock is really needed.
      const result = canvas.requestPointerLock?.();
      if (result && typeof result.catch === 'function') result.catch(() => {});
    },
    releaseLock() {
      if (document.pointerLockElement) document.exitPointerLock();
    },
  };
}
