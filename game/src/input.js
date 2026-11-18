// Keyboard and mouse state. The game loop asks this module what the player
// is doing this frame; edge-triggered actions are consumed once.
export function createInput(el) {
  const keys = new Set();
  const pressed = new Set();
  let lookDX = 0;
  let lookDY = 0;
  let shootQueued = false;
  let punchQueued = false;
  let locked = false;

  function onKeyDown(e) {
    if (e.code === 'Tab') e.preventDefault();
    if (!keys.has(e.code)) pressed.add(e.code);
    keys.add(e.code);
  }
  function onKeyUp(e) {
    keys.delete(e.code);
  }
  function onMouseMove(e) {
    if (!locked) return;
    lookDX += e.movementX || 0;
    lookDY += e.movementY || 0;
  }
  function onMouseDown(e) {
    if (e.button === 0) shootQueued = true;
    if (e.button === 2) punchQueued = true;
    if (!locked && el && el.requestPointerLock) {
      try { el.requestPointerLock(); } catch { /* pointer lock is optional */ }
    }
  }
  function onLockChange() {
    locked = document.pointerLockElement === el;
  }
  function onContextMenu(e) {
    e.preventDefault();
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousemove', onMouseMove);
  if (el) el.addEventListener('mousedown', onMouseDown);
  document.addEventListener('pointerlockchange', onLockChange);
  if (el) el.addEventListener('contextmenu', onContextMenu);

  const mouse = { down: false, rightDown: false };
  window.addEventListener('mousedown', (e) => {
    if (e.button === 0) mouse.down = true;
    if (e.button === 2) mouse.rightDown = true;
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) mouse.down = false;
    if (e.button === 2) mouse.rightDown = false;
  });

  return {
    mouse,
    // -1..1 strafe (A/D) and forward (W/S). Positive forward is W.
    moveX() {
      const l = keys.has('KeyA') || keys.has('ArrowLeft');
      const r = keys.has('KeyD') || keys.has('ArrowRight');
      return (r ? 1 : 0) - (l ? 1 : 0);
    },
    moveY() {
      const f = keys.has('KeyW') || keys.has('ArrowUp');
      const b = keys.has('KeyS') || keys.has('ArrowDown');
      return (f ? 1 : 0) - (b ? 1 : 0);
    },
    get sprint() { return keys.has('ShiftLeft') || keys.has('ShiftRight'); },
    get handbrake() { return keys.has('Space'); },
    get nitro() { return keys.has('ShiftLeft') || keys.has('ShiftRight'); },
    takeLook() {
      const out = { dx: lookDX, dy: lookDY };
      lookDX = 0;
      lookDY = 0;
      return out;
    },
    wasPressed(code) {
      return pressed.has(code);
    },
    // One-shot actions, consumed when read.
    takeActions() {
      const actions = {
        interact: pressed.has('KeyE'),
        reload: pressed.has('KeyR'),
        pause: pressed.has('Escape'),
        confirm: pressed.has('Enter'),
        retry: pressed.has('KeyR'),
        mute: pressed.has('KeyM'),
        shootClick: shootQueued,
        punch: punchQueued || pressed.has('KeyF'),
        weapon: 0,
      };
      for (let n = 1; n <= 6; n += 1) {
        if (pressed.has(`Digit${n}`)) actions.weapon = n;
      }
      pressed.clear();
      shootQueued = false;
      punchQueued = false;
      return actions;
    },
    endFrame() {
      pressed.clear();
    },
  };
}
