import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SortingGame, SORT_SAVE_KEY, SORT_FOODS, SORT_MEALS, SORT_DECOR, sortingWave } from '../src/factory-sorting.js';

function fill(game, order, plate = 0) {
  for (const food of SORT_MEALS[order.meal].foods) {
    const item = game.round.items.find(item => item.food === food && item.place === 'bench');
    assert.ok(item, `missing ${food}`); assert.equal(game.move(item.id, plate).ok, true);
  }
}
function finishWave(game) {
  for (const order of game.round.orders) { if (order.done) continue; fill(game, order); assert.equal(game.serve(0, order.id).ok, true); }
}

test('sorting starts independently with zero coins, three small orders and exactly enough real food', () => {
  const game = new SortingGame(); assert.equal(SORT_SAVE_KEY, 'food-factory-sort-v1');
  assert.equal(game.state.coins, 0); assert.equal(game.start().ok, true); assert.equal(game.round.orders.length, 3);
  assert.equal(game.round.items.length, 6); assert.equal(new Set(game.round.items.map(i => i.slot)).size, 6);
  assert.equal(game.start().ok, false); assert.equal(game.active, true);
  assert.equal('time' in game.round, false); assert.ok(game.round.orders.every(order => !('patience' in order)));
});

test('wrong plates and wrong customers do not lose items or award income', () => {
  const game = new SortingGame(); game.start();
  const wrong = game.round.items.find(item => item.food === 'egg'); game.move(wrong.id, 0);
  const before = game.serialize(); assert.equal(game.serve(0, game.round.orders[0].id).ok, false); assert.equal(game.serialize(), before);
  assert.equal(game.move(wrong.id, 'bench').ok, true); assert.equal(game.state.coins, 0);
  assert.equal(game.round.items.find(item => item.id === wrong.id).slot, wrong.slot, 'returned food goes to its original scattered position');
});

test('food moves between plates atomically, plates hold four items, and returning is free', () => {
  const game = new SortingGame(); game.start();
  game.round.items.slice(0, 4).forEach(item => assert.equal(game.move(item.id, 0).ok, true));
  const last = game.round.items[4], before = game.serialize();
  assert.equal(game.move(last.id, 0).ok, false); assert.equal(game.serialize(), before);
  const first = game.plate(0)[0]; assert.equal(game.move(first.id, 1).ok, true); assert.equal(game.plate(0).length, 3); assert.equal(game.plate(1).length, 1);
  assert.equal(game.returnPlate(0).ok, true); assert.equal(game.plate(0).length, 0); assert.equal(game.state.coins, 0);
  assert.equal(game.returnPlate(0).ok, false); assert.equal(game.move(first.id, 1).ok, false);
});

test('only an exact multiset completes a meal; every order and item can pay out once', () => {
  const game = new SortingGame(); game.start(); const order = game.round.orders[0];
  fill(game, order); assert.deepEqual(game.matching(0), [order.id]);
  const ids = game.plate(0).map(item => item.id); assert.equal(game.serve(0, order.id).earned, 6);
  const after = game.serialize(); assert.equal(game.serve(0, order.id).ok, false); assert.equal(game.move(ids[0], 1).ok, false);
  assert.equal(game.serialize(), after); assert.equal(game.state.totalServed, 1); assert.equal(game.plate(0).length, 0);
});

test('duplicate portions need two distinct food pieces, not the same piece twice', () => {
  const game = new SortingGame(); game.state.day = 6; game.start();
  const order = game.round.orders.find(order => order.meal === 'sharing'); assert.ok(order);
  const donut = game.round.items.find(item => item.food === 'donut'); assert.equal(game.move(donut.id, 0).ok, true);
  assert.equal(game.move(donut.id, 0).ok, false); assert.equal(game.serve(0, order.id).ok, false);
  game.returnPlate(0); fill(game, order); assert.equal(game.plate(0).length, 4); assert.equal(game.serve(0, order.id).ok, true);
});

test('every day has two explicit waves and settlement does not award the same coins again', () => {
  const game = new SortingGame(); game.start(); assert.equal(game.next().ok, false);
  finishWave(game); assert.equal(game.round.status, 'wave'); assert.equal(game.round.served, 3); assert.equal(game.state.coins, 20);
  assert.equal(game.next().ok, true); assert.equal(game.round.wave, 2); assert.equal(game.state.day, 1); assert.equal(game.state.coins, 20);
  finishWave(game); assert.equal(game.round.status, 'done'); assert.equal(game.round.served, 6); assert.equal(game.state.coins, 40);
  assert.equal(game.round.earnings, 40); assert.equal(game.next().ok, true); assert.equal(game.state.day, 2); assert.equal(game.state.coins, 40);
  assert.equal(game.next().ok, false); assert.equal(game.state.coins, 40);
});

test('pausing freezes moves, returns and serving; a new wave cannot be skipped', () => {
  const game = new SortingGame(); game.start(); const order = game.round.orders[0]; fill(game, order); game.pause(true);
  const before = game.serialize(); assert.equal(game.move(game.round.items[0].id, 1).ok, false); assert.equal(game.returnPlate(0).ok, false);
  assert.equal(game.serve(0, order.id).ok, false); assert.equal(game.next().ok, false); assert.equal(game.serialize(), before);
  game.pause(false); assert.equal(game.serve(0, order.id).ok, true);
});

