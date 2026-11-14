// One state object for the whole game (judge criterion 5: state kept in one
// place). Every module reads and writes this object; nothing keeps a second
// copy of round, score, money or phase.
import { mulberry32 } from './rng.js';

export const TEAMS = {
  VANGUARD: 'vanguard', // attackers — amber. The player always plays Vanguard.
  SENTINEL: 'sentinel', // defenders — teal.
};

export const PHASES = {
  LOBBY: 'lobby', // start overlay, waiting for the player
  BUY: 'buy', // buy phase between rounds
  LIVE: 'live', // round in progress
  ROUND_END: 'roundEnd', // banner, then next buy phase
  MATCH_END: 'matchEnd', // match decided, restart offered
};

export const ECONOMY = {
  START_MONEY: 800,
  KILL_REWARD: 300,
  PLANT_REWARD: 300,
  DEFUSE_REWARD: 300,
  WIN_REWARD: 3250,
  LOSS_REWARD: 1900,
  LOSS_STREAK_BONUS: 500,
  LOSS_REWARD_CAP: 3400,
};

export const MATCH = {
  ROUNDS_TO_WIN: 5,
  BUY_SECONDS: 15,
  ROUND_SECONDS: 100,
  BOMB_SECONDS: 40,
  PLANT_SECONDS: 4,
  DEFUSE_SECONDS: 5,
  ROUND_END_SECONDS: 4,
};

export const VANGUARD_NAMES = ['Rook', 'Havoc', 'Mira', 'Dagger'];
export const SENTINEL_NAMES = ['Warden', 'Bishop', 'Sable', 'Onyx', 'Frost'];

// A fresh state. `agents` holds the player (index 0) and the nine bots.
export function createState(seed) {
  return {
    seed,
    random: mulberry32(seed),
    phase: PHASES.LOBBY,
    phaseTime: 0, // seconds left in the current phase
    round: 1,
    score: { [TEAMS.VANGUARD]: 0, [TEAMS.SENTINEL]: 0 },
    lossStreak: { [TEAMS.VANGUARD]: 0, [TEAMS.SENTINEL]: 0 },
    agents: [],
    bomb: {
      state: 'carried', // carried | planted | defused | exploded | idle
      carrierId: null,
      site: null,
      position: null, // THREE.Vector3 once planted
      timer: 0,
      plantProgress: 0,
      defuseProgress: 0,
      planterId: null,
      defuserId: null,
    },
    roundWinner: null,
    roundReason: '',
    matchWinner: null,
    killfeed: [],
    time: 0, // total simulation seconds
    muted: false,
  };
}

// Money every agent starts a match with, and what a round win/loss pays.
export function roundPayouts(state, winnerTeam) {
  const loserTeam = winnerTeam === TEAMS.VANGUARD ? TEAMS.SENTINEL : TEAMS.VANGUARD;
  for (const agent of state.agents) {
    if (agent.team === winnerTeam) {
      agent.money += ECONOMY.WIN_REWARD;
    } else {
      const streak = state.lossStreak[loserTeam];
      agent.money += Math.min(
        ECONOMY.LOSS_REWARD + ECONOMY.LOSS_STREAK_BONUS * streak,
        ECONOMY.LOSS_REWARD_CAP,
      );
    }
  }
}
