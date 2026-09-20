import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SushiGame, SUSHI_WORLD, SUSHI_FOODS, SUSHI_STATIONS, SUSHI_STAFF, sushiTrack, sushiSeats, sushiWalkable, sushiPath, trackPoint } from '../src/factory-sushi.js';

const tick = (game, seconds = .1) => { for (let i = 0; i < Math.ceil(seconds * 10); i++) game.update(.1); };
function arrive(game, kind, arg) {
  const result = game.command(kind, arg); assert.equal(result.ok, true, result.message);
  for (let i = 0; i < 300 && (game.state.player.path.length || game.state.player.intent); i++) tick(game);
  assert.equal(game.state.player.path.length, 0); assert.equal(game.state.player.intent, null);
}
function make(game, food) { assert.equal(game.select(food).ok, true); for (let n = 0; n < 3; n++) arrive(game, 'prep'); assert.equal(game.state.player.held, food); }
function playDay(game, roundTrip = false) {
  for (let n = 0; n < 10000 && game.state.status !== 'closed'; n++) {
    const s = game.state, food = game.neededFood();
    if (s.player.held) {
      game.command('load'); for (let i = 0; i < 300 && (s.player.path.length || s.player.intent); i++) tick(game);
      if (s.player.held) tick(game, 1);
    }
    else if (s.batch) arrive(game, 'prep');
    else if (food) { game.select(food); arrive(game, 'prep'); }
    else if (s.dirty.length) arrive(game, 'clean', s.dirty[0]);
    else if (s.stock.rice < 2 || game.foods.some(f => !s.stock[f])) arrive(game, 'stock');
    else tick(game);
    if (roundTrip) { const copy = new SushiGame(); assert.equal(copy.restore(game.serialize()), true, game.serialize()); copy.pause(false); assert.equal(copy.serialize(), game.serialize()); }
  }
  assert.equal(game.state.status, 'closed', 'the day must be completable with actual walking, hand crafting, belt travel and cleanup');
}

test('sushi starts as a portrait shop with zero coins, four seats, a closed loop and three real recipes', () => {
  const g = new SushiGame(); assert.ok(SUSHI_WORLD.height > SUSHI_WORLD.width); assert.equal(g.state.coins, 0); assert.equal(g.seats.length, 4); assert.equal(g.foods.length, 3);
  assert.equal(g.state.staff.length, 0); assert.equal(g.state.player.held, null); assert.equal(g.select('shrimp').ok, false);
  tick(g, 40); assert.equal(g.state.coins, 0); assert.equal(g.state.customers.length, 4, 'no idle income or invisible customers');
});

test('both loop layouts join every tile and every seat and work station is reachable without crossing belts', () => {
  for (const level of [0, 1]) {
    const track = sushiTrack(level);
    track.forEach((p, i) => { const q = track[(i + 1) % track.length]; assert.equal(Math.abs(p.x - q.x) + Math.abs(p.y - q.y), 1); assert.equal(sushiWalkable(p.x, p.y, level), false); });
    for (const target of [...sushiSeats(level), ...Object.values(SUSHI_STATIONS).filter(p => p.target).map(p => p.target)]) {
      const path = sushiPath({ x: 10, y: 14 }, target, level); assert.ok(path); assert.ok(path.every(p => sushiWalkable(p.x, p.y, level)));
    }
    assert.deepEqual(trackPoint(track.length, level), track[0]); assert.deepEqual(trackPoint(-.5, level), trackPoint(track.length - .5, level));
  }
});

test('a command walks the cat continuously before operating; three presses reserve ingredients only once', () => {
  const g = new SushiGame(); assert.equal(g.command('prep').ok, true); assert.equal(g.state.batch, null);
  tick(g); assert.ok(g.state.player.y < 4 && g.state.player.y > 3); assert.equal(g.state.batch, null);
  tick(g, 1); assert.deepEqual(g.state.batch, { food: 'salmon', step: 1 }); assert.equal(g.state.stock.rice, 11); assert.equal(g.state.stock.salmon, 3);
  assert.equal(g.select('egg').ok, false); arrive(g, 'prep'); arrive(g, 'prep');
  assert.equal(g.state.player.held, 'salmon'); assert.equal(g.state.batch, null); assert.equal(g.state.stock.rice, 11);
  const before = g.state.stock.rice; assert.equal(g.command('prep').ok, false); assert.equal(g.state.stock.rice, before, 'full paws never consume a second meal');
});

