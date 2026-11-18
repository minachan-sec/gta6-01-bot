// Save and load, in localStorage. The game saves after every mission pass
// and from the pause menu; Continue on the title screen picks up where the
// player left off. Storage can be off (private windows): then the game just
// plays the session through.
import { SAVE_KEY } from './config.js';

export function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.v !== 1) return null;
    return data;
  } catch {
    return null;
  }
}

export function writeSave(G) {
  try {
    const data = {
      v: 1,
      cash: G.player.cash,
      missionIndex: G.mission.index,
      completed: G.mission.completed,
      x: G.player.x,
      y: G.player.y,
      health: G.player.health,
      ammo: G.player.ammo,
      stats: G.stats,
      savedAt: Date.now(),
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // ignore
  }
}
