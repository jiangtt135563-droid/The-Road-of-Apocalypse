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
      schools:'逐风射手 / 短铳射手',
      base: { damage: 9, attackInterval: 0.55, attackRange: 470, projectileSpeed: 640 } },
    mage: { key:'mage', name:'法师', color:'#9b59d0',
      desc:'中距离法术轰炸（占位）',
      schools:'坠星法师 / 巫师',
      base: { damage: 18, attackInterval: 1.15, attackRange: 350, spellRadius: 62 } },
  },
  defaultPose: 'warrior',

  // 怪物（占位）：造型参考用户小怪初稿——团状身体、点状眼、锯齿嘴、抬起的小手
  monsters: {
    grunt: { name:'小怪',   hp: 30,   speed: 85, radius: 22, damage: 6,  touchInterval: 0.6, xp: 1, color:'#9aa0a6' },
    elite: { name:'精英',   hp: 170,  speed: 95, radius: 34, damage: 12, touchInterval: 0.6, xp: 6, color:'#f2a13c' },
    boss:  { name:'最终怪物', hp: 2600, speed: 55, radius: 64, damage: 20, touchInterval: 0.6, xp: 0, color:'#e05252' },
  },

  // 关卡节奏（占位）
  level: {
    xpBase: 6, xpGrowth: 3,
    levelUpHeal: 0.3,
    bossTime: 100,              // 开局 100 秒刷最终怪物（占位）
    spawnInterval: 1.1,
    maxMonsters: 40,
    eliteEvery: 25,
  },

  // 主页挂机演示参数（占位）
  idle: { maxMonsters: 3, respawnDelay: 1.2 },
};
