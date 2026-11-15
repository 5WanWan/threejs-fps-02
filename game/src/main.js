// main.js — bootstrap and the fixed-step game loop.
// The simulation runs at 60 Hz in simStep, apart from rendering: update the
// player, the bots, grenades and the objective, drain the event queue (sounds,
// banners, killfeed), then render. No per-frame allocation in the loop.
import * as THREE from 'three';
import { createState, createFighter, PHASE, SIDE, ROUND_TIME } from './state.js';
import { buildWorld, updateWorld } from './world.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createEffects } from './effects.js';
import { updatePlayer, bindPlayerKeys } from './player.js';
import { makeBotAI, updateBot, botNames } from './bots.js';
import { createGrenades, updateGrenades, shoot } from './combat.js';
import { tickObjective, startMatch, noteDefused, aliveCount } from './objective.js';
import { createHud } from './hud.js';
import { buyItem, BUY_ITEMS, WEAPONS } from './weapons.js';
import { mulberry32, clamp, damp } from './rng.js';

const STEP = 1 / 60;
const params = new URLSearchParams(location.search);
const SHOT = params.get('shot');
const SEED = parseInt(params.get('seed') || '20261115', 10);

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.08, 400);

const state = createState(SEED);
state.shotMode = SHOT;
const rnd = mulberry32(SEED);
const world = buildWorld(scene, SEED);
const input = createInput(canvas);
const audio = createAudio();
const fx = createEffects(scene);
const grenades = createGrenades();

// ---- fighters ---------------------------------------------------------------
const player = createFighter(0, 'YOU', SIDE.CINDER, 0, 21, 0, true);
state.entities.push(player);
const namesC = botNames(SIDE.CINDER);
const namesS = botNames(SIDE.SLAG);
for (let i = 0; i < 4; i++) {
  const s = world.spawns.cinder[(i + 1) % 5];
  const b = createFighter(i + 1, namesC[i], SIDE.CINDER, s.x, s.z, s.yaw, false);
  makeBotAI(b, 'push', i % 2, rnd);
  state.entities.push(b);
}
for (let i = 0; i < 5; i++) {
  const s = world.spawns.slag[i];
  const b = createFighter(5 + i, namesS[i], SIDE.SLAG, s.x, s.z, s.yaw, false);
  makeBotAI(b, i < 2 ? 'defend' : 'hold', i % 2, rnd);
  state.entities.push(b);
}
// The charge starts with the player; one Cinder bot is the backup carrier.
state.charge.carrier = player;

// ---- fighter meshes -----------------------------------------------------------
const BODY_COLORS = [0xf59e0b, 0xef4444];
function buildFighterMesh(f) {
  const g = new THREE.Group();
  const trim = BODY_COLORS[f.side];
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2c2f38, roughness: 0.8, metalness: 0.2 });
  const trimMat = new THREE.MeshStandardMaterial({ color: trim, roughness: 0.5, metalness: 0.3, emissive: trim, emissiveIntensity: 0.35 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xc9a06a, roughness: 0.9 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.3), bodyMat);
  body.position.y = 1.05; body.castShadow = true;
  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.2, 0.32), trimMat);
  chest.position.y = 1.22;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.3, 0.32), skinMat);
  head.position.y = 1.56; head.castShadow = true;
  const helm = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.12, 0.36), trimMat);
  helm.position.y = 1.72;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.85), new THREE.MeshStandardMaterial({ color: 0x14151a, roughness: 0.4, metalness: 0.7 }));
  gun.position.set(0.18, 1.18, -0.35);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.62, 0.24), bodyMat);
  legL.position.set(-0.14, 0.31, 0);
  const legR = legL.clone();
  legR.position.x = 0.14;
  g.add(body, chest, head, helm, gun, legL, legR);
  g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  scene.add(g);
  f.mesh = g; f.bodyMesh = body; f.headMesh = head; f.gunMesh = gun;
  return g;
}
for (const e of state.entities) {
  if (!e.isPlayer) buildFighterMesh(e);
}

