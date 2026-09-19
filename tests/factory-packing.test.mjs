import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { AutomaticFactoryGame, createPackingTrial } from '../src/factory-automation.js';
import { BUILDINGS, ITEMS } from '../src/factory-core.js';
import { PACK_RECIPES, PACK_GOALS } from '../src/factory-packing.js';
import { FactoryAssets } from '../src/factory-renderer.js';

const run = (g, seconds) => { for (let i = 0; i < Math.round(seconds * 10); i++) g.update(.1); };
const add = (g, type, x, y, dir = 0) => { const r = g.place(type, x, y, dir); assert.equal(r.ok, true, `${type}@${x},${y}: ${r.message}`); return r.building; };
const remove = (g, x, y) => { assert.equal(g.remove(g.at(x, y).id).ok, true); };
const empty = () => { const g = new AutomaticFactoryGame({ starter: false }); g.state.coins = 10000; g.state.orderIndex = 2; return g; };
const reload = g => { const fresh = new AutomaticFactoryGame(); assert.equal(fresh.restore(g.serialize()), true); return fresh; };
const untilGoal = g => {
  for (let n = 0; n < 1800 && !g.orderReady; n++) { g.update(.1); if (n % 100 === 0) reload(g); }
  assert.equal(g.orderReady, true, JSON.stringify(g.state.orderProgress));
};

test('both recipes require exact physical ingredients, reject unrelated items and give a modest premium', () => {
  for (const [item, recipe] of Object.entries(PACK_RECIPES)) {
    const g = empty(), b = add(g, recipe.machine, 2, 2);
    const inputValue = Object.entries(recipe.ingredients).reduce((sum, [food, n]) => sum + ITEMS[food].value * n, 0);
    assert.ok(recipe.value > inputValue && recipe.value <= inputValue * 1.25);
    assert.equal(g.canReceive(b, 'flour'), false);
    b.ingredients.orange_juice = 1; run(g, 20);
    assert.equal(b.output, null); assert.equal(b.progress, 0); assert.equal(g.canReceive(b, 'orange_juice'), false);
    b.ingredients = { ...recipe.ingredients }; run(g, g.duration(b));
    assert.equal(b.output, item); assert.deepEqual(b.ingredients, {}); assert.equal(g.state.totalSold, 0);
    assert.equal(reload(g).at(2, 2).output, item);
  }
});

test('same-tick inputs reserve per ingredient without overwriting or accepting extra bread', () => {
  const g = empty(), p = add(g, 'breakfast_packer', 2, 2);
  const a = add(g, 'belt', 1, 2), b = add(g, 'belt', 2, 1, 1), c = add(g, 'belt', 2, 3, 3);
  a.output = b.output = 'bread'; c.output = 'orange_juice'; g.update(.1);
  assert.deepEqual(p.ingredients, { bread: 1, orange_juice: 1 });
  assert.equal([a, b].filter(x => x.output === 'bread').length, 1); assert.equal(c.output, null);
  assert.equal(g.canReceive(p, 'bread', { type: 'belt', x: 3, y: 2, dir: 2 }), false, 'outlet is never an inlet');
  run(g, 4.7); assert.equal(p.output, 'breakfast_box');
});

test('two donuts and a juice may arrive together; one donut alone never becomes a tea box', () => {
  const g = empty(), p = add(g, 'tea_packer', 2, 2);
  const left = add(g, 'belt', 1, 2), top = add(g, 'belt', 2, 1, 1), bottom = add(g, 'belt', 2, 3, 3);
  left.output = 'donut_plain'; bottom.output = 'orange_juice'; run(g, 10);
  assert.equal(p.progress, 0); assert.equal(p.output, null);
  top.output = 'donut_plain'; g.update(.1);
  assert.deepEqual(p.ingredients, { donut_plain: 2, orange_juice: 1 }); run(g, 4.7);
  assert.equal(p.output, 'tea_box'); assert.deepEqual(p.ingredients, {});
  left.output = top.output = 'donut_plain'; bottom.output = 'orange_juice'; g.update(.1);
  assert.deepEqual(p.ingredients, { donut_plain: 2, orange_juice: 1 });
  assert.equal([left, top, bottom].filter(b => b.output).length, 0);
  assert.equal(p.output, 'tea_box', 'the previous finished box stays intact while the next batch queues');
});

