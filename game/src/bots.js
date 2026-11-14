// Bots: nine of them, four Vanguard teammates and five Sentinel defenders.
// Each bot is a full agent (same health, weapons, money and hitboxes as the
// player) driven by a small state machine: buy, follow a route through the
// waypoint graph, hold a position, engage what it sees, plant or defuse the
// charge, and rotate when it hears gunfire or the bomb goes down. A bot only
// shoots after a reaction delay, aims with error that grows with distance and
// movement, and fires in bursts — so it feels like a player, not an aimbot.
// Bots also use their grenades: a bot holding a frag lobs it at a distant
// enemy it can see, and a bot holding smoke throws it to cover a site push.
import * as THREE from 'three';
import { TEAMS, VANGUARD_NAMES, SENTINEL_NAMES, MATCH } from './state.js';
import { createLoadout, buy } from './weapons.js';
import { pick, int } from './rng.js';
import { V1 } from './tmp.js';

const BOT_RADIUS = 0.36;
const BOT_WALK = 3.9;
const BOT_EYE = 1.55;
const DECIDE_HZ = 10;

function buildBotMesh(scene, agent) {
  const teamColor = agent.team === TEAMS.VANGUARD ? 0xf0a830 : 0x2fb8a8;
  const group = new THREE.Group();
  const cloth = new THREE.MeshStandardMaterial({ color: agent.team === TEAMS.VANGUARD ? 0x4a4034 : 0x2e4442, roughness: 0.85 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c1f23, roughness: 0.8 });
  const trim = new THREE.MeshStandardMaterial({ color: teamColor, roughness: 0.4, emissive: teamColor, emissiveIntensity: 0.9 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.72, 0.3), cloth);
  torso.position.y = 1.05;
  torso.castShadow = true;
  group.add(torso);
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.4, 0.34), dark);
  vest.position.y = 1.12;
  group.add(vest);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), cloth);
  head.position.y = 1.62;
  head.castShadow = true;
  group.add(head);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.06, 0.05), trim);
  visor.position.set(0, 1.63, 0.15);
  group.add(visor);
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.72, 0.2), dark);
    leg.position.set(side * 0.13, 0.36, 0);
    group.add(leg);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.55, 0.13), cloth);
    arm.position.set(side * 0.32, 1.05, 0.08);
    arm.rotation.x = -0.9;
    group.add(arm);
  }
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.62), dark);
  gun.position.set(0.1, 1.28, 0.35);
  group.add(gun);

  torso.userData = { agent, part: 'body' };
  head.userData = { agent, part: 'head' };
  vest.userData = { agent, part: 'body' };
  for (const leg of group.children) {
    if (leg.geometry?.parameters?.width === 0.17) leg.userData = { agent, part: 'legs' };
  }
  group.userData.bodyMesh = torso;
  group.userData.headMesh = head;
  group.userData.legsMesh = vest;
  group.position.copy(agent.pos);
  scene.add(group);
  return group;
}

export function createBotAgent(id, name, team, spawn) {
  return {
    id,
    name,
    team,
    isPlayer: false,
    alive: true,
    pos: new THREE.Vector3(spawn[0], 0, spawn[1]),
    vel: new THREE.Vector3(),
    yaw: team === TEAMS.VANGUARD ? Math.PI : 0,
    pitch: 0,
    eye: BOT_EYE,
    hp: 100,
    armor: 0,
    money: 800,
    kills: 0,
    deaths: 0,
    loadout: createLoadout(),
    grenades: { frag: 0, smoke: 0, flash: 0 },
    crouched: false,
    onGround: true,
    speed2d: 0,
    hasCharge: false,
    lastDamageAt: -10,
    lastDamageFrom: null,
    flashUntil: 0,
    aiming: false,
    mesh: null,
    bot: {
      state: 'route',
      path: [],
      pathIndex: 0,
      target: null,
      reactUntil: 0,
      aimError: 0.03,
      burstLeft: 0,
      nextBurstAt: 0,
      nextGrenadeAt: 0,
      holdNode: null,
      planSite: 'A',
      strafeDir: 1,
      strafeUntil: 0,
      decideAt: 0,
      investigate: null,
      planting: 0,
      defusing: 0,
      skill: 0.6 + Math.random() * 0.4,
    },
  };
}

