import test from 'node:test';
import assert from 'node:assert/strict';
import { KitchenGame, KITCHEN_SAVE_KEY, KITCHEN_UPGRADES, DISHES, TOAST_SECONDS, SHIFT_SECONDS } from '../src/factory-kitchen.js';

const advance = (game, seconds) => { for (let t = 0; t < seconds - 1e-8; t += .1) game.update(Math.min(.1, seconds - t)); };
const create = () => { const game = new KitchenGame(); game.startDay(); return game; };
const fry = (game, pan = 0) => { assert.ok(game.startPan(pan).ok); advance(game, TOAST_SECONDS + .1); };
const chop = game => { assert.ok(game.chop().ok); for (let i = 0; i < game.chopCount; i++) assert.ok(game.chop().ok); };
const serveFirst = game => { fry(game); assert.ok(game.addToPlate({ kind: 'pan', index: 0 }, 0).ok); assert.ok(game.serve(0, 1).ok); };

test('kitchen starts with no money, two pans, two plates and a guided order, without a factory save', () => {
  const game = create();
  assert.equal(game.state.coins, 0); assert.equal(game.shift.orders.length, 1);
  assert.equal(game.shift.plates.length, 2); assert.equal(game.shift.guided, true);
  assert.equal(game.shift.orders[0].dish, 'butter');
  assert.notEqual(KITCHEN_SAVE_KEY, 'food-factory-v1');
  assert.equal(game.startDay().ok, false);
});

test('both pans cook independently while the player chops, and food moves atomically to a plate', () => {
  const game = create();
  game.startPan(0); advance(game, 2); game.startPan(1); chop(game); advance(game, 3.1);
  assert.equal(game.panStage(0), 'ready'); assert.equal(game.panStage(1), 'cooking');
  assert.equal(game.addToPlate({ kind: 'pan', index: 1 }, 0).ok, false);
  assert.ok(game.addToPlate({ kind: 'pan', index: 0 }, 0).ok);
  assert.equal(game.shift.pans[0], null); assert.equal(game.state.coins, 0);
  assert.equal(game.addToPlate({ kind: 'pan', index: 0 }, 1).ok, false);
  assert.ok(game.addToPlate({ kind: 'board' }, 0).ok);
  assert.equal(game.shift.board, null); assert.deepEqual(game.shift.plates[0], ['toast', 'fruit']);
  chop(game); const before = game.serialize();
  assert.equal(game.addToPlate({ kind: 'board' }, 0).ok, false); assert.equal(game.serialize(), before);
});

test('first delivery has no clock or patience pressure but burning remains visible and recoverable', () => {
  const game = create(); game.startPan(0); advance(game, 150);
  assert.equal(game.shift.time, 0); assert.equal(game.shift.orders[0].left, 42);
  assert.equal(game.panStage(0), 'burnt'); assert.equal(game.shift.burnt, 1);
  assert.equal(game.addToPlate({ kind: 'pan', index: 0 }, 0).ok, false);
  assert.ok(game.clearBurnt(0).ok); serveFirst(game);
  assert.equal(game.shift.guided, false); advance(game, 1.1);
  assert.ok(game.shift.time > 1); assert.equal(game.shift.orders[0].dish, 'berry');
});

test('wrong delivery and stale customers retain the plate; successful serving earns only once', () => {
  const game = create(); fry(game); chop(game);
  game.addToPlate({ kind: 'pan', index: 0 }, 0); game.addToPlate({ kind: 'board' }, 0);
  const before = game.serialize();
  assert.equal(game.serve(0, 1).ok, false); assert.equal(game.serve(0, 999).ok, false);
  assert.equal(game.serialize(), before); assert.equal(game.state.coins, 0);
  game.discardPlate(0); fry(game); game.addToPlate({ kind: 'pan', index: 0 }, 0);
  assert.equal(game.serve(0, 1).earned, DISHES.butter.price);
  assert.equal(game.serve(0, 1).ok, false); assert.equal(game.state.coins, 8);
  assert.equal(game.state.totalServed, 1); assert.deepEqual(game.shift.plates[0], []);
});

