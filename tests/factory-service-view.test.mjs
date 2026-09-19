import test from 'node:test';
import assert from 'node:assert/strict';
import { ServiceView } from '../src/factory-service-view.js';
import { CafeFactoryGame } from '../src/factory-service.js';
import { cameraInsets } from '../src/factory-feel.js';

function setup(t) {
  const listeners = {}, windowListeners = {}; let hit = null, enabled = true, changes = 0, measures = 0;
  let game = new CafeFactoryGame(); game.shelves[0].goods = ['bread', 'bread', 'bread'];
  const context = new Proxy({}, { get: () => () => {} });
  class Element {
    constructor(tag = 'div') { this.tagName = tag.toUpperCase(); this.children = []; this.style = {}; this.dataset = {}; this.listeners = {}; this.attrs = {}; this.classes = new Set(); this.classList = { toggle: (name, on) => on ? this.classes.add(name) : this.classes.delete(name) }; }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    setAttribute(key, value) { this.attrs[key] = value; }
    addEventListener(key, cb) { this.listeners[key] = cb; }
    setPointerCapture(id) { this.capture = id; }
    hasPointerCapture(id) { return this.capture === id; }
    releasePointerCapture() { this.capture = null; }
    closest() { return this; }
    getContext() { return context; }
    getBoundingClientRect() { measures++; return { left: 0, top: 0, right: 200, bottom: 400, width: 200, height: 400 }; }
    scrollBy({ left }) { this.scrollLeft = (this.scrollLeft || 0) + left; }
  }
  const oldDoc = globalThis.document, oldWin = globalThis.window;
  globalThis.document = { createElement: tag => new Element(tag), addEventListener: (event, fn) => listeners[event] = fn, elementFromPoint: () => hit, hidden: false };
  globalThis.window = { addEventListener: (event, fn) => windowListeners[event] = fn };
  t.after(() => { globalThis.document = oldDoc; globalThis.window = oldWin; });
  const root = new Element(), messages = [];
  const view = new ServiceView({ root, assets: { icon: () => new Element('canvas'), draw() {} }, getGame: () => game, active: () => enabled && !document.hidden && !game.state.paused, changed: () => changes++, notify: text => messages.push(text), reduced: () => false });
  view.render();
  return { view, root, messages, listeners, windowListeners, get game() { return game; }, get changes() { return changes; }, get measures() { return measures; }, setGame: value => game = value, enabled: value => enabled = value, hit: value => hit = value };
}
const pointer = (pointerId = 7, x = 10, y = 10) => ({ button: 0, pointerId, pointerType: 'touch', clientX: x, clientY: y, preventDefault() {}, stopPropagation() {} });

test('touch dragging from the mounted tray to a customer consumes and pays once, with no board gesture', t => {
  const h = setup(t), button = h.view.foods.get('bread').button, coins = h.game.state.coins;
  button.listeners.pointerdown(pointer()); assert.equal(button.capture, 7); assert.equal(h.view.ghost.hidden, false);
  h.hit(h.view.rows[0].row); button.listeners.pointermove(pointer(7, 110, 30));
  assert.equal(h.view.rows[0].row.classes.has('drop-hover'), true);
  button.listeners.pointerup(pointer(7, 110, 30));
  assert.equal(h.game.state.coins, coins + 6); assert.equal(h.game.shelves[0].goods.length, 2); assert.equal(h.changes, 1);
  assert.equal(h.view.ghost.hidden, true); assert.equal(button.capture, null);
  button.listeners.pointerup(pointer()); assert.equal(h.changes, 1); h.view.draw();
});

test('drop outside, wrong food, pointer cancellation and loss of capture keep all food and coins', t => {
  const h = setup(t), button = h.view.foods.get('bread').button, before = h.game.serialize();
  button.listeners.pointerdown(pointer()); button.listeners.pointermove(pointer(7, 80, 80)); button.listeners.pointerup(pointer(7, 80, 80));
  assert.equal(h.game.serialize(), before); assert.equal(h.view.selection, null);
  h.game.service.customers[0].want = 'butter_cookie'; h.hit(h.view.rows[0].row);
  const wrong = h.game.serialize(); button.listeners.pointerdown(pointer()); button.listeners.pointerup(pointer()); assert.equal(h.game.serialize(), wrong); assert.match(h.messages[0], /食物/);
  for (const event of ['pointercancel', 'lostpointercapture']) {
    button.listeners.pointerdown(pointer()); button.listeners[event](); assert.equal(h.game.serialize(), wrong); assert.equal(h.view.ghost.hidden, true); assert.equal(h.view.selection, null);
  }
});

test('food tap then cat tap and native keyboard clicks provide a non-drag alternative', t => {
  const h = setup(t), button = h.view.foods.get('bread').button;
  h.hit(button); button.listeners.pointerdown(pointer()); button.listeners.pointerup(pointer());
  assert.equal(h.view.selection.item, 'bread'); h.view.rows[0].row.listeners.click(); assert.equal(h.changes, 1);
  button.listeners.click({ detail: 0 }); h.view.rows[1].row.listeners.click(); assert.equal(h.changes, 2);
  assert.equal(h.game.shelves[0].goods.length, 1); assert.equal(h.game.state.totalSold, 2);
});

