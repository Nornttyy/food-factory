import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { FactoryGame, BUILDINGS, FLOW_VERSION, DEPOT_SECONDS, durationFor, isTransport, transportCount } from '../src/factory-core.js';
import { FactoryRenderer } from '../src/factory-renderer.js';

const run = (g, seconds) => { for (let n = 0; n < Math.round(seconds * 10); n++) g.update(.1); };
const empty = () => { const g = new FactoryGame({ starter: false }); g.state.coins = 10000; return g; };
const add = (g, type, x, y, dir = 0) => { const r = g.place(type, x, y, dir); assert.equal(r.ok, true); return r.building; };
const goods = g => g.state.buildings.reduce((n, b) => n + Number(Boolean(b.input)) + Number(Boolean(b.output)) + Number(Boolean(b.buffer)), 0);
const restore = g => { const next = new FactoryGame(); assert.equal(next.restore(g.serialize()), true); return next; };

test('belts, mergers and splitters have exactly two FIFO slots, including simultaneous arrivals', () => {
  for (const type of ['belt', 'merger', 'splitter']) {
    const g = empty(), left = add(g, 'belt', 1, 2), above = add(g, 'belt', 2, 1, 1), target = add(g, type, 2, 2);
    left.output = 'bread'; above.output = 'butter_cookie'; g.update(.1);
    assert.equal(transportCount(target), 2); assert.equal(goods(g), 2);
    assert.deepEqual(new Set([target.output, target.buffer.item]), new Set(['bread', 'butter_cookie']));
    left.output = 'donut_plain'; run(g, 5);
    assert.equal(goods(g), 3); assert.equal(left.output, 'donut_plain'); assert.equal(g.canReceive(target, 'bread', left), false);
    assert.equal(restore(g).at(2, 2).buffer.item, target.buffer.item);
  }
});

test('a belt can send its head and receive a new tail on the same tick without moving twice', () => {
  const g = empty(), a = add(g, 'belt', 1, 1), b = add(g, 'belt', 2, 1), c = add(g, 'belt', 3, 1);
  a.output = 'bread'; b.output = 'butter_cookie'; g.update(.1);
  assert.equal(a.output, null); assert.equal(b.output, 'bread'); assert.equal(c.output, 'butter_cookie');
  assert.equal(goods(g), 2); assert.ok(b.readyAt > g.state.time); assert.ok(c.readyAt > g.state.time);
});

test('two waiting foods keep their FIFO order and a half-tile gap when a blockage clears', () => {
  const g = empty(), a = add(g, 'belt', 1, 1);
  a.output = 'bread'; a.buffer = { item: 'butter_cookie', readyAt: .6 }; run(g, 5);
  const b = add(g, 'belt', 2, 1), depot = add(g, 'depot', 3, 1);
  const sold = [], deliver = g.deliver.bind(g); g.deliver = (item, building) => { sold.push(item); return deliver(item, building); };
  g.update(.1); assert.equal(b.output, 'bread'); assert.equal(a.output, 'butter_cookie');
  run(g, .5); assert.equal(b.buffer, null); run(g, .1); assert.equal(b.buffer.item, 'butter_cookie');
  run(g, 8); assert.deepEqual(sold, ['bread', 'butter_cookie']); assert.equal(goods(g), 0); assert.equal(depot.input, null);
});

test('the first depot sale takes a full two seconds after receipt and never happens on intake', () => {
  const g = empty(), belt = add(g, 'belt', 1, 1), depot = add(g, 'depot', 2, 1), wallet = g.state.coins;
  belt.output = 'bread'; belt.buffer = { item: 'butter_cookie', readyAt: .6 };
  g.update(.1); assert.equal(depot.input, 'bread'); assert.equal(depot.progress, 0); assert.equal(g.state.coins, wallet);
  run(g, 1.9); assert.equal(g.state.totalSold, 0); assert.equal(goods(g), 2);
  g.update(.1); assert.equal(g.state.time, 2.1); assert.equal(g.state.totalSold, 1); assert.equal(g.state.coins, wallet + 6);
  assert.equal(depot.input, 'butter_cookie'); assert.equal(depot.progress, 0);
  run(g, 1.9); assert.equal(g.state.totalSold, 1); g.update(.1);
  assert.equal(g.state.totalSold, 2); assert.equal(g.state.coins, wallet + 14); assert.equal(goods(g), 0);
});

test('depot pause, save reload and double speed preserve the exact remaining processing time', () => {
  const g = empty(), belt = add(g, 'belt', 1, 1), depot = add(g, 'depot', 2, 1);
  belt.output = 'bread'; g.update(.1); run(g, 1); g.state.paused = true;
  const saved = g.serialize(); run(g, 20); assert.equal(g.serialize(), saved);
  const loaded = restore(g); assert.equal(loaded.at(2, 1).progress, depot.progress);
  loaded.state.paused = false; loaded.state.speed = 2; run(loaded, .4); assert.equal(loaded.state.totalSold, 0);
  run(loaded, .1); assert.equal(loaded.state.totalSold, 1); assert.equal(loaded.at(2, 1).input, null);
});

