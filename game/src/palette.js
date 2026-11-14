// CINDERLINE look plan: a smelter yard at dusk, brighter than a foundry at
// night so the scene reads at a glance in a screenshot. One palette, used
// everywhere — canvas (sky/fog), surface (concrete), hairline (dark steel),
// ink (warm white), muted (cool grey), amber (Vanguard + kiln glow) and teal
// (Sentinel + gantry lights). All textures are drawn on canvas at runtime:
// no image files, no network, and the game stays plain static files.
import * as THREE from 'three';

export const PALETTE = {
  canvas: 0x232a35, // dusk sky / fog — light enough that walls read
  surface: 0x33383f, // concrete ground
  hairline: 0x16191d, // dark steel
  ink: 0xe9e6df, // warm white
  muted: 0x8a939c, // cool grey
  amber: 0xf0a830, // Vanguard + kiln
  teal: 0x2fb8a8, // Sentinel + gantry
  rust: 0x9a5a34, // rusted metal
  danger: 0xd8402e, // hazard red
  molten: 0xff7a1a, // molten slag channel
};

const textureCache = new Map();

// Draw a 256x256 canvas with a painter function, cache it by key.
function canvasTexture(key, painter, repeatX = 1, repeatY = 1) {
  const hit = textureCache.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  painter(canvas.getContext('2d'), 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  textureCache.set(key, texture);
  return texture;
}

function speckle(ctx, size, count, alpha, light, dark) {
  for (let i = 0; i < count; i += 1) {
    const v = Math.random();
    ctx.fillStyle = v > 0.5 ? light : dark;
    ctx.globalAlpha = alpha * (0.4 + Math.random() * 0.6);
    const s = 1 + Math.random() * 2.5;
    ctx.fillRect(Math.random() * size, Math.random() * size, s, s);
  }
  ctx.globalAlpha = 1;
}

export function concreteTexture() {
  return canvasTexture('concrete', (ctx, s) => {
    ctx.fillStyle = '#3a3f46';
    ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, 2600, 0.16, '#54595f', '#2b2e33');
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, s - 2, s - 2);
    // expansion joints
    ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.moveTo(0, s / 2);
    ctx.lineTo(s, s / 2);
    ctx.moveTo(s / 2, 0);
    ctx.lineTo(s / 2, s);
    ctx.stroke();
  }, 12, 9);
}

export function hazardTexture() {
  return canvasTexture('hazard', (ctx, s) => {
    ctx.fillStyle = '#d8a020';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#191b1e';
    for (let i = -s; i < s * 2; i += 64) {
      ctx.beginPath();
      ctx.moveTo(i, s);
      ctx.lineTo(i + 32, 0);
      ctx.lineTo(i + 64, 0);
      ctx.lineTo(i + 32, s);
      ctx.closePath();
      ctx.fill();
    }
    speckle(ctx, s, 500, 0.12, '#ffffff', '#000000');
  });
}

export function metalTexture(base = '#454d56') {
  return canvasTexture(`metal${base}`, (ctx, s) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, 1400, 0.1, '#646e78', '#2a2e33');
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    for (let y = 0; y < s; y += 32) ctx.fillRect(0, y, s, 2);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (let y = 16; y < s; y += 32) ctx.fillRect(0, y, s, 2);
  });
}

export function rustTexture() {
  return canvasTexture('rust', (ctx, s) => {
    ctx.fillStyle = '#7a4a30';
    ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, 2200, 0.22, '#a86a42', '#4a2a1a');
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 8; i += 1) {
      const y = Math.random() * s;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(s, y + (Math.random() * 20 - 10));
      ctx.stroke();
    }
  });
}

export function fenceTexture() {
  return canvasTexture('fence', (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    ctx.strokeStyle = 'rgba(180,190,200,0.85)';
    ctx.lineWidth = 2;
    for (let i = -s; i < s * 2; i += 16) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + s, s);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(i + s, 0);
      ctx.lineTo(i, s);
      ctx.stroke();
    }
  });
}

export function containerTexture(color) {
  return canvasTexture(`container${color}`, (ctx, s) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, 1200, 0.12, '#ffffff', '#000000');
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    for (let x = 0; x < s; x += 32) ctx.fillRect(x, 0, 3, s);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(0, 0, s, 6);
  });
}

// Molten slag: a hot orange field with darker cooling cracks.
export function slagTexture() {
  return canvasTexture('slag', (ctx, s) => {
    ctx.fillStyle = '#ff7a1a';
    ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, 900, 0.35, '#ffc46b', '#c33d00');
    ctx.strokeStyle = 'rgba(60,10,0,0.55)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 10; i += 1) {
      const y = Math.random() * s;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(s * 0.3, y + 14, s * 0.6, y - 14, s, y + 6);
      ctx.stroke();
    }
  });
}

const materialCache = new Map();

// One shared MeshStandardMaterial per (color, roughness, metalness, map) key.
export function mat(color, options = {}) {
  const key = `${color}|${options.roughness ?? 0.9}|${options.metalness ?? 0}|${options.map ?? ''}|${options.emissive ?? ''}|${options.emissiveIntensity ?? 1}`;
  let material = materialCache.get(key);
  if (material) return material;
  material = new THREE.MeshStandardMaterial({
    color,
    roughness: options.roughness ?? 0.9,
    metalness: options.metalness ?? 0,
    map: options.map ?? null,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 1,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
    side: options.side ?? THREE.FrontSide,
  });
  materialCache.set(key, material);
  return material;
}
