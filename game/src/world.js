// world.js — the Smelter Yard: a 64 x 48 m foundry yard with two bomb sites,
// a molten slag channel, lanes, cover and a waypoint graph the bots navigate.
// All geometry is generated here from data tables; colliders are plain AABBs
// shared by the player and the bots, and by the bullet ray tests.
import * as THREE from 'three';
import { PALETTE, concreteTexture, metalTexture, hazardTexture, slagTexture, brickTexture, siteLetterTexture, starTexture, mat } from './palette.js';
import { mulberry32 } from './rng.js';

export const MAP = { x0: -32, x1: 32, z0: -24, z1: 24 };

// One solid box. y0 is the bottom, top is the top. Colliders are XZ footprints
// plus a top height; the ground plane itself is y = 0.
function boxCollider(x, z, w, d, top, y0 = 0) {
  return { x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, y0, top };
}

function addBox(scene, material, x, y, z, w, h, d, ry = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.castShadow = true;
  m.receiveShadow = true;
  scene.add(m);
  return m;
}

export function buildWorld(scene, seed) {
  const rnd = mulberry32(seed);
  const world = {
    colliders: [],
    waypoints: [],
    edges: [],
    spawns: { cinder: [], slag: [] },
    sites: [],
    slagMat: null,
    siteSprites: [],
    updateFns: [],
  };
  const addCollider = (c) => { world.colliders.push(c); return c; };

  // ---- sky, fog, lights -------------------------------------------------
  scene.background = new THREE.Color(PALETTE.skyTop);
  scene.fog = new THREE.FogExp2(PALETTE.fog, 0.011);
  scene.add(new THREE.AmbientLight(0x8a7fd0, 0.55));
  const hemi = new THREE.HemisphereLight(0x4a3a7a, 0x1a120c, 0.7);
  scene.add(hemi);
  const moon = new THREE.DirectionalLight(0xcfd8ff, 1.1);
  moon.position.set(-30, 42, -18);
  moon.castShadow = true;
  moon.shadow.mapSize.set(1024, 1024);
  moon.shadow.camera.left = -40; moon.shadow.camera.right = 40;
  moon.shadow.camera.top = 40; moon.shadow.camera.bottom = -40;
  moon.shadow.camera.far = 120;
  scene.add(moon);

  // Stars and a low moon disc.
  const starGeo = new THREE.BufferGeometry();
  const starPos = new Float32Array(420 * 3);
  for (let i = 0; i < 420; i++) {
    const a = rnd() * Math.PI * 2;
    const e = 0.12 + rnd() * 1.2;
    const r = 190;
    starPos[i * 3] = Math.cos(a) * Math.cos(e) * r;
    starPos[i * 3 + 1] = Math.sin(e) * r;
    starPos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
    size: 1.6, map: starTexture(), transparent: true, depthWrite: false, sizeAttenuation: false,
  }));
  scene.add(stars);
  const moonDisc = new THREE.Mesh(
    new THREE.CircleGeometry(7, 32),
    new THREE.MeshBasicMaterial({ color: 0xf3ead0, fog: false })
  );
  moonDisc.position.set(-95, 88, -120);
  moonDisc.lookAt(0, 0, 0);
  scene.add(moonDisc);

  // ---- ground ------------------------------------------------------------
  const groundTex = concreteTexture();
  groundTex.repeat.set(10, 8);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(72, 56),
    new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.95, metalness: 0.05 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // ---- slag channel (diagonal, emissive, animated) -----------------------
  const slagTex = slagTexture();
  slagTex.repeat.set(1, 7);
  const slagMat = new THREE.MeshStandardMaterial({
    map: slagTex, emissive: 0xff5a00, emissiveMap: slagTex, emissiveIntensity: 1.5,
    roughness: 0.4, metalness: 0.1,
  });
  world.slagMat = slagMat;
  const channel = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 58), slagMat);
  channel.rotation.x = -Math.PI / 2;
  channel.rotation.z = 0.42;
  channel.position.set(0, 0.04, 0);
  channel.receiveShadow = true;
  scene.add(channel);
  // Stone lips along the channel.
  const lipMat = mat(PALETTE.concreteDark, { roughness: 0.9 });
  for (const s of [-1, 1]) {
    const lip = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 58), lipMat);
    lip.position.set(s * 2.35, 0.12, 0);
    lip.rotation.y = 0.42;
    lip.receiveShadow = true;
    scene.add(lip);
  }
  const slagLight1 = new THREE.PointLight(0xff6a00, 60, 26, 1.8);
  slagLight1.position.set(-4, 2.2, -8);
  scene.add(slagLight1);
  const slagLight2 = new THREE.PointLight(0xff6a00, 60, 26, 1.8);
  slagLight2.position.set(5, 2.2, 9);
  scene.add(slagLight2);

  // ---- perimeter walls ---------------------------------------------------
  const wallMat = new THREE.MeshStandardMaterial({ map: concreteTexture(), roughness: 0.9, metalness: 0.08 });
  const wallH = 4.5, wallT = 1;
  const walls = [
    { x: 0, z: -24.5, w: 66, d: wallT }, { x: 0, z: 24.5, w: 66, d: wallT },
    { x: -32.5, z: 0, w: wallT, d: 50 }, { x: 32.5, z: 0, w: wallT, d: 50 },
  ];
  for (const w of walls) {
    addBox(scene, wallMat, w.x, wallH / 2, w.z, w.w, wallH, w.d);
    addCollider(boxCollider(w.x, w.z, w.w, w.d, wallH));
  }
  // Hazard stripe caps on the perimeter.
  const hz = new THREE.MeshStandardMaterial({ map: hazardTexture(), roughness: 0.8 });
  for (const w of walls) {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(w.w, 0.35, w.d + 0.06), hz);
    cap.position.set(w.x, wallH + 0.17, w.z);
    scene.add(cap);
  }

  // ---- Kiln (site A, west) ----------------------------------------------
  const kiln = new THREE.Mesh(
    new THREE.CylinderGeometry(3.2, 3.6, 5, 20),
    new THREE.MeshStandardMaterial({ map: brickTexture(), roughness: 0.95 })
  );
  kiln.position.set(-29.5, 2.5, -3);
  kiln.castShadow = true; kiln.receiveShadow = true;
  scene.add(kiln);
  const chimney = new THREE.Mesh(
    new THREE.CylinderGeometry(0.9, 1.1, 9, 12),
    new THREE.MeshStandardMaterial({ map: brickTexture(), roughness: 0.95 })
  );
  chimney.position.set(-30.5, 4.5, -7.5);
  chimney.castShadow = true;
  scene.add(chimney);
  // Kiln mouth: dark opening with a hot glow.
  const mouth = new THREE.Mesh(
    new THREE.CircleGeometry(1.6, 20),
    new THREE.MeshStandardMaterial({ color: 0x1a0a05, emissive: 0xff5a00, emissiveIntensity: 1.8 })
  );
  mouth.position.set(-26.2, 1.6, -3);
  mouth.rotation.y = Math.PI / 2;
  scene.add(mouth);
  addCollider(boxCollider(-29.5, -3, 7, 7, 5));
  addCollider(boxCollider(-30.5, -7.5, 2.4, 2.4, 9));
  const kilnLight = new THREE.PointLight(0xff7a20, 40, 18, 1.8);
  kilnLight.position.set(-25, 2, -3);
  scene.add(kilnLight);

  // ---- Gantry (site B, east) ---------------------------------------------
  const steel = new THREE.MeshStandardMaterial({ map: metalTexture(), roughness: 0.55, metalness: 0.6 });
  addBox(scene, steel, 24, 3, -4, 0.9, 6, 0.9);
  addBox(scene, steel, 24, 3, 4, 0.9, 6, 0.9);
  addBox(scene, steel, 24, 6.2, 0, 1.1, 0.9, 9.6);
  const hook = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 1.4, 1.4),
    new THREE.MeshStandardMaterial({ color: 0xe8b400, roughness: 0.5, metalness: 0.4 })
  );
  hook.position.set(24, 4.6, -1);
  hook.castShadow = true;
  scene.add(hook);
  addCollider(boxCollider(24, -4, 1.2, 1.2, 6));
  addCollider(boxCollider(24, 4, 1.2, 1.2, 6));
  // Shipping containers near B.
  addBox(scene, new THREE.MeshStandardMaterial({ color: 0x2e6f6a, roughness: 0.6, metalness: 0.4 }), 29, 1.3, 6, 5, 2.6, 2.4);
  addCollider(boxCollider(29, 6, 5, 2.4, 2.6));
  addBox(scene, new THREE.MeshStandardMaterial({ color: 0x8a4a26, roughness: 0.6, metalness: 0.4 }), 28.5, 1.3, -8, 5, 2.6, 2.4);
  addCollider(boxCollider(28.5, -8, 5, 2.4, 2.6));
  const gantryLight = new THREE.PointLight(0xffd9a0, 30, 16, 1.8);
  gantryLight.position.set(24, 5, 0);
  scene.add(gantryLight);

  // ---- interior walls: lanes and corners ---------------------------------
  const innerWalls = [
    { x: -8, z: -10, w: 12, d: 0.8 },   // north-mid
    { x: 8, z: 10, w: 12, d: 0.8 },     // south-mid
    { x: -20, z: -13, w: 0.8, d: 14 },  // west vertical
    { x: 20, z: 13, w: 0.8, d: 14 },    // east vertical
    { x: -14, z: 16, w: 10, d: 0.8 },   // south-west
    { x: 14, z: -16, w: 10, d: 0.8 },   // north-east
  ];
  for (const w of innerWalls) {
    addBox(scene, wallMat, w.x, 1.5, w.z, w.w, 3, w.d);
    addCollider(boxCollider(w.x, w.z, w.w, w.d, 3));
  }

  // ---- crates: cover that doubles as step-up geometry --------------------
  const crateMat = new THREE.MeshStandardMaterial({ map: metalTexture(), roughness: 0.6, metalness: 0.5 });
  const crateMat2 = new THREE.MeshStandardMaterial({ color: 0x6b5a34, roughness: 0.8, metalness: 0.2 });
  const crates = [
    // x, z, w, h, d, material
    [-4, 2, 1.4, 1.2, 1.4, 0], [4, -2, 1.4, 1.2, 1.4, 0],
    [-10, 6, 2.4, 1.2, 1.2, 1], [10, -6, 2.4, 1.2, 1.2, 1],
    [0, -14, 1.4, 1.2, 1.4, 0], [0, 14, 1.4, 1.2, 1.4, 0],
    [-16, -2, 1.4, 2.4, 1.4, 0], [16, 2, 1.4, 2.4, 1.4, 0],
    [-24, 8, 2.4, 1.2, 1.2, 1], [24, -8, 2.4, 1.2, 1.2, 1],
    [-8, -18, 1.4, 1.2, 1.4, 0], [8, 18, 1.4, 1.2, 1.4, 0],
    [-2, -6, 1.4, 1.2, 1.4, 1], [2, 6, 1.4, 1.2, 1.4, 1],
    [-26, 12, 2.4, 1.2, 1.2, 0], [26, -12, 2.4, 1.2, 1.2, 0],
    [12, 18, 1.4, 2.4, 1.4, 1], [-12, -18, 1.4, 2.4, 1.4, 1],
  ];
  for (const [x, z, w, h, d, m] of crates) {
    addBox(scene, m === 0 ? crateMat : crateMat2, x, h / 2, z, w, h, d);
    addCollider(boxCollider(x, z, w, d, h));
  }

  // ---- sites --------------------------------------------------------------
  world.sites = [
    { index: 0, name: 'Kiln', letter: 'A', x: -25, z: 1, r: 4.5 },
    { index: 1, name: 'Gantry', letter: 'B', x: 25, z: -1, r: 4.5 },
  ];
  for (const s of world.sites) {
    // Painted circle on the ground.
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(s.r - 0.35, s.r, 40),
      new THREE.MeshBasicMaterial({ color: PALETTE.cinder, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(s.x, 0.05, s.z);
    scene.add(ring);
    // Floating letter sprite.
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({
      map: siteLetterTexture(s.letter), transparent: true, depthWrite: false,
    }));
    spr.scale.set(3.2, 3.2, 1);
    spr.position.set(s.x, 4.6, s.z);
    scene.add(spr);
    world.siteSprites.push(spr);
    const siteLight = new THREE.PointLight(0xf59e0b, 14, 12, 1.8);
    siteLight.position.set(s.x, 3.2, s.z);
    scene.add(siteLight);
  }

  // ---- spawns ---------------------------------------------------------------
  world.spawns.cinder = [
    { x: -6, z: 21, yaw: 0 }, { x: -2, z: 21, yaw: 0 }, { x: 2, z: 21, yaw: 0 },
    { x: 6, z: 21, yaw: 0 }, { x: 0, z: 18, yaw: 0 },
  ];
  world.spawns.slag = [
    { x: -6, z: -21, yaw: Math.PI }, { x: -2, z: -21, yaw: Math.PI },
    { x: 2, z: -21, yaw: Math.PI }, { x: 6, z: -21, yaw: Math.PI },
    { x: 0, z: -18, yaw: Math.PI },
  ];

  // ---- waypoints: hand-placed nodes, edges by distance + line of sight -----
  const nodes = [
    [0, 20], [-8, 19], [8, 19],           // attacker spawn
    [0, -20], [-8, -19], [8, -19],        // defender spawn
    [0, 10], [0, 0], [0, -10],            // mid spine
    [-6, 4], [6, -4], [-12, 0], [12, 0],  // mid cross
    [-16, 14], [-22, 8], [-25, 1], [-20, -8], [-16, -14], // west lane + A
    [16, -14], [22, -8], [25, -1], [20, 8], [16, 14],     // east lane + B
    [-8, -14], [8, 14], [-26, -10], [26, 10],
  ];
  world.waypoints = nodes.map(([x, z]) => ({ x, z }));
  const blocked2D = (x1, z1, x2, z2) => segmentBlocked(x1, z1, x2, z2, world.colliders, 1.4);
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const dx = nodes[i][0] - nodes[j][0];
      const dz = nodes[i][1] - nodes[j][1];
      const d = Math.hypot(dx, dz);
      if (d < 11.5 && !blocked2D(nodes[i][0], nodes[i][1], nodes[j][0], nodes[j][1])) {
        world.edges.push([i, j, d]);
      }
    }
  }
  return world;
}

