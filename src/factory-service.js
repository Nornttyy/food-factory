import { FactoryGame, ITEMS, FOOD_RECIPES, STEP, AREAS } from './factory-core.js?v=0.23.0';
import { canLink } from './factory-links.js?v=0.23.0';
import { worldArea, yardLayout, findPath, shelfApproaches } from './factory-yard.js?v=0.23.0';

export const STAFF_COSTS = [600, 1500, 3000, 4500, 6000, 8000];
export const COMPACT_AREAS = [[10, 6], [14, 8], [18, 10], [24, 14], [30, 18], [40, 24]];
export const DELIVERY_SECONDS = 4;
export const WALK_SPEED = 2.2;
export const shelfCapacity = b => 4 + b.level * 4;
const food = item => typeof item === 'string' && Object.hasOwn(ITEMS, item) && Boolean(ITEMS[item].value);
const freshService = () => ({ version: 4, served: 0, nextId: 4, customers: [1, 2, 3].map(id => ({ id, skin: id - 1, want: 'bread', cooldown: 0, age: 0 })), workers: [] });

export class CafeFactoryGame extends FactoryGame {
  constructor(options) { super(options); this.state.workshopArea = [...COMPACT_AREAS[0]]; this.state.service = freshService(); this.workerPrevious = new Map(); this.unreachable = new Set(); this.initShelves(); }
  get area() { return this.state.workshopArea || COMPACT_AREAS[this.state.expansion]; }
  get nextArea() {
    const stage = this.state.expansion, next = COMPACT_AREAS[stage + 1];
    // Older expanded workshops keep purchased land, and every further upgrade
    // still adds room rather than charging for a smaller or identical footprint.
    return next?.map((n, i) => Math.min(AREAS[stage + 1][i], Math.max(n, this.area[i] + n - COMPACT_AREAS[stage][i]))) || null;
  }
  get service() { return this.state.service; }
  get worldArea() { return worldArea(this.area); }
  get shelves() { return this.state.buildings.filter(b => b.type === 'depot'); }
  initShelves() { for (const b of this.shelves) { b.goods ??= []; delete b.mode; } }
  get stockFoods() {
    const stock = {};
    for (const b of this.shelves) for (const item of new Set(b.goods || [])) { const n = this.availableStock(b, item); if (n) stock[item] = (stock[item] || 0) + n; }
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
  availableStock(b, item) { return Math.max(0, (b?.goods || []).filter(v => v === item).length - this.service.workers.filter(w => w.job?.stage === 'pickup' && w.job.shelfId === b?.id && w.job.item === item).length); }
  findShelf(item) { return this.shelves.find(b => this.availableStock(b, item) > 0); }
  clearRoutes() { for (const w of this.service.workers) { w.path = null; w.wander = null; w.wait = 0; } this.unreachable.clear(); }
  place(type, x, y, ...args) {
    if (this.service?.workers.some(w => [w, w.path?.[0]].filter(Boolean).some(p => Math.floor(p.x) === x && Math.floor(p.y) === y))) return { ok: false, message: '等员工走过这里再建造' };
    const result = super.place(type, x, y, ...args); this.initShelves(); if (result.ok) this.clearRoutes(); return result;
  }
  expand() {
    const old = this.area[0], next = this.nextArea, result = super.expand();
    if (result.ok) {
      this.state.workshopArea = next;
      for (const w of this.service.workers) if (w.x >= old) w.x += this.area[0] - old;
      this.workerPrevious.clear(); this.clearRoutes();
    }
    return result;
  }
  serveFromShelf(rackId, item, customerId) {
    if (this.state.paused) return { ok: false, message: '先继续营业' };
    const b = this.shelves.find(b => b.id === rackId), c = this.service.customers.find(c => c.id === customerId);
    if (!b || !this.availableStock(b, item)) return { ok: false, message: '这份已经取走或由员工预订了' };
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
    this.state.coins -= cost; this.service.workers.push({ id: count + 1, ...yardLayout(this.area).homes[count], job: null, path: null, wander: null, wait: 0, stroll: 0 });
    return { ok: true };
  }
  remove(id) {
    const b = this.shelves.find(b => b.id === id);
    if (b && (b.goods?.length || b.input)) return { ok: false, message: '先送完架上的食物再收回' };
    const result = super.remove(id); if (result.ok) this.clearRoutes(); return result;
  }
  storeShelf(id) {
    const b = this.shelves.find(b => b.id === id);
    if (!b?.goods?.length) return { ok: false, message: '货架还是空的' };
    if (this.service.workers.some(w => w.job?.stage === 'pickup' && w.job.shelfId === id)) return { ok: false, message: '员工正在来取餐，稍后再入库' };
    const count = Math.min(b.goods.length, this.warehouseCapacity - this.warehouseUsed);
    if (!count) return { ok: false, message: '仓库已满' };
    for (const item of b.goods.splice(0, count)) this.state.business.warehouse[item] = (this.state.business.warehouse[item] || 0) + 1;
    return { ok: true, count };
  }
  setDepotMode() { return { ok: false, message: '成品先上架，再送给猫猫' }; }
  pathFor(w, goals) {
    const key = `${Math.floor(w.x)},${Math.floor(w.y)}:${goals.map(p => `${p.x},${p.y}`).join(';')}`;
    if (this.unreachable.has(key)) return null;
    const path = findPath(this.area, this.walkingObstacles, w, goals);
    if (path === null) { if (this.unreachable.size >= 4096) this.unreachable.clear(); this.unreachable.add(key); }
    return path;
  }
  walk(w, goals) {
    if (w.path === null) w.path = this.pathFor(w, goals);
    if (w.path === null) return false;
    let distance = WALK_SPEED * STEP;
    while (w.path.length && distance > 1e-8) {
      const next = w.path[0];
      if (this.walkingObstacles.has(`${Math.floor(next.x)},${Math.floor(next.y)}`)) { w.path = null; return false; }
      const length = Math.hypot(next.x - w.x, next.y - w.y), move = Math.min(distance, length);
      if (length > 1e-8) { w.x += (next.x - w.x) / length * move; w.y += (next.y - w.y) / length * move; }
      distance -= move;
      if (length <= move + 1e-8) { w.x = next.x; w.y = next.y; w.path.shift(); }
    }
    return w.path.length === 0;
  }
  assign(w) {
    const yard = yardLayout(this.area), candidates = [];
    for (const [slot, c] of this.service.customers.entries()) {
      if (c.cooldown || this.reserved(c.id)) continue;
      const shelves = this.shelves.filter(b => this.availableStock(b, c.want));
      // Do not take food if the customer is cut off from this connected space.
      if (!shelves.length || this.pathFor(w, [yard.targets[slot]]) === null) continue;
      for (const b of shelves) candidates.push({ c, b, target: yard.targets[slot], approaches: shelfApproaches(b) });
    }
    if (!candidates.length) return false;
    // One breadth-first search finds the nearest reachable pickup, independent
    // of building creation order. A new job starts here, never back at a home.
    const path = this.pathFor(w, candidates.flatMap(c => c.approaches));
    if (!path) return false;
    const end = path.at(-1) || w;
    const choices = candidates.filter(c => c.approaches.some(p => Math.hypot(p.x - end.x, p.y - end.y) < 1e-8));
    choices.sort((a, b) => Math.abs(a.target.x - end.x) + Math.abs(a.target.y - end.y) - Math.abs(b.target.x - end.x) - Math.abs(b.target.y - end.y) || a.c.id - b.c.id);
    const { c, b } = choices[0];
    w.job = { customerId: c.id, item: c.want, stage: 'pickup', shelfId: b.id, x: b.x, y: b.y };
    w.path = path; w.wander = null; w.wait = 0; return true;
  }
  stroll(w) {
    if (w.wait > 0) { w.wait = Math.max(0, w.wait - STEP); return; }
    if (!w.wander) {
      const [width, height] = this.worldArea, points = [], preferFactory = w.stroll % 2 === 0;
      // Deterministic destinations survive save/resume. Alternating open factory
      // tiles and the shared forecourt makes the whole map usable, not a rail.
      const seed = (w.id * 73856093 ^ w.stroll * 19349663) >>> 0;
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        if (this.walkingObstacles.has(`${x},${y}`) || Math.hypot(x + .5 - w.x, y + .5 - w.y) < 2) continue;
        let hash = (seed ^ Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263)) >>> 0;
        hash = Math.imul(hash ^ hash >>> 13, 1274126177) >>> 0;
        points.push({ x: x + .5, y: y + .5, score: (hash ^ hash >>> 16) >>> 0, preferred: preferFactory ? x < this.area[0] && y < this.area[1] : x >= this.area[0] });
      }
      points.sort((a, b) => Number(b.preferred) - Number(a.preferred) || a.score - b.score);
      w.stroll = (w.stroll + 1) % 1000000;
      for (const p of points.slice(0, 16)) {
        const path = this.pathFor(w, [p]);
        if (path?.length) { w.wander = { x: p.x, y: p.y }; w.path = path; break; }
      }
      if (!w.wander) { w.wait = 2; w.path = null; return; }
    }
    if (this.walk(w, [w.wander]) || w.path === null) { w.wander = null; w.path = null; w.wait = Math.min(3, 1 + w.id * .4); }
  }
  stepWorker(w) {
    this.workerPrevious.set(w.id, { x: w.x, y: w.y });
    const yard = yardLayout(this.area);
    if (!w.job) {
      // Work preempts wandering or resting immediately, at the current position.
      if (!this.assign(w)) this.stroll(w);
      return;
    }
    const job = w.job;
    if (job.stage === 'pickup') {
      const shelf = this.shelves.find(b => b.id === job.shelfId);
      if (!shelf?.goods.includes(job.item)) { w.job = null; w.path = null; return; }
      if (this.walk(w, shelfApproaches(shelf))) {
        shelf.goods.splice(shelf.goods.indexOf(job.item), 1); job.stage = 'deliver'; w.path = null;
      } else if (w.path === null) { w.job = null; } // Release reservation if a new building seals the route.
    } else {
      const slot = this.service.customers.findIndex(c => c.id === job.customerId);
      if (slot >= 0 && this.walk(w, [yard.targets[slot]])) {
        this.completeService(this.service.customers[slot], job.item, { x: yard.spots[slot].x - .5, y: yard.spots[slot].y - .5 });
        w.job = null; w.path = null;
      }
    }
  }
  step() {
    this.walkingObstacles = new Set(this.state.buildings.map(b => `${b.x},${b.y}`));
    const workers = this.service.workers;
    // Rotate dispatch priority so additional recruits actually get turns taking
    // orders, rather than the original three always reserving every customer.
    for (let n = 0; n < workers.length; n++) this.stepWorker(workers[(this.state.tick + n) % workers.length]);
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
    if (service?.version === 4) {
      if (!Array.isArray(s.workshopArea) || s.workshopArea.length !== 2 || s.workshopArea.some((n, i) => !Number.isInteger(n) || n < COMPACT_AREAS[s.expansion][i] || n > AREAS[s.expansion][i])) return false;
      if (s.buildings.some(b => b.x >= s.workshopArea[0] || b.y >= s.workshopArea[1])) return false;
    }
    if (service !== undefined && !validService(service, s)) return false;
    const legacy = service?.version !== 4, oldArea = AREAS[s.expansion];
    if (legacy) {
      // Compact unused starter land only. Keep every placed device and all
      // previously purchased expansions; never crop or relocate the production line.
      s.workshopArea = s.expansion > 0 ? [...oldArea] : COMPACT_AREAS[0].map((n, i) => Math.max(n, ...s.buildings.map(b => (i ? b.y : b.x) + 1)));
    }
    this.state = s; this.state.service ??= freshService(); this.initShelves();
    if (this.service.version === 1) {
      this.service.version = 2;
      this.service.workers.forEach((w, i) => {
        Object.assign(w, yardLayout(oldArea, true).homes[i], { path: null });
        // Old jobs already removed their food: migrate as carrying, never pick twice.
        if (w.job) { delete w.job.remaining; w.job.stage = 'deliver'; w.job.shelfId = null; }
      });
    }
    if (this.service.version === 2) {
      for (const w of this.service.workers) {
        // Keep old in-flight food, exact positions and routes. Idle return trips
        // become interruptible walks; recruitment prices never charge old staff.
        w.wander = !w.job && w.path?.length ? { ...w.path.at(-1) } : null;
        if (!w.job && !w.wander) w.path = null;
        w.wait = 0; w.stroll = 0;
      }
      this.service.version = 3;
    }
    if (legacy) {
      const [width, height] = this.worldArea;
      for (const w of this.service.workers) {
        if (w.x >= oldArea[0]) w.x += this.area[0] - oldArea[0];
        if (w.y >= oldArea[1]) w.y += this.area[1] - oldArea[1];
        w.x = Math.min(width - .5, w.x); w.y = Math.min(height - .5, w.y);
        // Carrying/pickup reservations survive; obsolete destinations do not.
        w.path = null; w.wander = null; w.wait = 0;
      }
      this.service.version = 4;
    }
    this.workerPrevious = new Map(); this.unreachable = new Set(); this.accumulator = 0; this.events = []; return true;
  }
}

