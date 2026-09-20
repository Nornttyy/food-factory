import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { KitchenGame, DISHES, DECOR, PARTS } from '../src/factory-kitchen.js';
import { dishMatches } from '../src/factory-kitchen-content.js';
const advance = (g, seconds) => { for (let t = 0; t < seconds - 1e-8; t += .1) g.update(Math.min(.1, seconds - t)); };
const gameAt = day => { const g = new KitchenGame(); g.state.day = day; g.state.totalServed = 6 * (day - 1); g.startDay(); return g; };
function ingredient(g, part, plate = 0) {
  if (['toast', 'egg', 'patty'].includes(part)) {
    assert.ok(g.startPan(0, part).ok); advance(g, part === 'egg' ? 3.1 : part === 'patty' ? 6.1 : 5.1);
    if (part === 'egg') { assert.ok(g.flipPan(0).ok); advance(g, 3.1); }
    assert.ok(g.addToPlate({ kind: 'pan', index: 0 }, plate).ok);
  } else if (['fruit', 'tomato'].includes(part)) {
    assert.ok(g.chop(part).ok); for (let i = 0; i < g.chopCount; i++) assert.ok(g.chop(part).ok);
    assert.ok(g.addToPlate({ kind: 'board' }, plate).ok);
  } else if (['juice', 'shake'].includes(part)) {
    assert.ok(g.startDrink(part).ok); for (let i = 0; i < 5; i++) { g.pourDrink(.5); advance(g, .5); }
    assert.ok(g.finishPour().ok); if (part === 'shake') for (let i = 0; i < 4; i++) g.stirDrink();
    assert.ok(g.addToPlate({ kind: 'drink' }, plate).ok);
  } else assert.ok(g.addToPlate({ kind: 'pantry', part }, plate).ok);
}

test('egg must cook both sides; early flipping, raw plating and duplicate flipping do not change state', () => {
  const g = gameAt(2); g.startPan(0, 'egg');
  let before = g.serialize(); assert.equal(g.flipPan(0).ok, false); assert.equal(g.addToPlate({ kind: 'pan', index: 0 }, 0).ok, false); assert.equal(g.serialize(), before);
  advance(g, 3.1); assert.equal(g.panStage(0), 'flip'); assert.equal(g.addToPlate({ kind: 'pan', index: 0 }, 0).ok, false);
  g.flipPan(0); assert.equal(g.panStage(0), 'cooking'); before = g.serialize(); assert.equal(g.flipPan(0).ok, false); assert.equal(g.serialize(), before);
  advance(g, 3.1); assert.equal(g.panStage(0), 'ready'); assert.ok(g.addToPlate({ kind: 'pan', index: 0 }, 0).ok);
  assert.equal(g.serve(0, 1).earned, 10);
});

test('egg burns on either side; heat upgrades extend the real recovery window', () => {
  const g = gameAt(2); g.startPan(0, 'egg'); advance(g, 12.1); assert.equal(g.panStage(0), 'burnt'); g.clearBurnt(0);
  g.state.upgrades.heat = 1; g.startPan(0, 'egg'); advance(g, 10); g.flipPan(0); advance(g, 3.1);
  assert.equal(g.panStage(0), 'ready'); advance(g, 2); assert.equal(g.panStage(0), 'burnt');
  const restored = new KitchenGame(); assert.ok(restored.restore(g.serialize()));
});

test('burger and sandwich are ordered stacks, not interchangeable bags of ingredients', () => {
  const g = gameAt(4);
  assert.equal(g.addToPlate({ kind: 'pantry', part: 'bun_top' }, 0).ok, false);
  ingredient(g, 'bun_base'); ingredient(g, 'lettuce'); g.startPan(0, 'patty'); advance(g, 6.1);
  const before = g.serialize(); assert.equal(g.addToPlate({ kind: 'pantry', part: 'bun_top' }, 0).ok, false); assert.equal(g.serialize(), before);
  g.addToPlate({ kind: 'pan', index: 0 }, 0); ingredient(g, 'tomato'); ingredient(g, 'bun_top');
  assert.ok(dishMatches(g.shift.plates[0], DISHES.burger));
  assert.equal(dishMatches([...g.shift.plates[0]].reverse(), DISHES.burger), false);
  for (const part of DISHES.sandwich.parts) ingredient(g, part, 1);
  assert.ok(dishMatches(g.shift.plates[1], DISHES.sandwich));
  const full = g.serialize(); assert.equal(g.addToPlate({ kind: 'pantry', part: 'lettuce' }, 1).ok, false); assert.equal(g.serialize(), full);
});

