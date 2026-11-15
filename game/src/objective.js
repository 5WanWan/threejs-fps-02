// objective.js — round flow: buy phase, live play, detonation and defuse,
// win evaluation, economy awards, and match end at five round wins.
// main.js calls tickObjective every fixed step; it only mutates state.
import { PHASE, WIN_SCORE, BUY_TIME, ROUND_TIME } from './state.js';
import { giveWeapon } from './weapons.js';

export function aliveCount(state, side) {
  let n = 0;
  for (const e of state.entities) if (e.alive && e.side === side) n++;
  return n;
}

function awardRound(state, cinderWon, reason) {
  state.roundWinner = cinderWon ? 0 : 1;
  state.roundReason = reason;
  state.score[cinderWon ? 0 : 1]++;
  state.lastRoundWon = cinderWon;
  state.phase = PHASE.ROUND_END;
  state.timeLeft = 4;
  state.stats.roundsPlayed++;
  // Economy: winners get more; everyone gets a base award.
  for (const e of state.entities) {
    e.money += (e.side === 0) === cinderWon ? 400 : 200;
  }
  state.money = state.entities[0].money;
  state.events.push({ type: 'roundEnd', winner: cinderWon ? 0 : 1, reason });
}

export function tickObjective(state, world, dt, now) {
  const ch = state.charge;
  if (state.phase === PHASE.BUY) {
    state.timeLeft -= dt;
    if (state.timeLeft <= 0) {
      state.phase = PHASE.LIVE;
      state.timeLeft = ROUND_TIME;
      state.events.push({ type: 'live' });
    }
    return;
  }
  if (state.phase === PHASE.ROUND_END) {
    state.timeLeft -= dt;
    if (state.timeLeft <= 0) {
      if (state.score[0] >= WIN_SCORE || state.score[1] >= WIN_SCORE) {
        state.matchWinner = state.score[0] > state.score[1] ? 0 : 1;
        state.phase = PHASE.MATCH_END;
      } else {
        startRound(state, world);
      }
    }
    return;
  }
  if (state.phase !== PHASE.LIVE) return;

  state.timeLeft -= dt;
  // Detonation countdown once planted.
  if (ch.state === 'planted') {
    ch.detonateLeft -= dt;
    if (ch.detonateLeft <= 0) {
      ch.state = 'gone';
      state.events.push({ type: 'detonation', x: ch.x, y: 0.5, z: ch.z });
      awardRound(state, true, 'Core Charge detonated at ' + world.sites[ch.site].name);
      return;
    }
  }
  if (ch.state === 'gone' && state._defused) {
    state._defused = false;
    awardRound(state, false, 'Core Charge defused');
    return;
  }
  const cinderAlive = aliveCount(state, 0);
  const slagAlive = aliveCount(state, 1);
  if (ch.state === 'planted') {
    // With the charge down, a wiped attacking team still wins on detonation;
    // a wiped defending team loses when it blows.
    if (slagAlive === 0) {
      ch.detonateLeft = Math.min(ch.detonateLeft, 1.2);
    }
    if (cinderAlive === 0) {
      // Nobody left to stop the defuse... defenders still must defuse in time.
      // If no defender reaches it, the timer decides. Nothing to do here.
    }
  } else {
    if (slagAlive === 0) { awardRound(state, true, 'Slag team eliminated'); return; }
    if (cinderAlive === 0) { awardRound(state, false, 'Cinder team eliminated'); return; }
  }
  if (state.timeLeft <= 0) {
    if (ch.state === 'planted') {
      ch.detonateLeft = Math.min(ch.detonateLeft, 0.5);
    } else {
      awardRound(state, false, 'Time expired — charge never planted');
    }
  }
}

export function startRound(state, world) {
  state.round++;
  state.phase = PHASE.BUY;
  state.timeLeft = BUY_TIME;
  state.roundWinner = -1;
  state.roundReason = '';
  const ch = state.charge;
  ch.state = 'carried';
  ch.site = -1;
  ch.plantProgress = 0;
  ch.defuseProgress = 0;
  ch.detonateLeft = 0;
  ch.planter = null;
  ch.defuser = null;
  state._defused = false;
  // Respawn everyone at their team's spawn; the dead lose their loadout.
  for (let i = 0; i < state.entities.length; i++) {
    const e = state.entities[i];
    const spawns = world.spawns[e.side === 0 ? 'cinder' : 'slag'];
    const s = spawns[i % spawns.length];
    e.x = s.x; e.z = s.z; e.y = 0;
    e.yaw = s.yaw; e.pitch = 0;
    e.vx = 0; e.vy = 0; e.vz = 0;
    e.alive = true; e.hp = 100;
    e.hasKevlar = false; e.armor = 0;
    e.flashUntil = 0; e.flashStrength = 0;
    e.plantProgress = 0; e.defuseProgress = 0;
    e.reloading = 0; e.recoil = 0;
    e.spawnX = s.x; e.spawnZ = s.z; e.spawnYaw = s.yaw;
    if (e.isPlayer) {
      // The player keeps their money and loadout when they survived.
      if (state._playerDied) {
        e.weapons = { p9: { mag: 12, reserve: 48 } };
        e.weapon = 'p9';
        e.grenades = { frag: 0, smoke: 0, flash: 0 };
      }
    } else {
      e.weapons = { p9: { mag: 12, reserve: 48 } };
      e.weapon = 'p9';
      e.grenades = { frag: 0, smoke: 0, flash: 0 };
      if (e.ai) { e.ai.path = []; e.ai.pathI = 0; e.ai.holdNode = -1; e.ai.investigate = null; }
    }
    e.money = e.money; // money persists across rounds (awarded in awardRound)
  }
  state._playerDied = false;
  // The charge goes to the player by default.
  ch.carrier = state.entities[0];
  state.events.push({ type: 'roundStart', round: state.round });
}

export function startMatch(state, world) {
  state.round = 0;
  state.score = [0, 0];
  state.matchWinner = -1;
  state.money = 800;
  state.entities[0].money = 800;
  state.lastRoundWon = null;
  state._playerDied = false;
  startRound(state, world);
  state.phase = PHASE.BUY;
  state.timeLeft = BUY_TIME;
}

// Called by main.js when a defuse completes (the channel sets state 'gone').
export function noteDefused(state) {
  state._defused = true;
}