export function validService(s, state) {
  const integer = (n, max = 1e12) => Number.isSafeInteger(n) && n >= 0 && n <= max;
  const finite = (n, max) => Number.isFinite(n) && n >= 0 && n <= max;
  if (!s || ![1, 2, 3, 4].includes(s.version) || !integer(s.served, state.totalSold) || !integer(s.nextId) || s.nextId < 4 || !Array.isArray(s.customers) || s.customers.length !== 3 || !Array.isArray(s.workers) || s.workers.length > (s.version === 4 ? STAFF_COSTS.length : 3)) return false;
  const ids = new Set(), jobs = new Set();
  for (const c of s.customers) {
    if (!c || !integer(c.id) || c.id < 1 || c.id >= s.nextId || ids.has(c.id) || !integer(c.skin, 2) || !food(c.want) || !finite(c.cooldown, 2) || !finite(c.age, 60)) return false;
    ids.add(c.id);
  }
  for (const [index, w] of s.workers.entries()) {
    if (!w || w.id !== index + 1 || s.served < 4) return false;
    if (s.version >= 2) {
      const legacy = s.version < 4, area = legacy ? AREAS[state.expansion] : state.workshopArea, [width, height] = worldArea(area, legacy);
      const point = p => p && finite(p.x, width - .5) && finite(p.y, height - .5) && p.x >= .5 && p.y >= .5;
      if (!point(w) || state.buildings.some(b => b.x === Math.floor(w.x) && b.y === Math.floor(w.y))) return false;
      if (s.version >= 3) {
        if (!finite(w.wait, 3) || !integer(w.stroll, 999999)) return false;
        if (w.wander !== null && (!point(w.wander) || w.wander.x % 1 !== .5 || w.wander.y % 1 !== .5 || w.job !== null || w.wait > 0)) return false;
        if (w.job !== null && (w.wait !== 0 || w.wander !== null)) return false;
        if (!w.job && !w.wander && w.path !== null) return false;
      }
      if (w.path !== null) {
        if (!Array.isArray(w.path) || w.path.length > width * height) return false;
        let previous = w;
        for (const p of w.path) {
          if (!point(p) || p.x % 1 !== .5 || p.y % 1 !== .5 || Math.abs(p.x - previous.x) + Math.abs(p.y - previous.y) > 1.01 || (Math.abs(p.x - previous.x) > 1e-8 && Math.abs(p.y - previous.y) > 1e-8)) return false;
          previous = p;
        }
        const j = w.job, shelf = state.buildings.find(b => b.id === j?.shelfId);
        const goals = !j ? [s.version >= 3 ? w.wander : yardLayout(area, legacy).homes[index]] : j.stage === 'pickup' && shelf ? shelfApproaches(shelf) : [yardLayout(area, legacy).targets[s.customers.findIndex(c => c.id === j.customerId)]];
        if (!goals.some(p => p && Math.hypot(previous.x - p.x, previous.y - p.y) < 1e-8)) return false;
      }
    }
    if (w.job === null) continue;
    const j = w.job, c = s.customers.find(c => c.id === j?.customerId);
    if (!j || !c || c.cooldown || c.want !== j.item || jobs.has(c.id) || !integer(j.x, 39) || !integer(j.y, 23)) return false;
    if (s.version === 1 && !finite(j.remaining, DELIVERY_SECONDS)) return false;
    if (s.version >= 2) {
      if (!['pickup', 'deliver'].includes(j.stage) || j.remaining !== undefined) return false;
      if (j.stage === 'pickup') {
        const shelf = state.buildings.find(b => b.type === 'depot' && b.id === j.shelfId);
        if (!shelf || shelf.x !== j.x || shelf.y !== j.y || (shelf.goods || []).filter(item => item === j.item).length < s.workers.filter(other => other?.job?.stage === 'pickup' && other.job.shelfId === j.shelfId && other.job.item === j.item).length) return false;
      } else if (j.shelfId !== null && !integer(j.shelfId)) return false;
    }
    jobs.add(c.id);
  }
  return true;
}
