// Rendering: the Three.js scene — dusk sky dome, fog, town meshes (instanced
// towers, streets, lamps, neon), the third-person camera rig, mesh factories
// for motors and people, and a pooled sprite particle system. No shadow maps:
// blob shadows under entities keep it fast everywhere, including SwiftShader.
import * as THREE from 'three';
import { TUNE, SKY_STOPS, PAINT } from './config.js';
import { STREETS, STREET_W, EDGE } from './city.js';

const scratchA = new THREE.Color();
const scratchB = new THREE.Color();
const place = new THREE.Object3D();

function paintCanvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function towerFace(cols, rows, litShare) {
  return paintCanvas(128, 256, (g, w, h) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, w, h);
    const cw = w / cols;
    const ch = h / rows;
    for (let x = 0; x < cols; x += 1) {
      for (let y = 0; y < rows; y += 1) {
        const lit = ((x * 7 + y * 13) % 10) / 10 < litShare;
        g.fillStyle = lit ? '#ffd27a' : '#18202f';
        g.fillRect(x * cw + cw * 0.25, y * ch + ch * 0.25, cw * 0.5, ch * 0.5);
      }
    }
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(0, 0, w, 4);
    g.fillRect(0, h - 4, w, 4);
  });
}

function softDisc(inner, outer) {
  return paintCanvas(64, 64, (g, w, h) => {
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, inner);
    grad.addColorStop(1, outer);
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });
}

function duskGradient(zenith, edge) {
  return paintCanvas(16, 256, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, `#${zenith.toString(16).padStart(6, '0')}`);
    grad.addColorStop(0.55, `#${edge.toString(16).padStart(6, '0')}`);
    grad.addColorStop(0.75, `#${edge.toString(16).padStart(6, '0')}`);
    grad.addColorStop(1, '#0a0a14');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });
}

function signFace(word, hue) {
  return paintCanvas(256, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.font = '800 40px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = hue;
    g.shadowBlur = 18;
    g.fillStyle = '#ffffff';
    g.fillText(word, w / 2, h / 2);
    g.shadowBlur = 6;
    g.fillStyle = hue;
    g.fillText(word, w / 2, h / 2);
  });
}

function skyAtHour(hour) {
  const h = ((hour % 24) + 24) % 24;
  let low = SKY_STOPS[0];
  let high = SKY_STOPS[SKY_STOPS.length - 1];
  for (let i = 0; i < SKY_STOPS.length - 1; i += 1) {
    if (h >= SKY_STOPS[i].hour && h <= SKY_STOPS[i + 1].hour) {
      low = SKY_STOPS[i];
      high = SKY_STOPS[i + 1];
      break;
    }
  }
  const span = Math.max(0.001, high.hour - low.hour);
  const t = Math.min(1, Math.max(0, (h - low.hour) / span));
  const blend = (a, b) => scratchA.setHex(a).lerp(scratchB.setHex(b), t).getHex();
  return {
    zenith: blend(low.zenith, high.zenith),
    edge: blend(low.edge, high.edge),
    haze: blend(low.haze, high.haze),
    light: blend(low.light, high.light),
    fill: blend(low.fill, high.fill),
    lightI: low.lightI + (high.lightI - low.lightI) * t,
    sky: low.sky + (high.sky - low.sky) * t,
    street: low.street + (high.street - low.street) * t,
  };
}

