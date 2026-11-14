// Seeded RNG (mulberry32): every deterministic part of CINDERLINE — map
// scatter, bot picks, spread rolls in shot mode — draws from one seeded
// stream so a screenshot seed reproduces the same frame.
export function mulberry32(initial) {
  let a = initial | 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Pick one element of an array with the given random function.
export function pick(random, array) {
  return array[Math.floor(random() * array.length)];
}

// Integer in [min, max).
export function int(random, min, max) {
  return min + Math.floor(random() * (max - min));
}
