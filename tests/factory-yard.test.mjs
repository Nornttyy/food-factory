import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { worldArea, yardLayout, serviceHit, findPath, shelfApproaches, customerPose } from '../src/factory-yard.js';
import { presentationTime, cameraInsets } from '../src/factory-feel.js';
import { CafeFactoryGame, WALK_SPEED } from '../src/factory-service.js';
import { FactoryRenderer } from '../src/factory-renderer.js';
import { AREAS } from '../src/factory-core.js';

test('one world plot stays outside every expansion, without reserving any existing buildable tile', () => {
  for (const area of AREAS) {
    const yard = yardLayout(area), bounds = worldArea(area);
    assert.equal(yard.x, area[0], 'the service floor touches the factory without a gap'); assert.equal(yard.x + yard.width, bounds[0]); assert.equal(yard.y + yard.height, bounds[1]);
    for (const [i, p] of yard.spots.entries()) assert.deepEqual(serviceHit(p, area), { kind: 'customer', slot: i });
    for (const [i, p] of yard.spots.entries()) assert.deepEqual(serviceHit({ x: p.x + .5, y: p.y - 1.4 }, area), { kind: 'customer', slot: i }, 'the food bubble is tappable too');
    assert.deepEqual(serviceHit(yard.hire, area), { kind: 'hire' }); assert.equal(serviceHit({ x: 8.5, y: 2.5 }, area), null);
  }
});
test('world hit tests follow the very same camera pan, zoom and resize as machines on phones and desktop', () => {
  const old = globalThis.window; globalThis.window = { devicePixelRatio: 2 };
  try {
    for (const [width, height] of [[1440, 900], [844, 390], [390, 844], [320, 568]]) {
      const canvas = { getContext: () => ({}), getBoundingClientRect: () => ({ width, height, left: 9, top: 17 }) };
      const renderer = new FactoryRenderer(canvas, {}), g = new CafeFactoryGame(), spot = yardLayout(g.area).spots[0];
      renderer.resize(g.area, { customerArea: true }); renderer.camera.centerOn(spot.x, spot.y); renderer.resize(g.area, { customerArea: true });
      let previous;
      for (let n = 0; n < 3; n++) {
        const t = renderer.transform, x = 9 + t.x + spot.x * 72 * t.scale, y = 17 + t.y + spot.y * 72 * t.scale;
        const hit = renderer.worldAt(x, y); assert.ok(Math.abs(hit.x - spot.x) < 1e-9); assert.deepEqual(serviceHit(hit, g.area), { kind: 'customer', slot: 0 });
        if (previous) assert.notDeepEqual([x, y], previous); previous = [x, y]; renderer.pan(31, -19); renderer.zoom(1.17, 100, 110);
      }
      const inset = cameraInsets(width, height, { customerArea: true }); assert.equal(inset.left, inset.right, 'no hidden customer sidebar consumes the map');
    }
  } finally { globalThis.window = old; }
});
test('walking routes avoid conveyors and machines, and sealed shelves have no route', () => {
  const g = new CafeFactoryGame(), start = yardLayout(g.area).homes[0], shelf = g.shelves[0];
  const path = findPath(g.area, g.state.buildings, start, shelfApproaches(shelf)); assert.ok(path.length > 0 && path.length <= 5, 'compact recruitment is closer to the starter shelf');
  let previous = start;
  for (const p of path) { assert.equal(g.at(Math.floor(p.x), Math.floor(p.y)), undefined); assert.equal(Math.abs(p.x - previous.x) + Math.abs(p.y - previous.y), 1); previous = p; }
  for (const p of shelfApproaches(shelf)) if (!g.at(Math.floor(p.x), Math.floor(p.y))) g.place('belt', Math.floor(p.x), Math.floor(p.y));
  assert.equal(findPath(g.area, g.state.buildings, start, shelfApproaches(shelf)), null);
  g.state.totalSold = g.service.served = 4; g.state.coins = 10000; g.shelves[0].goods = ['bread']; g.recruit(); const coins = g.state.coins;
  for (let i = 0; i < 150; i++) g.update(.1);
  assert.equal(g.service.workers[0].job, null); assert.equal(g.state.coins, coins); assert.ok(g.shelves[0].goods.includes('bread'));
});
test('workers take real bounded steps, cannot be built over, and remain free to walk after delivery', () => {
  const g = new CafeFactoryGame(); g.state.totalSold = g.service.served = 4; g.state.coins = 10000; g.shelves[0].goods = ['bread']; g.state.buildings = [g.shelves[0]]; g.recruit();
  const w = g.service.workers[0]; let carrying = false, visitedFactory = false;
  for (let n = 0; n < 210; n++) {
    const before = { x: w.x, y: w.y }; g.update(.1);
    assert.ok(Math.hypot(w.x - before.x, w.y - before.y) <= WALK_SPEED * .1 + 1e-8);
    assert.equal(g.at(Math.floor(w.x), Math.floor(w.y)), undefined);
    visitedFactory ||= w.x < g.area[0]; carrying ||= w.job?.stage === 'deliver';
    if (g.inside(Math.floor(w.x), Math.floor(w.y))) assert.equal(g.place('belt', Math.floor(w.x), Math.floor(w.y)).ok, false);
  }
  assert.ok(visitedFactory && carrying); assert.equal(g.service.served, 5); assert.equal(w.job, null);
  assert.ok(w.stroll > 0, 'an idle employee walks instead of being pinned to the rest area');
});
test('expansion preserves buildings and relocates the annex without losing carried food or breaking saves', () => {
  const g = new CafeFactoryGame(); g.state.totalSold = g.service.served = 4; g.state.coins = 10000; g.shelves[0].goods = ['bread']; g.recruit(); g.update(.1);
  const layout = g.state.buildings.map(b => [b.id, b.x, b.y]), job = structuredClone(g.service.workers[0].job); g.state.coins = 10000;
  g.expand(); assert.deepEqual(g.state.buildings.map(b => [b.id, b.x, b.y]), layout); assert.deepEqual(g.service.workers[0].job, job);
  assert.equal(g.service.workers[0].path, null); const restored = new CafeFactoryGame(); assert.equal(restored.restore(g.serialize()), true);
  for (let n = 0; n < 300 && restored.service.served < 5; n++) restored.update(.1); assert.equal(restored.service.served, 5);
});
test('legacy four-second carrying jobs migrate without a second pickup, loss or double payout', () => {
  const g = new CafeFactoryGame(); g.state.totalSold = g.service.served = 4; g.state.coins = 10000; g.state.buildings = [];
  g.service.version = 1; g.service.workers = [{ id: 1, job: { customerId: 1, item: 'bread', remaining: 1.2, x: 8, y: 2 } }];
  const coins = g.state.coins, loaded = new CafeFactoryGame(); assert.equal(loaded.restore(g.serialize()), true);
  assert.equal(loaded.service.version, 4); assert.equal(loaded.service.workers[0].job.stage, 'deliver');
  for (let n = 0; n < 300; n++) loaded.update(.1); assert.equal(loaded.state.coins, coins + 6); assert.equal(loaded.service.served, 5);
  assert.equal(loaded.restore(loaded.serialize()), true); for (let n = 0; n < 100; n++) loaded.update(.1); assert.equal(loaded.state.coins, coins + 6);
});
test('blocking a carrying employee preserves the meal through save/restore and resumes after opening the path', () => {
  const g = new CafeFactoryGame(); g.state.totalSold = g.service.served = 4; g.state.coins = 10000; g.expand(); g.shelves[0].goods = ['bread']; g.recruit();
  for (let n = 0; n < 200 && g.service.workers[0].job?.stage !== 'deliver'; n++) g.update(.1);
  assert.equal(g.service.workers[0].job.stage, 'deliver');
  for (const [x, y] of [[7, 3], [7, 4], [7, 5], [8, 5], [9, 5], [10, 5], [10, 4], [10, 3], [10, 2], [9, 2]]) assert.equal(g.place('belt', x, y).ok, true);
  const coins = g.state.coins; for (let n = 0; n < 50; n++) g.update(.1);
  assert.equal(g.state.coins, coins); assert.equal(g.service.workers[0].job.item, 'bread'); assert.equal(g.service.workers[0].path, null);
  const loaded = new CafeFactoryGame(); assert.equal(loaded.restore(g.serialize()), true); loaded.remove(loaded.at(10, 3).id); const afterRefund = loaded.state.coins;
  for (let n = 0; n < 200 && loaded.service.served < 5; n++) loaded.update(.1);
  assert.equal(loaded.state.coins, afterRefund + 6); assert.equal(loaded.service.served, 5);
});
test('presentation advances between ticks at both speeds and freezes when paused; customer poses stay world-relative', () => {
  for (const speed of [1, 2]) {
    const g = new CafeFactoryGame(); g.state.speed = speed; let previous = presentationTime(g);
    for (let n = 0; n < 180; n++) { g.update(1 / 60); const next = presentationTime(g); assert.ok(Math.abs(next - previous - speed / 60) < 1e-8); previous = next; }
    g.state.paused = true; const frozen = presentationTime(g); g.update(.1); assert.equal(presentationTime(g), frozen);
  }
  const spot = yardLayout([14, 8]).spots[0]; assert.ok(customerPose({ cooldown: 0 }, spot, 0).x > spot.x);
  assert.equal(customerPose({ cooldown: 2 }, spot, 2).x, spot.x); assert.equal(customerPose({ cooldown: 0 }, spot, 0, 0, true).x, spot.x);
});
test('world animation does not repeatedly measure DOM or write gameplay saves', () => {
  const old = globalThis.window; globalThis.window = { devicePixelRatio: 1 };
  try {
    let reads = 0; const ctx = new Proxy({}, { get: () => () => {} });
    const renderer = new FactoryRenderer({ getContext: () => ctx, getBoundingClientRect: () => { reads++; return { left: 0, top: 0, width: 900, height: 500 }; } }, { draw() {} });
    const g = new CafeFactoryGame(), before = g.serialize(); for (let n = 0; n < 120; n++) renderer.draw(g, { selected: null, customerArea: true }, n * 16.67);
    assert.equal(reads, 1); assert.equal(g.serialize(), before);
  } finally { globalThis.window = old; }
});
test('the independent customer viewport and portrait blocker are removed, recipes stay nonmodal', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8'), css = await readFile(new URL('../factory-service.css', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /service-area|service-yard|orientation-hint|portrait-continue/); assert.doesNotMatch(css, /service-width|service-scene|customer-spot/);
  assert.match(html, /<section id="quick-recipe"/); for (const id of ['factory-jump', 'service-jump', 'staff-jump']) assert.ok(html.includes(`id="${id}"`));
  assert.match(css, /min-height:44px/); assert.match(css, /safe-area-inset/);
  assert.match(css, /top:calc\(max\(8px,env\(safe-area-inset-top\)\) \+ 104px\)/);
  assert.match(css, /bottom:calc\(max\(9px,env\(safe-area-inset-bottom\)\) \+ 73px\)/);
});
