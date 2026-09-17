import { WIDTH, HEIGHT, BUILDINGS, ITEMS, DIRS, durationFor } from './factory-core.js';
import { CELL, FactoryCamera, jellyPose, foodPose } from './factory-feel.js';
import { conveyorPorts, connectedPorts } from './factory-links.js';
export class FactoryAssets {
  constructor() { this.images = {}; this.sprites = {}; this.ready = false; }
  async load(base = './assets/generated/factory/cream-v1/') {
    const response = await fetch(base + 'manifest.json');
    if (!response.ok) throw new Error('素材清单读取失败');
    const manifest = await response.json();
    this.sprites = Object.fromEntries(manifest.sprites.map(sprite => [sprite.id, sprite]));
    await Promise.all(Object.entries(manifest.atlases).map(async ([key, atlas]) => {
      const img = new Image(); img.src = base + atlas.file; await img.decode(); this.images[key] = img;
    }));
    this.ready = true;
  }
  draw(ctx, id, x, y, width, height, alpha = 1) {
    const sprite = this.sprites[id];
    if (!sprite || !this.images[sprite.atlas]) return;
    const f = sprite.frame, scale = Math.min(width / f.w, height / f.h);
    ctx.save(); ctx.globalAlpha *= alpha;
    ctx.drawImage(this.images[sprite.atlas], f.x, f.y, f.w, f.h, x + (width - f.w * scale) / 2, y + (height - f.h * scale) / 2, f.w * scale, f.h * scale);
    ctx.restore();
  }
  icon(id, size = 64) {
    const canvas = document.createElement('canvas'); canvas.width = size * 2; canvas.height = size * 2;
    this.draw(canvas.getContext('2d'), id, 0, 0, size * 2, size * 2);
    canvas.setAttribute('aria-hidden', 'true'); return canvas;
  }
}
function round(ctx, x, y, w, h, r, color, stroke = null) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fillStyle = color; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.3; ctx.stroke(); }
}
function arrow(ctx, x, y, dir, color, size = 8) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(dir * Math.PI / 2);
  ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(size * .7, 0); ctx.lineTo(-size * .5, -size * .65); ctx.lineTo(-size * .5, size * .65); ctx.closePath(); ctx.fill(); ctx.restore();
}
export class FactoryRenderer {
  constructor(canvas, assets) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.assets = assets;
    this.camera = new FactoryCamera(); this.transform = { scale: 1, x: 0, y: 0 };
    this.pulses = new Map(); this.previous = new Map(); this.particles = []; this.salesSeen = new WeakSet(); this.now = 0; this.reduced = false;
  }
  resize(area = [WIDTH, HEIGHT], ui = {}) {
    const rect = this.canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(rect.width * dpr)), h = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    this.transform = { ...this.camera.resize(rect.width, rect.height, area, ui), dpr };
  }
  zoom(factor, clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    this.camera.zoomAt(factor, clientX === undefined ? rect.width / 2 : clientX - rect.left, clientY === undefined ? rect.height / 2 : clientY - rect.top);
    this.transform = { ...this.camera.transform, dpr: this.transform.dpr };
  }
  pan(dx, dy) { this.camera.pan(dx, dy); this.transform = { ...this.camera.transform, dpr: this.transform.dpr }; }
  pulse(id, kind = 'tap', now = performance.now()) { if (!this.reduced) this.pulses.set(id, { kind, start: now }); }
  burst(x, y, kind = 'sale', now = performance.now()) {
    if (this.reduced) return;
    const count = kind === 'upgrade' ? 10 : 6;
    for (let n = 0; n < count; n++) {
      const angle = Math.PI * 2 * n / count + .3;
      this.particles.push({ x: x * CELL + 36, y: y * CELL + 31, vx: Math.cos(angle) * 28, vy: Math.sin(angle) * 21 - 22, size: n % 2 ? 3 : 4.5, start: now, color: kind === 'sale' ? '#dcad60' : ['#dbb59a', '#b7c896', '#f6e7c0'][n % 3] });
    }
    if (this.particles.length > 100) this.particles.splice(0, this.particles.length - 100);
  }
  syncEffects(game, timestamp) {
    const ids = new Set();
    for (const b of game.state.buildings) {
      ids.add(b.id); const prev = this.previous.get(b.id);
      if (!prev) { if (!this.pulses.has(b.id)) this.pulse(b.id, 'place', timestamp); }
      else if (b.output && !prev.output && ['machine', 'source'].includes(BUILDINGS[b.type].kind)) this.pulse(b.id, 'produce', timestamp);
      this.previous.set(b.id, { output: b.output });
    }
    for (const id of this.previous.keys()) if (!ids.has(id)) { this.previous.delete(id); this.pulses.delete(id); }
    for (const [id, pulse] of this.pulses) if (timestamp - pulse.start > 900) this.pulses.delete(id);
    for (const e of game.events) if (!this.salesSeen.has(e)) { this.salesSeen.add(e); const depot = game.at(e.x, e.y); if (depot) this.pulse(depot.id, 'sale', timestamp); this.burst(e.x, e.y, 'sale', timestamp); }
    this.particles = this.reduced ? [] : this.particles.filter(p => timestamp - p.start < 650);
  }
  cellAt(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect(), t = this.transform;
    return { x: Math.floor((clientX - rect.left - t.x) / t.scale / CELL), y: Math.floor((clientY - rect.top - t.y) / t.scale / CELL) };
  }
  draw(game, ui, timestamp) {
    this.now = timestamp; this.reduced = Boolean(ui.reducedMotion); this.resize(game.area, ui); this.syncEffects(game, timestamp);
    const ctx = this.ctx, t = this.transform, s = game.state;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#f4e9ce'; ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(t.dpr * t.scale, 0, 0, t.dpr * t.scale, t.x * t.dpr, t.y * t.dpr);
    const [areaW, areaH] = game.area;
    for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) {
      const active = x < areaW && y < areaH;
      ctx.fillStyle = active ? ((x + y) % 2 ? '#f4e6c7' : '#f8edcf') : ((x + y) % 2 ? '#e9e4d0' : '#eee9d7');
      ctx.fillRect(x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2);
      if (active) { ctx.fillStyle = '#dfd0ad'; ctx.fillRect(x * CELL + 4, y * CELL + 4, 2, 2); }
    }
    if (s.expansion < 2) {
      ctx.save(); ctx.strokeStyle = '#c3bda2'; ctx.setLineDash([5, 7]); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(areaW * CELL, 0); ctx.lineTo(areaW * CELL, areaH * CELL); ctx.lineTo(0, areaH * CELL); ctx.stroke(); ctx.restore();
      ctx.fillStyle = '#b2aa8e'; ctx.textAlign = 'center'; ctx.font = '14px system-ui';
      ctx.fillText('扩建后开放', (areaW + (WIDTH - areaW) / 2) * CELL, HEIGHT * CELL / 2 + 10);
      ctx.font = '25px system-ui'; ctx.fillText('+', (areaW + (WIDTH - areaW) / 2) * CELL, HEIGHT * CELL / 2 - 18);
    }
    for (const b of s.buildings) if (['belt', 'splitter'].includes(BUILDINGS[b.type].kind)) this.drawBelt(b, game);
    for (const b of s.buildings) if (!['belt', 'splitter'].includes(BUILDINGS[b.type].kind)) this.drawMachine(b, game, timestamp);
    for (const b of s.buildings) {
      if (!b.output) continue;
      const kind = BUILDINGS[b.type].kind;
      if (['belt', 'splitter'].includes(kind)) {
        let x = b.x * CELL + 36, y = b.y * CELL + 36;
        let progress = 1;
        if (b.motion) {
          const elapsed = s.time + (s.paused ? 0 : Math.min(game.accumulator, .1)) - b.motion.start;
          progress = Math.min(1, Math.max(0, elapsed / b.motion.duration));
          x = (b.motion.x + (b.x - b.motion.x) * progress) * CELL + 36;
          y = (b.motion.y + (b.y - b.motion.y) * progress) * CELL + 36;
        }
        const pose = foodPose(progress, this.reduced);
        ctx.save(); ctx.fillStyle = '#8c735926'; ctx.beginPath(); ctx.ellipse(x, y + 12, 12 * pose.sx, 4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.translate(x, y + pose.y); ctx.rotate(pose.angle); ctx.scale(pose.sx, pose.sy);
        this.assets.draw(ctx, ITEMS[b.output].sprite, -18, -18, 36, 36); ctx.restore();
      } else {
        round(ctx, b.x * CELL + 45, b.y * CELL + 2, 25, 25, 7, '#fff8e6', '#d3c3a0');
        this.assets.draw(ctx, ITEMS[b.output].sprite, b.x * CELL + 47, b.y * CELL + 4, 21, 21);
      }
    }
    if (ui.selected !== null) {
      const b = s.buildings.find(b => b.id === ui.selected);
      if (b) { ctx.strokeStyle = '#849873'; ctx.lineWidth = 3; ctx.beginPath(); ctx.roundRect(b.x * CELL + 2, b.y * CELL + 2, CELL - 4, CELL - 4, 9); ctx.stroke(); }
    }
    if (ui.hover && game.inside(ui.hover.x, ui.hover.y)) {
      const { x, y } = ui.hover, occupied = game.at(x, y);
      round(ctx, x * CELL + 2, y * CELL + 2, 68, 68, 7, ui.tool === 'remove' ? '#d9987e44' : '#92a67422', ui.tool === 'remove' ? '#c18b70' : '#9eac87');
      if (BUILDINGS[ui.tool] && !occupied) {
        this.assets.draw(ctx, BUILDINGS[ui.tool].sprite, x * CELL + 8, y * CELL + 6, 56, 56, .5);
        arrow(ctx, x * CELL + 36 + DIRS[ui.dir][0] * 28, y * CELL + 36 + DIRS[ui.dir][1] * 28, ui.dir, '#8b9e77', 8);
      }
    }
    for (const event of game.events) {
      const age = s.time - event.time;
      ctx.save(); ctx.globalAlpha = Math.max(0, 1 - age / 1.5); ctx.fillStyle = '#79915e'; ctx.textAlign = 'center'; ctx.font = 'bold 16px system-ui';
      ctx.fillText(`+${event.value}`, event.x * CELL + 36, event.y * CELL - age * 25); ctx.restore();
    }
    for (const p of this.particles) {
      const age = (timestamp - p.start) / 1000;
      ctx.save(); ctx.globalAlpha = Math.max(0, 1 - age / .65); ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x + p.vx * age * 2, p.y + p.vy * age * 2 + age * age * 68, p.size * (1 - age * .6), 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
  }
  drawBelt(b, game) {
    const ctx = this.ctx, x = b.x * CELL + 36, y = b.y * CELL + 36;
    const { inputs, outputs, ports, blockedEnds } = conveyorPorts(b, (x, y) => game.at(x, y));
    ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
    for (const [width, color] of [[43, '#c0a786'], [38, '#ecdbb5'], [28, '#a28c76']]) {
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath();
      for (const input of inputs) for (const output of outputs) {
        const [ix, iy] = DIRS[input], [ox, oy] = DIRS[output];
        ctx.moveTo(x + ix * 36, y + iy * 36); ctx.lineTo(x, y); ctx.lineTo(x + ox * 36, y + oy * 36);
      }
      ctx.stroke();
    }
    const offset = game.state.time * 19 % 13;
    ctx.strokeStyle = '#8c7763'; ctx.lineWidth = 1;
    for (const dir of ports) {
      const [dx, dy] = DIRS[dir], phase = outputs.includes(dir) ? offset : 13 - offset;
      for (let n = 8 + phase; n < 35; n += 13) { ctx.beginPath(); ctx.moveTo(x + dx * n - dy * 10, y + dy * n + dx * 10); ctx.lineTo(x + dx * n + dy * 10, y + dy * n - dx * 10); ctx.stroke(); }
    }
    arrow(ctx, x + DIRS[b.dir][0] * 19, y + DIRS[b.dir][1] * 19, b.dir, '#ecd0ae', 8);
    if (b.type === 'splitter') { const d = (b.dir + 1) % 4; arrow(ctx, x + DIRS[d][0] * 20, y + DIRS[d][1] * 20, d, '#edc0a3', 8); }
    for (const dir of blockedEnds) {
      const [dx, dy] = DIRS[dir]; ctx.strokeStyle = '#ce8e74'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(x + dx * 34 - dy * 13, y + dy * 34 + dx * 13); ctx.lineTo(x + dx * 34 + dy * 13, y + dy * 34 - dx * 13); ctx.stroke();
    }
    if (b.blocked) { ctx.fillStyle = '#d99b7d'; ctx.beginPath(); ctx.arc(b.x * CELL + 61, b.y * CELL + 10, 3, 0, Math.PI * 2); ctx.fill(); }
  }
  drawMachineConnections(b, ports) {
    const ctx = this.ctx, x = b.x * CELL + CELL / 2, y = b.y * CELL + CELL / 2;
    ctx.save(); ctx.lineCap = 'butt';
    // Fixed sleeves overlap the plinth and meet the belt at the exact cell edge.
    // Only the machine artwork deforms; its physical connection stays anchored.
    for (const [width, color] of [[43, '#c0a786'], [38, '#ecdbb5'], [28, '#a28c76']]) {
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath();
      for (const { side } of ports) {
        const [dx, dy] = DIRS[side];
        ctx.moveTo(x + dx * 20, y + dy * 20); ctx.lineTo(x + dx * CELL / 2, y + dy * CELL / 2);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
  drawMachine(b, game, timestamp) {
    const ctx = this.ctx, def = BUILDINGS[b.type], x = b.x * CELL, y = b.y * CELL;
    const ports = connectedPorts(b, (x, y) => game.at(x, y));
    this.drawMachineConnections(b, ports);
    round(ctx, x + 5, y + 7, 62, 59, 10, def.kind === 'source' ? '#e7e9cd' : def.kind === 'depot' ? '#e8dcc1' : '#f0dfb7');
    const working = !b.output && (b.input || def.kind === 'source');
    const pulse = this.pulses.get(b.id), pose = jellyPose(pulse ? (timestamp - pulse.start) / 1000 : 1, pulse?.kind, this.reduced);
    // Work phase follows simulation progress so pauses and dialogs freeze this motion.
    const squash = !this.reduced && working && def.duration ? Math.sin(b.progress / durationFor(b) * Math.PI * 4) * .085 : 0;
    ctx.save(); ctx.fillStyle = '#92765524'; ctx.beginPath(); ctx.ellipse(x + 36, y + 58, 25 * pose.sx, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.translate(x + 36, y + 62 + pose.y); ctx.rotate(pose.angle); ctx.scale(pose.sx * (1 + squash), pose.sy / (1 + squash));
    this.assets.draw(ctx, def.sprite, -31, -62, 62, 60);
    if (b.type === 'fruit_hopper') this.assets.draw(ctx, 'orange', -14, -47, 28, 28);
    ctx.restore();
    for (const { side, output } of ports) if (!output) arrow(ctx, x + 36 + DIRS[side][0] * 32, y + 36 + DIRS[side][1] * 32, (side + 2) % 4, '#ecd0ae', 5);
    if (def.kind !== 'depot') arrow(ctx, x + 36 + DIRS[b.dir][0] * 29, y + 36 + DIRS[b.dir][1] * 29, b.dir, '#879d73', 8);
    if (def.duration) {
      round(ctx, x + 15, y + 65, 42, 3, 1.5, '#d6c7a2');
      if (b.progress > 0) round(ctx, x + 15, y + 65, Math.max(2, 42 * b.progress / durationFor(b)), 3, 1.5, '#9daa83');
    }
    if (b.blocked) { round(ctx, x + 2, y + 2, 15, 15, 5, '#dfb097'); ctx.fillStyle = '#fff5dd'; ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'center'; ctx.fillText('Ⅱ', x + 9.5, y + 13); }
    if (b.level > 1) { ctx.fillStyle = '#7f906b'; ctx.font = 'bold 9px system-ui'; ctx.textAlign = 'left'; ctx.fillText(`L${b.level}`, x + 6, y + 60); }
    if (b.flashUntil > game.state.time) { ctx.strokeStyle = '#9aaa7d'; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(x + 2, y + 2, 68, 68, 12); ctx.stroke(); }
  }
}
