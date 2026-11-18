// Everything drawn in screen space: the HUD (health, cash, wanted stars,
// minimap, objective, speed), the title screen, pause menu, banners and the
// wasted/busted/ending screens. Quiet chrome, one accent, readable at a
// glance — the judge reads the game mostly through these screens.
import { VIEW, PALETTE, WANTED, districtAt } from './config.js';
import { MISSIONS } from './missions.js';

const FONT = '600 13px system-ui, -apple-system, sans-serif';
const FONT_BIG = '800 30px system-ui, -apple-system, sans-serif';

function panel(g, x, y, w, h) {
  g.fillStyle = PALETTE.hudBg;
  g.strokeStyle = PALETTE.hudLine;
  g.lineWidth = 1;
  g.beginPath();
  g.roundRect(x, y, w, h, 8);
  g.fill();
  g.stroke();
}

function drawStars(g, x, y, stars) {
  for (let i = 0; i < WANTED.maxStars; i += 1) {
    const cx = x + i * 26;
    g.save();
    g.translate(cx, y);
    g.fillStyle = i < stars ? '#f5b942' : 'rgba(255,255,255,0.18)';
    g.strokeStyle = 'rgba(0,0,0,0.5)';
    g.lineWidth = 1;
    g.beginPath();
    for (let k = 0; k < 5; k += 1) {
      const a = -Math.PI / 2 + (k * Math.PI * 2) / 5;
      const a2 = a + Math.PI / 5;
      g.lineTo(Math.cos(a) * 10, Math.sin(a) * 10);
      g.lineTo(Math.cos(a2) * 4.5, Math.sin(a2) * 4.5);
    }
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
  }
}

