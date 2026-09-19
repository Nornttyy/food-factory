import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CafeFactoryGame, STAFF_COSTS, DELIVERY_SECONDS, shelfCapacity } from '../src/factory-service.js';
import { FactoryGame, ITEMS, FOOD_RECIPES } from '../src/factory-core.js';
import { drawCat } from '../src/factory-service-view.js';
import { validateFactoryAssets } from '../scripts/validate-factory-assets.mjs';

const advance = (game, seconds) => { for (let i = 0; i < Math.round(seconds * 10); i++) game.update(.1); };
const stable = game => { const state = JSON.parse(game.serialize()); for (const b of state.buildings) { delete b.blocked; delete b.idle; } return state; };
function serveOne(game) {
  const c = game.service.customers.find(c => !c.cooldown && !game.reserved(c.id) && game.findShelf(c.want));
  return c && game.serveFromShelf(game.findShelf(c.want).id, c.want, c.id);
}
function unlockStaff(game) {
  for (let i = 0; i < 600 && game.service.served < 4; i++) { game.update(.1); serveOne(game); }
  assert.equal(game.service.served, 4);
}

test('live starter fills a finite shelf without coins, automatic sales or employees', () => {
  const game = new CafeFactoryGame(), coins = game.state.coins, rack = game.at(8, 2);
  advance(game, 120);
  assert.equal(game.state.coins, coins); assert.equal(game.state.totalSold, 0); assert.equal(game.orderReady, false);
  assert.equal(game.service.workers.length, 0); assert.equal(game.service.customers.length, 3);
  assert.equal(rack.goods.length, 8); assert.ok(game.at(7, 2).output, 'upstream food waits when the shelf is full');
  assert.equal(game.canReceive(rack, 'bread'), false); assert.equal(game.remove(rack.id).ok, false);
  const before = game.serialize(); advance(game, 20); assert.equal(rack.goods.length, 8); assert.equal(game.state.totalSold, 0);
  const restored = new CafeFactoryGame(); assert.equal(restored.restore(before), true);
});

test('a matching manual delivery pays exactly once and advances ordinary and rush orders', () => {
  const game = new CafeFactoryGame(); game.acceptContract(0); advance(game, 20);
  const rack = game.at(8, 2), customer = game.service.customers[0], coins = game.state.coins, n = rack.goods.length;
  assert.equal(game.serveFromShelf(rack.id, 'bread', customer.id).ok, true);
  assert.equal(game.state.coins, coins + ITEMS.bread.value); assert.equal(rack.goods.length, n - 1);
  assert.equal(game.state.totalSold, 1); assert.equal(game.service.served, 1); assert.equal(game.state.orderProgress.bread, 1);
  assert.equal(game.state.career.contract.progress.bread, 1);
  const after = game.serialize(); assert.equal(game.serveFromShelf(rack.id, 'bread', customer.id).ok, false); assert.equal(game.serialize(), after);
  advance(game, 2); assert.notEqual(game.service.customers[0].id, customer.id);
});

test('wrong foods, vanished customers, nonexistent shelves and pauses cannot consume food', () => {
  const game = new CafeFactoryGame(); advance(game, 20);
  const rack = game.at(8, 2), c = game.service.customers[0]; c.want = 'butter_cookie';
  for (const args of [[rack.id, 'bread', c.id], [rack.id, 'flour', c.id], [rack.id, 'bread', 999], [999, 'bread', c.id]]) {
    const before = game.serialize(); assert.equal(game.serveFromShelf(...args).ok, false); assert.equal(game.serialize(), before);
  }
  game.state.paused = true; const before = game.serialize();
  assert.equal(game.serveFromShelf(rack.id, 'bread', c.id).ok, false); advance(game, 30); assert.equal(game.serialize(), before);
});

test('shelf upgrades retain food and grow capacity; newly placed shelves round-trip immediately', () => {
  const game = new CafeFactoryGame(); advance(game, 100); const rack = game.at(8, 2);
  assert.equal(game.upgrade(rack.id).ok, true); assert.equal(shelfCapacity(rack), 12); assert.equal(rack.goods.length, 8);
  advance(game, 25); assert.equal(rack.goods.length, 12);
  assert.equal(game.upgrade(rack.id).ok, true); assert.equal(shelfCapacity(rack), 16); advance(game, 25); assert.equal(rack.goods.length, 16);
  const added = game.place('depot', 9, 3, 0); assert.equal(added.ok, true); assert.deepEqual(added.building.goods, []);
  const restored = new CafeFactoryGame(); assert.equal(restored.restore(game.serialize()), true); assert.deepEqual(stable(restored), stable(game));
});

test('shelving still waits the full initial two seconds and never sells in old sell/store modes', () => {
  for (const mode of ['sell', 'store']) {
    const old = new FactoryGame(); const b = old.at(8, 2); b.mode = mode; b.input = 'bread'; b.progress = 0;
    const game = new CafeFactoryGame(); assert.equal(game.restore(old.serialize()), true);
    advance(game, 1.9); assert.equal(game.at(8, 2).goods.length, 0); advance(game, .1);
    assert.deepEqual(game.at(8, 2).goods, ['bread']); assert.equal(game.state.totalSold, 0); assert.equal(game.warehouseUsed, 0);
    assert.equal(game.at(8, 2).mode, undefined); assert.equal(game.setDepotMode(b.id, 'sell').ok, false);
  }
});

