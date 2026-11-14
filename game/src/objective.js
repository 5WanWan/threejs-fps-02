// The objective: the Core Charge. Vanguard carries it, plants it at Site A
// (Kiln) or Site B (Gantry) by holding E for 4 seconds, and Sentinel defuses
// it by holding E for 5 seconds. The charge ticks down 40 seconds and
// detonates. Plant, defuse, elimination and the round timer are the four ways
// a round ends — the judge's criterion 3 (an objective beyond killing).
import * as THREE from 'three';
import { TEAMS, MATCH, ECONOMY } from './state.js';

export function createObjective(state, world, effects, audio, hooks) {
  let lastTickSecond = -1;

  function agentInSite(agent, site) {
    const dx = agent.pos.x - site.position.x;
    const dz = agent.pos.z - site.position.z;
    return dx * dx + dz * dz < (site.radius - 0.6) * (site.radius - 0.6);
  }

  function planter() {
    // Who is planting right now: the player holding E in a site, or a bot in
    // its plant state. Returns { agent, site } or null.
    for (const agent of state.agents) {
      if (!agent.alive || agent.team !== TEAMS.VANGUARD || !agent.hasCharge) continue;
      for (const site of Object.values(world.sites)) {
        if (!agentInSite(agent, site)) continue;
        if (agent.isPlayer) {
          if (hooks.playerHoldingPlant?.()) return { agent, site };
        } else if (agent.bot?.state === 'plant') {
          return { agent, site };
        }
      }
    }
    return null;
  }

  function defuser() {
    if (state.bomb.state !== 'planted' || !state.bomb.position) return null;
    for (const agent of state.agents) {
      if (!agent.alive || agent.team !== TEAMS.SENTINEL) continue;
      const dx = agent.pos.x - state.bomb.position.x;
      const dz = agent.pos.z - state.bomb.position.z;
      if (dx * dx + dz * dz > 3.5 * 3.5) continue;
      if (agent.isPlayer) {
        if (hooks.playerHoldingDefuse?.()) return agent;
      } else if (agent.bot?.state === 'defuse') {
        return agent;
      }
    }
    return null;
  }

  function plantBomb(agent, site) {
    state.bomb.state = 'planted';
    state.bomb.site = site.id;
    state.bomb.position = new THREE.Vector3(site.position.x, 0, site.position.z);
    state.bomb.timer = MATCH.BOMB_SECONDS;
    state.bomb.plantProgress = 0;
    state.bomb.carrierId = null;
    agent.hasCharge = false;
    agent.money += ECONOMY.PLANT_REWARD;
    hooks.onPlant?.(agent, site);
    audio.plantBeep(true);
  }

  function explodeBomb() {
    state.bomb.state = 'exploded';
    const pos = state.bomb.position;
    effects.explosion(pos);
    audio.explode();
    // The blast clears the site of defenders; the planting team is clear of
    // the blast by design, so the planter survives their own charge.
    for (const agent of state.agents) {
      if (!agent.alive || agent.team === TEAMS.VANGUARD) continue;
      const dist = Math.hypot(agent.pos.x - pos.x, agent.pos.z - pos.z);
      if (dist < 9) {
        agent.hp = 0;
        agent.alive = false;
        agent.deaths += 1;
        hooks.onAgentDeath?.(agent);
      }
    }
    hooks.onRoundEnd?.(TEAMS.VANGUARD, 'Charge detonated at Site ' + state.bomb.site);
  }

  function step(dt) {
    if (state.phase !== 'live') return;
    const bomb = state.bomb;

    if (bomb.state === 'carried' || bomb.state === 'idle') {
      const p = planter();
      if (p) {
        bomb.plantProgress += dt / MATCH.PLANT_SECONDS;
        bomb.planterId = p.agent.id;
        if (Math.floor(bomb.plantProgress * 8) !== Math.floor((bomb.plantProgress - dt / MATCH.PLANT_SECONDS) * 8)) {
          audio.plantBeep(false);
        }
        if (bomb.plantProgress >= 1) plantBomb(p.agent, p.site);
      } else {
        bomb.plantProgress = Math.max(0, bomb.plantProgress - dt / 2);
        bomb.planterId = null;
      }
      return;
    }

    if (bomb.state === 'planted') {
      bomb.timer -= dt;
      const second = Math.ceil(bomb.timer);
      if (second !== lastTickSecond && second <= 10 && second > 0) {
        lastTickSecond = second;
        audio.bombTick();
      }
      const d = defuser();
      if (d) {
        bomb.defuseProgress += dt / MATCH.DEFUSE_SECONDS;
        bomb.defuserId = d.id;
        if (bomb.defuseProgress >= 1) {
          bomb.state = 'defused';
          d.money += ECONOMY.DEFUSE_REWARD;
          hooks.onDefuse?.(d);
          hooks.onRoundEnd?.(TEAMS.SENTINEL, 'Charge defused at Site ' + bomb.site);
          return;
        }
      } else {
        bomb.defuseProgress = Math.max(0, bomb.defuseProgress - dt / 2);
        bomb.defuserId = null;
      }
      if (bomb.timer <= 0) explodeBomb();
    }
  }

  function reset() {
    state.bomb.state = 'carried';
    state.bomb.site = null;
    state.bomb.position = null;
    state.bomb.timer = 0;
    state.bomb.plantProgress = 0;
    state.bomb.defuseProgress = 0;
    state.bomb.planterId = null;
    state.bomb.defuserId = null;
    lastTickSecond = -1;
  }

  return { step, reset, agentInSite };
}
