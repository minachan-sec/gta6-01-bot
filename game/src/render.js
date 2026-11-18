// All Three.js rendering: the city meshes, cars, people, the helicopter,
// the sky, particles and the camera. The game logic never touches THREE.
import * as THREE from 'three';
import { CFG, PALETTE } from './config.js';

const tmpMatrix = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion();
const tmpVec = new THREE.Vector3();
const tmpScale = new THREE.Vector3();
const tmpColor = new THREE.Color();

function box(w, h, d, color, opts = {}) {
  const mat = new THREE.MeshLambertMaterial({ color, ...opts });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  return mesh;
}

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.skyDusk);
  scene.fog = new THREE.Fog(PALETTE.skyDusk, 70, 420);
  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);

  const sun = new THREE.DirectionalLight(0xffb27a, 2.2);
  sun.position.set(-120, 90, 60);
  scene.add(sun);
  const ambient = new THREE.AmbientLight(0x8a7a9a, 0.9);
  scene.add(ambient);
  const hemi = new THREE.HemisphereLight(0xffd9b0, 0x2a2f3a, 0.7);
  scene.add(hemi);

  // The sun disc: a flat circle far away, so sunsets read in screenshots.
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(26, 24),
    new THREE.MeshBasicMaterial({ color: 0xffd27a, fog: false }),
  );
  sunDisc.position.set(-260, 55, 180);
  sunDisc.lookAt(0, 0, 0);
  scene.add(sunDisc);

  // Particle pool: small additive planes, reused, never allocated per frame.
  const particles = [];
  const particleGeo = new THREE.PlaneGeometry(1, 1);
  for (let i = 0; i < 48; i += 1) {
    const m = new THREE.Mesh(particleGeo, new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    m.visible = false;
    scene.add(m);
    particles.push({ mesh: m, life: 0, max: 1, vx: 0, vy: 0, vz: 0, grow: 0 });
  }
  let particleCursor = 0;
  function spawnParticle(x, y, z, color, size, life, vx, vy, vz, grow) {
    const p = particles[particleCursor];
    particleCursor = (particleCursor + 1) % particles.length;
    p.mesh.visible = true;
    p.mesh.position.set(x, y, z);
    p.mesh.scale.set(size, size, size);
    p.mesh.material.color.set(color);
    p.mesh.material.opacity = 0.9;
    p.life = life;
    p.max = life;
    p.vx = vx; p.vy = vy; p.vz = vz;
    p.grow = grow;
  }

  // One reusable flash light for muzzle flashes and explosions.
  const flashLight = new THREE.PointLight(0xffcc66, 0, 18, 2);
  scene.add(flashLight);
  let flashT = 0;

  let shake = 0;
  let skyCacheHour = -99;

  const api = {
    scene,
    camera,
    renderer,
    camState: { yaw: Math.PI, pitch: 0.18 },

    // Project a world point to screen pixels (used by the playtest aim).
    project(x, y, z) {
      const v = new THREE.Vector3(x, y, z).project(camera);
      return {
        x: ((v.x + 1) / 2) * window.innerWidth,
        y: ((1 - v.y) / 2) * window.innerHeight,
        behind: v.z > 1,
      };
    },

    buildCityMeshes(city) {
      const half = CFG.world.cityHalf;
      // Ground.
      const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(half * 2 + 200, half * 2 + 200),
        new THREE.MeshLambertMaterial({ color: PALETTE.ground }),
      );
      ground.rotation.x = -Math.PI / 2;
      ground.position.set(0, -0.1, 0);
      scene.add(ground);
      // Sea, south of the beach.
      const sea = new THREE.Mesh(
        new THREE.PlaneGeometry(half * 2 + 400, 220),
        new THREE.MeshLambertMaterial({ color: PALETTE.sea }),
      );
      sea.rotation.x = -Math.PI / 2;
      sea.position.set(0, -0.05, CFG.world.seaAt + 110);
      scene.add(sea);
      // Sand strip.
      const sand = new THREE.Mesh(
        new THREE.PlaneGeometry(half * 2 + 200, 26),
        new THREE.MeshLambertMaterial({ color: 0xc2a878 }),
      );
      sand.rotation.x = -Math.PI / 2;
      sand.position.set(0, -0.02, CFG.world.seaAt - 8);
      scene.add(sand);
      // Roads: dark strips along every grid line.
      const roadMat = new THREE.MeshLambertMaterial({ color: PALETTE.asphalt });
      const roadGeoV = new THREE.PlaneGeometry(CFG.world.roadHalf * 2, half * 2);
      const roadGeoH = new THREE.PlaneGeometry(half * 2, CFG.world.roadHalf * 2);
      for (const c of city.roads) {
        const v = new THREE.Mesh(roadGeoV, roadMat);
        v.rotation.x = -Math.PI / 2;
        v.position.set(c, 0, 0);
        scene.add(v);
        const h = new THREE.Mesh(roadGeoH, roadMat);
        h.rotation.x = -Math.PI / 2;
        h.position.set(0, 0, c);
        scene.add(h);
      }
      // Buildings: one instanced mesh, colour per instance.
      const bGeo = new THREE.BoxGeometry(1, 1, 1);
      const bMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
      const bMesh = new THREE.InstancedMesh(bGeo, bMat, city.buildings.length);
      const rGeo = new THREE.BoxGeometry(1, 1, 1);
      const rMat = new THREE.MeshLambertMaterial({ color: 0x3a3f4a });
      const rMesh = new THREE.InstancedMesh(rGeo, rMat, city.buildings.length);
      city.buildings.forEach((bd, i) => {
        tmpQuat.identity();
        tmpVec.set(bd.x, bd.h / 2, bd.z);
        tmpScale.set(bd.w, bd.h, bd.d);
        tmpMatrix.compose(tmpVec, tmpQuat, tmpScale);
        bMesh.setMatrixAt(i, tmpMatrix);
        bMesh.setColorAt(i, tmpColor.set(bd.color));
        tmpVec.set(bd.x, bd.h + 0.3, bd.z);
        tmpScale.set(bd.w + 0.6, 0.6, bd.d + 0.6);
        tmpMatrix.compose(tmpVec, tmpQuat, tmpScale);
        rMesh.setMatrixAt(i, tmpMatrix);
      });
      bMesh.instanceMatrix.needsUpdate = true;
      if (bMesh.instanceColor) bMesh.instanceColor.needsUpdate = true;
      rMesh.instanceMatrix.needsUpdate = true;
      scene.add(bMesh);
      scene.add(rMesh);
      // Trees: instanced trunks + instanced canopies.
      const tGeo = new THREE.CylinderGeometry(0.22, 0.3, 2.2, 5);
      const tMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2f });
      const tMesh = new THREE.InstancedMesh(tGeo, tMat, city.trees.length);
      const cGeo = new THREE.ConeGeometry(1.7, 3.4, 6);
      const cMat = new THREE.MeshLambertMaterial({ color: 0x2e7d4f });
      const cMesh = new THREE.InstancedMesh(cGeo, cMat, city.trees.length);
      city.trees.forEach((t, i) => {
        tmpQuat.identity();
        tmpVec.set(t.x, 1.1 * t.s, t.z);
        tmpScale.set(t.s, t.s, t.s);
        tmpMatrix.compose(tmpVec, tmpQuat, tmpScale);
        tMesh.setMatrixAt(i, tmpMatrix);
        tmpVec.set(t.x, (2.2 + 1.4) * t.s, t.z);
        tmpMatrix.compose(tmpVec, tmpQuat, tmpScale);
        cMesh.setMatrixAt(i, tmpMatrix);
      });
      tMesh.instanceMatrix.needsUpdate = true;
      cMesh.instanceMatrix.needsUpdate = true;
      scene.add(tMesh);
      scene.add(cMesh);
      // Street lamps: instanced poles + glowing heads.
      const pGeo = new THREE.CylinderGeometry(0.09, 0.12, 5.4, 5);
      const pMat = new THREE.MeshLambertMaterial({ color: 0x2c313a });
      const pMesh = new THREE.InstancedMesh(pGeo, pMat, city.lamps.length);
      const lGeo = new THREE.SphereGeometry(0.32, 6, 5);
      const lMat = new THREE.MeshBasicMaterial({ color: 0xffe6a3 });
      const lMesh = new THREE.InstancedMesh(lGeo, lMat, city.lamps.length);
      city.lamps.forEach((l, i) => {
        tmpQuat.identity();
        tmpVec.set(l.x, 2.7, l.z);
        tmpScale.set(1, 1, 1);
        tmpMatrix.compose(tmpVec, tmpQuat, tmpScale);
        pMesh.setMatrixAt(i, tmpMatrix);
        tmpVec.set(l.x, 5.5, l.z);
        tmpMatrix.compose(tmpVec, tmpQuat, tmpScale);
        lMesh.setMatrixAt(i, tmpMatrix);
      });
      pMesh.instanceMatrix.needsUpdate = true;
      lMesh.instanceMatrix.needsUpdate = true;
      scene.add(pMesh);
      scene.add(lMesh);
    },

    makeCarMesh(type, color) {
      const g = new THREE.Group();
      const body = box(2.0, 0.75, 4.4, color);
      body.position.y = 0.62;
      g.add(body);
      const cabin = box(1.7, 0.6, 2.1, 0x1a2530);
      cabin.position.set(0, 1.28, -0.2);
      g.add(cabin);
      const skirt = box(2.05, 0.3, 4.45, 0x14181d);
      skirt.position.y = 0.3;
      g.add(skirt);
      const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff6c9 });
      const hl = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.18, 0.1), lightMat);
      hl.position.set(0, 0.62, 2.22);
      g.add(hl);
      const tl = new THREE.Mesh(
        new THREE.BoxGeometry(1.7, 0.18, 0.1),
        new THREE.MeshBasicMaterial({ color: 0xff2a2a }),
      );
      tl.position.set(0, 0.62, -2.22);
      g.add(tl);
      // Cop cars get a light bar.
      if (type === 'cop') {
        const bar = box(1.2, 0.22, 0.4, 0x2244ff);
        bar.position.set(0, 1.68, -0.2);
        g.add(bar);
        g.userData.lightBar = bar;
      }
      return g;
    },

    makePersonMesh(shirt, pants, skin, opts = {}) {
      const g = new THREE.Group();
      const torso = box(0.62, 0.78, 0.34, shirt);
      torso.position.y = 1.12;
      g.add(torso);
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.24, 8, 7),
        new THREE.MeshLambertMaterial({ color: skin }),
      );
      head.position.y = 1.72;
      g.add(head);
      const legMat = new THREE.MeshLambertMaterial({ color: pants });
      const legGeo = new THREE.BoxGeometry(0.24, 0.72, 0.28);
      const legL = new THREE.Mesh(legGeo, legMat);
      legL.position.set(-0.17, 0.36, 0);
      const legR = new THREE.Mesh(legGeo, legMat);
      legR.position.set(0.17, 0.36, 0);
      g.add(legL);
      g.add(legR);
      const armGeo = new THREE.BoxGeometry(0.18, 0.66, 0.22);
      const armMat = new THREE.MeshLambertMaterial({ color: shirt });
      const armL = new THREE.Mesh(armGeo, armMat);
      armL.position.set(-0.42, 1.12, 0);
      const armR = new THREE.Mesh(armGeo, armMat);
      armR.position.set(0.42, 1.12, 0);
      g.add(armL);
      g.add(armR);
      let gun = null;
      if (opts.weapon) {
        gun = box(0.09, 0.12, 0.55, 0x1a1a1a);
        gun.position.set(0.42, 1.05, 0.3);
        g.add(gun);
      }
      g.userData = { legL, legR, armL, armR, gun };
      return g;
    },

    makeHeliMesh() {
      const g = new THREE.Group();
      const body = box(1.6, 1.1, 3.4, 0x1c2733);
      body.position.y = 0;
      g.add(body);
      const tail = box(0.4, 0.4, 2.6, 0x1c2733);
      tail.position.set(0, 0.2, -2.8);
      g.add(tail);
      const skidL = box(0.14, 0.14, 2.6, 0x0d1117);
      skidL.position.set(-0.7, -0.75, 0);
      const skidR = box(0.14, 0.14, 2.6, 0x0d1117);
      skidR.position.set(0.7, -0.75, 0);
      g.add(skidL);
      g.add(skidR);
      const rotor = new THREE.Group();
      const blade1 = box(7.5, 0.06, 0.28, 0x0d1117);
      const blade2 = box(0.28, 0.06, 7.5, 0x0d1117);
      rotor.add(blade1);
      rotor.add(blade2);
      rotor.position.y = 0.75;
      g.add(rotor);
      // The searchlight cone, pointing down-forward.
      const coneMat = new THREE.MeshBasicMaterial({
        color: 0xfff2b0, transparent: true, opacity: 0.22, depthWrite: false,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      });
      const cone = new THREE.Mesh(new THREE.ConeGeometry(4.5, 16, 12, 1, true), coneMat);
      cone.position.set(0, -8, 3);
      cone.rotation.x = Math.PI + 0.35;
      g.add(cone);
      const spot = new THREE.SpotLight(0xfff2b0, 60, 40, 0.5, 0.5, 1.2);
      spot.position.set(0, -0.5, 1);
      g.add(spot);
      spot.target.position.set(0, -16, 6);
      g.add(spot.target);
      g.userData = { rotor };
      return g;
    },

    makeMarker() {
      const g = new THREE.Group();
      const diamond = new THREE.Mesh(
        new THREE.OctahedronGeometry(1.4),
        new THREE.MeshBasicMaterial({ color: 0xffd23f }),
      );
      diamond.position.y = 6;
      g.add(diamond);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(2.6, 0.18, 6, 24),
        new THREE.MeshBasicMaterial({ color: 0xffd23f }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.25;
      g.add(ring);
      g.userData = { diamond, ring };
      g.visible = false;
      scene.add(g);
      return g;
    },

    updateCamera(W, dt) {
      const p = W.player;
      const st = api.camState;
      let target;
      let dist;
      let height;
      if (p.car) {
        target = p.car;
        dist = CFG.camera.driveDist;
        height = CFG.camera.driveHeight;
        // While driving, the camera yaw follows the car's heading so the
        // road ahead — and the helicopter above it — stays in frame.
        const want = p.car.heading + Math.PI;
        let diff = want - st.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        st.yaw += diff * Math.min(1, dt * 2.2);
      } else {
        target = p;
        dist = CFG.camera.footDist;
        height = CFG.camera.footHeight;
      }
      const tx = target.x;
      const tz = target.z;
      const pitch = st.pitch;
      const cx = tx - Math.sin(st.yaw) * Math.cos(pitch) * dist;
      const cz = tz - Math.cos(st.yaw) * Math.cos(pitch) * dist;
      const cy = height + Math.sin(pitch) * dist * 0.5;
      if (W.cameraSnap) {
        camera.position.set(cx, cy, cz);
        W.cameraSnap = false;
      } else {
        const k = Math.min(1, dt * 7);
        camera.position.x += (cx - camera.position.x) * k;
        camera.position.y += (cy - camera.position.y) * k;
        camera.position.z += (cz - camera.position.z) * k;
      }
      const lookX = tx + Math.sin(st.yaw) * 10;
      const lookZ = tz + Math.cos(st.yaw) * 10;
      camera.lookAt(lookX, 1.4, lookZ);
      if (shake > 0.01) {
        camera.position.x += (Math.random() - 0.5) * shake * 0.12;
        camera.position.y += (Math.random() - 0.5) * shake * 0.12;
        shake *= Math.max(0, 1 - dt * 5);
      }
    },

    updateSky(hour) {
      const h = ((hour % 24) + 24) % 24;
      if (Math.abs(h - skyCacheHour) < 0.05) return;
      skyCacheHour = h;
      // Keyframed sky: day -> dusk -> night.
      const stops = [
        [15, 0x87b5d6, 0xffffff, 2.4],
        [18.5, 0xe8835a, 0xffb27a, 2.0],
        [20, 0x5a4a7a, 0x8a7ab0, 1.1],
        [22, 0x1a2340, 0x5a6a9a, 0.55],
        [24, 0x141a30, 0x4a5a8a, 0.5],
      ];
      let a = stops[0];
      let b = stops[stops.length - 1];
      for (let i = 0; i < stops.length - 1; i += 1) {
        if (h >= stops[i][0] && h <= stops[i + 1][0]) { a = stops[i]; b = stops[i + 1]; break; }
      }
      const span = Math.max(0.001, b[0] - a[0]);
      const t = Math.min(1, Math.max(0, (h - a[0]) / span));
      const sky = new THREE.Color(a[1]).lerp(new THREE.Color(b[1]), t);
      const sunCol = new THREE.Color(a[2]).lerp(new THREE.Color(b[2]), t);
      scene.background.set(sky);
      scene.fog.color.set(sky);
      sun.color.set(sunCol);
      sun.intensity = a[3] + (b[3] - a[3]) * t;
      ambient.intensity = 0.55 + 0.45 * (sun.intensity / 2.4);
      sunDisc.material.color.set(sunCol);
      const sink = Math.max(0, (h - 18.5) / 2.5);
      sunDisc.position.y = 55 - sink * 70;
      sunDisc.material.opacity = 1;
    },

    updateParticles(dt) {
      for (const p of particles) {
        if (p.life <= 0) continue;
        p.life -= dt;
        if (p.life <= 0) {
          p.mesh.visible = false;
          continue;
        }
        p.mesh.position.x += p.vx * dt;
        p.mesh.position.y += p.vy * dt;
        p.mesh.position.z += p.vz * dt;
        const s = p.mesh.scale.x + p.grow * dt;
        p.mesh.scale.set(s, s, s);
        p.mesh.material.opacity = 0.9 * (p.life / p.max);
        p.mesh.lookAt(camera.position);
      }
      if (flashT > 0) {
        flashT -= dt;
        flashLight.intensity = Math.max(0, flashT * 400);
      }
    },

    spawnSmoke(x, y, z) {
      spawnParticle(x, y, z, 0x666666, 1.2, 1.4, (Math.random() - 0.5) * 0.6, 1.6, (Math.random() - 0.5) * 0.6, 1.5);
    },
    spawnSparks(x, y, z) {
      for (let i = 0; i < 5; i += 1) {
        spawnParticle(x, y, z, 0xffaa33, 0.35, 0.4, (Math.random() - 0.5) * 8, Math.random() * 5, (Math.random() - 0.5) * 8, 0);
      }
    },
    spawnFlash(x, y, z) {
      spawnParticle(x, y, z, 0xffe08a, 1.4, 0.09, 0, 0, 0, 0);
      flashLight.position.set(x, y + 1, z);
      flashLight.intensity = 60;
      flashT = 0.09;
    },
    addShake(n) {
      shake = Math.min(12, shake + n);
    },
    render() {
      renderer.render(scene, camera);
    },
    resize() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    },
  };
  return api;
}
