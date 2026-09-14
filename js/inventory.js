// inventory.js —— 角色独立装备、商店、材料与锻造（v0.4）
(function () {
  const SAVE_KEY = 'tianqi_inventory_v2';
  const OLD_SAVE_KEY = 'tianqi_inventory_v1';
  const POSES = ['warrior', 'archer', 'mage'];
  const ITEMS = [
    { id:'eq-ironblade', name:'基础铁刀', icon:'刀', category:'equipment', slot:'weapon', poses:['warrior'], rarity:'common', price:120,
      desc:'战士使用的基础兵刃，简单、可靠。', stats:{ damage:8 } },
    { id:'eq-basicbow', name:'基础猎弓', icon:'弓', category:'equipment', slot:'weapon', poses:['archer'], rarity:'common', price:140,
      desc:'射手使用的轻弓，略微提升攻速。', stats:{ damage:5, attackSpeed:7 } },
    { id:'eq-oakstaff', name:'基础橡木杖', icon:'杖', category:'equipment', slot:'weapon', poses:['mage'], rarity:'common', price:150,
      desc:'法师使用的入门法杖，可放大法术范围。', stats:{ damage:6, area:6 } },
    { id:'eq-traveler', name:'基础皮甲', icon:'衣', category:'equipment', slot:'armor', poses:POSES, rarity:'common', price:180,
      desc:'三种天启之姿都能穿戴的轻便护甲。', stats:{ hp:12, moveSpeed:6 } },
    { id:'eq-windbow', name:'逐风猎弓', icon:'风', category:'equipment', slot:'weapon', poses:['archer'], rarity:'rare',
      desc:'以风晶锻成的猎弓，兼顾伤害、攻速与移动。', stats:{ damage:8, attackSpeed:10, moveSpeed:12 } },
    { id:'eq-guard', name:'守誓胸甲', icon:'甲', category:'equipment', slot:'armor', poses:POSES, rarity:'rare',
      desc:'用黯铁与兽皮共同锻成的坚固胸甲。', stats:{ hp:26, damageReduce:5 } },
    { id:'eq-star', name:'坠星吊坠', icon:'星', category:'equipment', slot:'charm', poses:POSES, rarity:'epic',
      desc:'稀有天启结晶制成的护符，扩大攻击与拾取范围。', stats:{ area:12, pickup:25 } },
    { id:'eq-wolf', name:'荒原狼牙', icon:'牙', category:'equipment', slot:'charm', poses:POSES, rarity:'rare',
      desc:'用完整兽皮与狼牙制成，散发着荒原野性。', stats:{ damage:6, attackSpeed:5 } },
    { id:'mat-ore', name:'黯铁矿', icon:'矿', category:'material', rarity:'common', desc:'普通怪和精英怪可能掉落，用于锻造护甲和武器。' },
    { id:'mat-hide', name:'荒兽皮', icon:'皮', category:'material', rarity:'common', desc:'怪物身上取得的坚韧材料。' },
    { id:'mat-crystal', name:'天启结晶', icon:'晶', category:'material', rarity:'epic', desc:'精英和最终怪物可能掉落的稀有材料。' },
    { id:'use-attack-elixir', name:'攻击灵丹', icon:'丹', category:'consumable', rarity:'rare', price:5000,
      desc:'购买即服用，全职业永久攻击力×1.1；重复购买按当前攻击力继续提升10%。' },
    { id:'use-potion', name:'生命药剂（旧）', icon:'药', category:'consumable', rarity:'rare',
      desc:'可重复购买的消耗品。（战斗中使用功能待接入）' },
  ];
  const RECIPES = [
    { id:'craft-windbow', result:'eq-windbow', cost:{ 'mat-ore':8, 'mat-crystal':1 } },
    { id:'craft-guard', result:'eq-guard', cost:{ 'mat-ore':10, 'mat-hide':5 } },
    { id:'craft-wolf', result:'eq-wolf', cost:{ 'mat-hide':9, 'mat-ore':3 } },
    { id:'craft-star', result:'eq-star', cost:{ 'mat-crystal':3, 'mat-ore':6 } },
  ];
  const SLOT_NAMES = { weapon:'武器', armor:'护甲', charm:'护符' };
  const STAT_NAMES = { damage:'伤害', hp:'生命', attackSpeed:'攻速', moveSpeed:'移速', area:'范围', pickup:'拾取', damageReduce:'减伤' };
  const PERCENT_STATS = new Set(['damage','attackSpeed','area','pickup','damageReduce']);
  const emptyLoadouts = () => Object.fromEntries(POSES.map(p => [p, { weapon:null, armor:null, charm:null }]));
  const defaults = { version:2, attackElixirs:0, coins:500, quantities:{ 'eq-ironblade':1, 'mat-ore':4 }, equippedByPose:emptyLoadouts() };
  defaults.equippedByPose.warrior.weapon = 'eq-ironblade';

  function get(id) { return ITEMS.find(x => x.id === id); }
  function validLoadouts(raw) {
    const out = emptyLoadouts();
    POSES.forEach(pose => Object.keys(SLOT_NAMES).forEach(slot => {
      const id = raw && raw[pose] && raw[pose][slot], item = get(id);
      if (item && item.slot === slot && item.poses.includes(pose)) out[pose][slot] = id;
    }));
    return out;
  }
  function migrateOld() {
    try {
      const old = JSON.parse(localStorage.getItem(OLD_SAVE_KEY));
      if (!old) return null;
      const next = structuredClone(defaults);
      (old.owned || []).forEach(id => { if (get(id)) next.quantities[id] = Math.max(1, next.quantities[id] || 0); });
      Object.values(old.equipped || {}).forEach(id => {
        const item = get(id); if (!item) return;
        const pose = item.poses[0]; next.equippedByPose[pose][item.slot] = id;
      });
      return next;
    } catch (_) { return null; }
  }
  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (!raw) return migrateOld() || structuredClone(defaults);
      const quantities = {};
      Object.entries(raw.quantities || {}).forEach(([id, n]) => { if (get(id) && Number.isFinite(n) && n > 0) quantities[id] = Math.floor(n); });
      const attackElixirs = Number.isSafeInteger(raw.attackElixirs) && raw.attackElixirs >= 0 ? raw.attackElixirs : 0;
      return { version:2, attackElixirs, coins:Math.max(0, Math.floor(Number(raw.coins) || 0)), quantities, equippedByPose:validLoadouts(raw.equippedByPose) };
    } catch (_) { return structuredClone(defaults); }
  }
  let state = load(), onChange = null;
  function save() { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); }
  function changed(kind) { save(); if (onChange) onChange(kind); }
  function count(id) { return state.quantities[id] || 0; }
  function owns(id) { return count(id) > 0; }
  function ownedItems() { return ITEMS.filter(x => owns(x.id)); }
  function getLoadout(pose) { return state.equippedByPose[pose] || state.equippedByPose.warrior; }
  function equip(id, pose) {
    const item = get(id); pose = POSES.includes(pose) ? pose : 'warrior';
    if (!item || item.category !== 'equipment' || !owns(id) || !item.poses.includes(pose)) return false;
    getLoadout(pose)[item.slot] = id; changed('equip'); return true;
  }
  function unequip(slot, pose) {
    if (!(slot in SLOT_NAMES) || !POSES.includes(pose)) return false;
    getLoadout(pose)[slot] = null; changed('equip'); return true;
  }
  function add(id, amount = 1, silent = false) {
    if (!get(id) || amount <= 0) return false;
    state.quantities[id] = count(id) + Math.floor(amount); if (!silent) changed('item'); return true;
  }
  function addCoins(amount, silent = false) {
    state.coins = Math.max(0, state.coins + Math.floor(amount)); if (!silent) changed('coins');
  }
  function buy(id) {
    const item = get(id);
    if (!item || !item.price || state.coins < item.price) return { ok:false, reason:'金币不足' };
    if (item.category === 'equipment' && owns(id)) return { ok:false, reason:'已经拥有' };
    if (id === 'use-attack-elixir') {
      state.coins -= item.price; state.attackElixirs++;
      changed('attack-elixir'); return { ok:true, item };
    }
    state.coins -= item.price; state.quantities[id] = count(id) + 1; changed('buy'); return { ok:true, item };
  }
  function canCraft(recipe) { return Object.entries(recipe.cost).every(([id, n]) => count(id) >= n); }
  function craft(recipeId) {
    const recipe = RECIPES.find(x => x.id === recipeId), result = recipe && get(recipe.result);
    if (!recipe || !result) return { ok:false, reason:'配方不存在' };
    if (owns(result.id)) return { ok:false, reason:'已经拥有' };
    if (!canCraft(recipe)) return { ok:false, reason:'材料不足' };
    Object.entries(recipe.cost).forEach(([id, n]) => state.quantities[id] -= n);
    state.quantities[result.id] = 1; changed('craft'); return { ok:true, item:result };
  }
  function totals(pose) {
    const out = {};
    Object.values(getLoadout(pose)).forEach(id => {
      const item = get(id); if (!item || !item.stats) return;
      Object.entries(item.stats).forEach(([key, value]) => out[key] = (out[key] || 0) + value);
    });
    return out;
  }
  function applyBonuses(player) {
    const s = player.stats, t = totals(player.poseKey);
    s.maxHp += t.hp || 0; s.hp = s.maxHp;
    s.damageMul *= (1 + (t.damage || 0) / 100) * Math.pow(1.1, state.attackElixirs); s.rateMul *= 1 + (t.attackSpeed || 0) / 100;
    s.moveSpeed += t.moveSpeed || 0; s.areaMul *= 1 + (t.area || 0) / 100;
    s.pickupMul *= 1 + (t.pickup || 0) / 100; s.dr = Math.min(.75, s.dr + (t.damageReduce || 0) / 100);
  }
  function statText(stats = {}) {
    return Object.entries(stats || {}).map(([key, value]) => `${STAT_NAMES[key]} +${value}${PERCENT_STATS.has(key) ? '%' : ''}`);
  }
  function power(pose) {
    const t = totals(pose);
    return Math.round(100 + (t.damage || 0)*3 + (t.hp || 0)*1.2 + (t.attackSpeed || 0)*2 +
      (t.moveSpeed || 0) + (t.area || 0)*1.5 + (t.pickup || 0)*.5 + (t.damageReduce || 0)*5);
  }

  window.InventorySystem = { items:ITEMS, recipes:RECIPES, poses:POSES, state, slotNames:SLOT_NAMES,
    get, count, owns, ownedItems, getLoadout, equip, unequip, add, addCoins, buy, canCraft, craft,
    totals, applyBonuses, statText, power, setOnChange(fn){ onChange = fn; }, save };
})();
