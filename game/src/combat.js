// Combat: hitscan shooting with body-part damage (headshots x4), grenades
// with gravity and fuses, and kill handling (killfeed, money, round-end
// checks). The same shoot() serves the player and every bot — the only
// difference is where the ray starts and how spread is rolled. Spread
// tightens when the shooter aims down sights (agent.aiming).
import * as THREE from 'three';
import { WEAPONS, GRENADES, damageAt, currentSpread } from './weapons.js';
import { ECONOMY } from './state.js';
import { V1, V2, V3, V4 } from './tmp.js';

export function createCombat(scene, state, world, effects, audio, hooks) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = 140;
  const grenades = [];
  const grenadeGeo = new THREE.SphereGeometry(0.09, 8, 6);
  const grenadeMat = new THREE.MeshStandardMaterial({ color: 0x2f7a4a, roughness: 0.5, metalness: 0.4 });

  function eyeOf(agent) {
    V1.set(agent.pos.x, agent.pos.y + agent.eye, agent.pos.z);
    return V1;
  }

  function aimDirection(agent) {
    V2.set(0, 0, -1).applyEuler(new THREE.Euler(agent.pitch, agent.yaw, 0, 'YXZ'));
    return V2;
  }

  // A fresh list each call: world meshes plus every living agent's hitboxes.
  // (Never push into world.shootables — it would grow forever.)
  const scratchShootables = [];
  function shootables() {
    scratchShootables.length = 0;
    for (const mesh of world.shootables) scratchShootables.push(mesh);
    for (const agent of state.agents) {
      if (!agent.alive || !agent.mesh) continue;
      scratchShootables.push(agent.mesh.userData.bodyMesh, agent.mesh.userData.headMesh, agent.mesh.userData.legsMesh);
    }
    return scratchShootables;
  }

  function damage(victim, amount, attacker, part, point) {
    if (!victim.alive) return false;
    let remaining = amount;
    // Armour absorbs half the damage until it runs out.
    if (victim.loadout.armor > 0) {
      const absorbed = Math.min(victim.loadout.armor, remaining * 0.5);
      victim.loadout.armor -= absorbed;
      remaining -= absorbed;
    }
    victim.hp -= remaining;
    victim.lastDamageAt = state.time;
    victim.lastDamageFrom = attacker;
    if (victim.isPlayer) {
      hooks.onPlayerHurt?.(attacker);
      audio.hurt();
    }
    effects.blood(point);
    if (victim.hp <= 0) {
      victim.hp = 0;
      victim.alive = false;
      victim.deaths += 1;
      if (attacker) {
        attacker.kills += 1;
        attacker.money += ECONOMY.KILL_REWARD;
      }
      hooks.onKill?.(attacker, victim, part);
      // The charge drops to the nearest living Vanguard teammate.
      if (victim.hasCharge) {
        victim.hasCharge = false;
        let best = null;
        let bestD = Infinity;
        for (const mate of state.agents) {
          if (mate.alive && mate.team === victim.team && mate !== victim) {
            const d = mate.pos.distanceToSquared(victim.pos);
            if (d < bestD) { bestD = d; best = mate; }
          }
        }
        if (best) {
          best.hasCharge = true;
          state.bomb.carrierId = best.id;
        } else {
          state.bomb.state = 'idle';
          state.bomb.carrierId = null;
        }
      }
      hooks.onAgentDeath?.(victim);
      return true;
    }
    return false;
  }

  function shoot(agent) {
    const now = state.time;
    const def = WEAPONS[agent.loadout.current];
    const loadout = agent.loadout;
    const slot = loadout.owned[def.id];
    if (!slot || slot.mag <= 0) {
      if (agent.isPlayer) audio.dryFire();
      return false;
    }
    if (loadout.reloadingUntil > now) return false;
    const interval = 60 / def.rpm;
    if (now - loadout.lastShotAt < interval) return false;
    loadout.lastShotAt = now;
    slot.mag -= 1;

    const airborne = !agent.onGround;
    const spread = currentSpread(def, loadout, agent.speed2d, agent.crouched, airborne, agent.aiming);
    loadout.bloom = Math.min(def.bloomMax, loadout.bloom + def.spreadBloom);

    const origin = eyeOf(agent);
    const baseDir = aimDirection(agent);
    const random = state.random;
    for (let p = 0; p < def.pellets; p += 1) {
      V3.copy(baseDir);
      V3.x += (random() * 2 - 1) * spread;
      V3.y += (random() * 2 - 1) * spread;
      V3.z += (random() * 2 - 1) * spread;
      V3.normalize();
      raycaster.set(origin, V3);
      const hits = raycaster.intersectObjects(shootables(), false);
      // V4 is the tracer end point: max range, shortened to the first hit.
      // (Scratch, not a clone: tracers copy the values out at once.)
      V4.copy(V3).multiplyScalar(def.range).add(origin);
      // First hit that is not the shooter themself (the ray starts inside
      // the shooter's own head hitbox).
      let hit = null;
      for (const candidate of hits) {
        if (candidate.object.userData.agent !== agent) { hit = candidate; break; }
      }
      if (hit) {
        V4.copy(hit.point);
        const data = hit.object.userData;
        if (data.agent && data.agent !== agent && data.agent.alive && data.agent.team !== agent.team) {
          const dist = hit.point.distanceTo(origin);
          const part = data.part ?? 'body';
          const mult = part === 'head' ? def.headMult : part === 'legs' ? def.legMult : 1;
          const dmg = damageAt(def, dist) * mult;
          const died = damage(data.agent, dmg, agent, part, hit.point);
          if (agent.isPlayer) hooks.onPlayerHit?.(died);
        } else if (data.agent) {
          // Friendly fire is off: the shot just stops at the teammate.
        } else {
          effects.impact(hit.point, hit.face?.normal ?? new THREE.Vector3(0, 1, 0));
        }
      }
      effects.tracer(origin, V4, def.tracer);
    }
    // Muzzle flash at the shooter's weapon tip.
    V3.copy(origin).addScaledVector(baseDir, 0.6);
    effects.muzzle(V3, baseDir);
    audio.shot(def.id);
    hooks.onShot?.(agent);
    if (agent.isPlayer) hooks.onPlayerShoot?.(agent, def);
    return true; // a shot was fired (hit or miss)
  }

  // Reload: starts a timed refill; update() completes it. Returns false when
  // there is nothing to reload (full mag, no reserve, already reloading).
  function reload(agent) {
    const def = WEAPONS[agent.loadout.current];
    const slot = agent.loadout.owned[def.id];
    if (!slot || slot.mag === def.mag || slot.reserve <= 0) return false;
    if (agent.loadout.reloadingUntil > state.time) return false;
    agent.loadout.reloadingUntil = state.time + def.reloadSeconds;
    agent.loadout.reloadingWeapon = def.id;
    if (agent.isPlayer) audio.reload();
    return true;
  }

  function completeReloads() {
    for (const agent of state.agents) {
      const loadout = agent.loadout;
      if (loadout.reloadingUntil > 0 && state.time >= loadout.reloadingUntil && loadout.reloadingWeapon) {
        const def = WEAPONS[loadout.reloadingWeapon];
        const slot = loadout.owned[def.id];
        if (slot) {
          const need = def.mag - slot.mag;
          const take = Math.min(need, slot.reserve);
          slot.mag += take;
          slot.reserve -= take;
        }
        loadout.reloadingUntil = 0;
        loadout.reloadingWeapon = null;
      }
    }
  }

  function throwGrenade(agent, kind) {
    const def = GRENADES[kind];
    if (!def) return false;
    const count = kind === 'frag' ? agent.loadout.grenades.frag : kind === 'smoke' ? agent.loadout.grenades.smoke : agent.loadout.grenades.flash;
    if (count <= 0) return false;
    agent.loadout.grenades[kind] -= 1;
    const mesh = new THREE.Mesh(grenadeGeo, grenadeMat);
    const origin = eyeOf(agent);
    const dir = aimDirection(agent);
    mesh.position.copy(origin).addScaledVector(dir, 0.5);
    scene.add(mesh);
    grenades.push({
      mesh,
      kind,
      vel: new THREE.Vector3(dir.x * 13, dir.y * 13 + 3.4, dir.z * 13),
      fuse: kind === 'frag' ? def.fuse : kind === 'smoke' ? 0.9 : 1.2,
      owner: agent,
      bounced: false,
    });
    audio.grenadePin();
    hooks.onGrenade?.(agent, kind);
    return true;
  }

  function explodeFrag(grenade) {
    const pos = grenade.mesh.position;
    effects.explosion(pos);
    audio.explode();
    const def = GRENADES.frag;
    for (const agent of state.agents) {
      if (!agent.alive || agent === grenade.owner) continue;
      const dist = agent.pos.distanceTo(pos);
      if (dist > def.radius) continue;
      if (!world.hasLineOfSight(pos.x, pos.y, pos.z, agent.pos.x, agent.pos.y + 1, agent.pos.z)) continue;
      const t = 1 - dist / def.radius;
      damage(agent, def.minDamage + (def.damage - def.minDamage) * t, grenade.owner, 'body', agent.pos);
    }
    hooks.onExplosion?.(pos);
  }

  function update(dt) {
    completeReloads();
    for (let i = grenades.length - 1; i >= 0; i -= 1) {
      const g = grenades[i];
      g.fuse -= dt;
      g.vel.y -= 12 * dt;
      g.mesh.position.addScaledVector(g.vel, dt);
      const p = g.mesh.position;
      if (p.y <= 0.09) {
        p.y = 0.09;
        g.vel.y = Math.abs(g.vel.y) * 0.35;
        g.vel.x *= 0.6;
        g.vel.z *= 0.6;
        g.bounced = true;
      }
      world.collide(p, 0.09);
      if (g.fuse <= 0) {
        if (g.kind === 'frag') explodeFrag(g);
        else if (g.kind === 'smoke') {
          effects.smoke(p.x, 1.2, p.z, GRENADES.smoke.radius, GRENADES.smoke.duration);
          hooks.onSmoke?.(p);
        } else {
          hooks.onFlash?.(p, g.owner);
          audio.flash();
        }
        scene.remove(g.mesh);
        grenades.splice(i, 1);
      }
    }
  }

  return { shoot, reload, throwGrenade, update, damage, eyeOf, aimDirection };
}
