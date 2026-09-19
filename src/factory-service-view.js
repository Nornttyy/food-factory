import { ITEMS } from './factory-core.js?v=0.13.0';
import { STAFF_COSTS, DELIVERY_SECONDS } from './factory-service.js?v=0.13.0';

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
    this.drag = null; this.selection = null; this.rows = []; this.foods = new Map(); this.staff = [];
    this.head = document.createElement('div'); this.head.className = 'service-heading'; this.head.textContent = '猫猫来啦';
    this.list = document.createElement('div'); this.list.className = 'customer-list';
    for (let slot = 0; slot < 3; slot++) {
      const row = document.createElement('button'); row.type = 'button'; row.className = 'customer-spot'; row.dataset.customerSlot = String(slot);
      const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 224; canvas.className = 'cat-puppet'; canvas.setAttribute('aria-hidden', 'true');
      const bubble = document.createElement('span'); bubble.className = 'customer-want';
      const status = document.createElement('small'); status.className = 'customer-status';
      row.append(canvas, bubble, status); this.list.append(row); this.rows.push({ row, canvas, bubble, status, want: null });
      row.addEventListener('click', () => { if (!this.drag && this.selection) this.drop(slot); });
    }
    this.tray = document.createElement('div'); this.tray.className = 'food-tray'; this.tray.setAttribute('aria-label', '货架上的食物');
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
    this.workers = document.createElement('div'); this.workers.className = 'service-workers';
    for (let i = 0; i < 3; i++) {
      const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 224; canvas.className = 'worker-puppet';
      this.workers.append(canvas); this.staff.push(canvas);
    }
    this.hire = document.createElement('button'); this.hire.type = 'button'; this.hire.className = 'hire-staff';
    this.hire.addEventListener('click', () => { if (this.active() && this.canRecruit()) { const result = this.getGame().recruit(); if (result.ok) this.changed(); else this.notify(result.message); this.render(); } });
    this.ghost = document.createElement('div'); this.ghost.className = 'food-drag-ghost'; this.ghost.hidden = true; this.ghost.setAttribute('aria-hidden', 'true');
    this.root.append(this.head, this.list, this.tray, this.hint, this.workers, this.hire, this.ghost);
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
    const n = s.workers.length, cost = STAFF_COSTS[n];
    this.hire.disabled = !active || !this.canRecruit() || s.served < 4 || cost === undefined || game.state.coins < cost;
    this.hire.textContent = cost === undefined ? '员工已满 · 3/3' : s.served < 4 ? `招募员工 · 先送 ${s.served}/4 份` : `＋ 招募员工 · ${cost}`;
    this.workers.hidden = !n;
    this.staff.forEach((canvas, i) => { canvas.hidden = i >= n; canvas.setAttribute('aria-label', `送餐员工 ${i + 1}${s.workers[i]?.job ? '，正在送餐' : '，等待食物'}`); });
  }
  draw() {
    if (this.root.hidden) return;
    const game = this.getGame(), time = game.state.time, reduced = this.reduced();
    if (!this.active() && this.drag) this.cancel();
    this.rows.forEach(({ canvas }, i) => {
      const ctx = canvas.getContext('2d'), c = game.service.customers[i]; ctx.clearRect(0, 0, 256, 224); ctx.save(); ctx.scale(2, 2);
      if (!reduced && c.age < .65) { const p = c.age / .65; ctx.globalAlpha = Math.min(1, p * 3); ctx.translate((1 - p) * 35, -Math.sin(p * Math.PI) * 8); }
      drawCat(ctx, this.assets, { skin: c.skin, time, happy: c.cooldown > 0, reduced }); ctx.restore();
    });
    this.staff.forEach((canvas, i) => {
      if (canvas.hidden) return;
      const ctx = canvas.getContext('2d'), job = game.service.workers[i]?.job; ctx.clearRect(0, 0, 256, 224); ctx.save(); ctx.scale(2, 2);
      drawCat(ctx, this.assets, { staff: true, time: time + i, reduced });
      if (job) { this.assets.draw(ctx, 'serving_plate', 39, 74, 50, 20); this.assets.draw(ctx, ITEMS[job.item].sprite, 46, 59, 36, 30); }
      ctx.restore();
      canvas.style.opacity = job ? '1' : '.65';
      if (job) {
        const slot = game.service.customers.findIndex(c => c.id === job.customerId), row = this.rows[slot]?.row;
        const travel = 1 - job.remaining / DELIVERY_SECONDS;
        // Floating, footless courier visibly carries the food toward its recipient.
        const distance = row ? Math.max(0, this.workers.getBoundingClientRect().bottom - row.getBoundingClientRect().bottom) : 0;
        canvas.style.transform = reduced ? 'none' : `translateY(${-distance * travel}px)`;
      } else canvas.style.transform = 'none';
    });
  }
}
