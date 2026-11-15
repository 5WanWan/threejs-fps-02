// input.js — keyboard + mouse state, pointer lock, and the click-to-play flow.
// Play opens the buy menu with a free mouse; B deploys and locks the pointer.
// Pointer-lock failures are caught, never thrown, so headless runs stay clean.
export function createInput(canvas) {
  const input = {
    keys: new Set(),
    mouseDX: 0, mouseDY: 0,
    mouseDown: false,
    locked: false,
    onKey: null,       // (code, down) => void, set by main.js for buy keys etc.
    onMouseDown: null,
    onMouseUp: null,
    onLockChange: null,
  };

  const el = canvas;
  el.addEventListener('click', () => {
    // Clicking the canvas while playing re-locks the pointer.
    if (input._wantLock && !input.locked) lock();
  });

  function lock() {
    try {
      const p = el.requestPointerLock();
      if (p && typeof p.catch === 'function') p.catch(() => { /* headless: no lock */ });
    } catch (e) { /* pointer lock unavailable */ }
  }
  input.requestLock = () => { input._wantLock = true; lock(); };
  input.releaseLock = () => {
    input._wantLock = false;
    try { if (document.pointerLockElement === el) document.exitPointerLock(); } catch (e) { /* ignore */ }
  };

  document.addEventListener('pointerlockchange', () => {
    input.locked = document.pointerLockElement === el;
    if (input.onLockChange) input.onLockChange(input.locked);
  });
  document.addEventListener('mousemove', (e) => {
    if (input.locked) {
      input.mouseDX += e.movementX || 0;
      input.mouseDY += e.movementY || 0;
    }
  });
  document.addEventListener('mousedown', (e) => {
    if (e.button === 0) {
      input.mouseDown = true;
      if (input.onMouseDown) input.onMouseDown();
    }
  });
  document.addEventListener('mouseup', (e) => {
    if (e.button === 0) {
      input.mouseDown = false;
      if (input.onMouseUp) input.onMouseUp();
    }
  });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') e.preventDefault();
    if (!input.keys.has(e.code)) {
      input.keys.add(e.code);
      if (input.onKey) input.onKey(e.code, true);
    }
  });
  window.addEventListener('keyup', (e) => {
    input.keys.delete(e.code);
    if (input.onKey) input.onKey(e.code, false);
  });
  window.addEventListener('blur', () => { input.keys.clear(); input.mouseDown = false; });

  input.consumeMouse = () => {
    const dx = input.mouseDX, dy = input.mouseDY;
    input.mouseDX = 0; input.mouseDY = 0;
    return [dx, dy];
  };
  input.down = (code) => input.keys.has(code);
  input.forwardAxis = () => (input.down('KeyW') || input.down('ArrowUp') ? 1 : 0) - (input.down('KeyS') || input.down('ArrowDown') ? 1 : 0);
  input.strafeAxis = () => (input.down('KeyD') || input.down('ArrowRight') ? 1 : 0) - (input.down('KeyA') || input.down('ArrowLeft') ? 1 : 0);
  return input;
}