test('staff recruitment requires four deliveries, deducts increasing prices once and caps at three', () => {
  const game = new CafeFactoryGame(); assert.equal(game.recruit().ok, false); unlockStaff(game);
  game.state.coins = 1000;
  for (const cost of STAFF_COSTS) { const before = game.state.coins; assert.equal(game.recruit().ok, true); assert.equal(game.state.coins, before - cost); }
  const before = game.serialize(); assert.equal(game.recruit().ok, false); assert.equal(game.serialize(), before);
  const poor = new CafeFactoryGame(); unlockStaff(poor); poor.state.coins = 119;
  assert.equal(poor.recruit().ok, false); assert.equal(poor.service.workers.length, 0);
});

test('workers reserve distinct customers, carry one meal and pay only after four seconds', () => {
  const game = new CafeFactoryGame(); unlockStaff(game); game.state.coins = 1000;
  advance(game, 50); for (let i = 0; i < 3; i++) assert.equal(game.recruit().ok, true);
  const rack = game.at(8, 2), startStock = rack.goods.length, coins = game.state.coins;
  advance(game, .1); assert.equal(rack.goods.length, startStock - 3);
  const jobs = game.service.workers.map(w => w.job); assert.equal(new Set(jobs.map(j => j.customerId)).size, 3);
  assert.ok(jobs.every(j => j.remaining === DELIVERY_SECONDS)); assert.equal(game.state.coins, coins);
  assert.equal(game.serveFromShelf(rack.id, 'bread', jobs[0].customerId).ok, false);
  advance(game, 3.9); assert.equal(game.state.coins, coins); advance(game, .1);
  assert.equal(game.state.coins, coins + 18); assert.equal(game.service.served, 7);
  assert.ok(game.service.workers.every(w => w.job === null));
});

test('in-flight delivery, paused time and pending shelf items survive save/resume without a second payout', () => {
  const game = new CafeFactoryGame(); unlockStaff(game); advance(game, 20); game.recruit(); advance(game, 1.1);
  assert.ok(game.service.workers[0].job);
  game.state.paused = true; const saved = game.serialize(); const restored = new CafeFactoryGame(); assert.equal(restored.restore(saved), true);
  const frozen = restored.serialize(); advance(restored, 10); assert.equal(restored.serialize(), frozen); assert.deepEqual(restored.service, game.service);
  game.state.paused = restored.state.paused = false;
  advance(game, 2.9); advance(restored, 2.9); assert.deepEqual(stable(restored), stable(game));
  advance(game, .1); advance(restored, .1); assert.deepEqual(stable(restored), stable(game)); assert.equal(game.service.served, 5);
  const once = restored.serialize(); const again = new CafeFactoryGame(); assert.equal(again.restore(once), true); assert.equal(again.state.coins, restored.state.coins);
});

test('one food cannot be assigned to multiple employees or sold again by a racing drag', () => {
  const game = new CafeFactoryGame(); unlockStaff(game); game.state.coins = 1000; advance(game, 2);
  game.state.buildings = [game.at(8, 2)]; const rack = game.shelves[0]; rack.input = null; rack.progress = 0; rack.goods = ['bread'];
  for (let i = 0; i < 3; i++) game.recruit(); const coins = game.state.coins;
  advance(game, .1); assert.equal(game.service.workers.filter(w => w.job).length, 1); assert.deepEqual(rack.goods, []);
  assert.equal(game.serveFromShelf(rack.id, 'bread', game.service.customers[1].id).ok, false);
  assert.equal(game.remove(rack.id).ok, true, 'employee owns the already-picked food, not the source shelf');
  const restored = new CafeFactoryGame(); assert.equal(restored.restore(game.serialize()), true); advance(restored, 4);
  assert.equal(restored.state.coins, coins + 6); assert.equal(restored.service.served, 5);
});

test('warehouse transfer moves only available capacity, never pays, and keeps the rest on the shelf', () => {
  const game = new CafeFactoryGame(); advance(game, 60); const rack = game.shelves[0], coins = game.state.coins;
  game.state.business.warehouse.bread = 99; const before = rack.goods.length;
  assert.equal(game.storeShelf(rack.id).count, 1); assert.equal(game.warehouseUsed, 100); assert.equal(rack.goods.length, before - 1);
  assert.equal(game.state.coins, coins); assert.equal(game.state.totalSold, 0);
  const saved = game.serialize(); assert.equal(game.storeShelf(rack.id).ok, false); assert.equal(game.serialize(), saved);
});

