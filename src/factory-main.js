import { BUILDINGS, ITEMS, FOOD_RECIPES, SAVE_KEY, DIRECTION_NAMES, WIDTH, HEIGHT, upgradeCost, isTransport, transportCount } from './factory-core.js?v=0.24.0';
import { AutomaticFactoryGame as FactoryGame, createPackingTrial } from './factory-automation.js?v=0.24.0';
import { PACKING_SAVE_KEY, PACK_RECIPES, PACK_GOALS, TRIAL_BUILDINGS, ingredientsReady } from './factory-packing.js?v=0.24.0';
import { CraftingView } from './factory-crafting-view.js?v=0.24.0';
import { KitchenView } from './factory-kitchen-view.js?v=0.24.0';
import { SortingView } from './factory-sorting-view.js?v=0.24.0';
import { CRAFT_ITEM, craftUnlocks } from './factory-crafting.js?v=0.24.0';
import { FactoryAssets, FactoryRenderer } from './factory-renderer.js?v=0.24.0';
import { directionBetween, nextBeltCell } from './factory-links.js?v=0.24.0';
import { RESEARCH } from './factory-career.js?v=0.24.0';
import { TUTORIAL_KEY, LESSONS, createPractice, nextLesson } from './factory-tutorial.js?v=0.24.0';
import { BUSINESS_RANKS, REPUTATION_LEVELS, businessLevel, MILESTONES, SALE_FOODS, WAREHOUSE_FOODS } from './factory-business.js?v=0.24.0';

const $ = selector => document.querySelector(selector);
let game = new FactoryGame();
let practice = null, tutorialSeen = false;
let packingSession = null, packingGame = null, protectPackingSave = false;
const allRecipes = [...FOOD_RECIPES, ...Object.entries(PACK_RECIPES).map(([item, recipe]) => [item, [recipe.machine]])];
function visibleRecipes() { return game.state.packingTrial ? allRecipes.filter(([item]) => ['bread', 'donut_plain', 'orange_juice', ...Object.keys(PACK_RECIPES)].includes(item) || game.state.crafting.made > 0 && item === CRAFT_ITEM) : allRecipes; }
try { tutorialSeen = localStorage.getItem(TUTORIAL_KEY) === 'seen'; } catch { /* Learning still works without storage. */ }
const assets = new FactoryAssets();
const canvas = $('#factory-board');
const renderer = new FactoryRenderer(canvas, assets);
const craftingView = new CraftingView({ canvas: $('#craft-canvas'), assets, getGame: () => game,
  onChange: result => { if (action(result, result?.first ? '掌握草莓甜甜圈，量产设备已解锁' : undefined)) { renderPalette(); renderRecipes(); } },
  onBack: () => leaveCraft(true), onAutomate: () => { leaveCraft(); ui.recipeItem = CRAFT_ITEM; openQuickRecipe(); },
  isPaused: () => ui.screen !== 'craft' || ui.craftPaused || document.hidden,
});
const ui = { screen: 'menu', craftPaused: false, handmadeId: null, customerArea: false, recipeOpen: false, recipeItem: 'bread', careerTab: 'contracts', businessTab: 'trade', mapOpen: false, category: 'logistics', tool: 'select', dir: 0, selected: null, hover: null, dockOpen: false, ordersOpen: false, inspectorOpen: false, focus: false, reducedMotion: false };
const kitchenView = new KitchenView({ assets, isActive: () => ui.screen === 'kitchen' && !document.hidden, bounce: bounceElement });
const sortingView = new SortingView({ assets, isActive: () => ui.screen === 'sorting' && !document.hidden, bounce: bounceElement });
const PREFERENCES_KEY = 'food-factory-preferences-v1', BACKUP_KEY = `${SAVE_KEY}-before-restart`;
let hasSave = false, hasBackup = false, restartMode = 'new', explicitMotion = false;
const motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
ui.reducedMotion = Boolean(motionQuery?.matches);
try {
  const preference = JSON.parse(localStorage.getItem(PREFERENCES_KEY));
  if (typeof preference?.reducedMotion === 'boolean') { ui.reducedMotion = preference.reducedMotion; explicitMotion = true; }
} catch { /* Defaults remain usable when browser storage is unavailable. */ }
try { hasBackup = Boolean(localStorage.getItem(BACKUP_KEY)); } catch { /* A bad preference cannot hide a valid backup. */ }
motionQuery?.addEventListener?.('change', event => { if (!explicitMotion) { ui.reducedMotion = event.matches; renderUi(true); } });
let saveWorks = true, protectOriginalSave = false, lastUi = '', lastOrder = '', lastInspector = '', dragging = false, lastCell = null, dragError = '', toastTimer;
let activePointer = null, panning = false, panPoint = null, lastPointer = null, pendingTouch = null, touchOrigin = null, lastCoins = game.state.coins;
const touchPointers = new Map();
let blockedTouchGesture = false, pinch = null;

