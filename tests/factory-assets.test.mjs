import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { deflateSync } from "node:zlib";
import { validateFactoryAssets } from "../scripts/validate-factory-assets.mjs";

function chunk(type, data) {
  const name = Buffer.from(type), crcData = Buffer.concat([name, data]);
  let crc = 0xffffffff;
  for (const byte of crcData) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  const size = Buffer.alloc(4), checksum = Buffer.alloc(4);
  size.writeUInt32BE(data.length);
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([size, name, data, checksum]);
}

function png({ colorType = 6, bitDepth = 8, alpha = [0, 128, 255, 255], filter = 0 } = {}) {
  const channels = colorType === 6 ? 4 : 3;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(2, 0);
  header.writeUInt32BE(2, 4);
  header[8] = bitDepth;
  header[9] = colorType;
  const rows = [0, 1].map((y) => Buffer.from([0, 1].flatMap((x) => {
    const values = [30 + x * 40, 70 + y * 50, 110 + x * 20];
    if (channels === 4) values.push(alpha[y * 2 + x]);
    return values;
  })));
  const scanlines = rows.map((row, y) => {
    const encoded = Buffer.alloc(row.length + 1);
    encoded[0] = filter;
    for (let i = 0; i < row.length; i += 1) {
      const a = i >= channels ? row[i - channels] : 0;
      const b = y ? rows[y - 1][i] : 0;
      const c = y && i >= channels ? rows[y - 1][i - channels] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      const predictor = [0, a, b, Math.floor((a + b) / 2), paeth][filter] || 0;
      encoded[i + 1] = (row[i] - predictor) & 255;
    }
    return encoded;
  });
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(scanlines))), chunk("IEND", Buffer.alloc(0))]);
}

async function fixture(t, options) {
  const root = await mkdtemp(path.join(tmpdir(), "factory-assets-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, "machines.png"), png(options));
  const manifest = { version: 1, style: "cream-flat-cartoon",
    atlases: { machines: { file: "machines.png", width: 2, height: 2, columns: 1, rows: 1 } },
    sprites: [{ id: "mixer", label: "Mixer", atlas: "machines", frame: { x: 0, y: 0, w: 2, h: 2 } }] };
  return { root, manifest };
}

test("RGBA alpha counts survive each standard PNG scanline filter", async (t) => {
  for (let filter = 0; filter <= 4; filter += 1) {
    const { root, manifest } = await fixture(t, { filter });
    const result = await validateFactoryAssets(manifest, root);
    assert.equal(result.valid, true, result.errors.join("\n"));
    assert.deepEqual(result.warnings, []);
    assert.equal(result.report.atlasCount, 1);
    assert.equal(result.report.spriteCount, 1);
    const atlas = result.report.atlases[0];
    assert.equal(atlas.hasAlpha, true);
    assert.equal(atlas.transparentPixels, 1);
    assert.equal(atlas.semiTransparentPixels, 1);
    assert.equal(atlas.opaquePixels, 2);
    assert.equal(atlas.transparentRatio, 0.25);
  }
});

test("opaque RGBA and RGB sheets produce actionable warnings without failing", async (t) => {
  for (const colorType of [6, 2]) {
    const { root, manifest } = await fixture(t, { colorType, alpha: [255, 255, 255, 255] });
    const result = await validateFactoryAssets(manifest, root);
    assert.equal(result.valid, true);
    assert.ok(result.warnings.some((message) => message.includes("no fully transparent pixels")));
    assert.equal(result.report.atlases[0].hasAlpha, colorType === 6);
    if (colorType === 2) assert.ok(result.warnings.some((message) => message.includes("no alpha channel")));
  }
});

test("reports wrong dimensions, duplicate sprite IDs, and out-of-bounds frames", async (t) => {
  const { root, manifest } = await fixture(t);
  manifest.atlases.machines.width = 3;
  manifest.sprites.push({ ...manifest.sprites[0], frame: { x: 1, y: 0, w: 2, h: 2 } });
  const result = await validateFactoryAssets(manifest, root);
  assert.equal(result.valid, false);
  for (const message of ["differ from manifest", "duplicate id", "outside atlas bounds"]) {
    assert.ok(result.errors.some((error) => error.includes(message)), message);
  }
});

test("reports missing files, unknown atlas names, invalid frames, and unsafe paths", async (t) => {
  const { root, manifest } = await fixture(t);
  manifest.atlases.machines.file = "missing.png";
  manifest.atlases.outside = { ...manifest.atlases.machines, file: "../outside.png" };
  manifest.sprites[0].atlas = "missing";
  manifest.sprites[0].frame.x = -1;
  const result = await validateFactoryAssets(manifest, root);
  assert.equal(result.valid, false);
  for (const message of ["missing file", "unknown atlas", "nonnegative integer", "within the asset directory"]) {
    assert.ok(result.errors.some((error) => error.includes(message)), message);
  }
});

test("rejects unsupported bit depth and malformed PNG data", async (t) => {
  const { root, manifest } = await fixture(t, { bitDepth: 16 });
  let result = await validateFactoryAssets(manifest, root);
  assert.ok(result.errors.some((error) => error.includes("bit depth must be 8")));
  await writeFile(path.join(root, "machines.png"), Buffer.from("not a PNG"));
  result = await validateFactoryAssets(manifest, root);
  assert.ok(result.errors.some((error) => error.includes("invalid PNG signature")));
  await writeFile(path.join(root, "machines.png"), png().subarray(0, 35));
  result = await validateFactoryAssets(manifest, root);
  assert.ok(result.errors.some((error) => error.includes("truncated PNG chunk")));
});

test("invalid manifests return errors instead of throwing", async () => {
  for (const manifest of [null, [], {}, { version: 2, style: "", atlases: [null], sprites: [null] }]) {
    const result = await validateFactoryAssets(manifest);
    assert.equal(result.valid, false);
    assert.ok(result.errors.length > 0);
  }
});
