export const SALE_FOODS = ['bread', 'butter_cookie', 'donut_plain', 'donut_strawberry', 'steamed_bun', 'orange_juice', 'strawberry_cake', 'orange_icepop'];
export const BUSINESS_RANKS = ['街坊食铺', '人气作坊', '口碑工坊', '美味品牌', '招牌工坊'];
export const REPUTATION_LEVELS = [0, 3, 9, 18, 30];
export function businessLevel(reputation) { return REPUTATION_LEVELS.filter(n => reputation >= n).length - 1; }
export function warehouseCapacity(business) { return 100 + businessLevel(business.reputation) * 50; }
export function warehouseUsed(business) { return Object.values(business.warehouse).reduce((sum, n) => sum + n, 0); }
export function freshBusiness() { return { version: 1, warehouse: {}, shipped: {}, shipments: 0, reputation: 0, claimed: [] }; }
const WHOLESALE = [
  [
    ['街坊早餐', { bread: 12 }], ['饼干订阅', { butter_cookie: 12 }], ['周末茶会', { bread: 10, butter_cookie: 10 }],
  ],
  [
    ['早餐拼盘', { bread: 14, steamed_bun: 10 }], ['甜甜圈礼盒', { donut_plain: 10, donut_strawberry: 10 }],
    ['烘焙礼篮', { butter_cookie: 12, steamed_bun: 10, donut_strawberry: 8 }],
  ],
  [
    ['夏日补给', { orange_juice: 14, orange_icepop: 8 }], ['生日聚会', { strawberry_cake: 10, donut_strawberry: 10 }],
    ['美食嘉年华', Object.fromEntries(SALE_FOODS.map(item => [item, 6]))],
  ],
];
export function wholesaleFor(tier, round, slot, reputation) {
  const [title, wants] = WHOLESALE[tier][slot], factor = 1 + Math.min(5, Math.floor(round / 3)) * .2;
  return { id: `1:${tier}:${round}:${slot}`, slot, title, wants: Object.fromEntries(Object.entries(wants).map(([item, n]) => [item, Math.ceil(n * factor)])),
    multiplier: 1.15 + slot * .1 + businessLevel(reputation) * .025, reputation: slot + 1 };
}
const shippedTypes = state => SALE_FOODS.filter(item => (state.business.shipped[item] || 0) > 0).length;
export const MILESTONES = [
  { id: 'first_dispatch', title: '第一位合作伙伴', detail: '完成 1 次合作发货', target: 1, progress: s => s.business.shipments, coins: 75, points: 1 },
  { id: 'mixed_menu', title: '不止一种美味', detail: '累计向商店发货 4 种食品', target: 4, progress: shippedTypes, coins: 150, points: 2 },
  { id: 'trusted', title: '回头客越来越多', detail: '获得 10 点合作声望', target: 10, progress: s => s.business.reputation, coins: 225, points: 2 },
  { id: 'full_menu', title: '全菜单开工', detail: '8 种食品各累计发货 6 份', target: 8, progress: s => SALE_FOODS.filter(item => (s.business.shipped[item] || 0) >= 6).length, coins: 400, points: 3 },
  { id: 'factory_network', title: '流水线大家族', detail: '完成 10 次合作发货，并扩建到 34×20', target: 2, progress: s => Number(s.business.shipments >= 10) + Number(s.expansion >= 4), coins: 500, points: 3 },
  { id: 'master', title: '忙而不乱的店长', detail: '完成 8 张工坊订单、3 次急单，并向商店发货全部 8 种食品', target: 3, progress: s => Number(s.orderIndex >= 8) + Number(s.career.completed >= 3) + Number(shippedTypes(s) === 8), coins: 700, points: 4 },
];
export function validBusiness(business) {
  const integer = (n, max = 1e12) => Number.isSafeInteger(n) && n >= 0 && n <= max;
  const record = value => value && typeof value === 'object' && !Array.isArray(value) && Object.entries(value).every(([item, n]) => SALE_FOODS.includes(item) && integer(n));
  const fields = ['version', 'warehouse', 'shipped', 'shipments', 'reputation', 'claimed'];
  if (!business || Object.keys(business).length !== fields.length || Object.keys(business).some(key => !fields.includes(key)) || business.version !== 1) return false;
  if (!integer(business.shipments, 100000) || !integer(business.reputation, 300000) || business.reputation < business.shipments || business.reputation > business.shipments * 3) return false;
  if (!record(business.warehouse) || !record(business.shipped) || warehouseUsed(business) > warehouseCapacity(business)) return false;
  const totalShipped = Object.values(business.shipped).reduce((sum, n) => sum + n, 0);
  if (totalShipped < 12 * business.shipments || totalShipped > 96 * business.shipments || Object.values(business.shipped).some(n => n > 28 * business.shipments)) return false;
  return Array.isArray(business.claimed) && new Set(business.claimed).size === business.claimed.length && business.claimed.every(id => MILESTONES.some(goal => goal.id === id));
}
