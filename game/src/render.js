// Rendering: the Three.js scene — dusk sky dome, fog, city meshes (instanced
// buildings, roads, lamps, neon), the third-person camera rig, mesh factories
// for cars and people, and a pooled sprite particle system. No shadow maps:
// blob shadows under entities keep it fast everywhere, including SwiftShader.
import * as THREE from 'three';
import { CFG, SKY_PRESETS, PALETTE } from './config.js';
import { ROADS, ROAD_W, HALF } from './city.js';

const tmpColor = new THREE.Color();
const tmpColor2 = new THREE.Color();
const tmpVec = new THREE.Vector3();
const dummy = new THREE.Object3D();

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function facadeTexture(windowsX, windowsY, litRatio) {
  return canvasTexture(128, 256, (g, w, h) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, w, h);
    const cw = w / windowsX;
    const ch = h / windowsY;
    for (let x = 0; x < windowsX; x += 1) {
      for (let y = 0; y < windowsY; y += 1) {
        const lit = ((x * 7 + y * 13) % 10) / 10 < litRatio;
        g.fillStyle = lit ? '#ffd27a' : '#18202f';
        g.fillRect(x * cw + cw * 0.25, y * ch + ch * 0.25, cw * 0.5, ch * 0.5);
      }
    }
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(0, 0, w, 4);
    g.fillRect(0, h - 4, w, 4);
  });
}

function radialTexture(inner, outer) {
  return canvasTexture(64, 64, (g, w, h) => {
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, inner);
    grad.addColorStop(1, outer);
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });
}

function skyTexture(top, horizon) {
  return canvasTexture(16, 256, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, `#${top.toString(16).padStart(6, '0')}`);
    grad.addColorStop(0.55, `#${horizon.toString(16).padStart(6, '0')}`);
    grad.addColorStop(0.75, `#${horizon.toString(16).padStart(6, '0')}`);
    grad.addColorStop(1, '#0a0a14');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });
}

function neonTexture(text, color) {
  return canvasTexture(256, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.font = '800 40px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = color;
    g.shadowBlur = 18;
    g.fillStyle = '#ffffff';
    g.fillText(text, w / 2, h / 2);
    g.shadowBlur = 6;
    g.fillStyle = color;
    g.fillText(text, w / 2, h / 2);
  });
}

function skyPresetAt(hour) {
  const h = ((hour % 24) + 24) % 24;
  let a = SKY_PRESETS[0];
  let b = SKY_PRESETS[SKY_PRESETS.length - 1];
  for (let i = 0; i < SKY_PRESETS.length - 1; i += 1) {
    if (h >= SKY_PRESETS[i].hour && h <= SKY_PRESETS[i + 1].hour) {
      a = SKY_PRESETS[i];
      b = SKY_PRESETS[i + 1];
      break;
    }
  }
  const span = Math.max(0.001, b.hour - a.hour);
  const t = Math.min(1, Math.max(0, (h - a.hour) / span));
  const lerp = (ka, kb) => tmpColor.setHex(ka).lerp(tmpColor2.setHex(kb), t).getHex();
  return {
    top: lerp(a.top, b.top),
    horizon: lerp(a.horizon, b.horizon),
    fog: lerp(a.fog, b.fog),
    sun: lerp(a.sun, b.sun),
    ambient: lerp(a.ambient, b.ambient),
    sunI: a.sunI + (b.sunI - a.sunI) * t,
    hemi: a.hemi + (b.hemi - a.hemi) * t,
    lamp: a.lamp + (b.lamp - a.lamp) * t,
  };
}

