import { DECOR } from './factory-kitchen-content.js?v=0.24.0';

export const SORT_SAVE_KEY = 'food-factory-sort-v1';
export const SORT_FOODS = {
  bread: { label: '面包', sprite: 'bread' }, egg: { label: '煎蛋', sprite: 'k_egg_cooked' },
  berry: { label: '草莓', sprite: 'k_berry_cut' }, juice: { label: '橙汁', sprite: 'k_juice' },
  donut: { label: '甜甜圈', sprite: 'donut_strawberry' }, cookie: { label: '饼干', sprite: 'butter_cookie' },
  sandwich: { label: '三明治', sprite: 'k_sandwich' }, shake: { label: '奶昔', sprite: 'k_shake' },
  burger: { label: '汉堡', sprite: 'k_burger' }, cake: { label: '小蛋糕', sprite: 'strawberry_cake' },
};
export const SORT_MEALS = {
  morning: { label: '阳光早餐', foods: ['bread', 'juice'], price: 6, day: 1 },
  berry: { label: '草莓小点', foods: ['bread', 'berry'], price: 7, day: 1 },
  egg: { label: '元气早餐', foods: ['egg', 'juice'], price: 7, day: 1 },
  sweet: { label: '甜甜下午茶', foods: ['donut', 'cookie', 'juice'], price: 9, day: 2 },
  picnic: { label: '野餐时光', foods: ['sandwich', 'berry', 'shake'], price: 10, day: 3 },
  lunch: { label: '饱饱午餐', foods: ['burger', 'juice', 'cookie'], price: 10, day: 4 },
  cake: { label: '蛋糕派对', foods: ['cake', 'shake', 'berry'], price: 11, day: 5 },
  sharing: { label: '双人甜点', foods: ['donut', 'donut', 'shake', 'juice'], price: 12, day: 6 },
};
const decorPrices = { plate_cream: 0, plate_sage: 65, plate_peach: 80, cloth_cream: 0, cloth_sage: 90, cloth_peach: 110, none: 0, herb: 120, jar: 160 };
export const SORT_DECOR = Object.fromEntries(Object.entries(DECOR).filter(([id]) => Object.hasOwn(decorPrices, id)).map(([id, item]) => [id, { ...item, price: decorPrices[id] }]));
const defaultDecor = () => ({ owned: ['plate_cream', 'cloth_cream', 'none'], equipped: { plate: 'plate_cream', cloth: 'cloth_cream', ornament: 'none' } });
const ok = extra => ({ ok: true, ...extra }), fail = message => ({ ok: false, message });
const int = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
const sameBag = (a, b) => a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');

// The day/wave seed fixes both menu and scattered positions: reload cannot reroll the puzzle.
export function sortingWave(day, wave) {
  const available = Object.keys(SORT_MEALS).filter(id => SORT_MEALS[id].day <= day);
  const newest = available.length - 1;
  const picks = day === 1 ? [0, 1, 2] : [newest, (day + wave) % available.length, (day + wave + 2) % available.length];
  const orders = picks.map((pick, index) => ({ id: day * 10 + wave * 3 + index, meal: available[pick], done: false }));
  const slots = Array.from({ length: 12 }, (_, i) => i);
  let seed = day * 127 + wave * 53;
  for (let i = 11; i > 0; i--) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; const j = seed % (i + 1); [slots[i], slots[j]] = [slots[j], slots[i]]; }
  const items = orders.flatMap(order => SORT_MEALS[order.meal].foods).map((food, i) => ({ id: day * 100 + wave * 20 + i, food, slot: slots[i], place: 'bench' }));
  return { orders, items };
}

