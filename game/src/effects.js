// effects.js — pooled visual effects: tracers, muzzle flashes, impact sparks,
// smoke clouds and explosions. Fixed pools, no allocation in the hot path;
// a tracer is one reused line segment, smoke is one reused sprite set.
import * as THREE from 'three';
import { V1 } from './tmp.js';

const MAX_TRACERS = 24;
const MAX_SPARKS = 40;
const MAX_SMOKES = 6;

export function createEffects(scene) {
  const fx = {
    tracers: [], sparks: [], smokes: [], flashes: [],
    shake: 0, shakeX: 0, shakeY: 0,
  };
  // Tracer pool: thin additive lines from muzzle to hit point.
  for (let i = 0; i < MAX_TRACERS; i++) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
      color: 0xffd27a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    line.frustumCulled = false;
    scene.add(line);
    fx.tracers.push({ line, life: 0 });
  }
  // Spark pool: tiny additive points that burst on impact.
  for (let i = 0; i < MAX_SPARKS; i++) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
    const p = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xffc46b, size: 0.14, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    p.frustumCulled = false;
    scene.add(p);
    fx.sparks.push({ p, life: 0, vx: 0, vy: 0, vz: 0 });
  }
  // Smoke pool: large soft sprites that drift and fade.
  for (let i = 0; i < MAX_SMOKES; i++) {
    const mat = new THREE.SpriteMaterial({ color: 0x9aa0ad, transparent: true, opacity: 0, depthWrite: false });
    const s = new THREE.Sprite(mat);
    s.scale.set(9, 9, 1);
    scene.add(s);
    fx.smokes.push({ s, life: 0, maxLife: 1, x: 0, y: 0, z: 0 });
  }
  // Muzzle flash pool: small additive sprites at gun muzzles.
  for (let i = 0; i < 6; i++) {
    const mat = new THREE.SpriteMaterial({ color: 0xffc46b, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const s = new THREE.Sprite(mat);
    s.scale.set(0.9, 0.9, 1);
    scene.add(s);
    fx.flashes.push({ s, life: 0 });
  }

  fx.tracer = (from, to, color = 0xffd27a) => {
    let t = fx.tracers.find((x) => x.life <= 0) || fx.tracers[0];
    const pos = t.line.geometry.attributes.position.array;
    pos[0] = from.x; pos[1] = from.y; pos[2] = from.z;
    pos[3] = to.x; pos[4] = to.y; pos[5] = to.z;
    t.line.geometry.attributes.position.needsUpdate = true;
    t.line.material.color.setHex(color);
    t.line.material.opacity = 0.95;
    t.life = 0.07;
  };

  fx.spark = (x, y, z) => {
    let s = fx.sparks.find((v) => v.life <= 0) || fx.sparks[0];
    s.p.position.set(x, y, z);
    s.vx = (Math.random() - 0.5) * 4; s.vy = Math.random() * 3 + 1; s.vz = (Math.random() - 0.5) * 4;
    s.p.material.opacity = 1;
    s.life = 0.35;
  };

  fx.muzzle = (x, y, z) => {
    const f = fx.flashes.find((v) => v.life <= 0) || fx.flashes[0];
    f.s.position.set(x, y, z);
    f.s.material.opacity = 0.95;
    f.s.material.rotation = Math.random() * Math.PI;
    f.life = 0.05;
  };

  fx.smokeAt = (x, y, z, duration) => {
    const s = fx.smokes.find((v) => v.life <= 0) || fx.smokes[0];
    s.x = x; s.y = y; s.z = z;
    s.s.position.set(x, y, z);
    s.maxLife = duration;
    s.life = duration;
  };

  fx.smokeBlocks = (x1, y1, z1, x2, y2, z2) => {
    for (const s of fx.smokes) {
      if (s.life <= 0) continue;
      // Segment vs sphere (radius 4.5) test.
      V1.set(x2 - x1, y2 - y1, z2 - z1);
      const len2 = V1.lengthSq();
      const t = len2 < 1e-9 ? 0 : Math.max(0, Math.min(1,
        ((s.x - x1) * V1.x + (s.y - y1) * V1.y + (s.z - z1) * V1.z) / len2));
      const cx = x1 + V1.x * t, cy = y1 + V1.y * t, cz = z1 + V1.z * t;
      const d2 = (s.x - cx) * (s.x - cx) + (s.y - cy) * (s.y - cy) + (s.z - cz) * (s.z - cz);
      if (d2 < 4.5 * 4.5) return true;
    }
    return false;
  };

  fx.explosion = (x, y, z) => {
    for (let i = 0; i < 10; i++) {
      const s = fx.sparks[(Math.random() * fx.sparks.length) | 0];
      s.p.position.set(x, y, z);
      const a = Math.random() * Math.PI * 2;
      s.vx = Math.cos(a) * (3 + Math.random() * 7);
      s.vy = 2 + Math.random() * 7;
      s.vz = Math.sin(a) * (3 + Math.random() * 7);
      s.p.material.opacity = 1;
      s.life = 0.6 + Math.random() * 0.4;
    }
    fx.shake = 1;
  };

  fx.addShake = (amount) => { fx.shake = Math.min(1, fx.shake + amount); };

  fx.update = (dt, t) => {
    for (const tr of fx.tracers) {
      if (tr.life > 0) {
        tr.life -= dt;
        tr.line.material.opacity = Math.max(0, tr.life / 0.07) * 0.95;
      }
    }
    for (const s of fx.sparks) {
      if (s.life > 0) {
        s.life -= dt;
        s.p.position.x += s.vx * dt;
        s.p.position.y += s.vy * dt;
        s.p.position.z += s.vz * dt;
        s.vy -= 9 * dt;
        s.p.material.opacity = Math.max(0, s.life / 0.35);
      }
    }
    for (const s of fx.smokes) {
      if (s.life > 0) {
        s.life -= dt;
        const k = Math.max(0, s.life / s.maxLife);
        s.s.material.opacity = 0.55 * Math.min(1, (s.maxLife - s.life) * 2) * k;
        const sc = 9 + (1 - k) * 3;
        s.s.scale.set(sc, sc, 1);
        s.s.position.y = s.y + Math.sin(t * 0.7 + s.x) * 0.3;
      }
    }
    for (const f of fx.flashes) {
      if (f.life > 0) {
        f.life -= dt;
        f.s.material.opacity = Math.max(0, f.life / 0.05) * 0.95;
      }
    }
    if (fx.shake > 0) {
      fx.shake = Math.max(0, fx.shake - dt * 1.6);
      fx.shakeX = (Math.random() - 0.5) * 0.12 * fx.shake;
      fx.shakeY = (Math.random() - 0.5) * 0.12 * fx.shake;
    } else { fx.shakeX = 0; fx.shakeY = 0; }
  };
  return fx;
}