test('depot upgrades are 2 / 1.5 / 1 seconds, preserve progress and refund only actual costs', () => {
  const g = empty(), initial = g.state.coins, depot = add(g, 'depot', 1, 1);
  depot.input = 'bread'; run(g, 1); assert.equal(g.duration(depot), DEPOT_SECONDS[0]);
  assert.equal(g.upgrade(depot.id).ok, true); assert.equal(g.duration(depot), 1.5); assert.ok(Math.abs(depot.progress - .75) < 1e-9);
  assert.equal(g.upgrade(depot.id).ok, true); assert.equal(g.duration(depot), 1); assert.ok(Math.abs(depot.progress - .5) < 1e-9);
  const before = g.serialize(); assert.equal(g.upgrade(depot.id).ok, false); assert.equal(g.serialize(), before);
  g.state.career.points = 3; g.research('production'); g.research('transport');
  assert.equal(g.duration(depot), 1, 'only depot levels accelerate dispatch');
  const loaded = restore(g); assert.equal(loaded.at(1, 1).paid, 201);
  assert.equal(loaded.remove(depot.id).refund, 201); assert.equal(loaded.state.coins, initial);
  assert.equal(loaded.remove(depot.id).ok, false); assert.equal(loaded.state.coins, initial);
  const gifted = new FactoryGame(), free = gifted.at(8, 2), coins = gifted.state.coins;
  gifted.upgrade(free.id); assert.equal(gifted.remove(free.id).refund, 60); assert.equal(gifted.state.coins, coins);
  assert.equal(gifted.place('depot', 8, 2).building.level, 1);
});

test('poor players cannot upgrade depots and cannot upgrade transport belts', () => {
  const g = new FactoryGame(); g.state.coins = 0; const before = g.serialize();
  assert.equal(g.upgrade(g.at(8, 2).id).ok, false); assert.equal(g.upgrade(g.at(2, 2).id).ok, false);
  assert.equal(g.serialize(), before);
});

test('simultaneously finishing depots reserve the final warehouse space and keep blocked food', () => {
  const g = empty(), a = add(g, 'depot', 1, 1), b = add(g, 'depot', 3, 1);
  a.mode = b.mode = 'store'; a.input = 'bread'; b.input = 'butter_cookie'; a.progress = b.progress = 1.9;
  g.state.business.warehouse = { bread: 99 }; const wallet = g.state.coins;
  g.update(.1); assert.equal(g.warehouseUsed, 100); assert.equal(goods(g), 1); assert.equal(g.state.coins, wallet);
  const held = g.state.buildings.find(b => b.input); assert.equal(held.progress, 2); assert.equal(held.blocked, true);
  const loaded = restore(g); run(loaded, 20); assert.equal(loaded.warehouseUsed, 100); assert.equal(goods(loaded), 1);
  loaded.sellWarehouse('bread', 1); loaded.update(.1);
  assert.equal(loaded.warehouseUsed, 100); assert.equal(goods(loaded), 0); assert.equal(loaded.state.totalSold, 0);
  assert.deepEqual(loaded.state.orderProgress, {});
});

test('changing dispatch mode does not reset or bypass its processing cycle', () => {
  const g = empty(), belt = add(g, 'belt', 1, 1), depot = add(g, 'depot', 2, 1);
  belt.output = 'bread'; g.update(.1); run(g, 1);
  const progress = depot.progress; g.setDepotMode(depot.id, 'store'); g.setDepotMode(depot.id, 'sell');
  assert.equal(depot.progress, progress); run(g, .9); assert.equal(g.state.totalSold, 0);
  g.setDepotMode(depot.id, 'store'); run(g, .1); assert.equal(g.warehouseUsed, 1); assert.equal(g.state.totalSold, 0);
});

test('all production takes 50 percent longer and transport research preserves both queued timers', () => {
  const g = empty(); g.state.career.points = 6;
  for (const [type, def] of Object.entries(BUILDINGS)) if (def.duration) {
    assert.equal(durationFor({ type, level: 1 }), def.duration * 1.5);
  }
  const a = add(g, 'belt', 1, 2), b = add(g, 'belt', 2, 1, 1), target = add(g, 'merger', 2, 2);
  a.output = 'bread'; b.output = 'butter_cookie'; g.update(.1); run(g, .3);
  assert.equal(g.duration(target), 1.2);
  for (let level = 1; level <= 3; level++) {
    const head = (target.readyAt - g.state.time) / g.duration(target), tail = (target.buffer.readyAt - g.state.time) / g.duration(target);
    assert.equal(g.research('transport').ok, true); assert.equal(g.duration(target), (12 - level) / 10);
    assert.ok(Math.abs((target.readyAt - g.state.time) / g.duration(target) - head) < 1e-9);
    assert.ok(Math.abs((target.buffer.readyAt - g.state.time) / g.duration(target) - tail) < 1e-9);
    assert.equal(goods(restore(g)), 2);
  }
});

