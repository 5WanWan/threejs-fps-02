// HUD: every DOM readout — health, armour, ammo, money, timer, score,
// killfeed, crosshair, hitmarker, buy menu, banners, overlays and the minimap.
// The game logic never touches the DOM directly; it calls these setters.
import { WEAPONS, GRENADES, ARMOR_PRICE } from './weapons.js';

const $ = (id) => document.getElementById(id);

export function createHud(world) {
  const minimap = $('minimap');
  const mctx = minimap?.getContext('2d');
  let playCallback = null;
  let buyCallback = null;
  let hitTimer = null;

  function show(el) { if (el) el.hidden = false; }
  function hide(el) { if (el) el.hidden = true; }

  function fmtTime(seconds) {
    const s = Math.max(0, Math.ceil(seconds));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  const hud = {
    setHealth(hp, armor) {
      $('health-num').textContent = String(Math.max(0, Math.ceil(hp)));
      $('health-bar').style.width = `${Math.max(0, Math.min(100, hp))}%`;
      $('armor-num').textContent = armor > 0 ? `+${Math.ceil(armor)}` : '';
      $('health').classList.toggle('low', hp <= 30);
    },
    setAmmo(mag, reserve, reloading) {
      $('ammo-mag').textContent = reloading ? '--' : String(mag);
      $('ammo-reserve').textContent = `/ ${reserve}`;
      $('ammo').classList.toggle('empty', mag === 0);
      $('ammo').classList.toggle('reloading', !!reloading);
    },
    setWeapon(name) { $('weapon-name').textContent = name; },
    setGrenade(text) { $('grenade-line').textContent = `G — throw · Q — cycle · ${text}`; },
    setMoney(money) { $('money').textContent = `$${money.toLocaleString('en-US')}`; },
    setTimer(seconds, label = '') {
      $('timer').textContent = fmtTime(seconds);
      $('timer').classList.toggle('urgent', seconds <= 10);
      $('timer-label').textContent = label;
    },
    setScore(vanguard, sentinel, round) {
      $('score-v').textContent = String(vanguard);
      $('score-s').textContent = String(sentinel);
      $('round-label').textContent = `ROUND ${round}`;
    },
    setBombStatus(text, urgent = false) {
      const el = $('bomb-status');
      el.textContent = text;
      el.classList.toggle('urgent', urgent);
    },
    setCrosshairSpread(px) {
      $('crosshair').style.setProperty('--gap', `${px.toFixed(1)}px`);
    },
    hitMarker(kill) {
      const el = $('hitmarker');
      el.classList.add('on');
      el.classList.toggle('kill', !!kill);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => el.classList.remove('on', 'kill'), kill ? 220 : 90);
    },
    damageFlash() {
      const el = $('damage');
      el.classList.remove('flash');
      void el.offsetWidth; // restart the CSS animation
      el.classList.add('flash');
    },
    flashWhite(amount) {
      const el = $('flashbang');
      el.style.opacity = String(Math.max(0, Math.min(1, amount)));
      if (amount > 0) {
        setTimeout(() => { el.style.opacity = '0'; }, 120);
      }
    },
    addKill(attackerName, victimName, headshot, attackerTeam) {
      const feed = $('killfeed');
      const row = document.createElement('div');
      row.className = 'kill';
      const a = document.createElement('b');
      a.textContent = attackerName;
      a.style.color = attackerTeam === 'vanguard' ? '#f0a830' : '#2fb8a8';
      const mid = document.createElement('span');
      mid.textContent = headshot ? '  ⌖  ' : '  ✕  ';
      mid.className = 'kill-mid';
      const v = document.createElement('b');
      v.textContent = victimName;
      row.append(a, mid, v);
      feed.prepend(row);
      while (feed.children.length > 5) feed.removeChild(feed.lastChild);
      setTimeout(() => row.remove(), 6000);
    },
    setPlantProgress(ratio, label) {
      const wrap = $('plant-progress');
      if (ratio === null) { hide(wrap); return; }
      show(wrap);
      $('plant-label').textContent = label;
      $('plant-fill').style.width = `${Math.round(ratio * 100)}%`;
    },
    showBanner(title, sub, team) {
      const el = $('banner');
      $('banner-title').textContent = title;
      $('banner-sub').textContent = sub || '';
      el.className = `show ${team || ''}`;
    },
    hideBanner() {
      $('banner').className = '';
    },
    showOverlay(kind, data = {}) {
      const overlay = $('overlay');
      const title = $('overlay-title');
      const copy = $('overlay-copy');
      const play = $('play');
      const scoreboard = $('scoreboard');
      show(overlay);
      if (kind === 'start') {
        title.textContent = 'CINDERLINE';
        copy.textContent = 'Smelter Yard. Plant the Core Charge at the Kiln or the Gantry — or eliminate the Sentinel squad. First to 5 rounds takes the match.';
        play.textContent = 'Click to play';
        hide(scoreboard);
      } else if (kind === 'paused') {
        title.textContent = 'Paused';
        copy.textContent = 'Click to resume the round.';
        play.textContent = 'Resume';
        hide(scoreboard);
      } else if (kind === 'dead') {
        title.textContent = 'Eliminated';
        copy.textContent = 'You are out for this round. Your squad fights on — the next round starts soon.';
        play.textContent = 'Spectate';
        hide(scoreboard);
      } else if (kind === 'matchEnd') {
        title.textContent = data.winner === 'vanguard' ? 'VANGUARD WINS THE MATCH' : 'SENTINEL WINS THE MATCH';
        copy.textContent = `Final score ${data.vanguard} – ${data.sentinel}.`;
        play.textContent = 'Play again';
        show(scoreboard);
        scoreboard.innerHTML = '';
        for (const row of data.rows || []) {
          const div = document.createElement('div');
          div.className = 'sb-row';
          div.innerHTML = `<span class="sb-name" style="color:${row.team === 'vanguard' ? '#f0a830' : '#2fb8a8'}">${row.name}</span><span>${row.kills} K / ${row.deaths} D</span><span>$${row.money}</span>`;
          scoreboard.appendChild(div);
        }
      }
    },
    hideOverlay() { hide($('overlay')); },
    onPlay(callback) { playCallback = callback; },
    showBuyMenu(money, owned, current, onBuy) {
      buyCallback = onBuy;
      const menu = $('buy-menu');
      const list = $('buy-list');
      list.innerHTML = '';
      const items = [
        ...Object.values(WEAPONS).map((w) => ({ id: w.id, name: w.name, price: w.price, kind: w.kind, owned: !!owned[w.id], current: current === w.id })),
        { id: 'armor', name: 'Kevlar Vest', price: ARMOR_PRICE, kind: 'armour', owned: false },
        ...Object.values(GRENADES).map((g) => ({ id: g.id, name: g.name, price: g.price, kind: 'grenade', owned: false })),
      ];
      items.forEach((item, i) => {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'buy-row';
        row.disabled = item.owned || money < item.price;
        row.innerHTML = `<span class="buy-key">${i + 1}</span><span class="buy-name">${item.name}${item.current ? ' ✓' : ''}</span><span class="buy-kind">${item.kind}</span><span class="buy-price">${item.price === 0 ? 'OWNED' : '$' + item.price}</span>`;
        row.addEventListener('click', () => buyCallback?.(item.id));
        list.appendChild(row);
      });
      $('buy-money').textContent = `$${money.toLocaleString('en-US')}`;
      show(menu);
    },
    hideBuyMenu() { hide($('buy-menu')); },
    buyByIndex(index) {
      const rows = [...document.querySelectorAll('#buy-list .buy-row')];
      const row = rows[index];
      if (row && !row.disabled) row.click();
    },
    drawMinimap(player, teammates, spotted, bomb) {
      if (!mctx || !world) return;
      const W = minimap.width;
      const H = minimap.height;
      const sx = (x) => ((x + 32) / 64) * W;
      const sz = (z) => ((z + 24) / 48) * H;
      mctx.clearRect(0, 0, W, H);
      mctx.fillStyle = 'rgba(10,13,17,0.82)';
      mctx.fillRect(0, 0, W, H);
      // walls
      mctx.fillStyle = '#5a636d';
      for (const c of world.colliders) {
        if (c.height < 2) continue;
        mctx.fillRect(sx(c.minX), sz(c.minZ), Math.max(1.5, sx(c.maxX) - sx(c.minX)), Math.max(1.5, sz(c.maxZ) - sz(c.minZ)));
      }
      // sites
      for (const site of Object.values(world.sites)) {
        mctx.strokeStyle = site.id === 'A' ? '#f0a830' : '#2fb8a8';
        mctx.lineWidth = 1.5;
        mctx.beginPath();
        mctx.arc(sx(site.position.x), sz(site.position.z), 7, 0, Math.PI * 2);
        mctx.stroke();
        mctx.fillStyle = mctx.strokeStyle;
        mctx.font = 'bold 9px sans-serif';
        mctx.textAlign = 'center';
        mctx.fillText(site.id, sx(site.position.x), sz(site.position.z) + 3);
      }
      // bomb
      if (bomb?.position) {
        mctx.fillStyle = '#ff4d2e';
        mctx.beginPath();
        mctx.arc(sx(bomb.position.x), sz(bomb.position.z), 4, 0, Math.PI * 2);
        mctx.fill();
      }
      // teammates (amber) and spotted enemies (red)
      for (const mate of teammates) {
        mctx.fillStyle = '#f0a830';
        mctx.beginPath();
        mctx.arc(sx(mate.pos.x), sz(mate.pos.z), 3, 0, Math.PI * 2);
        mctx.fill();
      }
      for (const enemy of spotted) {
        mctx.fillStyle = '#ff4d2e';
        mctx.beginPath();
        mctx.arc(sx(enemy.pos.x), sz(enemy.pos.z), 3, 0, Math.PI * 2);
        mctx.fill();
      }
      // player arrow
      if (player) {
        mctx.save();
        mctx.translate(sx(player.pos.x), sz(player.pos.z));
        mctx.rotate(Math.atan2(-Math.sin(player.yaw), -Math.cos(player.yaw)) + Math.PI / 2);
        mctx.fillStyle = '#ffffff';
        mctx.beginPath();
        mctx.moveTo(0, -6);
        mctx.lineTo(4, 5);
        mctx.lineTo(-4, 5);
        mctx.closePath();
        mctx.fill();
        mctx.restore();
      }
    },
  };

  $('play')?.addEventListener('click', () => playCallback?.());
  return hud;
}