test('decorations require earned coins, cost once, switch real skins and have no gameplay bonuses', () => {
  const game = new SortingGame(); game.start(); assert.equal(game.decorate('plate_sage').ok, false);
  game.pause(true); assert.equal(game.decorate('plate_sage').ok, false);
  game.pause(false); finishWave(game); game.next(); finishWave(game); game.next(); finishWave(game); game.next(); finishWave(game);
  assert.ok(game.state.coins >= 65); const before = game.state.coins, count = game.round.items.length;
  assert.equal(game.decorate('plate_sage').bought, true); assert.equal(game.state.coins, before - 65);
  game.decorate('plate_cream'); assert.equal(game.decorate('plate_sage').bought, false); assert.equal(game.state.coins, before - 65);
  assert.equal(game.state.decor.equipped.plate, 'plate_sage'); assert.equal(game.round.items.length, count);
  assert.equal(game.decorate('pan_sage').ok, false, 'unused old cookware is not sold in the sorting shop');
});

test('in-progress and finished saves preserve the exact meal pieces, rewards and cosmetics', () => {
  const game = new SortingGame(); game.start(); fill(game, game.round.orders[0]); game.serve(0, game.round.orders[0].id);
  const item = game.round.items.find(item => item.place === 'bench'); game.move(item.id, 2);
  const raw = game.serialize(), restored = new SortingGame(); assert.equal(restored.restore(raw), true); assert.equal(restored.round.paused, true);
  restored.pause(false); assert.equal(restored.serialize(), raw); assert.equal(restored.round.items.find(i => i.id === item.id).place, 2);
  restored.returnPlate(2); finishWave(restored); const wave = restored.serialize(); assert.equal(new SortingGame().restore(wave), true);
  restored.next(); finishWave(restored); const done = restored.serialize(), resumed = new SortingGame(); assert.equal(resumed.restore(done), true); assert.equal(resumed.serialize(), done);
});

test('malformed, forged, duplicate and impossible saved layouts are rejected atomically', () => {
  const game = new SortingGame(); game.start(); const raw = game.serialize();
  const mutations = [
    s => s.version = 2, s => s.coins = -1, s => s.round.items[0].id++, s => s.round.items[0].food = 'nope',
    s => s.round.items[0].slot = 99, s => s.round.items[0].place = 3, s => s.round.items[0].place = 'served',
    s => s.round.items.push(s.round.items[0]), s => s.round.orders[0].done = true, s => s.round.orders[0].meal = 'sharing',
    s => s.round.earnings = 10, s => s.round.served = 2, s => s.round.status = 'done', s => s.round.wave = 3,
    s => s.decor.owned.push('plate_cream'), s => s.decor.equipped.plate = 'plate_peach', s => s.decor.equipped.plate = 'cloth_cream',
    s => s.round.items.slice(0, 5).forEach(i => i.place = 0),
  ];
  for (const mutate of mutations) { const changed = JSON.parse(raw); mutate(changed); assert.equal(game.restore(JSON.stringify(changed)), false); assert.equal(game.serialize(), raw); }
  for (const bad of ['{', 'null', '[]']) assert.equal(game.restore(bad), false);
});

test('all menus stay solvable and round-trip across 30 complete days, including duplicate orders', () => {
  const game = new SortingGame(); game.start(); const seen = new Set();
  for (let day = 1; day <= 30; day++) {
    for (let wave = 1; wave <= 2; wave++) {
      assert.deepEqual(game.round.orders, sortingWave(day, wave).orders);
      assert.ok(game.round.items.length <= 12);
      for (const order of game.round.orders) {
        seen.add(order.meal); fill(game, order, 1);
        const restored = new SortingGame(); assert.equal(restored.restore(game.serialize()), true); restored.pause(false); assert.equal(restored.serialize(), game.serialize());
        assert.equal(game.serve(1, order.id).ok, true);
        assert.equal(new SortingGame().restore(game.serialize()), true);
      }
      assert.equal(game.round.items.filter(item => item.place !== 'served').length, 0);
      assert.equal(game.next().ok, true);
    }
  }
  assert.equal(game.state.day, 31); assert.equal(game.state.totalServed, 180); assert.equal(seen.size, Object.keys(SORT_MEALS).length);
});

test('all sorting food, cat parts and shop decorations resolve to production atlas frames', async () => {
  const manifest = JSON.parse(await readFile(new URL('../assets/generated/factory/cream-v1/manifest.json', import.meta.url), 'utf8'));
  const ids = new Set(manifest.sprites.map(sprite => sprite.id));
  for (const item of [...Object.values(SORT_FOODS), ...Object.values(SORT_DECOR)]) assert.ok(ids.has(item.sprite), item.sprite);
  for (const color of ['cream', 'peach', 'gray']) for (const part of ['body', 'head', 'hand_l', 'hand_r']) assert.ok(ids.has(`cat_${color}_${part}`));
});
