import test from 'node:test';
import assert from 'node:assert/strict';
import { FactoryGame, DIRS } from '../src/factory-core.js';
import { canLink, conveyorPorts, outputDirections, connectedPorts, nextBeltCell } from '../src/factory-links.js';

function empty() { const game = new FactoryGame({ starter: false }); game.state.coins = 10000; return game; }
function add(game, type, x, y, dir = 0) { const result = game.place(type, x, y, dir); assert.equal(result.ok, true, result.message); return result.building; }
function run(game, seconds) { for (let i = 0; i < Math.round(seconds * 10); i++) game.update(.1); }
function ports(game, building) { return conveyorPorts(building, (x, y) => game.at(x, y)); }

test('every orientation accepts rear and side inputs, never its own outlet', () => {
  for (let dir = 0; dir < 4; dir++) {
    for (const type of ['belt', 'merger', 'splitter', 'bread_oven', 'flour_hopper', 'fruit_hopper', 'depot']) {
      const target = { type, x: 4, y: 3, dir };
      for (let side = 0; side < 4; side++) {
        const [dx, dy] = DIRS[side], from = { type: 'belt', x: 4 + dx, y: 3 + dy, dir: (side + 2) % 4 };
        const accepts = type === 'depot' || (!type.endsWith('hopper') && side !== dir && (type !== 'splitter' || side !== (dir + 1) % 4));
        assert.equal(canLink(from, target), accepts, `${type} dir ${dir}, inlet ${side}`);
        assert.equal(canLink({ ...from, dir: (from.dir + 1) % 4 }, target), false);
      }
    }
  }
  assert.equal(canLink({ type: 'belt', x: 1, y: 1, dir: 0 }, { type: 'belt', x: 3, y: 1, dir: 0 }), false);
  assert.deepEqual(outputDirections({ type: 'depot', dir: 0 }), []);
});

test('all eight L corners draw exactly two ports and deliver through the turn', () => {
  for (let dir = 0; dir < 4; dir++) for (const turn of [1, 3]) {
    const game = empty(), nextDir = (dir + turn) % 4, [dx, dy] = DIRS[dir], [nx, ny] = DIRS[nextDir];
    const source = add(game, 'belt', 4 - dx, 3 - dy, dir), corner = add(game, 'belt', 4, 3, nextDir);
    add(game, 'depot', 4 + nx, 3 + ny);
    const geometry = ports(game, corner);
    assert.deepEqual(new Set(geometry.ports), new Set([(dir + 2) % 4, nextDir]));
    assert.deepEqual(geometry.blockedEnds, []);
    source.output = 'bread'; run(game, 2);
    assert.equal(game.state.delivered.bread, 1); assert.equal(source.output, null); assert.equal(corner.output, null);
  }
});

test('a depot never creates a phantom inlet on the neighboring conveyor', () => {
  const game = empty(), belt = add(game, 'belt', 3, 3, 1);
  add(game, 'belt', 2, 3, 0); add(game, 'depot', 3, 2, 1);
  assert.deepEqual(ports(game, belt).incoming, [2]);
  assert.deepEqual(new Set(ports(game, belt).ports), new Set([2, 1]));
});

test('facing conveyor outlets block instead of ping-ponging or losing goods', () => {
  for (let dir = 0; dir < 4; dir++) {
    const game = empty(), [dx, dy] = DIRS[dir];
    const first = add(game, 'belt', 4, 3, dir), second = add(game, 'belt', 4 + dx, 3 + dy, (dir + 2) % 4);
    first.output = 'bread'; run(game, 4);
    assert.equal(first.output, 'bread'); assert.equal(second.output, null); assert.equal(first.blocked, true);
    assert.ok(ports(game, first).blockedEnds.includes(dir));
    assert.ok(ports(game, second).blockedEnds.includes((dir + 2) % 4));
  }
});

test('splitter rejects both output-side arrivals and merger accepts three real inlets', () => {
  const game = empty(), splitter = add(game, 'splitter', 3, 2, 0);
  const right = add(game, 'belt', 4, 2, 2), down = add(game, 'belt', 3, 3, 3);
  right.output = 'bread'; down.output = 'bread'; run(game, 2);
  assert.equal(splitter.output, null); assert.equal(right.output, 'bread'); assert.equal(down.output, 'bread');
  const merger = add(game, 'merger', 7, 3, 0);
  add(game, 'belt', 7, 2, 1); add(game, 'belt', 6, 3, 0); add(game, 'belt', 7, 4, 3);
  assert.deepEqual(new Set(ports(game, merger).incoming), new Set([1, 2, 3]));
  assert.deepEqual(new Set(ports(game, merger).ports), new Set([0, 1, 2, 3]));
});