test('fruit can be added before toast, and two fruit portions make a fruit plate', () => {
  const game = create(); chop(game); game.addToPlate({ kind: 'board' }, 0); fry(game); game.addToPlate({ kind: 'pan', index: 0 }, 0);
  assert.deepEqual(game.shift.plates[0], ['fruit', 'toast']);
  chop(game); game.addToPlate({ kind: 'board' }, 1); chop(game); game.addToPlate({ kind: 'board' }, 1);
  assert.deepEqual(game.shift.plates[1], ['fruit', 'fruit']);
  fry(game); const before = game.serialize(); assert.equal(game.addToPlate({ kind: 'pan', index: 0 }, 1).ok, false); assert.equal(game.serialize(), before);
});

test('pause freezes cooking, orders and player actions; resume preserves all progress', () => {
  const game = create(); serveFirst(game); advance(game, 1.1); game.startPan(0); game.chop();
  game.pause(true); const before = game.serialize(); advance(game, 50);
  for (const result of [game.chop(), game.startPan(1), game.addToPlate({ kind: 'pan', index: 0 }, 0), game.serve(0, 2), game.discardPlate(0)]) assert.equal(result.ok, false);
  assert.equal(game.serialize(), before); game.pause(false); advance(game, 1);
  assert.ok(game.shift.pans[0].heat > .9);
});

test('idle service ends at 90 seconds and the same day is retryable without free reward', () => {
  const game = create(); serveFirst(game); advance(game, SHIFT_SECONDS + 1);
  assert.equal(game.shift.status, 'done'); assert.equal(game.shift.orders.length, 0);
  assert.equal(game.shift.missed, game.shift.created - 1); assert.equal(game.state.coins, 8);
  const before = game.serialize(); assert.equal(game.finishDay().ok, false); advance(game, 20); assert.equal(game.serialize(), before);
  assert.ok(game.startDay().ok); assert.equal(game.state.day, 1); assert.equal(game.shift.guided, false); assert.equal(game.state.coins, 8);
});

// Play through using only the public player actions, never inject completed food or orders.
function playDay(game) {
  let guard = 0;
  while (game.shift.status === 'open' && guard++ < 2000) {
    const order = game.shift.orders[0];
    if (!order) { advance(game, .1); continue; }
    for (const part of DISHES[order.dish].parts) {
      if (part === 'toast') { fry(game); assert.ok(game.addToPlate({ kind: 'pan', index: 0 }, 0).ok); }
      else { chop(game); assert.ok(game.addToPlate({ kind: 'board' }, 0).ok); }
    }
    assert.ok(game.serve(0, order.id).ok);
  }
  assert.ok(guard < 2000);
}

test('a complete first shift is winnable, caps combo tips, and advances to mixed day-two orders', () => {
  const game = create(); playDay(game);
  assert.equal(game.shift.served, 6); assert.equal(game.shift.missed, 0); assert.equal(game.shift.burnt, 0);
  assert.equal(game.shift.bestCombo, 6); assert.equal(game.state.coins, 63);
  assert.ok(game.upgrade('heat').ok); assert.equal(game.state.coins, 13);
  assert.ok(game.startDay().ok); assert.equal(game.state.day, 2); assert.equal(game.burnAt, 15);
  playDay(game); assert.equal(game.shift.served, 6); assert.equal(game.shift.missed, 0);
  assert.ok(game.state.totalServed === 12); assert.ok(game.state.coins < 100);
});

test('upgrades require earned funds and closing, cap their level, and affect actual mechanics', () => {
  const game = create(); assert.equal(game.upgrade('heat').ok, false); playDay(game);
  assert.equal(game.upgrade('plates').ok, false); assert.equal(game.state.coins, 63);
  assert.equal(game.upgrade('__proto__').ok, false);
  assert.ok(game.upgrade('knife').ok); assert.equal(game.chopCount, 2); assert.equal(game.state.coins, 3);
  assert.equal(game.upgrade('knife').ok, false); game.startDay();
  game.chop(); game.chop(); assert.equal(game.shift.board.cuts, 1); game.chop();
  assert.ok(game.addToPlate({ kind: 'board' }, 0).ok);
  game.discardPlate(0);
  playDay(game); game.startDay(); playDay(game); assert.ok(game.upgrade('plates').ok);
  const restored = new KitchenGame(); assert.ok(restored.restore(game.serialize())); restored.startDay();
  assert.equal(restored.shift.plates.length, 3); assert.equal(restored.state.upgrades.knife, 1);
  assert.equal(KITCHEN_UPGRADES.plates.costs[0], 75);
});

