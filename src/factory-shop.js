// The shop is a separate room: old factory layouts never lose a tile to a counter.
export const COUNTER_CAPACITY = 24;
export const SHOP_RECIPES = {
  bread: { seconds: 3, unlock: 0 }, butter_cookie: { seconds: 4, unlock: 0 },
  donut_plain: { seconds: 4, unlock: 1 }, donut_strawberry: { seconds: 5, unlock: 1 },
  steamed_bun: { seconds: 4, unlock: 1 }, orange_juice: { seconds: 3.5, unlock: 2 },
  strawberry_cake: { seconds: 6, unlock: 2 }, orange_icepop: { seconds: 5, unlock: 2 },
};
export const STAFF = {
  server: { label: '跑堂猫', cost: 120, served: 12, detail: '从取餐架拿餐，走到顾客身边送餐' },
  cook: { label: '后厨猫', cost: 200, served: 24, detail: '按点单自动手作，一次一份；产线能更快备货' },
};
export const cookSeconds = (item, role = 'player') => SHOP_RECIPES[item].seconds * (role === 'cook' ? 1.6 : 1);
export const SHOP_POINTS = { kitchen: { x: 2.2, y: 2.8 }, rack: { x: 4.4, y: 2.8 } };
export const customerY = slot => 2.7 + slot * 1.15;
const actor = (x, y) => ({ x, y, facing: 1, holding: null, task: null, work: 0 });
export function freshShop(legacy = false, served = 0) {
  return { version: 1, legacy, served, cooked: 0, selected: 'bread', counter: {},
    player: actor(3.5, 4), staff: { server: null, cook: null }, nextCustomerId: 4,
    customers: [0, 1, 2].map(slot => ({ id: slot + 1, slot, item: 'bread', cooldown: 0 })) };
}
export const counterUsed = shop => Object.values(shop.counter).reduce((sum, n) => sum + n, 0);
export const automationReady = shop => !shop || shop.legacy || shop.served >= 6;
export function requestShop(game, kind, value) {
  const s = game.state.shop;
  if (!s) return { ok: false, message: '当前是传送带练习' };
  if (game.state.paused) return { ok: false, message: '先继续营业' };
  const p = s.player;
  if (kind === 'cook') {
    const item = value || s.selected, recipe = SHOP_RECIPES[item];
    if (!Object.hasOwn(SHOP_RECIPES, item) || recipe.unlock > game.unlockLevel) return { ok: false, message: '先完成工坊订单解锁食谱' };
    if (p.holding) return { ok: false, message: '先送出手里的餐，或放回取餐架' };
    if (counterUsed(s) >= COUNTER_CAPACITY) return { ok: false, message: '取餐架满了，先给顾客送餐' };
    if (p.task?.kind === 'cook') return { ok: false, message: '这份还在制作中' };
    s.selected = item; p.task = { kind: 'cook', item }; p.work = 0;
  } else if (kind === 'pickup') {
    if (p.holding) { p.task = { kind: 'return' }; p.work = 0; return { ok: true }; }
    const item = value || s.customers.find(c => !c.cooldown && s.counter[c.item])?.item || Object.keys(s.counter).find(item => s.counter[item] > 0);
    if (!Object.hasOwn(SHOP_RECIPES, item) || !(s.counter[item] > 0)) return { ok: false, message: '先做一份美食，做好后会放到取餐架' };
    p.task = { kind: 'pickup', item }; p.work = 0;
  } else if (kind === 'serve') {
    const c = s.customers.find(c => c.id === value && !c.cooldown);
    if (!c) return { ok: false, message: '这位顾客已经拿到餐啦' };
    if (p.holding && p.holding !== c.item) return { ok: false, message: '食物不对，看看顾客头顶的点单' };
    if (!p.holding && !s.counter[c.item]) return { ok: false, message: '先做顾客想要的食物' };
    p.task = p.holding ? { kind: 'serve', customer: c.id } : { kind: 'pickup', item: c.item, customer: c.id }; p.work = 0;
  } else if (kind === 'discard') {
    // Ingredients are free. An explicit return-to-ingredients action guarantees
    // recovery even when both storage and the counter contain unwanted food.
    if (p.holding) { p.holding = null; p.task = null; p.work = 0; }
    else {
      const item = s.counter[s.selected] > 0 ? s.selected : Object.keys(s.counter).find(item => s.counter[item] > 0);
      if (!item) return { ok: false, message: '没有需要退回的食物' };
      s.counter[item]--;
    }
  } else if (kind === 'walk') {
    if (!Number.isFinite(value?.x) || !Number.isFinite(value?.y)) return { ok: false };
    p.task = { kind: 'walk', x: Math.max(.8, Math.min(6.8, value.x)), y: Math.max(2.6, Math.min(5.25, value.y)) }; p.work = 0;
  } else return { ok: false };
  return { ok: true };
}
export function hireStaff(game, role) {
  const s = game.state.shop, def = STAFF[role];
  if (!s || !Object.hasOwn(STAFF, role) || s.staff[role]) return { ok: false, message: '这位员工已经加入了' };
  if (s.served < def.served && !s.legacy) return { ok: false, message: `服务 ${def.served} 位顾客后可招募` };
  if (game.state.coins < def.cost) return { ok: false, message: '再攒一点招募金币吧' };
  game.state.coins -= def.cost; s.staff[role] = actor(role === 'cook' ? 1.1 : 5.2, 4.4);
  return { ok: true };
}
function chooseRequest(game, slot) {
  const s = game.state.shop;
  // Fresh customers help the current main/rush order, not an impossible random menu.
  const active = game.contract?.status === 'active' ? game.contract : null;
  const wants = active?.wants || game.order.wants, progress = active?.progress || game.state.orderProgress;
  const pending = Object.keys(wants).filter(item => (progress[item] || 0) < wants[item] && SHOP_RECIPES[item]?.unlock <= game.unlockLevel);
  if (pending.length) return pending[(s.nextCustomerId + slot) % pending.length];
  const stocked = Object.keys(s.counter).filter(item => s.counter[item] > 0);
  const menu = stocked.length ? stocked : [s.selected];
  return menu[(s.nextCustomerId + slot) % menu.length];
}
function planStaff(game, role, a) {
  const s = game.state.shop, waiting = s.customers.filter(c => !c.cooldown);
  if (a.task) return;
  if (role === 'server') {
    const c = waiting.find(c => a.holding ? c.item === a.holding : s.counter[c.item] > 0);
    if (c) a.task = a.holding ? { kind: 'serve', customer: c.id } : { kind: 'pickup', item: c.item, customer: c.id };
    else if (a.holding && counterUsed(s) < COUNTER_CAPACITY) a.task = { kind: 'return' };
  } else if (counterUsed(s) < COUNTER_CAPACITY) {
    const c = waiting.find(c => {
      const demand = waiting.filter(other => other.item === c.item).length;
      const carried = [s.player, s.staff.server].filter(a => a?.holding === c.item).length;
      return (s.counter[c.item] || 0) + carried < demand;
    });
    if (c) a.task = { kind: 'cook', item: c.item };
  }
}
function updateActor(game, a, dt) {
  const s = game.state.shop, task = a.task;
  if (!task) return;
  const customer = task.customer === undefined ? null : s.customers.find(c => c.id === task.customer && !c.cooldown);
  if (task.kind === 'serve' && !customer) { a.task = null; return; }
  const target = task.kind === 'cook' ? { x: a === s.staff.cook ? 1.3 : SHOP_POINTS.kitchen.x, y: SHOP_POINTS.kitchen.y } : task.kind === 'walk' ? task : task.kind === 'serve' ? { x: 6.55, y: customerY(customer.slot) } : SHOP_POINTS.rack;
  const dx = target.x - a.x, dy = target.y - a.y, distance = Math.hypot(dx, dy), speed = 2.4;
  if (Math.abs(dx) > .01) a.facing = dx < 0 ? -1 : 1;
  if (distance > .01) { const move = Math.min(distance, speed * dt); a.x += dx / distance * move; a.y += dy / distance * move; return; }
  a.x = target.x; a.y = target.y;
  if (task.kind === 'cook') {
    const duration = cookSeconds(task.item, a === s.staff.cook ? 'cook' : 'player');
    a.work = Math.min(duration, a.work + dt);
    if (a.work + 1e-8 < duration || counterUsed(s) >= COUNTER_CAPACITY) return;
    s.counter[task.item] = (s.counter[task.item] || 0) + 1; s.cooked++;
  } else if (task.kind === 'pickup') {
    if (s.counter[task.item] > 0 && !a.holding) {
      s.counter[task.item]--; a.holding = task.item;
      if (customer) { a.task = { kind: 'serve', customer: customer.id }; return; }
    }
  } else if (task.kind === 'return') {
    if (a.holding) {
      if (counterUsed(s) >= COUNTER_CAPACITY) return;
      s.counter[a.holding] = (s.counter[a.holding] || 0) + 1; a.holding = null;
    }
  } else if (task.kind === 'serve' && a.holding === customer.item) {
    game.deliver(a.holding, { x: 7.65, y: customerY(customer.slot) - .5 });
    a.holding = null; s.served++; customer.cooldown = 5;
  }
  a.task = null; a.work = 0;
}
export function updateShop(game, dt) {
  const s = game.state.shop;
  if (!s) return;
  for (const c of s.customers) if (c.cooldown > 0) {
    c.cooldown = Math.max(0, c.cooldown - dt);
    if (c.cooldown < 1e-8) { c.cooldown = 0; c.id = s.nextCustomerId++; c.item = chooseRequest(game, c.slot); }
  }
  updateActor(game, s.player, dt);
  for (const role of ['cook', 'server']) if (s.staff[role]) { planStaff(game, role, s.staff[role]); updateActor(game, s.staff[role], dt); }
}
export function validShop(s, state) {
  if (s === null) return true; // Explicit isolated conveyor practice, never a migrated real save.
  const integer = (n, max = 1e12) => Number.isSafeInteger(n) && n >= 0 && n <= max;
  const finite = (n, min, max) => Number.isFinite(n) && n >= min && n <= max;
  const food = item => Object.hasOwn(SHOP_RECIPES, item) && SHOP_RECIPES[item].unlock <= Math.min(2, state.orderIndex);
  if (!s || s.version !== 1 || typeof s.legacy !== 'boolean' || !integer(s.served) || s.served > state.totalSold || !integer(s.cooked) || !food(s.selected) || !integer(s.nextCustomerId) || s.nextCustomerId < 4) return false;
  if (!s.counter || Array.isArray(s.counter) || typeof s.counter !== 'object' || Object.entries(s.counter).some(([item, n]) => !food(item) || !integer(n, COUNTER_CAPACITY)) || counterUsed(s) > COUNTER_CAPACITY) return false;
  if (!s.staff || Object.keys(s.staff).length !== 2 || !Object.keys(STAFF).every(role => Object.hasOwn(s.staff, role))) return false;
  const validActor = (a, role = 'player') => {
    if (!a || !finite(a.x, .7, 7) || !finite(a.y, 2.5, 5.4) || ![-1, 1].includes(a.facing) || !(a.holding === null || food(a.holding)) || !finite(a.work, 0, 9.6 + 1e-8)) return false;
    const t = a.task;
    if (t === null) return a.work === 0;
    if (!t || typeof t !== 'object' || Array.isArray(t) || !['walk', 'cook', 'pickup', 'serve', 'return'].includes(t.kind)) return false;
    if (t.kind !== 'cook' && a.work !== 0) return false;
    if (t.kind === 'walk') return finite(t.x, .8, 6.8) && finite(t.y, 2.6, 5.25);
    if (t.kind === 'cook') return food(t.item) && a.holding === null && a.work <= cookSeconds(t.item, role);
    if (t.kind === 'pickup') return food(t.item) && a.holding === null && (t.customer === undefined || integer(t.customer, s.nextCustomerId - 1));
    if (t.kind === 'serve') return food(a.holding) && integer(t.customer, s.nextCustomerId - 1);
    return t.kind === 'return' && food(a.holding);
  };
  if (!validActor(s.player) || Object.entries(s.staff).some(([role, a]) => a !== null && (!validActor(a, role) || (!s.legacy && s.served < STAFF[role].served)))) return false;
  if (s.staff.cook && (s.staff.cook.holding !== null || (s.staff.cook.task && s.staff.cook.task.kind !== 'cook'))) return false;
  if (s.staff.server?.task && !['pickup', 'serve', 'return'].includes(s.staff.server.task.kind)) return false;
  if (!Array.isArray(s.customers) || s.customers.length !== 3) return false;
  const ids = new Set();
  return s.customers.every((c, slot) => c && c.slot === slot && integer(c.id, s.nextCustomerId - 1) && c.id > 0 && !ids.has(c.id) && ids.add(c.id) && food(c.item) && finite(c.cooldown, 0, 5));
}
