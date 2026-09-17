import test from 'node:test';
import assert from 'node:assert/strict';
import { FactoryGame, AREAS, WIDTH, HEIGHT, upgradeCost } from '../src/factory-core.js';
import { FactoryCamera, CELL, cameraInsets } from '../src/factory-feel.js';
import { FactoryRenderer } from '../src/factory-renderer.js';

test('old expansion stages gain room without losing paid layouts, coins or progress', () => {
  for (const [stage, [w, h]] of [[10, 6], [12, 8], [14, 8]].entries()) {
    const game = new FactoryGame(); game.state.expansion = stage; game.place('belt', w - 1, h - 1);
    const old = JSON.parse(game.serialize()); delete old.business;
    const loaded = new FactoryGame(); assert.equal(loaded.restore(JSON.stringify(old)), true);
    assert.deepEqual(loaded.area, AREAS[stage]); assert.ok(loaded.area[0] >= w && loaded.area[1] >= h);
    assert.equal(loaded.state.coins, old.coins); assert.deepEqual(loaded.state.orderProgress, old.orderProgress);
    assert.equal(loaded.at(w - 1, h - 1).paid, 8);
  }
});

test('a fully occupied 960-machine factory round-trips with upgraded working contents', () => {
  const game = new FactoryGame({ starter: false }); game.state.expansion = 5; game.state.coins = 1000000;
  for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) {
    const b = game.place('bread_oven', x, y).building;
    b.paid += upgradeCost({ ...b, level: 1 }) + upgradeCost({ ...b, level: 2 }); b.level = 3; b.input = 'dough'; b.progress = 1.3;
  }
  assert.equal(game.state.buildings.length, 960); const raw = game.serialize(); assert.ok(raw.length < 500000);
  const loaded = new FactoryGame(); assert.equal(loaded.restore(raw), true);
  assert.deepEqual(loaded.area, [40, 24]); assert.equal(loaded.at(39, 23).progress, 1.3); assert.equal(loaded.at(39, 23).level, 3);
});

test('expansion preserves working zoom; overview fits while far corners remain editable on phones', () => {
  for (const [width, height] of [[1440, 900], [844, 390], [390, 844]]) {
    const camera = new FactoryCamera(); camera.resize(width, height, AREAS[0]); camera.centerOn(9, 5);
    const before = { x: camera.x, y: camera.y, scale: camera.transform.scale, zoom: camera.zoom };
    camera.resize(width, height, AREAS[5]); assert.deepEqual({ x: camera.x, y: camera.y, scale: camera.transform.scale, zoom: camera.zoom }, before);
    camera.overview(); const t = camera.transform, i = cameraInsets(width, height);
    assert.ok(t.x >= i.left - .001 && t.y >= i.top - .001);
    assert.ok(t.x + WIDTH * CELL * t.scale <= width - i.right + .001);
    assert.ok(t.y + HEIGHT * CELL * t.scale <= height - i.bottom + .001);
    camera.zoom = 1; camera.centerOn(39.5, 23.5); assert.equal(camera.x, 39.5 * CELL); assert.equal(camera.y, 23.5 * CELL);
    camera.zoomAt(100, width / 2, height / 2); assert.ok(CELL * camera.transform.scale >= 44);
    camera.ensureCell(39, 23); const a = camera.transform;
    assert.ok((39.5 * CELL * a.scale + a.x) >= i.left);
    assert.ok((23.5 * CELL * a.scale + a.y) <= height - i.bottom);
  }
});

test('rendering culls unseen buildings and indexes neighbors while simulation continues offscreen', () => {
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { value: { devicePixelRatio: 2 }, configurable: true });
  try {
    const ctx = new Proxy({ globalAlpha: 1 }, { get: (t, p) => p in t ? t[p] : () => {}, set: (t, p, v) => { t[p] = v; return true; } });
    const canvas = { width: 0, height: 0, getContext: () => ctx, getBoundingClientRect: () => ({ left: 30, top: 20, width: 844, height: 390 }) };
    const game = new FactoryGame({ starter: false }); game.state.coins = 1000000; game.state.expansion = 5;
    for (const [x, type] of ['flour_hopper', 'dough_mixer', 'bread_oven', 'depot'].entries()) game.place(type, x + 35, 22);
    for (let y = 0; y < 18; y++) for (let x = 0; x < 40; x++) game.place('belt', x, y);
    const renderer = new FactoryRenderer(canvas, { draw() {} }), ui = { selected: null, hover: null, reducedMotion: true };
    let linearQueries = 0, drawnBelts = 0; const originalAt = game.at.bind(game), drawBelt = renderer.drawBelt.bind(renderer);
    game.at = (...args) => { linearQueries++; return originalAt(...args); }; renderer.drawBelt = (...args) => { drawnBelts++; drawBelt(...args); };
    renderer.draw(game, ui, 100); assert.equal(linearQueries, 0); assert.ok(drawnBelts < 200);
    for (let n = 0; n < 300; n++) game.update(.1);
    assert.ok(game.state.delivered.bread > 0, 'an unseen factory still runs');
    renderer.camera.centerOn(39.5, 23.5); renderer.resize(game.area, ui);
    const t = renderer.transform;
    assert.deepEqual(renderer.cellAt(30 + t.x + 39.5 * CELL * t.scale, 20 + t.y + 23.5 * CELL * t.scale), { x: 39, y: 23 });
  } finally { if (oldWindow) Object.defineProperty(globalThis, 'window', oldWindow); else delete globalThis.window; }
});
