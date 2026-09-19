import test from 'node:test';
import assert from 'node:assert/strict';
import { FactoryGame, ITEMS } from '../src/factory-core.js';
import { freshCareer, contractFor } from '../src/factory-career.js';
const run = (game, seconds) => { for (let n = 0; n < seconds * 10; n++) game.update(.1); };
const sell = (game, item, count = 1) => { for (let n = 0; n < count; n++) game.deliver(item, { x: 1, y: 1 }); };

test('legacy version-one saves migrate without losing progress, machines or coins', () => {
  const old = new FactoryGame(); run(old, 15);
  const save = JSON.parse(old.serialize()); delete save.career;
  const restored = new FactoryGame(); assert.equal(restored.restore(JSON.stringify(save)), true);
  assert.equal(restored.state.coins, old.state.coins); assert.deepEqual(restored.state.delivered, old.state.delivered);
  assert.deepEqual(restored.state.career, freshCareer()); assert.equal(restored.state.buildings.length, 8);
});
test('offers only request unlocked goods and remain bounded for long-running factories', () => {
  const allowed = [['bread'], ['bread', 'donut_plain', 'donut_strawberry'], ['bread', 'donut_plain', 'donut_strawberry', 'orange_juice']];
  const game = new FactoryGame();
  for (let tier = 0; tier < 3; tier++) for (const round of [0, 3, 50, 99999]) {
    game.state.orderIndex = tier; game.state.career.completed = round;
    assert.equal(game.offers.length, 3);
    for (const offer of game.offers) {
      assert.ok(Object.keys(offer.wants).every(item => allowed[tier].includes(item)));
      assert.ok(Object.values(offer.wants).every(n => Number.isInteger(n) && n > 0 && n <= 80));
      assert.ok(offer.duration >= 60 && offer.duration <= 110); assert.ok(offer.points >= 1 && offer.points <= 3);
    }
  }
});
test('contracts count only new sales while preserving ordinary income and main-order credit', () => {
  const game = new FactoryGame(); sell(game, 'bread', 10); const wallet = game.state.coins;
  assert.equal(game.acceptContract(0).ok, true); assert.deepEqual(game.contract.progress, {});
  const accepted = game.serialize(); assert.equal(game.acceptContract(1).ok, false); assert.equal(game.serialize(), accepted);
  sell(game, 'bread', 6); assert.equal(game.contract.status, 'ready'); assert.equal(game.orderReady, true);
  assert.equal(game.state.coins, wallet + 6 * ITEMS.bread.value);
  assert.equal(game.acceptContract(2).ok, false); assert.equal(game.cancelContract().ok, false);
});
test('claiming a completed contract rewards once, including after save and reload', () => {
  const game = new FactoryGame(); game.acceptContract(0); sell(game, 'bread', 6);
  const ready = new FactoryGame(); assert.equal(ready.restore(game.serialize()), true);
  const before = ready.state.coins; assert.equal(ready.claimContract().ok, true);
  assert.equal(ready.state.coins, before + 30); assert.equal(ready.state.career.points, 1); assert.equal(ready.state.career.completed, 1);
  assert.equal(ready.claimContract().ok, false);
  const saved = new FactoryGame(); assert.equal(saved.restore(ready.serialize()), true); assert.equal(saved.claimContract().ok, false);
  assert.equal(saved.state.career.points, 1);
});
test('deadline accepts the last tick, and a ready reward never expires', () => {
  const game = new FactoryGame({ starter: false }); game.acceptContract(0);
  sell(game, 'bread', 5); game.state.time = 59.9;
  const depot = game.place('depot', 2, 1).building; depot.input = 'bread'; depot.progress = 1.9;
  game.update(.1); assert.equal(game.state.time, 60); assert.equal(game.contract.status, 'ready');
  run(game, 100); assert.equal(game.contract.status, 'ready'); assert.equal(game.claimContract().ok, true);
});
test('expired and abandoned contracts cost no coins and cannot yield rewards', () => {
  const game = new FactoryGame({ starter: false }); game.acceptContract(0); const coins = game.state.coins;
  run(game, 60); assert.equal(game.contract.status, 'expired'); assert.equal(game.state.coins, coins);
  sell(game, 'bread', 6); assert.equal(game.contract.status, 'expired'); assert.deepEqual(game.contract.progress, {});
  assert.equal(game.claimContract().ok, false); assert.equal(game.acceptContract(1).ok, true);
  assert.equal(game.cancelContract().ok, true); assert.equal(game.state.career.completed, 0); assert.equal(game.state.career.points, 0);
  assert.equal(game.acceptContract(0).ok, true); assert.deepEqual(game.contract.progress, {});
});
test('pause and reload preserve contract time; double speed advances production and deadline together', () => {
  const game = new FactoryGame({ starter: false }); game.acceptContract(0); game.state.paused = true;
  run(game, 100); assert.equal(game.state.time, 0); assert.equal(game.contract.deadline, 60);
  const restored = new FactoryGame(); assert.equal(restored.restore(game.serialize()), true); assert.equal(restored.contract.status, 'active');
  restored.state.paused = false; restored.state.speed = 2; run(restored, 30); assert.equal(restored.state.time, 60); assert.equal(restored.contract.status, 'expired');
});
test('research requires points, charges increasing costs and caps each branch at three', () => {
  const game = new FactoryGame(), before = game.serialize();
  for (const key of ['production', 'nope', 'constructor']) assert.equal(game.research(key).ok, false);
  assert.equal(game.serialize(), before);
  game.state.career.points = 6;
  for (let i = 1; i <= 3; i++) { assert.equal(game.research('value').ok, true); assert.equal(game.state.career.research.value, i); }
  assert.equal(game.state.career.points, 0); assert.equal(game.research('value').ok, false);
});
test('production research preserves completion, original ingredients and valid paused saves', () => {
  const game = new FactoryGame(), machine = game.at(5, 2);
  machine.input = 'dough'; machine.progress = 2.5; game.state.paused = true; game.state.career.points = 3;
  const completion = machine.progress / game.duration(machine), oldDuration = game.duration(machine);
  assert.equal(game.research('production').ok, true); assert.ok(game.duration(machine) < oldDuration);
  assert.ok(Math.abs(machine.progress / game.duration(machine) - completion) < 1e-10); assert.equal(machine.input, 'dough');
  assert.equal(game.upgrade(machine.id).ok, true);
  assert.ok(Math.abs(machine.progress / game.duration(machine) - completion) < 1e-10);
  const restored = new FactoryGame(); assert.equal(restored.restore(game.serialize()), true);
});
test('each transport research level decreases actual travel by one simulation tick', () => {
  for (let level = 0; level <= 3; level++) {
    const game = new FactoryGame({ starter: false }); game.state.career.research.transport = level;
    const source = game.place('belt', 1, 1).building, target = game.place('belt', 2, 1).building, depot = game.place('depot', 3, 1).building;
    source.output = 'bread'; game.update(.1); assert.equal(target.output, 'bread');
    for (let tick = 0; tick < 11 - level; tick++) { game.update(.1); assert.equal(depot.input, null); }
    game.update(.1); assert.equal(depot.input, 'bread'); assert.equal(game.state.time, (13 - level) / 10);
    run(game, 1.9); assert.equal(game.state.totalSold, 0); run(game, .1); assert.equal(game.state.totalSold, 1);
  }
});
test('packaging yields integer coins for every saleable item and round-trips correctly', () => {
  for (let level = 1; level <= 3; level++) {
    const game = new FactoryGame(); game.state.career.research.value = level;
    for (const [item, def] of Object.entries(ITEMS)) if (def.value) {
      const before = game.state.coins; sell(game, item); assert.equal(game.state.coins - before, Math.round(def.value * (1 + level * .1)));
    }
    const restored = new FactoryGame(); assert.equal(restored.restore(game.serialize()), true);
  }
});
test('corrupted career saves cannot replace a working factory or inject rewards', () => {
  const game = new FactoryGame(); game.acceptContract(0); const before = game.serialize();
  for (const mutate of [s => s.career = null, s => s.career.points = -1, s => s.career.research.transport = 4, s => s.career.research.extra = 1, s => s.career.contract.slot = 3, s => s.career.contract.deadline = 999, s => s.career.contract.status = 'ready', s => s.career.contract.progress.bread = 999, s => s.career.contract.tier = 2, s => s.career.contract.round = 4]) {
    const data = JSON.parse(before); mutate(data); assert.equal(game.restore(JSON.stringify(data)), false); assert.equal(game.serialize(), before);
  }
});
test('starter can fulfill the easy challenge while difficult contracts reward improved capacity', () => {
  const starter = new FactoryGame(); starter.acceptContract(0); run(starter, 60); assert.equal(starter.contract.status, 'ready');
  const difficult = new FactoryGame(); difficult.acceptContract(1); run(difficult, 60); assert.equal(difficult.contract.status, 'expired');
  const improved = new FactoryGame();
  ['flour_hopper', 'dough_mixer', 'bread_oven', 'depot'].forEach((type, x) => assert.equal(improved.place(type, x + 1, 4).ok, true));
  improved.acceptContract(1); run(improved, 60); assert.equal(improved.contract.status, 'ready');
  assert.ok(contractFor(2, 0, 2).wants.orange_juice);
});
test('saved contract fields cannot override trusted rewards, wants or research points', () => {
  const game = new FactoryGame(); game.acceptContract(0); sell(game, 'bread', 6);
  const before = game.serialize();
  for (const extras of [{ reward: 'broken' }, { points: .5 }, { wants: { bread: 1 } }, { title: 'unexpected' }]) {
    const data = JSON.parse(before); Object.assign(data.career.contract, extras);
    assert.equal(game.restore(JSON.stringify(data)), false); assert.equal(game.serialize(), before);
  }
  Object.assign(game.state.career.contract, { reward: 'broken', points: .5 });
  const wallet = game.state.coins; assert.equal(game.claimContract().ok, true);
  assert.equal(game.state.coins, wallet + 30); assert.equal(game.state.career.points, 1);
});
