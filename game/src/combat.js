// combat.js — hitscan shooting, damage, and thrown grenades.
// Bullets are rays: walls stop them (rayVsWorld), bodies are a body sphere plus
// a head sphere, so headshots pay double. Grenades are simple ballistic bodies
// with a fuse, bounced off the ground and walls.
import * as THREE from 'three';
import { weaponOf, GRENADES } from './weapons.js';
import { rayVsWorld, rayVsBox } from './world.js';
import { V1, V2, V3 } from './tmp.js';
import { clamp } from './rng.js';

const BODY_R = 0.42;   // body sphere radius around the chest
const HEAD_R = 0.26;   // head sphere radius
const EYE_H = 1.55;    // eye height standing
const CROUCH_EYE = 1.05;

export function eyeHeight(f) { return f.crouch ? CROUCH_EYE : EYE_H; }

// Direction a fighter is looking, from yaw/pitch (reused vectors, no alloc).
export function lookDir(f, out) {
  const cp = Math.cos(f.pitch);
  out.set(-Math.sin(f.yaw) * cp, Math.sin(f.pitch), -Math.cos(f.yaw) * cp);
  return out;
}

export function muzzlePos(f, out) {
  lookDir(f, V3);
  const h = eyeHeight(f);
  out.set(f.x + V3.x * 0.6, f.y + h - 0.12, f.z + V3.z * 0.6);
  return out;
}

// Ray vs a fighter's two spheres. Returns {t, head} or null.
function rayVsFighter(ox, oy, oz, dx, dy, dz, target) {
  let best = null;
  const h = target.crouch ? 1.0 : 1.45;
  // body sphere at chest
  const tBody = rayVsSphere(ox, oy, oz, dx, dy, dz, target.x, target.y + h - 0.35, target.z, BODY_R);
  if (tBody >= 0) best = { t: tBody, head: false };
  // head sphere
  const tHead = rayVsSphere(ox, oy, oz, dx, dy, dz, target.x, target.y + h + 0.28, target.z, HEAD_R);
  if (tHead >= 0 && (!best || tHead < best.t)) best = { t: tHead, head: true };
  return best;
}

function rayVsSphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const lx = cx - ox, ly = cy - oy, lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  if (tca < 0) return -1;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  const r2 = r * r;
  if (d2 > r2) return -1;
  const thc = Math.sqrt(r2 - d2);
  return tca - thc;
}

