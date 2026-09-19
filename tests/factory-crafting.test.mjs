import test from 'node:test';
import assert from 'node:assert/strict';
import { AutomaticFactoryGame, createPackingTrial } from '../src/factory-automation.js';
import { BUILDINGS, ITEMS } from '../src/factory-core.js';
import { CRAFT_ITEM, CRAFT_MACHINES, validCrafting, craftScore, glazeCount } from '../src/factory-crafting.js';
import { craftLayout } from '../src/factory-crafting-view.js';

const cook = (g, seconds) => { for (let i = 0; i < seconds * 10; i++) g.advanceCraft(.1); };
const run = (g, seconds) => { for (let i = 0; i < seconds * 10; i++) g.update(.1); };
const paint = (g, count = 12) => { for (let i = 0; i < count; i++) { const a = (i + .5) / 12 * Math.PI * 2; g.paintCraft(Math.cos(a) * .75, Math.sin(a) * .75); } };
const finish = (g, heat = 7, coverage = 12) => {
  assert.equal(g.startCraft().ok, true); assert.equal(g.stampCraft(0, 0).ok, true); assert.equal(g.startFrying().ok, true);
  cook(g, heat); assert.equal(g.liftCraft().cooked, true); paint(g, coverage); assert.equal(g.finishCraft().ok, true);
};
const reload = g => { const restored = new AutomaticFactoryGame(); assert.equal(restored.restore(g.serialize()), true, g.serialize()); return restored; };

test('three distinct operations create one real food, preserve money, and unlock only donut automation', () => {
  const g = new AutomaticFactoryGame(), wallet = g.state.coins;
  assert.equal(g.isUnlocked('ring_former'), false); assert.equal(g.isUnlocked('fruit_hopper'), false);
  finish(g); const c = g.state.crafting;
  assert.equal(c.batch.stage, 'done'); assert.equal(c.made, 1); assert.equal(c.best, 100); assert.deepEqual(c.queue, [{ id: 1, score: 100 }]);
  assert.equal(g.state.coins, wallet); assert.equal(g.state.totalSold, 0); assert.equal(g.state.orderIndex, 0);
  for (const type of CRAFT_MACHINES) assert.equal(g.isUnlocked(type), true);
  assert.equal(g.isUnlocked('bun_steamer'), false); assert.equal(g.isUnlocked('fruit_hopper'), false);
  assert.equal(g.finishCraft().ok, false); assert.equal(c.queue.length, 1);
  assert.equal(g.place('icing_machine', 0, 0).ok, true); assert.equal(reload(g).at(0, 0).type, 'icing_machine');
});

test('old factories retain every existing unlock and add an empty workbench on migration', () => {
  const g = new AutomaticFactoryGame(); g.state.orderIndex = 2; const s = JSON.parse(g.serialize()); delete s.crafting;
  const loaded = new AutomaticFactoryGame(); assert.equal(loaded.restore(JSON.stringify(s)), true);
  for (const type of Object.keys(BUILDINGS)) assert.equal(loaded.isUnlocked(type), true);
  assert.equal(loaded.state.coins, s.coins); assert.deepEqual(JSON.parse(loaded.serialize()).buildings, s.buildings);
  assert.equal(loaded.state.crafting.made, 0); assert.deepEqual(loaded.state.crafting.queue, []);
});

test('off-centre stamps fail safely and premature, repeated or wrong-stage actions cannot mint food', () => {
  const g = new AutomaticFactoryGame(); g.startCraft(); const before = g.serialize();
  for (const [x, y] of [[1, 0], [Infinity, 0], [NaN, 0], ['0', 0], [null, 0]]) assert.equal(g.stampCraft(x, y).ok, false);
  assert.equal(g.startFrying().ok, false); assert.equal(g.finishCraft().ok, false); assert.equal(g.startCraft().ok, false); assert.equal(g.paintCraft(.75, 0), false);
  assert.equal(g.serialize(), before); g.stampCraft(.45, 0); assert.equal(g.state.crafting.batch.shape, 69); reload(g);
});

