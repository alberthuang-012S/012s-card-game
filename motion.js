/* Presentation only. Game state is committed by the engine before any animation. */
(() => {
  'use strict';
  let serial=0,fast=false,sound=true,audioContext=null,paused=false;
  const active=new Set(),waits=new Set(),hidden=new Set();
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const reduced=()=>matchMedia('(prefers-reduced-motion:reduce)').matches;
  const duration=ms=>reduced()?30:fast?Math.round(ms*.3):ms;
  const layer=document.createElement('div');layer.id='motion-layer';document.body.append(layer);
  function configure(options){fast=!!options.fast;sound=options.sound!==false;}
  function unlockAudio(){
    if(!sound)return;
    try{audioContext??=new (window.AudioContext||window.webkitAudioContext)();if(audioContext.state==='suspended')audioContext.resume().catch(()=>{});}catch{}
  }
  function tone(kind='pick',count=0){
    if(!sound||!audioContext||audioContext.state!=='running')return;
    try{
      const now=audioContext.currentTime;
      const notes=kind==='score'?[523,659,784]:kind==='turn'?[392,523]:kind==='land'?[260]:[390,520];
      notes.forEach((frequency,i)=>{
        const oscillator=audioContext.createOscillator(),gain=audioContext.createGain(),start=now+i*.045;
        oscillator.type=kind==='land'?'triangle':'sine';oscillator.frequency.setValueAtTime(frequency*Math.pow(1.06,count),start);
        gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(.045,start+.009);gain.gain.exponentialRampToValueAtTime(.001,start+.13);
        oscillator.connect(gain);gain.connect(audioContext.destination);oscillator.start(start);oscillator.stop(start+.15);
      });
    }catch{}
  }
  function wait(ms){return new Promise(resolve=>{
    const task={remaining:duration(ms),timer:null,started:0,done(){clearTimeout(task.timer);waits.delete(task);resolve();},start(){if(paused)return;task.started=performance.now();task.timer=setTimeout(()=>task.done(),Math.max(0,task.remaining));},pause(){clearTimeout(task.timer);task.remaining=Math.max(0,task.remaining-(performance.now()-task.started));}};
    waits.add(task);task.start();
  });}
  function togglePause(){
    if(!document.body.classList.contains('motion-playing'))return;
    paused=!paused;document.body.classList.toggle('motion-paused',paused);
    const button=document.getElementById('pause-motion');button.textContent=paused?'繼續演出':'暫停';button.setAttribute('aria-pressed',String(paused));
    for(const animation of active){if(paused)animation.pause();else animation.play();}
    for(const task of waits){if(paused)task.pause();else task.start();}
  }
  function phase(stage,name,detail={}){
    stage.dataset.phase=name;
    document.dispatchEvent(new CustomEvent('table-motion',{detail:{type:'phase',phase:name,...detail}}));
  }
  async function animate(node,frames,ms){
    if(!node?.isConnected)return;
    const animation=node.animate(frames,{duration:duration(ms),easing:'cubic-bezier(.2,.8,.2,1)',fill:'both'});active.add(animation);if(paused)animation.pause();
    try{await animation.finished;}catch{}finally{active.delete(animation);animation.cancel();}
  }
  function cancel(){
    serial++;for(const animation of active){try{animation.finish();}catch{animation.cancel();}}active.clear();
    for(const task of [...waits])task.done();for(const node of hidden)node.style.visibility='';hidden.clear();layer.replaceChildren();document.body.classList.remove('motion-playing','motion-paused');paused=false;
    const button=document.getElementById('pause-motion');if(button){button.textContent='暫停';button.setAttribute('aria-pressed','false');}
  }
  function capture(){
    const entities=new Map();
    for(const node of document.querySelectorAll('#game [data-entity]'))entities.set(node.dataset.entity,{rect:rect(node),zone:node.dataset.zone,node});
    for(const node of document.querySelectorAll('#game [data-staged]'))entities.set(`staged:${node.dataset.staged}`,{rect:rect(node),zone:'staged',node});
    return entities;
  }
  function rect(node){
    if(!node)return null;const box=node.getBoundingClientRect();if(!box.width||!box.height)return null;
    let left=Math.max(0,box.left),right=Math.min(innerWidth,box.right),top=Math.max(0,box.top),bottom=Math.min(innerHeight,box.bottom);
    const rail=node.closest('[data-rail],.stage-cards');if(rail){const limit=rail.getBoundingClientRect();left=Math.max(left,limit.left);right=Math.min(right,limit.right);top=Math.max(top,limit.top);bottom=Math.min(bottom,limit.bottom);}
    const table=node.closest('#game');if(table){const limit=table.getBoundingClientRect();left=Math.max(left,limit.left);right=Math.min(right,limit.right);top=Math.max(top,limit.top);bottom=Math.min(bottom,limit.bottom);}
    if(right-left<15||bottom-top<15)return null;
    return {x:(left+right)/2,y:(top+bottom)/2,w:Math.min(box.width,180),h:Math.min(box.height,220)};
  }
  function anchor(zone){
    const selectors={hand0:'[data-hand="0"]',hand1:'[data-hand="1"]',contacts0:'[data-hand="0"]',won0:'[data-won="0"]',won1:'[data-won="1"]',customers:'.targets-panel .section-head',shelf:'#shelf-panel .section-head',productsDeck:'[data-pile="products"]',contactsDeck:'[data-pile="contacts"]',customersDeck:'[data-pile="customers"]',discard:'[data-pile="discard"]',prep:'.prep-panel',day:'.event-box'};
    for(const node of document.querySelectorAll(selectors[zone]||'.shared-table')){const box=rect(node);if(box)return {...box,w:70,h:90};}
    return {x:zone==='hand1'||zone==='won1'?innerWidth*.72:innerWidth*.5,y:zone==='hand1'||zone==='won1'?90:innerHeight-100,w:70,h:90};
  }
  function face(card,extra=''){
    const staged=extra.includes('stage-card'),full=staged||document.getElementById('game')?.dataset.cardView==='face';
    const node=document.createElement(staged?'button':'div');node.className=`flying-card ${full?'full-face':''} ${extra}`;
    if(staged){node.type='button';node.dataset.card=`${card.requirements?card.kind==='monster'?'monsters':'customers':card.stats?'products':'contacts'}:${card.key}`;node.setAttribute('aria-label',`放大 ${card.name}`);}else node.setAttribute('aria-hidden','true');
    node.innerHTML=`<span>${card.score!==undefined?`${card.score} 分`:'012S'}</span><img src="${esc(full?card.image:card.art)}" alt=""><b>${esc(card.name)}</b>`;
    return node;
  }
  function conceal(node){if(node){node.style.visibility='hidden';hidden.add(node);}}
  function reveal(node){if(node){node.style.visibility='';hidden.delete(node);}}
  async function fly(card,from,to,{destination=null,actor=0,token=serial,ms=350}={}){
    if(token!==serial||!card||!from||!to)return;
    conceal(destination);const node=face(card,actor===1?'rival-flight':'');layer.append(node);
    const width=110,height=node.classList.contains('full-face')?154:138;Object.assign(node.style,{left:`${from.x-width/2}px`,top:`${from.y-height/2}px`,width:`${width}px`,height:`${height}px`});
    const dx=to.x-from.x,dy=to.y-from.y;
    document.dispatchEvent(new CustomEvent('table-motion',{detail:{type:'transfer',uid:card.uid,actor,from:{x:from.x,y:from.y},to:{x:to.x,y:to.y}}}));
    await animate(node,[{transform:'translate(0,0) rotate(-4deg) scale(.9)',opacity:1},{transform:`translate(${dx*.5}px,${dy*.5-24}px) rotate(3deg) scale(1.05)`,offset:.5,opacity:1},{transform:`translate(${dx}px,${dy}px) rotate(0) scale(.65)`,opacity:1}],ms);
    node.remove();reveal(destination);
    if(token===serial&&destination?.isConnected)animate(destination,[{filter:'brightness(1.35)'},{filter:'brightness(1)'}],180);
  }
  function publicZones(state){
    const zones=new Map(),add=(cards,zone)=>cards.forEach(card=>zones.set(card.uid,{card,zone}));
    add(state.market,'shelf');add(window.Game.targets(state),'customers');add(state.players[0].products,'hand0');add(state.players[0].contacts,'contacts0');
    state.players.forEach((p,i)=>add(p.won,`won${i}`));
    if(state.active===0){add(state.preparation?.choices||[],'prep');add(state.restChoices||[],'contacts0');}
    return zones;
  }
  function setScores(scores){
    scores.forEach((score,index)=>{const node=document.querySelector(`[data-score="${index}"]`);if(node)node.textContent=score;const progress=document.querySelector(`[data-score-progress="${index}"]`);if(progress)progress.style.width=`${Math.min(100,score/18*100)}%`;});
    const node=document.querySelector('[data-race-label]'),delta=scores[0]-scores[1];
    if(node)node.textContent=delta===0?'雙方同分':delta>0?`你領先 ${delta} 分`:`對手領先 ${-delta} 分`;
  }
  async function trades(tradeList,beforeDOM,afterDOM,scores,actor,token){
    setScores(scores);const visibleTrades=tradeList.filter(t=>t.ok);
    for(let index=0;index<visibleTrades.length;index++){
      if(token!==serial)return;const trade=visibleTrades[index];
      const claimed=afterDOM.get(trade.customer.uid);conceal(claimed?.node);
      const stage=document.createElement('section');stage.className=`trade-stage ${actor===1?'rival-stage':''}`;
      stage.innerHTML=`<header class="stage-heading"><small class="stage-owner">${actor===1?'對手':'你'} · ${index+1}／${visibleTrades.length}</small><span class="stage-phase-label">核對</span></header><h2 class="visually-hidden">${esc(trade.customer.name)}</h2><div class="stage-cards" aria-label="成交搭配，可左右滑動並點牌放大"></div><div class="stage-card-nav"><button data-stage-back aria-label="上一張卡牌">‹</button><span></span><button data-stage-next aria-label="下一張卡牌">›</button></div><div class="stage-scoreline"><b class="stage-stamp">＋${trade.customer.score}</b><div class="stage-score" aria-live="polite"></div></div><details class="stage-details"><summary>判定與效果${trade.contact?` · 信任 ${trade.trust}／${trade.cost}`:''}</summary><div class="stage-needs">${trade.needs.map(n=>`<span>${esc(n.category)} ${n.best}／${n.target} ✓</span>`).join('')}</div></details><p class="stage-instruction"></p>`;
      layer.append(stage);phase(stage,'match',{actor,uid:trade.customer.uid});await animate(stage,[{opacity:0,transform:'translate(-50%,-45%) scale(.94)'},{opacity:1,transform:'translate(-50%,-50%) scale(1)'}],200);
      if(token!==serial)return;
      if(trade.trustEffects?.length){const detail=document.createElement('div');detail.className='stage-effects';detail.textContent=trade.trustEffects.map(e=>`${e.source} ＋${e.amount}`).join(' · ');stage.querySelector('.stage-needs').after(detail);}
      const cards=stage.querySelector('.stage-cards');
      const staged=[trade.customer,...trade.products,...(trade.contact?[trade.contact]:[])];
      for(const card of staged){const node=face(card,'stage-card');node.dataset.stageUid=card.uid;cards.append(node);node.style.visibility='hidden';}
      let shown=0;
      const nav=stage.querySelector('.stage-card-nav'),updateNav=()=>{
        const first=cards.firstElementChild,step=first.getBoundingClientRect().width+parseFloat(getComputedStyle(cards).gap||0);
        shown=cards.scrollLeft+cards.clientWidth>=cards.scrollWidth-2?staged.length-1:Math.max(0,Math.min(staged.length-1,Math.round(cards.scrollLeft/step)));
        if(cards.scrollWidth<=cards.clientWidth+2)shown=0;
        nav.querySelector('span').textContent=`${shown+1}／${staged.length}`;nav.querySelector('[data-stage-back]').disabled=shown===0;nav.querySelector('[data-stage-next]').disabled=shown===staged.length-1;
      };
      const movePage=direction=>{const card=cards.children[Math.max(0,Math.min(staged.length-1,shown+direction))];cards.scrollTo({left:cards.scrollLeft+card.getBoundingClientRect().left-cards.getBoundingClientRect().left-6,behavior:reduced()?'instant':'smooth'});};
      nav.querySelector('[data-stage-back]').addEventListener('click',()=>movePage(-1));nav.querySelector('[data-stage-next]').addEventListener('click',()=>movePage(1));cards.addEventListener('scroll',updateNav);updateNav();
      await Promise.all(staged.map((card,i)=>{
        const node=cards.children[i],from=beforeDOM.get(`staged:${card.uid}`)?.rect||beforeDOM.get(card.uid)?.rect||anchor(card.requirements?'customers':`hand${actor}`);
        const to=rect(node);if(!to){reveal(node);return;}
        return fly(card,from,to,{destination:node,actor,token,ms:480+i*70});
      }));
      if(token!==serial)return;tone('land');
      for(const chip of stage.querySelectorAll('.stage-needs span')){chip.classList.add('checked');await wait(150);if(token!==serial)return;}
      await wait(700);if(token!==serial)return;
      phase(stage,'score',{actor,uid:trade.customer.uid,score:trade.customer.score});
      stage.querySelector('.stage-phase-label').textContent='得分';
      stage.querySelector('.stage-stamp').classList.add('stamped');stage.querySelector('.stage-score').textContent=`${scores[actor]} → ${scores[actor]+trade.customer.score} 分`;
      tone('score',index);await wait(900);
      if(token!==serial)return;
      const customerNode=cards.firstElementChild;
      await fly(trade.customer,rect(customerNode),claimed?.rect||anchor(`won${actor}`),{destination:claimed?.node,actor,token,ms:650});
      if(token!==serial)return;
      scores[actor]+=trade.customer.score;setScores(scores);
      const score=document.querySelector(`[data-score="${actor}"]`);if(score)animate(score,[{transform:'scale(1.5)',color:actor===1?'#a64d35':'#3c874a'},{transform:'scale(1)',color:'#0a2864'}],260);
      await wait(650);if(token!==serial)return;
      const sharedLater=trade.contact&&visibleTrades.slice(index+1).some(t=>t.contact?.uid===trade.contact.uid);
      phase(stage,'collect',{actor,uid:trade.customer.uid});stage.querySelector('.stage-phase-label').textContent='收牌';
      stage.querySelector('.stage-instruction').textContent=sharedLater?'共用接觸牌保留':'';
      const discardCards=trade.products.concat(trade.contact&&!sharedLater?[trade.contact]:[]);
      await Promise.all(discardCards.map(card=>fly(card,rect([...cards.children].find(node=>node.dataset.stageUid===card.uid)),anchor('discard'),{actor,token,ms:480})));
      await wait(500);
      if(token!==serial)return;
      stage.remove();
    }
  }
  async function receipt(move,actor,token,reason){
    if(token!==serial)return;
    const stage=document.createElement('section');stage.className='receipt-stage';
    stage.innerHTML=`<small>${esc(reason)}</small><h2>${move.opponent?'對手拿到產品':'拿到'+(move.card.stats?'產品':'接觸牌')}</h2><img class="receipt-face" src="${esc(move.card.image)}" alt="${esc(move.card.name)}完整卡面"><p>${esc(move.card.name)}</p><span>${move.opponent?'進入對手手牌':'進入你的手牌'}</span>`;
    layer.append(stage);phase(stage,'receive',{actor,uid:move.card.uid});
    await animate(stage,[{opacity:0,transform:'translate(-50%,-45%) scale(.94)'},{opacity:1,transform:'translate(-50%,-50%) scale(1)'}],200);
    await wait(1100);if(token!==serial)return;
    await fly(move.card,rect(stage.querySelector('img')),move.to,{destination:move.destination,actor,token,ms:680});
    if(token!==serial)return;
    stage.querySelector('span').textContent=move.opponent?'✓ 已收入對手手牌':'✓ 已收入你的手牌';await wait(600);stage.remove();
  }
  async function transition({before,after,beforeDOM,event=null,actor=0,tradeList=[]}){
    cancel();const token=serial;document.body.classList.add('motion-playing');
    const afterDOM=capture(),old=publicZones(before),next=publicZones(after),excluded=new Set(tradeList.flatMap(t=>[t.customer.uid,...t.products.map(c=>c.uid),...(t.contact?[t.contact.uid]:[])]));
    const hasTrades=tradeList.some(t=>t.ok),scores=before.players.map(p=>p.score);
    const ownedBefore=new Set([...before.players[0].products,...before.players[0].contacts].map(c=>c.uid)),received=new Set([...after.players[0].products,...after.players[0].contacts].filter(c=>!ownedBefore.has(c.uid)).map(c=>c.uid));
    for(const uid of received)conceal(afterDOM.get(uid)?.node);
    if(hasTrades){setScores(scores);for(const trade of tradeList)conceal(afterDOM.get(trade.customer.uid)?.node);}
    try{
      if(reduced()){if(hasTrades)tone('score');return;}
      const moves=[];
      for(const [key,entry] of afterDOM){
        if(!key.startsWith('staged:')||beforeDOM.has(key)||!entry.rect)continue;
        const uid=key.slice(7),card=next.get(uid)?.card;
        if(card)moves.push({card,from:beforeDOM.get(uid)?.rect||anchor(next.get(uid).zone),to:entry.rect,destination:entry.node});
      }
      for(const [key,entry] of beforeDOM){
        if(!key.startsWith('staged:')||afterDOM.has(key)||!entry.rect)continue;
        const uid=key.slice(7),destination=next.get(uid),to=afterDOM.get(uid);
        if(!excluded.has(uid)&&destination&&['hand0','contacts0','shelf'].includes(destination.zone)&&to?.rect){
          moves.push({card:destination.card,from:entry.rect,to:to.rect,destination:to.node});
        }
      }
      for(const [uid,entry] of old){
        const destination=next.get(uid),from=beforeDOM.get(uid)?.rect,to=afterDOM.get(uid)?.rect,node=afterDOM.get(uid)?.node;
        if(!excluded.has(uid)&&!received.has(uid)&&destination?.zone===entry.zone&&from&&to&&node&&(Math.abs(from.x-to.x)>2||Math.abs(from.y-to.y)>2)){
          animate(node,[{transform:`translate(${from.x-to.x}px,${from.y-to.y}px)`},{transform:'translate(0,0)'}],230);
        }
      }
      for(const [uid,entry] of old){
        if(excluded.has(uid))continue;const destination=next.get(uid);
        if(destination&&entry.zone!==destination.zone)moves.push({card:entry.card,from:beforeDOM.get(uid)?.rect||anchor(entry.zone),to:afterDOM.get(uid)?.rect||anchor(destination.zone),destination:afterDOM.get(uid)?.node});
        else if(!destination){
          const inOpponentHand=after.players[1].products.some(c=>c.uid===uid);
          if(inOpponentHand||Object.values(after.discards).flat().some(c=>c.uid===uid))moves.push({card:entry.card,from:beforeDOM.get(uid)?.rect||anchor(entry.zone),to:anchor(inOpponentHand?'hand1':'discard'),opponent:inOpponentHand});
        }
      }
      for(const [uid,entry] of next){
        if(old.has(uid)||excluded.has(uid))continue;
        const fromOpponent=before.players[1].products.some(c=>c.uid===uid);
        moves.push({card:entry.card,from:anchor(fromOpponent?'hand1':entry.card.requirements?'customersDeck':entry.card.stats?'productsDeck':'contactsDeck'),to:afterDOM.get(uid)?.rect||anchor(entry.zone),destination:afterDOM.get(uid)?.node});
      }
      for(const uid of received){if(moves.some(m=>m.card.uid===uid))continue;const entry=next.get(uid);if(entry)moves.push({card:entry.card,from:beforeDOM.get(uid)?.rect||anchor(entry.zone),to:afterDOM.get(uid)?.rect||anchor(entry.zone),destination:afterDOM.get(uid)?.node});}
      if(hasTrades)await trades(tradeList,beforeDOM,afterDOM,scores,actor,token);
      if(token!==serial)return;
      const draws=moves.filter(m=>received.has(m.card.uid)||m.opponent),tableMoves=moves.filter(m=>!draws.includes(m));
      if(tableMoves.length){
        tone('pick');if(actor===1){const pointer=document.createElement('i');pointer.className='rival-pointer';Object.assign(pointer.style,{left:`${moves[0].from.x}px`,top:`${moves[0].from.y}px`});layer.append(pointer);await wait(170);pointer.remove();}
        await Promise.all(tableMoves.slice(0,12).map((move,i)=>fly(move.card,move.from,move.to,{...move,actor,token,ms:430+i*25})));
      }
      for(const move of draws){if(token!==serial)return;tone('pick');await receipt(move,actor,token,hasTrades?'接待補牌':before.phase==='bonus'?'回購補牌':['rest','rest-choice'].includes(before.phase)?'休整補給':before.phase==='prep-choice'?'諮詢選牌':before.phase==='prep-swap'?'交換產品':'回合拿牌');}
      if(token===serial&&before.day.uid!==after.day.uid){tone('turn');const node=document.querySelector('.event-box');if(node)await animate(node,[{filter:'brightness(1.5)',transform:'scale(.96)'},{filter:'brightness(1)',transform:'scale(1)'}],300);}
      if(token===serial&&event&&!moves.length&&!hasTrades)await wait(240);
    }finally{
      if(token===serial){for(const node of [...hidden])reveal(node);layer.replaceChildren();document.body.classList.remove('motion-playing','motion-paused');paused=false;setScores(after.players.map(p=>p.score));}
    }
  }
  window.TableMotion={configure,unlockAudio,tone,capture,transition,cancel,togglePause,get active(){return document.body.classList.contains('motion-playing');},get paused(){return paused;}};
})();
