// player.js — the human fighter: acceleration-based movement with crouch and
// jump, aim-down-sights, recoil and spread that punish firing on the move,
// reloading, weapon switching, grenade throws, and plant/defuse channels.
import * as THREE from 'three';
import { moveBody, segmentBlocked } from './world.js';
import { weaponOf, giveWeapon, GRENADES } from './weapons.js';
import { shoot, throwGrenade, eyeHeight, lookDir } from './combat.js';
import { clamp, damp } from './rng.js';
import { PLANT_TIME, DEFUSE_TIME } from './state.js';
import { V1 } from './tmp.js';

const WALK_SPEED = 4.4;
const CROUCH_SPEED = 2.3;
const ADS_SPEED = 2.9;
const ACCEL = 42;
const FRICTION = 11;

export function updatePlayer(state, world, fx, grenades, input, audio, dt, now) {
  const p = state.entities[0];
  if (!p.alive) return;
  const w = weaponOf(p);

  // --- look: mouse deltas, pitch clamped, recoil kick recovering ----------
  const [mdx, mdy] = input.consumeMouse();
  const sens = p.ads ? 0.0011 : 0.0021;
  p.yaw -= mdx * sens;
  p.pitch = clamp(p.pitch - mdy * sens, -1.45, 1.45);
  p.recoil = damp(p.recoil, 0, 7, dt);

  // --- movement: accel toward the wish direction, friction when idle -------
  const fwd = input.forwardAxis();
  const str = input.strafeAxis();
  const wantCrouch = input.down('ControlLeft') || input.down('KeyC');
  p.crouch = wantCrouch;
  const speed = p.crouch ? CROUCH_SPEED : p.ads ? ADS_SPEED : WALK_SPEED;
  const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
  // Forward is (-sin, -cos); right is (cos, -sin).
  let wx = (-sin * fwd + cos * str);
  let wz = (-cos * fwd - sin * str);
  const wl = Math.hypot(wx, wz);
  if (wl > 0.001) { wx /= wl; wz /= wl; }
  const moving = wl > 0.001;
  p.vx = damp(p.vx, wx * speed, moving ? ACCEL / speed * 9 : FRICTION, dt);
  p.vz = damp(p.vz, wz * speed, moving ? ACCEL / speed * 9 : FRICTION, dt);
  if (input.down('Space') && p.onGround) {
    p.vy = 7.2;
    p.onGround = false;
  }
  moveBody(p, dt, world.colliders);
  p.moveAmount = damp(p.moveAmount, clamp(Math.hypot(p.vx, p.vz) / WALK_SPEED, 0, 1), 8, dt);

  // Footstep ticks.
  if (p.onGround && p.moveAmount > 0.35) {
    p._stepT = (p._stepT || 0) - dt * p.moveAmount;
    if (p._stepT <= 0) { p._stepT = 0.42; audio.step(); }
  }

  // --- aim down sights (right mouse button) --------------------------------
  p.ads = input._rmb === true;

  // --- spread: still + crouched + ADS is accurate; moving + firing is not --
  const base = p.ads ? w.adsSpread : w.spread;
  const movePenalty = 1 + p.moveAmount * w.moveSpread;
  const airPenalty = p.onGround ? 1 : 1.8;
  p.spread = base * movePenalty * airPenalty + p.recoil * 30;

  // --- firing ----------------------------------------------------------------
  if (p.reloading > 0) {
    p.reloading -= dt;
    if (p.reloading <= 0) {
      const slot = p.weapons[p.weapon];
      const need = w.mag - slot.mag;
      const take = Math.min(need, slot.reserve);
      slot.mag += take; slot.reserve -= take;
    }
  } else if (input.mouseDown && now - p.lastShot >= w.rate) {
    const slot = p.weapons[p.weapon];
    if (slot.mag > 0) {
      const res = shoot(state, world, fx, p, now);
      p.recoil = Math.min(0.09, p.recoil + w.recoil);
      p.pitch += w.kick * 0.004;
      audio.shot(w.sound);
      if (res.kind === 'hit') audio.hit(res.head);
    } else {
      audio.dryFire();
      startReload(p);
    }
  }

  // --- reload, weapon switch, grenade ---------------------------------------
  if (input._reloadQueued) {
    input._reloadQueued = false;
    startReload(p);
  }
  if (input._switchTo) {
    const id = input._switchTo;
    input._switchTo = null;
    if (p.weapons[id] && id !== p.weapon) {
      p.weapon = id;
      p.reloading = 0;
      audio.reload();
    }
  }
  if (input._grenadeQueued) {
    const kind = input._grenadeQueued;
    input._grenadeQueued = null;
    if (p.grenades[kind] > 0 && throwGrenade(state, world, grenades, p, kind, now)) {
      audio.shot('pistol');
    }
  }

  // --- plant / defuse channel (hold E near a site / planted charge) --------
  updateChannel(state, world, p, input, audio, dt, now);
}

