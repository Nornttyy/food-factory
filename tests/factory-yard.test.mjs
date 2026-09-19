import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { WorkerMotion, customerPose, yardLayout } from '../src/factory-yard.js';
import { presentationTime, yardWidth } from '../src/factory-feel.js';
import { CafeFactoryGame } from '../src/factory-service.js';
import { FactoryRenderer } from '../src/factory-renderer.js';

test('presentation time advances continuously across tick boundaries at both speeds and freezes on pause', () => {
  for (const speed of [1, 2]) {
    const g = new CafeFactoryGame(); g.state.speed = speed; let previous = presentationTime(g);
    for (let n = 0; n < 180; n++) { g.update(1 / 60); const next = presentationTime(g); assert.ok(Math.abs(next - previous - speed / 60) < 1e-8); previous = next; }
    g.update(.013); const frozen = presentationTime(g); g.state.paused = true;
    for (let n = 0; n < 60; n++) g.update(1 / 60); assert.equal(presentationTime(g), frozen);
  }
});

test('courier travels from counter to customer, returns continuously, and carries only after pickup', () => {
  const route = new WorkerMotion(), worker = { id: 1, job: { customerId: 1 } }, home = { x: 20, y: 300 }, target = { x: 140, y: 80 };
  let pose = route.pose(worker, home, target, 0, 0); assert.equal(pose.x, home.x); assert.equal(pose.y, home.y);
  for (let n = 1; n <= 240; n++) {
    const next = route.pose(worker, home, target, n / 60, n / 60); assert.ok(Math.hypot(next.x - pose.x, next.y - pose.y) < 2); pose = next;
  }
  assert.equal(pose.x, target.x); assert.equal(pose.y, target.y);
  worker.job = null; const start = route.pose(worker, home, home, 4, 0); assert.equal(start.x, pose.x); assert.equal(start.y, pose.y);
  pose = route.pose(worker, home, home, 4.5, 0); assert.ok(pose.y > target.y && pose.y < home.y);
  pose = route.pose(worker, home, home, 5, 0); assert.equal(pose.y, home.y); assert.equal(pose.carrying, false);
});

test('back-to-back jobs do not teleport staff to the counter or shorten sales timing', () => {
  const route = new WorkerMotion(), worker = { id: 1, job: { customerId: 1 } }, home = { x: 20, y: 300 }, a = { x: 140, y: 80 }, b = { x: 140, y: 180 };
  route.pose(worker, home, a, 0, 0); const end = route.pose(worker, home, a, 4, 4);
  worker.job = { customerId: 2 }; let p = route.pose(worker, home, b, 4, 0);
  assert.equal(p.x, end.x); assert.equal(p.y, end.y); assert.equal(p.carrying, false);
  p = route.pose(worker, home, b, 5, 1); assert.equal(p.x, home.x); assert.equal(p.y, home.y); assert.equal(p.carrying, true);
  p = route.pose(worker, home, b, 8, 4); assert.equal(p.x, b.x); assert.equal(p.y, b.y);
});

test('customer entrance and departure ease continuously; reduced motion holds the serving spot', () => {
  const spot = { x: 150, y: 100, size: 70 }, c = { cooldown: 0 };
  const first = customerPose(c, spot, 0, 0), mid = customerPose(c, spot, .5, 0), end = customerPose(c, spot, 1, 0);
  assert.ok(first.x > mid.x && mid.x > end.x); assert.equal(end.x, 150);
  const fed = customerPose({ cooldown: 2 }, spot, 0, .02); assert.equal(fed.x, 150); assert.equal(fed.alpha, 1);
  assert.ok(customerPose({ cooldown: .1 }, spot, 1.9, .05).x > 200);
  assert.deepEqual(customerPose(c, spot, .2, .03, true), { x: 150, y: 100, alpha: 1 });
});

test('terrain layout separates customers, staff homes and the serving counter on desktop and phones', () => {
  for (const [w, h] of [[1440, 900], [844, 390], [667, 375], [600, 320], [390, 782]]) {
    const layout = yardLayout(yardWidth(w), h); assert.equal(layout.spots.length, 3); assert.equal(layout.homes.length, 3);
    for (const spot of layout.spots) { assert.ok(spot.x + spot.size / 2 < layout.width); assert.ok(spot.y + spot.size * .4 < layout.counterY); }
    for (const home of layout.homes) { assert.ok(home.x > 0 && home.x < layout.width); assert.ok(home.y < layout.counterY); }
    assert.ok(layout.counterY + 45 < h - 34);
  }
});

test('factory animation also avoids repeated layout queries and preserves the model', () => {
  const old = globalThis.window; globalThis.window = { devicePixelRatio: 1 };
  try {
    let reads = 0; const ctx = new Proxy({}, { get: () => () => {} });
    const canvas = { width: 900, height: 500, getContext: () => ctx, getBoundingClientRect: () => { reads++; return { left: 0, top: 0, width: 900, height: 500 }; } };
    const renderer = new FactoryRenderer(canvas, { draw() {} }), game = new CafeFactoryGame(), before = game.serialize();
    for (let n = 0; n < 120; n++) renderer.draw(game, { selected: null }, n * 16.67);
    assert.equal(reads, 1); assert.equal(game.serialize(), before);
    renderer.resize(game.area); assert.equal(reads, 2, 'explicit layout changes can refresh the cache');
  } finally { globalThis.window = old; }
});

test('customer and employee area is a scene, while the workshop recipe is a nonmodal section', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8'), css = await readFile(new URL('../factory-service.css', import.meta.url), 'utf8');
  assert.match(html, /<section id="service-area" class="service-yard"/); assert.match(html, /<section id="quick-recipe"/);
  assert.doesNotMatch(html, /<dialog[^>]*id="(?:service-area|quick-recipe)"/);
  assert.match(css, /\.service-yard\{[^}]*top:0;bottom:0/); assert.doesNotMatch(css, /\.service-yard\{[^}]*(?:border-radius|box-shadow)/);
  assert.doesNotMatch(css, /worker-puppet|service-workers|cat-puppet/);
});