test('juice requires release inside the fill band, underfilling can continue, overfilling can be cleared', () => {
  const g = gameAt(2); g.startDrink('juice'); g.pourDrink(.5); assert.equal(g.finishPour().ok, false);
  assert.equal(g.addToPlate({ kind: 'drink' }, 0).ok, false);
  for (let i = 0; i < 4; i++) g.pourDrink(.5); assert.ok(g.finishPour().ok);
  assert.equal(g.shift.drink.fill, .625); assert.ok(g.addToPlate({ kind: 'drink' }, 0).ok); assert.equal(g.shift.drink, null);
  assert.equal(g.addToPlate({ kind: 'drink' }, 1).ok, false);
  g.startDrink('juice'); for (let i = 0; i < 7; i++) g.pourDrink(.5);
  assert.equal(g.shift.drink.stage, 'spilled'); assert.equal(g.finishPour().ok, false); assert.equal(g.state.coins, 0);
  assert.ok(g.discardDrink().ok); assert.ok(g.startDrink('juice').ok);
});

test('milkshake must be mixed, and wrong/full plate transfers cannot consume it', () => {
  const g = gameAt(3); g.startDrink('shake'); for (let i = 0; i < 5; i++) g.pourDrink(.5); g.finishPour();
  assert.equal(g.shift.drink.stage, 'mixing'); assert.equal(g.addToPlate({ kind: 'drink' }, 0).ok, false);
  for (let i = 0; i < 3; i++) g.stirDrink(); assert.equal(g.shift.drink.stage, 'mixing'); g.stirDrink(); assert.equal(g.shift.drink.stage, 'ready');
  ingredient(g, 'toast'); const before = g.serialize(); assert.equal(g.addToPlate({ kind: 'drink' }, 0).ok, false); assert.equal(g.serialize(), before);
  assert.ok(g.addToPlate({ kind: 'drink' }, 1).ok); assert.deepEqual(g.shift.plates[1], ['shake']);
});

test('both visible fill-band boundaries are reachable despite floating point accumulation', () => {
  for (const steps of [22, 30]) {
    const g = gameAt(2); g.startDrink('juice'); for (let i = 0; i < steps; i++) g.pourDrink(.1);
    assert.ok(g.finishPour().ok); assert.equal(g.shift.drink.stage, 'ready');
    assert.ok(new KitchenGame().restore(g.serialize()));
  }
});

test('new stations and all actions freeze on pause and resume without automatic pouring', () => {
  const g = gameAt(4); g.startPan(0, 'egg'); advance(g, 3.2); g.flipPan(0); g.startDrink('shake'); g.pourDrink(.5); g.chop('tomato');
  g.pause(true); const raw = g.serialize(); advance(g, 20);
  for (const result of [g.pourDrink(.5), g.stirDrink(), g.finishPour(), g.discardDrink(), g.addToPlate({ kind: 'pantry', part: 'slice' }, 0)]) assert.equal(result.ok, false);
  assert.equal(g.serialize(), raw); const restored = new KitchenGame(); assert.ok(restored.restore(raw)); assert.equal(restored.serialize(), raw);
  restored.pause(false); advance(restored, 1); assert.equal(restored.shift.drink.fill, .125);
});

test('decorations charge once, require pausing, swap actual categories and preserve game mechanics', () => {
  const g = gameAt(2); g.state.coins = 140;
  assert.equal(g.decorate('plate_sage').ok, false); g.pause(true);
  const beforeBurn = g.burnAt; assert.ok(g.decorate('plate_sage').bought); assert.equal(g.state.coins, 100);
  assert.equal(g.state.decor.equipped.plate, 'plate_sage'); g.decorate('plate_cream'); assert.equal(g.decorate('plate_sage').bought, false); assert.equal(g.state.coins, 100);
  g.decorate('pan_sage'); assert.equal(g.state.coins, 20); assert.equal(g.burnAt, beforeBurn);
  const before = g.serialize(); assert.equal(g.decorate('jar').ok, false); assert.equal(g.decorate('__proto__').ok, false); assert.equal(g.serialize(), before);
  const restored = new KitchenGame(); assert.ok(restored.restore(before)); assert.deepEqual(restored.state.decor, g.state.decor);
});