export function buildRenderer(container) {
  const gl = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  gl.setSize(container.clientWidth, container.clientHeight);
  gl.toneMapping = THREE.ACESFilmicToneMapping;
  gl.toneMappingExposure = 1.12;
  container.appendChild(gl.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x54405a, 90, 620);
  const camera = new THREE.PerspectiveCamera(TUNE.lens.view, container.clientWidth / container.clientHeight, 0.1, 2000);
  camera.position.set(0, 30, 60);

  const dome = new THREE.HemisphereLight(0x8a7ab0, 0x2a2018, 0.5);
  scene.add(dome);
  const sun = new THREE.DirectionalLight(0xff9a6b, 1.9);
  sun.position.set(-180, 140, 120);
  scene.add(sun);
  const fill = new THREE.AmbientLight(0x6a5a8a, 0.55);
  scene.add(fill);

  // Sky dome + sun disc + stars.
  const skyMat = new THREE.MeshBasicMaterial({ side: THREE.BackSide, fog: false, depthWrite: false });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 24, 16), skyMat);
  scene.add(sky);
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(42, 32),
    new THREE.MeshBasicMaterial({ color: 0xffd9a0, fog: false, transparent: true, opacity: 0.95 }),
  );
  disc.position.set(-620, 150, 420);
  disc.lookAt(0, 60, 0);
  scene.add(disc);
  const glowMap = softDisc('rgba(255,170,100,0.55)', 'rgba(255,170,100,0)');
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowMap, transparent: true, fog: false, depthWrite: false }));
  halo.scale.set(340, 340, 1);
  halo.position.copy(disc.position);
  scene.add(halo);
  const starGeo = new THREE.BufferGeometry();
  {
    const pts = [];
    for (let i = 0; i < 260; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const e = 0.25 + Math.random() * 1.2;
      pts.push(Math.cos(a) * Math.cos(e) * 850, Math.sin(e) * 850, Math.sin(a) * Math.cos(e) * 850);
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  }
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, transparent: true, opacity: 0, fog: false, depthWrite: false }));
  scene.add(stars);

  // Shared geometries / materials for entities.
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const shadeTex = softDisc('rgba(0,0,0,0.42)', 'rgba(0,0,0,0)');
  const shadeGeo = new THREE.CircleGeometry(1, 20);
  const shadeMat = new THREE.MeshBasicMaterial({ map: shadeTex, transparent: true, depthWrite: false });
  const burstTex = softDisc('rgba(255,230,150,1)', 'rgba(255,140,40,0)');
  const puffTex = softDisc('rgba(120,120,120,0.55)', 'rgba(120,120,120,0)');
  const emberTex = softDisc('rgba(255,210,110,1)', 'rgba(255,120,20,0)');
  const goreTex = softDisc('rgba(170,20,20,0.85)', 'rgba(120,10,10,0)');

  const matCache = new Map();
  function surface(color, opts = {}) {
    const key = `${color}|${opts.emissive || 0}|${opts.roughness || 0.85}|${opts.metalness || 0}`;
    if (!matCache.has(key)) {
      matCache.set(key, new THREE.MeshStandardMaterial({
        color, roughness: opts.roughness ?? 0.85, metalness: opts.metalness ?? 0,
        emissive: opts.emissive || 0x000000, emissiveIntensity: opts.emissiveIntensity ?? 1,
      }));
    }
    return matCache.get(key);
  }

  function groundShade(scale) {
    const m = new THREE.Mesh(shadeGeo, shadeMat);
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.03;
    m.scale.setScalar(scale);
    return m;
  }

  // ---- town meshes ---------------------------------------------------------
  let lampBulbs = null;
  let lampPools = null;
  let signMats = [];

  function buildTownMeshes(town) {
    // Static meshes bullets can hit (returned for the raycaster).
    const solidHit = [];
    // Ground.
    const dirt = new THREE.Mesh(
      new THREE.PlaneGeometry(EDGE * 2 + 240, EDGE * 2 + 240),
      surface(PAINT.dirt, { roughness: 1 }),
    );
    dirt.rotation.x = -Math.PI / 2;
    dirt.position.set(0, -0.05, 40);
    scene.add(dirt);
    solidHit.push(dirt);
    // Beach + sea.
    const sand = new THREE.Mesh(new THREE.PlaneGeometry(EDGE * 2 + 240, 48), surface(PAINT.beachSand, { roughness: 1 }));
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(0, 0, TUNE.map.sandZ + 16);
    scene.add(sand);
    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(EDGE * 2 + 400, 220),
      new THREE.MeshStandardMaterial({ color: PAINT.ocean, roughness: 0.15, metalness: 0.55 }),
    );
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(0, -0.4, TUNE.map.waterZ + 100);
    scene.add(sea);

    // Streets: dark strips with a dashed centre line texture.
    const streetTex = paintCanvas(128, 128, (g, w, h) => {
      g.fillStyle = '#23232e';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#d8c86a';
      g.fillRect(w / 2 - 2, 8, 4, 44);
      g.fillStyle = 'rgba(255,255,255,0.5)';
      g.fillRect(4, 0, 3, h);
      g.fillRect(w - 7, 0, 3, h);
    });
    streetTex.wrapS = THREE.RepeatWrapping;
    streetTex.wrapT = THREE.RepeatWrapping;
    streetTex.repeat.set(1, 40); // one dash tile per 16 m of street
    const streetMat = new THREE.MeshStandardMaterial({ map: streetTex, roughness: 0.95 });
    for (const s of STREETS) {
      const len = EDGE * 2;
      const v = new THREE.Mesh(new THREE.PlaneGeometry(STREET_W, len), streetMat);
      v.rotation.x = -Math.PI / 2;
      v.position.set(s, 0.02, 0);
      scene.add(v);
      const hz = new THREE.Mesh(new THREE.PlaneGeometry(len, STREET_W), streetMat);
      hz.rotation.x = -Math.PI / 2;
      hz.rotation.z = Math.PI / 2;
      hz.position.set(0, 0.025, s);
      scene.add(hz);
    }
    // Pavement slabs per block (instanced).
    const slabGeo = new THREE.BoxGeometry(1, 0.22, 1);
    const slabs = new THREE.InstancedMesh(slabGeo, surface(PAINT.pavement, { roughness: 1 }), 49);
    let si = 0;
    for (let c = 0; c < STREETS.length - 1; c += 1) {
      for (let r = 0; r < STREETS.length - 1; r += 1) {
        const x0 = STREETS[c] + STREET_W / 2 - 1;
        const x1 = STREETS[c + 1] - STREET_W / 2 + 1;
        const z0 = STREETS[r] + STREET_W / 2 - 1;
        const z1 = STREETS[r + 1] - STREET_W / 2 + 1;
        place.position.set((x0 + x1) / 2, 0.1, (z0 + z1) / 2);
        place.scale.set(x1 - x0, 1, z1 - z0);
        place.rotation.set(0, 0, 0);
        place.updateMatrix();
        slabs.setMatrixAt(si, place.matrix);
        si += 1;
      }
    }
    slabs.count = si;
    scene.add(slabs);
    solidHit.push(slabs);

    // Greens: grass / plaza / stadium pads.
    for (const p of town.greens) {
      const w = p.x1 - p.x0;
      const d = p.z1 - p.z0;
      const cx = (p.x0 + p.x1) / 2;
      const cz = (p.z0 + p.z1) / 2;
      const tone = p.kind === 'beach' ? PAINT.beachSand : p.kind === 'plaza' ? 0x9a917e : p.kind === 'stadium' ? 0x4a7a3a : 0x3d6b34;
      const pad = new THREE.Mesh(new THREE.PlaneGeometry(w, d), surface(tone, { roughness: 1 }));
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(cx, 0.22, cz);
      scene.add(pad);
      if (p.kind === 'plaza') {
        const rim = new THREE.Mesh(new THREE.CylinderGeometry(7, 8, 1.2, 24), surface(0x8a8578));
        rim.position.set(cx, 0.8, cz);
        scene.add(rim);
        const pool = new THREE.Mesh(new THREE.CircleGeometry(6.4, 24), new THREE.MeshStandardMaterial({ color: 0x2a7a9a, roughness: 0.1, metalness: 0.4 }));
        pool.rotation.x = -Math.PI / 2;
        pool.position.set(cx, 1.45, cz);
        scene.add(pool);
      }
      if (p.kind === 'stadium') {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(16, 1.1, 8, 32), surface(0xd8d2c2));
        ring.rotation.x = Math.PI / 2;
        ring.position.set(cx, 1.4, cz);
        scene.add(ring);
      }
    }
    // Parking yards: asphalt pads.
    for (const yard of town.yards) {
      const pad = new THREE.Mesh(new THREE.PlaneGeometry(yard.x1 - yard.x0, yard.z1 - yard.z0), surface(0x1e1e26, { roughness: 1 }));
      pad.rotation.x = -Math.PI / 2;
      pad.position.set((yard.x0 + yard.x1) / 2, 0.22, (yard.z0 + yard.z1) / 2);
      scene.add(pad);
    }

    // Towers: 3 instanced meshes (3 face textures), tinted per instance.
    const faces = [towerFace(6, 10, 0.45), towerFace(8, 14, 0.3), towerFace(4, 8, 0.6)];
    const buckets = [[], [], []];
    town.towers.forEach((t, i) => buckets[i % 3].push(t));
    buckets.forEach((list, gi) => {
      if (list.length === 0) return;
      const m = new THREE.InstancedMesh(unitBox, new THREE.MeshStandardMaterial({ map: faces[gi], roughness: 0.9 }), list.length);
      list.forEach((t, i) => {
        place.position.set(t.x, t.h / 2, t.z);
        place.scale.set(t.w, t.h, t.d);
        place.rotation.set(0, 0, 0);
        place.updateMatrix();
        m.setMatrixAt(i, place.matrix);
        m.setColorAt(i, scratchA.setHex(t.tint));
      });
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      scene.add(m);
      solidHit.push(m);
      // Roof caps.
      const caps = new THREE.InstancedMesh(unitBox, surface(0x1c1c24, { roughness: 1 }), list.length);
      list.forEach((t, i) => {
        place.position.set(t.x, t.h + 0.25, t.z);
        place.scale.set(t.w + 0.6, 0.5, t.d + 0.6);
        place.rotation.set(0, 0, 0);
        place.updateMatrix();
        caps.setMatrixAt(i, place.matrix);
      });
      caps.instanceMatrix.needsUpdate = true;
      scene.add(caps);
    });

    // Palms: instanced trunks + canopies.
    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.3, 3.4, 6);
    const trunks = new THREE.InstancedMesh(trunkGeo, surface(0x5a4632, { roughness: 1 }), town.palms.length);
    const crownGeo = new THREE.IcosahedronGeometry(2.4, 0);
    const crowns = new THREE.InstancedMesh(crownGeo, surface(0x3d6b34, { roughness: 1 }), town.palms.length);
    town.palms.forEach((t, i) => {
      const h = t.palm ? 5.2 : 3.4;
      place.position.set(t.x, h / 2, t.z);
      place.scale.set(1, t.palm ? 1.6 : 1, 1);
      place.rotation.set(0, 0, 0);
      place.updateMatrix();
      trunks.setMatrixAt(i, place.matrix);
      place.position.set(t.x, h + 1.6, t.z);
      place.scale.setScalar(t.palm ? 0.8 : 1);
      place.updateMatrix();
      crowns.setMatrixAt(i, place.matrix);
      crowns.setColorAt(i, scratchA.setHex(t.palm ? 0x4a8a3a : 0x3d6b34));
    });
    trunks.instanceMatrix.needsUpdate = true;
    crowns.instanceMatrix.needsUpdate = true;
    if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
    scene.add(trunks);
    scene.add(crowns);

    // Street lamps: poles + glowing heads + light pools.
    const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 7, 6);
    const poles = new THREE.InstancedMesh(poleGeo, surface(0x2a2a33), town.posts.length);
    const bulbGeo = new THREE.SphereGeometry(0.5, 10, 8);
    const bulbMat = new THREE.MeshStandardMaterial({ color: 0x444444, emissive: 0xffc46b, emissiveIntensity: 0.4 });
    lampBulbs = new THREE.InstancedMesh(bulbGeo, bulbMat, town.posts.length);
    const poolGeo = new THREE.CircleGeometry(6, 20);
    const poolMat = new THREE.MeshBasicMaterial({ map: softDisc('rgba(255,190,110,0.20)', 'rgba(255,190,110,0)'), transparent: true, depthWrite: false });
    lampPools = new THREE.InstancedMesh(poolGeo, poolMat, town.posts.length);
    town.posts.forEach((l, i) => {
      place.position.set(l.x, 3.5, l.z);
      place.scale.set(1, 1, 1);
      place.rotation.set(0, 0, 0);
      place.updateMatrix();
      poles.setMatrixAt(i, place.matrix);
      place.position.set(l.x, 7.1, l.z);
      place.updateMatrix();
      lampBulbs.setMatrixAt(i, place.matrix);
      place.position.set(l.x, 0.06, l.z);
      place.rotation.set(-Math.PI / 2, 0, 0);
      place.updateMatrix();
      lampPools.setMatrixAt(i, place.matrix);
    });
    poles.instanceMatrix.needsUpdate = true;
    lampBulbs.instanceMatrix.needsUpdate = true;
    lampPools.instanceMatrix.needsUpdate = true;
    scene.add(poles);
    scene.add(lampBulbs);
    scene.add(lampPools);

    // Neon signs.
    signMats = [];
    for (const n of town.signs) {
      const tex = signFace(n.word, `#${n.hue.toString(16).padStart(6, '0')}`);
      const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, fog: false });
      signMats.push(m);
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(n.w, n.w / 4), m);
      plane.position.set(n.x, n.y, n.z);
      if (n.side === 'n') plane.rotation.y = Math.PI;
      else if (n.side === 'e') plane.rotation.y = Math.PI / 2;
      else if (n.side === 'w') plane.rotation.y = -Math.PI / 2;
      scene.add(plane);
      const aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDisc('rgba(255,45,120,0.35)', 'rgba(255,45,120,0)'), transparent: true, depthWrite: false, color: n.hue }));
      aura.scale.set(n.w * 2.2, n.w * 1.1, 1);
      aura.position.copy(plane.position);
      scene.add(aura);
    }
    return solidHit;
  }

  // ---- entity mesh factories ----------------------------------------------
  function buildVehicleMesh(kind, tintHex) {
    const dims = { sedan: [4.4, 1.9, 1.45], taxi: [4.4, 1.9, 1.45], pickup: [4.9, 2.0, 1.7], van: [5.0, 2.0, 2.1], comet: [4.2, 1.9, 1.25], cop: [4.5, 1.9, 1.45] }[kind] || [4.4, 1.9, 1.45];
    const [long, wide, tall] = dims;
    const g = new THREE.Group();
    const paint = new THREE.MeshStandardMaterial({ color: tintHex, roughness: 0.35, metalness: 0.6 });
    const hull = new THREE.Mesh(unitBox, paint);
    hull.scale.set(wide, tall * 0.62, long);
    hull.position.y = tall * 0.42;
    g.add(hull);
    const cabin = new THREE.Mesh(unitBox, surface(0x141c26, { roughness: 0.15, metalness: 0.7 }));
    cabin.scale.set(wide * 0.86, tall * 0.5, long * 0.48);
    cabin.position.set(0, tall * 0.92, -long * 0.04);
    g.add(cabin);
    if (kind === 'van') {
      cabin.scale.set(wide * 0.94, tall * 0.62, long * 0.8);
      cabin.position.set(0, tall * 0.72, 0);
    }
    if (kind === 'pickup') {
      const bed = new THREE.Mesh(unitBox, paint);
      bed.scale.set(wide * 0.9, tall * 0.5, long * 0.36);
      bed.position.set(0, tall * 0.55, -long * 0.28);
      g.add(bed);
    }
    const tyreGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12);
    const tyreMat = surface(0x14161a, { roughness: 0.95 });
    const wheels = [];
    for (const [wx, wz] of [[-wide / 2, long * 0.32], [wide / 2, long * 0.32], [-wide / 2, -long * 0.32], [wide / 2, -long * 0.32]]) {
      const w = new THREE.Mesh(tyreGeo, tyreMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(wx, 0.36, wz);
      g.add(w);
      wheels.push(w);
    }
    const headMat = new THREE.MeshStandardMaterial({ color: 0xfff6c9, emissive: 0xfff2b0, emissiveIntensity: 1.6 });
    for (const wx of [-wide * 0.32, wide * 0.32]) {
      const hl = new THREE.Mesh(unitBox, headMat);
      hl.scale.set(0.42, 0.22, 0.1);
      hl.position.set(wx, tall * 0.5, long / 2 + 0.02);
      g.add(hl);
    }
    const rearMat = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff1a1a, emissiveIntensity: 0.7 });
    for (const wx of [-wide * 0.32, wide * 0.32]) {
      const tl = new THREE.Mesh(unitBox, rearMat);
      tl.scale.set(0.42, 0.2, 0.1);
      tl.position.set(wx, tall * 0.5, -long / 2 - 0.02);
      g.add(tl);
    }
    if (kind === 'taxi') {
      const roof = new THREE.Mesh(unitBox, new THREE.MeshStandardMaterial({ color: 0xf1c40f, emissive: 0xf1c40f, emissiveIntensity: 0.8 }));
      roof.scale.set(0.7, 0.22, 0.3);
      roof.position.set(0, tall * 1.22, 0);
      g.add(roof);
    }
    let bar = null;
    if (kind === 'cop') {
      bar = new THREE.Group();
      const r = new THREE.Mesh(unitBox, new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff2020, emissiveIntensity: 2 }));
      r.scale.set(0.5, 0.22, 0.3);
      r.position.x = -0.3;
      const b = new THREE.Mesh(unitBox, new THREE.MeshStandardMaterial({ color: 0x000033, emissive: 0x2050ff, emissiveIntensity: 2 }));
      b.scale.set(0.5, 0.22, 0.3);
      b.position.x = 0.3;
      bar.add(r, b);
      bar.position.set(0, tall * 1.22, 0);
      bar.userData.red = r;
      bar.userData.blue = b;
      g.add(bar);
    }
    const shade = groundShade(Math.max(long, wide) * 0.75);
    g.add(shade);
    g.userData = { wheels, tailMat: rearMat, lightBar: bar, len: long, wid: wide };
    return g;
  }

  function buildPersonMesh(shirt, pants, skin, opts = {}) {
    const g = new THREE.Group();
    const topMat = surface(shirt);
    const legMat = surface(pants);
    const skinMat = surface(skin, { roughness: 0.7 });
    const legs = new THREE.Group();
    const shinGeo = new THREE.BoxGeometry(0.26, 0.85, 0.3);
    const legL = new THREE.Mesh(shinGeo, legMat);
    legL.position.set(-0.16, 0.42, 0);
    const legR = new THREE.Mesh(shinGeo, legMat);
    legR.position.set(0.16, 0.42, 0);
    legs.add(legL, legR);
    g.add(legs);
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.36), topMat);
    chest.position.y = 1.22;
    g.add(chest);
    const armGeo = new THREE.BoxGeometry(0.2, 0.66, 0.24);
    const armL = new THREE.Mesh(armGeo, topMat);
    armL.position.set(-0.44, 1.22, 0);
    const armR = new THREE.Mesh(armGeo, topMat);
    armR.position.set(0.44, 1.22, 0);
    g.add(armL, armR);
    const skull = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), skinMat);
    skull.position.y = 1.8;
    g.add(skull);
    const hair = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.16, 0.44), surface(opts.hair ?? 0x1a1a1a));
    hair.position.y = 2.02;
    g.add(hair);
    if (opts.cap) {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.12, 0.5), surface(opts.cap));
      cap.position.y = 2.06;
      cap.position.z = 0.03;
      g.add(cap);
    }
    if (opts.weapon) {
      const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.5), surface(0x14161a, { roughness: 0.4, metalness: 0.6 }));
      gun.position.set(0.44, 1.05, 0.3);
      g.add(gun);
      g.userData.gun = gun;
    }
    const shade = groundShade(0.9);
    g.add(shade);
    g.userData = { ...g.userData, legL, legR, armL, armR, torso: chest, head: skull, walkPhase: Math.random() * 6 };
    return g;
  }

  function buildChopperMesh() {
    const g = new THREE.Group();
    const hullMat = surface(0x1a2a44, { roughness: 0.4, metalness: 0.5 });
    const hull = new THREE.Mesh(unitBox, hullMat);
    hull.scale.set(2.2, 1.6, 5.2);
    g.add(hull);
    const glass = new THREE.Mesh(unitBox, surface(0x0e1a2a, { roughness: 0.1, metalness: 0.8 }));
    glass.scale.set(2.0, 1.0, 1.4);
    glass.position.set(0, 0.2, 2.2);
    g.add(glass);
    const tail = new THREE.Mesh(unitBox, hullMat);
    tail.scale.set(0.5, 0.5, 4.5);
    tail.position.set(0, 0.3, -4.2);
    g.add(tail);
    const rotor = new THREE.Group();
    const bladeGeo = new THREE.BoxGeometry(9, 0.08, 0.4);
    const bladeMat = surface(0x111111);
    const b1 = new THREE.Mesh(bladeGeo, bladeMat);
    const b2 = new THREE.Mesh(bladeGeo, bladeMat);
    b2.rotation.y = Math.PI / 2;
    rotor.add(b1, b2);
    rotor.position.y = 1.1;
    g.add(rotor);
    // Searchlight sized for the 14 m hover (round 3 fix): cone reaches the
    // street from the low hover instead of from 34 m up.
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff6c9, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const beam = new THREE.Mesh(new THREE.ConeGeometry(4.2, 14, 20, 1, true), beamMat);
    beam.position.y = -7;
    g.add(beam);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(2.3, 20), new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = -13.9;
    g.add(pool);
    g.userData = { rotor, cone: beam, spot: pool };
    return g;
  }

  function buildBeacon() {
    const g = new THREE.Group();
    const shaftMat = new THREE.MeshBasicMaterial({ color: 0xf5b942, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.4, 60, 12, 1, true), shaftMat);
    shaft.position.y = 30;
    g.add(shaft);
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(1.6), new THREE.MeshStandardMaterial({ color: 0xf5b942, emissive: 0xf5b942, emissiveIntensity: 1.4, roughness: 0.3 }));
    gem.position.y = 6;
    g.add(gem);
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.6, 3.4, 32), new THREE.MeshBasicMaterial({ color: 0xf5b942, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.15;
    g.add(ring);
    g.userData = { diamond: gem, ring };
    g.visible = false;
    scene.add(g);
    return g;
  }

  // ---- particles (pooled sprites) -----------------------------------------
  const pool = [];
  function emitSprite(tex, x, y, z, size, life, opts = {}) {
    let s = pool.find((p) => !p.sprite.visible);
    if (!s) {
      if (pool.length >= 48) return null;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
      scene.add(sprite);
      s = { sprite, life: 0, maxLife: 1, vy: 0, grow: 0 };
      pool.push(s);
    }
    s.sprite.material.map = tex;
    s.sprite.material.color.set(opts.color ?? 0xffffff);
    s.sprite.material.blending = opts.additive === false ? THREE.NormalBlending : THREE.AdditiveBlending;
    s.sprite.material.opacity = opts.opacity ?? 1;
    s.baseOpacity = opts.opacity ?? 1;
    s.sprite.material.needsUpdate = true;
    s.sprite.position.set(x, y, z);
    s.sprite.scale.setScalar(size);
    s.sprite.visible = true;
    s.life = life;
    s.maxLife = life;
    s.vy = opts.vy ?? 0;
    s.grow = opts.grow ?? 0;
    s.baseScale = size;
    return s;
  }
  const streaks = [];
  function emitStreak(x1, y1, z1, x2, y2, z2) {
    let t = streaks.find((o) => !o.line.visible);
    if (!t) {
      if (streaks.length >= 12) return;
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 }));
      line.visible = false;
      scene.add(line);
      t = { line, life: 0 };
      streaks.push(t);
    }
    const pos = t.line.geometry.attributes.position;
    pos.setXYZ(0, x1, y1, z1);
    pos.setXYZ(1, x2, y2, z2);
    pos.needsUpdate = true;
    t.line.visible = true;
    t.life = 0.06;
  }
  function stepParticles(dt) {
    for (const p of pool) {
      if (!p.sprite.visible) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.sprite.visible = false;
        continue;
      }
      const k = p.life / p.maxLife;
      p.sprite.position.y += p.vy * dt;
      if (p.grow) p.sprite.scale.setScalar(p.baseScale * (1 + p.grow * (1 - k)));
      p.sprite.material.opacity = (p.baseOpacity ?? 1) * Math.min(1, k * 1.6);
    }
    for (const t of streaks) {
      if (!t.line.visible) continue;
      t.life -= dt;
      if (t.life <= 0) t.line.visible = false;
    }
  }

  // ---- sky / time of day ---------------------------------------------------
  let skyKey = '';
  let skyTex = null;
  function refreshSky(hour) {
    const p = skyAtHour(hour);
    // The gradient texture only needs to change as the light shifts: rebuild
    // it at most every 3 game-minutes (hour bucket), not every frame — the
    // lerped colours change a little each frame and a per-frame canvas paint
    // + texture upload is pure waste.
    const key = `${Math.floor(hour * 20)}`;
    if (key !== skyKey) {
      skyKey = key;
      if (skyTex) skyTex.dispose();
      skyTex = duskGradient(p.zenith, p.edge);
      skyMat.map = skyTex;
      skyMat.needsUpdate = true;
    }
    scene.fog.color.setHex(p.haze);
    dome.intensity = p.sky;
    fill.color.setHex(p.fill);
    sun.color.setHex(p.light);
    sun.intensity = p.lightI;
    const dayT = Math.max(0, Math.min(1, (21 - hour) / 2.5));
    disc.material.opacity = 0.95 * dayT;
    halo.material.opacity = 0.9 * dayT;
    stars.material.opacity = p.street * 0.9;
    if (lampBulbs) {
      lampBulbs.material.emissiveIntensity = 0.3 + p.street * 2.2;
      lampPools.material.opacity = 0.25 + p.street * 0.75;
    }
    for (const m of signMats) m.opacity = 0.55 + p.street * 0.45;
  }

  // ---- camera rig ----------------------------------------------------------
  const rig = { yaw: Math.PI, tilt: 0.32, back: TUNE.lens.walkBack, view: TUNE.lens.view, jolt: 0 };
  const wantPos = new THREE.Vector3();
  const gaze = new THREE.Vector3();

  function refreshCamera(W, dt) {
    const hero = W.hero;
    const riding = !!hero.car;
    const target = riding ? hero.car : hero;
    const speed = riding ? Math.abs(hero.car.speed) : 0;
    // Yaw: mouse-look on foot; eases behind the car while driving.
    if (riding) {
      let diff = hero.car.facing - rig.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      rig.yaw += diff * Math.min(1, dt * (2.2 + speed * 0.02));
    }
    rig.tilt += (W.tiltTarget - rig.tilt) * Math.min(1, dt * 8);
    const back = riding ? TUNE.lens.rideBack : TUNE.lens.walkBack;
    const up = riding ? TUNE.lens.rideUp : TUNE.lens.walkUp;
    rig.back += (back - rig.back) * Math.min(1, dt * 4);
    const yaw = rig.yaw;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const px = target.x;
    const pz = target.z;
    wantPos.set(px - fx * rig.back, up + Math.sin(rig.tilt) * rig.back * 0.4, pz - fz * rig.back);
    // Keep the camera out of towers: clamp coarsely.
    wantPos.y = Math.max(wantPos.y, 1.2);
    camera.position.lerp(wantPos, Math.min(1, dt * (riding ? 7 : 10)));
    if (W.snapCam) {
      camera.position.copy(wantPos);
      W.snapCam = false;
    }
    gaze.set(px + fx * 6, 3.0, pz + fz * 6);
    camera.lookAt(gaze);
    // Nitro FOV kick + shake.
    const boosting = riding && hero.car.boostOn ? 1 : 0;
    const wantView = TUNE.lens.view + (TUNE.lens.viewBoost - TUNE.lens.view) * boosting;
    rig.view += (wantView - rig.view) * Math.min(1, dt * 6);
    if (Math.abs(camera.fov - rig.view) > 0.05) {
      camera.fov = rig.view;
      camera.updateProjectionMatrix();
    }
    if (rig.jolt > 0) {
      camera.position.x += (Math.random() - 0.5) * rig.jolt * 0.14;
      camera.position.y += (Math.random() - 0.5) * rig.jolt * 0.14;
      rig.jolt = Math.max(0, rig.jolt - dt * 26);
    }
  }

  function addShake(amount) {
    rig.jolt = Math.min(14, rig.jolt + amount);
  }

  function fit() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    gl.setSize(w, h);
  }
  window.addEventListener('resize', fit);

  return {
    scene,
    camera,
    renderer: gl,
    camState: rig,
    buildTownMeshes,
    buildVehicleMesh,
    buildPersonMesh,
    buildChopperMesh,
    buildBeacon,
    blobShadow: groundShade,
    mat: surface,
    refreshSky,
    refreshCamera,
    addShake,
    stepParticles,
    spawnFlash(x, y, z) { emitSprite(burstTex, x, y, z, 1.6, 0.07, { additive: true }); },
    spawnSpark(x, y, z) { emitSprite(emberTex, x, y, z, 0.9, 0.22, { additive: true }); },
    spawnSmoke(x, y, z) { emitSprite(puffTex, x, y, z, 2.2, 0.8, { additive: false, vy: 1.6, grow: 1.4, opacity: 0.55 }); },
    spawnBlood(x, y, z) { emitSprite(goreTex, x, y, z, 1.4, 0.5, { additive: false }); },
    spawnBlast(x, y, z) {
      emitSprite(burstTex, x, y + 1, z, 4, 0.9, { additive: true, grow: 2.2 });
      emitSprite(puffTex, x, y + 2, z, 5, 1.4, { additive: false, vy: 2.5, grow: 1.2, opacity: 0.6 });
    },
    spawnTracer: emitStreak,
    render() { gl.render(scene, camera); },
    resize: fit,
  };
}
