import { ITEMS } from './factory-core.js?v=0.14.0';
import { STAFF_COSTS, DELIVERY_SECONDS } from './factory-service.js?v=0.14.0';
import { presentationTime } from './factory-feel.js?v=0.14.0';
import { yardLayout, WorkerMotion, customerPose, drawYardGround } from './factory-yard.js?v=0.14.0';

// Four independently posed atlas parts. No legs, feet or attached limb drawing.
export function drawCat(ctx, assets, { skin = 0, staff = false, time = 0, happy = false, reduced = false } = {}) {
  const color = ['cream', 'peach', 'gray'][skin], prefix = `cat_${staff ? 'staff' : color}`;
  const phase = reduced ? 0 : Math.sin(time * 4 + skin * 1.7), bounce = reduced ? 0 : Math.abs(phase) * (happy ? 5 : 2);
  ctx.save(); ctx.translate(64, 105 - bounce); ctx.scale(1 + phase * .025, 1 - phase * .025);
  assets.draw(ctx, `${prefix}_body`, -34, -51, 68, 54);
  ctx.save(); ctx.translate(0, -67); ctx.rotate(reduced ? 0 : phase * .025);
  assets.draw(ctx, `${prefix}_head`, -43, -36, 86, 72); ctx.restore();
  const hands = `cat_${staff ? 'cream' : color}`;
  for (const side of [-1, 1]) {
    ctx.save(); ctx.translate(side * 30, -22 - (happy || staff ? 9 : 0) + phase * side * 3);
    ctx.rotate(reduced ? 0 : side * phase * .08);
    assets.draw(ctx, `${hands}_hand_${side < 0 ? 'l' : 'r'}`, -10, -10, 20, 20); ctx.restore();
  }
  ctx.restore();
}

