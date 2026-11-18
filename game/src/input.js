// Keyboard + mouse for a third-person game. Mouse-look uses movementX/Y,
// which Chrome reports on plain mousemove (no pointer lock required), so the
// game also works in a headless playtest that dispatches synthetic events.
// Edge-triggered actions fire once per press; tests can inject keys.

export function bindInput(canvas) {
  const down = new Set();
  const edge = new Set();
  const pointer = { x: 0, y: 0, dx: 0, dy: 0, held: false, tapped: false, rightHeld: false };
  let locked = false;

  function normKey(e) {
    if (e.key === ' ') return ' ';
    return e.key.length === 1 ? e.key.toLowerCase() : e.key;
  }

  window.addEventListener('keydown', (e) => {
    const k = normKey(e);
    if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.key)) e.preventDefault();
    if (!down.has(k)) edge.add(k);
    down.add(k);
  });
  window.addEventListener('keyup', (e) => down.delete(normKey(e)));
  window.addEventListener('blur', () => {
    down.clear();
    pointer.held = false;
    pointer.rightHeld = false;
  });

  canvas.addEventListener('mousemove', (e) => {
    pointer.dx += e.movementX || 0;
    pointer.dy += e.movementY || 0;
    const rect = canvas.getBoundingClientRect();
    pointer.x = e.clientX - rect.left;
    pointer.y = e.clientY - rect.top;
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) {
      pointer.held = true;
      pointer.tapped = true;
    } else if (e.button === 2) pointer.rightHeld = true;
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
    if (e.button === 0) pointer.held = false;
    if (e.button === 2) pointer.rightHeld = false;
  });
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  function axisOf(neg, pos) {
    return (down.has(pos) ? 1 : 0) - (down.has(neg) ? 1 : 0);
  }

  return {
    keys: down,
    mouse: pointer,
    get locked() { return locked; },
    /** -1..1 strafe axis (A/D + arrows). */
    strafe() { return axisOf('a', 'd') + axisOf('ArrowLeft', 'ArrowRight'); },
    /** -1..1 forward axis (W/S + arrows). Positive = forward. */
    advance() { return axisOf('s', 'w') + axisOf('ArrowDown', 'ArrowUp'); },
    get running() { return down.has('Shift'); },
    get brake() { return down.has(' ') || down.has('Control'); },
    get boost() { return down.has('Shift'); },
    tapped(key) { return edge.has(key); },
    held(key) { return down.has(key); },
    /** Test hook: pretend a key is down (or up). */
    fakeKey(key, isDown) {
      const k = key.length === 1 ? key.toLowerCase() : key;
      if (isDown) {
        if (!down.has(k)) edge.add(k);
        down.add(k);
      } else down.delete(k);
    },
    /** Test hook: add a mouse-look delta. */
    fakeMouse(dx, dy) {
      pointer.dx += dx;
      pointer.dy += dy;
    },
    /** Consumed once per frame by the game loop. */
    grabLook() {
      const out = { dx: pointer.dx, dy: pointer.dy };
      pointer.dx = 0;
      pointer.dy = 0;
      return out;
    },
    /** Edge actions, consumed once per call. */
    grabActions() {
      const out = {
        confirm: edge.has('Enter') || pointer.tapped,
        interact: edge.has('e'),
        pause: edge.has('Escape') || edge.has('p'),
        mute: edge.has('m'),
        retry: edge.has('r'),
        punch: edge.has('f'),
        reload: edge.has('r'),
        shoot: pointer.tapped || pointer.held,
        shootClick: pointer.tapped,
        weapon: 0,
      };
      for (let i = 1; i <= 6; i += 1) {
        if (edge.has(String(i))) out.weapon = i;
      }
      edge.clear();
      pointer.tapped = false;
      return out;
    },
    clearFrame() {
      edge.clear();
      pointer.tapped = false;
    },
  };
}
