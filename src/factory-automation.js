import { FactoryGame, AREAS, BUILDINGS, makeEntity } from './factory-core.js?v=0.24.0';
import { CafeFactoryGame, COMPACT_AREAS, STAFF_COSTS } from './factory-service.js?v=0.24.0';

const LEGACY_STAFF_COSTS = [120, 240, 400];
const validArea = s => Array.isArray(s.workshopArea) && s.workshopArea.length === 2 && s.workshopArea.every((n, i) => Number.isInteger(n) && n >= COMPACT_AREAS[s.expansion][i] && n <= AREAS[s.expansion][i]) && s.buildings.every(b => b.x < s.workshopArea[0] && b.y < s.workshopArea[1]);

export function createPackingTrial() {
  const game = new AutomaticFactoryGame({ starter: false }), s = game.state;
  s.packingTrial = { version: 1, goal: 0 }; s.orderIndex = 2;
  s.expansion = 1; s.workshopArea = [14, 8]; s.coins = 620;
  const layout = [
    ['flour_hopper', 1, 1, 0], ['dough_mixer', 2, 1, 0], ['bread_oven', 3, 1, 0], ['belt', 4, 1, 0], ['belt', 5, 1, 1], ['belt', 5, 2, 1],
    ['fruit_hopper', 1, 5, 0], ['fruit_washer', 2, 5, 0], ['juice_press', 3, 5, 0], ['belt', 4, 5, 0], ['belt', 5, 5, 3], ['belt', 5, 4, 3],
    ['belt', 6, 3, 0], ['depot', 7, 3, 0],
  ];
  for (const [type, x, y, dir] of layout) s.buildings.push(makeEntity(type, x, y, dir, s.nextId++, BUILDINGS[type].cost));
  return game;
}

// Live automatic factory. Cafe code remains available only to validate and
// migrate older saves; customer/staff simulation is never run by this class.
export class AutomaticFactoryGame extends FactoryGame {
  constructor(options) {
    super(options);
    this.state.automationVersion = 1;
    this.state.workshopArea = [...COMPACT_AREAS[0]];
  }
  get area() { return this.state.workshopArea || COMPACT_AREAS[this.state.expansion]; }
  get worldArea() { return this.area; }
  get nextArea() {
    const stage = this.state.expansion, next = COMPACT_AREAS[stage + 1];
    return next?.map((n, i) => Math.min(AREAS[stage + 1][i], Math.max(n, this.area[i] + n - COMPACT_AREAS[stage][i]))) || null;
  }
  expand() {
    const next = this.nextArea, result = super.expand();
    if (result.ok) this.state.workshopArea = next;
    return result;
  }
  restore(raw) {
    let original;
    try { original = JSON.parse(raw); } catch { return false; }
    if (!original || typeof original !== 'object') return false;
    const native = original.automationVersion !== undefined;
    if (native && (original.automationVersion !== 1 || original.service !== undefined || original.shop !== undefined)) return false;
    const cafe = original.service !== undefined;
    const candidate = cafe ? new CafeFactoryGame({ starter: false }) : new FactoryGame({ starter: false });
    if (!candidate.restore(raw)) return false;
    const s = candidate.state;
    if (native) {
      if (!validArea(s) || s.buildings.some(b => b.goods !== undefined)) return false;
    } else if (cafe) {
      // Historical saves never recorded actual hiring payments. Use the price
      // schedule belonging to the original save version, once, not a new sale.
      const prices = original.service.version < 3 ? LEGACY_STAFF_COSTS : STAFF_COSTS;
      let credit = prices.slice(0, s.service.workers.length).reduce((sum, n) => sum + n, 0);
      for (const b of s.buildings) {
        for (const item of b.goods || []) credit += candidate.salePrice(item);
        delete b.goods;
        if (b.type === 'depot') { b.mode = 'sell'; b.blocked = false; }
      }
      // Pickup jobs still refer to food on a shelf, so only carrying jobs add
      // another meal. Pending depot intake and both conveyor slots stay intact.
      for (const w of s.service.workers) if (w.job?.stage === 'deliver') credit += candidate.salePrice(w.job.item);
      s.coins += credit;
      if (!Number.isSafeInteger(s.coins) || s.coins > 1e12) return false;
      delete s.service;
    } else {
      if (s.buildings.some(b => b.goods !== undefined)) return false;
      s.workshopArea = s.expansion > 0 ? [...AREAS[s.expansion]] : COMPACT_AREAS[0].map((n, i) => Math.max(n, ...s.buildings.map(b => (i ? b.y : b.x) + 1)));
    }
    s.automationVersion = 1;
    this.state = s; this.accumulator = 0; this.events = [];
    return true;
  }
}