test('a genuine v0.10.2 save migrates machine completion and single cargo without repeat conversion', async () => {
  const old = JSON.parse(await readFile(new URL('./fixtures/flow-v0102-save.json', import.meta.url), 'utf8'));
  const g = new FactoryGame(); assert.equal(g.restore(JSON.stringify(old)), true);
  assert.equal(g.state.flowVersion, FLOW_VERSION); assert.equal(g.state.coins, old.coins); assert.equal(g.state.paused, old.paused);
  assert.deepEqual(g.state.orderProgress, old.orderProgress); assert.deepEqual(g.state.career, old.career);
  for (const b of g.state.buildings) {
    const previous = old.buildings.find(p => p.id === b.id); assert.equal(b.input, previous.input); assert.equal(b.output, previous.output);
    assert.equal(b.buffer, null); assert.equal(b.paid, previous.paid);
    const def = BUILDINGS[b.type];
    if (def.duration) assert.ok(Math.abs(b.progress - previous.progress * 1.5) < 1e-8);
    if (isTransport(b) && b.output) assert.ok(Math.abs((b.readyAt - old.time) - Math.max(0, previous.readyAt - old.time) * 3) < 1e-8);
  }
  assert.equal(restore(g).serialize(), g.serialize());
});

test('damaged buffer/depot/timing schemas reject atomically instead of dropping queued cargo', () => {
  const g = empty(), belt = add(g, 'belt', 1, 1), depot = add(g, 'depot', 2, 1);
  belt.output = 'bread'; belt.buffer = { item: 'butter_cookie', readyAt: .6 };
  const base = JSON.parse(g.serialize()), before = g.serialize();
  for (const mutate of [
    s => s.flowVersion = 1, s => s.flowVersion = null, s => s.flowVersion = '2',
    s => s.buildings[0].buffer = [], s => s.buildings[0].buffer.item = 'missing', s => s.buildings[0].buffer.item = ['bread'],
    s => s.buildings[0].buffer.extra = 1, s => s.buildings[0].buffer.readyAt = 3, s => s.buildings[0].buffer.readyAt = -1,
    s => s.buildings[0].output = null, s => s.buildings[0].output = ['bread'], s => s.buildings[0].readyAt = 1.3,
    s => s.buildings[1].buffer = { item: 'bread', readyAt: 0 }, s => s.buildings[1].input = 'dough',
    s => s.buildings[1].input = ['bread'], s => s.buildings[1].progress = 1,
    s => { s.buildings[1].input = 'bread'; s.buildings[1].progress = 2.2; },
    s => s.buildings[1].level = 4,
  ]) {
    const s = structuredClone(base); mutate(s); assert.equal(g.restore(JSON.stringify(s)), false); assert.equal(g.serialize(), before);
  }
  assert.equal(depot.input, null);
});

test('a full 960-tile double-slot map remains under the save-size limit and preserves all 1920 foods', () => {
  const g = empty(); g.state.expansion = 5;
  for (let y = 0; y < 24; y++) for (let x = 0; x < 40; x++) {
    const b = add(g, 'belt', x, y); b.output = 'bread'; b.buffer = { item: 'butter_cookie', readyAt: .6 };
  }
  assert.equal(goods(g), 1920); assert.ok(g.serialize().length < 500000);
  const loaded = restore(g); run(loaded, 2); assert.equal(goods(loaded), 1920); assert.equal(goods(restore(loaded)), 1920);
});

test('rendering shows two separate foods and the depot pending meal without mutating saved state', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { value: { devicePixelRatio: 1 }, configurable: true });
  try {
    const draws = [], translations = [], ctx = new Proxy({ globalAlpha: 1, translate: (x, y) => translations.push([x, y]) }, { get: (t, p) => p in t ? t[p] : () => {}, set: (t, p, v) => { t[p] = v; return true; } });
    const canvas = { getContext: () => ctx, getBoundingClientRect: () => ({ width: 1000, height: 600 }) };
    const g = empty(), belt = add(g, 'belt', 2, 2), depot = add(g, 'depot', 3, 2);
    belt.output = 'bread'; belt.buffer = { item: 'butter_cookie', readyAt: .6 }; depot.input = 'donut_plain'; depot.progress = 1;
    const before = g.serialize(), renderer = new FactoryRenderer(canvas, { draw: (_, ...args) => draws.push(args) });
    renderer.draw(g, { selected: null, hover: null, reducedMotion: true }, 100);
    assert.equal(draws.filter(d => d[0] === 'bread' && d[3] === 24).length, 1);
    assert.equal(draws.filter(d => d[0] === 'butter_cookie' && d[3] === 24).length, 1);
    assert.ok(draws.some(d => d[0] === 'donut_plain' && d[3] === 21));
    assert.ok(translations.some(([x, y]) => x === 194 && y === 180)); assert.ok(translations.some(([x, y]) => x === 166 && y === 180));
    assert.equal(g.serialize(), before);
  } finally { if (descriptor) Object.defineProperty(globalThis, 'window', descriptor); else delete globalThis.window; }
});
