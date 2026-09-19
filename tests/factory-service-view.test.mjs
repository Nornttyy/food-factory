import test from 'node:test';
import assert from 'node:assert/strict';
import { ServiceView } from '../src/factory-service-view.js';
import { CafeFactoryGame } from '../src/factory-service.js';
import { FactoryRenderer } from '../src/factory-renderer.js';
import { yardLayout } from '../src/factory-yard.js';

function setup(t) {
  const listeners = {}, windowListeners = {}; let hit = null, enabled = true, changes = 0, measures = 0;
  let game = new CafeFactoryGame(); game.state.coins = 10000; game.shelves[0].goods = ['bread', 'bread', 'bread'];
  const context = new Proxy({ globalAlpha: 1 }, { get: (o, p) => p in o ? o[p] : () => {} });
  class Element {
    constructor(tag = 'div') { this.tagName = tag.toUpperCase(); this.children = []; this.style = {}; this.dataset = {}; this.listeners = {}; this.attrs = {}; this.classes = new Set(); this.classList = { toggle: (name, on) => on ? this.classes.add(name) : this.classes.delete(name) }; }
    append(...children) { this.children.push(...children); } replaceChildren(...children) { this.children = children; }
    setAttribute(key, value) { this.attrs[key] = value; } addEventListener(key, cb) { this.listeners[key] = cb; }
    setPointerCapture(id) { this.capture = id; } hasPointerCapture(id) { return this.capture === id; } releasePointerCapture() { this.capture = null; }
    getContext() { return context; } getBoundingClientRect() { measures++; return { left: 0, top: 0, width: 1000, height: 700 }; }
    scrollBy({ left }) { this.scrollLeft = (this.scrollLeft || 0) + left; }
  }
  const oldDoc = globalThis.document, oldWin = globalThis.window;
  globalThis.document = { createElement: tag => new Element(tag), addEventListener: (event, fn) => listeners[event] = fn, elementFromPoint: () => hit, hidden: false };
  globalThis.window = { devicePixelRatio: 1, addEventListener: (event, fn) => windowListeners[event] = fn };
  t.after(() => { globalThis.document = oldDoc; globalThis.window = oldWin; });
  const root = new Element(), canvas = new Element('canvas'), messages = [], assets = { icon: () => new Element('canvas'), draw() {} };
  const renderer = new FactoryRenderer(canvas, assets); renderer.resize(game.area, { customerArea: true }); renderer.camera.overview(); renderer.resize(game.area, { customerArea: true });
  const view = new ServiceView({ root, assets, renderer, getGame: () => game, active: () => enabled && !document.hidden && !game.state.paused, changed: () => changes++, notify: text => messages.push(text), reduced: () => false });
  renderer.serviceView = view; view.render();
  const point = (x, y, id = 7) => ({ button: 0, pointerId: id, pointerType: 'touch', clientX: renderer.transform.x + x * 72 * renderer.transform.scale, clientY: renderer.transform.y + y * 72 * renderer.transform.scale, preventDefault() {}, stopPropagation() {} });
  return { view, renderer, canvas, root, messages, listeners, windowListeners, context, point, shelf: () => point(8.5, 2.5), customer: i => { const p = yardLayout(game.area).spots[i]; return point(p.x, p.y); }, get game() { return game; }, get changes() { return changes; }, get measures() { return measures; }, setGame: value => game = value, enabled: value => enabled = value, hit: value => hit = value };
}
test('food drags originate at the actual map shelf and drop into world-space customer targets exactly once', t => {
  const h = setup(t), coins = h.game.state.coins;
  assert.equal(h.view.startMap(h.shelf()), true); assert.equal(h.canvas.capture, 7); assert.equal(h.view.selection.rackId, h.game.shelves[0].id);
  h.view.move(h.customer(0)); h.view.end(h.customer(0)); assert.equal(h.game.state.coins, coins + 6); assert.equal(h.changes, 1);
  assert.equal(h.game.shelves[0].goods.length, 2); assert.equal(h.view.end(h.customer(0)), false); assert.equal(h.canvas.capture, null);
  assert.equal(h.view.root.children.filter(el => el.tagName === 'CANVAS').length, 0, 'no separate scene canvas exists');
});
test('tap shelf, pan or jump the shared camera, and tap a cat works without dragging across a phone', t => {
  const h = setup(t); h.view.startMap(h.shelf()); h.view.end(h.shelf()); assert.equal(h.view.selection.item, 'bread');
  h.renderer.pan(-75, 20); h.renderer.zoom(1.2);
  h.view.startMap(h.customer(1)); h.view.end(h.customer(1)); assert.equal(h.game.service.served, 1);
  h.view.select('bread'); h.view.rows[0].row.listeners.click(); assert.equal(h.game.service.served, 2, 'keyboard delivery remains available');
});
test('wrong food, outside drops, cancelled gestures and HUD-covered customers cannot consume stock', t => {
  const h = setup(t), saved = h.game.serialize(); h.view.startMap(h.shelf()); h.view.move(h.point(10, 10)); h.view.end(h.point(10, 10)); assert.equal(h.game.serialize(), saved);
  h.game.service.customers[0].want = 'butter_cookie'; const wrong = h.game.serialize();
  h.view.startMap(h.shelf()); h.view.move(h.customer(0)); h.view.end(h.customer(0)); assert.equal(h.game.serialize(), wrong); assert.match(h.messages[0], /食物/);
  h.view.startMap(h.shelf()); h.hit({}); h.view.end(h.customer(1)); assert.equal(h.game.serialize(), wrong); h.hit(null);
  h.view.startMap(h.shelf()); h.view.cancel(); assert.equal(h.game.serialize(), wrong); assert.equal(h.view.drag, null);
});
test('swiping a cat or recruitment sign pans the map and does not accidentally serve or hire', t => {
  const h = setup(t); h.view.select('bread'); const saved = h.game.serialize(), x = h.renderer.camera.x;
  const event = h.customer(0); h.view.startMap(event); h.view.move({ ...event, clientX: event.clientX + 80 }); h.view.end({ ...event, clientX: event.clientX + 80 });
  assert.notEqual(h.renderer.camera.x, x); assert.equal(h.game.serialize(), saved);
});
test('multitouch, Escape, pause, menus, hidden pages and blur cancel a held meal without selling it', t => {
  const h = setup(t), saved = h.game.serialize();
  const cancellations = [() => h.listeners.pointerdown({ pointerId: 9 }), () => h.listeners.keydown({ key: 'Escape' }), () => { h.game.state.paused = true; h.view.render(); h.game.state.paused = false; }, () => { h.enabled(false); h.view.render(); h.enabled(true); }, () => { document.hidden = true; h.listeners.visibilitychange(); document.hidden = false; }, () => h.windowListeners.blur(), () => h.windowListeners.pagehide()];
  for (const cancel of cancellations) { h.view.startMap(h.shelf()); cancel(); assert.equal(h.view.drag, null); assert.equal(h.view.selection, null); assert.equal(h.game.serialize(), saved); }
});
test('a staff reservation or restored game cannot allow a stale manual gesture to sell twice', t => {
  const h = setup(t); h.game.shelves[0].goods = ['bread']; h.view.startMap(h.shelf()); h.game.state.totalSold = h.game.service.served = 4; h.game.recruit(); h.game.update(.1); h.view.render();
  assert.equal(h.view.selection, null); assert.equal(h.game.shelves[0].goods.length, 1, 'reserved food remains physically on the shelf');
  h.game.service.workers = []; h.view.startMap(h.shelf()); const newGame = new CafeFactoryGame(); h.setGame(newGame); const saved = newGame.serialize();
  h.view.end(h.customer(0)); assert.equal(newGame.serialize(), saved); assert.equal(h.changes, 0);
});
test('recruitment sign is in the map, staff are rendered at model positions, and all actors share the factory canvas', t => {
  const h = setup(t); h.game.state.totalSold = h.game.service.served = 4; const p = yardLayout(h.game.area).hire;
  h.view.startMap(h.point(p.x, p.y)); h.view.end(h.point(p.x, p.y)); assert.equal(h.game.service.workers.length, 1);
  h.renderer.draw(h.game, { customerArea: true, selected: null }, 0);
  assert.equal(h.view.actors.filter(a => a.staff).length, 1); assert.equal(h.view.actors.filter(a => a.customer).length, 3);
  assert.equal(h.view.scene, undefined); assert.equal(h.view.actors.find(a => a.staff).x, h.game.service.workers[0].x);
});
test('the recruitment sign and accessible button show the raised prices and disable unaffordable hires', t => {
  const h = setup(t); h.view.render(); assert.match(h.view.hire.textContent, /600/);
  h.game.state.totalSold = h.game.service.served = 4; h.game.state.coins = 599; h.view.render(); assert.equal(h.view.hire.disabled, true);
  h.view.recruit(); assert.equal(h.game.service.workers.length, 0); assert.equal(h.game.state.coins, 599);
  for (const cost of [600, 1500, 3000, 4500, 6000, 8000]) {
    h.game.state.coins = cost; h.view.render(); assert.match(h.view.hire.textContent, new RegExp(String(cost))); assert.equal(h.view.hire.disabled, false);
    h.view.recruit(); assert.equal(h.game.state.coins, 0);
  }
  assert.equal(h.game.service.workers.length, 6); assert.equal(h.view.hire.disabled, true); assert.match(h.view.hire.textContent, /已满 6\/6/);
  h.view.draw(h.context, h.game); assert.equal(h.view.actors.filter(a => a.staff).length, 6);
});
test('staff interpolate between simulation steps, pause without drifting and do not trigger layout reads', t => {
  const h = setup(t); h.game.state.totalSold = h.game.service.served = 4; h.game.recruit(); h.game.update(.2); const reads = h.measures, poses = [];
  for (let n = 0; n < 60; n++) { h.game.update(1 / 60); const saved = h.game.serialize(); h.view.draw(h.context, h.game); poses.push(h.view.actors.find(a => a.staff).x); assert.equal(h.game.serialize(), saved); }
  assert.ok(new Set(poses).size > 40); assert.equal(h.measures, reads);
  h.game.state.paused = true; h.view.draw(h.context, h.game); const frozen = structuredClone(h.view.actors);
  h.game.update(.1); h.view.draw(h.context, h.game); assert.deepEqual(h.view.actors, frozen);
});
test('customer celebration does not re-run its entrance; replacing service data cancels held food', t => {
  const h = setup(t); h.game.update(1); h.game.update(1); h.view.select('bread'); h.view.drop(0); h.view.draw(h.context, h.game);
  assert.equal(h.view.actors.find(a => a.slot === 0).x, yardLayout(h.game.area).spots[0].x);
  h.view.select('bread'); assert.equal(h.game.restore(h.game.serialize()), true); h.view.render(); assert.equal(h.view.selection, null);
});
test('edge dragging pans the shared map without inventory mutation; all eight foods remain reachable by arrows', t => {
  const h = setup(t), saved = h.game.serialize(); h.view.startMap(h.shelf()); h.view.move({ ...h.shelf(), clientX: 995 }); const x = h.renderer.camera.x;
  h.view.tickDrag(.1); assert.ok(h.renderer.camera.x > x); assert.equal(h.game.serialize(), saved);
  h.view.cancel(); h.game.shelves[0].goods = [...h.view.foods.keys()]; h.view.select('bread'); h.view.render();
  assert.equal(h.view.trayNav[1].hidden, false); h.view.trayNav[1].listeners.click(); assert.equal(h.view.tray.scrollLeft, 100); h.view.trayNav[0].listeners.click(); assert.equal(h.view.tray.scrollLeft, 0);
});
