export const SUSHI_SAVE_KEY = 'food-factory-sushi-v1';
export const SUSHI_WORLD = { width: 12, height: 16, cell: 56 };
export const SUSHI_FOODS = {
  salmon: { label: '三文鱼握寿司', sprite: 's_salmon', topping: 's_fish', price: 6, steps: ['捏饭团', '铺鱼片', '装盘'] },
  egg: { label: '玉子握寿司', sprite: 's_egg', topping: 's_tamago', price: 5, steps: ['捏饭团', '放玉子', '装盘'] },
  maki: { label: '黄瓜海苔卷', sprite: 's_maki', topping: 's_nori', price: 6, steps: ['铺米饭', '卷海苔', '切段装盘'] },
  shrimp: { label: '鲜虾握寿司', sprite: 's_shrimp', topping: 's_shrimp', price: 8, steps: ['捏饭团', '摆鲜虾', '装盘'] },
};
export const SUSHI_STATIONS = {
  prep: { x: 2, y: 2, target: { x: 2, y: 3 }, sprite: 's_prep', label: '料理台' },
  chef: { x: 4, y: 2, target: { x: 4, y: 3 }, sprite: 's_rice_cooker', label: '米饭台' },
  ingredients: { x: 6, y: 2, sprite: 's_ingredients', label: '鲜食柜' },
  stock: { x: 8, y: 2, target: { x: 8, y: 3 }, sprite: 's_supply', label: '补充食材' },
  sink: { x: 2, y: 10, sprite: 's_sink', label: '洗盘池' },
  load: { x: 4, y: 6, target: { x: 3, y: 6 }, label: '上菜口' },
};
export function sushiTrack(level = 0) {
  const right = level ? 10 : 8, cells = [];
  for (let x = 4; x <= right; x++) cells.push({ x, y: 5 });
  for (let y = 6; y <= 10; y++) cells.push({ x: right, y });
  for (let x = right - 1; x >= 4; x--) cells.push({ x, y: 10 });
  for (let y = 9; y > 5; y--) cells.push({ x: 4, y });
  return cells;
}
export function sushiSeats(level = 0) { return [5, 7, ...(level ? [9] : [])].flatMap(x => [{ x, y: 4, railY: 5 }, { x, y: 11, railY: 10 }]); }
export function trackPoint(distance, level = 0) {
  const cells = sushiTrack(level), d = ((distance % cells.length) + cells.length) % cells.length, i = Math.floor(d), a = cells[i], b = cells[(i + 1) % cells.length];
  return { x: a.x + (b.x - a.x) * (d - i), y: a.y + (b.y - a.y) * (d - i) };
}
export const SUSHI_STAFF = { helper: { label: '补货收盘员', price: 150, sold: 8 }, chef: { label: '寿司厨师', price: 320, sold: 20 } };
const ok = message => ({ ok: true, message }), fail = message => ({ ok: false, message });
const near = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < .04;
const integer = (n, min, max) => Number.isSafeInteger(n) && n >= min && n <= max;
const number = (n, min, max) => Number.isFinite(n) && n >= min && n <= max;
export function sushiWalkable(x, y, level = 0) {
  return integer(x, 0, 11) && integer(y, 1, 14)
    && !sushiTrack(level).some(p => p.x === x && p.y === y)
    && !Object.values(SUSHI_STATIONS).some(p => p.sprite && p.x === x && p.y === y);
}
export function sushiPath(actor, target, level = 0) {
  if (!sushiWalkable(target.x, target.y, level)) return null;
  const start = { x: Math.round(actor.x), y: Math.round(actor.y) }, key = p => `${p.x},${p.y}`;
  const queue = [start], seen = new Map([[key(start), null]]);
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i];
    if (p.x === target.x && p.y === target.y) {
      const path = [p]; let previous = seen.get(key(p));
      while (previous) { path.unshift(previous); previous = seen.get(key(previous)); }
      return near(actor, path[0]) ? path.slice(1) : path;
    }
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const q = { x: p.x + dx, y: p.y + dy };
      if (sushiWalkable(q.x, q.y, level) && !seen.has(key(q))) { seen.set(key(q), p); queue.push(q); }
    }
  }
  return null;
}
function moveActor(actor, dt, speed) {
  let distance = dt * speed;
  while (actor.path.length && distance > 0) {
    const p = actor.path[0], d = Math.hypot(p.x - actor.x, p.y - actor.y);
    if (d <= distance) { actor.x = p.x; actor.y = p.y; actor.path.shift(); distance -= d; }
    else { actor.x += (p.x - actor.x) * distance / d; actor.y += (p.y - actor.y) * distance / d; distance = 0; }
  }
}
export class SushiGame {
  constructor() { this.state = { version: 1, day: 1, coins: 0, totalSold: 0, level: 0, paused: false, status: 'open', selected: 'salmon', player: { x: 2, y: 4, path: [], intent: null, held: null }, dishes: [], customers: [], staff: [], stock: { rice: 12, salmon: 4, egg: 4, maki: 4, shrimp: 0 }, batch: null, dirty: [], dailySold: 0, dailyIncome: 0, admitted: 0, nextId: 1, spawnTimer: 0, time: 0 }; }
  get active() { return !this.state.paused && this.state.status === 'open'; }
  get track() { return sushiTrack(this.state.level); }
  get seats() { return sushiSeats(this.state.level); }
  get foods() { return Object.keys(SUSHI_FOODS).filter(key => key !== 'shrimp' || this.state.level); }
  get target() { return Math.min(12, 6 + this.state.day * 2); }
  pause(value) { this.state.paused = Boolean(value); }
  select(food) {
    if (!this.active || !this.foods.includes(food)) return fail('这道寿司还没开放');
    if (this.state.batch) return fail('先完成料理台上的这一份');
    this.state.selected = food; return ok(SUSHI_FOODS[food].label);
  }
  route(actor, target) { const path = sushiPath(actor, target, this.state.level); if (path === null) return false; actor.path = path; return true; }
  command(kind, arg) {
    if (!this.active) return fail('先继续营业');
    const player = this.state.player;
    let target;
    if (kind === 'walk') target = arg;
    else if (kind === 'clean') { if (!this.state.dirty.includes(arg)) return fail('这里已经很干净啦'); target = this.seats[arg]; }
    else if (kind === 'reclaim') target = SUSHI_STATIONS.load.target;
    else if (['prep', 'load', 'stock'].includes(kind)) target = SUSHI_STATIONS[kind].target;
    if (!target || !this.route(player, target)) return fail('这里走不过去，点旁边的过道');
    player.intent = kind === 'walk' ? null : { kind, ...(kind === 'clean' ? { seat: arg } : {}) };
    if (!player.path.length && player.intent) return this.perform();
    return ok(kind === 'walk' ? '走到这里' : '小猫过去啦');
  }
  hasStock(food) { return this.state.stock.rice > 0 && this.state.stock[food] > 0; }
  takeStock(food) { if (!this.hasStock(food)) return false; this.state.stock.rice--; this.state.stock[food]--; return true; }
  refill() { this.state.stock.rice = 18; for (const food of this.foods) this.state.stock[food] = 6; }
  perform() {
    const s = this.state, player = s.player, intent = player.intent; player.intent = null;
    if (!intent) return fail('点一个工作台');
    let result;
    if (intent.kind === 'stock') { this.refill(); result = ok('食材补满啦，不扣金币'); }
    if (intent.kind === 'clean') { s.dirty = s.dirty.filter(seat => seat !== intent.seat); result = ok('收好盘子，座位可以迎客啦'); }
    if (intent.kind === 'load') result = this.load(player);
    if (intent.kind === 'reclaim') {
      const index = this.track.findIndex(p => p.x === 4 && p.y === 6), length = this.track.length;
      const dish = s.dishes.find(d => Math.min(Math.abs(d.distance - index), length - Math.abs(d.distance - index)) < .65);
      if (dish) { s.dishes = s.dishes.filter(d => d !== dish); result = ok('撤下一盘剩余寿司，不计收入；食材可免费补充'); }
      else result = fail('等餐盘转到上菜口，再撤盘');
    }
    if (intent.kind === 'prep') {
      if (player.held) result = fail('先把手里的寿司放上回转带');
      else if (!s.batch) {
        if (!this.takeStock(s.selected)) result = fail('食材不够，去右上的补货箱');
        else { s.batch = { food: s.selected, step: 1 }; result = ok('米饭好了，再点一次加料'); }
      } else if (s.batch.step === 1) { s.batch.step = 2; result = ok('配料好了，再点一次装盘'); }
      else { player.held = s.batch.food; s.batch = null; result = ok('寿司做好啦，送到左侧上菜口'); }
    }
    this.notice = result?.message; return result || fail('先选工作台');
  }
  load(actor) {
    if (!this.active || !near(actor, SUSHI_STATIONS.load.target)) return fail('走到上菜口再放盘');
    if (!actor.held) return fail('先做一份寿司');
    const index = this.track.findIndex(p => p.x === 4 && p.y === 6), length = this.track.length;
    if (this.state.dishes.some(d => Math.min(Math.abs(d.distance - index), length - Math.abs(d.distance - index)) < .58)) return fail('上菜口暂时挤满了，等餐盘过去');
    this.state.dishes.push({ id: this.state.nextId++, food: actor.held, distance: index }); actor.held = null;
    return ok('寿司出发，只有顾客取餐才收钱');
  }
  neededFood() {
    for (const customer of this.state.customers.filter(c => ['arriving', 'waiting'].includes(c.status))) {
      const food = customer.food, demand = this.state.customers.filter(c => ['arriving', 'waiting'].includes(c.status) && c.food === food).length;
      const supply = this.state.dishes.filter(d => d.food === food).length + Number(this.state.player.held === food) + Number(this.state.batch?.food === food)
        + this.state.staff.filter(w => w.held === food || w.job?.food === food).length;
      if (demand > supply && this.hasStock(food)) return food;
    }
    return null;
  }
  work(staff, dt) {
    const s = this.state;
    if (staff.path.length) { moveActor(staff, dt, 2.1); return; }
    if (staff.job) {
      staff.job.remaining = Math.max(0, staff.job.remaining - dt);
      if (!staff.job.remaining) {
        if (staff.job.kind === 'cook') staff.held = staff.job.food;
        if (staff.job.kind === 'stock') this.refill();
        if (staff.job.kind === 'clean') s.dirty = s.dirty.filter(seat => seat !== staff.job.seat);
        staff.job = null;
      }
      return;
    }
    if (staff.held) { if (!near(staff, SUSHI_STATIONS.load.target)) this.route(staff, SUSHI_STATIONS.load.target); else this.load(staff); return; }
    if (staff.role === 'helper') {
      const low = s.stock.rice < 3 || this.foods.some(food => s.stock[food] === 0);
      const seat = s.dirty[0];
      if (low) { this.route(staff, SUSHI_STATIONS.stock.target); staff.job = { kind: 'stock', remaining: 1.5 }; }
      else if (seat !== undefined) { this.route(staff, this.seats[seat]); staff.job = { kind: 'clean', seat, remaining: 1.2 }; }
      else if (!near(staff, { x: 1, y: 12 })) this.route(staff, { x: 1, y: 12 });
    } else {
      const food = this.neededFood();
      if (!near(staff, SUSHI_STATIONS.chef.target)) this.route(staff, SUSHI_STATIONS.chef.target);
      else if (food && this.takeStock(food)) staff.job = { kind: 'cook', food, remaining: 7 };
    }
  }
  update(dt) {
    if (!this.active || !Number.isFinite(dt) || dt <= 0) return;
    let remaining = Math.min(dt, .25);
    while (remaining > 1e-8 && this.active) { const step = Math.min(.05, remaining); this.advance(step); remaining -= step; }
  }
  advance(dt) {
    const s = this.state; s.time += dt;
    moveActor(s.player, dt, 2.8); if (!s.player.path.length && s.player.intent) this.perform();
    const track = this.track;
    for (const dish of s.dishes) dish.distance = (dish.distance + dt * .7) % track.length;
    for (const customer of s.customers) {
      if (['arriving', 'leaving'].includes(customer.status)) {
        moveActor(customer, dt, 1.8);
        if (!customer.path.length && customer.status === 'arriving') customer.status = 'waiting';
      }
      if (customer.status === 'waiting') {
        const seat = this.seats[customer.seat], pickup = track.findIndex(p => p.x === seat.x && p.y === seat.railY);
        const dish = s.dishes.find(d => d.food === customer.food && Math.min(Math.abs(d.distance - pickup), track.length - Math.abs(d.distance - pickup)) < .27);
        if (dish) {
          s.dishes = s.dishes.filter(d => d !== dish); customer.status = 'eating'; customer.eating = 2.8;
          s.coins += SUSHI_FOODS[dish.food].price; s.dailyIncome += SUSHI_FOODS[dish.food].price; s.dailySold++; s.totalSold++;
          this.notice = `小猫取餐啦 +${SUSHI_FOODS[dish.food].price} 金币`;
        }
      } else if (customer.status === 'eating') {
        customer.eating = Math.max(0, customer.eating - dt);
        if (!customer.eating) { customer.status = 'leaving'; if (!s.dirty.includes(customer.seat)) s.dirty.push(customer.seat); this.route(customer, { x: 10, y: 14 }); }
      }
    }
    s.customers = s.customers.filter(c => c.status !== 'leaving' || c.path.length);
    for (const staff of s.staff) this.work(staff, dt);
    s.spawnTimer = Math.max(0, s.spawnTimer - dt);
    if (s.admitted < this.target && !s.spawnTimer) {
      const seat = this.seats.findIndex((_, i) => !s.dirty.includes(i) && !s.customers.some(c => c.seat === i && c.status !== 'leaving'));
      if (seat !== -1) {
        const customer = { id: s.nextId++, seat, food: this.foods[(s.admitted + s.day - 1) % this.foods.length], status: 'arriving', x: 10, y: 14, path: [], eating: 0 };
        this.route(customer, this.seats[seat]); s.customers.push(customer); s.admitted++; s.spawnTimer = 2.2;
      }
    }
    if (s.admitted === this.target && !s.customers.length) { s.status = 'closed'; s.player.path = []; s.player.intent = null; this.notice = '今天的小猫都吃好啦，明天继续开门'; }
  }
  hire(role) {
    const def = SUSHI_STAFF[role], s = this.state;
    if (this.active || !Object.hasOwn(SUSHI_STAFF, role)) return fail('先到经营页看看');
    if (s.staff.some(w => w.role === role)) return fail('已经有这位员工啦');
    if (s.totalSold < def.sold) return fail(`招待 ${def.sold} 位顾客后开放`);
    if (s.coins < def.price) return fail('金币还差一点');
    s.coins -= def.price; s.staff.push({ role, x: 10, y: 14, path: [], job: null, held: null }); return ok(`${def.label}来报到啦`);
  }
  expand() {
    const s = this.state;
    if (s.status !== 'closed') return fail('打烊后再扩建，营业中不移动客人');
    if (s.level) return fail('本店已经扩建完成');
    if (s.coins < 180) return fail('扩建需要 180 金币');
    const oldLength = this.track.length; s.coins -= 180; s.level = 1;
    for (const dish of s.dishes) dish.distance *= this.track.length / oldLength;
    for (const actor of [s.player, ...s.staff]) { actor.path = []; if (!sushiWalkable(Math.round(actor.x), Math.round(actor.y), 1)) { actor.x = 2; actor.y = 4; } }
    for (const worker of s.staff) if (worker.job) this.route(worker, worker.job.kind === 'clean' ? this.seats[worker.job.seat] : worker.job.kind === 'stock' ? SUSHI_STATIONS.stock.target : SUSHI_STATIONS.chef.target);
    s.player.intent = null; s.stock.shrimp = 6; return ok('回转带加长啦，新增两席与鲜虾寿司');
  }
  nextDay() {
    const s = this.state; if (s.status !== 'closed') return fail('先招待完今天的顾客');
    s.day++; s.dailySold = 0; s.dailyIncome = 0; s.admitted = 0; s.spawnTimer = 0; s.status = 'open'; s.paused = false;
    return ok(`第 ${s.day} 天，开门迎客`);
  }
  serialize() { return JSON.stringify(this.state); }
  restore(raw) {
    try {
      const s = JSON.parse(raw);
      if (!s || s.version !== 1 || !integer(s.day, 1, 1000000) || !integer(s.coins, 0, 1e10) || !integer(s.totalSold, 0, 1e9) || ![0, 1].includes(s.level) || typeof s.paused !== 'boolean' || !['open', 'closed'].includes(s.status)) return false;
      const foods = Object.keys(SUSHI_FOODS).filter(f => f !== 'shrimp' || s.level), track = sushiTrack(s.level), seats = sushiSeats(s.level), target = Math.min(12, 6 + s.day * 2);
      if (!foods.includes(s.selected) || !number(s.time, 0, 1e12) || !number(s.spawnTimer, 0, 2.2) || !integer(s.nextId, 1, 1e10) || !integer(s.admitted, 0, target) || !integer(s.dailySold, 0, s.admitted) || s.totalSold < s.dailySold || !integer(s.dailyIncome, s.dailySold * 5, s.dailySold * 8)) return false;
      if (!s.stock || !integer(s.stock.rice, 0, 18) || Object.keys(SUSHI_FOODS).some(f => !integer(s.stock[f], 0, 6)) || (!s.level && s.stock.shrimp)) return false;
      const actorValid = a => a && number(a.x, 0, 11) && number(a.y, 1, 14) && sushiWalkable(Math.round(a.x), Math.round(a.y), s.level)
        && Array.isArray(a.path) && a.path.length <= 100 && a.path.every((p, i) => p && sushiWalkable(p.x, p.y, s.level) && (!i ? Math.hypot(p.x - a.x, p.y - a.y) <= 1.01 : Math.abs(p.x - a.path[i - 1].x) + Math.abs(p.y - a.path[i - 1].y) === 1));
      if (!actorValid(s.player) || !(s.player.held === null || foods.includes(s.player.held))) return false;
      const intent = s.player.intent;
      if (intent !== null && (!intent || !['prep', 'load', 'stock', 'clean', 'reclaim'].includes(intent.kind) || intent.kind === 'clean' && !integer(intent.seat, 0, seats.length - 1))) return false;
      if (s.batch !== null && (!s.batch || !foods.includes(s.batch.food) || ![1, 2].includes(s.batch.step) || s.player.held || s.batch.food !== s.selected)) return false;
      if (!Array.isArray(s.dirty) || new Set(s.dirty).size !== s.dirty.length || s.dirty.some(i => !integer(i, 0, seats.length - 1))) return false;
      const ids = new Set(), idValid = id => { if (!integer(id, 1, s.nextId - 1) || ids.has(id)) return false; ids.add(id); return true; };
      if (!Array.isArray(s.dishes) || s.dishes.length > 45 || s.dishes.some(d => !d || !idValid(d.id) || !foods.includes(d.food) || !number(d.distance, 0, track.length - 1e-9))) return false;
      for (let i = 0; i < s.dishes.length; i++) for (let j = 0; j < i; j++) { const d = Math.abs(s.dishes[i].distance - s.dishes[j].distance); if (Math.min(d, track.length - d) < .579) return false; }
      const occupied = new Set();
      if (!Array.isArray(s.customers) || s.customers.length > 24 || s.customers.some(c => {
        if (!actorValid(c) || !idValid(c.id) || !foods.includes(c.food) || !integer(c.seat, 0, seats.length - 1) || !['arriving', 'waiting', 'eating', 'leaving'].includes(c.status) || !number(c.eating, 0, 2.8)) return true;
        if (c.status !== 'leaving') { if (occupied.has(c.seat) || s.dirty.includes(c.seat)) return true; occupied.add(c.seat); }
        return ['waiting', 'eating'].includes(c.status) && (c.path.length || !near(c, seats[c.seat]));
      })) return false;
      if (s.customers.filter(c => ['arriving', 'waiting'].includes(c.status)).length !== s.admitted - s.dailySold || s.status === 'closed' && (s.customers.length || s.dailySold !== target)) return false;
      const roles = new Set();
      if (!Array.isArray(s.staff) || s.staff.length > 2 || s.staff.some(w => {
        if (!actorValid(w) || !Object.hasOwn(SUSHI_STAFF, w.role) || roles.has(w.role) || !(w.held === null || foods.includes(w.held))) return true;
        roles.add(w.role); const j = w.job;
        return j !== null && (!j || w.held || !['cook', 'stock', 'clean'].includes(j.kind) || !number(j.remaining, 0, 7) || (j.kind === 'cook' ? w.role !== 'chef' || !foods.includes(j.food) : w.role !== 'helper') || j.kind === 'clean' && !integer(j.seat, 0, seats.length - 1));
      })) return false;
      this.state = s; s.paused = true; return true;
    } catch { return false; }
  }
}
