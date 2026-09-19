import { FactoryGame, ITEMS, FOOD_RECIPES, STEP } from './factory-core.js?v=0.14.0';
import { canLink } from './factory-links.js?v=0.14.0';

export const STAFF_COSTS = [120, 240, 400];
export const DELIVERY_SECONDS = 4;
export const shelfCapacity = b => 4 + b.level * 4;
const food = item => typeof item === 'string' && Object.hasOwn(ITEMS, item) && Boolean(ITEMS[item].value);
const freshService = () => ({ version: 1, served: 0, nextId: 4, customers: [1, 2, 3].map(id => ({ id, skin: id - 1, want: 'bread', cooldown: 0, age: 0 })), workers: [] });

export class CafeFactoryGame extends FactoryGame {
  constructor(options) { super(options); this.state.service = freshService(); this.initShelves(); }
  get service() { return this.state.service; }
  get shelves() { return this.state.buildings.filter(b => b.type === 'depot'); }
  initShelves() { for (const b of this.shelves) { b.goods ??= []; delete b.mode; } }
  get stockFoods() {
    const stock = {};
    for (const b of this.shelves) for (const item of b.goods || []) stock[item] = (stock[item] || 0) + 1;
    return stock;
  }
  availableFoods() {
    const built = new Set(this.state.buildings.map(b => b.type));
    const available = new Set(FOOD_RECIPES.filter(([, chain]) => chain.every(type => built.has(type))).map(([item]) => item));
    for (const b of this.state.buildings) for (const item of [b.input, b.output, b.buffer?.item, ...(b.goods || [])]) if (food(item)) available.add(item);
    for (const w of this.service.workers) if (w.job) available.add(w.job.item);
    return [...available];
  }
  desiredFood(slot) {
    const available = this.availableFoods();
    const priority = Object.keys(this.order.wants).filter(item => available.includes(item));
    const choices = slot === 0 && priority.length ? priority : available;
    return choices.length ? choices[(this.service.nextId + slot) % choices.length] : 'bread';
  }
  reserved(customerId) { return this.service.workers.some(w => w.job?.customerId === customerId); }
  canReceive(target, item, source = null) {
    if (target?.type !== 'depot') return super.canReceive(target, item, source);
    return (!source || canLink(source, target)) && !target.input && food(item) && (target.goods?.length || 0) < shelfCapacity(target);
  }
  dispatch(b) {
    b.goods ??= [];
    if (b.goods.length >= shelfCapacity(b)) return false;
    b.goods.push(b.input);
    this.events.push({ kind: 'shelf', x: b.x, y: b.y, time: this.state.time });
    return true;
  }
  findShelf(item) { return this.shelves.find(b => b.goods?.includes(item)); }
  place(...args) { const result = super.place(...args); this.initShelves(); return result; }
  serveFromShelf(rackId, item, customerId) {
    if (this.state.paused) return { ok: false, message: '先继续营业' };
    const b = this.shelves.find(b => b.id === rackId), c = this.service.customers.find(c => c.id === customerId);
    if (!b?.goods?.includes(item)) return { ok: false, message: '这份已经取走了' };
    if (!c || c.cooldown > 0) return { ok: false, message: '等下一位猫猫来' };
    if (this.reserved(c.id)) return { ok: false, message: '员工正在送这一份' };
    if (c.want !== item) return { ok: false, message: '看猫猫头上的食物' };
    b.goods.splice(b.goods.indexOf(item), 1);
    this.completeService(c, item, b);
    return { ok: true };
  }
  completeService(c, item, from) {
    super.deliver(item, from);
    this.service.served++; c.cooldown = 2; c.age = 0;
  }
  recruit() {
    if (this.state.paused) return { ok: false, message: '先继续营业' };
    const count = this.service.workers.length, cost = STAFF_COSTS[count];
    if (cost === undefined) return { ok: false, message: '员工已满' };
    if (this.service.served < 4) return { ok: false, message: '先亲手送出 4 份美味' };
    if (this.state.coins < cost) return { ok: false, message: '金币还不够' };
    this.state.coins -= cost; this.service.workers.push({ id: count + 1, job: null });
    return { ok: true };
  }
  remove(id) {
    const b = this.shelves.find(b => b.id === id);
    if (b && (b.goods?.length || b.input)) return { ok: false, message: '先送完架上的食物再收回' };
    return super.remove(id);
  }
  storeShelf(id) {
    const b = this.shelves.find(b => b.id === id);
    if (!b?.goods?.length) return { ok: false, message: '货架还是空的' };
    const count = Math.min(b.goods.length, this.warehouseCapacity - this.warehouseUsed);
    if (!count) return { ok: false, message: '仓库已满' };
    for (const item of b.goods.splice(0, count)) this.state.business.warehouse[item] = (this.state.business.warehouse[item] || 0) + 1;
    return { ok: true, count };
  }
  setDepotMode() { return { ok: false, message: '成品先上架，再送给猫猫' }; }
  step() {
    // Finish in-flight deliveries before the deadline check in the factory tick.
    for (const w of this.service.workers) if (w.job) {
      w.job.remaining = Math.max(0, w.job.remaining - STEP);
      if (w.job.remaining <= 1e-8) {
        const job = w.job, c = this.service.customers.find(c => c.id === job.customerId);
        this.completeService(c, job.item, job); w.job = null;
      }
    }
    super.step(); this.initShelves();
    const available = this.availableFoods();
    this.service.customers.forEach((c, slot) => {
      c.age = Math.min(60, c.age + STEP);
      if (c.cooldown > 0) {
        c.cooldown = Math.max(0, c.cooldown - STEP);
        if (c.cooldown <= 1e-8) this.service.customers[slot] = { id: this.service.nextId++, skin: this.service.nextId % 3, want: this.desiredFood(slot), cooldown: 0, age: 0 };
      } else if (c.age >= 8 && available.length && !available.includes(c.want) && !this.reserved(c.id)) {
        c.want = this.desiredFood(slot); c.age = 0;
      }
    });
    for (const w of this.service.workers) if (!w.job) {
      const c = this.service.customers.find(c => !c.cooldown && !this.reserved(c.id) && this.findShelf(c.want));
      if (!c) continue;
      const b = this.findShelf(c.want);
      b.goods.splice(b.goods.indexOf(c.want), 1);
      w.job = { customerId: c.id, item: c.want, remaining: DELIVERY_SECONDS, x: b.x, y: b.y };
    }
  }
  restore(raw) {
    // Validate on a candidate; malformed new fields must not mutate a live game.
    const candidate = new FactoryGame({ starter: false });
    if (!candidate.restore(raw)) return false;
    const s = candidate.state, service = s.service;
    for (const b of s.buildings) {
      if (b.type !== 'depot') { if (b.goods !== undefined) return false; continue; }
      if (service !== undefined && (!Array.isArray(b.goods) || b.goods.length > shelfCapacity(b) || b.goods.some(item => !food(item)))) return false;
      if (service === undefined && b.goods !== undefined) return false;
    }
    if (service !== undefined && !validService(service, s)) return false;
    this.state = s; this.state.service ??= freshService(); this.initShelves();
    this.accumulator = 0; this.events = []; return true;
  }
}

