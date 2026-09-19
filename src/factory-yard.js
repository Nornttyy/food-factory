import { CELL } from './factory-feel.js?v=0.21.0';

// Map cells, never viewport pixels. Expansion moves the annex outward without
// taking land or buildings away from an existing save.
// Legacy bounds are retained only for validating pre-compact saves.
export const worldArea = (area, legacy = false) => [area[0] + (legacy ? 7 : 5), Math.max(legacy ? 11 : 9, area[1] + (legacy ? 2 : 1))];
export function yardLayout(area, legacy = false) {
  const x = area[0];
  return {
    x, y: 0, width: legacy ? 7 : 5, height: worldArea(area, legacy)[1],
    spots: [2.5, 4.5, 6.5].map(y => ({ x: x + (legacy ? 5.5 : 3.5), y, size: 1.45 })),
    targets: [2.5, 4.5, 6.5].map(y => ({ x: x + (legacy ? 4.5 : 2.5), y })),
    homes: legacy ? [1.5, 2.5, 3.5].map(dx => ({ x: x + dx, y: 8.5 })) : Array.from({ length: 6 }, (_, i) => ({ x: x + .5 + i % 2, y: 5.5 + Math.floor(i / 2) })),
    hire: { x: x + (legacy ? 4.8 : 3), y: legacy ? 8.7 : 7.7, width: 2.6, height: .8 },
  };
}
export function serviceHit(point, area) {
  const yard = yardLayout(area);
  const slot = yard.spots.findIndex(p => Math.abs(point.x - p.x) <= .85 && point.y >= p.y - 1.55 && point.y <= p.y + .35);
  if (slot >= 0) return { kind: 'customer', slot };
  const h = yard.hire;
  if (Math.abs(point.x - h.x) <= h.width / 2 && Math.abs(point.y - h.y) <= h.height / 2) return { kind: 'hire' };
  return null;
}

// Four-direction walking on free cells and the public lane outside the factory.
// Machines AND conveyors are obstacles. A sealed shelf cannot be auto-served.
export function findPath(area, buildings, from, goals, legacy = false) {
  const [width, height] = worldArea(area, legacy), blocked = buildings instanceof Set ? buildings : new Set(buildings.map(b => `${b.x},${b.y}`));
  const key = p => `${Math.floor(p.x)},${Math.floor(p.y)}`;
  const free = (x, y) => x >= 0 && y >= 0 && x < width && y < height && !blocked.has(`${x},${y}`);
  const targets = new Set(goals.filter(p => free(Math.floor(p.x), Math.floor(p.y))).map(key));
  if (!targets.size || !free(Math.floor(from.x), Math.floor(from.y))) return null;
  const start = key(from), queue = [{ x: Math.floor(from.x), y: Math.floor(from.y) }], parents = new Map([[start, null]]);
  for (let n = 0; n < queue.length; n++) {
    const p = queue[n], id = key(p);
    if (targets.has(id)) {
      const route = [];
      for (let cursor = id; cursor !== null; cursor = parents.get(cursor)) {
        const [x, y] = cursor.split(',').map(Number); route.unshift({ x: x + .5, y: y + .5 });
      }
      if (Math.hypot(route[0].x - from.x, route[0].y - from.y) < 1e-8) route.shift();
      return route;
    }
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      const x = p.x + dx, y = p.y + dy, id = `${x},${y}`;
      if (!free(x, y) || parents.has(id)) continue;
      parents.set(id, key(p)); queue.push({ x, y });
    }
  }
  return null;
}
export const shelfApproaches = shelf => [[1, 0], [0, 1], [-1, 0], [0, -1]].map(([dx, dy]) => ({ x: shelf.x + dx + .5, y: shelf.y + dy + .5 }));
export function customerPose(customer, spot, age, subTick = 0, reduced = false) {
  const entering = Math.max(0, 1 - age), leaving = customer.cooldown > 0 ? Math.max(0, 1 - (customer.cooldown - subTick) / .75) : 0;
  return { ...spot, x: spot.x + (reduced ? 0 : (entering * entering + leaving * leaving) * .55), alpha: 1 - leaving * .65 };
}
export function drawYardGround(ctx, area, assets) {
  const yard = yardLayout(area), [width, height] = worldArea(area);
  ctx.save(); ctx.scale(CELL, CELL);
  // Same cream tile substrate reaches the factory's exact cell edge. No half
  // tile moat, separate rounded island, fence or expansion line cuts the join.
  ctx.fillStyle = '#e7d4b4'; ctx.fillRect(area[0], 0, width - area[0], height); ctx.fillRect(0, area[1], area[0], height - area[1]);
  for (let y = 0; y < height; y++) for (let x = y < area[1] ? area[0] : 0; x < width; x++) {
    ctx.fillStyle = (x + y) % 2 ? '#f7e9d0' : '#fff2d9'; ctx.fillRect(x + 1 / CELL, y + 1 / CELL, 1 - 2 / CELL, 1 - 2 / CELL);
  }
  // A continuous L-shaped public walkway touches every factory row and runs
  // along its bottom, keeping the two areas connected even on a full old map.
  ctx.fillStyle = '#e6dfbf'; ctx.fillRect(area[0], 0, 1, height); ctx.fillRect(0, area[1], area[0] + 1, height - area[1]);
  ctx.strokeStyle = '#c6b89a'; ctx.lineWidth = .025;
  for (let y = 0; y < height; y++) { ctx.beginPath(); ctx.moveTo(area[0] + .08, y + .5); ctx.lineTo(area[0] + .92, y + .5); ctx.stroke(); }
  ctx.fillStyle = '#81684f'; ctx.textAlign = 'center'; ctx.font = 'bold .28px system-ui'; ctx.fillText('猫猫营业区', yard.x + 2.8, .65);
  for (const spot of yard.spots) {
    ctx.fillStyle = '#d5dfbb'; ctx.beginPath(); ctx.ellipse(spot.x, spot.y + .05, .63, .25, 0, 0, Math.PI * 2); ctx.fill();
    assets.draw(ctx, 'serving_plate', spot.x - 1.45, spot.y - .05, .62, .28);
  }
  ctx.font = '.19px system-ui'; ctx.fillStyle = '#887259'; ctx.fillText('员工招募处', yard.hire.x, yard.hire.y + .8);
  ctx.restore();
}
