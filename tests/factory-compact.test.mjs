import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CafeFactoryGame, COMPACT_AREAS, STAFF_COSTS, WALK_SPEED } from '../src/factory-service.js';
import { AREAS } from '../src/factory-core.js';
import { yardLayout, worldArea } from '../src/factory-yard.js';

const fixtures = JSON.parse(await readFile(new URL('./fixtures/service-v016-saves.json', import.meta.url), 'utf8'));
const advance = (g, n) => { for (let i = 0; i < n; i++) g.update(.1); };
const stable = g => { const s = JSON.parse(g.serialize()); for (const b of s.buildings) { delete b.blocked; delete b.idle; } return s; };

test('starter has a genuinely smaller footprint, a usable line and six distinct recruitment positions', () => {
  const g = new CafeFactoryGame(); assert.deepEqual(g.area, [10, 6]); assert.deepEqual(g.worldArea, [15, 9]);
  assert.ok(g.worldArea[0] * g.worldArea[1] < 21 * 11 * .6);
  assert.equal(g.inside(9, 5), true); assert.equal(g.inside(10, 5), false);
  assert.equal(g.state.buildings.length, 8); advance(g, 1200); assert.equal(g.shelves[0].goods.length, 8);
  const { homes, hire } = yardLayout(g.area);
  assert.equal(homes.length, 6); assert.equal(new Set(homes.map(p => `${p.x},${p.y}`)).size, 6);
  for (const p of homes) {
    assert.ok(p.x >= g.area[0] && p.x < g.worldArea[0] && p.y < g.worldArea[1]);
    assert.ok(Math.abs(p.x - hire.x) > hire.width / 2, 'no recruits spawn behind the sign');
  }
});

test('each compact expansion adds real space, charges once and preserves its own dimensions on reload', () => {
  const g = new CafeFactoryGame(); g.state.coins = 100000;
  for (let stage = 0; stage < COMPACT_AREAS.length; stage++) {
    assert.deepEqual(g.area, COMPACT_AREAS[stage]);
    const loaded = new CafeFactoryGame(); assert.equal(loaded.restore(g.serialize()), true); assert.deepEqual(loaded.area, g.area);
    const coins = g.state.coins, cost = g.expansionCost, next = g.nextArea;
    if (next) { assert.equal(g.expand().ok, true); assert.deepEqual(g.area, next); assert.equal(g.state.coins, coins - cost); }
    else { const before = g.serialize(); assert.equal(g.expand().ok, false); assert.equal(g.serialize(), before); }
  }
});

test('genuine old pickup, carrying and wandering saves shrink safely without losing food, staff or money', () => {
  for (const name of ['pickup', 'deliver', 'wander']) {
    const raw = fixtures[name], g = new CafeFactoryGame(); assert.equal(g.restore(JSON.stringify(raw)), true);
    assert.deepEqual(g.area, [10, 6]); assert.equal(g.service.version, 4); assert.equal(g.state.coins, raw.coins);
    assert.deepEqual(JSON.parse(g.serialize()).buildings, raw.buildings); assert.equal(g.service.workers.length, 3);
    assert.deepEqual(g.service.workers.map(w => w.job), raw.service.workers.map(w => w.job));
    const meals = raw.buildings.reduce((n, b) => n + (b.goods?.length || 0), 0) + raw.service.workers.filter(w => w.job?.stage === 'deliver').length;
    for (const w of g.service.workers) { assert.equal(w.path, null); assert.equal(w.wander, null); assert.ok(w.x < g.worldArea[0] && w.y < g.worldArea[1]); }
    const loaded = new CafeFactoryGame(); assert.equal(loaded.restore(g.serialize()), true);
    advance(loaded, 600); assert.equal(loaded.service.served, raw.service.served + meals);
    assert.equal(loaded.state.coins, raw.coins + meals * 6); assert.equal(loaded.restore(loaded.serialize()), true);
    const before = loaded.state.coins; advance(loaded, 100); assert.equal(loaded.state.coins, before, 'no migration double payout');
  }
});

test('old edge machines and purchased land are kept and further expansion never becomes a paid no-op', () => {
  for (const name of ['edge', 'expanded']) {
    const raw = fixtures[name], g = new CafeFactoryGame(); assert.equal(g.restore(JSON.stringify(raw)), true);
    assert.deepEqual(g.area, AREAS[raw.expansion]); assert.deepEqual(JSON.parse(g.serialize()).buildings, raw.buildings);
    while (g.nextArea) {
      const before = g.area, next = g.nextArea; assert.ok(next[0] > before[0] && next[1] > before[1]);
      assert.equal(g.expand().ok, true); assert.deepEqual(g.area, next); assert.equal(g.restore(g.serialize()), true);
    }
    assert.deepEqual(g.area, [40, 24]);
  }
});

test('all six employees can collect and deliver, retain bounded motion and preserve deterministic saves', () => {
  const g = new CafeFactoryGame({ starter: false }); g.state.totalSold = g.service.served = 4; g.state.coins = 30000;
  const b = g.place('depot', 8, 2).building;
  for (const _ of STAFF_COSTS) assert.equal(g.recruit().ok, true);
  const carried = new Set(); let restChecked = false;
  for (let n = 0; n < 1500; n++) {
    b.goods = Array(8).fill('bread'); const previous = g.service.workers.map(w => ({ x: w.x, y: w.y })); g.update(.1);
    for (const [i, w] of g.service.workers.entries()) {
      assert.ok(Math.hypot(w.x - previous[i].x, w.y - previous[i].y) <= WALK_SPEED * .1 + 1e-8);
      assert.ok(!g.at(Math.floor(w.x), Math.floor(w.y)));
      if (w.job?.stage === 'deliver') carried.add(w.id);
      if (w.id >= 4 && w.wait > 0) restChecked = true;
    }
    if (n % 50 === 0) assert.equal(new CafeFactoryGame().restore(g.serialize()), true);
  }
  assert.deepEqual([...carried].sort(), [1, 2, 3, 4, 5, 6]); assert.ok(restChecked); assert.ok(g.service.served > 20);
  const loaded = new CafeFactoryGame(); assert.equal(loaded.restore(g.serialize()), true);
  for (let n = 0; n < 250; n++) { g.update(.1); loaded.update(.1); assert.deepEqual(stable(loaded), stable(g)); }
  loaded.state.paused = true; const frozen = loaded.serialize(); advance(loaded, 100); assert.equal(loaded.serialize(), frozen);
});

test('invalid compact dimensions and a seventh employee are rejected without changing a valid save', () => {
  const g = new CafeFactoryGame(), saved = g.serialize();
  for (const area of [null, [10], [9, 6], [10, 5], [15, 8], [10.5, 6], [10, 6, 7]]) {
    const raw = JSON.parse(saved); raw.workshopArea = area;
    assert.equal(g.restore(JSON.stringify(raw)), false); assert.equal(g.serialize(), saved);
  }
  g.state.totalSold = g.service.served = 4; g.state.coins = 30000;
  for (const _ of STAFF_COSTS) g.recruit();
  const full = g.serialize(), raw = JSON.parse(full); raw.service.workers.push({ ...raw.service.workers[0], id: 7 });
  assert.equal(g.restore(JSON.stringify(raw)), false); assert.equal(g.serialize(), full);
  const outside = JSON.parse(full); outside.service.workers[5].x = worldArea(g.area)[0] + .5;
  assert.equal(g.restore(JSON.stringify(outside)), false); assert.equal(g.serialize(), full);
});
