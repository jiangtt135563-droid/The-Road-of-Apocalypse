// entities.js —— 实体与六流派机制（占位绘制：色块+文字，后续替换正式美术）
// 依据《战力系统与第一批天启之力 v0.1》：护盾/减伤、穿透衰减、中毒/易伤/减速/冰冻/反水、
// 剑气、双响装填、陨石落点、风行等机制均在本文件实现（占位数值）。
(function () {
  const W = CONFIG.DESIGN_W, H = CONFIG.DESIGN_H;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function drawText(ctx, text, x, y, font, color, align = 'center') {
    ctx.font = typeof font === 'number' ? font + 'px sans-serif' : font;
    ctx.textAlign = align; ctx.textBaseline = 'middle';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.75)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color; ctx.fillText(text, x, y);
  }

  /* ==================== 主角立绘资产（class-forms 9张透明PNG，1334×1179 俯视） ==================== */
  const SPRITE_FILES = {
    warrior: 'assets/base-warrior.png',
    archer: 'assets/base-archer.png',
    mage: 'assets/base-mage.png',
    piaobo: 'assets/warrior-wandering-swordsman.png',
    zhongqi: 'assets/warrior-heavy-knight.png',
    zhufeng: 'assets/archer-windrunner.png',
    duanshou: 'assets/archer-double-barrel-gunner.png',
    zhuixing: 'assets/mage-meteor.png',
    wushi: 'assets/mage-warlock.png',
  };
  const SPRITES = {};
  for (const k in SPRITE_FILES) {
    const img = new Image();
    img.src = SPRITE_FILES[k];
    SPRITES[k] = img;
  }

  /* ==================== 攻击特效图集（assets/effects 7张，网格排布） ==================== */
  const FX_SHEETS = {};
  const FX_SHEET_DEFS = {
    swordsman:   { file: 'assets/effects/effects-wandering-swordsman.png', cols: 2, rows: 2 },  // 0蓝小月牙 1蓝大月牙 2金小拖尾(行迹) 3金大月牙(断空)
    heavyKnight: { file: 'assets/effects/effects-heavy-knight.png',        cols: 3, rows: 1 },  // 0盾击火花 1反击震波 2盾破石环
    windArcher:  { file: 'assets/effects/effects-wind-archer.png',         cols: 3, rows: 1 },  // 0风旋箭 1强化蓝金箭 2青色光矢
    gunner:      { file: 'assets/effects/effects-double-barrel-gunner.png', cols: 2, rows: 2 }, // 0灰弹 1火弹 2双爆花 3终结爆发
    meteorMage:  { file: 'assets/effects/effects-meteor-mage.png',         cols: 3, rows: 2 },  // 0落点法阵 1陨石 2爆炸 3碎星 4巨型法阵 5巨型爆发
    warlock:     { file: 'assets/effects/effects-warlock.png',             cols: 4, rows: 2 },  // 0毒箭 1毒液溅 2毒雾 3紫晶(易伤) 4寒雾(减速) 5冰晶环 6倒戈漩涡 7毒花爆发
    baseAtk:     { file: 'assets/effects/effects-base-attacks.png',        cols: 3, rows: 1 },  // 0白月牙(近战扫击) 1木箭 2蓝紫法球
  };
  for (const name in FX_SHEET_DEFS) {
    const def = FX_SHEET_DEFS[name];
    def.img = new Image();
    def.img.src = def.file;
    FX_SHEETS[name] = def;
  }

  /* ==================== 行走帧动画（assets/anim/<class>/move-01..04） ==================== */
  // 帧为黑底不透明图：加载时自动抠像（边缘泛洪去黑底 + 仅保留最大连通块去切片碎片）并裁剪
  const WALK_FRAMES = {};   // classKey -> [处理后的canvas ×4]
  function processWalkFrame(img) {
    const cv = document.createElement('canvas');
    cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    const c2 = cv.getContext('2d');
    c2.drawImage(img, 0, 0);
    const id = c2.getImageData(0, 0, cv.width, cv.height);
    const d = id.data, Wp = cv.width, Hp = cv.height;
    const isBg = i => d[i] < 42 && d[i + 1] < 42 && d[i + 2] < 42;   // 近黑背景
    // 1. 边缘泛洪抠黑底（保留角色内部的深色描边）
    const stack = [];
    for (let x = 0; x < Wp; x++) { stack.push(x, (Hp - 1) * Wp + x); }
    for (let y = 0; y < Hp; y++) { stack.push(y * Wp, y * Wp + Wp - 1); }
    while (stack.length) {
      const i = stack.pop();
      if (d[i + 3] === 0 || !isBg(i)) continue;
      d[i + 3] = 0;
      const x = i % Wp;
      if (x > 0) stack.push(i - 1);
      if (x < Wp - 1) stack.push(i + 1);
      if (i >= Wp) stack.push(i - Wp);
      if (i < Wp * (Hp - 1)) stack.push(i + Wp);
    }
    // 2. 只保留最大连通块（去除图集切片串入的相邻帧碎片）
    const label = new Int32Array(Wp * Hp).fill(-1);
    let bestId = -1, bestCount = 0, cur = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0 || label[i] >= 0) continue;
      let count = 0;
      const st = [i]; label[i] = cur;
      while (st.length) {
        const j = st.pop(); count++;
        const x = j % Wp;
        if (x > 0) { if (d[(j - 1) * 4 + 3] > 0 && label[j - 1] < 0) { label[j - 1] = cur; st.push(j - 1); } }
        if (x < Wp - 1) { if (d[(j + 1) * 4 + 3] > 0 && label[j + 1] < 0) { label[j + 1] = cur; st.push(j + 1); } }
        if (j >= Wp) { if (d[(j - Wp) * 4 + 3] > 0 && label[j - Wp] < 0) { label[j - Wp] = cur; st.push(j - Wp); } }
        if (j < Wp * (Hp - 1)) { if (d[(j + Wp) * 4 + 3] > 0 && label[j + Wp] < 0) { label[j + Wp] = cur; st.push(j + Wp); } }
      }
      if (count > bestCount) { bestCount = count; bestId = cur; }
      cur++;
    }
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0 && label[i] !== bestId) d[i + 3] = 0;
    c2.putImageData(id, 0, 0);
    // 3. 裁剪到内容包围盒
    let minX = Wp, minY = Hp, maxX = 0, maxY = 0;
    for (let y = 0; y < Hp; y++) for (let x = 0; x < Wp; x++) {
      if (d[(y * Wp + x) * 4 + 3] > 0) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
    const out = document.createElement('canvas');
    out.width = Math.max(1, maxX - minX + 1); out.height = Math.max(1, maxY - minY + 1);
    out.getContext('2d').drawImage(cv, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
    return out;
  }
  for (const cls of ['warrior', 'archer', 'mage']) {
    WALK_FRAMES[cls] = [];
    for (let i = 1; i <= 4; i++) {
      const img = new Image();
      img.src = `assets/anim/${cls}/move-0${i}.png`;
      WALK_FRAMES[cls].push(null);   // 占位：处理完成前视为未就绪
      img.onload = () => { try { WALK_FRAMES[cls][i - 1] = processWalkFrame(img); } catch (e) { console.warn('walk frame fail', cls, i, e); } };
    }
  }

  /* 一次性特效实例：从图集取一格绘制，随寿命淡出 */
  class FxSprite {
    constructor(sheet, cell, x, y, size, opts = {}) {
      this.sheet = sheet; this.cell = cell;
      this.x = x; this.y = y; this.size = size;
      this.rot = opts.rot || 0; this.dur = opts.dur || 0.35;
      this.life = this.dur; this.dead = false;
    }
    update(dt) { this.life -= dt; if (this.life <= 0) this.dead = true; }
    draw(ctx) {
      const def = FX_SHEETS[this.sheet];
      if (!def.img.complete || !def.img.naturalWidth) return;
      const cw = def.img.naturalWidth / def.cols, ch = def.img.naturalHeight / def.rows;
      const col = this.cell % def.cols, row = Math.floor(this.cell / def.cols);
      ctx.save();
      ctx.globalAlpha = Math.max(0, this.life / this.dur);
      ctx.translate(this.x, this.y);
      if (this.rot) ctx.rotate(this.rot);
      ctx.drawImage(def.img, col * cw, row * ch, cw, ch, -this.size / 2, -this.size / 2, this.size, this.size);
      ctx.restore();
    }
  }
  // 伤害统一入口：精英/最终怪物增伤 + 易伤在 Monster.takeDamage 内处理
  function Elite(info) { return info; }

  /* ==================== 天选者 ==================== */
  class Player {
    constructor(poseKey) { this.setPose(poseKey); this.resetRun(); }
    setPose(k) { this.poseKey = k; this.pose = CONFIG.poses[k]; }

    resetRun() {
      const P = CONFIG.player;
      this.x = W / 2; this.y = H * 0.62; this.radius = 24;
      this.cards = {};
      this.stats = {
        maxHp: P.maxHp, hp: P.maxHp, moveSpeed: P.moveSpeed,
        shieldMax: 0, dr: 0,
        damageMul: 1, rateMul: 1, rangeMul: 1, areaMul: 1, pickupMul: 1,
        eliteDmg: 1,
        hoT: { t: 5, amt: 0, pause: 0 },
        core: null,
        // 漂泊剑客
        qi: { dmgMul: .6, range: 420, width: 70, speed: 470, pierce: 3, pierceAdd: 0,
              falloff: .15, sideDmg: 0, sideSign: 1, chargeNeed: 0, chargeMul: 1.5,
              giantEvery: 0, giantDmg: 3.5 },
        // 重骑士
        knight: { regen: 6, delay: 3, bash: 0, thorns: 0, thornR: 110, lowAt: .4, lowBonus: 0,
                  rebirth: false, recast: 0 },
        // 逐风射手
        wind: { stack: false, stackMax: 0, stacks: 0, t: 0, dist: 0,
                combo: 0, comboN: 0, comboTarget: null, split: 0, splitGen: 1, windform: false,
                rampCap: 0, rampPer: 0.04, rampStacks: 0 },
        // 火炮射手
        gun: { per: 1.9, reload: 1.7, pierce: 1, pierceAdd: 0, falloff: .2, closeAt: .35,
               closeBonus: 0, secondMul: 1, secondBonus: 0, moveReload: 0, bulletAdd: 0, megaEvery: 0 },
        // 坠星法师
        star: { dmgMul: 1.5, radius: 95, delay: .6, center: 0, frag: 0, follow: 0,
                followMul: .6, giantEvery: 0, count: 0 },
        // 巫师
        witch: { max: 6, dur: 4, dps: .8, spreadR: 0, vulnAt: 0, vulnAmt: 0, slow: 0,
                 freeze: 0, charm: 0, charmChance: 0, detonate: 0, dt: 0 },
      };
      if (window.InventorySystem) window.InventorySystem.applyBonuses(this);
      this.shield = 0; this.sinceHit = 99; this.protectT = 0; this.rebirthCd = 0;
      this.level = 1; this.xp = 0; this.xpNeed = CONFIG.level.xpBase;
      this.attackCd = 0; this.fx = 0; this.moveT = 0; this.moving = false;
      this.charged = false; this.qiCount = 0;
      this.gunS = { phase: 'ready', t: 0, cycle: 0, mega: false, lastFirst: null };
      this.windformT = 0;
      this.atkIdle = 0;
      this.facing = 1;                    // 立绘朝向：1右 / -1左
      // 程序化动画状态
      this.walkPhase = 0;                 // 移动步伐相位
      this.idlePhase = 0;                 // 待机呼吸相位
      this.atkAnim = 0;                   // 攻击动作计时（>0 播放中）
      this.atkDur = 0.18;                 // 当前攻击动作总时长（随攻击频率伸缩）
      this.atkDir = { x: 1, y: 0 };       // 攻击方向
      this.transformT = 0;                // 变身过渡剩余时间
      this.transformDur = 1.15;
      this.takenCards = [];
      this.picks = 0;                     // 本局已选天启之力次数（上限 CONFIG.maxPicks）
    }

    get baseDamage() { return this.pose.base.damage * this.stats.damageMul; }
    attackRange() { return this.pose.base.attackRange * this.stats.rangeMul; }
    // 范围圈显示值：短铳流派用其独有短射程，其余用姿态射程（随射程加成同步变化）
    attackVisualRange() {
      if (this.stats.core === 'duanshou') return 320;
      return this.attackRange();
    }
    // 血战不退：低血提高近战伤害
    meleeDmg() {
      const s = this.stats;
      let m = this.baseDamage;
      if (s.knight.lowBonus && s.hp / s.maxHp <= s.knight.lowAt) m *= 1 + s.knight.lowBonus;
      return m;
    }

    // 变身过渡：光束落下 → 新形态显现（选定流派核心时触发）
    startTransform(dur = 1.15) {
      this.transformDur = dur;
      this.transformT = dur;
      this.protectT = Math.max(this.protectT, 1.2);   // 变身期间短暂保护
    }

    gainXp(v, world) {
      this.xp += v;
      while (this.xp >= this.xpNeed) {
        this.xp -= this.xpNeed;
        this.level++;
        this.xpNeed = CONFIG.level.xpBase + (this.level - 1) * CONFIG.level.xpGrowth;
        this.stats.hp = Math.min(this.stats.maxHp, this.stats.hp + this.stats.maxHp * CONFIG.level.levelUpHeal);
        if (world.onLevelUp) world.onLevelUp();
      }
    }

    takeDamage(amount, world) {
      const s = this.stats;
      if (this.protectT > 0) return;
      if (world.debugInvincible) return;          // 测试悬浮球：无敌
      this.sinceHit = 0;
      if (s.hoT.amt) s.hoT.pause = 2;          // 回生之息：受伤暂停恢复
      let d = amount * (1 - s.dr);              // 减伤（重骑士）
      if (this.shield > 0) {                    // 受伤优先扣盾
        const used = Math.min(this.shield, d);
        this.shield -= used; d -= used;
        // 一骑当关：盾破冲击波 + 极短保护 + 延迟重铸
        if (this.shield <= 0 && s.knight.rebirth && this.rebirthCd <= 0) {
          this.rebirthCd = 8; s.knight.recast = 4; this.protectT = 1.2;
          world.shockwave(this.x, this.y, 220 * s.areaMul, this.baseDamage * 4);
          world.spawnFx('heavyKnight', 2, this.x, this.y, 300 * s.areaMul, { dur: 0.55 });
          world.addFloat(this.x, this.y - 46, '一骑当关！', '#ffd54f', 24);
        }
      }
      if (d > 0) { s.hp -= d; world.addFloat(this.x, this.y - 34, '-' + Math.round(d), '#ff7676', 14); }
      // 受击回敬
      if (s.knight.thorns)
        world.shockwave(this.x, this.y, s.knight.thornR * s.areaMul, this.baseDamage * s.knight.thorns);
      // 风行无踪：受伤缩短风行
      if (this.windformT > 0) this.windformT = Math.max(0, this.windformT - 1);
    }

    update(dt, world, dir) {
      const s = this.stats;
      this.moving = !!(dir && (dir.x || dir.y));
      // 移动（软上限 420，占位）；地图边界随世界尺寸；风行/光矢形态加移速
      const sp = Math.min(s.moveSpeed, 420) * (this.windformT > 0 ? 1.4 : 1);
      const BW = world.worldW || W, BH = world.worldH || H;
      if (this.moving) {
        this.x = clamp(this.x + dir.x * sp * dt, this.radius, BW - this.radius);
        this.y = clamp(this.y + dir.y * sp * dt, this.radius, BH - this.radius);
        if (dir.x) this.facing = dir.x > 0 ? 1 : -1;   // 移动转向
      }
      // 计时
      this.sinceHit += dt;
      if (this.protectT > 0) this.protectT -= dt;
      if (this.rebirthCd > 0) this.rebirthCd -= dt;
      if (this.fx > 0) this.fx -= dt;
      if (this.windformT > 0) this.windformT -= dt;
      if (this.atkAnim > 0) this.atkAnim -= dt;
      if (this.transformT > 0) this.transformT -= dt;
      // 程序化动画相位：移动步伐 / 待机呼吸
      this.idlePhase += dt * 2.4;
      if (this.moving) this.walkPhase += dt * 11;
      // 护盾：破裂延迟重铸 / 脱战恢复（血战不退加速）
      if (s.shieldMax > 0) {
        if (this.shield <= 0 && s.knight.recast > 0) {
          s.knight.recast -= dt;
          if (s.knight.recast <= 0) this.shield = s.shieldMax;
        } else if (this.sinceHit > s.knight.delay && this.shield < s.shieldMax) {
          let r = s.knight.regen;
          if (s.knight.lowBonus && s.hp / s.maxHp <= s.knight.lowAt) r *= 2;
          this.shield = Math.min(s.shieldMax, this.shield + r * dt);
        }
      }
      // 回生之息
      if (s.hoT.amt) {
        if (s.hoT.pause > 0) s.hoT.pause -= dt;
        else { s.hoT.t -= dt; if (s.hoT.t <= 0) { s.hoT.t = 5; s.hp = Math.min(s.maxHp, s.hp + s.hoT.amt); } }
      }
      // 百蛊夜行
      if (s.witch.detonate) {
        s.witch.dt += dt;
        if (s.witch.dt >= s.witch.detonate) { s.witch.dt = 0; world.detonatePoison(); }
      }
      // 轻羽步 + 风行无踪 + 逐风连射叠层
      const wd = s.wind;
      if (wd.stack) {
        if (this.moving) {
          wd.t += dt;
          if (wd.t >= 0.5) { wd.t -= 0.5; wd.stacks = Math.min(wd.stackMax, wd.stacks + 1); }
        } else { wd.t = 0; wd.stacks = Math.max(0, wd.stacks - dt * 4); }
      }
      // 连射叠层：停手0.6秒后快速消退
      if (wd.rampCap) {
        this.atkIdle += dt;
        if (this.atkIdle > 0.6) wd.rampStacks = Math.max(0, wd.rampStacks - 8 * dt);
      }
      if (wd.windform && this.windformT <= 0 &&
          ((wd.stack && wd.stacks >= wd.stackMax) || (wd.rampCap && wd.rampStacks >= wd.rampCap))) {
        this.windformT = 4; wd.stacks = 0; wd.rampStacks = 0;
        world.addFloat(this.x, this.y - 46, '光矢形态！', '#7df9ff', 22);
      }
      // 孤客疾行：行迹积累
      if (s.core === 'piaobo' && s.qi.chargeNeed) {
        if (this.moving) {
          this.moveT += dt;
          if (this.moveT >= s.qi.chargeNeed) { this.charged = true; this.moveT = 0; }
        } else this.moveT = Math.max(0, this.moveT - dt * 2);
      }
      // 攻击（短铳自带节奏循环）
      this.attackCd -= dt;
      if (s.core === 'duanshou') this.updateGun(dt, world);
      else if (this.attackCd <= 0) {
        const t = this.acquireTarget(world);
        if (t) { const iv = this.attackInterval(t); this.attackCd = iv; this.doAttack(world, t, iv); }
        else this.attackCd = 0;
      }
    }

    attackInterval(target) {
      let iv = this.pose.base.attackInterval / this.stats.rateMul;
      const wd = this.stats.wind;
      if (wd.stack) iv /= 1 + wd.stacks * 0.04;                       // 轻羽步
      if (wd.rampCap) iv /= 1 + wd.rampStacks * wd.rampPer;           // 连射叠层：越射越快
      if (wd.combo && target === wd.comboTarget) iv /= 1 + wd.comboN * 0.03; // 连珠不息
      if (this.windformT > 0) iv /= 4;                                 // 光矢形态：倾泻成线
      return iv;
    }

    // 选目标：按住第二指（锁头）时，优先攻击范围内级别最高的怪物（Boss>精英>小怪），同级取最近
    acquireTarget(world) {
      const range = this.attackRange();
      if (world.lockHeld) {
        let best = null, bestTier = 0, bestD = Infinity;
        for (const m of world.monsters) {
          if (m.dead) continue;
          const d = Math.hypot(m.x - this.x, m.y - this.y);
          if (d > range + m.radius) continue;
          const tier = m.type === 'boss' ? 3 : m.type === 'elite' ? 2 : 1;
          if (tier > bestTier || (tier === bestTier && d < bestD)) { best = m; bestTier = tier; bestD = d; }
        }
        world.lockMark = best;
        if (best) return best;
      } else world.lockMark = null;
      return this.nearestMonster(world, range);
    }

    nearestMonster(world, range) {
      let best = null, bd = Infinity;
      for (const m of world.monsters) {
        if (m.dead) continue;
        const d = Math.hypot(m.x - this.x, m.y - this.y);
        if (d <= range + m.radius && d < bd) { bd = d; best = m; }
      }
      return best;
    }

    doAttack(world, t, iv = 0.22) {
      const k = this.poseKey;
      if (t) {
        this.facing = t.x >= this.x ? 1 : -1;   // 攻击转向
        const dx = t.x - this.x, dy = t.y - this.y, d = Math.hypot(dx, dy) || 1;
        this.atkDir = { x: dx / d, y: dy / d };
        // 动作时长随攻击频率伸缩（攻速越快动作越快，钳制在可读区间）
        this.atkDur = Math.min(0.45, Math.max(0.1, iv * 0.8));
        this.atkAnim = this.atkDur;
      }
      if (k === 'warrior') {
        this.fx = 0.18;
        const dmg = this.meleeDmg();
        for (const m of world.monsters) {
          if (!m.dead && Math.hypot(m.x - this.x, m.y - this.y) <= this.attackRange() + m.radius)
            m.takeDamage(dmg * (m.type !== 'grunt' ? this.stats.eliteDmg : 1), world);
        }
        if (this.stats.core === 'piaobo') {           // 剑气初鸣：挥剑放出剑气
          const q = this.stats.qi;
          const giant = q.giantEvery && (this.qiCount + 1) % q.giantEvery === 0;
          world.spawnQi(this, t, this.charged, giant);
          this.qiCount = giant ? 0 : this.qiCount + 1;
          this.charged = false;
        }
      } else if (k === 'archer') {
        const wd = this.stats.wind;
        if (wd.combo) {                                // 连珠不息
          if (t === wd.comboTarget) wd.comboN = Math.min(wd.combo, wd.comboN + 1);
          else { wd.comboTarget = t; wd.comboN = 0; }
        }
        if (wd.rampCap) {                              // 连射叠层：越射越快
          this.atkIdle = 0;
          wd.rampStacks = Math.min(wd.rampCap, wd.rampStacks + 1);
        }
        world.spawnPlayerArrow(this, t);
      } else {
        // 法师：坠星核心改陨石；巫师/基础为法弹
        if (this.stats.core === 'zhuixing') world.spawnMeteor(this);
        else world.spawnBolt(this, t);
      }
    }

    /* ---- 火炮射手：双响 → 装填 循环 ---- */
    updateGun(dt, world) {
      const g = this.stats.gun, gs = this.gunS;
      if (gs.phase === 'ready') {
        if (this.attackCd <= 0) {
          const t = this.acquireTarget(world);
          if (t) {
            this.facing = t.x >= this.x ? 1 : -1;
            const dx = t.x - this.x, dy = t.y - this.y, d = Math.hypot(dx, dy) || 1;
            this.atkDir = { x: dx / d, y: dy / d };
            this.atkDur = this.atkAnim = 0.12;          // 双响节奏短促动作
            if (gs.mega) {                              // 榴弹炮击：向敌人最密集处投掷高伤榴弹
              gs.mega = false;
              world.spawnGrenade(this);
              world.addFloat(this.x, this.y - 46, '榴弹炮击！', '#ffab91', 22);
              this.enterReload(gs, g);
            } else {
              this.shootGun(world, t, false, null);
              gs.lastFirst = t;
              gs.phase = 'volley'; gs.t = 0.13;         // 第二发延迟
            }
          } else this.attackCd = 0;
        }
      } else if (gs.phase === 'volley') {
        gs.t -= dt;
        if (gs.t <= 0) {
          const t2 = this.acquireTarget(world);
          if (t2) { const dx = t2.x - this.x, dy = t2.y - this.y, dd = Math.hypot(dx, dy) || 1; this.atkDir = { x: dx / dd, y: dy / dd }; }
          this.atkDur = this.atkAnim = 0.12;
          this.shootGun(world, t2, true, gs.lastFirst);
          this.enterReload(gs, g);
        }
      } else {                                            // 装填（移动加速）
        gs.t -= dt * (1 + (this.moving ? g.moveReload : 0));
        if (gs.t <= 0) { gs.phase = 'ready'; this.attackCd = 0; }
      }
    }
    enterReload(gs, g) {
      gs.phase = 'reload'; gs.t = g.reload; gs.cycle++;
      if (g.megaEvery && gs.cycle % g.megaEvery === 0) gs.mega = true;
    }
    shootGun(world, t, isSecond, firstTarget) {
      if (!t) return;
      const dir = Math.atan2(t.y - this.y, t.x - this.x);
      world.spawnBullet(this, dir, { isSecond, firstTarget });
    }

    draw(ctx) {
      const x = this.x, y = this.y, s = this.stats;
      // 攻击范围参考（占位可视化）：真实攻击范围，随射程加成同步变化
      ctx.strokeStyle = 'rgba(255,255,255,.18)';
      ctx.setLineDash([8, 10]); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, this.attackVisualRange(), 0, 7); ctx.stroke();
      ctx.setLineDash([]);
      if (this.fx > 0) {
        const a = this.fx / 0.18;
        ctx.fillStyle = `rgba(255,235,150,${0.3 * a})`;
        ctx.beginPath(); ctx.arc(x, y, this.attackRange(), 0, 7); ctx.fill();
      }
      // 盾牌环
      if (s.shieldMax > 0 && this.shield > 0) {
        ctx.strokeStyle = `rgba(77,208,225,${0.35 + 0.5 * this.shield / s.shieldMax})`;
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(x, y, this.radius + 7, 0, 7); ctx.stroke();
      }
      // 风行拖尾
      if (this.windformT > 0) {
        ctx.fillStyle = 'rgba(179,229,252,.25)';
        ctx.beginPath(); ctx.arc(x, y, this.radius + 14, 0, 7); ctx.fill();
      }
      // 立绘：程序化动画——移动步伐起伏/待机呼吸、攻击突进+挥击弧光、变身光束过渡
      // 基础职业（未选流派）用帧动画行走；流派形态暂用静态立绘（等待流派行走帧）
      const sprKey = this.stats.core || this.poseKey;
      const img = SPRITES[sprKey];
      const walkFrames = WALK_FRAMES[this.poseKey];
      const framesReady = walkFrames && walkFrames.length === 4 && walkFrames.every(Boolean);
      const useWalkCycle = framesReady && !this.stats.core && this.transformT <= 0;
      let frameIdx = 0;
      if (useWalkCycle) frameIdx = this.moving ? Math.floor(this.walkPhase / (Math.PI / 2)) % 4 : 0;
      const drawSrc = useWalkCycle ? walkFrames[frameIdx] : (img && img.complete && img.naturalWidth ? img : null);
      if (drawSrc || (img && img.complete && img.naturalWidth)) {
        const src = drawSrc || img;
        const h = this.radius * 4.4, w2 = h * (src.naturalWidth || src.width) / (src.naturalHeight || src.height);
        const R = this.radius, top = -h / 2 - R * 0.3;
        let bob = 0, rot = 0, sx = 1, sy = 1, ox = 0, oy = 0;
        const ph = this.atkAnim > 0 ? 1 - this.atkAnim / (this.atkDur || 0.18) : 0;  // 攻击动作进度 0→1
        if (this.moving) {
          bob = -Math.abs(Math.sin(this.walkPhase)) * R * 0.07;           // 步伐起伏（轻）
          sx = 1 + Math.sin(this.walkPhase * 2) * 0.012;                  // 迈步伸缩（极轻）
        } else {
          bob = Math.sin(this.idlePhase) * R * 0.03;                      // 待机呼吸（轻）
          sy = 1 + Math.sin(this.idlePhase) * 0.012;
        }
        if (this.atkAnim > 0) {                                           // 分职业攻击动作
          const e = Math.sin(ph * Math.PI);
          if (this.poseKey === 'warrior') {
            // 抬手（向后仰）→ 落下（前倾劈砍）
            const swing = ph < 0.45 ? -(ph / 0.45) * 0.3 : -0.3 + ((ph - 0.45) / 0.55) * 0.55;
            rot += swing * (this.facing > 0 ? -1 : 1);
            ox = this.atkDir.x * e * R * 0.5; oy = this.atkDir.y * e * R * 0.3;
            sx *= 1 + e * 0.1; sy *= 1 - e * 0.06;
          } else if (this.poseKey === 'archer') {
            // 拉弓（向后拉）→ 松手（向前顶）
            const pull = ph < 0.6 ? (1 - ph / 0.6) * 0.3 : -((ph - 0.6) / 0.4) * 0.18;
            ox = -this.atkDir.x * pull * R; oy = -this.atkDir.y * pull * R;
            rot += (ph < 0.6 ? 1 : -1) * 0.05 * (this.facing > 0 ? 1 : -1);
          } else {
            // 法师：抬手聚能升起 → 落手引爆
            oy -= Math.sin(ph * Math.PI) * R * 0.3;
            rot += Math.sin(ph * Math.PI) * 0.06 * (this.facing > 0 ? -1 : 1);
          }
        }
        if (this.transformT > 0) {
          // ===== 变身过渡：光束自天而降扫落 → 角色从光中显现 → 白闪+过冲弹出 =====
          const dur = this.transformDur || 1.15;
          const prog = 1 - this.transformT / dur;
          if (prog < 0.45) {
            const q = prog / 0.45;
            const beamBottom = y - h + h * q;
            const grad = ctx.createLinearGradient(0, y - h * 2.4, 0, beamBottom);
            grad.addColorStop(0, 'rgba(255,240,180,0)');
            grad.addColorStop(0.65, 'rgba(255,235,170,.5)');
            grad.addColorStop(1, 'rgba(255,255,255,.95)');
            ctx.fillStyle = grad;
            const bw = R * 1.6;
            ctx.fillRect(x - bw / 2, y - h * 2.4, bw, beamBottom - (y - h * 2.4));
            ctx.fillStyle = `rgba(255,240,190,${0.25 + 0.3 * q})`;
            ctx.beginPath(); ctx.ellipse(x, y + R * 0.9, R * (0.9 + q), R * 0.32, 0, 0, 7); ctx.fill();
          } else {
            const q = (prog - 0.45) / 0.55;
            const sc = (1 + 0.3 * (1 - q)) * (this.facing < 0 ? -1 : 1);
            ctx.save();
            ctx.translate(x + ox, y + bob + oy);
            ctx.scale(sc, Math.abs(sc) * (1 - 0.08 * (1 - q)));
            if (q < 1) ctx.filter = `brightness(${1 + (1 - q) * 2.2})`;
            ctx.beginPath();
            ctx.rect(-w2, top - 4, w2 * 2, h * (0.1 + 0.9 * q) + 4);
            ctx.clip();
            ctx.drawImage(img, -w2 / 2, top, w2, h);
            ctx.filter = 'none';
            ctx.restore();
            ctx.strokeStyle = `rgba(255,240,190,${0.7 * (1 - q)})`;
            ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(x + ox, y + oy, R * (0.8 + q * 1.7), 0, 7); ctx.stroke();
          }
        } else {
          // 常规绘制（基础职业：行走帧循环；流派形态：静态立绘+呼吸）
          ctx.save();
          ctx.translate(x + ox, y + bob + oy);
          if (this.facing < 0) ctx.scale(-sx, sy); else ctx.scale(sx, sy);
          ctx.rotate(rot);
          ctx.drawImage(src, -w2 / 2, top, w2, h);
          ctx.restore();
        }
        // 分职业攻击特效
        if (this.atkAnim > 0) {
          const e = Math.sin(ph * Math.PI);
          const base = Math.atan2(this.atkDir.y, this.atkDir.x);
          if (this.poseKey === 'warrior') {
            // 白剑扇形横扫：扇面随动作扫开，亮边为剑锋
            const sweep = -1.05 + 2.1 * (1 - Math.pow(1 - ph, 2));
            ctx.save(); ctx.translate(x + ox, y + bob + oy);
            ctx.beginPath(); ctx.moveTo(0, 0);
            ctx.arc(0, 0, R * 1.7, base - 1.05, base + sweep);
            ctx.closePath();
            ctx.fillStyle = `rgba(255,255,255,${0.3 * (1 - ph)})`;
            ctx.fill();
            ctx.strokeStyle = `rgba(255,255,255,${0.85 * (1 - ph * 0.4)})`;
            ctx.lineWidth = 2.5;
            ctx.beginPath(); ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(base + sweep) * R * 1.7, Math.sin(base + sweep) * R * 1.7);
            ctx.stroke();
            ctx.restore();
          } else if (this.poseKey === 'archer') {
            // 拉弓引导线 → 松手箭闪
            ctx.save(); ctx.translate(x + ox, y + bob + oy);
            ctx.rotate(base);
            if (ph < 0.6) {
              ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.lineWidth = 1.5;
              ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(R * 1.1, 0); ctx.stroke();
            } else {
              const f = 1 - (ph - 0.6) / 0.4;
              ctx.fillStyle = `rgba(255,255,255,${0.7 * f})`;
              ctx.beginPath(); ctx.arc(R * 0.9, 0, 5 + 5 * f, 0, 7); ctx.fill();
            }
            ctx.restore();
          } else {
            // 法师：抬手聚能法环 → 落手引爆（颜色随流派）
            const cx = x + this.atkDir.x * R * 0.8, cy = y + bob + oy + this.atkDir.y * R * 0.8;
            const col = s.core === 'wushi' ? '176,106,224' : s.core === 'zhuixing' ? '255,138,80' : '127,178,255';
            ctx.strokeStyle = `rgba(${col},${0.7 * e})`;
            ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(cx, cy, R * (0.3 + 0.55 * ph), 0, 7); ctx.stroke();
            if (ph > 0.85) {
              ctx.fillStyle = `rgba(${col},${(ph - 0.85) / 0.15 * 0.5})`;
              ctx.beginPath(); ctx.arc(cx, cy, R * 0.85, 0, 7); ctx.fill();
            }
          }
        }
      } else {
        // 占位色块回退
        ctx.beginPath(); ctx.arc(x, y, this.radius, 0, 7);
        ctx.fillStyle = this.pose.color; ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke();
        ctx.fillStyle = '#1c1c1c';
        ctx.beginPath(); ctx.arc(x - 8, y - 5, 3, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.arc(x + 8, y - 5, 3, 0, 7); ctx.fill();
        // 武器占位
        if (this.poseKey === 'warrior') {
          ctx.strokeStyle = '#e8eef7'; ctx.lineWidth = 5;
          ctx.beginPath(); ctx.moveTo(x + this.radius - 4, y + 6); ctx.lineTo(x + this.radius + 20, y - 14); ctx.stroke();
        } else if (this.poseKey === 'archer') {
          ctx.strokeStyle = '#d7a86e'; ctx.lineWidth = 4;
          ctx.beginPath(); ctx.arc(x + this.radius + 4, y, 14, -1.2, 1.2); ctx.stroke();
        } else {
          ctx.strokeStyle = '#7b539c'; ctx.lineWidth = 4;
          ctx.beginPath(); ctx.moveTo(x - this.radius + 2, y + 10); ctx.lineTo(x - this.radius - 8, y - 18); ctx.stroke();
          ctx.fillStyle = '#c9a6ff';
          ctx.beginPath(); ctx.arc(x - this.radius - 8, y - 18, 5, 0, 7); ctx.fill();
        }
      }
      // 状态小字
      const tags = [];
      if (this.gunS.phase === 'reload') tags.push(['装填' + this.gunS.t.toFixed(1) + 's', '#ffcc80']);
      if (this.charged) tags.push(['⚡行迹', '#ffe082']);
      if (this.windformT > 0) tags.push(['光矢形态', '#7df9ff']);
      if (this.protectT > 0) tags.push(['保护', '#ffd54f']);
      if (s.core === 'zhufeng' && s.wind.rampCap && s.wind.rampStacks > 0)
        tags.push(['连射 ' + Math.round(s.wind.rampStacks / s.wind.rampCap * 100) + '%', '#b3e5fc']);
      tags.forEach((t, i) => drawText(ctx, t[0], x, y - this.radius - 24 - i * 18, 13, t[1]));
      drawText(ctx, `天选者·${this.pose.name}${s.core ? '·' + SCHOOLS[s.core].name : ''}`, x, y + this.radius + 16, 13, '#fff');
    }
  }

  /* ==================== 怪物 ==================== */
  class Monster {
    constructor(type, x, y, hpScale = 1, dmgScale = 1) {
      const c = CONFIG.monsters[type];
      this.type = type; this.name = c.name; this.color = c.color;
      this.x = x; this.y = y;
      this.radius = c.radius; this.speed = c.speed;
      this.damage = c.damage * dmgScale; this.touchInterval = c.touchInterval;
      this.xp = c.xp;
      this.hp = this.maxHp = c.hp * hpScale;
      this.touchCd = 0; this.hitFlash = 0; this.bashCd = 0;
      // 状态：中毒/易伤/减速/冰冻/反水/失序/疲态
      this.poisonStacks = 0; this.poisonT = 0; this.poisonDps = 0; this.poisonTick = 0;
      this.vulnT = 0; this.vulnAmt = 0;
      this.slowT = 0; this.slowPct = 0; this.slowStacks = 0;
      this.frozenT = 0; this.frozenCd = 0;
      this.charmT = 0; this.disorderT = 0; this.attackSlowT = 0;
      this.kbx = 0; this.kby = 0;
      this.dead = false;
    }
    knockback(dx, dy, amt) {
      const d = Math.hypot(dx, dy) || 1;
      this.kbx += dx / d * amt; this.kby += dy / d * amt;
    }
    addPoison(n, dps, max, dur) {
      this.poisonStacks = Math.min(max, this.poisonStacks + n);
      this.poisonT = dur; this.poisonDps = dps;
    }
    applySlow(pct, dur) {
      if (this.type === 'boss') pct *= 0.5;      // 最终怪物减速抗性
      this.slowPct = Math.max(this.slowPct, pct);
      this.slowT = Math.max(this.slowT, dur);
    }
    applyFreeze(dur) {
      if (this.frozenCd > 0) return;
      if (this.type === 'boss') { dur *= 0.4; this.frozenCd = 8; }   // 最终怪物：极短定身+触发间隔
      else if (this.type === 'elite') dur *= 0.5;                     // 精英：缩短
      this.frozenT = Math.max(this.frozenT, dur);
      this.slowStacks = 0;
    }
    nearestOther(world) {
      let best = null, bd = Infinity;
      for (const m of world.monsters) {
        if (m === this || m.dead) continue;
        const d = Math.hypot(m.x - this.x, m.y - this.y);
        if (d < bd) { bd = d; best = m; }
      }
      return best;
    }

    update(dt, world) {
      // 击退
      if (this.kbx || this.kby) {
        this.x += this.kbx * dt; this.y += this.kby * dt;
        const dec = Math.pow(0.002, dt);
        this.kbx *= dec; this.kby *= dec;
        if (Math.abs(this.kbx) < 4) this.kbx = 0;
        if (Math.abs(this.kby) < 4) this.kby = 0;
      }
      // 中毒 tick
      if (this.poisonT > 0) {
        this.poisonT -= dt; this.poisonTick -= dt;
        if (this.poisonTick <= 0) {
          this.poisonTick = 0.5;
          this.takeDamage(this.poisonStacks * this.poisonDps * 0.5, world, { silent: true, poison: true });
        }
        if (this.poisonT <= 0) this.poisonStacks = 0;
      }
      if (this.vulnT > 0) this.vulnT -= dt;
      if (this.slowT > 0) { this.slowT -= dt; if (this.slowT <= 0) this.slowPct = 0; }
      if (this.frozenCd > 0) this.frozenCd -= dt;
      if (this.attackSlowT > 0) this.attackSlowT -= dt;
      if (this.bashCd > 0) this.bashCd -= dt;
      if (this.hitFlash > 0) this.hitFlash -= dt;

      const p = world.player;
      // 目标选择：冻结不动 / 反水打怪 / 失序呆滞 / 常规追玩家
      let tx = p.x, ty = p.y, hostile = true;
      if (this.frozenT > 0) { this.frozenT -= dt; hostile = false; tx = this.x; ty = this.y; }
      else if (this.charmT > 0) {
        this.charmT -= dt; hostile = false;
        const o = this.nearestOther(world);
        if (o) { tx = o.x; ty = o.y; }
      } else if (this.disorderT > 0) { this.disorderT -= dt; hostile = false; tx = this.x; ty = this.y; }

      const dx = tx - this.x, dy = ty - this.y, d = Math.hypot(dx, dy) || 1;
      const sp = this.speed * (1 - this.slowPct);
      const stopAt = hostile ? this.radius + p.radius - 6 : this.radius + 14;
      if (d > stopAt) { this.x += dx / d * sp * dt; this.y += dy / d * sp * dt; }

      if (world.mode === 'play') {
        this.touchCd -= dt;
        const effTouch = this.touchInterval * (this.attackSlowT > 0 ? 1.5 : 1);  // 疲态：攻击频率降低
        // 接触伤害玩家
        if (hostile && this.touchCd <= 0 && Math.hypot(p.x - this.x, p.y - this.y) < this.radius + p.radius + 2) {
          this.touchCd = effTouch;
          p.takeDamage(this.damage, world);
        }
        // 反水：攻击其他怪物
        if (this.charmT > 0 && this.touchCd <= 0) {
          const o = this.nearestOther(world);
          if (o && Math.hypot(o.x - this.x, o.y - this.y) < this.radius + o.radius + 2) {
            this.touchCd = effTouch;
            o.takeDamage(this.damage, world, { silent: true });
          }
        }
        // 盾撞开路
        const k = p.stats.knight;
        if (k.bash && p.shield > 0 && this.bashCd <= 0 &&
            Math.hypot(p.x - this.x, p.y - this.y) < this.radius + p.radius + 6) {
          this.bashCd = 1.2;
          this.takeDamage(k.bash * p.stats.damageMul, world);
          this.knockback(this.x - p.x, this.y - p.y, 300);
          world.spawnFx('heavyKnight', 0, this.x, this.y, 52, { dur: 0.22 });   // 盾击火花
        }
      }
    }
    takeDamage(d, world, opt = {}) {
      if (this.dead) return;
      if (world.mode === 'idle' && d > 0) d = 99999;   // 主页挂机演示：一击必杀
      if (this.vulnT > 0) d *= 1 + this.vulnAmt;   // 易伤
      if (!isFinite(d)) { console.warn('非有限伤害，已忽略：', d, opt); return; }
      if (d <= 0) return;
      this.hp -= d;
      this.hitFlash = 0.08;
      if (!opt.silent)
        world.addFloat(this.x + (Math.random() * 16 - 8), this.y - this.radius - 8,
          String(Math.round(d)), opt.poison ? '#8bc34a' : '#fff', 13);
      if (this.hp <= 0) { this.dead = true; world.onMonsterKilled(this); }
    }
    draw(ctx) {
      const x = this.x, y = this.y, r = this.radius;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7);
      let col = this.hitFlash > 0 ? '#ffffff' : this.color;
      if (this.frozenT > 0) col = '#a5e6f2';
      ctx.fillStyle = col; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.stroke();
      ctx.fillStyle = '#222';
      ctx.beginPath(); ctx.arc(x - r * 0.32, y - r * 0.18, r * 0.11, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(x + r * 0.32, y - r * 0.18, r * 0.11, 0, 7); ctx.fill();
      ctx.strokeStyle = '#222'; ctx.lineWidth = 2;
      ctx.beginPath();
      const mw = r * 0.7, step = mw / 3;
      ctx.moveTo(x - mw / 2, y + r * 0.35);
      for (let i = 1; i <= 3; i++) ctx.lineTo(x - mw / 2 + step * i, y + r * 0.35 + (i % 2 ? -5 : 0));
      ctx.stroke();
      ctx.strokeStyle = this.color; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(x + r * 0.8, y - r * 0.5); ctx.lineTo(x + r * 0.8 + 10, y - r * 0.5 - 12); ctx.stroke();
      if (this.hp < this.maxHp && this.type !== 'boss') {
        ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(x - 20, y - r - 14, 40, 6);
        ctx.fillStyle = '#6fdd4e'; ctx.fillRect(x - 20, y - r - 14, 40 * Math.max(0, this.hp / this.maxHp), 6);
      }
      if (this.type !== 'grunt') drawText(ctx, this.name, x, y + r + 16, Math.min(18, r * 0.38), '#fff');
      // 状态角标（最多两个，保证可读）
      const badges = [];
      if (this.poisonStacks > 0) badges.push(['毒' + this.poisonStacks, '#8bc34a']);
      if (this.vulnT > 0) badges.push(['易', '#ce93d8']);
      if (this.frozenT > 0) badges.push(['冻', '#4dd0e1']);
      else if (this.slowT > 0) badges.push(['缓', '#64b5f6']);
      if (this.charmT > 0) badges.push(['反水', '#f48fb1']);
      else if (this.disorderT > 0) badges.push(['乱', '#ffb74d']);
      else if (this.attackSlowT > 0) badges.push(['疲', '#cfd8dc']);
      badges.slice(0, 2).forEach((b, i) =>
        drawText(ctx, b[0], x + 26 + i * 22, y - r - 8 - i * 16, 12, b[1]));
    }
  }

  /* ==================== 箭矢 / 铳弹 ==================== */
  class Arrow {
    constructor(x, y, angle, o) {
      this.x = x; this.y = y;
      this.vx = Math.cos(angle) * o.speed; this.vy = Math.sin(angle) * o.speed;
      this.o = o;
      this.pierce = o.pierce;
      this.traveled = 0; this.hit = new Set(); this.dead = false;
    }
    update(dt, world) {
      const mx = this.vx * dt, my = this.vy * dt;
      this.x += mx; this.y += my;
      this.traveled += Math.hypot(mx, my);
      const o = this.o;
      // 出界判定随世界尺寸（v0.2.3 修复：原用设计屏幕尺寸导致大地图右/下半区箭矢秒消失）
      const BW = world.worldW || W, BH = world.worldH || H;
      if (this.traveled > o.maxDist || this.x < -40 || this.x > BW + 40 || this.y < -40 || this.y > BH + 40) {
        this.dead = true; return;
      }
      for (const m of world.monsters) {
        if (m.dead || this.hit.has(m)) continue;
        if (Math.hypot(m.x - this.x, m.y - this.y) < m.radius + o.size) {
          this.hit.add(m);
          const p = world.player, frac = this.traveled / o.maxDist;
          let dmg = o.damage;
          if (o.distBonus) dmg *= 1 + frac * o.distBonus;                        // 鹰眼猎距
          if (o.closeBonus && frac < o.closeAt) {                                 // 贴身火药
            dmg *= 1 + o.closeBonus;
            m.knockback(this.vx, this.vy, o.kb || 240);
          }
          if (o.secondBonus && o.firstTarget === m) dmg *= 1 + o.secondBonus;     // 第二声轰鸣
          if (o.falloff && this.hit.size > 1) dmg *= Math.pow(1 - o.falloff, this.hit.size - 1); // 穿透衰减
          m.takeDamage(dmg * (m.type !== 'grunt' ? o.eliteMul : 1), world);
          if (o.aoeWitch) world.witchHit(m);              // 直击目标同样上毒
          if (o.aoeRadius) {
            // 元气波溅射（巫师）：以命中点为中心范围伤害并附加中毒
            world.spawnFx('warlock', 1, this.x, this.y, o.aoeRadius * 1.5, { dur: 0.32 });
            for (const m2 of world.monsters) {
              if (m2.dead || this.hit.has(m2)) continue;
              if (Math.hypot(m2.x - this.x, m2.y - this.y) <= o.aoeRadius + m2.radius) {
                m2.takeDamage(dmg * 0.8 * (m2.type !== 'grunt' ? o.eliteMul : 1), world);
                if (o.aoeWitch) world.witchHit(m2);
              }
            }
            this.dead = true; return;
          }
          if (o.split && (o.weakGen || 0) < o.splitGen) world.spawnSplitArrow(this, m); // 风矢分流
          if (this.pierce > 0) this.pierce--;
          else {
            if (o.bulletImpact != null) world.spawnFx('gunner', o.bulletImpact, this.x, this.y, 52, { dur: 0.22 });
            this.dead = true; return;
          }
        }
      }
    }
    draw(ctx) {
      const o = this.o;
      // 特效立绘箭矢/铳弹（sheet/cell 由生成器指定）
      if (o.sheet && FX_SHEETS[o.sheet] && FX_SHEETS[o.sheet].img.complete && FX_SHEETS[o.sheet].img.naturalWidth) {
        const def = FX_SHEETS[o.sheet];
        const cw = def.img.naturalWidth / def.cols, ch = def.img.naturalHeight / def.rows;
        const s = o.fxSize || 46;
        ctx.save();
        ctx.translate(this.x, this.y); ctx.rotate(Math.atan2(this.vy, this.vx));
        ctx.drawImage(def.img, (o.cell % def.cols) * cw, Math.floor(o.cell / def.cols) * ch, cw, ch,
          -s * 0.62, -s / 2, s, s * (ch / cw));
        ctx.restore();
        return;
      }
      if (o.bullet) {   // 铳弹回退：圆弹
        ctx.beginPath(); ctx.arc(this.x, this.y, o.size, 0, 7);
        ctx.fillStyle = o.color; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.stroke();
      } else if (o.laser) {   // 光矢回退：细长激光线（带辉光）
        const len = 26;
        const nx = this.vx / (Math.hypot(this.vx, this.vy) || 1), ny = this.vy / (Math.hypot(this.vx, this.vy) || 1);
        ctx.strokeStyle = o.color; ctx.globalAlpha = 0.35; ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.moveTo(this.x - nx * len, this.y - ny * len); ctx.lineTo(this.x + nx * 6, this.y + ny * 6);
        ctx.stroke();
        ctx.globalAlpha = 1; ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(this.x - nx * len, this.y - ny * len); ctx.lineTo(this.x + nx * 6, this.y + ny * 6);
        ctx.stroke();
      } else {          // 箭矢回退：线段
        ctx.strokeStyle = o.color; ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(this.x - this.vx * 0.022, this.y - this.vy * 0.022);
        ctx.lineTo(this.x, this.y);
        ctx.stroke();
      }
    }
  }

  /* ==================== 剑气 ==================== */
  class SwordQi {
    constructor(x, y, angle, o) {
      this.x = x; this.y = y; this.dir = angle;
      this.o = o;
      this.damage = o.damage;   // 回锋衰减会直接修改 damage，必须拷贝到实例
      this.traveled = 0; this.returning = false;
      this.hit = new Set(); this.dead = false;
    }
    update(dt, world) {
      const o = this.o;
      const step = o.speed * (this.returning ? o.retSpeed : 1) * dt;
      this.x += Math.cos(this.dir) * step;
      this.y += Math.sin(this.dir) * step;
      this.traveled += step;
      if (this.traveled >= o.range) {
        if (o.ret > 0 && !this.returning) {          // 回锋留影
          this.returning = true; this.traveled = 0;
          this.hit.clear(); this.damage *= o.ret;
        } else { this.dead = true; return; }
      }
      for (const m of world.monsters) {
        if (m.dead || this.hit.has(m)) continue;
        if (Math.hypot(m.x - this.x, m.y - this.y) < m.radius + o.width / 2) {
          this.hit.add(m);
          let dmg = this.damage;
          if (!o.giant && o.falloff) dmg *= Math.pow(1 - o.falloff, this.hit.size - 1); // 一线破阵降衰减
          m.takeDamage(dmg * (m.type !== 'grunt' ? o.eliteMul : 1), world);
          if (!o.giant && this.hit.size > o.pierce) { this.dead = true; return; }
        }
      }
    }
    draw(ctx) {
      const o = this.o;
      // 立绘月牙（swordsman图集：0蓝小 1蓝大 2金小拖尾 3金大）——贴图未加载时回退程序绘制
      const def = FX_SHEETS.swordsman;
      if (def.img.complete && def.img.naturalWidth) {
        const cw = def.img.naturalWidth / def.cols, ch = def.img.naturalHeight / def.rows;
        const cell = o.giant ? 3 : o.charged ? 2 : (o.tier >= 2 ? 1 : 0);
        const size = o.width * (o.giant ? 3.4 : o.charged ? 3.0 : 2.4);
        ctx.save();
        ctx.translate(this.x, this.y); ctx.rotate(this.dir);
        if (this.returning) ctx.scale(-1, 1);            // 回锋反转
        ctx.drawImage(def.img, (cell % def.cols) * cw, Math.floor(cell / def.cols) * ch, cw, ch,
          -size / 2, -size / 2, size, size);
        ctx.restore();
        return;
      }
      ctx.save();
      ctx.translate(this.x, this.y); ctx.rotate(this.dir);
      const h = o.width * 0.55 * (o.giant ? 1.5 : 1) * (o.charged ? 1.15 : 1);   // 半高
      const depth = o.width * 0.95 * (o.giant ? 1.6 : 1) * (o.charged ? 1.3 : 1); // 弧顶前伸
      ctx.beginPath();
      ctx.moveTo(0, -h);
      ctx.quadraticCurveTo(depth * 1.7, 0, 0, h);   // 外弧：顶点≈depth
      ctx.quadraticCurveTo(depth * 0.5, 0, 0, -h);  // 内弧：顶点≈depth*0.25，凹面朝后
      ctx.closePath();
      ctx.fillStyle = o.giant ? 'rgba(255,213,79,.95)'
        : (this.returning ? 'rgba(179,229,252,.9)'
          : (o.charged ? 'rgba(255,224,130,.92)' : 'rgba(232,244,255,.9)'));
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = o.giant ? 'rgba(255,180,60,.9)' : 'rgba(120,180,220,.5)';
      ctx.stroke();
      ctx.restore();
    }
  }

  /* ==================== 法术（法弹/陨石通用） ==================== */
  class Spell {
    constructor(x, y, o) {
      this.x = x; this.y = y; this.o = o;
      this.delay0 = o.delay;
      this.delay = o.delay; this.boom = 0; this.dead = false;
    }
    update(dt, world) {
      if (this.delay > 0) {
        this.delay -= dt;
        if (this.delay <= 0) {
          const o = this.o, p = world.player;
          for (const m of world.monsters) {
            if (m.dead) continue;
            const d = Math.hypot(m.x - this.x, m.y - this.y);
            if (d <= o.radius + m.radius) {
              let dmg = o.damage;
              if (o.center && d < o.radius * 0.4) dmg *= 1 + o.center;   // 星核压缩
              m.takeDamage(dmg * (m.type !== 'grunt' ? o.eliteMul : 1), world);
              if (o.stun) m.applyFreeze(o.stun);                          // 天倾震慑
              if (o.onHit) o.onHit(m, world);                             // 巫师附魔
            }
          }
          if (o.onBoom) o.onBoom(world, this);
          this.boom = 0.28;
        }
        return;
      }
      if (this.boom > 0) { this.boom -= dt; if (this.boom <= 0) this.dead = true; }
    }
    draw(ctx) {
      const o = this.o, r = o.radius;
      if (o.grenade) {  // 榴弹：抛物线坠落 + 落点预警圈
        const def = FX_SHEETS.gunner;
        if (def.img.complete && def.img.naturalWidth) {
          const cw = def.img.naturalWidth / def.cols, ch = def.img.naturalHeight / def.rows;
          const total = o.delay0 || o.delay || 0.85;
          const q = 1 - Math.max(0, this.delay) / total;
          if (this.delay > 0) {
            ctx.strokeStyle = `rgba(255,120,60,${0.35 + 0.45 * q})`; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(this.x, this.y, o.radius, 0, 7); ctx.stroke();
            const mx = this.x + (1 - q) * 170, my = this.y - Math.sin(q * Math.PI) * 230 - 16;
            const ms = 44;
            ctx.save(); ctx.translate(mx, my); ctx.rotate(q * 2.4);
            ctx.drawImage(def.img, 0, 0, cw, ch, -ms / 2, -ms / 2, ms, ms);
            ctx.restore();
          } else if (this.boom > 0) {
            const a = this.boom / 0.28;
            ctx.fillStyle = `rgba(255,140,60,${0.45 * a})`;
            ctx.beginPath(); ctx.arc(this.x, this.y, o.radius * (0.5 + 0.5 * a), 0, 7); ctx.fill();
          }
          return;
        }
      }
      if (o.meteor) {   // 陨石：图集渲染（落点法阵+坠石+爆炸闪光）
        const def = FX_SHEETS.meteorMage;
        if (def.img.complete && def.img.naturalWidth) {
          const cw = def.img.naturalWidth / def.cols, ch = def.img.naturalHeight / def.rows;
          const total = o.delay0 || o.delay || 0.6;
          const q = 1 - Math.max(0, this.delay) / total;   // 下落进度 0→1
          if (this.delay > 0) {
            const warnCell = o.giant ? 4 : 0;
            const ws = r * (o.giant ? 3.2 : 2.4);
            ctx.save(); ctx.globalAlpha = 0.5 + 0.4 * q;
            ctx.drawImage(def.img, warnCell * cw, 0, cw, ch, this.x - ws / 2, this.y - ws / 2, ws, ws);
            ctx.restore();
            const mx = this.x + (1 - q) * r * 1.8, my = this.y - (1 - q) * r * 2.8;
            const ms = r * (o.giant ? 1.5 : 1.1);
            ctx.save(); ctx.translate(mx, my); ctx.rotate(0.7 + q * 0.9);
            ctx.drawImage(def.img, 1 * cw, 0, cw, ch, -ms / 2, -ms / 2, ms, ms);
            ctx.restore();
          } else if (this.boom > 0) {
            const a = this.boom / 0.28;
            ctx.fillStyle = o.giant ? `rgba(255,140,60,${0.4 * a})` : `rgba(255,160,80,${0.32 * a})`;
            ctx.beginPath(); ctx.arc(this.x, this.y, r * (0.5 + 0.5 * a), 0, 7); ctx.fill();
          }
          return;
        }
      }
      if (this.delay > 0) {
        const urgent = this.delay < 0.25;
        ctx.strokeStyle = urgent ? 'rgba(255,112,67,.9)' : (o.giant ? 'rgba(255,112,67,.7)' : 'rgba(149,117,205,.65)');
        ctx.setLineDash([6, 8]); ctx.lineWidth = o.giant ? 4 : 2;
        ctx.beginPath(); ctx.arc(this.x, this.y, r, 0, 7); ctx.stroke();
        ctx.setLineDash([]);
        if (o.giant) drawText(ctx, '巨型陨星', this.x, this.y - r - 16, 18, '#ff8a65');
      } else {
        const a = this.boom / 0.28;
        ctx.fillStyle = (o.giant ? 'rgba(255,112,67,' : 'rgba(149,117,205,') + (0.5 * a) + ')';
        ctx.beginPath(); ctx.arc(this.x, this.y, r, 0, 7); ctx.fill();
        ctx.strokeStyle = `rgba(210,150,255,${a})`; ctx.lineWidth = 3; ctx.stroke();
      }
    }
  }

  /* ==================== 经验宝石 ==================== */
  class Gem {
    constructor(x, y, value) { this.x = x; this.y = y; this.value = value; this.pulling = false; this.dead = false; }
    update(dt, world) {
      const p = world.player;
      const dx = p.x - this.x, dy = p.y - this.y, d = Math.hypot(dx, dy) || 1;
      if (!this.pulling && d < CONFIG.player.pickupRadius * p.stats.pickupMul) this.pulling = true;
      if (this.pulling) {
        this.x += dx / d * 560 * dt; this.y += dy / d * 560 * dt;
        if (d < p.radius + 12) { this.dead = true; p.gainXp(this.value, world); }
      }
    }
    draw(ctx) {
      ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#54e06b'; ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 2;
      ctx.fillRect(-6, -6, 12, 12); ctx.strokeRect(-6, -6, 12, 12);
      ctx.restore();
    }
  }

  /* ==================== 装饰（按地图调色板生成于整个世界） ==================== */
  function genDecor(palette, wW = W, wH = H) {
    const rnd = mulberry32(Math.floor(Math.random() * 1e9));
    const scale = Math.max(1, (wW * wH) / (W * H));
    const patches = [], grasses = [], trees = [];
    const m = 60; // 边界内缩
    for (let i = 0; i < Math.round(6 * scale); i++)
      patches.push({ x: m + rnd() * (wW - m * 2), y: m + rnd() * (wH - m * 2), r: 70 + rnd() * 120 });
    for (let i = 0; i < Math.round(18 * scale); i++)
      grasses.push({ x: rnd() * wW, y: rnd() * wH });
    for (let i = 0; i < Math.round(8 * scale); i++) {
      const x = m + rnd() * (wW - m * 2), y = m + rnd() * (wH - m * 2);
      trees.push({ x, y, r: 30 + rnd() * 18 });
    }
    return { palette, patches, grasses, trees };
  }

  window.GameEntities = { Player, Monster, Arrow, SwordQi, Spell, Gem, FxSprite, drawText, genDecor };
})();