// First-person viewmodel: a rifle the camera carries, with a muzzle tip.
const viewGun = new THREE.Group();
const vmBody = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.62), new THREE.MeshStandardMaterial({ color: 0x1c1e24, roughness: 0.35, metalness: 0.75 }));
const vmBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.34, 8), new THREE.MeshStandardMaterial({ color: 0x0c0d10, roughness: 0.3, metalness: 0.8 }));
vmBarrel.rotation.x = Math.PI / 2;
vmBarrel.position.set(0, 0.02, -0.45);
const vmSight = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.07, 0.12), new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.4, metalness: 0.6 }));
vmSight.position.set(0, 0.1, -0.12);
viewGun.add(vmBody, vmBarrel, vmSight);
viewGun.position.set(0.26, -0.24, -0.55);
camera.add(viewGun);
scene.add(camera);
// Muzzle flash light for the viewmodel.
const flashLight = new THREE.PointLight(0xffc46b, 0, 6, 2);
flashLight.position.set(0.26, -0.18, -1.1);
camera.add(flashLight);

// ---- HUD ----------------------------------------------------------------------
const hud = createHud(state, world, {
  buy: (item) => {
    const p = state.entities[0];
    if (state.phase !== PHASE.BUY) return;
    if (buyItem(p, item)) { audio.buy(); hud.renderBuy(); }
    else audio.denied();
  },
});
hud.showStart();

// ---- input wiring ---------------------------------------------------------------
bindPlayerKeys(input);
const playerKey = input.onKey;
input.onKey = (code, down) => {
  if (playerKey) playerKey(code, down);
  if (!down) return;
  if (code === 'KeyB' && (state.phase === PHASE.BUY || state.phase === PHASE.LIVE)) {
    if (hud.buyMenu.classList.contains('open')) {
      hud.setBuyOpen(false);
      input.requestLock();
    } else if (state.phase === PHASE.BUY) {
      hud.setBuyOpen(true);
      input.releaseLock();
    }
  }
  if (code === 'KeyR' && state.phase === PHASE.MATCH_END) restartMatch();
  if (code === 'Digit1' || code === 'Digit2' || code === 'Digit3' || code === 'Digit4'
    || code === 'Digit5' || code === 'Digit6' || code === 'Digit7' || code === 'Digit8') {
    if (state.phase === PHASE.BUY) {
      const item = BUY_ITEMS.find((b) => b.key === code.slice(-1));
      if (item) {
        const p = state.entities[0];
        if (buyItem(p, item)) { audio.buy(); hud.renderBuy(); }
        else audio.denied();
      }
    }
  }
};

document.getElementById('play-btn').addEventListener('click', () => {
  audio.init();
  hud.hideStart();
  startMatch(state, world);
  hud.setBuyOpen(true);
  hud.showBanner('ROUND 1 — BUY PHASE', 'B to deploy · 1-8 to buy · E plants the charge', 4);
});
document.getElementById('again-btn').addEventListener('click', restartMatch);

function restartMatch() {
  audio.init();
  hud.hideStart();
  hud.endOverlay.classList.add('hidden');
  startMatch(state, world);
  hud.setBuyOpen(true);
}

// ---- simulation ------------------------------------------------------------------
let simTime = 0;
let shownKills = 0;
let specTarget = null;

function simStep(dt) {
  const now = simTime;
  if (state.phase === PHASE.LIVE || state.phase === PHASE.BUY) {
    updatePlayer(state, world, fx, grenades, input, audio, dt, now);
    for (let i = 1; i < state.entities.length; i++) {
      updateBot(state, world, fx, grenades, state.entities[i], dt, now, rnd);
    }
    updateGrenades(state, world, fx, grenades, dt, now);
  }
  tickObjective(state, world, dt, now);
  updateWorld(world, now);
  fx.update(dt, now);
  drainEvents(now);
  simTime += dt;
}

