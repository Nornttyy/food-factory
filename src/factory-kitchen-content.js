export const DISHES = {
  butter: { label: '黄油吐司', parts: ['toast'], price: 8, day: 1, recipe: '煎面包 → 装盘' },
  berry: { label: '草莓吐司', parts: ['toast', 'fruit'], price: 12, day: 1, recipe: '煎面包 ＋ 切草莓' },
  fruit: { label: '双份果盘', parts: ['fruit', 'fruit'], price: 10, day: 1, recipe: '切草莓 × 2' },
  egg: { label: '双面煎蛋', parts: ['egg'], price: 10, day: 2, recipe: '煎 3 秒 → 翻面 → 再煎 3 秒' },
  eggtoast: { label: '煎蛋吐司', parts: ['toast', 'egg'], price: 15, day: 2, recipe: '煎面包 ＋ 双面煎蛋' },
  juice: { label: '鲜橙汁', parts: ['juice'], price: 9, day: 2, recipe: '按住倒汁 · 绿色刻度松手' },
  sandwich: { label: '鸡蛋三明治', parts: ['slice', 'egg', 'tomato', 'lettuce', 'slice'], ordered: true, price: 19, day: 3, sprite: 'k_sandwich', recipe: '面包 → 蛋 → 番茄 → 生菜 → 面包' },
  shake: { label: '草莓奶昔', parts: ['shake'], price: 13, day: 3, recipe: '倒到刻度 → 左右摇匀' },
  burger: { label: '手作汉堡', parts: ['bun_base', 'lettuce', 'patty', 'tomato', 'bun_top'], ordered: true, price: 20, day: 4, sprite: 'k_burger', recipe: '底胚 → 生菜 → 肉饼 → 番茄 → 顶胚' },
};
export const PARTS = {
  toast: { label: '煎面包', sprite: 'bread', day: 1 }, fruit: { label: '切草莓', sprite: 'k_berry_cut', day: 1 },
  egg: { label: '煎蛋', sprite: 'k_egg_cooked', day: 2 }, patty: { label: '肉饼', sprite: 'k_patty_cooked', day: 4 },
  tomato: { label: '番茄片', sprite: 'k_tomato_cut', day: 3 }, slice: { label: '方包', sprite: 'k_bread_slice', day: 3 },
  lettuce: { label: '生菜', sprite: 'k_lettuce', day: 3 }, bun_base: { label: '底胚', sprite: 'k_bun_base', day: 4 },
  bun_top: { label: '顶胚', sprite: 'k_bun_top', day: 4 }, juice: { label: '橙汁', sprite: 'k_juice', day: 2 },
  shake: { label: '奶昔', sprite: 'k_shake', day: 3 },
};
export const PANTRY = ['slice', 'lettuce', 'bun_base', 'bun_top'];
export const DECOR = {
  pan_cream: { category: 'pan', label: '奶油煎锅', sprite: 'k_pan_cream', price: 0 },
  pan_sage: { category: 'pan', label: '鼠尾草煎锅', sprite: 'k_pan_sage', price: 80 },
  pan_peach: { category: 'pan', label: '蜜桃煎锅', sprite: 'k_pan_peach', price: 90 },
  plate_cream: { category: 'plate', label: '奶油餐盘', sprite: 'k_plate_cream', price: 0 },
  plate_sage: { category: 'plate', label: '鼠尾草餐盘', sprite: 'k_plate_sage', price: 40 },
  plate_peach: { category: 'plate', label: '蜜桃餐盘', sprite: 'k_plate_peach', price: 55 },
  cloth_cream: { category: 'cloth', label: '奶油格桌布', sprite: 'k_cloth_cream', price: 0 },
  cloth_sage: { category: 'cloth', label: '鼠尾草桌布', sprite: 'k_cloth_sage', price: 60 },
  cloth_peach: { category: 'cloth', label: '蜜桃格桌布', sprite: 'k_cloth_peach', price: 65 },
  none: { category: 'ornament', label: '不放摆件', sprite: 'k_plate_cream', price: 0 },
  herb: { category: 'ornament', label: '小小香草盆', sprite: 'k_herb', price: 45 },
  jar: { category: 'ornament', label: '饼干储物罐', sprite: 'k_cookie_jar', price: 70 },
};
export function defaultDecor() { return { owned: ['pan_cream', 'plate_cream', 'cloth_cream', 'none'], equipped: { pan: 'pan_cream', plate: 'plate_cream', cloth: 'cloth_cream', ornament: 'none' } }; }
export const dishMatches = (parts, dish) => parts.length === dish.parts.length && (dish.ordered ? parts.join(',') === dish.parts.join(',') : [...parts].sort().join(',') === [...dish.parts].sort().join(','));
export function fitsRecipe(parts, dish) {
  return dish.ordered ? parts.every((part, i) => dish.parts[i] === part) : parts.every(part => parts.filter(p => p === part).length <= dish.parts.filter(p => p === part).length);
}
