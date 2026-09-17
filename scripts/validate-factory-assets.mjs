import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const MAX_PNG_BYTES = 64 * 1024 * 1024;
const MAX_DECODED_BYTES = 128 * 1024 * 1024;
const DEFAULT_ROOT = fileURLToPath(new URL("../assets/generated/factory/cream-v1/", import.meta.url));

function paeth(a, b, c) {
  const p = a + b - c;
  const da = Math.abs(p - a), db = Math.abs(p - b), dc = Math.abs(p - c);
  return da <= db && da <= dc ? a : db <= dc ? b : c;
}

function inspectPng(bytes) {
  if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error("invalid PNG signature");
  let header, transparency, ended = false;
  const imageData = [];
  for (let offset = 8; offset < bytes.length;) {
    if (offset + 12 > bytes.length) throw new Error("truncated PNG chunk");
    const length = bytes.readUInt32BE(offset);
    if (offset + length + 12 > bytes.length) throw new Error("truncated PNG chunk data");
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (!header && type !== "IHDR") throw new Error("PNG must begin with IHDR");
    if (type === "IHDR") {
      if (header || length !== 13) throw new Error("invalid PNG IHDR");
      header = {
        width: data.readUInt32BE(0), height: data.readUInt32BE(4),
        bitDepth: data[8], colorType: data[9], interlaced: data[12] === 1,
      };
      if (!header.width || !header.height || data[10] !== 0 || data[11] !== 0 || data[12] > 1) {
        throw new Error("unsupported or invalid PNG header");
      }
    }
    if (type === "tRNS") transparency = data;
    if (type === "IDAT") imageData.push(data);
    offset += length + 12;
    if (type === "IEND") { ended = true; break; }
  }
  if (!header || !ended || imageData.length === 0) throw new Error("incomplete PNG");
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[header.colorType];
  if (!channels) throw new Error(`unsupported PNG color type ${header.colorType}`);
  if (transparency && ((header.colorType === 0 && transparency.length !== 2)
    || (header.colorType === 2 && transparency.length !== 6)
    || (header.colorType === 3 && (transparency.length === 0 || transparency.length > 256))
    || header.colorType === 4 || header.colorType === 6)) {
    throw new Error("invalid PNG transparency chunk");
  }
  header.hasAlpha = header.colorType === 4 || header.colorType === 6 || Boolean(transparency);
  if (header.bitDepth !== 8 || header.interlaced) return header;
  const stride = header.width * channels;
  const expectedBytes = (stride + 1) * header.height;
  if (!Number.isSafeInteger(expectedBytes) || expectedBytes > MAX_DECODED_BYTES) {
    throw new Error("PNG exceeds the decoded size limit");
  }
  const raw = inflateSync(Buffer.concat(imageData), { maxOutputLength: expectedBytes });
  if (raw.length !== expectedBytes) throw new Error("PNG scanline length does not match dimensions");
  let previous = Buffer.alloc(stride), current = Buffer.alloc(stride);
  let transparentPixels = 0, semiTransparentPixels = 0;
  for (let y = 0; y < header.height; y += 1) {
    const rowOffset = y * (stride + 1), filter = raw[rowOffset];
    if (filter > 4) throw new Error(`invalid PNG scanline filter ${filter}`);
    for (let i = 0; i < stride; i += 1) {
      const left = i >= channels ? current[i - channels] : 0;
      const up = previous[i], upperLeft = i >= channels ? previous[i - channels] : 0;
      const predictor = [0, left, up, Math.floor((left + up) / 2), paeth(left, up, upperLeft)][filter];
      current[i] = (raw[rowOffset + 1 + i] + predictor) & 255;
    }
    for (let i = 0; i < stride; i += channels) {
      let alpha = 255;
      if (header.colorType === 6) alpha = current[i + 3];
      else if (header.colorType === 4) alpha = current[i + 1];
      else if (header.colorType === 3 && transparency) alpha = transparency[current[i]] ?? 255;
      else if (header.colorType === 0 && transparency) alpha = current[i] === transparency.readUInt16BE(0) ? 0 : 255;
      else if (header.colorType === 2 && transparency) {
        alpha = current[i] === transparency.readUInt16BE(0)
          && current[i + 1] === transparency.readUInt16BE(2)
          && current[i + 2] === transparency.readUInt16BE(4) ? 0 : 255;
      }
      if (alpha === 0) transparentPixels += 1;
      else if (alpha < 255) semiTransparentPixels += 1;
    }
    [previous, current] = [current, previous];
  }
  const pixels = header.width * header.height;
  return { ...header, pixels, transparentPixels, semiTransparentPixels,
    opaquePixels: pixels - transparentPixels - semiTransparentPixels,
    transparentRatio: transparentPixels / pixels };
}