export class ServiceView {
  constructor({ root, assets, getGame, active, changed, notify, reduced, canRecruit = () => true }) {
    Object.assign(this, { root, assets, getGame, active, changed, notify, reduced, canRecruit });
    this.drag = null; this.selection = null; this.rows = []; this.foods = new Map();
    this.routes = new WorkerMotion(); this.layout = null; this.layoutDirty = true; this.lastGame = null; this.lastKey = ''; this.lastFrame = '';
    this.scene = document.createElement('canvas'); this.scene.className = 'service-scene'; this.scene.setAttribute('aria-hidden', 'true');
    this.ground = document.createElement('canvas');
    this.list = document.createElement('div'); this.list.className = 'customer-list';
    for (let slot = 0; slot < 3; slot++) {
      const row = document.createElement('button'); row.type = 'button'; row.className = 'customer-spot'; row.dataset.customerSlot = String(slot);
      const bubble = document.createElement('span'); bubble.className = 'customer-want';
      const status = document.createElement('small'); status.className = 'customer-status';
      row.append(bubble, status); this.list.append(row); this.rows.push({ row, bubble, status, want: null, id: null, bornAt: 0 });
      row.addEventListener('click', () => { if (!this.drag && this.selection) this.drop(slot); });
    }
    this.tray = document.createElement('div'); this.tray.className = 'food-tray'; this.tray.setAttribute('aria-label', '货架上的食物');
    this.trayNav = [-1, 1].map(direction => {
      const button = document.createElement('button'); button.type = 'button'; button.className = `counter-scroll ${direction < 0 ? 'previous' : 'next'}`; button.textContent = direction < 0 ? '‹' : '›';
      button.setAttribute('aria-label', direction < 0 ? '看前面的食物' : '看后面的食物');
      button.addEventListener('click', () => this.tray.scrollBy?.({ left: direction * 100, behavior: this.reduced() ? 'auto' : 'smooth' })); return button;
    });
    for (const [item, def] of Object.entries(ITEMS)) if (def.value) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'tray-food'; button.dataset.food = item;
      button.append(assets.icon(def.sprite, 40));
      const count = document.createElement('small'); button.append(count); this.tray.append(button); this.foods.set(item, { button, count });
      button.addEventListener('pointerdown', event => this.start(event, item, button));
      button.addEventListener('pointermove', event => this.move(event));
      button.addEventListener('pointerup', event => this.end(event));
      button.addEventListener('pointercancel', () => this.cancel());
      button.addEventListener('lostpointercapture', () => { if (this.drag) this.cancel(); });
      button.addEventListener('click', event => { if (event.detail === 0 && this.active()) { this.select(item); this.render(); } });
    }
    this.hint = document.createElement('small'); this.hint.className = 'service-hint'; this.hint.setAttribute('role', 'status'); this.hint.setAttribute('aria-live', 'polite');
    this.staffStatus = document.createElement('span'); this.staffStatus.className = 'service-sr-only';
    this.hire = document.createElement('button'); this.hire.type = 'button'; this.hire.className = 'hire-staff';
    this.hire.addEventListener('click', () => { if (this.active() && this.canRecruit()) { const result = this.getGame().recruit(); if (result.ok) this.changed(); else this.notify(result.message); this.render(); } });
    this.ghost = document.createElement('div'); this.ghost.className = 'food-drag-ghost'; this.ghost.hidden = true; this.ghost.setAttribute('aria-hidden', 'true');
    this.root.append(this.scene, this.list, this.tray, ...this.trayNav, this.hint, this.staffStatus, this.hire, this.ghost);
    if (typeof ResizeObserver !== 'undefined') { this.observer = new ResizeObserver(() => this.layoutDirty = true); this.observer.observe(root); }
    window.addEventListener('resize', () => this.layoutDirty = true);
    document.addEventListener('keydown', event => { if (event.key === 'Escape') this.cancel(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.cancel(); });
    document.addEventListener('pointerdown', event => { if (this.drag && event.pointerId !== this.drag.id) this.cancel(); });
    window.addEventListener('pagehide', () => this.cancel());
    window.addEventListener('blur', () => this.cancel());
  }
  select(item) {
    const game = this.getGame(), shelf = game.findShelf(item);
    this.selection = shelf ? { game, rackId: shelf.id, item } : null;
  }
  start(event, item, button) {
    if ((event.button !== undefined && event.button !== 0) || !this.active() || this.drag) return;
    this.select(item); if (!this.selection) return;
    event.preventDefault(); event.stopPropagation();
    this.drag = { id: event.pointerId, button, x: event.clientX, y: event.clientY, moved: false };
    button.setPointerCapture?.(event.pointerId);
    this.ghost.replaceChildren(this.assets.icon(ITEMS[item].sprite, 52)); this.ghost.hidden = false;
    this.move(event); this.render();
  }
  targetAt(x, y) {
    const node = document.elementFromPoint(x, y)?.closest?.('[data-customer-slot]');
    return this.rows.findIndex(row => row.row === node);
  }
  move(event) {
    const d = this.drag; if (!d || event.pointerId !== d.id) return;
    if (!this.active()) { this.cancel(); return; }
    d.moved ||= Math.hypot(event.clientX - d.x, event.clientY - d.y) > 8;
    this.ghost.style.left = `${event.clientX}px`; this.ghost.style.top = `${event.clientY}px`;
    const slot = this.targetAt(event.clientX, event.clientY);
    this.rows.forEach(({ row }, index) => row.classList.toggle('drop-hover', index === slot));
  }
  end(event) {
    if (!this.drag || event.pointerId !== this.drag.id) return;
    event.preventDefault(); event.stopPropagation();
    const slot = this.targetAt(event.clientX, event.clientY), moved = this.drag.moved;
    this.release();
    if (slot >= 0) this.drop(slot); else if (moved) this.selection = null;
    this.render();
  }
  drop(slot) {
    const s = this.selection, game = this.getGame();
    if (!s || !this.active() || s.game !== game) { this.cancel(); return; }
    const result = game.serveFromShelf(s.rackId, s.item, game.service.customers[slot]?.id);
    this.selection = null;
    if (result.ok) this.changed(); else this.notify(result.message);
    this.render();
  }
  release() {
    const drag = this.drag; this.drag = null;
    if (drag?.button.hasPointerCapture?.(drag.id)) drag.button.releasePointerCapture(drag.id);
    this.ghost.hidden = true; this.rows.forEach(({ row }) => row.classList.toggle('drop-hover', false));
  }
  cancel() { this.release(); this.selection = null; }
  render() {
    const game = this.getGame(), s = game.service, active = this.active(), stock = game.stockFoods;
    if (!active || this.selection?.game !== game || (this.selection && !game.shelves.find(b => b.id === this.selection.rackId)?.goods?.includes(this.selection.item))) this.cancel();
    if (game !== this.lastGame || s !== this.lastService) { this.lastGame = game; this.lastService = s; this.routes.clear(); this.lastKey = ''; this.rows.forEach(r => r.id = null); }
    const key = JSON.stringify([active, stock, s.customers.map(c => [c.id, c.want, c.cooldown > 0, game.reserved(c.id)]), s.workers.map(w => w.job?.customerId || 0), s.served, game.state.coins, this.selection?.item, this.canRecruit()]);
    if (key === this.lastKey) return;
    this.lastKey = key; this.lastFrame = '';
    this.rows.forEach(({ row, bubble, status }, slot) => {
      const c = s.customers[slot], busy = game.reserved(c.id), happy = c.cooldown > 0;
      row.disabled = !active || happy || busy;
      row.classList.toggle('cat-happy', happy); row.classList.toggle('cat-reserved', busy);
      row.classList.toggle('food-match', Boolean(this.selection?.item === c.want && !happy && !busy));
      row.setAttribute('aria-label', `猫猫${slot + 1}：${happy ? '吃到啦' : busy ? '员工送餐中' : `想要${ITEMS[c.want].label}，选择食物后点我`}`);
      if (this.rows[slot].want !== c.want) { bubble.replaceChildren(this.assets.icon(ITEMS[c.want].sprite, 38)); this.rows[slot].want = c.want; }
      bubble.hidden = happy; status.textContent = happy ? '好吃！' : busy ? '送来啦' : '';
    });
    for (const [item, { button, count }] of this.foods) {
      const n = stock[item] || 0;
      // Keep the captured source mounted until pointerup, even if a worker takes it.
      button.hidden = !n && this.drag?.button !== button; button.disabled = !active || !n;
      button.setAttribute('aria-label', `${ITEMS[item].label} ${n} 份，拖给猫猫或点击选取`);
      button.setAttribute('aria-pressed', String(this.selection?.item === item));
      button.classList.toggle('selected', this.selection?.item === item); count.textContent = String(n);
    }
    this.hint.textContent = this.selection ? '点猫猫，也能送餐' : Object.keys(stock).length ? '拖给猫猫 · 或点选再送' : '等美味上架…';
    for (const button of this.trayNav) button.hidden = Object.keys(stock).length <= Math.max(1, Math.floor(((this.layout?.width || 200) - 80) / 38));
    const n = s.workers.length, cost = STAFF_COSTS[n];
    this.hire.disabled = !active || !this.canRecruit() || s.served < 4 || cost === undefined || game.state.coins < cost;
    this.hire.textContent = cost === undefined ? '员工已满 · 3/3' : s.served < 4 ? `招募员工 · 先送 ${s.served}/4 份` : `＋ 招募员工 · ${cost}`;
    this.staffStatus.textContent = s.workers.map(w => `员工${w.id}${w.job ? '正在送餐' : '在取餐台待命'}`).join('，');
  }
  resize() {
    if (!this.layoutDirty) return;
    const rect = this.root.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    this.layout = yardLayout(rect.width, rect.height); this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.scene.width = this.ground.width = Math.round(rect.width * this.dpr);
    this.scene.height = this.ground.height = Math.round(rect.height * this.dpr);
    const bg = this.ground.getContext('2d'); bg.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); drawYardGround(bg, this.layout, this.assets);
    this.rows.forEach(({ row }, i) => {
      const p = this.layout.spots[i]; Object.assign(row.style, { left: `${p.x - p.size * .6}px`, top: `${p.y - p.size * .7}px`, width: `${p.size * 1.25}px`, height: `${p.size * 1.25}px` });
    });
    this.tray.style.top = `${this.layout.counterY - 8}px`; this.tray.style.maxHeight = '40px';
    this.trayNav.forEach(button => button.style.top = `${this.layout.counterY - 7}px`);
    this.hint.style.top = `${this.layout.counterY + 45}px`;
    this.routes.clear(); this.layoutDirty = false; this.lastFrame = ''; this.lastKey = '';
  }
  draw() {
    if (this.root.hidden) return;
    this.resize(); if (!this.layout) return;
    const game = this.getGame(), time = presentationTime(game), subTick = time - game.state.time, reduced = this.reduced();
    if (game.service !== this.lastService) this.render();
    if (!this.active() && this.drag) this.cancel();
    const frameKey = `${time}:${reduced}`; if (frameKey === this.lastFrame) return; this.lastFrame = frameKey;
    const ctx = this.scene.getContext('2d'); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, this.scene.width, this.scene.height); ctx.drawImage(this.ground, 0, 0);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const actors = [];
    this.rows.forEach((row, i) => {
      const c = game.service.customers[i], spot = this.layout.spots[i];
      if (row.id !== c.id) { row.id = c.id; row.bornAt = game.state.time - c.age; }
      const pose = customerPose(c, spot, time - row.bornAt, subTick, reduced);
      actors.push({ ...pose, size: spot.size, skin: c.skin, happy: c.cooldown > 0, staff: false });
    });
    game.service.workers.forEach((worker, i) => {
      const slot = game.service.customers.findIndex(c => c.id === worker.job?.customerId), spot = this.layout.spots[slot];
      const home = this.layout.homes[i], target = spot ? { x: spot.x - spot.size * .72, y: spot.y + 15 } : home;
      const pose = this.routes.pose(worker, home, target, time, worker.job ? DELIVERY_SECONDS - worker.job.remaining + subTick : 0);
      actors.push({ ...pose, size: this.layout.workerSize, alpha: 1, staff: true, food: pose.carrying ? worker.job?.item : null });
    });
    this.actors = actors; // Display only; never persisted or used for sales.
    for (const actor of actors.sort((a, b) => a.y - b.y)) {
      ctx.save(); ctx.globalAlpha = actor.alpha; ctx.fillStyle = '#9c83652a'; ctx.beginPath(); ctx.ellipse(actor.x, actor.y + actor.size * .34, actor.size * .3, actor.size * .08, 0, 0, Math.PI * 2); ctx.fill();
      ctx.translate(actor.x - actor.size / 2, actor.y - actor.size / 2); ctx.scale(actor.size / 128, actor.size / 128);
      drawCat(ctx, this.assets, { skin: actor.skin || 0, staff: actor.staff, time, happy: actor.happy, reduced });
      if (actor.food) { this.assets.draw(ctx, 'serving_plate', 39, 74, 50, 20); this.assets.draw(ctx, ITEMS[actor.food].sprite, 46, 59, 36, 30); }
      ctx.restore();
    }
  }
}