export function startReload(p) {
  const w = weaponOf(p);
  const slot = p.weapons[p.weapon];
  if (p.reloading > 0 || slot.mag >= w.mag || slot.reserve <= 0) return;
  p.reloading = w.reload;
  p.reloadTotal = w.reload;
}

// Plant (Cinder, near a site, carrying the charge) or defuse (Slag, near the
// planted charge). Holding E channels; stepping away decays progress.
function updateChannel(state, world, p, input, audio, dt, now) {
  const ch = state.charge;
  const holding = input.down('KeyE');
  let target = null;
  if (p.side === 0 && ch.state === 'carried' && ch.carrier === p) {
    for (const s of world.sites) {
      const d = Math.hypot(p.x - s.x, p.z - s.z);
      if (d < s.r) { target = { kind: 'plant', site: s.index }; break; }
    }
  } else if (p.side === 1 && ch.state === 'planted') {
    const d = Math.hypot(p.x - ch.x, p.z - ch.z);
    if (d < 3.5) target = { kind: 'defuse', site: ch.site };
  }
  if (target && holding) {
    if (target.kind === 'plant') {
      ch.plantProgress += dt;
      ch.planter = p;
      if (Math.floor(ch.plantProgress * 4) !== Math.floor((ch.plantProgress - dt) * 4)) audio.plantBeep();
      if (ch.plantProgress >= PLANT_TIME) {
        ch.state = 'planted';
        ch.site = target.site;
        ch.x = p.x; ch.z = p.z;
        ch.detonateLeft = 40;
        ch.plantProgress = 0;
        audio.planted();
        state.events.push({ type: 'planted', site: target.site, by: p });
      }
    } else {
      ch.defuseProgress += dt;
      ch.defuser = p;
      if (Math.floor(ch.defuseProgress * 4) !== Math.floor((ch.defuseProgress - dt) * 4)) audio.defuse();
      if (ch.defuseProgress >= DEFUSE_TIME) {
        ch.state = 'gone';
        ch.defuseProgress = 0;
        state.events.push({ type: 'defused', by: p });
      }
    }
  } else {
    ch.plantProgress = Math.max(0, ch.plantProgress - dt * 2);
    ch.defuseProgress = Math.max(0, ch.defuseProgress - dt * 2);
  }
}

// Bind the keys the player module owns (reload, weapon slots, grenade, ADS).
export function bindPlayerKeys(input) {
  input.onKey = (code, down) => {
    if (!down) return;
    if (code === 'KeyR') input._reloadQueued = true;
    else if (code === 'Digit1') input._switchTo = 'ar77';
    else if (code === 'Digit2') input._switchTo = 'sr90';
    else if (code === 'Digit3') input._switchTo = 'vex9';
    else if (code === 'Digit4') input._switchTo = 'p9';
    else if (code === 'KeyG') input._grenadeQueued = input._grenadeKind || 'frag';
    else if (code === 'KeyQ') {
      // Cycle grenade type: frag -> smoke -> flash.
      const order = ['frag', 'smoke', 'flash'];
      const cur = order.indexOf(input._grenadeKind || 'frag');
      input._grenadeKind = order[(cur + 1) % order.length];
    }
  };
  // Right mouse button drives ADS; track it through mouse events on the page.
  document.addEventListener('mousedown', (e) => { if (e.button === 2) input._rmb = true; });
  document.addEventListener('mouseup', (e) => { if (e.button === 2) input._rmb = false; });
  document.addEventListener('contextmenu', (e) => e.preventDefault());
}
