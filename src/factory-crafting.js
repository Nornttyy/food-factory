// Hands-on recipe development. It advances only while its workbench is open,
// independently of the factory speed. No direct coins or order credit are paid.
export const CRAFT_ITEM = 'donut_strawberry';
export const CRAFT_CAPACITY = 3;
export const CRAFT_MACHINES = ['ring_former', 'donut_fryer', 'icing_machine'];
export const FRY_WINDOW = { min: 4, ideal: 7, max: 10, burn: 12 };
export const GLAZE_SEGMENTS = 12;
const STAGES = ['shape', 'fry_ready', 'frying', 'glaze', 'done', 'failed'];
export const freshCrafting = () => ({ version: 1, made: 0, best: 0, queue: [], batch: null });
export const craftUnlocks = (craft, type) => Boolean(craft?.made > 0 && CRAFT_MACHINES.includes(type));
export const glazeCount = mask => (mask >>> 0).toString(2).replaceAll('0', '').length;
export const craftScore = b => Math.round(b.shape * .2 + Math.max(0, 100 - Math.abs(b.heat - FRY_WINDOW.ideal) * 12) * .5 + glazeCount(b.mask) / GLAZE_SEGMENTS * 30);
export function startCraft(c) {
  if (c.queue.length >= CRAFT_CAPACITY) return { ok: false, message: '托盘满了，先把甜甜圈放入产线' };
  if (c.batch && !['done', 'failed'].includes(c.batch.stage)) return { ok: false, message: '先完成这一份甜甜圈' };
  c.batch = { stage: 'shape', shape: 0, heat: 0, mask: 0 }; return { ok: true };
}
export function stampCraft(c, x, y) {
  const b = c.batch, distance = Math.hypot(x, y);
  if (b?.stage !== 'shape' || !Number.isFinite(x) || !Number.isFinite(y) || distance > .45) return { ok: false, message: '对准面团中央，再压一下' };
  b.shape = Math.round(100 - distance * 70); b.stage = 'fry_ready'; return { ok: true };
}
export function startFrying(c) {
  if (!['fry_ready', 'failed'].includes(c.batch?.stage)) return { ok: false };
  c.batch.heat = 0; c.batch.stage = 'frying'; return { ok: true };
}
export function advanceCraft(c, dt) {
  if (c.batch?.stage !== 'frying' || !Number.isFinite(dt) || dt <= 0) return false;
  c.batch.heat = Math.min(FRY_WINDOW.burn, Math.round((c.batch.heat + Math.min(dt, .1)) * 1e6) / 1e6);
  if (c.batch.heat >= FRY_WINDOW.burn) c.batch.stage = 'failed';
  return true;
}
export function liftCraft(c) {
  const b = c.batch;
  if (b?.stage !== 'frying') return { ok: false };
  b.stage = b.heat >= FRY_WINDOW.min && b.heat <= FRY_WINDOW.max ? 'glaze' : 'failed';
  return { ok: true, cooked: b.stage === 'glaze' };
}
export function paintCraft(c, x, y) {
  const b = c.batch, radius = Math.hypot(x, y);
  if (b?.stage !== 'glaze' || !Number.isFinite(x) || !Number.isFinite(y) || radius < .35 || radius > 1.15) return false;
  const angle = (Math.atan2(y, x) + Math.PI * 2) % (Math.PI * 2);
  const bit = 1 << Math.floor(angle / (Math.PI * 2) * GLAZE_SEGMENTS), before = b.mask;
  b.mask |= bit; return b.mask !== before;
}
export function finishCraft(c) {
  const b = c.batch;
  if (b?.stage !== 'glaze' || glazeCount(b.mask) < 9) return { ok: false, message: '再涂一点糖霜，覆盖至少四分之三' };
  if (c.queue.length >= CRAFT_CAPACITY) return { ok: false, message: '先把托盘里的成品放入产线' };
  const score = craftScore(b), first = c.made === 0;
  c.made++; c.best = Math.max(c.best, score); c.queue.push({ id: c.made, score }); b.stage = 'done';
  return { ok: true, first, score };
}
export function validCrafting(c) {
  const integer = (n, min, max) => Number.isSafeInteger(n) && n >= min && n <= max;
  const record = (o, keys) => o && typeof o === 'object' && !Array.isArray(o) && Object.keys(o).length === keys.length && keys.every(k => Object.hasOwn(o, k));
  if (!record(c, ['version', 'made', 'best', 'queue', 'batch']) || c.version !== 1 || !integer(c.made, 0, 1e9) || !integer(c.best, c.made ? 68 : 0, c.made ? 100 : 0) || !Array.isArray(c.queue) || c.queue.length > CRAFT_CAPACITY || c.queue.length > c.made) return false;
  if (c.queue.some((q, i) => !record(q, ['id', 'score']) || !integer(q.id, 1, c.made) || !integer(q.score, 68, c.best) || (i > 0 && q.id <= c.queue[i - 1].id))) return false;
  const b = c.batch;
  if (b === null) return true;
  if (!record(b, ['stage', 'shape', 'heat', 'mask']) || !STAGES.includes(b.stage) || !integer(b.shape, 0, 100) || !Number.isFinite(b.heat) || b.heat < 0 || b.heat > FRY_WINDOW.burn || !integer(b.mask, 0, (1 << GLAZE_SEGMENTS) - 1)) return false;
  if (b.stage === 'shape') return b.shape === 0 && b.heat === 0 && b.mask === 0;
  if (b.shape < 69) return false;
  if (b.stage === 'fry_ready') return b.heat === 0 && b.mask === 0;
  if (b.stage === 'frying') return b.heat < FRY_WINDOW.burn && b.mask === 0;
  if (b.stage === 'failed') return b.mask === 0 && (b.heat < FRY_WINDOW.min || b.heat > FRY_WINDOW.max);
  if (b.heat < FRY_WINDOW.min || b.heat > FRY_WINDOW.max) return false;
  if (b.stage === 'done') return c.made > 0 && glazeCount(b.mask) >= 9 && craftScore(b) <= c.best;
  return true;
}