export class SortingGame {
  constructor() { this.state = { version: 1, day: 1, coins: 0, totalServed: 0, decor: defaultDecor(), round: null }; }
  get round() { return this.state.round; }
  get active() { return this.round?.status === 'open' && !this.round.paused; }
  plate(index) { return this.round?.items.filter(item => item.place === index) || []; }
  start() {
    if (this.round) return fail('今天已经开门了');
    this.state.round = { wave: 1, served: 0, earnings: 0, status: 'open', paused: false, ...sortingWave(this.state.day, 1) };
    return ok();
  }
  pause(value) { if (this.round?.status === 'open') this.round.paused = Boolean(value); }
  move(id, destination) {
    if (!this.active) return fail('先回到小店');
    const item = this.round.items.find(food => food.id === id);
    if (!item || item.place === 'served') return fail('这份已经送出啦');
    if (destination !== 'bench' && !int(destination, 0, 2)) return fail('放到餐盘或桌面上');
    if (item.place === destination) return fail('它已经在这里了');
    if (destination !== 'bench' && this.plate(destination).length >= 4) return fail('盘子放满了，先拿回一份');
    item.place = destination; return ok();
  }
  returnPlate(index) {
    if (!this.active || !int(index, 0, 2) || !this.plate(index).length) return fail('先选有食物的盘子');
    this.plate(index).forEach(item => item.place = 'bench'); return ok();
  }
  matching(index) {
    const foods = this.plate(index).map(item => item.food);
    return this.round?.orders.filter(order => !order.done && sameBag(foods, SORT_MEALS[order.meal].foods)).map(order => order.id) || [];
  }
  serve(index, id) {
    if (!this.active || !int(index, 0, 2)) return fail('先选一只餐盘');
    const order = this.round.orders.find(order => order.id === id);
    if (!order || order.done) return fail('这位小猫已经吃好啦');
    if (!this.matching(index).includes(id)) return fail('套餐还没配对，食物都留着');
    this.plate(index).forEach(item => item.place = 'served'); order.done = true;
    const earned = SORT_MEALS[order.meal].price;
    this.state.coins += earned; this.state.totalServed++; this.round.earnings += earned; this.round.served++;
    if (this.round.orders.every(order => order.done)) this.round.status = this.round.wave === 1 ? 'wave' : 'done';
    return ok({ earned });
  }
  next() {
    const r = this.round;
    if (!r || !['wave', 'done'].includes(r.status)) return fail('先招待好这一桌的小猫');
    if (r.status === 'wave') {
      this.state.round = { wave: 2, served: r.served, earnings: r.earnings, status: 'open', paused: false, ...sortingWave(this.state.day, 2) };
    } else { this.state.day++; this.state.round = null; this.start(); }
    return ok();
  }
  decorate(id) {
    if (this.active || !Object.hasOwn(SORT_DECOR, id)) return fail('先到装饰架看看');
    const item = SORT_DECOR[id], decor = this.state.decor, owned = decor.owned.includes(id);
    if (!owned && this.state.coins < item.price) return fail('金币还差一点，慢慢攒');
    if (!owned) { this.state.coins -= item.price; decor.owned.push(id); }
    decor.equipped[item.category] = id; return ok({ bought: !owned });
  }
  serialize() { return JSON.stringify(this.state); }
  restore(raw) {
    try {
      const state = JSON.parse(raw);
      if (!state || state.version !== 1 || !int(state.day, 1, 100000) || !int(state.coins, 0, 1e10) || !int(state.totalServed, 0, 1e9)) return false;
      const d = state.decor;
      if (!d || !Array.isArray(d.owned) || d.owned.length > 9 || new Set(d.owned).size !== d.owned.length || d.owned.some(id => !Object.hasOwn(SORT_DECOR, id)) || !defaultDecor().owned.every(id => d.owned.includes(id))) return false;
      if (!d.equipped || Object.keys(d.equipped).length !== 3 || !['plate', 'cloth', 'ornament'].every(category => d.owned.includes(d.equipped[category]) && SORT_DECOR[d.equipped[category]].category === category)) return false;
      const r = state.round;
      if (r !== null) {
        if (!r || ![1, 2].includes(r.wave) || !['open', 'wave', 'done'].includes(r.status) || typeof r.paused !== 'boolean' || !int(r.served, 0, 6) || !int(r.earnings, 0, 72)) return false;
        const template = sortingWave(state.day, r.wave);
        if (!Array.isArray(r.orders) || r.orders.length !== 3 || r.orders.some((o, i) => !o || o.id !== template.orders[i].id || o.meal !== template.orders[i].meal || typeof o.done !== 'boolean')) return false;
        if (!Array.isArray(r.items) || r.items.length !== template.items.length || r.items.some((item, i) => !item || ['id', 'food', 'slot'].some(key => item[key] !== template.items[i][key]) || !['bench', 'served', 0, 1, 2].includes(item.place))) return false;
        if ([0, 1, 2].some(index => r.items.filter(item => item.place === index).length > 4)) return false;
        const completed = r.orders.filter(order => order.done);
        if (!sameBag(r.items.filter(item => item.place === 'served').map(item => item.food), completed.flatMap(order => SORT_MEALS[order.meal].foods))) return false;
        const previousIncome = r.wave === 2 ? sortingWave(state.day, 1).orders.reduce((sum, o) => sum + SORT_MEALS[o.meal].price, 0) : 0;
        if (r.served !== (r.wave - 1) * 3 + completed.length || r.served > state.totalServed || r.earnings !== previousIncome + completed.reduce((sum, o) => sum + SORT_MEALS[o.meal].price, 0)) return false;
        const expectedStatus = completed.length === 3 ? r.wave === 1 ? 'wave' : 'done' : 'open';
        if (r.status !== expectedStatus || (r.status !== 'open' && r.paused)) return false;
      }
      this.state = state;
      if (this.round?.status === 'open') this.round.paused = true;
      return true;
    } catch { return false; }
  }
}
