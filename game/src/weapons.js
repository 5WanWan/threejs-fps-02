// weapons.js — weapon and grenade definitions plus the buy catalogue.
// Damage is per body hit; headshots multiply by 2. Prices are the economy the
// buy menu and the bots both use.
export const WEAPONS = {
  p9: {
    name: 'P9 Sidearm', price: 0, slot: 2,
    damage: 26, headMult: 2, rate: 0.32, auto: false,
    mag: 12, reserve: 48, reload: 1.4,
    spread: 0.95, moveSpread: 1.6, adsSpread: 0.55,
    recoil: 0.011, kick: 0.35, range: 60,
    sound: 'pistol', tracer: 0xffe08a,
  },
  ar77: {
    name: 'AR-77 Rifle', price: 1600, slot: 1,
    damage: 33, headMult: 2, rate: 0.105, auto: true,
    mag: 30, reserve: 90, reload: 2.2,
    spread: 0.55, moveSpread: 1.9, adsSpread: 0.30,
    recoil: 0.014, kick: 0.5, range: 90,
    sound: 'rifle', tracer: 0xffd27a,
  },
  sr90: {
    name: 'SR-90 Longshot', price: 2200, slot: 1,
    damage: 88, headMult: 2.2, rate: 1.25, auto: false,
    mag: 5, reserve: 15, reload: 3.0,
    spread: 0.12, moveSpread: 3.2, adsSpread: 0.05,
    recoil: 0.05, kick: 1.6, range: 140,
    sound: 'sniper', tracer: 0xfff2c0, scoped: true,
  },
  vex9: {
    name: 'VEX-9 SMG', price: 900, slot: 1,
    damage: 22, headMult: 2, rate: 0.072, auto: true,
    mag: 32, reserve: 96, reload: 1.9,
    spread: 1.05, moveSpread: 1.5, adsSpread: 0.6,
    recoil: 0.009, kick: 0.3, range: 55,
    sound: 'smg', tracer: 0xffe08a,
  },
};

export const GRENADES = {
  frag: { name: 'Frag Grenade', price: 200, radius: 7, maxDamage: 95, fuse: 1.4 },
  smoke: { name: 'Smoke Grenade', price: 150, radius: 5.5, duration: 11 },
  flash: { name: 'Flashbang', price: 150, radius: 18, duration: 3 },
};

export const BUY_ITEMS = [
  { kind: 'weapon', id: 'ar77', key: '1' },
  { kind: 'weapon', id: 'sr90', key: '2' },
  { kind: 'weapon', id: 'vex9', key: '3' },
  { kind: 'armor', id: 'kevlar', key: '4', name: 'Kevlar Vest', price: 150 },
  { kind: 'grenade', id: 'frag', key: '5' },
  { kind: 'grenade', id: 'smoke', key: '6' },
  { kind: 'grenade', id: 'flash', key: '7' },
  { kind: 'ammo', id: 'ammo', key: '8', name: 'Refill Ammo', price: 100 },
];

export function weaponOf(f) { return WEAPONS[f.weapon]; }

export function giveWeapon(f, id) {
  const w = WEAPONS[id];
  if (!w) return false;
  if (!f.weapons[id]) f.weapons[id] = { mag: w.mag, reserve: w.reserve };
  else { f.weapons[id].mag = w.mag; f.weapons[id].reserve = w.reserve; }
  f.weapon = id;
  return true;
}

export function buyItem(f, item) {
  if (item.kind === 'weapon') {
    const w = WEAPONS[item.id];
    if (f.money < w.price || f.weapons[item.id]) return false;
    f.money -= w.price;
    giveWeapon(f, item.id);
    return true;
  }
  if (item.kind === 'armor') {
    if (f.money < item.price || f.hasKevlar) return false;
    f.money -= item.price;
    f.hasKevlar = true; f.armor = 100;
    return true;
  }
  if (item.kind === 'grenade') {
    const g = GRENADES[item.id];
    if (f.money < g.price || f.grenades[item.id] >= 2) return false;
    f.money -= g.price;
    f.grenades[item.id]++;
    return true;
  }
  if (item.kind === 'ammo') {
    const w = WEAPONS[f.weapon];
    const slot = f.weapons[f.weapon];
    if (f.money < item.price || slot.reserve >= w.reserve) return false;
    f.money -= item.price;
    slot.reserve = w.reserve;
    return true;
  }
  return false;
}
