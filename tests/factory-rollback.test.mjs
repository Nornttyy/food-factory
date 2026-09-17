import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { FactoryGame, BUILDINGS, ITEMS } from '../src/factory-core.js';

// Captured from the released v0.10 simulation before restoring classic gameplay.
const fixtures = JSON.parse(await readFile(new URL('./fixtures/cat-v010-saves.json', import.meta.url), 'utf8'));
const fixture = name => structuredClone(fixtures[name]);
const restore = save => { const g = new FactoryGame(); assert.equal(g.restore(JSON.stringify(save)), true); return g; };
const roundTrip = game => {
  const saved = game.serialize(), next = restore(JSON.parse(saved));
  assert.equal(next.serialize(), saved, 'migration, refunds and gifts must run only once');
  return next;
};
const run = (game, seconds) => { for (let n = 0; n < seconds * 10; n++) game.update(.1); };

test('classic defaults restore automatic production, original prices and starter kit', () => {
  const g = new FactoryGame();
  assert.equal(g.state.coins, 450); assert.equal(g.state.buildings.length, 8);
  assert.equal(g.state.shop, undefined); assert.equal(g.order.reward, 380);
  assert.deepEqual(['belt', 'splitter', 'merger', 'depot'].map(k => BUILDINGS[k].cost), [8, 35, 25, 60]);
  assert.equal(ITEMS.bread.value, 12); run(g, 30);
  assert.ok(g.state.totalSold >= 4); assert.equal(g.orderReady, true);
});
test('zero-coin cat save becomes a working free starter factory only once', () => {
  const g = restore(fixture('fresh'));
  assert.equal(g.state.coins, 450); assert.equal(g.state.shop, undefined);
  assert.equal(g.state.buildings.length, 8); assert.ok(g.state.buildings.every(b => b.gifted));
  assert.equal(Object.values(g.state.stock).reduce((a, b) => a + b, 0), 0);
  roundTrip(g); run(g, 30); assert.ok(g.state.totalSold >= 4);
});
test('counter meals, held meals and staff are credited once without recording sales', () => {
  const s = fixture('working'), g = restore(s);
  assert.equal(g.state.coins, 1096);
  assert.equal(g.state.totalSold, s.totalSold); assert.deepEqual(g.state.delivered, s.delivered);
  assert.deepEqual(g.state.orderProgress, s.orderProgress);
  assert.deepEqual(g.state.career.contract, s.career.contract);
  assert.equal(g.contract.reward, 30); assert.equal(g.contract.deadline, 120); roundTrip(g);
});
test('compensation uses saved packaging research and adds after the startup floor', () => {
  const s = fixture('working'); s.coins = 0; s.career.research.value = 3;
  const g = restore(s);
  assert.equal(g.state.coins, 450 + 320 + 4 * 16 + 3 * 21); roundTrip(g);
});
test('existing cat factory layout, full warehouse and high-price receipts survive rollback', () => {
  const s = fixture('line'), g = restore(s);
  const geometry = game => game.state.buildings.map(({ type, x, y, dir, paid }) => ({ type, x, y, dir, paid }));
  assert.deepEqual(geometry(g), s.buildings.map(({ type, x, y, dir, paid }) => ({ type, x, y, dir, paid })));
  assert.deepEqual(g.state.business, s.business); assert.equal(g.warehouseUsed, 100);
  assert.deepEqual(g.state.stock, { belt: 4, flour_hopper: 1, dough_mixer: 1, bread_oven: 1, depot: 1 });
  const reloaded = roundTrip(g), before = reloaded.state.coins;
  for (const b of [...reloaded.state.buildings]) {
    const wallet = reloaded.state.coins;
    assert.equal(reloaded.remove(b.id).ok, true); assert.equal(reloaded.state.coins, wallet + b.paid);
    assert.equal(reloaded.remove(b.id).ok, false); assert.equal(reloaded.state.coins, wallet + b.paid);
  }
  assert.equal(reloaded.state.coins, before + 575); roundTrip(reloaded);
});
test('original factories do not receive duplicate starter money or equipment', () => {
  const s = fixture('legacy'); s.coins = 10;
  const g = restore(s); assert.equal(g.state.coins, 34);
  assert.equal(g.state.buildings.length, 8); assert.deepEqual(g.state.stock, s.stock); roundTrip(g);
  const partiallyRecovered = fixture('fresh'); partiallyRecovered.stock = { belt: 4, flour_hopper: 1 };
  const recovered = restore(partiallyRecovered);
  assert.equal(recovered.state.buildings.length, 8);
  assert.ok(Object.values(recovered.state.stock).every(n => n === 0)); roundTrip(recovered);
});
test('only fully cooked blocked work is credited, with pause and timing preserved', () => {
  const s = fixture('cooking'), g = restore(s);
  assert.equal(g.state.coins, 450); assert.equal(g.state.paused, true); assert.equal(g.state.time, s.time);
  s.shop.player.work = 3;
  const finished = restore(s); assert.equal(finished.state.coins, 462); roundTrip(finished);
  const cook = fixture('working'); cook.shop.staff.cook.task = { kind: 'cook', item: 'bread' }; cook.shop.staff.cook.work = 3 * 1.6;
  assert.equal(restore(cook).state.coins, 1108);
});
test('accepted cat main order keeps its reward and following orders use classic economics', () => {
  const g = restore(fixture('fresh')); g.state.orderProgress = { bread: 4 };
  assert.equal(g.order.reward, 38); const wallet = g.state.coins;
  assert.equal(g.claimOrder().ok, true); assert.equal(g.state.coins, wallet + 38);
  assert.equal(g.state.orderCatalog, 2); assert.equal(g.order.reward, 420);
  assert.equal(g.claimOrder().ok, false); roundTrip(g);
});
test('active, ready and expired cat rush contracts retain their original terms', () => {
  for (const status of ['active', 'ready', 'expired']) {
    const s = fixture('working'); s.career.contract.status = status;
    if (status === 'ready') s.career.contract.progress = { bread: 6 };
    if (status === 'expired') s.time = 120;
    const g = roundTrip(restore(s));
    assert.equal(g.contract.status, status); assert.equal(g.contract.reward, 30); assert.equal(g.contract.duration, 120);
    if (status === 'ready') {
      const wallet = g.state.coins; assert.equal(g.claimContract().ok, true);
      assert.equal(g.state.coins, wallet + 30); assert.equal(g.claimContract().ok, false);
    } else if (status === 'active') assert.equal(g.cancelContract().ok, true);
    assert.equal(g.acceptContract(0).ok, true);
    assert.equal(g.state.career.catalog, 1); assert.equal(g.contract.duration, 60); assert.equal(g.contract.reward, 120);
    roundTrip(g);
  }
});
test('invalid cat data or excessive historic payments cannot replace a live factory', () => {
  const live = new FactoryGame(), before = live.serialize();
  for (const mutate of [s => s.shop.counter.bread = 25, s => s.shop.staff.cook.work = 100,
    s => s.shop.player.holding = 'orange_icepop', s => s.shop.customers[0].id = 99,
    s => s.shop.legacy = 'yes', s => s.stock.belt = 5, s => s.career.catalog = 3]) {
    const s = fixture('working'); mutate(s);
    assert.equal(live.restore(JSON.stringify(s)), false); assert.equal(live.serialize(), before);
  }
  const line = fixture('line'); line.buildings[0].paid = 36;
  assert.equal(live.restore(JSON.stringify(line)), false); assert.equal(live.serialize(), before);
});
test('null or absent storefronts preserve ordinary empty factories without compensation', () => {
  for (const shop of [null, undefined]) {
    const s = fixture('fresh'); s.shop = shop;
    const g = restore(s); assert.equal(g.state.coins, 0); assert.equal(g.state.buildings.length, 0);
    assert.deepEqual(g.state.stock, {}); roundTrip(g);
  }
});
