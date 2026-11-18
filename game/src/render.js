// Rendering: the city is painted once to an offscreen canvas (roads, blocks,
// buildings with their long afternoon shadows, parks, beach and water), and
// every frame draws that layer plus the moving things — cars, people, the
// player, particles and mission markers — under one warm sun tint.
import { WORLD, ROADS_X, ROADS_Y, ROAD_W, PALETTE, VIEW, CAR_TYPES } from './config.js';
import { lightPhase } from './traffic.js';

const SUN = { dx: 0.55, dy: 0.35 }; // afternoon sun from the west

export function createRenderer() {
  let staticLayer = null;
  let minimapLayer = null;
  const camera = { x: 0, y: 0, zoom: 1 };

  function paintStatic(city) {
    const c = document.createElement('canvas');
    c.width = WORLD.width;
    c.height = WORLD.height;
    const g = c.getContext('2d');

    // Ground: warm grass base, sand at the beach, water at the edges.
    g.fillStyle = PALETTE.grass;
    g.fillRect(0, 0, WORLD.width, WORLD.height);
    g.fillStyle = PALETTE.sand;
    g.fillRect(0, 1472, WORLD.width, WORLD.height - 1472);
    g.fillStyle = PALETTE.waterDeep;
    g.fillRect(0, 1496, WORLD.width, WORLD.height - 1496);
    g.fillRect(0, 0, 64, WORLD.height);
    g.fillStyle = PALETTE.water;
    g.fillRect(0, 1496, WORLD.width, 10);
    g.fillRect(56, 0, 8, WORLD.height);
    // Foam lines on the water.
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 2;
    for (let x = 100; x < WORLD.width; x += 90) {
      g.beginPath();
      g.moveTo(x, 1504);
      g.quadraticCurveTo(x + 20, 1510, x + 45, 1504);
      g.stroke();
    }
    // Pier planks.
    g.fillStyle = '#8a6f4d';
    g.fillRect(city.pier.x0, city.pier.y0, city.pier.x1 - city.pier.x0, city.pier.y1 - city.pier.y0);
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    for (let y = city.pier.y0; y < city.pier.y1; y += 14) {
      g.beginPath();
      g.moveTo(city.pier.x0, y);
      g.lineTo(city.pier.x1, y);
      g.stroke();
    }

    // Sidewalks: pale concrete around every block.
    for (let col = 0; col < ROADS_X.length - 1; col += 1) {
      for (let row = 0; row < ROADS_Y.length - 1; row += 1) {
        const x0 = ROADS_X[col] + ROAD_W / 2 - 6;
        const x1 = ROADS_X[col + 1] - ROAD_W / 2 + 6;
        const y0 = ROADS_Y[row] + ROAD_W / 2 - 6;
        const y1 = ROADS_Y[row + 1] - ROAD_W / 2 + 6;
        g.fillStyle = PALETTE.sidewalk;
        g.fillRect(x0, y0, x1 - x0, y1 - y0);
      }
    }

    // Parks, plaza, stadium, beach.
    for (const park of city.parks) {
      if (park.kind === 'beach') {
        g.fillStyle = PALETTE.sand;
        g.fillRect(park.x0, park.y0, park.x1 - park.x0, park.y1 - park.y0);
        g.fillStyle = '#f2e3b6';
        for (let i = 0; i < 8; i += 1) {
          g.beginPath();
          g.ellipse(park.x0 + 20 + i * 26, park.y0 + 22 + (i % 3) * 18, 16, 7, 0, 0, Math.PI * 2);
          g.fill();
        }
        continue;
      }
      if (park.kind === 'stadium') {
        g.fillStyle = '#5d8a4a';
        g.beginPath();
        g.ellipse((park.x0 + park.x1) / 2, (park.y0 + park.y1) / 2, (park.x1 - park.x0) / 2, (park.y1 - park.y0) / 2, 0, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = '#e8e4d8';
        g.lineWidth = 3;
        g.beginPath();
        g.ellipse((park.x0 + park.x1) / 2, (park.y0 + park.y1) / 2, (park.x1 - park.x0) / 2 - 14, (park.y1 - park.y0) / 2 - 14, 0, 0, Math.PI * 2);
        g.stroke();
        g.fillStyle = '#c9b458';
        g.fillRect((park.x0 + park.x1) / 2 - 40, (park.y0 + park.y1) / 2 - 14, 80, 28);
        continue;
      }
      g.fillStyle = park.kind === 'plaza' ? '#cfc3a8' : PALETTE.grassDark;
      g.fillRect(park.x0, park.y0, park.x1 - park.x0, park.y1 - park.y0);
      if (park.kind === 'plaza') {
        g.fillStyle = '#8fb8c9';
        g.beginPath();
        g.arc((park.x0 + park.x1) / 2, (park.y0 + park.y1) / 2, 22, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#e8e4d8';
        g.beginPath();
        g.arc((park.x0 + park.x1) / 2, (park.y0 + park.y1) / 2, 14, 0, Math.PI * 2);
        g.fill();
      }
    }

    // Parking lots.
    for (const lot of city.lots) {
      g.fillStyle = PALETTE.asphaltDark;
      g.fillRect(lot.x0, lot.y0, lot.x1 - lot.x0, lot.y1 - lot.y0);
      g.strokeStyle = 'rgba(232,228,216,0.5)';
      g.lineWidth = 2;
      for (let x = lot.x0 + 18; x < lot.x1 - 10; x += 34) {
        g.beginPath();
        g.moveTo(x, lot.y0 + 10);
        g.lineTo(x, lot.y0 + 34);
        g.stroke();
        g.beginPath();
        g.moveTo(x, lot.y1 - 10);
        g.lineTo(x, lot.y1 - 34);
        g.stroke();
      }
    }

    // Roads: asphalt, then centre dashes and crosswalks.
    g.fillStyle = PALETTE.asphalt;
    for (const rx of ROADS_X) g.fillRect(rx - ROAD_W / 2, 0, ROAD_W, WORLD.height);
    for (const ry of ROADS_Y) g.fillRect(0, ry - ROAD_W / 2, WORLD.width, ROAD_W);
    g.fillStyle = PALETTE.laneMark;
    for (const rx of ROADS_X) {
      for (let y = 20; y < WORLD.height; y += 44) {
        let inCross = false;
        for (const ry of ROADS_Y) if (Math.abs(y - ry) < ROAD_W / 2 + 8) inCross = true;
        if (!inCross) g.fillRect(rx - 2, y, 4, 22);
      }
    }
    for (const ry of ROADS_Y) {
      for (let x = 20; x < WORLD.width; x += 44) {
        let inCross = false;
        for (const rx of ROADS_X) if (Math.abs(x - rx) < ROAD_W / 2 + 8) inCross = true;
        if (!inCross) g.fillRect(x, ry - 2, 22, 4);
      }
    }
    g.fillStyle = PALETTE.crosswalk;
    for (const rx of ROADS_X) {
      for (const ry of ROADS_Y) {
        for (let i = -3; i <= 3; i += 1) {
          g.fillRect(rx + i * 9 - 3, ry - ROAD_W / 2 + 4, 6, 12);
          g.fillRect(rx + i * 9 - 3, ry + ROAD_W / 2 - 16, 6, 12);
          g.fillRect(rx - ROAD_W / 2 + 4, ry + i * 9 - 3, 12, 6);
          g.fillRect(rx + ROAD_W / 2 - 16, ry + i * 9 - 3, 12, 6);
        }
      }
    }

    // Trees (round canopy + trunk shadow).
    for (const t of city.trees) {
      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.beginPath();
      g.ellipse(t.x + 6, t.y + 6, 12, 8, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = t.palm ? '#6d9c4c' : PALETTE.tree;
      g.beginPath();
      g.arc(t.x, t.y, t.palm ? 10 : 13, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = t.palm ? '#8fbf6f' : PALETTE.treeDark;
      g.beginPath();
      g.arc(t.x - 3, t.y - 3, t.palm ? 6 : 8, 0, Math.PI * 2);
      g.fill();
    }

    // Buildings: long shadow, side faces, roof with details.
    for (const b of city.buildings) {
      const shx = SUN.dx * b.hgt;
      const shy = SUN.dy * b.hgt;
      g.fillStyle = 'rgba(20, 16, 10, 0.28)';
      g.beginPath();
      g.moveTo(b.x + shx, b.y + b.h + shy);
      g.lineTo(b.x + b.w + shx, b.y + b.h + shy);
      g.lineTo(b.x + b.w, b.y + b.h);
      g.lineTo(b.x, b.y + b.h);
      g.closePath();
      g.fill();
      g.fillStyle = PALETTE.buildingSide;
      g.fillRect(b.x, b.y + b.h, b.w, 4);
      g.fillStyle = b.roof;
      g.fillRect(b.x, b.y, b.w, b.h);
      g.strokeStyle = PALETTE.roofEdge;
      g.lineWidth = 2;
      g.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
      // Roof details: vents, skylights, a pool on some roofs.
      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.fillRect(b.x + 8, b.y + 8, 14, 10);
      g.fillRect(b.x + b.w - 22, b.y + b.h - 18, 14, 10);
      if (b.pool) {
        g.fillStyle = '#5fb8d9';
        g.fillRect(b.x + b.w / 2 - 16, b.y + b.h / 2 - 10, 32, 20);
        g.strokeStyle = '#e8e4d8';
        g.lineWidth = 2;
        g.strokeRect(b.x + b.w / 2 - 16, b.y + b.h / 2 - 10, 32, 20);
      }
      if (b.label) {
        g.fillStyle = 'rgba(20,16,10,0.55)';
        g.fillRect(b.x + 6, b.y + b.h / 2 - 10, b.w - 12, 20);
        g.fillStyle = '#f2efe8';
        g.font = 'bold 11px sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 1, b.w - 14);
      }
    }

    // Traffic lights at every intersection (their colour is drawn live).
    return c;
  }

  function paintMinimap(city) {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 192;
    const g = c.getContext('2d');
    const sx = 256 / WORLD.width;
    const sy = 192 / WORLD.height;
    g.drawImage(staticLayer, 0, 0, 256, 192);
    return c;
  }

  function drawCar(g, car, time) {
    g.save();
    g.translate(car.x, car.y);
    g.rotate(car.angle);
    // Shadow.
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.beginPath();
    g.ellipse(3, 4, car.length / 2, car.width / 2 + 2, 0, 0, Math.PI * 2);
    g.fill();
    // Body.
    g.fillStyle = car.color;
    roundRect(g, -car.length / 2, -car.width / 2, car.length, car.width, 8);
    g.fill();
    // Cabin + windshield.
    g.fillStyle = 'rgba(20, 28, 38, 0.85)';
    roundRect(g, -car.length * 0.18, -car.width / 2 + 4, car.length * 0.36, car.width - 8, 5);
    g.fill();
    g.fillStyle = 'rgba(160, 210, 235, 0.5)';
    g.fillRect(car.length * 0.12, -car.width / 2 + 5, 4, car.width - 10);
    // Wheels.
    g.fillStyle = '#14161a';
    g.fillRect(-car.length / 2 + 6, -car.width / 2 - 2, 12, 5);
    g.fillRect(-car.length / 2 + 6, car.width / 2 - 3, 12, 5);
    g.fillRect(car.length / 2 - 18, -car.width / 2 - 2, 12, 5);
    g.fillRect(car.length / 2 - 18, car.width / 2 - 3, 12, 5);
    if (car.type === 'taxi') {
      g.fillStyle = '#f1c40f';
      g.fillRect(-6, -car.width / 2 - 6, 14, 5);
      g.fillStyle = '#14161a';
      g.font = 'bold 7px sans-serif';
      g.textAlign = 'center';
      g.fillText('TAXI', 1, -car.width / 2 - 8);
    }
    if (car.type === 'cruiser') {
      g.fillStyle = '#f2efe8';
      g.fillRect(-car.length / 2 + 2, -car.width / 2, car.length - 4, 6);
      g.fillRect(-car.length / 2 + 2, car.width / 2 - 6, car.length - 4, 6);
      // Light bar, flashing.
      const on = Math.floor(time * 4) % 2 === 0;
      g.fillStyle = on ? '#e74c3c' : '#4a90d9';
      g.fillRect(-8, -car.width / 2 - 3, 8, 4);
      g.fillStyle = on ? '#4a90d9' : '#e74c3c';
      g.fillRect(0, -car.width / 2 - 3, 8, 4);
      g.fillStyle = '#14161a';
      g.font = 'bold 8px sans-serif';
      g.textAlign = 'center';
      g.fillText('SBPD', 0, 3);
    }
    if (car.type === 'armored') {
      g.fillStyle = '#d9c9a3';
      g.font = 'bold 8px sans-serif';
      g.textAlign = 'center';
      g.fillText('VAULT', 0, 3);
    }
    // Headlights when the car moves fast, brake lights when braking.
    if (Math.abs(car.speed) > 60) {
      g.fillStyle = 'rgba(255, 244, 180, 0.9)';
      g.fillRect(car.length / 2 - 2, -car.width / 2 + 3, 4, 5);
      g.fillRect(car.length / 2 - 2, car.width / 2 - 8, 4, 5);
    }
    if (car.brakeLight) {
      g.fillStyle = '#ff2e2e';
      g.fillRect(-car.length / 2 - 2, -car.width / 2 + 3, 4, 5);
      g.fillRect(-car.length / 2 - 2, car.width / 2 - 8, 4, 5);
    }
    g.restore();
  }

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function drawPed(g, ped) {
    g.save();
    g.translate(ped.x, ped.y);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.beginPath();
    g.ellipse(2, 3, 10, 6, 0, 0, Math.PI * 2);
    g.fill();
    const bob = ped.speed > 10 ? Math.sin(ped.walkPhase) * 1.5 : 0;
    g.rotate(ped.angle);
    if (ped.cop) {
      g.fillStyle = '#1a1a2e';
      g.fillRect(-6, -7, 12, 14);
      g.fillStyle = '#2c4a7a';
      g.fillRect(-6, -7, 12, 5);
      g.fillStyle = '#f2efe8';
      g.fillRect(4, -3, 4, 6);
    } else if (ped.state === 'down') {
      g.rotate(-Math.PI / 2);
      g.fillStyle = ped.shirt;
      g.fillRect(-8, -5, 16, 10);
      g.fillStyle = '#e8b98a';
      g.beginPath();
      g.arc(10, 0, 5, 0, Math.PI * 2);
      g.fill();
    } else {
      g.fillStyle = '#2c3e50';
      g.fillRect(-5, -6 + bob, 10, 12);
      g.fillStyle = ped.shirt;
      g.fillRect(-6, -7 + bob, 12, 9);
      g.fillStyle = '#e8b98a';
      g.beginPath();
      g.arc(8, 0, 5, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }

  function drawPlayer(g, p, time) {
    if (p.car) return;
    g.save();
    g.translate(p.x, p.y);
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.beginPath();
    g.ellipse(2, 3, 11, 7, 0, 0, Math.PI * 2);
    g.fill();
    const bob = p.moving ? Math.sin(time * 14) * 1.6 : 0;
    g.rotate(p.aimAngle);
    g.fillStyle = '#22252c';
    g.fillRect(-6, -7 + bob, 12, 14);
    g.fillStyle = '#c0392b';
    g.fillRect(-7, -8 + bob, 14, 9);
    g.fillStyle = '#e8b98a';
    g.beginPath();
    g.arc(9, 0, 5.5, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#1a1a1a';
    g.beginPath();
    g.arc(9, -1, 5.5, Math.PI, Math.PI * 2);
    g.fill();
    // Pistol in hand.
    g.fillStyle = '#14161a';
    g.fillRect(12, -2, 10, 4);
    g.restore();
  }

  function drawParticles(g, particles, dt) {
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const pt = particles[i];
      pt.t += dt;
      if (pt.t >= pt.life) {
        particles.splice(i, 1);
        continue;
      }
      const k = pt.t / pt.life;
      if (pt.kind === 'flash') {
        g.save();
        g.translate(pt.x, pt.y);
        g.rotate(pt.angle || 0);
        g.fillStyle = `rgba(255, 220, 120, ${1 - k})`;
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(18, -5);
        g.lineTo(14, 0);
        g.lineTo(18, 5);
        g.closePath();
        g.fill();
        g.restore();
      } else if (pt.kind === 'spark') {
        g.fillStyle = `rgba(255, 200, 80, ${1 - k})`;
        g.fillRect(pt.x - 2, pt.y - 2, 4, 4);
      } else if (pt.kind === 'blood') {
        g.fillStyle = `rgba(160, 30, 30, ${1 - k * 0.7})`;
        g.beginPath();
        g.arc(pt.x, pt.y, 3 + k * 8, 0, Math.PI * 2);
        g.fill();
      } else if (pt.kind === 'smoke') {
        g.fillStyle = `rgba(60, 60, 60, ${0.5 * (1 - k)})`;
        g.beginPath();
        g.arc(pt.x, pt.y - k * 14, 5 + k * 12, 0, Math.PI * 2);
        g.fill();
      } else if (pt.kind === 'explosion') {
        const r = 12 + k * 70;
        const grad = g.createRadialGradient(pt.x, pt.y, 2, pt.x, pt.y, r);
        grad.addColorStop(0, `rgba(255, 220, 120, ${1 - k})`);
        grad.addColorStop(0.5, `rgba(230, 110, 40, ${0.8 * (1 - k)})`);
        grad.addColorStop(1, 'rgba(120, 30, 10, 0)');
        g.fillStyle = grad;
        g.beginPath();
        g.arc(pt.x, pt.y, r, 0, Math.PI * 2);
        g.fill();
      } else if (pt.kind === 'skid') {
        g.strokeStyle = `rgba(20, 20, 20, ${0.35 * (1 - k)})`;
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(pt.x, pt.y);
        g.lineTo(pt.x + (pt.dx || 0), pt.y + (pt.dy || 0));
        g.stroke();
      }
    }
  }

  function drawMarker(g, x, y, time, label) {
    const bob = Math.sin(time * 3) * 5;
    g.save();
    g.translate(x, y + bob - 26);
    // Light beam to the sky.
    const grad = g.createLinearGradient(0, 0, 0, 120);
    grad.addColorStop(0, 'rgba(245, 185, 66, 0.35)');
    grad.addColorStop(1, 'rgba(245, 185, 66, 0)');
    g.fillStyle = grad;
    g.fillRect(-7, 0, 14, 120);
    // Floating diamond.
    g.rotate(Math.PI / 4);
    g.fillStyle = '#f5b942';
    g.strokeStyle = '#7a5a10';
    g.lineWidth = 2;
    g.fillRect(-9, -9, 18, 18);
    g.strokeRect(-9, -9, 18, 18);
    g.restore();
    // Ground ring.
    g.strokeStyle = 'rgba(245, 185, 66, 0.9)';
    g.lineWidth = 3;
    g.beginPath();
    g.ellipse(x, y, 26 + Math.sin(time * 3) * 4, 12, 0, 0, Math.PI * 2);
    g.stroke();
    if (label) {
      g.font = 'bold 12px sans-serif';
      g.fillStyle = 'rgba(12,14,18,0.8)';
      const w = g.measureText(label).width + 16;
      g.fillRect(x - w / 2, y - 84 + bob, w, 22);
      g.fillStyle = '#f2efe8';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(label, x, y - 73 + bob);
    }
  }

  function drawTrafficLight(g, x, y, phase, horizontal) {
    g.save();
    g.translate(x, y);
    g.fillStyle = '#22252c';
    g.fillRect(-5, -14, 10, 28);
    const nsGreen = phase === 0;
    const green = horizontal ? !nsGreen : nsGreen;
    g.fillStyle = green ? '#2ecc71' : '#e74c3c';
    g.beginPath();
    g.arc(0, green ? 8 : -8, 4, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#333';
    g.beginPath();
    g.arc(0, green ? -8 : 8, 4, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  return {
    camera,
    ensureStatic(city) {
      if (!staticLayer) {
        staticLayer = paintStatic(city);
        minimapLayer = paintMinimap(city);
      }
    },
    get minimap() { return minimapLayer; },

    updateCamera(target, dt, lookAhead) {
      const tx = target.x + (lookAhead ? lookAhead.x : 0) - VIEW.width / 2;
      const ty = target.y + (lookAhead ? lookAhead.y : 0) - VIEW.height / 2;
      camera.x += (tx - camera.x) * Math.min(1, dt * 5);
      camera.y += (ty - camera.y) * Math.min(1, dt * 5);
      camera.x = Math.max(-40, Math.min(WORLD.width - VIEW.width + 40, camera.x));
      camera.y = Math.max(-40, Math.min(WORLD.height - VIEW.height + 40, camera.y));
    },

    draw(G, ctx) {
      const { city } = G;
      ctx.save();
      if (G.shake > 0) {
        ctx.translate((Math.random() - 0.5) * G.shake, (Math.random() - 0.5) * G.shake);
        G.shake = Math.max(0, G.shake - 30 * (1 / 60));
      }
      ctx.translate(-Math.round(camera.x), -Math.round(camera.y));
      ctx.drawImage(staticLayer, 0, 0);

      // Traffic lights, live.
      const phase = lightPhase(G.time);
      for (const rx of ROADS_X) {
        for (const ry of ROADS_Y) {
          drawTrafficLight(ctx, rx - ROAD_W / 2 - 8, ry - ROAD_W / 2 - 8, phase, false);
          drawTrafficLight(ctx, rx + ROAD_W / 2 + 8, ry + ROAD_W / 2 + 8, phase, true);
        }
      }

      // Mission marker.
      const s = G.mission && G.mission.state === 'running' ? G.mission.stepDef : null;
      if (s && s.x !== undefined && s.kind !== 'car') {
        drawMarker(ctx, s.x, s.y, G.time, s.markerLabel || null);
      }
      if (s && s.kind === 'car' && G.mission.markerCar) {
        drawMarker(ctx, G.mission.markerCar.x, G.mission.markerCar.y, G.time, 'Steal me');
      }
      if (G.nextMissionReady && G.mission.state !== 'running') {
        drawMarker(ctx, 760, 955, G.time, 'Next job');
      }

      // Everything that moves, sorted by y so nearer things overlap farther ones.
      const drawables = [];
      for (const car of G.cars) if (!car.dead) drawables.push({ y: car.y, f: () => drawCar(ctx, car, G.time) });
      for (const ped of G.peds) drawables.push({ y: ped.y, f: () => drawPed(ctx, ped) });
      drawables.push({ y: G.player.y, f: () => drawPlayer(ctx, G.player, G.time) });
      drawables.sort((a, b) => a.y - b.y);
      for (const d of drawables) d.f();

      drawParticles(ctx, G.particles, 1 / 60);

      // Aim line and crosshair when the player is on foot with a pistol.
      if (!G.player.car && G.screen === 'play') {
        const p = G.player;
        const mx = p.x + Math.cos(p.aimAngle) * 30;
        const my = p.y + Math.sin(p.aimAngle) * 30;
        ctx.strokeStyle = 'rgba(242, 239, 232, 0.7)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(mx, my, 9, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(mx - 13, my);
        ctx.lineTo(mx - 5, my);
        ctx.moveTo(mx + 5, my);
        ctx.lineTo(mx + 13, my);
        ctx.moveTo(mx, my - 13);
        ctx.lineTo(mx, my - 5);
        ctx.moveTo(mx, my + 5);
        ctx.lineTo(mx, my + 13);
        ctx.stroke();
      }

      ctx.restore();

      // Warm late-afternoon tint over everything.
      const tint = ctx.createLinearGradient(0, 0, VIEW.width, VIEW.height);
      tint.addColorStop(0, 'rgba(255, 170, 90, 0.05)');
      tint.addColorStop(1, 'rgba(255, 120, 60, 0.08)');
      ctx.fillStyle = tint;
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
      // Soft vignette.
      const vg = ctx.createRadialGradient(VIEW.width / 2, VIEW.height / 2, VIEW.height * 0.45, VIEW.width / 2, VIEW.height / 2, VIEW.height * 0.95);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(10,8,6,0.28)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    },
  };
}
