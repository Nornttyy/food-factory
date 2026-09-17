import test from 'node:test';
import assert from 'node:assert/strict';
import { FactoryRenderer } from '../src/factory-renderer.js';
import { FactoryGame, DIRS } from '../src/factory-core.js';
import { CELL } from '../src/factory-feel.js';

function recordingRenderer() {
  const strokes = [], transforms = [];
  let path = [];
  const ctx = new Proxy({
    beginPath() { path = []; },
    moveTo(x, y) { path.push(['move', x, y]); },
    lineTo(x, y) { path.push(['line', x, y]); },
    stroke() { strokes.push({ path: [...path], width: this.lineWidth, color: this.strokeStyle, transformCount: transforms.length }); },
    translate(...args) { transforms.push(args); },
    scale(...args) { transforms.push(args); },
  }, { get: (target, key) => key in target ? target[key] : () => {} });
  return { renderer: new FactoryRenderer({ getContext: () => ctx }, { draw() {} }), strokes, transforms };
}

test('each machine sleeve meets its neighboring belt on the exact grid boundary', () => {
  for (let side = 0; side < 4; side++) {
    const { renderer, strokes, transforms } = recordingRenderer(), machine = { x: 4, y: 3 };
    renderer.drawMachineConnections(machine, [{ side, output: true }]);
    const [dx, dy] = DIRS[side], center = [(machine.x + .5) * CELL, (machine.y + .5) * CELL];
    assert.equal(strokes.length, 3); assert.deepEqual(strokes.map(s => s.width), [43, 38, 28]);
    for (const stroke of strokes) {
      assert.deepEqual(stroke.path, [
        ['move', center[0] + dx * 20, center[1] + dy * 20],
        ['line', center[0] + dx * CELL / 2, center[1] + dy * CELL / 2],
      ]);
      const neighbor = { x: machine.x + dx, y: machine.y + dy };
      assert.equal(stroke.path[1][1], (neighbor.x + .5) * CELL - dx * CELL / 2);
      assert.equal(stroke.path[1][2], (neighbor.y + .5) * CELL - dy * CELL / 2);
    }
    assert.equal(transforms.length, 0, 'connection geometry must not be squashed with the artwork');
  }
});

test('rendering a bouncing machine keeps sleeve coordinates fixed and preserves the save', () => {
  const game = new FactoryGame({ starter: false }); game.state.coins = 1000;
  const machine = game.place('bread_oven', 3, 2, 0).building;
  game.place('belt', 2, 2, 0); game.place('belt', 4, 2, 0);
  const saved = game.serialize(), paths = [];
  for (const timestamp of [100, 230, 500, 1100]) {
    const { renderer, strokes, transforms } = recordingRenderer();
    renderer.pulse(machine.id, 'place', 100); renderer.drawMachine(machine, game, timestamp);
    paths.push(strokes.slice(0, 3).map(stroke => stroke.path));
    assert.ok(strokes.slice(0, 3).every(stroke => stroke.transformCount === 0));
    assert.ok(transforms.length > 0); assert.equal(game.serialize(), saved);
  }
  for (const path of paths) assert.deepEqual(path, paths[0]);
});

test('unconnected machines do not draw fake transport sleeves', () => {
  const game = new FactoryGame({ starter: false });
  const machine = game.place('bread_oven', 2, 2, 0).building;
  const { renderer, strokes } = recordingRenderer(); renderer.drawMachine(machine, game, 0);
  assert.ok(strokes.slice(0, 3).every(stroke => stroke.path.length === 0));
});
