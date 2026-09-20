// The hands-on kitchen has its own device-local save. Factory saves are never migrated.
import { DISHES, PARTS, PANTRY, DECOR, defaultDecor, dishMatches, fitsRecipe } from './factory-kitchen-content.js?v=0.25.0';
export { DISHES, PARTS, PANTRY, DECOR };
export const KITCHEN_SAVE_KEY = 'food-factory-kitchen-v1';
export const SHIFT_SECONDS = 90;
export const TOAST_SECONDS = 5;
export const KITCHEN_UPGRADES = {
  heat: { label: '防焦煎锅', detail: '金黄后的装盘时间 +3 秒', costs: [50, 90], icon: 'bread' },
  knife: { label: '顺手小刀', detail: '切好一份：3 刀 → 2 刀', costs: [60], icon: 'strawberry' },
  plates: { label: '多一个餐盘', detail: '同时备好 3 盘，错峰出餐', costs: [75], icon: 'serving_plate' },
};
const ok = extra => ({ ok: true, ...extra });
const fail = message => ({ ok: false, message });
const integer = (n, min, max) => Number.isSafeInteger(n) && n >= min && n <= max;
const number = (n, min, max) => Number.isFinite(n) && n >= min && n <= max;
const own = (object, key) => Object.hasOwn(object, key);
export function createKitchenState() {
  return { version: 2, day: 1, coins: 0, totalServed: 0, bestCombo: 0, upgrades: { heat: 0, knife: 0, plates: 0 }, decor: defaultDecor(), shift: null };
}
export class KitchenGame {
  constructor() { this.state = createKitchenState(); }
  get shift() { return this.state.shift; }
  get active() { return this.shift?.status === 'open' && !this.shift.paused; }
  get burnAt() { return 12 + this.state.upgrades.heat * 3; }
  get chopCount() { return 3 - this.state.upgrades.knife; }
  get plateCount() { return 2 + this.state.upgrades.plates; }
  get target() { return Math.min(8, 4 + Math.floor((this.state.day - 1) / 2)); }
  get duration() { return this.shift?.duration || SHIFT_SECONDS; }
  unlocked(part) { return own(PARTS, part) && PARTS[part].day <= this.state.day; }
  panStage(index) {
    const pan = this.shift?.pans[index];
    if (!pan) return 'empty';
    if (pan.heat >= this.burnAt) return 'burnt';
    if (pan.kind === 'egg') return !pan.flipped ? pan.heat >= 3 ? 'flip' : 'cooking' : pan.side >= 3 ? 'ready' : 'cooking';
    return pan.heat >= (pan.kind === 'patty' ? 6 : TOAST_SECONDS) ? 'ready' : 'cooking';
  }
  startDay() {
    if (this.shift?.status === 'open') return fail('这一天还没打烊');
    if (this.shift?.status === 'done' && this.shift.served >= this.target) this.state.day++;
    this.state.shift = { status: 'open', paused: false, time: 0, duration: this.state.day >= 3 ? 120 : 90, guided: this.state.totalServed === 0, pans: [null, null], board: null, drink: null,
      plates: Array.from({ length: this.plateCount }, () => []), orders: [], created: 0, spawnIn: 0,
      served: 0, missed: 0, burnt: 0, combo: 0, bestCombo: 0, earnings: 0 };
    this.spawnOrder(); return ok();
  }
  pause(value) { if (this.shift?.status === 'open') this.shift.paused = Boolean(value); }
  spawnOrder() {
    const s = this.shift;
    if (!s || s.status !== 'open' || s.created >= this.target + 2) return;
    const sequence = this.state.day === 1 ? ['butter', 'berry', 'butter', 'berry', 'berry', 'butter'] : this.state.day === 2 ? ['egg', 'juice', 'eggtoast', 'fruit', 'berry', 'juice'] : this.state.day === 3 ? ['sandwich', 'shake', 'egg', 'juice', 'sandwich', 'berry'] : ['burger', 'shake', 'sandwich', 'juice', 'egg', 'burger'];
    const id = ++s.created, dish = sequence[(id - 1 + (this.state.day === 1 ? 0 : this.state.day - 2)) % sequence.length];
    const patience = Math.max(32, 42 - (this.state.day - 1) * 2) + (DISHES[dish].ordered ? 18 : 0);
    s.orders.push({ id, dish, left: patience, patience });
    s.spawnIn = this.state.day === 1 ? 10 : 8;
  }
  update(dt) {
    if (!this.active || !number(dt, 0, 10)) return;
    // Small deterministic steps avoid skipped burning / expiring at a frame boundary.
    let remaining = Math.min(dt, 1);
    while (remaining > 1e-8 && this.active) {
      const step = Math.min(.05, remaining); remaining -= step;
      const s = this.shift;
      for (const pan of s.pans) if (pan && pan.heat < this.burnAt) {
        const before = pan.heat;
        pan.heat = Math.min(this.burnAt, pan.heat + step);
        if (pan.kind === 'egg' && pan.flipped) pan.side = Math.min(this.burnAt, pan.side + step);
        if (before < this.burnAt && pan.heat >= this.burnAt) { s.burnt++; s.combo = 0; }
      }
      // First delivery is a pressure-free lesson, but the pan still teaches heat control.
      if (s.guided) continue;
      s.time = Math.min(this.duration, s.time + step);
      for (const order of s.orders) order.left = Math.max(0, order.left - step);
      const expired = s.orders.filter(order => order.left <= 0);
      if (expired.length) { s.missed += expired.length; s.combo = 0; s.orders = s.orders.filter(order => order.left > 0); }
      if (s.time >= this.duration - 1e-7) { this.finishDay(); continue; }
      if (!s.orders.length && s.created >= this.target + 2) { this.finishDay(); continue; }
      s.spawnIn = Math.max(0, s.spawnIn - step);
      if (s.orders.length < (this.state.day === 1 ? 2 : 3) && s.spawnIn <= 1e-7) this.spawnOrder();
    }
  }
  finishDay() {
    const s = this.shift;
    if (!s || s.status !== 'open') return fail('今天已结算');
    s.missed += s.orders.length;
    s.orders = []; s.status = 'done'; s.paused = false; s.guided = false;
    return ok();
  }
  startPan(index, kind = 'toast') {
    if (!this.active) return fail('先继续营业');
    if (!integer(index, 0, 1) || this.shift.pans[index]) return fail('锅里还有食物');
    if (!['toast', 'egg', 'patty'].includes(kind) || !this.unlocked(kind)) return fail('这份食材还没开放');
    this.shift.pans[index] = { kind, heat: 0, flipped: false, side: 0 }; return ok();
  }
  flipPan(index) {
    if (!this.active || !integer(index, 0, 1) || this.panStage(index) !== 'flip') return fail('等第一面凝固再翻面');
    this.shift.pans[index].flipped = true; this.shift.pans[index].side = 0; return ok();
  }
  clearBurnt(index) {
    if (!this.active || !integer(index, 0, 1) || this.panStage(index) !== 'burnt') return fail('只有煎焦的面包需要清理');
    this.shift.pans[index] = null; return ok();
  }
  chop(kind = 'fruit') {
    if (!this.active) return fail('先继续营业');
    if (!['fruit', 'tomato'].includes(kind) || !this.unlocked(kind)) return fail('这份食材还没开放');
    if (!this.shift.board) { this.shift.board = { kind, cuts: 0 }; return ok({ loaded: true }); }
    if (this.shift.board.cuts >= this.chopCount) return fail('切好了，先放进盘子');
    this.shift.board.cuts++; return ok({ ready: this.shift.board.cuts === this.chopCount });
  }
  addToPlate(source, index) {
    if (!this.active || !integer(index, 0, this.plateCount - 1)) return fail('先继续营业');
    let part;
    if (source?.kind === 'pan' && integer(source.index, 0, 1) && this.panStage(source.index) === 'ready') part = this.shift.pans[source.index].kind;
    if (source?.kind === 'board' && this.shift.board?.cuts === this.chopCount) part = this.shift.board.kind;
    if (source?.kind === 'pantry' && PANTRY.includes(source.part) && this.unlocked(source.part)) part = source.part;
    if (source?.kind === 'drink' && this.shift.drink?.stage === 'ready') part = this.shift.drink.kind;
    if (!part) return fail('还没做好，或已经煎焦了');
    const plate = this.shift.plates[index], next = [...plate, part];
    if (!Object.values(DISHES).some(dish => dish.day <= this.state.day && fitsRecipe(next, dish))) return fail('顺序不对或盘子已满，食材已保留');
    if (source.kind === 'pan') this.shift.pans[source.index] = null;
    if (source.kind === 'board') this.shift.board = null;
    if (source.kind === 'drink') this.shift.drink = null;
    plate.push(part); return ok({ part });
  }
  matchingOrders(index) {
    const plate = this.shift?.plates[index];
    return plate?.length ? this.shift.orders.filter(order => dishMatches(plate, DISHES[order.dish])).map(order => order.id) : [];
  }
  serve(index, orderId) {
    if (!this.active || !integer(index, 0, this.plateCount - 1)) return fail('先继续营业');
    const s = this.shift, order = s.orders.find(order => order.id === orderId);
    if (!order) return fail('这位顾客已经离开了');
    if (!this.matchingOrders(index).includes(orderId)) return fail('这盘和订单不一样，食物已保留');
    s.plates[index] = []; s.orders = s.orders.filter(customer => customer.id !== orderId);
    s.combo++; s.served++; this.state.totalServed++;
    s.bestCombo = Math.max(s.bestCombo, s.combo); this.state.bestCombo = Math.max(this.state.bestCombo, s.combo);
    const tip = Math.min(3, Math.floor((s.combo - 1) / 3)), earned = DISHES[order.dish].price + tip;
    s.earnings += earned; this.state.coins += earned;
    if (s.guided) { s.guided = false; s.spawnIn = 1; }
    if (!s.orders.length) s.spawnIn = Math.min(s.spawnIn, 1);
    if (!s.orders.length && s.created >= this.target + 2) this.finishDay();
    return ok({ earned, tip, combo: s.combo });
  }
  discardPlate(index) {
    if (!this.active || !integer(index, 0, this.plateCount - 1) || !this.shift.plates[index].length) return fail('先选一个有食物的盘子');
    this.shift.plates[index] = []; this.shift.combo = 0; return ok();
  }
  startDrink(kind) {
    if (!this.active || !['juice', 'shake'].includes(kind) || !this.unlocked(kind)) return fail('这杯饮品还没开放');
    if (this.shift.drink) return fail('先取走或清空杯子');
    this.shift.drink = { kind, stage: 'filling', fill: 0, stir: 0 }; return ok();
  }
  pourDrink(dt) {
    const drink = this.shift?.drink;
    if (!this.active || drink?.stage !== 'filling' || !number(dt, 0, .5)) return fail('先准备空杯');
    drink.fill = Math.min(1, drink.fill + dt / 4);
    if (drink.fill > .85) { drink.stage = 'spilled'; this.shift.combo = 0; }
    return ok();
  }
  finishPour() {
    const drink = this.shift?.drink;
    if (!this.active || drink?.stage !== 'filling') return fail('先清空溢出的饮品');
    if (drink.fill < .55 - 1e-7) return fail('还差一点，继续倒到绿区');
    if (drink.fill > .75 + 1e-7) return fail('超过绿区了，清空再试');
    drink.fill = Math.max(.55, Math.min(.75, drink.fill));
    drink.stage = drink.kind === 'shake' ? 'mixing' : 'ready'; return ok();
  }
  stirDrink(amount = .25) {
    const drink = this.shift?.drink;
    if (!this.active || drink?.stage !== 'mixing' || !number(amount, 0, .25)) return fail('先把奶昔倒到刻度');
    drink.stir = Math.min(1, drink.stir + amount);
    if (drink.stir >= 1 - 1e-7) { drink.stir = 1; drink.stage = 'ready'; }
    return ok();
  }
  discardDrink() {
    if (!this.active || !this.shift.drink) return fail('杯子已经空了');
    this.shift.drink = null; return ok();
  }
  decorate(id) {
    if (!own(DECOR, id) || this.active) return fail('先暂停营业再装扮');
    const item = DECOR[id], decor = this.state.decor, owned = decor.owned.includes(id);
    if (!owned && this.state.coins < item.price) return fail('金币还不够');
    if (!owned) { this.state.coins -= item.price; decor.owned.push(id); }
    decor.equipped[item.category] = id; return ok({ bought: !owned });
  }
  upgrade(key) {
    if (this.shift?.status !== 'done' || !own(KITCHEN_UPGRADES, key)) return fail('打烊后再升级');
    const level = this.state.upgrades[key], price = KITCHEN_UPGRADES[key].costs[level];
    if (price === undefined) return fail('已经升满了');
    if (this.state.coins < price) return fail('金币还不够，明天再来');
    this.state.coins -= price; this.state.upgrades[key]++;
    // The next shift creates its equipment from the purchased level.
    return ok({ price });
  }
  serialize() { return JSON.stringify(this.state); }
  restore(raw) {
    try {
      const state = JSON.parse(raw);
      if (!state || ![1, 2].includes(state.version) || !integer(state.day, 1, 100000) || !integer(state.coins, 0, 1e12) || !integer(state.totalServed, 0, 1e9) || !integer(state.bestCombo, 0, 10)) return false;
      if (!state.upgrades || Object.keys(state.upgrades).length !== 3 || !Object.entries(KITCHEN_UPGRADES).every(([key, def]) => integer(state.upgrades[key], 0, def.costs.length))) return false;
      const legacy = state.version === 1;
      if (legacy) {
        state.decor = defaultDecor();
        if (state.shift) {
          state.shift.duration = 90; state.shift.drink = null;
          if (!Array.isArray(state.shift.pans)) return false;
          state.shift.pans = state.shift.pans.map(p => p === null ? null : { kind: 'toast', heat: p?.heat, flipped: false, side: 0 });
          if (state.shift.board) state.shift.board = { kind: 'fruit', cuts: state.shift.board.cuts };
          if (state.shift.plates?.some(p => !Array.isArray(p) || p.some(part => !['toast', 'fruit'].includes(part)))) return false;
          if (state.shift.orders?.some(o => !['butter', 'berry', 'fruit'].includes(o?.dish))) return false;
        }
        state.version = 2;
      }
      const decor = state.decor;
      if (!decor || !Array.isArray(decor.owned) || decor.owned.length > Object.keys(DECOR).length || new Set(decor.owned).size !== decor.owned.length || decor.owned.some(id => !own(DECOR, id))) return false;
      if (!defaultDecor().owned.every(id => decor.owned.includes(id)) || !decor.equipped || Object.keys(decor.equipped).length !== 4 || !['pan', 'plate', 'cloth', 'ornament'].every(key => decor.owned.includes(decor.equipped[key]) && DECOR[decor.equipped[key]].category === key)) return false;
      const s = state.shift, burn = 12 + state.upgrades.heat * 3, chops = 3 - state.upgrades.knife;
      if (s !== null) {
        if (!s || !['open', 'done'].includes(s.status) || typeof s.paused !== 'boolean' || typeof s.guided !== 'boolean' || ![90, 120].includes(s.duration) || !number(s.time, 0, s.duration) || !number(s.spawnIn, 0, 10)) return false;
        if (!['created', 'served', 'missed', 'combo', 'bestCombo'].every(k => integer(s[k], 0, 10)) || !integer(s.burnt, 0, 1e6) || !integer(s.earnings, 0, 230)) return false;
        const target = Math.min(8, 4 + Math.floor((state.day - 1) / 2));
        if (s.created > target + 2 || s.served > s.created || s.combo > s.bestCombo || s.bestCombo > s.served || s.bestCombo > state.bestCombo || s.served > state.totalServed) return false;
        if (!Array.isArray(s.pans) || s.pans.length !== 2 || s.pans.some(p => p !== null && (!p || !['toast', 'egg', 'patty'].includes(p.kind) || PARTS[p.kind].day > state.day || !number(p.heat, 0, burn) || typeof p.flipped !== 'boolean' || !number(p.side, 0, p.heat) || (p.flipped ? p.kind !== 'egg' || p.heat - p.side < 3 - 1e-7 : p.side !== 0)))) return false;
        // Purchased knife/plate upgrades can coexist with the previous day's finished counters.
        if (s.board !== null && (!s.board || !['fruit', 'tomato'].includes(s.board.kind) || PARTS[s.board.kind].day > state.day || !integer(s.board.cuts, 0, s.status === 'done' ? 3 : chops))) return false;
        if (!Array.isArray(s.plates) || (s.status === 'open' ? s.plates.length !== 2 + state.upgrades.plates : ![2, 3].includes(s.plates.length))) return false;
        if (s.plates.some(p => !Array.isArray(p) || p.length > 5 || p.some(part => !own(PARTS, part) || PARTS[part].day > state.day) || !Object.values(DISHES).some(d => fitsRecipe(p, d)))) return false;
        const drink = s.drink;
        if (drink !== null && (!drink || !['juice', 'shake'].includes(drink.kind) || PARTS[drink.kind].day > state.day || !['filling', 'mixing', 'ready', 'spilled'].includes(drink.stage) || !number(drink.fill, 0, 1) || !number(drink.stir, 0, 1))) return false;
        if (drink && ((['mixing', 'ready'].includes(drink.stage) && !number(drink.fill, .55, .75)) || (drink.stage === 'spilled' && drink.fill <= .85) || (drink.stage === 'filling' && (drink.fill > .85 || drink.stir)) || (drink.stage === 'mixing' && (drink.kind !== 'shake' || drink.stir === 1)) || (drink.stage === 'ready' && drink.stir !== (drink.kind === 'shake' ? 1 : 0)))) return false;
        if (!Array.isArray(s.orders) || s.orders.length > (state.day === 1 ? 2 : 3) || new Set(s.orders.map(o => o?.id)).size !== s.orders.length) return false;
        if (s.orders.some(o => !o || !integer(o.id, 1, s.created) || !own(DISHES, o.dish) || DISHES[o.dish].day > state.day || !number(o.patience, 28, 60) || !number(o.left, 0, o.patience) || o.left === 0)) return false;
        if (s.created !== s.served + s.missed + s.orders.length || (s.status === 'done' && (s.orders.length || s.paused || s.guided))) return false;
        if (s.guided && (s.served || s.time || s.created !== 1 || state.totalServed)) return false;
      }
      this.state = state;
      if (this.shift?.status === 'open') this.shift.paused = true;
      return true;
    } catch { return false; }
  }
}
