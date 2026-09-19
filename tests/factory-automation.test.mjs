import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { AutomaticFactoryGame } from '../src/factory-automation.js';
import { CafeFactoryGame, COMPACT_AREAS, STAFF_COSTS } from '../src/factory-service.js';
import { FactoryGame, BUILDINGS } from '../src/factory-core.js';
import { yardLayout } from '../src/factory-yard.js';

const fixtures = JSON.parse(await readFile(new URL('./fixtures/service-v016-saves.json', import.meta.url), 'utf8'));
const advance = (g, seconds) => { for (let n = 0; n < Math.round(seconds * 10); n++) g.update(.1); };
const stable = g => { const s = JSON.parse(g.serialize()); for (const b of s.buildings) { delete b.blocked; delete b.idle; } return s; };
const staffRefund = s => (s.service.version < 3 ? [120, 240, 400] : STAFF_COSTS).slice(0, s.service.workers.length).reduce((a, b) => a + b, 0);
const finishedMeals = s => [...s.buildings.flatMap(b => b.goods || []), ...s.service.workers.filter(w => w.job && (s.service.version === 1 || w.job.stage === 'deliver')).map(w => w.job.item)];

test('live gameplay sells automatically on the compact map, with the same slow flow and lower prices', () => {
  const g = new AutomaticFactoryGame(); assert.deepEqual(g.area, [10, 6]); assert.deepEqual(g.worldArea, g.area);
  assert.equal(g.service, undefined); assert.equal(g.recruit, undefined); assert.equal(g.serveFromShelf, undefined);
  assert.equal(BUILDINGS.depot.sprite, 'dispatch_counter'); assert.equal(g.duration(g.at(2, 2)), 1.2);
  assert.ok(Math.abs(g.duration(g.at(5, 2)) - 4.8) < 1e-8); assert.equal(g.duration(g.at(8, 2)), 2);
  advance(g, 300); assert.equal(g.state.totalSold, 59); assert.equal(g.state.coins, 450 + 59 * 6); assert.equal(g.orderReady, true);
  assert.ok(g.state.buildings.every(b => b.goods === undefined));
  const loaded = new AutomaticFactoryGame(); assert.equal(loaded.restore(g.serialize()), true); assert.deepEqual(stable(loaded), stable(g));
});

test('automatic input takes two seconds, speeds upgrade, and store mode pauses on a full warehouse', () => {
  const g = new AutomaticFactoryGame({ starter: false }), b = g.place('depot', 3, 2).building;
  b.input = 'bread'; const coins = g.state.coins;
  advance(g, 1.9); assert.equal(g.state.coins, coins); advance(g, .1); assert.equal(g.state.coins, coins + 6);
  assert.equal(g.upgrade(b.id).ok, true); assert.equal(g.duration(b), 1.5);
  assert.equal(g.upgrade(b.id).ok, true); assert.equal(g.duration(b), 1);
  assert.equal(g.setDepotMode(b.id, 'store').ok, true); g.state.business.warehouse.bread = 100; b.input = 'bread';
  const before = g.state.coins; advance(g, 5); assert.equal(g.warehouseUsed, 100); assert.equal(b.input, 'bread'); assert.equal(g.state.coins, before);
  const loaded = new AutomaticFactoryGame(); assert.equal(loaded.restore(g.serialize()), true); loaded.sellWarehouse('bread', 1);
  const afterRetail = loaded.state.coins; advance(loaded, .1); assert.equal(loaded.warehouseUsed, 100); assert.equal(loaded.state.coins, afterRetail);
  assert.equal(loaded.state.totalSold, 1, 'warehouse transfers and resale do not add automatic-dispatch order credit');
});

test('genuine staffed saves refund staff and unsold meals exactly once without manufacturing order progress', () => {
  for (const [name, raw] of Object.entries(fixtures)) {
    const g = new AutomaticFactoryGame(); assert.equal(g.restore(JSON.stringify(raw)), true, name);
    const expected = raw.coins + staffRefund(raw) + finishedMeals(raw).reduce((sum, item) => sum + g.salePrice(item), 0);
    assert.equal(g.state.coins, expected); assert.equal(g.state.service, undefined); assert.equal(g.state.automationVersion, 1);
    for (const key of ['totalSold', 'orderIndex', 'orderProgress', 'delivered', 'career', 'business', 'stock']) assert.deepEqual(g.state[key], raw[key]);
    assert.deepEqual(g.state.buildings.map(b => [b.id, b.x, b.y, b.level, b.paid, b.input, b.progress, b.output, b.buffer]), raw.buildings.map(b => [b.id, b.x, b.y, b.level, b.paid, b.input, b.progress, b.output, b.buffer]));
    for (let n = 0; n < 3; n++) { assert.equal(g.restore(g.serialize()), true); assert.equal(g.state.coins, expected); }
    advance(g, 30); assert.equal(g.state.coins, expected, 'no invisible worker can pay again');
  }
});

