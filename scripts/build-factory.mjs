import { readFile, mkdir, copyFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { validateFactoryAssets } from './validate-factory-assets.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assetDir = resolve(root, 'assets/generated/factory/cream-v1');
const manifest = JSON.parse(await readFile(resolve(assetDir, 'manifest.json'), 'utf8'));
const validation = await validateFactoryAssets(manifest, assetDir);
if (!validation.valid) throw new Error(validation.errors.join('\n'));
const source = ['src/factory-loading.js', 'src/factory-shop.js', 'src/factory-business.js', 'src/factory-career.js', 'src/factory-links.js', 'src/factory-core.js', 'src/factory-packing.js', 'src/factory-service.js', 'src/factory-automation.js', 'src/factory-yard.js', 'src/factory-feel.js', 'src/factory-renderer.js', 'src/factory-tutorial.js', 'src/factory-main.js'];
for (const file of source) execFileSync(process.execPath, ['--check', resolve(root, file)]);
const html = await readFile(resolve(root, 'index.html'), 'utf8');
const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
const main = await readFile(resolve(root, 'src/factory-main.js'), 'utf8');
for (const [, id] of main.matchAll(/\$\('#([^']+)'\)/g)) {
  if (!ids.has(id)) throw new Error(`Missing UI target: ${id}`);
}
const files = ['index.html', '.nojekyll', 'factory.css', 'factory-layout.css', 'factory-menu.css', 'factory-service.css', 'manifest.webmanifest', 'public/og.png', ...source,
  'assets/generated/factory/cream-v1/manifest.json',
  ...Object.values(manifest.atlases).map(atlas => `assets/generated/factory/cream-v1/${atlas.file}`)];
const dist = resolve(root, 'dist');
for (const file of files) { const target = resolve(dist, file); await mkdir(dirname(target), { recursive: true }); await copyFile(resolve(root, file), target); }
console.log(`Factory build ready: ${files.length} files; ${validation.report.spriteCount} atlas frames validated.`);
