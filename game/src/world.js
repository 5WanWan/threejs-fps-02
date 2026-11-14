// Smelter Yard: CINDERLINE's map. A 64 x 48 m industrial yard at dusk —
// Vanguard spawns south-west, Sentinel north-east, Site A (Kiln) north-west,
// Site B (Gantry) south-east, three lanes between them: A-long along the west
// wall, mid through the connector hall, B-route along the east wall. Every
// wall, crate and container is both a mesh and an axis-aligned collider, so
// movement and bullets agree on what is solid.
//
// The yard is lit to read at a glance in a screenshot: a warm low sun, a
// cool sky fill, a molten slag channel glowing out of the kiln, strip lights
// along the mid walls, and a star field with a low moon over the skyline.
import * as THREE from 'three';
import { PALETTE, mat, concreteTexture, hazardTexture, metalTexture, rustTexture, containerTexture, fenceTexture, slagTexture } from './palette.js';
import { V1 } from './tmp.js';

const BOUNDS = { minX: -32, maxX: 32, minZ: -24, maxZ: 24 };

// Waypoint graph: bots walk it. `links` are neighbour node ids.
const WAYPOINTS = [
  // Vanguard spawn (south-west)
  { id: 'v0', x: -28, z: 18, links: ['v1'] },
  { id: 'v1', x: -24, z: 14, links: ['v0', 'v2', 'a0'] },
  { id: 'v2', x: -18, z: 16, links: ['v1', 'm0', 'b2'] },
  // A-long (west)
  { id: 'a0', x: -26, z: 8, links: ['v1', 'a1'] },
  { id: 'a1', x: -26, z: -2, links: ['a0', 'a2', 'm4'] },
  { id: 'a2', x: -24, z: -10, links: ['a1', 'a3'] },
  { id: 'a3', x: -20, z: -15, links: ['a2', 'a4', 'ha1'] },
  { id: 'a4', x: -15, z: -19, links: ['a3', 'ha2', 's2'] },
  // Mid
  { id: 'm0', x: -8, z: 6, links: ['v2', 'm1'] },
  { id: 'm1', x: 0, z: 4, links: ['m0', 'm2', 'm4'] },
  { id: 'm2', x: 0, z: -4, links: ['m1', 'm3'] },
  { id: 'm3', x: 8, z: -6, links: ['m2', 's1', 'b0'] },
  { id: 'm4', x: -8, z: -8, links: ['m1', 'a1'] },
  // B-route (east)
  { id: 'b0', x: 24, z: -10, links: ['m3', 'b1'] },
  { id: 'b1', x: 26, z: 0, links: ['b0', 'b2'] },
  { id: 'b2', x: 24, z: 10, links: ['b1', 'b3', 'v2'] },
  { id: 'b3', x: 20, z: 15, links: ['b2', 'b4', 'hb1'] },
  { id: 'b4', x: 15, z: 19, links: ['b3', 'hb2', 'v2'] },
  // Sentinel spawn (north-east)
  { id: 's0', x: 28, z: -18, links: ['s1'] },
  { id: 's1', x: 24, z: -14, links: ['s0', 's2', 'm3'] },
  { id: 's2', x: 18, z: -16, links: ['s1', 'a4', 'ha2'] },
  // Site holds
  { id: 'ha1', x: -18, z: -13, links: ['a3'] },
  { id: 'ha2', x: -26, z: -19, links: ['a4', 's2'] },
  { id: 'hb1', x: 18, z: 12, links: ['b3'] },
  { id: 'hb2', x: 26, z: 19, links: ['b4'] },
];

function box(scene, colliders, shootables, material, x, y, z, w, h, d, collide = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = h > 1.4;
  mesh.receiveShadow = true;
  scene.add(mesh);
  if (collide) {
    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, height: h });
    shootables.push(mesh);
  }
  return mesh;
}

function cylinder(scene, colliders, shootables, material, x, z, r, h, segments = 12) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, segments), material);
  mesh.position.set(x, h / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  colliders.push({ minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r, height: h });
  shootables.push(mesh);
  return mesh;
}

