// Everything in screen space, as DOM over the WebGL canvas: the HUD (cash,
// rep, wanted stars, clock, bars, minimap, objective, speed, weapon slots),
// the dialogue box, banners, and the title / pause / end screens' dynamic
// bits. The minimap is a 2D canvas painted from the same city data.
import { TUNE, ARSENAL, ARSENAL_ORDER, titleForRep, zoneAt } from './config.js';
import { CAST, JOBS } from './missions.js';
import { STREETS, STREET_W, EDGE } from './city.js';

const $ = (id) => document.getElementById(id);

export function buildHud(W) {
  const n = {
    hud: $('hud'),
    cash: $('cash'),
    zone: $('zone'),
    job: $('job'),
    rep: $('rep'),
    stars: $('stars'),
    clock: $('clock'),
    hp: $('hp-fill'),
    armor: $('armor-fill'),
    stamina: $('stamina-fill'),
    minimap: $('minimap'),
    aim: $('aim'),
    aimText: $('aim-text'),
    aimTimer: $('aim-timer'),
    speedBox: $('speedbox'),
    speedNum: $('speed-num'),
    speedCar: $('speed-car'),
    boost: $('boost-fill'),
    slots: $('slots'),
    toast: $('toast'),
    toastText: $('toast-text'),
    prompt: $('prompt'),
    promptText: $('prompt-text'),
    crosshair: $('crosshair'),
    vignette: $('vignette'),
    chat: $('chat'),
    chatFace: $('chat-face'),
    chatName: $('chat-name'),
    chatText: $('chat-text'),
    banner: $('banner'),
    bannerTitle: $('banner-title'),
    bannerSub: $('banner-sub'),
    bannerText: $('banner-text'),
    splash: $('splash'),
    pause: $('pause'),
    end: $('end'),
    endTitle: $('end-title'),
    endLines: $('end-lines'),
    endBtn: $('end-btn'),
    continueBtn: $('btn-continue'),
    newGameBtn: $('btn-newgame'),
  };

  // Minimap base layer, painted once from the city data.
  const base = document.createElement('canvas');
  base.width = 256;
  base.height = 256;
  {
    const g = base.getContext('2d');
    const S = 256 / (EDGE * 2);
    const px = (x) => (x + EDGE) * S;
    const pz = (z) => (z + EDGE) * S;
    g.fillStyle = '#2c2c3a';
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#0e4a6b';
    g.fillRect(0, pz(TUNE.map.waterZ), 256, 256 - pz(TUNE.map.waterZ));
    g.fillStyle = '#c2a878';
    g.fillRect(0, pz(TUNE.map.sandZ), 256, pz(TUNE.map.waterZ) - pz(TUNE.map.sandZ));
    g.fillStyle = '#3a3a48';
    for (let c = 0; c < STREETS.length - 1; c += 1) {
      for (let r = 0; r < STREETS.length - 1; r += 1) {
        g.fillRect(px(STREETS[c] + STREET_W / 2), pz(STREETS[r] + STREET_W / 2), (STREETS[c + 1] - STREETS[c] - STREET_W) * S, (STREETS[r + 1] - STREETS[r] - STREET_W) * S);
      }
    }
    for (const p of W.town.greens) {
      g.fillStyle = p.kind === 'plaza' ? '#9a917e' : p.kind === 'beach' ? '#c2a878' : '#3d6b34';
      g.fillRect(px(p.x0), pz(p.z0), (p.x1 - p.x0) * S, (p.z1 - p.z0) * S);
    }
    g.fillStyle = '#23232e';
    for (const s of STREETS) {
      g.fillRect(px(s - STREET_W / 2), 0, STREET_W * S, 256);
      g.fillRect(0, pz(s - STREET_W / 2), 256, STREET_W * S);
    }
    g.fillStyle = '#d8c86a';
    for (const s of STREETS) {
      g.fillRect(px(s) - 0.5, 0, 1, 256);
      g.fillRect(0, pz(s) - 0.5, 256, 1);
    }
  }
  const mapCtx = n.minimap.getContext('2d');
  let mapTimer = 0;

  // Weapon slots, built once.
  const slotEls = {};
  for (const key of ARSENAL_ORDER) {
    const d = ARSENAL[key];
    const div = document.createElement('div');
    div.className = 'slot';
    div.innerHTML = `<span class="slot-key">${d.slot}</span><span class="slot-name">${d.label}</span><span class="slot-ammo"></span>`;
    n.slots.appendChild(div);
    slotEls[key] = div;
  }

  // Stars, built once.
  const starEls = [];
  for (let i = 0; i < 5; i += 1) {
    const s = document.createElement('span');
    s.className = 'star';
    s.textContent = '★';
    n.stars.appendChild(s);
    starEls.push(s);
  }

  let chatKey = '';
  let chatChars = 0;
  let chatFull = '';

  function fmtClock(hour) {
    const h = Math.floor(hour) % 24;
    const m = Math.floor((hour % 1) * 60);
    const day = TUNE.clock.weekDays[Math.floor(hour / 24) % 7];
    return `${day} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  function paintMap() {
    const S = 200 / (EDGE * 2);
    const px = (x) => (x + EDGE) * S;
    const pz = (z) => (z + EDGE) * S;
    mapCtx.clearRect(0, 0, 200, 200);
    mapCtx.drawImage(base, 0, 0, 200, 200);
    // Job marker.
    const s = W.jobs && W.jobs.state === 'running' ? W.jobs.stageDef : null;
    let mx = null;
    let mz = null;
    if (s) {
      if (s.type === 'car' && W.jobs.markerCar) {
        mx = W.jobs.markerCar.x;
        mz = W.jobs.markerCar.z;
      } else if (s.x !== undefined) {
        mx = s.x;
        mz = s.z;
      }
    } else if (W.jobWaiting) {
      mx = W.town.spots.garage.x + 24;
      mz = W.town.spots.garage.z + 18;
    }
    if (mx !== null) {
      const pulse = 5 + Math.sin(W.clock * 5) * 1.5;
      mapCtx.fillStyle = '#f5b942';
      mapCtx.beginPath();
      mapCtx.arc(px(mx), pz(mz), pulse, 0, Math.PI * 2);
      mapCtx.fill();
      mapCtx.strokeStyle = '#7a5a10';
      mapCtx.lineWidth = 2;
      mapCtx.stroke();
    }
    // Foes.
    mapCtx.fillStyle = '#e74c3c';
    for (const e of W.foes) {
      mapCtx.fillRect(px(e.x) - 2, pz(e.z) - 2, 4, 4);
    }
    // Police blips, flashing.
    if (Math.floor(W.clock * 3) % 2 === 0) {
      mapCtx.fillStyle = '#4a90d9';
      for (const c of W.heat.cruisers) {
        mapCtx.beginPath();
        mapCtx.arc(px(c.x), pz(c.z), 3.5, 0, Math.PI * 2);
        mapCtx.fill();
      }
      for (const c of W.heat.beat) mapCtx.fillRect(px(c.x) - 2, pz(c.z) - 2, 4, 4);
    }
    // Hero arrow.
    const h = W.hero;
    const hx = h.car ? h.car.x : h.x;
    const hz = h.car ? h.car.z : h.z;
    const ha = h.car ? h.car.facing : W.yaw;
    mapCtx.save();
    mapCtx.translate(px(hx), pz(hz));
    mapCtx.rotate(Math.atan2(Math.sin(ha), Math.cos(ha)) + Math.PI / 2);
    mapCtx.fillStyle = '#ffffff';
    mapCtx.strokeStyle = '#14161a';
    mapCtx.lineWidth = 1.5;
    mapCtx.beginPath();
    mapCtx.moveTo(0, -7);
    mapCtx.lineTo(5, 6);
    mapCtx.lineTo(-5, 6);
    mapCtx.closePath();
    mapCtx.fill();
    mapCtx.stroke();
    mapCtx.restore();
  }

  function refresh(dt) {
    const h = W.hero;
    n.cash.textContent = `$${h.cash.toLocaleString('en-US')}`;
    n.zone.textContent = zoneAt(h.x, h.z);
    n.job.textContent = `Job ${Math.min(W.jobs.index + 1, JOBS.length)} of ${JOBS.length}`;
    n.rep.textContent = `${titleForRep(h.rep)} · ${h.rep} REP`;
    for (let i = 0; i < 5; i += 1) starEls[i].classList.toggle('lit', i < W.heat.stars);
    n.clock.textContent = fmtClock(W.hour);
    n.hp.style.width = `${Math.max(0, h.health)}%`;
    n.hp.className = h.health > 30 ? '' : 'low';
    n.armor.style.width = `${Math.max(0, h.armor)}%`;
    n.stamina.style.width = `${Math.max(0, h.stamina)}%`;
    // Objective line.
    const s = W.jobs && W.jobs.state === 'running' ? W.jobs.stageDef : null;
    if (s) {
      n.aim.style.display = 'flex';
      n.aimText.textContent = s.brief;
      const j = W.jobs.job;
      if (j.clock) {
        const left = Math.max(0, j.clock - W.jobs.timer);
        n.aimTimer.textContent = `${Math.ceil(left)}s`;
        n.aimTimer.className = left < 20 ? 'timer low' : 'timer';
      } else n.aimTimer.textContent = '';
    } else if (W.jobWaiting) {
      n.aim.style.display = 'flex';
      n.aimText.textContent = `Next job: ${W.jobs.job.name} — go to Marisol\u2019s Garage`;
      n.aimTimer.textContent = '';
    } else {
      n.aim.style.display = 'none';
    }
    // Speed / weapons.
    if (h.car) {
      n.speedBox.style.display = 'block';
      n.speedNum.textContent = String(Math.round(Math.abs(h.car.speed) * 2.237));
      n.speedCar.textContent = h.car.label.toUpperCase();
      n.boost.style.width = `${Math.max(0, h.car.boost)}%`;
      n.crosshair.style.display = 'none';
    } else {
      n.speedBox.style.display = 'none';
      n.crosshair.style.display = W.screen === 'play' && ARSENAL[h.weapon].style === 'gun' ? 'block' : 'none';
    }
    for (const key of ARSENAL_ORDER) {
      const div = slotEls[key];
      const owned = h.owned.includes(key);
      div.style.display = owned ? 'flex' : 'none';
      div.classList.toggle('active', owned && h.weapon === key);
      const ammoEl = div.querySelector('.slot-ammo');
      const def = ARSENAL[key];
      ammoEl.textContent = def.style === 'gun' ? String(h.ammo[key] ?? 0) : '∞';
    }
    // Toast + prompt.
    if (W.note && W.noteT > 0) {
      n.toast.style.display = 'block';
      n.toastText.textContent = W.note;
      n.toast.style.opacity = String(Math.min(1, W.noteT));
    } else n.toast.style.display = 'none';
    if (W.hint) {
      n.prompt.style.display = 'block';
      n.promptText.textContent = W.hint;
    } else n.prompt.style.display = 'none';
    // Damage vignette.
    if (W.painFlash > 0) {
      n.vignette.style.opacity = String(Math.min(0.7, W.painFlash));
      W.painFlash -= dt * 1.6;
    } else n.vignette.style.opacity = '0';
    // Minimap at ~12 Hz.
    mapTimer -= dt;
    if (mapTimer <= 0) {
      mapTimer = 0.08;
      paintMap();
    }
    // Dialogue typewriter.
    if (chatFull) {
      chatChars = Math.min(chatFull.length, chatChars + dt * 55);
      n.chatText.textContent = chatFull.slice(0, Math.floor(chatChars));
    }
    // Banner fade.
    if (W.jobs.banner) {
      const t = W.jobs.bannerT;
      const b = W.jobs.banner;
      const alpha = t < 0.3 ? t / 0.3 : t > 3.2 ? Math.max(0, (4 - t) / 0.8) : 1;
      n.banner.style.display = 'block';
      n.banner.style.opacity = String(Math.max(0, Math.min(1, alpha)));
      n.bannerTitle.textContent = b.title;
      n.bannerSub.textContent = b.sub;
      n.bannerText.textContent = b.text || '';
    } else n.banner.style.display = 'none';
  }

  function showChat(line) {
    const key = `${line.who}|${line.text}`;
    if (key === chatKey) return;
    chatKey = key;
    chatFull = line.text;
    chatChars = 0;
    const c = CAST[line.who] || CAST.rook;
    n.chatFace.textContent = c.initials;
    n.chatFace.style.background = c.color;
    n.chatName.textContent = c.name;
    n.chatName.style.color = c.color;
    n.chatText.textContent = '';
    n.chat.style.display = 'flex';
  }

  function hideChat() {
    chatKey = '';
    chatFull = '';
    n.chat.style.display = 'none';
  }

  function showEnd(kind) {
    const lines = {
      wasted: ['You got taken down. The hospital patched you up — minus a little cash.'],
      busted: ['The SBPD caught you. They took a fine and let you walk.'],
      failed: ['The job went sideways. Marisol is not happy — but she will give you another shot.'],
      ending: ['Every job done. Kade is finished, the Bay is yours,', 'and Solara Bay finally knows the name Rook Calloway.'],
    };
    const titles = { wasted: 'WASTED', busted: 'BUSTED', failed: 'MISSION FAILED', ending: 'LEGEND OF SOLARA BAY' };
    n.endTitle.textContent = titles[kind] || 'DONE';
    n.endTitle.className = kind === 'ending' ? 'gold' : 'red';
    n.endLines.innerHTML = (lines[kind] || ['']).map((l) => `<p>${l}</p>`).join('');
    n.endBtn.textContent = kind === 'ending' ? 'Keep playing — free roam' : 'Try again (R)';
    n.end.style.display = 'flex';
  }

  function hideEnd() {
    n.end.style.display = 'none';
  }

  return {
    el: n,
    refresh,
    showChat,
    hideChat,
    // Finish the typewriter instantly (staged screenshot dialogue).
    finishChat() {
      if (chatFull) {
        chatChars = chatFull.length;
        n.chatText.textContent = chatFull;
      }
    },
    showEnd,
    hideEnd,
    setHudVisible(v) {
      n.hud.style.display = v ? 'block' : 'none';
    },
    setSplashVisible(v) {
      n.splash.style.display = v ? 'flex' : 'none';
    },
    setPauseVisible(v) {
      n.pause.style.display = v ? 'flex' : 'none';
    },
  };
}
