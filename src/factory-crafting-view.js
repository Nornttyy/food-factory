import { FRY_WINDOW, glazeCount, craftScore } from './factory-crafting.js?v=0.25.0';
import { jellyPose } from './factory-feel.js?v=0.25.0';

const $ = id => document.querySelector(`#${id}`);
export function craftLayout(width, height) {
  return width / height >= 1.35
    ? { width: 720, height: 360, x: 410, y: 170, radius: 93, cutter: { x: 138, y: 177 } }
    : { width: 420, height: 420, x: 210, y: 164, radius: 93, cutter: { x: 91, y: 326 } };
}
function rounded(ctx, x, y, w, h, r, fill, stroke = '#b09877') {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = stroke; ctx.lineWidth = 3; ctx.stroke();
}
export class CraftingView {
  constructor({ canvas, assets, getGame, onChange, onBack, onAutomate, isPaused }) {
    Object.assign(this, { canvas, assets, getGame, onChange, onBack, onAutomate, isPaused });
    this.ctx = canvas.getContext('2d'); this.pointer = null; this.brush = null; this.cutterSelected = false; this.lastInfo = ''; this.rect = null;
    $('craft-primary').addEventListener('click', () => this.primary());
    $('craft-again').addEventListener('click', () => this.change(this.getGame().startCraft()));
    $('craft-auto').addEventListener('click', () => this.onAutomate());
    $('craft-brush-step').addEventListener('click', () => this.paintNext());
    canvas.addEventListener('pointerdown', e => this.down(e));
    canvas.addEventListener('pointermove', e => this.move(e));
    canvas.addEventListener('pointerup', e => this.up(e));
    canvas.addEventListener('pointercancel', () => this.cancel());
    canvas.addEventListener('lostpointercapture', () => { if (this.pointer) this.cancel(); });
    canvas.addEventListener('keydown', e => {
      if (e.repeat || ![' ', 'Enter'].includes(e.key)) return;
      e.preventDefault();
      if (this.getGame().state.crafting.batch?.stage === 'glaze') this.paintNext(); else this.primary();
    });
    globalThis.window?.addEventListener?.('resize', () => { this.rect = null; this.cancel(); });
    if (typeof ResizeObserver !== 'undefined') { this.observer = new ResizeObserver(() => { this.rect = null; this.cancel(); }); this.observer.observe(canvas); }
  }
  open() { this.rect = null; this.lastInfo = ''; this.cancel(); this.resize(); this.canvas.focus({ preventScroll: true }); }
  cancel() { this.pointer = null; this.brush = null; this.cutterSelected = false; }
  change(result) {
    const stage = this.getGame().state.crafting.batch?.stage;
    if (result?.ok && ['fry_ready', 'done'].includes(stage) && stage !== this.pulseStage) this.pulseAt = performance.now();
    this.pulseStage = stage; this.lastInfo = ''; this.onChange(result);
  }
  resize() {
    this.rect ||= this.canvas.getBoundingClientRect();
    const width = Math.max(1, this.rect.width), height = Math.max(1, this.rect.height), dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (this.canvas.width !== Math.round(width * dpr)) this.canvas.width = Math.round(width * dpr);
    if (this.canvas.height !== Math.round(height * dpr)) this.canvas.height = Math.round(height * dpr);
    this.layout = craftLayout(width, height);
    const scale = Math.min(width / this.layout.width, height / this.layout.height);
    this.transform = { scale, x: (width - this.layout.width * scale) / 2, y: (height - this.layout.height * scale) / 2, dpr };
  }
  point(e) {
    this.resize(); const t = this.transform;
    return { x: (e.clientX - this.rect.left - t.x) / t.scale, y: (e.clientY - this.rect.top - t.y) / t.scale };
  }
  normalized(p) { const l = this.layout; return { x: (p.x - l.x) / l.radius, y: (p.y - l.y) / (l.radius * .8) }; }
  down(e) {
    if (this.isPaused() || this.pointer || e.isPrimary === false || e.button !== 0) return;
    const p = this.point(e), stage = this.getGame().state.crafting.batch?.stage;
    if (!['shape', 'glaze', 'frying'].includes(stage)) return;
    e.preventDefault(); this.canvas.focus({ preventScroll: true }); this.canvas.setPointerCapture?.(e.pointerId);
    if (stage === 'shape') {
      if (Math.hypot(p.x - this.layout.cutter.x, p.y - this.layout.cutter.y) < 65) this.cutterSelected = true;
      else if (!this.cutterSelected) return;
    }
    this.pointer = { id: e.pointerId, start: p, point: p, stage };
    if (stage === 'glaze') this.paint(p);
  }
  move(e) {
    if (!this.pointer || e.pointerId !== this.pointer.id || this.isPaused()) return;
    const p = this.point(e), previous = this.pointer.point;
    if (this.pointer.stage === 'glaze') {
      const n = Math.min(60, Math.max(1, Math.ceil(Math.hypot(p.x - previous.x, p.y - previous.y) / 5)));
      for (let i = 1; i <= n; i++) this.paint({ x: previous.x + (p.x - previous.x) * i / n, y: previous.y + (p.y - previous.y) * i / n });
    }
    this.pointer.point = p; e.preventDefault();
  }
  up(e) {
    if (!this.pointer || e.pointerId !== this.pointer.id) return;
    const p = this.point(e), gesture = this.pointer; this.pointer = null;
    if (this.isPaused()) { this.cancel(); return; }
    if (gesture.stage === 'shape') {
      const target = this.normalized(p);
      // Tapping the mould selects it; tapping the dough next is also supported.
      if (Math.hypot(p.x - this.layout.cutter.x, p.y - this.layout.cutter.y) < 65) return;
      const result = this.getGame().stampCraft(target.x, target.y); this.cutterSelected = !result.ok; this.change(result);
    } else if (gesture.stage === 'glaze') { this.paint(p); this.change({ ok: true }); }
    else if (Math.hypot(p.x - this.layout.x, (p.y - this.layout.y) / .8) <= this.layout.radius * 1.2) this.change(this.getGame().liftCraft());
  }
  paint(p) { const n = this.normalized(p); this.getGame().paintCraft(n.x, n.y); this.brush = p; }
  paintNext() {
    if (this.isPaused()) return;
    const g = this.getGame(), b = g.state.crafting.batch;
    if (b?.stage !== 'glaze') return;
    const i = Array.from({ length: 12 }, (_, i) => i).find(i => !(b.mask & (1 << i)));
    if (i === undefined) return;
    const a = (i + .5) / 12 * Math.PI * 2;
    g.paintCraft(Math.cos(a) * .75, Math.sin(a) * .75); this.change({ ok: true });
  }
  primary() {
    if (this.isPaused()) return;
    const g = this.getGame(), stage = g.state.crafting.batch?.stage;
    if (stage === 'done' || (!stage && g.state.crafting.queue.length >= 3)) { this.onBack(); return; }
    const result = stage === 'shape' ? g.stampCraft(0, 0) : ['fry_ready', 'failed'].includes(stage) ? g.startFrying() : stage === 'frying' ? g.liftCraft() : stage === 'glaze' ? g.finishCraft() : g.startCraft();
    this.cancel(); this.change(result);
  }
  step(dt) {
    if (this.isPaused()) return;
    const g = this.getGame(), before = g.state.crafting.batch?.stage;
    g.advanceCraft(dt);
    if (before !== g.state.crafting.batch?.stage) this.change({ ok: true });
  }
  info() {
    const c = this.getGame().state.crafting, b = c.batch, stage = b?.stage, paused = this.isPaused();
    const key = JSON.stringify([stage, b?.mask, Math.floor((b?.heat || 0) * 10), c.made, c.best, c.queue.length, paused]);
    if (key === this.lastInfo) return; this.lastInfo = key;
    const heat = b?.heat || 0;
    const labels = { shape: ['1 / 3 · 压面圈', '把压模拖到面团中央', '压下面模'], fry_ready: ['2 / 3 · 炸至金黄', '下锅后，在绿色区间捞起', '下锅'], frying: ['2 / 3 · 看准火候', heat < 4 ? '还没熟，等它变金黄' : heat <= 10 ? '可以捞起，越接近中间越好' : '过火了，再试一次吧', '捞起'], glaze: ['3 / 3 · 涂糖霜', '绕面圈涂一圈，空格也能补一笔', '完成装盘'], done: ['草莓甜甜圈，做好啦！', `本次 ${b ? craftScore(b) : 0} 分 · 量产设备已解锁`, '回工坊放入产线'], failed: ['这锅再试一次', heat < 4 ? '捞早了，还没熟透' : '炸过头了，绿色区间记得捞起', '重新下锅'] };
    const text = labels[stage] || ['甜甜圈制作台', '托盘已满，先回工坊放货', '回工坊放入产线'];
    $('craft-stage').textContent = text[0]; $('craft-hint').textContent = paused ? '已暂停，火候不会继续变化' : text[1];
    $('craft-primary').textContent = text[2]; $('craft-primary').disabled = paused || (stage === 'glaze' && glazeCount(b.mask) < 9);
    $('craft-again').hidden = stage !== 'done'; $('craft-again').disabled = paused || c.queue.length >= 3;
    $('craft-auto').hidden = c.made === 0; $('craft-auto').disabled = paused;
    $('craft-brush-step').hidden = stage !== 'glaze'; $('craft-brush-step').disabled = paused || b?.mask === 4095;
    $('craft-best').textContent = c.made ? `已掌握 · 最佳 ${c.best} 分 · 托盘 ${c.queue.length}/3` : '首次成功，解锁自动量产';
    $('craft-pause').textContent = paused ? '继续' : '暂停'; $('craft-pause').setAttribute('aria-pressed', String(paused));
    $('craft-heat').hidden = !['fry_ready', 'frying', 'failed'].includes(stage);
    $('craft-heat-pointer').style.left = `${Math.min(100, (b?.heat || 0) / FRY_WINDOW.burn * 100)}%`;
    $('craft-heat').setAttribute('aria-valuenow', String(Math.round((b?.heat || 0) * 10) / 10));
    $('craft-coverage').hidden = stage !== 'glaze'; $('craft-coverage').textContent = `糖霜 ${Math.round(glazeCount(b?.mask || 0) / 12 * 100)}%`;
  }
  draw(now, reduced = false) {
    this.resize(); this.info();
    const ctx = this.ctx, t = this.transform, l = this.layout, b = this.getGame().state.crafting.batch, stage = b?.stage, active = !this.isPaused() && !reduced;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(t.scale * t.dpr, 0, 0, t.scale * t.dpr, t.x * t.dpr, t.y * t.dpr);
    rounded(ctx, 18, 18, l.width - 36, l.height - 36, 32, '#f4e1bd', '#d5bd98');
    const frying = ['fry_ready', 'frying', 'failed'].includes(stage);
    rounded(ctx, l.x - 136, l.y - 112, 272, 230, 36, frying ? '#b4bf9f' : '#fff8e8', '#a78b6b');
    if (frying) {
      ctx.beginPath(); ctx.ellipse(l.x, l.y, 121, 94, 0, 0, Math.PI * 2); ctx.fillStyle = '#e8be75'; ctx.fill();
      if (stage === 'frying') for (let i = 0; i < 10; i++) {
        const angle = i / 10 * Math.PI * 2, pulse = active ? Math.sin(now / 170 + i) : 0;
        ctx.beginPath(); ctx.arc(l.x + Math.cos(angle) * 108, l.y + Math.sin(angle) * 80, 3 + pulse, 0, Math.PI * 2); ctx.fillStyle = '#fff2ce'; ctx.fill();
      }
    }
    const food = stage === 'shape' ? 'dough' : ['fry_ready', 'frying', 'failed'].includes(stage) && b.heat < 4 ? 'raw_donut' : stage === 'done' || !stage ? 'donut_strawberry' : 'donut_plain';
    const bounce = active && stage === 'frying' ? Math.sin(now / 140) * 2 : 0;
    const pose = jellyPose(this.pulseAt === undefined ? 1 : (now - this.pulseAt) / 1000, 'produce', reduced || this.isPaused());
    ctx.save(); ctx.translate(l.x, l.y + bounce); ctx.scale(pose.sx, pose.sy);
    this.assets.draw(ctx, food, -110, -88 + pose.y, 220, 176); ctx.restore();
    if (frying && b.heat > 9) {
      ctx.save(); ctx.translate(l.x, l.y); ctx.scale(1, .8); ctx.beginPath(); ctx.arc(0, 0, 76, 0, Math.PI * 2); ctx.arc(0, 0, 26, 0, Math.PI * 2, true); ctx.fillStyle = `rgba(120,65,30,${Math.min(.6, (b.heat - 9) / 6)})`; ctx.fill('evenodd'); ctx.restore();
    }
    if (stage === 'glaze') {
      ctx.save(); ctx.beginPath();
      for (let i = 0; i < 12; i++) if (b.mask & (1 << i)) { ctx.moveTo(l.x, l.y); ctx.ellipse(l.x, l.y, 118, 95, 0, i / 12 * Math.PI * 2, (i + 1) / 12 * Math.PI * 2); ctx.closePath(); }
      ctx.clip(); this.assets.draw(ctx, 'donut_strawberry', l.x - 110, l.y - 88, 220, 176); ctx.restore();
      for (let i = 0; i < 12; i++) if (!(b.mask & (1 << i))) {
        const a = (i + .5) / 12 * Math.PI * 2; ctx.beginPath(); ctx.arc(l.x + Math.cos(a) * l.radius * .74, l.y + Math.sin(a) * l.radius * .74 * .8, 4, 0, Math.PI * 2); ctx.fillStyle = '#fff7dd'; ctx.fill();
      }
      if (this.brush) { ctx.beginPath(); ctx.arc(this.brush.x, this.brush.y, 10, 0, Math.PI * 2); ctx.fillStyle = '#e6aaa3'; ctx.fill(); ctx.strokeStyle = '#aa7d66'; ctx.lineWidth = 2; ctx.stroke(); }
    }
    if (stage === 'shape') {
      ctx.save(); ctx.setLineDash([7, 7]); ctx.beginPath(); ctx.arc(l.x, l.y, 25, 0, Math.PI * 2); ctx.strokeStyle = '#b89972'; ctx.lineWidth = 3; ctx.stroke(); ctx.restore();
      const p = this.pointer?.stage === 'shape' ? this.pointer.point : l.cutter;
      ctx.save(); ctx.translate(p.x, p.y); ctx.scale(1, .78);
      ctx.beginPath(); ctx.arc(0, 0, 49, 0, Math.PI * 2); ctx.arc(0, 0, 20, 0, Math.PI * 2, true); ctx.fillStyle = this.cutterSelected ? '#e7b49a' : '#b9c7ad'; ctx.fill('evenodd'); ctx.strokeStyle = '#846a57'; ctx.lineWidth = 4; ctx.stroke(); ctx.restore();
      ctx.fillStyle = '#846a57'; ctx.textAlign = 'center'; ctx.font = 'bold 15px system-ui'; ctx.fillText('压模', l.cutter.x, l.cutter.y + 62);
    } else {
      const icon = frying ? 'donut_fryer' : stage === 'glaze' ? 'icing_machine' : 'pastry_box';
      this.assets.draw(ctx, icon, l.cutter.x - 42, l.cutter.y - 42, 84, 84);
    }
  }
}
