// collection.js —— 图鉴条目、发现进度与 NEW 状态
(function () {
  const SAVE_KEY = 'tianqi_collection_v1';
  const CATEGORIES = [
    { key:'poses', name:'天启之姿' }, { key:'cards', name:'天启之力' },
    { key:'monsters', name:'怪物' }, { key:'maps', name:'地图' }, { key:'items', name:'装备材料' }
  ];
  function load() {
    try { const v = JSON.parse(localStorage.getItem(SAVE_KEY)); return v && v.discovered ? v : { discovered:{}, seen:{} }; }
    catch (_) { return { discovered:{}, seen:{} }; }
  }
  const state = load();
  const keyOf = (category,id) => category + ':' + id;
  function save() { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); }
  function discover(category,id,silent=false) {
    const key=keyOf(category,id); if(state.discovered[key]) return false;
    state.discovered[key]=Date.now(); save(); if(!silent && onChange) onChange(category,id); return true;
  }
  function markSeen(category,id) { state.seen[keyOf(category,id)]=true; save(); }
  function isDiscovered(category,id) { return !!state.discovered[keyOf(category,id)]; }
  function isNew(category,id) { const k=keyOf(category,id); return !!state.discovered[k] && !state.seen[k]; }
  function entries(category) {
    if(category==='poses') return Object.values(CONFIG.poses).map(p=>({id:p.key,name:p.name,icon:p.name[0],subtitle:p.schools,desc:p.desc,source:'在天启之姿面板中选择',stats:[`基础伤害 ${p.base.damage}`,`攻击间隔 ${p.base.attackInterval}秒`,`攻击范围 ${p.base.attackRange}`]}));
    if(category==='cards') return CARDS.map(c=>({id:c.id,name:c.name,icon:c.type==='ult'?'极':(c.type==='core'?'核':'启'),subtitle:(c.school?SCHOOLS[c.school].name+' · ':'')+TYPE_NAME[c.type],desc:c.desc,source:'战斗升级时选择该天启之力',stats:[`最高 ${c.stars} 星`]}));
    if(category==='monsters') return Object.entries(CONFIG.monsters).map(([id,m])=>({id,name:m.name,icon:id==='boss'?'王':(id==='elite'?'精':'怪'),subtitle:id==='boss'?'最终怪物':(id==='elite'?'精英怪物':'普通怪物'),desc:id==='boss'?'守卫关卡终点的强大敌人。':'会主动追击天选者的敌人。',source:'在关卡中首次击杀',stats:[`生命 ${m.hp}`,`伤害 ${m.damage}`,`速度 ${m.speed}`]}));
    if(category==='maps') return CONFIG.maps.map((m,i)=>({id:m.key,name:m.name,icon:String(i+1),subtitle:`主题地图 · ${m.levels}关`,desc:`天启之路的${m.name}区域，每一关都会提高怪物强度。`,source:'首次进入该地图',stats:[`关卡数量 ${m.levels}`]}));
    if(category==='items') return InventorySystem.items.map(i=>({id:i.id,name:i.name,icon:i.icon,subtitle:i.category==='equipment'?(InventorySystem.slotNames[i.slot]||'装备'):(i.category==='material'?'锻造材料':'消耗品'),desc:i.desc,source:i.price?'商城购买':'击杀怪物掉落或背包锻造',stats:InventorySystem.statText(i.stats)}));
    return [];
  }
  function summary(category) { const list=entries(category), found=list.filter(x=>isDiscovered(category,x.id)).length; return {found,total:list.length}; }
  function refreshOwnedItems() { InventorySystem.ownedItems().forEach(i=>discover('items',i.id,true)); }
  let onChange=null;
  window.CollectionSystem={state,categories:CATEGORIES,entries,summary,discover,markSeen,isDiscovered,isNew,refreshOwnedItems,setOnChange(fn){onChange=fn;}};
})();
