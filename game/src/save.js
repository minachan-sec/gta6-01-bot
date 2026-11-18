// Save games in the browser's local storage. One slot, one key.
// The title screen's Continue button only exists when a save is present.
const KEY = 'solara-bay-save-v1';

export function readSave() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const save = JSON.parse(raw);
    if (typeof save !== 'object' || save === null) return null;
    return save;
  } catch {
    return null;
  }
}

export function writeSave(W) {
  try {
    const p = W.player;
    const save = {
      version: 1,
      cash: p.cash,
      rep: p.rep,
      health: p.health,
      armor: p.armor,
      weapons: p.weapons,
      missionIndex: W.mission.index,
      completed: W.mission.completed,
      x: p.x,
      z: p.z,
      heading: p.heading,
      hour: W.gameHour,
      stats: W.stats,
      savedAt: Date.now(),
    };
    window.localStorage.setItem(KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(KEY);
  } catch { /* storage may be unavailable; the game still runs */ }
}
