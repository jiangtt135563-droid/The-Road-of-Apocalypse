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
              falloff: .15, ret: 0, retSpeed: 1, chargeNeed: 0, chargeMul: 1.5, giantEvery: 0 },
        // 重骑士
        knight: { regen: 6, delay: 3, bash: 0, thorns: 0, thornR: 110, lowAt: .4, lowBonus: 0,
                  rebirth: false, recast: 0 },
        // 逐风射手
        wind: { stack: false, stackMax: 0, stacks: 0, t: 0, dist: 0,
                combo: 0, comboN: 0, comboTarget: null, split: 0, splitGen: 1, windform: false },
        // 短铳射手
        gun: { per: 1.9, reload: 1.7, pierce: 1, pierceAdd: 0, falloff: .2, closeAt: .35,
               closeBonus: 0, secondMul: 1, secondBonus: 0, moveReload: 0, bulletAdd: 0, megaEvery: 0 },
        // 坠星法师
        star: { dmgMul: 1.5, radius: 95, delay: .6, center: 0, frag: 0, follow: 0,
                followMul: .6, giantEvery: 0, count: 0 },
        // 巫师
        witch: { max: 6, dur: 4, dps: .8, spreadR: 0, vulnAt: 0, vulnAmt: 0, slow: 0,
                 freeze: 0, charm: 0, charmChance: 0, detonate: 0, dt: 0 },
      };
      this.shield = 0; this.sinceHit = 99; this.protectT = 0; this.rebirthCd = 0;
      this.level = 1; this.xp = 0; this.xpNeed = CONFIG.level.xpBase;
      this.attackCd = 0; this.fx = 0; this.moveT = 0; this.moving = false;
      this.charged = false; this.qiCount = 0;
      this.gunS = { phase: 'ready', t: 0, cycle: 0, mega: false, lastFirst: null };
      this.windformT = 0;
      this.takenCards = [];
      this.picks = 0;                     // 本局已选天启之力次数（上限 CONFIG.maxPicks）
    }

    get baseDamage() { return this.pose.base.damage * this.stats.damageMul; }
    attackRange() { return this.pose.base.attackRange * this.stats.rangeMul; }
    // 血战不退：低血提高近战伤害
    meleeDmg() {
      const s = this.stats;
      let m = this.baseDamage;
      if (s.knight.lowBonus && s.hp / s.maxHp <= s.knight.lowAt) m *= 1 + s.knight.lowBonus;
      return m;
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
      // 移动（软上限 420，占位）；地图边界随世界尺寸
      const sp = Math.min(s.moveSpeed, 420);
      const BW = world.worldW || W, BH = world.worldH || H;
      if (this.moving) {
        this.x = clamp(this.x + dir.x * sp * dt, this.radius, BW - this.radius);
        this.y = clamp(this.y + dir.y * sp * dt, this.radius, BH - this.radius);
      }
      // 计时
      this.sinceHit += dt;
      if (this.protectT > 0) this.protectT -= dt;
      if (this.rebirthCd > 0) this.rebirthCd -= dt;
      if (this.fx > 0) this.fx -= dt;
      if (this.windformT > 0) this.windformT -= dt;
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
      // 轻羽步 + 风行无踪
      const wd = s.wind;
      if (wd.stack) {
        if (this.moving) {
          wd.t += dt;
          if (wd.t >= 0.5) { wd.t -= 0.5; wd.stacks = Math.min(wd.stackMax, wd.stacks + 1); }
        } else { wd.t = 0; wd.stacks = Math.max(0, wd.stacks - dt * 4); }
        if (wd.windform && this.windformT <= 0 && wd.stacks >= wd.stackMax) {
          this.windformT = 3; wd.stacks = 0;
          world.addFloat(this.x, this.y - 46, '风行无踪！', '#b3e5fc', 22);
        }
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
        const t = this.nearestMonster(world, this.attackRange());
        if (t) { this.attackCd = this.attackInterval(t); this.doAttack(world, t); }
        else this.attackCd = 0;
      }
    }

    attackInterval(target) {
      let iv = this.pose.base.attackInterval / this.stats.rateMul;
      const wd = this.stats.wind;
      if (wd.stack) iv /= 1 + wd.stacks * 0.04;                       // 轻羽步
      if (wd.combo && target === wd.comboTarget) iv /= 1 + wd.comboN * 0.03; // 连珠不息
      if (this.windformT > 0) iv /= 2;                                 // 风行
      return iv;
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

    doAttack(world, t) {
      const k = this.poseKey;
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
        world.spawnPlayerArrow(this, t);
      } else {
        // 法师：坠星核心改陨石；巫师/基础为法弹
        if (this.stats.core === 'zhuixing') world.spawnMeteor(this);
        else world.spawnBolt(this, t);
      }
    }

    /* ---- 短铳射手：双响 → 装填 循环 ---- */
    updateGun(dt, world) {
      const g = this.stats.gun, gs = this.gunS;
      if (gs.phase === 'ready') {
        if (this.attackCd <= 0) {
          const t = this.nearestMonster(world, this.attackRange());
          if (t) {
            if (gs.mega) {                              // 终结双响：两管齐爆的宽扇面轰击
              gs.mega = false;
              const dir = Math.atan2(t.y - this.y, t.x - this.x);
              world.spawnBullet(this, dir, { mega: true });
              world.addFloat(this.x, this.y - 46, '终结双响！', '#ffab91', 22);
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
          this.shootGun(world, this.nearestMonster(world, this.attackRange()), true, gs.lastFirst);
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
      // 攻击范围参考（占位可视化）
      if (this.poseKey === 'warrior' && !s.qi.range) { /* 战士近战圈 */ }
      ctx.strokeStyle = 'rgba(255,255,255,.18)';
      ctx.setLineDash([8, 10]); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, this.poseKey === 'warrior' ? this.attackRange() : Math.min(this.attackRange(), 300), 0, 7); ctx.stroke();
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
      // 本体
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
      // 状态小字
      const tags = [];
      if (this.gunS.phase === 'reload') tags.push(['装填' + this.gunS.t.toFixed(1) + 's', '#ffcc80']);
      if (this.charged) tags.push(['⚡行迹', '#ffe082']);
      if (this.windformT > 0) tags.push(['风行', '#b3e5fc']);
      if (this.protectT > 0) tags.push(['保护', '#ffd54f']);
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
      if (this.traveled > o.maxDist || this.x < -40 || this.x > W + 40 || this.y < -40 || this.y > H + 40) {
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
          if (o.split && (o.weakGen || 0) < o.splitGen) world.spawnSplitArrow(this, m); // 风矢分流
          if (this.pierce > 0) this.pierce--;
          else { this.dead = true; return; }
        }
      }
    }
    draw(ctx) {
      const o = this.o;
      if (o.bullet) {   // 铳弹：圆弹
        ctx.beginPath(); ctx.arc(this.x, this.y, o.size, 0, 7);
        ctx.fillStyle = o.color; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.stroke();
      } else {          // 箭矢：线段
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
      // 单月牙剑气（参考月牙天冲）：外弧凸朝前、内弧凹面朝施放者，双尖在后
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

  window.GameEntities = { Player, Monster, Arrow, SwordQi, Spell, Gem, drawText, genDecor };
})();
