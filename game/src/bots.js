// bots.js — the nine AI fighters. Each bot has a role (push a site, hold an
// angle, carry the charge, defend), a waypoint path from Dijkstra, a reaction
// time before it can fire, burst fire with real spread, hearing (gunshots pull
// nearby bots in), and grenade throws: frags at distant enemies, smoke on a
// site push. Bots buy with the same economy as the player.
import { nearestWaypoint, segmentBlocked, moveBody } from './world.js';
import { shoot, throwGrenade, eyeHeight, lookDir } from './combat.js';
import { weaponOf, giveWeapon, BUY_ITEMS } from './weapons.js';
import { clamp, damp, range } from './rng.js';
import { V1, V2 } from './tmp.js';

const BOT_NAMES_CINDER = ['ASH', 'FERRO', 'EMBER', 'KILN'];
const BOT_NAMES_SLAG = ['RUST', 'SINTER', 'DROSS', 'CLINKER', 'TAPHOLE'];

export function botNames(side) {
  return side === 0 ? BOT_NAMES_CINDER : BOT_NAMES_SLAG;
}

function buildAdj(world) {
  const adj = world.waypoints.map(() => []);
  for (const [a, b, d] of world.edges) {
    adj[a].push([b, d]);
    adj[b].push([a, d]);
  }
  return adj;
}

function findPath(world, from, to) {
  if (from === to) return [to];
  if (!world._adj) world._adj = buildAdj(world);
  const adj = world._adj;
  const n = world.waypoints.length;
  const dist = new Array(n).fill(Infinity);
  const prev = new Array(n).fill(-1);
  const done = new Array(n).fill(false);
  dist[from] = 0;
  for (let iter = 0; iter < n; iter++) {
    let u = -1, bd = Infinity;
    for (let i = 0; i < n; i++) if (!done[i] && dist[i] < bd) { bd = dist[i]; u = i; }
    if (u === -1) break;
    done[u] = true;
    if (u === to) break;
    for (const [v, d] of adj[u]) {
      if (dist[u] + d < dist[v]) { dist[v] = dist[u] + d; prev[v] = u; }
    }
  }
  if (dist[to] === Infinity) return [to];
  const path = [];
  let cur = to;
  while (cur !== -1) { path.unshift(cur); cur = prev[cur]; }
  return path;
}

export function makeBotAI(bot, role, site, rnd) {
  bot.ai = {
    role,                 // 'push' | 'hold' | 'carrier' | 'defend'
    site,                 // assigned site index 0 | 1
    path: [], pathI: 0,
    targetNode: -1,
    thinkAt: 0,
    seenEnemy: null, seenAt: -9,
    aimTime: 0,
    burstLeft: 0, nextShotAt: 0, burstPauseUntil: 0,
    reaction: range(rnd, 0.3, 0.55),
    aimErr: range(rnd, 0.02, 0.045),
    investigate: null,    // {x, z, until}
    lastAttacker: null, alertedUntil: 0,
    holdNode: -1,
    plantChannel: 0,
    speed: range(rnd, 3.6, 4.3),
  };
  return bot.ai;
}

function visibleEnemy(state, world, fx, bot, now) {
  let best = null, bestD = Infinity;
  for (const t of state.entities) {
    if (!t.alive || t.side === bot.side || t === bot) continue;
    const dx = t.x - bot.x, dz = t.z - bot.z;
    const d = Math.hypot(dx, dz);
    if (d > 46) continue;
    // Facing cone (~110 degrees).
    const fx0 = -Math.sin(bot.yaw), fz0 = -Math.cos(bot.yaw);
    const facing = (dx * fx0 + dz * fz0) / Math.max(0.001, d);
    if (facing < -0.15 && d > 4) continue;
    // Line of sight at chest height, and not through smoke.
    const ey = bot.y + eyeHeight(bot);
    const ty = t.y + eyeHeight(t);
    if (segmentBlocked(bot.x, bot.z, t.x, t.z, world.colliders, 1.4)) continue;
    if (fx.smokeBlocks(bot.x, ey, bot.z, t.x, ty, t.z)) continue;
    if (d < bestD) { bestD = d; best = t; }
  }
  return best ? { target: best, dist: bestD } : null;
}

function setPathTo(bot, world, node) {
  const from = nearestWaypoint(world, bot.x, bot.z);
  bot.ai.path = findPath(world, from, node);
  bot.ai.pathI = 0;
  bot.ai.targetNode = node;
}

function followPath(bot, world, dt, speed) {
  const ai = bot.ai;
  if (!ai.path.length || ai.pathI >= ai.path.length) return true;
  const node = world.waypoints[ai.path[ai.pathI]];
  const dx = node.x - bot.x, dz = node.z - bot.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.7) { ai.pathI++; return ai.pathI >= ai.path.length; }
  const vx = (dx / d) * speed, vz = (dz / d) * speed;
  bot.vx = damp(bot.vx, vx, 8, dt);
  bot.vz = damp(bot.vz, vz, 8, dt);
  bot.yaw = Math.atan2(-vx, -vz);
  return false;
}

