import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('the full browser module graph and styles share a version to bypass stale release caches', async () => {
  const root = new URL('../', import.meta.url);
  const { version } = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
  const html = await readFile(new URL('index.html', root), 'utf8');
  const urls = [...html.matchAll(/(?:href|src)="(\.\/[^"?]+\.(?:css|js)[^"]*)"/g)].map(match => match[1]);
  assert.equal(urls.length, 9);
  const visited = new Set();
  async function visit(url) {
    assert.equal(url.search, `?v=${version}`, url.pathname);
    if (visited.has(url.href)) return; visited.add(url.href);
    const text = await readFile(url, 'utf8');
    for (const match of text.matchAll(/from '(\.\/[^']+)'/g)) await visit(new URL(match[1], url));
  }
  for (const url of urls) await visit(new URL(url, root));
  assert.equal(visited.size, 28);
  const renderer = await readFile(new URL('src/factory-renderer.js', root), 'utf8');
  assert.ok(renderer.includes(`manifest.json?v=${version}`), 'the sprite manifest must also bypass the prior release cache');
});

test('sorting branding, primary entry and generated share image agree without removing legacy entries', async () => {
  const root = new URL('../', import.meta.url);
  const html = await readFile(new URL('index.html', root), 'utf8');
  const manifest = JSON.parse(await readFile(new URL('manifest.webmanifest', root), 'utf8'));
  const png = await readFile(new URL('public/og.png', root));
  assert.equal(manifest.name, '猫咪开饭啦'); assert.match(html, /<title>猫咪开饭啦/);
  assert.match(html, /og:title" content="猫咪开饭啦/);
  assert.ok(html.indexOf('id="menu-sort"') < html.indexOf('class="classic-modes"'));
  for (const id of ['menu-kitchen', 'menu-play', 'menu-craft', 'menu-packing']) assert.ok(html.includes(`id="${id}"`));
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.equal(png.readUInt32BE(16), 1672); assert.equal(png.readUInt32BE(20), 941);
  assert.match(await readFile(new URL('public/og-cat-sorting-prompt.md', root), 'utf8'), /image_gen/);
});