export function createBots(scene, state, world, combat, effects) {
  const bots = [];
  let botCount = 0;

  function spawnRound() {
    if (bots.length === 0) {
      // First call: build the roster and attach it to the state.
      const random = state.random;
      VANGUARD_NAMES.forEach((name, i) => {
        const spawn = world.spawns.vanguard[i + 1];
        const agent = createBotAgent(`bot-v${i}`, name, TEAMS.VANGUARD, spawn);
        agent.bot.skill = 0.55 + random() * 0.35;
        agent.mesh = buildBotMesh(scene, agent);
        bots.push(agent);
        state.agents.push(agent);
      });
      SENTINEL_NAMES.forEach((name, i) => {
        const spawn = world.spawns.sentinel[i];
        const agent = createBotAgent(`bot-s${i}`, name, TEAMS.SENTINEL, spawn);
        agent.bot.skill = 0.55 + random() * 0.35;
        agent.mesh = buildBotMesh(scene, agent);
        bots.push(agent);
        state.agents.push(agent);
      });
      // Team plans: attackers split 2 A / 2 B; defenders 2 A / 2 B / 1 mid.
      const attackers = bots.filter((b) => b.team === TEAMS.VANGUARD);
      attackers[0].bot.planSite = 'A';
      attackers[1].bot.planSite = 'A';
      attackers[2].bot.planSite = 'B';
      attackers[3].bot.planSite = 'B';
      const defenders = bots.filter((b) => b.team === TEAMS.SENTINEL);
      defenders[0].bot.holdNode = 'ha1';
      defenders[1].bot.holdNode = 'ha2';
      defenders[2].bot.holdNode = 'hb1';
      defenders[3].bot.holdNode = 'hb2';
      defenders[4].bot.holdNode = 'm1';
    }
    // Every round: the charge starts with the player.
    const player = state.agents[0];
    player.hasCharge = true;
    state.bomb.carrierId = player.id;
    state.bomb.state = 'carried';
  }

  function botBuy(agent) {
    // Simple economy: rifle when affordable, shotgun when poor, armour when
    // rich, and a grenade most rounds — bots use what they buy.
    if (agent.money >= 2700 && !agent.loadout.owned.ar77) buy(agent, 'ar77');
    else if (agent.money >= 1200 && !agent.loadout.owned.sg12 && agent.loadout.current === 'p9') buy(agent, 'sg12');
    if (agent.money >= 650 && agent.loadout.armor === 0) buy(agent, 'armor');
    if (agent.money >= 300 && state.random() < 0.5) buy(agent, 'frag');
    if (agent.money >= 300 && state.random() < 0.3) buy(agent, 'smoke');
  }

  function visibleEnemy(bot) {
    let best = null;
    let bestScore = Infinity;
    for (const other of state.agents) {
      if (!other.alive || other.team === bot.team) continue;
      const dx = other.pos.x - bot.pos.x;
      const dz = other.pos.z - bot.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 55) continue;
      // Field of view: ~110 degrees in front.
      const forwardX = -Math.sin(bot.yaw);
      const forwardZ = -Math.cos(bot.yaw);
      const dot = (dx * forwardX + dz * forwardZ) / (dist || 1);
      if (dot < 0.25 && dist > 4) continue;
      if (effects.smokeBlocks(bot.pos.x, bot.pos.y + bot.eye, bot.pos.z, other.pos.x, other.pos.y + 1.2, other.pos.z)) continue;
      if (!world.hasLineOfSight(bot.pos.x, bot.pos.y + bot.eye, bot.pos.z, other.pos.x, other.pos.y + 1.2, other.pos.z)) continue;
      const score = dist + (other.isPlayer ? -2 : 0);
      if (score < bestScore) { bestScore = score; best = other; }
    }
    return best;
  }

  function setPath(bot, targetNodeId) {
    const from = world.nearestWaypoint(bot.pos.x, bot.pos.z);
    bot.bot.path = world.findPath(from, targetNodeId);
    bot.bot.pathIndex = 0;
  }

  function decide(bot, dt) {
    const b = bot.bot;
    const random = state.random;
    // --- combat first: what can I see? ---
    const enemy = visibleEnemy(bot);
    if (enemy) {
      if (b.target !== enemy) {
        b.target = enemy;
        // Reaction delay: worse skill and longer distance mean slower reactions.
        const dist = bot.pos.distanceTo(enemy.pos);
        b.reactUntil = state.time + 0.22 + (1 - b.skill) * 0.28 + dist * 0.004;
        b.burstLeft = 0;
      }
      b.state = 'engage';
      b.investigate = null;
    } else if (b.state === 'engage') {
      b.target = null;
      b.state = 'route';
    }

    if (b.state === 'engage') return;

    // --- objective ---
    const bomb = state.bomb;
    if (bot.team === TEAMS.VANGUARD) {
      if (bomb.state === 'planted') {
        // Attackers hold the site and watch the bomb.
        if (!b.holdNode || b.path.length === 0) setPath(bot, bomb.site === 'A' ? 'ha1' : 'hb1');
        b.state = 'route';
        return;
      }
      if (bot.hasCharge) {
        const site = world.sites[b.planSite];
        const dist = Math.hypot(bot.pos.x - site.position.x, bot.pos.z - site.position.z);
        if (dist < site.radius - 0.5) {
          // Site clear of visible enemies (checked above): start planting.
          b.state = 'plant';
          return;
        }
        if (b.path.length === 0 || b.state !== 'route') {
          setPath(bot, b.planSite === 'A' ? 'a3' : 'b3');
          b.state = 'route';
        }
        return;
      }
      // Non-carriers push their lane; a smoke in hand covers the push.
      if (b.path.length === 0) {
        const node = b.planSite === 'A' ? pick(random, ['a1', 'a2', 'a3']) : pick(random, ['b1', 'b2', 'b3']);
        setPath(bot, node);
        b.state = 'route';
        if (bot.loadout.grenades.smoke > 0 && state.time > b.nextGrenadeAt && random() < 0.5) {
          combat.throwGrenade(bot, 'smoke');
          b.nextGrenadeAt = state.time + 20 + random() * 10;
        }
      }
    } else {
      // Sentinel
      if (bomb.state === 'planted') {
        // Everyone rotates to the planted site to defuse.
        const node = bomb.site === 'A' ? 'a3' : 'b3';
        const dist = Math.hypot(bot.pos.x - world.sites[bomb.site].position.x, bot.pos.z - world.sites[bomb.site].position.z);
        if (dist < 3.5) {
          b.state = 'defuse';
          return;
        }
        if (b.path.length === 0 || b.state !== 'route') {
          setPath(bot, node);
          b.state = 'route';
        }
        return;
      }
      if (b.investigate) {
        const node = world.nearestWaypoint(b.investigate.x, b.investigate.z);
        if (b.path.length === 0) {
          setPath(bot, node);
          b.state = 'route';
        }
        const dist = Math.hypot(bot.pos.x - b.investigate.x, bot.pos.z - b.investigate.z);
        if (dist < 3) b.investigate = null;
        return;
      }
      // Hold the assigned position.
      if (b.holdNode) {
        const node = world.waypointMap.get(b.holdNode);
        const dist = Math.hypot(bot.pos.x - node.x, bot.pos.z - node.z);
        if (dist > 1.2 && b.path.length === 0) {
          setPath(bot, b.holdNode);
          b.state = 'route';
        } else if (dist <= 1.2) {
          b.state = 'hold';
          // Scan: slowly turn to look down the lane.
          bot.yaw += Math.sin(state.time * 0.5 + botCount) * 0.002;
        }
      }
    }
  }

  function moveAlongPath(bot, dt) {
    const b = bot.bot;
    if (b.path.length === 0 || b.pathIndex >= b.path.length) return;
    const node = world.waypointMap.get(b.path[b.pathIndex]);
    const dx = node.x - bot.pos.x;
    const dz = node.z - bot.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.9) {
      b.pathIndex += 1;
      if (b.pathIndex >= b.path.length) b.path = [];
      return;
    }
    const speed = BOT_WALK * (bot.crouched ? 0.55 : 1);
    bot.vel.x = (dx / dist) * speed;
    bot.vel.z = (dz / dist) * speed;
    bot.yaw = Math.atan2(-dx, -dz);
    bot.pos.x += bot.vel.x * dt;
    world.collide(bot.pos, BOT_RADIUS);
    bot.pos.z += bot.vel.z * dt;
    world.collide(bot.pos, BOT_RADIUS);
    bot.speed2d = speed;
  }

  function engageStep(bot, dt) {
    const b = bot.bot;
    const target = b.target;
    if (!target || !target.alive) { b.target = null; return; }
    const dx = target.pos.x - bot.pos.x;
    const dy = target.pos.y + 1.25 - (bot.pos.y + bot.eye);
    const dz = target.pos.z - bot.pos.z;
    const dist = Math.hypot(dx, dy, dz) || 1;
    const wantYaw = Math.atan2(-dx, -dz);
    const wantPitch = Math.asin(Math.max(-1, Math.min(1, dy / dist)));
    // Turn rate limit: bots cannot snap.
    let dyaw = wantYaw - bot.yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    const turn = 3.2 * b.skill + 1.2;
    bot.yaw += Math.max(-turn * dt, Math.min(turn * dt, dyaw));
    bot.pitch += Math.max(-turn * dt, Math.min(turn * dt, wantPitch - bot.pitch));

    // Aim error: grows with distance, target speed and own movement.
    const moveErr = bot.speed2d * 0.004;
    const distErr = dist * 0.0009;
    const skillErr = (1 - b.skill) * 0.02;
    b.aimError = 0.012 + moveErr + distErr + skillErr;
    bot.yaw += (state.random() * 2 - 1) * b.aimError * 0.35;
    bot.pitch += (state.random() * 2 - 1) * b.aimError * 0.35;

    // Strafe while fighting.
    if (state.time > b.strafeUntil) {
      b.strafeDir = state.random() > 0.5 ? 1 : -1;
      b.strafeUntil = state.time + 0.5 + state.random() * 0.9;
    }
    const strafeSpeed = 2.2;
    const px = Math.cos(bot.yaw) * b.strafeDir;
    const pz = -Math.sin(bot.yaw) * b.strafeDir;
    bot.pos.x += px * strafeSpeed * dt;
    world.collide(bot.pos, BOT_RADIUS);
    bot.pos.z += pz * strafeSpeed * dt;
    world.collide(bot.pos, BOT_RADIUS);
    bot.speed2d = strafeSpeed;

    // A frag at a distant enemy is worth more than a long spray.
    if (dist > 10 && bot.loadout.grenades.frag > 0 && state.time > b.nextGrenadeAt && state.random() < 0.02) {
      if (combat.throwGrenade(bot, 'frag')) {
        b.nextGrenadeAt = state.time + 18 + state.random() * 10;
        return;
      }
    }

    // Fire in bursts after the reaction delay.
    if (state.time >= b.reactUntil && state.time >= b.nextBurstAt) {
      if (b.burstLeft <= 0) {
        b.burstLeft = 3 + int(state.random, 0, 4);
        b.nextBurstAt = state.time + 0.35 + state.random() * 0.5;
      }
    }
    if (b.burstLeft > 0 && state.time >= b.reactUntil) {
      const fired = combat.shoot(bot);
      if (fired) b.burstLeft -= 1;
      else if (bot.loadout.owned[bot.loadout.current]?.mag === 0) combat.reload(bot);
    }
  }

  function step(dt) {
    for (const bot of bots) {
      if (!bot.alive) continue;
      const b = bot.bot;
      botCount += 1;
      // Decisions at 10 Hz, staggered.
      if (state.time >= b.decideAt) {
        b.decideAt = state.time + 1 / DECIDE_HZ + (botCount % 5) * 0.02;
        decide(bot, dt);
      }
      // Bloom decays; reload progresses (handled by combat.reload timing).
      bot.loadout.bloom = Math.max(0, bot.loadout.bloom - 0.05 * dt);

      if (b.state === 'plant') {
        b.planting += dt;
        bot.vel.set(0, 0, 0);
        bot.speed2d = 0;
        if (b.planting >= MATCH.PLANT_SECONDS) {
          b.planting = 0;
          b.state = 'route';
          b.path = [];
          // The objective module completes the plant (main.js wires it).
          bot.hasCharge = false;
          state.bomb.plantProgress = 1;
        }
        continue;
      }
      if (b.state === 'defuse') {
        b.defusing += dt;
        bot.vel.set(0, 0, 0);
        bot.speed2d = 0;
        if (b.defusing >= MATCH.DEFUSE_SECONDS) {
          b.defusing = 0;
          b.state = 'route';
          state.bomb.defuseProgress = 1;
        }
        continue;
      }
      if (b.state === 'engage') {
        engageStep(bot, dt);
      } else if (b.state === 'route') {
        moveAlongPath(bot, dt);
      } else {
        bot.vel.set(0, 0, 0);
        bot.speed2d = 0;
      }

      // Separation: bots do not stack on each other.
      for (const other of state.agents) {
        if (other === bot || !other.alive) continue;
        const dx = bot.pos.x - other.pos.x;
        const dz = bot.pos.z - other.pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 0.55 * 0.55 && d2 > 0.0001) {
          const d = Math.sqrt(d2);
          const push = (0.55 - d) * 0.5;
          bot.pos.x += (dx / d) * push;
          bot.pos.z += (dz / d) * push;
        }
      }

      // Sync the mesh to the agent.
      if (bot.mesh) {
        bot.mesh.position.set(bot.pos.x, bot.pos.y, bot.pos.z);
        bot.mesh.rotation.y = bot.yaw;
        bot.mesh.visible = true;
      }
    }
  }

  function onShotHeard(shooter) {
    for (const bot of bots) {
      if (!bot.alive || bot.team === shooter.team) continue;
      const dist = bot.pos.distanceTo(shooter.pos);
      if (dist < 30 && bot.bot.state !== 'engage') {
        bot.bot.investigate = { x: shooter.pos.x, z: shooter.pos.z };
      }
    }
  }

  function resetRound() {
    for (const bot of bots) {
      bot.bot.state = 'route';
      bot.bot.path = [];
      bot.bot.pathIndex = 0;
      bot.bot.target = null;
      bot.bot.planting = 0;
      bot.bot.defusing = 0;
      bot.bot.investigate = null;
      bot.bot.nextGrenadeAt = 0;
      bot.loadout.bloom = 0;
    }
  }

  return { bots, spawnRound, botBuy, step, onShotHeard, resetRound };
}
