// world.js —— 战斗世界：主页挂机演示与正式关卡共用同一套逻辑与画面（无缝转场的基础）
// v0.2：接入六流派生成逻辑（剑气/铳弹/陨石/法弹）、巫师附魔、蛊爆、病蔓传播、冲击波。
(function () {
  const W = CONFIG.DESIGN_W, H = CONFIG.DESIGN_H;
  const L = CONFIG.level, IDLE = CONFIG.idle;
  const { Player, Monster, Arrow, SwordQi, Spell, Gem, drawText, genDecor } = window.GameEntities;

  class World {
    constructor() {
      this.mode = 'idle';
      this.timeScale = 1;
      this.paused = false;
      this.over = false;
      this.player = null;
      this.monsters = []; this.arrows = []; this.qis = []; this.spells = []; this.gems = []; this.floats = [];
      this.inputDir = { x: 0, y: 0 };
      this.time = 0; this.kills = 0;
      this.spawnTimer = 0; this.idleRespawn = 0; this.sinceElite = 0;
      this.bossSpawned = false; this.boss = null;
      this.onLevelUp = null; this.onEnd = null;
      this.reset('idle');
    }

    reset(mode) {
      this.mode = mode;
      if (!this.player) this.player = new Player(CONFIG.defaultPose);
      this.player.resetRun();
      this.monsters.length = 0; this.arrows.length = 0; this.qis.length = 0;
      this.spells.length = 0; this.gems.length = 0; this.floats.length = 0;
      this.time = 0; this.kills = 0; this.sinceElite = 0;
      this.bossSpawned = false; this.boss = null;
      this.over = false; this.paused = false;
      this.spawnTimer = mode === 'play' ? 0.4 : 0;
      this.idleRespawn = 0;
      this.decor = genDecor(Math.floor(Math.random() * 1e9));
      if (mode === 'idle') for (let i = 0; i < IDLE.maxMonsters; i++) this.spawnMonster('grunt');
    }

    addFloat(x, y, text, color, size = 14, life = 0.8) {
      this.floats.push({ x, y, text, color, size, life, maxLife: life });
    }

    /* ---------- 生成 ---------- */
    spawnMonster(type) {
      const pad = 46, side = Math.floor(Math.random() * 4);
      let x, y;
      if (side === 0)      { x = Math.random() * W; y = -pad; }
      else if (side === 1) { x = W + pad; y = Math.random() * H; }
      else if (side === 2) { x = Math.random() * W; y = H + pad; }
      else                 { x = -pad; y = Math.random() * H; }
      const hpScale = this.mode === 'play' ? 1 + this.time / L.bossTime * 0.6 : 1;
      const m = new Monster(type, x, y, hpScale);
      this.monsters.push(m);
      if (type === 'boss') {
        this.bossSpawned = true; this.boss = m;
        this.addFloat(W / 2, H * 0.4, '最终怪物出现了！', '#ff5252', 36, 2.2);
      }
      return m;
    }

    spawnGem(x, y, v) { this.gems.push(new Gem(x, y, v)); }

    // 射手基础箭（含逐风各强化）
    spawnPlayerArrow(p, t) {
      const s = p.stats, wd = s.wind;
      const dir = Math.atan2(t.y - p.y, t.x - p.x);
      this.arrows.push(new Arrow(p.x, p.y, dir, {
        speed: CONFIG.poses.archer.base.projectileSpeed,
        damage: p.baseDamage * (p.windformT > 0 ? 1.5 : 1),        // 风行强化箭
        maxDist: p.attackRange() + 80,
        pierce: 0, size: 7,
        distBonus: wd.dist,                                        // 鹰眼猎距
        split: wd.split, splitGen: wd.splitGen,                    // 风矢分流
        eliteMul: s.eliteDmg, color: p.windformT > 0 ? '#81d4fa' : '#dcedc8',
      }));
    }

    // 风矢分流：命中后分出弱箭追击附近另一敌人
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
      }));
    }

    // 短铳：向身前扇形快速泼射一发流弹群（参考刘备平A），两响后装填
    spawnBullet(p, dir, opt = {}) {
      const s = p.stats, g = s.gun;
      const pellets = opt.mega ? 10 : 6;             // 每响流弹数（终结双响两管齐爆）
      const spread = opt.mega ? 0.55 : 0.34;         // 扇形半角（弧度）
      const dmgMul = g.per * (opt.mega ? 2.5 : 1) * 0.45;  // 单发流弹伤害系数
      for (let i = 0; i < pellets; i++) {
        const t = pellets === 1 ? 0 : i / (pellets - 1) - 0.5;   // -0.5 ~ 0.5
        const ang = dir + t * 2 * spread + (Math.random() * 0.06 - 0.03);
        this.arrows.push(new Arrow(p.x, p.y, ang, {
          speed: 480 + Math.random() * 120,          // 流弹速度略随机
          damage: p.baseDamage * dmgMul,
          maxDist: 320, pierce: g.pierce + g.pierceAdd, falloff: g.falloff,
          size: (6 + (g.bulletAdd || 0)) * s.areaMul,
          closeAt: g.closeAt, closeBonus: g.closeBonus, kb: 300,
          secondBonus: opt.isSecond ? g.secondBonus : 0, firstTarget: opt.firstTarget || null,
          eliteMul: s.eliteDmg, bullet: true,
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
        ret: q.ret, retSpeed: q.retSpeed, giant,
        eliteMul: s.eliteDmg,
      };
      this.qis.push(new SwordQi(p.x, p.y, dir, o));
      if (giant) this.addFloat(p.x, p.y - 48, '天涯断空！', '#ffd54f', 24);
      else if (charged) this.addFloat(p.x, p.y - 40, '行迹剑气！', '#ffe082', 16);
    }

    // 法师基础法弹（巫师核心附带中毒等）
    spawnBolt(p, t) {
      const s = p.stats;
      this.spells.push(new Spell(t.x, t.y, {
        radius: CONFIG.poses.mage.base.spellRadius * s.areaMul,
        delay: 0.18, damage: p.baseDamage,
        eliteMul: s.eliteDmg, color: '#b39ddb',
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
        onBoom: (w, sp) => {
          if (t.frag) {   // 碎星四溅
            for (let i = 0; i < t.frag; i++) {
              const ang = (i / t.frag) * Math.PI * 2 + Math.random() * 0.8;
              const r = 70 + Math.random() * 80;
              w.spells.push(new Spell(sp.x + Math.cos(ang) * r, sp.y + Math.sin(ang) * r, {
                radius: 45 * s.areaMul, delay: 0.25, damage: sp.o.damage * 0.55,
                eliteMul: s.eliteDmg, color: '#7e57c2',
              }));
            }
          }
          if (t.follow) {  // 连星坠落
            const cands = w.monsters.filter(m => !m.dead && m !== best);
            for (let i = 0; i < t.follow && cands.length; i++) {
              const c = cands.splice(Math.floor(Math.random() * cands.length), 1)[0];
              w.spells.push(new Spell(c.x, c.y, {
                radius: radius * 0.7, delay: (giant ? 0.9 : t.delay) + 0.35,
                damage: damage * t.followMul, eliteMul: s.eliteDmg, color: '#7986cb',
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
      m.addPoison(1, t.dps, t.max, t.dur);                       // 毒咒入骨
      if (t.slow) {                                              // 寒滞咒
        m.applySlow(t.slow, 2);
        m.slowStacks++;
        if (m.slowStacks >= 3) { m.slowStacks = 0; m.applyFreeze(t.freeze); }
      }
      if (t.vulnAt && m.poisonStacks >= t.vulnAt) {              // 脆骨咒印
        m.vulnT = 3; m.vulnAmt = t.vulnAmt;
      }
      if (t.charm && m.poisonStacks >= 3) {                      // 倒戈蛊
        if (m.type === 'grunt' && Math.random() < t.charmChance) m.charmT = t.charm;
        else if (m.type === 'elite') m.disorderT = Math.max(m.disorderT, 2);
        else if (m.type === 'boss') m.attackSlowT = Math.max(m.attackSlowT, 3);
      }
    }

    // 百蛊夜行：周期毒爆
    detonatePoison() {
      const t = this.player.stats.witch;
      let n = 0;
      for (const m of this.monsters) {
        if (m.dead || m.poisonStacks <= 0) continue;
        m.takeDamage(m.poisonStacks * t.dps * 3, this, { poison: true });
        m.poisonT = t.dur;
        n++;
      }
      if (n) this.addFloat(this.player.x, this.player.y - 52, '百蛊夜行！', '#c5e1a5', 22);
    }

    // 冲击波（受击回敬 / 一骑当关）
    shockwave(x, y, r, dmg) {
      const s = this.player.stats;
      for (const m of this.monsters) {
        if (m.dead) continue;
        if (Math.hypot(m.x - x, m.y - y) <= r + m.radius)
          m.takeDamage(dmg * (m.type !== 'grunt' ? s.eliteDmg : 1), this);
      }
      this.floats.push({ x, y: y - 30, text: '冲击', color: '#ffe0b2', size: 16, life: 0.4, maxLife: 0.4 });
    }

    /* ---------- 击杀结算 ---------- */
    onMonsterKilled(m) {
      this.kills++;
      if (this.mode !== 'play') { this.idleRespawn = IDLE.respawnDelay; return; }
      const p = this.player;
      if (m.xp > 0) this.spawnGem(m.x, m.y, m.xp);
      const t = p.stats.witch;
      if (t.spreadR && m.poisonStacks > 0) {                     // 病蔓传染
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

      // 主页挂机：天选者不响应移动输入（背景演示）
      p.update(dt, this, this.mode === 'idle' ? { x: 0, y: 0 } : this.inputDir);

      if (this.mode === 'idle') {
        if (this.monsters.length < IDLE.maxMonsters) {
          this.idleRespawn -= dt;
          if (this.idleRespawn <= 0) this.spawnMonster('grunt');
        }
      } else {
        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0 && this.monsters.length < L.maxMonsters) {
          const batch = 1 + Math.floor(this.time / 25);
          for (let i = 0; i < batch; i++) this.spawnMonster('grunt');
          let interval = Math.max(0.45, L.spawnInterval - this.time * 0.006);
          if (this.bossSpawned) interval *= 2;
          this.spawnTimer = interval;
        }
        if (!this.bossSpawned && this.time >= L.bossTime) this.spawnMonster('boss');
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
      for (const f of this.floats) { f.life -= dt; f.y -= 36 * dt; }
      this.floats = this.floats.filter(f => f.life > 0);

      if (this.mode === 'play' && p.stats.hp <= 0 && !this.over) {
        this.over = 'lose'; if (this.onEnd) this.onEnd('lose');
      }
    }

    render(ctx) {
      const { patches, grasses, trees } = this.decor;
      ctx.fillStyle = '#79b356'; ctx.fillRect(0, 0, W, H);
      for (const q of patches) {
        ctx.fillStyle = '#84bd61';
        ctx.beginPath(); ctx.ellipse(q.x, q.y, q.r, q.r * 0.6, 0, 0, 7); ctx.fill();
      }
      ctx.strokeStyle = '#5d9b44'; ctx.lineWidth = 3;
      for (const g of grasses) {
        ctx.beginPath();
        ctx.moveTo(g.x - 7, g.y); ctx.quadraticCurveTo(g.x - 5, g.y - 9, g.x - 6, g.y - 12);
        ctx.moveTo(g.x, g.y);     ctx.quadraticCurveTo(g.x, g.y - 11, g.x + 1, g.y - 14);
        ctx.moveTo(g.x + 7, g.y); ctx.quadraticCurveTo(g.x + 5, g.y - 9, g.x + 6, g.y - 12);
        ctx.stroke();
      }
      for (const t of trees) {
        ctx.fillStyle = '#8d5a2b'; ctx.fillRect(t.x - 6, t.y - 8, 12, 30);
        ctx.fillStyle = '#2f6b1f'; ctx.beginPath(); ctx.arc(t.x, t.y - 28, t.r, 0, 7); ctx.fill();
        ctx.fillStyle = '#3f8328'; ctx.beginPath(); ctx.arc(t.x - t.r * 0.3, t.y - 28 - t.r * 0.3, t.r * 0.62, 0, 7); ctx.fill();
      }
      for (const g of this.gems) g.draw(ctx);
      for (const sp of this.spells) sp.draw(ctx);
      for (const q of this.qis) q.draw(ctx);
      for (const m of this.monsters) m.draw(ctx);
      for (const a of this.arrows) a.draw(ctx);
      this.player.draw(ctx);
      for (const f of this.floats) {
        ctx.globalAlpha = Math.max(0, Math.min(1, f.life / 0.4));
        drawText(ctx, f.text, f.x, f.y, f.size + 'px bold sans-serif', f.color);
        ctx.globalAlpha = 1;
      }
    }
  }

  window.World = World;
})();
