// cards.js —— 《天启之路》天启之力卡池 v0.1
// 依据《战力系统与第一批天启之力 v0.1》：六流派各6张（核心/成长×4/终极）+ 通用6张，共42张。
// 星级：核心与成长卡可升三星（重复选择升星），终极进化只能选一次。
// 卡面文字（desc）按文档规范保持一句话简洁；数值细节与升星变化放在"下一星"行展示。
// 所有百分比为占位值，待怪物与关卡基准建立后测试确定。
(function () {
  const A = (arr, lv) => arr[lv - 1];

  window.SCHOOLS = {
    piaobo:  { name: '漂泊剑客', stance: 'warrior' },
    zhongqi: { name: '重骑士',   stance: 'warrior' },
    zhufeng: { name: '逐风射手', stance: 'archer'  },
    duanshou:{ name: '短铳射手', stance: 'archer'  },
    zhuixing:{ name: '坠星法师', stance: 'mage'    },
    wushi:   { name: '巫师',     stance: 'mage'    },
  };
  window.TYPE_NAME = { core: '流派核心', growth: '流派成长', ult: '终极进化', generic: '通用天启' };

  window.CARDS = [

  /* ================= A. 战士 · 漂泊剑客 ================= */
  { id:'ZJ-01', name:'剑气初鸣', school:'piaobo', type:'core', stars:3,
    desc:'挥剑时放出一道穿透剑气，近身可双倍命中',
    next:{1:'下一星：剑气伤害75%，穿透4人', 2:'下一星：剑气伤害90%，穿透5人'},
    apply(p, w, lv){ p.stats.core='piaobo'; p.stats.qi.dmgMul=A([.6,.75,.9],lv); p.stats.qi.pierce=2+lv; } },
  { id:'ZJ-02', name:'破风剑势', school:'piaobo', type:'growth', stars:3,
    desc:'剑气飞得更远更快，宽度略微增加',
    next:{1:'下一星：距离/速度/宽度继续提升', 2:'下一星：距离/速度/宽度进一步提升'},
    apply(p,w,lv){ const q=p.stats.qi; q.range=420+A([60,100,140],lv); q.speed=470+A([40,80,120],lv); q.width=70+A([10,18,26],lv); } },
  { id:'ZJ-03', name:'一线破阵', school:'piaobo', type:'growth', stars:3,
    desc:'剑气穿透伤害衰减降低，穿透数+1',
    next:{1:'下一星：衰减更低，穿透再+1', 2:'下一星：贯穿小怪不再衰减，穿透+1'},
    apply(p,w,lv){ const q=p.stats.qi; q.falloff=A([.10,.06,0],lv); q.pierceAdd=(q.pierceAdd||0)+1; } },
  { id:'ZJ-04', name:'回锋留影', school:'piaobo', type:'growth', stars:3,
    desc:'剑气抵达尽头后沿原路折返一次',
    next:{1:'下一星：回锋60%伤害，更快返回', 2:'下一星：回锋80%伤害，更快返回'},
    apply(p,w,lv){ const q=p.stats.qi; q.ret=A([.4,.6,.8],lv); q.retSpeed=A([1,1.3,1.6],lv); } },
  { id:'ZJ-05', name:'孤客疾行', school:'piaobo', type:'growth', stars:3,
    desc:'持续移动积累行迹，强化下一道剑气',
    next:{1:'下一星：积累更快，强化更高', 2:'下一星：积累更快，强化更高'},
    apply(p,w,lv){ const q=p.stats.qi; q.chargeNeed=A([3,2.4,1.8],lv); q.chargeMul=A([1.5,1.8,2.2],lv); } },
  { id:'ZJ-06', name:'天涯断空', school:'piaobo', type:'ult', stars:1,
    desc:'每5道剑气斩出一道贯穿巨剑，不衰减',
    apply(p,w,lv){ p.stats.qi.giantEvery=5; } },

  /* ================= B. 战士 · 重骑士 ================= */
  { id:'ZQ-01', name:'铁壁披身', school:'zhongqi', type:'core', stars:3,
    desc:'获得可恢复盾牌，减伤且受伤先扣盾',
    next:{1:'下一星：盾牌55，减伤25%', 2:'下一星：盾牌70，减伤30%'},
    apply(p,w,lv){ const s=p.stats; s.core='zhongqi'; s.shieldMax=A([40,55,70],lv); s.dr=A([.2,.25,.3],lv); p.shield=s.shieldMax; } },
  { id:'ZQ-02', name:'重甲锻身', school:'zhongqi', type:'growth', stars:3,
    desc:'生命与盾牌上限提高，略微降低移速',
    next:{1:'下一星：生命+40，盾牌+25', 2:'下一星：生命+55，盾牌+35'},
    apply(p,w,lv){ const s=p.stats; const dh=A([25,40,55],lv)- (lv>1?A([25,40,55],lv-1):0); s.maxHp+=dh; s.hp=Math.min(s.maxHp,s.hp+dh*0.5); s.shieldMax+=A([15,25,35],lv)-(lv>1?A([15,25,35],lv-1):0); if(lv===1) s.moveSpeed*=0.96; } },
  { id:'ZQ-03', name:'盾撞开路', school:'zhongqi', type:'growth', stars:3,
    desc:'持盾接触敌人时造成盾击并击退',
    next:{1:'下一星：盾击伤害32', 2:'下一星：盾击伤害45'},
    apply(p,w,lv){ p.stats.knight.bash=A([20,32,45],lv); } },
  { id:'ZQ-04', name:'受击回敬', school:'zhongqi', type:'growth', stars:3,
    desc:'受到伤害时向周围放出反击震波',
    next:{1:'下一星：震波110%，范围130', 2:'下一星：震波140%，范围150'},
    apply(p,w,lv){ const k=p.stats.knight; k.thorns=A([.8,1.1,1.4],lv); k.thornR=A([110,130,150],lv); } },
  { id:'ZQ-05', name:'血战不退', school:'zhongqi', type:'growth', stars:3,
    desc:'低生命时回盾更快，近战伤害提高',
    next:{1:'下一星：触发区间50%，近战+30%', 2:'下一星：触发区间60%，近战+40%'},
    apply(p,w,lv){ const k=p.stats.knight; k.lowAt=A([.4,.5,.6],lv); k.lowBonus=A([.2,.3,.4],lv); } },
  { id:'ZQ-06', name:'一骑当关', school:'zhongqi', type:'ult', stars:1,
    desc:'盾破时放出大范围冲击并获得短暂保护',
    apply(p,w,lv){ p.stats.knight.rebirth=true; } },

  /* ================= C. 射手 · 逐风射手 ================= */
  { id:'SS-01', name:'逐风长弓', school:'zhufeng', type:'core', stars:3,
    desc:'射程、攻速、移速全面提高',
    next:{1:'下一星：射程25%/频率30%/移速12%', 2:'下一星：射程35%/频率42%/移速16%'},
    apply(p,w,lv){ const s=p.stats; s.core='zhufeng'; s.rangeMul+=A([.15,.25,.35],lv)-(lv>1?A([.15,.25,.35],lv-1):0); s.rateMul+=A([.18,.30,.42],lv)-(lv>1?A([.18,.30,.42],lv-1):0); s.moveSpeed*=1+A([.08,.12,.16],lv)-(lv>1?A([.08,.12,.16],lv-1):0); } },
  { id:'SS-02', name:'轻羽步', school:'zhufeng', type:'growth', stars:3,
    desc:'持续移动叠加攻速，停下后逐渐消退',
    next:{1:'下一星：层数上限6', 2:'下一星：层数上限8'},
    apply(p,w,lv){ const wd=p.stats.wind; wd.stack=true; wd.stackMax=A([4,6,8],lv); } },
  { id:'SS-03', name:'鹰眼猎距', school:'zhufeng', type:'growth', stars:3,
    desc:'箭矢飞行越远，命中伤害越高',
    next:{1:'下一星：增伤上限25%', 2:'下一星：增伤上限35%'},
    apply(p,w,lv){ p.stats.wind.dist=A([.15,.25,.35],lv); } },
  { id:'SS-04', name:'连珠不息', school:'zhufeng', type:'growth', stars:3,
    desc:'连续命中同一目标，对其攻速提升',
    next:{1:'下一星：层数上限8', 2:'下一星：层数上限12'},
    apply(p,w,lv){ p.stats.wind.combo=A([5,8,12],lv); } },
  { id:'SS-05', name:'风矢分流', school:'zhufeng', type:'growth', stars:3,
    desc:'命中后分出弱箭，追击附近另一敌人',
    next:{1:'下一星：分流55%伤害', 2:'下一星：分流70%，可再分流'},
    apply(p,w,lv){ const wd=p.stats.wind; wd.split=A([.4,.55,.7],lv); wd.splitGen=lv>=3?2:1; } },
  { id:'SS-06', name:'风行无踪', school:'zhufeng', type:'ult', stars:1,
    desc:'移速层数攒满后进入高速强化风行',
    apply(p,w,lv){ p.stats.wind.windform=true; } },

  /* ================= D. 射手 · 短铳射手 ================= */
  { id:'SD-01', name:'双响短铳', school:'duanshou', type:'core', stars:3,
    desc:'向身前扇形快速泼射两轮流弹，随后装填',
    next:{1:'下一星：单发55%/装填1.55秒/穿透2', 2:'下一星：单发65%/装填1.4秒/穿透3'},
    apply(p,w,lv){ const s=p.stats,g=s.gun; s.core='duanshou'; g.per=A([1.9,2.1,2.3],lv); g.reload=A([1.7,1.55,1.4],lv); g.pierce=A([1,2,3],lv); } },
  { id:'SD-02', name:'快手装填', school:'duanshou', type:'growth', stars:3,
    desc:'装填期间持续移动可加快装填',
    next:{1:'下一星：装填加速30%', 2:'下一星：装填加速40%'},
    apply(p,w,lv){ p.stats.gun.moveReload=A([.2,.3,.4],lv); } },
  { id:'SD-03', name:'贴身火药', school:'duanshou', type:'growth', stars:3,
    desc:'近距离命中伤害与击退大幅提高',
    next:{1:'下一星：近距增伤40%', 2:'下一星：近距增伤55%'},
    apply(p,w,lv){ p.stats.gun.closeBonus=A([.25,.4,.55],lv); } },
  { id:'SD-04', name:'贯体独头弹', school:'duanshou', type:'growth', stars:3,
    desc:'流弹穿透更多，穿透衰减更低',
    next:{1:'下一星：穿透+1，衰减更低', 2:'下一星：穿透+1，几乎无衰减'},
    apply(p,w,lv){ const g=p.stats.gun; g.pierceAdd=(g.pierceAdd||0)+1; g.falloff=A([.15,.10,.06],lv); g.bulletAdd=(g.bulletAdd||0)+2; } },
  { id:'SD-05', name:'第二声轰鸣', school:'duanshou', type:'growth', stars:3,
    desc:'双响的第二发伤害更高更致命',
    next:{1:'下一星：第二发×1.7/额外30%', 2:'下一星：第二发×2.0/额外40%'},
    apply(p,w,lv){ const g=p.stats.gun; g.secondMul=A([1.4,1.7,2.0],lv); g.secondBonus=A([.2,.3,.4],lv); } },
  { id:'SD-06', name:'终结双响', school:'duanshou', type:'ult', stars:1,
    desc:'每3轮装填后两管齐爆，泼射大量流弹',
    apply(p,w,lv){ p.stats.gun.megaEvery=3; } },

  /* ================= E. 法师 · 坠星法师 ================= */
  { id:'FX-01', name:'唤星之术', school:'zhuixing', type:'core', stars:3,
    desc:'在敌人最密集处召唤延迟坠落的陨石',
    next:{1:'下一星：伤害170%/延迟0.5秒', 2:'下一星：伤害190%/延迟0.42秒'},
    apply(p,w,lv){ const s=p.stats,t=s.star; s.core='zhuixing'; t.dmgMul=A([1.5,1.7,1.9],lv); t.delay=A([.6,.5,.42],lv); } },
  { id:'FX-02', name:'星陨扩界', school:'zhuixing', type:'growth', stars:3,
    desc:'陨石爆炸范围扩大',
    next:{1:'下一星：范围+45', 2:'下一星：范围+65'},
    apply(p,w,lv){ const t=p.stats.star; t.radius+=A([25,45,65],lv)-(lv>1?A([25,45,65],lv-1):0); } },
  { id:'FX-03', name:'星核压缩', school:'zhuixing', type:'growth', stars:3,
    desc:'越靠近陨石中心，受到的伤害越高',
    next:{1:'下一星：中心增伤40%', 2:'下一星：中心增伤55%'},
    apply(p,w,lv){ p.stats.star.center=A([.25,.4,.55],lv); } },
  { id:'FX-04', name:'碎星四溅', school:'zhuixing', type:'growth', stars:3,
    desc:'爆炸后溅出碎星，造成二次爆炸',
    next:{1:'下一星：碎星4块', 2:'下一星：碎星5块'},
    apply(p,w,lv){ p.stats.star.frag=A([3,4,5],lv); } },
  { id:'FX-05', name:'连星坠落', school:'zhuixing', type:'growth', stars:3,
    desc:'主陨石落下后追落较小的陨石',
    next:{1:'下一星：追落2颗', 2:'下一星：追落2颗且伤害更高'},
    apply(p,w,lv){ const t=p.stats.star; t.follow=A([1,2,2],lv); t.followMul=lv>=3?.75:.6; } },
  { id:'FX-06', name:'天倾星落', school:'zhuixing', type:'ult', stars:1,
    desc:'每4颗陨石后坠下巨型陨星，震慑全场',
    apply(p,w,lv){ p.stats.star.giantEvery=4; } },

  /* ================= F. 法师 · 巫师 ================= */
  { id:'FW-01', name:'毒咒入骨', school:'wushi', type:'core', stars:3,
    desc:'法术命中叠加中毒，持续扣血',
    next:{1:'下一星：上限9层/持续5秒/每层1.0', 2:'下一星：上限12层/持续6秒/每层1.25'},
    apply(p,w,lv){ const s=p.stats,t=s.witch; s.core='wushi'; t.max=A([6,9,12],lv); t.dur=A([4,5,6],lv); t.dps=A([.8,1.0,1.25],lv); } },
  { id:'FW-02', name:'病蔓传染', school:'wushi', type:'growth', stars:3,
    desc:'中毒敌人死亡时毒层传向周围',
    next:{1:'下一星：传播范围140', 2:'下一星：传播范围180'},
    apply(p,w,lv){ p.stats.witch.spreadR=A([100,140,180],lv); } },
  { id:'FW-03', name:'脆骨咒印', school:'wushi', type:'growth', stars:3,
    desc:'中毒足够深时附加易伤，受伤增加',
    next:{1:'下一星：3层触发/易伤30%', 2:'下一星：2层触发/易伤40%'},
    apply(p,w,lv){ const t=p.stats.witch; t.vulnAt=A([4,3,2],lv); t.vulnAmt=A([.2,.3,.4],lv); } },
  { id:'FW-04', name:'寒滞咒', school:'wushi', type:'growth', stars:3,
    desc:'附加减速，反复施法可冻结目标',
    next:{1:'下一星：减速28%/冰冻1.2秒', 2:'下一星：减速36%/冰冻1.5秒'},
    apply(p,w,lv){ const t=p.stats.witch; t.slow=A([.2,.28,.36],lv); t.freeze=A([1.0,1.2,1.5],lv); } },
  { id:'FW-05', name:'倒戈蛊', school:'wushi', type:'growth', stars:3,
    desc:'毒深的怪物有机率反水攻击同伴',
    next:{1:'下一星：几率25%/反水3秒', 2:'下一星：几率35%/反水4秒'},
    apply(p,w,lv){ const t=p.stats.witch; t.charm=A([2,3,4],lv); t.charmChance=A([.15,.25,.35],lv); } },
  { id:'FW-06', name:'百蛊夜行', school:'wushi', type:'ult', stars:1,
    desc:'周期性引爆场上所有中毒目标',
    apply(p,w,lv){ p.stats.witch.detonate=6; } },

  /* ================= 通用天启 ================= */
  { id:'TY-01', name:'天启强躯', school:null, type:'generic', stars:3,
    desc:'生命上限提高，并回复一部分',
    next:{1:'下一星：生命+30', 2:'下一星：生命+40'},
    apply(p,w,lv){ const d=A([20,30,40],lv)-(lv>1?A([20,30,40],lv-1):0); p.stats.maxHp+=d; p.stats.hp=Math.min(p.stats.maxHp,p.stats.hp+d*0.5); } },
  { id:'TY-02', name:'疾行之印', school:null, type:'generic', stars:3,
    desc:'移动速度提高（设有软上限）',
    next:{1:'下一星：移速+10%', 2:'下一星：移速+13%'},
    apply(p,w,lv){ const d=A([.07,.10,.13],lv)-(lv>1?A([.07,.10,.13],lv-1):0); p.stats.moveSpeed*=1+d; } },
  { id:'TY-03', name:'迅击之律', school:null, type:'generic', stars:3,
    desc:'攻击与施法频率提高',
    next:{1:'下一星：频率+12%', 2:'下一星：频率+16%'},
    apply(p,w,lv){ const s=p.stats; s.rateMul+=A([.08,.12,.16],lv)-(lv>1?A([.08,.12,.16],lv-1):0); if(s.core==='duanshou') s.gun.reload*=1-A([.06,.10,.14],lv)+(lv>1?A([.06,.10,.14],lv-1):0); } },
  { id:'TY-04', name:'扩域刻印', school:null, type:'generic', stars:3,
    desc:'剑气/弹体/爆炸等范围变大',
    next:{1:'+15%', 2:'+20%'},
    apply(p,w,lv){ const d=A([.10,.15,.20],lv)-(lv>1?A([.10,.15,.20],lv-1):0); p.stats.areaMul+=d; } },
  { id:'TY-05', name:'回生之息', school:null, type:'generic', stars:3,
    desc:'每隔一段时间恢复生命',
    next:{1:'下一星：每5秒5点', 2:'下一星：每5秒8点'},
    apply(p,w,lv){ p.stats.hoT.amt=A([3,5,8],lv); } },
  { id:'TY-06', name:'猎首之意', school:null, type:'generic', stars:3,
    desc:'对精英与最终怪物伤害提高',
    next:{1:'下一星：+20%', 2:'下一星：+30%'},
    apply(p,w,lv){ const d=A([.12,.20,.30],lv)-(lv>1?A([.12,.20,.30],lv-1):0); p.stats.eliteDmg+=d; } },
  ];

  // 三选一抽卡（占位规则，按文档"成型过程"实现）：
  // 1) 首次选择必出本姿态的两个流派核心；2) 选核心后另一核心不再出现，流派成长加权；
  // 3) 核心三星且两张成长≥二星后终极进化才可能出现；4) 通用卡低权重穿插。
  window.drawCards = function (p) {
    const lv = id => p.cards[id] || 0;
    const cores = CARDS.filter(c => c.type === 'core' && SCHOOLS[c.school].stance === p.poseKey);
    const ownedCore = cores.find(c => lv(c.id));
    if (!ownedCore) {
      const gens = CARDS.filter(c => c.type === 'generic' && lv(c.id) < c.stars);
      return [...cores, gens[Math.floor(Math.random() * gens.length)]];
    }
    const pool = [];
    const push = (c, w) => pool.push({ c, w });
    for (const c of CARDS) {
      if (lv(c.id) >= c.stars) continue;
      if (c.id === ownedCore.id) push(c, 2.5);
      else if (c.type === 'growth' && c.school === ownedCore.school) push(c, 3);
      else if (c.type === 'generic') push(c, 1.2);
      else if (c.type === 'ult' && c.school === ownedCore.school) {
        const g2 = CARDS.filter(x => x.type === 'growth' && x.school === ownedCore.school && lv(x.id) >= 2).length;
        if (lv(ownedCore.id) >= 3 && g2 >= 2) push(c, 0.9);
      }
    }
    const out = [];
    while (out.length < 3 && pool.length) {
      const tot = pool.reduce((s, e) => s + e.w, 0);
      let r = Math.random() * tot, i = 0;
      for (; i < pool.length; i++) { r -= pool[i].w; if (r <= 0) break; }
      if (i >= pool.length) i = pool.length - 1;
      out.push(pool[i].c); pool.splice(i, 1);
    }
    return out;
  };
})();
