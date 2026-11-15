// state.js — one object owns the whole match. Every module reads and writes
// this state; nothing keeps a second copy of phase, score, money or timers.
export const PHASE = {
  MENU: 'menu',       // start overlay, scene idles behind it
  BUY: 'buy',         // buy phase: menu open, players in spawn
  LIVE: 'live',       // round is being played
  ROUND_END: 'roundEnd', // banner, then next round
  MATCH_END: 'matchEnd',
};

export const SIDE = { CINDER: 0, SLAG: 1 };
export const WIN_SCORE = 5;
export const BUY_TIME = 15;
export const ROUND_TIME = 100;
export const PLANT_TIME = 3.5;
export const DEFUSE_TIME = 5;
export const DETONATE_TIME = 40;

export function createState(seed) {
  return {
    seed,
    phase: PHASE.MENU,
    round: 1,
    score: [0, 0],          // [Cinder, Slag]
    timeLeft: BUY_TIME,
    roundWinner: -1,
    roundReason: '',
    matchWinner: -1,
    // Economy: awarded at round start from the previous round's result.
    money: 800,
    lastRoundWon: null,     // true if Cinder won the last round
    charge: {
      state: 'carried',     // carried | dropped | planted | gone
      carrier: null,        // entity id carrying it (player or a bot)
      site: -1,             // 0 = Kiln (A), 1 = Gantry (B)
      x: 0, z: 0,
      plantProgress: 0,
      defuseProgress: 0,
      detonateLeft: 0,
      planter: null,
      defuser: null,
    },
    killfeed: [],           // {text, cls, t}
    events: [],             // one-frame event queue drained by main (shots, hits, deaths...)
    playerId: 0,
    entities: [],           // all fighters: player first, then bots
    stats: { shots: 0, hits: 0, kills: 0, headshots: 0, roundsPlayed: 0 },
    startedAt: 0,
    shotMode: null,         // ?shot= staging: start | buy | play | end
    timeScale: 1,
  };
}

// A fighter: the player and every bot share this shape. Bots add ai fields.
export function createFighter(id, name, side, x, z, yaw, isPlayer) {
  return {
    id, name, side, isPlayer: !!isPlayer,
    x, z, y: 0, yaw, pitch: 0,
    vx: 0, vy: 0, vz: 0,
    onGround: true,
    crouch: false,
    alive: true,
    hp: 100, armor: 0,
    money: 800,
    weapon: 'p9',
    weapons: { p9: { reserve: 48, mag: 12 } },
    grenades: { frag: 0, smoke: 0, flash: 0 },
    hasKevlar: false,
    // combat state
    spread: 0, recoil: 0, lastShot: -9, lastDamageAt: -9, lastDamageFrom: null,
    ads: false, reloading: 0, reloadTotal: 0,
    moveAmount: 0,           // 0..1 how much the fighter is moving (spread penalty)
    flashUntil: 0, flashStrength: 0,
    plantProgress: 0, defuseProgress: 0,
    // bot-only (filled by bots.js)
    ai: null,
    // render handles (filled by main.js)
    mesh: null, bodyMesh: null, headMesh: null, gunMesh: null, marker: null,
    lastSeen: -9,            // when an enemy last saw this fighter (minimap)
    kills: 0, deaths: 0,
    spawnX: x, spawnZ: z, spawnYaw: yaw,
  };
}
