import { FactoryGame } from './factory-core.js?v=0.10.0';

export const TUTORIAL_KEY = 'food-factory-tutorial-cat-v2';
export const LESSONS = [
  { title: '猫咪，开工啦', copy: '点下方「做一份」，猫咪会走到免费手工作台。', target: 'shop-cook' },
  { title: '等面包做好', copy: '原料免费，做好会放到取餐架。', target: 'shop-cook' },
  { title: '端起第一份面包', copy: '点「取餐」，猫咪会走过去端起来。', target: 'shop-pickup' },
  { title: '给顾客送餐', copy: '点头顶想要面包的顾客，送到手里才收钱。', target: 'shop-serve' },
  { title: '完成第一张订单', copy: '继续做饭、送餐；满 4 份后点「订单」领取小奖励。', target: 'orders-toggle' },
  { title: '学会啦，正式开店', copy: '服务 6 位顾客开放产线，12 位可招跑堂猫。' },
];
export function createPractice() {
  return new FactoryGame();
}
export function nextLesson(step, game) {
  const s = game.state.shop;
  if (step === 0 && s.player.task?.kind === 'cook') return 1;
  if (step === 1 && s.counter.bread > 0) return 2;
  if (step === 2 && s.player.holding) return 3;
  if (step === 3 && s.served >= 1) return 4;
  if (step === 4 && game.state.orderIndex >= 1) return 5;
  return step;
}