test('blocked output retains one box and one recipe of stock, then sells each box only once', () => {
  let g = empty(), p = add(g, 'tea_packer', 2, 2);
  p.ingredients = { donut_plain: 2, orange_juice: 1 }; run(g, 4.8);
  p.ingredients = { donut_plain: 2, orange_juice: 1 }; run(g, 30);
  assert.equal(p.output, 'tea_box'); assert.equal(p.progress, 0); assert.equal(g.canReceive(p, 'donut_plain'), false);
  g = reload(g); p = g.at(2, 2); const depot = add(g, 'depot', 3, 2), wallet = g.state.coins;
  g.update(.1); assert.equal(depot.input, 'tea_box'); assert.equal(g.state.totalSold, 0);
  run(g, 15); assert.equal(g.state.totalSold, 2); assert.equal(g.state.coins, wallet + 68);
  assert.equal(p.output, null); assert.deepEqual(p.ingredients, {});
});

test('packing pauses, runs at double speed, upgrades without a reset and refunds actual payments once', () => {
  const g = empty(), p = add(g, 'breakfast_packer', 2, 2); p.ingredients = { bread: 1, orange_juice: 1 }; run(g, 1);
  g.state.paused = true; const before = g.serialize(); run(g, 30); assert.equal(g.serialize(), before);
  const completion = p.progress / g.duration(p); assert.equal(g.upgrade(p.id).ok, true);
  assert.ok(Math.abs(p.progress / g.duration(p) - completion) < 1e-9); reload(g);
  g.state.paused = false; g.state.speed = 2; run(g, 1.3); assert.equal(p.output, 'breakfast_box');
  const paid = p.paid, wallet = g.state.coins, result = g.remove(p.id);
  assert.equal(result.refund, paid); assert.equal(result.discarded, true); assert.equal(g.state.coins, wallet + paid);
  assert.equal(g.remove(p.id).ok, false);
});

test('package storage and retail survive reload without counting stored stock as a trial delivery', () => {
  const g = createPackingTrial(); const p = add(g, 'breakfast_packer', 5, 3), d = g.at(7, 3);
  g.setDepotMode(d.id, 'store'); run(g, 60);
  assert.ok(g.state.business.warehouse.breakfast_box > 0); assert.equal(g.orderReady, false);
  const saved = reload(g); const n = saved.state.business.warehouse.breakfast_box;
  assert.equal(saved.sellWarehouse('breakfast_box', n).ok, true); assert.equal(saved.orderReady, false); reload(saved);
  assert.equal(p.type, 'breakfast_packer');
});

test('normal factory saves remain intact and plain foods remain a fallback without completing package goals', () => {
  const main = new AutomaticFactoryGame(); run(main, 20); const before = main.serialize();
  const trial = createPackingTrial(); add(trial, 'depot', 5, 3); run(trial, 60);
  assert.ok(trial.state.totalSold > 0); assert.ok(trial.state.coins > 560); assert.deepEqual(trial.state.orderProgress, {});
  assert.equal(main.serialize(), before); assert.equal(reload(main).state.packingTrial, undefined); reload(trial);
});

