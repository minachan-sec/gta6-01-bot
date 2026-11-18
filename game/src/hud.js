// Everything in screen space, as DOM over the WebGL canvas: the HUD (cash,
// rep, wanted stars, clock, bars, minimap, objective, speed, weapon slots),
// the dialogue box, banners, and the title / pause / end screens' dynamic
// bits. The minimap is a 2D canvas painted from the same city data.
import { CFG, WEAPONS, WEAPON_ORDER, rankFor, districtAt } from './config.js';
import { CHARACTERS, MISSIONS } from './missions.js';
import { ROADS, ROAD_W, HALF } from './city.js';

const $ = (id) => document.getElementById(id);

export function createHUD(G) {
  const el = {
    hud: $('hud'),
    cash: $('hud-cash'),
    district: $('hud-district'),
    job: $('hud-job'),
    rep: $('hud-rep'),
    stars: $('hud-stars'),
    clock: $('hud-clock'),
    weather: $('hud-weather'),
    health: $('bar-health-fill'),
    armor: $('bar-armor-fill'),
    stamina: $('bar-stamina-fill'),
    minimap: $('minimap'),
    objective: $('hud-objective'),
    objText: $('obj-text'),
    objTimer: $('obj-timer'),
    speedBox: $('hud-speed'),
    speedNum: $('speed-num'),
    speedCar: $('speed-car'),
    nitro: $('nitro-fill'),
    weapons: $('hud-weapons'),
    toast: $('hud-toast'),
    toastText: $('toast-text'),
    prompt: $('hud-prompt'),
    promptText: $('prompt-text'),
    crosshair: $('hud-crosshair'),
    vignette: $('hud-vignette'),
    dialogue: $('dialogue'),
    dlgPortrait: $('dlg-portrait'),
    dlgName: $('dlg-name'),
    dlgText: $('dlg-text'),
    banner: $('banner'),
    bannerTitle: $('banner-title'),
    bannerSub: $('banner-sub'),
    bannerText: $('banner-text'),
    titleScreen: $('title-screen'),
    pauseScreen: $('pause-screen'),
    endScreen: $('end-screen'),
    endTitle: $('end-title'),
    endLines: $('end-lines'),
    endBtn: $('end-btn'),
    continueBtn: $('btn-continue'),
    newGameBtn: $('btn-newgame'),
  };

  // Minimap base layer, painted once from the city data.
  const mmBase = document.createElement('canvas');
  mmBase.width = 256;
  mmBase.height = 256;
  {
    const g = mmBase.getContext('2d');
    const S = 256 / (HALF * 2);
    const X = (x) => (x + HALF) * S;
    const Z = (z) => (z + HALF) * S;
    g.fillStyle = '#2c2c3a';
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#0e4a6b';
    g.fillRect(0, Z(CFG.world.seaZ), 256, 256 - Z(CFG.world.seaZ));
    g.fillStyle = '#c2a878';
    g.fillRect(0, Z(CFG.world.beachZ), 256, Z(CFG.world.seaZ) - Z(CFG.world.beachZ));
    g.fillStyle = '#3a3a48';
    for (let c = 0; c < ROADS.length - 1; c += 1) {
      for (let r = 0; r < ROADS.length - 1; r += 1) {
        g.fillRect(X(ROADS[c] + ROAD_W / 2), Z(ROADS[r] + ROAD_W / 2), (ROADS[c + 1] - ROADS[c] - ROAD_W) * S, (ROADS[r + 1] - ROADS[r] - ROAD_W) * S);
      }
    }
    for (const p of G.city.parks) {
      g.fillStyle = p.kind === 'plaza' ? '#9a917e' : p.kind === 'beach' ? '#c2a878' : '#3d6b34';
      g.fillRect(X(p.x0), Z(p.z0), (p.x1 - p.x0) * S, (p.z1 - p.z0) * S);
    }
    g.fillStyle = '#23232e';
    for (const r of ROADS) {
      g.fillRect(X(r - ROAD_W / 2), 0, ROAD_W * S, 256);
      g.fillRect(0, Z(r - ROAD_W / 2), 256, ROAD_W * S);
    }
    g.fillStyle = '#d8c86a';
    for (const r of ROADS) {
      g.fillRect(X(r) - 0.5, 0, 1, 256);
      g.fillRect(0, Z(r) - 0.5, 256, 1);
    }
  }
  const mmCtx = el.minimap.getContext('2d');
  let mmTimer = 0;

  // Weapon slots, built once.
  const slotEls = {};
  for (const key of WEAPON_ORDER) {
    const d = WEAPONS[key];
    const div = document.createElement('div');
    div.className = 'wslot';
    div.innerHTML = `<span class="wslot-key">${d.slot}</span><span class="wslot-name">${d.name}</span><span class="wslot-ammo"></span>`;
    el.weapons.appendChild(div);
    slotEls[key] = div;
  }

  // Stars, built once.
  const starEls = [];
  for (let i = 0; i < 5; i += 1) {
    const s = document.createElement('span');
    s.className = 'star';
    s.textContent = '★';
    el.stars.appendChild(s);
    starEls.push(s);
  }

  let dlgShown = '';
  let dlgChars = 0;
  let dlgFull = '';

  function fmtClock(hour) {
    const h = Math.floor(hour) % 24;
    const m = Math.floor((hour % 1) * 60);
    const day = CFG.time.dayNames[Math.floor(hour / 24) % 7];
    return `${day} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  function drawMinimap() {
    const S = 200 / (HALF * 2);
    const X = (x) => (x + HALF) * S;
    const Z = (z) => (z + HALF) * S;
    mmCtx.clearRect(0, 0, 200, 200);
    mmCtx.drawImage(mmBase, 0, 0, 200, 200);
    // Mission marker.
    const s = G.mission && G.mission.state === 'running' ? G.mission.stepDef : null;
    let mx = null;
    let mz = null;
    if (s) {
      if (s.kind === 'car' && G.mission.markerCar) {
        mx = G.mission.markerCar.x;
        mz = G.mission.markerCar.z;
      } else if (s.x !== undefined) {
        mx = s.x;
        mz = s.z;
      }
    } else if (G.nextMissionReady) {
      mx = G.city.landmarks.garage.x + 24;
      mz = G.city.landmarks.garage.z + 18;
    }
    if (mx !== null) {
      const pulse = 5 + Math.sin(G.time * 5) * 1.5;
      mmCtx.fillStyle = '#f5b942';
      mmCtx.beginPath();
      mmCtx.arc(X(mx), Z(mz), pulse, 0, Math.PI * 2);
      mmCtx.fill();
      mmCtx.strokeStyle = '#7a5a10';
      mmCtx.lineWidth = 2;
      mmCtx.stroke();
    }
    // Enemies.
    mmCtx.fillStyle = '#e74c3c';
    for (const e of G.enemies) {
      mmCtx.fillRect(X(e.x) - 2, Z(e.z) - 2, 4, 4);
    }
    // Police blips, flashing.
    if (Math.floor(G.time * 3) % 2 === 0) {
      mmCtx.fillStyle = '#4a90d9';
      for (const c of G.wanted.cops) {
        mmCtx.beginPath();
        mmCtx.arc(X(c.x), Z(c.z), 3.5, 0, Math.PI * 2);
        mmCtx.fill();
      }
      for (const c of G.wanted.footCops) mmCtx.fillRect(X(c.x) - 2, Z(c.z) - 2, 4, 4);
    }
    // Player arrow.
    const p = G.player;
    const px = p.car ? p.car.x : p.x;
    const pz = p.car ? p.car.z : p.z;
    const pa = p.car ? p.car.heading : G.camYaw;
    mmCtx.save();
    mmCtx.translate(X(px), Z(pz));
    mmCtx.rotate(Math.atan2(Math.sin(pa), Math.cos(pa)) + Math.PI / 2);
    mmCtx.fillStyle = '#ffffff';
    mmCtx.strokeStyle = '#14161a';
    mmCtx.lineWidth = 1.5;
    mmCtx.beginPath();
    mmCtx.moveTo(0, -7);
    mmCtx.lineTo(5, 6);
    mmCtx.lineTo(-5, 6);
    mmCtx.closePath();
    mmCtx.fill();
    mmCtx.stroke();
    mmCtx.restore();
  }

  function update(dt) {
    const p = G.player;
    el.cash.textContent = `$${p.cash.toLocaleString('en-US')}`;
    el.district.textContent = districtAt(p.x, p.z);
    el.job.textContent = `Job ${Math.min(G.mission.index + 1, MISSIONS.length)} of ${MISSIONS.length}`;
    el.rep.textContent = `${rankFor(p.rep)} · ${p.rep} REP`;
    for (let i = 0; i < 5; i += 1) starEls[i].classList.toggle('lit', i < G.wanted.stars);
    el.clock.textContent = fmtClock(G.gameHour);
    el.health.style.width = `${Math.max(0, p.health)}%`;
    el.health.className = p.health > 30 ? '' : 'low';
    el.armor.style.width = `${Math.max(0, p.armor)}%`;
    el.stamina.style.width = `${Math.max(0, p.stamina)}%`;
    // Objective.
    const s = G.mission && G.mission.state === 'running' ? G.mission.stepDef : null;
    if (s) {
      el.objective.style.display = 'flex';
      el.objText.textContent = s.text;
      const m = G.mission.mission;
      if (m.timeLimit) {
        const left = Math.max(0, m.timeLimit - G.mission.timer);
        el.objTimer.textContent = `${Math.ceil(left)}s`;
        el.objTimer.className = left < 20 ? 'timer low' : 'timer';
      } else el.objTimer.textContent = '';
    } else if (G.nextMissionReady) {
      el.objective.style.display = 'flex';
      el.objText.textContent = `Next job: ${G.mission.mission.title} — go to Marisol\u2019s Garage`;
      el.objTimer.textContent = '';
    } else {
      el.objective.style.display = 'none';
    }
    // Speed / weapons.
    if (p.car) {
      el.speedBox.style.display = 'block';
      el.speedNum.textContent = String(Math.round(Math.abs(p.car.speed) * 2.237));
      el.speedCar.textContent = p.car.name.toUpperCase();
      el.nitro.style.width = `${Math.max(0, p.car.nitro)}%`;
      el.crosshair.style.display = 'none';
    } else {
      el.speedBox.style.display = 'none';
      el.crosshair.style.display = G.screen === 'play' && WEAPONS[p.weapon].kind === 'gun' ? 'block' : 'none';
    }
    for (const key of WEAPON_ORDER) {
      const div = slotEls[key];
      const owned = p.weapons.includes(key);
      div.style.display = owned ? 'flex' : 'none';
      div.classList.toggle('active', owned && p.weapon === key);
      const ammoEl = div.querySelector('.wslot-ammo');
      const def = WEAPONS[key];
      ammoEl.textContent = def.kind === 'gun' ? String(p.ammo[key] ?? 0) : '∞';
    }
    // Toast + prompt.
    if (G.message && G.messageT > 0) {
      el.toast.style.display = 'block';
      el.toastText.textContent = G.message;
      el.toast.style.opacity = String(Math.min(1, G.messageT));
    } else el.toast.style.display = 'none';
    if (G.interactPrompt) {
      el.prompt.style.display = 'block';
      el.promptText.textContent = G.interactPrompt;
    } else el.prompt.style.display = 'none';
    // Damage vignette.
    if (G.hudFlash > 0) {
      el.vignette.style.opacity = String(Math.min(0.7, G.hudFlash));
      G.hudFlash -= dt * 1.6;
    } else el.vignette.style.opacity = '0';
    // Minimap at ~12 Hz.
    mmTimer -= dt;
    if (mmTimer <= 0) {
      mmTimer = 0.08;
      drawMinimap();
    }
    // Dialogue typewriter.
    if (dlgFull) {
      dlgChars = Math.min(dlgFull.length, dlgChars + dt * 55);
      el.dlgText.textContent = dlgFull.slice(0, Math.floor(dlgChars));
    }
    // Banner fade.
    if (G.mission.banner) {
      const t = G.mission.bannerT;
      const b = G.mission.banner;
      const alpha = t < 0.3 ? t / 0.3 : t > 3.2 ? Math.max(0, (4 - t) / 0.8) : 1;
      el.banner.style.display = 'block';
      el.banner.style.opacity = String(Math.max(0, Math.min(1, alpha)));
      el.bannerTitle.textContent = b.title;
      el.bannerSub.textContent = b.sub;
      el.bannerText.textContent = b.text || '';
    } else el.banner.style.display = 'none';
  }

  function showDialogue(line) {
    const key = `${line.who}|${line.text}`;
    if (key === dlgShown) return;
    dlgShown = key;
    dlgFull = line.text;
    dlgChars = 0;
    const c = CHARACTERS[line.who] || CHARACTERS.rook;
    el.dlgPortrait.textContent = c.initials;
    el.dlgPortrait.style.background = c.color;
    el.dlgName.textContent = c.name;
    el.dlgName.style.color = c.color;
    el.dlgText.textContent = '';
    el.dialogue.style.display = 'flex';
  }

  function hideDialogue() {
    dlgShown = '';
    dlgFull = '';
    el.dialogue.style.display = 'none';
  }

  function showEnd(kind) {
    const lines = {
      wasted: ['You got taken down. The hospital patched you up — minus a little cash.'],
      busted: ['The SBPD caught you. They took a fine and let you walk.'],
      failed: ['The job went sideways. Marisol is not happy — but she will give you another shot.'],
      ending: ['Every job done. Kade is finished, the Bay is yours,', 'and Solara Bay finally knows the name Rook Calloway.'],
    };
    const titles = { wasted: 'WASTED', busted: 'BUSTED', failed: 'MISSION FAILED', ending: 'LEGEND OF SOLARA BAY' };
    el.endTitle.textContent = titles[kind] || 'DONE';
    el.endTitle.className = kind === 'ending' ? 'gold' : 'red';
    el.endLines.innerHTML = (lines[kind] || ['']).map((l) => `<p>${l}</p>`).join('');
    el.endBtn.textContent = kind === 'ending' ? 'Keep playing — free roam' : 'Try again (R)';
    el.endScreen.style.display = 'flex';
  }

  function hideEnd() {
    el.endScreen.style.display = 'none';
  }

  return {
    el,
    update,
    showDialogue,
    hideDialogue,
    // Finish the typewriter instantly (staged screenshot dialogue).
    completeDialogue() {
      if (dlgFull) {
        dlgChars = dlgFull.length;
        el.dlgText.textContent = dlgFull;
      }
    },
    showEnd,
    hideEnd,
    setHudVisible(v) {
      el.hud.style.display = v ? 'block' : 'none';
    },
    setTitleVisible(v) {
      el.titleScreen.style.display = v ? 'flex' : 'none';
    },
    setPauseVisible(v) {
      el.pauseScreen.style.display = v ? 'flex' : 'none';
    },
  };
}