function drainEvents(now) {
  // Killfeed entries, in order.
  while (shownKills < state.killfeed.length) {
    const k = state.killfeed[shownKills++];
    hud.addKillfeed(k.text, k.cls, now);
  }
  for (const ev of state.events) {
    if (ev.type === 'shot') {
      if (!ev.shooter.isPlayer) {
        const d = Math.hypot(ev.x - player.x, ev.z - player.z);
        if (d < 48) audio.shot(ev.sound || 'rifle');
      }
    } else if (ev.type === 'death') {
      if (ev.target.isPlayer) {
        state._playerDied = true;
        audio.hurt();
        specTarget = null;
      } else if (ev.attacker && ev.attacker.isPlayer) {
        audio.kill();
      }
      if (ev.target.isPlayer && ev.attacker) {
        const ang = Math.atan2(-(ev.attacker.x - player.x), -(ev.attacker.z - player.z)) - player.yaw;
        hud.flashDamage(ang);
      }
    } else if (ev.type === 'playerHit') {
      hud.flashHit(ev.head);
    } else if (ev.type === 'planted') {
      audio.planted();
      hud.showBanner('CORE CHARGE PLANTED', 'Defend it — detonation in 40s', 3);
    } else if (ev.type === 'defused') {
      noteDefused(state);
      hud.showBanner('CHARGE DEFUSED', 'Slag takes the round', 3);
    } else if (ev.type === 'detonation') {
      fx.explosion(ev.x, ev.y, ev.z);
      audio.explosion();
      fx.addShake(1);
    } else if (ev.type === 'explosion') {
      audio.explosion();
      fx.addShake(0.7);
    } else if (ev.type === 'flash') {
      if (now < player.flashUntil && player.flashStrength > 0.3) audio.flash();
    } else if (ev.type === 'roundEnd') {
      const won = ev.winner === 0;
      hud.showBanner(won ? 'CINDER WINS THE ROUND' : 'SLAG WINS THE ROUND', ev.reason, 3.5);
      if (won) audio.roundWin(); else audio.roundLose();
      hud.setBuyOpen(false);
    } else if (ev.type === 'roundStart') {
      hud.showBanner(`ROUND ${ev.round} — BUY PHASE`, 'B to deploy · 1-8 to buy', 3);
      hud.setBuyOpen(true);
    } else if (ev.type === 'live') {
      hud.showBanner('GO', state.charge.carrier === player ? 'You carry the charge — plant at Kiln or Gantry' : 'Push a site and cover the carrier', 2.5);
      hud.setBuyOpen(false);
      if (player.alive) input.requestLock();
    }
  }
  state.events.length = 0;
}

// ---- camera + fighter mesh sync -----------------------------------------------------
function syncVisuals(now) {
  const p = player;
  if (p.alive) {
    const eyeH = p.crouch ? 1.05 : 1.55;
    camera.position.set(p.x, p.y + eyeH, p.z);
    let fov = 75;
    if (p.ads) {
      const w = WEAPONS[p.weapon];
      fov = w.scoped ? 30 : 58;
    }
    camera.fov = damp(camera.fov, fov, 10, 1 / 60);
    camera.updateProjectionMatrix();
    camera.rotation.order = 'YXZ';
    camera.rotation.y = p.yaw + fx.shakeX * 0.3;
    camera.rotation.x = p.pitch + p.recoil + fx.shakeY * 0.3;
    camera.rotation.z = 0;
    // Viewmodel bob and ADS tuck.
    const bob = Math.sin(now * 9) * 0.008 * p.moveAmount;
    viewGun.position.set(
      damp(viewGun.position.x, p.ads ? 0 : 0.26, 12, 1 / 60),
      -0.24 + bob - (p.ads ? 0.02 : 0),
      -0.55
    );
    flashLight.intensity = Math.max(0, flashLight.intensity - 60 * (1 / 60));
    if (now - p.lastShot < 0.05) flashLight.intensity = 14;
  } else {
    // Spectate a random alive teammate.
    if (!specTarget || !specTarget.alive) {
      const mates = state.entities.filter((e) => e.alive && e.side === 0 && !e.isPlayer);
      specTarget = mates.length ? mates[(Math.random() * mates.length) | 0] : null;
    }
    if (specTarget) {
      camera.position.set(specTarget.x, specTarget.y + 1.55, specTarget.z);
      camera.rotation.order = 'YXZ';
      camera.rotation.y = specTarget.yaw;
      camera.rotation.x = specTarget.pitch;
    }
  }
  // Bot meshes follow their fighters; the dead fall over.
  for (let i = 1; i < state.entities.length; i++) {
    const e = state.entities[i];
    if (!e.mesh) continue;
    e.mesh.position.set(e.x, e.y, e.z);
    e.mesh.rotation.y = e.yaw;
    if (e.alive) {
      e.mesh.rotation.x = 0;
      e.mesh.visible = true;
      e.mesh.scale.y = e.crouch ? 0.72 : 1;
    } else {
      e.mesh.rotation.x = -Math.PI / 2 + 0.12;
      e.mesh.position.y = Math.max(0, e.y + 0.1);
      e.mesh.scale.y = 1;
    }
  }
  // Flash overlay for the player.
  const flashEl = document.getElementById('flash');
  if (now < p.flashUntil) {
    const k = clamp((p.flashUntil - now) / 3, 0, 1) * p.flashStrength;
    flashEl.style.opacity = (k * 0.95).toFixed(2);
  } else flashEl.style.opacity = '0';
}

