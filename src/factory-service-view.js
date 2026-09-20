import { ITEMS } from './factory-core.js?v=0.25.0';
import { STAFF_COSTS } from './factory-service.js?v=0.25.0';
import { CELL, presentationTime } from './factory-feel.js?v=0.25.0';
import { yardLayout, serviceHit, customerPose } from './factory-yard.js?v=0.25.0';

// Four separately animated atlas parts: head, body and two round hands, no feet.
export function drawCat(ctx, assets, { skin = 0, staff = false, time = 0, happy = false, reduced = false } = {}) {
  const color = ['cream', 'peach', 'gray'][skin], prefix = `cat_${staff ? 'staff' : color}`;
  const phase = reduced ? 0 : Math.sin(time * 4 + skin * 1.7), bounce = reduced ? 0 : Math.abs(phase) * (happy ? 5 : 2);
  ctx.save(); ctx.translate(64, 105 - bounce); ctx.scale(1 + phase * .025, 1 - phase * .025);
  assets.draw(ctx, `${prefix}_body`, -34, -51, 68, 54);
  ctx.save(); ctx.translate(0, -67); ctx.rotate(reduced ? 0 : phase * .025);
  assets.draw(ctx, `${prefix}_head`, -43, -36, 86, 72); ctx.restore();
  for (const side of [-1, 1]) {
    ctx.save(); ctx.translate(side * 30, -22 - (happy || staff ? 9 : 0) + phase * side * 3); ctx.rotate(reduced ? 0 : side * phase * .08);
    assets.draw(ctx, `cat_${staff ? 'cream' : color}_hand_${side < 0 ? 'l' : 'r'}`, -10, -10, 20, 20); ctx.restore();
  }
  ctx.restore();
}

