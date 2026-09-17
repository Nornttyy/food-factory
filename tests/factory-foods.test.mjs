import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { FactoryGame, BUILDINGS, ITEMS, FOOD_RECIPES, orderFor } from '../src/factory-core.js';
import { createPractice, nextLesson, LESSONS } from '../src/factory-tutorial.js';

const simulate = (game, seconds) => { for (let n = 0; n < seconds * 10; n++) game.update(.1); };

test('all eight complete food chains produce, sell, restore, and have generated art', async () => {
  const manifest = JSON.parse(await readFile(new URL('../assets/generated/factory/cream-v1/manifest.json', import.meta.url), 'utf8'));
  const sprites = new Set(manifest.sprites.map(s => s.id));
  assert.equal(FOOD_RECIPES.length, 8);
  assert.equal(new Set(FOOD_RECIPES.map(([item]) => item)).size, 8);
  assert.deepEqual(FOOD_RECIPES.map(([item]) => item).sort(), Object.keys(ITEMS).filter(item => ITEMS[item].value).sort());
  for (const [food, recipe] of FOOD_RECIPES) {
    const game = new FactoryGame({ starter: false }); game.state.coins = 10000; game.state.orderIndex = 2;
    for (const [x, type] of [...recipe, 'depot'].entries()) {
      assert.ok(sprites.has(BUILDINGS[type].sprite), type);
      assert.equal(game.place(type, x, 1).ok, true);
      if (x > 0 && x < recipe.length) assert.equal(BUILDINGS[recipe[x - 1]].output, BUILDINGS[type].input);
    }
    assert.ok(sprites.has(ITEMS[food].sprite));
    const coins = game.state.coins;
    simulate(game, 45);
    assert.ok(game.state.delivered[food] >= 4, food);
    assert.equal(game.state.coins - coins, game.state.delivered[food] * ITEMS[food].value);
    assert.deepEqual(Object.keys(game.state.delivered), [food]);
    const loaded = new FactoryGame({ shop: false }); assert.equal(loaded.restore(game.serialize()), true, food);
    const sold = loaded.state.totalSold; simulate(loaded, 10); assert.ok(loaded.state.totalSold > sold, food);
  }
});

test('new processing machines respect unlocks, inputs, research and refunds', () => {
  for (const type of ['cookie_oven', 'bun_steamer', 'cake_station', 'icepop_freezer']) {
    const game = new FactoryGame({ starter: false }), def = BUILDINGS[type]; game.state.coins = 10000;
    if (def.unlock) assert.equal(game.place(type, 1, 1).ok, false);
    game.state.orderIndex = def.unlock;
    const b = game.place(type, 1, 1).building;
    assert.equal(game.canReceive(b, def.input), true);
    assert.equal(game.canReceive(b, 'flour'), false);
    game.state.career.points = 20;
    assert.equal(game.research('production').ok, true);
    assert.ok(game.duration(b) < def.duration);
    assert.equal(game.research('value').ok, true);
    const coins = game.state.coins; game.deliver(def.output, b);
    assert.equal(game.state.coins - coins, Math.round(ITEMS[def.output].value * 1.1));
    assert.equal(new FactoryGame({ shop: false }).restore(game.serialize()), true);
    assert.equal(game.remove(b.id).refund, def.cost);
  }
});

test('legacy active main orders keep their exact requirements until claimed', () => {
  for (const index of [0, 3, 4, 5, 7, 12, 500]) {
    const old = new FactoryGame({ shop: false }); old.state.orderIndex = index; delete old.state.orderCatalog;
    const definition = orderFor(index), [item, count] = Object.entries(definition.wants)[0];
    old.state.orderProgress = { [item]: Math.min(3, count) };
    const loaded = new FactoryGame({ shop: false }); assert.equal(loaded.restore(old.serialize()), true);
    assert.equal(loaded.state.orderCatalog, 1); assert.deepEqual(loaded.order, definition);
    assert.equal(loaded.state.orderProgress[item], Math.min(3, count));
    loaded.state.orderProgress = { ...definition.wants };
    const wallet = loaded.state.coins;
    assert.equal(loaded.claimOrder().reward, definition.reward);
    assert.equal(loaded.state.coins, wallet + definition.reward);
    assert.equal(loaded.state.orderCatalog, 2);
    assert.deepEqual(loaded.order, orderFor(index + 1, 2));
    assert.equal(new FactoryGame({ shop: false }).restore(loaded.serialize()), true);
  }
});

test('new food orders cover the expanded menu with bounded repeat demands', () => {
  const seen = new Set();
  for (let index = 0; index < 1000; index++) {
    const order = orderFor(index, 2);
    assert.ok(order.reward > 0 && order.reward <= 2400);
    for (const [food, n] of Object.entries(order.wants)) { assert.ok(ITEMS[food].value); assert.ok(n > 0 && n <= 80); seen.add(food); }
  }
  assert.equal(seen.size, 8);
  const game = new FactoryGame({ shop: false }), before = game.serialize();
  for (const bad of [0, 4, '2', null]) { const saved = JSON.parse(before); saved.orderCatalog = bad; assert.equal(game.restore(JSON.stringify(saved)), false); assert.equal(game.serialize(), before); }
});

test('practice teaches cooking, carrying, customer service and claiming without touching another game', () => {
  const real = new FactoryGame({ shop: false }); simulate(real, 12); const before = real.serialize();
  const game = createPractice();
  assert.equal(game.state.coins, 0); assert.equal(game.state.buildings.length, 0);
  assert.equal(new FactoryGame({ shop: false }).restore(game.serialize()), true);
  assert.equal(nextLesson(0, game), 0); game.shopAction('cook'); assert.equal(nextLesson(0, game), 1);
  simulate(game, 5); assert.equal(nextLesson(1, game), 2);
  game.shopAction('pickup'); simulate(game, 2); assert.equal(nextLesson(2, game), 3);
  game.shopAction('serve', 1); simulate(game, 2); assert.equal(nextLesson(3, game), 4);
  for (let i = 0; i < 3; i++) { game.shopAction('cook'); simulate(game, 6); const customer = game.state.shop.customers.find(c => !c.cooldown); game.shopAction('serve', customer.id); simulate(game, 4); }
  assert.equal(game.claimOrder().ok, true);
  assert.equal(nextLesson(4, game, 'select'), 5); assert.equal(nextLesson(5, game, 'select'), 5);
  assert.equal(LESSONS.length, 6); assert.equal(real.serialize(), before);
});
