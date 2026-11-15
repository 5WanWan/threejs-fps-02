// palette.js — the Cinderline look: dusk indigo sky, warm slag orange, cold steel.
// All textures are drawn on canvases at load time; nothing is fetched over the
// network, so the game runs fully offline from static files.
import * as THREE from 'three';

export const PALETTE = {
  skyTop: 0x1b1440,
  skyBottom: 0x3a1f3d,
  fog: 0x241a33,
  ground: 0x33323a,
  concrete: 0x4a4852,
  concreteDark: 0x35343c,
  steel: 0x5d6470,
  steelDark: 0x3c414d,
  rust: 0x8a4a26,
  slag: 0xff6a00,
  slagHot: 0xffb347,
  kilnBrick: 0x7a3b2e,
  hazardYellow: 0xe8b400,
  hazardBlack: 0x1a1a1a,
  cinder: 0xf59e0b,   // player team (Cinder) trim
  slagTeam: 0xef4444, // enemy team (Slag) trim
  teal: 0x2dd4bf,     // HUD accent
  white: 0xf5f2ea,
};

const _cache = new Map();

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function noiseOn(ctx, w, h, rnd, n, alpha, light, dark) {
  for (let i = 0; i < n; i++) {
    const g = rnd() * 255 | 0;
    ctx.fillStyle = `rgba(${g},${g},${g},${alpha})`;
    ctx.fillRect(rnd() * w | 0, rnd() * h | 0, 1 + rnd() * 3, 1 + rnd() * 3);
  }
  void light; void dark;
}

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function concreteTexture() {
  if (_cache.has('concrete')) return _cache.get('concrete');
  const t = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#4a4852'; ctx.fillRect(0, 0, w, h);
    const rnd = seeded(11);
    noiseOn(ctx, w, h, rnd, 2600, 0.10);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, w - 2, h - 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h); ctx.stroke();
  });
  _cache.set('concrete', t);
  return t;
}

export function metalTexture() {
  if (_cache.has('metal')) return _cache.get('metal');
  const t = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#5d6470'; ctx.fillRect(0, 0, w, h);
    const rnd = seeded(23);
    noiseOn(ctx, w, h, rnd, 1400, 0.07);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (let y = 0; y < 4; y++) ctx.fillRect(0, y * 64 + 30, w, 3);
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    for (let y = 0; y < 4; y++) ctx.fillRect(0, y * 64 + 33, w, 2);
    // rivets
    ctx.fillStyle = 'rgba(20,20,24,0.6)';
    for (let x = 16; x < w; x += 32) for (let y = 16; y < h; y += 64) {
      ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
    }
  });
  _cache.set('metal', t);
  return t;
}

export function hazardTexture() {
  if (_cache.has('hazard')) return _cache.get('hazard');
  const t = canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#e8b400'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#1a1a1a';
    for (let i = -2; i < 6; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 32, h); ctx.lineTo(i * 32 + 32, 0);
      ctx.lineTo(i * 32 + 48, 0); ctx.lineTo(i * 32 + 16, h);
      ctx.closePath(); ctx.fill();
    }
  });
  _cache.set('hazard', t);
  return t;
}

export function slagTexture() {
  if (_cache.has('slag')) return _cache.get('slag');
  const t = canvasTexture(256, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, '#ff2d00'); g.addColorStop(0.45, '#ff6a00');
    g.addColorStop(0.7, '#ffb347'); g.addColorStop(1, '#ff3d00');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    const rnd = seeded(37);
    for (let i = 0; i < 90; i++) {
      ctx.fillStyle = `rgba(255,${180 + rnd() * 60 | 0},40,${0.25 + rnd() * 0.5})`;
      const y = rnd() * h;
      ctx.fillRect(rnd() * w, y, 8 + rnd() * 40, 1.5 + rnd() * 3);
    }
  });
  _cache.set('slag', t);
  return t;
}

export function brickTexture() {
  if (_cache.has('brick')) return _cache.get('brick');
  const t = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#7a3b2e'; ctx.fillRect(0, 0, w, h);
    const rnd = seeded(51);
    ctx.strokeStyle = 'rgba(20,8,6,0.55)'; ctx.lineWidth = 3;
    for (let y = 0; y < 8; y++) {
      const off = (y % 2) * 32;
      for (let x = -1; x < 5; x++) {
        ctx.fillStyle = `rgba(${110 + rnd() * 40 | 0},${52 + rnd() * 18 | 0},${40 + rnd() * 12 | 0},1)`;
        ctx.fillRect(x * 64 + off + 2, y * 32 + 2, 60, 28);
      }
      ctx.beginPath(); ctx.moveTo(0, y * 32); ctx.lineTo(w, y * 32); ctx.stroke();
    }
  });
  _cache.set('brick', t);
  return t;
}

export function siteLetterTexture(letter) {
  const key = 'site' + letter;
  if (_cache.has(key)) return _cache.get(key);
  const t = canvasTexture(128, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(10,10,16,0.55)';
    ctx.beginPath(); ctx.arc(64, 64, 58, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(64, 64, 58, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#f5f2ea';
    ctx.font = 'bold 72px system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(letter, 64, 68);
  });
  _cache.set(key, t);
  return t;
}

export function starTexture() {
  if (_cache.has('star')) return _cache.get('star');
  const t = canvasTexture(64, 64, (ctx) => {
    ctx.clearRect(0, 0, 64, 64);
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 30);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  });
  _cache.set('star', t);
  return t;
}

const _mats = new Map();
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (_mats.has(key)) return _mats.get(key);
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.15, ...opts });
  _mats.set(key, m);
  return m;
}
