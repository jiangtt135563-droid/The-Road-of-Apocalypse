// world.js —— 战斗世界：主页挂机演示与正式关卡共用同一套逻辑与画面（无缝转场的基础）
// v0.2：大地图+摄像机跟随（主角保持屏幕中心，看起来是地图在动）、地图有可见边界、
//       按镜头视野刷怪、4张主题地图调色板、关卡强度成长。
(function () {
  const W = CONFIG.DESIGN_W, H = CONFIG.DESIGN_H;
  const L = CONFIG.level, IDLE = CONFIG.idle;
  const { Player, Monster, Arrow, SwordQi, Spell, Gem, FxSprite, drawText, genDecor } = window.GameEntities;

  class World {
    constructor() {
      this.mode = 'idle';
      this.timeScale = 1;
      this.paused = false;
      this.over = false;
      this.player = null;
      this.monsters = []; this.arrows = []; this.qis = []; this.spells = []; this.gems = []; this.floats = [];
      this.effects = [];
      this.inputDir = { x: 0, y: 0 };
      this.time = 0; this.kills = 0;
      this.runLoot = { coins:0, items:{} };
      this.spawnTimer = 0; this.idleRespawn = 0; this.sinceElite = 0;
      this.bossSpawned = false; this.boss = null;
      this.onLevelUp = null; this.onEnd = null;
      this.levelNo = 1;                   // 天梯关卡号（1起，共 CONFIG.ladder.levels 关）
      this.cam = { x: 0, y: 0 };
      this.debugInvincible = false;
      this.lockHeld = false; this.lockPointerId = null; this.lockMark = null;  // 第二指锁头
      this.reset('idle');
    }

    get map() { return CONFIG.mapForLevel(this.levelNo); }
    bossTime() { return L.bossTime; }

    reset(mode) {
      this.mode = mode;
      // 正式关卡：大世界（有边界）；主页挂机：单屏
      if (mode === 'play') { this.worldW = 2200; this.worldH = 2200; }
      else { this.worldW = W; this.worldH = H; }
      if (!this.player) this.player = new Player(CONFIG.defaultPose);
      this.player.resetRun();
      this.player.x = this.worldW / 2; this.player.y = this.worldH / 2;
      this.monsters.length = 0; this.arrows.length = 0; this.qis.length = 0;
      this.spells.length = 0; this.gems.length = 0; this.floats.length = 0;
      this.time = 0; this.kills = 0; this.sinceElite = 0;
      this.runLoot = { coins:0, items:{} };
      this.bossSpawned = false; this.boss = null;
      this.over = false; this.paused = false;
      this.spawnTimer = mode === 'play' ? 0.4 : 0;
      this.idleRespawn = 0;
      this.decor = genDecor(this.map.palette, this.worldW, this.worldH);
      this.updateCam();
      if (mode === 'idle') for (let i = 0; i < IDLE.maxMonsters; i++) this.spawnMonster('grunt');
    }

    /* ---------- 摄像机：主角保持屏幕中心，触界后钳制 ---------- */
    updateCam() {
      const p = this.player;
      this.cam.x = Math.max(0, Math.min(this.worldW - W, p.x - W / 2));
      this.cam.y = Math.max(0, Math.min(this.worldH - H, p.y - H / 2));
    }

    addFloat(x, y, text, color, size = 14, life = 0.8) {
      this.floats.push({ x, y, text, color, size, life, maxLife: life });
    }

    spawnFx(sheet, cell, x, y, size, opts = {}) {
      this.effects.push(new FxSprite(sheet, cell, x, y, size, opts));
    }

    /* ---------- 生成 ---------- */
    spawnMonster(type) {
      let x, y;
      if (this.mode === 'idle') {
        const pad = 46, side = Math.floor(Math.random() * 4);
        if (side === 0)      { x = Math.random() * this.worldW; y = -pad; }
        else if (side === 1) { x = this.worldW + pad; y = Math.random() * this.worldH; }
        else if (side === 2) { x = Math.random() * this.worldW; y = this.worldH + pad; }
        else                 { x = -pad; y = Math.random() * this.worldH; }
      } else {
        // 开局8秒内：在玩家周围300-420px生成（快速接战，还原v0.1节奏）
        const p0 = this.player;
        // 玩家在移动时，偏向其行进方向前方刷怪，保证走位中也能接战
        let baseAng = Math.random() * Math.PI * 2;
        if (p0.moving && (this.inputDir.x || this.inputDir.y))
          baseAng = Math.atan2(this.inputDir.y, this.inputDir.x) + (Math.random() * 2 - 1) * 1.9;
        if (this.time < 8) {
          const d = 300 + Math.random() * 120;
          x = p0.x + Math.cos(baseAng) * d;
          y = p0.y + Math.sin(baseAng) * d;
        } else {
          // 正式关卡：贴着镜头视野外一圈刷出（移动时60%偏向面朝一侧）
          const m = 36, vx = this.cam.x, vy = this.cam.y;
          let side = Math.floor(Math.random() * 4);
          if (p0.moving && (this.inputDir.x || this.inputDir.y) && Math.random() < 0.6) {
            const fx = this.inputDir.x, fy = this.inputDir.y;
            side = Math.abs(fx) >= Math.abs(fy) ? (fx > 0 ? 1 : 3) : (fy > 0 ? 2 : 0);
          }
          if (side === 0)      { x = vx + Math.random() * W; y = vy - m; }
          else if (side === 1) { x = vx + W + m; y = vy + Math.random() * H; }
          else if (side === 2) { x = vx + Math.random() * W; y = vy + H + m; }
          else                 { x = vx - m; y = vy + Math.random() * H; }
        }
        x = Math.max(40, Math.min(this.worldW - 40, x));
        y = Math.max(40, Math.min(this.worldH - 40, y));
        // 避免贴脸生成
        const pd = Math.hypot(x - p0.x, y - p0.y);
        if (pd < 140) { x = p0.x + (x - p0.x) / (pd || 1) * 160; y = p0.y + (y - p0.y) / (pd || 1) * 160; }
      }
      let hpScale = 1, dmgScale = 1;
      if (this.mode === 'play') {
        const st = CONFIG.levelMul(this.levelNo);
        hpScale = st.hp * (1 + this.time / this.bossTime() * 0.4);
        dmgScale = st.dmg;
      }
      const mon = new Monster(type, x, y, hpScale, dmgScale);
      if (this.mode === 'play') mon.speed *= CONFIG.ladder.speed(this.levelNo);
      this.monsters.push(mon);
      if (type === 'boss') {
        this.bossSpawned = true; this.boss = mon;
        this.addFloat(this.player.x, this.player.y - 90, '最终怪物出现了！', '#ff5252', 34, 2.2);
      }
      return mon;
    }

    spawnGem(x, y, v) { this.gems.push(new Gem(x, y, v)); }

    // 射手基础箭（逐风：连射叠层→光矢；光矢形态=倾泻贯穿激光线，攻速×4、单发×0.7保持总量平衡）
    spawnPlayerArrow(p, t) {
      const s = p.stats, wd = s.wind;
      const dir = Math.atan2(t.y - p.y, t.x - p.x);
      const wf = p.windformT > 0;
      const ratio = wd.rampCap ? wd.rampStacks / wd.rampCap : 0;
      const hot = !wf && ratio >= 0.8;
      const laser = wf || hot;
      let sheet, cell, fxSize;
      if (s.core === 'zhufeng') {
        sheet = 'windArcher';
        if (wf)      { cell = 2; fxSize = 64; }
        else if (hot){ cell = 1; fxSize = 56; }
        else         { cell = 0; fxSize = 50; }
      } else {
        sheet = 'baseAtk'; cell = 1; fxSize = 40;
      }
      this.arrows.push(new Arrow(p.x, p.y, dir, {
        speed: CONFIG.poses.archer.base.projectileSpeed * (wf ? 2 : hot ? 1.25 : 1),
        damage: p.baseDamage * (wf ? 0.7 : 1),
        maxDist: p.attackRange(),
        pierce: wf ? 3 : (hot ? 1 : 0),
        size: laser ? 4.5 : 7,
        distBonus: wd.dist,
        split: wd.split, splitGen: wd.splitGen,
        eliteMul: s.eliteDmg,
        laser,
        sheet, cell, fxSize,
        color: wf ? '#7df9ff' : hot ? '#e0ffff' : '#dcedc8',
      }));
    }

    // 风矢分流
    spawnSplitArrow(src, hitM) {
      const o = src.o;
      let best = null, bd = 260;
      for (const m of this.monsters) {
        if (m.dead || m === hitM || src.hit.has(m)) continue;
        const d = Math.hypot(m.x - hitM.x, m.y - hitM.y);
        if (d < bd) { bd = d; best = m; }
      }
      if (!best) return;
      const dir = Math.atan2(best.y - hitM.y, best.x - hitM.x);
      this.arrows.push(new Arrow(hitM.x, hitM.y, dir, {
        speed: 560, damage: o.damage * o.split, maxDist: 300, pierce: 0, size: 6,
        eliteMul: o.eliteMul, color: '#aed581', weakGen: (o.weakGen || 0) + 1,
        split: o.split, splitGen: o.splitGen,
        sheet: 'windArcher', cell: 0, fxSize: 40,
      }));
    }

    // 短铳：向身前扇形快速泼射一发流弹群（参考刘备平A），两响后装填
    spawnBullet(p, dir, opt = {}) {
      const s = p.stats, g = s.gun;
      const pellets = opt.mega ? 10 : 6;
      const spread = opt.mega ? 0.55 : 0.34;
      const dmgMul = g.per * (opt.mega ? 2.5 : 1) * 0.45;
      for (let i = 0; i < pellets; i++) {
        const t = pellets === 1 ? 0 : i / (pellets - 1) - 0.5;
        const ang = dir + t * 2 * spread + (Math.random() * 0.06 - 0.03);
        this.arrows.push(new Arrow(p.x, p.y, ang, {
          speed: 480 + Math.random() * 120,
          damage: p.baseDamage * dmgMul,
          maxDist: 320, pierce: g.pierce + g.pierceAdd, falloff: g.falloff,
          size: (6 + (g.bulletAdd || 0)) * s.areaMul,
          closeAt: g.closeAt, closeBonus: g.closeBonus, kb: 300,
          secondBonus: opt.isSecond ? g.secondBonus : 0, firstTarget: opt.firstTarget || null,
          eliteMul: s.eliteDmg, bullet: true,
          sheet: 'gunner',
          cell: opt.mega ? 3 : (opt.isSecond ? 1 : 0),
          fxSize: (11 + (g.bulletAdd || 0)) * s.areaMul * (opt.mega ? 2 : 1),
          bulletImpact: 2,
          color: opt.mega ? '#ff8a65' : (opt.isSecond ? '#ffd54f' : '#ffe082'),
        }));
      }
    }

    // 漂泊剑客剑气
    spawnQi(p, target, charged, giant) {
      const s = p.stats, q = s.qi;
      const dir = Math.atan2(target.y - p.y, target.x - p.x);
      const o = {
        damage: p.baseDamage * q.dmgMul * (charged ? q.chargeMul : 1) * (giant ? 3 : 1),
        speed: q.speed, range: q.range,
        width: (q.width + (charged ? q.width * 0.4 : 0) + (giant ? q.width : 0)) * s.areaMul,
        pierce: giant ? 99 : q.pierce + q.pierceAdd,
        falloff: giant ? 0 : q.falloff,
        ret: q.ret, retSpeed: q.retSpeed, giant, charged,
        eliteMul: s.eliteDmg,
        tier: p.cards['ZJ-01'] || 1,   // 剑气星级→月牙贴图档位
      };
      this.qis.push(new SwordQi(p.x, p.y, dir, o));
      if (giant) this.addFloat(p.x, p.y - 48, '天涯断空！', '#ffd54f', 24);
      else if (charged) this.addFloat(p.x, p.y - 40, '行迹剑气！', '#ffe082', 16);
    }

    // 法师基础法弹（巫师=毒箭弹体；基础=蓝紫法球）
    spawnBolt(p, t) {
      const s = p.stats;
      const witch = s.core === 'wushi';
      this.spells.push(new Spell(t.x, t.y, {
        radius: CONFIG.poses.mage.base.spellRadius * s.areaMul,
        delay: 0.18, damage: p.baseDamage,
        eliteMul: s.eliteDmg, color: witch ? '#a3e63c' : '#b39ddb',
        onBoom: (w2, sp) => w2.spawnFx(witch ? 'warlock' : 'baseAtk', witch ? 0 : 2, sp.x, sp.y, 70, { dur: 0.3 }),
        onHit: s.core === 'wushi' ? (m, w) => w.witchHit(m) : null,
      }));
    }

    // 坠星法师：敌人最密集处落陨石
    spawnMeteor(p) {
      const s = p.stats, t = s.star;
      let best = null, bestN = -1;
      for (const m of this.monsters) {
        if (m.dead || Math.hypot(m.x - p.x, m.y - p.y) > p.attackRange() + m.radius) continue;
        let n = 0;
        for (const o of this.monsters) {
          if (o !== m && !o.dead && Math.hypot(o.x - m.x, o.y - m.y) < 130) n++;
        }
        if (n > bestN) { bestN = n; best = m; }
      }
      if (!best) return;
      const giant = t.giantEvery && (t.count + 1) % t.giantEvery === 0;
      t.count++;
      const radius = t.radius * s.areaMul * (giant ? 1.9 : 1);
      const damage = p.baseDamage * t.dmgMul * (giant ? 3 : 1);
      this.spells.push(new Spell(best.x, best.y, {
        radius, delay: giant ? 0.9 : t.delay, damage,
        center: t.center, stun: giant ? 0.8 : 0,
        eliteMul: s.eliteDmg, color: '#9575cd', giant,
        meteor: true,                      // 使用陨石图集渲染（法阵/坠石/爆炸）
        onBoom: (w, sp) => {
          w.spawnFx('meteorMage', sp.o.giant ? 5 : 2, sp.x, sp.y, sp.o.radius * (sp.o.giant ? 3 : 2.4), { dur: 0.4 });
          if (t.frag) {   // 碎星四溅
            for (let i = 0; i < t.frag; i++) {
              const ang = (i / t.frag) * Math.PI * 2 + Math.random() * 0.8;
              const r = 70 + Math.random() * 80;
              w.spells.push(new Spell(sp.x + Math.cos(ang) * r, sp.y + Math.sin(ang) * r, {
                radius: 45 * s.areaMul, delay: 0.25, damage: sp.o.damage * 0.55,
                eliteMul: s.eliteDmg, color: '#7e57c2', meteor: true,
              }));
            }
          }
          if (t.follow) {  // 连星坠落
            const cands = w.monsters.filter(m => !m.dead && m !== best);
            for (let i = 0; i < t.follow && cands.length; i++) {
              const c = cands.splice(Math.floor(Math.random() * cands.length), 1)[0];
              w.spells.push(new Spell(c.x, c.y, {
                radius: radius * 0.7, delay: (giant ? 0.9 : t.delay) + 0.35,
                damage: damage * t.followMul, eliteMul: s.eliteDmg, color: '#7986cb', meteor: true,
              }));
            }
          }
        },
      }));
    }

    /* ---------- 巫师：法术命中附魔 ---------- */
    witchHit(m) {
      if (m.dead) return;
      const t = this.player.stats.witch;
      const firstPoison = m.poisonStacks === 0;
      m.addPoison(1, t.dps, t.max, t.dur);
      if (firstPoison) this.spawnFx('warlock', 1, m.x, m.y - 4, 46, { dur: 0.3 });          // 毒液飞溅
      if (t.slow) {
        m.applySlow(t.slow, 2);
        m.slowStacks++;
        if (m.slowStacks >= 3) { m.slowStacks = 0; m.applyFreeze(t.freeze); this.spawnFx('warlock', 5, m.x, m.y, 66, { dur: 0.45 }); }
      }
      if (t.vulnAt && m.poisonStacks >= t.vulnAt && m.vulnT <= 0) {
        m.vulnT = 3; m.vulnAmt = t.vulnAmt;
        this.spawnFx('warlock', 3, m.x, m.y - 14, 38, { dur: 0.5 });
      }
      if (t.charm && m.poisonStacks >= 3) {
        if (m.type === 'grunt' && Math.random() < t.charmChance) m.charmT = t.charm;
        else if (m.type === 'elite') m.disorderT = Math.max(m.disorderT, 2);
        else if (m.type === 'boss') m.attackSlowT = Math.max(m.attackSlowT, 3);
        this.spawnFx('warlock', 6, m.x, m.y, 54, { dur: 0.6 });
      }
    }

    detonatePoison() {
      const t = this.player.stats.witch;
      let n = 0;
      for (const m of this.monsters) {
        if (m.dead || m.poisonStacks <= 0) continue;
        if (n < 8) this.spawnFx('warlock', 7, m.x, m.y, 74, { dur: 0.45 });   // 毒花爆发
        m.takeDamage(m.poisonStacks * t.dps * 3, this, { poison: true });
        m.poisonT = t.dur;
        n++;
      }
      if (n) this.addFloat(this.player.x, this.player.y - 52, '百蛊夜行！', '#c5e1a5', 22);
    }

    shockwave(x, y, r, dmg) {
      const s = this.player.stats;
      for (const m of this.monsters) {
        if (m.dead) continue;
        if (Math.hypot(m.x - x, m.y - y) <= r + m.radius)
          m.takeDamage(dmg * (m.type !== 'grunt' ? s.eliteDmg : 1), this);
      }
      this.spawnFx('heavyKnight', 1, x, y, r * 1.6, { dur: 0.4 });   // 反击震波环
      this.floats.push({ x, y: y - 30, text: '冲击', color: '#ffe0b2', size: 16, life: 0.4, maxLife: 0.4 });
    }

    /* ---------- 击杀结算 ---------- */
    onMonsterKilled(m) {
      this.kills++;
      if (this.mode !== 'play') { this.idleRespawn = IDLE.respawnDelay; return; }
      if (window.CollectionSystem) CollectionSystem.discover('monsters', m.type);
      const p = this.player;
      if (m.xp > 0) this.spawnGem(m.x, m.y, m.xp);
      if (window.InventorySystem) {
        const coins = m.type === 'boss' ? 60 : (m.type === 'elite' ? 8 : 1);
        InventorySystem.addCoins(coins); this.runLoot.coins += coins;
        let drop = null, amount = 1, roll = Math.random();
        if (m.type === 'boss') { drop = 'mat-crystal'; amount = 2; }
        else if (m.type === 'elite') drop = roll < .28 ? 'mat-crystal' : (roll < .72 ? 'mat-ore' : 'mat-hide');
        else if (roll < .07) drop = 'mat-ore'; else if (roll < .11) drop = 'mat-hide';
        if (drop) {
          InventorySystem.add(drop, amount); this.runLoot.items[drop] = (this.runLoot.items[drop] || 0) + amount;
          const item = InventorySystem.get(drop);
          this.addFloat(m.x, m.y - 24, item.name + ' +' + amount, drop === 'mat-crystal' ? '#d9a7ff' : '#ffd180', 13, 1.1);
        }
      }
      const t = p.stats.witch;
      if (t.spreadR && m.poisonStacks > 0) {
        const keep = Math.max(1, Math.round(m.poisonStacks * 0.5));
        for (const o of this.monsters) {
          if (o.dead || o === m) continue;
          if (Math.hypot(o.x - m.x, o.y - m.y) <= t.spreadR + o.radius)
            o.addPoison(keep, t.dps, t.max, t.dur);
        }
      }
      if (m.type === 'grunt') {
        this.sinceElite++;
        if (this.sinceElite >= L.eliteEvery) { this.sinceElite = 0; this.spawnMonster('elite'); }
      }
      if (m.type === 'boss') { this.over = 'win'; if (this.onEnd) this.onEnd('win'); }
    }

    /* ---------- 主更新 ---------- */
    update(rawDt) {
      if (this.paused || this.over) return;
      const dt = rawDt * this.timeScale;
      this.time += dt;
      const p = this.player;
      this.lockMark = null;   // 锁头标记每帧由选目标逻辑刷新

      p.update(dt, this, this.mode === 'idle' ? { x: 0, y: 0 } : this.inputDir);
      this.updateCam();

      if (this.mode === 'idle') {
        if (this.monsters.length < IDLE.maxMonsters) {
          this.idleRespawn -= dt;
          if (this.idleRespawn <= 0) this.spawnMonster('grunt');
        }
      } else {
        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0 && this.monsters.length < L.maxMonsters) {
          const batch = 1 + Math.floor(this.time / 18);
          for (let i = 0; i < batch; i++) this.spawnMonster('grunt');
          let interval = Math.max(0.45, L.spawnInterval - this.time * 0.006);
          if (this.bossSpawned) interval *= 2;
          this.spawnTimer = interval;
        }
        if (!this.bossSpawned && this.time >= this.bossTime()) this.spawnMonster('boss');
      }

      for (const m of this.monsters) m.update(dt, this);
      for (const a of this.arrows) a.update(dt, this);
      for (const q of this.qis) q.update(dt, this);
      for (const sp of this.spells) sp.update(dt, this);
      for (const g of this.gems) g.update(dt, this);
      this.monsters = this.monsters.filter(e => !e.dead);
      this.arrows = this.arrows.filter(e => !e.dead);
      this.qis = this.qis.filter(e => !e.dead);
      this.spells = this.spells.filter(e => !e.dead);
      this.gems = this.gems.filter(e => !e.dead);
      for (const fx of this.effects) fx.update(dt);
      this.effects = this.effects.filter(e => !e.dead);
      for (const f of this.floats) { f.life -= dt; f.y -= 36 * dt; }
      this.floats = this.floats.filter(f => f.life > 0);

      if (this.mode === 'play' && p.stats.hp <= 0 && !this.over) {
        this.over = 'lose'; if (this.onEnd) this.onEnd('lose');
      }
    }

    /* ---------- 渲染（世界坐标 + 摄像机平移） ---------- */
    render(ctx) {
      const pal = this.decor.palette, cam = this.cam;
      // 地面（屏幕空间铺满视口）
      ctx.fillStyle = pal.ground; ctx.fillRect(0, 0, W, H);

      ctx.save();
      ctx.translate(-cam.x, -cam.y);
      // 草地色斑
      for (const q of this.decor.patches) {
        ctx.fillStyle = pal.patch;
        ctx.beginPath(); ctx.ellipse(q.x, q.y, q.r, q.r * 0.6, 0, 0, 7); ctx.fill();
      }
      // 草丛
      ctx.strokeStyle = pal.grass; ctx.lineWidth = 3;
      for (const g of this.decor.grasses) {
        ctx.beginPath();
        ctx.moveTo(g.x - 7, g.y); ctx.quadraticCurveTo(g.x - 5, g.y - 9, g.x - 6, g.y - 12);
        ctx.moveTo(g.x, g.y);     ctx.quadraticCurveTo(g.x, g.y - 11, g.x + 1, g.y - 14);
        ctx.moveTo(g.x + 7, g.y); ctx.quadraticCurveTo(g.x + 5, g.y - 9, g.x + 6, g.y - 12);
        ctx.stroke();
      }
      // 树木
      for (const t of this.decor.trees) {
        ctx.fillStyle = pal.trunk; ctx.fillRect(t.x - 6, t.y - 8, 12, 30);
        ctx.fillStyle = pal.canopy; ctx.beginPath(); ctx.arc(t.x, t.y - 28, t.r, 0, 7); ctx.fill();
        ctx.fillStyle = pal.canopy2; ctx.beginPath(); ctx.arc(t.x - t.r * 0.3, t.y - 28 - t.r * 0.3, t.r * 0.62, 0, 7); ctx.fill();
      }
      // 世界边界（地图有尽头）
      if (this.mode === 'play') {
        ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 8;
        ctx.strokeRect(6, 6, this.worldW - 12, this.worldH - 12);
        ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 2;
        ctx.strokeRect(14, 14, this.worldW - 28, this.worldH - 28);
      }
      // 实体（世界坐标）
      for (const g of this.gems) g.draw(ctx);
      for (const sp of this.spells) sp.draw(ctx);
      for (const q of this.qis) q.draw(ctx);
      for (const m of this.monsters) m.draw(ctx);
      for (const a of this.arrows) a.draw(ctx);
      this.player.draw(ctx);
      for (const fx of this.effects) fx.draw(ctx);
      // 锁头标记
      if (this.mode === 'play' && this.lockHeld && this.lockMark && !this.lockMark.dead) {
        const m = this.lockMark;
        ctx.strokeStyle = '#ff5252'; ctx.lineWidth = 3; ctx.setLineDash([7, 6]);
        ctx.beginPath(); ctx.arc(m.x, m.y, m.radius + 11, 0, 7); ctx.stroke();
        ctx.setLineDash([]);
        drawText(ctx, '锁定', m.x, m.y - m.radius - 24, 13, '#ff5252');
      }
      // 浮动文字（世界坐标）
      for (const f of this.floats) {
        ctx.globalAlpha = Math.max(0, Math.min(1, f.life / 0.4));
        drawText(ctx, f.text, f.x, f.y, f.size + 'px bold sans-serif', f.color);
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    }
  }

  window.World = World;
})();
