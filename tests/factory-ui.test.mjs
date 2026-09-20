import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { FactoryRenderer } from '../src/factory-renderer.js';
import { FactoryGame } from '../src/factory-core.js';

test('factory entry loads generated atlases and wires construction, production, order and persistence controls', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const manifest = JSON.parse(await readFile(new URL('../assets/generated/factory/cream-v1/manifest.json', import.meta.url), 'utf8'));
  const nodes = new Map(), storage = new Map(), frames = [], draws = [], documentListeners = {}, windowListeners = {};
  let failStorageKey = null, viewport = { width: 1008, height: 576 }, dropTarget = null;
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
    getBoundingClientRect() { return { left: 0, top: 0, ...viewport }; }
    focus() { document.activeElement = this; }
    setPointerCapture() {}
    remove() { this.removed = true; }
    closest(selector) { return selector === '[data-kitchen-target]' && this.dataset.kitchenTarget ? this : null; }
    showModal() { this.open = true; }
    close() { this.open = false; }
  }
  for (const match of html.matchAll(/<([a-z]+)[^>]*\bid="([^"]+)"/g)) { const el = new Element(match[1]); el.id = match[2]; }
  const categories = ['logistics', 'machines', 'sources'].map(category => { const e = new Element('button'); e.dataset.category = category; return e; });
  const orientation = new Element();
  const savedGlobals = new Map();
  const install = (name, value) => { savedGlobals.set(name, Object.getOwnPropertyDescriptor(globalThis, name)); Object.defineProperty(globalThis, name, { value, writable: true, configurable: true }); };
  install('document', {
    hidden: false, activeElement: null, body: new Element('body'), elementFromPoint: () => dropTarget, addEventListener(name, callback) { (documentListeners[name] ||= []).push(callback); }, createElement: tag => new Element(tag), createTextNode: text => ({ textContent: text }),
    querySelector: selector => selector.startsWith('#') ? nodes.get(selector.slice(1)) : selector === '.orientation-hint' ? orientation : selector === 'dialog[open]' ? [...nodes.values()].find(n => n.tagName === 'DIALOG' && n.open) : null,
    querySelectorAll: () => categories,
  });
  install('window', { devicePixelRatio: 1, addEventListener(name, callback) { windowListeners[name] = callback; } });
  install('localStorage', { getItem: key => storage.get(key) || null, setItem: (key, value) => { if (key === failStorageKey || failStorageKey === 'all') throw new Error('Storage full'); storage.set(key, value); } });
  install('Image', class { async decode() {} });
  install('fetch', async () => ({ ok: true, json: async () => manifest }));
  install('requestAnimationFrame', callback => { frames.push(callback); return frames.length; });
  install('setTimeout', () => 1); install('clearTimeout', () => {});
  try {
    const { runtime } = await import(`../src/factory-main.js?test=${Date.now()}`);
    assert.equal(runtime.assets.ready, true); assert.equal(nodes.get('loading').hidden, true); assert.equal(runtime.game.state.buildings.length, 8);
    assert.equal(runtime.ui.screen, 'menu'); assert.equal(nodes.get('main-menu').hidden, false); assert.equal(nodes.get('factory-app').hidden, true);
    assert.equal(frames.length, 1); frames.shift()(performance.now() + 100); assert.equal(runtime.game.state.time, 0);
    nodes.get('factory-board').listeners.pointerdown({ button: 0, preventDefault() {}, pointerId: 100, clientX: 20, clientY: 20 });
    assert.equal(runtime.game.state.buildings.length, 8);
    for (const key of ['r', ' ', 'Enter', 'Delete']) windowListeners.keydown({ key, preventDefault() {} });
    assert.equal(runtime.ui.dir, 0); assert.equal(runtime.game.state.paused, false);
    nodes.get('menu-settings').click(); assert.equal(nodes.get('settings-dialog').open, true);
    nodes.get('settings-motion').click(); assert.equal(JSON.parse(storage.get('food-factory-preferences-v1')).reducedMotion, true);
    nodes.get('settings-motion').click(); nodes.get('close-settings').click();
    // The primary kitchen entry is a real hands-on scene, not the factory in new colors.
    {
    nodes.get('menu-kitchen').click(); assert.equal(runtime.ui.screen, 'kitchen');
    assert.equal(nodes.get('kitchen-room').hidden, false); assert.equal(nodes.get('factory-app').hidden, true);
    assert.equal(storage.has('food-factory-v1'), false, 'opening the kitchen cannot replace the old factory save');
    const kitchen = runtime.kitchenView, kg = kitchen.game;
    const tickKitchen = seconds => { for (let t = 0; t < seconds; t += .1) kitchen.step(.1); };
    const kitchenEvent = (type, event) => documentListeners[type]?.forEach(fn => fn(event));
    const kitchenPointer = (id, x = 10, y = 10) => ({ pointerId: id, pointerType: 'touch', isPrimary: true, button: 0, clientX: x, clientY: y, preventDefault() {} });
    nodes.get('kitchen-pan-0').click(); nodes.get('kitchen-pan-1').click();
    for (let i = 0; i < 4; i++) nodes.get('kitchen-board').click();
    tickKitchen(5.1); assert.equal(kg.panStage(0), 'ready'); assert.equal(kg.shift.board.cuts, 3);
    nodes.get('kitchen-pan-0').click(); kitchen.plateNodes[0].click();
    assert.deepEqual(kg.shift.plates[0], ['toast']); assert.equal(kg.shift.pans[0], null);
    kitchen.orderNodes.get(1).button.click(); assert.equal(kg.state.coins, 8); assert.equal(kg.shift.guided, false);
    tickKitchen(1.2); assert.equal(kg.shift.orders[0].dish, 'berry');
    // Real pointer path: pan -> plate, ready fruit -> plate, plate -> customer.
    function dragKitchen(button, target, id) {
      button.listeners.pointerdown(kitchenPointer(id));
      kitchenEvent('pointermove', kitchenPointer(id, 110, 80));
      dropTarget = target; kitchenEvent('pointerup', kitchenPointer(id, 110, 80));
      kitchen.suppressClickUntil = 0;
    }
    dragKitchen(nodes.get('kitchen-pan-1'), kitchen.plateNodes[1], 601);
    dragKitchen(nodes.get('kitchen-board'), kitchen.plateNodes[1], 602);
    assert.deepEqual(kg.shift.plates[1], ['toast', 'fruit']);
    dragKitchen(kitchen.plateNodes[1], kitchen.orderNodes.get(2).button, 603);
    assert.equal(kg.state.coins, 20); assert.equal(kg.shift.combo, 2);
    assert.equal(kg.shift.board, null); assert.deepEqual(kg.shift.plates[1], []);
    // Invalid drop and cancelled touch preserve the food exactly.
    nodes.get('kitchen-pan-0').click(); tickKitchen(5.1);
    const panBefore = JSON.stringify(kg.shift.pans[0]);
    dragKitchen(nodes.get('kitchen-pan-0'), null, 604);
    assert.equal(JSON.stringify(kg.shift.pans[0]), panBefore);
    nodes.get('kitchen-pan-0').listeners.pointerdown(kitchenPointer(605));
    kitchenEvent('pointermove', kitchenPointer(605, 100, 100)); kitchenEvent('pointercancel', kitchenPointer(605));
    dropTarget = kitchen.plateNodes[0]; kitchenEvent('pointerup', kitchenPointer(605));
    assert.equal(JSON.stringify(kg.shift.pans[0]), panBefore); kitchen.suppressClickUntil = 0;
    nodes.get('kitchen-pan-0').listeners.pointerdown(kitchenPointer(606));
    kitchenEvent('pointerdown', { ...kitchenPointer(607), isPrimary: false });
    kitchenEvent('pointerup', kitchenPointer(606)); assert.equal(kitchen.gesture, null);
    assert.equal(JSON.stringify(kg.shift.pans[0]), panBefore); kitchen.suppressClickUntil = 0;
    // Pausing and app backgrounding stop every timer. Escape can deliberately resume.
    nodes.get('kitchen-pause').click(); const pausedKitchen = kg.serialize(); tickKitchen(10);
    nodes.get('kitchen-pan-1').click(); assert.equal(kg.serialize(), pausedKitchen);
    windowListeners.keydown({ key: 'Escape', preventDefault() {} }); assert.equal(kg.shift.paused, false);
    windowListeners.blur(); assert.equal(kg.shift.paused, true); nodes.get('kitchen-resume').click();
    document.hidden = true; kitchenEvent('visibilitychange'); assert.equal(kg.shift.paused, true);
    document.hidden = false; kitchenEvent('visibilitychange'); assert.equal(kg.shift.paused, true);
    nodes.get('kitchen-resume').click();
    // Native keyboard button activation uses the same complete action path.
    nodes.get('kitchen-pan-0').listeners.click({ detail: 0 }); kitchen.plateNodes[0].listeners.click({ detail: 0 });
    assert.deepEqual(kg.shift.plates[0], ['toast']);
    const originalFactory = runtime.game.serialize();
    frames.shift()(performance.now() + 100); assert.equal(runtime.game.serialize(), originalFactory);
    failStorageKey = 'food-factory-kitchen-v1'; kitchen.save(); assert.match(nodes.get('kitchen-save-status').textContent, /无法保存/);
    failStorageKey = null; kitchen.save();
    nodes.get('kitchen-home').click(); assert.equal(runtime.ui.screen, 'menu'); assert.equal(kg.shift.paused, true);
    assert.equal(storage.has('food-factory-v1'), false); assert.ok(JSON.parse(storage.get('food-factory-kitchen-v1')).shift.paused);
    nodes.get('menu-kitchen').click(); assert.equal(kg.shift.paused, true);
    nodes.get('kitchen-resume').click(); tickKitchen(100);
    assert.equal(nodes.get('kitchen-result').hidden, false); assert.equal(nodes.get('kitchen-service').hidden, true);
    assert.equal(nodes.get('kitchen-upgrades').children.length, 3);
    const dayBeforeRetry = kg.state.day; nodes.get('kitchen-next').click(); assert.equal(kg.state.day, dayBeforeRetry);
    assert.equal(nodes.get('kitchen-service').hidden, false); nodes.get('kitchen-home').click();
    dropTarget = null;
    }
    nodes.get('menu-play').click(); assert.equal(runtime.ui.screen, 'workshop'); assert.equal(nodes.get('main-menu').hidden, true);
    assert.equal(runtime.practice.step, 0, 'a first-time player starts in an isolated practice factory');
    assert.equal(nodes.get('tutorial-card').hidden, false); assert.equal(storage.has('food-factory-v1'), false);
    const realBeforePractice = runtime.practice.realGame.serialize();
    frames.shift()(performance.now() + 100); assert.equal(runtime.game.state.time, 0, 'production waits for the belt lesson');
    nodes.get('palette').children.find(b => b.dataset.building === 'belt').click(); assert.equal(runtime.practice.step, 1);
    const tutorialPoint = (x, y) => ({ clientX: runtime.renderer.transform.x + (x + .5) * 72 * runtime.renderer.transform.scale, clientY: runtime.renderer.transform.y + (y + .5) * 72 * runtime.renderer.transform.scale });
    const tutorialTap = (x, y) => { nodes.get('factory-board').listeners.pointerdown({ button: 0, preventDefault() {}, pointerId: 90, ...tutorialPoint(x, y) }); nodes.get('factory-board').listeners.pointerup(); };
    tutorialTap(0, 0); assert.equal(runtime.game.at(0, 0), undefined); assert.equal(runtime.practice.step, 1);
    nodes.get('rotate').click(); assert.equal(runtime.ui.dir, 0);
    tutorialTap(6, 2); assert.equal(runtime.practice.step, 2); assert.equal(runtime.game.at(6, 2).dir, 0);
    nodes.get('speed').click(); assert.equal(runtime.game.state.speed, 2);
    for (let i = 0; i < 100; i++) runtime.game.update(.1);
    assert.ok(runtime.game.state.totalSold > 0, 'the connected production line earns coins without manual deliveries');
    assert.equal(runtime.game.service, undefined); assert.equal(runtime.serviceView, undefined);
    frames.shift()(performance.now() + 1000); assert.equal(runtime.practice.step, 3);
    tutorialTap(5, 2); nodes.get('upgrade-building').click(); assert.equal(runtime.practice.step, 4);
    for (let i = 0; i < 100; i++) runtime.game.update(.1);
    frames.shift()(performance.now() + 3000); nodes.get('claim-order').click(); assert.equal(runtime.practice.step, 5);
    assert.equal(storage.has('food-factory-v1'), false, 'practice, upgrades, rewards and autosave never write the real save');
    assert.equal(runtime.practice.realGame.serialize(), realBeforePractice);
    nodes.get('tutorial-exit').click(); assert.equal(runtime.practice, null); assert.equal(runtime.game.serialize(), realBeforePractice);
    assert.equal(nodes.get('tutorial-card').hidden, true); assert.equal(nodes.get('recipe-list').children.length, 10);
    frames.shift()(performance.now() + 100); assert.ok(draws.length >= 9);
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
    frames.shift()(performance.now() + 5000);
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
    // Returning to the menu freezes production and preserves a deliberate pause.
    runtime.game.state.paused = true;
    nodes.get('menu-home').click(); const menuSave = runtime.game.serialize();
    frames.shift()(performance.now() + 100000);
    assert.equal(runtime.game.serialize(), menuSave); assert.equal(nodes.get('factory-app').hidden, true);
    for (const key of ['r', ' ', 'Enter', 'Delete']) windowListeners.keydown({ key, preventDefault() {} });
    assert.equal(runtime.game.serialize(), menuSave);
    nodes.get('menu-play').click(); assert.equal(runtime.game.state.paused, true);
    runtime.game.state.paused = false;

    // Backup failure cannot replace an existing factory. A successful reset is reversible.
    nodes.get('menu-home').click(); nodes.get('menu-new').click();
    const beforeReset = runtime.game.serialize(), savedBeforeReset = storage.get('food-factory-v1');
    failStorageKey = 'food-factory-v1-before-restart'; nodes.get('restart-confirm').click();
    assert.equal(runtime.game.serialize(), beforeReset); assert.equal(storage.get('food-factory-v1'), savedBeforeReset);
    failStorageKey = 'food-factory-v1'; nodes.get('restart-confirm').click();
    assert.equal(runtime.game.serialize(), beforeReset); assert.equal(storage.get('food-factory-v1'), savedBeforeReset);
    failStorageKey = null; nodes.get('restart-cancel').click(); assert.equal(runtime.game.serialize(), beforeReset);
    nodes.get('menu-new').click(); nodes.get('restart-confirm').click();
    assert.equal(storage.get('food-factory-v1-before-restart'), beforeReset);
    assert.equal(runtime.game.state.buildings.length, 8); assert.equal(runtime.game.state.totalSold, 0); assert.equal(runtime.game.state.career.points, 0);
    assert.match(nodes.get('recipe-list').children.find(card => card.dataset.food === 'steamed_bun').children[2].textContent, /第 1 单后解锁/);
    nodes.get('menu-home').click(); assert.equal(nodes.get('menu-restore').hidden, false);
    nodes.get('menu-restore').click(); nodes.get('restart-confirm').click();
    assert.equal(runtime.game.serialize(), beforeReset); assert.equal(runtime.ui.screen, 'workshop');
    assert.match(nodes.get('recipe-list').children.find(card => card.dataset.food === 'steamed_bun').children[2].textContent, /已解锁/);

    // The career dialog offers contracts, freezes time while choosing, and pays once.
    runtime.game.state.orderIndex = 0;
    nodes.get('career-toggle').click(); assert.equal(nodes.get('career-dialog').open, true);
    assert.equal(nodes.get('contract-offers').children.length, 3);
    const beforeChoice = runtime.game.state.time; frames.shift()(performance.now() + 200000); assert.equal(runtime.game.state.time, beforeChoice);
    nodes.get('contract-offers').children[0].children.find(el => el.dataset?.contract === '0').click();
    assert.equal(nodes.get('career-dialog').open, false); assert.equal(runtime.game.contract.status, 'active');
    for (let i = 0; i < 6; i++) runtime.game.deliver('bread', { x: 1, y: 1 });
    nodes.get('career-toggle').click(); const pointsBefore = runtime.game.state.career.points;
    nodes.get('contract-action').click(); assert.equal(runtime.game.state.career.points, pointsBefore + 1);
    nodes.get('career-research-tab').click(); assert.equal(nodes.get('research-view').hidden, false);
    nodes.get('research-cards').children[0].children.find(el => el.dataset?.research === 'production').click();
    assert.equal(runtime.game.state.career.research.production, 1); assert.equal(runtime.game.state.career.points, pointsBefore);
    nodes.get('close-career').click();
    // Replaying and skipping every lesson preserves the exact real game and contract clock.
    assert.equal(runtime.game.acceptContract(0).ok, true);
    for (let step = 0; step <= 5; step++) {
      nodes.get('menu-home').click(); const realSave = runtime.game.serialize(), stored = storage.get('food-factory-v1');
      nodes.get('menu-tutorial').click(); runtime.practice.step = step;
      runtime.game.state.coins += 500; runtime.game.state.totalSold += 10;
      frames.shift()(performance.now() + 250000 + step * 3000);
      documentEvent('visibilitychange', {}); windowListeners.pagehide();
      assert.equal(storage.get('food-factory-v1'), stored); assert.equal(runtime.practice.realGame.serialize(), realSave);
      nodes.get('tutorial-exit').click(); assert.equal(runtime.game.serialize(), realSave); assert.equal(storage.get('food-factory-v1'), stored);
    }
    nodes.get('menu-home').click(); const beforePracticeMenu = runtime.game.serialize();
    nodes.get('menu-tutorial').click(); nodes.get('tutorial-retry').click(); assert.equal(runtime.practice.step, 0);
    nodes.get('menu-home').click(); assert.equal(runtime.practice, null); assert.equal(runtime.ui.screen, 'menu');
    assert.equal(runtime.game.serialize(), beforePracticeMenu); nodes.get('menu-play').click(); assert.equal(runtime.practice, null);
    nodes.get('help').click(); nodes.get('help-tutorial').click(); assert.equal(runtime.practice.step, 0); assert.equal(nodes.get('help-dialog').open, false);
    nodes.get('tutorial-exit').click(); assert.equal(runtime.game.serialize(), beforePracticeMenu);
    nodes.get('help').click(); assert.equal(nodes.get('help-dialog').open, true); nodes.get('help-done').click(); assert.equal(nodes.get('help-dialog').open, false);
    assert.equal(nodes.has('portrait-continue'), false, 'portrait play has no blocking rotate-device overlay');
    // Warehouse routing, shipping and milestone buttons use real core transitions.
    nodes.get('menu-home').click(); const beforeBusinessUi = runtime.game.serialize();
    assert.equal(runtime.game.restore(new FactoryGame().serialize()), true); nodes.get('menu-play').click();
    nodes.get('business-toggle').click(); assert.equal(nodes.get('business-dialog').open, true);
    const shopTime = runtime.game.state.time; frames.shift()(performance.now() + 350000); assert.equal(runtime.game.state.time, shopTime);
    nodes.get('business-locate-depot').click(); assert.equal(nodes.get('business-dialog').open, false);
    assert.equal(runtime.game.state.buildings.find(b => b.id === runtime.ui.selected).type, 'depot');
    const dispatch = runtime.game.at(8, 2), beforeDispatchUpgrade = runtime.game.state.coins;
    assert.match(nodes.get('upgrade-building').textContent, /提速至 1.5 秒\/份 · 60/);
    nodes.get('upgrade-building').click(); assert.equal(dispatch.level, 2); assert.equal(runtime.game.duration(dispatch), 1.5);
    assert.equal(runtime.game.state.coins, beforeDispatchUpgrade - 60);
    assert.match(nodes.get('upgrade-building').textContent, /提速至 1 秒\/份 · 81/);
    nodes.get('upgrade-building').click(); assert.equal(dispatch.level, 3); assert.equal(runtime.game.duration(dispatch), 1);
    assert.equal(nodes.get('upgrade-building').disabled, true); assert.equal(runtime.game.state.coins, beforeDispatchUpgrade - 141);
    nodes.get('depot-mode').click(); assert.equal(dispatch.mode, 'store');
    for (let n = 0; n < 900; n++) runtime.game.update(.1);
    frames.shift()(performance.now() + 353000); assert.ok(runtime.game.warehouseUsed >= 12); assert.equal(runtime.game.state.totalSold, 0);
    nodes.get('business-toggle').click(); const shipButton = nodes.get('wholesale-offers').children[0].children.find(el => el.dataset?.wholesale);
    assert.equal(shipButton.disabled, false); shipButton.click(); assert.equal(runtime.game.state.business.shipments, 1);
    const shippedSave = runtime.game.serialize(); shipButton.click(); assert.equal(runtime.game.serialize(), shippedSave);
    nodes.get('business-goals-tab').click(); assert.equal(nodes.get('business-goals-view').hidden, false);
    const milestoneButton = nodes.get('business-goals').children[0].children.find(el => el.dataset?.milestone);
    milestoneButton.click(); assert.equal(runtime.game.state.career.points, 1); const goalSave = runtime.game.serialize();
    milestoneButton.click(); assert.equal(runtime.game.serialize(), goalSave);
    nodes.get('business-trade-tab').click();
    const sellButton = nodes.get('warehouse-items').children[0].children.find(el => el.dataset?.sellFood);
    const stockBeforeRetail = runtime.game.warehouseUsed; sellButton.click(); assert.ok(runtime.game.warehouseUsed < stockBeforeRetail);
    nodes.get('business-back').click(); assert.equal(nodes.get('business-dialog').open, false); assert.equal(runtime.ui.screen, 'workshop');
    nodes.get('menu-home').click(); assert.equal(JSON.parse(storage.get('food-factory-v1')).business.shipments, 1);
    nodes.get('menu-business').click(); assert.equal(nodes.get('business-dialog').open, true); nodes.get('close-business').click(); nodes.get('menu-play').click();

    // Expanding keeps the view; minimap jumps clear a pending paint gesture and update hit tests.
    runtime.game.state.coins = 100000;
    const initialCamera = { x: runtime.renderer.camera.x, y: runtime.renderer.camera.y, scale: runtime.renderer.transform.scale };
    for (let n = 0; n < 5; n++) nodes.get('expand').click();
    assert.deepEqual(runtime.game.area, [40, 24]);
    assert.deepEqual({ x: runtime.renderer.camera.x, y: runtime.renderer.camera.y, scale: runtime.renderer.transform.scale }, initialCamera);
    assert.equal(nodes.get('expand').disabled, true); assert.equal(nodes.get('minimap-panel').hidden, false);
    nodes.get('palette').children.find(b => b.dataset.building === 'belt').click();
    down(strokeEvent(93, 10, 5)); const beforeMapJump = runtime.game.state.buildings.length;
    nodes.get('factory-minimap').listeners.pointerdown({ preventDefault() {}, clientX: 1008 * 39.5 / runtime.game.worldArea[0], clientY: 576 * 23.5 / runtime.game.worldArea[1] });
    assert.equal(runtime.renderer.camera.x, 39.5 * 72); assert.equal(runtime.renderer.camera.y, 23.5 * 72);
    move(strokeEvent(93, 39, 23)); up(strokeEvent(93, 39, 23));
    assert.equal(runtime.game.state.buildings.length, beforeMapJump, 'minimap navigation cannot continue a stale belt stroke');
    down(strokeEvent(94, 39, 23)); up(strokeEvent(94, 39, 23)); assert.equal(runtime.game.at(39, 23).type, 'belt');
    nodes.get('factory-minimap').listeners.keydown({ key: 'ArrowLeft', preventDefault() {} }); assert.equal(runtime.renderer.camera.x, 35.5 * 72);
    nodes.get('map-overview').click(); assert.ok(runtime.renderer.camera.zoom < 1);
    nodes.get('zoom-reset').click(); assert.equal(runtime.renderer.camera.zoom, 1); assert.equal(runtime.renderer.camera.x, 360);
    nodes.get('close-minimap').click(); assert.equal(nodes.get('minimap-panel').hidden, true);
    nodes.get('menu-home').click(); const menuCamera = runtime.renderer.camera.x;
    nodes.get('factory-minimap').listeners.pointerdown({ preventDefault() {}, clientX: 1000, clientY: 570 }); assert.equal(runtime.renderer.camera.x, menuCamera);
    assert.equal(runtime.game.restore(beforeBusinessUi), true); nodes.get('menu-play').click();
    // Recipe lookup stays pinned while production, serving and real canvas input continue.
    const beforeQuick = runtime.game.serialize();
    if (runtime.game.state.paused) nodes.get('resume').click();
    nodes.get('recipes-toggle').click(); assert.equal(nodes.get('quick-recipe').hidden, false);
    assert.equal(nodes.get('recipe-dialog').open, undefined); assert.equal(nodes.get('quick-recipe-food').children.length, 10);
    assert.equal(runtime.game.state.automationVersion, 1);
    const quickTime = runtime.game.state.time; frames.shift()(performance.now() + 355000);
    assert.ok(runtime.game.state.time > quickTime, 'a pinned recipe must not pause production');
    nodes.get('quick-recipe-food').listeners.change({ target: { value: 'bread' } });
    nodes.get('quick-recipe-chain').children.find(el => el.dataset?.recipeBuilding === 'bread_oven').click();
    assert.equal(runtime.ui.tool, 'bread_oven'); assert.equal(runtime.ui.category, 'machines'); assert.equal(nodes.get('quick-recipe').hidden, false);
    runtime.game.state.coins += 140;
    let free;
    for (let y = 0; y < runtime.game.area[1] && !free; y++) for (let x = 0; x < runtime.game.area[0] && !free; x++) if (!runtime.game.at(x, y)) free = { x, y };
    runtime.renderer.camera.centerOn(free.x + .5, free.y + .5); runtime.renderer.resize(runtime.game.area, runtime.ui);
    down(strokeEvent(201, free.x, free.y)); up(strokeEvent(201, free.x, free.y));
    assert.equal(runtime.game.at(free.x, free.y).type, 'bread_oven'); assert.equal(nodes.get('quick-recipe').hidden, false);
    runtime.game.state.orderIndex = 0;
    nodes.get('quick-recipe-food').listeners.change({ target: { value: 'orange_icepop' } });
    assert.match(nodes.get('quick-recipe-note').textContent, /第 2 单/);
    const lockedFreezer = nodes.get('quick-recipe-chain').children.find(el => el.dataset?.recipeBuilding === 'icepop_freezer');
    assert.equal(lockedFreezer.disabled, true); lockedFreezer.click(); assert.equal(runtime.ui.tool, 'bread_oven');
    document.activeElement = nodes.get('quick-recipe-food'); const dirBeforeSelect = runtime.ui.dir;
    windowListeners.keydown({ key: 'r', preventDefault() {} }); assert.equal(runtime.ui.dir, dirBeforeSelect);
    nodes.get('factory-board').focus(); windowListeners.keydown({ key: 'f', preventDefault() {} }); assert.equal(nodes.get('quick-recipe').hidden, true);
    windowListeners.keydown({ key: 'f', preventDefault() {} }); assert.equal(nodes.get('quick-recipe').hidden, false);
    nodes.get('help').click(); nodes.get('open-recipes').click(); assert.equal(nodes.get('help-dialog').open, false); assert.equal(nodes.get('recipe-dialog').open, undefined);
    nodes.get('close-quick-recipe').click(); assert.equal(nodes.get('quick-recipe').hidden, true);
    runtime.game.restore(beforeQuick);
    // Real entry handlers: two board contacts zoom without painting or serving.
    nodes.get('palette').children.find(b => b.dataset.building === 'belt')?.click();
    const beforePinch = runtime.game.serialize(), oldZoom = runtime.renderer.camera.zoom;
    const fingerA = { button: 0, pointerType: 'touch', pointerId: 801, target: board, clientX: 400, clientY: 280, preventDefault() {} };
    const fingerB = { ...fingerA, pointerId: 802, clientX: 600 };
    down(fingerA); down(fingerB);
    documentEvent('pointermove', { ...fingerB, clientX: 670 }); board.listeners.pointermove({ ...fingerB, clientX: 670 });
    assert.ok(runtime.renderer.camera.zoom > oldZoom); assert.equal(runtime.game.serialize(), beforePinch);
    up(fingerA); up(fingerB); assert.equal(runtime.game.serialize(), beforePinch);
    nodes.get('select-tool').click();
    const panStart = runtime.renderer.camera.x;
    const swipe = { ...fingerA, pointerId: 803, ...point(12, 10) }; down(swipe); board.listeners.pointermove({ ...swipe, clientX: swipe.clientX + 45 }); up({ ...swipe, clientX: swipe.clientX + 45 });
    assert.ok(runtime.renderer.camera.x < panStart); assert.equal(runtime.game.serialize(), beforePinch);
    // Phone portrait retains construction, camera reset and nonmodal recipes.
    viewport = { width: 390, height: 844 }; runtime.renderer.viewport = null;
    runtime.renderer.resize(runtime.game.area, runtime.ui); nodes.get('zoom-reset').click();
    const transform = runtime.renderer.transform, centerX = transform.x + 5 * 72 * transform.scale;
    assert.ok(centerX > 44 && centerX < 346); assert.equal(runtime.renderer.camera.zoom, 1);
    for (const id of ['service-tools', 'service-jump', 'staff-jump']) assert.equal(nodes.has(id), false);
    viewport = { width: 1008, height: 576 }; runtime.renderer.viewport = null; runtime.renderer.resize(runtime.game.area, runtime.ui);
    nodes.get('menu-home').click();
    // Reload an old-format save into the menu, retaining explicit settings over OS defaults.
    const legacy = JSON.parse(storage.get('food-factory-v1')); delete legacy.career;
    storage.set('food-factory-v1', JSON.stringify(legacy));
    window.matchMedia = () => ({ matches: true, addEventListener() {} });
    const { runtime: reloaded } = await import(`../src/factory-main.js?legacy=${Date.now()}`);
    assert.equal(reloaded.ui.screen, 'menu'); assert.equal(reloaded.game.state.coins, legacy.coins);
    assert.equal(reloaded.game.state.career.points, 0); assert.equal(reloaded.ui.reducedMotion, false);
    assert.match(nodes.get('menu-play').textContent, /继续经营/);
    storage.delete('food-factory-tutorial-v1'); nodes.get('menu-play').click(); assert.equal(reloaded.practice, null, 'legacy players are never forced into practice');
    storage.set('food-factory-preferences-v1', '{');
    await import(`../src/factory-main.js?bad-preference=${Date.now()}`);
    assert.equal(nodes.get('menu-restore').hidden, false, 'damaged settings must not hide an existing backup');
    // Preserve a genuine single-slot save before applying new transport timings.
    const oldFlow = await readFile(new URL('./fixtures/flow-v0102-save.json', import.meta.url), 'utf8');
    storage.set('food-factory-v1', oldFlow);
    await import(`../src/factory-main.js?flow-migration=${Date.now()}`);
    assert.equal(storage.get('food-factory-v1-before-paced-flow'), oldFlow);
    assert.equal(storage.get('food-factory-v1-before-auto-dispatch'), oldFlow);
    assert.equal(JSON.parse(storage.get('food-factory-v1')).flowVersion, 2);
    storage.set('food-factory-v1', oldFlow); failStorageKey = 'food-factory-v1-before-paced-flow';
    await import(`../src/factory-main.js?flow-protected=${Date.now()}`);
    nodes.get('menu-play').click(); nodes.get('menu-home').click();
    assert.equal(storage.get('food-factory-v1'), oldFlow); failStorageKey = null;
    // Classic saves get the compact automatic model without losing progress.
    const classicRaw = new FactoryGame().serialize(); storage.set('food-factory-v1', classicRaw);
    failStorageKey = 'food-factory-v1-before-auto-dispatch';
    await import(`../src/factory-main.js?automatic-protected=${Date.now()}`);
    nodes.get('menu-play').click(); nodes.get('menu-home').click();
    assert.equal(storage.get('food-factory-v1'), classicRaw); failStorageKey = null;
    await import(`../src/factory-main.js?automatic-migration=${Date.now()}`);
    assert.equal(storage.get('food-factory-v1-before-auto-dispatch'), classicRaw);
    assert.equal(JSON.parse(storage.get('food-factory-v1')).automationVersion, 1);
    assert.equal(JSON.parse(storage.get('food-factory-v1')).service, undefined);
    // A real staffed save is backed up before conversion; a full storage quota
    // cannot overwrite it or allow a second refund on a native-save reload.
    const compactFixture = JSON.parse(await readFile(new URL('./fixtures/service-v016-saves.json', import.meta.url), 'utf8'));
    const beforeCompact = JSON.stringify(compactFixture.deliver); storage.set('food-factory-v1', beforeCompact);
    failStorageKey = 'food-factory-v1-before-auto-dispatch';
    await import(`../src/factory-main.js?compact-protected=${Date.now()}`);
    nodes.get('menu-play').click(); nodes.get('menu-home').click(); assert.equal(storage.get('food-factory-v1'), beforeCompact); failStorageKey = null;
    await import(`../src/factory-main.js?compact-migration=${Date.now()}`);
    assert.equal(storage.get('food-factory-v1-before-auto-dispatch'), beforeCompact);
    assert.deepEqual(JSON.parse(storage.get('food-factory-v1')).workshopArea, [10, 6]);
    assert.equal(JSON.parse(storage.get('food-factory-v1')).service, undefined);
    assert.equal(JSON.parse(storage.get('food-factory-v1')).automationVersion, 1);
    const convertedCoins = JSON.parse(storage.get('food-factory-v1')).coins;
    await import(`../src/factory-main.js?automatic-repeat=${Date.now()}`);
    assert.equal(JSON.parse(storage.get('food-factory-v1')).coins, convertedCoins);
    assert.equal(storage.get('food-factory-v1-before-auto-dispatch'), beforeCompact);
    // Preserve the raw cat-era save before the migrated factory can auto-save.
    const catFixtures = JSON.parse(await readFile(new URL('./fixtures/cat-v010-saves.json', import.meta.url), 'utf8'));
    const catRaw = JSON.stringify(catFixtures.working);
    storage.set('food-factory-v1', catRaw);
    await import(`../src/factory-main.js?cat-migration=${Date.now()}`);
    assert.equal(storage.get('food-factory-v1-before-classic'), catRaw);
    assert.equal(JSON.parse(storage.get('food-factory-v1')).shop, undefined);
    assert.equal(JSON.parse(storage.get('food-factory-v1')).coins, 1096);
    storage.set('food-factory-v1', catRaw); failStorageKey = 'food-factory-v1-before-classic';
    await import(`../src/factory-main.js?cat-protected=${Date.now()}`);
    nodes.get('menu-play').click(); nodes.get('menu-home').click();
    assert.equal(storage.get('food-factory-v1'), catRaw, 'failed backup must prevent autosave overwrite');
    failStorageKey = null;
    // Even if the initial corrupt-save backup fails, reset never substitutes a fresh
    // factory for the original raw backup until the user explicitly confirms it.
    storage.set('food-factory-v1', '{broken'); failStorageKey = 'all';
    const { runtime: protectedRun } = await import(`../src/factory-main.js?protected=${Date.now()}`);
    nodes.get('menu-play').click(); assert.equal(storage.get('food-factory-v1'), '{broken');
    nodes.get('menu-home').click(); nodes.get('menu-new').click();
    const protectedBefore = protectedRun.game.serialize(); nodes.get('restart-confirm').click();
    assert.equal(protectedRun.game.serialize(), protectedBefore); assert.equal(storage.get('food-factory-v1'), '{broken');
    failStorageKey = null; nodes.get('restart-confirm').click();
    assert.equal(storage.get('food-factory-v1-before-restart'), '{broken');
    assert.equal(JSON.parse(storage.get('food-factory-v1')).version, 1);
    // A separate, persistent package workshop never overwrites the main game.
    nodes.get('menu-home').click();
    const originalFactory = protectedRun.game.serialize(), originalStorage = storage.get('food-factory-v1');
    nodes.get('menu-packing').click();
    assert.equal(protectedRun.game.state.packingTrial.goal, 0);
    assert.equal(protectedRun.ui.tool, 'breakfast_packer');
    assert.deepEqual(protectedRun.ui.tutorialTarget, { x: 5, y: 3 });
    assert.equal(nodes.get('packing-goal').hidden, false);
    assert.equal(nodes.get('recipe-list').children.length, 5);
    assert.equal(storage.get('food-factory-v1'), originalStorage);
    assert.equal(JSON.parse(storage.get('food-factory-packing-v1')).packingTrial.goal, 0);
    nodes.get('packing-recipe').click();
    assert.equal(nodes.get('quick-recipe').hidden, false); assert.equal(nodes.get('quick-recipe-food').children.length, 5);
    assert.equal(document.querySelector('dialog[open]'), undefined);
    nodes.get('close-quick-recipe').click();
    const packPoint = () => ({ clientX: protectedRun.renderer.transform.x + 5.5 * 72 * protectedRun.renderer.transform.scale, clientY: protectedRun.renderer.transform.y + 3.5 * 72 * protectedRun.renderer.transform.scale });
    nodes.get('factory-board').listeners.pointerdown({ button: 0, preventDefault() {}, pointerId: 201, ...packPoint() }); nodes.get('factory-board').listeners.pointerup();
    assert.equal(protectedRun.game.at(5, 3).type, 'breakfast_packer');
    for (let n = 0; n < 500; n++) protectedRun.game.update(.1);
    nodes.get('pause').click();
    assert.equal(protectedRun.game.orderReady, true); assert.equal(nodes.get('packing-claim').hidden, false);
    nodes.get('packing-claim').click(); assert.equal(protectedRun.game.state.packingTrial.goal, 1);
    nodes.get('menu-home').click();
    assert.equal(protectedRun.game.serialize(), originalFactory); assert.equal(storage.get('food-factory-v1'), originalStorage);
    assert.equal(nodes.get('packing-goal').hidden, true); assert.equal(nodes.get('recipe-list').children.length, 10);
    const { runtime: packageReload } = await import(`../src/factory-main.js?packing-reload=${Date.now()}`);
    nodes.get('menu-packing').click();
    assert.equal(packageReload.game.state.packingTrial.goal, 1); assert.equal(packageReload.game.state.paused, true);
    assert.equal(packageReload.game.at(5, 3).type, 'breakfast_packer');
    nodes.get('menu-home').click();
    assert.equal(storage.get('food-factory-v1'), originalStorage);
    storage.set('food-factory-packing-v1', '{broken-package'); failStorageKey = 'all';
    const { runtime: protectedPackage } = await import(`../src/factory-main.js?packing-protected=${Date.now()}`);
    nodes.get('menu-packing').click(); nodes.get('menu-home').click();
    assert.equal(protectedPackage.game.state.packingTrial, undefined);
    assert.equal(storage.get('food-factory-packing-v1'), '{broken-package');
    assert.equal(storage.get('food-factory-v1'), originalStorage); failStorageKey = null;
    // Hands-on cooking is a real scene with physical input, persistent progress,
    // no direct payout, and a tray that feeds the ordinary conveyor simulation.
    storage.set('food-factory-v1', new FactoryGame().serialize());
    const { runtime: cooking } = await import(`../src/factory-main.js?cooking=${Date.now()}`);
    nodes.get('menu-craft').click();
    assert.equal(cooking.ui.screen, 'craft'); assert.equal(nodes.get('craft-room').hidden, false);
    assert.equal(nodes.get('factory-app').hidden, true); assert.equal(document.querySelector('dialog[open]'), undefined);
    const view = cooking.craftingView, craftCanvas = nodes.get('craft-canvas');
    const craftPoint = (x, y) => ({ clientX: view.transform.x + x * view.transform.scale, clientY: view.transform.y + y * view.transform.scale });
    const craftEvent = (x, y, id = 301) => ({ button: 0, pointerId: id, pointerType: 'touch', preventDefault() {}, ...craftPoint(x, y) });
    const l = view.layout;
    craftCanvas.listeners.pointerdown(craftEvent(l.cutter.x, l.cutter.y));
    craftCanvas.listeners.pointermove(craftEvent(l.x, l.y));
    craftCanvas.listeners.pointerup(craftEvent(l.x, l.y));
    assert.equal(cooking.game.state.crafting.batch.stage, 'fry_ready'); assert.equal(cooking.game.state.crafting.batch.shape, 100);
    view.draw(performance.now()); nodes.get('craft-primary').click(); assert.equal(cooking.game.state.crafting.batch.stage, 'frying');
    nodes.get('craft-pause').click(); for (let i = 0; i < 20; i++) view.step(.1);
    assert.equal(cooking.game.state.crafting.batch.heat, 0); nodes.get('craft-pause').click();
    for (let i = 0; i < 30; i++) view.step(.1);
    windowListeners.blur(); assert.equal(cooking.ui.craftPaused, true); view.step(.1); assert.equal(cooking.game.state.crafting.batch.heat, 3);
    nodes.get('craft-back').click(); assert.equal(cooking.ui.screen, 'workshop');
    assert.equal(JSON.parse(storage.get('food-factory-v1')).crafting.batch.heat, 3);
    nodes.get('craft-toggle').click(); assert.equal(cooking.game.state.crafting.batch.heat, 3);
    document.hidden = true; view.step(.1); assert.equal(cooking.game.state.crafting.batch.heat, 3); document.hidden = false;
    for (let i = 0; i < 40; i++) view.step(.1);
    view.draw(performance.now()); nodes.get('craft-primary').click(); assert.equal(cooking.game.state.crafting.batch.stage, 'glaze');
    // A continuous touch stroke paints separate portions of the icing ring.
    const ring = a => craftEvent(l.x + Math.cos(a) * l.radius * .75, l.y + Math.sin(a) * l.radius * .75 * .8);
    craftCanvas.listeners.pointerdown(ring(.01));
    for (let i = 1; i <= 60; i++) craftCanvas.listeners.pointermove(ring(i / 60 * Math.PI * 2));
    craftCanvas.listeners.pointerup(ring(.01));
    view.draw(performance.now()); assert.equal(cooking.game.state.crafting.batch.mask, 4095); nodes.get('craft-primary').click();
    assert.equal(cooking.game.state.crafting.made, 1); assert.equal(cooking.game.state.crafting.best, 100);
    assert.equal(cooking.game.state.coins, 450); assert.equal(cooking.game.state.time, 0); assert.equal(cooking.game.isUnlocked('icing_machine'), true);
    view.draw(performance.now()); nodes.get('craft-primary').click();
    assert.equal(cooking.ui.screen, 'workshop'); assert.equal(cooking.ui.tool, 'handmade'); assert.equal(nodes.get('handmade-tray').hidden, false);
    const foodDrop = (x, y) => {
      const t = cooking.renderer.transform;
      nodes.get('factory-board').listeners.pointerdown({ button: 0, pointerId: 305, preventDefault() {}, clientX: t.x + (x + .5) * 72 * t.scale, clientY: t.y + (y + .5) * 72 * t.scale }); nodes.get('factory-board').listeners.pointerup();
    };
    foodDrop(0, 0); assert.equal(cooking.game.state.crafting.queue.length, 1);
    foodDrop(7, 2); assert.equal(cooking.game.state.crafting.queue.length, 0); assert.equal(cooking.game.at(7, 2).output, 'donut_strawberry');
    assert.equal(cooking.game.state.coins, 450); for (let i = 0; i < 50; i++) cooking.game.update(.1);
    assert.equal(cooking.game.state.delivered.donut_strawberry, 1); assert.equal(cooking.game.state.coins, 463);
    nodes.get('craft-toggle').click(); nodes.get('craft-auto').click();
    assert.equal(cooking.ui.screen, 'workshop'); assert.equal(nodes.get('quick-recipe').hidden, false);
    const icingRecipe = nodes.get('quick-recipe-chain').children.find(b => b.dataset?.recipeBuilding === 'icing_machine');
    assert.equal(icingRecipe.disabled, false); icingRecipe.click(); assert.equal(cooking.ui.tool, 'icing_machine');
    nodes.get('menu-home').click();
    const { runtime: cookingReload } = await import(`../src/factory-main.js?cooking-reload=${Date.now()}`);
    assert.equal(cookingReload.game.state.crafting.made, 1); assert.equal(cookingReload.game.state.crafting.best, 100);
    nodes.get('menu-craft').click(); cookingReload.craftingView.info(); nodes.get('craft-again').click();
    viewport = { width: 390, height: 510 }; cookingReload.craftingView.open();
    const mobileView = cookingReload.craftingView, ml = mobileView.layout, mt = mobileView.transform;
    const mobilePoint = p => ({ button: 0, pointerId: 310, pointerType: 'touch', preventDefault() {}, clientX: mt.x + p.x * mt.scale, clientY: mt.y + p.y * mt.scale });
    craftCanvas.listeners.pointerdown(mobilePoint(ml.cutter)); craftCanvas.listeners.pointerup(mobilePoint(ml.cutter)); craftCanvas.listeners.lostpointercapture();
    assert.equal(mobileView.cutterSelected, true, 'tap-to-select remains active after implicit pointer capture release');
    craftCanvas.listeners.pointerdown(mobilePoint({ x: ml.x, y: ml.y })); craftCanvas.listeners.pointerup(mobilePoint({ x: ml.x, y: ml.y }));
    assert.equal(cookingReload.game.state.crafting.batch.stage, 'fry_ready'); mobileView.draw(performance.now());
    craftCanvas.listeners.keydown({ key: ' ', repeat: false, preventDefault() {} }); assert.equal(cookingReload.game.state.crafting.batch.stage, 'frying');
    for (let i = 0; i < 70; i++) mobileView.step(.1); craftCanvas.listeners.keydown({ key: 'Enter', repeat: false, preventDefault() {} });
    for (let i = 0; i < 12; i++) craftCanvas.listeners.keydown({ key: ' ', repeat: false, preventDefault() {} });
    mobileView.info(); nodes.get('craft-primary').click(); assert.equal(cookingReload.game.state.crafting.made, 2);
    nodes.get('craft-back').click(); nodes.get('menu-home').click();
    // A restored kitchen is paused, and corrupt kitchen data never overwrites factory progress.
    const factoryBeforeKitchenReload = storage.get('food-factory-v1');
    const { runtime: kitchenReload } = await import(`../src/factory-main.js?kitchen-reload=${Date.now()}`);
    nodes.get('menu-kitchen').click(); assert.equal(kitchenReload.kitchenView.game.shift.paused, true);
    assert.equal(kitchenReload.kitchenView.game.state.totalServed, 2);
    nodes.get('kitchen-home').click(); assert.equal(storage.get('food-factory-v1'), factoryBeforeKitchenReload);
    storage.set('food-factory-kitchen-v1', '{bad-kitchen'); failStorageKey = 'all';
    await import(`../src/factory-main.js?kitchen-protected=${Date.now()}`);
    nodes.get('menu-kitchen').click(); nodes.get('kitchen-pan-0').click(); nodes.get('kitchen-home').click();
    assert.equal(storage.get('food-factory-kitchen-v1'), '{bad-kitchen');
    assert.equal(storage.get('food-factory-v1'), factoryBeforeKitchenReload);
    failStorageKey = null;
    await import(`../src/factory-main.js?kitchen-recovery=${Date.now()}`);
    assert.ok([...storage.entries()].some(([key, value]) => key.startsWith('food-factory-kitchen-v1-recovery-') && value === '{bad-kitchen'));
    nodes.get('menu-kitchen').click(); assert.equal(JSON.parse(storage.get('food-factory-kitchen-v1')).coins, 0);
    nodes.get('kitchen-home').click(); assert.equal(storage.get('food-factory-v1'), factoryBeforeKitchenReload);
    {
      const { runtime: expandedKitchen } = await import(`../src/factory-main.js?kitchen-expanded=${Date.now()}`);
      const view = expandedKitchen.kitchenView, g = view.game;
      g.state.day = 4; g.state.totalServed = 18; g.state.coins = 240; g.state.shift = null;
      nodes.get('menu-kitchen').click();
      const step = seconds => { for (let i = 0; i < Math.round(seconds * 10); i++) view.step(.1); };
      const choose = (id, part) => nodes.get(id).children.find(b => b.dataset?.ingredient === part).click();
      const pantry = part => { nodes.get('kitchen-pantry').children.find(b => b.dataset?.pantry === part).click(); view.plateNodes[0].click(); };
      const event = (id, x = 10) => ({ button: 0, pointerId: id, isPrimary: true, pointerType: 'touch', clientX: x, clientY: 50, preventDefault() {} });
      const emit = (kind, e) => documentListeners[kind]?.forEach(fn => fn(e));
      assert.equal(nodes.get('kitchen-drink-station').hidden, false);
      assert.equal(nodes.get('kitchen-pan-art-0').children[0].tagName, 'CANVAS');
      // Assemble an actual sandwich via the live ingredient buttons, flipped egg and chopped tomato.
      pantry('slice'); choose('kitchen-pan-picker', 'egg'); nodes.get('kitchen-pan-0').click();
      step(3.2); assert.equal(g.panStage(0), 'flip'); nodes.get('kitchen-pan-0').click(); step(3.2);
      assert.equal(g.panStage(0), 'ready'); nodes.get('kitchen-pan-0').click(); view.plateNodes[0].click();
      choose('kitchen-board-picker', 'tomato'); for (let n = 0; n < 5; n++) nodes.get('kitchen-board').click(); view.plateNodes[0].click();
      pantry('lettuce'); pantry('slice'); assert.deepEqual(g.shift.plates[0], ['slice', 'egg', 'tomato', 'lettuce', 'slice']);
      assert.ok(view.plateNodes[0].children.some(c => c.className === 'plate-complete'));
      view.orderNodes.get(1).button.click(); assert.equal(g.state.coins, 259);
      // Hold-to-pour, release in range, then serve the resulting real drink.
      step(1.2); nodes.get('kitchen-drink').listeners.pointerdown(event(620)); step(2.4);
      emit('pointerup', event(620)); assert.equal(g.shift.drink.stage, 'ready');
      nodes.get('kitchen-drink').listeners.click({ detail: 1 }); assert.equal(g.shift.drink.stage, 'ready');
      view.suppressClickUntil = 0; nodes.get('kitchen-drink').click(); view.plateNodes[1].click();
      view.orderNodes.get(2).button.click(); assert.equal(g.state.coins, 268);
      choose('kitchen-drink-picker', 'shake'); nodes.get('kitchen-drink').listeners.pointerdown(event(621)); step(2.4); emit('pointerup', event(621));
      assert.equal(g.shift.drink.stage, 'mixing'); view.suppressClickUntil = 0;
      nodes.get('kitchen-drink').listeners.pointerdown(event(622));
      for (const x of [100, -100, 100, -100]) emit('pointermove', event(622, x));
      emit('pointerup', event(622, -100)); assert.equal(g.shift.drink.stage, 'ready');
      view.suppressClickUntil = 0; nodes.get('kitchen-drink-clear').click();
      nodes.get('kitchen-drink').listeners.pointerdown(event(623)); step(1);
      emit('pointercancel', event(623)); const fill = g.shift.drink.fill; step(1); assert.equal(g.shift.drink.fill, fill);
      view.suppressClickUntil = 0; nodes.get('kitchen-drink-clear').click();
      for (let n = 0; n < 10; n++) nodes.get('kitchen-pour-step').click();
      assert.equal(g.shift.drink.stage, 'ready', 'keyboard-friendly pour steps and mixing finish a real milkshake');
      // The shop is a paused scene; buying changes generated plate/cloth/pan sprites, not only its thumbnail.
      nodes.get('kitchen-decor-toggle').click(); assert.equal(g.shift.paused, true); assert.equal(nodes.get('kitchen-service').hidden, true);
      const decorButton = id => nodes.get('kitchen-decor-items').children.map(c => c.children.at(-1)).find(b => b.dataset.decor === id);
      decorButton('plate_peach').click(); assert.equal(g.state.decor.equipped.plate, 'plate_peach'); assert.equal(g.state.coins, 213);
      decorButton('plate_cream').click(); decorButton('plate_peach').click(); assert.equal(g.state.coins, 213);
      nodes.get('kitchen-decor-tabs').children.find(b => b.textContent === '桌布').click(); decorButton('cloth_sage').click();
      assert.equal(g.state.decor.equipped.cloth, 'cloth_sage'); assert.equal(nodes.get('kitchen-counter-skin').children[0].tagName, 'CANVAS');
      nodes.get('kitchen-decor-back').click(); assert.equal(g.shift.paused, false); assert.equal(nodes.get('kitchen-decor').hidden, true);
      nodes.get('kitchen-decor-toggle').click(); view.pause(false); assert.equal(g.shift.paused, true);
      windowListeners.keydown({ key: 'Escape', preventDefault() {} }); assert.equal(view.decorOpen, false); assert.equal(g.shift.paused, false);
      assert.equal(JSON.parse(storage.get('food-factory-kitchen-v1')).decor.equipped.plate, 'plate_peach');
      nodes.get('kitchen-home').click(); assert.equal(storage.get('food-factory-v1'), factoryBeforeKitchenReload);
      // A migration backup failure must protect the untouched version-one raw save.
      const legacy = JSON.parse(storage.get('food-factory-kitchen-v1')); legacy.version = 1; delete legacy.decor; legacy.shift = null;
      storage.set('food-factory-kitchen-v1', JSON.stringify(legacy)); failStorageKey = 'food-factory-kitchen-v1-before-recipes-v2';
      await import(`../src/factory-main.js?kitchen-legacy-protected=${Date.now()}`);
      nodes.get('menu-kitchen').click(); nodes.get('kitchen-home').click(); assert.equal(storage.get('food-factory-kitchen-v1'), JSON.stringify(legacy));
      failStorageKey = null; await import(`../src/factory-main.js?kitchen-legacy-migration=${Date.now()}`);
      nodes.get('menu-kitchen').click(); nodes.get('kitchen-home').click();
      assert.equal(storage.get('food-factory-kitchen-v1-before-recipes-v2'), JSON.stringify(legacy));
      assert.equal(JSON.parse(storage.get('food-factory-kitchen-v1')).version, 2);
      assert.equal(storage.get('food-factory-v1'), factoryBeforeKitchenReload); dropTarget = null;
    }
  } finally {
    for (const [name, descriptor] of savedGlobals) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; }
  }
});

test('renderer cell mapping uses its fitted viewport rather than stretching the board', () => {
  const canvas = { getContext: () => ({}), getBoundingClientRect: () => ({ left: 20, top: 30, width: 600, height: 240 }) };
  const renderer = new FactoryRenderer(canvas, {}); renderer.transform = { scale: 1 / 3, x: 132, y: 24 };
  assert.deepEqual(renderer.cellAt(20 + 132 + 36 / 3, 30 + 24 + 36 / 3), { x: 0, y: 0 });
});