test('continuing an existing belt turns it and charges only for the new tile', () => {
  const game = empty(), old = add(game, 'belt', 2, 2, 0), wallet = game.state.coins;
  old.output = 'bread';
  const result = game.extendBelt(old, { x: 2, y: 3 });
  assert.equal(result.ok, true); assert.equal(result.created, true); assert.equal(old.dir, 1);
  assert.equal(result.building.dir, 1); assert.equal(game.state.coins, wallet - 8);
  add(game, 'depot', 2, 4); run(game, 2); assert.equal(game.state.delivered.bread, 1);
});

test('joining an existing perpendicular belt preserves its route, cargo and paid cost', () => {
  const game = empty(), start = add(game, 'belt', 2, 2), target = add(game, 'belt', 3, 2, 1);
  target.output = 'bread'; const before = { ...target }, wallet = game.state.coins;
  const result = game.extendBelt(start, target);
  assert.equal(result.ok, true); assert.equal(result.created, false); assert.equal(result.building, target);
  assert.deepEqual(target, before); assert.equal(game.state.coins, wallet);
  assert.equal(game.state.buildings.length, 2);
});

test('explicitly redrawing into a head-on belt aligns it without charging or discarding', () => {
  const game = empty(), start = add(game, 'belt', 2, 2, 1), target = add(game, 'belt', 3, 2, 2);
  target.output = 'bread'; const wallet = game.state.coins, id = target.id;
  assert.equal(game.extendBelt(start, target).ok, true);
  assert.equal(start.dir, 0); assert.equal(target.dir, 0); assert.equal(target.id, id);
  assert.equal(target.output, 'bread'); assert.equal(game.state.coins, wallet);
});

test('failed extensions do not turn the original belt, spend coins or place anything', () => {
  const game = empty(), start = add(game, 'belt', 2, 2, 0);
  game.state.coins = 0; let before = game.serialize();
  assert.equal(game.extendBelt(start, { x: 2, y: 3 }).ok, false); assert.equal(game.serialize(), before);
  game.state.coins = 1000; const source = add(game, 'flour_hopper', 2, 3, 1); before = game.serialize();
  assert.equal(game.extendBelt(start, source).ok, false); assert.equal(game.serialize(), before);
  for (const target of [{ x: 2, y: 4 }, { x: -1, y: 2 }, { x: 2, y: 2 }]) {
    assert.equal(game.extendBelt(start, target).ok, false); assert.equal(game.serialize(), before);
  }
});

test('machine inputs allow continuing a stroke along the outlet, only depots terminate it', () => {
  const game = empty(), belt = add(game, 'belt', 2, 2, 1), oven = add(game, 'bread_oven', 3, 2, 0);
  const wallet = game.state.coins, incoming = game.extendBelt(belt, oven);
  assert.equal(incoming.ok, true); assert.equal(incoming.terminal, false); assert.equal(game.state.coins, wallet);
  const before = game.serialize();
  assert.equal(game.extendBelt(oven, { x: 3, y: 3 }).ok, false); assert.equal(game.serialize(), before);
  assert.equal(game.extendBelt(oven, { x: 4, y: 2 }).ok, true);
  const depot = add(game, 'depot', 5, 2, 2);
  assert.equal(game.extendBelt({ x: 4, y: 2 }, depot).terminal, true);
  assert.equal(game.extendBelt(depot, { x: 6, y: 2 }).ok, false);
  belt.output = 'dough'; run(game, 6); assert.equal(game.state.delivered.bread, 1);
});

