import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { FactoryRenderer } from '../src/factory-renderer.js';

test('factory entry loads generated atlases and wires construction, production, order and persistence controls', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const manifest = JSON.parse(await readFile(new URL('../assets/generated/factory/cream-v1/manifest.json', import.meta.url), 'utf8'));
  const nodes = new Map(), storage = new Map(), frames = [], draws = [], documentListeners = {};
  const context = new Proxy({ globalAlpha: 1, drawImage: (...args) => draws.push(args) }, { get: (t, p) => p in t ? t[p] : () => {}, set: (t, p, v) => { t[p] = v; return true; } });
  class Element {
    constructor(tag = 'div') { this.tagName = tag.toUpperCase(); this.children = []; this.style = {}; this.dataset = {}; this.listeners = {}; this.hidden = false; this.classList = { toggle() {} }; }
    set id(id) { this._id = id; nodes.set(id, this); } get id() { return this._id; }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    setAttribute(key, value) { this[key] = value; }
    addEventListener(name, callback) { this.listeners[name] = callback; }
    click() { if (!this.disabled) this.listeners.click?.({}); }
    getContext() { return context; }
    getBoundingClientRect() { return { left: 0, top: 0, width: 1008, height: 576 }; }
    focus() { document.activeElement = this; }
    setPointerCapture() {}
    showModal() { this.open = true; }
    close() { this.open = false; }
  }
  for (const match of html.matchAll(/<([a-z]+)[^>]*\bid="([^"]+)"/g)) { const el = new Element(match[1]); el.id = match[2]; }
  const categories = ['logistics', 'machines', 'sources'].map(category => { const e = new Element('button'); e.dataset.category = category; return e; });
  const orientation = new Element();
  const savedGlobals = new Map();
  const install = (name, value) => { savedGlobals.set(name, Object.getOwnPropertyDescriptor(globalThis, name)); Object.defineProperty(globalThis, name, { value, writable: true, configurable: true }); };
  install('document', {
    hidden: false, activeElement: null, addEventListener(name, callback) { (documentListeners[name] ||= []).push(callback); }, createElement: tag => new Element(tag), createTextNode: text => ({ textContent: text }),
    querySelector: selector => selector.startsWith('#') ? nodes.get(selector.slice(1)) : selector === '.orientation-hint' ? orientation : selector === 'dialog[open]' ? [...nodes.values()].find(n => n.tagName === 'DIALOG' && n.open) : null,
    querySelectorAll: () => categories,
  });
  install('window', { devicePixelRatio: 1, addEventListener() {} });
  install('localStorage', { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) });
  install('Image', class { async decode() {} });
  install('fetch', async () => ({ ok: true, json: async () => manifest }));
  install('requestAnimationFrame', callback => { frames.push(callback); return frames.length; });
  install('setTimeout', () => 1); install('clearTimeout', () => {});
  try {
    const { runtime } = await import(`../src/factory-main.js?test=${Date.now()}`);
    assert.equal(runtime.assets.ready, true); assert.equal(nodes.get('loading').hidden, true); assert.equal(runtime.game.state.buildings.length, 8);
    assert.equal(frames.length, 1); frames.shift()(performance.now() + 100); assert.ok(draws.length >= 9);
    assert.equal(nodes.get('order-drawer').hidden, true); assert.equal(nodes.get('inspector-panel').hidden, true); assert.equal(nodes.get('palette').hidden, true);
    nodes.get('orders-toggle').click(); assert.equal(nodes.get('order-drawer').hidden, false);
    nodes.get('close-orders').click(); assert.equal(nodes.get('order-drawer').hidden, true);
    nodes.get('dock-toggle').click(); assert.equal(nodes.get('palette').hidden, false);
    const original = runtime.game.state.coins;
    nodes.get('palette').children.find(b => b.dataset.building === 'belt').click();
    assert.equal(nodes.get('palette').hidden, true);
    const point = (x, y) => ({ clientX: runtime.renderer.transform.x + (x + .5) * 72 * runtime.renderer.transform.scale, clientY: runtime.renderer.transform.y + (y + .5) * 72 * runtime.renderer.transform.scale });
    nodes.get('factory-board').listeners.pointerdown({ button: 0, preventDefault() {}, pointerId: 1, ...point(0, 0) });
    nodes.get('factory-board').listeners.pointerup();
    assert.equal(runtime.game.at(0, 0).type, 'belt'); assert.equal(runtime.game.state.coins, original - 8);
    nodes.get('rotate').click(); assert.equal(runtime.ui.dir, 1);
    nodes.get('select-tool').click();
    nodes.get('factory-board').listeners.pointerdown({ button: 0, preventDefault() {}, pointerId: 2, ...point(3, 2) });
    nodes.get('factory-board').listeners.pointerup();
    assert.equal(nodes.get('inspector-panel').hidden, false);
    nodes.get('close-inspector').click(); assert.equal(nodes.get('inspector-panel').hidden, true);
    const beforePan = runtime.renderer.camera.x, beforeCount = runtime.game.state.buildings.length;
    nodes.get('move-tool').click();
    nodes.get('factory-board').listeners.pointerdown({ button: 0, preventDefault() {}, pointerId: 3, clientX: 400, clientY: 300 });
    nodes.get('factory-board').listeners.pointermove({ pointerId: 3, clientX: 430, clientY: 300 });
    nodes.get('factory-board').listeners.pointerup();
    assert.ok(runtime.renderer.camera.x < beforePan); assert.equal(runtime.game.state.buildings.length, beforeCount);
    nodes.get('zoom-in').click(); assert.ok(runtime.renderer.camera.zoom > 1);
    nodes.get('zoom-reset').click(); assert.equal(runtime.renderer.camera.zoom, 1);
    nodes.get('focus-view').click(); assert.equal(runtime.ui.focus, true);
    nodes.get('focus-view').click(); assert.equal(runtime.ui.focus, false);
    nodes.get('motion-toggle').click(); assert.equal(runtime.ui.reducedMotion, true);
    nodes.get('motion-toggle').click(); assert.equal(runtime.ui.reducedMotion, false);
    nodes.get('palette').children.find(b => b.dataset.building === 'belt').click();
    nodes.get('factory-board').listeners.pointerdown({ button: 0, pointerType: 'touch', preventDefault() {}, pointerId: 4, ...point(0, 1) });
    assert.equal(runtime.game.at(0, 1), undefined);
    nodes.get('factory-board').listeners.pointerup({ pointerId: 4 }); assert.equal(runtime.game.at(0, 1).type, 'belt');
    nodes.get('factory-board').listeners.pointerdown({ button: 0, pointerType: 'touch', preventDefault() {}, pointerId: 5, ...point(0, 3) });
    nodes.get('factory-board').listeners.pointerdown({ button: 0, pointerType: 'touch', preventDefault() {}, pointerId: 6, ...point(0, 4) });
    nodes.get('factory-board').listeners.pointerup({ pointerId: 5 }); assert.equal(runtime.game.at(0, 3), undefined);
    categories.find(b => b.dataset.category === 'machines').click();
    nodes.get('palette').children.find(b => b.dataset.building === 'bread_oven').click();
    const initialBuildingCount = runtime.game.state.buildings.length;
    nodes.get('factory-board').listeners.pointerdown({ button: 0, pointerType: 'touch', preventDefault() {}, pointerId: 7, ...point(2, 3) });
    nodes.get('factory-board').listeners.pointermove({ pointerId: 7, ...point(4, 3) });
    nodes.get('factory-board').listeners.pointerup({ pointerId: 7, ...point(4, 3) });
    assert.equal(runtime.game.state.buildings.length, initialBuildingCount, 'dragging a machine tap must cancel rather than place at the old cell');
    const documentEvent = (name, event) => documentListeners[name]?.forEach(handler => handler(event));
    const touchA = { button: 0, pointerType: 'touch', preventDefault() {}, pointerId: 8, ...point(2, 3) };
    documentEvent('pointerdown', touchA); nodes.get('factory-board').listeners.pointerdown(touchA);
    documentEvent('pointerdown', { pointerType: 'touch', pointerId: 9, target: nodes.get('wallet') });
    documentEvent('pointerup', touchA); nodes.get('factory-board').listeners.pointerup(touchA);
    const touchC = { ...touchA, pointerId: 10 };
    documentEvent('pointerdown', touchC); nodes.get('factory-board').listeners.pointerdown(touchC);
    documentEvent('pointerup', touchC); nodes.get('factory-board').listeners.pointerup(touchC);
    assert.equal(runtime.game.state.buildings.length, initialBuildingCount, 'HUD touches and third fingers cannot restart painting');
    documentEvent('pointerup', { pointerType: 'touch', pointerId: 9 });
    nodes.get('pause').click(); assert.equal(runtime.game.state.paused, true); assert.equal(nodes.get('pause-overlay').hidden, false);
    nodes.get('resume').click(); assert.equal(runtime.game.state.paused, false);
    nodes.get('speed').click(); assert.equal(runtime.game.state.speed, 2);
    for (let i = 0; i < 200; i++) runtime.game.update(.1);
    frames.shift()(performance.now() + 3000);
    assert.equal(runtime.game.orderReady, true); assert.equal(nodes.get('claim-order').disabled, false);
    nodes.get('claim-order').click(); assert.equal(runtime.game.state.orderIndex, 1);
    const saved = JSON.parse(storage.get('food-factory-v1')); assert.equal(saved.orderIndex, 1);
    assert.equal(storage.has('xiaozhen-biehuang-puzzle-v1'), false);
    categories.find(b => b.dataset.category === 'logistics').click();
    nodes.get('palette').children.find(b => b.dataset.building === 'belt').click();
    const oldBelt = runtime.game.place('belt', 2, 4, 0).building, beforeExtension = runtime.game.state.coins;
    nodes.get('factory-board').listeners.pointerdown({ button: 0, preventDefault() {}, pointerId: 11, ...point(2, 4) });
    nodes.get('factory-board').listeners.pointermove({ pointerId: 11, ...point(2, 5) });
    nodes.get('factory-board').listeners.pointerup({ pointerId: 11 });
    assert.equal(oldBelt.dir, 1, 'dragging from an existing belt redirects its output');
    assert.equal(runtime.game.at(2, 5).dir, 1); assert.equal(runtime.game.state.coins, beforeExtension - 8);
    assert.equal(nodes.get('inspector-panel').hidden, true, 'resuming a belt stroke must not open its inspector');
    const bottomBelt = runtime.game.at(2, 5), beforeTouchBelt = runtime.game.state.coins;
    const dragTouch = { button: 0, pointerType: 'touch', preventDefault() {}, pointerId: 12, ...point(2, 5) };
    documentEvent('pointerdown', dragTouch); nodes.get('factory-board').listeners.pointerdown(dragTouch);
    nodes.get('factory-board').listeners.pointermove({ pointerId: 12, pointerType: 'touch', ...point(4, 5) });
    documentEvent('pointerup', dragTouch); nodes.get('factory-board').listeners.pointerup({ ...dragTouch, ...point(4, 5) });
    assert.equal(bottomBelt.dir, 0, 'touch can also continue and turn an existing belt');
    assert.equal(runtime.game.at(3, 5).dir, 0); assert.equal(runtime.game.at(4, 5).dir, 0);
    assert.equal(runtime.game.state.coins, beforeTouchBelt - 16, 'fast touch strokes fill intermediate cells once');
    const board = nodes.get('factory-board');
    const strokeEvent = (pointerId, x, y, pointerType = 'mouse') => ({ button: 0, preventDefault() {}, pointerId, pointerType, ...point(x, y) });
    const down = event => { documentEvent('pointerdown', event); board.listeners.pointerdown(event); };
    const move = event => board.listeners.pointermove(event);
    const up = event => { documentEvent('pointerup', event); board.listeners.pointerup(event); };
    const cleanLayout = () => { runtime.game.state.buildings = []; runtime.game.state.coins = 10000; };

    // A wrong machine-side attempt remains an editable stroke, for mouse and touch.
    for (const [pointerId, pointerType] of [[13, 'mouse'], [14, 'touch']]) {
      cleanLayout();
      const machine = runtime.game.place('bread_oven', 4, 2, 0).building;
      machine.input = 'dough'; machine.progress = 1.2;
      const beforeMachine = { ...machine }, initialSave = runtime.game.serialize(), wallet = runtime.game.state.coins;
      down(strokeEvent(pointerId, 4, 2, pointerType)); move(strokeEvent(pointerId, 3, 2, pointerType));
      assert.equal(runtime.game.serialize(), initialSave, 'failed direction must not place a belt or modify the machine');
      assert.equal(nodes.get('toast').hidden, false);
      move(strokeEvent(pointerId, 6, 2, pointerType));
      up(strokeEvent(pointerId, 6, 2, pointerType));
      assert.equal(runtime.game.at(5, 2).dir, 0); assert.equal(runtime.game.at(6, 2).dir, 0);
      assert.equal(runtime.game.state.coins, wallet - 16, 'retry and pointerup must charge only for the two new belts');
      assert.deepEqual(machine, beforeMachine); assert.equal(nodes.get('toast').hidden, true);
    }

    // A fast stroke can enter a machine, continue through its output and stop at a depot.
    cleanLayout();
    const throughMachine = runtime.game.place('bread_oven', 3, 2, 0).building;
    const depot = runtime.game.place('depot', 7, 2, 0).building;
    const beforeThrough = { ...throughMachine }, beforeDepot = { ...depot }, throughWallet = runtime.game.state.coins;
    down(strokeEvent(15, 1, 2)); move(strokeEvent(15, 9, 2)); up(strokeEvent(15, 9, 2));
    for (const x of [1, 2, 4, 5, 6]) assert.equal(runtime.game.at(x, 2).dir, 0);
    assert.equal(runtime.game.at(8, 2), undefined); assert.equal(runtime.game.at(9, 2), undefined);
    assert.deepEqual(throughMachine, beforeThrough); assert.deepEqual(depot, beforeDepot);
    assert.equal(runtime.game.state.coins, throughWallet - 40);

    // Keep already completed input belts when the next movement misses a turned outlet.
    cleanLayout();
    const turnedMachine = runtime.game.place('bread_oven', 3, 2, 1).building, turnedWallet = runtime.game.state.coins;
    down(strokeEvent(16, 1, 2)); move(strokeEvent(16, 6, 2));
    assert.equal(runtime.game.at(2, 2).type, 'belt'); assert.equal(runtime.game.at(4, 2), undefined);
    move(strokeEvent(16, 5, 4)); up(strokeEvent(16, 5, 4));
    assert.equal(runtime.game.at(3, 3).dir, 0, 'diagonal correction leaves through the lower outlet before turning');
    assert.equal(runtime.game.at(4, 3).dir, 0); assert.equal(runtime.game.at(5, 3).dir, 1); assert.equal(runtime.game.at(5, 4).dir, 1);
    assert.equal(turnedMachine.dir, 1); assert.equal(runtime.game.state.coins, turnedWallet - 48);

    // Multi-touch still cancels a failed stroke, without reviving its old anchor.
    cleanLayout(); runtime.game.place('bread_oven', 4, 2, 0);
    down(strokeEvent(17, 4, 2, 'touch')); move(strokeEvent(17, 3, 2, 'touch'));
    documentEvent('pointerdown', { pointerType: 'touch', pointerId: 18, target: nodes.get('wallet') });
    move(strokeEvent(17, 6, 2, 'touch')); up(strokeEvent(17, 6, 2, 'touch'));
    documentEvent('pointerup', { pointerType: 'touch', pointerId: 18 });
    assert.equal(runtime.game.state.buildings.length, 1);
    down(strokeEvent(19, 4, 2, 'touch')); move(strokeEvent(19, 5, 2, 'touch')); up(strokeEvent(19, 5, 2, 'touch'));
    assert.equal(runtime.game.state.buildings.length, 2, 'a new single-finger stroke works after all fingers lift');
    nodes.get('help').click(); assert.equal(nodes.get('help-dialog').open, true); nodes.get('help-done').click(); assert.equal(nodes.get('help-dialog').open, false);
    nodes.get('portrait-continue').click(); assert.equal(orientation.hidden, true);
  } finally {
    for (const [name, descriptor] of savedGlobals) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; }
  }
});

test('renderer cell mapping uses its fitted viewport rather than stretching the board', () => {
  const canvas = { getContext: () => ({}), getBoundingClientRect: () => ({ left: 20, top: 30, width: 600, height: 240 }) };
  const renderer = new FactoryRenderer(canvas, {}); renderer.transform = { scale: 1 / 3, x: 132, y: 24 };
  assert.deepEqual(renderer.cellAt(20 + 132 + 36 / 3, 30 + 24 + 36 / 3), { x: 0, y: 0 });
});
