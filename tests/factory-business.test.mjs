import test from 'node:test';
import assert from 'node:assert/strict';
import { FactoryGame, ITEMS } from '../src/factory-core.js';
import { freshBusiness, validBusiness, wholesaleFor, warehouseCapacity, SALE_FOODS, MILESTONES } from '../src/factory-business.js';
const run = (game, seconds) => { for (let n = 0; n < seconds * 10; n++) game.update(.1); };
const stockFor = (game, slot = 0) => { const offer = game.wholesaleOffers[slot]; game.state.business.warehouse = { ...offer.wants }; return offer; };

test('legacy factories migrate warehouse defaults without changing orders or active contracts', () => {
  const game = new FactoryGame(); game.acceptContract(0); run(game, 12);
  const original = JSON.parse(game.serialize()); delete original.business;
  const loaded = new FactoryGame(); assert.equal(loaded.restore(JSON.stringify(original)), true);
  assert.deepEqual(loaded.state.business, freshBusiness());
  assert.deepEqual(loaded.state.career, original.career); assert.deepEqual(loaded.state.orderProgress, original.orderProgress);
  assert.equal(loaded.state.coins, original.coins);
  run(loaded, 4); assert.ok(loaded.state.totalSold > original.totalSold);
});

test('a real production line can store rather than sell, then return to selling', () => {
  const game = new FactoryGame(), depot = game.at(8, 2);
  game.acceptContract(0); const wallet = game.state.coins;
  assert.equal(game.setDepotMode(depot.id, 'store').ok, true); run(game, 30);
  assert.ok(game.state.business.warehouse.bread >= 4); assert.equal(game.state.coins, wallet);
  assert.equal(game.state.totalSold, 0); assert.deepEqual(game.state.delivered, {});
  assert.deepEqual(game.state.orderProgress, {}); assert.deepEqual(game.contract.progress, {});
  const count = game.warehouseUsed;
  assert.equal(game.setDepotMode(depot.id, 'sell').ok, true); run(game, 10);
  assert.equal(game.warehouseUsed, count); assert.ok(game.state.totalSold > 0);
  assert.ok(game.state.orderProgress.bread > 0); assert.ok(game.contract.progress.bread > 0);
  assert.equal(game.setDepotMode(game.at(5, 2).id, 'store').ok, false);
  assert.equal(game.setDepotMode(depot.id, 'discard').ok, false);
});

test('multiple depots reserve shared capacity without loss, then resume when space frees', () => {
  const game = new FactoryGame({ starter: false }); game.state.coins = 10000;
  const a = game.place('belt', 1, 1).building, b = game.place('belt', 1, 3).building;
  for (const y of [1, 3]) game.setDepotMode(game.place('depot', 2, y).building.id, 'store');
  game.state.business.warehouse = { bread: 99 }; a.output = 'bread'; b.output = 'butter_cookie';
  game.update(.1); assert.equal(game.warehouseUsed, 100);
  assert.equal([a, b].filter(b => b.output).length, 1); assert.equal(game.state.totalSold, 0);
  const before = [a.output, b.output]; run(game, 1); assert.deepEqual([a.output, b.output], before);
  assert.equal(game.sellWarehouse('bread', 10).ok, true); game.update(.1);
  assert.equal(a.output, null); assert.equal(b.output, null); assert.equal(game.warehouseUsed, 91);
});

test('wholesale consumes exactly one basket, pays a premium once, and leaves retail goals alone', () => {
  const game = new FactoryGame(); game.acceptContract(0);
  const insufficient = game.serialize(), emptyOffer = game.wholesaleOffers[2];
  assert.equal(game.shipWholesale(emptyOffer.id).ok, false); assert.equal(game.serialize(), insufficient);
  const offer = stockFor(game, 2), wallet = game.state.coins;
  const retail = Object.entries(offer.wants).reduce((n, [item, count]) => n + ITEMS[item].value * count, 0);
  assert.ok(offer.reward > retail); assert.equal(game.shipWholesale(offer.id).ok, true);
  assert.equal(game.state.coins, wallet + offer.reward); assert.equal(game.warehouseUsed, 0);
  assert.equal(game.state.business.shipments, 1); assert.equal(game.state.business.reputation, 3);
  assert.deepEqual(game.state.business.shipped, offer.wants);
  assert.deepEqual(game.state.orderProgress, {}); assert.deepEqual(game.contract.progress, {}); assert.equal(game.state.totalSold, 0);
  const after = game.serialize(); assert.equal(game.shipWholesale(offer.id).ok, false); assert.equal(game.serialize(), after);
  assert.equal(new FactoryGame().restore(after), true);
});