/** Inspect manifest entries and PNGs without changing any files. */
export async function validateFactoryAssets(manifest, root = DEFAULT_ROOT) {
  const errors = [], warnings = [], atlasReports = [];
  const result = () => ({ valid: errors.length === 0, errors, warnings,
    report: { atlasCount: atlasReports.length, spriteCount: Array.isArray(manifest?.sprites) ? manifest.sprites.length : 0,
      atlases: atlasReports } });
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    errors.push("Manifest must be an object.");
    return result();
  }
  if (manifest.version !== 1) errors.push("Manifest version must be 1.");
  if (typeof manifest.style !== "string" || !manifest.style.trim()) errors.push("Manifest style is required.");
  const atlases = manifest.atlases;
  if (!atlases || typeof atlases !== "object" || Array.isArray(atlases) || !Object.keys(atlases).length) {
    errors.push("Manifest atlases must be a nonempty object.");
  }
  const atlasEntries = atlases && typeof atlases === "object" && !Array.isArray(atlases) ? Object.entries(atlases) : [];
  const dimensions = new Map();
  const rootPath = path.resolve(root);
  for (const [id, atlas] of atlasEntries) {
    const report = { id, file: atlas?.file };
    atlasReports.push(report);
    if (!atlas || typeof atlas !== "object" || Array.isArray(atlas)) {
      errors.push(`Atlas ${id}: entry must be an object.`);
      continue;
    }
    for (const key of ["width", "height", "columns", "rows"]) {
      if (!Number.isSafeInteger(atlas[key]) || atlas[key] <= 0) errors.push(`Atlas ${id}: ${key} must be a positive integer.`);
    }
    if (typeof atlas.file !== "string" || !atlas.file || path.isAbsolute(atlas.file)) {
      errors.push(`Atlas ${id}: file must be a relative PNG path.`);
      continue;
    }
    const filename = path.resolve(rootPath, atlas.file);
    const relative = path.relative(rootPath, filename);
    if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      errors.push(`Atlas ${id}: file must stay within the asset directory.`);
      continue;
    }
    try {
      const info = await stat(filename);
      if (!info.isFile() || info.size > MAX_PNG_BYTES) throw new Error("not a regular PNG file within the size limit");
      const png = inspectPng(await readFile(filename));
      Object.assign(report, png);
      dimensions.set(id, png);
      if (png.width !== atlas.width || png.height !== atlas.height) {
        errors.push(`Atlas ${id}: PNG dimensions ${png.width}x${png.height} differ from manifest ${atlas.width}x${atlas.height}.`);
      }
      if (png.bitDepth !== 8) errors.push(`Atlas ${id}: PNG bit depth must be 8, got ${png.bitDepth}.`);
      if (!png.hasAlpha) warnings.push(`Atlas ${id}: PNG has no alpha channel or transparency metadata.`);
      if (png.interlaced) warnings.push(`Atlas ${id}: interlaced PNG; transparency pixel counts were not decoded.`);
      if (png.transparentPixels === 0) warnings.push(`Atlas ${id}: no fully transparent pixels; check for a baked-in background or checkerboard (opaque floor art may be intentional).`);
    } catch (error) {
      errors.push(`Atlas ${id}: ${error.code === "ENOENT" ? `missing file ${atlas.file}` : error.message}.`);
    }
  }
  if (!Array.isArray(manifest.sprites) || !manifest.sprites.length) errors.push("Manifest sprites must be a nonempty array.");
  const ids = new Set();
  for (const [index, sprite] of (Array.isArray(manifest.sprites) ? manifest.sprites : []).entries()) {
    const name = sprite?.id || `#${index}`;
    if (!sprite || typeof sprite !== "object" || Array.isArray(sprite)) {
      errors.push(`Sprite ${name}: entry must be an object.`);
      continue;
    }
    if (typeof sprite.id !== "string" || !sprite.id.trim()) errors.push(`Sprite ${name}: id is required.`);
    else if (ids.has(sprite.id)) errors.push(`Sprite ${name}: duplicate id.`);
    else ids.add(sprite.id);
    if (typeof sprite.label !== "string" || !sprite.label.trim()) errors.push(`Sprite ${name}: label is required.`);
    if (!atlasEntries.some(([id]) => id === sprite.atlas)) errors.push(`Sprite ${name}: unknown atlas ${sprite.atlas}.`);
    const frame = sprite.frame;
    if (!frame || !["x", "y", "w", "h"].every((key) => Number.isSafeInteger(frame[key]))
      || frame.x < 0 || frame.y < 0 || frame.w <= 0 || frame.h <= 0) {
      errors.push(`Sprite ${name}: frame needs nonnegative integer x/y and positive integer w/h.`);
      continue;
    }
    const size = dimensions.get(sprite.atlas) || atlasEntries.find(([id]) => id === sprite.atlas)?.[1];
    if (size && (frame.x > size.width - frame.w || frame.y > size.height - frame.h)) {
      errors.push(`Sprite ${name}: frame is outside atlas bounds.`);
    }
  }
  return result();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const root = path.resolve(process.argv[2] || DEFAULT_ROOT);
    const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"));
    const result = await validateFactoryAssets(manifest, root);
    console.log(JSON.stringify(result, null, 2));
    if (!result.valid) process.exitCode = 1;
  } catch (error) {
    console.error(`Factory asset validation failed: ${error.message}`);
    process.exitCode = 1;
  }
}
