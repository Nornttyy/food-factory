import { KitchenGame, KITCHEN_SAVE_KEY, KITCHEN_UPGRADES, DISHES, PARTS, PANTRY, DECOR, TOAST_SECONDS } from './factory-kitchen.js?v=0.25.0';
import { dishMatches } from './factory-kitchen-content.js?v=0.25.0';

const $ = id => document.querySelector(`#${id}`);
const el = (tag, text = '', className = '') => { const node = document.createElement(tag); node.textContent = text; node.className = className; return node; };
const spriteFor = part => PARTS[part]?.sprite;
export class KitchenView {
  constructor({ assets, isActive, bounce = () => {} }) {
    this.assets = assets; this.isActive = isActive; this.bounce = bounce;
    this.game = new KitchenGame(); this.selected = null; this.gesture = null;
    this.protectSave = false; this.opened = false; this.orderNodes = new Map(); this.plateNodes = [];
    this.lastSprites = new Map(); this.upgradeKey = ''; this.lastHint = ''; this.suppressClickUntil = 0;
    this.panChoice = 'toast'; this.boardChoice = 'fruit'; this.drinkChoice = 'juice'; this.decorOpen = false; this.decorTab = 'plate'; this.pouring = false;
    try {
      const raw = localStorage.getItem(KITCHEN_SAVE_KEY);
      if (raw) {
        if (!this.game.restore(raw)) {
          try { localStorage.setItem(`${KITCHEN_SAVE_KEY}-recovery-${Date.now()}`, raw); }
          catch { this.protectSave = true; }
        } else if (JSON.parse(raw).version === 1) {
          try { localStorage.setItem(`${KITCHEN_SAVE_KEY}-before-recipes-v2`, raw); }
          catch { this.protectSave = true; }
        }
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
    $('kitchen-decor-toggle').addEventListener('click', () => {
      this.beforeDecorPause = this.game.shift?.paused; this.pause(true); this.decorOpen = true; this.render();
    });
    $('kitchen-decor-back').addEventListener('click', () => this.closeDecor());
    $('kitchen-drink-clear').addEventListener('click', () => { this.cancelDrag(true); this.act(this.game.discardDrink(), '杯子清空了'); });
    $('kitchen-pour-step').addEventListener('click', () => this.drinkClick());
    $('kitchen-drink').addEventListener('click', event => { if (!this.ignoreClick(event)) this.drinkClick(); });
    $('kitchen-drink').addEventListener('pointerdown', event => this.drinkDown(event));
    $('kitchen-drink').addEventListener('lostpointercapture', event => { if (this.gesture?.id === event.pointerId) this.cancelDrag(true); });
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
  close() { this.decorOpen = false; this.pause(true); this.save(); }
  closeDecor() { this.decorOpen = false; this.pause(Boolean(this.beforeDecorPause)); }
  pause(value) {
    if (this.decorOpen && !value) return;
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
    if (stage === 'empty') { if (this.act(this.game.startPan(index, this.panChoice), this.panChoice === 'egg' ? '第一面凝固后点锅翻面，再煎另一面' : '煎制时，可以切配料或倒饮品')) this.bounce($(`kitchen-pan-food-${index}`)); }
    else if (stage === 'flip') { if (this.act(this.game.flipPan(index), '翻好面了，再等另一面凝固')) this.bounce($(`kitchen-pan-food-${index}`), true); }
    else if (stage === 'burnt') this.act(this.game.clearBurnt(index), '清理好了，再来一片');
    else if (stage === 'ready') { this.select({ kind: 'pan', index }); this.hint('点一个餐盘装进去，也可以直接拖过去'); }
    else this.hint('还没金黄，先做别的吧');
  }
  board() {
    if (this.game.shift?.board?.cuts >= this.game.chopCount) { this.select({ kind: 'board' }); this.hint('切好了，点餐盘放入；叠餐按上方订单顺序'); return; }
    const result = this.game.chop(this.boardChoice);
    if (this.act(result, result.ready ? '切好了，点它再点餐盘' : result.loaded ? '点按或划过砧板，切好配料' : undefined)) this.bounce($('kitchen-board-food'));
  }
  plate(index) {
    if (this.selected && ['pan', 'board', 'pantry', 'drink'].includes(this.selected.kind)) this.transfer(this.selected, { kind: 'plate', index });
    else { this.select({ kind: 'plate', index }); this.hint(this.game.shift.plates[index].length ? '点上方对应的顾客出餐，也可以拖过去' : '先点金黄面包或切好的草莓，再点盘子'); }
  }
  customer(id) {
    if (this.selected?.kind !== 'plate') { this.hint('先选装好的餐盘，再点顾客'); return; }
    this.transfer(this.selected, { kind: 'order', id });
  }
  transfer(source, target) {
    if (!this.isActive() || !this.game.active || !source || !target) return false;
    let result;
    if (['pan', 'board', 'pantry', 'drink'].includes(source.kind) && target.kind === 'plate') {
      result = this.game.addToPlate(source, target.index);
      if (result.ok) this.selected = { kind: 'plate', index: target.index };
      this.act(result, '已放入餐盘，按订单顺序继续叠，配齐再出餐');
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
  drinkClick() {
    if (!this.isActive() || !this.game.active) return;
    let drink = this.game.shift.drink;
    if (!drink) { if (!this.game.startDrink(this.drinkChoice).ok) return; drink = this.game.shift.drink; }
    if (drink.stage === 'ready') { this.select({ kind: 'drink' }); this.hint('点餐盘放饮品，再交给顾客'); return; }
    if (drink.stage === 'mixing') { this.act(this.game.stirDrink(), '左右摇匀，也可点按 4 次'); this.bounce($('kitchen-drink-vessel')); return; }
    if (drink.stage === 'spilled' || drink.fill > .75) { this.hint('倒多了，点清空再来'); return; }
    this.game.pourDrink(.4);
    if (drink.fill >= .55) this.game.finishPour();
    this.save(); this.render();
  }
  drinkDown(event) {
    if (event.button !== 0 || event.isPrimary === false || this.gesture || !this.isActive() || !this.game.active) return;
    if (!this.game.shift.drink && !this.game.startDrink(this.drinkChoice).ok) return;
    const stage = this.game.shift.drink.stage;
    if (stage === 'spilled') return;
    const kind = stage === 'filling' ? 'pour' : stage === 'mixing' ? 'mix' : 'drink';
    this.gesture = { id: event.pointerId, source: { kind }, button: $('kitchen-drink'), x: event.clientX, y: event.clientY, lastX: event.clientX, direction: 0, moving: false };
    this.pouring = kind === 'pour'; $('kitchen-drink').setPointerCapture?.(event.pointerId);
    this.save(); this.render();
  }
  dragMove(event) {
    const g = this.gesture;
    if (!g || g.id !== event.pointerId) return;
    if (!this.isActive() || !this.game.active) { this.cancelDrag(true); return; }
    if (!g.moving && Math.hypot(event.clientX - g.x, event.clientY - g.y) < 10) return;
    event.preventDefault(); g.moving = true;
    if (g.source.kind === 'pour') return;
    if (g.source.kind === 'mix') {
      const delta = event.clientX - g.lastX, direction = Math.sign(delta);
      if (Math.abs(delta) >= 20 && direction !== g.direction) {
        g.direction = direction; g.lastX = event.clientX;
        this.game.stirDrink(.25); this.bounce($('kitchen-drink-vessel')); this.save(); this.render();
      }
      return;
    }
    if (g.source.kind === 'chop') return;
    if (!g.ghost) {
      g.ghost = el('span', '', 'kitchen-drag-chip');
      const part = g.source.kind === 'pan' ? this.game.shift.pans[g.source.index]?.kind : g.source.kind === 'board' ? this.game.shift.board?.kind : g.source.kind === 'pantry' ? g.source.part : g.source.kind === 'drink' ? this.game.shift.drink?.kind : this.game.shift.plates[g.source.index][0];
      g.ghost.append(this.assets.icon(spriteFor(part), 56)); document.body.append(g.ghost);
    }
    g.ghost.style.transform = `translate(${event.clientX - 32}px,${event.clientY - 36}px)`;
  }
  dragEnd(event) {
    const g = this.gesture; if (!g || g.id !== event.pointerId) return;
    if (g.source.kind === 'pour') { this.cancelDrag(true); this.act(this.game.finishPour(), this.game.shift.drink?.kind === 'shake' ? '接着左右摇匀奶昔' : '刻度刚好，可以装盘'); return; }
    if (g.source.kind === 'mix' && g.moving) { this.cancelDrag(true); return; }
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
    this.gesture?.ghost?.remove(); this.gesture = null; this.pouring = false;
  }
  step(dt) {
    if (!this.isActive()) return;
    const before = this.game.shift?.status, burnt = this.game.shift?.burnt, missed = this.game.shift?.missed;
    if (this.pouring) this.game.pourDrink(Math.min(.1, dt));
    this.game.update(dt);
    if (this.game.shift?.burnt > burnt) this.hint('食物煎焦了，点锅清理；下次及时翻面、装盘');
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
    $('kitchen-room').dataset.paused = String(locked);
    this.renderSkins(); this.renderPickers(locked);
    $('kitchen-day').textContent = `第 ${game.state.day} 天 · 早餐营业`;
    $('kitchen-coins').textContent = `${game.state.coins} 金币`;
    $('kitchen-combo').textContent = s.combo > 1 ? `${s.combo} 连击 · 出餐 ${s.served} 份` : `出餐 ${s.served} 份`;
    $('kitchen-clock').textContent = s.guided ? '第一单 · 慢慢来' : `剩余 ${Math.max(0, Math.ceil(game.duration - s.time))} 秒`;
    $('kitchen-goal').textContent = `目标 ${s.served} / ${game.target} 份`;
    $('kitchen-service').hidden = done || this.decorOpen; $('kitchen-result').hidden = !done || this.decorOpen;
    $('kitchen-decor').hidden = !this.decorOpen;
    $('kitchen-pause').disabled = done || this.decorOpen; $('kitchen-decor-toggle').disabled = this.decorOpen;
    $('kitchen-pause').textContent = s.paused ? '继续' : '暂停'; $('kitchen-pause').setAttribute('aria-pressed', String(s.paused));
    $('kitchen-pause-band').hidden = !s.paused;
    if (this.decorOpen) { this.renderDecor(); return; }
    if (done) { this.renderResult(); return; }
    for (let i = 0; i < 2; i++) {
      const stage = game.panStage(i), button = $(`kitchen-pan-${i}`), progress = $(`kitchen-pan-progress-${i}`);
      button.className = `kitchen-station pan-station ${stage}${this.selected?.kind === 'pan' && this.selected.index === i ? ' selected' : ''}`;
      button.disabled = locked;
      const left = Math.max(0, Math.ceil(game.burnAt - (s.pans[i]?.heat || 0)));
      const pan = s.pans[i], kind = pan?.kind || this.panChoice;
      const seconds = kind === 'egg' ? pan?.flipped ? 3 - pan.side : 3 - (pan?.heat || 0) : (kind === 'patty' ? 6 : TOAST_SECONDS) - (pan?.heat || 0);
      const label = stage === 'empty' ? `下${({ toast: '面包', egg: '鸡蛋', patty: '肉饼' })[this.panChoice]}` : stage === 'flip' ? '翻面 ↻' : stage === 'cooking' ? `${pan?.flipped ? '第二面' : '煎制中'} ${Math.max(1, Math.ceil(seconds))} 秒` : stage === 'ready' ? `装盘 · ${left} 秒` : '煎焦了 · 清理';
      $(`kitchen-pan-label-${i}`).textContent = label; button.setAttribute('aria-label', `${i === 0 ? '左' : '右'}煎锅 · ${PARTS[kind].label}：${label}`);
      progress.max = game.burnAt; progress.value = s.pans[i]?.heat || 0;
      const sprite = kind === 'egg' ? pan?.flipped && stage !== 'ready' ? 'k_egg_flip' : stage === 'ready' ? 'k_egg_cooked' : 'k_egg_raw' : kind === 'patty' ? stage === 'cooking' ? 'k_patty_raw' : 'k_patty_cooked' : 'bread';
      this.food(`kitchen-pan-food-${i}`, `${stage}-${sprite}`, stage === 'empty' ? [] : [sprite]);
    }
    const cuts = s.board?.cuts || 0, ready = Boolean(s.board && cuts >= game.chopCount);
    $('kitchen-board').className = `kitchen-station board-station${ready ? ' ready' : ''}${this.selected?.kind === 'board' ? ' selected' : ''}`;
    $('kitchen-board').disabled = locked;
    $('kitchen-board-label').textContent = !s.board ? `放${this.boardChoice === 'fruit' ? '草莓' : '番茄'}` : ready ? '切好了 · 装盘' : `再切 ${game.chopCount - cuts} 刀`;
    $('kitchen-board').setAttribute('aria-label', `${PARTS[s.board?.kind || this.boardChoice].label}砧板：${$('kitchen-board-label').textContent}`);
    $('kitchen-board-progress').max = game.chopCount; $('kitchen-board-progress').value = cuts;
    const boardSprite = s.board?.kind === 'tomato' ? ready ? 'k_tomato_cut' : 'k_tomato' : ready ? 'k_berry_cut' : 'strawberry';
    this.food('kitchen-board-food', s.board ? `${boardSprite}-${cuts}` : 'empty', s.board ? [boardSprite] : []);
    if (s.board) $('kitchen-board-food').style.transform = ready ? 'rotate(-8deg) scale(.9)' : `rotate(${cuts % 2 ? 8 : -5}deg)`;
    this.renderPlates(locked); this.renderOrders(locked);
    this.renderDrink(locked);
    $('kitchen-bin').disabled = locked || this.selected?.kind !== 'plate' || !s.plates[this.selected.index]?.length;
    if (!this.lastHint) this.hint(s.guided ? '点煎锅 → 金黄后点锅 → 点餐盘 → 点顾客' : '两口锅可以同时煎，等候时切草莓');
  }
  renderPickers(locked) {
    const key = JSON.stringify([this.game.state.day, this.panChoice, this.boardChoice, this.drinkChoice, locked, this.selected?.part]);
    if (key === this.pickerKey) return; this.pickerKey = key;
    const group = (id, parts, field) => {
      const buttons = parts.filter(p => this.game.unlocked(p)).map(part => {
        const button = el('button', '', 'ingredient-pick'); button.dataset.ingredient = part; button.disabled = locked;
        button.classList.toggle('active', this[field] === part); button.setAttribute('aria-pressed', String(this[field] === part));
        button.setAttribute('aria-label', `下一份：${PARTS[part].label}`);
        button.append(this.assets.icon(spriteFor(part), 48), el('span', PARTS[part].label));
        button.addEventListener('click', () => { this[field] = part; this.render(); this.hint('只改变下一份原料，台上正在做的不会丢失'); }); return button;
      });
      $(id).replaceChildren(...buttons); $(id).hidden = buttons.length < 2;
    };
    group('kitchen-pan-picker', ['toast', 'egg', 'patty'], 'panChoice');
    group('kitchen-board-picker', ['fruit', 'tomato'], 'boardChoice');
    group('kitchen-drink-picker', ['juice', 'shake'], 'drinkChoice');
    const pantry = PANTRY.filter(p => this.game.unlocked(p)).map(part => {
      const button = el('button', '', 'ingredient-pick'); button.dataset.pantry = part; button.disabled = locked;
      button.setAttribute('aria-label', `放入餐盘：${PARTS[part].label}`);
      button.append(this.assets.icon(spriteFor(part), 48), el('span', PARTS[part].label));
      button.setAttribute('aria-pressed', String(this.selected?.kind === 'pantry' && this.selected.part === part));
      button.addEventListener('click', event => { if (!this.ignoreClick(event)) { this.select({ kind: 'pantry', part }); this.hint(`已选${PARTS[part].label}，点餐盘按顺序叠上去`); } });
      this.draggable(button, () => ({ kind: 'pantry', part })); return button;
    });
    $('kitchen-pantry').hidden = !pantry.length; $('kitchen-pantry').replaceChildren(...pantry);
  }
  renderSkins() {
    if (!this.assets.ready) return;
    const equipped = this.game.state.decor.equipped, key = JSON.stringify(equipped);
    if (key === this.skinKey) return; this.skinKey = key;
    for (let i = 0; i < 2; i++) $(`kitchen-pan-art-${i}`).replaceChildren(this.art(DECOR[equipped.pan].sprite, 220));
    $('kitchen-board-art').replaceChildren(this.art('k_board', 220));
    $('kitchen-knife-art').replaceChildren(this.art('k_knife', 100));
    $('kitchen-counter-skin').replaceChildren(this.art(DECOR[equipped.cloth].sprite, 700));
    $('kitchen-ornament').replaceChildren(...(equipped.ornament === 'none' ? [] : [this.assets.icon(DECOR[equipped.ornament].sprite, 68)]));
  }
  art(id, width) {
    const f = this.assets.sprites[id].frame, canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = Math.round(width * f.h / f.w);
    this.assets.draw(canvas.getContext('2d'), id, 0, 0, canvas.width, canvas.height);
    canvas.setAttribute('aria-hidden', 'true'); return canvas;
  }
  renderDrink(locked) {
    const drink = this.game.shift.drink, kind = drink?.kind || this.drinkChoice, stage = drink?.stage;
    $('kitchen-drink-station').hidden = !this.game.unlocked('juice');
    $('kitchen-drink-station').dataset.stage = stage || 'empty';
    $('kitchen-drink-station').classList.toggle('selected', this.selected?.kind === 'drink');
    $('kitchen-room').classList.toggle('has-drinks', this.game.unlocked('juice'));
    $('kitchen-drink').disabled = locked; $('kitchen-pour-step').disabled = locked;
    $('kitchen-drink-clear').disabled = locked || !drink;
    $('kitchen-drink-label').textContent = stage === 'ready' ? '做好了 · 装盘' : stage === 'mixing' ? `摇匀 ${Math.round(drink.stir * 100)}%` : stage === 'spilled' || drink?.fill > .75 ? '倒多了 · 清空' : this.pouring ? '绿区松手！' : '按住倒到绿区';
    $('kitchen-pour-step').textContent = stage === 'ready' ? '装盘' : stage === 'mixing' ? '摇一下' : '加一点';
    $('kitchen-drink-progress').value = drink?.fill || 0;
    this.food('kitchen-drink-tool', kind, [kind === 'juice' ? 'k_pitcher' : 'k_shaker']);
    const full = stage === 'ready' || stage === 'mixing', key = `${kind}-${full}`;
    if (key !== this.drinkArtKey) {
      this.drinkArtKey = key;
      const empty = this.assets.icon('k_glass', 120), fill = this.assets.icon(spriteFor(kind), 120);
      empty.className = 'drink-empty'; fill.className = 'drink-filled'; this.drinkFill = fill;
      $('kitchen-drink-vessel').replaceChildren(empty, fill);
    }
    this.drinkFill.style.clipPath = `inset(${full ? 0 : Math.max(0, 100 - (drink?.fill || 0) * 100)}% 0 0 0)`;
    $('kitchen-drink-tool').classList.toggle('pouring', this.pouring);
    $('kitchen-drink').setAttribute('aria-label', `${PARTS[kind].label}：${$('kitchen-drink-label').textContent}`);
  }
  renderDecor() {
    const key = JSON.stringify([this.decorTab, this.game.state.coins, this.game.state.decor]);
    if (key === this.decorKey) return; this.decorKey = key;
    $('kitchen-decor-tabs').replaceChildren(...Object.entries({ plate: '餐盘', pan: '煎锅', cloth: '桌布', ornament: '小摆件' }).map(([category, label]) => {
      const button = el('button', label, 'soft-button'); button.setAttribute('aria-pressed', String(this.decorTab === category));
      button.addEventListener('click', () => { this.decorTab = category; this.renderDecor(); }); return button;
    }));
    $('kitchen-decor-items').replaceChildren(...Object.entries(DECOR).filter(([, item]) => item.category === this.decorTab).map(([id, item]) => {
      const owned = this.game.state.decor.owned.includes(id), equipped = this.game.state.decor.equipped[item.category] === id;
      const card = el('article', '', 'decor-card'), button = el('button', equipped ? '使用中 ✓' : owned ? '免费换上' : `${item.price} 金币 · 买下并换上`, 'soft-button');
      button.dataset.decor = id; button.disabled = equipped || !owned && this.game.state.coins < item.price;
      button.addEventListener('click', () => { const result = this.game.decorate(id); this.act(result); $('kitchen-decor-message').textContent = result.ok ? `换上了${item.label}` : result.message; });
      card.append(this.assets.icon(item.sprite, 120), el('strong', item.label), button); return card;
    }));
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
      const parts = s.plates[i], plateId = this.game.state.decor.equipped.plate, key = `${plateId}:` + parts.join(',');
      if (button.dataset.parts !== key) {
        button.dataset.parts = key;
        const base = this.art(DECOR[plateId].sprite, 150); base.className = 'plate-background';
        const complete = Object.values(DISHES).find(d => d.ordered && dishMatches(parts, d));
        const layers = complete ? [this.assets.icon(complete.sprite, 92)] : parts.map((part, n) => {
          const icon = this.assets.icon(spriteFor(part), 76); icon.className = 'plate-food';
          if (parts.length > 2 || ['slice', 'bun_base'].includes(parts[0])) { icon.style.top = `${26 - n * 6}%`; icon.style.left = '18%'; icon.style.width = '64%'; icon.style.height = '64%'; }
          return icon;
        });
        if (complete) layers[0].className = 'plate-complete';
        button.replaceChildren(base, ...layers);
      }
      button.disabled = locked; button.classList.toggle('selected', this.selected?.kind === 'plate' && this.selected.index === i);
      button.setAttribute('aria-pressed', String(this.selected?.kind === 'plate' && this.selected.index === i));
      button.setAttribute('aria-label', `餐盘 ${i + 1}：${parts.map(p => PARTS[p].label).join('加') || '空盘'}，点选或拖动`);
    });
  }
  renderOrders(locked) {
    const orders = this.game.shift.orders, key = `${this.game.state.day}:` + orders.map(o => `${o.id}-${o.dish}`).join(',');
    if (key !== this.ordersKey) {
      this.ordersKey = key; this.orderNodes.clear();
      const cards = orders.map(order => {
        const button = el('button', '', 'kitchen-order'), cat = el('span', '', 'kitchen-cat'), ticket = el('span', '', 'kitchen-ticket');
        const color = ['cream', 'peach', 'gray'][(order.id - 1) % 3];
        for (const part of ['body', 'head', 'hand_l', 'hand_r']) {
          const icon = this.assets.icon(`cat_${color}_${part}`, 96); icon.className = `cat-${part}`; cat.append(icon);
        }
        const dish = DISHES[order.dish], recipe = el('span', '', 'kitchen-recipe');
        recipe.setAttribute('aria-hidden', 'true'); ticket.title = dish.recipe;
        dish.parts.forEach((part, index) => {
          if (index) recipe.append(el('span', dish.ordered ? '›' : '+', 'recipe-separator'));
          recipe.append(this.assets.icon(spriteFor(part), 32));
        });
        ticket.append(el('strong', dish.label), recipe);
        const progress = el('progress'); progress.max = order.patience; progress.value = order.left;
        progress.setAttribute('aria-label', '顾客耐心');
        button.dataset.kitchenTarget = 'order'; button.dataset.orderId = String(order.id);
        ticket.append(progress); button.append(ticket, cat);
        button.addEventListener('click', event => { if (!this.ignoreClick(event)) this.customer(order.id); });
        this.orderNodes.set(order.id, { button, progress }); return button;
      });
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