// Fire one hitscan shot from `shooter`. Returns a hit record for the caller
// (killfeed, sounds, HUD) or null when nothing was hit. Spread is applied by
// the caller through the shooter's current spread value.
export function shoot(state, world, fx, shooter, now) {
  const w = weaponOf(shooter);
  const slot = shooter.weapons[shooter.weapon];
  if (!slot || slot.mag <= 0) return { kind: 'dry' };
  slot.mag--;
  shooter.lastShot = now;
  if (shooter.isPlayer) state.stats.shots++;

  const origin = muzzlePos(shooter, V1);
  const dir = lookDir(shooter, V2);
  // Spread: random cone around the aim direction (recoil + movement already
  // folded into shooter.spread by the caller).
  const sp = shooter.spread * (Math.PI / 180);
  const a = Math.random() * Math.PI * 2;
  const r = (Math.random() + Math.random()) * 0.5 * sp;
  // Build an orthonormal basis around dir without allocating.
  const ux = Math.abs(dir.y) > 0.9 ? 1 : 0;
  V3.set(ux, 0, ux === 1 ? 0 : 1).cross(dir).normalize();
  // V3 is now perpendicular; second perpendicular = dir x V3.
  const px = dir.y * V3.z - dir.z * V3.y;
  const py = dir.z * V3.x - dir.x * V3.z;
  const pz = dir.x * V3.y - dir.y * V3.x;
  dir.x += (V3.x * Math.cos(a) + px * Math.sin(a)) * r;
  dir.y += (V3.y * Math.cos(a) + py * Math.sin(a)) * r;
  dir.z += (V3.z * Math.cos(a) + pz * Math.sin(a)) * r;
  dir.normalize();

  // Nearest wall first.
  const wallT = rayVsWorld(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, w.range, world.colliders);
  // Nearest fighter (not the shooter, not a corpse, not a teammate's body
  // when the shooter is a bot — bots never friendly-fire).
  let hit = null;
  for (const t of state.entities) {
    if (t === shooter || !t.alive) continue;
    if (!shooter.isPlayer && t.side === shooter.side) continue;
    const h = rayVsFighter(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, t);
    if (h && h.t < wallT && (!hit || h.t < hit.t)) hit = { target: t, t: h.t, head: h.head };
  }

  const endX = origin.x + dir.x * (hit ? hit.t : wallT);
  const endY = origin.y + dir.y * (hit ? hit.t : wallT);
  const endZ = origin.z + dir.z * (hit ? hit.t : wallT);
  fx.tracer(origin, { x: endX, y: endY, z: endZ }, w.tracer);
  fx.muzzle(origin.x, origin.y, origin.z);
  // Bots hear the shot; main.js plays the sound for non-player shooters.
  state.events.push({ type: 'shot', x: origin.x, y: origin.y, z: origin.z, side: shooter.side, shooter, sound: w.sound });

  if (hit) {
    const dist = hit.t;
    const falloff = clamp(1 - Math.max(0, dist - 25) / 90, 0.45, 1);
    let dmg = w.damage * (hit.head ? w.headMult : 1) * falloff;
    applyDamage(state, fx, hit.target, dmg, shooter, hit.head, now);
    if (shooter.isPlayer) {
      state.stats.hits++;
      if (hit.head) state.stats.headshots++;
      state.events.push({ type: 'playerHit', head: hit.head });
    }
    return { kind: 'hit', target: hit.target, head: hit.head, x: endX, y: endY, z: endZ };
  }
  if (wallT < w.range) fx.spark(endX, endY, endZ);
  return { kind: 'miss', x: endX, y: endY, z: endZ };
}

export function applyDamage(state, fx, target, dmg, attacker, head, now) {
  if (!target.alive) return;
  let rest = dmg;
  if (target.armor > 0) {
    const absorbed = Math.min(target.armor, rest * 0.5);
    target.armor -= absorbed;
    rest -= absorbed;
  }
  target.hp -= rest;
  target.lastDamageAt = now;
  target.lastDamageFrom = attacker;
  if (target.isPlayer && fx) fx.addShake(0.35);
  if (target.hp <= 0) {
    target.hp = 0;
    target.alive = false;
    target.deaths++;
    if (attacker) {
      attacker.kills++;
      attacker.money += 300;
      if (attacker.isPlayer) state.stats.kills++;
    }
    const verb = head ? '⌖ headshot' : 'eliminated';
    state.killfeed.push({ text: `${attacker ? attacker.name : '—'} ${verb} ${target.name}`, cls: attacker && attacker.side === 0 ? 'good' : 'bad', t: now });
    if (state.killfeed.length > 5) state.killfeed.shift();
    state.events.push({ type: 'death', target, attacker, head });
    // Drop the charge if the carrier died.
    if (state.charge.state === 'carried' && state.charge.carrier === target) {
      state.charge.state = 'dropped';
      state.charge.x = target.x; state.charge.z = target.z;
      state.charge.carrier = null;
    }
  } else if (target.ai) {
    // A hurt bot flinches and remembers who shot it.
    target.ai.lastAttacker = attacker;
    target.ai.alertedUntil = now + 4;
  }
}

// ---- grenades --------------------------------------------------------------
export function createGrenades() {
  return { list: [] }; // {kind, x,y,z, vx,vy,vz, fuse, owner, bounced}
}