test('six-person compact saves preserve paid land, research, active orders, full warehouses and pending intake', () => {
  const cafe = new CafeFactoryGame(); cafe.state.coins = 50000; cafe.state.totalSold = cafe.service.served = 4;
  cafe.expand(); cafe.state.career.research.value = 2; cafe.acceptContract(0); cafe.state.business.warehouse.bread = 100;
  for (const _ of STAFF_COSTS) cafe.recruit();
  cafe.shelves[0].goods = ['bread', 'bread', 'bread']; cafe.update(.1);
  cafe.shelves[0].input = 'bread'; cafe.shelves[0].progress = 1.5;
  cafe.at(6, 2).output = 'bread'; cafe.at(6, 2).readyAt = cafe.state.time;
  cafe.at(6, 2).buffer = { item: 'bread', readyAt: cafe.state.time + .6 };
  cafe.state.paused = true;
  const raw = JSON.parse(cafe.serialize()), g = new AutomaticFactoryGame(); assert.equal(g.restore(cafe.serialize()), true);
  assert.deepEqual(g.area, cafe.area); assert.equal(g.state.coins, raw.coins + 23600 + 3 * 7);
  assert.deepEqual(g.state.career, raw.career); assert.deepEqual(g.state.business, raw.business);
  assert.equal(g.at(8, 2).progress, 1.5); assert.equal(g.at(8, 2).input, 'bread'); assert.deepEqual(g.at(6, 2).buffer, raw.buildings.find(b => b.x === 6).buffer);
  const frozen = g.serialize(); advance(g, 30); assert.equal(g.serialize(), frozen);
  const loaded = new AutomaticFactoryGame(); assert.equal(loaded.restore(frozen), true); g.state.paused = loaded.state.paused = false;
  for (let n = 0; n < 500; n++) { g.update(.1); loaded.update(.1); assert.deepEqual(stable(g), stable(loaded)); }
  assert.ok(g.state.totalSold > raw.totalSold); assert.equal(g.warehouseUsed, 100);
});

test('older v1 and v2 employees use historical prices and already-held meals are not taken twice', () => {
  for (const version of [1, 2]) {
    const raw = structuredClone(fixtures.deliver); raw.service.version = version;
    for (const [i, w] of raw.service.workers.entries()) {
      delete w.wander; delete w.wait; delete w.stroll; w.path = null;
      Object.assign(w, yardLayout([14, 8], true).homes[i]);
      if (version === 1) {
        if (w.job?.stage === 'pickup') {
          const b = raw.buildings.find(b => b.id === w.job.shelfId); b.goods.splice(b.goods.indexOf(w.job.item), 1);
        }
        if (w.job) { delete w.job.stage; delete w.job.shelfId; w.job.remaining = 2; }
        delete w.path; delete w.x; delete w.y;
      }
    }
    const g = new AutomaticFactoryGame(); assert.equal(g.restore(JSON.stringify(raw)), true);
    assert.equal(g.state.coins, raw.coins + 760 + finishedMeals(raw).length * 6);
    assert.equal(g.state.totalSold, raw.totalSold); assert.equal(g.restore(g.serialize()), true);
  }
});

test('automatic expansions retain the compact progression and old edge equipment', () => {
  const g = new AutomaticFactoryGame(); g.state.coins = 50000;
  for (const area of COMPACT_AREAS) {
    assert.deepEqual(g.area, area); assert.equal(g.restore(g.serialize()), true);
    if (g.nextArea) { const next = g.nextArea, coins = g.state.coins, cost = g.expansionCost; assert.equal(g.expand().ok, true); assert.deepEqual(g.area, next); assert.equal(g.state.coins, coins - cost); }
  }
  assert.equal(g.expand().ok, false);
  const old = new FactoryGame(); old.state.coins = 5000; old.expand(); old.place('belt', 17, 9);
  assert.equal(g.restore(old.serialize()), true); assert.deepEqual(g.area, [18, 10]); assert.equal(g.at(17, 9).type, 'belt');
  assert.equal(g.state.coins, old.state.coins); assert.deepEqual(g.nextArea, [22, 12]);
});

test('invalid cafe state or mixed-mode saves cannot replace the live factory or repeat compensation', () => {
  const g = new AutomaticFactoryGame(); advance(g, 30); const before = g.serialize();
  for (const corrupt of [s => s.service.workers.push({ ...s.service.workers[0], id: 7 }), s => s.service.workers[0].job.item = 'flour', s => s.buildings[0].goods.push('flour'), s => s.service.served = s.totalSold + 1, s => s.coins = 1e12]) {
    const raw = structuredClone(fixtures.deliver); corrupt(raw); assert.equal(g.restore(JSON.stringify(raw)), false); assert.equal(g.serialize(), before);
  }
  for (const corrupt of [s => s.automationVersion = 2, s => s.service = fixtures.deliver.service, s => s.buildings[0].goods = ['bread'], s => s.workshopArea = [9, 6], s => s.workshopArea = [50, 24], s => delete s.workshopArea]) {
    const raw = JSON.parse(before); corrupt(raw); assert.equal(g.restore(JSON.stringify(raw)), false); assert.equal(g.serialize(), before);
  }
});

test('live menus, tutorial and controls describe automatic play with no stranded service actions', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const main = await readFile(new URL('../src/factory-main.js', import.meta.url), 'utf8');
  const tutorial = await readFile(new URL('../src/factory-tutorial.js', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /service-tools|service-jump|staff-jump|招员工|喂猫猫|送给猫猫/);
  assert.doesNotMatch(main, /ServiceView|serviceView|serveFromShelf|storeShelf|visitYard/);
  assert.doesNotMatch(tutorial, /CafeFactoryGame|送餐|招募|猫猫/);
  assert.match(main, /AutomaticFactoryGame/); assert.match(html, /自动售卖/); assert.match(html, /自动入库/);
});
