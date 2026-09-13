// main.js —— 入口：画布适配、主循环、输入（键盘+虚拟摇杆）、场景切换与无缝转场
// v0.2：接入流派卡面（星级/类型/下一星预览）、三姿态面板、护盾条、调试工具。
(function () {
  const W = CONFIG.DESIGN_W, H = CONFIG.DESIGN_H;
  const $ = id => document.getElementById(id);
  const canvas = $('game-canvas'), ctx = canvas.getContext('2d');
  const homeUI = $('home-ui'), gameUI = $('game-ui'),
    cardModal = $('card-modal'), cardChoices = $('card-choices'),
    pauseModal = $('pause-modal'), settleModal = $('settle-modal'),
    poseModal = $('pose-modal'), mapModal = $('map-modal'), bagModal = $('bag-modal'),
    shopModal = $('shop-modal'), collectionModal = $('collection-modal'), toastEl = $('toast');
  let viewScale = 1;

  // 调试参数：?fast=N 加速（1-10）；?pose=warrior/archer/mage 指定初始姿态（正式包移除）
  const params = new URLSearchParams(location.search);
  const fastParam = Math.min(10, parseFloat(params.get('fast')) || 1);
  const world = new World();
  world.timeScale = fastParam;
  const poseParam = params.get('pose');
  if (poseParam && CONFIG.poses[poseParam]) {
    world.player.setPose(poseParam);
    world.player.resetRun();
  }
  window.__world = world;              // 调试句柄
  window.__give = id => {              // 调试：直接获得指定天启之力（绕过抽卡）
    const c = CARDS.find(x => x.id === id);
    if (!c) return 'no card: ' + id;
    const lv = (world.player.cards[id] || 0) + 1;
    c.apply(world.player, world, lv);
    CollectionSystem.discover('cards', c.id);
    world.player.cards[id] = lv;
    world.player.picks++;
    world.player.takenCards.push({ id: c.id, label: c.name + (c.type === 'core' || c.type === 'ult' ? '' : lv >= 3 ? '++' : lv === 2 ? '+' : '') });
    return c.name + '★' + lv;
  };

  /* ---------- 画布适配 ---------- */
  function fitCanvas() {
    const r = document.getElementById('app').getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    viewScale = canvas.width / W;
  }
  window.addEventListener('resize', fitCanvas);
  fitCanvas();

  /* ---------- 输入：键盘（桌面测试）+ 虚拟摇杆（触摸/鼠标） ---------- */
  const keys = new Set();
  window.addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    keys.add(k);
    if ((k === 'escape' || k === 'p') && world.mode === 'play' && !world.over && cardModal.classList.contains('hidden'))
      togglePause();
  });
  window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
  function keyDir() {
    let x = 0, y = 0;
    if (keys.has('a') || keys.has('arrowleft')) x--;
    if (keys.has('d') || keys.has('arrowright')) x++;
    if (keys.has('w') || keys.has('arrowup')) y--;
    if (keys.has('s') || keys.has('arrowdown')) y++;
    if (x && y) { x *= Math.SQRT1_2; y *= Math.SQRT1_2; }
    return { x, y };
  }

  const joy = { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0 };
  function toDesign(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
  }
  canvas.addEventListener('pointerdown', e => {
    if (world.mode !== 'play' || world.paused || world.over) return;
    // 电脑：鼠标按住（左/右键）= 锁头；触屏：第一指摇杆、第二指锁头
    if (e.pointerType === 'mouse') {
      world.lockHeld = true; world.lockPointerId = e.pointerId;
      return;
    }
    if ((joy.active && e.pointerId !== joy.id) || e.button === 2) {
      world.lockHeld = true; world.lockPointerId = e.pointerId;
      return;
    }
    const p = toDesign(e);
    joy.active = true; joy.id = e.pointerId;
    joy.ox = p.x; joy.oy = p.y; joy.x = p.x; joy.y = p.y;
  });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('pointermove', e => {
    if (!joy.active || e.pointerId !== joy.id) return;
    const p = toDesign(e); joy.x = p.x; joy.y = p.y;
  });
  const joyEnd = e => {
    if (joy.active && e.pointerId === joy.id) joy.active = false;
    if (world.lockPointerId === e.pointerId) { world.lockHeld = false; world.lockPointerId = null; }
  };
  window.addEventListener('pointerup', joyEnd);
  window.addEventListener('pointercancel', joyEnd);
  function joyDir() {
    if (!joy.active) return { x: 0, y: 0 };
    const dx = joy.x - joy.ox, dy = joy.y - joy.oy, d = Math.hypot(dx, dy);
    if (d < 12) return { x: 0, y: 0 };
    return { x: dx / d, y: dy / d };
  }
  function drawJoystick() {
    if (!joy.active) return;
    ctx.beginPath(); ctx.arc(joy.ox, joy.oy, 64, 0, 7);
    ctx.fillStyle = 'rgba(255,255,255,.15)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 3; ctx.stroke();
    const dx = joy.x - joy.ox, dy = joy.y - joy.oy, d = Math.hypot(dx, dy) || 1, cl = Math.min(d, 64);
    ctx.beginPath(); ctx.arc(joy.ox + dx / d * cl, joy.oy + dy / d * cl, 26, 0, 7);
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fill();
  }

  /* ---------- HUD ---------- */
  const hpFill = $('hp-fill'), hpText = $('hp-text'), xpFill = $('xp-fill'), xpText = $('xp-text'),
    shieldWrap = $('shield-bar-wrap'), shieldFill = $('shield-fill'), shieldText = $('shield-text'),
    hudTimer = $('hud-timer'), hudKills = $('hud-kills'), hudPose = $('hud-pose'), hudMap = $('hud-map'),
    bossBar = $('boss-bar'), bossFill = $('boss-fill'), bossText = $('boss-text');
  function fmtTime(s) {
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(Math.floor(s % 60)).padStart(2, '0');
  }
  function updateHud() {
    if (world.mode !== 'play') return;
    const p = world.player, st = p.stats;
    hpFill.style.width = Math.max(0, st.hp / st.maxHp * 100) + '%';
    hpText.textContent = Math.ceil(Math.max(0, st.hp)) + '/' + st.maxHp;
    if (st.shieldMax > 0) {
      shieldWrap.classList.remove('hidden');
      shieldFill.style.width = Math.max(0, p.shield / st.shieldMax * 100) + '%';
      shieldText.textContent = '盾 ' + Math.ceil(p.shield) + '/' + st.shieldMax;
    } else shieldWrap.classList.add('hidden');
    xpFill.style.width = Math.min(100, p.xp / p.xpNeed * 100) + '%';
    xpText.textContent = 'Lv.' + p.level;
    hudTimer.textContent = fmtTime(world.time);
    hudKills.textContent = '击杀 ' + world.kills;
    hudPose.textContent = p.pose.name + (st.core ? '·' + SCHOOLS[st.core].name : '');
    hudMap.textContent = `第${world.levelNo}关 · ${world.map.name}`;
    if (world.boss && !world.boss.dead) {
      bossBar.classList.remove('hidden');
      bossFill.style.width = Math.max(0, world.boss.hp / world.boss.maxHp * 100) + '%';
      bossText.textContent = '最终怪物 ' + Math.ceil(Math.max(0, world.boss.hp));
    } else bossBar.classList.add('hidden');
  }

  /* ---------- 场景切换（无缝转场：主页UI淡出，画面不切换） ---------- */
  function closeModals() {
    for (const m of [cardModal, pauseModal, settleModal, poseModal, mapModal, bagModal, shopModal, collectionModal]) m.classList.add('hidden');
  }
  function startRun() {
    closeModals(); pendingChoices = 0;
    world.reset('play');
    CollectionSystem.discover('maps', world.map.key);
    homeUI.classList.add('fade-out');
    setTimeout(() => { if (world.mode === 'play') homeUI.classList.add('hidden'); }, 650);
    gameUI.classList.remove('hidden');
  }
  function showHome() {
    closeModals(); pendingChoices = 0; joy.active = false;
    world.reset('idle');
    gameUI.classList.add('hidden');
    homeUI.classList.remove('hidden');
    requestAnimationFrame(() => requestAnimationFrame(() => homeUI.classList.remove('fade-out')));
  }

  /* ---------- 天启之力：升级三选一（常规上限15次+第16次奥义专属选） ---------- */
  let pendingChoices = 0;
  world.onLevelUp = () => { pendingChoices++; };   // 选满后由 openCards 判定空池自动跳过
  const starSuffix = (c, lv) => c.type === 'core' || c.type === 'ult' ? '' : (lv >= 3 ? '++' : lv === 2 ? '+' : '');
  const cardColorClass = (c, lv) => {
    if (c.type === 'ult') return 'ult';
    if (c.type === 'generic') return 'generic';
    return lv >= 3 ? 'g3' : lv === 2 ? 'g2' : 'g1';   // 特化：1星绿/2星蓝/3星黄
  };
  function openCards() {
    world.paused = true; joy.active = false;
    gameUI.classList.add('raised');   // HUD提到选卡面板之上：暂停按钮可用（回看已选）
    const choices = drawCards(world.player);
    if (!choices.length) { world.paused = false; pendingChoices = 0; gameUI.classList.remove('raised'); return; }   // 卡池抽空
    cardChoices.innerHTML = '';
    choices.forEach(c => {
      const lv = (world.player.cards[c.id] || 0) + 1;
      const sub = (c.school ? SCHOOLS[c.school].name + ' · ' : '') + TYPE_NAME[c.type];
      const nextText = c.type === 'ult' ? '只能选择一次'
        : c.type === 'core' ? '核心选定后本关不再出现'
        : (c.next && c.next[lv] ? '下一星：' + c.next[lv] : '选后满星');
      const d = document.createElement('div');
      d.className = 'card ' + cardColorClass(c, lv);
      const descText = typeof c.desc === 'string' ? c.desc : (c.desc[lv] || c.desc[c.stars]);
      const label = c.name + starSuffix(c, lv);
      d.innerHTML =
        `<div class="card-head${label.length >= 5 ? ' long' : ''}">${label}</div>` +
        `<div class="card-sub">${sub}</div>` +
        `<div class="card-desc">${descText}</div>` +
        `<div class="card-next">${nextText}</div>`;
      d.onclick = () => {
        c.apply(world.player, world, lv);
        CollectionSystem.discover('cards', c.id);
        world.player.cards[c.id] = lv;
        world.player.picks++;
        world.player.takenCards.push({ id: c.id, label: c.name + starSuffix(c, lv) });
        if (c.type === 'core') {   // 流派觉醒：光束落下降 + 变身过渡
          world.player.startTransform();
          world.addFloat(world.player.x, world.player.y - 64, '流派觉醒：' + SCHOOLS[c.school].name, '#ffd54f', 24, 1.8);
          toast('流派觉醒：' + SCHOOLS[c.school].name);
        }
        pendingChoices--;
        if (pendingChoices > 0) openCards();
        else { cardModal.classList.add('hidden'); gameUI.classList.remove('raised'); world.paused = false; }
      };
      cardChoices.appendChild(d);
    });
    cardModal.classList.remove('hidden');
  }

  /* ---------- 天梯进度 ---------- */
  const Ladder = {
    get cleared() { return +localStorage.getItem('tqz-ladder-cleared') || 0; },
    clear(n) { if (n > this.cleared) localStorage.setItem('tqz-ladder-cleared', n); },
    unlocked(n) { return n <= this.cleared + 1; },
  };

  /* ---------- 结算 ---------- */
  world.onEnd = result => {
    joy.active = false;
    $('settle-title').textContent = result === 'win' ? '征程告捷' : '征程未竟';
    const p = world.player;
    let next = null;
    if (result === 'win') {
      Ladder.clear(world.levelNo);
      if (world.levelNo < CONFIG.ladder.levels) next = { n: world.levelNo + 1 };
    }
    const btnNext = $('btn-next');
    if (next) {
      btnNext.classList.remove('hidden');
      btnNext.textContent = `下一关 ▶ 第${next.n}关 ${CONFIG.mapForLevel(next.n).name}`;
      btnNext.onclick = () => { world.levelNo = next.n; startRun(); };
    } else btnNext.classList.add('hidden');
    $('settle-stats').innerHTML =
      `<div class="stat"><span>天梯关卡</span><b>第${world.levelNo}关 · ${world.map.name}</b></div>` +
      `<div class="stat"><span>天启之姿</span><b>${p.pose.name}${p.stats.core ? '·' + SCHOOLS[p.stats.core].name : ''}</b></div>` +
      `<div class="stat"><span>用时</span><b>${fmtTime(world.time)}</b></div>` +
      `<div class="stat"><span>击杀</span><b>${world.kills}</b></div>` +
      `<div class="stat"><span>本局金币</span><b>+${world.runLoot.coins}</b></div>` +
      `<div class="stat"><span>掉落材料</span><b>${Object.entries(world.runLoot.items).length ? Object.entries(world.runLoot.items).map(([id,n]) => InventorySystem.get(id).name + '×' + n).join('、') : '无'}</b></div>` +
      `<div class="stat"><span>等级</span><b>Lv.${p.level}</b></div>` +
      `<div class="stat"><span>天启之力选择</span><b>${p.picks} 次</b></div>` +
      `<div class="stat cards"><span>获得天启之力</span><b>${p.takenCards.length ? p.takenCards.map(t => t.label).join('、') : '无'}</b></div>`;
    setTimeout(() => { if (world.over) settleModal.classList.remove('hidden'); }, 600);
  };

  /* ---------- 暂停（含已选天启之力回看，点击芯片查看详情） ---------- */
  function renderPauseCards() {
    const box = $('pause-cards');
    const taken = world.player.takenCards;
    box.innerHTML = `<div class="pc-title">天启之力（${taken.length}）· 点击查看效果</div>` +
      (taken.length
        ? `<div class="pc-list">${taken.map((t, i) => `<span class="pc-chip" data-i="${i}">${t.label}</span>`).join('')}</div><div id="pause-detail">↑ 点击上方卡片查看具体效果</div>`
        : `<div class="pc-none">本局尚未获得天启之力</div>`);
    box.querySelectorAll('.pc-chip').forEach(ch => ch.onclick = () => {
      const t = taken[+ch.dataset.i];
      const card = CARDS.find(c => c.id === t.id);
      const lv = world.player.cards[card.id] || 1;
      const descText = typeof card.desc === 'string' ? card.desc : (card.desc[lv] || card.desc[card.stars]);
      const extra = lv < card.stars && card.next && card.next[lv] ? `　下一星：${card.next[lv]}` : '　已满星';
      $('pause-detail').innerHTML = `<b>${card.name}${starSuffix(card, lv)}</b>（${TYPE_NAME[card.type]}）：${descText}${extra}`;
    });
  }
  function togglePause() {
    if (world.mode !== 'play' || world.over) return;
    if (pauseModal.classList.contains('hidden')) {
      world.paused = true; joy.active = false;
      renderPauseCards();
      pauseModal.classList.remove('hidden');
    } else {
      world.paused = false;
      pauseModal.classList.add('hidden');
    }
  }

  /* ---------- 主页面板与按钮 ---------- */
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.remove('hidden');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toastEl.classList.add('hidden'), 1600);
  }
  function renderPoseChoices() {
    const box = $('pose-choices'); box.innerHTML = '';
    const poseImg = { warrior: 'assets/base-warrior.png', archer: 'assets/base-archer.png', mage: 'assets/base-mage.png' };
    Object.values(CONFIG.poses).forEach(po => {
      const d = document.createElement('button');
      d.className = 'pose-btn' + (world.player.poseKey === po.key ? ' active' : '');
      d.style.borderColor = po.color;
      d.innerHTML =
        `<img class="pose-img" src="${poseImg[po.key]}" alt="">` +
        `<div class="pose-name" style="color:${po.color}">${po.name}</div>` +
        `<div class="pose-desc">${po.desc}</div>` +
        `<div class="pose-schools">流派：${po.schools}</div>`;
      d.onclick = () => {
        world.player.setPose(po.key);
        world.player.resetRun();
        CollectionSystem.discover('poses', po.key);
        renderPoseChoices();
        toast('已选择天启之姿：' + po.name + '（进关后由流派核心定向）');
      };
      box.appendChild(d);
    });
  }
  function renderMapList() {
    const box = $('map-list'); box.innerHTML = '';
    const cleared = Ladder.cleared;
    $('ladder-progress').textContent = `已通关 ${Math.min(cleared, CONFIG.ladder.levels)} / ${CONFIG.ladder.levels} 关`;
    for (let n = 1; n <= CONFIG.ladder.levels; n++) {
      const b = document.createElement('button');
      const map = CONFIG.mapForLevel(n);
      const state = n <= cleared ? 'done' : (Ladder.unlocked(n) ? 'next' : 'locked');
      b.className = 'lv-btn ' + state;
      b.innerHTML = `<b>${n}</b><small>${map.name}</small>`;
      if (state !== 'locked') {
        b.onclick = () => { world.levelNo = n; mapModal.classList.add('hidden'); startRun(); };
      } else {
        b.disabled = true;
      }
      box.appendChild(b);
    }
  }

  /* ---------- 背包：角色独立装备、分类、详情与锻造 ---------- */
  const BAG_RARITY = { common:'普通', rare:'稀有', epic:'史诗' };
  const BAG_POSES = { warrior:'战士', archer:'射手', mage:'法师' };
  let bagTab = 'all', bagRole = world.player.poseKey, bagSelected = null;
  function renderBag() {
    const inv = InventorySystem;
    const owned = inv.ownedItems();
    const visible = bagTab === 'all' ? owned : owned.filter(x => x.category === bagTab);
    $('bag-capacity').textContent = owned.length + ' / 30';
    $('bag-power').textContent = inv.power(bagRole);
    const totals = inv.totals(bagRole), loadout = inv.getLoadout(bagRole);
    $('bag-stats').innerHTML = [
      `伤害 +${totals.damage || 0}%`, `生命 +${totals.hp || 0}`,
      `攻速 +${totals.attackSpeed || 0}%`, `移速 +${totals.moveSpeed || 0}`
    ].map(x => `<span>${x}</span>`).join('');

    $('bag-role-tabs').querySelectorAll('button').forEach(btn => btn.classList.toggle('active', btn.dataset.bagRole === bagRole));
    $('bag-equipped').innerHTML = Object.entries(inv.slotNames).map(([slot, label]) => {
      const item = inv.get(loadout[slot]);
      return `<button class="equip-slot ${item ? item.rarity : 'empty'}" data-slot="${slot}">
        <span class="equip-label">${label}</span><b>${item ? item.icon : '+'}</b><small>${item ? item.name : '未装备'}</small>
      </button>`;
    }).join('');
    $('bag-equipped').querySelectorAll('.equip-slot').forEach(btn => btn.onclick = () => {
      const id = loadout[btn.dataset.slot];
      if (id) { bagSelected = id; bagTab = 'all'; renderBag(); }
    });

    $('bag-tabs').querySelectorAll('button').forEach(btn => btn.classList.toggle('active', btn.dataset.bagTab === bagTab));
    if (bagTab === 'craft') { renderCrafting(); return; }
    if (!visible.some(x => x.id === bagSelected)) bagSelected = visible[0] ? visible[0].id : null;
    $('bag-grid').innerHTML = visible.length ? visible.map(item => {
      const equipped = Object.values(loadout).includes(item.id);
      return `<button class="bag-item ${item.rarity} ${item.id === bagSelected ? 'selected' : ''}" data-item="${item.id}">
        <b>${item.icon}</b><span>${item.name}</span>${inv.count(item.id) > 1 || item.category !== 'equipment' ? `<i>×${inv.count(item.id)}</i>` : ''}${equipped ? '<em>已装备</em>' : ''}
      </button>`;
    }).join('') : '<div class="bag-empty">这个分类还没有物品</div>';
    $('bag-grid').querySelectorAll('.bag-item').forEach(btn => btn.onclick = () => { bagSelected = btn.dataset.item; renderBag(); });

    const item = inv.get(bagSelected), detail = $('bag-detail');
    if (!item) { detail.innerHTML = '<div class="bag-empty">请选择物品</div>'; return; }
    const equipped = item.slot && loadout[item.slot] === item.id;
    const compatible = !item.poses || item.poses.includes(bagRole);
    const roleText = item.poses && item.poses.length < 3 ? ' · ' + item.poses.map(x => BAG_POSES[x]).join('/') + '专用' : '';
    detail.innerHTML = `<div class="detail-icon ${item.rarity}">${item.icon}</div>
      <div class="detail-copy"><div class="detail-name">${item.name}</div>
      <div class="detail-meta">${BAG_RARITY[item.rarity]}${item.slot ? ' · ' + inv.slotNames[item.slot] : ''}${roleText}</div>
      <div class="detail-stats">${inv.statText(item.stats).map(x => `<span>${x}</span>`).join('') || '<span>持有数量：' + inv.count(item.id) + '</span>'}</div>
      <p>${item.desc}</p></div>
      ${item.category === 'equipment' ? `<button class="detail-action ${equipped ? 'ghost' : ''}" id="bag-action" ${compatible ? '' : 'disabled'}>${compatible ? (equipped ? '卸下' : '给' + BAG_POSES[bagRole] + '装备') : '该角色无法装备'}</button>` : ''}`;
    const action = $('bag-action');
    if (action) action.onclick = () => {
      if (equipped) { inv.unequip(item.slot, bagRole); toast(BAG_POSES[bagRole] + '已卸下：' + item.name); }
      else if (inv.equip(item.id, bagRole)) toast(BAG_POSES[bagRole] + '已装备：' + item.name);
      renderBag();
    };
  }
  function renderCrafting() {
    const inv = InventorySystem, recipes = inv.recipes;
    const selectedId = bagSelected && bagSelected.startsWith('recipe:') ? bagSelected.slice(7) : recipes[0].id;
    bagSelected = 'recipe:' + selectedId;
    $('bag-grid').innerHTML = recipes.map(r => {
      const item = inv.get(r.result), owned = inv.owns(item.id), ready = inv.canCraft(r);
      return `<button class="craft-card ${item.rarity} ${r.id === selectedId ? 'selected' : ''}" data-recipe="${r.id}">
        <b>${item.icon}</b><span>${item.name}</span><small>${owned ? '已拥有' : (ready ? '可以锻造' : '材料不足')}</small>
      </button>`;
    }).join('');
    $('bag-grid').querySelectorAll('.craft-card').forEach(btn => btn.onclick = () => { bagSelected = 'recipe:' + btn.dataset.recipe; renderBag(); });
    const recipe = recipes.find(r => r.id === selectedId) || recipes[0], item = inv.get(recipe.result);
    const costs = Object.entries(recipe.cost).map(([id,n]) => {
      const mat = inv.get(id), have = inv.count(id); return `<span class="${have >= n ? 'enough' : 'short'}">${mat.name} ${have}/${n}</span>`;
    }).join('');
    $('bag-detail').innerHTML = `<div class="detail-icon ${item.rarity}">${item.icon}</div>
      <div class="detail-copy"><div class="detail-name">锻造 · ${item.name}</div><div class="detail-meta">${BAG_RARITY[item.rarity]}装备</div>
      <div class="craft-cost">${costs}</div><p>${item.desc}</p></div>
      <button class="detail-action" id="craft-action" ${inv.canCraft(recipe) && !inv.owns(item.id) ? '' : 'disabled'}>${inv.owns(item.id) ? '已经拥有' : '消耗材料锻造'}</button>`;
    $('craft-action').onclick = () => {
      const result = inv.craft(recipe.id);
      toast(result.ok ? '锻造成功：' + result.item.name : result.reason); renderBag();
    };
  }
  function updateCoins() {
    $('home-coins').textContent = '金币 ' + InventorySystem.state.coins;
    $('shop-coins').textContent = '金币 ' + InventorySystem.state.coins;
  }
  function renderShop() {
    const inv = InventorySystem, stock = inv.items.filter(x => x.price);
    updateCoins();
    $('shop-grid').innerHTML = stock.map(item => {
      const sold = item.category === 'equipment' && inv.owns(item.id);
      const role = item.poses && item.poses.length < 3 ? item.poses.map(x => BAG_POSES[x]).join('/') + '专用' : '全角色可用';
      return `<article class="shop-card ${item.rarity}"><div class="shop-icon">${item.icon}</div><div class="shop-copy"><b>${item.name}</b>
        <small>${item.category === 'equipment' ? role : '消耗品 · 持有 ' + inv.count(item.id)}</small><p>${inv.statText(item.stats).join(' · ') || item.desc}</p></div>
        <button data-buy="${item.id}" ${sold || inv.state.coins < item.price ? 'disabled' : ''}>${sold ? '已拥有' : '金币 ' + item.price}</button></article>`;
    }).join('');
    $('shop-grid').querySelectorAll('[data-buy]').forEach(btn => btn.onclick = () => {
      const result = inv.buy(btn.dataset.buy); toast(result.ok ? '购买成功：' + result.item.name : result.reason); renderShop();
    });
  }
  InventorySystem.setOnChange(kind => {
    updateCoins();
    CollectionSystem.refreshOwnedItems(); updateCollectionDot();
    if (kind === 'equip' && world.mode === 'idle') world.player.resetRun();
  });
  $('bag-role-tabs').querySelectorAll('button').forEach(btn => btn.onclick = () => { bagRole = btn.dataset.bagRole; bagSelected = null; renderBag(); });
  $('bag-tabs').querySelectorAll('button').forEach(btn => btn.onclick = () => { bagTab = btn.dataset.bagTab; renderBag(); });
  updateCoins();

  /* ---------- 图鉴：发现、筛选、详情与红点 ---------- */
  let collectionTab = 'poses', collectionSelected = null;
  function collectionTotals() {
    return CollectionSystem.categories.reduce((a,c) => { const s=CollectionSystem.summary(c.key); a.found+=s.found; a.total+=s.total; return a; }, {found:0,total:0});
  }
  function updateCollectionDot() {
    const hasNew = CollectionSystem.categories.some(c => CollectionSystem.entries(c.key).some(e => CollectionSystem.isNew(c.key,e.id)));
    $('collection-dot').classList.toggle('hidden', !hasNew);
  }
  function renderCollection() {
    const cs=CollectionSystem, foundOnly=$('collection-found-only').checked, summary=cs.summary(collectionTab), all=collectionTotals();
    $('collection-total').textContent=`${all.found} / ${all.total}`; $('collection-progress').textContent=`发现 ${summary.found} / ${summary.total}`;
    $('collection-tabs').innerHTML=cs.categories.map(c=>{const s=cs.summary(c.key);return `<button class="${c.key===collectionTab?'active':''}" data-collection-tab="${c.key}">${c.name}<br>${s.found}/${s.total}</button>`}).join('');
    $('collection-tabs').querySelectorAll('button').forEach(b=>b.onclick=()=>{collectionTab=b.dataset.collectionTab;collectionSelected=null;renderCollection()});
    let entries=cs.entries(collectionTab); if(foundOnly) entries=entries.filter(e=>cs.isDiscovered(collectionTab,e.id));
    if(!entries.some(e=>e.id===collectionSelected)) collectionSelected=entries[0]&&entries[0].id;
    $('collection-grid').innerHTML=entries.length?entries.map(e=>{const found=cs.isDiscovered(collectionTab,e.id),fresh=cs.isNew(collectionTab,e.id);return `<button class="collection-entry ${found?'':'locked'} ${e.id===collectionSelected?'selected':''}" data-entry="${e.id}"><b>${found?e.icon:'?'}</b><span>${found?e.name:'尚未发现'}</span>${fresh?'<em>NEW</em>':''}</button>`}).join(''):'<div class="bag-empty">暂无符合条件的记录</div>';
    $('collection-grid').querySelectorAll('.collection-entry').forEach(b=>b.onclick=()=>{collectionSelected=b.dataset.entry;if(cs.isDiscovered(collectionTab,collectionSelected))cs.markSeen(collectionTab,collectionSelected);renderCollection();updateCollectionDot()});
    const entry=cs.entries(collectionTab).find(e=>e.id===collectionSelected), detail=$('collection-detail');
    if(!entry){detail.innerHTML='<div class="collection-locked">请选择一项记录</div>';return}
    if(!cs.isDiscovered(collectionTab,entry.id)){detail.innerHTML=`<div class="collection-locked">尚未发现<br><small>线索：${entry.source}</small></div>`;return}
    detail.innerHTML=`<div class="collection-detail-icon">${entry.icon}</div><div><h3>${entry.name}</h3><small>${entry.subtitle}</small><p>${entry.desc}</p><div class="collection-stats">${(entry.stats||[]).map(x=>`<span>${x}</span>`).join('')}</div></div><div class="collection-source">获取方式：${entry.source}</div>`;
  }
  CollectionSystem.discover('poses',world.player.poseKey,true); CollectionSystem.discover('maps',world.map.key,true); CollectionSystem.refreshOwnedItems();
  CollectionSystem.setOnChange(()=>updateCollectionDot()); updateCollectionDot();
  $('collection-found-only').onchange=renderCollection;

  $('btn-start').onclick = startRun;
  $('btn-map').onclick = () => { renderMapList(); mapModal.classList.remove('hidden'); };
  $('btn-map-close').onclick = () => mapModal.classList.add('hidden');
  $('btn-pose').onclick = () => { renderPoseChoices(); poseModal.classList.remove('hidden'); };
  $('btn-pose-close').onclick = () => poseModal.classList.add('hidden');
  $('btn-bag').onclick = () => { bagRole = world.player.poseKey; renderBag(); bagModal.classList.remove('hidden'); };
  $('btn-bag-close').onclick = () => bagModal.classList.add('hidden');
  $('btn-shop').onclick = () => { renderShop(); shopModal.classList.remove('hidden'); };
  $('btn-shop-close').onclick = () => shopModal.classList.add('hidden');
  $('btn-collection').onclick = () => { renderCollection(); collectionModal.classList.remove('hidden'); };
  $('btn-collection-close').onclick = () => collectionModal.classList.add('hidden');
  $('btn-pause').onclick = togglePause;
  $('btn-resume').onclick = togglePause;
  $('btn-giveup').onclick = showHome;
  $('btn-retry').onclick = startRun;
  $('btn-home').onclick = showHome;
  document.querySelectorAll('[data-todo]').forEach(b => b.onclick = () => toast('功能开发中（占位框架）'));

  /* ---------- 测试悬浮球（正式包移除） ---------- */
  const ball = $('debug-ball'), dbgPanel = $('debug-panel');
  const SPEEDS = [1, 2, 4, 8];
  function dbgAction(kind) {
    const E = window.GameEntities;
    if (kind === 'speed') {
      const i = (SPEEDS.indexOf(world.timeScale) + 1) % SPEEDS.length;
      world.timeScale = SPEEDS[i];
      document.querySelector('[data-dbg="speed"]').textContent = '倍速 ×' + world.timeScale;
      toast('游戏速度 ×' + world.timeScale);
    } else if (kind === 'level') {
      const p = world.player;
      p.gainXp(p.xpNeed - p.xp, world);   // 触发三选一（正式模式）
    } else if (kind === 'inv') {
      world.debugInvincible = !world.debugInvincible;
      document.querySelector('[data-dbg="inv"]').textContent = world.debugInvincible ? '无敌 开' : '无敌 关';
      toast(world.debugInvincible ? '无敌已开启' : '无敌已关闭');
    } else if (kind === 'summon' || kind === 'elite' || kind === 'boss') {
      if (world.mode !== 'play') { toast('请先进关卡'); return; }
      if (kind === 'boss') {
        const m = world.spawnMonster('boss');   // 走正式生成：挂接 world.boss 与 HUD 血条
        toast('已召唤 ' + m.name);
        return;
      }
      const type = kind === 'summon' ? 'grunt' : 'elite';
      const n = kind === 'summon' ? 5 : 1;
      for (let i = 0; i < n; i++) {
        const ang = Math.random() * Math.PI * 2, r = 160 + Math.random() * 120;
        const m = new E.Monster(type,
          Math.max(30, Math.min(W - 30, world.player.x + Math.cos(ang) * r)),
          Math.max(30, Math.min(H - 30, world.player.y + Math.sin(ang) * r)), 1);
        world.monsters.push(m);
      }
      toast('已召唤 ' + CONFIG.monsters[type].name + (n > 1 ? ' ×' + n : ''));
    } else if (kind === 'clear') {
      [...world.monsters].forEach(m => m.takeDamage(99999, world));
      toast('全场秒杀');
    } else if (kind === 'killboss') {
      if (world.boss && !world.boss.dead) { world.boss.takeDamage(999999, world); toast('最终怪物已秒杀'); }
      else toast('场上没有最终怪物');
    }
  }
  let dbgDrag = { on: false, moved: false, sx: 0, sy: 0, ox: 0, oy: 0 };
  ball.addEventListener('pointerdown', e => {
    dbgDrag = { on: true, moved: false, sx: e.clientX, sy: e.clientY };
    const r = ball.getBoundingClientRect(), appR = $('app').getBoundingClientRect();
    dbgDrag.ox = r.left - appR.left; dbgDrag.oy = r.top - appR.top;
    ball.setPointerCapture(e.pointerId);
  });
  ball.addEventListener('pointermove', e => {
    if (!dbgDrag.on) return;
    const dx = e.clientX - dbgDrag.sx, dy = e.clientY - dbgDrag.sy;
    if (Math.hypot(dx, dy) > 8) dbgDrag.moved = true;
    if (dbgDrag.moved) {
      const appR = $('app').getBoundingClientRect();
      ball.style.left = Math.max(0, Math.min(appR.width - 54, dbgDrag.ox + dx)) + 'px';
      ball.style.top = Math.max(0, Math.min(appR.height - 54, dbgDrag.oy + dy)) + 'px';
      ball.style.right = 'auto';
    }
  });
  ball.addEventListener('pointerup', () => {
    if (dbgDrag.on && !dbgDrag.moved) dbgPanel.classList.toggle('hidden');
    dbgDrag.on = false;
  });
  dbgPanel.querySelectorAll('.dbg-btn').forEach(b => b.onclick = () => dbgAction(b.dataset.dbg));
  document.querySelector('[data-dbg="speed"]').textContent = '倍速 ×' + world.timeScale;

  /* ---------- 主循环 ---------- */
  let lastT = performance.now();
  function loop(t) {
    let dt = (t - lastT) / 1000; lastT = t;
    if (dt > 0.05) dt = 0.05;
    const kd = keyDir(), jd = joyDir();
    world.inputDir = (jd.x || jd.y) ? jd : kd;
    world.update(dt);
    if (pendingChoices > 0 && !world.over && cardModal.classList.contains('hidden') && pauseModal.classList.contains('hidden'))
      openCards();
    ctx.setTransform(viewScale, 0, 0, viewScale, 0, 0);
    world.render(ctx);
    drawJoystick();
    updateHud();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
