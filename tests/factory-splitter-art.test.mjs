import test from 'node:test';
import assert from 'node:assert/strict';
import { FactoryRenderer } from '../src/factory-renderer.js';
import { FactoryGame, DIRS } from '../src/factory-core.js';
import { CELL } from '../src/factory-feel.js';
import { conveyorPorts } from '../src/factory-links.js';

const tidy = n => Math.round(n * 1e6) / 1e6;
function recorder() {
  const marks = [], stack = [];
  let matrix = [1, 0, 0, 1, 0, 0], path = [];
  const point = (x, y) => [tidy(matrix[0] * x + matrix[2] * y + matrix[4]), tidy(matrix[1] * x + matrix[3] * y + matrix[5])];
  const ctx = {
    globalAlpha: 1, lineWidth: 1, fillStyle: '', strokeStyle: '',
    save() { stack.push({ matrix: [...matrix], alpha: this.globalAlpha, width: this.lineWidth, fill: this.fillStyle, stroke: this.strokeStyle }); },
    restore() { const s = stack.pop(); matrix = s.matrix; this.globalAlpha = s.alpha; this.lineWidth = s.width; this.fillStyle = s.fill; this.strokeStyle = s.stroke; },
    translate(x, y) { [matrix[4], matrix[5]] = point(x, y); },
    scale(x, y) { matrix[0] *= x; matrix[1] *= x; matrix[2] *= y; matrix[3] *= y; },
    rotate(angle) { const [a, b, c, d] = matrix, cos = Math.cos(angle), sin = Math.sin(angle); matrix[0] = a * cos + c * sin; matrix[1] = b * cos + d * sin; matrix[2] = c * cos - a * sin; matrix[3] = d * cos - b * sin; },
    beginPath() { path = []; },
    moveTo(x, y) { path.push(['move', ...point(x, y)]); },
    lineTo(x, y) { path.push(['line', ...point(x, y)]); },
    roundRect(x, y, w, h, r) { path.push(['round', ...point(x, y), w, h, r]); },
    arc(x, y, r) { path.push(['arc', ...point(x, y), r]); },
    closePath() {},
    stroke() { marks.push({ kind: 'stroke', color: this.strokeStyle, width: this.lineWidth, alpha: this.globalAlpha, path: [...path] }); },
    fill() { marks.push({ kind: 'fill', color: this.fillStyle, alpha: this.globalAlpha, path: [...path] }); },
  };
  return { ctx, marks };
}
function setup() {
  const game = new FactoryGame({ starter: false }); game.state.coins = 10000;
  const record = recorder(), bitmapCalls = [];
  const assets = { draw: (...args) => bitmapCalls.push(args), icon: (...args) => ({ bitmap: args }) };
  const renderer = new FactoryRenderer({ getContext: () => record.ctx }, assets);
  return { ...record, game, renderer, bitmapCalls };
}
function add(game, type, x, y, dir) {
  const result = game.place(type, x, y, dir); assert.ok(result.ok); return result.building;
}
const arrows = (marks, color) => marks.filter(m => m.kind === 'fill' && m.color === color && m.path[0]?.[0] === 'move');
const withoutAlpha = marks => marks.map(({ alpha, ...mark }) => mark);

test('all four splitter rotations show two real outlets and a matching inward inlet', () => {
  for (let dir = 0; dir < 4; dir++) {
    const { game, renderer, marks } = setup(), b = add(game, 'splitter', 3, 3, dir);
    renderer.drawBelt(b, game);
    const exits = arrows(marks, '#e4b69f'), entrances = arrows(marks, '#b9c7ad');
    assert.equal(exits.length, 2); assert.equal(entrances.length, 1);
    for (const [i, side] of [dir, (dir + 1) % 4].entries()) {
      const [dx, dy] = DIRS[side], tip = exits[i].path[0].slice(1);
      assert.deepEqual(tip, [tidy((b.x + .5) * CELL + dx * 33.6), tidy((b.y + .5) * CELL + dy * 33.6)]);
    }
    const [dx, dy] = DIRS[dir];
    assert.deepEqual(entrances[0].path[0].slice(1), [tidy((b.x + .5) * CELL - dx * 23.8), tidy((b.y + .5) * CELL - dy * 23.8)]);
    assert.equal(marks.filter(m => m.kind === 'fill' && m.path[0]?.[0] === 'round').length, 1, 'cream junction distinguishes a splitter');
  }
});

