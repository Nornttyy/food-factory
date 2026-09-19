import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { FactoryAssets } from '../src/factory-renderer.js';
import { validateFactoryAssets } from '../scripts/validate-factory-assets.mjs';

const source = await readFile(new URL('../src/factory-loading.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

function loader({ systemReduced = false, preferences = '{}' } = {}) {
  const nodes = new Map(), timers = new Map(), listeners = new Map();
  let serial = 0, reloads = 0, animations = 0, cancelled = 0;
  const document = { getElementById: id => nodes.get(id), activeElement: null };
  for (const [, id] of html.matchAll(/\bid="([^"]+)"/g)) {
    const events = new Map();
    nodes.set(id, {
      id, hidden: id === 'loading-retry', inert: id === 'main-menu', textContent: '', value: 0,
      addEventListener: (name, fn) => events.set(name, fn),
      removeEventListener: (name, fn) => { if (events.get(name) === fn) events.delete(name); },
      click: () => events.get('click')?.(),
      setAttribute(name, value) { this[name] = value; },
      contains: node => node?.id?.startsWith('loading'),
      focus() { document.activeElement = this; },
      animate() { animations++; return { cancel() { cancelled++; } }; },
    });
  }
  const window = {
    location: { reload() { reloads++; } },
    matchMedia: () => ({ matches: systemReduced }),
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: (name, fn) => { if (listeners.get(name) === fn) listeners.delete(name); },
  };
  vm.runInNewContext(source, {
    document, window,
    localStorage: { getItem: () => preferences, setItem: () => assert.fail('loader must never write saves') },
    setTimeout: (fn, ms) => { timers.set(++serial, { fn, ms }); return serial; },
    clearTimeout: id => timers.delete(id),
  });
  return { nodes, timers, listeners, document, api: window.factoryLoading,
    get animations() { return animations; }, get cancelled() { return cancelled; }, get reloads() { return reloads; } };
}

test('loader is outside the hidden game; its native button works before modules or images', () => {
  assert.ok(html.indexOf('id="loading"') < html.indexOf('id="main-menu"'));
  assert.match(html, /id="main-menu"[^>]* inert/);
  assert.match(html, /id="loading-dough"[^>]*type="button"/);
  assert.ok(html.indexOf('src="./src/factory-loading.js') < html.indexOf('id="factory-entry"'));
  const l = loader();
  for (let n = 0; n < 25; n++) l.nodes.get('loading-dough').click();
  assert.equal(l.nodes.get('loading-count').textContent, '揉了 25 下');
  assert.equal(l.animations, 25); assert.equal(l.cancelled, 24);
  assert.equal(l.nodes.get('loading-progress').value, 0, 'poking cannot fake loading progress');
});

test('progress is monotonic; successful boot exits immediately and removes boot handlers', () => {
  const l = loader(); l.document.activeElement = l.nodes.get('loading-dough');
  l.nodes.get('loading-dough').click();
  l.api.progress(1, 5); assert.equal(l.nodes.get('loading-progress').value, 20);
  l.api.progress(3, 5); l.api.progress(1, 5); l.api.progress(1, 0);
  assert.equal(l.nodes.get('loading-progress').value, 60);
  l.api.complete();
  assert.equal(l.nodes.get('loading').hidden, true);
  assert.equal(l.nodes.get('main-menu').inert, false);
  assert.equal(l.nodes.get('loading-progress').value, 100);
  assert.equal(l.document.activeElement.id, 'menu-play');
  assert.equal(l.timers.size, 0); assert.equal(l.listeners.size, 0);
  assert.equal(l.cancelled, 1);
  l.nodes.get('loading-dough').click(); l.api.fail(); l.api.complete();
  assert.equal(l.nodes.get('loading-count').textContent, '揉了 1 下');
  assert.equal(l.nodes.get('loading-retry').hidden, true);
});

test('slow network and module failure offer safe reload while preserving the interactive dough', () => {
  const l = loader();
  assert.equal([...l.timers.values()][0].ms, 12000);
  [...l.timers.values()][0].fn();
  assert.equal(l.nodes.get('loading-retry').hidden, false);
  assert.equal(l.nodes.get('main-menu').inert, true);
  l.listeners.get('error')({ target: { id: 'factory-entry' } });
  assert.match(l.nodes.get('loading-status').textContent, /没加载成功/);
  l.api.progress(5, 5);
  assert.equal(l.nodes.get('loading-progress').value, 0, 'late completions cannot erase failure');
  l.nodes.get('loading-dough').click(); assert.equal(l.animations, 1);
  l.nodes.get('loading-retry').click(); assert.equal(l.reloads, 1);
  assert.equal(l.nodes.get('loading').hidden, false);
});

test('runtime boot errors and rejected module initialization leave a retry path', () => {
  for (const event of ['error', 'unhandledrejection']) {
    const l = loader();
    l.listeners.get(event)({ filename: 'https://example.com/src/factory-main.js?v=0.12.0' });
    assert.equal(l.nodes.get('loading-retry').hidden, false);
    assert.equal(l.timers.size, 0);
  }
});

test('reduced motion keeps counting without squash; malformed preferences do not block boot', () => {
  for (const options of [{ systemReduced: true }, { preferences: '{"reducedMotion":true}' }]) {
    const l = loader(options); l.nodes.get('loading-dough').click();
    assert.equal(l.animations, 0); assert.equal(l.nodes.get('loading-count').textContent, '揉了 1 下');
  }
  const l = loader({ preferences: 'broken json' }); l.api.complete();
  assert.equal(l.nodes.get('loading').hidden, true);
});

function globalValue(t, name, value) {
  const old = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  t.after(() => old ? Object.defineProperty(globalThis, name, old) : delete globalThis[name]);
}
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const flush = () => new Promise(resolve => setImmediate(resolve));
const manifest = { atlases: { first: { file: 'first.png' }, second: { file: 'second.png' } }, sprites: [{ id: 'dough', atlas: 'first' }] };

test('asset progress follows actual decodes and commits the atlas set atomically', async t => {
  const decodes = [], counts = [];
  globalValue(t, 'fetch', async () => ({ ok: true, json: async () => manifest }));
  globalValue(t, 'Image', class { decode() { const d = deferred(); decodes.push(d); return d.promise; } });
  const assets = new FactoryAssets(), pending = assets.load('/art/', (...args) => counts.push(args));
  await flush(); assert.deepEqual(counts, [[0, 1], [1, 3]]);
  decodes[1].resolve(); await flush();
  assert.deepEqual(counts.at(-1), [2, 3]); assert.equal(assets.ready, false);
  assert.deepEqual(assets.images, {}); assert.deepEqual(assets.sprites, {});
  decodes[0].resolve(); await pending;
  assert.equal(assets.ready, true); assert.deepEqual(counts.at(-1), [3, 3]);
  assert.equal(assets.images.first.src, '/art/first.png'); assert.ok(assets.sprites.dough);
});

test('decode failure aborts loading and late siblings cannot publish partial art or progress', async t => {
  const decodes = [], images = [], counts = []; let signal;
  globalValue(t, 'fetch', async (_, options) => { signal = options.signal; return { ok: true, json: async () => manifest }; });
  globalValue(t, 'Image', class { constructor() { images.push(this); } decode() { const d = deferred(); decodes.push(d); return d.promise; } });
  const assets = new FactoryAssets(), pending = assets.load('/art/', (...args) => counts.push(args));
  const rejected = assert.rejects(pending, /bad png/);
  await flush(); decodes[0].reject(new Error('bad png')); await rejected;
  const count = counts.length; decodes[1].resolve(); await flush();
  assert.equal(counts.length, count); assert.equal(signal.aborted, true);
  assert.equal(assets.ready, false); assert.deepEqual(assets.images, {});
  assert.ok(images.every(img => img.src === ''));
});

test('failed manifests reject cleanly, including HTTP and invalid JSON', async t => {
  const assets = new FactoryAssets();
  globalValue(t, 'fetch', async () => ({ ok: false }));
  await assert.rejects(assets.load(), /清单/);
  globalThis.fetch = async () => ({ ok: true, json: async () => { throw new Error('bad json'); } });
  await assert.rejects(assets.load(), /bad json/); assert.equal(assets.ready, false);
});

test('a hung fetch times out without allowing a late response to enter the game', async t => {
  const response = deferred(); let timeout, deadline, cleared = false, signal;
  globalValue(t, 'fetch', (_, options) => { signal = options.signal; return response.promise; });
  globalValue(t, 'setTimeout', (fn, ms) => { timeout = fn; deadline = ms; return 1; });
  globalValue(t, 'clearTimeout', () => { cleared = true; });
  const assets = new FactoryAssets(), pending = assets.load();
  const rejected = assert.rejects(pending, /超时/); timeout(); await rejected;
  assert.equal(deadline, 45000); assert.equal(signal.aborted, true); assert.equal(cleared, true);
  response.resolve({ ok: true, json: async () => manifest }); await flush();
  assert.equal(assets.ready, false); assert.deepEqual(assets.images, {});
});

test('updated atlas has real alpha and all eight replacement frames fit; the hopper stays unchanged', async () => {
  const root = new URL('../assets/generated/factory/cream-v1/', import.meta.url);
  const m = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
  const result = await validateFactoryAssets(m);
  assert.equal(result.valid, true, result.errors.join('\n'));
  assert.deepEqual(result.warnings, []);
  assert.equal(m.style, 'cream-hand-drawn');
  assert.equal(m.atlases.machines.file, 'machines-v1.png');
  assert.equal(m.atlases.expansion.file, 'expansion-v2.png');
  assert.equal(m.sprites.filter(s => s.atlas === 'expansion').length, 8);
  assert.ok(result.report.atlases.find(a => a.id === 'expansion').transparentRatio > .5);
  assert.deepEqual(m.sprites.find(s => s.id === 'flour_hopper').frame, { x: 70, y: 54, w: 298, h: 363 });
});
