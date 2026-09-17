// Read-only compatibility definitions for validating v0.10 storefront saves.
// No player, staff or customer simulation runs in the restored factory game.
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
export const counterUsed = shop => Object.values(shop.counter).reduce((sum, n) => sum + n, 0);
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
