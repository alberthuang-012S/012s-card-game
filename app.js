/* Offline UI. Artwork and full card faces are selected by the verified export. */
(() => {
  'use strict';
  const G=window.Game,D=G.DATA,STORE='012s-offline-game-v3',PREFS='012s-offline-preferences';
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const emptyDraft=()=>({customer:'',products:[],contact:''});
  const labels={products:'產品牌',contacts:'接觸牌',days:'特殊日',customers:'客人牌'};
  const catalogue=type=>type==='customers'?D.customers.concat(D.monsters):D[type];
  let s,plans=[],draft=emptyDraft(),hints=true,saveOK=true,aiTimer=null,toastTimer=null,loadMessage='',pendingNew='normal';
  let swap={hand:'',shelf:''},lastPhase='',libraryType='products',libraryQuery='',lastResults=[],aiPlayback=null;
  let uiBusy=false,generation=0,handFilter='all',playingHeld=false;
  let screen=new URLSearchParams(location.search).get('play')==='1'?'game':'home',hasSavedGame=false;
  const historyFilter={actor:'all',kind:'all',round:'all',order:'new'};let resumeAfterReading=false;
  const reading=()=>$('history-dialog').open||$('card-dialog').open;
  function beginReading(){clearTimeout(aiTimer);aiTimer=null;if(M.active&&!M.paused){resumeAfterReading=true;M.togglePause();}}
  function endReading(){
    if(reading())return;
    if(resumeAfterReading&&M.active&&M.paused)M.togglePause();resumeAfterReading=false;
    if(screen==='game'&&!uiBusy&&!aiTimer&&s.phase!=='finished'){
      if(aiPlayback)aiTimer=setTimeout(advanceAI,preferences.fast?40:170);else if(s.active===1)aiTimer=setTimeout(runAI,450);
    }
  }
  function openHistory(){window.CardPreview?.reset();beginReading();window.MatchJournal.render(s,historyFilter);if(!$('history-dialog').open)$('history-dialog').showModal();}
  const preferences={hints:true,sound:true,fast:false,cardView:'face'},M=window.TableMotion;
  const railPositions=new Map();
  try{Object.assign(preferences,JSON.parse(localStorage.getItem(PREFS)||'{}'));hints=preferences.hints!==false;}catch{}
  if(!['face','compact'].includes(preferences.cardView))preferences.cardView='face';
  M.configure(preferences);
  try{
    const raw=localStorage.getItem(STORE);
    if(raw){
      const saved=JSON.parse(raw);G.validateSave(saved.state);
      if(!Array.isArray(saved.plans)||!saved.draft||!Array.isArray(saved.draft.products))throw Error('操作資料錯誤');
      s=saved.state;plans=saved.plans;draft=saved.draft;
      if(s.phase==='plan')G.validatePlans(s,plans);
      hasSavedGame=true;
    }else if(localStorage.getItem('012s-offline-game-v2')||localStorage.getItem('012s-offline-game-v1'))loadMessage='已開啟新版對局；舊版存檔保留在原儲存項目。';
  }catch{loadMessage='上次的新版對局無法讀取，已開始新局。';s=null;plans=[];draft=emptyDraft();}
  if(!s)s=G.newGame();
  const target=()=>G.targets(s).find(c=>c.uid===draft.customer);
  const hand=()=>s.players[0];
  const product=uid=>hand().products.find(c=>c.uid===uid)||s.market.find(c=>c.uid===uid);
  const selected=()=>draft.products.filter(Boolean);
  const asPlan=()=>({customer:draft.customer,products:selected(),contact:target()?.kind==='monster'?'':draft.contact});
  const usedContactIds=()=>new Set([...s.turn.declared,...plans.map(p=>p.contact).filter(Boolean)]);
  const usedSlots=()=>usedContactIds().size+plans.filter(p=>s.monster?.uid===p.customer).length;
  const isMyTurn=()=>!aiPlayback&&s.active===0&&s.phase!=='finished';
  function save(){try{localStorage.setItem(STORE,JSON.stringify({state:aiPlayback?.origin||s,plans,draft}));saveOK=true;}catch{saveOK=false;}}
  function toast(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),5000);}
  function fresh(config=s.config,seed=Date.now()){
    Object.assign(historyFilter,{actor:'all',kind:'all',round:'all',order:'new'});resumeAfterReading=false;
    generation++;M.cancel();uiBusy=false;screen='game';hasSavedGame=true;handFilter='all';clearTimeout(aiTimer);aiTimer=null;aiPlayback=null;s=G.newGame(seed,config);plans=[];draft=emptyDraft();lastResults=[];lastPhase='';railPositions.clear();render();$('game').scrollTo({top:0,behavior:'instant'});window.scrollTo({top:0,behavior:'instant'});
    toast(config.tutorial?'教學局開始：先從產品架拿一張產品。':'新的一局開始了。');
  }
  function markBusy(value){
    uiBusy=value;$('game').dataset.busy=String(value);$('game').setAttribute('aria-busy',String(value));
    syncTools();
    if(value)for(const button of document.querySelectorAll('#game [data-product],#game [data-customer],#game [data-contact],#game [data-prepare],#game [data-action],#game [data-edit],#game [data-remove],#game [data-return-product],#game [data-return-contact]'))if(button.dataset.action!=='skip-ai')button.disabled=true;
  }
  function syncTools(){
    const canHint=screen==='game'&&hints&&isMyTurn()&&s.phase==='plan';
    $('hint-button').hidden=!canHint;
    $('hint-button').disabled=uiBusy||!canHint;
  }
  function tradeDetails(state,arrangements){
    return arrangements.map(plan=>({customer:G.copy(G.targets(state).find(c=>c.uid===plan.customer)),products:plan.products.map(uid=>G.copy(state.players[state.active].products.find(c=>c.uid===uid)||state.market.find(c=>c.uid===uid))),contact:G.copy(state.players[state.active].contacts.find(c=>c.uid===plan.contact)||null),...G.inspectPlan(state,plan)}));
  }
  async function action(fn,{settlement=false,revealMatch=false}={}){
    if(uiBusy)return;
    const before=G.copy(s),beforeDOM=M.capture(),tradeList=settlement?tradeDetails(s,plans):[],currentGeneration=generation;
    try{
      fn();render();markBusy(true);
      await M.transition({before,after:s,beforeDOM,tradeList,actor:before.active});
    }catch(error){toast(error.message);}
    finally{if(currentGeneration===generation){
      markBusy(false);render();
      if(revealMatch&&matchMedia('(max-width:950px)').matches){
        document.querySelector('.local-plan-actions [data-action="add-plan"]:not(:disabled)')?.scrollIntoView({block:'nearest',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});
      }
    }}
  }
  function jumpTo(selector){
    if(selector==='.hand-panel'||selector==='.contacts-panel'){
      handFilter=selector==='.contacts-panel'?'contacts':'products';render();selector='.hand-tray';
    }
    const node=document.querySelector(selector);if(node){const details=node.tagName==='DETAILS'?node:node.querySelector(':scope>details');if(details)details.open=true;node.scrollIntoView({block:'nearest',behavior:'instant'});}
  }
  function requestNew(mode){pendingNew=mode;$('new-title').textContent=mode==='tutorial'?'開始引導教學？':'開始新的一局？';$('new-description').textContent=mode==='tutorial'?'教學使用固定牌序，帶你完成諮詢與第一次接待；目前新版對局會被取代。':'目前新版對局會由新存檔取代。';$('new-dialog').showModal();}
  function goHome(){
    generation++;M.cancel();markBusy(false);clearTimeout(aiTimer);aiTimer=null;
    if(aiPlayback){s=aiPlayback.origin;aiPlayback=null;}
    if(screen==='game'){hasSavedGame=true;save();}
    screen='home';render();$('game').scrollTo({top:0,behavior:'instant'});window.scrollTo({top:0,behavior:'instant'});
  }
  function renderHome(){
    $('game').hidden=true;$('home-screen').hidden=false;document.body.dataset.screen='home';$('home-button').hidden=true;
    const resume=hasSavedGame&&s.phase!=='finished',hero=[D.products.find(c=>c.key==='PNN+3'),D.customers.find(c=>c.key==='K02'),D.contacts[0],D.monsters[0]].filter(Boolean);
    $('home-screen').innerHTML=`<section class="home-hero" aria-labelledby="home-title"><div class="home-copy"><span class="home-kicker">012S 配對所 · 單機卡牌對戰</span><h1 id="home-title">好牌在手，<br>好配對上桌。</h1><p class="home-description">讀懂客人的需求，搭配手中的好牌，<br>搶先完成下一次成交。</p><div class="home-actions">${resume?'<button class="primary-button" data-home="continue">繼續對局 <span>↗</span></button>':''}<button class="${resume?'outline-button':'primary-button'}" data-home="new">${resume?'新的一局':hasSavedGame?'再來一局':'開始遊戲'}${resume?'':' <span>↗</span>'}</button></div>${resume?`<p class="home-resume">第 ${s.round} 輪 · 你 ${hand().score}：${s.players[1].score} 電腦${saveOK?' · 已保存':''}</p>`:'<p class="home-resume">與電腦共桌競爭 · 先達 18 分，完成當輪決勝</p>'}<div class="home-links"><button data-home="tutorial">第一次玩</button><button data-home="help">玩法</button><button data-home="library">卡牌圖鑑</button></div></div><div class="home-art" aria-label="產品、客人、接觸牌與怪獸型客人"><div class="home-table-ring"></div>${hero.map((c,i)=>`<img class="home-card home-card-${i}" src="${esc(c.image)}" alt="${esc(c.name)}卡面" draggable="false">`).join('')}<span class="home-table-note">同一張牌桌，下一位客人由你拿下。</span></div></section><div class="home-bottom"><span>離線遊玩 · 每步自動保存</span><span>產品 × 接觸 × 客人</span></div>`;
  }
  function chooseTarget(uid){
    draft.customer=uid;
    if(target()?.kind==='monster'){draft.contact='';draft.products=selected().filter(id=>hand().products.some(p=>p.uid===id));}
    else if(!s.day.combo)draft.products=selected().slice(0,1);
  }
  function draftResult(){
    if(!target())return null;
    if(!selected().length||(target().kind!=='monster'&&!draft.contact))return null;
    const result={...G.inspectPlan(s,asPlan()),legal:true};
    try{G.validatePlans(s,plans.concat(asPlan()));}catch(error){result.ok=false;result.legal=false;result.reasons.push(error.message);}
    return result;
  }
  function availableOptions(c){
    if(!isMyTurn()||s.phase!=='plan'||plans.some(p=>p.customer===c.uid))return [];
    return G.optionsFor(s,c).filter(p=>{try{G.validatePlans(s,plans.concat(p));return true;}catch{return false;}});
  }
  const inspect=(c,type)=>`<button class="inspect-button" data-card="${esc(type+':'+c.key)}" aria-label="放大查看 ${esc(c.name)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M14 4h6v6M20 4l-7 7M10 20H4v-6M4 20l7-7"/></svg></button>`;
  const image=(c,cls='')=>`<img class="${cls}" src="${esc(c.art)}" alt="${esc(c.name)}的插畫" loading="lazy" draggable="false">`;
  const fullImage=(c,cls='')=>`<img class="${cls}" src="${esc(c.image)}" alt="${esc(c.name)}完整卡面縮圖" loading="lazy" decoding="async" draggable="false">`;
  const thumbnail=c=>`<span class="card-thumbnail">${fullImage(c)}</span>`;
  const cardPicture=c=>preferences.cardView==='face'?fullImage(c):image(c);
  const nav=(id,label)=>`<span class="rail-nav"><button data-scroll="${id}" data-direction="-1" aria-label="${label}向左查看">‹</button><button data-scroll="${id}" data-direction="1" aria-label="${label}向右查看">›</button></span>`;
  function targetCard(c){
    const monster=c.kind==='monster',reserved=plans.some(p=>p.customer===c.uid),chosen=draft.customer===c.uid,possible=hints&&availableOptions(c).length>0;
    const focused=chosen||!target()&&(plans.at(-1)?.customer||G.targets(s)[0]?.uid)===c.uid;
    const focusUid=target()?.uid||plans.at(-1)?.customer||G.targets(s)[0]?.uid,miniRow=G.targets(s).filter(card=>card.uid!==focusUid&&!plans.some(p=>p.customer===card.uid)).findIndex(card=>card.uid===c.uid)+1;
    return `<div class="customer-seat ${focused?'focused':''} ${chosen?'is-draft':''} ${reserved?'has-plan':''}" data-seat="${c.uid}" style="--seat-row:${Math.ceil(Math.max(1,miniRow)/2)};--seat-column:${2+(Math.max(1,miniRow)-1)%2}"><article data-preview="${esc((monster?'monsters':'customers')+':'+c.key)}" data-entity="${c.uid}" data-zone="customers" class="game-card target-card ${monster?'monster-card':''} ${focused?'focused':''} ${chosen?'selected':''} ${reserved?'reserved':''} ${possible?'available':''}"><button class="select-card" data-customer="${c.uid}" aria-label="選擇客人 ${esc(c.name)}" aria-pressed="${chosen}" ${!isMyTurn()||s.phase!=='plan'||reserved?'disabled':''}>
      <span class="card-meta"><span>${esc(c.key)} · ${monster?'怪獸型客人':'一般客人'}</span><b class="score-badge">${c.score}<small> 分</small></b></span>${thumbnail(c)}<span class="target-art">${image(c)}</span><strong class="card-title">${esc(c.name)}</strong>
      <span class="need-chips">${Object.entries(c.requirements).map(([k,v])=>`<span>${esc(k)} <b>${v}</b></span>`).join('')}</span><span class="card-foot">${monster?'雙產品互補 · 任意日 · 免接觸':`偏好 · ${esc(c.preferred)}`}</span>
      <span class="card-status ${possible?'positive':''}">${reserved?'✓ 已加入計畫':chosen?'● 正在搭配':possible?'✓ 手上已有合法搭配':c.requiresCombo?'需 PNN 組合日搭配':monster?'占 1 次處理機會':'點選，開始配牌'}</span></button>${inspect(c,monster?'monsters':'customers')}</article>${customerArrangement(c)}</div>`;
  }
  function productCard(c,location){
    const reservation=plans.find(p=>p.products.includes(c.uid)),chosen=s.phase==='prep-swap'?Object.values(swap).includes(c.uid):selected().includes(c.uid),trim=s.phase==='trim'&&hand().products.length>5;
    const onTable=!!reservation||s.phase==='plan'&&selected().includes(c.uid);
    const usable=isMyTurn()&&(location==='prep'?s.phase==='prep-choice':location==='shelf'?['take','plan','rest','bonus','prep-swap'].includes(s.phase):['plan','prep-swap'].includes(s.phase)||trim);
    const t=target(),categories=t?Object.keys(t.requirements):D.categories.filter(k=>c.stats[k]===Math.max(...Object.values(c.stats))).slice(0,3),complete=t&&Object.entries(t.requirements).every(([k,v])=>c.stats[k]>=v);
    const status=reservation?`已用於 ${G.targets(s).find(t=>t.uid===reservation.customer)?.key||'計畫'}`:chosen?'✓ 已選擇':location==='prep'?'點選留下':trim?'點選棄掉':location==='shelf'&&s.phase==='take'?'＋ 拿進手牌':location==='shelf'&&s.phase==='plan'?'官網內容可借用':hints&&t?(complete?'能力達標，還需檢查信任':'比較需求，尋找互補'):'點選搭配 · 放大看全部能力';
    return `<article data-preview="${esc('products:'+c.key)}" data-entity="${c.uid}" data-zone="${location==='shelf'?'shelf':location==='prep'?'prep':'hand0'}" data-ghost-label="${reservation?'已安排':'桌上暫配'}" class="game-card product-card ${chosen?'selected':''} ${reservation?'reserved':''} ${onTable?'on-table':''}" style="--card-color:${esc(c.color||'#e7ece4')};--card-tint:${esc(c.tint||'#f3f5ed')}"><button class="select-card" data-product="${c.uid}" data-location="${location}" aria-label="${trim?'棄掉':location==='shelf'&&s.phase==='take'?'拿取':'選擇'}產品 ${esc(c.name)} ${c.uid}" aria-pressed="${chosen}" ${!usable||reservation?'disabled':''}>
      <span class="card-meta"><span>${location==='shelf'?'公用產品架':location==='prep'?'諮詢候選':'你的產品'}</span><span>${esc(c.uid)}</span></span><span class="product-title"><strong>${esc(c.name)}</strong><span class="trust-badge"><small>所需信任</small>${c.cost}</span></span>${thumbnail(c)}<span class="product-art">${image(c)}</span>
      <span class="relevant-stats">${categories.map(k=>`<span class="${hints&&t?(c.stats[k]>=t.requirements[k]?'stat-pass':'stat-short'):''}"><span>${esc(k)}</span><b>${c.stats[k]}${t?`<small> / ${t.requirements[k]}</small>`:''}</b></span>`).join('')}</span><span class="card-status ${hints&&complete?'positive':''}">${esc(status)}</span></button>${inspect(c,'products')}</article>`;
  }
  function contactCard(c){
    const count=plans.filter(p=>p.contact===c.uid).length,chosen=draft.contact===c.uid,declared=s.turn.declared.includes(c.uid),trim=s.phase==='trim'&&hand().contacts.length>7;
    const products=selected().map(product).filter(Boolean),t=target(),result=t&&t.kind!=='monster'&&products.length?G.evaluate(t,products,c,s.day):null,enough=hints&&result&&result.trust>=result.cost;
    return `<article data-preview="${esc('contacts:'+c.key)}" data-entity="${c.uid}" data-zone="contacts0" data-ghost-label="${count?`桌上 · 餘 ${Math.max(0,c.capacity-count)} 人`:'桌上暫配'}" class="game-card contact-card ${chosen?'selected':''} ${count?'in-use':''} ${chosen||count?'on-table':''}"><button class="select-card" data-contact="${c.uid}" aria-label="${trim?'棄掉':'選擇'}接觸牌 ${esc(c.name)} ${c.uid}" aria-pressed="${chosen}" ${!isMyTurn()||!(s.phase==='plan'||trim)?'disabled':''}>${thumbnail(c)}<span class="contact-art">${image(c)}</span><strong class="card-title">${esc(c.name)}</strong>
      <span class="contact-values"><span>信任 <b>${c.trust}</b>${enough?' ✓':''}</span><span aria-label="還可接待 ${Math.max(0,c.capacity-count)} 位，上限 ${c.capacity} 位">餘 <b>${Math.max(0,c.capacity-count)}</b>／${c.capacity} 人</span></span><span class="contact-effect">${esc(c.effect)}</span><span class="card-status ${enough?'positive':''}">${trim?'點選棄牌':declared?'準備已完成 · 本回合須棄牌':count?`已安排 ${count} 人${count<c.capacity?' · 還可再接待':''}`:enough?`有效信任 ${result.trust}，門檻 ${result.cost}`:c.preparation?'可先使用準備效果':esc(c.uid)}</span>${declared?'<span class="live-card-tag">已宣告準備</span>':''}${count?`<span class="live-card-tag">餘 ${Math.max(0,c.capacity-count)} 人</span>`:''}</button>${inspect(c,'contacts')}</article>`;
  }
  function rail(id,cards,label){return `<div class="card-rail" id="${id}" data-rail tabindex="0" aria-label="${label}，可左右捲動">${cards||'<p class="empty-state">目前沒有卡牌。</p>'}</div>`;}
  function productShelf(){
    const active=isMyTurn()&&['take','rest','bonus','prep-swap'].includes(s.phase),descriptions={take:'先拿 0–1 張；拿完便可配牌。',rest:'本回合沒有進展，可從這裡拿 1 張休整。',bonus:`回購獎勵：還能拿 ${s.turn.bonus} 張。`,'prep-swap':'選一張想換進手牌的產品。'};
    const choosing=active&&['take','rest','bonus'].includes(s.phase),title=s.phase==='take'?'拿一張產品':s.phase==='rest'?'休整 · 拿一張產品':`回購 · 再拿 ${s.turn.bonus} 張`;
    if(!choosing&&!(active&&s.phase==='prep-swap'))return `<section class="shelf-panel side-shelf" id="shelf-panel" aria-label="公用產品架"><details id="public-products"><summary><span class="shelf-deck" aria-hidden="true">配</span><span>公用產品 <small>${s.market.length}</small></span><span class="shelf-toggle" aria-hidden="true">查看</span></summary><div class="side-shelf-content"><div class="section-head"><h2>公用產品</h2><button class="text-button" data-close-products aria-label="收起公用產品">收起 ×</button></div>${rail('shelf-rail',s.market.map(c=>productCard(c,'shelf')).join(''),'公用產品架')}</div></details></section>`;
    return `<section class="shelf-panel panel ${active?'stage-highlight':''} ${choosing?'choice-shelf':''}" id="shelf-panel"><div class="section-head"><div><h2>${choosing?title:'公用產品架'} <small>雙方共用</small></h2></div>${nav('shelf-rail','公用產品')}</div><div class="shelf-content"><p class="section-description">${descriptions[s.phase]||'雙方從同一架拿取；官網內容可借用其中一張接待客人。'}</p>${rail('shelf-rail',s.market.map(c=>productCard(c,'shelf')).join(''),'公用產品架')}</div></section>`;
  }
  function resources(){
    if(s.phase==='prep-choice'&&isMyTurn())return `<section class="panel prep-panel"><div class="section-head"><div><span class="eyebrow">CONSULTATION</span><h2>選一張留下，本回合就能用</h2></div></div><p class="section-description">另一張進入棄牌區；來店諮詢已宣告，本回合須棄掉。</p>${rail('prep-rail',s.preparation.choices.map(c=>productCard(c,'prep')).join(''),'諮詢候選產品')}</section>`;
    return `<div class="hand-heading"><h2>手牌</h2><div class="hand-filters" role="group" aria-label="篩選手牌">${[['all','全部'],['products','產品'],['contacts','接觸']].map(([value,label])=>`<button data-hand-filter="${value}" aria-pressed="${handFilter===value}">${label}</button>`).join('')}</div>${nav('hand-rail','手牌')}</div><div class="resource-grid" data-hand-filter="${handFilter}">${rail('hand-rail',`<section class="hand-panel" id="product-rail" aria-label="你的產品">${hand().products.map(c=>productCard(c,'hand')).join('')}</section><section class="contacts-panel" id="contact-rail" aria-label="你的接觸牌">${hand().contacts.map(contactCard).join('')}</section>`,'你的手牌：產品與接觸牌')}</div>`;
  }
  function evaluation(){
    const t=target();if(!t)return '';
    const products=selected().map(product).filter(Boolean),r=draftResult();
    const effects=r?.trustEffects||[],trust=r?`有效信任 ${r.trust}／${r.cost}`:'';
    const trustInfo=effects.length?`<details class="trust-effects" id="trust-effects"><summary>${trust} ⓘ</summary><div>${effects.map(e=>`${esc(e.source)} ＋${e.amount}`).join(' · ')}</div></details>`:`<span>${trust}</span>`;
    const shortages=products.length?Object.entries(t.requirements).filter(([k,v])=>Math.max(...products.map(p=>p.stats[k]))<v).map(([k,v])=>`<span class="short">${esc(k)}差 ${v-Math.max(...products.map(p=>p.stats[k]))}</span>`).join(''):'';
    return `<div class="evaluation ${r?.ok?'success':''}">${r?.ok?'<strong class="positive">✓ 搭配完成</strong>':!products.length?'<span>選產品</span>':shortages||'<span>✓ 能力達標</span>'}${t.kind==='monster'?'<span>免接觸</span>':r?`<div class="${r.trust>=r.cost?'positive':'short'}">${trustInfo}</div>`:products.length?'<span>選接觸牌</span>':''}${r&&!r.ok?`<details class="match-reasons" id="match-reasons"><summary>查看原因</summary><ul>${[...new Set(r.reasons)].map(reason=>`<li>${esc(reason)}</li>`).join('')}</ul></details>`:''}</div>`;
  }
  const options=(cards,value,placeholder)=>`<option value="">${placeholder}</option>`+cards.map(c=>`<option value="${c.uid}" ${c.uid===value?'selected':''}>${esc(c.optionLabel||c.name)} · ${esc(c.uid)}</option>`).join('');
  function draftVisual(owner='pending'){
    const cards=new Map();
    const add=(uid,customer,index,isContact=false)=>{
      const card=isContact?hand().contacts.find(c=>c.uid===uid):product(uid);if(!card)return;
      if(!cards.has(uid))cards.set(uid,{card,isContact,owner:customer?.uid||'pending',links:[],current:false,indices:[]});
      const item=cards.get(uid);item.links.push(customer?.key||'待選客人');
      if(index<0)item.current=true;else item.indices.push(index);
    };
    for(const [i,plan] of plans.entries()){
      const customer=G.targets(s).find(c=>c.uid===plan.customer);if(!customer)continue;
      plan.products.forEach(uid=>add(uid,customer,i));if(plan.contact)add(plan.contact,customer,i,true);
    }
    const customer=target();selected().forEach(uid=>add(uid,customer,-1));if(customer?.kind!=='monster'&&draft.contact)add(draft.contact,customer,-1,true);
    const owned=[...cards.values()].filter(item=>item.owner===owner);if(!owned.length)return '';
    return `<div class="draft-visual table-cards" aria-label="這位客人的搭配">${owned.map(({card,isContact,links,current,indices})=>{
      const ref=(isContact?'contacts':'products')+':'+card.key,count=plans.filter(p=>p.contact===card.uid).length;
      const control=current?`<button class="return-card" ${isContact?'data-return-contact':'data-return-product'}="${card.uid}" aria-label="收回暫配的 ${esc(card.name)}">收回</button>`:isContact&&indices.length>1?'<button class="return-card" data-jump="#plans-panel">管理</button>':`<button class="return-card" data-edit="${indices[0]}" aria-label="修改使用 ${esc(card.name)} 的計畫">修改</button>`;
      const prepare=current&&isContact&&card.preparation&&!s.turn.declared.includes(card.uid)?`<button class="effect-prepare" data-prepare="${card.uid}">${card.preparation==='consult'?'諮詢選牌':'LINE 換牌'}</button><small class="effect-cost">占1次機會，結算棄牌</small>`:'';
      return `<article class="staged-card ${current?'tentative':'committed'}" data-staged="${card.uid}" data-preview="${esc(ref)}"><span class="stage-links">${current?'暫配':'已安排'} → ${[...new Set(links)].map(esc).join('・')}</span><button class="staged-inspect" data-card="${esc(ref)}" aria-label="放大桌上的 ${esc(card.name)}">${cardPicture(card)}</button>${isContact&&count?`<span class="stage-capacity">餘 ${Math.max(0,card.capacity-count)} 人</span>`:''}${current?control:''}${prepare}</article>`;
    }).join('')}</div>`;
  }
  function customerArrangement(c){
    if(s.phase!=='plan'||!isMyTurn())return '';
    const current=draft.customer===c.uid,index=plans.findIndex(p=>p.customer===c.uid),plan=current?asPlan():plans[index];
    if(!plan)return '';
    const r=current?draftResult():G.inspectPlan(s,plan),canAdd=!!r&&r.legal&&(r.ok||s.config.allowFailedPlans);
    const contact=hand().contacts.find(card=>card.uid===plan.contact),owner=contact&&plans.find(p=>p.contact===contact.uid)?.customer;
    const shared=owner&&owner!==c.uid?`<button class="shared-contact-link" data-jump="[data-seat='${owner}']">共用 ${esc(contact.name)} → ${esc(G.targets(s).find(card=>card.uid===owner)?.key)}</button>`:'';
    return `<section class="customer-arrangement" aria-label="${esc(c.name)}的搭配">${draftVisual(c.uid)}${shared}${current?`<div aria-live="polite">${evaluation()}</div><div class="local-plan-actions"><button class="primary-button" data-action="add-plan" ${canAdd?'':'disabled'}>加入計畫</button><button class="text-button" data-action="clear-draft">收回搭配</button></div>`:`<div class="attached-plan-status">✓ 已安排 ＋${r.ok?c.score:0} 分</div><div class="attached-plan-tools"><button class="text-button" data-edit="${index}" aria-label="修改 ${esc(c.name)} 的計畫">修改</button><button class="text-button" data-remove="${index}" aria-label="移除 ${esc(c.name)} 的計畫">收回</button></div>`}</section>`;
  }
  function planning(){
    const t=target();
    const prep=hand().contacts.filter(c=>c.preparation&&!s.turn.declared.includes(c.uid));
    const pendingScore=plans.reduce((n,p)=>n+(G.inspectPlan(s,p).ok?G.targets(s).find(c=>c.uid===p.customer).score:0),0);
    return `<div class="table-match">${!t?draftVisual():''}</div>
      <div class="table-tools">${prep.length?`<details class="preparation-panel" id="preparation-panel"><summary>準備 · 諮詢／LINE</summary><p>宣告後占一次機會，本回合須棄掉這張接觸牌。</p><div class="prep-buttons">${prep.map(c=>`<button class="outline-button" data-prepare="${c.uid}">${c.preparation==='consult'?'諮詢 · 看二留一':'LINE · 交換產品'}<small>${esc(c.uid)}</small></button>`).join('')}</div></details>`:''}
      <details class="plan-list" id="plans-panel"><summary>計畫 ${plans.length} · 機會 ${usedSlots()}／2${plans.length?` · 預計 ＋${pendingScore} 分`:''}</summary>${plans.length?plans.map((p,i)=>{const c=G.targets(s).find(c=>c.uid===p.customer),result=G.inspectPlan(s,p);return `<div class="planned"><span><b>${result.ok?'✓':'!'} ${esc(c.name)} · ＋${result.ok?c.score:0} 分</b><small>${p.products.map(uid=>esc(product(uid)?.name)).join('＋')} · ${c.kind==='monster'?'免接觸':esc(hand().contacts.find(c=>c.uid===p.contact)?.name)}</small></span><button class="text-button" data-edit="${i}" aria-label="修改 ${esc(c.name)} 的計畫">修改</button><button class="remove-plan" data-remove="${i}" aria-label="移除 ${esc(c.name)} 的計畫">×</button></div>`;}).join(''):'<p>還沒有安排計畫。</p>'}${plans.length?`<p class="plan-cost">成功計畫消耗 ${plans.filter(p=>G.inspectPlan(s,p).ok).reduce((n,p)=>n+p.products.length,0)} 張產品；本回合棄掉 ${usedContactIds().size} 張接觸牌。</p>`:''}</details></div>
      ${s.turn.declared.length?`<p class="commitment-note">準備已宣告：${s.turn.declared.map(uid=>esc(hand().contacts.find(c=>c.uid===uid)?.name)).join('、')}，本回合須棄牌。</p>`:''}`;
  }

  function workspace(){
    let content='';const phase=s.phase,p=hand();
    if(phase==='finished')content=`<span class="eyebrow">GAME COMPLETE</span><h2>${s.winners.length===2?'平手，共同完成挑戰':s.winners[0]===0?'你贏得了這次挑戰！':'電腦顧問贏得了這一局'}</h2><p>你 ${p.score} 分 · 電腦 ${s.players[1].score} 分。</p><button class="primary-button full" data-action="new">再來一局</button>`;
    else if(s.active===1)content='<span class="eyebrow">COMPUTER TURN</span><h2>電腦顧問正在思考</h2><p class="ai-state">正在挑產品與規劃接待…</p><p class="muted">下一個回合就輪到你。</p>';
    else if(phase==='take')content='';
    else if(phase==='plan')content=planning();
    else if(phase==='prep-choice')content='<span class="eyebrow">CONSULTATION</span><h2>哪一張更適合現在？</h2><p>從諮詢候選產品中選一張留下；另一張棄掉。新產品能立刻參與本回合。</p><div class="tip">這張來店諮詢仍可用來接待客人。</div>';
    else if(phase==='prep-swap')content=`<span class="eyebrow">LINE SUPPORT</span><h2>交換一張產品</h2><p>各點一張手牌與架上產品，再確認交換。</p><label>放回產品架<select id="swap-hand">${options(p.products.filter(c=>!plans.some(p=>p.products.includes(c.uid))),swap.hand,'選擇手中產品')}</select></label><label>換進手牌<select id="swap-shelf">${options(s.market.filter(c=>!plans.some(p=>p.products.includes(c.uid))),swap.shelf,'選擇架上產品')}</select></label><button class="outline-button full" data-action="skip-swap">略過換牌</button><p class="commitment-note">LINE 已宣告，略過也會占一次機會並須棄牌。</p>`;
    else if(phase==='bonus')content=`<span class="eyebrow">REPURCHASE BONUS</span><h2>回購帶來額外補牌</h2><p>還能從產品架拿 ${s.turn.bonus} 張產品。拿到的牌下回合使用。</p>`;
    else if(phase==='rest')content=`<h2>休整 · 二選一</h2><div class="rest-supplies"><button class="supply-option" data-browse-products ${s.market.length?'':'disabled'}><span class="supply-art product-sample">${s.market.slice(0,2).map(c=>fullImage(c)).join('')}</span><strong>拿 1 張產品</strong></button><button class="supply-option" data-action="rest-contact"><span class="supply-art contact-deck" aria-hidden="true"><i>配<span>接觸牌</span></i><i>配<span>接觸牌</span></i></span><strong>抽 2 張接觸牌，留 1 張</strong></button></div>`;
    else if(phase==='rest-choice')content=`<h2>留一張接觸牌</h2><div class="rest-reveals">${s.restChoices.map(c=>`<article class="rest-reveal" data-entity="${c.uid}" data-zone="contacts0" data-preview="${esc('contacts:'+c.key)}"><button class="rest-choice" data-rest-choice="${c.uid}" aria-label="留下 ${esc(c.name)}">${fullImage(c)}<span>留下這張</span></button>${inspect(c,'contacts')}</article>`).join('')}</div>`;
    else if(phase==='trim'){
      const ep=Math.max(0,p.products.length-5),ec=Math.max(0,p.contacts.length-7);
      content=`<span class="eyebrow">WRAP UP YOUR TURN</span><h2>${ep||ec?'棄牌至上限':'回合完成'}</h2><div class="result-note">接待 ${s.turn.trades} 位客人${s.turn.monsters?` · 解決 ${s.turn.monsters} 隻怪獸型客人`:''}</div>${lastResults.length?`<ul class="result-list">${lastResults.map(r=>`<li>${r.ok?'✓':'!'} ${esc(r.name)}${r.ok?` ＋${r.score} 分`:''}</li>`).join('')}</ul>`:''}<p>${ep||ec?`請點選手牌，棄掉 ${ep} 張產品、${ec} 張接觸牌。`:''}</p><div class="primary-action"><button class="primary-button full" data-action="end-turn" ${ep||ec?'disabled':''}>結束回合</button></div>`;
    }
    return `<aside class="workspace panel" aria-label="回合操作"><div class="workspace-content">${content}${turnActions()}</div></aside>`;
  }
  function scoreBox(p,index){return `<div class="score-box ${s.active===index&&s.phase!=='finished'?'active':''}"><span class="avatar">${index===0?'你':'AI'}</span><span class="score-info"><b>${esc(p.name)}${s.active===index&&s.phase!=='finished'?' · 行動中':''}</b><small>客人 ${p.won.length} · 其中怪獸型 ${p.won.filter(c=>c.kind==='monster').length}</small><span class="score-progress"><i data-score-progress="${index}" style="width:${Math.min(100,p.score/18*100)}%"></i></span></span><strong class="points"><span data-score="${index}">${p.score}</span><small>／18</small></strong></div>`;}
  function tutorial(){
    if(!s.config.tutorial)return '';
    let message='教學完成！現在可以繼續與電腦自由對戰，或開啟新版標準局。',button='<button class="outline-button" data-action="new">開始標準局</button>';
    if(hand().turns===0){
      message=s.phase==='take'?'① 先從產品架拿一張產品；也可以按略過。':s.phase==='prep-choice'?'③ 選一張諮詢產品留下，新牌立即可用。':s.phase==='trim'?'⑤ 已完成第一次接待！按「結束我的回合」看看電腦怎麼做。':plans.length?'⑤ 檢查計畫與消耗，再按「確認結算」。':s.turn.declared.length?'④ 選 K02 門市店長、PNN＋3、來店諮詢，再加入計畫。':'② 先使用「來店諮詢」看二留一，體驗準備效果。';
      button=s.phase==='plan'&&!s.turn.declared.length?'<button class="outline-button" data-action="tutorial-prepare">使用來店諮詢</button>':s.phase==='plan'&&!plans.length?'<button class="outline-button" data-action="tutorial-match">帶入教學搭配</button>':'';
    }
    return `<section class="tutorial-banner" role="status"><div><b>第一次配對 · 引導教學</b><p>${message}</p></div>${button}</section>`;
  }
  function turnActions(){
    if(!isMyTurn()||s.phase==='plan'&&(draft.customer||selected().length||draft.contact))return '';
    let label='',act='',jump='',note='',disabled=false;
    if(s.phase==='take'){label='略過拿牌';act='skip-take';note='點公用產品拿取 1 張，或直接開始配牌。';}
    if(s.phase==='plan'){
      label=plans.length?`結算 ${plans.length} 組`:'休整';act='resolve';
      note=plans.length?`已用 ${usedSlots()}／2 次機會；結算前可展開計畫修改。`:'點客人開始搭配，也可以先準備或休整。';
    }
    if(s.phase==='prep-choice'||s.phase==='rest-choice')return '';
    if(s.phase==='prep-swap'){label=swap.hand&&swap.shelf?'確認交換':'選手牌與公用產品';act=swap.hand&&swap.shelf?'confirm-swap':'';jump=swap.hand?'#shelf-panel':'.hand-panel';note='LINE 已宣告；請各選一張產品。';}
    if(s.phase==='bonus'){label='略過額外補牌';act='skip-bonus';note=`可從公用產品拿取 ${s.turn.bonus} 張獎勵。`;}
    if(s.phase==='rest'){label='略過休整';act='skip-rest';note='點公用產品補 1 張，或選擇抽接觸牌。';}
    if(s.phase==='trim'){
      const ep=Math.max(0,hand().products.length-5),ec=Math.max(0,hand().contacts.length-7);
      if(ep||ec){label='點手牌整理';jump=ep?'.hand-panel':'.contacts-panel';note=`還須棄掉 ${ep} 張產品、${ec} 張接觸牌。`;}
      else{label='結束回合';act='end-turn';note='補滿共同牌桌，換對手行動。';}
    }
    return `<div class="mobile-dock turn-actions ${['take','rest','bonus'].includes(s.phase)?'secondary-action':''}">${s.phase==='trim'&&jump?`<small aria-live="polite">${esc(note)}</small>`:''}<button class="primary-button" ${disabled?'disabled':''} ${act?`data-action="${act}"`:`data-jump="${jump||'.workspace'}"`}>${label}</button></div>`;
  }

  function opponentActivity(){
    const event=aiPlayback?.current,report=s.lastTurnReport;
    if(event)return `<section class="opponent-activity playing" aria-live="polite"><div><b>${esc(event.title)}</b><span>${esc(event.detail)}</span></div><button class="text-button" data-action="skip-ai">略過對手演出 →</button></section>`;
    return report?`<section class="opponent-activity" aria-label="對手最近行動"><b>對手：${report.events.map(e=>esc(e.title)).join(' → ')}</b></section>`:'';
  }
  function runAI(){
    if(reading()){aiTimer=null;return;}
    if(uiBusy){aiTimer=setTimeout(runAI,80);return;}
    aiTimer=null;
    try{
      const origin=G.copy(s),final=G.copy(s),steps=[],head=final.log[0],round=final.round;
      G.playAI(final,(state,event)=>steps.push({state,event}));
      final.lastAI=[];for(const entry of final.log){if(entry===head)break;if(entry.round===round&&entry.message.includes('電腦顧問'))final.lastAI.unshift(entry.message);}
      aiPlayback={origin,final,steps,index:0,current:null};plans=[];draft=emptyDraft();lastResults=[];
      advanceAI();
    }catch(error){toast(error.message);}
  }
  async function advanceAI(){
    clearTimeout(aiTimer);aiTimer=null;if(!aiPlayback||reading())return;
    const currentGeneration=generation,before=G.copy(s),beforeDOM=M.capture();
    let event=null;
    if(aiPlayback.index>=aiPlayback.steps.length){s=aiPlayback.final;aiPlayback=null;}
    else{const step=aiPlayback.steps[aiPlayback.index++];s=step.state;event=step.event;aiPlayback.current=event;}
    

    render();markBusy(true);
    try{await M.transition({before,after:s,beforeDOM,event,tradeList:event?.trades||[],actor:1});}
    catch(error){toast(error.message);}
    finally{
      if(currentGeneration===generation){markBusy(false);render();if(aiPlayback&&!reading())aiTimer=setTimeout(advanceAI,preferences.fast?40:170);}
    }
  }
  function render(){
    window.HandFeel?.reset();
    window.CardPreview?.reset();
    syncTools();
    if(screen==='home'){renderHome();return;}
    hasSavedGame=true;$('game').hidden=false;$('home-screen').hidden=true;$('home-button').hidden=false;document.body.dataset.screen='game';
    const focus=document.activeElement,focusId=focus?.id,focusAttrs=focus?.matches('button')?['customer','product','contact','action','remove','edit'].filter(k=>focus.dataset[k]!==undefined).map(k=>[k,focus.dataset[k]]):[],openDetails=new Set([...document.querySelectorAll('#game details[open]')].map(e=>e.id));
    for(const rail of document.querySelectorAll('[data-rail]'))railPositions.set(rail.id,rail.scrollLeft);
    const phaseKey=`${s.active}-${s.phase}`,changed=lastPhase!==phaseKey;if(changed){swap={hand:'',shelf:''};lastPhase=phaseKey;}
    save();$('game').dataset.phase=s.phase;$('game').dataset.cardView=preferences.cardView;$('game').dataset.busy=String(uiBusy);$('hints-button').setAttribute('aria-pressed',String(hints));$('hints-button').textContent=`提示${hints?'開啟':'關閉'}`;
    const people=G.targets(s),delta=s.players[0].score-s.players[1].score;
    const focusUid=target()?.uid||plans.at(-1)?.customer||people[0]?.uid;
    const targetsHTML=`<section class="targets-panel" style="--customer-count:${people.length};--other-customers:${Math.max(1,people.filter(c=>c.uid!==focusUid&&!plans.some(p=>p.customer===c.uid)).length)};--other-rows:${Math.max(1,Math.ceil(people.filter(c=>c.uid!==focusUid&&!plans.some(p=>p.customer===c.uid)).length/2))}"><div class="section-head"><h2>共同客人</h2>${nav('customer-rail','客人')}</div>${rail('customer-rail',people.map(targetCard).join(''),'雙方共用客人')}</section>`;
    const pickFirst=isMyTurn()&&['take','rest','bonus','rest-choice'].includes(s.phase);
    const sharedContents=pickFirst?`${workspace()}${productShelf()}<div class="target-stage">${targetsHTML}</div>`:`<div class="target-stage">${targetsHTML}${workspace()}</div>${productShelf()}`;
    const contestant=index=>`<div class="contestant ${index?'opponent-strip':'human-strip'} ${s.active===index?'active-player':''}">${scoreBox(s.players[index],index)}<small class="hand-counts" data-hand="${index}">產品 ${s.players[index].products.length} · 接觸 ${s.players[index].contacts.length}</small><span class="won-anchor" data-won="${index}" aria-label="已成交 ${s.players[index].won.length} 位客人"></span></div>`;
    $('game').innerHTML=`<div class="match-surface"><header class="match-bar">${contestant(0)}<div class="match-center"><span>第 ${s.round} 輪${s.endTriggered?' · 最後一輪':''}</span><button class="event-box day-card" data-card="${esc('days:'+s.day.key)}" data-preview="${esc('days:'+s.day.key)}" aria-label="放大特殊日 ${esc(s.day.name)}">${fullImage(s.day)}</button><small data-race-label>${delta===0?'雙方同分':delta>0?`你領先 ${delta} 分`:`對手領先 ${-delta} 分`}</small></div>${contestant(1)}</header>
      ${opponentActivity()}${tutorial()}
      <div class="board-layout"><div class="table-area"><section class="shared-table" aria-label="雙方共用牌桌">${sharedContents}<div class="table-piles"><span data-pile="products">產品庫 ${s.decks.products.length}</span><span data-pile="contacts">接觸庫 ${s.decks.contacts.length}</span><span data-pile="customers">客人庫 ${s.decks.customers.length}</span><span data-pile="discard">棄牌區</span><span class="save-state ${saveOK?'':'save-error'}">${saveOK?'已自動存檔':'存檔不可用'}</span></div></section><section class="hand-tray" aria-label="你的手牌">${resources()}</section></div></div></div>`;
    for(const id of openDetails){const node=$(id);if(node)node.open=true;}
    for(const rail of document.querySelectorAll('[data-rail]'))rail.scrollLeft=railPositions.get(rail.id)||0;
    window.HandFeel?.layout();updateRailButtons();if(focusId)$(focusId)?.focus({preventScroll:true});else if(focusAttrs.length){const replacement=[...document.querySelectorAll('#game button')].find(b=>focusAttrs.every(([k,v])=>b.dataset[k]===v));replacement?.focus({preventScroll:true});}
    if(s.active===1&&s.phase!=='finished'&&!aiTimer&&!aiPlayback&&!uiBusy&&!reading())aiTimer=setTimeout(runAI,450);
  }
  function updateRailButtons(){for(const button of document.querySelectorAll('[data-scroll]')){const rail=$(button.dataset.scroll);button.disabled=!rail||(button.dataset.direction==='-1'?rail.scrollLeft<2:rail.scrollLeft+rail.clientWidth>=rail.scrollWidth-2);}}
  function prepare(uid){
    const contacts=new Set([...usedContactIds(),uid]),monsters=plans.filter(p=>s.monster?.uid===p.customer).length||Number(target()?.kind==='monster');
    if(contacts.size+monsters>2)throw Error('準備也占處理機會；請先移除衝突的計畫或清除怪獸型客人搭配。');G.prepareContact(s,uid);
  }
  function addPlan(){
    const p=asPlan(),r=draftResult();if(!r)throw Error('請先選好目標、產品與所需接觸牌。');G.validatePlans(s,plans.concat(p));if(!r.ok&&!s.config.allowFailedPlans)throw Error('目前尚未達標，請先調整搭配。');
    plans.push(p);draft=emptyDraft();toast('已加入計畫');
  }
  function takeHint(){
    const p=G.bestPlan(s,plans).plans[plans.length];if(!p){toast('目前沒有可直接完成的新搭配。可以使用諮詢選牌、LINE 換牌，或休整累積資源。');return;}
    draft={customer:p.customer,products:p.products.slice(),contact:p.contact};const c=target(),r=G.inspectPlan(s,p);toast(c.kind==='monster'?'這兩款產品逐類取最大值，需求全部達標；免接觸、占一次機會。':`需求全部達標，有效信任 ${r.trust} ≥ 所需 ${r.cost}。可檢查後加入計畫。`);
  }
  function resolve(){
    if(draft.customer||selected().length||draft.contact)throw Error('請先將目前搭配加入計畫，或清除搭配。');const names=new Map(G.targets(s).map(c=>[c.uid,c]));lastResults=G.resolve(s,plans).map(r=>({...r,name:names.get(r.customer).name,score:names.get(r.customer).score}));plans=[];draft=emptyDraft();
  }
  document.addEventListener('click',event=>{
    if(!$('tools-menu').contains(event.target))$('tools-menu').open=false;
    if(!event.target.closest('#shelf-panel')){const shelf=$('public-products');if(shelf)shelf.open=false;}
    const button=event.target.closest('button');if(!button||button.disabled)return;
    if(button.closest('#tools-menu'))$('tools-menu').open=false;
    if(button.dataset.close){$(button.dataset.close).close();return;}
    if(button.dataset.card){openCard(button.dataset.card);return;}
    if(button.hasAttribute('data-open-history')){openHistory();return;}
    if(button.dataset.historyActor!==undefined){historyFilter.actor=button.dataset.historyActor;window.MatchJournal.render(s,historyFilter);return;}
    if(button.dataset.historyKind!==undefined){historyFilter.kind=button.dataset.historyKind;window.MatchJournal.render(s,historyFilter);return;}
    if(button.dataset.home){
      const mode=button.dataset.home;
      if(mode==='continue'){screen='game';render();$('game').scrollTo({top:0,behavior:'instant'});window.scrollTo({top:0,behavior:'instant'});}
      if(mode==='new'){if(hasSavedGame&&s.phase!=='finished')requestNew('normal');else fresh({...s.config,tutorial:false});}
      if(mode==='tutorial'){if(hasSavedGame&&s.phase!=='finished')requestNew('tutorial');else fresh({...D.config,monsterMode:false,tutorial:true},20261016);}
      if(mode==='help')$('help-dialog').showModal();
      if(mode==='library'){renderLibrary();$('library-dialog').showModal();}
      return;
    }
    if(button.hasAttribute('data-close-products')){if($('public-products'))$('public-products').open=false;return;}
    if(button.dataset.library){libraryType=button.dataset.library;renderLibrary();return;}
    if(button.dataset.handFilter){handFilter=button.dataset.handFilter;render();return;}
    if(button.hasAttribute('data-browse-products')){if(!uiBusy)jumpTo('#shelf-panel');return;}
    if(button.dataset.jump){if(!uiBusy)jumpTo(button.dataset.jump);return;}
    if(button.id==='hint-button'){
      if(screen==='game'&&!uiBusy&&hints&&isMyTurn()&&s.phase==='plan')action(()=>{takeHint();handFilter='all';},{revealMatch:true});
      return;
    }
    if(button.dataset.scroll){const rail=$(button.dataset.scroll);rail.scrollBy({left:Number(button.dataset.direction)*Math.max(200,rail.clientWidth*.8),behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});return;}
    if(!button.closest('#game'))return;
    if(button.dataset.action==='new'&&s.phase==='finished'){
      fresh({...s.config,tutorial:false});window.scrollTo({top:0,behavior:'instant'});return;
    }
    if(button.dataset.action==='skip-ai'&&aiPlayback){generation++;M.cancel();uiBusy=false;clearTimeout(aiTimer);aiTimer=null;s=aiPlayback.final;aiPlayback=null;render();return;}
    if(uiBusy)return;

    if(aiPlayback||s.active===1)return;
    if(button.dataset.location==='shelf'&&$('public-products'))$('public-products').open=false;
    if(!playingHeld&&button.matches('#hand-rail .select-card')&&matchMedia('(max-width:950px)').matches){
      const uid=button.dataset.product||button.dataset.contact,isSelected=selected().includes(uid)||draft.contact===uid;
      window.HandFeel.lift(button,{label:s.phase==='trim'?'棄掉這張':s.phase==='prep-swap'?'選來交換':isSelected?'收回手牌':'放上桌',context:target()?`配給 ${target().name}`:s.phase==='plan'?'先暫放，之後再選客人':'',onPlay:()=>{playingHeld=true;try{button.click();}finally{playingHeld=false;}}});return;
    }
    action(()=>{
      if(button.dataset.returnProduct)draft.products=selected().filter(uid=>uid!==button.dataset.returnProduct);
      if(button.dataset.returnContact)draft.contact='';
      if(button.dataset.customer){chooseTarget(button.dataset.customer);handFilter='all';}
      if(button.dataset.product){
        const uid=button.dataset.product,location=button.dataset.location;
        if(s.phase==='take')G.takeProduct(s,uid);else if(s.phase==='prep-choice')G.choosePreparationProduct(s,uid);else if(s.phase==='prep-swap')swap[location==='shelf'?'shelf':'hand']=uid;else if(s.phase==='bonus')G.bonusProduct(s,uid);else if(s.phase==='rest')G.rest(s,'product',uid);else if(s.phase==='trim')G.discard(s,'products',uid);
        else if(s.phase==='plan'){
          const products=selected();if(location==='shelf'&&target()?.kind==='monster')throw Error('怪獸型客人只能使用手牌產品。');
          let website=null;
          if(location==='shelf'){
            const available=c=>c?.name==='官網內容'&&plans.filter(p=>p.contact===c.uid).length<c.capacity&&!plans.some(p=>p.contact===c.uid&&p.products.some(id=>s.market.some(card=>card.uid===id)))&&new Set([...usedContactIds(),c.uid]).size+plans.filter(p=>s.monster?.uid===p.customer).length<=2;
            const current=hand().contacts.find(c=>c.uid===draft.contact);
            website=available(current)?current:hand().contacts.find(available);
            if(!website)throw Error('需要尚有容量與借用額度的官網內容；請檢查處理機會及計畫。');
          }
          if(products.includes(uid))draft.products=products.filter(id=>id!==uid);else if((s.day.combo||target()?.kind==='monster')&&products.length===1&&location!=='shelf'&&hand().products.some(c=>c.uid===products[0]))draft.products=products.concat(uid);else draft.products=[uid];
          if(website)draft.contact=website.uid;
        }
      }
      if(button.dataset.contact){if(s.phase==='trim')G.discard(s,'contacts',button.dataset.contact);else if(target()?.kind==='monster')toast('怪獸型客人免接觸牌。若想先補資源，可展開牌桌上的「準備 · 諮詢／LINE」。');else draft.contact=draft.contact===button.dataset.contact?'':button.dataset.contact;}
      if(button.dataset.edit!==undefined){if(draft.customer||selected().length||draft.contact)throw Error('請先加入或清除目前搭配，再修改計畫。');draft={...plans.splice(Number(button.dataset.edit),1)[0]};draft.products=draft.products.slice();}if(button.dataset.remove!==undefined)plans.splice(Number(button.dataset.remove),1);if(button.dataset.prepare)prepare(button.dataset.prepare);if(button.dataset.restChoice)G.chooseRest(s,button.dataset.restChoice);
      switch(button.dataset.action){
        case 'skip-take':G.takeProduct(s,null);break;
        case 'clear-draft':draft=emptyDraft();break;
        case 'hint':takeHint();handFilter='all';break;
        case 'add-plan':addPlan();handFilter='all';break;
        case 'resolve':resolve();break;
        case 'confirm-swap':{const previous=swap.hand;G.swapProduct(s,swap.hand,swap.shelf);draft.products=selected().filter(uid=>uid!==previous);break;}
        case 'skip-swap':G.skipSwap(s);break;
        case 'skip-bonus':G.bonusProduct(s,null);break;
        case 'rest-contact':G.rest(s,'contact');break;
        case 'skip-rest':G.rest(s,'skip');break;
        case 'end-turn':G.finishTurn(s);draft=emptyDraft();lastResults=[];break;
        case 'new':requestNew('normal');break;
        case 'tutorial-prepare':prepare(hand().contacts.find(c=>c.preparation==='consult'&&!s.turn.declared.includes(c.uid)).uid);break;
        case 'tutorial-match':{const c=s.customers.find(c=>c.key==='K02'),p=hand().products.find(c=>c.key==='PNN+3'),contact=hand().contacts.find(c=>c.preparation==='consult');if(!c||!p||!contact)throw Error('教學搭配已改變，請使用提示尋找其他合法搭配。');draft={customer:c.uid,products:[p.uid],contact:contact.uid};break;}
      }
    },{settlement:button.dataset.action==='resolve',revealMatch:button.matches('#hand-rail .select-card')});

  });
  $('game').addEventListener('change',event=>{
    if(uiBusy||aiPlayback||s.active!==0)return;const id=event.target.id,value=event.target.value;action(()=>{if(id==='draft-customer')chooseTarget(value);if(id==='draft-product'){draft.products[0]=value;if(draft.products[1]===value)draft.products[1]='';}if(id==='draft-second')draft.products[1]=value;if(id==='draft-contact')draft.contact=value;if(id==='swap-hand')swap.hand=value;if(id==='swap-shelf')swap.shelf=value;});
  });
  $('game').addEventListener('scroll',event=>{if(event.target.matches('[data-rail]'))updateRailButtons();},true);window.addEventListener('resize',updateRailButtons);
  function openCard(ref){
    window.CardPreview?.reset();
    const split=ref.indexOf(':'),type=ref.slice(0,split),key=ref.slice(split+1),c=catalogue(type)?.find(c=>c.key===key);if(!c)return;
    beginReading();
    $('card-content').innerHTML=`<div class="card-detail"><img class="full-card-image" src="${esc(c.image)}" alt="${esc(c.name)}完整卡面"><div class="card-detail-text"><span class="eyebrow">${c.kind==='monster'?'客人牌 · 怪獸型':labels[type]} · ${esc(c.key)}</span><h2 id="card-title">${esc(c.name)}</h2>${c.story?`<p>${esc(c.story)}</p>`:''}${c.stats?`<p>所需信任 <b>${c.cost}</b></p><div class="full-stats">${D.categories.map(k=>`<div><span>${k}</span><b>${c.stats[k]}</b></div>`).join('')}</div>`:c.requirements?`<div class="detail-needs">${Object.entries(c.requirements).map(([k,v])=>`<div>${k}<b>${v}</b></div>`).join('')}</div><p>${c.kind==='monster'?'4 分 · 兩款不同手牌產品互補 · 任意日 · 免接觸與信任 · 占一次處理機會。':`${c.score} 分 · 偏好 ${esc(c.preferred)}${c.requiresCombo?' · 需 PNN 雙產品組合':''}`}</p>`:c.trust!==undefined?`<p>基礎信任 <b>${c.trust}</b> · 接待上限 <b>${c.capacity}</b> 人</p><p>${esc(c.effect)}</p>`:`<p>${esc(c.effect)}</p><p>普通客人位 ${c.limit} · ${c.combo?'開放 PNN 雙產品':'一般客人限單品'}</p>`}<button class="primary-button" data-close="card-dialog">看完了，回到遊戲</button></div></div>`;
    if(!$('card-dialog').open)$('card-dialog').showModal();
  }
  function renderLibrary(){
    const cards=catalogue(libraryType).filter(c=>(c.key+c.name+(c.kind==='monster'?'怪獸型客人':'')+Object.keys(c.requirements||c.stats||{}).join('')).toLowerCase().includes(libraryQuery.toLowerCase()));$('library-tabs').innerHTML=Object.entries(labels).map(([type,label])=>`<button data-library="${type}" aria-pressed="${libraryType===type}">${label} <small>${catalogue(type).length}</small></button>`).join('');$('library-grid').innerHTML=cards.length?cards.map(c=>`<button class="library-card" data-card="${esc((c.kind==='monster'?'monsters':libraryType)+':'+c.key)}">${fullImage(c,'library-face')}<span><small>${esc(c.key)}</small><b>${esc(c.name)}</b></span></button>`).join(''):'<p>沒有符合搜尋的卡片。</p>';
  }
  $('library-button').addEventListener('click',()=>{renderLibrary();$('library-dialog').showModal();});$('library-search').addEventListener('input',event=>{libraryQuery=event.target.value;renderLibrary();});
  $('history-button').addEventListener('click',openHistory);
  $('history-dialog').addEventListener('close',endReading);$('card-dialog').addEventListener('close',endReading);
  $('history-dialog').addEventListener('change',event=>{if(event.target.id==='history-round')historyFilter.round=event.target.value;if(event.target.id==='history-order')historyFilter.order=event.target.value;window.MatchJournal.render(s,historyFilter);});
  $('help-button').addEventListener('click',()=>$('help-dialog').showModal());$('tutorial-button').addEventListener('click',()=>requestNew('tutorial'));$('new-button').addEventListener('click',()=>requestNew('normal'));
  $('home-button').addEventListener('click',goHome);$('home-brand').addEventListener('click',event=>{event.preventDefault();goHome();});
  $('confirm-new').addEventListener('click',()=>{$('new-dialog').close();fresh(pendingNew==='tutorial'?{...D.config,monsterMode:false,tutorial:true}:{...(s.config.tutorial?D.config:s.config),tutorial:false},pendingNew==='tutorial'?20261016:Date.now());});
  $('hints-button').addEventListener('click',()=>{if(uiBusy)return;hints=!hints;preferences.hints=hints;savePreferences();render();});
  function savePreferences(){try{localStorage.setItem(PREFS,JSON.stringify(preferences));}catch{}M.configure(preferences);$('sound-button').textContent=preferences.sound?'音效開啟':'音效關閉';$('sound-button').setAttribute('aria-pressed',String(preferences.sound));$('speed-button').textContent=preferences.fast?'快速演出':'標準演出';$('speed-button').setAttribute('aria-pressed',String(preferences.fast));$('view-button').textContent=preferences.cardView==='face'?'卡面縮圖':'精簡數值';$('view-button').setAttribute('aria-pressed',String(preferences.cardView==='face'));$('view-button').title=preferences.cardView==='face'?'切換為精簡數值':'切換為完整卡面縮圖';}
  $('view-button').addEventListener('click',()=>{if(uiBusy)return;preferences.cardView=preferences.cardView==='face'?'compact':'face';savePreferences();render();});
  $('sound-button').addEventListener('click',()=>{preferences.sound=!preferences.sound;savePreferences();M.unlockAudio();M.tone('pick');});
  $('speed-button').addEventListener('click',()=>{preferences.fast=!preferences.fast;savePreferences();});
  $('skip-motion').addEventListener('click',()=>M.cancel());
  $('pause-motion').addEventListener('click',()=>M.togglePause());
  document.addEventListener('pointerdown',()=>M.unlockAudio(),{passive:true});
  document.addEventListener('keydown',()=>M.unlockAudio(),{passive:true});
  savePreferences();
  $('settings-button').addEventListener('click',()=>{const form=$('settings-form');for(const k of ['productCopies','contactCopies','customerCopies','dayCopies'])form.elements[k].value=s.config[k];form.elements.monsterMode.checked=s.config.monsterMode;form.elements.monsterSet.value=s.config.monsterSet;form.elements.allowFailedPlans.checked=s.config.allowFailedPlans;form.elements.seed.value='';$('settings-dialog').showModal();});
  $('settings-form').addEventListener('submit',event=>{
    event.preventDefault();const form=event.target,config={};for(const k of ['productCopies','contactCopies','customerCopies','dayCopies'])config[k]=Number(form.elements[k].value);config.monsterMode=form.elements.monsterMode.checked;config.monsterSet=form.elements.monsterSet.value;config.allowFailedPlans=form.elements.allowFailedPlans.checked;config.tutorial=false;
    try{const seed=form.elements.seed.value===''?Date.now():Number(form.elements.seed.value);G.newGame(seed,config);$('settings-dialog').close();fresh(config,seed);}catch(error){toast(error.message);}
  });
  render();if(loadMessage)toast(loadMessage);
})();
