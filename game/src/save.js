// Save and load, in localStorage. The game saves after every mission pass
// and from the pause menu; Continue on the title screen picks up where the
// player left off. Storage can be off (private windows): then the game just
// plays the session through.
import { CFG } from './config.js';

export function readSave() {
  try {
    const raw = window.localStorage.getItem(CFG.saveKey);
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
    const p = G.player;
    const data = {
      v: 1,
      cash: p.cash,
      rep: p.rep,
      missionIndex: G.mission.index,
      completed: G.mission.completed,
      x: p.x,
      z: p.z,
      heading: p.heading,
      health: p.health,
      armor: p.armor,
      weapons: p.weapons,
      stats: G.stats,
      hour: G.gameHour,
      savedAt: Date.now(),
    };
    window.localStorage.setItem(CFG.saveKey, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(CFG.saveKey);
  } catch {
    // ignore
  }
}
