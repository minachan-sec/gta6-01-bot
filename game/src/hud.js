// The HUD: every DOM element the player reads — money, stars, bars,
// the minimap, objectives, dialogue and the title/pause/end screens.
import { WEAPONS, WEAPON_ORDER, districtAt } from './config.js';

const DAYS = ['FRI', 'SAT', 'SUN', 'MON', 'TUE', 'WED', 'THU'];

export function createHUD(W) {
  const $ = (id) => document.getElementById(id);
  const el = {
    hud: $('hud'),
    cash: $('cash'),
    district: $('district'),
    job: $('job'),
    rep: $('rep'),
    stars: $('stars'),
    clock: $('clock'),
    healthBar: $('health-bar'),
    armorBar: $('armor-bar'),
    staminaBar: $('stamina-bar'),
    minimap: $('minimap'),
    weaponSlots: $('weapon-slots'),
    speedo: $('speedo'),
    speedVal: $('speed-val'),
    carName: $('car-name'),
    objective: $('objective'),
    timer: $('timer'),
    message: $('message'),
    prompt: $('prompt'),
    banner: $('banner'),
    dialogue: $('dialogue'),
    dialogueWho: $('dialogue-who'),
    dialogueText: $('dialogue-text'),
    titleScreen: $('title-screen'),
    pauseScreen: $('pause-screen'),
    endScreen: $('end-screen'),
    endTitle: $('end-title'),
    endText: $('end-text'),
    endBtn: $('btn-end'),
    continueBtn: $('btn-continue'),
    newGameBtn: $('btn-newgame'),
    flash: $('flash'),
  };
  const mm = el.minimap ? el.minimap.getContext('2d') : null;

  function drawMinimap() {
    if (!mm) return;
    const S = 132; // canvas size
    const scale = S / 760; // world -380..380 maps onto the canvas
    const px = (x) => (x + 380) * scale;
    const pz = (z) => (z + 380) * scale;
    mm.fillStyle = '#10141c';
    mm.fillRect(0, 0, S, S);
    // Roads.
    mm.strokeStyle = '#3a4150';
    mm.lineWidth = 2;
    for (const c of W.city.roads) {
      mm.beginPath(); mm.moveTo(px(c), 0); mm.lineTo(px(c), S); mm.stroke();
      mm.beginPath(); mm.moveTo(0, pz(c)); mm.lineTo(S, pz(c)); mm.stroke();
    }
    // Sea.
    mm.fillStyle = '#1d6f8a';
    mm.fillRect(0, pz(330), S, S - pz(330));
    // Mission target.
    const s = W.mission && W.mission.state === 'running' ? W.mission.stepDef : null;
    let tx = null;
    let tz = null;
    if (s) {
      if (s.kind === 'car' && W.mission.markerCar) { tx = W.mission.markerCar.x; tz = W.mission.markerCar.z; }
      else if (s.x !== undefined) { tx = s.x; tz = s.z; }
    } else if (W.nextReady) {
      tx = W.city.landmarks.garage.x;
      tz = W.city.landmarks.garage.z;
    }
    if (tx !== null) {
      const blink = Math.floor(W.time * 2) % 2 === 0;
      mm.fillStyle = blink ? '#ffd23f' : '#ff9d2e';
      const mx = px(tx);
      const my = pz(tz);
      mm.beginPath();
      mm.moveTo(mx, my - 5); mm.lineTo(mx + 4, my); mm.lineTo(mx, my + 5); mm.lineTo(mx - 4, my);
      mm.closePath(); mm.fill();
    }
    // Cops (blue) and enemies (red).
    mm.fillStyle = '#3a7bff';
    for (const cop of W.wanted.cops) mm.fillRect(px(cop.x) - 2, pz(cop.z) - 2, 4, 4);
    mm.fillStyle = '#ff4444';
    for (const e of W.enemies) {
      if (e.health > 0) mm.fillRect(px(e.x) - 2, pz(e.z) - 2, 4, 4);
    }
    // The player: a white arrow pointing along the heading.
    const p = W.player;
    const heading = p.car ? p.car.heading : p.heading;
    mm.save();
    mm.translate(px(p.x), pz(p.z));
    mm.rotate(Math.atan2(Math.sin(heading), Math.cos(heading)) + Math.PI);
    mm.fillStyle = '#ffffff';
    mm.beginPath();
    mm.moveTo(0, -6); mm.lineTo(4, 5); mm.lineTo(0, 2); mm.lineTo(-4, 5);
    mm.closePath(); mm.fill();
    mm.restore();
  }

  function renderWeaponSlots() {
    if (!el.weaponSlots) return;
    const p = W.player;
    let html = '';
    WEAPON_ORDER.forEach((key, i) => {
      const def = WEAPONS[key];
      const owned = p.weapons.includes(key);
      if (!owned) return;
      const active = p.weapon === key ? 'active' : '';
      const ammo = def.kind === 'gun' ? p.ammo[key] : '∞';
      html += `<span class="slot ${active}">${i + 1} ${def.label} <b>${ammo}</b></span>`;
    });
    el.weaponSlots.innerHTML = html;
  }

  const api = {
    el,
    update(dt) {
      const p = W.player;
      if (el.cash) el.cash.textContent = `$${p.cash}`;
      if (el.district) el.district.textContent = districtAt(p.x, p.z);
      if (el.job) el.job.textContent = W.mission.completed.length >= 6 ? 'Free roam' : `Job ${Math.min(6, W.mission.index + 1)} of 6`;
      if (el.rep) el.rep.textContent = `REP ${p.rep}`;
      if (el.stars) {
        let s = '';
        for (let i = 0; i < 5; i += 1) s += i < W.wanted.stars ? '★' : '☆';
        el.stars.textContent = s;
        el.stars.className = W.wanted.stars > 0 ? 'hot' : '';
      }
      if (el.clock) {
        const day = DAYS[Math.floor(W.gameHour / 24) % 7];
        const h = Math.floor(W.gameHour % 24);
        const m = Math.floor((W.gameHour % 1) * 60);
        el.clock.textContent = `${day} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      }
      if (el.healthBar) el.healthBar.style.width = `${Math.max(0, p.health)}%`;
      if (el.armorBar) el.armorBar.style.width = `${Math.max(0, p.armor)}%`;
      if (el.staminaBar) el.staminaBar.style.width = `${Math.max(0, p.stamina)}%`;
      drawMinimap();
      renderWeaponSlots();
      // Speedometer, only in a car.
      if (el.speedo) {
        if (p.car) {
          el.speedo.style.display = 'block';
          if (el.speedVal) el.speedVal.textContent = Math.round(Math.abs(p.car.speed) * 2.237);
          if (el.carName) el.carName.textContent = p.car.name.toUpperCase();
        } else {
          el.speedo.style.display = 'none';
        }
      }
      // Objective line.
      if (el.objective) {
        const s = W.mission && W.mission.state === 'running' ? W.mission.stepDef : null;
        if (s) el.objective.textContent = s.text;
        else if (W.nextReady) el.objective.textContent = `Head to the garage: ${W.mission.mission ? W.mission.mission.title : 'next job'}`;
        else if (W.mission.completed.length >= 6) el.objective.textContent = 'Free roam. Solara Bay is yours.';
        else el.objective.textContent = '';
      }
      // Mission timer (Night Run).
      if (el.timer) {
        if (W.mission && W.mission.state === 'running' && W.mission.timer > 0) {
          const t = Math.max(0, W.mission.timer);
          el.timer.textContent = `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
          el.timer.style.display = 'block';
        } else {
          el.timer.style.display = 'none';
        }
      }
      // Toast message.
      if (el.message) {
        if (W.messageT > 0) {
          el.message.textContent = W.message;
          el.message.style.opacity = '1';
        } else {
          el.message.style.opacity = '0';
        }
      }
      // Interact prompt.
      if (el.prompt) el.prompt.textContent = W.interactPrompt || '';
      // Mission banner.
      if (el.banner) {
        if (W.mission && W.mission.banner && W.mission.bannerT < 4) {
          el.banner.textContent = W.mission.banner;
          el.banner.style.opacity = '1';
        } else {
          el.banner.style.opacity = '0';
        }
      }
      // Damage flash.
      if (el.flash) {
        el.flash.style.opacity = W.hudFlash > 0 ? String(Math.min(0.55, W.hudFlash * 0.55)) : '0';
        if (W.hudFlash > 0) W.hudFlash -= dt * 2;
      }
      void dt;
    },
    showDialogue(line) {
      if (!el.dialogue) return;
      el.dialogue.style.display = 'block';
      if (el.dialogueWho) el.dialogueWho.textContent = line.who;
      if (el.dialogueText) el.dialogueText.textContent = line.text;
    },
    hideDialogue() {
      if (el.dialogue) el.dialogue.style.display = 'none';
    },
    completeDialogue() {
      // Used by screenshot staging: show the first line, fully visible.
      if (W.mission && W.mission.dialogue) {
        api.showDialogue(W.mission.dialogue.lines[0]);
      }
    },
    setTitleVisible(v) {
      if (el.titleScreen) el.titleScreen.style.display = v ? 'flex' : 'none';
    },
    setHudVisible(v) {
      if (el.hud) el.hud.style.display = v ? 'block' : 'none';
    },
    setPauseVisible(v) {
      if (el.pauseScreen) el.pauseScreen.style.display = v ? 'flex' : 'none';
    },
    showEnd(kind) {
      if (!el.endScreen) return;
      const texts = {
        wasted: ['WASTED', 'Rook went down. The city keeps moving without you.'],
        busted: ['BUSTED', 'The SBPD caught up with you. Marisol posted bail.'],
        failed: ['JOB FAILED', W.failReason || 'The job went sideways.'],
        ending: ['KING OF SOLARA', 'Kade is finished. The docks, the streets, the whole bay — yours now. $4,750 in jobs, and a city that finally knows your name.'],
      };
      const [title, text] = texts[kind] || texts.failed;
      if (el.endTitle) el.endTitle.textContent = title;
      if (el.endText) el.endText.textContent = text;
      if (el.endBtn) el.endBtn.textContent = kind === 'ending' ? 'Free roam' : 'Retry the job';
      el.endScreen.style.display = 'flex';
    },
    hideEnd() {
      if (el.endScreen) el.endScreen.style.display = 'none';
    },
  };
  return api;
}
