import { SushiGame, SUSHI_SAVE_KEY, SUSHI_WORLD, SUSHI_STATIONS, SUSHI_FOODS, SUSHI_STAFF, trackPoint } from './factory-sushi.js?v=0.25.0';
const $ = id => document.querySelector(`#${id}`);
const el = (tag, text = '', className = '') => { const node = document.createElement(tag); node.textContent = text; node.className = className; return node; };
const C = SUSHI_WORLD.cell, W = C * SUSHI_WORLD.width, H = C * SUSHI_WORLD.height;
const px = value => (value + .5) * C;

export class SushiView {
  constructor({ assets, isActive, bounce = () => {} }) {
    this.assets = assets; this.isActive = isActive; this.bounce = bounce; this.game = new SushiGame();
    this.canvas = $('sushi-board'); this.ctx = this.canvas.getContext('2d'); this.canvas.width = W; this.canvas.height = H;
    this.opened = false; this.protectSave = false; this.shopOpen = false; this.pointer = null; this.foodButtons = new Map(); this.uiTimer = 0;
    try {
      const raw = localStorage.getItem(SUSHI_SAVE_KEY);
      if (raw && !this.game.restore(raw)) { try { localStorage.setItem(`${SUSHI_SAVE_KEY}-recovery-${Date.now()}`, raw); } catch { this.protectSave = true; } }
    } catch { this.protectSave = true; }
    $('sushi-action').addEventListener('click', () => this.primary());
    $('sushi-stock').addEventListener('click', () => this.command('stock'));
    $('sushi-clean').addEventListener('click', () => this.command('clean', this.game.state.dirty[0]));
    $('sushi-reclaim').addEventListener('click', () => this.command('reclaim'));
    $('sushi-pause').addEventListener('click', () => this.pause(!this.game.state.paused));
    $('sushi-resume').addEventListener('click', () => this.pause(false));
    $('sushi-next').addEventListener('click', () => { if (this.isActive() && !this.shopOpen) this.act(this.game.nextDay()); });
    $('sushi-shop-toggle').addEventListener('click', () => this.openShop());
    $('sushi-shop-back').addEventListener('click', () => this.closeShop());
    this.canvas.addEventListener('pointerdown', event => {
      if (this.pointer) { this.pointer.cancelled = true; return; }
      if (!this.isActive() || this.shopOpen || !this.game.active || event.button !== 0 || event.isPrimary === false) return;
      this.pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, cancelled: false }; this.canvas.setPointerCapture?.(event.pointerId); event.preventDefault();
    });
    this.canvas.addEventListener('pointermove', event => { if (this.pointer?.id === event.pointerId && Math.hypot(event.clientX - this.pointer.x, event.clientY - this.pointer.y) > 18) this.pointer.cancelled = true; });
    this.canvas.addEventListener('pointerup', event => {
      const pointer = this.pointer; if (!pointer || pointer.id !== event.pointerId) return; this.pointer = null;
      if (!pointer.cancelled && this.isActive() && this.game.active && !this.shopOpen) { const point = this.point(event.clientX, event.clientY); if (point) this.tap(point); }
    });
    for (const kind of ['pointercancel', 'lostpointercapture']) this.canvas.addEventListener(kind, () => { this.pointer = null; });
  }
  open() { this.opened = true; this.render(); this.draw(0); this.save(); (this.game.state.paused ? $('sushi-resume') : this.canvas).focus({ preventScroll: true }); }
  close() { this.shopOpen = false; this.pause(true); }
  save() {
    if (!this.opened) return;
    if (this.protectSave) { $('sushi-save-status').textContent = '原记录已保留 · 本次暂不保存'; return; }
    try { localStorage.setItem(SUSHI_SAVE_KEY, this.game.serialize()); $('sushi-save-status').textContent = '本机自动保存'; }
    catch { $('sushi-save-status').textContent = '暂时无法保存 · 请勿关闭页面'; }
  }
  pause(value) { if (this.shopOpen && !value) return; this.pointer = null; this.game.pause(value); this.render(); this.save(); }
  act(result) { if (result?.message) $('sushi-hint').textContent = result.message; if (result?.ok) this.save(); this.render(); return result; }
  command(kind, arg) { if (!this.isActive() || this.shopOpen) return; return this.act(this.game.command(kind, arg)); }
  primary() { return this.command(this.game.state.player.held ? 'load' : 'prep'); }
  keydown(event) {
    if (!this.isActive()) return;
    if (event.key === 'Escape' && !event.repeat) { event.preventDefault(); if (this.shopOpen) this.closeShop(); else this.pause(!this.game.state.paused); return; }
    if (this.shopOpen || document.activeElement !== this.canvas) return;
    if ([' ', 'Enter'].includes(event.key) && !event.repeat) { event.preventDefault(); this.primary(); }
    const direction = { ArrowUp: [0, -1], ArrowRight: [1, 0], ArrowDown: [0, 1], ArrowLeft: [-1, 0] }[event.key];
    if (direction) { event.preventDefault(); const p = this.game.state.player; if (!p.path.length) this.command('walk', { x: Math.round(p.x) + direction[0], y: Math.round(p.y) + direction[1] }); }
  }
  point(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect(), scale = Math.min(rect.width / W, rect.height / H);
    if (!(scale > 0)) return null;
    const x = (clientX - rect.left - (rect.width - W * scale) / 2) / scale, y = (clientY - rect.top - (rect.height - H * scale) / 2) / scale;
    return x >= 0 && y >= 0 && x < W && y < H ? { x: x / C - .5, y: y / C - .5 } : null;
  }
  tap(point) {
    if (Math.hypot(point.x - 2, point.y - 2) < 1.0) return this.command('prep');
    if (Math.hypot(point.x - 8, point.y - 2) < .95 || Math.hypot(point.x - 6, point.y - 2) < .8) return this.command('stock');
    if (Math.hypot(point.x - 4, point.y - 6) < .9) return this.command('load');
    for (const seat of this.game.state.dirty) if (Math.hypot(point.x - this.game.seats[seat].x, point.y - this.game.seats[seat].y) < .85) return this.command('clean', seat);
    if (Math.hypot(point.x - 2, point.y - 10) < .85) return this.command('clean', this.game.state.dirty[0]);
    this.command('walk', { x: Math.round(point.x), y: Math.round(point.y) });
  }
  openShop() {
    if (!this.isActive()) return; this.wasPaused = this.game.state.paused; this.pointer = null; this.shopOpen = true; this.game.pause(true); this.render(); this.save(); $('sushi-shop-back').focus({ preventScroll: true });
  }
  closeShop() { this.shopOpen = false; this.game.pause(Boolean(this.wasPaused)); this.render(); this.save(); $('sushi-shop-toggle').focus({ preventScroll: true }); }
  step(dt) {
    if (!this.isActive()) return;
    const coins = this.game.state.coins, status = this.game.state.status; this.game.update(dt);
    if (coins !== this.game.state.coins) { this.bounce($('sushi-coins'), true); this.save(); }
    if (status !== this.game.state.status) this.save();
    if (this.game.notice && this.notice !== this.game.notice) { this.notice = this.game.notice; $('sushi-hint').textContent = this.notice; }
    this.uiTimer += dt; if (this.uiTimer >= .12) { this.uiTimer = 0; this.render(); }
  }
  renderMenu() {
    const s = this.game.state; $('sushi-menu-summary').textContent = s.totalSold ? `第 ${s.day} 天 · 招待 ${s.totalSold} 位小猫 · ${s.coins} 金币` : '亲手做寿司，让美味绕着小店转。';
    $('menu-sushi').textContent = s.totalSold || this.opened ? '继续我的寿司店 →' : '开一家回转寿司店 →';
  }
  render() {
    this.renderMenu(); if (!this.assets.ready) return;
    const s = this.game.state, locked = !this.game.active || this.shopOpen;
    $('sushi-day').textContent = `第 ${s.day} 天 · ${s.dailySold} / ${this.game.target} 位顾客`;
    $('sushi-coins').textContent = `${s.coins} 金币`;
    $('sushi-pause').textContent = s.paused ? '继续' : '暂停'; $('sushi-pause').setAttribute('aria-pressed', String(s.paused)); $('sushi-pause').disabled = this.shopOpen || s.status === 'closed';
    $('sushi-paused').hidden = !s.paused || this.shopOpen || s.status === 'closed';
    $('sushi-shop').hidden = !this.shopOpen; this.canvas.hidden = this.shopOpen; $('sushi-footer').hidden = this.shopOpen;
    $('sushi-shop-toggle').disabled = this.shopOpen;
    $('sushi-next').hidden = s.status !== 'closed'; $('sushi-next').textContent = `第 ${s.day + 1} 天 · 开门 →`;
    $('sushi-action').hidden = s.status === 'closed'; $('sushi-action').disabled = locked;
    $('sushi-action').textContent = s.player.held ? '放上回转带 →' : s.batch ? SUSHI_FOODS[s.batch.food].steps[s.batch.step] : '捏饭团 · 开始';
    $('sushi-action').setAttribute('aria-label', s.player.held ? `把${SUSHI_FOODS[s.player.held].label}送到上菜口` : `走到料理台，${s.batch ? SUSHI_FOODS[s.batch.food].steps[s.batch.step] : `开始制作${SUSHI_FOODS[s.selected].label}`}`);
    $('sushi-stock').disabled = locked; $('sushi-clean').disabled = locked || !s.dirty.length; $('sushi-clean').textContent = s.dirty.length ? `收盘 ${s.dirty.length}` : '收盘';
    $('sushi-reclaim').hidden = !s.dishes.length; $('sushi-reclaim').disabled = locked;
    for (const food of this.game.foods) {
      if (!this.foodButtons.has(food)) {
        const button = el('button'), image = this.assets.icon(SUSHI_FOODS[food].sprite, 48), label = el('small'), demand = el('span', '', 'sushi-demand');
        button.dataset.food = food; button.append(image, label, demand);
        button.addEventListener('click', () => { if (this.isActive() && !this.shopOpen) this.act(this.game.select(food)); });
        this.foodButtons.set(food, { button, label, demand }); $('sushi-foods').append(button);
      }
      const node = this.foodButtons.get(food), wanted = s.customers.filter(c => ['waiting', 'arriving'].includes(c.status) && c.food === food).length;
      node.button.disabled = locked || Boolean(s.batch); node.button.setAttribute('aria-pressed', String(s.selected === food));
      node.label.textContent = `${{ salmon: '三文鱼', egg: '玉子', maki: '海苔卷', shrimp: '鲜虾' }[food]} · ${s.stock[food]}`;
      node.demand.textContent = wanted ? `${wanted} 位想吃` : ''; node.demand.hidden = !wanted;
      node.button.setAttribute('aria-label', `${SUSHI_FOODS[food].label}，食材 ${s.stock[food]} 份，${wanted} 位顾客想吃，售价 ${SUSHI_FOODS[food].price} 金币`);
    }
    $('sushi-stock').setAttribute('aria-label', `去补货箱补充全部食材，免费。米饭剩 ${s.stock.rice} 份`);
    if (this.shopOpen) this.renderShop();
  }
  renderShop() {
    const s = this.game.state, key = JSON.stringify([s.coins, s.totalSold, s.staff.map(w => w.role), s.level, s.status]); if (this.shopKey === key) return; this.shopKey = key;
    const cards = Object.entries(SUSHI_STAFF).map(([role, def]) => {
      const hired = s.staff.some(w => w.role === role), card = el('article', '', 'sushi-product'), button = el('button', hired ? '已入职 ✓' : `${def.price} 金币 · 招募`, 'soft-button'); button.dataset.hire = role;
      button.disabled = hired || s.coins < def.price || s.totalSold < def.sold;
      button.addEventListener('click', () => this.act(this.game.hire(role)));
      card.append(this.assets.icon(role === 'helper' ? 's_supply' : 's_prep', 140), el('strong', def.label), el('p', role === 'helper' ? '在店里走动，补充食材、收空盘' : '按顾客需求做寿司，亲自送到回转带'), el('small', s.totalSold < def.sold ? `招待 ${def.sold} 位后开放` : '一次招募 · 不收持续工资'), button); return card;
    });
    const expansion = el('article', '', 'sushi-product sushi-expansion'), buy = el('button', s.level ? '已扩建 ✓' : '180 金币 · 扩建', 'soft-button'); buy.dataset.expand = 'true';
    buy.disabled = Boolean(s.level) || s.coins < 180 || s.status !== 'closed'; buy.addEventListener('click', () => this.act(this.game.expand()));
    expansion.append(this.assets.icon('s_stool', 100), el('strong', '加长回转带'), el('p', '4 席 → 6 席 · 解锁鲜虾寿司'), el('small', '打烊后施工 · 原来的餐盘保留'), buy);
    $('sushi-shop-items').replaceChildren(...cards, expansion);
  }
  box(x, y, width, height, radius, fill) { const ctx = this.ctx; ctx.fillStyle = fill; ctx.beginPath(); ctx.roundRect(x, y, width, height, radius); ctx.fill(); }
  text(text, x, y, size = 14, color = '#90765c') { const ctx = this.ctx; ctx.fillStyle = color; ctx.font = `600 ${size}px ui-rounded, "PingFang SC", sans-serif`; ctx.textAlign = 'center'; ctx.fillText(text, x, y); }
  sprite(id, x, y, width, height = width) { this.assets.draw(this.ctx, id, x - width / 2, y - height / 2, width, height); }
  cat(actor, color, phase, player = false) {
    const ctx = this.ctx, moving = actor.path.length > 0, wobble = this.reducedMotion || !this.game.active ? 0 : Math.sin(phase * (moving ? 10 : 2) + actor.x) * (moving ? .06 : .018);
    const x = px(actor.x), y = px(actor.y); ctx.save(); ctx.translate(x, y); ctx.rotate(wobble * .55); ctx.scale(1 + wobble, 1 - wobble);
    this.sprite(`cat_${color}_body`, 0, 12, 42, 39); this.sprite(`cat_${color}_head`, 0, -10, 56, 47);
    const hands = color === 'staff' ? 'cream' : color, lifted = actor.held || actor.job?.kind === 'cook' || player && this.game.state.batch && !moving;
    const handSwing = !this.reducedMotion && this.game.active && (moving || lifted) ? Math.sin(phase * 9) * 4 : 0;
    this.sprite(`cat_${hands}_hand_l`, -23, (lifted ? 5 : 19) + handSwing, 16); this.sprite(`cat_${hands}_hand_r`, 23, (lifted ? 5 : 19) - handSwing, 16);
    if (actor.held) { this.sprite('k_plate_cream', 0, 22, 45, 28); this.sprite(SUSHI_FOODS[actor.held].sprite, 0, 17, 33, 25); }
    ctx.restore(); if (player) this.text('你', x, y + 44, 14, '#608046');
    if (actor.role) this.text(actor.role === 'chef' ? '厨师' : '助手', x, y + 42, 12, '#608046');
  }
  draw(now, reducedMotion = false) {
    if (!this.assets.ready || this.shopOpen) return;
    this.reducedMotion = reducedMotion; const ctx = this.ctx, s = this.game.state, phase = s.time;
    ctx.clearRect(0, 0, W, H); this.box(0, 0, W, H, 0, '#fff2d9');
    this.box(12, 24, W - 24, H - 50, 34, '#e0c8a7'); this.box(18, 24, W - 36, H - 60, 32, '#f3e6cf');
    this.box(18, 24, W - 36, 59, [32, 32, 0, 0], '#ead6b4'); this.text('猫咪回转寿司', W / 2, 63, 23, '#876849');
    this.sprite('k_herb', 52, 82, 51, 59); this.sprite('k_herb', W - 52, 82, 51, 59);
    this.box(70, 112, 493, 79, 23, '#e4ceb0');
    for (const [key, station] of Object.entries(SUSHI_STATIONS)) if (station.sprite) {
      this.sprite(key === 'chef' && s.staff.some(w => w.role === 'chef') ? 's_prep' : station.sprite, px(station.x), px(station.y), key === 'prep' ? 94 : 78, 72);
      this.text(key === 'stock' ? '补货' : key === 'chef' && s.staff.some(w => w.role === 'chef') ? '厨师台' : station.label, px(station.x), px(station.y) + 51, 14);
    }
    if (s.batch) { this.sprite('s_rice', px(2) - 3, px(2) - 4, 43, 28); if (s.batch.step > 1) this.sprite(SUSHI_FOODS[s.batch.food].topping, px(2) - 3, px(2) - 12, 40, 26); }
    for (const [i, seat] of this.game.seats.entries()) {
      this.sprite('s_stool', px(seat.x), px(seat.y) + 18, 63, 55);
      if (s.dirty.includes(i)) { this.sprite('s_plates', px(seat.x), px(seat.y) - 3, 45, 38); this.text('收盘', px(seat.x), px(seat.y) + 50, 13, '#a48052'); }
    }
    const cells = this.game.track, path = () => { ctx.beginPath(); cells.forEach((p, i) => ctx[i ? 'lineTo' : 'moveTo'](px(p.x), px(p.y))); ctx.closePath(); };
    ctx.lineJoin = 'round'; for (const [width, color] of [[48, '#9a7c60'], [42, '#fff3d8'], [29, '#bca68c']]) { path(); ctx.lineWidth = width; ctx.strokeStyle = color; ctx.stroke(); }
    for (let i = 0; i < cells.length; i++) {
      const p = trackPoint(i + (reducedMotion ? 0 : phase * .7 % 1), s.level), q = trackPoint(i + (reducedMotion ? 0 : phase * .7 % 1) + .05, s.level);
      ctx.save(); ctx.translate(px(p.x), px(p.y)); ctx.rotate(Math.atan2(q.y - p.y, q.x - p.x)); this.text('›', 0, 5, 16, '#f0e1ca'); ctx.restore();
    }
    this.box(px(4) - 44, px(6) - 25, 49, 50, 15, '#c3d0ad'); this.text('上菜', px(4) - 30, px(6) + 5, 12, '#536b42');
    this.sprite('k_herb', px(s.level ? 7 : 6), px(7.3), 75, 90); this.text(`${this.game.seats.length} 席 · 慢慢开店`, px(s.level ? 7 : 6), px(8.4), 15, '#a58b69');
    for (const dish of s.dishes) { const point = trackPoint(dish.distance, s.level); this.sprite('k_plate_cream', px(point.x), px(point.y) + 4, 37, 28); this.sprite(SUSHI_FOODS[dish.food].sprite, px(point.x), px(point.y) - 2, 32, 27); }
    if (s.player.path.length) { const point = s.player.path.at(-1); this.box(px(point.x) - 6, px(point.y) + 18, 12, 5, 3, '#adc28a'); }
    for (const actor of [...s.customers, ...s.staff, s.player].sort((a, b) => a.y - b.y)) this.cat(actor, actor === s.player ? 'cream' : actor.role ? 'staff' : ['peach', 'gray', 'cream'][actor.id % 3], phase, actor === s.player);
    for (const customer of s.customers) if (customer.status !== 'leaving') {
      const x = px(customer.x), seatedBelow = ['waiting', 'eating'].includes(customer.status) && this.game.seats[customer.seat].y > 5, y = px(customer.y) + (seatedBelow ? 66 : -66);
      this.box(x - 26, y - 21, 52, 42, 14, customer.status === 'eating' ? '#e1eacb' : '#fffaf0');
      if (customer.status === 'eating') this.text('✓', x, y + 8, 25, '#7c9b58'); else this.sprite(SUSHI_FOODS[customer.food].sprite, x, y, 40, 32);
    }
    this.sprite('s_register', px(2), px(13.6), 65, 64); this.text('取餐自动结账', px(2), px(14.45), 13);
    this.box(px(9.3), H - 67, 90, 17, 6, '#d9c09c'); this.text('入口 ↑', px(10), H - 23, 15);
    if (s.status === 'closed') { this.box(108, H - 170, W - 216, 65, 20, '#fff8e7'); this.text(`今日 ${s.dailySold} 份 · ${s.dailyIncome} 金币`, W / 2, H - 131, 21, '#74905b'); }
  }
}