export function throwGrenade(state, world, g, owner, kind, now) {
  if (owner.grenades[kind] <= 0) return false;
  owner.grenades[kind]--;
  lookDir(owner, V1);
  const h = eyeHeight(owner);
  g.list.push({
    kind,
    x: owner.x + V1.x * 0.7, y: owner.y + h, z: owner.z + V1.z * 0.7,
    vx: V1.x * 13 + owner.vx * 0.4, vy: V1.y * 13 + 3.2, vz: V1.z * 13 + owner.vz * 0.4,
    fuse: kind === 'frag' ? GRENADES.frag.fuse : 0.05,
    owner,
  });
  return true;
}

export function updateGrenades(state, world, fx, g, dt, now) {
  for (let i = g.list.length - 1; i >= 0; i--) {
    const gr = g.list[i];
    gr.vy -= 16 * dt;
    gr.x += gr.vx * dt; gr.y += gr.vy * dt; gr.z += gr.vz * dt;
    // Ground bounce.
    if (gr.y < 0.15) { gr.y = 0.15; gr.vy = Math.abs(gr.vy) * 0.45; gr.vx *= 0.7; gr.vz *= 0.7; }
    // Wall bounce (cheap: push out of any collider footprint).
    for (const c of world.colliders) {
      if (gr.y > c.top) continue;
      if (gr.x > c.x0 - 0.15 && gr.x < c.x1 + 0.15 && gr.z > c.z0 - 0.15 && gr.z < c.z1 + 0.15) {
        const dxl = gr.x - (c.x0 - 0.15), dxr = (c.x1 + 0.15) - gr.x;
        const dzl = gr.z - (c.z0 - 0.15), dzr = (c.z1 + 0.15) - gr.z;
        const m = Math.min(dxl, dxr, dzl, dzr);
        if (m === dxl || m === dxr) { gr.vx = -gr.vx * 0.5; gr.x += m === dxl ? -0.05 : 0.05; }
        else { gr.vz = -gr.vz * 0.5; gr.z += m === dzl ? -0.05 : 0.05; }
      }
    }
    gr.fuse -= dt;
    if (gr.fuse > 0) continue;
    g.list.splice(i, 1);
    if (gr.kind === 'frag') {
      fx.explosion(gr.x, gr.y + 0.3, gr.z);
      for (const t of state.entities) {
        if (!t.alive || t === gr.owner) continue;
        const d = Math.hypot(t.x - gr.x, t.z - gr.z);
        const h = eyeHeight(t);
        const dy = (t.y + h) - (gr.y + 0.3);
        const dist = Math.sqrt(d * d + dy * dy);
        if (dist < GRENADES.frag.radius) {
          const dmg = GRENADES.frag.maxDamage * (1 - dist / GRENADES.frag.radius);
          applyDamage(state, fx, t, dmg, gr.owner, false, now);
        }
      }
      state.events.push({ type: 'explosion', x: gr.x, y: gr.y, z: gr.z });
    } else if (gr.kind === 'smoke') {
      fx.smokeAt(gr.x, 1.2, gr.z, GRENADES.smoke.duration);
      state.events.push({ type: 'smoke', x: gr.x, y: gr.y, z: gr.z });
    } else if (gr.kind === 'flash') {
      for (const t of state.entities) {
        if (!t.alive) continue;
        const d = Math.hypot(t.x - gr.x, t.z - gr.z);
        if (d > GRENADES.flash.radius) continue;
        // Only blinds fighters facing the flash with line of sight.
        lookDir(t, V1);
        V2.set(gr.x - t.x, (gr.y + 0.5) - (t.y + eyeHeight(t)), gr.z - t.z).normalize();
        const facing = V1.x * V2.x + V1.y * V2.y + V1.z * V2.z;
        if (facing > -0.2) {
          const k = Math.max(0, 1 - d / GRENADES.flash.radius);
          t.flashUntil = now + GRENADES.flash.duration * k;
          t.flashStrength = Math.max(t.flashStrength, k);
        }
      }
      state.events.push({ type: 'flash', x: gr.x, y: gr.y, z: gr.z });
    }
  }
}
