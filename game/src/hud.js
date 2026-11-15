// hud.js — all DOM interface: health/armor/ammo/money/timer/score, killfeed,
// minimap (top-down canvas with walls, sites, teammates and last-seen enemies),
// buy menu, round banners, crosshair with dynamic spread, hitmarker, scope
// overlay, damage direction, and the plant/defuse progress bar.
import { WEAPONS, BUY_ITEMS, GRENADES } from './weapons.js';
import { PHASE, PLANT_TIME, DEFUSE_TIME } from './state.js';
import { MAP } from './world.js';

export function createHud(state, world, callbacks) {
  const $ = (id) => document.getElementById(id);
  const hud = {
    el: $('hud'), health: $('health'), armor: $('armor'), ammo: $('ammo'),
    money: $('money'), timer: $('timer'), score: $('score'),
    killfeed: $('killfeed'), minimap: $('minimap'),
    crosshair: $('crosshair'), hitmarker: $('hitmarker'),
    banner: $('banner'), subbanner: $('subbanner'),
    buyMenu: $('buy-menu'), buyGrid: $('buy-grid'),
    startOverlay: $('start-overlay'), endOverlay: $('end-overlay'),
    channel: $('channel'), channelFill: $('channel-fill'), channelLabel: $('channel-label'),
    scope: $('scope'), damageDir: $('damage-dir'),
    grenadeKind: $('grenade-kind'),
    mmCtx: null, _hitAt: -9, _hitHead: false, _dmgAt: -9, _dmgAngle: 0,
    _bannerUntil: 0,
  };
  if (hud.minimap) hud.mmCtx = hud.minimap.getContext('2d');

  hud.showBanner = (text, sub, dur = 3) => {
    hud.banner.textContent = text;
    hud.subbanner.textContent = sub || '';
    hud.el.classList.add('show-banner');
    hud._bannerUntil = performance.now() / 1000 + dur;
  };
  hud.hideBanner = () => hud.el.classList.remove('show-banner');

  hud.flashHit = (head) => {
    hud._hitAt = performance.now() / 1000; hud._hitHead = head;
    hud.hitmarker.classList.add('show');
    hud.hitmarker.classList.toggle('head', !!head);
  };
  hud.flashDamage = (angle) => {
    hud._dmgAt = performance.now() / 1000; hud._dmgAngle = angle;
    hud.damageDir.style.transform = `rotate(${angle}rad)`;
    hud.damageDir.classList.add('show');
  };

  hud.addKillfeed = (text, cls, now) => {
    const div = document.createElement('div');
    div.className = 'kf ' + (cls || '');
    div.textContent = text;
    hud.killfeed.prepend(div);
    while (hud.killfeed.children.length > 5) hud.killfeed.lastChild.remove();
    setTimeout(() => { div.classList.add('fade'); }, 4000);
  };

  // ---- buy menu --------------------------------------------------------------
  hud.renderBuy = () => {
    const p = state.entities[0];
    hud.buyGrid.innerHTML = '';
    for (const item of BUY_ITEMS) {
      const div = document.createElement('div');
      div.className = 'buy-item';
      let name, price, owned = false, afford = true;
      if (item.kind === 'weapon') {
        name = WEAPONS[item.id].name; price = WEAPONS[item.id].price;
        owned = !!p.weapons[item.id];
      } else if (item.kind === 'grenade') {
        name = GRENADES[item.id].name; price = GRENADES[item.id].price;
        owned = p.grenades[item.id] >= 2;
      } else {
        name = item.name; price = item.price;
        if (item.kind === 'armor') owned = p.hasKevlar;
        if (item.kind === 'ammo') owned = p.weapons[p.weapon].reserve >= WEAPONS[p.weapon].reserve;
      }
      afford = p.money >= price;
      if (owned) div.classList.add('owned');
      if (!afford && !owned) div.classList.add('poor');
      div.innerHTML = `<span class="buy-key">${item.key}</span><span class="buy-name">${name}</span><span class="buy-price">$${price}</span>${owned ? '<span class="buy-owned">OWNED</span>' : ''}`;
      div.addEventListener('click', () => callbacks.buy(item));
      hud.buyGrid.appendChild(div);
    }
    hud.money.textContent = '$' + p.money;
  };

  hud.setBuyOpen = (open) => {
    hud.buyMenu.classList.toggle('open', !!open);
    if (open) hud.renderBuy();
  };

  // ---- minimap ---------------------------------------------------------------
  hud.drawMinimap = () => {
    const ctx = hud.mmCtx;
    if (!ctx) return;
    const S = 168;
    const sx = (x) => ((x - MAP.x0) / (MAP.x1 - MAP.x0)) * S;
    const sz = (z) => ((z - MAP.z0) / (MAP.z1 - MAP.z0)) * S;
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = 'rgba(12,12,20,0.78)';
    ctx.fillRect(0, 0, S, S);
    // Walls and crates.
    ctx.fillStyle = 'rgba(160,165,185,0.85)';
    for (const c of world.colliders) {
      ctx.fillRect(sx(c.x0), sz(c.z0), sx(c.x1) - sx(c.x0), sz(c.z1) - sz(c.z0));
    }
    // Slag channel (diagonal).
    ctx.strokeStyle = 'rgba(255,106,0,0.9)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(sx(-10), sz(-24)); ctx.lineTo(sx(10), sz(24));
    ctx.stroke();
    // Sites.
    ctx.font = 'bold 13px system-ui';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const s of world.sites) {
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath(); ctx.arc(sx(s.x), sz(s.z), 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#111';
      ctx.fillText(s.letter, sx(s.x), sz(s.z) + 0.5);
    }
    // Fighters.
    for (const e of state.entities) {
      if (!e.alive) continue;
      const x = sx(e.x), y = sz(e.z);
      if (e.isPlayer) {
        ctx.fillStyle = '#f5f2ea';
        ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#f5f2ea';
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - Math.sin(e.yaw) * 10, y - Math.cos(e.yaw) * 10);
        ctx.stroke();
      } else if (e.side === 0) {
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill();
      } else if (performance.now() / 1000 - e.lastSeen < 4) {
        ctx.fillStyle = '#ef4444';
        ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill();
      }
    }
  };

  // ---- per-frame update --------------------------------------------------------
  hud.update = (now) => {
    const p = state.entities[0];
    const w = WEAPONS[p.weapon];
    const slot = p.weapons[p.weapon];
    hud.health.textContent = Math.max(0, Math.ceil(p.hp));
    hud.health.parentElement.classList.toggle('low', p.hp <= 30);
    hud.armor.textContent = Math.ceil(p.armor);
    hud.ammo.textContent = p.reloading > 0 ? '––' : `${slot.mag} / ${slot.reserve}`;
    hud.money.textContent = '$' + p.money;
    const t = Math.max(0, Math.ceil(state.timeLeft));
    hud.timer.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    hud.timer.classList.toggle('urgent', state.timeLeft <= 10 && state.phase === PHASE.LIVE);
    hud.score.textContent = `${state.score[0]} — ${state.score[1]}`;
    hud.grenadeKind.textContent = 'G: ' + (p.grenades.frag + p.grenades.smoke + p.grenades.flash > 0
      ? `Frag ${p.grenades.frag} · Smoke ${p.grenades.smoke} · Flash ${p.grenades.flash}` : 'no grenades');
    // Crosshair gap grows with spread and movement.
    const gap = 4 + p.spread * 6 + p.moveAmount * 5;
    hud.crosshair.style.setProperty('--gap', gap.toFixed(1) + 'px');
    hud.crosshair.classList.toggle('ads', !!p.ads);
    // Timers below run on the wall clock (performance.now), not sim time.
    const wt = performance.now() / 1000;
    if (wt - hud._hitAt > 0.18) hud.hitmarker.classList.remove('show');
    if (wt - hud._dmgAt > 0.7) hud.damageDir.classList.remove('show');
    if (hud._bannerUntil && wt > hud._bannerUntil) hud.hideBanner();
    // Channel bar (plant / defuse).
    const ch = state.charge;
    let prog = -1, label = '';
    if (ch.state === 'carried' && ch.planter === p && ch.plantProgress > 0) {
      prog = ch.plantProgress / PLANT_TIME; label = 'PLANTING CORE CHARGE…';
    } else if (ch.state === 'planted' && ch.defuser === p && ch.defuseProgress > 0) {
      prog = ch.defuseProgress / DEFUSE_TIME; label = 'DEFUSING…';
    } else if (ch.state === 'planted') {
      prog = 1 - ch.detonateLeft / 40; label = 'CHARGE ARMED — ' + Math.ceil(ch.detonateLeft) + 's';
    }
    if (prog >= 0) {
      hud.channel.classList.add('show');
      hud.channelFill.style.width = (prog * 100).toFixed(0) + '%';
      hud.channelLabel.textContent = label;
    } else hud.channel.classList.remove('show');
    // Scope overlay for the sniper.
    hud.scope.classList.toggle('show', !!(p.ads && w.scoped));
    hud.drawMinimap();
  };

  hud.showStart = () => {
    hud.startOverlay.classList.remove('hidden');
    hud.endOverlay.classList.add('hidden');
  };
  hud.hideStart = () => hud.startOverlay.classList.add('hidden');
  hud.showEnd = (won) => {
    $('end-title').textContent = won ? 'CINDER WINS THE MATCH' : 'SLAG WINS THE MATCH';
    $('end-score').textContent = `${state.score[0]} — ${state.score[1]}  ·  Rounds: ${state.stats.roundsPlayed}  ·  Kills: ${state.stats.kills}  ·  Accuracy: ${state.stats.shots ? Math.round(100 * state.stats.hits / state.stats.shots) : 0}%`;
    hud.endOverlay.classList.remove('hidden');
  };
  return hud;
}
