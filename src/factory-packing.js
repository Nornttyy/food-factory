// Pure recipe/goal data, shared by simulation, save validation and UI.
export const PACKING_SAVE_KEY = 'food-factory-packing-v1';
export const PACK_RECIPES = {
  breakfast_box: { label: '早餐盒', machine: 'breakfast_packer', ingredients: { bread: 1, orange_juice: 1 }, value: 20 },
  tea_box: { label: '下午茶盒', machine: 'tea_packer', ingredients: { donut_plain: 2, orange_juice: 1 }, value: 34 },
};
export const PACK_GOALS = [
  { title: '第一份早餐', wants: { breakfast_box: 3 }, reward: 80, note: '在两条产线交会的空格放早餐打包台，箭头朝右。' },
  { title: '甜甜圈配果汁', wants: { tea_box: 3 }, reward: 100, note: '面团 → 成型机 → 炸锅。换线时可点旧传送带「清空物品」。' },
  { title: '两种套餐一起做', wants: { breakfast_box: 5, tea_box: 5 }, reward: 120, note: '试试分流面团和橙汁，让两种套餐都能出货。' },
];
export const PACK_FREEPLAY = { title: '套餐试营完成', wants: {}, reward: 0, note: '三项目标已完成，继续优化产线，或返回原工坊。' };
export const TRIAL_BUILDINGS = ['belt', 'splitter', 'merger', 'depot', 'flour_hopper', 'dough_mixer', 'bread_oven', 'ring_former', 'donut_fryer', 'fruit_hopper', 'fruit_washer', 'juice_press', 'breakfast_packer', 'tea_packer'];
export function validPackingTrial(value) {
  return value && !Array.isArray(value) && Object.keys(value).length === 2 && value.version === 1 && Number.isInteger(value.goal) && value.goal >= 0 && value.goal <= PACK_GOALS.length;
}
export function ingredientsReady(building, definition) {
  return Object.entries(definition.ingredients || {}).every(([item, count]) => (building.ingredients?.[item] || 0) >= count);
}
