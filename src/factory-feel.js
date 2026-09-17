export const CELL = 72;
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// Pure display-only functions. Neither camera nor squash is saved in the simulation.
export function jellyPose(seconds, kind = 'tap', reduced = false) {
  if (reduced || !Number.isFinite(seconds) || seconds < 0 || seconds > .85) return { sx: 1, sy: 1, y: 0, angle: 0 };
  if (kind === 'place' && seconds < .12) {
    const p = seconds / .12;
    return { sx: .76 + .49 * p * p, sy: 1.22 - .44 * p * p, y: -23 * (1 - p) ** 2, angle: 0 };
  }
  const t = Math.max(0, seconds - (kind === 'place' ? .12 : 0));
  const strength = { tap: .27, release: .27, place: .29, produce: .25, sale: .26, upgrade: .36 }[kind] || .25;
  const squash = strength * Math.exp(-6.7 * t) * Math.cos(24 * t);
  const sx = 1 + squash;
  return { sx, sy: 1 / sx, y: Math.min(0, squash * 29), angle: kind === 'upgrade' ? Math.sin(t * 29) * .06 * Math.exp(-6 * t) : 0 };
}

export function foodPose(progress, reduced = false) {
  if (reduced) return { sx: 1, sy: 1, y: 0, angle: 0 };
  const p = clamp(progress, 0, 1);
  const hop = Math.sin(p * Math.PI);
  const sx = 1 - hop * .12 + Math.sin(p * Math.PI * 2) * .08;
  return { sx, sy: 1 / sx, y: -hop * 10, angle: Math.sin(p * Math.PI * 2) * .075 };
}

export function cameraInsets(width, height, ui = {}) {
  if (ui.focus) return { left: 22, right: 22, top: 20, bottom: 20 };
  const compact = height < 600 && width > height;
  // Opening a drawer overlays the world; it must never shrink or recenter the camera.
  return { left: compact ? 22 : 40, right: compact ? 22 : 40, top: compact ? 61 : 87, bottom: compact ? 76 : 99 };
}

export class FactoryCamera {
  constructor() { this.x = 360; this.y = 216; this.zoom = 1; this.areaKey = ''; this.view = null; this.transform = { scale: 1, x: 0, y: 0 }; }
  resize(width, height, area, ui = {}) {
    // Expansion keeps the player's working view; the world grows beyond it.
    if (!this.areaKey) this.fit(area);
    this.areaKey = area.join(',');
    const insets = cameraInsets(width, height, ui);
    this.view = { width, height, area, ui, insets };
    this.bound();
    return this.compose();
  }
  compose() {
    if (!this.view) return this.transform;
    const { width, height, area, insets: i } = this.view;
    const w = Math.max(80, width - i.left - i.right), h = Math.max(80, height - i.top - i.bottom);
    const base = Math.min(w / (Math.min(10, area[0]) * CELL), h / (Math.min(6, area[1]) * CELL));
    const scale = Math.max(.08, base * this.zoom);
    this.transform = { scale, x: i.left + w / 2 - this.x * scale, y: i.top + h / 2 - this.y * scale };
    return this.transform;
  }
  fit(area) { this.x = Math.min(10, area[0]) * CELL / 2; this.y = Math.min(6, area[1]) * CELL / 2; this.zoom = 1; this.areaKey = area.join(','); this.compose(); }
  overview() {
    if (!this.view) return;
    const { width, height, area, insets: i } = this.view;
    const w = Math.max(80, width - i.left - i.right), h = Math.max(80, height - i.top - i.bottom);
    const base = Math.min(w / (Math.min(10, area[0]) * CELL), h / (Math.min(6, area[1]) * CELL));
    this.zoom = Math.min(w / (area[0] * CELL), h / (area[1] * CELL)) / base;
    this.x = area[0] * CELL / 2; this.y = area[1] * CELL / 2; this.compose();
  }
  centerOn(x, y) { this.x = x * CELL; this.y = y * CELL; this.bound(); this.compose(); }
  zoomAt(factor, px, py) {
    if (!this.view || !Number.isFinite(factor) || factor <= 0) return;
    const old = this.transform;
    const anchorX = (px - old.x) / old.scale, anchorY = (py - old.y) / old.scale;
    this.zoom = clamp(this.zoom * factor, .18, 3.2);
    const next = this.compose();
    this.x += anchorX - (px - next.x) / next.scale;
    this.y += anchorY - (py - next.y) / next.scale;
    this.bound(); this.compose();
  }
  pan(dx, dy) { this.x -= dx / this.transform.scale; this.y -= dy / this.transform.scale; this.bound(); this.compose(); }
  bound() { const area = this.view?.area || [10, 6]; this.x = clamp(this.x, 0, area[0] * CELL); this.y = clamp(this.y, 0, area[1] * CELL); }
  ensureCell(x, y) {
    if (!this.view) return;
    const { width, height, insets: i } = this.view, t = this.transform;
    const px = (x + .5) * CELL * t.scale + t.x, py = (y + .5) * CELL * t.scale + t.y;
    const dx = px < i.left + 24 ? i.left + 24 - px : px > width - i.right - 24 ? width - i.right - 24 - px : 0;
    const dy = py < i.top + 24 ? i.top + 24 - py : py > height - i.bottom - 24 ? height - i.bottom - 24 - py : 0;
    this.pan(dx, dy);
  }
}