test('early and burned batches are retryable without a charge; the full green interval succeeds', () => {
  for (const seconds of [0, 3.9, 10.1, 12]) {
    const g = new AutomaticFactoryGame(); g.startCraft(); g.stampCraft(0, 0); g.startFrying(); cook(g, seconds);
    if (seconds < 12) g.liftCraft();
    assert.equal(g.state.crafting.batch.stage, 'failed'); assert.equal(g.state.crafting.made, 0); assert.equal(g.state.coins, 450); reload(g);
    assert.equal(g.startFrying().ok, true); cook(g, 7); assert.equal(g.liftCraft().cooked, true); paint(g); g.finishCraft(); reload(g);
  }
  for (const seconds of [4, 7, 10]) { const g = new AutomaticFactoryGame(); finish(g, seconds, 9); assert.ok(g.state.crafting.best >= 68); reload(g); }
});

test('sugar must cover distinct parts of the edible ring, not the hole or outside the plate', () => {
  const g = new AutomaticFactoryGame(); g.startCraft(); g.stampCraft(0, 0); g.startFrying(); cook(g, 7); g.liftCraft();
  for (const [x, y] of [[0, 0], [2, 0], [NaN, 1], ['.7', 0]]) assert.equal(g.paintCraft(x, y), false);
  for (let i = 0; i < 30; i++) g.paintCraft(.7, 0);
  assert.equal(glazeCount(g.state.crafting.batch.mask), 1); assert.equal(g.finishCraft().ok, false);
  paint(g, 8); assert.equal(g.finishCraft().ok, false); paint(g, 9); assert.equal(g.finishCraft().ok, true);
  assert.equal(g.state.crafting.best, 93); reload(g);
});

test('drafts resume at every stage; factory speed, pause and running belts do not advance frying', () => {
  let g = new AutomaticFactoryGame(); g.startCraft(); g = reload(g); assert.equal(g.state.crafting.batch.stage, 'shape');
  g.stampCraft(0, 0); g = reload(g); g.startFrying(); cook(g, 3.2); g = reload(g);
  const heat = g.state.crafting.batch.heat; g.state.speed = 2; run(g, 20); assert.equal(g.state.crafting.batch.heat, heat);
  g.state.paused = true; cook(g, 3.8); assert.equal(g.state.crafting.batch.heat, 7, 'workbench uses its own explicit pause, not the factory pause');
  g.liftCraft(); paint(g, 5); g = reload(g); assert.equal(glazeCount(g.state.crafting.batch.mask), 5);
  paint(g, 12); g.finishCraft(); g = reload(g); assert.equal(g.state.crafting.best, 100);
  const unchanged = g.serialize(); for (const dt of [NaN, -1, Infinity, 0]) g.advanceCraft(dt); assert.equal(g.serialize(), unchanged);
});

test('three-slot tray, paid factory stock and full belt buffers never overwrite or duplicate a handmade food', () => {
  let g = new AutomaticFactoryGame(); for (let i = 0; i < 3; i++) finish(g);
  const snapshot = g.serialize(); assert.equal(g.startCraft().ok, false); assert.equal(g.serialize(), snapshot);
  const b = g.at(6, 2); b.output = 'bread'; b.buffer = { item: 'bread', readyAt: .6 };
  assert.equal(g.placeHandmade(1, 6, 2).ok, false); assert.equal(g.state.crafting.queue.length, 3);
  for (const [x, y] of [[0, 0], [1, 2], [5, 2], [-1, 0]]) assert.equal(g.placeHandmade(1, x, y).ok, false);
  b.buffer = null; assert.equal(g.placeHandmade(1, 6, 2).ok, true); assert.equal(b.output, 'bread'); assert.equal(b.buffer.item, CRAFT_ITEM);
  assert.equal(g.placeHandmade(1, 7, 2).ok, false); g = reload(g);
  assert.deepEqual(g.state.crafting.queue.map(q => q.id), [2, 3]); assert.equal(g.at(6, 2).buffer.item, CRAFT_ITEM);
});