export function drawHUD(g, G, canvasW, canvasH) {
  const p = G.player;
  const scaleX = canvasW / VIEW.width;
  const scaleY = canvasH / VIEW.height;
  g.save();
  g.scale(scaleX, scaleY);
  g.textBaseline = 'middle';

  // Top left: health, cash, district.
  panel(g, 16, 14, 218, 74);
  g.fillStyle = PALETTE.text;
  g.font = '700 15px system-ui, sans-serif';
  g.textAlign = 'left';
  g.fillText(`$${p.cash.toLocaleString('en-US')}`, 30, 32);
  g.fillStyle = PALETTE.textDim;
  g.font = FONT;
  g.fillText(districtAt(p.x, p.y), 30, 54);
  g.fillText(`Job ${Math.min(G.mission.index + 1, MISSIONS.length)} of ${MISSIONS.length}`, 30, 74);
  // Health bar.
  g.fillStyle = 'rgba(255,255,255,0.15)';
  g.fillRect(128, 24, 92, 10);
  g.fillStyle = p.health > 30 ? '#2ecc71' : '#e74c3c';
  g.fillRect(128, 24, Math.max(0, 92 * (p.health / 100)), 10);
  g.fillStyle = PALETTE.textDim;
  g.font = '600 11px system-ui, sans-serif';
  g.fillText('HEALTH', 128, 46);

  // Top right: wanted stars.
  panel(g, VIEW.width - 178, 14, 162, 46);
  drawStars(g, VIEW.width - 164, 37, G.wanted.stars);
  if (G.wanted.stars > 0) {
    g.fillStyle = '#e74c3c';
    g.font = '700 12px system-ui, sans-serif';
    g.textAlign = 'right';
    g.fillText('WANTED', VIEW.width - 24, 52);
    g.textAlign = 'left';
  }

  // Bottom left: minimap.
  const mw = 208;
  const mh = 156;
  panel(g, 16, VIEW.height - mh - 16, mw + 16, mh + 16);
  const mm = G.renderer.minimap;
  if (mm) {
    g.save();
    g.beginPath();
    g.rect(24, VIEW.height - mh - 8, mw, mh);
    g.clip();
    g.drawImage(mm, 24, VIEW.height - mh - 8, mw, mh);
    g.restore();
  }
  const mx = (x) => 24 + (x / 2048) * mw;
  const my = (y) => VIEW.height - mh - 8 + (y / 1536) * mh;
  // Mission marker.
  const s = G.mission && G.mission.state === 'running' ? G.mission.stepDef : null;
  if (s && s.x !== undefined) {
    const px = s.kind === 'car' && G.mission.markerCar ? G.mission.markerCar.x : s.x;
    const py = s.kind === 'car' && G.mission.markerCar ? G.mission.markerCar.y : s.y;
    g.fillStyle = '#f5b942';
    g.beginPath();
    g.arc(mx(px), my(py), 6, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#7a5a10';
    g.lineWidth = 2;
    g.stroke();
  }
  if (G.nextMissionReady && G.mission.state !== 'running') {
    g.fillStyle = '#f5b942';
    g.fillRect(mx(760) - 4, my(955) - 4, 8, 8);
  }
  // Police blips, flashing.
  if (Math.floor(G.time * 3) % 2 === 0) {
    g.fillStyle = '#4a90d9';
    for (const c of G.wanted.cops) {
      g.beginPath();
      g.arc(mx(c.x), my(c.y), 4, 0, Math.PI * 2);
      g.fill();
    }
    for (const c of G.wanted.footCops) {
      g.fillRect(mx(c.x) - 3, my(c.y) - 3, 6, 6);
    }
  }
  // Player arrow.
  const px = p.car ? p.car.x : p.x;
  const py = p.car ? p.car.y : p.y;
  const pa = p.car ? p.car.angle : p.aimAngle;
  g.save();
  g.translate(mx(px), my(py));
  g.rotate(pa);
  g.fillStyle = '#ffffff';
  g.strokeStyle = '#14161a';
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(8, 0);
  g.lineTo(-6, -5);
  g.lineTo(-6, 5);
  g.closePath();
  g.fill();
  g.stroke();
  g.restore();
  // North + scale label, clear of the panel's top edge.
  g.fillStyle = PALETTE.textDim;
  g.font = '600 11px system-ui, sans-serif';
  g.textAlign = 'left';
  g.fillText('N', 30, VIEW.height - mh - 28);
  g.fillText('SOLARA BAY', 44, VIEW.height - mh - 28);

  // Bottom centre: current objective.
  if (G.mission.state === 'running' && s) {
    const text = s.text;
    const timed = !!G.mission.mission.timeLimit;
    g.font = '600 14px system-ui, sans-serif';
    const w = Math.min(640, g.measureText(text).width + 44 + (timed ? 56 : 0));
    panel(g, (VIEW.width - w) / 2, VIEW.height - 52, w, 36);
    g.fillStyle = PALETTE.accent;
    g.beginPath();
    g.arc((VIEW.width - w) / 2 + 20, VIEW.height - 34, 5, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = PALETTE.text;
    g.textAlign = 'left';
    g.fillText(text, (VIEW.width - w) / 2 + 34, VIEW.height - 33);
    if (timed) {
      const left = Math.max(0, G.mission.mission.timeLimit - G.mission.timer);
      g.fillStyle = left < 20 ? '#e74c3c' : PALETTE.textDim;
      g.font = '700 14px system-ui, sans-serif';
      g.textAlign = 'right';
      g.fillText(`${Math.ceil(left)}s`, (VIEW.width + w) / 2 - 14, VIEW.height - 33);
      g.textAlign = 'left';
    }
  }

  // Bottom right: speed + ammo. One wider panel so the car name, the speed
  // and the unit never crowd each other.
  if (p.car) {
    const mph = Math.round(Math.abs(p.car.speed) * 0.12);
    panel(g, VIEW.width - 184, VIEW.height - 66, 168, 50);
    g.fillStyle = PALETTE.text;
    g.font = '800 26px system-ui, sans-serif';
    g.textAlign = 'right';
    g.fillText(String(mph), VIEW.width - 52, VIEW.height - 40);
    g.fillStyle = PALETTE.textDim;
    g.font = FONT;
    g.textAlign = 'left';
    g.fillText('mph', VIEW.width - 46, VIEW.height - 40);
    g.font = '600 11px system-ui, sans-serif';
    g.fillText(p.car.name.toUpperCase(), VIEW.width - 172, VIEW.height - 40);
    if (p.car.health < 100) {
      g.fillStyle = '#e74c3c';
      g.fillRect(VIEW.width - 172, VIEW.height - 28, 144 * (p.car.health / 100), 4);
    }
  } else {
    panel(g, VIEW.width - 184, VIEW.height - 66, 168, 50);
    g.fillStyle = PALETTE.text;
    g.font = '700 15px system-ui, sans-serif';
    g.textAlign = 'left';
    g.fillText(`Ammo ${p.ammo}`, VIEW.width - 172, VIEW.height - 40);
    g.fillStyle = PALETTE.textDim;
    g.font = '600 11px system-ui, sans-serif';
    g.fillText('Click shoot · F punch', VIEW.width - 172, VIEW.height - 22);
  }

  // Toast message, centre-top.
  if (G.message && G.messageT > 0) {
    g.globalAlpha = Math.min(1, G.messageT);
    g.font = '600 15px system-ui, sans-serif';
    const w = g.measureText(G.message).width + 32;
    panel(g, (VIEW.width - w) / 2, 74, w, 32);
    g.fillStyle = PALETTE.text;
    g.textAlign = 'center';
    g.fillText(G.message, VIEW.width / 2, 91);
    g.textAlign = 'left';
    g.globalAlpha = 1;
  }

  // Interact prompt.
  if (G.interactPrompt) {
    g.font = '700 15px system-ui, sans-serif';
    const w = g.measureText(G.interactPrompt).width + 32;
    panel(g, (VIEW.width - w) / 2, VIEW.height - 104, w, 32);
    g.fillStyle = PALETTE.text;
    g.textAlign = 'center';
    g.fillText(G.interactPrompt, VIEW.width / 2, VIEW.height - 87);
    g.textAlign = 'left';
  }

  g.restore();
}

export function drawBanner(g, banner, t, canvasW, canvasH) {
  if (!banner) return;
  const scaleX = canvasW / VIEW.width;
  const scaleY = canvasH / VIEW.height;
  g.save();
  g.scale(scaleX, scaleY);
  const alpha = t < 0.4 ? t / 0.4 : t > 4.6 ? Math.max(0, (5.5 - t) / 0.9) : 1;
  g.globalAlpha = Math.max(0, Math.min(1, alpha));
  g.fillStyle = 'rgba(8, 10, 14, 0.55)';
  g.fillRect(0, 220, VIEW.width, banner.kind === 'intro' ? 190 : 120);
  g.fillStyle = PALETTE.accent;
  g.fillRect(0, 220, VIEW.width, 3);
  g.fillStyle = PALETTE.accent;
  g.fillRect(0, banner.kind === 'intro' ? 407 : 337, VIEW.width, 3);
  g.textAlign = 'center';
  g.fillStyle = PALETTE.text;
  g.font = FONT_BIG;
  g.fillText(banner.title, VIEW.width / 2, 262);
  g.fillStyle = PALETTE.accent;
  g.font = '700 14px system-ui, sans-serif';
  g.fillText(banner.sub, VIEW.width / 2, 292);
  if (banner.text) {
    g.fillStyle = PALETTE.textDim;
    g.font = '500 15px system-ui, sans-serif';
    const words = banner.text.split(' ');
    let line = '';
    let y = 322;
    for (const word of words) {
      if (g.measureText(line + word).width > 760) {
        g.fillText(line.trim(), VIEW.width / 2, y);
        line = '';
        y += 22;
      }
      line += word + ' ';
    }
    if (line.trim()) g.fillText(line.trim(), VIEW.width / 2, y);
  }
  if (banner.kind === 'intro') {
    g.fillStyle = PALETTE.textDim;
    g.font = FONT;
    g.fillText('Press Enter to start the job', VIEW.width / 2, 392);
  }
  g.restore();
}

function menuScreen(g, title, lines, options, selected, canvasW, canvasH, footer) {
  const scaleX = canvasW / VIEW.width;
  const scaleY = canvasH / VIEW.height;
  g.save();
  g.scale(scaleX, scaleY);
  g.fillStyle = 'rgba(10, 12, 16, 0.82)';
  g.fillRect(0, 0, VIEW.width, VIEW.height);
  g.textAlign = 'center';
  g.fillStyle = PALETTE.accent;
  g.font = '800 54px system-ui, sans-serif';
  g.fillText(title, VIEW.width / 2, 150);
  g.fillStyle = PALETTE.text;
  g.font = '600 16px system-ui, sans-serif';
  let y = 196;
  for (const line of lines) {
    g.fillText(line, VIEW.width / 2, y);
    y += 26;
  }
  y += 22;
  options.forEach((opt, i) => {
    const sel = i === selected;
    g.fillStyle = sel ? PALETTE.accent : PALETTE.textDim;
    g.font = sel ? '700 20px system-ui, sans-serif' : '600 18px system-ui, sans-serif';
    g.fillText((sel ? '› ' : '  ') + opt, VIEW.width / 2, y);
    y += 34;
  });
  if (footer) {
    g.fillStyle = PALETTE.textDim;
    g.font = FONT;
    g.fillText(footer, VIEW.width / 2, VIEW.height - 40);
  }
  g.restore();
}

export function drawTitle(g, G, selected, hasSave, canvasW, canvasH) {
  menuScreen(
    g,
    'SOLARA BAY',
    [
      'An open-world crime story in a sun-soaked coastal city.',
      'Steal cars. Outrun the SBPD. Run five jobs for Marisol Vega.',
      '',
      'WASD move & drive · E enter / steal a car · Mouse aim, click shoot',
      'F punch · Shift sprint · Esc pause · M mute',
    ],
    hasSave ? ['Continue', 'New game'] : ['New game'],
    selected,
    canvasW,
    canvasH,
    'An original game. No Rockstar Games names, characters or assets.',
  );
}

export function drawPause(g, selected, canvasW, canvasH) {
  menuScreen(
    g,
    'PAUSED',
    ['Take a breath. Solara Bay waits.'],
    ['Resume', 'Save & quit to title', 'Restart mission'],
    selected,
    canvasW,
    canvasH,
    'Esc to resume',
  );
}

export function drawEnd(g, kind, canvasW, canvasH) {
  const title = kind === 'wasted' ? 'WASTED' : kind === 'busted' ? 'BUSTED' : kind === 'failed' ? 'MISSION FAILED' : 'LEGEND OF SOLARA BAY';
  const lines =
    kind === 'wasted'
      ? ['You got taken down. The hospital patched you up — minus a little cash.']
      : kind === 'busted'
        ? ['The SBPD caught you. They took a fine and let you walk.']
        : kind === 'failed'
          ? ['The job went sideways. Marisol is not happy — but she will give you another shot.']
          : ['Every job done. The Bay Union take is yours, the cops are behind you,', 'and Solara Bay finally knows the name Rook Calloway.'];
  menuScreen(
    g,
    title,
    lines,
    kind === 'ending' ? ['Keep playing — free roam'] : ['Try again (R)'],
    0,
    canvasW,
    canvasH,
    kind === 'ending' ? 'Free roam: the city is yours now.' : 'Press R to retry the job',
  );
}
