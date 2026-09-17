import { drawCat } from './factory-cat-rig.js?v=0.10.0';
import { cookSeconds, customerY, counterUsed, COUNTER_CAPACITY } from './factory-shop.js?v=0.10.0';
const CELL = 72;
function box(ctx, x, y, w, h, color, radius = 12) {
  ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(x, y, w, h, radius); ctx.fill();
}
function label(ctx, text, x, y, size = 12, color = '#927355') {
  ctx.fillStyle = color; ctx.font = `600 ${size}px system-ui`; ctx.textAlign = 'center'; ctx.fillText(text, x, y);
}
export function drawShopScene(renderer, game, ui) {
  const { ctx, assets, transform: t, canvas } = renderer, s = game.state.shop, time = game.state.time;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#f7eed8'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(t.dpr * t.scale, 0, 0, t.dpr * t.scale, t.x * t.dpr, t.y * t.dpr);
  box(ctx, 32, 28, 635, 393, '#d9c59f', 25); box(ctx, 36, 24, 627, 388, '#fff5df', 24);
  for (let y = 1; y < 6; y++) for (let x = 1; x < 9; x++) box(ctx, x * 72 - 22, y * 60 + 22, 70, 58, (x + y) % 2 ? '#f7e9ce' : '#fbeed6', 3);
  box(ctx, 46, 33, 606, 48, '#edd5ad');
  for (let n = 0; n < 12; n++) box(ctx, 46 + n * 50.5, 33, 49, 43, n % 2 ? '#f8e4c5' : '#e7b69a', 7);
  box(ctx, 258, 44, 176, 32, '#fff9ec', 12); label(ctx, '猫咪的小店', 346, 66, 18, '#816246');
  // Built-in furniture cannot be demolished; zero coins always has an earning path.
  box(ctx, 83, 127, 176, 52, '#d7af87'); box(ctx, 77, 117, 188, 35, '#f3d9b0');
  assets.draw(ctx, 'dough', 100, 107, 45, 39); assets.draw(ctx, 'bread', 191, 104, 45, 39);
  label(ctx, '免费手工作台', 169, 104, 12);
  box(ctx, 292, 127, 144, 52, '#b1c19b'); box(ctx, 285, 117, 158, 35, '#dce5c8');
  label(ctx, `取餐架 ${counterUsed(s)}/${COUNTER_CAPACITY}`, 364, 104, 12);
  const stock = Object.entries(s.counter).filter(([, n]) => n > 0);
  stock.slice(0, 8).forEach(([item, n], i) => {
    const x = 294 + i % 4 * 35, y = 119 + Math.floor(i / 4) * 24;
    assets.draw(ctx, item, x, y, 28, 25); label(ctx, String(n), x + 25, y + 20, 9);
  });
  ctx.strokeStyle = '#d6b695'; ctx.lineWidth = 2; ctx.setLineDash([5, 7]); ctx.beginPath(); ctx.moveTo(506, 112); ctx.lineTo(506, 391); ctx.stroke(); ctx.setLineDash([]);
  label(ctx, '送餐区', 565, 103, 12);
  const actors = [
    { ...s.player, role: 'player', name: '我' },
    ...Object.entries(s.staff).filter(([, a]) => a).map(([role, a]) => ({ ...a, role, name: role === 'cook' ? '后厨' : '跑堂' })),
    ...s.customers.filter(c => !c.cooldown).map(c => ({ x: 7.85, y: customerY(c.slot), role: 'customer', facing: -1, name: '', customer: c })),
  ].sort((a, b) => a.y - b.y);
  for (const a of actors) {
    drawCat(ctx, assets, a.x * CELL, a.y * CELL, a, time + (a.customer?.slot || 0) * .6, { role: a.role, reduced: ui.reducedMotion, scale: a.role === 'player' ? .84 : .76 });
    if (a.name) { box(ctx, a.x * CELL - 21, a.y * CELL + 10, 42, 17, a.role === 'player' ? '#edcda8' : '#e2e8d5', 8); label(ctx, a.name, a.x * CELL, a.y * CELL + 23, 10); }
    if (a.task?.kind === 'cook' && a.work > 0) {
      box(ctx, a.x * CELL - 21, a.y * CELL - 88, 42, 5, '#dcc7a2', 3);
      box(ctx, a.x * CELL - 21, a.y * CELL - 88, Math.max(2, a.work / cookSeconds(a.task.item, a.role) * 42), 5, '#93aa73', 3);
    }
  }
  for (const c of s.customers) {
    const y = customerY(c.slot) * CELL;
    if (c.cooldown) { label(ctx, '谢谢喵 ♡', 563, y - 30, 12, '#8fa171'); continue; }
    box(ctx, 608, y - 65, 43, 43, '#dec6a3', 12); box(ctx, 607, y - 68, 43, 42, '#fffdf2', 12);
    assets.draw(ctx, c.item, 612, y - 65, 32, 31);
    label(ctx, `+${game.salePrice(c.item)}`, 629, y - 15, 10, '#82975f');
  }
  if (s.player.task?.kind === 'walk') {
    const p = s.player.task; ctx.strokeStyle = '#b89671'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(p.x * CELL, p.y * CELL, 10, 4, 0, 0, Math.PI * 2); ctx.stroke();
  }
  for (const e of game.events) if (e.kind === 'sale') {
    const age = game.state.time - e.time; ctx.save(); ctx.globalAlpha = Math.max(0, 1 - age / 1.5); label(ctx, `+${e.value}`, e.x * CELL, e.y * CELL - age * 22, 17, '#7f995a'); ctx.restore();
  }
}