test('customers only request obtainable food, and adapt when a recipe line disappears', () => {
  const game = new CafeFactoryGame(); assert.deepEqual(game.availableFoods(), ['bread']);
  for (let slot = 0; slot < 3; slot++) assert.equal(game.desiredFood(slot), 'bread');
  const oven = game.place('cookie_ven', 0, 0, 0); assert.equal(oven.ok, false);
  game.place('cookie_oven', 0, 0, 0); assert.ok(game.availableFoods().includes('butter_cookie'));
  game.service.customers[1].want = 'orange_icepop'; advance(game, 8.1);
  assert.ok(['bread', 'butter_cookie'].includes(game.service.customers[1].want));
  assert.ok(!game.availableFoods().includes('orange_icepop'));
});

test('every recipe can be requested and manually served without changing food prices', () => {
  const game = new CafeFactoryGame(); game.state.orderIndex = 2; game.state.coins = 10000;
  const types = [...new Set(FOOD_RECIPES.flatMap(([, chain]) => chain))];
  types.forEach((type, i) => { if (!game.state.buildings.some(b => b.type === type)) game.place(type, i % 14, 4 + Math.floor(i / 14), 0); });
  assert.equal(game.availableFoods().length, 8);
  for (const [item] of FOOD_RECIPES) {
    const c = game.service.customers[0], rack = game.shelves[0]; c.cooldown = 0; c.want = item; rack.goods = [item]; const coins = game.state.coins;
    assert.equal(game.serveFromShelf(rack.id, item, c.id).ok, true); assert.equal(game.state.coins, coins + ITEMS[item].value);
  }
});

test('old factory migration preserves wallet, layout, paid levels, stock, orders, warehouses and queued intake', () => {
  const old = new FactoryGame(); advance(old, 25); old.upgrade(old.at(8, 2).id); old.at(8, 2).mode = 'store';
  old.state.business.warehouse.bread = 7; old.at(8, 2).input = 'bread'; old.at(8, 2).progress = .5;
  const previous = JSON.parse(old.serialize()), game = new CafeFactoryGame(); assert.equal(game.restore(old.serialize()), true);
  for (const key of ['coins', 'totalSold', 'stock', 'orderProgress', 'business', 'career']) assert.deepEqual(game.state[key], previous[key]);
  assert.equal(game.at(8, 2).level, 2); assert.equal(game.at(8, 2).paid, 60); assert.equal(game.at(8, 2).progress, .5);
  assert.deepEqual(game.at(8, 2).goods, []); assert.equal(game.service.served, 0); assert.equal(game.service.workers.length, 0);
  const same = game.serialize(); assert.equal(game.restore(same), true); assert.equal(game.serialize(), same);
});

test('corrupted service, shelves and job reservations reject atomically', () => {
  const game = new CafeFactoryGame(); unlockStaff(game); advance(game, 20); game.recruit(); advance(game, .1);
  const before = game.serialize();
  const corrupt = [
    s => s.service = null, s => s.service.served = -1, s => s.service.served = s.totalSold + 1,
    s => s.service.customers[0].want = 'flour', s => s.service.customers[0].skin = 3,
    s => s.service.customers[1].id = s.service.customers[0].id, s => s.service.customers.pop(),
    s => s.service.customers[0].cooldown = 3, s => s.service.customers[0].age = 100,
    s => s.service.workers[0].job.remaining = 5, s => s.service.workers[0].job.item = 'dough',
    s => s.service.workers[0].job.customerId = 100, s => s.service.workers[0].job.x = -1,
    s => s.service.workers.push({ ...s.service.workers[0], id: 2 }),
    s => s.buildings.find(b => b.type === 'depot').goods = Array(9).fill('bread'),
    s => s.buildings.find(b => b.type === 'depot').goods = ['flour'], s => s.buildings[0].goods = ['bread'],
    s => delete s.buildings.find(b => b.type === 'depot').goods,
  ];
  for (const edit of corrupt) { const saved = JSON.parse(before); edit(saved); assert.equal(game.restore(JSON.stringify(saved)), false, edit.toString()); assert.equal(game.serialize(), before); }
});

test('generated cat atlas has alpha and sixteen isolated frames; puppets animate exactly four separate parts', async () => {
  const root = new URL('../assets/generated/factory/cream-v1/', import.meta.url), manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
  const result = await validateFactoryAssets(manifest, root.pathname); assert.equal(result.valid, true);
  const atlas = result.report.atlases.find(a => a.id === 'service'); assert.equal(atlas.hasAlpha, true); assert.ok(atlas.transparentRatio > .45);
  assert.equal(manifest.sprites.filter(s => s.atlas === 'service').length, 16);
  const ctx = new Proxy({}, { get: () => () => {} });
  for (const staff of [false, true]) for (const reduced of [false, true]) {
    const parts = []; drawCat(ctx, { draw: (_, id) => parts.push(id) }, { skin: 2, time: 1, happy: true, staff, reduced });
    assert.equal(parts.length, 4); assert.ok(parts.some(id => id.endsWith('_head'))); assert.ok(parts.some(id => id.endsWith('_body')));
    assert.equal(parts.filter(id => id.includes('_hand_')).length, 2); assert.ok(parts.every(id => !/leg|foot|arm/.test(id)));
  }
});