test('a handmade donut is paid only after real transport and the full depot cycle, once across reload', () => {
  let g = new AutomaticFactoryGame(); finish(g); const wallet = g.state.coins;
  assert.equal(g.placeHandmade(1, 7, 2).ok, true); assert.equal(g.state.coins, wallet);
  run(g, 1.2); assert.equal(g.at(8, 2).input, CRAFT_ITEM); assert.equal(g.state.coins, wallet);
  run(g, 1.9); assert.equal(g.state.coins, wallet); g = reload(g); run(g, .1);
  assert.equal(g.state.delivered[CRAFT_ITEM], 1); assert.equal(g.state.coins, wallet + ITEMS[CRAFT_ITEM].value);
  assert.deepEqual(g.state.crafting.queue, []); g = reload(g); run(g, 2); assert.equal(g.state.delivered[CRAFT_ITEM], 1);
});

test('handmade depot drops respect pending work and warehouse backpressure without premature income', () => {
  const g = new AutomaticFactoryGame(); finish(g); const d = g.at(8, 2); g.setDepotMode(d.id, 'store'); g.state.business.warehouse.bread = 100;
  assert.equal(g.placeHandmade(1, 8, 2).ok, false); assert.equal(g.state.crafting.queue.length, 1);
  g.state.business.warehouse.bread = 99; assert.equal(g.placeHandmade(1, 8, 2).ok, true);
  assert.equal(g.state.coins, 450); run(g, 2); assert.equal(g.state.business.warehouse[CRAFT_ITEM], 1); assert.equal(g.state.coins, 450); reload(g);
});

test('mastery produces through the existing automated machines without repeating manual cooking', () => {
  const g = new AutomaticFactoryGame({ starter: false }); g.state.coins = 1000; finish(g);
  for (const [x, type] of ['flour_hopper', 'dough_mixer', 'ring_former', 'donut_fryer', 'icing_machine', 'depot'].entries()) assert.equal(g.place(type, x, 1).ok, true);
  run(g, 60); assert.ok(g.state.delivered[CRAFT_ITEM] >= 5); assert.equal(g.state.crafting.made, 1);
  assert.equal(g.state.crafting.queue.length, 1, 'manual output stays separate until the player drops it'); reload(g);
});

test('packing trial crafting is separate from the original factory and does not clear its goals', () => {
  const original = new AutomaticFactoryGame(), before = original.serialize(), trial = createPackingTrial();
  finish(trial); assert.equal(original.serialize(), before); assert.equal(trial.state.packingTrial.goal, 0); reload(trial);
});

test('invalid crafting saves are rejected atomically without injecting food or free unlocks', () => {
  const g = new AutomaticFactoryGame(); finish(g); const before = g.serialize();
  for (const mutate of [
    c => { c.version = 2; }, c => { c.extra = true; }, c => { c.best = 101; }, c => { c.made = 0; }, c => { c.made = -1; },
    c => { c.queue = [{ id: 1, score: 100 }, { id: 1, score: 100 }]; }, c => { c.queue[0].score = 0; }, c => { c.queue[0].id = 2; },
    c => { c.batch.stage = 'unknown'; }, c => { c.batch.heat = 13; }, c => { c.batch.mask = 8191; }, c => { c.batch.shape = 1; },
    c => { c.batch.stage = 'frying'; }, c => { c.batch.stage = 'failed'; }, c => { c.batch.stage = 'shape'; },
  ]) { const s = JSON.parse(before); mutate(s.crafting); assert.equal(g.restore(JSON.stringify(s)), false); assert.equal(g.serialize(), before); }
  assert.equal(validCrafting(null), false); assert.equal(craftScore(g.state.crafting.batch), 100);
});

test('workbench keeps the whole interactive plate and mould inside both portrait and landscape layouts', () => {
  for (const [width, height] of [[390, 510], [844, 150], [1008, 500]]) {
    const l = craftLayout(width, height);
    assert.ok(l.x - 136 >= 18 && l.x + 136 <= l.width - 18);
    assert.ok(l.y - 112 >= 18 && l.y + 118 <= l.height - 18);
    assert.ok(l.cutter.x - 49 >= 18 && l.cutter.x + 49 <= l.width - 18);
    assert.ok(l.cutter.y + 62 <= l.height - 18);
  }
});
