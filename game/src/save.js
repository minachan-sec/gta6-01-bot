// Progress storage in localStorage. The game stores after every passed
// mission and from the pause menu; Continue on the title screen picks up
// where the player left off. When storage is unavailable (private windows),
// the game simply plays the session through without saving.
import { TUNE } from './config.js';

export function loadProgress() {
  try {
    const raw = window.localStorage.getItem(TUNE.storeKey);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.format !== 1) return null;
    return data;
  } catch {
    return null;
  }
}

export function storeProgress(W) {
  try {
    const hero = W.hero;
    const record = {
      format: 1,
      cash: hero.cash,
      rep: hero.rep,
      jobIndex: W.jobs.index,
      finished: W.jobs.finished,
      x: hero.x,
      z: hero.z,
      facing: hero.facing,
      health: hero.health,
      armor: hero.armor,
      owned: hero.owned,
      tally: W.tally,
      hour: W.hour,
      when: Date.now(),
    };
    window.localStorage.setItem(TUNE.storeKey, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

export function wipeProgress() {
  try {
    window.localStorage.removeItem(TUNE.storeKey);
  } catch {
    // storage may be off; nothing to clear
  }
}
