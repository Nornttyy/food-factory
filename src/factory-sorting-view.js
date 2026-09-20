import { SortingGame, SORT_SAVE_KEY, SORT_FOODS, SORT_MEALS, SORT_DECOR } from './factory-sorting.js?v=0.25.0';

const $ = id => document.querySelector(`#${id}`);
const el = (tag, text = '', className = '') => { const node = document.createElement(tag); node.textContent = text; node.className = className; return node; };

export class SortingView {
  constructor({ assets, isActive, bounce = () => {} }) {
    this.assets = assets; this.isActive = isActive; this.bounce = bounce; this.game = new SortingGame();
    this.opened = false; this.protectSave = false; this.selected = null; this.gesture = null; this.suppressClickUntil = 0;
    this.shopOpen = false; this.shopTab = 'plate'; this.foodNodes = new Map(); this.orderNodes = new Map(); this.plateNodes = [];
    try {
      const raw = localStorage.getItem(SORT_SAVE_KEY);
      if (raw && !this.game.restore(raw)) {
        try { localStorage.setItem(`${SORT_SAVE_KEY}-recovery-${Date.now()}`, raw); }
        catch { this.protectSave = true; }
      }
    } catch { this.protectSave = true; }
    $('sort-pause').addEventListener('click', () => this.pause(!this.game.round?.paused));
    $('sort-resume').addEventListener('click', () => this.pause(false));
    $('sort-next').addEventListener('click', () => { this.selected = null; this.act(this.game.next(), '新的一桌，慢慢配好'); });
    $('sort-return').addEventListener('click', () => this.returnSelected());
    $('sort-bench').addEventListener('click', event => { if (!event.target?.closest?.('button') && !this.ignoreClick(event) && this.selected) this.returnSelected(); });
    $('sort-decor-toggle').addEventListener('click', () => {
      if (!this.isActive()) return;
      this.beforeShopPause = this.game.round?.paused; this.cancel(true); this.game.pause(true); this.shopOpen = true; this.render(); this.save();
      $('sort-shop-back').focus({ preventScroll: true });
    });
    $('sort-shop-back').addEventListener('click', () => this.closeShop());
    document.addEventListener('pointermove', event => this.dragMove(event));
    document.addEventListener('pointerup', event => this.dragEnd(event));
    document.addEventListener('pointercancel', () => this.cancel(true));
    document.addEventListener('pointerdown', event => { if (this.gesture && event.pointerId !== this.gesture.id) this.cancel(true); });
  }
  open() {
    this.opened = true; if (!this.game.round) this.game.start(); this.selected = null;
    this.render(); this.save();
    (this.game.round.paused ? $('sort-resume') : this.game.round.status !== 'open' ? $('sort-next') : this.foodNodes.get(this.game.round.items.find(item => item.place !== 'served')?.id))?.focus({ preventScroll: true });
  }
  close() { this.shopOpen = false; this.pause(true); }
  closeShop() { this.shopOpen = false; this.game.pause(Boolean(this.beforeShopPause)); this.render(); this.save(); $('sort-decor-toggle').focus({ preventScroll: true }); }
  pause(value) { if (this.shopOpen && !value) return; this.cancel(true); this.game.pause(value); this.render(); this.save(); }
  save() {
    if (!this.opened) return;
    if (this.protectSave) { $('sort-save-status').textContent = '原记录已保留 · 本次暂不保存'; return; }
    try { localStorage.setItem(SORT_SAVE_KEY, this.game.serialize()); $('sort-save-status').textContent = '已保存 · 原厨房与工坊进度不变'; }
    catch { $('sort-save-status').textContent = '暂时无法保存 · 请勿关闭页面'; }
  }
  hint(message) { if (message) $('sort-hint').textContent = message; }
  act(result, message) { if (result.ok) this.save(); this.render(); this.hint(result.ok ? message : result.message); return result.ok; }
  ignoreClick(event) { return !this.isActive() || !this.game.active || this.shopOpen || (event?.detail !== 0 && performance.now() < this.suppressClickUntil); }
  select(source) { this.selected = source; this.render(); }
  plate(index) {
    if (this.selected?.kind === 'food') this.transfer(this.selected, { kind: 'plate', index });
    else { this.select({ kind: 'plate', index }); this.hint(this.game.matching(index).length ? '配齐啦，拖给对应小猫，也可以点小猫' : '看看小票，把需要的食物放进来'); }
  }
  customer(id) {
    if (this.selected?.kind !== 'plate') { this.hint('先选餐盘，再点小猫；也可以把餐盘拖过来'); return; }
    this.transfer(this.selected, { kind: 'order', id });
  }
  returnSelected() { this.transfer(this.selected, { kind: 'bench' }); }
  transfer(source, target) {
    if (!source || !target || !this.isActive() || !this.game.active || this.shopOpen) return false;
    let result, message;
    if (source.kind === 'food' && ['plate', 'bench'].includes(target.kind)) {
      result = this.game.move(source.id, target.kind === 'bench' ? 'bench' : target.index);
      if (result.ok) this.selected = target.kind === 'plate' ? { kind: 'plate', index: target.index } : null;
      message = target.kind === 'plate' ? this.game.matching(target.index).length ? '配齐啦，交给亮起小票的猫咪' : '继续配餐，放错随时拿回来' : '放回来了，慢慢整理';
    } else if (source.kind === 'plate' && target.kind === 'bench') {
      result = this.game.returnPlate(source.index); if (result.ok) this.selected = null; message = '这一盘放回桌面了';
    } else if (source.kind === 'plate' && target.kind === 'order') {
      result = this.game.serve(source.index, target.id); if (result.ok) this.selected = null; message = `小猫吃好啦 +${result.earned || 0} 金币`;
    }
    if (!result) return false;
    this.act(result, message);
    if (result.ok) this.bounce(target.kind === 'plate' ? this.plateNodes[target.index]?.base : $('sort-coins'), target.kind === 'order');
    return result.ok;
  }
  draggable(button, source) {
    button.addEventListener('lostpointercapture', event => { if (this.gesture?.id === event.pointerId) this.cancel(true); });
    button.addEventListener('pointerdown', event => {
      if (event.button !== 0 || event.isPrimary === false || this.gesture || !this.isActive() || !this.game.active || this.shopOpen) return;
      if (source.kind === 'plate' && !this.game.plate(source.index).length) return;
      this.gesture = { id: event.pointerId, source, button, x: event.clientX, y: event.clientY, moving: false };
      button.setPointerCapture?.(event.pointerId);
    });
  }
  dragMove(event) {
    const g = this.gesture; if (!g || g.id !== event.pointerId) return;
    if (!this.isActive() || !this.game.active || this.shopOpen) { this.cancel(true); return; }
    if (!g.moving && Math.hypot(event.clientX - g.x, event.clientY - g.y) < 8) return;
    event.preventDefault(); g.moving = true;
    if (!g.ghost) {
      g.ghost = el('span', '', `sort-ghost${g.source.kind === 'plate' ? ' meal' : ''}`); g.ghost.setAttribute('aria-hidden', 'true');
      const items = g.source.kind === 'plate' ? this.game.plate(g.source.index) : this.game.round.items.filter(item => item.id === g.source.id);
      g.ghost.append(...items.map(item => this.assets.icon(SORT_FOODS[item.food].sprite, 72))); document.body.append(g.ghost);
      g.button.classList.toggle('is-dragging', true);
    }
    g.ghost.style.transform = `translate(${event.clientX - 36}px,${event.clientY - 40}px)`;
  }
  dragEnd(event) {
    const g = this.gesture; if (!g || g.id !== event.pointerId) return;
    if (!g.moving) { this.cancel(); return; }
    const target = document.elementFromPoint?.(event.clientX, event.clientY)?.closest?.('[data-sort-target]');
    this.cancel(true);
    if (target) this.transfer(g.source, target.dataset.sortTarget === 'plate' ? { kind: 'plate', index: Number(target.dataset.index) } : target.dataset.sortTarget === 'order' ? { kind: 'order', id: Number(target.dataset.orderId) } : { kind: 'bench' });
    else this.hint('食物还在原处，放心再试');
  }
  cancel(suppress = false) {
    if (suppress && this.gesture) this.suppressClickUntil = performance.now() + 450;
    this.gesture?.button.classList.toggle('is-dragging', false); this.gesture?.ghost?.remove(); this.gesture = null;
  }
  art(id, width = 150) {
    const frame = this.assets.sprites[id].frame, canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = Math.round(width * frame.h / frame.w); canvas.setAttribute('aria-hidden', 'true');
    this.assets.draw(canvas.getContext('2d'), id, 0, 0, canvas.width, canvas.height); return canvas;
  }
  renderMenu() {
    const s = this.game.state;
    $('sort-menu-summary').textContent = s.totalServed ? `第 ${s.day} 天 · 招待了 ${s.totalServed} 位小猫 · ${s.coins} 金币` : '整理一份美味，招待一只小猫。';
    $('menu-sort').textContent = s.round ? '继续我的小店 →' : '开门迎客 →';
  }
  render() {
    this.renderMenu(); const r = this.game.round; if (!r || !this.assets.ready) return;
    const locked = !this.game.active || this.shopOpen;
    $('sort-room').dataset.paused = String(locked);
    $('sort-day').textContent = `第 ${this.game.state.day} 天 · 第 ${r.wave} 桌`;
    $('sort-coins').textContent = `${this.game.state.coins} 金币`; $('sort-progress').textContent = `今日 ${r.served} / 6`;
    $('sort-service').hidden = this.shopOpen; $('sort-shop').hidden = !this.shopOpen; $('sort-paused').hidden = !r.paused;
    $('sort-pause').disabled = this.shopOpen || r.status !== 'open'; $('sort-pause').textContent = r.paused ? '继续' : '暂停'; $('sort-pause').setAttribute('aria-pressed', String(r.paused));
    $('sort-decor-toggle').disabled = this.shopOpen;
    this.renderSkins(); if (this.shopOpen) { this.renderShop(); return; }
    this.renderFood(locked); this.renderOrders(locked);
    $('sort-wave-end').hidden = r.status === 'open';
    $('sort-wave-title').textContent = r.status === 'done' ? '今天的小猫都吃好啦' : '这一桌吃好啦';
    $('sort-wave-stats').textContent = `今日出餐 ${r.served} 份 · 收入 ${r.earnings} 金币`;
    $('sort-next').textContent = r.status === 'done' ? `第 ${this.game.state.day + 1} 天 · 开门 →` : '迎接下一桌 →';
    $('sort-return').disabled = locked || (this.selected?.kind === 'food' ? this.game.round.items.find(item => item.id === this.selected.id)?.place === 'bench' : this.selected?.kind !== 'plate' || !this.game.plate(this.selected.index).length);
  }
  renderSkins() {
    const d = this.game.state.decor.equipped, key = JSON.stringify(d); if (this.skinKey === key) return; this.skinKey = key;
    $('sort-cloth').replaceChildren(this.art(SORT_DECOR[d.cloth].sprite, 700));
    $('sort-ornament').replaceChildren(...(d.ornament === 'none' ? [] : [this.art(SORT_DECOR[d.ornament].sprite, 90)]));
  }
  renderFood(locked) {
    const r = this.game.round, key = `${this.game.state.day}:${r.wave}`;
    if (key !== this.foodKey) {
      this.foodKey = key; this.foodNodes.clear();
      this.spots = Array.from({ length: 12 }, () => el('div', '', 'sort-spot')); $('sort-scatter').replaceChildren(...this.spots);
      for (const item of r.items) {
        const button = el('button', '', 'sort-food'); button.dataset.foodId = String(item.id);
        button.append(this.assets.icon(SORT_FOODS[item.food].sprite, 110));
        button.addEventListener('click', event => {
          if (this.ignoreClick(event)) return;
          this.select(this.selected?.kind === 'food' && this.selected.id === item.id ? null : { kind: 'food', id: item.id });
          this.hint('选好了，点餐盘放入；桌上的食物也能直接拖动');
        });
        this.draggable(button, { kind: 'food', id: item.id }); this.foodNodes.set(item.id, button);
      }
    }
    if (!this.plateNodes.length) {
      this.plateNodes = [0, 1, 2].map(index => {
        const root = el('div', '', 'sort-plate'), base = el('button', '', 'sort-plate-base');
        root.dataset.sortTarget = 'plate'; root.dataset.index = String(index);
        base.addEventListener('click', event => { if (!this.ignoreClick(event)) this.plate(index); }); this.draggable(base, { kind: 'plate', index });
        root.append(base); return { root, base };
      });
      $('sort-plates').replaceChildren(...this.plateNodes.map(plate => plate.root));
    }
    this.spots.forEach((spot, index) => { const item = r.items.find(item => item.slot === index && item.place === 'bench'); spot.replaceChildren(...(item ? [this.foodNodes.get(item.id)] : [])); });
    for (const item of r.items) {
      const button = this.foodNodes.get(item.id); button.disabled = locked;
      button.classList.toggle('selected', this.selected?.kind === 'food' && this.selected.id === item.id);
      button.setAttribute('aria-pressed', String(this.selected?.kind === 'food' && this.selected.id === item.id));
      button.setAttribute('aria-label', `${SORT_FOODS[item.food].label}，${item.place === 'bench' ? '桌面上' : item.place === 'served' ? '已送出' : `餐盘 ${item.place + 1} 中`}，点选或拖动`);
      if (item.place === 'bench') button.style.cssText = `--tilt:${(item.slot * 7 % 19) - 9}deg`;
    }
    this.plateNodes.forEach(({ root, base }, index) => {
      const items = this.game.plate(index), ready = this.game.matching(index).length > 0, skin = this.game.state.decor.equipped.plate;
      if (base.dataset.skin !== skin) { base.dataset.skin = skin; base.replaceChildren(this.art(SORT_DECOR[skin].sprite, 240), el('small')); }
      base.children[1].textContent = ready ? '端起出餐 ↑' : items.length ? `${items.length} / 4` : `餐盘 ${index + 1}`;
      base.disabled = locked; base.setAttribute('aria-label', `餐盘 ${index + 1}，${items.map(item => SORT_FOODS[item.food].label).join('、') || '空盘'}，${ready ? '已配齐，可点选或拖给猫咪' : '点击装盘或选中'}。`);
      root.classList.toggle('selected', this.selected?.kind === 'plate' && this.selected.index === index); root.classList.toggle('ready', ready);
      root.replaceChildren(base, ...items.map((item, i) => { const button = this.foodNodes.get(item.id); button.style.cssText = `--tilt:0deg;--food-col:${i % 2};--food-row:${Math.floor(i / 2)}`; return button; }));
    });
  }
  renderOrders(locked) {
    const r = this.game.round, key = `${this.game.state.day}:${r.wave}`;
    if (key !== this.ordersKey) {
      this.ordersKey = key; this.orderNodes.clear();
      $('sort-orders').replaceChildren(...r.orders.map((order, index) => {
        const button = el('button', '', 'sort-customer'), ticket = el('span', '', 'kitchen-ticket'), title = el('strong', SORT_MEALS[order.meal].label), recipe = el('span', '', 'kitchen-recipe'), cat = el('span', '', 'kitchen-cat');
        recipe.setAttribute('aria-hidden', 'true');
        recipe.append(...SORT_MEALS[order.meal].foods.map(food => this.assets.icon(SORT_FOODS[food].sprite, 40)));
        const color = ['cream', 'peach', 'gray'][(index + this.game.state.day - 1) % 3];
        for (const part of ['body', 'head', 'hand_l', 'hand_r']) { const icon = this.assets.icon(`cat_${color}_${part}`, 100); icon.className = `cat-${part}`; cat.append(icon); }
        ticket.append(title, recipe); button.append(ticket, cat); button.dataset.sortTarget = 'order'; button.dataset.orderId = String(order.id);
        button.addEventListener('click', event => { if (!this.ignoreClick(event)) this.customer(order.id); }); this.orderNodes.set(order.id, { button, title, recipe }); return button;
      }));
    }
    const matches = this.selected?.kind === 'plate' ? this.game.matching(this.selected.index) : [];
    for (const order of r.orders) {
      const node = this.orderNodes.get(order.id), meal = SORT_MEALS[order.meal];
      node.button.disabled = locked || order.done; node.button.classList.toggle('done', order.done); node.button.classList.toggle('match', matches.includes(order.id));
      node.recipe.hidden = order.done; node.title.textContent = order.done ? '吃好啦 ✓' : meal.label;
      node.button.setAttribute('aria-label', order.done ? '这位小猫已经吃好啦' : `${meal.label}：${meal.foods.map(food => SORT_FOODS[food].label).join('、')}，${meal.price} 金币，点猫咪出餐`);
    }
  }
  renderShop() {
    const key = JSON.stringify([this.shopTab, this.game.state.coins, this.game.state.decor]); if (key === this.shopKey) return; this.shopKey = key;
    $('sort-shop-tabs').replaceChildren(...Object.entries({ plate: '餐盘', cloth: '桌布', ornament: '小摆件' }).map(([category, label]) => {
      const button = el('button', label); button.setAttribute('aria-pressed', String(this.shopTab === category));
      button.addEventListener('click', () => { this.shopTab = category; this.renderShop(); }); return button;
    }));
    $('sort-shop-items').replaceChildren(...Object.entries(SORT_DECOR).filter(([, item]) => item.category === this.shopTab).map(([id, item]) => {
      const owned = this.game.state.decor.owned.includes(id), equipped = this.game.state.decor.equipped[item.category] === id, card = el('article', '', 'sort-product');
      const button = el('button', equipped ? '使用中 ✓' : owned ? '免费换上' : `${item.price} 金币`); button.dataset.decor = id; button.disabled = equipped || !owned && this.game.state.coins < item.price;
      button.addEventListener('click', () => { const result = this.game.decorate(id); this.act(result); $('sort-shop-message').textContent = result.ok ? `换上了${item.label}` : result.message; });
      card.append(this.assets.icon(item.sprite, 200), el('strong', item.label), button); return card;
    }));
  }
}
