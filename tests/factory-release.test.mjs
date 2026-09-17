import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('the full browser module graph and styles share a version to bypass stale release caches', async () => {
  const root = new URL('../', import.meta.url);
  const { version } = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
  const html = await readFile(new URL('index.html', root), 'utf8');
  const urls = [...html.matchAll(/(?:href|src)="(\.\/[^"?]+\.(?:css|js)[^"]*)"/g)].map(match => match[1]);
  assert.equal(urls.length, 4);
  const visited = new Set();
  async function visit(url) {
    assert.equal(url.search, `?v=${version}`, url.pathname);
    if (visited.has(url.href)) return; visited.add(url.href);
    const text = await readFile(url, 'utf8');
    for (const match of text.matchAll(/from '(\.\/[^']+)'/g)) await visit(new URL(match[1], url));
  }
  for (const url of urls) await visit(new URL(url, root));
  assert.equal(visited.size, 14);
  const renderer = await readFile(new URL('src/factory-renderer.js', root), 'utf8');
  assert.ok(renderer.includes(`manifest.json?v=${version}`), 'the sprite manifest must also bypass the prior release cache');
});
