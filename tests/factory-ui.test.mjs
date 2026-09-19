import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { FactoryRenderer } from '../src/factory-renderer.js';
import { FactoryGame } from '../src/factory-core.js';

test('factory entry loads generated atlases and wires construction, production, order and persistence controls', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const manifest = JSON.parse(await readFile(new URL('../assets/generated/factory/cream-v1/manifest.json', import.meta.url), 'utf8'));
  const nodes = new Map(), storage = new Map(), frames = [], draws = [], documentListeners = {}, windowListeners = {};
  let failStorageKey = null;
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
  install('window', { devicePixelRatio: 1, addEventListener(name, callback) { windowListeners[name] = callback; } });
  install('localStorage', { getItem: key => storage.get(key) || null, setItem: (key, value) => { if (key === failStorageKey || failStorageKey === 'all') throw new Error('Storage full'); storage.set(key, value); } });
  install('Image', class { async decode() {} });
  install('fetch', async () => ({ ok: true, json: async () => manifest }));
  install('requestAnimationFrame', callback => { frames.push(callback); return frames.length; });
  install('setTimeout', () => 1); install('clearTimeout', () => {});
  try {
    const { runtime } = await import(`../src/factory-main.js?test=${Date.now()}`);
    const feedCats = () => { for (const c of runtime.game.service.customers) if (!c.cooldown && runtime.game.findShelf(c.want)) runtime.game.serveFromShelf(runtime.game.findShelf(c.want).id, c.want, c.id); };
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
    assert.equal(runtime.game.state.totalSold, 0, 'production alone does not earn coins');
    runtime.serviceView.select('bread'); runtime.serviceView.drop(0);
    frames.shift()(performance.now() + 1000); assert.equal(runtime.practice.step, 3);
    tutorialTap(5, 2); nodes.get('upgrade-building').click(); assert.equal(runtime.practice.step, 4);
    for (let i = 0; i < 100; i++) { runtime.game.update(.1); feedCats(); }
    frames.shift()(performance.now() + 3000); nodes.get('claim-order').click(); assert.equal(runtime.practice.step, 5);
    assert.equal(storage.has('food-factory-v1'), false, 'practice, upgrades, rewards and autosave never write the real save');
    assert.equal(runtime.practice.realGame.serialize(), realBeforePractice);
    nodes.get('tutorial-exit').click(); assert.equal(runtime.practice, null); assert.equal(runtime.game.serialize(), realBeforePractice);
    assert.equal(nodes.get('tutorial-card').hidden, true); assert.equal(nodes.get('recipe-list').children.length, 8);
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
    for (let i = 0; i < 200; i++) { runtime.game.update(.1); feedCats(); }
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
    nodes.get('portrait-continue').click(); assert.equal(orientation.hidden, true);
    // Warehouse routing, shipping and milestone buttons use real core transitions.
    nodes.get('menu-home').click(); const beforeBusinessUi = runtime.game.serialize();
    assert.equal(runtime.game.restore(new FactoryGame().serialize()), true); nodes.get('menu-play').click();
    nodes.get('business-toggle').click(); assert.equal(nodes.get('business-dialog').open, true);
    const shopTime = runtime.game.state.time; frames.shift()(performance.now() + 350000); assert.equal(runtime.game.state.time, shopTime);
    nodes.get('business-locate-depot').click(); assert.equal(nodes.get('business-dialog').open, false);
    assert.equal(runtime.game.state.buildings.find(b => b.id === runtime.ui.selected).type, 'depot');
    const dispatch = runtime.game.at(8, 2), beforeDispatchUpgrade = runtime.game.state.coins;
    assert.match(nodes.get('upgrade-building').textContent, /扩至 12 份 · 60/);
    nodes.get('upgrade-building').click(); assert.equal(dispatch.level, 2); assert.equal(runtime.game.duration(dispatch), 1.5);
    assert.equal(runtime.game.state.coins, beforeDispatchUpgrade - 60);
    assert.match(nodes.get('upgrade-building').textContent, /扩至 16 份 · 81/);
    nodes.get('upgrade-building').click(); assert.equal(dispatch.level, 3); assert.equal(runtime.game.duration(dispatch), 1);
    assert.equal(nodes.get('upgrade-building').disabled, true); assert.equal(runtime.game.state.coins, beforeDispatchUpgrade - 141);
    for (let n = 0; n < 900; n++) runtime.game.update(.1);
    frames.shift()(performance.now() + 352000); nodes.get('shelf-store').click();
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
    nodes.get('factory-minimap').listeners.pointerdown({ preventDefault() {}, clientX: 1008 * 39.5 / 40, clientY: 576 * 23.5 / 24 });
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
    assert.equal(nodes.get('recipe-dialog').open, undefined); assert.equal(nodes.get('quick-recipe-food').children.length, 8);
    assert.equal(runtime.serviceView.active(), true);
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
    runtime.game.restore(beforeQuick); nodes.get('menu-home').click();
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
    assert.equal(storage.get('food-factory-v1-before-customer-counter'), oldFlow);
    assert.equal(JSON.parse(storage.get('food-factory-v1')).flowVersion, 2);
    storage.set('food-factory-v1', oldFlow); failStorageKey = 'food-factory-v1-before-paced-flow';
    await import(`../src/factory-main.js?flow-protected=${Date.now()}`);
    nodes.get('menu-play').click(); nodes.get('menu-home').click();
    assert.equal(storage.get('food-factory-v1'), oldFlow); failStorageKey = null;
    // Customer migration has its own raw backup, and backup failure never overwrites it.
    const classicRaw = new FactoryGame().serialize(); storage.set('food-factory-v1', classicRaw);
    failStorageKey = 'food-factory-v1-before-customer-counter';
    await import(`../src/factory-main.js?customer-protected=${Date.now()}`);
    nodes.get('menu-play').click(); nodes.get('menu-home').click();
    assert.equal(storage.get('food-factory-v1'), classicRaw); failStorageKey = null;
    await import(`../src/factory-main.js?customer-migration=${Date.now()}`);
    assert.equal(storage.get('food-factory-v1-before-customer-counter'), classicRaw);
    assert.equal(JSON.parse(storage.get('food-factory-v1')).service.version, 1);
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
  } finally {
    for (const [name, descriptor] of savedGlobals) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; }
  }
});

test('renderer cell mapping uses its fitted viewport rather than stretching the board', () => {
  const canvas = { getContext: () => ({}), getBoundingClientRect: () => ({ left: 20, top: 30, width: 600, height: 240 }) };
  const renderer = new FactoryRenderer(canvas, {}); renderer.transform = { scale: 1 / 3, x: 132, y: 24 };
  assert.deepEqual(renderer.cellAt(20 + 132 + 36 / 3, 30 + 24 + 36 / 3), { x: 0, y: 0 });
});
