import { FactoryGame } from './factory-core.js?v=0.11.0';
import { canLink } from './factory-links.js?v=0.11.0';

export const TUTORIAL_KEY = 'food-factory-tutorial-v1';
export const LESSONS = [
  { title: '选一段传送带', copy: '在下方「运输」里，点传送带。', target: 'belt' },
  { title: '补上发光的空格', copy: '点烤箱右边的空格，箭头朝右。', cell: { x: 6, y: 2 } },
  { title: '第一份面包出炉', copy: '点 2× 加快生产，面包进出货站就能赚钱。', cell: { x: 8, y: 2 }, target: 'speed' },
  { title: '让烤箱更快一点', copy: '点发光的烤箱，再点「升级」。', cell: { x: 5, y: 2 }, target: 'upgrade-building' },
  { title: '领走第一笔订单奖励', copy: '出货满 4 份，点右上角「订单」领取。', target: 'orders-toggle' },
  { title: '学会啦，正式开工！', copy: '接传送带 → 出货 → 升级 → 领订单。去试试新配方吧。' },
];
export function createPractice() {
  const game = new FactoryGame();
  game.remove(game.at(6, 2).id); // Reuses one real starter belt; no extra gifts.
  return game;
}
export function nextLesson(step, game, tool) {
  if (step === 0 && tool === 'belt') return 1;
  if (step === 1) {
    const belt = game.at(6, 2);
    if (belt?.type === 'belt' && canLink(game.at(5, 2), belt) && canLink(belt, game.at(7, 2))) return 2;
  }
  if (step === 2 && game.state.totalSold >= 1) return 3;
  if (step === 3 && game.at(5, 2)?.level >= 2) return 4;
  if (step === 4 && game.state.orderIndex >= 1) return 5;
  return step;
}
