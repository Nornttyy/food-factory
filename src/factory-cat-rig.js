// Local joint transforms, evaluated parent-first. Bitmap parts are independent
// attachments; elbows, knees, face and tail are never baked into a whole sprite.
export const CAT_BONES = [
  ['body', null, 0, -30], ['tail', 'body', 14, 7],
  ['thigh_l', 'body', -8, 12], ['shin_l', 'thigh_l', 0, 10],
  ['thigh_r', 'body', 8, 12], ['shin_r', 'thigh_r', 0, 10],
  ['upper_l', 'body', -15, -9], ['fore_l', 'upper_l', 0, 11],
  ['upper_r', 'body', 15, -9], ['fore_r', 'upper_r', 0, 11],
  ['head', 'body', 0, -24], ['hat', 'head', 0, -22], ['face', 'head', 0, 5],
];
export function catPose(time, mode = 'idle', reduced = false) {
  const phase = reduced ? 0 : time * (mode === 'cook' ? 9 : 10), gait = Math.sin(phase), moving = mode === 'walk' || mode === 'serve' || mode === 'carry-walk';
  const carry = ['carry', 'carry-walk', 'serve'].includes(mode), cook = mode === 'cook';
  return { body: moving ? gait * .045 : 0, tail: reduced ? .2 : .2 + Math.sin(time * 3) * .2,
    thigh_l: moving ? gait * .48 : -.06, thigh_r: moving ? -gait * .48 : .06,
    shin_l: moving ? Math.max(0, -gait) * .55 : .06, shin_r: moving ? Math.max(0, gait) * .55 : -.06,
    upper_l: carry ? -.85 : cook ? -.45 + gait * .25 : moving ? -gait * .38 : -.12,
    upper_r: carry ? .85 : cook ? .45 - gait * .25 : moving ? gait * .38 : .12,
    fore_l: carry ? -1.1 : cook ? -.85 + gait * .3 : -.12,
    fore_r: carry ? 1.1 : cook ? .85 - gait * .3 : .12,
    head: reduced ? 0 : Math.sin(time * 2) * .035, hat: 0, face: 0,
    bob: reduced ? 0 : moving ? -Math.abs(gait) * 2.8 : cook ? gait * .8 : Math.sin(time * 2) * .6,
    squash: reduced ? 1 : 1 + Math.sin(time * (moving || cook ? 10 : 2)) * (moving ? .045 : cook ? .035 : .012),
    blink: !reduced && time % 4.7 > 4.55,
  };
}
export function resolveCatBones(pose) {
  const world = {};
  for (const [id, parent, x, y] of CAT_BONES) {
    const p = parent ? world[parent] : { x: 0, y: pose.bob || 0, angle: 0 };
    world[id] = { x: p.x + x * Math.cos(p.angle) - y * Math.sin(p.angle), y: p.y + x * Math.sin(p.angle) + y * Math.cos(p.angle), angle: p.angle + (pose[id] || 0) };
  }
  return world;
}
const ATTACHMENTS = {
  body: [-18, -17, 36, 34], head: [-26, -23, 52, 46], hat: [-18, -20, 36, 30],
  tail: [-4, -26, 20, 32], upper_l: [-6, -3, 12, 19], upper_r: [-6, -3, 12, 19],
  fore_l: [-5, -3, 11, 18], fore_r: [-6, -3, 11, 18],
  thigh_l: [-7, -3, 14, 18], thigh_r: [-7, -3, 14, 18], shin_l: [-7, -2, 14, 18], shin_r: [-7, -2, 14, 18],
};
const ORDER = ['tail', 'thigh_l', 'shin_l', 'thigh_r', 'shin_r', 'body', 'upper_l', 'fore_l', 'upper_r', 'fore_r', 'head', 'hat', 'face'];
export function drawCat(ctx, assets, x, y, actor, time, { role = 'player', reduced = false, scale = .78 } = {}) {
  const mode = actor.holding ? (actor.task?.kind === 'serve' ? 'serve' : actor.task ? 'carry-walk' : 'carry') : actor.task?.kind === 'cook' && actor.work > 0 ? 'cook' : actor.task ? 'walk' : 'idle';
  const pose = catPose(time, mode, reduced), world = resolveCatBones(pose);
  ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
  ctx.fillStyle = '#98704b22'; ctx.beginPath(); ctx.ellipse(0, 8, 22, 6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.scale(pose.squash, 1 / pose.squash);
  // Three-quarter facing is a gentle root lean, keeping eyes and apron readable.
  ctx.scale(actor.facing === -1 ? -.98 : .98, 1);
  for (const id of ORDER) {
    if (id === 'hat' && role !== 'player' && role !== 'cook') continue;
    const bone = world[id]; ctx.save(); ctx.translate(bone.x, bone.y); ctx.rotate(bone.angle);
    if (id === 'face') {
      ctx.strokeStyle = ctx.fillStyle = '#65462e'; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        if (pose.blink) { ctx.moveTo(side * 8 - 2.2, -1); ctx.lineTo(side * 8 + 2.2, -1); ctx.stroke(); }
        else { ctx.ellipse(side * 8, -2, 2.3, 3.2, 0, 0, Math.PI * 2); ctx.fill(); }
      }
      ctx.fillStyle = '#bd7964'; ctx.beginPath(); ctx.ellipse(0, 3, 2.6, 1.8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-4, 6); ctx.quadraticCurveTo(-1, 9, 0, 6); ctx.quadraticCurveTo(2, 9, 4, 6); ctx.stroke();
      ctx.fillStyle = '#e5988188'; for (const side of [-1, 1]) { ctx.beginPath(); ctx.ellipse(side * 14, 5, 4, 2, 0, 0, Math.PI * 2); ctx.fill(); }
    } else assets.draw(ctx, `cat_${id}`, ...ATTACHMENTS[id]);
    ctx.restore();
  }
  if (role === 'server' || role === 'cook') { ctx.fillStyle = role === 'server' ? '#839c75' : '#a383b0'; ctx.beginPath(); ctx.arc(0, -29, 3.5, 0, Math.PI * 2); ctx.fill(); }
  if (actor.holding) {
    const paw = world.fore_r, px = paw.x - Math.sin(paw.angle) * 10, py = paw.y + Math.cos(paw.angle) * 10;
    ctx.save(); ctx.translate(px, py); ctx.fillStyle = '#fffaf0'; ctx.beginPath(); ctx.ellipse(0, 1, 15, 4, 0, 0, Math.PI * 2); ctx.fill();
    assets.draw(ctx, actor.holding, -14, -22, 28, 25); ctx.restore();
  }
  ctx.restore();
}
