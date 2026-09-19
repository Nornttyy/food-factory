import { clamp } from './factory-feel.js?v=0.14.0';

const ease = n => { const p = clamp(n, 0, 1); return p * p * (3 - 2 * p); };
const mix = (a, b, p) => ({ x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p });
export function yardLayout(width, height) {
  const compact = height < 600, top = compact ? 65 : 106, bottom = compact ? 128 : 145;
  const span = Math.max(126, height - top - bottom), size = Math.min(width * .36, span / 3 * 1.04, 108);
  const spots = [0, 1, 2].map(i => ({ x: width * .69, y: top + span * (i + .5) / 3, size }));
  const homes = [0, 1, 2].map(i => ({ x: width * (.17 + i * .11), y: height - bottom + 26 + (i % 2) * 8 }));
  return { width, height, top, bottom, spots, homes, workerSize: Math.min(68, size * .73), counterY: height - bottom + 44 };
}

// Display-only route state. A newly assigned meal is reserved by the simulation;
// its picture is picked up at the counter after the courier returns from the last
// table. Every delivery still takes exactly the original four simulation seconds.
export class WorkerMotion {
  constructor() { this.tracks = new Map(); }
  clear() { this.tracks.clear(); }
  pose(worker, home, target, time, elapsed, duration = 4) {
    const key = worker.job?.customerId ?? null;
    let t = this.tracks.get(worker.id);
    if (!t) { t = { key: undefined, position: home, from: home, started: time, returning: false }; this.tracks.set(worker.id, t); }
    if (key !== t.key) {
      t.from = { ...t.position }; t.started = time; t.key = key;
      t.returning = Math.hypot(t.from.x - home.x, t.from.y - home.y) > 4;
    }
    let carrying = false;
    if (worker.job) {
      const p = clamp(elapsed / duration, 0, 1), turn = t.returning ? .25 : 0;
      if (p < turn) t.position = mix(t.from, home, ease(p / turn));
      else { t.position = mix(home, target, ease((p - turn) / (1 - turn))); carrying = true; }
    } else t.position = mix(t.from, home, ease((time - t.started) / 1));
    return { ...t.position, carrying, moving: worker.job ? true : time - t.started < 1 && t.returning };
  }
}

export function customerPose(customer, layout, age, subTick, reduced = false) {
  if (reduced) return { x: layout.x, y: layout.y, alpha: 1 };
  const entering = customer.cooldown === 0 ? 1 - ease(age / 1) : 0;
  const leaving = customer.cooldown > 0 ? ease((2 - customer.cooldown + subTick - 1.25) / .75) : 0;
  return { x: layout.x + (entering + leaving) * layout.size * 1.2, y: layout.y, alpha: 1 - Math.max(entering, leaving) * .8 };
}

export function drawYardGround(ctx, layout, assets) {
  const { width: w, height: h, spots, counterY } = layout;
  ctx.fillStyle = '#e4e8ce'; ctx.fillRect(0, 0, w, h);
  // Open paving, an entrance gap and table mats — no framed customer cards.
  ctx.fillStyle = '#f4e5c9'; ctx.fillRect(14, 0, w - 14, h);
  ctx.strokeStyle = '#e4d2b5'; ctx.lineWidth = 1;
  for (let y = 0; y < h; y += 48) {
    ctx.beginPath(); ctx.moveTo(14, y); ctx.lineTo(w, y); ctx.stroke();
    for (let x = 14 + (y % 96 ? 25 : 0); x < w; x += 52) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 48); ctx.stroke(); }
  }
  ctx.strokeStyle = '#b4bc96'; ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(7, counterY - 50); ctx.moveTo(7, counterY + 15); ctx.lineTo(7, h); ctx.stroke();
  for (const spot of spots) {
    ctx.fillStyle = '#e2cfad'; ctx.beginPath(); ctx.ellipse(spot.x, spot.y + spot.size * .39, spot.size * .56, spot.size * .19, 0, 0, Math.PI * 2); ctx.fill();
    assets.draw(ctx, 'serving_plate', spot.x - spot.size * .42, spot.y + spot.size * .21, spot.size * .84, spot.size * .28);
  }
  ctx.fillStyle = '#b69370'; ctx.beginPath(); ctx.roundRect(21, counterY, w - 33, 45, 8); ctx.fill();
  ctx.fillStyle = '#f9edcf'; ctx.beginPath(); ctx.roundRect(18, counterY - 5, w - 30, 33, 7); ctx.fill();
  ctx.fillStyle = '#9d8567'; ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'left'; ctx.fillText('取餐台', 27, counterY + 42);
  ctx.fillStyle = '#899d75'; ctx.font = 'bold 12px system-ui'; ctx.fillText('猫猫营业区', 27, layout.top - 21);
}