test('all three goals are reachable by paid construction and real split production within five simulated minutes', () => {
  let g = createPackingTrial(); add(g, 'breakfast_packer', 5, 3); untilGoal(g);
  assert.equal(g.claimOrder().reward, 80); assert.equal(g.claimOrder().ok, false); g = reload(g);
  remove(g, 3, 1); remove(g, 4, 1); remove(g, 5, 3);
  g.clearContents(g.at(5, 1).id); g.clearContents(g.at(5, 2).id);
  add(g, 'ring_former', 3, 1); add(g, 'donut_fryer', 4, 1); add(g, 'tea_packer', 5, 3);
  untilGoal(g); assert.equal(g.claimOrder().reward, 100); g = reload(g);
  remove(g, 3, 1); remove(g, 4, 1); remove(g, 5, 3);
  g.clearContents(g.at(5, 1).id); g.clearContents(g.at(5, 2).id);
  add(g, 'bread_oven', 3, 1); add(g, 'belt', 4, 1); add(g, 'breakfast_packer', 5, 3);
  for (const [i, type] of ['flour_hopper', 'dough_mixer', 'ring_former', 'donut_fryer', 'belt', 'belt', 'belt', 'belt', 'tea_packer', 'depot'].entries()) add(g, type, i + 1, 7);
  remove(g, 5, 5); add(g, 'splitter', 5, 5, 3);
  for (const [x, y, dir] of [[6, 5, 0], [7, 5, 0], [8, 5, 0], [9, 5, 1], [9, 6, 1]]) add(g, 'belt', x, y, dir);
  assert.ok(g.state.coins >= 0); untilGoal(g);
  assert.equal(g.claimOrder().reward, 120); assert.equal(g.state.packingTrial.goal, 3);
  assert.equal(g.orderReady, false); const wallet = g.state.coins;
  assert.equal(g.claimOrder().ok, false); assert.equal(g.state.coins, wallet); g = reload(g);
  assert.equal(g.claimOrder().ok, false); assert.ok(g.state.time < 300, g.state.time);
  const sold = g.state.totalSold; run(g, 30); assert.ok(g.state.totalSold > sold, 'free play continues after the final goal');
});

test('invalid ingredient queues, forged recipe output and invalid goal history reject atomically', () => {
  const g = createPackingTrial(); add(g, 'tea_packer', 5, 3); const saved = g.serialize();
  const mutations = [
    s => { s.buildings.at(-1).ingredients = null; },
    s => { s.buildings.at(-1).ingredients = { bread: 1 }; },
    s => { s.buildings.at(-1).ingredients = { donut_plain: 3 }; },
    s => { s.buildings.at(-1).ingredients = { donut_plain: -1 }; },
    s => { s.buildings.at(-1).ingredients = { donut_plain: .5 }; },
    s => { s.buildings.at(-1).progress = 1; },
    s => { s.buildings.at(-1).output = 'breakfast_box'; },
    s => { s.buildings[0].ingredients = {}; },
    s => { s.packingTrial.goal = 4; }, s => { s.packingTrial.goal = 1; },
    s => { s.packingTrial.reward = 999; }, s => { s.orderProgress.breakfast_box = 3; },
  ];
  for (const mutate of mutations) { const s = JSON.parse(saved); mutate(s); assert.equal(g.restore(JSON.stringify(s)), false); assert.equal(g.serialize(), saved); }
});

test('clearing a belt or packing table discards only its own contents without sales or refunds', () => {
  const g = empty(), p = add(g, 'tea_packer', 2, 2), belt = add(g, 'belt', 1, 2);
  p.ingredients = { donut_plain: 2, orange_juice: 1 }; run(g, 1);
  belt.output = 'bread'; belt.buffer = { item: 'bread', readyAt: g.state.time + .6 };
  const wallet = g.state.coins; assert.equal(g.clearContents(belt.id).ok, true);
  assert.equal(belt.output, null); assert.equal(belt.buffer, null); assert.ok(p.progress > 0);
  assert.equal(g.clearContents(p.id).ok, true); assert.equal(p.progress, 0); assert.deepEqual(p.ingredients, {});
  assert.equal(g.state.coins, wallet); assert.equal(g.state.totalSold, 0); assert.equal(g.clearContents(-1).ok, false); reload(g);
});

test('package icons compose existing generated food and box art and both machines use the new generated atlas', async () => {
  const manifest = JSON.parse(await readFile(new URL('../assets/generated/factory/cream-v1/manifest.json', import.meta.url), 'utf8'));
  const assets = new FactoryAssets(); assets.sprites = Object.fromEntries(manifest.sprites.map(s => [s.id, s])); assets.images = manifest.atlases;
  const calls = [], ctx = { save() {}, restore() {}, globalAlpha: 1, drawImage(...args) { calls.push(args); } };
  for (const item of Object.keys(PACK_RECIPES)) { calls.length = 0; assets.draw(ctx, item, 0, 0, 32, 32); assert.equal(calls.length, 3); }
  for (const recipe of Object.values(PACK_RECIPES)) assert.equal(assets.sprites[BUILDINGS[recipe.machine].sprite].atlas, 'packing');
  assert.equal(PACK_GOALS.length, 3);
});