test('only a matching seated customer can consume an actual passing plate, and each plate pays once', () => {
  const g = new SushiGame(); tick(g, 30); make(g, 'salmon');
  assert.equal(g.state.coins, 0); arrive(g, 'load'); assert.equal(g.state.player.held, null); assert.equal(g.state.dishes.length, 1);
  tick(g, 40); assert.equal(g.state.coins, 6); assert.equal(g.state.totalSold, 1); assert.equal(g.state.dishes.length, 0);
  tick(g, 100); assert.equal(g.state.coins, 6); assert.equal(g.state.dailyIncome, 6);
});

test('stock depletion is recoverable without coins and invalid targets cannot lose food', () => {
  const g = new SushiGame(); g.state.stock.rice = 0;
  arrive(g, 'prep'); assert.equal(g.state.batch, null); assert.equal(g.state.coins, 0);
  arrive(g, 'stock'); assert.equal(g.state.stock.rice, 18); make(g, 'maki');
  const raw = g.serialize(); assert.equal(g.command('walk', { x: 4, y: 5 }).ok, false); assert.equal(g.serialize(), raw);
  assert.equal(g.command('clean', 100).ok, false); assert.equal(g.state.player.held, 'maki');
});

test('the loading port enforces physical spacing and explicit reclaim frees blocked belts without payout', () => {
  const g = new SushiGame(), s = g.state; s.player.x = 3; s.player.y = 6; s.player.held = 'salmon';
  assert.equal(g.command('load').ok, true); s.player.held = 'egg'; const amount = s.dishes.length;
  assert.equal(g.command('load').ok, false); assert.equal(s.player.held, 'egg'); assert.equal(s.dishes.length, amount);
  assert.equal(g.command('reclaim').ok, true); assert.equal(s.dishes.length, 0); assert.equal(s.player.held, 'egg'); assert.equal(s.coins, 0);
  assert.equal(g.command('reclaim').ok, false); assert.equal(g.command('load').ok, true);
  const index = s.dishes[0].distance; tick(g, .5); assert.ok(Math.abs(s.dishes[0].distance - index - .35) < 1e-8, 'belt speed is 0.7 tiles per second');
});

test('pause freezes players, customers, dishes and staff; resumed saves do not collect offline money', () => {
  const g = new SushiGame(); make(g, 'egg'); arrive(g, 'load'); g.pause(true); const raw = g.serialize();
  tick(g, 1000); assert.equal(g.serialize(), raw); assert.equal(g.command('prep').ok, false);
  const restored = new SushiGame(); assert.equal(restored.restore(raw), true); assert.equal(restored.serialize(), raw);
  g.pause(false); restored.pause(false); tick(g, 4); tick(restored, 4); assert.equal(restored.serialize(), g.serialize());
});

test('dirty seats block new arrivals until the player reaches and clears the real place', () => {
  const g = new SushiGame(); tick(g, 30); make(g, 'salmon'); arrive(g, 'load'); tick(g, 40);
  assert.equal(g.state.dirty.length, 1); const admitted = g.state.admitted, seat = g.state.dirty[0];
  tick(g, 10); assert.equal(g.state.admitted, admitted); g.command('clean', seat); assert.ok(g.state.dirty.includes(seat));
  tick(g, 20); assert.equal(g.state.dirty.includes(seat), false); assert.equal(g.state.admitted, admitted + 1);
});

test('recruits require progress and real coins; helper walks to stock and dirty seats before work', () => {
  const g = new SushiGame(); g.pause(true); assert.equal(g.hire('helper').ok, false);
  g.state.totalSold = 8; g.state.coins = 150; assert.equal(g.hire('helper').ok, true); assert.equal(g.state.coins, 0); assert.equal(g.hire('helper').ok, false);
  g.state.stock.rice = 0; g.pause(false); tick(g, .1); const helper = g.state.staff[0];
  assert.ok(helper.path.length); assert.equal(g.state.stock.rice, 0);
  const oldY = helper.y; tick(g, .1); assert.ok(Math.abs(helper.y - oldY) <= .211); assert.equal(g.state.stock.rice, 0);
  tick(g, 30); assert.equal(g.state.stock.rice, 18);
  g.state.dirty = [0]; g.state.customers = g.state.customers.filter(c => c.seat !== 0); // isolate a cleanup job
  tick(g, .1); assert.deepEqual(g.state.dirty, [0]); tick(g, 30); assert.deepEqual(g.state.dirty, []);
});