test('version-one saves keep existing food, money, day, pending orders and clock on one-time migration', () => {
  const g = gameAt(2); g.shift.orders[0].dish = 'berry'; g.startPan(0); advance(g, 2); g.chop();
  const old = JSON.parse(g.serialize()); old.version = 1; delete old.decor; delete old.shift.duration; delete old.shift.drink;
  old.shift.pans = old.shift.pans.map(p => p && ({ heat: p.heat })); old.shift.board = { cuts: old.shift.board.cuts };
  const restored = new KitchenGame(); assert.ok(restored.restore(JSON.stringify(old)));
  assert.equal(restored.state.version, 2); assert.equal(restored.state.day, old.day); assert.equal(restored.state.coins, old.coins);
  assert.deepEqual(restored.shift.orders, old.shift.orders); assert.equal(restored.shift.time, old.shift.time); assert.equal(restored.shift.pans[0].heat, old.shift.pans[0].heat);
  assert.equal(restored.shift.duration, 90); assert.equal(restored.shift.paused, true);
  const again = new KitchenGame(); assert.ok(again.restore(restored.serialize())); assert.equal(again.serialize(), restored.serialize());
});

test('corrupt egg, drink, stack and decor states are rejected without replacing a valid game', () => {
  const g = gameAt(4); g.startPan(0, 'egg'); g.startDrink('shake'); const raw = g.serialize();
  const corrupt = [s => s.shift.pans[0].flipped = true, s => s.shift.pans[0].side = 10,
    s => s.shift.drink.stage = 'ready', s => s.shift.drink.stir = 8, s => s.shift.drink.kind = '__proto__', s => s.shift.drink.fill = -1,
    s => s.decor.owned.push('free_money'), s => s.decor.equipped.plate = 'pan_cream', s => s.decor.equipped.pan = 'pan_sage',
    s => s.shift.plates[0] = ['bun_top', 'bun_base'], s => s.shift.duration = 1e6];
  for (const mutate of corrupt) { const state = JSON.parse(raw); mutate(state); assert.equal(g.restore(JSON.stringify(state)), false); assert.equal(g.serialize(), raw); }
});

test('five complete days are playable through real preparation actions, progressively introducing all new recipes', () => {
  const g = new KitchenGame(), seen = new Set();
  for (let day = 1; day <= 5; day++) {
    g.startDay(); assert.equal(g.state.day, day); let guard = 0;
    while (g.shift.status === 'open' && guard++ < 1500) {
      const order = g.shift.orders[0]; if (!order) { advance(g, .2); continue; }
      seen.add(order.dish);
      for (const part of DISHES[order.dish].parts) { ingredient(g, part); advance(g, .4); }
      assert.ok(g.serve(0, order.id).ok, `${day}: ${order.dish}`);
      const restored = new KitchenGame(); assert.ok(restored.restore(g.serialize()));
    }
    assert.ok(guard < 1500); assert.ok(g.shift.served >= g.target); assert.equal(g.shift.missed, 0);
  }
  for (const dish of ['egg', 'juice', 'sandwich', 'shake', 'burger']) assert.ok(seen.has(dish));
});

test('every food, skin and preparation prop resolves to a real generated atlas frame with no placeholder URLs', async () => {
  const manifest = JSON.parse(await readFile(new URL('../assets/generated/factory/cream-v1/manifest.json', import.meta.url), 'utf8'));
  const ids = new Set(manifest.sprites.map(s => s.id));
  const required = [...Object.values(PARTS).map(p => p.sprite), ...Object.values(DECOR).map(d => d.sprite), ...Object.values(DISHES).map(d => d.sprite).filter(Boolean), 'k_board', 'k_knife', 'k_glass', 'k_pitcher', 'k_shaker', 'k_egg_raw', 'k_egg_flip', 'k_patty_raw'];
  for (const id of required) assert.ok(ids.has(id), id);
  assert.equal(manifest.sprites.filter(s => s.id.startsWith('k_')).length, 32);
  for (const key of ['kitchenFoods', 'kitchenProps']) {
    const bytes = await readFile(new URL(`../assets/generated/factory/cream-v1/${manifest.atlases[key].file}`, import.meta.url));
    assert.equal(bytes.readUInt32BE(16), 1254); assert.equal(bytes.readUInt32BE(20), 1254); assert.equal(bytes[25], 6);
  }
});