export function createRenderer(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x54405a, 90, 620);
  const camera = new THREE.PerspectiveCamera(CFG.camera.fov, container.clientWidth / container.clientHeight, 0.1, 2000);
  camera.position.set(0, 30, 60);

  const hemi = new THREE.HemisphereLight(0x8a7ab0, 0x2a2018, 0.5);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xff9a6b, 1.9);
  sun.position.set(-180, 140, 120);
  scene.add(sun);
  const ambient = new THREE.AmbientLight(0x6a5a8a, 0.55);
  scene.add(ambient);

  // Sky dome + sun disc + stars.
  const skyMat = new THREE.MeshBasicMaterial({ side: THREE.BackSide, fog: false, depthWrite: false });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 24, 16), skyMat);
  scene.add(sky);
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(42, 32),
    new THREE.MeshBasicMaterial({ color: 0xffd9a0, fog: false, transparent: true, opacity: 0.95 }),
  );
  sunDisc.position.set(-620, 150, 420);
  sunDisc.lookAt(0, 60, 0);
  scene.add(sunDisc);
  const glowTex = radialTexture('rgba(255,170,100,0.55)', 'rgba(255,170,100,0)');
  const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, fog: false, depthWrite: false }));
  sunGlow.scale.set(340, 340, 1);
  sunGlow.position.copy(sunDisc.position);
  scene.add(sunGlow);
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
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const blobTex = radialTexture('rgba(0,0,0,0.42)', 'rgba(0,0,0,0)');
  const blobGeo = new THREE.CircleGeometry(1, 20);
  const blobMat = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false });
  const flashTex = radialTexture('rgba(255,230,150,1)', 'rgba(255,140,40,0)');
  const smokeTex = radialTexture('rgba(120,120,120,0.55)', 'rgba(120,120,120,0)');
  const sparkTex = radialTexture('rgba(255,210,110,1)', 'rgba(255,120,20,0)');
  const bloodTex = radialTexture('rgba(170,20,20,0.85)', 'rgba(120,10,10,0)');

  const mats = new Map();
  function mat(color, opts = {}) {
    const key = `${color}|${opts.emissive || 0}|${opts.roughness || 0.85}|${opts.metalness || 0}`;
    if (!mats.has(key)) {
      mats.set(key, new THREE.MeshStandardMaterial({
        color, roughness: opts.roughness ?? 0.85, metalness: opts.metalness ?? 0,
        emissive: opts.emissive || 0x000000, emissiveIntensity: opts.emissiveIntensity ?? 1,
      }));
    }
    return mats.get(key);
  }

  function blobShadow(scale) {
    const m = new THREE.Mesh(blobGeo, blobMat);
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.03;
    m.scale.setScalar(scale);
    return m;
  }

  // ---- city meshes -------------------------------------------------------
  let lampHeads = null;
  let lampPools = null;
  let neonMats = [];

  function buildCityMeshes(city) {
    // Static meshes bullets can hit (returned for the raycaster).
    const staticHit = [];
    // Ground.
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(HALF * 2 + 240, HALF * 2 + 240),
      mat(PALETTE.ground, { roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.05, 40);
    scene.add(ground);
    staticHit.push(ground);
    // Beach + sea.
    const sand = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2 + 240, 48), mat(PALETTE.sand, { roughness: 1 }));
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(0, 0, CFG.world.beachZ + 16);
    scene.add(sand);
    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(HALF * 2 + 400, 220),
      new THREE.MeshStandardMaterial({ color: PALETTE.sea, roughness: 0.15, metalness: 0.55 }),
    );
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(0, -0.4, CFG.world.seaZ + 100);
    scene.add(sea);

    // Roads: dark strips with a dashed centre line texture.
    const roadTex = canvasTexture(128, 128, (g, w, h) => {
      g.fillStyle = '#23232e';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#d8c86a';
      g.fillRect(w / 2 - 2, 8, 4, 44);
      g.fillStyle = 'rgba(255,255,255,0.5)';
      g.fillRect(4, 0, 3, h);
      g.fillRect(w - 7, 0, 3, h);
    });
    roadTex.wrapS = THREE.RepeatWrapping;
    roadTex.wrapT = THREE.RepeatWrapping;
    roadTex.repeat.set(1, 40); // one dash tile per 16 m of road
    const roadMat = new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.95 });
    for (const r of ROADS) {
      const len = HALF * 2;
      const v = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, len), roadMat);
      v.rotation.x = -Math.PI / 2;
      v.position.set(r, 0.02, 0);
      v.material = roadMat;
      scene.add(v);
      const hz = new THREE.Mesh(new THREE.PlaneGeometry(len, ROAD_W), roadMat);
      hz.rotation.x = -Math.PI / 2;
      hz.rotation.z = Math.PI / 2;
      hz.position.set(0, 0.025, r);
      scene.add(hz);
    }
    // Sidewalk slabs per block (instanced).
    const slabGeo = new THREE.BoxGeometry(1, 0.22, 1);
    const slabs = new THREE.InstancedMesh(slabGeo, mat(PALETTE.sidewalk, { roughness: 1 }), 49);
    let si = 0;
    for (let c = 0; c < ROADS.length - 1; c += 1) {
      for (let r = 0; r < ROADS.length - 1; r += 1) {
        const x0 = ROADS[c] + ROAD_W / 2 - 1;
        const x1 = ROADS[c + 1] - ROAD_W / 2 + 1;
        const z0 = ROADS[r] + ROAD_W / 2 - 1;
        const z1 = ROADS[r + 1] - ROAD_W / 2 + 1;
        dummy.position.set((x0 + x1) / 2, 0.1, (z0 + z1) / 2);
        dummy.scale.set(x1 - x0, 1, z1 - z0);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        slabs.setMatrixAt(si, dummy.matrix);
        si += 1;
      }
    }
    slabs.count = si;
    scene.add(slabs);
    staticHit.push(slabs);

    // Parks: grass / plaza / stadium pads.
    for (const p of city.parks) {
      const w = p.x1 - p.x0;
      const d = p.z1 - p.z0;
      const cx = (p.x0 + p.x1) / 2;
      const cz = (p.z0 + p.z1) / 2;
      const color = p.kind === 'beach' ? PALETTE.sand : p.kind === 'plaza' ? 0x9a917e : p.kind === 'stadium' ? 0x4a7a3a : 0x3d6b34;
      const pad = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(color, { roughness: 1 }));
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(cx, 0.22, cz);
      scene.add(pad);
      if (p.kind === 'plaza') {
        const fountain = new THREE.Mesh(new THREE.CylinderGeometry(7, 8, 1.2, 24), mat(0x8a8578));
        fountain.position.set(cx, 0.8, cz);
        scene.add(fountain);
        const water = new THREE.Mesh(new THREE.CircleGeometry(6.4, 24), new THREE.MeshStandardMaterial({ color: 0x2a7a9a, roughness: 0.1, metalness: 0.4 }));
        water.rotation.x = -Math.PI / 2;
        water.position.set(cx, 1.45, cz);
        scene.add(water);
      }
      if (p.kind === 'stadium') {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(16, 1.1, 8, 32), mat(0xd8d2c2));
        ring.rotation.x = Math.PI / 2;
        ring.position.set(cx, 1.4, cz);
        scene.add(ring);
      }
    }
    // Parking lots: asphalt pads with bay lines.
    for (const lot of city.lots) {
      const pad = new THREE.Mesh(new THREE.PlaneGeometry(lot.x1 - lot.x0, lot.z1 - lot.z0), mat(0x1e1e26, { roughness: 1 }));
      pad.rotation.x = -Math.PI / 2;
      pad.position.set((lot.x0 + lot.x1) / 2, 0.22, (lot.z0 + lot.z1) / 2);
      scene.add(pad);
    }

    // Buildings: 3 instanced meshes (3 facade textures), tinted per instance.
    const facades = [facadeTexture(6, 10, 0.45), facadeTexture(8, 14, 0.3), facadeTexture(4, 8, 0.6)];
    const groups = [[], [], []];
    city.buildings.forEach((b, i) => groups[i % 3].push(b));
    groups.forEach((list, gi) => {
      if (list.length === 0) return;
      const m = new THREE.InstancedMesh(boxGeo, new THREE.MeshStandardMaterial({ map: facades[gi], roughness: 0.9 }), list.length);
      list.forEach((b, i) => {
        dummy.position.set(b.x, b.h / 2, b.z);
        dummy.scale.set(b.w, b.h, b.d);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        m.setMatrixAt(i, dummy.matrix);
        m.setColorAt(i, tmpColor.setHex(b.color));
      });
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      scene.add(m);
      staticHit.push(m);
      // Roof caps.
      const roofs = new THREE.InstancedMesh(boxGeo, mat(0x1c1c24, { roughness: 1 }), list.length);
      list.forEach((b, i) => {
        dummy.position.set(b.x, b.h + 0.25, b.z);
        dummy.scale.set(b.w + 0.6, 0.5, b.d + 0.6);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        roofs.setMatrixAt(i, dummy.matrix);
      });
      roofs.instanceMatrix.needsUpdate = true;
      scene.add(roofs);
    });

    // Trees: instanced trunks + canopies.
    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.3, 3.4, 6);
    const trunks = new THREE.InstancedMesh(trunkGeo, mat(0x5a4632, { roughness: 1 }), city.trees.length);
    const canopyGeo = new THREE.IcosahedronGeometry(2.4, 0);
    const canopies = new THREE.InstancedMesh(canopyGeo, mat(0x3d6b34, { roughness: 1 }), city.trees.length);
    city.trees.forEach((t, i) => {
      const h = t.palm ? 5.2 : 3.4;
      dummy.position.set(t.x, h / 2, t.z);
      dummy.scale.set(1, t.palm ? 1.6 : 1, 1);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
      dummy.position.set(t.x, h + 1.6, t.z);
      dummy.scale.setScalar(t.palm ? 0.8 : 1);
      dummy.updateMatrix();
      canopies.setMatrixAt(i, dummy.matrix);
      canopies.setColorAt(i, tmpColor.setHex(t.palm ? 0x4a8a3a : 0x3d6b34));
    });
    trunks.instanceMatrix.needsUpdate = true;
    canopies.instanceMatrix.needsUpdate = true;
    if (canopies.instanceColor) canopies.instanceColor.needsUpdate = true;
    scene.add(trunks);
    scene.add(canopies);

    // Street lamps: poles + emissive heads + light pools.
    const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 7, 6);
    const poles = new THREE.InstancedMesh(poleGeo, mat(0x2a2a33), city.lamps.length);
    const headGeo = new THREE.SphereGeometry(0.5, 10, 8);
    const headMat = new THREE.MeshStandardMaterial({ color: 0x444444, emissive: 0xffc46b, emissiveIntensity: 0.4 });
    lampHeads = new THREE.InstancedMesh(headGeo, headMat, city.lamps.length);
    const poolGeo = new THREE.CircleGeometry(6, 20);
    const poolMat = new THREE.MeshBasicMaterial({ map: radialTexture('rgba(255,190,110,0.20)', 'rgba(255,190,110,0)'), transparent: true, depthWrite: false });
    lampPools = new THREE.InstancedMesh(poolGeo, poolMat, city.lamps.length);
    city.lamps.forEach((l, i) => {
      dummy.position.set(l.x, 3.5, l.z);
      dummy.scale.set(1, 1, 1);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      poles.setMatrixAt(i, dummy.matrix);
      dummy.position.set(l.x, 7.1, l.z);
      dummy.updateMatrix();
      lampHeads.setMatrixAt(i, dummy.matrix);
      dummy.position.set(l.x, 0.06, l.z);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.updateMatrix();
      lampPools.setMatrixAt(i, dummy.matrix);
    });
    poles.instanceMatrix.needsUpdate = true;
    lampHeads.instanceMatrix.needsUpdate = true;
    lampPools.instanceMatrix.needsUpdate = true;
    scene.add(poles);
    scene.add(lampHeads);
    scene.add(lampPools);

    // Neon signs.
    neonMats = [];
    for (const n of city.neons) {
      const tex = neonTexture(n.text, `#${n.color.toString(16).padStart(6, '0')}`);
      const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, fog: false });
      neonMats.push(m);
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(n.w, n.w / 4), m);
      plane.position.set(n.x, n.y, n.z);
      if (n.face === 'n') plane.rotation.y = Math.PI;
      else if (n.face === 'e') plane.rotation.y = Math.PI / 2;
      else if (n.face === 'w') plane.rotation.y = -Math.PI / 2;
      scene.add(plane);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture('rgba(255,45,120,0.35)', 'rgba(255,45,120,0)'), transparent: true, depthWrite: false, color: n.color }));
      glow.scale.set(n.w * 2.2, n.w * 1.1, 1);
      glow.position.copy(plane.position);
      scene.add(glow);
    }
    return staticHit;
  }

  // ---- entity mesh factories ----------------------------------------------
  function makeCarMesh(type, colorHex) {
    const def = { sedan: [4.4, 1.9, 1.45], taxi: [4.4, 1.9, 1.45], pickup: [4.9, 2.0, 1.7], van: [5.0, 2.0, 2.1], comet: [4.2, 1.9, 1.25], cop: [4.5, 1.9, 1.45] }[type] || [4.4, 1.9, 1.45];
    const [len, wid, hgt] = def;
    const g = new THREE.Group();
    const paint = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.35, metalness: 0.6 });
    const body = new THREE.Mesh(boxGeo, paint);
    body.scale.set(wid, hgt * 0.62, len);
    body.position.y = hgt * 0.42;
    g.add(body);
    const cabin = new THREE.Mesh(boxGeo, mat(0x141c26, { roughness: 0.15, metalness: 0.7 }));
    cabin.scale.set(wid * 0.86, hgt * 0.5, len * 0.48);
    cabin.position.set(0, hgt * 0.92, -len * 0.04);
    g.add(cabin);
    if (type === 'van') {
      cabin.scale.set(wid * 0.94, hgt * 0.62, len * 0.8);
      cabin.position.set(0, hgt * 0.72, 0);
    }
    if (type === 'pickup') {
      const bed = new THREE.Mesh(boxGeo, paint);
      bed.scale.set(wid * 0.9, hgt * 0.5, len * 0.36);
      bed.position.set(0, hgt * 0.55, -len * 0.28);
      g.add(bed);
    }
    const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12);
    const wheelMat = mat(0x14161a, { roughness: 0.95 });
    const wheels = [];
    for (const [wx, wz] of [[-wid / 2, len * 0.32], [wid / 2, len * 0.32], [-wid / 2, -len * 0.32], [wid / 2, -len * 0.32]]) {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(wx, 0.36, wz);
      g.add(w);
      wheels.push(w);
    }
    const lightMat = new THREE.MeshStandardMaterial({ color: 0xfff6c9, emissive: 0xfff2b0, emissiveIntensity: 1.6 });
    for (const wx of [-wid * 0.32, wid * 0.32]) {
      const hl = new THREE.Mesh(boxGeo, lightMat);
      hl.scale.set(0.42, 0.22, 0.1);
      hl.position.set(wx, hgt * 0.5, len / 2 + 0.02);
      g.add(hl);
    }
    const tailMat = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff1a1a, emissiveIntensity: 0.7 });
    for (const wx of [-wid * 0.32, wid * 0.32]) {
      const tl = new THREE.Mesh(boxGeo, tailMat);
      tl.scale.set(0.42, 0.2, 0.1);
      tl.position.set(wx, hgt * 0.5, -len / 2 - 0.02);
      g.add(tl);
    }
    if (type === 'taxi') {
      const sign = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0xf1c40f, emissive: 0xf1c40f, emissiveIntensity: 0.8 }));
      sign.scale.set(0.7, 0.22, 0.3);
      sign.position.set(0, hgt * 1.22, 0);
      g.add(sign);
    }
    let lightBar = null;
    if (type === 'cop') {
      lightBar = new THREE.Group();
      const r = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff2020, emissiveIntensity: 2 }));
      r.scale.set(0.5, 0.22, 0.3);
      r.position.x = -0.3;
      const b = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0x000033, emissive: 0x2050ff, emissiveIntensity: 2 }));
      b.scale.set(0.5, 0.22, 0.3);
      b.position.x = 0.3;
      lightBar.add(r, b);
      lightBar.position.set(0, hgt * 1.22, 0);
      lightBar.userData.red = r;
      lightBar.userData.blue = b;
      g.add(lightBar);
    }
    const shadow = blobShadow(Math.max(len, wid) * 0.75);
    g.add(shadow);
    g.userData = { wheels, tailMat, lightBar, len, wid };
    return g;
  }

  function makePersonMesh(shirt, pants, skin, opts = {}) {
    const g = new THREE.Group();
    const shirtMat = mat(shirt);
    const pantsMat = mat(pants);
    const skinMat = mat(skin, { roughness: 0.7 });
    const legs = new THREE.Group();
    const legGeo = new THREE.BoxGeometry(0.26, 0.85, 0.3);
    const legL = new THREE.Mesh(legGeo, pantsMat);
    legL.position.set(-0.16, 0.42, 0);
    const legR = new THREE.Mesh(legGeo, pantsMat);
    legR.position.set(0.16, 0.42, 0);
    legs.add(legL, legR);
    g.add(legs);
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.36), shirtMat);
    torso.position.y = 1.22;
    g.add(torso);
    const armGeo = new THREE.BoxGeometry(0.2, 0.66, 0.24);
    const armL = new THREE.Mesh(armGeo, shirtMat);
    armL.position.set(-0.44, 1.22, 0);
    const armR = new THREE.Mesh(armGeo, shirtMat);
    armR.position.set(0.44, 1.22, 0);
    g.add(armL, armR);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), skinMat);
    head.position.y = 1.8;
    g.add(head);
    const hair = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.16, 0.44), mat(opts.hair ?? 0x1a1a1a));
    hair.position.y = 2.02;
    g.add(hair);
    if (opts.cap) {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.12, 0.5), mat(opts.cap));
      cap.position.y = 2.06;
      cap.position.z = 0.03;
      g.add(cap);
    }
    if (opts.weapon) {
      const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.5), mat(0x14161a, { roughness: 0.4, metalness: 0.6 }));
      gun.position.set(0.44, 1.05, 0.3);
      g.add(gun);
      g.userData.gun = gun;
    }
    const shadow = blobShadow(0.9);
    g.add(shadow);
    g.userData = { ...g.userData, legL, legR, armL, armR, torso, head, walkPhase: Math.random() * 6 };
    return g;
  }

  function makeHelicopterMesh() {
    const g = new THREE.Group();
    const bodyMat = mat(0x1a2a44, { roughness: 0.4, metalness: 0.5 });
    const body = new THREE.Mesh(boxGeo, bodyMat);
    body.scale.set(2.2, 1.6, 5.2);
    g.add(body);
    const glass = new THREE.Mesh(boxGeo, mat(0x0e1a2a, { roughness: 0.1, metalness: 0.8 }));
    glass.scale.set(2.0, 1.0, 1.4);
    glass.position.set(0, 0.2, 2.2);
    g.add(glass);
    const tail = new THREE.Mesh(boxGeo, bodyMat);
    tail.scale.set(0.5, 0.5, 4.5);
    tail.position.set(0, 0.3, -4.2);
    g.add(tail);
    const rotor = new THREE.Group();
    const bladeGeo = new THREE.BoxGeometry(9, 0.08, 0.4);
    const bladeMat = mat(0x111111);
    const b1 = new THREE.Mesh(bladeGeo, bladeMat);
    const b2 = new THREE.Mesh(bladeGeo, bladeMat);
    b2.rotation.y = Math.PI / 2;
    rotor.add(b1, b2);
    rotor.position.y = 1.1;
    g.add(rotor);
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff6c9, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const cone = new THREE.Mesh(new THREE.ConeGeometry(9, 34, 20, 1, true), lampMat);
    cone.position.y = -17;
    g.add(cone);
    const spot = new THREE.Mesh(new THREE.CircleGeometry(4.5, 20), new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    spot.rotation.x = -Math.PI / 2;
    spot.position.y = -33.9;
    g.add(spot);
    g.userData = { rotor, cone, spot };
    return g;
  }

  function makeMarker() {
    const g = new THREE.Group();
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xf5b942, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.4, 60, 12, 1, true), beamMat);
    beam.position.y = 30;
    g.add(beam);
    const diamond = new THREE.Mesh(new THREE.OctahedronGeometry(1.6), new THREE.MeshStandardMaterial({ color: 0xf5b942, emissive: 0xf5b942, emissiveIntensity: 1.4, roughness: 0.3 }));
    diamond.position.y = 6;
    g.add(diamond);
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.6, 3.4, 32), new THREE.MeshBasicMaterial({ color: 0xf5b942, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.15;
    g.add(ring);
    g.userData = { diamond, ring };
    g.visible = false;
    scene.add(g);
    return g;
  }

  // ---- particles (pooled sprites) -----------------------------------------
  const particles = [];
  function spawnSprite(tex, x, y, z, scale, life, opts = {}) {
    let s = particles.find((p) => !p.sprite.visible);
    if (!s) {
      if (particles.length >= 48) return null;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
      scene.add(sprite);
      s = { sprite, life: 0, maxLife: 1, vy: 0, grow: 0 };
      particles.push(s);
    }
    s.sprite.material.map = tex;
    s.sprite.material.color.set(opts.color ?? 0xffffff);
    s.sprite.material.blending = opts.additive === false ? THREE.NormalBlending : THREE.AdditiveBlending;
    s.sprite.material.opacity = opts.opacity ?? 1;
    s.baseOpacity = opts.opacity ?? 1;
    s.sprite.material.needsUpdate = true;
    s.sprite.position.set(x, y, z);
    s.sprite.scale.setScalar(scale);
    s.sprite.visible = true;
    s.life = life;
    s.maxLife = life;
    s.vy = opts.vy ?? 0;
    s.grow = opts.grow ?? 0;
    s.baseScale = scale;
    return s;
  }
  const tracers = [];
  function spawnTracer(x1, y1, z1, x2, y2, z2) {
    let t = tracers.find((o) => !o.line.visible);
    if (!t) {
      if (tracers.length >= 12) return;
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 }));
      line.visible = false;
      scene.add(line);
      t = { line, life: 0 };
      tracers.push(t);
    }
    const pos = t.line.geometry.attributes.position;
    pos.setXYZ(0, x1, y1, z1);
    pos.setXYZ(1, x2, y2, z2);
    pos.needsUpdate = true;
    t.line.visible = true;
    t.life = 0.06;
  }
  function updateParticles(dt) {
    for (const p of particles) {
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
    for (const t of tracers) {
      if (!t.line.visible) continue;
      t.life -= dt;
      if (t.life <= 0) t.line.visible = false;
    }
  }

  // ---- sky / time of day ---------------------------------------------------
  let lastSkyKey = '';
  let skyTex = null;
  function updateSky(hour) {
    const p = skyPresetAt(hour);
    const key = `${p.top}|${p.horizon}`;
    if (key !== lastSkyKey) {
      lastSkyKey = key;
      if (skyTex) skyTex.dispose();
      skyTex = skyTexture(p.top, p.horizon);
      skyMat.map = skyTex;
      skyMat.needsUpdate = true;
    }
    scene.fog.color.setHex(p.fog);
    hemi.intensity = p.hemi;
    ambient.color.setHex(p.ambient);
    sun.color.setHex(p.sun);
    sun.intensity = p.sunI;
    const dayT = Math.max(0, Math.min(1, (21 - hour) / 2.5));
    sunDisc.material.opacity = 0.95 * dayT;
    sunGlow.material.opacity = 0.9 * dayT;
    stars.material.opacity = p.lamp * 0.9;
    if (lampHeads) {
      lampHeads.material.emissiveIntensity = 0.3 + p.lamp * 2.2;
      lampPools.material.opacity = 0.25 + p.lamp * 0.75;
    }
    for (const m of neonMats) m.opacity = 0.55 + p.lamp * 0.45;
  }

  // ---- camera rig ----------------------------------------------------------
  const camState = { yaw: Math.PI, pitch: 0.32, dist: CFG.camera.footDist, fov: CFG.camera.fov, shake: 0 };
  const desired = new THREE.Vector3();
  const lookAt = new THREE.Vector3();

  function updateCamera(G, dt) {
    const p = G.player;
    const inCar = !!p.car;
    const target = inCar ? p.car : p;
    const speed = inCar ? Math.abs(p.car.speed) : 0;
    // Yaw: mouse-look on foot; eases behind the car while driving.
    if (inCar) {
      let diff = p.car.heading - camState.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      camState.yaw += diff * Math.min(1, dt * (2.2 + speed * 0.02));
    }
    camState.pitch += (G.camPitchTarget - camState.pitch) * Math.min(1, dt * 8);
    const dist = inCar ? CFG.camera.carDist : CFG.camera.footDist;
    const height = inCar ? CFG.camera.carHeight : CFG.camera.footHeight;
    camState.dist += (dist - camState.dist) * Math.min(1, dt * 4);
    const yaw = camState.yaw;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const px = target.x;
    const pz = target.z;
    desired.set(px - fx * camState.dist, height + Math.sin(camState.pitch) * camState.dist * 0.4, pz - fz * camState.dist);
    // Keep the camera out of buildings: clamp against colliders coarsely.
    desired.y = Math.max(desired.y, 1.2);
    camera.position.lerp(desired, Math.min(1, dt * (inCar ? 7 : 10)));
    if (G.cameraSnap) {
      camera.position.copy(desired);
      G.cameraSnap = false;
    }
    lookAt.set(px + fx * 6, 1.6, pz + fz * 6);
    camera.lookAt(lookAt);
    // Nitro FOV kick + shake.
    const nitro = inCar && p.car.nitroOn ? 1 : 0;
    const targetFov = CFG.camera.fov + (CFG.camera.fovNitro - CFG.camera.fov) * nitro;
    camState.fov += (targetFov - camState.fov) * Math.min(1, dt * 6);
    if (Math.abs(camera.fov - camState.fov) > 0.05) {
      camera.fov = camState.fov;
      camera.updateProjectionMatrix();
    }
    if (camState.shake > 0) {
      camera.position.x += (Math.random() - 0.5) * camState.shake * 0.14;
      camera.position.y += (Math.random() - 0.5) * camState.shake * 0.14;
      camState.shake = Math.max(0, camState.shake - dt * 26);
    }
  }

  function addShake(amount) {
    camState.shake = Math.min(14, camState.shake + amount);
  }

  function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  window.addEventListener('resize', resize);

  return {
    scene,
    camera,
    renderer,
    camState,
    buildCityMeshes,
    makeCarMesh,
    makePersonMesh,
    makeHelicopterMesh,
    makeMarker,
    blobShadow,
    mat,
    updateSky,
    updateCamera,
    addShake,
    updateParticles,
    spawnFlash(x, y, z) { spawnSprite(flashTex, x, y, z, 1.6, 0.07, { additive: true }); },
    spawnSpark(x, y, z) { spawnSprite(sparkTex, x, y, z, 0.9, 0.22, { additive: true }); },
    spawnSmoke(x, y, z) { spawnSprite(smokeTex, x, y, z, 2.2, 0.8, { additive: false, vy: 1.6, grow: 1.4, opacity: 0.55 }); },
    spawnBlood(x, y, z) { spawnSprite(bloodTex, x, y, z, 1.4, 0.5, { additive: false }); },
    spawnExplosion(x, y, z) {
      spawnSprite(flashTex, x, y + 1, z, 4, 0.9, { additive: true, grow: 2.2 });
      spawnSprite(smokeTex, x, y + 2, z, 5, 1.4, { additive: false, vy: 2.5, grow: 1.2, opacity: 0.6 });
    },
    spawnTracer,
    render() { renderer.render(scene, camera); },
    resize,
  };
}
