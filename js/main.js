// main.js —— 入口：画布适配、主循环、输入（键盘+虚拟摇杆）、场景切换与无缝转场
// v0.2：接入流派卡面（星级/类型/下一星预览）、三姿态面板、护盾条、调试工具。
(function () {
  const W = CONFIG.DESIGN_W, H = CONFIG.DESIGN_H;
  const $ = id => document.getElementById(id);
  const canvas = $('game-canvas'), ctx = canvas.getContext('2d');
  const homeUI = $('home-ui'), gameUI = $('game-ui'),
    cardModal = $('card-modal'), cardChoices = $('card-choices'),
    pauseModal = $('pause-modal'), settleModal = $('settle-modal'),
    poseModal = $('pose-modal'), mapModal = $('map-modal'), toastEl = $('toast');
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
    world.player.cards[id] = lv;
    world.player.takenCards.push(c.name + '★' + lv);
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
    const p = toDesign(e);
    joy.active = true; joy.id = e.pointerId;
    joy.ox = p.x; joy.oy = p.y; joy.x = p.x; joy.y = p.y;
  });
  window.addEventListener('pointermove', e => {
    if (!joy.active || e.pointerId !== joy.id) return;
    const p = toDesign(e); joy.x = p.x; joy.y = p.y;
  });
  const joyEnd = e => { if (joy.active && e.pointerId === joy.id) joy.active = false; };
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
    hudMap.textContent = world.map.name + ' ' + (world.levelIdx + 1);
    if (world.boss && !world.boss.dead) {
      bossBar.classList.remove('hidden');
      bossFill.style.width = Math.max(0, world.boss.hp / world.boss.maxHp * 100) + '%';
      bossText.textContent = '最终怪物 ' + Math.ceil(Math.max(0, world.boss.hp));
    } else bossBar.classList.add('hidden');
  }

  /* ---------- 场景切换（无缝转场：主页UI淡出，画面不切换） ---------- */
  function closeModals() {
    for (const m of [cardModal, pauseModal, settleModal, poseModal, mapModal]) m.classList.add('hidden');
  }
  function startRun() {
    closeModals(); pendingChoices = 0;
    world.reset('play');
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

  /* ---------- 天启之力：升级三选一（一关上限 CONFIG.maxPicks 次） ---------- */
  let pendingChoices = 0;
  world.onLevelUp = () => { if (world.player.picks < CONFIG.maxPicks) pendingChoices++; };
  function openCards() {
    world.paused = true; joy.active = false;
    const choices = drawCards(world.player);
    if (!choices.length) { world.paused = false; pendingChoices = 0; return; }   // 卡池抽空
    cardChoices.innerHTML = '';
    choices.forEach(c => {
      const lv = (world.player.cards[c.id] || 0) + 1;
      const stars = '★'.repeat(lv) + '☆'.repeat(c.stars - lv);
      const sub = (c.school ? SCHOOLS[c.school].name + ' · ' : '') + TYPE_NAME[c.type] + ' ' + stars;
      const nextText = c.type === 'ult' ? '只能选择一次'
        : c.type === 'core' ? '核心选定后本关不再出现'
        : (c.next && c.next[lv] ? '下一星：' + c.next[lv] : '已满星');
      const d = document.createElement('div');
      d.className = 'card ' + c.type;
      const descText = typeof c.desc === 'string' ? c.desc : (c.desc[lv] || c.desc[c.stars]);
      d.innerHTML =
        `<div class="card-head">${c.name}</div>` +
        `<div class="card-sub">${sub}</div>` +
        `<div class="card-desc">${descText}</div>` +
        `<div class="card-next">${nextText}</div>`;
      d.onclick = () => {
        c.apply(world.player, world, lv);
        world.player.cards[c.id] = lv;
        world.player.picks++;
        world.player.takenCards.push(c.name + '★' + lv);
        pendingChoices--;
        if (pendingChoices > 0) openCards();
        else { cardModal.classList.add('hidden'); world.paused = false; }
      };
      cardChoices.appendChild(d);
    });
    cardModal.classList.remove('hidden');
  }

  /* ---------- 结算 ---------- */
  world.onEnd = result => {
    joy.active = false;
    $('settle-title').textContent = result === 'win' ? '征程告捷' : '征程未竟';
    const p = world.player;
    // 下一关：本图下一关，或下一张图第1关
    let next = null;
    if (result === 'win') {
      const mi = CONFIG.maps.indexOf(world.map);
      if (world.levelIdx + 1 < world.map.levels) next = { mapKey: world.map.key, li: world.levelIdx + 1 };
      else if (mi + 1 < CONFIG.maps.length) next = { mapKey: CONFIG.maps[mi + 1].key, li: 0 };
    }
    const btnNext = $('btn-next');
    if (next) {
      btnNext.classList.remove('hidden');
      btnNext.textContent = `下一关 ▶ ${CONFIG.maps.find(m => m.key === next.mapKey).name} ${next.li + 1}`;
      btnNext.onclick = () => { world.mapKey = next.mapKey; world.levelIdx = next.li; startRun(); };
    } else btnNext.classList.add('hidden');
    $('settle-stats').innerHTML =
      `<div class="stat"><span>地图关卡</span><b>${world.map.name} ${world.levelIdx + 1}</b></div>` +
      `<div class="stat"><span>天启之姿</span><b>${p.pose.name}${p.stats.core ? '·' + SCHOOLS[p.stats.core].name : ''}</b></div>` +
      `<div class="stat"><span>用时</span><b>${fmtTime(world.time)}</b></div>` +
      `<div class="stat"><span>击杀</span><b>${world.kills}</b></div>` +
      `<div class="stat"><span>等级</span><b>Lv.${p.level}</b></div>` +
      `<div class="stat"><span>天启之力选择</span><b>${p.picks}/${CONFIG.maxPicks}</b></div>` +
      `<div class="stat cards"><span>获得天启之力</span><b>${p.takenCards.length ? p.takenCards.join('、') : '无'}</b></div>`;
    setTimeout(() => { if (world.over) settleModal.classList.remove('hidden'); }, 600);
  };

  /* ---------- 暂停（含已选天启之力回看） ---------- */
  function renderPauseCards() {
    const box = $('pause-cards');
    const taken = world.player.takenCards;
    box.innerHTML = `<div class="pc-title">天启之力（${taken.length}）</div>` +
      (taken.length
        ? `<div class="pc-list">${taken.map(n => `<span class="pc-chip">${n}</span>`).join('')}</div>`
        : `<div class="pc-none">本局尚未获得天启之力</div>`);
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
    Object.values(CONFIG.poses).forEach(po => {
      const d = document.createElement('button');
      d.className = 'pose-btn' + (world.player.poseKey === po.key ? ' active' : '');
      d.style.borderColor = po.color;
      d.innerHTML =
        `<div class="pose-name" style="color:${po.color}">${po.name}</div>` +
        `<div class="pose-desc">${po.desc}</div>` +
        `<div class="pose-schools">流派：${po.schools}</div>`;
      d.onclick = () => {
        world.player.setPose(po.key);
        world.player.resetRun();
        renderPoseChoices();
        toast('已选择天启之姿：' + po.name + '（进关后由流派核心定向）');
      };
      box.appendChild(d);
    });
  }
  function renderMapList() {
    const box = $('map-list'); box.innerHTML = '';
    CONFIG.maps.forEach((m, mi) => {
      const row = document.createElement('div'); row.className = 'map-row';
      const name = document.createElement('div'); name.className = 'map-name';
      name.innerHTML = `<span class="map-dot" style="background:${m.palette.ground}"></span>${m.name}`;
      const lvs = document.createElement('div'); lvs.className = 'map-lvs';
      for (let li = 0; li < m.levels; li++) {
        const b = document.createElement('button');
        b.className = 'lv-btn'; b.textContent = (mi + 1) + '-' + (li + 1);
        b.onclick = () => { world.mapKey = m.key; world.levelIdx = li; mapModal.classList.add('hidden'); startRun(); };
        lvs.appendChild(b);
      }
      row.appendChild(name); row.appendChild(lvs); box.appendChild(row);
    });
  }

  $('btn-start').onclick = startRun;
  $('btn-map').onclick = () => { renderMapList(); mapModal.classList.remove('hidden'); };
  $('btn-map-close').onclick = () => mapModal.classList.add('hidden');
  $('btn-pose').onclick = () => { renderPoseChoices(); poseModal.classList.remove('hidden'); };
  $('btn-pose-close').onclick = () => poseModal.classList.add('hidden');
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
      const type = kind === 'summon' ? 'grunt' : (kind === 'elite' ? 'elite' : 'boss');
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