test('stock retail clears space without crediting timed or main orders, and packaging applies', () => {
  const game = new FactoryGame(); game.acceptContract(0); game.state.business.warehouse = { bread: 20 };
  game.state.career.points = 3; game.research('value');
  const wallet = game.state.coins, price = game.salePrice('bread');
  assert.equal(game.sellWarehouse('bread', 10).reward, price * 10); assert.equal(game.state.coins, wallet + price * 10);
  assert.equal(game.state.business.warehouse.bread, 10); assert.equal(game.state.totalSold, 0);
  assert.deepEqual(game.contract.progress, {}); assert.deepEqual(game.state.orderProgress, {});
  const before = game.serialize();
  for (const args of [['bread', 11], ['bread', 0], ['bread', -1], ['bread', .5], ['flour', 1], ['unknown', 1]]) assert.equal(game.sellWarehouse(...args).ok, false);
  assert.equal(game.serialize(), before);
  const offer = game.wholesaleOffers[0]; assert.equal(offer.reward, Math.round(price * offer.wants.bread * offer.multiplier));
});

test('removing storage depots neither discards nor duplicates shared warehouse contents', () => {
  const game = new FactoryGame(), depot = game.at(8, 2); game.setDepotMode(depot.id, 'store'); run(game, 25);
  const stored = { ...game.state.business.warehouse };
  game.remove(depot.id); assert.deepEqual(game.state.business.warehouse, stored);
  const replacement = game.place('depot', 8, 2).building; assert.equal(replacement.mode, undefined);
  game.setDepotMode(replacement.id, 'store'); assert.deepEqual(game.state.business.warehouse, stored);
  const loaded = new FactoryGame(); assert.equal(loaded.restore(game.serialize()), true);
  assert.equal(loaded.at(8, 2).mode, 'store'); assert.deepEqual(loaded.state.business.warehouse, stored);
});

test('wholesale baskets stay within capacity and available food tiers, even after many shipments', () => {
  const unlocked = [new Set(['bread', 'butter_cookie']), new Set(['bread', 'butter_cookie', 'steamed_bun', 'donut_plain', 'donut_strawberry']), new Set(SALE_FOODS)];
  for (const tier of [0, 1, 2]) for (const round of [0, 2, 3, 30, 100000]) for (const slot of [0, 1, 2]) {
    const offer = wholesaleFor(tier, round, slot, round), capacity = warehouseCapacity({ reputation: round });
    assert.ok(Object.values(offer.wants).reduce((n, count) => n + count, 0) <= capacity);
    for (const [item, n] of Object.entries(offer.wants)) { assert.ok(unlocked[tier].has(item)); assert.ok(Number.isInteger(n) && n > 0 && n <= 28); }
  }
});

test('cooperation reputation expands capacity and every milestone pays only once across reload', () => {
  const game = new FactoryGame(); assert.equal(game.warehouseCapacity, 100); game.state.orderIndex = 8; game.state.expansion = 4; game.state.career.completed = 3;
  for (let round = 0; round < 10; round++) assert.equal(game.shipWholesale(stockFor(game, 2).id).ok, true);
  assert.equal(game.warehouseCapacity, 300); assert.equal(validBusiness(game.state.business), true);
  for (const goal of MILESTONES) {
    const points = game.state.career.points; assert.equal(game.claimMilestone(goal.id).ok, true, goal.id);
    assert.equal(game.state.career.points, points + goal.points); const saved = game.serialize();
    assert.equal(game.claimMilestone(goal.id).ok, false); assert.equal(game.serialize(), saved);
    const loaded = new FactoryGame(); assert.equal(loaded.restore(saved), true); assert.equal(loaded.claimMilestone(goal.id).ok, false);
  }
});

test('malformed business state, impossible histories, and invalid depot modes reject atomically', () => {
  const game = new FactoryGame(), before = game.serialize();
  const invalid = [
    s => s.business.warehouse.bread = -1, s => s.business.warehouse.bread = .5,
    s => s.business.warehouse.flour = 1, s => s.business.warehouse.bread = 101,
    s => s.business.warehouse = [], s => s.business.reputation = 3,
    s => s.business.version = 2, s => s.business.claimed = ['missing'],
    s => s.business.claimed = ['first_dispatch', 'first_dispatch'], s => s.business.claimed = ['first_dispatch'],
    s => s.business.shipped = Object.fromEntries(SALE_FOODS.map(item => [item, 6])),
    s => { s.business.shipments = 1; s.business.reputation = 1; s.business.shipped.bread = 29; },
    s => s.business.extraReward = 9999, s => s.business = null,
    s => s.buildings[0].mode = 'store', s => s.buildings.find(b => b.type === 'depot').mode = 'auto',
  ];
  for (const mutate of invalid) { const state = JSON.parse(before); mutate(state); assert.equal(game.restore(JSON.stringify(state)), false); assert.equal(game.serialize(), before); }
});
