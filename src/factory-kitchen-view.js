import { KitchenGame, KITCHEN_SAVE_KEY, KITCHEN_UPGRADES, DISHES, SHIFT_SECONDS, TOAST_SECONDS } from './factory-kitchen.js?v=0.21.0';

const $ = id => document.querySelector(`#${id}`);
const el = (tag, text = '', className = '') => { const node = document.createElement(tag); node.textContent = text; node.className = className; return node; };
const spriteFor = part => part === 'fruit' ? 'strawberry' : 'bread';
export class KitchenView {
  constructor({ assets, isActive, bounce = () => {} }) {
    this.assets = assets; this.isActive = isActive; this.bounce = bounce;
    this.game = new KitchenGame(); this.selected = null; this.gesture = null;
    this.protectSave = false; this.opened = false; this.orderNodes = new Map(); this.plateNodes = [];
    this.lastSprites = new Map(); this.upgradeKey = ''; this.lastHint = ''; this.suppressClickUntil = 0;
    try {
      const raw = localStorage.getItem(KITCHEN_SAVE_KEY);
      if (raw && !this.game.restore(raw)) {
        try { localStorage.setItem(`${KITCHEN_SAVE_KEY}-recovery-${Date.now()}`, raw); }
        catch { this.protectSave = true; }
      }
    } catch { this.protectSave = true; }
    for (let i = 0; i < 2; i++) {
      const button = $(`kitchen-pan-${i}`);
      button.addEventListener('click', event => { if (this.ignoreClick(event)) return; this.pan(i); });
      this.draggable(button, () => this.game.panStage(i) === 'ready' ? { kind: 'pan', index: i } : null);
    }
    $('kitchen-board').addEventListener('click', event => { if (!this.ignoreClick(event)) this.board(); });
    this.draggable($('kitchen-board'), () => this.game.shift?.board ? { kind: this.game.shift.board.cuts >= this.game.chopCount ? 'board' : 'chop' } : null);
    $('kitchen-pause').addEventListener('click', () => this.pause(!this.game.shift?.paused));
    $('kitchen-resume').addEventListener('click', () => this.pause(false));
    $('kitchen-bin').addEventListener('click', () => {
      const result = this.game.discardPlate(this.selected?.kind === 'plate' ? this.selected.index : -1);
      this.act(result, '盘子清空了'); if (result.ok) this.select(null);
    });
    $('kitchen-next').addEventListener('click', () => { this.select(null); this.act(this.game.startDay(), '开火吧，订单就在上方'); });
    document.addEventListener('pointermove', event => this.dragMove(event));
    document.addEventListener('pointerup', event => this.dragEnd(event));
    document.addEventListener('pointercancel', () => this.cancelDrag(true));
    document.addEventListener('pointerdown', event => {
      if (this.gesture && event.pointerId !== this.gesture.id) this.cancelDrag(true);
    });
  }
  ignoreClick(event) { return !this.isActive() || !this.game.active || (event?.detail !== 0 && performance.now() < this.suppressClickUntil); }
  open() {
    this.opened = true;
    if (!this.game.shift) this.game.startDay();
    this.selected = null; this.lastHint = ''; this.render(); this.save();
    (this.game.shift?.paused ? $('kitchen-resume') : this.game.shift?.status === 'done' ? $('kitchen-next') : $('kitchen-pan-0')).focus({ preventScroll: true });
  }
  close() { this.pause(true); this.save(); }
  pause(value) {
    this.cancelDrag(true); this.game.pause(value); this.render(); this.save();
  }
  save() {
    if (!this.opened) return;
    if (this.protectSave) { $('kitchen-save-status').textContent = '原记录已保留 · 本次暂不保存'; return; }
    try { localStorage.setItem(KITCHEN_SAVE_KEY, this.game.serialize()); $('kitchen-save-status').textContent = '已保存在此浏览器 · 离开自动暂停'; }
    catch { $('kitchen-save-status').textContent = '暂时无法保存 · 请勿关闭页面'; }
  }
  act(result, message) {
    if (result?.ok) this.save();
    this.render(); this.hint(result?.ok ? message : result?.message);
    return Boolean(result?.ok);
  }
  hint(message) {
    if (message) { this.lastHint = message; $('kitchen-hint').textContent = message; }
  }
  select(source) { this.selected = source; this.render(); }
  pan(index) {
    const stage = this.game.panStage(index);
    if (stage === 'empty') { if (this.act(this.game.startPan(index), '煎面包时，可以先切草莓')) this.bounce($(`kitchen-pan-food-${index}`)); }
    else if (stage === 'burnt') this.act(this.game.clearBurnt(index), '清理好了，再来一片');
    else if (stage === 'ready') { this.select({ kind: 'pan', index }); this.hint('点一个餐盘装进去，也可以直接拖过去'); }
    else this.hint('还没金黄，先做别的吧');
  }
  board() {
    if (this.game.shift?.board?.cuts >= this.game.chopCount) { this.select({ kind: 'board' }); this.hint('点餐盘放草莓；吐司加一份，果盘要两份'); return; }
    const result = this.game.chop();
    if (this.act(result, result.ready ? '草莓切好了，点它再点餐盘' : result.loaded ? '点按或划过砧板，切好草莓' : undefined)) this.bounce($('kitchen-board-food'));
  }
  plate(index) {
    if (this.selected && ['pan', 'board'].includes(this.selected.kind)) this.transfer(this.selected, { kind: 'plate', index });
    else { this.select({ kind: 'plate', index }); this.hint(this.game.shift.plates[index].length ? '点上方对应的顾客出餐，也可以拖过去' : '先点金黄面包或切好的草莓，再点盘子'); }
  }
  customer(id) {
    if (this.selected?.kind !== 'plate') { this.hint('先选装好的餐盘，再点顾客'); return; }
    this.transfer(this.selected, { kind: 'order', id });
  }
  transfer(source, target) {
    if (!this.isActive() || !this.game.active || !source || !target) return false;
    let result;
    if (['pan', 'board'].includes(source.kind) && target.kind === 'plate') {
      result = this.game.addToPlate(source, target.index);
      if (result.ok) this.selected = { kind: 'plate', index: target.index };
      this.act(result, '装好啦，点对应顾客出餐；也可以继续加草莓');
      if (result.ok) this.bounce(this.plateNodes[target.index]);
    } else if (source.kind === 'plate' && target.kind === 'order') {
      result = this.game.serve(source.index, target.id);
      if (result.ok) this.selected = null;
      this.act(result, result.ok ? `出餐 +${result.earned} 金币${result.combo > 1 ? ` · ${result.combo} 连击` : ''}` : undefined);
      if (result.ok) this.bounce($('kitchen-coins'), true);
    }
    return Boolean(result?.ok);
  }
  draggable(button, getSource) {
    button.addEventListener('lostpointercapture', event => { if (this.gesture?.id === event.pointerId) this.cancelDrag(true); });
    button.addEventListener('pointerdown', event => {
      if (event.button !== 0 || event.isPrimary === false || !this.isActive() || !this.game.active || this.gesture) return;
      const source = getSource(); if (!source) return;
      this.gesture = { id: event.pointerId, source, button, x: event.clientX, y: event.clientY, moving: false };
      button.setPointerCapture?.(event.pointerId);
    });
  }
  dragMove(event) {
    const g = this.gesture;
    if (!g || g.id !== event.pointerId) return;
    if (!this.isActive() || !this.game.active) { this.cancelDrag(true); return; }
    if (!g.moving && Math.hypot(event.clientX - g.x, event.clientY - g.y) < 10) return;
    event.preventDefault(); g.moving = true;
    if (g.source.kind === 'chop') return;
    if (!g.ghost) {
      g.ghost = el('span', '', 'kitchen-drag-chip');
      const part = g.source.kind === 'pan' ? 'toast' : g.source.kind === 'board' ? 'fruit' : this.game.shift.plates[g.source.index][0];
      g.ghost.append(this.assets.icon(spriteFor(part), 56)); document.body.append(g.ghost);
    }
    g.ghost.style.transform = `translate(${event.clientX - 32}px,${event.clientY - 36}px)`;
  }
  dragEnd(event) {
    const g = this.gesture; if (!g || g.id !== event.pointerId) return;
    if (!g.moving) { this.cancelDrag(); return; }
    const target = document.elementFromPoint?.(event.clientX, event.clientY)?.closest?.('[data-kitchen-target]');
    this.cancelDrag(true);
    if (!this.isActive() || !this.game.active) return;
    if (g.source.kind === 'chop') { this.board(); return; }
    if (target) this.transfer(g.source, target.dataset.kitchenTarget === 'plate' ? { kind: 'plate', index: Number(target.dataset.index) } : { kind: 'order', id: Number(target.dataset.orderId) });
    else this.hint('没有放进去，食物还在原处');
  }
  cancelDrag(suppress = false) {
    if (suppress && this.gesture) this.suppressClickUntil = performance.now() + 450;
    this.gesture?.ghost?.remove(); this.gesture = null;
  }
  step(dt) {
    if (!this.isActive()) return;
    const before = this.game.shift?.status, burnt = this.game.shift?.burnt, missed = this.game.shift?.missed;
    this.game.update(dt);
    if (this.game.shift?.burnt > burnt) this.hint('面包煎焦了，点锅清理；下次金黄时就装盘');
    if (this.game.shift?.missed > missed && this.game.shift.status === 'open') this.hint('有顾客等不及了，先做快没耐心的那单');
    if (this.game.shift?.status !== before) { this.cancelDrag(true); this.selected = null; this.save(); }
    this.paintTime = (this.paintTime || 0) + dt;
    if (this.paintTime >= .08 || this.game.shift?.status !== before) { this.paintTime = 0; this.render(); }
  }
  food(id, key, parts) {
    if (this.lastSprites.get(id) === key) return;
    this.lastSprites.set(id, key); $(id).replaceChildren(...parts.map(part => this.assets.icon(part, 110)));
  }
  renderMenu() {
    const state = this.game.state;
    $('kitchen-menu-summary').textContent = state.totalServed ? `第 ${state.day} 天 · 已出餐 ${state.totalServed} 份 · ${state.coins} 金币` : '双锅开火，给小猫做一份热早餐。';
    $('menu-kitchen').textContent = this.game.shift ? '继续小厨房 →' : '进入小厨房 →';
  }
  render() {
    const game = this.game, s = game.shift; this.renderMenu(); if (!s) return;
    const done = s.status === 'done', locked = !game.active;
    $('kitchen-day').textContent = `第 ${game.state.day} 天 · 早餐营业`;
    $('kitchen-coins').textContent = `${game.state.coins} 金币`;
    $('kitchen-combo').textContent = s.combo > 1 ? `${s.combo} 连击 · 出餐 ${s.served} 份` : `出餐 ${s.served} 份`;
    $('kitchen-clock').textContent = s.guided ? '第一单 · 不计时，慢慢来' : `营业剩余 ${Math.max(0, Math.ceil(SHIFT_SECONDS - s.time))} 秒`;
    $('kitchen-goal').textContent = `目标 ${s.served} / ${game.target} 份`;
    $('kitchen-service').hidden = done; $('kitchen-result').hidden = !done;
    $('kitchen-pause').disabled = done;
    $('kitchen-pause').textContent = s.paused ? '继续' : '暂停'; $('kitchen-pause').setAttribute('aria-pressed', String(s.paused));
    $('kitchen-pause-band').hidden = !s.paused;
    if (done) { this.renderResult(); return; }
    for (let i = 0; i < 2; i++) {
      const stage = game.panStage(i), button = $(`kitchen-pan-${i}`), progress = $(`kitchen-pan-progress-${i}`);
      button.className = `kitchen-station pan-station ${stage}${this.selected?.kind === 'pan' && this.selected.index === i ? ' selected' : ''}`;
      button.disabled = locked;
      const left = Math.max(0, Math.ceil(game.burnAt - (s.pans[i]?.heat || 0)));
      const label = stage === 'empty' ? '点一下，下面包' : stage === 'cooking' ? `煎制中 ${Math.max(1, Math.ceil(TOAST_SECONDS - s.pans[i].heat))} 秒` : stage === 'ready' ? `金黄啦！${left} 秒内装盘` : '煎焦了 · 点一下清理';
      $(`kitchen-pan-label-${i}`).textContent = label; button.setAttribute('aria-label', `${i === 0 ? '左' : '右'}煎锅：${label}`);
      progress.max = game.burnAt; progress.value = s.pans[i]?.heat || 0;
      this.food(`kitchen-pan-food-${i}`, stage, stage === 'empty' ? [] : ['bread']);
    }
    const cuts = s.board?.cuts || 0, ready = Boolean(s.board && cuts >= game.chopCount);
    $('kitchen-board').className = `kitchen-station board-station${ready ? ' ready' : ''}${this.selected?.kind === 'board' ? ' selected' : ''}`;
    $('kitchen-board').disabled = locked;
    $('kitchen-board-label').textContent = !s.board ? '点一下，放草莓' : ready ? '切好了 · 放入餐盘' : `再切 ${game.chopCount - cuts} 刀`;
    $('kitchen-board').setAttribute('aria-label', `草莓砧板：${$('kitchen-board-label').textContent}`);
    $('kitchen-board-progress').max = game.chopCount; $('kitchen-board-progress').value = cuts;
    this.food('kitchen-board-food', s.board ? `fruit-${cuts}` : 'empty', s.board ? ['strawberry'] : []);
    if (s.board) $('kitchen-board-food').style.transform = ready ? 'rotate(-8deg) scale(.9)' : `rotate(${cuts % 2 ? 8 : -5}deg)`;
    this.renderPlates(locked); this.renderOrders(locked);
    $('kitchen-bin').disabled = locked || this.selected?.kind !== 'plate' || !s.plates[this.selected.index]?.length;
    if (!this.lastHint) this.hint(s.guided ? '点煎锅 → 金黄后点锅 → 点餐盘 → 点顾客' : '两口锅可以同时煎，等候时切草莓');
  }
  renderPlates(locked) {
    const s = this.game.shift;
    if (this.plateNodes.length !== s.plates.length) {
      this.plateNodes = s.plates.map((_, index) => {
        const button = el('button', '', 'kitchen-plate'); button.dataset.kitchenTarget = 'plate'; button.dataset.index = String(index);
        button.addEventListener('click', event => { if (!this.ignoreClick(event)) this.plate(index); });
        this.draggable(button, () => this.game.shift.plates[index].length ? { kind: 'plate', index } : null);
        return button;
      });
      $('kitchen-plates').replaceChildren(...this.plateNodes);
    }
    this.plateNodes.forEach((button, i) => {
      const parts = s.plates[i], key = parts.join(',');
      if (button.dataset.parts !== key) { button.dataset.parts = key; button.replaceChildren(...parts.map(part => this.assets.icon(spriteFor(part), 64)), el('small', parts.length ? '点选出餐' : `餐盘 ${i + 1}`)); }
      button.disabled = locked; button.classList.toggle('selected', this.selected?.kind === 'plate' && this.selected.index === i);
      button.setAttribute('aria-pressed', String(this.selected?.kind === 'plate' && this.selected.index === i));
      button.setAttribute('aria-label', `餐盘 ${i + 1}：${parts.map(p => p === 'toast' ? '煎面包' : '草莓').join('加') || '空盘'}，点选或拖动`);
    });
  }
  renderOrders(locked) {
    const orders = this.game.shift.orders, key = `${this.game.state.day}:` + orders.map(o => `${o.id}-${o.dish}`).join(',');
    if (key !== this.ordersKey) {
      this.ordersKey = key; this.orderNodes.clear();
      const cards = orders.map(order => {
        const button = el('button', '', 'kitchen-order'), cat = el('span', '', 'kitchen-cat'), text = el('span');
        const color = ['cream', 'peach', 'gray'][(order.id - 1) % 3];
        cat.append(this.assets.icon(`cat_${color}_body`, 54), this.assets.icon(`cat_${color}_head`, 54));
        text.append(el('strong', DISHES[order.dish].label), el('small', DISHES[order.dish].recipe));
        const progress = el('progress'); progress.max = order.patience; progress.value = order.left;
        progress.setAttribute('aria-label', '顾客耐心');
        button.dataset.kitchenTarget = 'order'; button.dataset.orderId = String(order.id);
        button.append(cat, text, progress); button.addEventListener('click', event => { if (!this.ignoreClick(event)) this.customer(order.id); });
        this.orderNodes.set(order.id, { button, progress }); return button;
      });
      const spots = this.game.state.day === 1 ? 2 : 3;
      while (cards.length < spots) cards.push(el('div', '等下一位小客人…', 'kitchen-order waiting'));
      $('kitchen-orders').style.gridTemplateColumns = `repeat(${spots},minmax(0,1fr))`;
      $('kitchen-orders').replaceChildren(...cards);
    }
    const matches = this.selected?.kind === 'plate' ? this.game.matchingOrders(this.selected.index) : [];
    for (const order of orders) {
      const node = this.orderNodes.get(order.id); node.progress.value = order.left; node.button.disabled = locked;
      node.button.classList.toggle('match', matches.includes(order.id)); node.button.classList.toggle('urgent', order.left < 10);
      node.button.setAttribute('aria-label', `${DISHES[order.dish].label}，${DISHES[order.dish].recipe}，${this.game.shift.guided ? '不计时' : `耐心剩余 ${Math.ceil(order.left)} 秒`}，点此出餐`);
    }
  }
  renderResult() {
    const s = this.game.shift, passed = s.served >= this.game.target;
    $('kitchen-result-title').textContent = passed ? `第 ${this.game.state.day} 天，顺利收工！` : '慢慢练，再试一次';
    $('kitchen-result-stats').textContent = `出餐 ${s.served} / ${this.game.target} 份 · 收入 ${s.earnings} 金币 · 最佳 ${s.bestCombo} 连击\n煎焦 ${s.burnt} 份 · 错过 ${s.missed} 单`;
    $('kitchen-next').textContent = passed ? `第 ${this.game.state.day + 1} 天 · 开始营业 →` : '再试今天 · 收入与升级保留 →';
    const key = JSON.stringify([this.game.state.coins, this.game.state.upgrades]);
    if (key === this.upgradeKey) return; this.upgradeKey = key;
    const cards = Object.entries(KITCHEN_UPGRADES).map(([key, upgrade]) => {
      const level = this.game.state.upgrades[key], price = upgrade.costs[level], card = el('article', '', 'kitchen-upgrade');
      const buy = el('button', price === undefined ? '已升满 ✓' : `${price} 金币 · 升级`, 'soft-button');
      buy.disabled = price === undefined || this.game.state.coins < price; buy.dataset.kitchenUpgrade = key;
      buy.addEventListener('click', () => this.act(this.game.upgrade(key), '厨具升级好了，下次营业生效'));
      card.append(this.assets.icon(upgrade.icon, 52), el('strong', upgrade.label), el('p', upgrade.detail), buy); return card;
    });
    $('kitchen-upgrades').replaceChildren(...cards);
  }
}
