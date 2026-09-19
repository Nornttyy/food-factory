import { WIDTH, HEIGHT, BUILDINGS, ITEMS, DIRS } from './factory-core.js?v=0.19.0';
import { CELL, FactoryCamera, jellyPose, foodPose, presentationTime } from './factory-feel.js?v=0.19.0';
import { conveyorPorts, connectedPorts } from './factory-links.js?v=0.19.0';
import { worldArea, yardLayout, drawYardGround } from './factory-yard.js?v=0.19.0';
import { PACK_RECIPES, ingredientsReady } from './factory-packing.js?v=0.19.0';
// Match the flour hopper: cream rails, cocoa outlines, sage/peach accents.
const CREAM = { cream: '#fff2d9', biscuit: '#e7cea7', peach: '#e4b69f', sage: '#b9c7ad', cocoa: '#846a57', belt: '#b09b86' };
const BELT_LAYERS = [[43, CREAM.cocoa], [38, CREAM.cream], [28, CREAM.belt]];
export class FactoryAssets {
  constructor() { this.images = {}; this.sprites = {}; this.ready = false; }
  async load(base = './assets/generated/factory/cream-v1/', onProgress = () => {}) {
    const controller = new AbortController();
    let timer, stopped = false;
    const images = {};
    onProgress(0, 1);
    const loading = (async () => {
      const response = await fetch(base + 'manifest.json?v=0.19.0', { signal: controller.signal });
      if (!response.ok) throw new Error('素材清单读取失败');
      const manifest = await response.json();
      if (stopped) return;
      const entries = Object.entries(manifest.atlases), total = entries.length + 1;
      const sprites = Object.fromEntries(manifest.sprites.map(sprite => [sprite.id, sprite]));
      let loaded = 1;
      onProgress(loaded, total);
      await Promise.all(entries.map(async ([key, atlas]) => {
        const img = new Image(); images[key] = img;
        img.src = base + atlas.file; await img.decode();
        if (!stopped) onProgress(++loaded, total);
      }));
      return { images, sprites };
    })();
    try {
      const result = await Promise.race([loading, new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('素材加载超时')), 45000);
      })]);
      this.images = result.images; this.sprites = result.sprites; this.ready = true;
    } catch (error) {
      stopped = true; controller.abort();
      for (const img of Object.values(images)) img.src = '';
      throw error;
    } finally { clearTimeout(timer); }
  }
  draw(ctx, id, x, y, width, height, alpha = 1) {
    if (PACK_RECIPES[id]) {
      this.draw(ctx, 'pastry_box', x, y, width, height, alpha);
      this.draw(ctx, id === 'breakfast_box' ? 'bread' : 'donut_plain', x + width * .02, y + height * .06, width * .58, height * .58, alpha);
      this.draw(ctx, 'orange_juice', x + width * .5, y + height * .03, width * .43, height * .61, alpha);
      return;
    }
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
// One native track drawing for the board, rotated ghost and build/inspector icons.
// Port positions stay exactly on the cell boundary; artwork never changes routing.
export function drawConveyor(ctx, b, geometry, time = 0, duration = 1) {
  const x = b.x * CELL + CELL / 2, y = b.y * CELL + CELL / 2;
  const { inputs, outputs, ports, blockedEnds } = geometry;
  ctx.save(); ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
  for (const [width, color] of BELT_LAYERS) {
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath();
    for (const input of inputs) for (const output of outputs) {
      const [ix, iy] = DIRS[input], [ox, oy] = DIRS[output];
      ctx.moveTo(x + ix * CELL / 2, y + iy * CELL / 2); ctx.lineTo(x, y); ctx.lineTo(x + ox * CELL / 2, y + oy * CELL / 2);
    }
    ctx.stroke();
  }
  const offset = time * 12 / duration % 13;
  ctx.strokeStyle = CREAM.cocoa; ctx.lineWidth = 1;
  for (const dir of ports) {
    const [dx, dy] = DIRS[dir], phase = outputs.includes(dir) ? offset : 13 - offset;
    for (let n = 8 + phase; n < 35; n += 13) { ctx.beginPath(); ctx.moveTo(x + dx * n - dy * 10, y + dy * n + dx * 10); ctx.lineTo(x + dx * n + dy * 10, y + dy * n - dx * 10); ctx.stroke(); }
  }
  if (b.type === 'splitter') {
    // A small cream junction distinguishes the device from an ordinary T belt.
    round(ctx, x - 8, y - 8, 16, 16, 5, CREAM.cream, CREAM.cocoa);
    ctx.save();
    ctx.strokeStyle = CREAM.cocoa; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath();
    for (const side of ports) { ctx.moveTo(x, y); ctx.lineTo(x + DIRS[side][0] * 4, y + DIRS[side][1] * 4); }
    ctx.stroke(); ctx.restore();
    for (const side of inputs) arrow(ctx, x + DIRS[side][0] * 28, y + DIRS[side][1] * 28, (side + 2) % 4, CREAM.sage, 6);
  }
  for (const dir of outputs) {
    const distance = b.type === 'splitter' ? 28 : 19;
    arrow(ctx, x + DIRS[dir][0] * distance, y + DIRS[dir][1] * distance, dir, CREAM.peach, 8);
  }
  for (const dir of blockedEnds) {
    const [dx, dy] = DIRS[dir]; ctx.strokeStyle = '#ce8e74'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(x + dx * 34 - dy * 13, y + dy * 34 + dx * 13); ctx.lineTo(x + dx * 34 + dy * 13, y + dy * 34 - dx * 13); ctx.stroke();
  }
  if (b.blocked) { ctx.fillStyle = '#d99b7d'; ctx.beginPath(); ctx.arc(b.x * CELL + 61, b.y * CELL + 10, 3, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}
export class FactoryRenderer {
  constructor(canvas, assets) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.assets = assets;
    this.camera = new FactoryCamera(); this.transform = { scale: 1, x: 0, y: 0 };
    this.pulses = new Map(); this.previous = new Map(); this.particles = []; this.salesSeen = new WeakSet(); this.now = 0; this.reduced = false;
    this.viewport = null;
    if (typeof ResizeObserver !== 'undefined') { this.observer = new ResizeObserver(() => this.viewport = null); this.observer.observe(canvas); }
    globalThis.window?.addEventListener?.('resize', () => this.viewport = null);
  }
  buildingIcon(building, size = 64, game = null) {
    const def = BUILDINGS[building.type];
    if (def.kind === 'assembler') {
      const icon = this.assets.icon(def.sprite, size);
      this.assets.draw(icon.getContext('2d'), def.output === 'breakfast_box' ? 'bread' : 'donut_plain', size * 1.1, size * 1.05, size * .85, size * .85);
      return icon;
    }
    if (building.type !== 'splitter') return this.assets.icon(def.sprite, size);
    const canvas = document.createElement('canvas'); canvas.width = size * 2; canvas.height = size * 2;
    const b = { x: 0, y: 0, dir: 0, ...building };
    const geometry = conveyorPorts(b, (x, y) => game?.at(x, y));
    const ctx = canvas.getContext('2d'), padding = canvas.width * .06;
    ctx.save(); ctx.translate(padding, padding); ctx.scale((canvas.width - padding * 2) / CELL, (canvas.height - padding * 2) / CELL);
    drawConveyor(ctx, { ...b, x: 0, y: 0, blocked: false }, geometry);
    ctx.restore(); canvas.setAttribute('aria-hidden', 'true');
    return canvas;
  }
  resize(area = [WIDTH, HEIGHT], ui = {}, measure = true) {
    const rect = !measure && this.viewport ? this.viewport : (this.viewport = this.canvas.getBoundingClientRect()), dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(rect.width * dpr)), h = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    this.transform = { ...this.camera.resize(rect.width, rect.height, ui.customerArea ? worldArea(area) : area, ui), dpr };
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
      else if (b.output && !prev.output && ['machine', 'source', 'assembler'].includes(BUILDINGS[b.type].kind)) this.pulse(b.id, 'produce', timestamp);
      this.previous.set(b.id, { output: b.output });
    }
    for (const id of this.previous.keys()) if (!ids.has(id)) { this.previous.delete(id); this.pulses.delete(id); }
    for (const [id, pulse] of this.pulses) if (timestamp - pulse.start > 900) this.pulses.delete(id);
    for (const e of game.events) if (!this.salesSeen.has(e)) { this.salesSeen.add(e); const depot = this.grid?.get(`${e.x},${e.y}`) || game.at(e.x, e.y); if (depot) this.pulse(depot.id, e.kind === 'sale' ? 'sale' : 'produce', timestamp); this.burst(e.x, e.y, e.kind, timestamp); }
    this.particles = this.reduced ? [] : this.particles.filter(p => timestamp - p.start < 650);
  }
  cellAt(clientX, clientY) {
    const p = this.worldAt(clientX, clientY); return { x: Math.floor(p.x), y: Math.floor(p.y) };
  }
  worldAt(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect(), t = this.transform;
    return { x: (clientX - rect.left - t.x) / t.scale / CELL, y: (clientY - rect.top - t.y) / t.scale / CELL };
  }
  draw(game, ui, timestamp) {
    this.grid = new Map(game.state.buildings.map(b => [`${b.x},${b.y}`, b]));
    this.now = timestamp; this.reduced = Boolean(ui.reducedMotion); this.resize(game.area, ui, false); this.syncEffects(game, timestamp);
    const ctx = this.ctx, t = this.transform, s = game.state;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = CREAM.biscuit; ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(t.dpr * t.scale, 0, 0, t.dpr * t.scale, t.x * t.dpr, t.y * t.dpr);
    const [areaW, areaH] = game.area;
    const left = Math.max(0, Math.floor(-t.x / t.scale / CELL) - 2), top = Math.max(0, Math.floor(-t.y / t.scale / CELL) - 2);
    const right = Math.min(game.service ? areaW : WIDTH, Math.ceil((this.canvas.width / t.dpr - t.x) / t.scale / CELL) + 2), bottom = Math.min(game.service ? areaH : HEIGHT, Math.ceil((this.canvas.height / t.dpr - t.y) / t.scale / CELL) + 2);
    const visible = s.buildings.filter(b => b.x >= left && b.x < right && b.y >= top && b.y < bottom);
    for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
      const active = x < areaW && y < areaH;
      ctx.fillStyle = active ? ((x + y) % 2 ? '#f7e9d0' : CREAM.cream) : ((x + y) % 2 ? '#e5ddcc' : '#ebe3d3');
      ctx.fillRect(x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2);
      if (active) { ctx.fillStyle = '#dfd0ad'; ctx.fillRect(x * CELL + 4, y * CELL + 4, 2, 2); }
    }
    if (game.expansionCost !== null && !game.service) {
      ctx.save(); ctx.strokeStyle = '#c3bda2'; ctx.setLineDash([5, 7]); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(areaW * CELL, 0); ctx.lineTo(areaW * CELL, areaH * CELL); ctx.lineTo(0, areaH * CELL); ctx.stroke(); ctx.restore();
      ctx.fillStyle = '#b2aa8e'; ctx.textAlign = 'center'; ctx.font = '14px system-ui';
      if (!game.service) ctx.fillText('扩建后开放', (areaW + 1.1) * CELL, Math.min(3, areaH / 2) * CELL);
      if (!game.service) ctx.fillText('扩建后开放', Math.min(5, areaW / 2) * CELL, (areaH + .7) * CELL);
    }
    if (game.service) drawYardGround(ctx, game.area, this.assets);
    for (const b of visible) if (['belt', 'splitter'].includes(BUILDINGS[b.type].kind)) this.drawBelt(b, game);
    for (const b of visible) if (!['belt', 'splitter'].includes(BUILDINGS[b.type].kind)) this.drawMachine(b, game, timestamp);
    for (const b of visible) {
      const item = b.output || (b.type === 'depot' ? b.input : null);
      if (!item) continue;
      const kind = BUILDINGS[b.type].kind;
      if (['belt', 'splitter'].includes(kind)) {
        const slots = [{ item: b.output, motion: b.motion, offset: 14 }];
        if (b.buffer) slots.push({ ...b.buffer, offset: -14 });
        for (const slot of slots) {
          let x = b.x * CELL + 36 + DIRS[b.dir][0] * slot.offset, y = b.y * CELL + 36 + DIRS[b.dir][1] * slot.offset;
          let progress = 1;
          if (slot.motion) {
            const m = slot.motion, elapsed = presentationTime(game) - m.start;
            progress = Math.min(1, Math.max(0, elapsed / m.duration));
            const dir = DIRS[m.dir ?? b.dir], startX = m.x * CELL + 36 + dir[0] * (m.offset || 0), startY = m.y * CELL + 36 + dir[1] * (m.offset || 0);
            x = startX + (x - startX) * progress; y = startY + (y - startY) * progress;
          }
          const pose = foodPose(progress, this.reduced);
          ctx.save(); ctx.fillStyle = '#8c735926'; ctx.beginPath(); ctx.ellipse(x, y + 9, 10 * pose.sx, 3, 0, 0, Math.PI * 2); ctx.fill();
          ctx.translate(x, y + pose.y * .4); ctx.rotate(pose.angle); ctx.scale(pose.sx, pose.sy);
          this.assets.draw(ctx, ITEMS[slot.item].sprite, -12, -12, 24, 24); ctx.restore();
        }
      } else {
        round(ctx, b.x * CELL + 45, b.y * CELL + 2, 25, 25, 7, '#fff8e6', '#d3c3a0');
        this.assets.draw(ctx, ITEMS[item].sprite, b.x * CELL + 47, b.y * CELL + 4, 21, 21);
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
        this.drawBuildingPreview({ type: ui.tool, x, y, dir: ui.dir }, game);
      }
    }
    if (ui.tutorialTarget) {
      const { x, y } = ui.tutorialTarget;
      ctx.save(); ctx.strokeStyle = '#c78442'; ctx.lineWidth = 3;
      ctx.setLineDash([7, 5]); ctx.lineDashOffset = this.reduced ? 0 : -timestamp / 90;
      ctx.beginPath(); ctx.roundRect(x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2, 10); ctx.stroke();
      arrow(ctx, x * CELL + 36, y * CELL - 9, 1, '#c78442', 10); ctx.restore();
    }
    if (game.service) this.serviceView?.draw(ctx, game);
    for (const event of game.events) {
      const age = presentationTime(game) - event.time;
      ctx.save(); ctx.globalAlpha = Math.max(0, 1 - age / 1.5); ctx.fillStyle = '#79915e'; ctx.textAlign = 'center'; ctx.font = 'bold 16px system-ui';
      ctx.fillText(event.kind === 'shelf' ? '上架' : event.kind === 'store' ? '入库 +1' : `+${event.value}`, event.x * CELL + 36, event.y * CELL - age * 25); ctx.restore();
    }
    for (const p of this.particles) {
      const age = (timestamp - p.start) / 1000;
      ctx.save(); ctx.globalAlpha = Math.max(0, 1 - age / .65); ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x + p.vx * age * 2, p.y + p.vy * age * 2 + age * age * 68, p.size * (1 - age * .6), 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
  }
  drawBuildingPreview(b, game) {
    if (b.type === 'splitter') {
      this.ctx.save(); this.ctx.globalAlpha *= .5;
      this.drawBelt(b, game); this.ctx.restore();
      return;
    }
    this.assets.draw(this.ctx, BUILDINGS[b.type].sprite, b.x * CELL + 8, b.y * CELL + 6, 56, 56, .5);
    arrow(this.ctx, b.x * CELL + 36 + DIRS[b.dir][0] * 28, b.y * CELL + 36 + DIRS[b.dir][1] * 28, b.dir, '#8b9e77', 8);
  }
  drawBelt(b, game) {
    const geometry = conveyorPorts(b, (x, y) => this.grid ? this.grid.get(`${x},${y}`) : game.at(x, y));
    drawConveyor(this.ctx, b, geometry, presentationTime(game), game.duration(b));
  }
  drawMachineConnections(b, ports) {
    const ctx = this.ctx, x = b.x * CELL + CELL / 2, y = b.y * CELL + CELL / 2;
    ctx.save(); ctx.lineCap = 'butt';
    // Fixed sleeves overlap the plinth and meet the belt at the exact cell edge.
    // Only the machine artwork deforms; its physical connection stays anchored.
    for (const [width, color] of BELT_LAYERS) {
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
    const ports = connectedPorts(b, (x, y) => this.grid ? this.grid.get(`${x},${y}`) : game.at(x, y));
    this.drawMachineConnections(b, ports);
    round(ctx, x + 5, y + 7, 62, 59, 10, def.kind === 'source' ? '#e7e9cd' : def.kind === 'depot' ? '#e8dcc1' : '#f0dfb7');
    const working = !b.output && (b.input || def.kind === 'source' || def.kind === 'assembler' && ingredientsReady(b, def));
    const pulse = this.pulses.get(b.id), pose = jellyPose(pulse ? (timestamp - pulse.start) / 1000 : 1, pulse?.kind, this.reduced);
    // Work phase follows simulation progress so pauses and dialogs freeze this motion.
    const phase = Math.min(game.duration(b), b.progress + presentationTime(game) - game.state.time);
    const squash = !this.reduced && working && (def.duration || def.kind === 'depot') ? Math.sin(phase / game.duration(b) * Math.PI * 4) * .085 : 0;
    ctx.save(); ctx.fillStyle = '#92765524'; ctx.beginPath(); ctx.ellipse(x + 36, y + 58, 25 * pose.sx, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.translate(x + 36, y + 62 + pose.y); ctx.rotate(pose.angle); ctx.scale(pose.sx * (1 + squash), pose.sy / (1 + squash));
    this.assets.draw(ctx, def.sprite, -31, -62, 62, 60);
    if (b.type === 'fruit_hopper') this.assets.draw(ctx, 'orange', -14, -47, 28, 28);
    ctx.restore();
    if (def.ingredients) {
      Object.entries(def.ingredients).forEach(([item, count], i) => {
        round(ctx, x + 5 + i * 33, y + 43, 30, 17, 5, '#fff7e9');
        this.assets.draw(ctx, ITEMS[item].sprite, x + 6 + i * 33, y + 43, 16, 16);
        ctx.fillStyle = (b.ingredients[item] || 0) >= count ? '#6b845d' : '#98735c'; ctx.font = 'bold 8px system-ui'; ctx.textAlign = 'center';
        ctx.fillText(`${b.ingredients[item] || 0}/${count}`, x + 27 + i * 33, y + 55);
      });
    }
    if (b.type === 'depot' && b.goods?.length) {
      for (let i = 0; i < Math.min(2, b.goods.length); i++) this.assets.draw(ctx, ITEMS[b.goods[i]].sprite, x + 22, y + 15 + i * 22, 26, 23);
      round(ctx, x + 48, y + 2, 21, 17, 6, '#fff2d9'); ctx.fillStyle = '#846a57'; ctx.font = 'bold 10px system-ui'; ctx.textAlign = 'center'; ctx.fillText(String(b.goods.length), x + 58, y + 14);
    }
    for (const { side, output } of ports) if (!output) arrow(ctx, x + 36 + DIRS[side][0] * 32, y + 36 + DIRS[side][1] * 32, (side + 2) % 4, '#ecd0ae', 5);
    if (def.kind !== 'depot') arrow(ctx, x + 36 + DIRS[b.dir][0] * 29, y + 36 + DIRS[b.dir][1] * 29, b.dir, '#879d73', 8);
    else if (b.mode === 'store') { round(ctx, x + 44, y + 3, 25, 18, 5, '#b9cbd7'); ctx.fillStyle = '#526b79'; ctx.font = 'bold 10px system-ui'; ctx.textAlign = 'center'; ctx.fillText('仓', x + 56, y + 16); }
    if (def.duration || def.kind === 'depot') {
      round(ctx, x + 15, y + 65, 42, 3, 1.5, '#d6c7a2');
      if (b.progress > 0) round(ctx, x + 15, y + 65, Math.max(2, 42 * b.progress / game.duration(b)), 3, 1.5, '#9daa83');
    }
    if (b.blocked) { round(ctx, x + 2, y + 2, 15, 15, 5, '#dfb097'); ctx.fillStyle = '#fff5dd'; ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'center'; ctx.fillText('Ⅱ', x + 9.5, y + 13); }
    if (b.level > 1) { ctx.fillStyle = '#7f906b'; ctx.font = 'bold 9px system-ui'; ctx.textAlign = 'left'; ctx.fillText(`L${b.level}`, x + 6, y + 60); }
    if (b.flashUntil > game.state.time) { ctx.strokeStyle = '#9aaa7d'; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(x + 2, y + 2, 68, 68, 12); ctx.stroke(); }
  }
  drawMinimap(canvas, game) {
    const ctx = canvas.getContext('2d'), w = canvas.width, h = canvas.height, [aw, ah] = game.area;
    const [mapW, mapH] = game.worldArea || [WIDTH, HEIGHT], sx = w / mapW, sy = h / mapH;
    ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#e8e3d4'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#f6e9c9'; ctx.fillRect(0, 0, aw * sx, ah * sy);
    if (game.service) {
      const yard = yardLayout(game.area); ctx.fillStyle = '#d1dfb2'; ctx.fillRect(yard.x * sx, yard.y * sy, yard.width * sx, yard.height * sy);
      for (const p of yard.spots) { ctx.fillStyle = '#bd8e78'; ctx.fillRect((p.x - .25) * sx, (p.y - .25) * sy, Math.max(3, .5 * sx), Math.max(3, .5 * sy)); }
      for (const p of game.service.workers) { ctx.fillStyle = '#607b67'; ctx.fillRect(p.x * sx - 1, p.y * sy - 1, 3, 3); }
    }
    for (const b of game.state.buildings) {
      const kind = BUILDINGS[b.type].kind;
      ctx.fillStyle = b.mode === 'store' ? '#7196ae' : kind === 'depot' ? '#c99558' : kind === 'source' ? '#91a76f' : kind === 'machine' ? '#c68e80' : '#aa9578';
      ctx.fillRect(b.x * sx, b.y * sy, Math.max(2, sx - .5), Math.max(2, sy - .5));
    }
    const t = this.transform, view = this.camera.view;
    if (view) {
      const i = view.insets;
      const x = Math.max(0, (i.left - t.x) / t.scale / CELL), y = Math.max(0, (i.top - t.y) / t.scale / CELL);
      const right = Math.min(mapW, (view.width - i.right - t.x) / t.scale / CELL), bottom = Math.min(mapH, (view.height - i.bottom - t.y) / t.scale / CELL);
      ctx.strokeStyle = '#6e8655'; ctx.lineWidth = 2; ctx.strokeRect(x * sx, y * sy, Math.max(0, right - x) * sx, Math.max(0, bottom - y) * sy);
    }
  }
}