test('side-fed and two-inlet splitters show only actual inlets, keeping both outlets', () => {
  for (let dir = 0; dir < 4; dir++) for (const inlets of [[(dir + 3) % 4], [(dir + 2) % 4, (dir + 3) % 4]]) {
    const { game, renderer, marks } = setup(), b = add(game, 'splitter', 3, 3, dir);
    for (const side of inlets) { const [dx, dy] = DIRS[side]; add(game, 'belt', b.x + dx, b.y + dy, (side + 2) % 4); }
    renderer.drawBelt(b, game);
    assert.equal(arrows(marks, '#b9c7ad').length, inlets.length);
    assert.equal(arrows(marks, '#e4b69f').length, 2);
    const geometry = conveyorPorts(b, (x, y) => game.at(x, y));
    const ends = new Set(marks[0].path.filter(p => p[0] === 'move' || p[1] !== (b.x + .5) * CELL || p[2] !== (b.y + .5) * CELL).map(p => p.slice(1).join(',')));
    const expected = new Set(geometry.ports.map(side => [(b.x + .5) * CELL + DIRS[side][0] * CELL / 2, (b.y + .5) * CELL + DIRS[side][1] * CELL / 2].join(',')));
    assert.deepEqual(ends, expected, 'all and only live ports reach exact cell edges');
    assert.deepEqual(marks.slice(0, 3).map(m => m.width), [43, 38, 28], 'no change to adjoining belt/connector widths');
  }
});

test('ghost and placed splitter draw identical geometry in every rotation without changing a save', () => {
  for (let dir = 0; dir < 4; dir++) {
    const { game, renderer, marks, ctx, bitmapCalls } = setup();
    const b = { type: 'splitter', x: 3, y: 3, dir };
    const side = (dir + 3) % 4, [dx, dy] = DIRS[side];
    add(game, 'belt', 3 + dx, 3 + dy, (side + 2) % 4);
    const before = game.serialize();
    renderer.drawBuildingPreview(b, game);
    const ghost = marks.splice(0);
    assert.ok(ghost.every(m => m.alpha === .5)); assert.equal(ctx.globalAlpha, 1);
    renderer.drawBelt(b, game);
    assert.deepEqual(withoutAlpha(ghost), withoutAlpha(marks));
    assert.equal(bitmapCalls.length, 0, 'no fixed-orientation atlas or extra direction arrow in the ghost');
    assert.equal(game.serialize(), before);
  }
});

test('build and inspector icons use the same rotated splitter geometry instead of the old bitmap', t => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  t.after(() => original ? Object.defineProperty(globalThis, 'document', original) : delete globalThis.document);
  let record;
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement() {
    record = recorder(); return { getContext: () => record.ctx, setAttribute(name, value) { this[name] = value; } };
  } } });
  for (let dir = 0; dir < 4; dir++) {
    const { renderer, game } = setup(), b = add(game, 'splitter', 3, 3, dir);
    const icon = renderer.buildingIcon(b, 64, game), exits = arrows(record.marks, '#e4b69f');
    assert.equal(icon.width, 128); assert.equal(icon.height, 128); assert.equal(icon['aria-hidden'], 'true');
    assert.equal(exits.length, 2);
    for (const [i, side] of [dir, (dir + 1) % 4].entries()) {
      const scale = 128 * .88 / CELL;
      assert.deepEqual(exits[i].path[0].slice(1), [tidy(64 + DIRS[side][0] * 33.6 * scale), tidy(64 + DIRS[side][1] * 33.6 * scale)]);
    }
    const standalone = renderer.buildingIcon({ type: 'splitter', dir }, 64);
    assert.equal(standalone.width, 128); assert.equal(arrows(record.marks, '#e4b69f').length, 2);
    assert.deepEqual(renderer.buildingIcon({ type: 'bread_oven', dir }).bitmap, ['bread_oven', 64]);
  }
});

test('blocked outlet markings follow rotation and ordinary belts keep one outlet and no junction', () => {
  for (let dir = 0; dir < 4; dir++) {
    const { game, renderer, marks } = setup(), b = add(game, 'splitter', 3, 3, dir);
    const [dx, dy] = DIRS[dir]; add(game, 'belt', 3 + dx, 3 + dy, (dir + 2) % 4);
    renderer.drawBuildingPreview(b, game);
    assert.equal(marks.filter(m => m.kind === 'stroke' && m.color === '#ce8e74').length, 1);
    marks.length = 0;
    renderer.drawBelt({ type: 'belt', x: 0, y: 0, dir }, game);
    assert.equal(arrows(marks, '#e4b69f').length, 1);
    assert.equal(arrows(marks, '#b9c7ad').length, 0);
    assert.equal(marks.filter(m => m.kind === 'fill' && m.path[0]?.[0] === 'round').length, 0);
  }
});
