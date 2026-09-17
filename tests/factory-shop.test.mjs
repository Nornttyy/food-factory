import test from 'node:test';
import assert from 'node:assert/strict';
import { FactoryGame, BUILDINGS, ITEMS, orderFor } from '../src/factory-core.js';
import { COUNTER_CAPACITY, counterUsed, SHOP_RECIPES } from '../src/factory-shop.js';
import { CAT_BONES, catPose, resolveCatBones, drawCat } from '../src/factory-cat-rig.js';
import { FactoryRenderer } from '../src/factory-renderer.js';
import { readFile } from 'node:fs/promises';

const run = (g, seconds) => { for (let n = 0; n < Math.round(seconds * 10); n++) g.update(.1); };
function serveBread(g) {
  assert.equal(g.shopAction('cook', 'bread').ok, true); run(g, 6);
  const c = g.state.shop.customers.find(c => !c.cooldown && c.item === 'bread');
  assert.ok(c); assert.equal(g.shopAction('serve', c.id).ok, true); run(g, 4);
}
function mature() {
  const g = new FactoryGame(); g.state.shop.served = 24; g.state.totalSold = 24; g.state.coins = 20000; return g;
}

test('cat starts at zero with no gifted automation and never earns by waiting', () => {
  const g = new FactoryGame();
  assert.equal(g.state.coins, 0); assert.equal(g.state.buildings.length, 0); assert.deepEqual(g.state.stock, {});
  assert.equal(g.state.shop.player.holding, null); assert.equal(g.state.orderCatalog, 3);
  run(g, 600); assert.equal(g.state.coins, 0); assert.equal(g.state.totalSold, 0); assert.equal(counterUsed(g.state.shop), 0);
  assert.equal(g.place('belt', 0, 0).ok, false); assert.equal(g.hire('server').ok, false);
});
test('manual cooking creates one physical meal, never coins; actual delivery pays once', () => {
  const g = new FactoryGame(); assert.equal(g.shopAction('cook').ok, true);
  for (let n = 0; n < 100; n++) assert.equal(g.shopAction('cook').ok, false);
  run(g, 5); assert.equal(g.state.shop.counter.bread, 1); assert.equal(g.state.coins, 0);
  assert.equal(g.shopAction('pickup').ok, true); run(g, 2);
  assert.equal(g.state.shop.player.holding, 'bread'); assert.equal(g.state.shop.counter.bread, 0);
  assert.equal(g.shopAction('cook').ok, false); assert.equal(g.shopAction('serve', 1).ok, true);
  const pending = new FactoryGame(); assert.equal(pending.restore(g.serialize()), true);
  run(g, 2); run(pending, 2); assert.equal(g.state.coins, 4); assert.equal(pending.state.coins, 4);
  assert.equal(g.state.shop.player.holding, null); assert.equal(g.state.shop.served, 1);
  assert.equal(g.state.orderProgress.bread, 1); assert.equal(g.shopAction('serve', 1).ok, false);
  run(g, 10); assert.equal(g.state.coins, 4);
});
test('six paying customers unlock construction, with reduced early order reward', () => {
  const g = new FactoryGame();
  for (let n = 0; n < 6; n++) { serveBread(g); assert.equal(g.automationReady, n >= 5); }
  assert.equal(g.state.coins, 24); assert.equal(g.order.reward, 38); assert.equal(g.claimOrder().ok, true);
  assert.equal(g.state.coins, 62); assert.equal(g.place('belt', 0, 0).ok, true); assert.equal(g.state.coins, 27);
  assert.equal(g.remove(g.at(0, 0).id).refund, 35); assert.equal(g.state.coins, 62);
  g.state.coins = 0; assert.equal(g.shopAction('cook', 'bread').ok, true); run(g, 6); assert.ok(g.state.shop.counter.bread);
});
test('food prices fall, every logistics price rises, new bonuses stay bounded', () => {
  const oldFoods = [12, 16, 18, 26, 18, 20, 32, 34];
  Object.keys(SHOP_RECIPES).forEach((item, i) => assert.ok(ITEMS[item].value < oldFoods[i]));
  for (const [type, old] of Object.entries({ belt: 8, splitter: 35, merger: 25, depot: 60 })) assert.ok(BUILDINGS[type].cost > old);
  for (let n = 0; n < 100; n++) assert.equal(orderFor(n, 3).reward, Math.round(orderFor(n, 2).reward / 10));
  assert.equal(new FactoryGame().offers[0].reward, 30);
});
test('all eight hand recipes cook, are carried, and satisfy actual customer requests', () => {
  for (const item of Object.keys(SHOP_RECIPES)) {
    const g = new FactoryGame(); g.state.orderIndex = 2; g.state.shop.customers[0].item = item;
    assert.equal(g.shopAction('cook', item).ok, true); run(g, 8);
    assert.equal(g.state.shop.counter[item], 1); assert.equal(g.shopAction('serve', 1).ok, true); run(g, 4);
    assert.equal(g.state.coins, ITEMS[item].value); assert.equal(g.state.delivered[item], 1);
    assert.equal(new FactoryGame().restore(g.serialize()), true, item);
  }
});
test('unknown/prototype recipes and locked food cannot create unrestorable tasks', () => {
  const g = new FactoryGame(), before = g.serialize();
  for (const item of ['constructor', '__proto__', 'toString', 'flour', 'strawberry_cake', null]) {
    if (item === null) continue;
    assert.equal(g.shopAction('cook', item).ok, false); assert.equal(g.shopAction('pickup', item).ok, false);
  }
  assert.equal(g.serialize(), before);
});
test('full mismatched counter and full warehouse can be recovered at zero coins', () => {
  const g = new FactoryGame(); g.state.shop.counter.butter_cookie = COUNTER_CAPACITY; g.state.business.warehouse.butter_cookie = 100;
  assert.equal(g.shopAction('cook', 'bread').ok, false); assert.equal(g.shopAction('pickup', 'butter_cookie').ok, true); run(g, 2);
  assert.equal(g.shopAction('serve', 1).ok, false); assert.equal(g.shopAction('cook', 'bread').ok, false);
  assert.equal(g.shopAction('discard').ok, true); assert.equal(g.state.shop.player.holding, null);
  assert.equal(g.shopAction('cook', 'bread').ok, true); run(g, 6);
  assert.equal(g.shopAction('serve', 1).ok, true); run(g, 4); assert.equal(g.state.coins, 4);
  assert.equal(g.state.business.warehouse.butter_cookie, 100);
});
test('a completed cooking job waits intact for counter space', () => {
  const g = new FactoryGame(); g.state.shop.counter.bread = 23;
  g.shopAction('cook'); g.state.shop.counter.bread = 24; run(g, 8);
  assert.equal(g.state.shop.player.work, 3); assert.equal(g.state.shop.player.task.kind, 'cook'); assert.equal(g.state.shop.cooked, 0);
  g.shopAction('discard'); g.update(.1); assert.equal(counterUsed(g.state.shop), 24); assert.equal(g.state.shop.cooked, 1);
  assert.equal(g.state.shop.player.task, null); assert.equal(new FactoryGame().restore(g.serialize()), true);
});
test('multiple retail depots reserve one shared counter slot and do not award cash', () => {
  const g = mature(); g.state.shop.counter.bread = 23;
  const a = g.place('belt', 0, 0).building, b = g.place('belt', 0, 1).building;
  g.place('depot', 1, 0); g.place('depot', 1, 1); a.output = b.output = 'bread';
  const wallet = g.state.coins; g.update(.1);
  assert.equal(counterUsed(g.state.shop), 24); assert.equal(Number(Boolean(a.output)) + Number(Boolean(b.output)), 1);
  assert.equal(g.state.coins, wallet); assert.equal(g.state.totalSold, 24);
  run(g, 10); assert.equal(counterUsed(g.state.shop), 24); assert.equal(g.state.coins, wallet);
});
test('warehouse food goes to counter instead of an instant sale and wholesale is gated', () => {
  const g = new FactoryGame(); g.state.business.warehouse.bread = 12;
  const offer = g.wholesaleOffers[0]; assert.equal(g.shipWholesale(offer.id).ok, false);
  assert.equal(g.sellWarehouse('bread', 10).ok, true); assert.equal(g.state.coins, 0);
  assert.equal(g.state.business.warehouse.bread, 2); assert.equal(g.state.shop.counter.bread, 10); assert.equal(g.state.totalSold, 0);
  g.state.shop.counter.bread = 24; const before = g.serialize(); assert.equal(g.sellWarehouse('bread', 1).ok, false); assert.equal(g.serialize(), before);
});
test('hiring is gated, paid only once and both staff physically cook and serve', () => {
  const g = new FactoryGame(); g.state.coins = 500;
  assert.equal(g.hire('server').ok, false); g.state.shop.served = g.state.totalSold = 12;
  assert.equal(g.hire('server').ok, true); assert.equal(g.state.coins, 380); assert.equal(g.hire('server').ok, false);
  assert.equal(g.hire('cook').ok, false); g.state.shop.served = g.state.totalSold = 24;
  assert.equal(g.hire('cook').ok, true); assert.equal(g.state.coins, 180);
  run(g, 100); assert.ok(g.state.shop.served > 30); assert.ok(g.state.shop.cooked > 5); assert.ok(g.state.coins > 180);
  assert.equal(new FactoryGame().restore(g.serialize()), true);
});
test('player and server cannot double-pick or double-pay a single customer', () => {
  const g = mature(); g.hire('server'); const s = g.state.shop;
  s.counter.bread = 1; s.player.x = s.staff.server.x = 4.4; s.player.y = s.staff.server.y = 2.8;
  g.shopAction('serve', 1); const wallet = g.state.coins, served = s.served;
  run(g, 5); assert.equal(g.state.coins, wallet + 4); assert.equal(s.served, served + 1);
  assert.equal(counterUsed(s), 0); assert.equal(s.player.holding, null); assert.equal(s.staff.server.holding, null);
});
test('stale delivery targets retain the carried food instead of selling or losing it', () => {
  const g = mature(); g.hire('server'); const s = g.state.shop;
  s.customers[1].item = s.customers[2].item = 'butter_cookie';
  s.counter.bread = 2; s.player.x = s.staff.server.x = 4.4; s.player.y = s.staff.server.y = 2.8;
  g.shopAction('serve', 1); const wallet = g.state.coins;
  run(g, 2); assert.equal(g.state.coins, wallet + 4);
  assert.equal(counterUsed(s) + Number(Boolean(s.player.holding)) + Number(Boolean(s.staff.server.holding)), 1);
  assert.equal(new FactoryGame().restore(g.serialize()), true);
});
test('pause and save during cooking, carrying and serving cannot replay rewards', () => {
  const g = new FactoryGame(); g.shopAction('cook'); run(g, 2);
  const loaded = new FactoryGame(); assert.equal(loaded.restore(g.serialize()), true); run(g, 5); run(loaded, 5);
  assert.deepEqual(g.state.shop.counter, loaded.state.shop.counter);
  g.shopAction('serve', 1); run(g, .7); g.state.paused = true;
  const before = g.serialize(); run(g, 40); assert.equal(g.serialize(), before); assert.equal(g.shopAction('discard').ok, false);
  assert.equal(loaded.restore(before), true); loaded.state.paused = false; run(loaded, 5); assert.equal(loaded.state.coins, 4);
  const again = new FactoryGame(); assert.equal(again.restore(loaded.serialize()), true); run(again, 30); assert.equal(again.state.coins, 4);
});
test('legacy factories retain coins, paid refunds, accepted orders and rush deadlines', () => {
  const old = new FactoryGame({ shop: false }); const b = old.place('belt', 0, 0).building; b.paid = 8;
  old.acceptContract(0); const data = JSON.parse(old.serialize()); delete data.shop; delete data.career.catalog;
  data.career.contract.deadline = data.career.contract.startedAt + 60;
  const g = new FactoryGame(); assert.equal(g.restore(JSON.stringify(data)), true);
  assert.equal(g.state.coins, data.coins); assert.equal(g.state.buildings.length, 9); assert.equal(g.state.shop.legacy, true);
  assert.equal(g.automationReady, true); assert.equal(g.contract.deadline, 60); assert.equal(g.contract.reward, 120);
  assert.equal(g.order.reward, 380); assert.equal(g.remove(b.id).refund, 8);
  g.state.orderProgress.bread = 4; g.claimOrder(); assert.equal(g.state.orderCatalog, 3); assert.equal(g.order.reward, 42);
  g.cancelContract(); g.acceptContract(0); assert.equal(g.contract.deadline - g.contract.startedAt, 180);
  assert.equal(new FactoryGame().restore(g.serialize()), true);
});
test('malformed storefront states reject atomically, including unsupported staff tasks', () => {
  const g = mature(); g.hire('cook'); g.hire('server'); const base = g.serialize();
  for (const change of [s => s.shop.counter.bread = 25, s => s.shop.counter.constructor = 1, s => s.shop.player.x = -100,
    s => s.shop.player.holding = 'flour', s => s.shop.player.work = -1, s => s.shop.selected = 'constructor',
    s => s.shop.customers[1].id = s.shop.customers[0].id, s => s.shop.customers[0].cooldown = -1,
    s => s.shop.served = s.totalSold + 1, s => s.shop.staff.extra = null, s => s.shop.staff.cook.holding = 'bread',
    s => s.shop.staff.server.task = { kind: 'cook', item: 'bread' }, s => s.shop.player.task = { kind: 'teleport' }]) {
    const data = JSON.parse(base); change(data); assert.equal(g.restore(JSON.stringify(data)), false); assert.equal(g.serialize(), base);
  }
});
test('mixed staff/player commands stay restorable and bounded after every tick', () => {
  const g = mature(); g.hire('cook'); g.hire('server'); let seed = 113;
  for (let n = 0; n < 1500; n++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    if (n % 9 === 0) { const choice = seed % 5; if (choice === 0) g.shopAction('cook'); if (choice === 1) g.shopAction('pickup'); if (choice === 2) g.shopAction('serve', g.state.shop.customers[seed % 3].id); if (choice === 3) g.shopAction('walk', { x: seed % 6 + .8, y: 4 }); if (choice === 4) g.shopAction('discard'); }
    g.update(.1); assert.ok(counterUsed(g.state.shop) <= COUNTER_CAPACITY); assert.equal(new FactoryGame().restore(g.serialize()), true, `tick ${n}`);
  }
});
test('cat rig has independent upper/lower limbs and inherited elbow/knee transforms', async () => {
  const bones = new Map(CAT_BONES.map(b => [b[0], b]));
  assert.equal(bones.get('fore_l')[1], 'upper_l'); assert.equal(bones.get('shin_r')[1], 'thigh_r'); assert.equal(bones.get('face')[1], 'head');
  const a = resolveCatBones(catPose(0)), b = resolveCatBones({ ...catPose(0), upper_l: 1 });
  assert.notDeepEqual(a.fore_l, b.fore_l); assert.deepEqual(a.head, b.head);
  assert.ok(Math.abs(Math.hypot(b.fore_l.x - b.upper_l.x, b.fore_l.y - b.upper_l.y) - 11) < 1e-8);
  assert.deepEqual(catPose(1, 'walk', true), catPose(100, 'walk', true));
  const manifest = JSON.parse(await readFile(new URL('../assets/generated/factory/cream-v1/manifest.json', import.meta.url), 'utf8'));
  assert.equal(manifest.sprites.filter(s => s.category === 'rig').length, 12);
  const drawn = [], ctx = new Proxy({}, { get: (target, key) => target[key] || (() => {}), set: (target, key, value) => { target[key] = value; return true; } });
  drawCat(ctx, { draw: (_, id) => drawn.push(id) }, 200, 300, { holding: 'bread', facing: 1, task: { kind: 'serve' } }, 2);
  assert.ok(drawn.includes('cat_fore_l')); assert.ok(drawn.includes('cat_shin_r')); assert.equal(drawn.at(-1), 'bread');
});
test('storefront input coordinates fit phone/desktop without modifying factory camera', () => {
  const beforeWindow = globalThis.window; globalThis.window = { devicePixelRatio: 2 };
  try {
    for (const [width, height] of [[1280, 720], [852, 393], [390, 844]]) {
      const canvas = { getContext: () => ({}), getBoundingClientRect: () => ({ left: 10, top: 20, width, height }) };
      const r = new FactoryRenderer(canvas, {}); r.camera.x = 1500; r.camera.zoom = 1.4; r.resize([40, 24], { scene: 'shop' });
      const t = r.transform, point = r.shopPointAt(10 + t.x + 7.85 * 72 * t.scale, 20 + t.y + 2.7 * 72 * t.scale);
      assert.ok(Math.abs(point.x - 7.85) < 1e-8); assert.ok(Math.abs(point.y - 2.7) < 1e-8);
      assert.equal(r.camera.x, 1500); assert.equal(r.camera.zoom, 1.4);
    }
  } finally { if (beforeWindow === undefined) delete globalThis.window; else globalThis.window = beforeWindow; }
});
