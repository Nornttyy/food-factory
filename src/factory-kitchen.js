// The hands-on kitchen has its own device-local save. Factory saves are never migrated.
export const KITCHEN_SAVE_KEY = 'food-factory-kitchen-v1';
export const SHIFT_SECONDS = 90;
export const TOAST_SECONDS = 5;
export const DISHES = {
  butter: { label: '黄油吐司', parts: ['toast'], price: 8, recipe: '煎面包 → 装盘' },
  berry: { label: '草莓吐司', parts: ['toast', 'fruit'], price: 12, recipe: '煎面包 ＋ 切草莓' },
  fruit: { label: '双份果盘', parts: ['fruit', 'fruit'], price: 10, recipe: '切草莓 × 2' },
};
export const KITCHEN_UPGRADES = {
  heat: { label: '防焦煎锅', detail: '金黄后的装盘时间 +3 秒', costs: [50, 90], icon: 'bread' },
  knife: { label: '顺手小刀', detail: '切好一份：3 刀 → 2 刀', costs: [60], icon: 'strawberry' },
  plates: { label: '多一个餐盘', detail: '同时备好 3 盘，错峰出餐', costs: [75], icon: 'serving_plate' },
};
const ok = extra => ({ ok: true, ...extra });
const fail = message => ({ ok: false, message });
const integer = (n, min, max) => Number.isSafeInteger(n) && n >= min && n <= max;
const number = (n, min, max) => Number.isFinite(n) && n >= min && n <= max;
const sameParts = (a, b) => a.length === b.length && [...a].sort().join(',') === [...b].sort().join(',');
const own = (object, key) => Object.hasOwn(object, key);
export function createKitchenState() {
  return { version: 1, day: 1, coins: 0, totalServed: 0, bestCombo: 0, upgrades: { heat: 0, knife: 0, plates: 0 }, shift: null };
}
export class KitchenGame {
  constructor() { this.state = createKitchenState(); }
  get shift() { return this.state.shift; }
  get active() { return this.shift?.status === 'open' && !this.shift.paused; }
  get burnAt() { return 12 + this.state.upgrades.heat * 3; }
  get chopCount() { return 3 - this.state.upgrades.knife; }
  get plateCount() { return 2 + this.state.upgrades.plates; }
  get target() { return Math.min(8, 4 + Math.floor((this.state.day - 1) / 2)); }
  panStage(index) {
    const pan = this.shift?.pans[index];
    if (!pan) return 'empty';
    return pan.heat >= this.burnAt ? 'burnt' : pan.heat >= TOAST_SECONDS ? 'ready' : 'cooking';
  }
  startDay() {
    if (this.shift?.status === 'open') return fail('这一天还没打烊');
    if (this.shift?.status === 'done' && this.shift.served >= this.target) this.state.day++;
    this.state.shift = { status: 'open', paused: false, time: 0, guided: this.state.totalServed === 0, pans: [null, null], board: null,
      plates: Array.from({ length: this.plateCount }, () => []), orders: [], created: 0, spawnIn: 0,
      served: 0, missed: 0, burnt: 0, combo: 0, bestCombo: 0, earnings: 0 };
    this.spawnOrder(); return ok();
  }
  pause(value) { if (this.shift?.status === 'open') this.shift.paused = Boolean(value); }
  spawnOrder() {
    const s = this.shift;
    if (!s || s.status !== 'open' || s.created >= this.target + 2) return;
    const sequence = this.state.day === 1 ? ['butter', 'berry', 'butter', 'berry', 'berry', 'butter'] : ['berry', 'butter', 'fruit', 'berry', 'fruit', 'butter'];
    const id = ++s.created, dish = sequence[(id - 1 + (this.state.day === 1 ? 0 : this.state.day - 2)) % sequence.length];
    const patience = Math.max(28, 42 - (this.state.day - 1) * 2);
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
        if (before < this.burnAt && pan.heat >= this.burnAt) { s.burnt++; s.combo = 0; }
      }
      // First delivery is a pressure-free lesson, but the pan still teaches heat control.
      if (s.guided) continue;
      s.time = Math.min(SHIFT_SECONDS, s.time + step);
      for (const order of s.orders) order.left = Math.max(0, order.left - step);
      const expired = s.orders.filter(order => order.left <= 0);
      if (expired.length) { s.missed += expired.length; s.combo = 0; s.orders = s.orders.filter(order => order.left > 0); }
      if (s.time >= SHIFT_SECONDS - 1e-7) { this.finishDay(); continue; }
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
  startPan(index) {
    if (!this.active) return fail('先继续营业');
    if (!integer(index, 0, 1) || this.shift.pans[index]) return fail('锅里还有面包');
    this.shift.pans[index] = { heat: 0 }; return ok();
  }
  clearBurnt(index) {
    if (!this.active || !integer(index, 0, 1) || this.panStage(index) !== 'burnt') return fail('只有煎焦的面包需要清理');
    this.shift.pans[index] = null; return ok();
  }
  chop() {
    if (!this.active) return fail('先继续营业');
    if (!this.shift.board) { this.shift.board = { cuts: 0 }; return ok({ loaded: true }); }
    if (this.shift.board.cuts >= this.chopCount) return fail('切好了，先放进盘子');
    this.shift.board.cuts++; return ok({ ready: this.shift.board.cuts === this.chopCount });
  }
  addToPlate(source, index) {
    if (!this.active || !integer(index, 0, this.plateCount - 1)) return fail('先继续营业');
    let part;
    if (source?.kind === 'pan' && integer(source.index, 0, 1) && this.panStage(source.index) === 'ready') part = 'toast';
    if (source?.kind === 'board' && this.shift.board?.cuts === this.chopCount) part = 'fruit';
    if (!part) return fail('还没做好，或已经煎焦了');
    const plate = this.shift.plates[index], next = [...plate, part];
    if (!Object.values(DISHES).some(dish => next.every(item => next.filter(p => p === item).length <= dish.parts.filter(p => p === item).length))) return fail('这盘放不下了，换个盘子');
    if (part === 'toast') this.shift.pans[source.index] = null; else this.shift.board = null;
    plate.push(part); return ok({ part });
  }
  matchingOrders(index) {
    const plate = this.shift?.plates[index];
    return plate?.length ? this.shift.orders.filter(order => sameParts(plate, DISHES[order.dish].parts)).map(order => order.id) : [];
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
      if (!state || state.version !== 1 || !integer(state.day, 1, 100000) || !integer(state.coins, 0, 1e12) || !integer(state.totalServed, 0, 1e9) || !integer(state.bestCombo, 0, 10)) return false;
      if (!state.upgrades || Object.keys(state.upgrades).length !== 3 || !Object.entries(KITCHEN_UPGRADES).every(([key, def]) => integer(state.upgrades[key], 0, def.costs.length))) return false;
      const s = state.shift, burn = 12 + state.upgrades.heat * 3, chops = 3 - state.upgrades.knife;
      if (s !== null) {
        if (!s || !['open', 'done'].includes(s.status) || typeof s.paused !== 'boolean' || typeof s.guided !== 'boolean' || !number(s.time, 0, SHIFT_SECONDS) || !number(s.spawnIn, 0, 10)) return false;
        if (!['created', 'served', 'missed', 'combo', 'bestCombo'].every(k => integer(s[k], 0, 10)) || !integer(s.burnt, 0, 1e6) || !integer(s.earnings, 0, 150)) return false;
        const target = Math.min(8, 4 + Math.floor((state.day - 1) / 2));
        if (s.created > target + 2 || s.served > s.created || s.combo > s.bestCombo || s.bestCombo > s.served || s.bestCombo > state.bestCombo || s.served > state.totalServed) return false;
        if (!Array.isArray(s.pans) || s.pans.length !== 2 || s.pans.some(p => p !== null && (!p || !number(p.heat, 0, burn)))) return false;
        // Purchased knife/plate upgrades can coexist with the previous day's finished counters.
        if (s.board !== null && (!s.board || !integer(s.board.cuts, 0, s.status === 'done' ? 3 : chops))) return false;
        if (!Array.isArray(s.plates) || (s.status === 'open' ? s.plates.length !== 2 + state.upgrades.plates : ![2, 3].includes(s.plates.length))) return false;
        if (s.plates.some(p => !Array.isArray(p) || p.length > 2 || p.some(part => !['toast', 'fruit'].includes(part)) || p.filter(part => part === 'toast').length > 1)) return false;
        if (!Array.isArray(s.orders) || s.orders.length > (state.day === 1 ? 2 : 3) || new Set(s.orders.map(o => o?.id)).size !== s.orders.length) return false;
        if (s.orders.some(o => !o || !integer(o.id, 1, s.created) || !own(DISHES, o.dish) || !number(o.patience, 28, 42) || !number(o.left, 0, o.patience) || o.left === 0)) return false;
        if (s.created !== s.served + s.missed + s.orders.length || (s.status === 'done' && (s.orders.length || s.paused || s.guided))) return false;
        if (s.guided && (s.served || s.time || s.created !== 1 || state.totalServed)) return false;
      }
      this.state = state;
      if (this.shift?.status === 'open') this.shift.paused = true;
      return true;
    } catch { return false; }
  }
}