// ---- collision, line-of-sight and ray helpers ------------------------------

// 2D segment vs AABB: true when the segment crosses a collider taller than
// minTop (low crates do not block sight or bullets at eye height).
export function segmentBlocked(x1, z1, x2, z2, colliders, minTop) {
  for (const c of colliders) {
    if (c.top < minTop) continue;
    if (segHitsBox(x1, z1, x2, z2, c)) return true;
  }
  return false;
}

function segHitsBox(x1, z1, x2, z2, c) {
  const dx = x2 - x1, dz = z2 - z1;
  let t0 = 0, t1 = 1;
  // X slab
  if (Math.abs(dx) < 1e-9) {
    if (x1 < c.x0 || x1 > c.x1) return false;
  } else {
    let a = (c.x0 - x1) / dx, b = (c.x1 - x1) / dx;
    if (a > b) { const t = a; a = b; b = t; }
    if (a > t0) t0 = a;
    if (b < t1) t1 = b;
    if (t0 > t1) return false;
  }
  // Z slab
  if (Math.abs(dz) < 1e-9) {
    if (z1 < c.z0 || z1 > c.z1) return false;
  } else {
    let a = (c.z0 - z1) / dz, b = (c.z1 - z1) / dz;
    if (a > b) { const t = a; a = b; b = t; }
    if (a > t0) t0 = a;
    if (b < t1) t1 = b;
    if (t0 > t1) return false;
  }
  return true;
}

