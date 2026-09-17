export const RESEARCH = {
  production: { title: '高效加工', icon: 'dough_mixer', detail: '原料与加工速度 +15% / 级' },
  transport: { title: '轻快运输', icon: 'belt_straight', detail: '每格运输时间 -0.1 秒 / 级' },
  value: { title: '精品包装', icon: 'pastry_box', detail: '成品售价 +10% / 级' },
};
export function freshCareer() { return { points: 0, completed: 0, research: { production: 0, transport: 0, value: 0 }, contract: null }; }
const CONTRACTS = [
  [
    ['街角早餐', '轻松热身', { bread: 6 }, 60, 120],
    ['早高峰', '考验产能', { bread: 18 }, 60, 300],
    ['团购专线', '适合多线', { bread: 36 }, 90, 500],
  ],
  [
    ['甜蜜下午茶', '甜点专线', { donut_strawberry: 6 }, 90, 210],
    ['双拼餐盒', '分流生产', { bread: 12, donut_plain: 10 }, 100, 420],
    ['派对备餐', '双线协作', { bread: 16, donut_strawberry: 14 }, 110, 620],
  ],
  [
    ['果园来信', '果汁专线', { orange_juice: 8 }, 70, 240],
    ['烘焙集市', '双线协作', { bread: 12, donut_strawberry: 8 }, 95, 450],
    ['野餐大作战', '三线协作', { bread: 14, donut_strawberry: 12, orange_juice: 12 }, 110, 850],
  ],
];
export function contractFor(tier, round, slot, catalog = 1) {
  const [title, tag, wants, duration, reward] = CONTRACTS[tier][slot];
  const growth = Math.min(10, Math.floor(round / 3));
  return { tier, round, slot, title, tag, wants: Object.fromEntries(Object.entries(wants).map(([item, n]) => [item, Math.min(80, Math.ceil(n * (1 + growth * .12)))])), duration: duration * (catalog === 2 ? 2 : 1), reward: Math.round((reward + growth * 60) * (catalog === 2 ? .25 : 1)), points: slot + 1 };
}
export function contractComplete(contract, catalog = 1) {
  const def = contractFor(contract.tier, contract.round, contract.slot, catalog);
  return Object.entries(def.wants).every(([item, count]) => (contract.progress[item] || 0) >= count);
}
export function validCareer(career, state) {
  const integer = (n, max = 1e12) => Number.isSafeInteger(n) && n >= 0 && n <= max;
  if (!career || !integer(career.points) || !integer(career.completed, 100000) || !career.research || Object.keys(career.research).length !== 3 || !Object.keys(RESEARCH).every(key => integer(career.research[key], 3))) return false;
  if (career.catalog !== undefined && ![1, 2].includes(career.catalog)) return false;
  const c = career.contract;
  if (c === null) return true;
  const fields = ['tier', 'round', 'slot', 'status', 'startedAt', 'deadline', 'progress'];
  if (!c || Object.keys(c).length !== fields.length || Object.keys(c).some(key => !fields.includes(key))) return false;
  if (!c || !integer(c.tier, Math.min(2, state.orderIndex)) || !integer(c.slot, 2) || c.round !== career.completed || !['active', 'ready', 'expired'].includes(c.status) || !Number.isFinite(c.startedAt) || c.startedAt < 0 || c.startedAt > state.time || !Number.isFinite(c.deadline)) return false;
  const def = contractFor(c.tier, c.round, c.slot, career.catalog || 1);
  if (Math.abs(c.deadline - c.startedAt - def.duration) > 1e-6 || !c.progress || Array.isArray(c.progress) || Object.entries(c.progress).some(([item, n]) => !def.wants[item] || !integer(n, def.wants[item]))) return false;
  const complete = contractComplete(c, career.catalog || 1);
  return c.status === 'ready' ? complete : !complete && (c.status === 'active' ? state.time < c.deadline : state.time >= c.deadline);
}