test('burning or letting customers leave breaks a streak without deducting savings', () => {
  const game = create(); serveFirst(game); assert.equal(game.shift.combo, 1);
  game.startPan(0); advance(game, game.burnAt + 1);
  assert.equal(game.shift.combo, 0); assert.equal(game.state.coins, 8);
  advance(game, 45); assert.ok(game.shift.missed > 0); assert.equal(game.state.coins, 8);
});

test('a save resumes paused with the exact counters, and then simulates deterministically', () => {
  const game = create(); serveFirst(game); advance(game, 1.1); game.startPan(1); game.chop(); advance(game, 2);
  const restored = new KitchenGame(); assert.ok(restored.restore(game.serialize())); assert.equal(restored.shift.paused, true);
  restored.pause(false); assert.equal(restored.serialize(), game.serialize());
  advance(game, 1.5); advance(restored, 1.5); assert.equal(restored.serialize(), game.serialize());
});

test('restore rejects malformed saves atomically, duplicate orders, invalid foods and excessive progress', () => {
  const game = create(); serveFirst(game); advance(game, 1.1); const raw = game.serialize();
  const mutations = [s => s.version = 99, s => s.coins = -1, s => s.day = 0, s => s.upgrades.heat = 9,
    s => s.shift.pans[0] = { heat: 1e10 }, s => s.shift.board = { cuts: 99 }, s => s.shift.plates[0] = ['toast', 'toast'],
    s => s.shift.orders.push({ ...s.shift.orders[0] }), s => s.shift.orders[0].dish = '__proto__',
    s => s.shift.time = 1000, s => s.shift.served = 8, s => s.shift.created = 99, s => s.shift.guided = true,
    s => s.shift.orders[0].left = -1, s => s.shift.plates = [null], s => s.shift.status = 'done'];
  for (const mutate of mutations) { const bad = JSON.parse(raw); mutate(bad); assert.equal(game.restore(JSON.stringify(bad)), false); assert.equal(game.serialize(), raw); }
  for (const bad of ['null', '{}', '{bad', '[]']) assert.equal(game.restore(bad), false);
});

test('invalid input cannot create ingredients, time or payouts', () => {
  const game = create(), before = game.serialize();
  for (const dt of [NaN, Infinity, -1]) game.update(dt);
  for (const index of [-1, 2, NaN, .5, '0', null]) { assert.equal(game.startPan(index).ok, false); assert.equal(game.addToPlate({ kind: 'pan', index: 0 }, index).ok, false); }
  assert.equal(game.addToPlate({ kind: 'toString' }, 0).ok, false); assert.equal(game.serialize(), before);
});

test('all reachable states across paced service, expiration and upgrades round-trip safely', () => {
  const game = create(); serveFirst(game);
  let seed = 8128;
  const random = n => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; };
  for (let i = 0; i < 4000; i++) {
    if (game.shift.status === 'done') { game.upgrade(['heat', 'knife', 'plates'][random(3)]); game.startDay(); }
    const pan = random(2), plate = random(game.plateCount);
    switch (random(7)) {
      case 0: game.startPan(pan); break;
      case 1: game.chop(); break;
      case 2: game.addToPlate({ kind: 'pan', index: pan }, plate); break;
      case 3: game.addToPlate({ kind: 'board' }, plate); break;
      case 4: game.serve(plate, game.shift.orders[0]?.id); break;
      case 5: game.clearBurnt(pan); break;
      case 6: game.discardPlate(plate); break;
    }
    game.update(.1);
    const restored = new KitchenGame(); assert.ok(restored.restore(game.serialize()), `state ${i}`);
    if (game.shift.status === 'open') restored.pause(false);
    assert.equal(restored.serialize(), game.serialize());
  }
});
