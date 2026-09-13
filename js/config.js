// config.js —— 《天启之路》占位框架数值配置 v0.2
// 依据《战力系统与第一批天启之力 v0.1》：三种天启之姿 × 六流派，42张天启之力。
// 以下全部数值均为占位值，仅用于跑通机制与验证手感，最终数值待测试确定。
window.CONFIG = {
  DESIGN_W: 720,
  DESIGN_H: 1280,

  // 天选者基础属性（占位）
  player: {
    maxHp: 100,
    moveSpeed: 210,        // px/s，软上限见 entities.js
    pickupRadius: 90,
  },

  // 三种天启之姿：进关用基础攻击作战，流派核心（见 cards.js）改变玩法
  poses: {
    warrior: { key:'warrior', name:'战士', color:'#e2574c',
      desc:'近距离挥砍，自动攻击周围的敌人（占位）',
      schools:'漂泊剑客 / 重骑士',
      base: { damage: 16, attackInterval: 0.75, attackRange: 115 } },
    archer: { key:'archer', name:'射手', color:'#39b54a',
      desc:'远距离自动射击最近的敌人（占位）',
      schools:'逐风射手 / 火炮射手',
      base: { damage: 10, attackInterval: 0.55, attackRange: 470, projectileSpeed: 640 } },
    mage: { key:'mage', name:'法师', color:'#9b59d0',
      desc:'中距离法术轰炸（占位）',
      schools:'坠星法师 / 巫师',
      base: { damage: 18, attackInterval: 1.15, attackRange: 350, spellRadius: 62 } },
  },
  defaultPose: 'warrior',

  // 怪物（占位）：造型参考用户小怪初稿——团状身体、点状眼、锯齿嘴、抬起的小手
  // 速度需让玩家在走位中也能被追上交战（v0.2 大地图调参）
  monsters: {
    grunt: { name:'小怪',   hp: 30,   speed: 118, radius: 22, damage: 6,  touchInterval: 0.6, xp: 2, color:'#9aa0a6' },
    elite: { name:'精英',   hp: 170,  speed: 128, radius: 34, damage: 12, touchInterval: 0.6, xp: 12, color:'#f2a13c' },
    boss:  { name:'最终怪物', hp: 2600, speed: 72, radius: 64, damage: 20, touchInterval: 0.6, xp: 0, color:'#e05252' },
  },

  // 地图主题（天梯轮换）：每 perMap 关切换一次主题
  maps: [
    { key:'grassland', name:'草原',
      palette:{ ground:'#79b356', patch:'#84bd61', grass:'#5d9b44', trunk:'#8d5a2b', canopy:'#2f6b1f', canopy2:'#3f8328' } },
    { key:'snowfield', name:'雪原',
      palette:{ ground:'#d9e7f0', patch:'#e8f2f8', grass:'#a9c6d6', trunk:'#6b7b8c', canopy:'#48756a', canopy2:'#5c9470' } },
    { key:'desert', name:'沙漠',
      palette:{ ground:'#e2c48c', patch:'#eed9ac', grass:'#c9a86a', trunk:'#9c7a3c', canopy:'#6f9e4a', canopy2:'#83b258' } },
    { key:'hell', name:'地狱',
      palette:{ ground:'#4a2430', patch:'#582c3a', grass:'#7a3b4a', trunk:'#38202a', canopy:'#8c2f2f', canopy2:'#a63c3c' } },
  ],

  // 天梯闯关（用户 2026-09-13 定）：先做100关（最终目标1000关）。
  // 难度/战力需求 100→1000 成长；锚点：白板战力可通 1~10 关（越打越吃力），11 关起需养成。
  ladder: {
    levels: 100,          // 当前关卡总数
    perMap: 25,           // 每张主题地图轮换的关数
    // 难度曲线（占位锚定：白板成型后约可通10关，11关起小怪伤害开始致命；经真实试玩后可微调三个系数）
    hp(n)   { return 1 + 0.18*(n-1) + 0.012*(n-1)*(n-1); },
    dmg(n)  { return 1 + 0.16*(n-1); },
    boss(n) { return CONFIG.ladder.hp(n) * 1.6; },
    speed(n){ return 1; },
  },
  mapForLevel(n) { return CONFIG.maps[Math.min(CONFIG.maps.length - 1, Math.floor((n - 1) / CONFIG.ladder.perMap))]; },
  levelMul(n) {
    const L = CONFIG.ladder;
    return { hp: L.hp(n), dmg: L.dmg(n), boss: L.boss(n) };
  },

  // 一关内天启之力选择次数上限（含第1次流派核心；用户 2026-09-13 定）
  maxPicks: 15,

  // 关卡节奏（占位）
  level: {
    xpBase: 4, xpGrowth: 2,
    levelUpHeal: 0.3,
    bossTime: 100,              // 开局 100 秒刷最终怪物（占位）
    spawnInterval: 1.1,
    maxMonsters: 40,
    eliteEvery: 25,
  },

  // 主页挂机演示参数（占位）
  idle: { maxMonsters: 3, respawnDelay: 1.2 },
};


