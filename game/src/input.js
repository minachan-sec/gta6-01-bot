// Keyboard and mouse, with edge-triggered actions (pressed this frame) so
// menus and interactions fire once per key press, not once per frame.
export function createInput(canvas) {
  const keys = new Set();
  const pressed = new Set();
  const mouse = { x: 0, y: 0, down: false, clicked: false, rightDown: false };
  let anyKey = false;

  function keyName(e) {
    return e.key.length === 1 ? e.key.toLowerCase() : e.key;
  }

  window.addEventListener('keydown', (e) => {
    const k = keyName(e);
    if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
    if (!keys.has(k)) pressed.add(k);
    keys.add(k);
    anyKey = true;
  });
  window.addEventListener('keyup', (e) => keys.delete(keyName(e)));
  window.addEventListener('blur', () => keys.clear());

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) {
      mouse.down = true;
      mouse.clicked = true;
    } else if (e.button === 2) {
      mouse.rightDown = true;
    }
    anyKey = true;
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) mouse.down = false;
    if (e.button === 2) mouse.rightDown = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  function axis(neg, pos) {
    return (keys.has(pos) ? 1 : 0) - (keys.has(neg) ? 1 : 0);
  }

  return {
    keys,
    mouse,
    /** -1..1 driving/movement axis from WASD and the arrow keys. */
    driveX() { return axis('a', 'd') + axis('ArrowLeft', 'ArrowRight'); },
    driveY() { return axis('w', 's') + axis('ArrowUp', 'ArrowDown'); },
    get sprint() { return keys.has('Shift'); },
    get anyKey() { return anyKey; },
    wasPressed(key) { return pressed.has(key); },
    /** Edge-triggered actions, consumed once per call. Call this only when
     * the frame will act on the result — a frame that runs no simulation
     * step must not call it, or a quick press is lost. */
    takeActions() {
      const out = {
        confirm: pressed.has('Enter') || pressed.has(' ') || mouse.clicked,
        interact: pressed.has('e'),
        pause: pressed.has('Escape') || pressed.has('p'),
        mute: pressed.has('m'),
        retry: pressed.has('r'),
        punch: pressed.has('f'),
        shoot: mouse.clicked,
      };
      pressed.clear();
      mouse.clicked = false;
      anyKey = false;
      return out;
    },
    endFrame() {
      pressed.clear();
      mouse.clicked = false;
      anyKey = false;
    },
  };
}