// Ray vs the world's boxes (3D slab test). Returns the nearest hit distance
// or Infinity. The ground plane (y=0) is tested separately by the caller.
export function rayVsWorld(ox, oy, oz, dx, dy, dz, maxDist, colliders) {
  let best = maxDist;
  for (const c of colliders) {
    const t = rayVsBox(ox, oy, oz, dx, dy, dz, c.x0, c.y0, c.z0, c.x1, c.top, c.z1);
    if (t >= 0 && t < best) best = t;
  }
  // Ground plane.
  if (dy < -1e-9) {
    const t = -oy / dy;
    if (t >= 0 && t < best) best = t;
  }
  return best;
}

export function rayVsBox(ox, oy, oz, dx, dy, dz, x0, y0, z0, x1, y1, z1) {
  let t0 = 0, t1 = Infinity;
  const axes = [[ox, dx, x0, x1], [oy, dy, y0, y1], [oz, dz, z0, z1]];
  for (const [o, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-12) {
      if (o < lo || o > hi) return -1;
    } else {
      let a = (lo - o) / d, b = (hi - o) / d;
      if (a > b) { const t = a; a = b; b = t; }
      if (a > t0) t0 = a;
      if (b < t1) t1 = b;
      if (t0 > t1) return -1;
    }
  }
  return t0;
}