function bounceElement(element, strong = false) {
  if (ui.reducedMotion || !element?.animate) return;
  element.getAnimations?.().forEach(animation => animation.cancel());
  element.animate([{ transform: 'scale(1.14,.79)' }, { transform: `scale(${strong ? '.87,1.2' : '.92,1.12'})`, offset: .35 }, { transform: 'scale(1.045,.96)', offset: .66 }, { transform: 'scale(1)' }], { duration: strong ? 570 : 420, easing: 'ease-out' });
}
function toast(message) {
  if (!message) return;
  $('#toast').textContent = message; $('#toast').hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').hidden = true, 2400);
}
function save() {
  sortingView.save();
  kitchenView.save();
  if (practice) { $('#save-status').textContent = '练习工坊 · 不影响存档'; return; }
  if (packingSession) {
    if (protectPackingSave) { $('#save-status').textContent = '套餐存档已保留 · 本次暂不保存'; return; }
    try { localStorage.setItem(PACKING_SAVE_KEY, game.serialize()); $('#save-status').textContent = '套餐试营 · 独立存档'; }
    catch { $('#save-status').textContent = '无法保存套餐试营 · 请勿关闭'; }
    return;
  }
  if (!hasSave) return;
  if (protectOriginalSave) { $('#save-status').textContent = '原存档已保留 · 本次暂不保存'; return; }
  try { localStorage.setItem(SAVE_KEY, game.serialize()); saveWorks = true; }
  catch { saveWorks = false; }
  $('#save-status').textContent = saveWorks ? '已保存在此浏览器' : '无法保存 · 请勿关闭';
}
try {
  const stored = localStorage.getItem(SAVE_KEY);
  if (stored && game.restore(stored)) {
    hasSave = true;
    const previous = JSON.parse(stored);
    if (previous.automationVersion === undefined) {
      try { localStorage.setItem(`${SAVE_KEY}-before-auto-dispatch`, stored); }
      catch { protectOriginalSave = true; toast('原存档已保留，本次试玩暂不保存'); }
    }
    if (previous.flowVersion === undefined) {
      try { localStorage.setItem(`${SAVE_KEY}-before-paced-flow`, stored); }
      catch { protectOriginalSave = true; toast('原存档已保留，本次试玩暂不保存'); }
    }
    if (previous.shop) {
      try { localStorage.setItem(`${SAVE_KEY}-before-classic`, stored); }
      catch { protectOriginalSave = true; toast('原存档已保留，本次试玩暂不保存'); }
    }
  }
  else if (stored) {
    try { localStorage.setItem(`${SAVE_KEY}-recovery-${Date.now()}`, stored); toast('存档无法读取，已保留副本并准备新工坊'); }
    catch { protectOriginalSave = true; toast('原存档已保留，本次试玩暂不保存'); }
  }
} catch { saveWorks = false; }
function action(result, message) {
  if (!result?.ok) { toast(result?.message); return false; }
  if (message) toast(message);
  save(); renderUi(true); return true;
}
function chooseTool(tool) { if (practice && !['select', 'belt', 'pan'].includes(tool)) return; finishDrag(); ui.tool = tool; ui.selected = null; ui.inspectorOpen = false; ui.ordersOpen = false; ui.dockOpen = false; ui.focus = false; lastCell = null; renderPalette(); renderUi(true); }
function renderPalette() {
  const palette = $('#palette'); palette.replaceChildren();
  for (const [type, def] of Object.entries(BUILDINGS)) {
    if (def.category !== ui.category) continue;
    if (game.state.packingTrial && !TRIAL_BUILDINGS.includes(type) && !craftUnlocks(game.state.crafting, type)) continue;
    const locked = !game.isUnlocked(type);
    const button = document.createElement('button'); button.className = `build-card${ui.tool === type ? ' active' : ''}${locked ? ' locked' : ''}`;
    button.dataset.building = type; button.setAttribute('aria-pressed', String(ui.tool === type));
    button.disabled = Boolean(practice && type !== 'belt');
    button.classList.toggle('tutorial-highlight', Boolean(practice?.step === 0 && type === 'belt'));
    button.setAttribute('aria-label', `${def.label}，${locked ? '完成订单解锁' : `${def.cost} 金币`}`);
    button.append(renderer.buildingIcon({ type, dir: ui.dir }));
    const text = document.createElement('span'), strong = document.createElement('strong'), small = document.createElement('small');
    strong.textContent = def.label; small.textContent = locked ? `第 ${def.unlock} 单后解锁` : game.state.stock[type] ? `免费重放 ×${game.state.stock[type]}` : `${def.cost} 金币`;
    text.append(strong, small); button.append(text);
    button.addEventListener('click', () => locked ? toast(`完成第 ${def.unlock} 单即可解锁`) : chooseTool(type));
    palette.append(button);
  }
}
function renderOrder() {
  const order = game.order, root = $('#orders'); root.replaceChildren();
  const title = document.createElement('p'); title.className = 'order-title'; title.textContent = order.title; root.append(title);
  for (const [item, count] of Object.entries(order.wants)) {
    const have = Math.min(count, game.state.orderProgress[item] || 0);
    const row = document.createElement('div'); row.className = 'order-item';
    const icon = document.createElement('div'); icon.className = 'order-icon'; icon.append(assets.icon(ITEMS[item].sprite));
    const text = document.createElement('div'); text.className = 'order-text';
    const label = document.createElement('strong'); label.textContent = ITEMS[item].label;
    const n = document.createElement('small'); n.textContent = `${have} / ${count} 已交付`;
    const track = document.createElement('div'); track.className = 'progress-track';
    const fill = document.createElement('span'); fill.style.width = `${100 * have / count}%`; track.append(fill);
    text.append(label, n, track); row.append(icon, text); root.append(row);
  }
  const reward = document.createElement('div'); reward.className = 'reward-line'; reward.innerHTML = `<span>订单奖励</span><strong>+ ${order.reward} 金币</strong>`;
  const claim = document.createElement('button'); claim.id = 'claim-order'; claim.className = 'primary-button'; claim.disabled = !game.orderReady;
  claim.textContent = game.orderReady ? '交付完成 · 领取奖励' : '等待产线出货';
  claim.addEventListener('click', () => {
    const result = game.claimOrder();
    if (result.ok) { ui.ordersOpen = false; for (const b of game.state.buildings) if (b.type === 'depot') { renderer.pulse(b.id, 'upgrade'); renderer.burst(b.x, b.y, 'upgrade'); } }
    if (action(result, game.state.packingTrial ? '套餐目标完成' : game.state.orderIndex === 1 ? '甜甜圈与奶香包解锁啦' : game.state.orderIndex === 2 ? '果汁、蛋糕与冰棒解锁啦' : '新订单已送达')) { renderPalette(); renderRecipes(); bounceElement($('#wallet'), true); }
  });
  const note = document.createElement('div'); note.className = 'unlock-note'; note.textContent = order.note;
  root.append(reward, claim, note);
}
function recipeLabel(def) {
  if (def.kind === 'assembler') return `${Object.entries(def.ingredients).map(([item, n]) => `${ITEMS[item].label} ×${n}`).join(' ＋ ')} → ${ITEMS[def.output].label}`;
  if (def.kind === 'source') return `持续供应 ${ITEMS[def.output].label}`;
  if (def.kind === 'machine') return `${ITEMS[def.input].label} → ${ITEMS[def.output].label}`;
  if (def.kind === 'depot') return '自动售卖成品，也可切换自动入库';
  if (def.kind === 'splitter') return '向前 / 顺时针侧口轮流出货';
  return '沿箭头方向运送物品';
}
function renderInspector() {
  const root = $('#inspector-content'); root.replaceChildren();
  const b = game.state.buildings.find(b => b.id === ui.selected);
  const def = b ? BUILDINGS[b.type] : BUILDINGS[ui.tool];
  if (!def) {
    $('#inspector-title').textContent = '工坊手记';
    const p = document.createElement('p'); p.className = 'muted';
    p.textContent = game.unlockLevel === 0 ? '面粉 → 和面 → 烘烤 → 出货' : game.unlockLevel === 1 ? '面团 → 成型 → 油炸 → 淋酱' : '橙子 → 清洗 → 榨汁 → 出货'; root.append(p);
    const stats = document.createElement('div'); stats.className = 'stat-row'; stats.innerHTML = `<span>累计售出</span><strong>${game.state.totalSold} 份</strong>`; root.append(stats);
    const recipe = document.createElement('button'); recipe.className = 'recipe-button'; recipe.textContent = '查看配方 ↗'; recipe.addEventListener('click', () => openQuickRecipe()); root.append(recipe); return;
  }
  $('#inspector-title').textContent = b ? `${def.label} · Lv.${b.level}` : def.label;
  const icon = renderer.buildingIcon(b || { type: ui.tool, dir: ui.dir }, 64, b ? game : null); icon.className = 'inspector-art'; root.append(icon);
  const info = document.createElement('p'); info.className = 'machine-info';
  const status = b ? (b.blocked ? b.type === 'depot' && b.mode === 'store' ? '合作仓库已满' : '出口堵住了' : b.type === 'depot' ? (b.input ? '正在出货' : '等待成品') : b.output ? '等待运出' : b.input || def.kind === 'source' || def.kind === 'assembler' && ingredientsReady(b, def) ? '正在生产' : '等待原料') : `${def.cost} 金币 / 台`;
  info.textContent = recipeLabel(def); info.append(document.createElement('br'));
  info.append(document.createTextNode(b ? (isTransport(b) ? `${game.duration(b).toFixed(1)} 秒 / 格 · ${transportCount(b)}/2 件 · ${status}` : `${game.duration(b).toFixed(1)} 秒 / 份 · ${status}`) : `${def.cost} 金币 · 点空格摆放`)); root.append(info);
  if (b) {
    if (def.ingredients) {
      for (const [item, count] of Object.entries(def.ingredients)) {
        const row = element('div', '', 'packing-ingredient');
        row.append(assets.icon(ITEMS[item].sprite, 28), element('span', `${ITEMS[item].label} ${b.ingredients[item] || 0}/${count}`)); root.append(row);
      }
      root.append(element('small', '箭头口出货，其余三面进料；配齐后自动打包。', 'tiny-note'));
    }
    const actions = document.createElement('div'); actions.className = 'inspector-actions';
    if (b.type === 'depot') {
      const mode = element('button', b.mode === 'store' ? '入库中 · 切换自动售卖' : '售卖中 · 切换自动入库', 'soft-button'); mode.id = 'depot-mode'; mode.disabled = Boolean(practice);
      mode.addEventListener('click', () => action(game.setDepotMode(b.id, b.mode === 'store' ? 'sell' : 'store'), b.mode === 'store' ? '已改为自动入库' : '已改为自动售卖'));
      root.append(mode, element('p', b.mode === 'store' ? '自动存入合作仓库，仓满后停收，不丢货。' : '自动售卖并推进订单、急单，无需手动配送。', 'tiny-note'));
    }
    if (def.duration || b.type === 'depot') {
      const up = document.createElement('button'); up.id = 'upgrade-building'; up.textContent = b.level >= 3 ? '已满级' : b.type === 'depot' ? `提速至 ${[2, 1.5, 1][b.level]} 秒/份 · ${upgradeCost(b)}` : `升级 · ${upgradeCost(b)}`; up.disabled = b.level >= 3;
      up.disabled ||= Boolean(practice && (practice.step !== 3 || b.type !== 'bread_oven'));
      up.classList.toggle('tutorial-highlight', Boolean(practice?.step === 3 && b.type === 'bread_oven'));
      up.addEventListener('click', () => { const result = game.upgrade(b.id); if (action(result, '设备升级完成')) { renderer.pulse(b.id, 'upgrade'); renderer.burst(b.x, b.y, 'upgrade'); } }); actions.append(up);
    }
    const turn = document.createElement('button'); turn.textContent = '↻ 旋转'; turn.addEventListener('click', () => { game.rotate(b.id); renderer.pulse(b.id); save(); renderUi(true); });
    const remove = document.createElement('button'); remove.textContent = b.gifted && !b.paid ? '收回设备' : `拆除 +${b.paid}`; remove.addEventListener('click', () => removeBuilding(b));
    turn.disabled = remove.disabled = Boolean(practice);
    actions.append(turn, remove); root.append(actions);
    if (!practice && (b.input || b.output || b.buffer || Object.values(b.ingredients || {}).some(Boolean))) {
      const clear = element('button', '清空物品 · 不售卖', 'soft-button'); clear.id = 'clear-building';
      clear.addEventListener('click', () => action(game.clearContents(b.id), '仅清空这台设备内的物品')); root.append(clear);
    }
    const note = document.createElement('p'); note.className = 'tiny-note'; note.textContent = b.gifted ? '初始设备可免费重放；收回会清空物品' : '拆除会清空机内物品，退回实付费用'; root.append(note);
  }
}
function renderUi(force = false) {
  renderQuickRecipe();
  if (practice) {
    const next = nextLesson(practice.step, game, ui.tool);
    if (next !== practice.step) {
      practice.step = next;
      if (next >= 2) { ui.tool = 'select'; ui.selected = null; ui.inspectorOpen = false; }
      if (next === 4) ui.ordersOpen = true;
      force = true;
    }
  }
  const s = game.state, b = s.buildings.find(b => b.id === ui.selected);
  const key = JSON.stringify([s.crafting.made, s.crafting.queue, s.packingTrial, b?.ingredients, practice?.step, s.coins, s.orderIndex, s.orderProgress, s.totalSold, s.expansion, s.paused, s.speed, s.career, s.business, s.career.contract?.status === 'active' ? Math.ceil(s.time) : 0, ui.screen, ui.careerTab, ui.businessTab, ui.mapOpen, ui.tool, ui.selected, ui.dir, ui.dockOpen, ui.ordersOpen, ui.inspectorOpen, ui.focus, ui.reducedMotion, b?.mode, b?.level, b?.blocked, b?.input, b?.output, b?.buffer?.item]);
  if (!force && key === lastUi) return; lastUi = key;
  renderFront();
  $('#coins').textContent = s.coins.toLocaleString('zh-CN');
  if (s.coins > lastCoins) bounceElement($('#wallet')); lastCoins = s.coins;
  $('#factory-level').textContent = `${game.area.join(' × ')} 格工坊`;
  $('#expand').textContent = game.expansionCost === null ? '已全部扩建' : `扩建 ${game.nextArea.join('×')} · ${game.expansionCost}`; $('#expand').disabled = Boolean(practice) || game.expansionCost === null;
  $('#order-number').textContent = String(s.packingTrial ? Math.min(3, s.packingTrial.goal + 1) : s.orderIndex + 1).padStart(2, '0');
  $('#pause').textContent = s.paused ? '▷' : 'Ⅱ'; $('#pause').setAttribute('aria-label', s.paused ? '继续生产' : '暂停生产');
  $('#pause-overlay').hidden = !s.paused; $('#speed').textContent = `${s.speed}×`; $('#direction').textContent = DIRECTION_NAMES[ui.dir];
  $('#select-tool').classList.toggle('active', ui.tool === 'select'); $('#remove-tool').classList.toggle('active', ui.tool === 'remove');
  $('#selection-hint').textContent = ui.tool === 'handmade' ? '点有空位的传送带或出货口，放入甜甜圈' : ui.tool === 'pan' ? '按住拖动 · 滚轮缩放' : ui.tool === 'remove' ? '点设备拆除 · 清空物品并退款' : BUILDINGS[ui.tool] ? `${BUILDINGS[ui.tool].label} · ${DIRECTION_NAMES[ui.dir]}${ui.tool === 'belt' ? ' · 按住拖着铺' : ' · 点空格摆放'}` : '点机器查看 · 下方建造';
  $('#factory-app').classList.toggle('dock-open', ui.dockOpen);
  $('#factory-app').classList.toggle('focus-mode', ui.focus);
  $('#factory-app').classList.toggle('reduced-motion', ui.reducedMotion);
  $('#build-dock').classList.toggle('open', ui.dockOpen);
  $('#palette').hidden = !ui.dockOpen;
  $('#dock-toggle').textContent = ui.dockOpen ? '收起 ⌄' : '建造 ⌃';
  $('#dock-toggle').setAttribute('aria-expanded', String(ui.dockOpen));
  $('#orders-toggle').setAttribute('aria-expanded', String(ui.ordersOpen));
  $('#order-drawer').hidden = !ui.ordersOpen;
  $('#inspector-panel').hidden = !ui.inspectorOpen || !b;
  const wants = Object.entries(game.order.wants), target = wants.reduce((n, [, amount]) => n + amount, 0), have = wants.reduce((n, [item, amount]) => n + Math.min(amount, s.orderProgress[item] || 0), 0);
  $('#order-summary').textContent = game.orderReady ? '可领取' : `${have} / ${target}`;
  $('#order-badge').hidden = !game.orderReady; $('#orders-toggle').classList.toggle('ready', game.orderReady);
  $('#focus-view').setAttribute('aria-pressed', String(ui.focus));
  $('#focus-view').setAttribute('aria-label', ui.focus ? '展开操作界面' : '收起界面，专注工坊');
  $('#move-tool').classList.toggle('active', ui.tool === 'pan');
  canvas.dataset.pan = String(ui.tool === 'pan');
  $('#motion-toggle').textContent = ui.reducedMotion ? 'Q 弹动效：关' : 'Q 弹动效：开';
  $('#motion-toggle').setAttribute('aria-pressed', String(ui.reducedMotion));
  const orderKey = JSON.stringify([s.packingTrial, s.orderIndex, s.orderProgress]);
  if (force || orderKey !== lastOrder) { renderOrder(); lastOrder = orderKey; }
  const inspectorKey = JSON.stringify([b?.ingredients, ui.tool, ui.selected, s.orderIndex, s.totalSold, s.career.research, b?.mode, game.warehouseUsed, game.warehouseCapacity, b?.level, b?.paid, b?.blocked, b?.input, b?.output, b?.buffer?.item]);
  if (force || inspectorKey !== lastInspector) { renderInspector(); lastInspector = inspectorKey; }
  renderTutorial();
  renderPackingGoal();
  const handmade = s.crafting.queue;
  $('#handmade-tray').hidden = !handmade.length || ui.screen !== 'workshop' || ui.focus || Boolean(practice);
  $('#handmade-count').textContent = `手作甜甜圈 ×${handmade.length}`;
  $('#handmade-place').textContent = ui.tool === 'handmade' ? '已选中 · 点传送带放入' : '放入产线';
  $('#handmade-place').setAttribute('aria-pressed', String(ui.tool === 'handmade'));
  $('#craft-toggle').disabled = Boolean(practice);
  $('#minimap-panel').hidden = !ui.mapOpen || ui.screen !== 'workshop' || ui.focus || ui.inspectorOpen || ui.ordersOpen;
  $('#map-toggle').setAttribute('aria-expanded', String(ui.mapOpen));
  $('#map-area').textContent = `已开放 ${game.area.join('×')} / ${WIDTH}×${HEIGHT}`;
}
function element(tag, text, className = '') { const el = document.createElement(tag); el.textContent = text; el.className = className; return el; }
function clockLabel(seconds) { const n = Math.max(0, Math.ceil(seconds)); return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`; }
function renderRecipes() {
  const root = $('#recipe-list'); root.replaceChildren();
  for (const [item, chain] of visibleRecipes()) {
    const food = ITEMS[item], unlock = Math.max(...chain.map(type => BUILDINGS[type].unlock));
    const card = element('article', '', 'food-recipe'); card.dataset.food = item;
    card.append(assets.icon(food.sprite), element('h3', food.label), element('small', `${food.value} 金币 / 份 · ${chain.every(type => game.isUnlocked(type)) ? '已解锁' : `第 ${unlock} 单后解锁`}`));
    card.append(element('p', PACK_RECIPES[item] ? recipeLabel(BUILDINGS[PACK_RECIPES[item].machine]) : [...chain.map(type => BUILDINGS[type].label), '出货口'].join(' → ')));
    root.append(card);
  }
}
let quickKey = '';
function openQuickRecipe() {
  finishDrag(); ui.recipeOpen = true; ui.focus = false;
  renderQuickRecipe();
}
function renderQuickRecipe() {
  $('#quick-recipe').hidden = !ui.recipeOpen || ui.screen !== 'workshop' || ui.focus;
  $('#recipes-toggle').setAttribute('aria-expanded', String(ui.recipeOpen && !ui.focus));
  if (!ui.recipeOpen || !assets.ready) return;
  const key = `${ui.recipeItem}:${game.unlockLevel}:${game.state.crafting.made > 0}:${Boolean(practice)}:${Boolean(game.state.packingTrial)}`;
  if (key === quickKey) return; quickKey = key;
  const select = $('#quick-recipe-food'); select.replaceChildren();
  for (const [item, chain] of visibleRecipes()) {
    const unlock = Math.max(...chain.map(type => BUILDINGS[type].unlock));
    const option = element('option', `${ITEMS[item].label}${chain.every(type => game.isUnlocked(type)) ? '' : ' · 未解锁'}`); option.value = item; select.append(option);
  }
  select.value = ui.recipeItem;
  const chain = allRecipes.find(([item]) => item === ui.recipeItem)?.[1] || FOOD_RECIPES[0][1], root = $('#quick-recipe-chain'); root.replaceChildren();
  const pack = PACK_RECIPES[ui.recipeItem];
  if (pack) {
    for (const [item, count] of Object.entries(pack.ingredients)) {
      const label = element('span', '', 'packing-ingredient'); label.append(assets.icon(ITEMS[item].sprite, 28), document.createTextNode(`×${count}`)); root.append(label);
    }
    root.append(element('span', '→'));
  }
  [...chain, 'depot'].forEach((type, i) => {
    if (i) root.append(element('span', '→'));
    const def = BUILDINGS[type], locked = !game.isUnlocked(type), button = element('button', '');
    button.type = 'button'; button.dataset.recipeBuilding = type; button.disabled = locked || Boolean(practice);
    button.setAttribute('aria-label', `${def.label}，${locked ? '完成订单解锁' : `选择建造，${def.cost}金币`}`);
    button.append(renderer.buildingIcon({ type, dir: ui.dir }, 32), document.createTextNode(def.label));
    button.addEventListener('click', () => {
      if (practice || !game.isUnlocked(type)) return;
      ui.category = def.category;
      document.querySelectorAll('[data-category]').forEach(b => b.classList.toggle('active', b.dataset.category === ui.category));
      chooseTool(type); canvas.focus({ preventScroll: true });
    }); root.append(button);
  });
  const unlock = Math.max(...chain.map(type => BUILDINGS[type].unlock));
  $('#quick-recipe-note').textContent = !chain.every(type => game.isUnlocked(type)) ? `完成第 ${unlock} 单解锁 · 可先查看路线` : practice ? '练习中可查看 · 退出练习后可直接选机器' : '点机器直接建造 · 可边做边看';
}
function renderTutorial() {
  $('#tutorial-card').hidden = !practice || ui.screen !== 'workshop';
  $('#factory-app').classList.toggle('in-tutorial', Boolean(practice));
  ui.tutorialTarget = practice ? LESSONS[practice.step].cell : null;
  for (const id of ['career-toggle', 'business-toggle', 'map-toggle', 'remove-tool', 'rotate', 'focus-view']) $(`#${id}`).disabled = Boolean(practice);
  for (const id of ['speed', 'orders-toggle', 'claim-order']) $(`#${id}`)?.classList.toggle('tutorial-highlight', Boolean(practice && (id === LESSONS[practice.step].target || (id === 'claim-order' && practice.step === 4 && game.orderReady))));
  if (!practice) return;
  $('#tutorial-progress').textContent = practice.step === 5 ? '练习完成' : `新手练习 ${practice.step + 1} / 5`;
  $('#tutorial-title').textContent = LESSONS[practice.step].title;
  $('#tutorial-copy').textContent = LESSONS[practice.step].copy;
  $('#tutorial-exit').textContent = practice.step === 5 ? '进入我的工坊 →' : '跳过练习';
}
function resetEffects() { renderer.previous.clear(); renderer.pulses.clear(); renderer.particles = []; renderer.camera.fit(game.area); renderer.worldShown = false; }
function openCraft() {
  if (practice || !assets.ready) return;
  finishDrag(); ui.craftPaused = false; ui.focus = false; ui.recipeOpen = false; ui.ordersOpen = false; ui.inspectorOpen = false; ui.handmadeId = null; ui.tool = 'select';
  if (!packingSession) hasSave = true;
  if (!game.state.crafting.batch) game.startCraft();
  ui.screen = 'craft'; previousTime = performance.now(); save(); renderUi(true); craftingView.open();
}
function leaveCraft(withFood = false) {
  craftingView.cancel(); ui.craftPaused = false; save(); enterWorkshop();
  if (withFood && game.state.crafting.queue.length) selectHandmade();
}
function selectHandmade() {
  if (practice || ui.screen !== 'workshop') return;
  const food = game.state.crafting.queue[0];
  if (!food) return;
  ui.mapOpen = false;
  chooseTool('handmade'); ui.handmadeId = food.id;
  toast('点有空位的传送带或出货口');
}
function renderPackingGoal() {
  const trial = game.state.packingTrial, show = Boolean(trial && ui.screen === 'workshop' && !ui.focus && !ui.ordersOpen && !ui.inspectorOpen);
  $('#packing-goal').hidden = !show;
  $('#factory-app').classList.toggle('packing-trial', Boolean(trial));
  if (!trial) return;
  const done = trial.goal >= PACK_GOALS.length;
  $('#packing-title').textContent = done ? '三项目标完成 ✓' : `${trial.goal + 1}/3 · ${game.order.title}`;
  $('#packing-progress').textContent = done ? '继续自由搭线 · 原工坊在主菜单' : Object.entries(game.order.wants).map(([item, n]) => `${ITEMS[item].label} ${game.state.orderProgress[item] || 0}/${n}`).join(' · ');
  $('#packing-hint').textContent = game.order.note;
  $('#packing-claim').hidden = !game.orderReady;
  $('#packing-claim').textContent = `完成 · +${game.order.reward}`;
  if (!practice && trial.goal === 0 && !game.at(5, 3)) ui.tutorialTarget = { x: 5, y: 3 };
}
function startPacking() {
  if (!assets.ready || packingSession) return;
  finishDrag(); save();
  if (!packingGame) {
    packingGame = createPackingTrial();
    try {
      const raw = localStorage.getItem(PACKING_SAVE_KEY);
      if (raw) {
        const candidate = new FactoryGame();
        if (candidate.restore(raw) && candidate.state.packingTrial) packingGame = candidate;
        else { localStorage.setItem(`${PACKING_SAVE_KEY}-recovery-${Date.now()}`, raw); toast('套餐存档已备份，重新准备试营工坊'); }
      }
    } catch { protectPackingSave = true; toast('套餐存档暂不可写，原工坊不受影响'); }
  }
  packingSession = { realGame: game }; game = packingGame;
  ui.category = 'machines'; ui.dir = 0; ui.recipeItem = game.state.packingTrial.goal === 0 ? 'breakfast_box' : 'tea_box'; ui.recipeOpen = false; ui.mapOpen = false;
  document.querySelectorAll('[data-category]').forEach(b => b.classList.toggle('active', b.dataset.category === ui.category));
  resetEffects(); chooseTool(game.state.packingTrial.goal === 0 && !game.at(5, 3) ? 'breakfast_packer' : 'select'); renderRecipes(); enterWorkshop();
}
function startTutorial() {
  if (!assets.ready) return;
  finishDrag(); save();
  const realGame = practice?.realGame || game;
  practice = { realGame, step: 0 }; game = createPractice(); tutorialSeen = true;
  try { localStorage.setItem(TUTORIAL_KEY, 'seen'); } catch { /* No impact on the real save. */ }
  $('#help-dialog').close(); ui.category = 'logistics'; ui.dir = 0;
  ui.tool = 'select'; ui.selected = null; ui.inspectorOpen = false; ui.ordersOpen = false; ui.focus = false; ui.mapOpen = false; ui.dockOpen = true;
  document.querySelectorAll('[data-category]').forEach(button => button.classList.toggle('active', button.dataset.category === ui.category));
  resetEffects(); renderPalette(); renderRecipes(); enterWorkshop();
}
function leaveTutorial(toMenu = false) {
  if (!practice) return;
  finishDrag(); game = practice.realGame; practice = null;
  ui.tutorialTarget = null; ui.category = 'logistics'; ui.dir = 0; ui.ordersOpen = false; ui.focus = false;
  resetEffects(); chooseTool('select'); renderRecipes();
  if (toMenu) enterMenu(); else enterWorkshop();
}
function renderFront() {
  const s = game.state, c = game.contract, menu = ui.screen === 'menu';
  $('#main-menu').hidden = !menu; $('#factory-app').hidden = ui.screen !== 'workshop'; $('#craft-room').hidden = ui.screen !== 'craft'; $('#kitchen-room').hidden = ui.screen !== 'kitchen';
  $('#menu-kitchen').disabled = !assets.ready;
  $('#sort-room').hidden = ui.screen !== 'sorting'; $('#menu-sort').disabled = !assets.ready;
  sortingView.renderMenu();
  kitchenView.renderMenu();
  document.body?.classList.toggle('menu-open', menu); document.body?.classList.toggle('reduced-motion', ui.reducedMotion);
  $('#menu-play').disabled = !assets.ready; $('#menu-career').disabled = !assets.ready;
  $('#menu-tutorial').disabled = !assets.ready;
  $('#menu-packing').disabled = !assets.ready;
  $('#menu-craft').disabled = !assets.ready;
  $('#menu-business').disabled = !assets.ready;
  $('#menu-business-summary').textContent = `${BUSINESS_RANKS[businessLevel(s.business.reputation)]} · ${game.warehouseUsed}/${game.warehouseCapacity} 份库存`;
  $('#business-toggle').textContent = `仓库与合作 ${game.warehouseUsed}/${game.warehouseCapacity}`;
  $('#menu-play').textContent = !assets.ready ? '正在准备…' : hasSave ? '继续经营  →' : '开始经营  →';
  $('#menu-summary').textContent = hasSave ? `已交付 ${s.totalSold} 份美味 · 完成 ${s.orderIndex} 张订单\n${s.coins.toLocaleString('zh-CN')} 金币 · ${s.career.points} 研究点` : '从第一份面包开始，让美味自己流动。';
  $('#menu-new').hidden = !hasSave; $('#menu-restore').hidden = !hasBackup;
  $('#menu-career-summary').textContent = s.career.completed ? `已完成 ${s.career.completed} 次挑战 · ${s.career.points} 研究点` : '挑战产能，解锁永久加成';
  $('#settings-motion').textContent = ui.reducedMotion ? 'Q 弹动效：关' : 'Q 弹动效：开';
  $('#settings-motion').setAttribute('aria-pressed', String(ui.reducedMotion));
  $('#career-toggle').textContent = !c ? '✦ 急单与研究' : c.status === 'ready' ? '✦ 急单可领奖' : c.status === 'expired' ? '✦ 急单已结束' : `✦ ${c.title} ${clockLabel(c.deadline - s.time)}`;
  $('#career-toggle').classList.toggle('ready', c?.status === 'ready');
  if ($('#career-dialog').open) renderCareer();
  if ($('#business-dialog').open) renderBusiness();
}
function renderBusiness() {
  const s = game.state, business = s.business, level = businessLevel(business.reputation), trade = ui.businessTab === 'trade';
  $('#business-rank').textContent = `${BUSINESS_RANKS[level]} · ${business.reputation} 声望`;
  $('#warehouse-summary').textContent = `仓储 ${game.warehouseUsed} / ${game.warehouseCapacity}${REPUTATION_LEVELS[level + 1] ? ` · ${REPUTATION_LEVELS[level + 1]} 声望可再扩容` : ' · 已达最大仓储'}`;
  $('#business-trade-view').hidden = !trade; $('#business-goals-view').hidden = trade;
  for (const [id, active] of [['business-trade-tab', trade], ['business-goals-tab', !trade]]) { $(`#${id}`).classList.toggle('active', active); $(`#${id}`).setAttribute('aria-pressed', String(active)); }
  const warehouse = $('#warehouse-items'); warehouse.replaceChildren();
  for (const item of WAREHOUSE_FOODS.filter(item => SALE_FOODS.includes(item) || business.warehouse[item])) {
    const count = business.warehouse[item] || 0, card = element('div', '', 'warehouse-item');
    card.append(assets.icon(ITEMS[item].sprite), element('strong', `${ITEMS[item].label} · ${count}`), element('small', `合作累计 ${business.shipped[item] || 0} 份`, 'warehouse-history'));
    const sell = element('button', count ? `散卖 ${Math.min(10, count)} 份` : '暂无库存', 'soft-button'); sell.disabled = !count; sell.dataset.sellFood = item;
    sell.addEventListener('click', () => { const result = game.sellWarehouse(item, Math.min(10, count)); action(result, result.ok ? `散卖 +${result.reward} 金币` : undefined); }); card.append(sell); warehouse.append(card);
  }
  const offers = $('#wholesale-offers'); offers.replaceChildren();
  for (const offer of game.wholesaleOffers) {
    const card = element('article', '', 'career-card');
    card.append(element('small', `合作 ${offer.slot + 1} · 无期限`, 'card-tag'), element('h3', offer.title));
    for (const [item, count] of Object.entries(offer.wants)) {
      const row = element('div', '', 'contract-want'); row.append(assets.icon(ITEMS[item].sprite), element('span', `${ITEMS[item].label} ${business.warehouse[item] || 0}/${count}`)); card.append(row);
    }
    card.append(element('span', `+${offer.reward} 金币 · +${offer.reputation} 声望`, 'reward-line'));
    const ready = Object.entries(offer.wants).every(([item, n]) => (business.warehouse[item] || 0) >= n);
    const button = element('button', ready ? '整单发货' : '还需备货', 'primary-button'); button.dataset.wholesale = offer.id; button.disabled = !ready;
    button.addEventListener('click', () => { const result = game.shipWholesale(offer.id); action(result, result.ok ? `合作完成 · +${result.reputation} 声望` : undefined); }); card.append(button); offers.append(card);
  }
  const goals = $('#business-goals'); goals.replaceChildren();
  for (const goal of MILESTONES) {
    const progress = Math.min(goal.target, goal.progress(s)), claimed = business.claimed.includes(goal.id), card = element('article', '', 'milestone-card');
    card.append(element('h3', goal.title), element('p', goal.detail), element('small', `${progress}/${goal.target} · 奖励 ${goal.coins} 金币 + ${goal.points} 研究点`));
    const button = element('button', claimed ? '已领取 ✓' : progress === goal.target ? '领取奖励' : '进行中', 'soft-button'); button.dataset.milestone = goal.id; button.disabled = claimed || progress < goal.target;
    button.addEventListener('click', () => { const result = game.claimMilestone(goal.id); action(result, result.ok ? `目标达成 · +${result.points} 研究点` : undefined); }); card.append(button); goals.append(card);
  }
}
function openBusiness() { if (practice || !assets.ready) return; finishDrag(); $('#business-dialog').showModal(); renderBusiness(); }
function locateDepot() {
  if (practice) return;
  $('#business-dialog').close(); enterWorkshop();
  const b = game.state.buildings.find(b => b.type === 'depot');
  if (!b) { toast('先在运输分类放一座出货口'); return; }
  chooseTool('select'); ui.selected = b.id; ui.inspectorOpen = true; ui.hover = null;
  renderer.camera.zoom = 1; renderer.camera.centerOn(b.x + .5, b.y + .5); renderer.resize(game.area, ui); renderUi(true);
}
function renderCareer() {
  const c = game.contract, career = game.state.career, contracts = ui.careerTab === 'contracts';
  $('#research-balance').textContent = `${career.points} 研究点`;
  $('#contracts-view').hidden = !contracts; $('#research-view').hidden = contracts;
  $('#career-contracts-tab').classList.toggle('active', contracts); $('#career-contracts-tab').setAttribute('aria-pressed', String(contracts));
  $('#career-research-tab').classList.toggle('active', !contracts); $('#career-research-tab').setAttribute('aria-pressed', String(!contracts));
  const active = $('#contract-active'), offers = $('#contract-offers'); active.replaceChildren(); offers.replaceChildren();
  if (c) {
    const card = element('div', '', 'contract-active-card'), top = element('div', '', 'contract-active-top');
    top.append(element('h3', c.title), element('span', c.status === 'ready' ? '已达成 ✓' : c.status === 'expired' ? '已超时' : clockLabel(c.deadline - game.state.time), 'contract-clock')); card.append(top);
    for (const [item, count] of Object.entries(c.wants)) { const row = element('div', '', 'contract-want'); row.append(assets.icon(ITEMS[item].sprite), element('span', `${ITEMS[item].label} ${c.progress[item] || 0} / ${count}`)); card.append(row); }
    card.append(element('p', `奖金 ${c.reward} 金币 + ${c.points} 研究点`, 'reward-line'));
    const button = element('button', c.status === 'ready' ? '领取奖励' : c.status === 'expired' ? '再挑一张' : '继续生产', 'primary-button'); button.id = 'contract-action';
    button.addEventListener('click', () => {
      if (c.status === 'ready') { const result = game.claimContract(); action(result, result.ok ? `急单完成 · +${result.points} 研究点` : undefined); }
      else if (c.status === 'expired') action(game.cancelContract());
      else { $('#career-dialog').close(); enterWorkshop(); }
    }); card.append(button);
    if (c.status === 'active') { const cancel = element('button', '放弃本单', 'soft-button'); cancel.id = 'contract-cancel'; cancel.addEventListener('click', () => action(game.cancelContract(), '已放弃，无金币损失')); card.append(cancel); }
    active.append(card);
  } else for (const offer of game.offers) {
    const card = element('article', '', 'career-card');
    card.append(assets.icon(ITEMS[Object.keys(offer.wants)[0]].sprite), element('small', `${offer.tag} · ${offer.duration} 秒`, 'card-tag'), element('h3', offer.title));
    for (const [item, count] of Object.entries(offer.wants)) { const row = element('div', '', 'contract-want'); row.append(assets.icon(ITEMS[item].sprite), element('span', `${ITEMS[item].label} × ${count}`)); card.append(row); }
    card.append(element('span', `+${offer.reward} 金币 · +${offer.points} 研究点`, 'reward-line'));
    const button = element('button', '接下急单', 'primary-button'); button.dataset.contract = String(offer.slot);
    button.addEventListener('click', () => { if (action(game.acceptContract(offer.slot))) { $('#career-dialog').close(); enterWorkshop(); } }); card.append(button); offers.append(card);
  }
  const research = $('#research-cards'); research.replaceChildren();
  for (const [key, def] of Object.entries(RESEARCH)) {
    const level = career.research[key], card = element('article', '', 'career-card');
    card.append(assets.icon(def.icon), element('h3', def.title), element('span', '●'.repeat(level) + '○'.repeat(3 - level), 'research-level'), element('p', def.detail));
    const buy = element('button', level === 3 ? '已满级' : `${level + 1} 研究点 · 升级`, 'primary-button'); buy.dataset.research = key; buy.disabled = level === 3 || career.points < level + 1;
    buy.addEventListener('click', () => action(game.research(key), '研究完成，永久生效')); card.append(buy); research.append(card);
  }
}
function enterWorkshop() {
  if (!assets.ready) return;
  finishDrag(); if (!practice && !packingSession) hasSave = true; ui.screen = 'workshop'; previousTime = performance.now();
  renderUi(true); renderer.resize(game.area, ui); save(); canvas.focus({ preventScroll: true });
  if (!practice && !renderer.worldShown) {
    renderer.worldShown = true;
    if (game.state.expansion === 0 && renderer.viewport.width >= 1000 && renderer.viewport.height >= 650) { renderer.camera.overview(); renderer.resize(game.area, ui); }
  }
}
function enterMenu() {
  if (ui.screen === 'sorting') sortingView.close();
  if (ui.screen === 'kitchen') kitchenView.close();
  if (practice) { leaveTutorial(true); return; }
  finishDrag(); save();
  if (packingSession) {
    game = packingSession.realGame; packingSession = null; ui.recipeItem = 'bread'; ui.recipeOpen = false; ui.selected = null; ui.tool = 'select'; ui.tutorialTarget = null;
    resetEffects(); renderPalette(); renderRecipes();
  }
  ui.screen = 'menu'; ui.hover = null; ui.focus = false; ui.ordersOpen = false; ui.dockOpen = false; ui.inspectorOpen = false;
  previousTime = performance.now(); renderUi(true); $('#menu-sort').focus();
}
function openCareer() { if (practice) return; finishDrag(); $('#career-dialog').showModal(); renderCareer(); }
function requestRestart(mode) {
  restartMode = mode;
  $('#restart-title').textContent = mode === 'restore' ? '恢复之前的工坊？' : '重新开一间？';
  $('#restart-copy').textContent = mode === 'restore' ? '当前工坊会另存备份，再恢复重开之前的进度。' : '当前进度会先备份，然后从新工坊开始。';
  $('#restart-confirm').textContent = mode === 'restore' ? '备份并恢复' : '备份并重新开始'; $('#restart-dialog').showModal();
}
function confirmRestart() {
  try {
    const candidate = new FactoryGame();
    if (restartMode === 'restore' && !candidate.restore(localStorage.getItem(BACKUP_KEY))) { toast('备份无法读取，当前工坊未改变'); return; }
    const old = protectOriginalSave ? localStorage.getItem(SAVE_KEY) : game.serialize();
    localStorage.setItem(restartMode === 'restore' ? `${SAVE_KEY}-before-restore` : BACKUP_KEY, old);
    localStorage.setItem(SAVE_KEY, candidate.serialize());
    game.restore(candidate.serialize()); hasBackup = true; hasSave = true; protectOriginalSave = false;
    renderRecipes();
    renderer.previous.clear(); renderer.pulses.clear(); renderer.particles = []; renderer.camera.fit(game.area);
    ui.category = 'logistics'; ui.dir = 0; chooseTool('select');
    document.querySelectorAll('[data-category]').forEach(button => button.classList.toggle('active', button.dataset.category === ui.category));
    $('#restart-dialog').close(); enterWorkshop();
  } catch { toast('无法备份，当前工坊未改变'); }
}
function toggleMotion() {
  ui.reducedMotion = !ui.reducedMotion; explicitMotion = true;
  if (ui.reducedMotion) { renderer.pulses.clear(); renderer.particles = []; }
  try { localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ reducedMotion: ui.reducedMotion })); } catch { /* Still apply for this visit. */ }
  renderUi(true);
}
function removeBuilding(b) {
  if (practice) return;
  const result = game.remove(b.id);
  if (!result.ok) { action(result); return; }
  renderer.burst(b.x, b.y, 'remove');
  ui.selected = null; ui.inspectorOpen = false;
  action(result, `${result.restocked ? '已收回，可免费重放' : `已拆除，退回 ${result.refund || 0} 金币`}${result.discarded ? ' · 物品已清空' : ''}`);
  renderPalette();
}
function useCell(cell, paint = false) {
  if (ui.screen !== 'workshop' || document.querySelector('dialog[open]')) return false;
  if (!game.inside(cell.x, cell.y)) { if (!paint) toast('点上方扩建，解锁更多空地'); return false; }
  const b = game.at(cell.x, cell.y);
  if (ui.tool === 'handmade') {
    const result = game.placeHandmade(ui.handmadeId, cell.x, cell.y);
    if (result.ok) { ui.handmadeId = null; ui.tool = 'select'; renderer.pulse(result.building.id, 'produce'); renderer.burst(cell.x, cell.y, 'place'); }
    action(result, result.ok ? '已放入产线，等待实际出货' : undefined); return false;
  }
  if (practice && ui.tool === 'belt' && (practice.step !== 1 || cell.x !== 6 || cell.y !== 2)) return false;
  if (ui.tool === 'remove') { if (b) removeBuilding(b); return Boolean(b); }
  if (ui.tool === 'pan') return false;
  if (ui.tool === 'belt' && b) {
    ui.inspectorOpen = false; ui.selected = null;
    if (b.type === 'depot') { if (!paint) toast('出货口没有出口，请把传送带接到它'); return false; }
    return true;
  }
  if (ui.tool === 'select') { ui.selected = b?.id ?? null; ui.inspectorOpen = Boolean(b); ui.ordersOpen = false; if (b) renderer.pulse(b.id); renderUi(true); return false; }
  if (b) { if (!paint) { ui.selected = b.id; ui.inspectorOpen = true; renderer.pulse(b.id); renderUi(true); } return false; }
  const result = game.place(ui.tool, cell.x, cell.y, ui.dir);
  if (!paint || result.ok) action(result); else if (result.message) toast(result.message);
  if (result.ok) { renderer.pulse(result.building.id, 'place'); renderer.burst(cell.x, cell.y, 'place'); renderPalette(); }
  return Boolean(result.ok);
}
canvas.addEventListener('pointerdown', event => {
  if (ui.screen !== 'workshop' || document.querySelector('dialog[open]')) return;
  if (event.pointerType === 'touch' && blockedTouchGesture) return;
  if (activePointer !== null) { finishDrag(); return; }
  if (![0, 1].includes(event.button) || !assets.ready) return;
  activePointer = event.pointerId;
  event.preventDefault(); canvas.focus({ preventScroll: true }); canvas.setPointerCapture(event.pointerId);
  lastPointer = { x: event.clientX, y: event.clientY };
  panning = event.button === 1 || ui.tool === 'pan' || ui.focus;
  if (panning) { panPoint = lastPointer; canvas.dataset.panning = 'true'; return; }
  const cell = renderer.cellAt(event.clientX, event.clientY); ui.hover = cell;
  dragging = !practice && (ui.tool === 'belt' || ui.tool === 'remove'); lastCell = cell;
  dragError = '';
  if (event.pointerType === 'touch') { pendingTouch = cell; touchOrigin = lastPointer; }
  else useCell(cell);
});
canvas.addEventListener('pointermove', event => {
  if (ui.screen !== 'workshop' || document.querySelector('dialog[open]')) return;
  if (blockedTouchGesture) return;
  if (activePointer !== null && event.pointerId !== activePointer) return;
  lastPointer = { x: event.clientX, y: event.clientY };
  if (panning && panPoint) { renderer.pan(event.clientX - panPoint.x, event.clientY - panPoint.y); panPoint = lastPointer; ui.hover = null; return; }
  const hit = document.elementFromPoint?.(event.clientX, event.clientY);
  if (hit && hit !== canvas) { lastCell = null; pendingTouch = null; ui.hover = null; return; }
  const cell = renderer.cellAt(event.clientX, event.clientY); ui.hover = cell;
  if (pendingTouch && !dragging && touchOrigin && Math.hypot(event.clientX - touchOrigin.x, event.clientY - touchOrigin.y) > 8) {
    renderer.pan(event.clientX - touchOrigin.x, event.clientY - touchOrigin.y); pendingTouch = null; panning = true; panPoint = lastPointer; ui.hover = null; return;
  }
  if (!dragging || !game.inside(cell.x, cell.y)) return;
  if (!lastCell) { lastCell = cell; useCell(cell, true); return; }
  if (cell.x === lastCell.x && cell.y === lastCell.y) return;
  if (pendingTouch) { useCell(pendingTouch, true); pendingTouch = null; }
  // Every step reduces the distance to the pointer. Re-evaluate at each machine
  // so a fast stroke may enter it, follow its existing outlet, and continue.
  while (cell.x !== lastCell.x || cell.y !== lastCell.y) {
    const next = nextBeltCell(lastCell, cell, ui.tool === 'belt' ? game.at(lastCell.x, lastCell.y) : null);
    const dir = directionBetween(lastCell, next);
    if (ui.tool === 'belt') {
      const result = game.extendBelt(lastCell, next);
      if (!result.ok) {
        if (dragError !== result.message) toast(result.message);
        dragError = result.message;
        // Keep the last valid anchor: changing direction can resume this stroke.
        break;
      }
      if (dragError) { dragError = ''; clearTimeout(toastTimer); $('#toast').hidden = true; }
      ui.dir = result.building.type === 'belt' ? result.building.dir : dir;
      if (result.created) { renderer.pulse(result.building.id, 'place'); renderer.burst(next.x, next.y, 'place'); }
      action(result); renderPalette(); lastCell = next;
      if (result.terminal) { dragging = false; break; }
    } else { useCell(next, true); lastCell = next; }
  }
});
function finishDrag(event, complete = false) {
  if (event?.pointerId !== undefined && activePointer !== null && event.pointerId !== activePointer) return;
  let validTap = true;
  if (event && Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
    const hit = document.elementFromPoint?.(event.clientX, event.clientY);
    validTap = (!hit || hit === canvas) && (!touchOrigin || dragging || Math.hypot(event.clientX - touchOrigin.x, event.clientY - touchOrigin.y) <= 8);
  }
  if (complete && pendingTouch && validTap && !blockedTouchGesture) useCell(pendingTouch);
  if (dragging) save();
  if (complete && ui.selected !== null) renderer.pulse(ui.selected, 'release');
  activePointer = null; pendingTouch = null; touchOrigin = null; panning = false; panPoint = null; canvas.dataset.panning = 'false';
  dragging = false; lastCell = null; dragError = '';
}
canvas.addEventListener('pointerup', event => finishDrag(event, true));
canvas.addEventListener('pointercancel', event => finishDrag(event));
canvas.addEventListener('lostpointercapture', event => finishDrag(event));
window.addEventListener('blur', () => { finishDrag(); touchPointers.clear(); blockedTouchGesture = false; pinch = null; if (ui.screen === 'sorting') sortingView.pause(true); if (ui.screen === 'kitchen') kitchenView.pause(true); if (ui.screen === 'craft') { craftingView.cancel(); ui.craftPaused = true; craftingView.info(); save(); } });
// Capture all touch contacts, including contacts over HUD controls. A multi-touch
// gesture cannot become a fresh paint stroke until every finger has been lifted.
document.addEventListener('pointerdown', event => {
  if (event.pointerType !== 'touch') return;
  touchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY, board: event.target === canvas });
  if (touchPointers.size > 1) { blockedTouchGesture = true; finishDrag(); pinch = pinchPoints(); }
}, true);
function pinchPoints() {
  const points = [...touchPointers.values()];
  if (points.length !== 2 || !points.every(p => p.board)) return null;
  return { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2, distance: Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) };
}
document.addEventListener('pointermove', event => {
  const point = touchPointers.get(event.pointerId); if (!point) return;
  point.x = event.clientX; point.y = event.clientY;
  const next = pinchPoints();
  if (next && pinch && ui.screen === 'workshop' && !document.querySelector('dialog[open]')) {
    event.preventDefault();
    if (pinch.distance > 8 && next.distance > 8) renderer.zoom(next.distance / pinch.distance, pinch.x, pinch.y);
    renderer.pan(next.x - pinch.x, next.y - pinch.y); ui.hover = null;
  }
  pinch = next;
}, { capture: true, passive: false });
for (const name of ['pointerup', 'pointercancel']) document.addEventListener(name, event => {
  if (event.pointerType !== 'touch') return;
  touchPointers.delete(event.pointerId);
  pinch = null; if (touchPointers.size === 0) blockedTouchGesture = false;
}, true);
canvas.addEventListener('pointerleave', () => { if (!dragging) ui.hover = null; });
canvas.addEventListener('contextmenu', event => { event.preventDefault(); chooseTool('select'); });
document.querySelectorAll('[data-category]').forEach(button => button.addEventListener('click', () => {
  finishDrag(); ui.category = button.dataset.category; ui.dockOpen = true; ui.inspectorOpen = false; ui.ordersOpen = false;
  document.querySelectorAll('[data-category]').forEach(b => b.classList.toggle('active', b === button)); renderPalette(); renderUi(true);
}));
$('#select-tool').addEventListener('click', () => chooseTool('select'));
$('#remove-tool').addEventListener('click', () => chooseTool(ui.tool === 'remove' ? 'select' : 'remove'));
function rotate() {
  if (practice) return;
  if (ui.selected !== null && ui.tool === 'select') { game.rotate(ui.selected); renderer.pulse(ui.selected); } else ui.dir = (ui.dir + 1) % 4;
  renderPalette(); save(); renderUi(true);
}
$('#rotate').addEventListener('click', rotate);
function pause() { game.state.paused = !game.state.paused; save(); renderUi(true); }
$('#pause').addEventListener('click', pause); $('#resume').addEventListener('click', pause);
$('#speed').addEventListener('click', () => { game.state.speed = game.state.speed === 1 ? 2 : 1; save(); renderUi(true); });
$('#expand').addEventListener('click', () => { if (action(game.expand(), '扩建完成 · 点地图前往新区域')) { ui.mapOpen = true; renderer.resize(game.area, ui); renderUi(true); } });
$('#dock-toggle').addEventListener('click', () => { finishDrag(); ui.dockOpen = !ui.dockOpen; ui.inspectorOpen = false; renderUi(true); });
$('#orders-toggle').addEventListener('click', () => { finishDrag(); ui.ordersOpen = !ui.ordersOpen; ui.inspectorOpen = false; renderUi(true); });
$('#close-orders').addEventListener('click', () => { ui.ordersOpen = false; renderUi(true); $('#orders-toggle').focus(); });
$('#close-inspector').addEventListener('click', () => { ui.inspectorOpen = false; ui.selected = null; renderUi(true); canvas.focus(); });
$('#move-tool').addEventListener('click', () => chooseTool(ui.tool === 'pan' ? 'select' : 'pan'));
function refreshHover() { if (lastPointer) ui.hover = renderer.cellAt(lastPointer.x, lastPointer.y); $('#zoom-reset').textContent = `${Math.round(renderer.camera.zoom * 100)}%`; }
$('#zoom-in').addEventListener('click', () => { finishDrag(); renderer.zoom(1.2); refreshHover(); });
$('#zoom-out').addEventListener('click', () => { finishDrag(); renderer.zoom(1 / 1.2); refreshHover(); });
$('#zoom-reset').addEventListener('click', () => { finishDrag(); renderer.camera.fit(game.area); renderer.resize(game.area, ui); refreshHover(); });
$('#map-toggle').addEventListener('click', () => { if (practice) return; finishDrag(); ui.mapOpen = !ui.mapOpen; ui.inspectorOpen = false; ui.ordersOpen = false; renderUi(true); });
$('#close-minimap').addEventListener('click', () => { ui.mapOpen = false; renderUi(true); $('#map-toggle').focus(); });
$('#map-overview').addEventListener('click', () => { finishDrag(); renderer.camera.overview(); renderer.resize(game.area, ui); ui.hover = null; refreshHover(); });
function jumpMap(event) {
  if (ui.screen !== 'workshop' || practice || !ui.mapOpen || document.querySelector('dialog[open]')) return;
  event.preventDefault(); finishDrag();
  const rect = $('#factory-minimap').getBoundingClientRect();
  const [mapW, mapH] = game.worldArea;
  const x = Math.max(0, Math.min(mapW, (event.clientX - rect.left) / rect.width * mapW));
  const y = Math.max(0, Math.min(mapH, (event.clientY - rect.top) / rect.height * mapH));
  renderer.camera.zoom = Math.max(1, renderer.camera.zoom); renderer.camera.centerOn(x, y); renderer.resize(game.area, ui); ui.hover = null;
  $('#factory-minimap').focus();
}
$('#factory-minimap').addEventListener('pointerdown', jumpMap);
$('#factory-minimap').addEventListener('keydown', event => {
  if (ui.screen !== 'workshop' || practice || !ui.mapOpen || document.querySelector('dialog[open]')) return;
  const delta = { ArrowRight: [4, 0], ArrowDown: [0, 4], ArrowLeft: [-4, 0], ArrowUp: [0, -4] }[event.key];
  if (!delta) return; event.preventDefault(); finishDrag();
  renderer.camera.centerOn(renderer.camera.x / 72 + delta[0], renderer.camera.y / 72 + delta[1]); renderer.resize(game.area, ui); ui.hover = null;
});
$('#focus-view').addEventListener('click', () => { finishDrag(); ui.focus = !ui.focus; ui.ordersOpen = false; ui.inspectorOpen = false; ui.hover = null; renderUi(true); });
canvas.addEventListener('wheel', event => { if (ui.screen !== 'workshop' || document.querySelector('dialog[open]')) return; event.preventDefault(); finishDrag(); renderer.zoom(Math.exp(-Math.max(-150, Math.min(150, event.deltaY)) * .0025), event.clientX, event.clientY); lastPointer = { x: event.clientX, y: event.clientY }; refreshHover(); }, { passive: false });
$('#motion-toggle').addEventListener('click', toggleMotion);
$('#settings-motion').addEventListener('click', toggleMotion);
$('#menu-play').addEventListener('click', () => !hasSave && !tutorialSeen && !protectOriginalSave ? startTutorial() : enterWorkshop());
$('#menu-packing').addEventListener('click', startPacking);
$('#menu-kitchen').addEventListener('click', () => { if (assets.ready) { finishDrag(); save(); ui.screen = 'kitchen'; previousTime = performance.now(); renderUi(true); kitchenView.open(); } });
$('#kitchen-home').addEventListener('click', enterMenu);
$('#menu-sort').addEventListener('click', () => { if (assets.ready) { finishDrag(); save(); ui.screen = 'sorting'; previousTime = performance.now(); renderUi(true); sortingView.open(); } });
$('#sort-home').addEventListener('click', enterMenu);
$('#menu-craft').addEventListener('click', openCraft);
$('#craft-toggle').addEventListener('click', openCraft);
$('#craft-back').addEventListener('click', () => leaveCraft());
$('#craft-pause').addEventListener('click', () => { craftingView.cancel(); ui.craftPaused = !ui.craftPaused; previousTime = performance.now(); craftingView.info(); save(); });
$('#handmade-place').addEventListener('click', selectHandmade);
$('#packing-claim').addEventListener('click', () => action(game.claimOrder(), '套餐目标完成'));
$('#packing-recipe').addEventListener('click', () => { ui.recipeItem = game.state.packingTrial?.goal === 0 ? 'breakfast_box' : 'tea_box'; openQuickRecipe(); });
$('#menu-tutorial').addEventListener('click', startTutorial);
$('#help-tutorial').addEventListener('click', startTutorial);
$('#tutorial-retry').addEventListener('click', startTutorial);
$('#tutorial-exit').addEventListener('click', () => leaveTutorial());
$('#menu-home').addEventListener('click', enterMenu);
$('#menu-new').addEventListener('click', () => requestRestart('new'));
$('#menu-restore').addEventListener('click', () => requestRestart('restore'));
$('#restart-cancel').addEventListener('click', () => $('#restart-dialog').close());
$('#restart-confirm').addEventListener('click', confirmRestart);
$('#menu-settings').addEventListener('click', () => $('#settings-dialog').showModal());
$('#close-settings').addEventListener('click', () => $('#settings-dialog').close());
$('#menu-recipes').addEventListener('click', () => $('#recipe-dialog').showModal());
$('#recipes-toggle').addEventListener('click', () => { if (ui.recipeOpen) { ui.recipeOpen = false; renderQuickRecipe(); } else openQuickRecipe(); });
$('#close-quick-recipe').addEventListener('click', () => { ui.recipeOpen = false; renderQuickRecipe(); });
$('#quick-recipe-food').addEventListener('change', event => { if (visibleRecipes().some(([item]) => item === event.target.value)) { ui.recipeItem = event.target.value; renderQuickRecipe(); } });
$('#career-toggle').addEventListener('click', openCareer);
$('#menu-career').addEventListener('click', openCareer);
$('#menu-business').addEventListener('click', openBusiness);
$('#business-toggle').addEventListener('click', openBusiness);
$('#close-business').addEventListener('click', () => $('#business-dialog').close());
$('#business-back').addEventListener('click', () => { $('#business-dialog').close(); enterWorkshop(); });
$('#business-locate-depot').addEventListener('click', locateDepot);
$('#business-trade-tab').addEventListener('click', () => { ui.businessTab = 'trade'; renderBusiness(); });
$('#business-goals-tab').addEventListener('click', () => { ui.businessTab = 'goals'; renderBusiness(); });
$('#close-career').addEventListener('click', () => $('#career-dialog').close());
$('#career-contracts-tab').addEventListener('click', () => { ui.careerTab = 'contracts'; renderCareer(); });
$('#career-research-tab').addEventListener('click', () => { ui.careerTab = 'research'; renderCareer(); });
$('#open-recipes').addEventListener('click', () => { $('#help-dialog').close(); if (ui.screen === 'workshop') openQuickRecipe(); else $('#recipe-dialog').showModal(); });
document.addEventListener('pointerup', event => { const button = event.target?.closest?.('button'); if (button && !button.disabled && button.id !== 'loading-dough' && button.dataset.customerSlot === undefined) bounceElement(button); });
$('#help').addEventListener('click', () => $('#help-dialog').showModal());
for (const selector of ['#close-help', '#help-done']) $(selector).addEventListener('click', () => $('#help-dialog').close());
$('#close-recipes').addEventListener('click', () => $('#recipe-dialog').close());
window.addEventListener('keydown', event => {
  if (ui.screen === 'sorting') {
    if (event.key === 'Escape' && !event.repeat) { event.preventDefault(); if (sortingView.shopOpen) sortingView.closeShop(); else sortingView.pause(!sortingView.game.round?.paused); }
    return;
  }
  if (ui.screen === 'kitchen') {
    if (event.key === 'Escape' && !event.repeat) { event.preventDefault(); if (kitchenView.decorOpen) kitchenView.closeDecor(); else kitchenView.pause(!kitchenView.game.shift?.paused); }
    return;
  }
  if (ui.screen === 'craft') {
    if (event.key === 'Escape') { event.preventDefault(); leaveCraft(); }
    return;
  }
  if (ui.screen !== 'workshop') return;
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) || document.querySelector('dialog[open]')) return;
  if (ui.focus && event.key !== 'Escape') return;
  if (event.key.toLowerCase() === 'r') { event.preventDefault(); rotate(); }
  if (event.key.toLowerCase() === 'f') { event.preventDefault(); if (ui.recipeOpen) { ui.recipeOpen = false; renderQuickRecipe(); } else openQuickRecipe(); }
  if (event.key === ' ' && document.activeElement?.tagName !== 'BUTTON') { event.preventDefault(); pause(); }
  if (event.key === 'Escape') { ui.recipeOpen = false; ui.ordersOpen = false; ui.focus = false; chooseTool('select'); }
  if (event.key === 'Delete' || event.key === 'Backspace') { const b = game.state.buildings.find(b => b.id === ui.selected); if (b && document.activeElement === canvas) { event.preventDefault(); removeBuilding(b); } }
  if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(event.key) && document.activeElement === canvas) {
    event.preventDefault(); const [w, h] = game.area, pos = ui.hover || { x: 0, y: 0 };
    const delta = { ArrowRight: [1, 0], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowUp: [0, -1] }[event.key];
    ui.hover = { x: Math.max(0, Math.min(w - 1, pos.x + delta[0])), y: Math.max(0, Math.min(h - 1, pos.y + delta[1])) };
    renderer.camera.ensureCell(ui.hover.x, ui.hover.y); renderer.resize(game.area, ui);
  }
  if (event.key === 'Enter' && document.activeElement === canvas && ui.hover) { event.preventDefault(); useCell(ui.hover); }
});
document.addEventListener('visibilitychange', () => { if (document.hidden) { finishDrag(); craftingView.cancel(); if (ui.screen === 'sorting') sortingView.pause(true); if (ui.screen === 'kitchen') kitchenView.pause(true); save(); } previousTime = performance.now(); });
window.addEventListener('pagehide', save);
let previousTime = performance.now(), previousSave = previousTime, previousUi = 0;
function frame(now) {
  const dt = Math.min(.1, Math.max(0, (now - previousTime) / 1000)); previousTime = now;
  if (ui.screen === 'workshop' && !document.hidden && !document.querySelector('dialog[open]') && (!practice || (practice.step >= 2 && practice.step < 5))) game.update(dt);
  if (ui.screen === 'craft') { if (!document.hidden) craftingView.step(dt); craftingView.draw(now, ui.reducedMotion); }
  if (ui.screen === 'kitchen' && !document.hidden) kitchenView.step(dt);
  if (ui.screen === 'workshop') { renderer.draw(game, ui, now); if (!$('#minimap-panel').hidden) renderer.drawMinimap($('#factory-minimap'), game); }
  $('#zoom-reset').textContent = `${Math.round(renderer.camera.zoom * 100)}%`;
  if (now - previousUi > 160) { renderUi(); previousUi = now; }
  if (now - previousSave > 2000) { save(); previousSave = now; }
  requestAnimationFrame(frame);
}
try {
  await assets.load(undefined, (loaded, total) => window.factoryLoading?.progress(loaded, total));
  renderPalette(); renderRecipes(); renderUi(true);
  $('#handmade-icon').append(assets.icon(CRAFT_ITEM, 38));
  window.factoryLoading?.complete();
  $('#loading').hidden = true; $('#main-menu').inert = false;
  save(); requestAnimationFrame(frame);
} catch (error) {
  window.factoryLoading?.fail();
  $('#loading-status').textContent = '没加载成功，再试一次';
  $('#loading-retry').hidden = false;
  if (!window.factoryLoading) $('#loading-retry').addEventListener('click', () => window.location.reload());
  console.error(error);
}
export const runtime = { get game() { return game; }, get practice() { return practice; }, assets, renderer, craftingView, kitchenView, sortingView, ui };
