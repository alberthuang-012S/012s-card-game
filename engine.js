(function (root) {
  'use strict';
  const DATA = typeof module === 'object' && module.exports ? require('./data.js') : root.GAME_DATA;
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const copy = value => JSON.parse(JSON.stringify(value));
  const targets = s => s.customers.concat(s.monster ? [s.monster] : []);
  const monsterCards = config => !config.monsterMode ? [] : DATA.monsters.filter(c=>config.monsterSet==='all' || ['M01','M02','M04','M05'].includes(c.key));
  function random(s) { s.rng = (Math.imul(s.rng, 1664525) + 1013904223) >>> 0; return s.rng / 4294967296; }
  function shuffle(s, cards) { for(let i=cards.length-1;i>0;i--){ const j=Math.floor(random(s)*(i+1)); [cards[i],cards[j]]=[cards[j],cards[i]]; } return cards; }
  const cardRef=(card,type)=>({type,key:card.key,uid:card.uid});
  function log(s,message,detail={}) { s.log.unshift({id:(s.log[0]?.id??s.log.length)+1,round:s.round,actor:s.active,turn:s.turnIndex,day:s.day?.key||null,kind:'system',...detail,message}); }
  function draw(s, type) {
    if(!s.decks[type].length && s.discards[type].length) s.decks[type]=shuffle(s,s.discards[type].splice(0));
    return s.decks[type].pop() || null;
  }
  function refill(s) {
    const added=[];
    while(s.market.length<5){ const card=draw(s,'products'); if(!card) break; s.market.push(card);added.push(cardRef(card,'products')); }
    while(s.customers.length<s.day.limit){ const card=draw(s,'customers'); if(!card) break; s.customers.push(card);added.push(cardRef(card,'customers')); }
    if(added.length)log(s,'共同產品與客人補位。',{actor:null,kind:'table',title:'牌桌補位',cards:added});
  }
  function nextDay(s) {
    if(s.day) s.discards.days.push(s.day);
    s.day=draw(s,'days');
    // Explicit prototype convention for a smaller customer limit at a round boundary.
    while(s.customers.length>s.day.limit) s.decks.customers.unshift(s.customers.pop());
    refill(s);
    if(s.config.monsterMode && !s.monster){s.monster=s.decks.monsters.pop()||null;if(s.monster)log(s,'怪獸型客人補位。',{actor:null,kind:'table',title:'客人補位',cards:[cardRef(s.monster,'monsters')]});}
    log(s,`本輪特殊日：${s.day.name}。`,{actor:null,kind:'day',title:s.day.name,cards:[cardRef(s.day,'days')]});
  }
  function newGame(seed = Date.now(), overrides = {}) {
    const config={...DATA.config,...overrides};
    for(const k of ['productCopies','contactCopies','customerCopies','dayCopies']) assert(Number.isInteger(config[k]) && config[k]>=1 && config[k]<=30,'試玩牌量需為 1–30。');
    assert(config.productCopies*DATA.products.length>=11 && config.contactCopies*DATA.contacts.length>=9,'牌量不足以完成開場。');
    assert(config.targetScore===18,'目前原型依主規格使用 18 分終局。');
    assert(typeof config.monsterMode==='boolean' && ['starter','all'].includes(config.monsterSet),'怪物模式設定錯誤。');
    assert(typeof config.allowFailedPlans==='boolean','失敗接待設定錯誤。');
    const s={version:DATA.version,sourceHash:DATA.sourceHash,rulesHash:DATA.rulesHash,config,rng:Number(seed)>>>0,seed:Number(seed)>>>0,round:1,turnIndex:0,order:[],active:0,phase:'take',day:null,monster:null,
      decks:{products:[],contacts:[],customers:[],days:[],monsters:[]},discards:{products:[],contacts:[],customers:[],days:[],monsters:[]},market:[],customers:[],
      players:[{name:'你',score:0,products:[],contacts:[],won:[],turns:0},{name:'電腦顧問',score:0,products:[],contacts:[],won:[],turns:0}],
      turn:{},restChoices:[],preparation:null,endTriggered:false,winners:[],log:[]};
    let serial=0;
    for(const type of ['products','contacts','customers','days']) {
      const count=config[{products:'productCopies',contacts:'contactCopies',customers:'customerCopies',days:'dayCopies'}[type]];
      for(const card of DATA[type]) for(let n=0;n<count;n++) s.decks[type].push({...copy(card),uid:`${type[0]}${++serial}`});
      shuffle(s,s.decks[type]);
    }
    for(const card of monsterCards(config))s.decks.monsters.push({...copy(card),uid:`m${++serial}`});
    shuffle(s,s.decks.monsters);
    s.order=random(s)<.5 ? [0,1] : [1,0];
    if(config.tutorial){
      s.order=[0,1];
      const stack=(type,keys)=>{const selected=[];for(const key of keys){const i=s.decks[type].findIndex(c=>c.key===key);if(i>=0)selected.push(s.decks[type].splice(i,1)[0]);}s.decks[type].push(...selected.reverse());};
      stack('days',['平常日']);stack('customers',['K02','K01','K03']);
      stack('products',['QCC+4','REE+4','COO+3','RTT+5','ANN+5','PNN+3','COO+3','REE+4']);
      stack('contacts',['來店諮詢','LINE／客服','親友介紹','回購客']);
    }
    nextDay(s);
    for(const p of s.players){ for(let n=0;n<4;n++) p.contacts.push(draw(s,'contacts')); for(let n=0;n<3;n++) p.products.push(draw(s,'products')); }
    log(s,`${s.players[s.order[0]].name}先手。目標 18 分，完成當輪後結算。`,{actor:null,title:'開局'});
    beginTurn(s); return s;
  }
  function beginTurn(s) {
    s.active=s.order[s.turnIndex]; s.phase='take'; s.turn={trades:0,monsters:0,bonus:0,declared:[]}; s.restChoices=[];s.preparation=null;
    const card=draw(s,'contacts'); if(card) s.players[s.active].contacts.push(card);
    log(s,`${s.players[s.active].name}回合開始${card?'，抽 1 張接觸牌':''}。`,{kind:'take',title:'回合開始',cards:card&&s.active===0?[cardRef(card,'contacts')]:[],count:card?1:0});
  }
  function takeProduct(s, uid) {
    assert(s.phase==='take','現在不能拿取開場產品。');
    if(uid){ const i=s.market.findIndex(c=>c.uid===uid); assert(i>=0,'產品已不在產品架。'); const card=s.market.splice(i,1)[0];s.players[s.active].products.push(card); log(s,`${s.players[s.active].name}從公用產品架拿走「${card.name}」。`,{kind:'take',title:'拿產品',cards:[cardRef(card,'products')]}); }
    else log(s,`${s.players[s.active].name}略過拿產品。`,{kind:'take',title:'略過拿牌',cards:[]});
    s.phase='plan';
  }
  function prepareContact(s,uid){
    assert(s.phase==='plan','準備效果只能在成交判定前使用。');
    const contact=s.players[s.active].contacts.find(c=>c.uid===uid);
    assert(contact?.preparation,'這張牌沒有準備效果。');
    assert(!s.turn.declared.includes(uid),'這張接觸牌的準備效果已使用。');
    assert(s.turn.declared.length<2,'每回合最多宣告兩張接觸牌。');
    s.turn.declared.push(uid);
    log(s,`${s.players[s.active].name}宣告「${contact.name}」；本回合須棄牌。`,{kind:'effect',title:contact.preparation==='consult'?'諮詢選牌':'LINE 換牌',cards:[cardRef(contact,'contacts')]});
    if(contact.preparation==='consult'){
      // Look only at the existing top cards: one remaining means one choice, zero means no effect.
      const choices=[];for(let i=0;i<2 && s.decks.products.length;i++)choices.push(s.decks.products.pop());
      if(choices.length){s.preparation={contact:uid,choices};s.phase='prep-choice';}
      else log(s,'產品牌庫沒有牌，諮詢無選牌效果。',{kind:'effect',title:'諮詢無牌可選'});
    }else{
      if(s.players[s.active].products.length && s.market.length){s.preparation={contact:uid,choices:[]};s.phase='prep-swap';}
      else log(s,'沒有可交換的產品，LINE 準備效果略過。',{kind:'effect',title:'沒有可交換產品'});
    }
  }
  function choosePreparationProduct(s,uid){
    assert(s.phase==='prep-choice','現在不需要選諮詢產品。');
    assert(s.preparation.choices.some(c=>c.uid===uid),'請從諮詢候選牌選一張。');
    for(const card of s.preparation.choices)if(card.uid===uid)s.players[s.active].products.push(card);else s.discards.products.push(card);
    log(s,`${s.players[s.active].name}完成諮詢選牌，新產品可參與本回合。`,{kind:'effect',title:'諮詢留牌',cards:s.active===0?[cardRef(s.preparation.choices.find(c=>c.uid===uid),'products')]:[]});
    s.preparation=null;s.phase='plan';
  }
  function swapProduct(s,handUid,shelfUid){
    assert(s.phase==='prep-swap','現在沒有 LINE 換牌效果。');
    const p=s.players[s.active],handIndex=p.products.findIndex(c=>c.uid===handUid),shelfIndex=s.market.findIndex(c=>c.uid===shelfUid);
    assert(handIndex>=0 && shelfIndex>=0,'請選擇一張手中產品與一張架上產品。');
    const previous=p.products[handIndex];p.products[handIndex]=s.market[shelfIndex];s.market[shelfIndex]=previous;
    log(s,`${p.name}交換產品：${previous.name} 換成 ${p.products[handIndex].name}。`,{kind:'effect',title:'交換產品',cards:[cardRef(previous,'products'),cardRef(p.products[handIndex],'products')]});
    s.preparation=null;s.phase='plan';
  }
  function skipSwap(s){assert(s.phase==='prep-swap','現在沒有待處理換牌。');log(s,`${s.players[s.active].name}略過 LINE 換牌；準備牌仍須棄掉。`,{kind:'effect',title:'略過換牌'});s.preparation=null;s.phase='plan';}
  function evaluate(customer, products, contact, day) {
    const reasons=[];
    if(customer.kind==='monster'){
      if(products.length!==2 || new Set(products.map(p=>p.key)).size!==2)reasons.push('怪物需要兩款不同的手牌產品。');
      const needs=Object.entries(customer.requirements).map(([category,target])=>({category,original:target,target,best:products.length?Math.max(...products.map(p=>p.stats[category])):0,ignored:false}));
      for(const n of needs)if(n.best<n.target)reasons.push(`${n.category}還差 ${n.target-n.best}（目前 ${n.best}／需求 ${n.target}）。`);
      if(products.some(p=>Object.entries(customer.requirements).every(([k,v])=>p.stats[k]>=v)))reasons.push('兩款產品須各自無法單獨完成，才能互補處理怪物。');
      return {ok:!reasons.length,reasons,needs,cost:null,trust:null,trustEffects:[],monster:true};
    }
    if(!contact || !products.length) return {ok:false,reasons:['請選擇產品與接觸牌。'],needs:[],cost:0,trust:0};
    if(products.length>2) reasons.push('最多使用兩張產品。');
    if(products.length===2 && (!day.combo || !products.some(p=>p.name==='PNN+3') || products.filter(p=>p.name==='PNN+3').length!==1)) reasons.push('雙產品須在組合日使用 PNN＋另一產品。');
    if(customer.requiresCombo && products.length!==2) reasons.push('此複合客保留雙產品條件。');
    let needs=Object.entries(customer.requirements).map(([category,value])=>({category,original:value,target:value,best:Math.max(...products.map(p=>p.stats[category])),ignored:false}));
    for(const n of needs) if(!n.ignored && n.best<n.target) reasons.push(`${n.category}還差 ${n.target-n.best}（目前 ${n.best}／需求 ${n.target}）。`);
    const cost=Math.max(...products.map(p=>p.cost))+(products.length===2 ? 1+(day.comboModifier||0) : 0);
    let trust=contact.trust;const trustEffects=[];
    const boost=source=>{trust++;trustEffects.push({source,amount:1});};
    if(day.name==='直播日' && contact.name==='直播') boost('直播日');
    if(day.name==='門市日' && ['來店諮詢','駐店大使'].includes(contact.name)) boost('門市日');
    if(customer.preferred===contact.name) boost('客人偏好');
    if(contact.name==='親友介紹' && products.some(p=>p.name==='PNN+3')) boost('親友介紹・PNN');
    if(contact.name==='市集活動' && customer.score<=2) boost('市集活動・1～2分客人');
    if(trust<cost) reasons.push(`信任還差 ${cost-trust}（目前 ${trust}／所需 ${cost}）。`);
    return {ok:!reasons.length,reasons,needs,cost,trust,trustEffects};
  }
  function inspectPlan(s, plan) {
    const p=s.players[s.active];
    const customer=targets(s).find(c=>c.uid===plan.customer);
    const contact=p.contacts.find(c=>c.uid===plan.contact);
    const products=(plan.products||[]).map(uid=>p.products.find(c=>c.uid===uid)||s.market.find(c=>c.uid===uid));
    if(!customer || (!contact && customer.kind!=='monster') || products.some(p=>!p)) return {ok:false,reasons:['請選擇場上的目標、產品與所需接觸牌。'],needs:[],cost:0,trust:0};
    return evaluate(customer,products,contact,s.day,plan.effectCategory);
  }
  function validatePlans(s, plans) {
    assert(s.phase==='plan','現在不能提交成交。');
    assert(Array.isArray(plans) && plans.length<=4,'每回合最多接待四位。');
    const p=s.players[s.active], customers=new Set(),products=new Set(),contactUse=new Map(),shelfUse=new Map(),committed=new Set(s.turn.declared);
    let monsterCount=0;
    assert(committed.size<=2 && [...committed].every(uid=>p.contacts.some(c=>c.uid===uid)),'宣告的接觸牌資料錯誤。');
    for(const plan of plans){
      assert(!customers.has(plan.customer),'同一客人只能被接待一次。'); customers.add(plan.customer);
      const target=targets(s).find(c=>c.uid===plan.customer);assert(target,'目標已不在場上。');
      if(target.kind==='monster'){
        monsterCount++;assert(monsterCount<=1,'每回合最多處理一張怪物。');
        assert(!plan.contact,'怪物免接觸牌，不能套用接觸效果。');
        assert(Array.isArray(plan.products) && plan.products.length===2,'怪物需要兩張手牌產品。');
        const cards=plan.products.map(uid=>p.products.find(c=>c.uid===uid));
        assert(cards.every(Boolean),'怪物只能使用手牌產品，不能借用產品架。');
        assert(new Set(cards.map(c=>c.key)).size===2,'怪物需要兩款不同的產品。');
        for(const uid of plan.products){assert(!products.has(uid),'同一張產品不能分配給兩個目標。');products.add(uid);}
        continue;
      }
      const contact=p.contacts.find(c=>c.uid===plan.contact); assert(contact,'接觸牌已不在手中。');
      contactUse.set(contact.uid,(contactUse.get(contact.uid)||0)+1);
      committed.add(contact.uid);assert(committed.size<=2,'每回合最多使用兩張接觸牌（包含已宣告準備牌）。');
      assert(contactUse.get(contact.uid)<=contact.capacity,'超過接觸牌的接待上限。');
      assert(Array.isArray(plan.products) && plan.products.length>=1 && plan.products.length<=2,'每位客人請選擇一或兩張產品。');
      if(plan.products.length===2){
        const cards=plan.products.map(uid=>p.products.find(c=>c.uid===uid));
        assert(s.day.combo,'今天不開放雙產品組合。');
        assert(cards.every(Boolean) && cards.filter(c=>c.name==='PNN+3').length===1,'雙產品須使用手中的 PNN＋另一產品。');
      }
      let shelfCount=0;
      for(const uid of plan.products){
        assert(!products.has(uid),'同一張產品不能分配給兩位客人。'); products.add(uid);
        if(!p.products.some(c=>c.uid===uid)){
          assert(s.market.some(c=>c.uid===uid),'產品已不在場上。'); shelfCount++;
        }
      }
      if(shelfCount){
        assert(contact.name==='官網內容','只有官網內容可直接使用產品架。');
        assert(plan.products.length===1 && shelfCount===1,'官網借用限單張架上產品。');
        shelfUse.set(contact.uid,(shelfUse.get(contact.uid)||0)+1);
        assert(shelfUse.get(contact.uid)<=1,'每張官網內容最多為一位客人借用產品架。');
      }
    }
    assert(committed.size+monsterCount<=2,'怪物占一次處理機會；處理怪物時最多另用一張接觸牌（包含已宣告準備牌）。');
    return true;
  }
  function resolve(s, plans) {
    validatePlans(s,plans);
    const p=s.players[s.active], results=plans.map(plan=>({...plan,...inspectPlan(s,plan)}));
    assert(s.config.allowFailedPlans || results.every(r=>r.ok),'計畫尚未達標，請先調整搭配。');
    const used=new Set(s.turn.declared),successful=new Set();
    for(const r of results){
      const customer=targets(s).find(c=>c.uid===r.customer),monster=customer.kind==='monster';if(!monster)used.add(r.contact);
      if(r.ok){
        const productNames=r.products.map(uid=>(p.products.find(c=>c.uid===uid)||s.market.find(c=>c.uid===uid)).name).join('＋');
        const detail=monster?'雙產品互補':`${p.contacts.find(c=>c.uid===r.contact).name}，信任 ${r.trust}／${r.cost}${r.trustEffects.length?`（${r.trustEffects.map(e=>`${e.source}＋${e.amount}`).join('、')}）`:''}`;
        if(!monster)successful.add(r.contact);p.score+=customer.score;p.won.push(customer);
        if(monster)s.monster=null;else s.customers=s.customers.filter(c=>c.uid!==customer.uid);
        for(const uid of r.products){
          let list=p.products; if(!list.some(c=>c.uid===uid)) list=s.market;
          const index=list.findIndex(c=>c.uid===uid); s.discards.products.push(list.splice(index,1)[0]);
        }
        if(monster)s.turn.monsters++;else s.turn.trades++;
        log(s,`${p.name}${monster?'解決':'接待'}「${customer.name}」：${productNames}；${detail}，需求全部達標，取得 ${customer.score} 分。`,{kind:'trade',title:'成交',score:customer.score,cards:[cardRef(customer,monster?'monsters':'customers'),...r.products.map(uid=>cardRef(s.discards.products.find(c=>c.uid===uid),'products')),...(monster?[]:[cardRef(p.contacts.find(c=>c.uid===r.contact),'contacts')])]});
      } else log(s,`${p.name}未成交「${customer.name}」：${r.reasons.join('；')}`,{kind:'trade',title:'未成交',score:0,cards:[cardRef(customer,monster?'monsters':'customers'),...r.products.map(uid=>cardRef(p.products.find(c=>c.uid===uid)||s.market.find(c=>c.uid===uid),'products')),...(monster?[]:[cardRef(p.contacts.find(c=>c.uid===r.contact),'contacts')])]});
    }
    for(const uid of used){
      const contact=p.contacts.find(c=>c.uid===uid);
      if(successful.has(uid)){
        if(contact.name==='直播' || (contact.name==='回購客' && s.day.name==='會員回饋日')){
          const card=draw(s,'contacts'),source=contact.name==='直播'?'直播':'會員回饋日・回購客';if(card)p.contacts.push(card);
          log(s,`${p.name}的${source}效果：${card?`抽 1 張接觸牌${s.active===0?`「${card.name}」`:''}`:'無可抽的接觸牌'}。`,{kind:'effect',title:`${source}補牌`,cards:card&&s.active===0?[cardRef(card,'contacts')]:[],count:card?1:0});
        }
        if(contact.name==='回購客'){s.turn.bonus++;log(s,`${p.name}的回購客效果：${s.market.length?'可從剩餘產品架再拿 1 張產品':'產品架已空，沒有可拿的產品'}。`,{kind:'effect',title:'回購獎勵',cards:[]});}
      }
      const index=p.contacts.findIndex(c=>c.uid===uid); s.discards.contacts.push(p.contacts.splice(index,1)[0]);
    }
    if(p.score>=s.config.targetScore) s.endTriggered=true;
    s.phase=s.turn.bonus>0 && s.market.length ? 'bonus' : s.turn.trades+s.turn.monsters===0 ? 'rest' : 'trim';
    return results;
  }
  function bonusProduct(s, uid) {
    assert(s.phase==='bonus','現在沒有回購客補牌。');
    if(uid){ const index=s.market.findIndex(c=>c.uid===uid); assert(index>=0,'產品已不在架上。');const card=s.market.splice(index,1)[0];s.players[s.active].products.push(card); s.turn.bonus--;log(s,`${s.players[s.active].name}回購補牌：「${card.name}」。`,{kind:'take',title:'回購補牌',cards:[cardRef(card,'products')]}); }
    else {s.turn.bonus=0;log(s,`${s.players[s.active].name}略過剩餘回購補牌。`,{kind:'take',title:'略過回購補牌',cards:[]});}
    if(s.turn.bonus===0 || !s.market.length) s.phase='trim';
  }
  function rest(s, mode, uid) {
    assert(s.phase==='rest','只有零成交回合可休整。');
    const p=s.players[s.active];
    if(mode==='product'){
      const index=s.market.findIndex(c=>c.uid===uid); assert(index>=0,'請選擇架上的產品。');const card=s.market.splice(index,1)[0];p.products.push(card); s.phase='trim';log(s,`${p.name}休整拿產品「${card.name}」。`,{kind:'take',title:'休整拿產品',cards:[cardRef(card,'products')]});
    } else if(mode==='contact'){
      s.restChoices=[draw(s,'contacts'),draw(s,'contacts')].filter(Boolean);
      s.phase=s.restChoices.length ? 'rest-choice' : 'trim';
      log(s,s.restChoices.length?`${p.name}休整抽 ${s.restChoices.length} 張接觸牌，選 1 張留下。`:`${p.name}休整時接觸牌庫已空，沒有補牌。`,{kind:'take',title:'休整選牌',cards:[],count:s.restChoices.length});
    } else { assert(mode==='skip','未知休整選項。'); s.phase='trim';log(s,`${p.name}略過休整補給。`,{kind:'take',title:'略過休整',cards:[]}); }
  }
  function chooseRest(s, uid){
    assert(s.phase==='rest-choice','現在不需要選補給牌。'); assert(s.restChoices.some(c=>c.uid===uid),'請選擇一張補給牌。');
    for(const card of s.restChoices) if(card.uid===uid) s.players[s.active].contacts.push(card); else s.discards.contacts.push(card);
    log(s,`${s.players[s.active].name}完成休整，留下 1 張接觸牌。`,{kind:'take',title:'休整留牌',cards:s.active===0?[cardRef(s.restChoices.find(c=>c.uid===uid),'contacts')]:[]});
    s.restChoices=[]; s.phase='trim';
  }
  function discard(s,type,uid){
    assert(s.phase==='trim','只能在整理手牌時棄牌。'); assert(['products','contacts'].includes(type),'錯誤牌種。');
    const list=s.players[s.active][type]; assert(list.length>(type==='products'?5:7),'此類手牌沒有超過上限。');
    const index=list.findIndex(c=>c.uid===uid); assert(index>=0,'牌已不在手中。');const card=list.splice(index,1)[0];s.discards[type].push(card);log(s,`${s.players[s.active].name}整理手牌，棄掉 1 張${type==='products'?'產品':'接觸牌'}。`,{kind:'discard',title:'整理棄牌',cards:[cardRef(card,type)]});
  }
  function finishTurn(s){
    assert(s.phase==='trim','請先完成成交、休整或補牌。');
    const p=s.players[s.active]; assert(p.products.length<=5 && p.contacts.length<=7,'請先棄牌至手牌上限。');
    log(s,`${p.name}回合結束，本回合取得 ${s.turn.trades+s.turn.monsters} 位客人。`,{kind:'turn',title:'回合結束'});p.turns++; refill(s); s.turnIndex++;
    if(s.turnIndex===2){
      if(s.endTriggered || (!s.customers.length && !s.decks.customers.length && !s.monster && !s.decks.monsters.length)){
        s.phase='finished';
        const rank=p=>[p.score,p.won.filter(c=>c.kind!=='monster').length,p.won.filter(c=>c.kind!=='monster' && c.score===5).length];
        const a=rank(s.players[0]),b=rank(s.players[1]); let delta=0;
        for(let i=0;i<3;i++){ delta=a[i]-b[i]; if(delta) break; }
        s.winners=delta===0 ? [0,1] : [delta>0?0:1]; log(s,'本輪完成，依總分、客人數、五分客人數結算。',{actor:null,kind:'turn',title:'對局結束'}); return;
      }
      s.turnIndex=0; s.round++; nextDay(s);
    }
    beginTurn(s);
  }
  function optionsFor(s,customer){
    const p=s.players[s.active],options=[];
    if(customer.kind==='monster'){
      for(let i=0;i<p.products.length;i++)for(let j=i+1;j<p.products.length;j++){
        const products=[p.products[i],p.products[j]];
        if(evaluate(customer,products,null,s.day).ok)options.push({customer:customer.uid,products:products.map(c=>c.uid),contact:'',weight:394});
      }
      return options;
    }
    const bundles=p.products.map(c=>[c]);
    if(s.day.combo) for(const a of p.products.filter(c=>c.name==='PNN+3')) for(const b of p.products.filter(c=>c.name!=='PNN+3')) bundles.push([a,b]);
    for(const contact of p.contacts){
      const choices=contact.name==='官網內容' ? bundles.concat(s.market.map(c=>[c])) : bundles;
      for(const products of choices){
        const r=evaluate(customer,products,contact,s.day);
        if(r.ok) options.push({customer:customer.uid,products:products.map(c=>c.uid),contact:contact.uid,
          weight:customer.score*100-products.length*3-contact.trust});
      }
    }
    return options.sort((a,b)=>b.weight-a.weight);
  }
  function bestPlan(s,existing=[]){
    assert(s.phase==='plan','規劃器只在規劃階段使用。');
    validatePlans(s,existing);
    // Exact search across at most five visible customers; resource constraints prune branches.
    const groups=targets(s).filter(c=>!existing.some(p=>p.customer===c.uid)).map(c=>optionsFor(s,c)); let best=existing.slice(),value=0;
    const upper=groups.map((_,i)=>groups.slice(i).reduce((sum,g)=>sum+(g[0]?.weight||0),0));
    function visit(i,plans,total){
      if(total>value){ value=total; best=plans.slice(); }
      if(i>=groups.length || total+upper[i]<=value) return;
      for(const plan of groups[i]){
        const next=plans.concat(plan); try{validatePlans(s,next);}catch{continue;}
        visit(i+1,next,total+plan.weight);
      }
      visit(i+1,plans,total);
    }
    visit(0,existing.slice(),0); return {plans:best,value};
  }
  function productRank(s,card){
    let value=s.customers.reduce((sum,c)=>sum+(Object.entries(c.requirements).every(([k,v])=>card.stats[k]>=v)?c.score*10:0),0)+Object.values(card.stats).reduce((a,b)=>a+b,0)/20-card.cost;
    if(s.monster){
      value+=Object.entries(s.monster.requirements).reduce((sum,[k,v])=>sum+Math.min(1,card.stats[k]/v)*2,0);
      if(s.players[s.active].products.some(p=>p.uid!==card.uid && evaluate(s.monster,[card,p],null,s.day).ok))value+=40;
    }
    return value;
  }
  function contactRank(card){return card.trust*3+card.capacity+(card.name==='LINE／客服'?2:0);}
  function prepareAI(s){
    const p=s.players[s.active];
    // Swaps use public shelf information; consultation choices are inspected only after commitment.
    for(let step=0;step<2 && s.turn.declared.length<2;step++){
      const base=bestPlan(s);let best=null,bestValue=base.value;
      for(const contact of p.contacts.filter(c=>c.preparation==='swap' && !s.turn.declared.includes(c.uid))){
        for(const hand of p.products)for(const shelf of s.market){
          const trial=copy(s);prepareContact(trial,contact.uid);swapProduct(trial,hand.uid,shelf.uid);
          const value=bestPlan(trial).value;
          if(value>bestValue){bestValue=value;best={contact:contact.uid,hand:hand.uid,shelf:shelf.uid};}
        }
      }
      if(best){prepareContact(s,best.contact);swapProduct(s,best.hand,best.shelf);continue;}
      const shop=p.contacts.find(c=>c.preparation==='consult' && !s.turn.declared.includes(c.uid) &&
        (base.plans.some(plan=>plan.contact===c.uid) || (base.value===0 && p.products.length<5)));
      if(!shop)break;
      prepareContact(s,shop.uid);
      if(s.phase==='prep-choice'){
        let chosen=null,value=-Infinity;
        for(const card of s.preparation.choices){const trial=copy(s);choosePreparationProduct(trial,card.uid);const score=bestPlan(trial).value+productRank(trial,card)/100;if(score>value){value=score;chosen=card.uid;}}
        choosePreparationProduct(s,chosen);
      }
    }
  }
  function playAI(s,onStep){
    assert(s.active===1 && s.phase==='take','電腦必須從自己的回合開始行動。');
    const report={round:s.round,events:[]};
    const emit=(stage,title,detail,cards=[],extra={})=>{
      const event={stage,title,detail,cards:copy(cards),...copy(extra)};report.events.push(event);
      if(onStep)onStep(copy(s),copy(event));
    };
    let selected=null,bestValue=-Infinity;
    for(const uid of [null,...s.market.map(c=>c.uid)]){
      const trial=copy(s); takeProduct(trial,uid); const choice=bestPlan(trial);
      const card=s.market.find(c=>c.uid===uid);
      const value=choice.value+(card?productRank(s,card)/100:0);
      if(value>bestValue){ bestValue=value; selected=uid; }
    }
    const picked=s.market.find(c=>c.uid===selected);
    takeProduct(s,selected);
    emit('take',picked?`電腦拿走 ${picked.name}`:'電腦略過拿取',picked?'這張公用產品已進入對手手牌。':'直接使用原有手牌安排接待。',picked?[picked]:[]);
    const beforePreparation=s.log[0];prepareAI(s);
    if(s.log[0]!==beforePreparation){
      const entries=[];for(const entry of s.log){if(entry===beforePreparation)break;entries.unshift(entry.message);}
      emit('prepare','電腦使用準備效果',entries.join(' '));
    }
    const choice=bestPlan(s);
    const publicPlans=choice.plans.map(plan=>({customer:copy(targets(s).find(c=>c.uid===plan.customer)),products:plan.products.map(uid=>copy(s.players[1].products.find(c=>c.uid===uid)||s.market.find(c=>c.uid===uid))),contact:copy(s.players[1].contacts.find(c=>c.uid===plan.contact)||null)}));
    const results=resolve(s,choice.plans);
    const successful=publicPlans.filter((_,i)=>results[i].ok);
    emit('resolve',successful.length?`電腦成交 ${successful.length} 位客人`:'電腦這回合沒有成交',successful.length?successful.map(p=>`${p.customer.name}：${p.products.map(c=>c.name).join('＋')}${p.contact?`／${p.contact.name}`:''}，＋${p.customer.score} 分`).join('；'):'進入休整，為下一回合補充資源。',successful.flatMap(p=>[p.customer,...p.products,...(p.contact?[p.contact]:[])]),{trades:publicPlans.map((plan,i)=>({...plan,ok:results[i].ok,needs:results[i].needs,trust:results[i].trust,cost:results[i].cost,trustEffects:results[i].trustEffects}))});
    const supplies=[];
    while(s.phase==='bonus'){
      const card=s.market.slice().sort((a,b)=>productRank(s,b)-productRank(s,a))[0];
      bonusProduct(s,card?.uid||null);if(card)supplies.push({card,reason:'回購補牌'});
    }
    if(s.phase==='rest'){
      if(s.market.length && (s.players[1].products.length<4 || !s.players[1].products.length)){
        const card=s.market.slice().sort((a,b)=>productRank(s,b)-productRank(s,a))[0];rest(s,'product',card.uid);supplies.push({card,reason:'休整補給'});
      }
      else rest(s,'contact');
    }
    if(s.phase==='rest-choice') chooseRest(s,s.restChoices.slice().sort((a,b)=>contactRank(b)-contactRank(a))[0].uid);
    while(s.players[1].products.length>5) discard(s,'products',s.players[1].products.slice().sort((a,b)=>productRank(s,a)-productRank(s,b))[0].uid);
    while(s.players[1].contacts.length>7) discard(s,'contacts',s.players[1].contacts.slice().sort((a,b)=>contactRank(a)-contactRank(b))[0].uid);
    if(supplies.length)emit('supply','電腦從公用架補充產品',supplies.map(({card,reason})=>`${reason}：${card.name}`).join('；'),supplies.map(({card})=>card));
    finishTurn(s);s.lastTurnReport=report;return choice.plans;
  }
  function validateSave(s){
    assert(s && s.version===DATA.version && s.sourceHash===DATA.sourceHash && s.rulesHash===DATA.rulesHash,'存檔與目前規則版本不同，請重新開局。');
    assert(['take','plan','prep-choice','prep-swap','rest','rest-choice','bonus','trim','finished'].includes(s.phase),'存檔階段錯誤。');
    assert(s.players?.length===2 && Array.isArray(s.order) && new Set(s.order).size===2 && s.order.every(i=>i===0||i===1),'存檔玩家錯誤。');
    assert(s.active===0 || s.active===1,'存檔玩家錯誤。');
    const catalogue=new Map();let serial=0;
    for(const type of ['products','contacts','customers','days']){
      const count=s.config?.[{products:'productCopies',contacts:'contactCopies',customers:'customerCopies',days:'dayCopies'}[type]];
      assert(Number.isInteger(count) && count>=1 && count<=30,'存檔牌量錯誤。');
      for(const card of DATA[type])for(let n=0;n<count;n++)catalogue.set(`${type[0]}${++serial}`,card);
    }
    assert(typeof s.config.monsterMode==='boolean' && ['starter','all'].includes(s.config.monsterSet) && typeof s.config.allowFailedPlans==='boolean','存檔怪物模式設定錯誤。');
    for(const card of monsterCards(s.config))catalogue.set(`m${++serial}`,card);
    assert(s.config.targetScore===18,'存檔終局規則錯誤。');
    assert(Array.isArray(s.turn.declared) && new Set(s.turn.declared).size===s.turn.declared.length && s.turn.declared.length<=2,'存檔宣告接觸牌錯誤。');
    if(['plan','prep-choice','prep-swap'].includes(s.phase))assert(s.turn.declared.every(uid=>s.players[s.active].contacts.some(c=>c.uid===uid)),'存檔宣告牌已不在手中。');
    if(['prep-choice','prep-swap'].includes(s.phase))assert(s.preparation && s.turn.declared.includes(s.preparation.contact) && Array.isArray(s.preparation.choices),'存檔準備階段錯誤。');
    if(s.phase==='prep-choice')assert(s.preparation.choices.length>=1 && s.preparation.choices.length<=2,'存檔諮詢候選牌錯誤。');
    assert(s.monster===null || s.monster?.kind==='monster','存檔怪物位錯誤。');
    const cards=[...s.market,...s.customers,...(s.monster?[s.monster]:[]),...s.restChoices,...(s.preparation?.choices||[]),s.day,...Object.values(s.decks).flat(),...Object.values(s.discards).flat(),...s.players.flatMap(p=>[...p.products,...p.contacts,...p.won])];
    assert(cards.length===catalogue.size && cards.every(c=>c && typeof c.uid==='string') && new Set(cards.map(c=>c.uid)).size===cards.length,'存檔卡牌重複或遺失。');
    for(const card of cards){
      const original=catalogue.get(card.uid);assert(original,'存檔有未知卡牌。');
      for(const key of Object.keys(original))assert(JSON.stringify(card[key])===JSON.stringify(original[key]),'存檔卡牌數值與資料來源不同。');
    }
    for(const p of s.players) assert(p.score===p.won.reduce((sum,c)=>sum+c.score,0),'存檔分數錯誤。');
    return true;
  }
  const API={DATA,targets,optionsFor,newGame,takeProduct,prepareContact,choosePreparationProduct,swapProduct,skipSwap,evaluate,inspectPlan,validatePlans,resolve,bonusProduct,rest,chooseRest,discard,finishTurn,bestPlan,prepareAI,playAI,validateSave,copy};
  if(typeof module==='object' && module.exports) module.exports=API; else root.Game=API;
})(typeof globalThis!=='undefined'?globalThis:this);