test('multitouch, Escape, pause, menus, background, blur and pagehide cancel without inventory mutation', t => {
  const h = setup(t), button = h.view.foods.get('bread').button;
  const cases = [
    () => h.listeners.pointerdown(pointer(8)), () => h.listeners.keydown({ key: 'Escape' }),
    () => { h.game.state.paused = true; h.view.render(); h.game.state.paused = false; },
    () => { h.enabled(false); h.view.render(); h.enabled(true); },
    () => { document.hidden = true; h.listeners.visibilitychange(); document.hidden = false; },
    () => h.windowListeners.blur(), () => h.windowListeners.pagehide(),
  ];
  const before = h.game.serialize();
  for (const cancel of cases) { button.listeners.pointerdown(pointer()); cancel(); assert.equal(h.view.drag, null); assert.equal(h.view.selection, null); assert.equal(h.game.serialize(), before); }
});

test('employee pickup and replacing a practice factory cannot let a stale drag sell or mutate new stock', t => {
  const h = setup(t), button = h.view.foods.get('bread').button;
  button.listeners.pointerdown(pointer()); h.game.shelves[0].goods = []; h.view.render();
  assert.equal(h.view.drag, null); assert.equal(h.view.selection, null);
  h.game.shelves[0].goods = ['bread']; button.listeners.pointerdown(pointer());
  h.setGame(new CafeFactoryGame()); const before = h.game.serialize(); h.hit(h.view.rows[0].row); button.listeners.pointerup(pointer());
  assert.equal(h.game.serialize(), before); assert.equal(h.changes, 0);
});

test('recruitment is bound to the live game, frozen while inactive, and updates carrying worker canvases', t => {
  const h = setup(t); h.view.hire.listeners.click(); assert.equal(h.game.service.workers.length, 0);
  h.game.state.totalSold = h.game.service.served = 4; const coins = h.game.state.coins;
  h.enabled(false); h.view.hire.listeners.click(); assert.equal(h.game.state.coins, coins); h.enabled(true);
  h.view.hire.listeners.click(); assert.equal(h.game.state.coins, coins - 120); assert.equal(h.game.service.workers.length, 1);
  h.game.update(.1); h.view.render(); h.view.draw();
  assert.equal(h.view.actors.filter(a => a.staff).length, 1); assert.equal(h.view.actors.filter(a => !a.staff).length, 3);
  assert.equal(h.view.root.children.filter(el => el.tagName === 'CANVAS').length, 1, 'everyone shares the scene canvas');
  assert.match(h.view.staffStatus.textContent, /送餐/); assert.equal(h.view.rows[0].row.disabled, true);
});

test('customer strip reserves a narrow working inset without changing when a drawer opens', () => {
  for (const [w, h] of [[1440, 900], [844, 390], [600, 360], [390, 844]]) {
    const a = cameraInsets(w, h, { customerArea: true }); const b = cameraInsets(w, h, { customerArea: true, inspectorOpen: true, ordersOpen: true });
    assert.deepEqual(a, b); assert.ok(a.right <= 360); assert.ok(w - a.left - a.right > 150);
  }
});

test('couriers move on intervening animation frames without per-frame layout reads or model writes', t => {
  const h = setup(t); h.game.state.totalSold = h.game.service.served = 4; h.game.recruit(); h.game.update(.1); h.view.render(); h.view.draw();
  const positions = [], steps = [];
  for (let n = 0; n < 24; n++) {
    h.game.update(1 / 60); const before = h.game.serialize(); h.view.draw();
    positions.push(h.view.actors.find(a => a.staff).y); steps.push(h.game.state.tick); assert.equal(h.game.serialize(), before);
  }
  assert.ok(new Set(positions).size > 20); assert.ok(new Set(steps).size < 6, 'motion is smoother than the 10 Hz simulation');
  assert.equal(h.measures, 1, 'canvas geometry is cached, not read for every character each frame');
  h.windowListeners.resize(); h.view.draw(); assert.equal(h.measures, 2);
  h.game.state.paused = true; h.view.render(); h.view.draw(); const frozen = JSON.stringify(h.view.actors);
  for (let i = 0; i < 20; i++) { h.game.update(1 / 60); h.view.draw(); }
  assert.equal(JSON.stringify(h.view.actors), frozen);
});

test('serving does not replay customer arrival, and restoring the same game clears stale routes', t => {
  const h = setup(t); for (let i = 0; i < 20; i++) h.game.update(.1); h.view.render(); h.view.draw();
  const cat = h.view.actors.find(a => !a.staff && a.skin === 0), born = h.view.rows[0].bornAt;
  h.view.select('bread'); h.view.drop(0); h.view.draw();
  const fed = h.view.actors.find(a => !a.staff && a.skin === 0); assert.equal(fed.x, cat.x); assert.equal(h.view.rows[0].bornAt, born);
  h.game.restore(new CafeFactoryGame().serialize()); h.view.draw(); assert.equal(h.view.rows[0].bornAt, 0); assert.equal(h.view.routes.tracks.size, 0);
});

test('counter arrow buttons expose food offscreen without requiring a drag gesture', t => {
  const h = setup(t); h.game.shelves[0].goods = ['bread', 'butter_cookie', 'orange_juice', 'donut_plain']; h.view.draw(); h.view.render();
  assert.equal(h.view.trayNav[1].hidden, false); h.view.trayNav[1].listeners.click(); assert.equal(h.view.tray.scrollLeft, 100);
  h.view.trayNav[0].listeners.click(); assert.equal(h.view.tray.scrollLeft, 0);
});
