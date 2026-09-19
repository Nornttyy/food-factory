import test from 'node:test';
import assert from 'node:assert/strict';
import { FactoryGame, ITEMS, ORDER_CATALOG, orderFor } from '../src/factory-core.js';
import { CAREER_CATALOG, contractFor } from '../src/factory-career.js';
import { MILESTONES, businessLevel } from '../src/factory-business.js';

const run = (game, seconds) => { for (let n = 0; n < seconds * 10; n++) game.update(.1); };
const load = state => { const game = new FactoryGame(); assert.equal(game.restore(JSON.stringify(state)), true); return game; };

test('all eight future sale prices are halved, including warehouse sales and research', () => {
  const prices = { bread: 6, butter_cookie: 8, donut_plain: 9, donut_strawberry: 13, steamed_bun: 9, orange_juice: 10, strawberry_cake: 16, orange_icepop: 17 };
  for (const [item, price] of Object.entries(prices)) {
    assert.equal(ITEMS[item].value, price);
    for (let research = 0; research <= 3; research++) {
      const game = new FactoryGame(); game.state.career.research.value = research;
      const expected = Math.round(price * (1 + research * .1)), wallet = game.state.coins;
      assert.equal(game.salePrice(item), expected); game.deliver(item, { x: 0, y: 0 });
      assert.equal(game.state.coins, wallet + expected);
      game.state.business.warehouse[item] = 10;
      assert.equal(game.sellWarehouse(item, 10).reward, expected * 10);
      assert.equal(game.state.coins, wallet + expected * 11);
    }
  }
});

test('starter income slows without slowing production, removing capital or blocking unlocks', () => {
  const game = new FactoryGame(); assert.equal(game.state.coins, 450);
  game.acceptContract(0); run(game, 60);
  assert.equal(game.state.totalSold, 16); assert.equal(game.state.coins, 450 + 96);
  assert.equal(game.claimOrder().reward, 95); assert.equal(game.claimContract().reward, 30);
  assert.equal(game.state.coins, 450 + 221); assert.equal(game.unlockLevel, 1);
  run(game, 240); assert.equal(game.state.coins, 450 + 671);
  assert.ok(671 < 1592 * .45, 'five-minute earnings are less than half the previous 1592');
  assert.ok(game.state.coins >= game.expansionCost);
});

test('new main rewards are one quarter of their previous catalog, with an upper bound', () => {
  assert.equal(ORDER_CATALOG, 4);
  for (const index of [0, 1, 2, 3, 4, 7, 8, 30, 100, 100000]) {
    const old = orderFor(index, 2), balanced = orderFor(index, ORDER_CATALOG);
    assert.deepEqual(balanced.wants, old.wants);
    assert.equal(balanced.reward, Math.round(old.reward * .25)); assert.ok(balanced.reward <= 600);
  }
});

test('old accepted main orders keep progress and rewards once before switching to balanced rewards', () => {
  for (const catalog of [undefined, 1, 2, 3]) for (const index of [0, 4, 12, 100]) {
    const state = JSON.parse(new FactoryGame().serialize());
    state.coins = 98765; state.orderIndex = index; state.orderCatalog = catalog;
    const old = orderFor(index, catalog || 1), [item, count] = Object.entries(old.wants)[0];
    state.orderProgress = { [item]: Math.min(2, count) }; state.business.warehouse = { bread: 7 };
    const game = load(state);
    assert.equal(game.state.coins, 98765); assert.deepEqual(game.order, old);
    assert.deepEqual(game.state.buildings.map(b => [b.type, b.x, b.y, b.paid]), state.buildings.map(b => [b.type, b.x, b.y, b.paid]));
    assert.deepEqual(game.state.orderProgress, state.orderProgress); assert.deepEqual(game.state.business, state.business);
    game.state.orderProgress = { ...old.wants };
    const ready = load(JSON.parse(game.serialize()));
    assert.equal(ready.claimOrder().reward, old.reward); assert.equal(ready.state.coins, 98765 + old.reward);
    assert.equal(ready.state.orderCatalog, ORDER_CATALOG);
    assert.deepEqual(ready.order, orderFor(index + 1, ORDER_CATALOG));
    assert.equal(ready.claimOrder().ok, false);
    const restored = load(JSON.parse(ready.serialize())); assert.equal(restored.state.coins, ready.state.coins);
  }
});

