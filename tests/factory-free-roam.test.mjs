import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CafeFactoryGame, WALK_SPEED } from '../src/factory-service.js';
import { yardLayout, findPath, drawYardGround } from '../src/factory-yard.js';
import { AREAS } from '../src/factory-core.js';

function workshop() { const g = new CafeFactoryGame({ starter: false }); g.state.totalSold = g.service.served = 4; g.state.coins = 10000; return g; }
const advance = (g, n) => { for (let i = 0; i < n; i++) g.update(.1); };
const stable = g => { const s = JSON.parse(g.serialize()); for (const b of s.buildings) { delete b.blocked; delete b.idle; } return s; };
const legacyWorker = w => { delete w.wander; delete w.wait; delete w.stroll; return w; };

test('idle employees leave recruitment, explore both factory and customer ground and never teleport', () => {
  const g = workshop(); g.recruit(); const w = g.service.workers[0]; let inFactory = false, returned = false;
  const visited = new Set();
  for (let n = 0; n < 700; n++) {
    const before = { x: w.x, y: w.y }; g.update(.1);
    assert.ok(Math.hypot(w.x - before.x, w.y - before.y) <= WALK_SPEED * .1 + 1e-8);
    visited.add(`${Math.floor(w.x)},${Math.floor(w.y)}`); inFactory ||= w.x < g.area[0]; returned ||= inFactory && w.x >= g.area[0];
    assert.equal(w.job, null); assert.equal(g.at(Math.floor(w.x), Math.floor(w.y)), undefined);
  }
  assert.ok(inFactory && returned); assert.ok(visited.size > 20); assert.ok(w.stroll > 3);
  assert.equal(g.service.served, 4, 'wandering cannot manufacture sales');
});
test('work interrupts an idle walk immediately, without returning to recruitment or prematurely taking food', () => {
  const g = workshop(), b = g.place('depot', 2, 2).building; g.recruit(); advance(g, 5);
  const w = g.service.workers[0]; assert.ok(w.wander); const before = { x: w.x, y: w.y }; b.goods.push('bread');
  g.update(.1); assert.equal(w.job.stage, 'pickup'); assert.equal(w.job.shelfId, b.id); assert.equal(w.wander, null);
  assert.deepEqual({ x: w.x, y: w.y }, before); assert.deepEqual(b.goods, ['bread']); assert.equal(w.wait, 0);
});
test('workers prefer the nearest reachable shelf, not the first one built, and chain deliveries from their current position', () => {
  const g = workshop(), far = g.place('depot', 0, 0).building, near = g.place('depot', 9, 5).building;
  far.goods = ['bread']; near.goods = ['bread', 'bread', 'bread']; g.recruit(); g.update(.1);
  const w = g.service.workers[0]; assert.equal(w.job.shelfId, near.id);
  for (let n = 0; n < 250 && g.service.served === 4; n++) g.update(.1);
  assert.equal(g.service.served, 5); const deliveredAt = { x: w.x, y: w.y };
  assert.notDeepEqual(deliveredAt, yardLayout(g.area).homes[0]); g.update(.1);
  assert.deepEqual({ x: w.x, y: w.y }, deliveredAt); assert.equal(w.job.stage, 'pickup'); assert.equal(w.job.shelfId, near.id);
  assert.equal(w.wander, null); assert.deepEqual(far.goods, ['bread']);
});
test('free walking, pauses and future destinations round-trip deterministically', () => {
  const g = workshop(); g.recruit(); advance(g, 13); const loaded = new CafeFactoryGame();
  assert.equal(loaded.restore(g.serialize()), true); assert.deepEqual(loaded.service, g.service);
  for (let n = 0; n < 500; n++) { g.update(.1); loaded.update(.1); assert.deepEqual(stable(loaded), stable(g)); }
  loaded.state.paused = true; const frozen = loaded.serialize(); advance(loaded, 30); assert.equal(loaded.serialize(), frozen);
});
test('old staff keep their number, money and pending delivery when upgraded to free walking', () => {
  const g = workshop(), b = g.place('depot', 8, 2).building; b.goods = ['bread'];
  for (let i = 0; i < 3; i++) g.recruit(); advance(g, 5);
  // A genuine v2 shape: idle employees were stationary at their homes.
  const raw = JSON.parse(g.serialize()); raw.service.version = 2; raw.coins = 37; delete raw.workshopArea;
  for (const [i, w] of raw.service.workers.entries()) {
    legacyWorker(w); if (!w.job) { Object.assign(w, yardLayout(AREAS[0], true).homes[i]); w.path = null; }
  }
  const before = structuredClone(raw.service.workers[0]), loaded = new CafeFactoryGame(); assert.equal(loaded.restore(JSON.stringify(raw)), true);
  assert.equal(loaded.service.version, 4); assert.equal(loaded.service.workers.length, 3); assert.equal(loaded.state.coins, 37);
  const w = loaded.service.workers[0]; assert.equal(w.x, before.x); assert.equal(w.y, before.y); assert.deepEqual(w.job, before.job); assert.equal(w.path, null);
  advance(loaded, 250); assert.equal(loaded.service.served, 5); assert.equal(loaded.state.coins, 43); assert.equal(loaded.recruit().ok, false);
});
test('old v2 return routes are recomputed in place and are interruptible by new work', () => {
  const g = workshop(), b = g.place('depot', 8, 2).building; g.recruit();
  const w = legacyWorker(g.service.workers[0]); w.x = 9.5; w.y = 3.5; w.path = findPath(AREAS[0], g.state.buildings, w, [yardLayout(AREAS[0], true).homes[0]], true); g.service.version = 2; delete g.state.workshopArea;
  const loaded = new CafeFactoryGame(); assert.equal(loaded.restore(g.serialize()), true); const migrated = loaded.service.workers[0];
  assert.equal(migrated.wander, null); assert.equal(migrated.path, null); loaded.shelves[0].goods = ['bread']; loaded.update(.1);
  assert.equal(migrated.job.shelfId, b.id); assert.equal(migrated.wander, null); assert.equal(migrated.x, 9.5); assert.equal(migrated.y, 3.5);
});
test('corrupt wandering state is rejected atomically and expansion discards out-of-date destinations', () => {
  const g = workshop(); g.recruit(); advance(g, 4); const saved = g.serialize(); assert.ok(g.service.workers[0].wander);
  for (const corrupt of [w => w.wander.x = -1, w => w.wander.y += .2, w => w.wait = 8, w => w.stroll = -1, w => delete w.wander, w => w.wander = null, w => w.path[0].x += 20]) {
    const raw = JSON.parse(saved); corrupt(raw.service.workers[0]); assert.equal(g.restore(JSON.stringify(raw)), false); assert.equal(g.serialize(), saved);
  }
  assert.equal(g.expand().ok, true); assert.equal(g.service.workers[0].wander, null); assert.equal(g.service.workers[0].path, null); assert.equal(g.restore(g.serialize()), true);
  advance(g, 20); assert.ok(g.service.workers[0].wander || g.service.workers[0].wait > 0);
});
test('continuous world paving touches the whole factory edge and bottom, without a fence or rounded island', async () => {
  const rects = [], ctx = new Proxy({ fillRect: (...p) => rects.push(p) }, { get: (o, p) => p in o ? o[p] : () => {} });
  drawYardGround(ctx, [14, 8], { draw() {} });
  assert.ok(rects.some(([x, y, w, h]) => x === 14 && y === 0 && w === 5 && h === 9));
  assert.ok(rects.some(([x, y, w, h]) => x === 0 && y === 8 && w >= 14 && h === 1));
  const source = await readFile(new URL('../src/factory-yard.js', import.meta.url), 'utf8'); assert.doesNotMatch(source, /ctx\.roundRect|员工休息处/);
});
