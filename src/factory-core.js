import { LINK_DIRS, directionBetween, opposite, canLink, outputDirections } from './factory-links.js?v=0.10.0';
import { RESEARCH, freshCareer, contractFor, contractComplete, validCareer } from './factory-career.js?v=0.10.0';
import { freshBusiness, validBusiness, warehouseCapacity, warehouseUsed, wholesaleFor, MILESTONES } from './factory-business.js?v=0.10.0';
import { freshShop, validShop, requestShop, hireStaff, updateShop, counterUsed, COUNTER_CAPACITY, automationReady } from './factory-shop.js?v=0.10.0';
export const SAVE_KEY = 'food-factory-v1';
export const WIDTH = 40;
export const HEIGHT = 24;
export const AREAS = [[14, 8], [18, 10], [22, 12], [28, 16], [34, 20], [40, 24]];
export const EXPANSION_COSTS = [350, 900, 1800, 3600, 6500, null];
export const STEP = 0.1;
export const DIRS = LINK_DIRS;
export const DIRECTION_NAMES = ['朝右', '朝下', '朝左', '朝上'];
export const ITEMS = {
  flour: { label: '面粉', sprite: 'flour' }, dough: { label: '面团', sprite: 'dough' },
  raw_donut: { label: '生面圈', sprite: 'raw_donut' }, orange: { label: '橙子', sprite: 'orange' },
  clean_orange: { label: '洗净橙子', sprite: 'orange' },
  bread: { label: '面包', sprite: 'bread', value: 4 },
  donut_plain: { label: '原味甜甜圈', sprite: 'donut_plain', value: 6 },
  donut_strawberry: { label: '草莓甜甜圈', sprite: 'donut_strawberry', value: 8 },
  orange_juice: { label: '橙汁', sprite: 'orange_juice', value: 6 },
  butter_cookie: { label: '奶油饼干', sprite: 'butter_cookie', value: 5 },
  steamed_bun: { label: '奶香包', sprite: 'steamed_bun', value: 6 },
  strawberry_cake: { label: '草莓蛋糕', sprite: 'strawberry_cake', value: 10 },
  orange_icepop: { label: '橙汁冰棒', sprite: 'orange_icepop', value: 11 },
};
export const BUILDINGS = {
  belt: { label: '传送带', sprite: 'belt_straight', category: 'logistics', cost: 35, unlock: 0, kind: 'belt' },
  splitter: { label: '分流器', sprite: 'belt_splitter', category: 'logistics', cost: 140, unlock: 0, kind: 'splitter' },
  merger: { label: '合流器', sprite: 'belt_merger', category: 'logistics', cost: 100, unlock: 0, kind: 'belt' },
  depot: { label: '出货站', sprite: 'warehouse_intake', category: 'logistics', cost: 160, unlock: 0, kind: 'depot' },
  dough_mixer: { label: '和面机', sprite: 'dough_mixer', category: 'machines', cost: 100, unlock: 0, kind: 'machine', input: 'flour', output: 'dough', duration: 2.4 },
  bread_oven: { label: '烤箱', sprite: 'bread_oven', category: 'machines', cost: 140, unlock: 0, kind: 'machine', input: 'dough', output: 'bread', duration: 3.2 },
  ring_former: { label: '成型机', sprite: 'ring_former', category: 'machines', cost: 110, unlock: 1, kind: 'machine', input: 'dough', output: 'raw_donut', duration: 2.4 },
  donut_fryer: { label: '炸锅', sprite: 'donut_fryer', category: 'machines', cost: 140, unlock: 1, kind: 'machine', input: 'raw_donut', output: 'donut_plain', duration: 3.2 },
  icing_machine: { label: '淋酱机', sprite: 'icing_machine', category: 'machines', cost: 130, unlock: 1, kind: 'machine', input: 'donut_plain', output: 'donut_strawberry', duration: 2.6 },
  fruit_washer: { label: '清洗机', sprite: 'fruit_washer', category: 'machines', cost: 80, unlock: 2, kind: 'machine', input: 'orange', output: 'clean_orange', duration: 2.0 },
  juice_press: { label: '榨汁机', sprite: 'juice_press', category: 'machines', cost: 150, unlock: 2, kind: 'machine', input: 'clean_orange', output: 'orange_juice', duration: 2.8 },
  flour_hopper: { label: '面粉料斗', sprite: 'flour_hopper', category: 'sources', cost: 80, unlock: 0, kind: 'source', output: 'flour', duration: 2.2 },
  fruit_hopper: { label: '橙子料斗', sprite: 'buffer_crate', category: 'sources', cost: 90, unlock: 2, kind: 'source', output: 'orange', duration: 2.2 },
  cookie_oven: { label: '曲奇烤炉', sprite: 'cookie_oven', category: 'machines', cost: 160, unlock: 0, kind: 'machine', input: 'dough', output: 'butter_cookie', duration: 4.2 },
  bun_steamer: { label: '小蒸笼', sprite: 'bun_steamer', category: 'machines', cost: 180, unlock: 1, kind: 'machine', input: 'dough', output: 'steamed_bun', duration: 4.2 },
  cake_station: { label: '蛋糕工台', sprite: 'cake_station', category: 'machines', cost: 260, unlock: 2, kind: 'machine', input: 'dough', output: 'strawberry_cake', duration: 6 },
  icepop_freezer: { label: '冰棒冷柜', sprite: 'icepop_freezer', category: 'machines', cost: 220, unlock: 2, kind: 'machine', input: 'orange_juice', output: 'orange_icepop', duration: 3.8 },
};
export const FOOD_RECIPES = [
  ['bread', ['flour_hopper', 'dough_mixer', 'bread_oven']],
  ['butter_cookie', ['flour_hopper', 'dough_mixer', 'cookie_oven']],
  ['donut_plain', ['flour_hopper', 'dough_mixer', 'ring_former', 'donut_fryer']],
  ['donut_strawberry', ['flour_hopper', 'dough_mixer', 'ring_former', 'donut_fryer', 'icing_machine']],
  ['steamed_bun', ['flour_hopper', 'dough_mixer', 'bun_steamer']],
  ['orange_juice', ['fruit_hopper', 'fruit_washer', 'juice_press']],
  ['strawberry_cake', ['flour_hopper', 'dough_mixer', 'cake_station']],
  ['orange_icepop', ['fruit_hopper', 'fruit_washer', 'juice_press', 'icepop_freezer']],
];
const ORDER_LIST = [
  { title: '早餐店开张', wants: { bread: 4 }, reward: 380, note: '解锁甜甜圈与奶香包' },
  { title: '下午茶时间', wants: { donut_strawberry: 4 }, reward: 420, note: '解锁果汁、蛋糕与冰棒' },
  { title: '一杯好心情', wants: { orange_juice: 5 }, reward: 480, note: '八种美味，自由搭配' },
  { title: '野餐小分队', wants: { bread: 10, donut_strawberry: 6, orange_juice: 6 }, reward: 650, note: '让每一条线忙起来' },
];
const NEW_FOOD_ORDERS = [
  { title: '曲奇试吃会', wants: { butter_cookie: 8 }, reward: 500, note: '面团分流，也能烤出小饼干' },
  { title: '蒸笼冒热气', wants: { steamed_bun: 8, bread: 6 }, reward: 600, note: '和面机可以供应不同支线' },
  { title: '生日小惊喜', wants: { strawberry_cake: 6 }, reward: 700, note: '慢慢加工，换取更高售价' },
  { title: '清凉一夏', wants: { orange_icepop: 8, orange_juice: 6 }, reward: 800, note: '给果汁分流，一半冷冻成冰棒' },
];
export function orderFor(index, catalog = 1) {
  if (catalog === 3) { const order = orderFor(index, 2); return { ...order, reward: Math.round(order.reward / 10) }; }
  if (index < ORDER_LIST.length) return structuredClone(ORDER_LIST[index]);
  if (catalog === 2) {
    if (index < 8) return structuredClone(NEW_FOOD_ORDERS[index - 4]);
    const n = index - 8, item = FOOD_RECIPES[n % FOOD_RECIPES.length][0];
    return { title: `${ITEMS[item].label}专场`, wants: { [item]: Math.min(80, 12 + Math.floor(n / 8) * 3) }, reward: Math.min(2400, 500 + n * 80), note: '八种美味，轮流开工' };
  }
  const n = index - ORDER_LIST.length;
  const items = ['bread', 'donut_strawberry', 'orange_juice'];
  const item = items[n % 3];
  return { title: ['街角早餐', '甜蜜派对', '果园来信'][n % 3], wants: { [item]: Math.min(80, 12 + n * 3) }, reward: Math.min(2400, 400 + n * 100), note: '新的订单，新的日常' };
}
export function upgradeCost(building) { return Math.round(BUILDINGS[building.type].cost * (0.65 + building.level * 0.35)); }
export function durationFor(building, research = {}) {
  const machine = Boolean(BUILDINGS[building.type].duration);
  if (!machine) return (4 - (research.transport || 0)) / 10;
  return BUILDINGS[building.type].duration / (1 + (building.level - 1) * 0.5) / (1 + (research.production || 0) * .15);
}
export function makeEntity(type, x, y, dir, id, paid = 0) {
  return { id, type, x, y, dir, level: 1, paid, input: null, output: null, progress: 0, readyAt: 0, roundRobin: 0, blocked: false, idle: 0 };
}
export class FactoryGame {
  constructor({ starter = true, shop = starter } = {}) {
    this.state = { version: 1, coins: shop ? 0 : 450, expansion: 0, orderIndex: 0, orderProgress: {}, delivered: {}, stock: {}, buildings: [], nextId: 1, time: 0, tick: 0, paused: false, speed: 1, totalSold: 0 };
    this.state.career = freshCareer();
    this.state.business = freshBusiness();
    this.state.orderCatalog = shop ? 3 : 2;
    this.state.shop = shop ? freshShop() : null;
    this.accumulator = 0;
    this.events = [];
    if (starter && !shop) ['flour_hopper', 'belt', 'dough_mixer', 'belt', 'bread_oven', 'belt', 'belt', 'depot'].forEach((type, i) => this.state.buildings.push({ ...makeEntity(type, i + 1, 2, 0, this.state.nextId++), gifted: true }));
  }
  get automationReady() { return automationReady(this.state.shop); }
  shopAction(kind, value) { return requestShop(this, kind, value); }
  hire(role) { return hireStaff(this, role); }
  get area() { return AREAS[this.state.expansion]; }
  get order() { return orderFor(this.state.orderIndex, this.state.orderCatalog); }
  get unlockLevel() { return Math.min(2, this.state.orderIndex); }
  get expansionCost() { return EXPANSION_COSTS[this.state.expansion]; }
  get warehouseCapacity() { return warehouseCapacity(this.state.business); }
  get warehouseUsed() { return warehouseUsed(this.state.business); }
  salePrice(item) { return Math.round((ITEMS[item]?.value || 0) * (1 + this.state.career.research.value * .1)); }
  get wholesaleOffers() {
    const b = this.state.business;
    return [0, 1, 2].map(slot => {
      const offer = wholesaleFor(this.unlockLevel, b.shipments, slot, b.reputation);
      return { ...offer, reward: Math.round(Object.entries(offer.wants).reduce((sum, [item, count]) => sum + this.salePrice(item) * count, 0) * offer.multiplier) };
    });
  }
  setDepotMode(id, mode) {
    const b = this.state.buildings.find(b => b.id === id);
    if (b?.type !== 'depot' || !['sell', 'store'].includes(mode)) return { ok: false, message: '请选择出货站模式' };
    b.mode = mode; return { ok: true };
  }
  shipWholesale(id) {
    if (this.state.shop && !this.state.shop.legacy && this.state.shop.served < 30) return { ok: false, message: '服务 30 位顾客后开放商店合作' };
    const offer = this.wholesaleOffers.find(offer => offer.id === id), business = this.state.business;
    if (!offer) return { ok: false, message: '合作货单已更新，请重新选择' };
    if (Object.entries(offer.wants).some(([item, n]) => (business.warehouse[item] || 0) < n)) return { ok: false, message: '仓库还没备齐这些美味' };
    for (const [item, n] of Object.entries(offer.wants)) { business.warehouse[item] -= n; business.shipped[item] = (business.shipped[item] || 0) + n; }
    business.shipments++; business.reputation += offer.reputation; this.state.coins += offer.reward;
    return { ok: true, reward: offer.reward, reputation: offer.reputation };
  }
  sellWarehouse(item, count) {
    const b = this.state.business, value = this.salePrice(item);
    if (!value || !Number.isSafeInteger(count) || count <= 0 || (b.warehouse[item] || 0) < count) return { ok: false, message: '库存不足' };
    if (this.state.shop) {
      if (counterUsed(this.state.shop) + count > COUNTER_CAPACITY) return { ok: false, message: '取餐架空间不足，先送餐' };
      b.warehouse[item] -= count; this.state.shop.counter[item] = (this.state.shop.counter[item] || 0) + count;
      return { ok: true, reward: 0, moved: count };
    }
    b.warehouse[item] -= count; this.state.coins += value * count;
    return { ok: true, reward: value * count };
  }
  claimMilestone(id) {
    const goal = MILESTONES.find(goal => goal.id === id), b = this.state.business;
    if (!goal || b.claimed.includes(id) || goal.progress(this.state) < goal.target) return { ok: false, message: '目标还未达成或已经领取' };
    b.claimed.push(id); this.state.coins += goal.coins; this.state.career.points += goal.points;
    return { ok: true, reward: goal.coins, points: goal.points };
  }
  get offers() { return [0, 1, 2].map(slot => contractFor(this.unlockLevel, this.state.career.completed, slot, 2)); }
  get contract() {
    const c = this.state.career.contract;
    return c ? { ...contractFor(c.tier, c.round, c.slot, this.state.career.catalog || 1), status: c.status, startedAt: c.startedAt, deadline: c.deadline, progress: c.progress } : null;
  }
  duration(building) { return durationFor(building, this.state.career.research); }
  acceptContract(slot) {
    const current = this.state.career.contract;
    if (!Number.isInteger(slot) || slot < 0 || slot > 2 || (current && current.status !== 'expired')) return { ok: false, message: '先完成或放弃当前急单' };
    const def = this.offers[slot];
    this.state.career.catalog = 2;
    this.state.career.contract = { tier: def.tier, round: def.round, slot, status: 'active', startedAt: this.state.time, deadline: this.state.time + def.duration, progress: {} };
    return { ok: true };
  }
  cancelContract() {
    if (!this.state.career.contract || this.state.career.contract.status === 'ready') return { ok: false };
    this.state.career.contract = null; return { ok: true };
  }
  claimContract() {
    const c = this.contract;
    if (!c || c.status !== 'ready') return { ok: false, message: '急单尚未完成' };
    this.state.coins += c.reward; this.state.career.points += c.points; this.state.career.completed++;
    this.state.career.contract = null;
    return { ok: true, reward: c.reward, points: c.points };
  }
  research(key) {
    const career = this.state.career;
    if (!Object.hasOwn(RESEARCH, key) || career.research[key] >= 3) return { ok: false, message: '研究已满级' };
    const cost = career.research[key] + 1;
    if (career.points < cost) return { ok: false, message: '完成急单，获得研究点' };
    const progress = this.state.buildings.map(b => b.progress / this.duration(b));
    career.points -= cost; career.research[key]++;
    this.state.buildings.forEach((b, i) => b.progress = progress[i] * this.duration(b));
    return { ok: true };
  }
  at(x, y) { return this.state.buildings.find(b => b.x === x && b.y === y); }
  inside(x, y) { const [w, h] = this.area; return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < w && y < h; }
  place(type, x, y, dir = 0) {
    const def = BUILDINGS[type];
    if (!Object.hasOwn(BUILDINGS, type) || !Number.isInteger(dir) || dir < 0 || dir > 3) return { ok: false, message: '无效设备' };
    if (!this.automationReady) return { ok: false, message: '先亲手服务 6 位顾客，再建自动化产线' };
    if (def.unlock > this.unlockLevel) return { ok: false, message: '先完成工坊订单' };
    if (!this.inside(x, y)) return { ok: false, message: '这片地还没有扩建' };
    if (this.at(x, y)) return { ok: false, message: '这里已经有设备啦' };
    const fromStock = (this.state.stock[type] || 0) > 0;
    if (!fromStock && this.state.coins < def.cost) return { ok: false, message: '金币不够，再卖些美味吧' };
    const b = makeEntity(type, x, y, dir, this.state.nextId++, fromStock ? 0 : def.cost);
    if (fromStock) { this.state.stock[type]--; b.gifted = true; }
    else this.state.coins -= def.cost;
    this.state.buildings.push(b);
    return { ok: true, building: b };
  }
  remove(id) {
    const index = this.state.buildings.findIndex(b => b.id === id);
    if (index < 0) return { ok: false };
    const b = this.state.buildings[index];
    // Ingredients are free; clearing a tile deliberately discards its contents, never sells them.
    this.state.coins += b.paid;
    if (b.gifted) this.state.stock[b.type] = (this.state.stock[b.type] || 0) + 1;
    this.state.buildings.splice(index, 1);
    return { ok: true, refund: b.paid, restocked: Boolean(b.gifted), discarded: Boolean(b.input || b.output) };
  }
  extendBelt(fromCell, toCell) {
    const from = this.at(fromCell.x, fromCell.y), dir = directionBetween(fromCell, toCell);
    if (!from || dir < 0 || !this.inside(toCell.x, toCell.y)) return { ok: false, message: '只能连接相邻的工坊格子' };
    const to = this.at(toCell.x, toCell.y);
    const fromPreview = from.type === 'belt' ? { ...from, dir } : from;
    // Reuse a perpendicular destination without breaking its existing route.
    // If its outlet faces us, redrawing explicitly aligns it with this stroke.
    const turnDestination = to?.type === 'belt' && to.dir === opposite(dir);
    const toPreview = !to ? { type: 'belt', x: toCell.x, y: toCell.y, dir } : turnDestination ? { ...to, dir } : to;
    if (!canLink(fromPreview, toPreview)) return { ok: false, message: '接口方向不对，请从箭头出口接出' };
    let building = to;
    if (!building) {
      const placed = this.place('belt', toCell.x, toCell.y, dir);
      if (!placed.ok) return placed;
      building = placed.building;
    }
    // Commit turns only after all checks and payment succeeded.
    if (from.type === 'belt') from.dir = dir;
    if (turnDestination) building.dir = dir;
    return { ok: true, building, created: !to, terminal: building.type === 'depot' };
  }
  rotate(id) { const b = this.state.buildings.find(b => b.id === id); if (!b) return false; b.dir = (b.dir + 1) % 4; return true; }
  upgrade(id) {
    const b = this.state.buildings.find(b => b.id === id);
    if (!b || !['machine', 'source'].includes(BUILDINGS[b.type].kind)) return { ok: false, message: '这台设备无需升级' };
    if (b.level >= 3) return { ok: false, message: '已经是最高等级' };
    const cost = upgradeCost(b);
    if (this.state.coins < cost) return { ok: false, message: '金币还不够' };
    const completion = Math.min(1, b.progress / this.duration(b));
    this.state.coins -= cost; b.paid += cost; b.level++;
    b.progress = completion * this.duration(b);
    return { ok: true };
  }
  expand() {
    if (this.expansionCost === null) return { ok: false, message: '工坊已经全部开放' };
    if (this.state.coins < this.expansionCost) return { ok: false, message: '再攒一些扩建金币吧' };
    this.state.coins -= this.expansionCost; this.state.expansion++;
    return { ok: true };
  }
  get orderReady() { return Object.entries(this.order.wants).every(([item, count]) => (this.state.orderProgress[item] || 0) >= count); }
  claimOrder() {
    if (!this.orderReady) return { ok: false, message: '美味还在路上' };
    const reward = this.order.reward;
    this.state.coins += reward; this.state.orderIndex++; this.state.orderProgress = {}; this.state.orderCatalog = this.state.shop ? 3 : 2;
    return { ok: true, reward };
  }
  deliver(item, b) {
    const value = this.salePrice(item);
    if (!value) return false;
    this.state.coins += value;
    this.state.totalSold++;
    this.state.delivered[item] = (this.state.delivered[item] || 0) + 1;
    if (this.order.wants[item]) this.state.orderProgress[item] = Math.min(this.order.wants[item], (this.state.orderProgress[item] || 0) + 1);
    const c = this.contract;
    if (c?.status === 'active' && this.state.time <= c.deadline && c.wants[item]) {
      const live = this.state.career.contract;
      live.progress[item] = Math.min(c.wants[item], (live.progress[item] || 0) + 1);
      if (contractComplete(live, this.state.career.catalog || 1)) live.status = 'ready';
    }
    this.events.push({ kind: 'sale', x: b.x, y: b.y, value, time: this.state.time });
    return true;
  }
  canReceive(target, item, source = null) {
    if (!target || (source && !canLink(source, target))) return false;
    const def = BUILDINGS[target.type];
    if (def.kind === 'source') return false;
    if (def.kind === 'depot') return Boolean(ITEMS[item]?.value) && (target.mode === 'store' ? this.warehouseUsed < this.warehouseCapacity : !this.state.shop || counterUsed(this.state.shop) < COUNTER_CAPACITY);
    if (def.kind === 'machine') return !target.input && def.input === item;
    return !target.output;
  }
  update(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0 || this.state.paused) return;
    this.accumulator += Math.min(seconds, 1) * this.state.speed;
    while (this.accumulator + 1e-9 >= STEP) { this.accumulator -= STEP; this.step(); }
  }
  step() {
    const s = this.state;
    s.time = Math.round((s.time + STEP) * 10) / 10; s.tick++;
    this.events = this.events.filter(e => s.time - e.time < 1.5);
    const map = new Map(s.buildings.map(b => [`${b.x},${b.y}`, b]));
    // Eligibility is a start-of-tick snapshot. No item can be transferred twice in one tick.
    const candidates = s.buildings.filter(b => b.output && b.readyAt <= s.time + 1e-9);
    const reserved = new Set();
    let storageReserved = 0;
    const storageFree = this.warehouseCapacity - this.warehouseUsed;
    let counterReserved = 0;
    const counterFree = s.shop ? COUNTER_CAPACITY - counterUsed(s.shop) : Infinity;
    const moves = [];
    // Rotating arbitration prevents a permanent winner at merging inputs.
    const offset = candidates.length ? s.tick % candidates.length : 0;
    for (let i = 0; i < candidates.length; i++) {
      const b = candidates[(i + offset) % candidates.length];
      const split = BUILDINGS[b.type].kind === 'splitter';
      const dirs = outputDirections(b);
      if (split && b.roundRobin) dirs.reverse();
      let chosen = null;
      for (const dir of dirs) {
        const [dx, dy] = DIRS[dir];
        const target = map.get(`${b.x + dx},${b.y + dy}`);
        if (target && !reserved.has(target.id) && this.canReceive(target, b.output, b)) {
          if (target.type === 'depot' && target.mode === 'store' && storageReserved >= storageFree) continue;
          if (target.type === 'depot' && target.mode !== 'store' && counterReserved >= counterFree) continue;
          chosen = { from: b, to: target, item: b.output, dir }; break;
        }
      }
      b.blocked = !chosen;
      if (chosen) { reserved.add(chosen.to.id); if (chosen.to.type === 'depot') { if (chosen.to.mode === 'store') storageReserved++; else counterReserved++; } moves.push(chosen); }
    }
    for (const { from, to, item, dir } of moves) {
      from.output = null; from.blocked = false;
      if (BUILDINGS[from.type].kind === 'splitter') from.roundRobin = dir === from.dir ? 1 : 0;
      const def = BUILDINGS[to.type];
      if (def.kind === 'depot') {
        if (to.mode === 'store') {
          s.business.warehouse[item] = (s.business.warehouse[item] || 0) + 1;
          this.events.push({ kind: 'store', x: to.x, y: to.y, time: s.time });
        } else if (s.shop) s.shop.counter[item] = (s.shop.counter[item] || 0) + 1;
        else this.deliver(item, to);
        to.flashUntil = s.time + 0.5;
      }
      else if (def.kind === 'machine') { to.input = item; to.progress = 0; }
      else {
        const travel = this.duration(to);
        to.output = item; to.readyAt = s.time + travel;
        to.motion = { x: from.x, y: from.y, start: s.time, duration: travel };
      }
    }
    for (const b of s.buildings) {
      const def = BUILDINGS[b.type];
      if (def.kind !== 'source' && def.kind !== 'machine') continue;
      if (b.output || (def.kind === 'machine' && !b.input)) { b.idle += STEP; continue; }
      b.idle = 0; b.blocked = false; b.progress = Math.min(this.duration(b), b.progress + STEP);
      if (b.progress + 1e-9 >= this.duration(b)) {
        b.input = null; b.output = def.output; b.progress = 0; b.readyAt = s.time + STEP;
      }
    }
    updateShop(this, STEP);
    if (s.career.contract?.status === 'active' && s.time >= s.career.contract.deadline) s.career.contract.status = 'expired';
  }
  serialize() {
    return JSON.stringify({ ...this.state, buildings: this.state.buildings.map(({ motion, flashUntil, ...b }) => b) });
  }
  restore(raw) {
    try {
      if (typeof raw !== 'string' || raw.length > 500000) return false;
      const s = JSON.parse(raw);
      const integer = (v, max = 1e12) => Number.isSafeInteger(v) && v >= 0 && v <= max;
      const nonnegative = v => Number.isFinite(v) && v >= 0 && v <= 1e12;
      if (!s || s.version !== 1 || !integer(s.coins) || !integer(s.expansion, AREAS.length - 1) || !integer(s.orderIndex, 100000) || !integer(s.totalSold) || !integer(s.nextId) || !integer(s.tick) || !nonnegative(s.time) || ![1, 2].includes(s.speed) || typeof s.paused !== 'boolean' || !Array.isArray(s.buildings) || s.buildings.length > WIDTH * HEIGHT) return false;
      if (s.career === undefined) s.career = freshCareer();
      if (s.business === undefined) s.business = freshBusiness();
      if (!validBusiness(s.business)) return false;
      // Finish the already accepted legacy order before switching to the new menu.
      if (s.orderCatalog === undefined) s.orderCatalog = 1;
      if (![1, 2, 3].includes(s.orderCatalog)) return false;
      if (s.shop === undefined) s.shop = freshShop(true, s.totalSold);
      if (!validShop(s.shop, s)) return false;
      if (!validCareer(s.career, s)) return false;
      if (s.business.claimed.some(id => { const goal = MILESTONES.find(goal => goal.id === id); return goal.progress(s) < goal.target; })) return false;
      const record = value => value && typeof value === 'object' && !Array.isArray(value) && Object.entries(value).every(([key, n]) => ITEMS[key]?.value && integer(n));
      if (!record(s.delivered) || !record(s.orderProgress)) return false;
      const wants = orderFor(s.orderIndex, s.orderCatalog).wants;
      if (Object.entries(s.orderProgress).some(([key, value]) => !wants[key] || value > wants[key])) return false;
      if (!s.stock || typeof s.stock !== 'object' || Array.isArray(s.stock) || Object.entries(s.stock).some(([key, n]) => !Object.hasOwn(BUILDINGS, key) || !integer(n, 8))) return false;
      const giftLimits = { belt: 4, flour_hopper: 1, dough_mixer: 1, bread_oven: 1, depot: 1 };
      const gifts = { ...s.stock };
      const [w, h] = AREAS[s.expansion];
      const ids = new Set(), cells = new Set();
      for (const b of s.buildings) {
        const def = BUILDINGS[b.type];
        if (!Object.hasOwn(BUILDINGS, b.type) || def.unlock > Math.min(s.orderIndex, 2) || !integer(b.id) || b.id >= s.nextId || !integer(b.x, w - 1) || !integer(b.y, h - 1) || !integer(b.dir, 3) || b.level < 1 || !integer(b.level, 3) || !integer(b.paid) || !nonnegative(b.progress) || b.progress > durationFor(b, s.career.research) + 0.1 || !nonnegative(b.readyAt) || b.readyAt > s.time + 1 || !integer(b.roundRobin, 1)) return false;
        if (ids.has(b.id) || cells.has(`${b.x},${b.y}`)) return false;
        if (b.input !== null && (def.kind !== 'machine' || b.input !== def.input)) return false;
        if (b.output !== null && (!ITEMS[b.output] || def.kind === 'depot' || (['source', 'machine'].includes(def.kind) && b.output !== def.output))) return false;
        if (b.gifted !== undefined && typeof b.gifted !== 'boolean') return false;
        if (b.mode !== undefined && (b.type !== 'depot' || !['sell', 'store'].includes(b.mode))) return false;
        if (b.gifted) gifts[b.type] = (gifts[b.type] || 0) + 1;
        let maxPaid = b.gifted ? 0 : def.cost;
        for (let level = 1; level < b.level; level++) maxPaid += upgradeCost({ type: b.type, level });
        if (b.paid > maxPaid || (!['source', 'machine'].includes(def.kind) && b.level !== 1)) return false;
        ids.add(b.id); cells.add(`${b.x},${b.y}`);
      }
      if (Object.entries(gifts).some(([type, n]) => n > (giftLimits[type] || 0))) return false;
      this.state = { ...s, buildings: s.buildings.map(b => ({ ...b, motion: undefined, blocked: false, idle: 0 })) };
      this.accumulator = 0; this.events = [];
      return true;
    } catch { return false; }
  }
}