test('old rush contracts keep deadlines, ready rewards and research points then use the new catalog', () => {
  for (const catalog of [undefined, 1, 2]) for (const status of ['active', 'ready', 'expired']) {
    const state = JSON.parse(new FactoryGame().serialize()), old = contractFor(0, 0, 0, catalog || 1);
    state.coins = 2345; state.career.catalog = catalog;
    state.career.contract = { tier: 0, round: 0, slot: 0, status, startedAt: 0, deadline: old.duration, progress: status === 'ready' ? { ...old.wants } : {} };
    if (status === 'expired') state.time = old.duration;
    const game = load(state); assert.equal(game.state.coins, 2345);
    assert.equal(game.contract.reward, old.reward); assert.equal(game.contract.deadline, old.duration);
    if (status === 'ready') {
      assert.equal(game.claimContract().reward, old.reward); assert.equal(game.claimContract().ok, false);
      assert.equal(game.state.career.points, 1);
    } else if (status === 'active') assert.equal(game.cancelContract().ok, true);
    assert.equal(game.acceptContract(0).ok, true); assert.equal(game.state.career.catalog, CAREER_CATALOG);
    assert.equal(game.contract.reward, 30); assert.equal(game.contract.duration, 60);
    assert.equal(load(JSON.parse(game.serialize())).contract.reward, 30);
  }
});

test('new rush rewards drop to a quarter without changing difficulty or research progression', () => {
  for (let tier = 0; tier <= 2; tier++) for (let slot = 0; slot < 3; slot++) for (const round of [0, 3, 30, 100000]) {
    const old = contractFor(tier, round, slot, 1), next = contractFor(tier, round, slot);
    assert.deepEqual(next.wants, old.wants); assert.equal(next.duration, old.duration);
    assert.equal(next.reward, Math.round(old.reward * .25)); assert.equal(next.points, old.points);
  }
});

test('wholesale still pays a bounded premium but cannot retain the old inflated payouts', () => {
  for (let tier = 0; tier <= 2; tier++) for (const reputation of [0, 3, 9, 18, 30]) {
    const game = new FactoryGame(); game.state.orderIndex = tier; game.state.business.reputation = reputation;
    for (const offer of game.wholesaleOffers) {
      const retail = Object.entries(offer.wants).reduce((n, [item, count]) => n + game.salePrice(item) * count, 0);
      assert.ok(offer.multiplier >= 1.15 && offer.multiplier <= 1.45 + 1e-9);
      assert.equal(offer.reward, Math.round(retail * offer.multiplier)); assert.ok(offer.reward > retail);
      const oldReward = Math.round(retail * 2 * (1.5 + offer.slot * .15 + businessLevel(reputation) * .05));
      assert.ok(offer.reward < oldReward * .45);
    }
  }
});

test('milestone money is halved while research points and one-time claims remain unchanged', () => {
  assert.deepEqual(MILESTONES.map(g => g.coins), [75, 150, 225, 400, 500, 700]);
  assert.deepEqual(MILESTONES.map(g => g.points), [1, 2, 2, 3, 3, 4]);
  const game = new FactoryGame(), offer = game.wholesaleOffers[0];
  game.state.business.warehouse = { ...offer.wants }; game.shipWholesale(offer.id);
  const wallet = game.state.coins;
  assert.equal(game.claimMilestone('first_dispatch').reward, 75);
  assert.equal(game.state.coins, wallet + 75); assert.equal(game.state.career.points, 1);
  const restored = load(JSON.parse(game.serialize()));
  assert.equal(restored.claimMilestone('first_dispatch').ok, false); assert.equal(restored.state.coins, wallet + 75);
});
