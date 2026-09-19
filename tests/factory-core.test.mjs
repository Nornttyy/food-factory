import test from 'node:test';
import assert from 'node:assert/strict';
import { FactoryGame, BUILDINGS, ITEMS, DIRS, AREAS, makeEntity, orderFor, upgradeCost } from '../src/factory-core.js';
function run(game, seconds) { for (let i = 0; i < Math.round(seconds * 10); i++) game.update(.1); }
function empty() { const g = new FactoryGame({ starter: false }); g.state.coins = 10000; return g; }
function add(g, type, x, y, dir = 0) { const result = g.place(type, x, y, dir); assert.equal(result.ok, true, result.message); return result.building; }
function countItems(g) { return g.state.buildings.reduce((n, b) => n + Number(Boolean(b.input)) + Number(Boolean(b.output)) + Number(Boolean(b.buffer)), 0); }

test('starter makes bread, sells once and completes the first order without input', () => {
  const g = new FactoryGame(); run(g, 45);
  assert.ok(g.state.delivered.bread >= 4); assert.equal(g.orderReady, true);
  assert.equal(g.state.coins, 450 + g.state.delivered.bread * ITEMS.bread.value);
  const before = g.state.coins; assert.equal(g.claimOrder().ok, true);
  assert.equal(g.state.coins, before + 95); assert.equal(g.unlockLevel, 1);
  assert.equal(g.claimOrder().ok, false); assert.deepEqual(g.state.orderProgress, {});
});
test('placement guards funds, bounds, directions, overlap and unlocks without mutation', () => {
  const g = new FactoryGame(), before = g.serialize();
  for (const args of [['belt', -1, 1], ['belt', 14, 1], ['belt', 1.5, 1], ['belt', 1, 2], ['belt', 1, 1, 4], ['juice_press', 1, 1], ['unknown', 1, 1]]) assert.equal(g.place(...args).ok, false);
  assert.equal(g.serialize(), before); g.state.coins = 0; assert.equal(g.place('belt', 0, 0).ok, false);
});
test('four directions move one item at most once per tick and at equal speed', () => {
  for (let dir = 0; dir < 4; dir++) {
    const g = empty(), [dx, dy] = DIRS[dir];
    const a = add(g, 'belt', 4, 3, dir), b = add(g, 'belt', 4 + dx, 3 + dy, dir), c = add(g, 'belt', 4 + dx * 2, 3 + dy * 2, dir);
    a.output = 'bread'; g.update(.1);
    assert.equal(a.output, null); assert.equal(b.output, 'bread'); assert.equal(c.output, null); assert.equal(countItems(g), 1);
    run(g, 1.1); assert.equal(c.output, null); run(g, .1); assert.equal(c.output, 'bread'); assert.equal(countItems(g), 1);
  }
});
test('merge competition reserves two target slots and neither duplicates nor loses items', () => {
  const g = empty(), a = add(g, 'belt', 1, 1), b = add(g, 'belt', 2, 0, 1), target = add(g, 'merger', 2, 1);
  a.output = 'bread'; b.output = 'orange_juice'; g.update(.1);
  assert.equal(countItems(g), 2); assert.ok(target.output); assert.ok(target.buffer); assert.equal(a.output, null); assert.equal(b.output, null);
  run(g, 10); assert.equal(countItems(g), 2);
});
test('splitter alternates and falls back to an open branch', () => {
  const g = empty(), s = add(g, 'splitter', 2, 2), right = add(g, 'belt', 3, 2), down = add(g, 'belt', 2, 3, 1);
  s.output = 'bread'; g.update(.1); assert.equal(right.output, 'bread'); assert.equal(s.roundRobin, 1);
  s.output = 'bread'; g.update(.1); assert.equal(down.output, 'bread'); assert.equal(s.roundRobin, 0);
  right.output = null; s.output = 'bread'; g.update(.1); assert.equal(right.output, 'bread');
  down.buffer = { item: 'bread', readyAt: down.readyAt + .6 };
  right.output = null; s.output = 'bread'; g.update(.1); assert.equal(right.output, 'bread'); assert.equal(s.roundRobin, 1);
});
test('wrong ingredients stay outside a machine and raw materials cannot be sold', () => {
  const g = empty(), belt = add(g, 'belt', 1, 1), oven = add(g, 'bread_oven', 2, 1);
  belt.output = 'flour'; run(g, 10); assert.equal(belt.output, 'flour'); assert.equal(oven.input, null); assert.equal(belt.blocked, true);
  g.remove(oven.id); add(g, 'depot', 2, 1); run(g, 10); assert.equal(belt.output, 'flour'); assert.equal(g.state.totalSold, 0);
});
test('blocked machines preserve output and buffered input without accumulating a burst', () => {
  const g = empty(), oven = add(g, 'bread_oven', 2, 1); oven.input = 'dough';
  run(g, 10); assert.equal(oven.output, 'bread'); oven.input = 'dough'; run(g, 30);
  assert.equal(oven.output, 'bread'); assert.equal(oven.input, 'dough'); assert.equal(oven.progress, 0);
  add(g, 'depot', 3, 1); run(g, .1); assert.equal(g.state.totalSold, 0); assert.equal(oven.output, null);
  run(g, 2); assert.equal(g.state.totalSold, 1); run(g, 5); assert.equal(g.state.totalSold, 2);
});
test('a full closed belt loop conserves its contents', () => {
  const g = empty(); [[2, 2, 0], [3, 2, 1], [3, 3, 2], [2, 3, 3]].forEach(([x, y, dir]) => { const b = add(g, 'belt', x, y, dir); b.output = 'dough'; b.buffer = { item: 'dough', readyAt: .6 }; });
  run(g, 100); assert.equal(countItems(g), 8); assert.ok(g.state.buildings.every(b => b.blocked));
});
test('full recipes produce strawberry donuts and juice through separate lines', () => {
  const g = empty(); g.state.orderIndex = 2;
  ['flour_hopper', 'dough_mixer', 'ring_former', 'donut_fryer', 'icing_machine', 'depot'].forEach((type, i) => add(g, type, i, 1));
  ['fruit_hopper', 'fruit_washer', 'juice_press', 'depot'].forEach((type, i) => add(g, type, i, 4));
  run(g, 60); assert.ok(g.state.delivered.donut_strawberry >= 5); assert.ok(g.state.delivered.orange_juice >= 5);
  assert.equal(g.state.delivered.flour, undefined); assert.equal(g.state.delivered.donut_plain, undefined);
});
test('paid construction and upgrades refund exactly once, starter cannot mint coins', () => {
  const g = empty(), before = g.state.coins, b = add(g, 'dough_mixer', 1, 1);
  assert.equal(g.upgrade(b.id).ok, true); assert.equal(g.upgrade(b.id).ok, true); assert.equal(g.upgrade(b.id).ok, false);
  b.input = 'flour'; const result = g.remove(b.id); assert.equal(result.discarded, true); assert.equal(g.state.coins, before);
  assert.equal(g.remove(b.id).ok, false); assert.equal(g.state.coins, before);
  const starter = new FactoryGame(); starter.state.buildings.map(b => b.id).forEach(id => starter.remove(id)); assert.equal(starter.state.coins, 450);
});
test('expansions charge once, unlock real cells and stop at grid bounds', () => {
  const g = empty(); g.state.coins = 50000;
  for (let stage = 0; stage < AREAS.length; stage++) {
    assert.deepEqual(g.area, AREAS[stage]); const [w, h] = g.area;
    assert.equal(g.place('belt', w - 1, h - 1).ok, true);
    assert.equal(g.place('belt', w, h - 1).ok, false); assert.equal(g.place('belt', w - 1, h).ok, false);
    const wallet = g.state.coins, cost = g.expansionCost;
    assert.equal(g.expand().ok, cost !== null); assert.equal(g.state.coins, wallet - (cost || 0));
  }
  assert.deepEqual(g.area, [40, 24]); assert.equal(g.expand().ok, false);
});
test('pause freezes production; double speed doubles fixed simulation time', () => {
  const g = new FactoryGame(); g.state.paused = true; const before = g.serialize(); run(g, 20); assert.equal(g.serialize(), before);
  g.state.paused = false; g.state.speed = 2; run(g, 5); assert.equal(g.state.time, 10);
  const time = g.state.time; g.update(NaN); g.update(-1); assert.equal(g.state.time, time);
});
test('save round-trip preserves paid costs, queues, order and future deliveries', () => {
  const a = new FactoryGame(); run(a, 12.3); a.upgrade(a.at(5, 2).id);
  const b = new FactoryGame(); assert.equal(b.restore(a.serialize()), true);
  run(a, 50); run(b, 50);
  assert.equal(a.state.coins, b.state.coins); assert.deepEqual(a.state.delivered, b.state.delivered); assert.deepEqual(a.state.orderProgress, b.state.orderProgress);
  assert.deepEqual(a.state.buildings.map(({ motion, flashUntil, idle, ...entity }) => entity), b.state.buildings.map(({ motion, flashUntil, idle, ...entity }) => entity));
});
test('damaged or foreign saves are rejected without replacing the working state', () => {
  const g = new FactoryGame(), base = JSON.parse(g.serialize()), before = g.serialize();
  const patches = [s => s.version = 2, s => s.coins = -10, s => s.expansion = 99, s => s.buildings[0].type = 'unknown', s => s.buildings[0].type = 'constructor', s => s.buildings[0].x = 99, s => s.buildings[0].input = 'bread', s => s.buildings[0].paid = 999999, s => s.buildings.push({ ...s.buildings[0] }), s => s.orderProgress = { bread: 9999 }, s => s.speed = Infinity, s => s.buildings[0].level = 0];
  for (const change of patches) { const data = structuredClone(base); change(data); assert.equal(g.restore(JSON.stringify(data)), false); assert.equal(g.serialize(), before); }
  for (const raw of [null, '', '{', '{}', '[]']) assert.equal(g.restore(raw), false);
});
test('orders continue beyond the introductory set with bounded rewards and targets', () => {
  for (const index of [0, 1, 2, 3, 4, 20, 1000]) {
    const order = orderFor(index); assert.ok(order.reward > 0 && order.reward <= 2400);
    for (const [item, n] of Object.entries(order.wants)) { assert.ok(ITEMS[item].value); assert.ok(n > 0 && n <= 80); }
  }
});

test('upgrading a paused partly processed machine preserves completion and yields a valid save', () => {
  const g = new FactoryGame(), oven = g.at(5, 2); oven.input = 'dough'; oven.progress = 2.5; g.state.paused = true;
  assert.equal(g.upgrade(oven.id).ok, true); assert.ok(oven.progress < 2.134);
  const restored = new FactoryGame(); assert.equal(restored.restore(g.serialize()), true); assert.equal(restored.state.paused, true);
});
test('gifted equipment can be recovered and replaced for free even after spending all coins', () => {
  const g = new FactoryGame(), oven = g.at(5, 2); g.remove(oven.id); assert.equal(g.state.stock.bread_oven, 1);
  g.expand(); g.state.coins = 0; const replacement = g.place('bread_oven', 5, 2);
  assert.equal(replacement.ok, true); assert.equal(replacement.building.gifted, true); assert.equal(g.state.stock.bread_oven, 0);
  assert.equal(g.place('bread_oven', 5, 3).ok, false); run(g, 30); assert.ok(g.state.coins > 0);
  const restored = new FactoryGame(); assert.equal(restored.restore(g.serialize()), true);
});