export function validService(s, state) {
  const integer = (n, max = 1e12) => Number.isSafeInteger(n) && n >= 0 && n <= max;
  const finite = (n, max) => Number.isFinite(n) && n >= 0 && n <= max;
  if (!s || s.version !== 1 || !integer(s.served, state.totalSold) || !integer(s.nextId) || s.nextId < 4 || !Array.isArray(s.customers) || s.customers.length !== 3 || !Array.isArray(s.workers) || s.workers.length > 3) return false;
  const ids = new Set(), jobs = new Set();
  for (const c of s.customers) {
    if (!c || !integer(c.id) || c.id < 1 || c.id >= s.nextId || ids.has(c.id) || !integer(c.skin, 2) || !food(c.want) || !finite(c.cooldown, 2) || !finite(c.age, 60)) return false;
    ids.add(c.id);
  }
  for (const [index, w] of s.workers.entries()) {
    if (!w || w.id !== index + 1 || s.served < 4) return false;
    if (w.job === null) continue;
    const j = w.job, c = s.customers.find(c => c.id === j?.customerId);
    if (!j || !c || c.cooldown || c.want !== j.item || jobs.has(c.id) || !finite(j.remaining, DELIVERY_SECONDS) || !integer(j.x, 39) || !integer(j.y, 23)) return false;
    jobs.add(c.id);
  }
  return true;
}
