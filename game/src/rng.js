// rng.js — deterministic seeded random numbers (mulberry32) and small helpers.
// The map, bot loadouts and screenshot staging all draw from one seeded stream,
// so a given seed replays the same round layout.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function range(rnd, lo, hi) { return lo + rnd() * (hi - lo); }
export function pick(rnd, arr) { return arr[Math.floor(rnd() * arr.length) % arr.length]; }
export function chance(rnd, p) { return rnd() < p; }
export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
// Frame-rate independent exponential approach: rate is per second.
export function damp(current, target, rate, dt) {
  const t = 1 - Math.exp(-rate * dt);
  return current + (target - current) * t;
}
export function angleLerp(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