// ---- screenshot staging -------------------------------------------------------------
function stageShot(name) {
  if (name === 'start') {
    player.x = 0; player.z = 19; player.yaw = 0.15; player.pitch = 0.02;
    return;
  }
  if (name === 'buy') {
    startMatch(state, world);
    hud.hideStart();
    hud.setBuyOpen(true);
    player.x = 0; player.z = 19; player.yaw = 0.1;
    return;
  }
  if (name === 'play') {
    startMatch(state, world);
    hud.hideStart();
    state.phase = PHASE.LIVE;
    state.timeLeft = ROUND_TIME;
    player.x = 2; player.z = 10; player.yaw = -0.12; player.pitch = 0.01;
    player.weapon = 'ar77';
    player.weapons.ar77 = { mag: 30, reserve: 90 };
    player.money = 2400;
    // Two enemies staged in the lane ahead, mid-stride.
    const e1 = state.entities[5];
    const e2 = state.entities[6];
    e1.x = 1; e1.z = -4; e1.yaw = Math.PI; e1.alive = true;
    e2.x = 6; e2.z = -8; e2.yaw = Math.PI - 0.4; e2.alive = true;
    state._autoFire = true;
    state._stageBeam = true;
    return;
  }
  if (name === 'end') {
    startMatch(state, world);
    hud.hideStart();
    state.phase = PHASE.ROUND_END;
    state.roundWinner = 0;
    state.roundReason = 'Core Charge detonated at Kiln';
    state.score = [1, 0];
    hud.showBanner('CINDER WINS THE ROUND', 'Core Charge detonated at Kiln', 30);
    player.x = -8; player.z = 12; player.yaw = 0.5; player.pitch = 0.05;
    fx.explosion(-25, 1, 1);
    return;
  }
}

// Staged beam for the play screenshot: a persistent tracer from the muzzle
// to the nearest staged enemy, drawn while staging is active.
let stageBeam = null;
function updateStageBeam() {
  if (!state._stageBeam) return;
  if (!stageBeam) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    stageBeam = new THREE.Line(geo, new THREE.LineBasicMaterial({
      color: 0xffd27a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending,
    }));
    stageBeam.frustumCulled = false;
    scene.add(stageBeam);
  }
  const e = state.entities[5];
  const pos = stageBeam.geometry.attributes.position.array;
  const eyeH = player.crouch ? 1.05 : 1.55;
  pos[0] = player.x; pos[1] = player.y + eyeH - 0.1; pos[2] = player.z;
  pos[3] = e.x; pos[4] = e.y + 1.2; pos[5] = e.z;
  stageBeam.geometry.attributes.position.needsUpdate = true;
}

// Auto-fire during the play staging so muzzle flashes show in the shot.
let _autoFireAt = 0;
function stageAutoFire(now) {
  if (!state._autoFire || !player.alive) return;
  if (now - _autoFireAt > 0.45) {
    _autoFireAt = now;
    const w = WEAPONS[player.weapon];
    const slot = player.weapons[player.weapon];
    if (slot.mag > 0 && now - player.lastShot >= w.rate) {
      player.spread = w.spread;
      shoot(state, world, fx, player, simTime);
    }
  }
}

// ---- main loop ------------------------------------------------------------------------
let last = performance.now();
let acc = 0;
function frame(nowMs) {
  requestAnimationFrame(frame);
  const dtMs = Math.min(100, nowMs - last);
  last = nowMs;
  acc += (dtMs / 1000) * state.timeScale;
  let steps = 0;
  while (acc >= STEP && steps < 5) {
    if (state.phase !== PHASE.MENU && state.phase !== PHASE.MATCH_END) simStep(STEP);
    else { updateWorld(world, simTime); fx.update(STEP, simTime); simTime += STEP; }
    acc -= STEP;
    steps++;
  }
  if (steps === 5) acc = 0;
  const now = simTime;
  if (state._autoFire) stageAutoFire(now);
  updateStageBeam();
  syncVisuals(now);
  hud.update(now);
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Debug hook for the maker's own play-tests (used by the screenshot script).
window.__cinder = {
  state, world, player,
  fire() {
    const w = WEAPONS[player.weapon];
    player.spread = w.spread;
    shoot(state, world, fx, player, simTime);
  },
  stage: stageShot,
};

if (SHOT) stageShot(SHOT);
requestAnimationFrame(frame);
