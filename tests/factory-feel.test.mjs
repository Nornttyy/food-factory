import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { FactoryCamera, jellyPose, foodPose, cameraInsets } from '../src/factory-feel.js';
import { FactoryGame } from '../src/factory-core.js';
import { FactoryRenderer } from '../src/factory-renderer.js';

test('Q spring compresses, overshoots, settles and honors reduced-motion', () => {
  assert.ok(jellyPose(0).sx > 1.2); assert.ok(jellyPose(.13).sx < 1);
  assert.ok(jellyPose(0, 'place').y < -20);
  assert.deepEqual(jellyPose(1, 'place'), { sx: 1, sy: 1, y: 0, angle: 0 });
  for (const kind of ['place', 'tap', 'release', 'produce', 'sale', 'upgrade']) for (let t = 0; t < 1; t += .01) {
    const pose = jellyPose(t, kind); assert.ok(pose.sx > .6 && pose.sx < 1.5); assert.ok(pose.sy > .6 && pose.sy < 1.5);
    assert.deepEqual(jellyPose(t, kind, true), { sx: 1, sy: 1, y: 0, angle: 0 });
  }
  assert.ok(Math.abs(foodPose(0).y) < 1e-10); assert.ok(foodPose(.5).y <= -9); assert.ok(Math.abs(foodPose(1).y) < 1e-10);
});
test('camera keeps a usable local scale even as the map grows to 40 by 24', () => {
  for (const [w, h] of [[1440, 900], [844, 390], [667, 375]]) {
    const active = new FactoryCamera(), whole = new FactoryCamera();
    active.resize(w, h, [10, 6]); whole.resize(w, h, [40, 24]);
    assert.equal(active.transform.scale, whole.transform.scale);
    const t = active.transform, i = cameraInsets(w, h);
    assert.ok(t.x >= i.left - .001); assert.ok(t.y >= i.top - .001);
    assert.ok(t.x + 720 * t.scale <= w - i.right + .001); assert.ok(t.y + 432 * t.scale <= h - i.bottom + .001);
    const before = { ...t }; active.resize(w, h, [10, 6], { dockOpen: true }); assert.deepEqual(active.transform, before);
  }
});
test('zoom preserves the pointer world anchor, pans consistently, clamps and resets', () => {
  const camera = new FactoryCamera(); camera.resize(1440, 900, [10, 6]);
  const worldAt = (x, y) => [(x - camera.transform.x) / camera.transform.scale, (y - camera.transform.y) / camera.transform.scale];
  const before = worldAt(600, 300); camera.zoomAt(1.5, 600, 300); const after = worldAt(600, 300);
  assert.ok(Math.abs(before[0] - after[0]) < 1e-8); assert.ok(Math.abs(before[1] - after[1]) < 1e-8);
  const old = camera.x; camera.pan(20, 0); assert.ok(camera.x < old);
  camera.zoomAt(100, 600, 300); assert.equal(camera.zoom, 3.2); camera.zoomAt(.001, 600, 300); assert.equal(camera.zoom, .18);
  camera.pan(1e8, -1e8); assert.equal(camera.x, 0); assert.equal(camera.y, 432);
  camera.fit([10, 6]); assert.equal(camera.zoom, 1); assert.equal(camera.x, 360);
  camera.resize(844, 390, [12, 8]); assert.equal(camera.x, 360); assert.equal(camera.y, 216);
});
test('render feedback is bounded and never contaminates simulation saves', () => {
  const g = new FactoryGame({ shop: false }), before = g.serialize();
  const renderer = new FactoryRenderer({ getContext: () => ({}) }, {});
  renderer.syncEffects(g, 100); renderer.pulse(1, 'upgrade', 120);
  for (let n = 0; n < 30; n++) renderer.burst(1, 2, 'upgrade', 200);
  assert.equal(renderer.particles.length, 100); assert.equal(g.serialize(), before);
  renderer.syncEffects(g, 1200); assert.equal(renderer.particles.length, 0); assert.equal(renderer.pulses.size, 0);
  renderer.reduced = true; renderer.pulse(1); renderer.burst(1, 2); assert.equal(renderer.particles.length, 0); assert.equal(renderer.pulses.size, 0);
});
test('full-window layout has no permanent sidebar column and starts with panels folded', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const css = await readFile(new URL('../factory-layout.css', import.meta.url), 'utf8');
  assert.match(html, /id="order-drawer"[^>]*hidden/); assert.match(html, /id="inspector-panel"[^>]*hidden/); assert.match(html, /id="palette"[^>]*hidden/);
  assert.match(css, /\.workspace,\.workshop,\.board-wrap\{position:absolute;inset:0\}/);
  assert.doesNotMatch(css, /grid-template-columns/); assert.match(css, /focus-mode/);
  assert.ok(html.indexOf('href="./factory.css') < html.indexOf('href="./factory-layout.css'), 'responsive overrides load after base styles');
});