test('a chef reserves ingredients, spends real cooking time, carries and loads before any sale', () => {
  const g = new SushiGame(); g.state.coins = 320; g.state.totalSold = 20; g.pause(true); assert.equal(g.hire('chef').ok, true); g.pause(false);
  tick(g, 6); assert.equal(g.state.coins, 0, 'walking to a job is not a sale');
  tick(g, 60); assert.ok(g.state.totalSold > 20); assert.ok(g.state.coins > 0);
  const snapshot = new SushiGame(); assert.equal(snapshot.restore(g.serialize()), true);
  assert.ok(g.state.dishes.length + g.state.staff.filter(w => w.held || w.job).length <= 4, 'chef cooks to actual demand, not an infinite stockpile');
});

test('eight real first-day meals earn 45 coins; closing and next-day controls never pay twice', () => {
  const g = new SushiGame(); playDay(g, true); assert.equal(g.state.coins, 45); assert.equal(g.state.dailySold, 8);
  tick(g, 100); assert.equal(g.state.coins, 45); assert.equal(g.nextDay().ok, true); assert.equal(g.state.day, 2); assert.equal(g.state.coins, 45);
  assert.equal(g.nextDay().ok, false); assert.equal(g.state.day, 2);
});

test('expansion waits for closing, extends the real loop and preserves already produced food', () => {
  const g = new SushiGame(); g.state.coins = 180; assert.equal(g.expand().ok, false); playDay(g);
  g.state.player.x = 3; g.state.player.y = 6; g.state.player.held = 'egg';
  const oldLength = g.track.length, coins = g.state.coins; assert.equal(g.expand().ok, true);
  assert.equal(g.state.coins, coins - 180); assert.equal(g.seats.length, 6); assert.ok(g.track.length > oldLength); assert.ok(g.foods.includes('shrimp')); assert.equal(g.state.player.held, 'egg');
  assert.equal(g.expand().ok, false); assert.equal(g.state.coins, coins - 180);
  const copy = new SushiGame(); assert.equal(copy.restore(g.serialize()), true); assert.equal(copy.state.player.held, 'egg');
});

test('strict restore rejects malformed positions, routes, food, capacity, IDs and money atomically', () => {
  const base = new SushiGame(); tick(base, 15); const raw = base.serialize();
  const mutations = [s => s.coins = -1, s => s.day = 0, s => s.level = 2, s => s.player.x = 99,
    s => s.player.path = [{ x: 4, y: 5 }], s => s.player.path = [{ x: 10, y: 1 }], s => s.stock.rice = -1,
    s => s.player.held = 'bread', s => s.selected = 'shrimp', s => s.dirty = [99], s => s.dirty = [0, 0],
    s => s.customers[1].id = s.customers[0].id, s => s.customers[0].seat = 100, s => s.dailySold = 100,
    s => s.status = 'closed', s => s.paused = 'yes', s => s.staff = [{ role: 'unknown' }], s => s.player.intent = { kind: 'steal' },
    s => s.batch = { food: 'egg', step: 3 }, s => s.nextId = 0, s => s.time = null];
  for (const mutate of mutations) { const s = JSON.parse(raw); mutate(s); const target = new SushiGame(), before = target.serialize(); assert.equal(target.restore(JSON.stringify(s)), false, JSON.stringify(s)); assert.equal(target.serialize(), before); }
});

test('multi-day hands-on play, actual purchases and independent reloads remain completable', () => {
  const g = new SushiGame();
  for (let day = 1; day <= 8; day++) {
    playDay(g, true);
    if (!g.state.staff.length && g.state.coins >= 150) { assert.equal(g.hire('helper').ok, true); }
    else if (!g.state.level && g.state.coins >= 180) assert.equal(g.expand().ok, true);
    if (day < 8) assert.equal(g.nextDay().ok, true);
  }
  assert.equal(g.state.totalSold, 90); assert.equal(g.state.staff[0].role, 'helper'); assert.equal(g.state.level, 1);
});

test('every sushi food, topping, prop and cat part resolves to a real generated atlas frame', async () => {
  const m = JSON.parse(await readFile(new URL('../assets/generated/factory/cream-v1/manifest.json', import.meta.url), 'utf8'));
  const ids = new Set(m.sprites.map(s => s.id));
  for (const id of [...Object.values(SUSHI_FOODS).flatMap(f => [f.sprite, f.topping]), ...Object.values(SUSHI_STATIONS).filter(s => s.sprite).map(s => s.sprite), 's_rice', 's_stool', 's_plates', 's_register']) assert.ok(ids.has(id), id);
  assert.equal(m.sprites.filter(s => s.atlas === 'sushi').length, 16); assert.equal(SUSHI_STAFF.helper.price, 150); assert.equal(SUSHI_STAFF.chef.price, 320);
});
