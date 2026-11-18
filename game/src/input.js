// Keyboard + mouse for a third-person game. Mouse-look uses movementX/Y,
// which Chrome reports on plain mousemove (no pointer lock required), so the
// game also works in a headless playtest that dispatches synthetic events.
// Edge-triggered actions fire once per press; tests can inject keys.

export function createInput(canvas) {
  const keys = new Set();
  const pressed = new Set();
  const mouse = { x: 0, y: 0, dx: 0, dy: 0, down: false, clicked: false, rightDown: false };
  let locked = false;

  function keyName(e) {
    if (e.key === ' ') return ' ';
    return e.key.length === 1 ? e.key.toLowerCase() : e.key;
  }

  window.addEventListener('keydown', (e) => {
    const k = keyName(e);
    if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.key)) e.preventDefault();
    if (!keys.has(k)) pressed.add(k);
    keys.add(k);
  });
  window.addEventListener('keyup', (e) => keys.delete(keyName(e)));
  window.addEventListener('blur', () => {
    keys.clear();
    mouse.down = false;
    mouse.rightDown = false;
  });

  canvas.addEventListener('mousemove', (e) => {
    mouse.dx += e.movementX || 0;
    mouse.dy += e.movementY || 0;
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) {
      mouse.down = true;
      mouse.clicked = true;
    } else if (e.button === 2) mouse.rightDown = true;
    // Pointer lock gives the smoothest mouse-look; the game plays fine
    // without it (movementX still flows), so a denied lock is not fatal.
    if (!locked && canvas.requestPointerLock) {
      try {
        const r = canvas.requestPointerLock();
        if (r && r.catch) r.catch(() => {});
      } catch { /* ignore */ }
    }
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) mouse.down = false;
    if (e.button === 2) mouse.rightDown = false;
  });
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  function axis(neg, pos) {
    return (keys.has(pos) ? 1 : 0) - (keys.has(neg) ? 1 : 0);
  }

  return {
    keys,
    mouse,
    get locked() { return locked; },
    /** -1..1 strafe axis (A/D + arrows). */
    moveX() { return axis('a', 'd') + axis('ArrowLeft', 'ArrowRight'); },
    /** -1..1 forward axis (W/S + arrows). Positive = forward. */
    moveY() { return axis('s', 'w') + axis('ArrowDown', 'ArrowUp'); },
    get sprint() { return keys.has('Shift'); },
    get handbrake() { return keys.has(' ') || keys.has('Control'); },
    get nitro() { return keys.has('Shift'); },
    wasPressed(key) { return pressed.has(key); },
    isDown(key) { return keys.has(key); },
    /** Test hook: pretend a key is down (or up). */
    injectKey(key, down) {
      const k = key.length === 1 ? key.toLowerCase() : key;
      if (down) {
        if (!keys.has(k)) pressed.add(k);
        keys.add(k);
      } else keys.delete(k);
    },
    /** Test hook: add a mouse-look delta. */
    injectMouse(dx, dy) {
      mouse.dx += dx;
      mouse.dy += dy;
    },
    /** Consumed once per frame by the game loop. */
    takeLook() {
      const out = { dx: mouse.dx, dy: mouse.dy };
      mouse.dx = 0;
      mouse.dy = 0;
      return out;
    },
    /** Edge actions, consumed once per call. */
    takeActions() {
      const out = {
        confirm: pressed.has('Enter') || mouse.clicked,
        interact: pressed.has('e'),
        pause: pressed.has('Escape') || pressed.has('p'),
        mute: pressed.has('m'),
        retry: pressed.has('r'),
        punch: pressed.has('f'),
        reload: pressed.has('r'),
        shoot: mouse.clicked || mouse.down,
        shootClick: mouse.clicked,
        weapon: 0,
      };
      for (let i = 1; i <= 6; i += 1) {
        if (pressed.has(String(i))) out.weapon = i;
      }
      pressed.clear();
      mouse.clicked = false;
      return out;
    },
    endFrame() {
      pressed.clear();
      mouse.clicked = false;
    },
  };
}
