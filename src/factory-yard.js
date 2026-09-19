import { CELL } from './factory-feel.js?v=0.15.1';

// Map cells, never viewport pixels. Expansion moves the annex outward without
// taking land or buildings away from an existing save.
export const worldArea = area => [area[0] + 7, Math.max(11, area[1] + 2)];
export function yardLayout(area) {
  const x = area[0];
  return {
    x: x + .5, y: .5, width: 6, height: 9.5,
    spots: [2.5, 4.5, 6.5].map(y => ({ x: x + 5.5, y, size: 1.45 })),
    targets: [2.5, 4.5, 6.5].map(y => ({ x: x + 4.5, y })),
    homes: [1.5, 2.5, 3.5].map(dx => ({ x: x + dx, y: 8.5 })),
    hire: { x: x + 4.8, y: 8.7, width: 2.6, height: .8 },
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
export function findPath(area, buildings, from, goals) {
  const [width, height] = worldArea(area), blocked = buildings instanceof Set ? buildings : new Set(buildings.map(b => `${b.x},${b.y}`));
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
  const yard = yardLayout(area), [width] = worldArea(area);
  ctx.save(); ctx.scale(CELL, CELL);
  ctx.fillStyle = '#e7d4b4'; ctx.fillRect(0, area[1], width, 1); ctx.fillRect(area[0], 0, 1, area[1]);
  ctx.fillStyle = '#f3e7cc'; ctx.beginPath(); ctx.roundRect(yard.x, yard.y, yard.width, yard.height, .3); ctx.fill();
  for (let y = 1; y < 10; y++) for (let x = 1; x < 6; x++) {
    ctx.fillStyle = (x + y) % 2 ? '#ecdcc0' : '#f8ecd6'; ctx.fillRect(area[0] + x + .04, y + .04, .92, .92);
  }
  ctx.strokeStyle = '#b2bd98'; ctx.lineWidth = .13; ctx.beginPath();
  ctx.moveTo(yard.x + .15, 1.3); ctx.lineTo(yard.x + .15, .65); ctx.lineTo(yard.x + 5.85, .65); ctx.lineTo(yard.x + 5.85, 9.7); ctx.stroke();
  ctx.fillStyle = '#81684f'; ctx.textAlign = 'center'; ctx.font = 'bold .28px system-ui'; ctx.fillText('猫猫营业区', yard.x + 3, 1.15);
  for (const spot of yard.spots) {
    ctx.fillStyle = '#d5dfbb'; ctx.beginPath(); ctx.ellipse(spot.x, spot.y + .05, .63, .25, 0, 0, Math.PI * 2); ctx.fill();
    assets.draw(ctx, 'serving_plate', spot.x - 1.45, spot.y - .05, .62, .28);
  }
  ctx.fillStyle = '#dfd5b8'; ctx.beginPath(); ctx.roundRect(yard.x + .3, 7.7, 2.8, 1.5, .2); ctx.fill();
  ctx.font = '.19px system-ui'; ctx.fillStyle = '#887259'; ctx.fillText('员工休息处', yard.x + 1.7, 9.55);
  ctx.restore();
}