export class ServiceView {
  constructor({ root, assets, renderer, getGame, active, changed, notify, reduced, visitYard, canRecruit = () => true }) {
    Object.assign(this, { root, assets, renderer, getGame, active, changed, notify, reduced, visitYard, canRecruit });
    this.selection = null; this.drag = null; this.rackId = null; this.foods = new Map(); this.rows = [];
    // Only a contextual food picker is DOM UI. Customers, staff and recruitment
    // board are rendered by the FACTORY canvas under its world camera transform.
    this.tray = document.createElement('div'); this.tray.className = 'food-tray';
    this.tray.setAttribute('aria-label', '当前货架的食物');
    for (const [item, def] of Object.entries(ITEMS)) if (def.value) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'tray-food';
      button.append(assets.icon(def.sprite, 40)); const count = document.createElement('small'); button.append(count); this.tray.append(button);
      this.foods.set(item, { button, count });
      button.addEventListener('pointerdown', e => this.start(e, item, button, this.rackId));
      button.addEventListener('pointermove', e => this.move(e)); button.addEventListener('pointerup', e => this.end(e));
      button.addEventListener('pointercancel', () => this.cancel());
      button.addEventListener('lostpointercapture', () => { if (this.drag) this.cancel(); });
      button.addEventListener('click', e => { if (e.detail === 0 && this.active()) { this.select(item, this.rackId); this.render(); } });
    }
    this.trayNav = [-1, 1].map(direction => {
      const button = document.createElement('button'); button.textContent = direction < 0 ? '‹' : '›'; button.className = `tray-scroll ${direction < 0 ? 'previous' : 'next'}`;
      button.setAttribute('aria-label', direction < 0 ? '前面的食物' : '后面的食物'); button.addEventListener('click', () => this.tray.scrollBy?.({ left: direction * 100, behavior: this.reduced() ? 'auto' : 'smooth' })); this.tray.append(button); return button;
    });
    this.hint = document.createElement('small'); this.hint.className = 'service-hint'; this.hint.setAttribute('role', 'status');
    this.go = document.createElement('button'); this.go.textContent = '去送餐 →'; this.go.addEventListener('click', () => this.visitYard?.());
    this.inspect = document.createElement('button'); this.inspect.textContent = '货架'; this.inspect.addEventListener('click', () => this.inspectShelf?.(this.rackId));
    this.close = document.createElement('button'); this.close.textContent = '×'; this.close.setAttribute('aria-label', '取消拿取'); this.close.addEventListener('click', () => { this.cancel(); this.render(); });
    this.access = document.createElement('div'); this.access.className = 'service-sr-only';
    for (let slot = 0; slot < 3; slot++) {
      const row = document.createElement('button'); row.addEventListener('click', () => this.drop(slot)); this.access.append(row); this.rows.push({ row });
    }
    this.hire = document.createElement('button'); this.hire.addEventListener('click', () => this.recruit()); this.access.append(this.hire);
    this.ghost = document.createElement('div'); this.ghost.className = 'food-drag-ghost'; this.ghost.hidden = true; this.ghost.setAttribute('aria-hidden', 'true');
    this.root.append(this.tray, this.hint, this.go, this.inspect, this.close, this.access, this.ghost);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { this.cancel(); this.render(); } });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.cancel(); });
    document.addEventListener('pointerdown', e => { if (this.drag && e.pointerId !== this.drag.id) this.cancel(); });
    window.addEventListener('pagehide', () => this.cancel()); window.addEventListener('blur', () => this.cancel());
  }
  select(item, rackId) {
    const game = this.getGame(), shelf = rackId == null ? game.findShelf(item) : game.shelves.find(b => b.id === rackId);
    this.selection = shelf && game.availableStock(shelf, item) ? { game, rackId: shelf.id, item } : null;
    if (this.selection) this.rackId = shelf.id;
    return Boolean(this.selection);
  }
  recruit() {
    if (!this.active() || !this.canRecruit()) return;
    const result = this.getGame().recruit(); if (result.ok) this.changed(); else this.notify(result.message); this.render();
  }
  startMap(event) {
    if (!this.active() || (event.button !== undefined && event.button !== 0)) return false;
    const game = this.getGame(), point = this.renderer.worldAt(event.clientX, event.clientY), hit = serviceHit(point, game.area);
    if (hit) {
      this.drag = { id: event.pointerId, button: this.renderer.canvas, action: hit, x: event.clientX, y: event.clientY, lastX: event.clientX, lastY: event.clientY, moved: false };
      event.preventDefault(); this.renderer.canvas.setPointerCapture?.(event.pointerId); return true;
    }
    const b = game.at(Math.floor(point.x), Math.floor(point.y));
    const item = b?.type === 'depot' && b.goods.find(item => game.availableStock(b, item));
    if (!item) return false;
    return this.start(event, item, this.renderer.canvas, b.id);
  }
  start(event, item, button, rackId) {
    if ((event.button !== undefined && event.button !== 0) || !this.active() || this.drag || !this.select(item, rackId)) return false;
    event.preventDefault(); event.stopPropagation?.();
    this.drag = { id: event.pointerId, button, x: event.clientX, y: event.clientY, lastX: event.clientX, lastY: event.clientY, moved: false };
    button.setPointerCapture?.(event.pointerId);
    this.ghost.replaceChildren(this.assets.icon(ITEMS[item].sprite, 52)); this.ghost.hidden = false; this.move(event); this.render(); return true;
  }
  targetAt(x, y) {
    const top = document.elementFromPoint?.(x, y);
    if (top && top !== this.renderer.canvas) return -1;
    const hit = serviceHit(this.renderer.worldAt(x, y), this.getGame().area);
    return hit?.kind === 'customer' ? hit.slot : -1;
  }
  move(event) {
    const d = this.drag; if (!d || event.pointerId !== d.id) return false;
    if (!this.active()) { this.cancel(); return true; }
    d.moved ||= Math.hypot(event.clientX - d.x, event.clientY - d.y) > 8;
    if (d.action && d.moved) this.renderer.pan(event.clientX - d.lastX, event.clientY - d.lastY);
    d.lastX = event.clientX; d.lastY = event.clientY;
    this.ghost.style.left = `${event.clientX}px`; this.ghost.style.top = `${event.clientY}px`; return true;
  }
  tickDrag(dt) {
    const d = this.drag; if (!d || d.action || !d.moved || !this.active()) return;
    const rect = this.renderer.viewport || this.renderer.canvas.getBoundingClientRect();
    const edge = 45, x = d.lastX - rect.left, y = d.lastY - rect.top;
    this.renderer.pan((x < edge ? 1 : x > rect.width - edge ? -1 : 0) * 260 * dt, (y < edge ? 1 : y > rect.height - edge ? -1 : 0) * 260 * dt);
  }
  end(event) {
    const d = this.drag; if (!d || event.pointerId !== d.id) return false;
    event.preventDefault(); event.stopPropagation?.(); const slot = this.targetAt(event.clientX, event.clientY);
    const top = document.elementFromPoint?.(event.clientX, event.clientY), valid = !top || top === this.renderer.canvas;
    this.release();
    if (d.action) {
      if (!d.moved && valid) { if (d.action.kind === 'hire') this.recruit(); else if (slot === d.action.slot && this.selection) this.drop(slot); }
    } else if (slot >= 0) this.drop(slot);
    else if (d.moved) this.selection = null;
    this.render(); return true;
  }
  drop(slot) {
    const s = this.selection, game = this.getGame();
    if (!s || !this.active() || s.game !== game) { this.cancel(); return; }
    const result = game.serveFromShelf(s.rackId, s.item, game.service.customers[slot]?.id); this.selection = null;
    if (result.ok) this.changed(); else this.notify(result.message); this.render();
  }
  release() { const d = this.drag; this.drag = null; if (d?.button.hasPointerCapture?.(d.id)) d.button.releasePointerCapture(d.id); this.ghost.hidden = true; }
  cancel() { this.release(); this.selection = null; this.rackId = null; }
  render() {
    const game = this.getGame(), active = this.active();
    if (this.lastService !== game.service) { this.cancel(); this.lastService = game.service; }
    const shelf = game.shelves.find(b => b.id === this.rackId);
    if (!active || (this.selection && (this.selection.game !== game || !game.availableStock(shelf, this.selection.item)))) this.cancel();
    this.root.classList.toggle('has-food-picker', active && Boolean(this.rackId));
    for (const [item, { button, count }] of this.foods) {
      const n = game.availableStock(shelf, item); button.hidden = !n && this.drag?.button !== button; button.disabled = !active || !n;
      button.setAttribute('aria-label', `${ITEMS[item].label} ${n} 份，点选或拖给地图中的猫猫`);
      button.classList.toggle('selected', this.selection?.item === item); count.textContent = String(n);
    }
    this.hint.textContent = this.selection ? `拿着${ITEMS[this.selection.item].label} · 点猫猫送餐` : '当前货架 · 选一份美味';
    this.go.disabled = !this.selection;
    this.trayNav.forEach(button => button.hidden = new Set(shelf?.goods || []).size < 5);
    this.rows.forEach(({ row }, i) => { const c = game.service.customers[i]; row.textContent = `送给猫猫${i + 1}：${ITEMS[c.want].label}`; row.disabled = !active || !this.selection || c.cooldown > 0 || game.reserved(c.id); });
    const n = game.service.workers.length;
    this.hire.textContent = n >= STAFF_COSTS.length ? `员工已满 ${n}/${STAFF_COSTS.length}` : game.service.served < 4 ? `招募 ${STAFF_COSTS[n]} · 先送 ${game.service.served}/4 份` : `招募 ${n}/${STAFF_COSTS.length} · ${STAFF_COSTS[n]}`;
    this.hire.disabled = !active || !this.canRecruit() || n >= STAFF_COSTS.length || game.service.served < 4 || game.state.coins < STAFF_COSTS[n];
  }
  draw(ctx, game) {
    const time = presentationTime(game), subTick = time - game.state.time, yard = yardLayout(game.area), reduced = this.reduced();
    const actors = game.service.customers.map((c, i) => ({ ...customerPose(c, yard.spots[i], c.cooldown ? 2 : c.age + subTick, subTick, reduced), skin: c.skin, happy: c.cooldown > 0, customer: c, slot: i }));
    for (const w of game.service.workers) {
      const before = game.workerPrevious.get(w.id) || w, alpha = Math.min(1, subTick / .1);
      actors.push({ x: before.x + (w.x - before.x) * alpha, y: before.y + (w.y - before.y) * alpha, size: 1.05, alpha: 1, staff: true, food: w.job?.stage === 'deliver' ? w.job.item : null, blocked: w.job && w.path === null });
    }
    this.actors = actors;
    for (const a of actors.sort((a, b) => a.y - b.y)) {
      const x = a.x * CELL, y = a.y * CELL, size = a.size * CELL;
      ctx.save(); ctx.globalAlpha = a.alpha; ctx.fillStyle = '#9c83652a'; ctx.beginPath(); ctx.ellipse(x, y, size * .3, size * .08, 0, 0, Math.PI * 2); ctx.fill();
      if (a.customer && this.selection?.item === a.customer.want && !a.happy && !game.reserved(a.customer.id)) { ctx.strokeStyle = '#7b9362'; ctx.lineWidth = 3; ctx.stroke(); }
      ctx.save(); ctx.translate(x - size / 2, y - size * .83); ctx.scale(size / 128, size / 128);
      drawCat(ctx, this.assets, { skin: a.skin || 0, staff: a.staff, time, happy: a.happy, reduced });
      if (a.food) { this.assets.draw(ctx, 'serving_plate', 39, 74, 50, 20); this.assets.draw(ctx, ITEMS[a.food].sprite, 46, 59, 36, 30); }
      ctx.restore();
      if (a.customer && !a.happy) {
        ctx.fillStyle = '#fff9e9'; ctx.strokeStyle = game.reserved(a.customer.id) ? '#99ae80' : '#c5ad8c'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.roundRect(x + 18, y - size - 3, 39, 36, 10); ctx.fill(); ctx.stroke();
        this.assets.draw(ctx, ITEMS[a.customer.want].sprite, x + 22, y - size, 31, 30);
      }
      ctx.restore();
    }
    const h = yard.hire;
    ctx.save(); ctx.fillStyle = '#d4dfba'; ctx.strokeStyle = '#8e9e76'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect((h.x - h.width / 2) * CELL, (h.y - h.height / 2) * CELL, h.width * CELL, h.height * CELL, 10); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#62714f'; ctx.font = 'bold 14px system-ui'; ctx.textAlign = 'center'; ctx.fillText(this.hire.textContent, h.x * CELL, h.y * CELL + 5); ctx.restore();
  }
}