// Text drawn on a canvas, used for the site letters on the ground and the
// big yard sign. No image files: the text is painted at runtime.
function textTexture(text, fg, bg, size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = fg;
  ctx.font = `900 ${size * 0.62}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, size / 2, size / 2 + size * 0.03);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function createWorld(scene, rng) {
  const colliders = [];
  const shootables = [];
  const animated = [];

  // --- lights: a warm low sun bright enough to read by, cool sky fill ---
  const sun = new THREE.DirectionalLight(0xffb36b, 3.2);
  sun.position.set(-30, 38, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -40;
  sun.shadow.camera.right = 40;
  sun.shadow.camera.top = 30;
  sun.shadow.camera.bottom = -30;
  sun.shadow.camera.far = 120;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0x9fb4cc, 0x3a2c20, 1.5));
  const kilnLight = new THREE.PointLight(0xff7a22, 80, 30, 1.6);
  kilnLight.position.set(-22, 3.4, -16);
  scene.add(kilnLight);
  const gantryLight = new THREE.PointLight(0x2fd8c0, 40, 24, 1.6);
  gantryLight.position.set(22, 6, 16);
  scene.add(gantryLight);

  // Dusk sky: a gradient dome (deep indigo overhead, amber at the horizon)
  // so the skyline reads instead of a flat dark backdrop. Radius 120 stays
  // inside the camera's 160 far plane; fog:false keeps it from greying out.
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 4;
  skyCanvas.height = 256;
  const skyCtx = skyCanvas.getContext('2d');
  const gradient = skyCtx.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, '#0d1322');
  gradient.addColorStop(0.55, '#20273a');
  gradient.addColorStop(0.78, '#6a452c');
  gradient.addColorStop(0.88, '#c07a30');
  gradient.addColorStop(1, '#33241a');
  skyCtx.fillStyle = gradient;
  skyCtx.fillRect(0, 0, 4, 256);
  const skyTexture = new THREE.CanvasTexture(skyCanvas);
  skyTexture.colorSpace = THREE.SRGBColorSpace;
  scene.add(new THREE.Mesh(
    new THREE.SphereGeometry(120, 16, 12),
    new THREE.MeshBasicMaterial({ map: skyTexture, side: THREE.BackSide, fog: false }),
  ));

  // Stars above the walls + a low moon, so the sky has depth.
  const starCount = 220;
  const starGeo = new THREE.BufferGeometry();
  const starPos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i += 1) {
    const a = rng() * Math.PI * 2;
    const e = 0.25 + rng() * 1.1;
    starPos[i * 3] = Math.cos(a) * Math.cos(e) * 110;
    starPos[i * 3 + 1] = Math.sin(e) * 110;
    starPos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * 110;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xdfe8ff, size: 0.7, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85 })));
  const moon = new THREE.Mesh(
    new THREE.CircleGeometry(4.5, 24),
    new THREE.MeshBasicMaterial({ color: 0xf2ead2, fog: false }),
  );
  moon.position.set(52, 58, -82);
  moon.lookAt(0, 0, 0);
  scene.add(moon);

  // --- ground ---
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(64, 48),
    new THREE.MeshStandardMaterial({ map: concreteTexture(), roughness: 0.95, metalness: 0.05 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  shootables.push(ground);

  // --- perimeter walls ---
  const wallMat = mat(0x454d56, { roughness: 0.85, metalness: 0.25, map: metalTexture() });
  box(scene, colliders, shootables, wallMat, 0, 0, -24.3, 65.2, 3.4, 0.6);
  box(scene, colliders, shootables, wallMat, 0, 0, 24.3, 65.2, 3.4, 0.6);
  box(scene, colliders, shootables, wallMat, -32.3, 0, 0, 0.6, 3.4, 49.2);
  box(scene, colliders, shootables, wallMat, 32.3, 0, 0, 0.6, 3.4, 49.2);
  // hazard trim along the top of the walls
  const hazardMat = mat(0xffffff, { map: hazardTexture(), roughness: 0.8 });
  for (const z of [-24.3, 24.3]) {
    const trim = new THREE.Mesh(new THREE.BoxGeometry(65.2, 0.28, 0.66), hazardMat);
    trim.position.set(0, 3.4, z);
    scene.add(trim);
  }

  // --- Site A: the Kiln (north-west) ---
  const kiln = cylinder(scene, colliders, shootables, mat(0x4a3f38, { roughness: 0.7, metalness: 0.5, map: rustTexture() }), -22, -16, 3.4, 5.4, 16);
  kiln.position.y = 2.7;
  const kilnMouth = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 2.6, 0.5, 16),
    mat(0x000000, { emissive: 0xff6a00, emissiveIntensity: 3.2 }),
  );
  kilnMouth.position.set(-22, 5.2, -16);
  scene.add(kilnMouth);
  animated.push({ mesh: kilnMouth, base: 3.2, phase: rng() * 6 });
  // kiln pipes
  box(scene, colliders, shootables, mat(0x5d646c, { roughness: 0.6, metalness: 0.6 }), -26.5, 0, -19.5, 1.2, 4.4, 1.2);
  box(scene, colliders, shootables, mat(0x5d646c, { roughness: 0.6, metalness: 0.6 }), -18.5, 0, -20.5, 1.2, 3.6, 1.2);
  // molten slag channel: glowing flow from the kiln toward mid (visual only)
  const slag = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 1.6),
    new THREE.MeshBasicMaterial({ map: slagTexture(), transparent: false }),
  );
  slag.rotation.x = -Math.PI / 2;
  slag.rotation.z = 0.5;
  slag.position.set(-17.5, 0.02, -13.5);
  scene.add(slag);
  const slagLight = new THREE.PointLight(0xff7a1a, 18, 12, 1.8);
  slagLight.position.set(-17.5, 1.2, -13.5);
  scene.add(slagLight);
  animated.push({ mesh: slag, slag: true, base: 1, phase: rng() * 6 });

  // --- Site B: the Gantry (south-east) ---
  const gantryMat = mat(0x2f7a70, { roughness: 0.6, metalness: 0.5 });
  box(scene, colliders, shootables, gantryMat, 20, 0, 13.5, 0.8, 7.5, 0.8);
  box(scene, colliders, shootables, gantryMat, 24, 0, 18.5, 0.8, 7.5, 0.8);
  const gantryBeam = box(scene, colliders, shootables, gantryMat, 22, 0, 16, 7.5, 0.8, 1.1);
  gantryBeam.position.y = 7.4;
  const hook = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.8, 1.4), mat(0xf0a830, { roughness: 0.5, metalness: 0.4 }));
  hook.position.set(22, 5.6, 16);
  hook.castShadow = true;
  scene.add(hook);
  animated.push({ mesh: hook, bob: true, baseY: 5.6, phase: rng() * 6 });
  // gantry strip lights under the beam
  const stripMat = mat(0x111111, { emissive: 0x2fd8c0, emissiveIntensity: 2.2 });
  const strip = new THREE.Mesh(new THREE.BoxGeometry(6.5, 0.08, 0.18), stripMat);
  strip.position.set(22, 6.9, 16);
  scene.add(strip);

  // --- mid connector hall: two walls with a gap, crates inside ---
  const midMat = mat(0x4a525c, { roughness: 0.85, metalness: 0.2, map: metalTexture('#4a525c') });
  box(scene, colliders, shootables, midMat, -6, 0, -2, 0.7, 3.0, 10);
  box(scene, colliders, shootables, midMat, 6, 0, -2, 0.7, 3.0, 10);
  box(scene, colliders, shootables, midMat, 0, 0, -7.5, 12.7, 3.0, 0.7);
  box(scene, colliders, shootables, midMat, -9.5, 0, 3.5, 0.7, 3.0, 7);
  box(scene, colliders, shootables, midMat, 9.5, 0, -7.5, 0.7, 3.0, 7);
  // warm strip lights on the hall walls so mid never goes black
  const hallStripMat = mat(0x111111, { emissive: 0xffc46b, emissiveIntensity: 2.0 });
  for (const [x, z, w] of [[-5.6, -2, 10], [5.6, -2, 10]]) {
    const hallStrip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, w), hallStripMat);
    hallStrip.position.set(x, 2.6, z);
    scene.add(hallStrip);
  }

  // --- cover: crates (1.1 m, crouch cover) and containers (2.4 m) ---
  const crateMat = mat(0x9a7844, { roughness: 0.9, map: containerTexture('#9a7844') });
  const crateMat2 = mat(0x52767e, { roughness: 0.9, map: containerTexture('#52767e') });
  const crateMat3 = mat(0x7d6496, { roughness: 0.9, map: containerTexture('#7d6496') });
  const crates = [
    [-14, 8, 2.2, crateMat], [-10, -12, 2.2, crateMat2], [-4, 10, 1.1, crateMat],
    [4, -12, 2.2, crateMat3], [10, 8, 1.1, crateMat], [14, -2, 2.2, crateMat2],
    [-26, 2, 1.1, crateMat3], [26, -6, 1.1, crateMat], [-20, 2, 2.2, crateMat2],
    [18, 6, 1.1, crateMat3], [-2, -14, 1.1, crateMat], [2, 14, 2.2, crateMat],
    [-28, -8, 2.2, crateMat], [28, 8, 2.2, crateMat2], [-12, -18, 1.1, crateMat3],
    [12, 18, 1.1, crateMat],
  ];
  for (const [x, z, h, material] of crates) {
    box(scene, colliders, shootables, material, x, 0, z, 2.2, h, 2.2);
  }
  // stacked crates (visual height, still one collider each)
  box(scene, colliders, shootables, crateMat2, -16, 0, -6, 2.2, 2.2, 2.2);
  const stacked = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 2.2), crateMat);
  stacked.position.set(-16, 2.75, -6);
  stacked.castShadow = true;
  scene.add(stacked);
  box(scene, colliders, shootables, crateMat3, 16, 0, 2, 2.2, 2.2, 2.2);
  const stacked2 = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 2.2), crateMat2);
  stacked2.position.set(16, 2.75, 2);
  stacked2.castShadow = true;
  scene.add(stacked2);

  // --- barrels (cylinders) ---
  const barrelMat = mat(0x9a5a34, { roughness: 0.75, metalness: 0.3, map: rustTexture() });
  for (const [x, z] of [[-6, 14], [-5, 13.2], [8, -14], [9, -13.2], [-24, 12], [24, -12]]) {
    cylinder(scene, colliders, shootables, barrelMat, x, z, 0.55, 1.1, 10);
  }
  // --- vent stacks with glowing tops (visual landmarks on the lanes) ---
  const ventMat = mat(0x3a4048, { roughness: 0.7, metalness: 0.5 });
  for (const [x, z] of [[-26, -6], [26, 4]]) {
    box(scene, colliders, shootables, ventMat, x, 0, z, 1.0, 3.2, 1.0);
    const ventGlow = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.12, 0.9),
      mat(0x111111, { emissive: 0xff7a1a, emissiveIntensity: 2.4 }),
    );
    ventGlow.position.set(x, 3.25, z);
    scene.add(ventGlow);
  }

  // --- chain-link fences (see-through, block movement, not bullets) ---
  const fenceMat = new THREE.MeshBasicMaterial({
    map: fenceTexture(), transparent: true, side: THREE.DoubleSide, depthWrite: false,
  });
  for (const [x, z, w] of [[-14, -20, 10], [14, 20, 10]]) {
    const fence = new THREE.Mesh(new THREE.PlaneGeometry(w, 2.6), fenceMat);
    fence.position.set(x, 1.3, z);
    scene.add(fence);
    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - 0.1, maxZ: z + 0.1, height: 2.6, noShoot: true });
  }

  // --- site markers: glowing rings + painted letters on the ground ---
  const sites = {
    A: { id: 'A', name: 'Kiln', position: new THREE.Vector3(-22, 0, -16), radius: 4.5 },
    B: { id: 'B', name: 'Gantry', position: new THREE.Vector3(22, 0, 16), radius: 4.5 },
  };
  for (const site of Object.values(sites)) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(site.radius - 0.35, site.radius, 40),
      new THREE.MeshBasicMaterial({ color: site.id === 'A' ? PALETTE.amber : PALETTE.teal, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.position.x, 0.03, site.position.z);
    scene.add(ring);
    const letter = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 3.4),
      new THREE.MeshBasicMaterial({ map: textTexture(site.id, site.id === 'A' ? '#f0a830' : '#2fb8a8', 'rgba(0,0,0,0)'), transparent: true, depthWrite: false }),
    );
    letter.rotation.x = -Math.PI / 2;
    letter.position.set(site.position.x, 0.04, site.position.z);
    scene.add(letter);
    animated.push({ mesh: ring, pulse: true, base: 0.55, phase: rng() * 6 });
  }

  // --- yard sign on the north wall ---
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 2.2),
    new THREE.MeshBasicMaterial({ map: textTexture('CINDERLINE', '#e9e6df', '#16191d', 512), transparent: false }),
  );
  sign.position.set(0, 2.4, -23.95);
  scene.add(sign);

  // --- distant skyline silhouettes (outside the walls, visual only) ---
  const skylineMat = mat(0x14181f, { roughness: 1 });
  for (let i = 0; i < 14; i += 1) {
    const w = 4 + rng() * 7;
    const h = 5 + rng() * 14;
    const x = -44 + rng() * 88;
    const z = rng() > 0.5 ? -34 - rng() * 6 : 34 + rng() * 6;
    const block = new THREE.Mesh(new THREE.BoxGeometry(w, h, 4), skylineMat);
    block.position.set(x, h / 2 - 0.5, z);
    scene.add(block);
  }
  // two lit windows on the skyline so it is not pure silhouette
  const windowMat = mat(0x111111, { emissive: 0xffc46b, emissiveIntensity: 1.6 });
  for (const [x, y, z] of [[-18, 6, -35], [12, 9, 35], [30, 5, -35]]) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.6, 0.1), windowMat);
    win.position.set(x, y, z);
    scene.add(win);
  }

  // --- drifting dust motes ---
  const dustCount = 260;
  const dustGeo = new THREE.BufferGeometry();
  const dustPos = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i += 1) {
    dustPos[i * 3] = (rng() * 2 - 1) * 32;
    dustPos[i * 3 + 1] = 0.3 + rng() * 6;
    dustPos[i * 3 + 2] = (rng() * 2 - 1) * 24;
  }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0xffc98a, size: 0.07, transparent: true, opacity: 0.55 }));
  scene.add(dust);

  const waypointMap = new Map(WAYPOINTS.map((w) => [w.id, w]));

  // Dijkstra over the waypoint graph (tiny graph: plain O(n^2) is fine).
  function findPath(fromId, toId) {
    if (fromId === toId) return [fromId];
    const dist = new Map([[fromId, 0]]);
    const prev = new Map();
    const done = new Set();
    for (;;) {
      let best = null;
      let bestD = Infinity;
      for (const [id, d] of dist) {
        if (!done.has(id) && d < bestD) { best = id; bestD = d; }
      }
      if (best === null) return [toId];
      if (best === toId) break;
      done.add(best);
      const node = waypointMap.get(best);
      for (const link of node.links) {
        const other = waypointMap.get(link);
        const d = bestD + Math.hypot(other.x - node.x, other.z - node.z);
        if (!dist.has(link) || d < dist.get(link)) {
          dist.set(link, d);
          prev.set(link, best);
        }
      }
    }
    const path = [toId];
    let cur = toId;
    while (prev.has(cur)) {
      cur = prev.get(cur);
      path.unshift(cur);
    }
    return path;
  }

  function nearestWaypoint(x, z) {
    let best = WAYPOINTS[0];
    let bestD = Infinity;
    for (const w of WAYPOINTS) {
      const d = (w.x - x) ** 2 + (w.z - z) ** 2;
      if (d < bestD) { bestD = d; best = w; }
    }
    return best.id;
  }

  // Circle (radius r) vs AABB colliders in the XZ plane. Pushes `pos` out along
  // the smallest penetration axis. Returns true when anything blocked.
  function collide(pos, radius) {
    let hit = false;
    for (const c of colliders) {
      if (pos.x + radius <= c.minX || pos.x - radius >= c.maxX) continue;
      if (pos.z + radius <= c.minZ || pos.z - radius >= c.maxZ) continue;
      const pushLeft = pos.x + radius - c.minX;
      const pushRight = c.maxX - (pos.x - radius);
      const pushBack = pos.z + radius - c.minZ;
      const pushFront = c.maxZ - (pos.z - radius);
      const min = Math.min(pushLeft, pushRight, pushBack, pushFront);
      if (min === pushLeft) pos.x = c.minX - radius;
      else if (min === pushRight) pos.x = c.maxX + radius;
      else if (min === pushBack) pos.z = c.minZ - radius;
      else pos.z = c.maxZ + radius;
      hit = true;
    }
    pos.x = Math.max(BOUNDS.minX + radius, Math.min(BOUNDS.maxX - radius, pos.x));
    pos.z = Math.max(BOUNDS.minZ + radius, Math.min(BOUNDS.maxZ - radius, pos.z));
    return hit;
  }

  // Line of sight between two points at eye height, blocked by colliders
  // (fences excluded: they are see-through) and by smoke (handled by caller).
  function hasLineOfSight(ax, ay, az, bx, by, bz) {
    V1.set(bx - ax, by - ay, bz - az);
    const length = V1.length();
    if (length < 0.01) return true;
    V1.multiplyScalar(1 / length);
    const steps = Math.ceil(length / 0.5);
    for (let i = 1; i < steps; i += 1) {
      const t = (i / steps) * length;
      const x = ax + V1.x * t;
      const y = ay + V1.y * t;
      const z = az + V1.z * t;
      if (y < 0 || y > 3.4) continue;
      for (const c of colliders) {
        if (c.noShoot) continue;
        if (c.height < y) continue;
        if (x > c.minX && x < c.maxX && z > c.minZ && z < c.maxZ) return false;
      }
    }
    return true;
  }

  function update(dt, time) {
    for (const item of animated) {
      if (item.pulse) {
        item.mesh.material.opacity = item.base + Math.sin(time * 1.6 + item.phase) * 0.18;
      } else if (item.bob) {
        item.mesh.position.y = item.baseY + Math.sin(time * 0.7 + item.phase) * 0.35;
      } else if (item.slag) {
        item.mesh.material.opacity = 0.92 + Math.sin(time * 2.2 + item.phase) * 0.08;
      } else {
        item.mesh.material.emissiveIntensity = item.base + Math.sin(time * 7 + item.phase) * 0.7;
      }
    }
    kilnLight.intensity = 80 + Math.sin(time * 6.3) * 10 + Math.sin(time * 13.7) * 5;
    slagLight.intensity = 18 + Math.sin(time * 3.1) * 4;
    dust.rotation.y = time * 0.004;
  }

  return {
    colliders,
    shootables,
    sites,
    spawns: {
      vanguard: [[-28, 18], [-26, 20], [-29, 15], [-24, 20], [-27, 12]],
      sentinel: [[28, -18], [26, -20], [29, -15], [24, -20], [27, -12]],
    },
    waypoints: WAYPOINTS,
    waypointMap,
    findPath,
    nearestWaypoint,
    collide,
    hasLineOfSight,
    update,
    bounds: BOUNDS,
  };
}
