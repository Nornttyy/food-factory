import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = name => readFile(new URL(`../${name}`, import.meta.url), 'utf8');

test('ingredient controls live beside their cookware and the cloth lives under the serving plates', async () => {
  const html = await source('index.html');
  const hot = html.indexOf('class="kitchen-hot-zone"');
  const cut = html.indexOf('class="kitchen-cut-zone"');
  const drink = html.indexOf('id="kitchen-drink-station"');
  const plating = html.indexOf('class="kitchen-plating"');
  const end = html.indexOf('id="kitchen-hint"');
  for (const [start, finish, ids] of [
    [hot, cut, ['kitchen-pan-0', 'kitchen-pan-1', 'kitchen-pan-picker']],
    [cut, drink, ['kitchen-board', 'kitchen-board-picker']],
    [drink, plating, ['kitchen-drink', 'kitchen-drink-picker']],
    [plating, end, ['kitchen-counter-skin', 'kitchen-pantry', 'kitchen-plates', 'kitchen-bin']],
  ]) {
    assert.ok(start >= 0 && finish > start);
    const section = html.slice(start, finish);
    for (const id of ids) assert.ok(section.includes(`id="${id}"`), `${id} must remain in its physical work area`);
  }
  assert.ok(!html.includes('id="kitchen-prep"'), 'no detached ingredient toolbar');
  assert.ok(!html.includes('class="station-heading"'), 'no redundant label at the top of every utensil');
});

test('stations and ingredient controls stay transparent while small-screen overflow and focus controls remain available', async () => {
  const css = await source('factory-kitchen.css');
  for (const selector of ['.kitchen-station', '.kitchen-order', '.kitchen-plate', '.ingredient-pick']) {
    const escaped = selector.replaceAll('.', '\\.').replaceAll('-', '\\-');
    const rule = css.match(new RegExp(`${escaped}\\{([^}]+)\\}`))?.[1];
    assert.ok(rule, selector);
    for (const property of ['background:none', 'border:0', 'box-shadow:none']) assert.ok(rule.includes(property), `${selector}: ${property}`);
  }
  assert.match(css, /\.kitchen-room\{[^}]*overflow:auto/s);
  assert.match(css, /#kitchen-pour-step:focus-visible\{[^}]*min-height|#kitchen-pour-step:focus-visible\{[^}]*top:44px/);
  assert.match(css, /\.kitchen-room\[data-paused=true\] \*\{animation-play-state:paused/);
});