test('machine sleeves expose only live directional joins in all four orientations', () => {
  for (let dir = 0; dir < 4; dir++) {
    const game = empty(), machine = add(game, 'bread_oven', 4, 3, dir);
    for (let side = 0; side < 4; side++) {
      const [dx, dy] = DIRS[side]; add(game, 'belt', 4 + dx, 3 + dy, side === dir ? side : (side + 2) % 4);
    }
    assert.deepEqual(connectedPorts(machine, (x, y) => game.at(x, y)), [0, 1, 2, 3].map(side => ({ side, output: side === dir })));
    const [dx, dy] = DIRS[dir], downstream = game.at(4 + dx, 3 + dy);
    downstream.dir = (dir + 2) % 4;
    assert.equal(connectedPorts(machine, (x, y) => game.at(x, y)).some(p => p.side === dir), false);
    game.remove(game.at(4 - dx, 3 - dy).id);
    assert.equal(connectedPorts(machine, (x, y) => game.at(x, y)).length, 2);
  }
});

test('sources have no intake sleeves, depots have no output sleeves', () => {
  const game = empty(), source = add(game, 'flour_hopper', 3, 2, 0), depot = add(game, 'depot', 6, 2, 0);
  add(game, 'belt', 2, 2, 0); add(game, 'belt', 4, 2, 0); add(game, 'belt', 5, 2, 0); add(game, 'belt', 7, 2, 0);
  assert.deepEqual(connectedPorts(source, (x, y) => game.at(x, y)), [{ side: 0, output: true }]);
  assert.deepEqual(connectedPorts(depot, (x, y) => game.at(x, y)), [{ side: 2, output: false }]);
});

test('diagonal strokes leave fixed machines along their outlet before turning', () => {
  for (let dir = 0; dir < 4; dir++) for (const turn of [1, 3]) {
    const [dx, dy] = DIRS[dir], [sx, sy] = DIRS[(dir + turn) % 4];
    const machine = { type: 'bread_oven', x: 4, y: 3, dir }, target = { x: 4 + dx + sx, y: 3 + dy + sy };
    const next = nextBeltCell(machine, target, machine);
    assert.deepEqual(next, { x: 4 + dx, y: 3 + dy });
    assert.deepEqual(nextBeltCell(next, target, { ...next, type: 'belt', dir }), target);
  }
  assert.equal(nextBeltCell({ x: 1, y: 1 }, { x: 1, y: 1 }), null);
});

test('fast diagonal routing can cross a machine and preserve its contents and orientation', () => {
  const game = empty(), start = add(game, 'belt', 1, 1), machine = add(game, 'bread_oven', 3, 1, 1);
  machine.input = 'dough'; machine.progress = 1.2;
  const beforeMachine = { ...machine }, wallet = game.state.coins, target = { x: 5, y: 3 };
  let anchor = start, steps = 0;
  while (anchor.x !== target.x || anchor.y !== target.y) {
    const next = nextBeltCell(anchor, target, anchor), result = game.extendBelt(anchor, next);
    assert.equal(result.ok, true, result.message); assert.equal(result.terminal, false);
    anchor = result.building; assert.ok(++steps <= 6);
  }
  assert.equal(game.at(3, 2).type, 'belt'); assert.equal(game.at(4, 1), undefined);
  assert.deepEqual(machine, beforeMachine); assert.equal(game.state.coins, wallet - 5 * 8);
});

test('rotation and removal immediately recompute ports rather than retaining stale joins', () => {
  const game = empty(), incoming = add(game, 'belt', 2, 2, 0), corner = add(game, 'belt', 3, 2, 1);
  assert.deepEqual(ports(game, corner).incoming, [2]);
  game.rotate(incoming.id); assert.deepEqual(ports(game, corner).incoming, []);
  assert.deepEqual(new Set(ports(game, corner).ports), new Set([3, 1]));
  incoming.dir = 0; game.remove(incoming.id); assert.deepEqual(ports(game, corner).incoming, []);
});

test('saved corner routes restore with identical future delivery and no lost goods', () => {
  const game = empty(), first = add(game, 'belt', 2, 2, 0);
  game.extendBelt(first, { x: 3, y: 2 }); game.extendBelt({ x: 3, y: 2 }, { x: 3, y: 3 });
  add(game, 'depot', 3, 4); first.output = 'bread'; game.update(.1);
  const restored = new FactoryGame(); assert.equal(restored.restore(game.serialize()), true);
  run(game, 3); run(restored, 3);
  assert.deepEqual(restored.state.delivered, { bread: 1 }); assert.equal(restored.state.coins, game.state.coins);
  assert.equal(restored.state.buildings.some(b => b.output), false);
});