// Move a fighter (player or bot) with acceleration already applied to vx/vz:
// gravity, ground + box-top landing, and horizontal push-out against boxes.
// p: {x,y,z,vx,vy,vz,onGround,crouch}. height is 1.7 standing, 1.1 crouched.
export function moveBody(p, dt, colliders, radius = 0.35) {
  // Vertical: gravity, then land on ground or box tops.
  p.vy -= 22 * dt;
  let ny = p.y + p.vy * dt;
  p.onGround = false;
  if (ny <= 0) { ny = 0; p.vy = 0; p.onGround = true; }
  else {
    for (const c of colliders) {
      if (p.x > c.x0 - radius && p.x < c.x1 + radius && p.z > c.z0 - radius && p.z < c.z1 + radius) {
        if (p.y >= c.top - 0.35 && ny <= c.top && p.vy <= 0) {
          ny = c.top; p.vy = 0; p.onGround = true;
        }
      }
    }
  }
  p.y = ny;
  // Horizontal, axis by axis so the fighter slides along walls.
  const h = p.crouch ? 1.1 : 1.7;
  let nx = p.x + p.vx * dt;
  for (const c of colliders) {
    if (c.top <= p.y + 0.25) continue; // step onto low boxes is handled by landing
    if (nx > c.x0 - radius && nx < c.x1 + radius && p.z > c.z0 - radius && p.z < c.z1 + radius
      && p.y + h > c.y0 && p.y < c.top) {
      nx = p.vx > 0 ? c.x0 - radius : c.x1 + radius;
      p.vx = 0;
    }
  }
  p.x = nx;
  let nz = p.z + p.vz * dt;
  for (const c of colliders) {
    if (c.top <= p.y + 0.25) continue;
    if (p.x > c.x0 - radius && p.x < c.x1 + radius && nz > c.z0 - radius && nz < c.z1 + radius
      && p.y + h > c.y0 && p.y < c.top) {
      nz = p.vz > 0 ? c.z0 - radius : c.z1 + radius;
      p.vz = 0;
    }
  }
  p.z = nz;
  // Keep inside the yard.
  p.x = Math.max(MAP.x0 + 0.5, Math.min(MAP.x1 - 0.5, p.x));
  p.z = Math.max(MAP.z0 + 0.5, Math.min(MAP.z1 - 0.5, p.z));
}

export function nearestWaypoint(world, x, z) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < world.waypoints.length; i++) {
    const w = world.waypoints[i];
    const d = (w.x - x) * (w.x - x) + (w.z - z) * (w.z - z);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

// Per-frame world animation: slag flow and site-marker bobbing.
export function updateWorld(world, t) {
  if (world.slagMat && world.slagMat.map) world.slagMat.map.offset.y = (t * 0.12) % 1;
  for (let i = 0; i < world.siteSprites.length; i++) {
    world.siteSprites[i].position.y = 4.6 + Math.sin(t * 1.4 + i * 2.1) * 0.18;
  }
}