function botBuy(bot, rnd) {
  const money = bot.money;
  if (money >= 1600 && !bot.weapons.ar77) { bot.money -= 1600; giveWeapon(bot, 'ar77'); }
  else if (money >= 900 && !bot.weapons.vex9 && !bot.weapons.ar77) { bot.money -= 900; giveWeapon(bot, 'vex9'); }
  else if (money >= 2200 && rnd() < 0.25 && !bot.weapons.sr90) { bot.money -= 2200; giveWeapon(bot, 'sr90'); }
  if (bot.money >= 150 && !bot.hasKevlar) { bot.money -= 150; bot.hasKevlar = true; bot.armor = 100; }
  if (bot.money >= 200 && rnd() < 0.5) { bot.money -= 200; bot.grenades.frag++; }
  if (bot.money >= 150 && rnd() < 0.4) { bot.money -= 150; bot.grenades.smoke++; }
}

export function updateBot(state, world, fx, grenades, bot, dt, now, rnd) {
  if (!bot.alive) return;
  const ai = bot.ai;
  const w = weaponOf(bot);
  const flashed = now < bot.flashUntil;
  bot.moveAmount = damp(bot.moveAmount, clamp(Math.hypot(bot.vx, bot.vz) / 4.2, 0, 1), 8, dt);

  // --- buy phase ------------------------------------------------------------
  if (state.phase === 'buy') {
    if (!ai._bought) { botBuy(bot, rnd); ai._bought = true; }
    // Shuffle to a hold/push start inside spawn; face the map.
    bot.yaw = bot.side === 0 ? 0 : Math.PI;
    return;
  }
  ai._bought = false;

  // --- pick a goal ------------------------------------------------------------
  if (now >= ai.thinkAt) {
    ai.thinkAt = now + 0.4 + rnd() * 0.3;
    const ch = state.charge;
    if (bot.side === 1 && ch.state === 'planted') {
      // Defenders rush the planted charge.
      ai.role = 'defend';
      const n = nearestWaypoint(world, ch.x, ch.z);
      if (ai.targetNode !== n) setPathTo(bot, world, n);
    } else if (bot.side === 0 && ch.state === 'carried' && ch.carrier === bot) {
      ai.role = 'carrier';
      const s = world.sites[ai.site];
      const n = nearestWaypoint(world, s.x, s.z);
      if (ai.targetNode !== n) setPathTo(bot, world, n);
    } else if (bot.side === 0 && ch.state === 'dropped') {
      // Nearest Cinder bot fetches the dropped charge.
      let nearest = null, bd = Infinity;
      for (const t of state.entities) {
        if (t.side !== 0 || !t.alive || !t.ai) continue;
        const d = Math.hypot(t.x - ch.x, t.z - ch.z);
        if (d < bd) { bd = d; nearest = t; }
      }
      if (nearest === bot) {
        const n = nearestWaypoint(world, ch.x, ch.z);
        if (ai.targetNode !== n) setPathTo(bot, world, n);
      }
    } else if (ai.investigate && now < ai.investigate.until) {
      const n = nearestWaypoint(world, ai.investigate.x, ai.investigate.z);
      if (ai.targetNode !== n) setPathTo(bot, world, n);
    } else if (bot.side === 0) {
      // Attackers push their assigned site, then hold it.
      const s = world.sites[ai.site];
      const atSite = Math.hypot(bot.x - s.x, bot.z - s.z) < s.r + 1;
      if (!atSite) {
        const n = nearestWaypoint(world, s.x, s.z);
        if (ai.targetNode !== n) setPathTo(bot, world, n);
      } else if (ai.holdNode < 0) {
        ai.holdNode = nearestWaypoint(world, bot.x, bot.z);
      }
    } else {
      // Defenders hold near their site or mid, rotating occasionally.
      if (ai.holdNode < 0 || rnd() < 0.06) {
        const s = world.sites[ai.site];
        const pool = world.waypoints.map((wp, i) => ({ wp, i }))
          .filter(({ wp }) => Math.hypot(wp.x - s.x, wp.z - s.z) < 12);
        const pick = pool[(rnd() * pool.length) | 0];
        ai.holdNode = pick ? pick.i : nearestWaypoint(world, s.x, s.z);
        setPathTo(bot, world, ai.holdNode);
      }
    }
    // Hearing: a recent gunshot or death nearby pulls bots to investigate.
    for (const ev of state.events) {
      if (ev.type !== 'shot' && ev.type !== 'death') continue;
      const ex = ev.x ?? ev.target?.x, ez = ev.z ?? ev.target?.z;
      if (ex === undefined) continue;
      const d = Math.hypot(bot.x - ex, bot.z - ez);
      if (d < 26 && (ev.side === undefined || ev.side !== bot.side)) {
        ai.investigate = { x: ex, z: ez, until: now + 5 };
        ai.alertedUntil = now + 5;
      }
    }
  }

  // --- combat: spot, aim, burst ----------------------------------------------
  const seen = flashed ? null : visibleEnemy(state, world, fx, bot, now);
  if (seen) {
    ai.seenEnemy = seen.target;
    ai.seenAt = now;
    bot.lastSeen = now;
    // Face the enemy and slow to a stop to shoot accurately.
    const dx = seen.target.x - bot.x, dz = seen.target.z - bot.z;
    bot.yaw = Math.atan2(-dx, -dz);
    bot.vx = damp(bot.vx, 0, 10, dt);
    bot.vz = damp(bot.vz, 0, 10, dt);
    ai.aimTime += dt;
    const slot = bot.weapons[bot.weapon];
    if (ai.aimTime > ai.reaction && now >= ai.burstPauseUntil && slot.mag > 0 && bot.reloading <= 0) {
      if (ai.burstLeft <= 0) {
        ai.burstLeft = 3 + ((rnd() * 4) | 0);
        ai.burstPauseUntil = now + 0.55 + rnd() * 0.7;
      }
      if (now >= ai.nextShotAt && ai.burstLeft > 0) {
        ai.nextShotAt = now + w.rate + rnd() * 0.03;
        ai.burstLeft--;
        // Aim error shrinks the longer the bot has tracked its target.
        const err = ai.aimErr * (1.6 - Math.min(1, ai.aimTime) * 0.9) * (1 + bot.moveAmount);
        bot.spread = w.spread + err * 57.3;
        const res = shoot(state, world, fx, bot, now);
        if (res.kind === 'hit' && res.target.isPlayer) {
          // A bot that lands shots keeps the pressure on.
          ai.burstPauseUntil = Math.min(ai.burstPauseUntil, now + 0.4);
        }
        // Frag at a distant, visible enemy now and then.
        if (seen.dist > 16 && bot.grenades.frag > 0 && rnd() < 0.02) {
          throwGrenade(state, world, grenades, bot, 'frag', now);
        }
      }
    }
    // Smoke the site when pushing in as an attacker.
    if (bot.side === 0 && bot.grenades.smoke > 0 && seen.dist < 20 && rnd() < 0.01) {
      throwGrenade(state, world, grenades, bot, 'smoke', now);
    }
  } else {
    ai.aimTime = Math.max(0, ai.aimTime - dt * 2);
    if (now - ai.seenAt > 1.2) ai.seenEnemy = null;
  }

  // --- reloading ---------------------------------------------------------------
  if (bot.reloading > 0) {
    bot.reloading -= dt;
    if (bot.reloading <= 0) {
      const slot = bot.weapons[bot.weapon];
      const need = w.mag - slot.mag;
      const take = Math.min(need, slot.reserve);
      slot.mag += take; slot.reserve -= take;
    }
  } else {
    const slot = bot.weapons[bot.weapon];
    if (slot.mag === 0) {
      bot.reloading = w.reload;
      bot.reloadTotal = w.reload;
    }
  }

  // --- movement ----------------------------------------------------------------
  const ch = state.charge;
  const atSite = (s) => Math.hypot(bot.x - s.x, bot.z - s.z) < s.r;
  if (bot.side === 0 && ch.state === 'carried' && ch.carrier === bot && atSite(world.sites[ai.site])) {
    // Carrier plants: stand still and channel.
    bot.vx = damp(bot.vx, 0, 10, dt);
    bot.vz = damp(bot.vz, 0, 10, dt);
    ch.plantProgress += dt;
    ch.planter = bot;
    if (ch.plantProgress >= 3.5) {
      ch.state = 'planted';
      ch.site = ai.site;
      ch.x = bot.x; ch.z = bot.z;
      ch.detonateLeft = 40;
      ch.plantProgress = 0;
      state.events.push({ type: 'planted', site: ai.site, by: bot });
    }
  } else if (bot.side === 1 && ch.state === 'planted'
    && Math.hypot(bot.x - ch.x, bot.z - ch.z) < 3.5 && !seen) {
    // Defender defuses: stand still and channel.
    bot.vx = damp(bot.vx, 0, 10, dt);
    bot.vz = damp(bot.vz, 0, 10, dt);
    ch.defuseProgress += dt;
    ch.defuser = bot;
    if (ch.defuseProgress >= 5) {
      ch.state = 'gone';
      ch.defuseProgress = 0;
      state.events.push({ type: 'defused', by: bot });
    }
  } else if (bot.side === 0 && ch.state === 'dropped'
    && Math.hypot(bot.x - ch.x, bot.z - ch.z) < 1.6) {
    // Pick up the dropped charge.
    ch.state = 'carried';
    ch.carrier = bot;
    ai.role = 'carrier';
  } else {
    // Walk the current path, or idle-scan when holding.
    const arrived = followPath(bot, world, dt, ai.speed);
    if (arrived && ai.holdNode >= 0) {
      // Hold: slow scan across likely approaches.
      bot.vx = damp(bot.vx, 0, 10, dt);
      bot.vz = damp(bot.vz, 0, 10, dt);
      bot.yaw += Math.sin(now * 0.5 + bot.id) * 0.15 * dt;
    }
  }

  moveBody(bot, dt, world.colliders);
  bot.spread = bot.spread || w.spread;
}
