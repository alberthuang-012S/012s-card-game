/* Read-only presentation of this match's saved public events and the player's known cards. */
(() => {
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function event(entry){
  const message=String(entry.message||'');
  const actor=entry.actor!==undefined?entry.actor:message.startsWith('電腦顧問')?1:message.startsWith('你')?0:null;
  const kind=entry.kind||(/未成交|取得 \d+ 分/.test(message)?'trade':/效果|宣告|諮詢|交換/.test(message)?'effect':/拿走|補牌|休整/.test(message)?'take':'system');
  return {...entry,message,actor,kind,score:entry.score??(kind==='trade'?Number(message.match(/取得 (\d+) 分/)?.[1]||0):0),title:entry.title||(kind==='trade'?message.includes('未成交')?'未成交':'成交':kind==='effect'?'接觸效果':kind==='take'?'拿牌':'牌桌紀錄')};
 }
 function render(state,filter){
  const events=state.log.map(event),rounds=[...new Set(events.map(e=>e.round))].sort((a,b)=>b-a),days=new Map();
  for(const e of events)if(e.day&&!days.has(e.round))days.set(e.round,e.day);
  if(filter.round!=='all'&&!rounds.includes(Number(filter.round)))filter.round='all';
  document.getElementById('history-summary').innerHTML=state.players.map((p,i)=>`<div><span>${i?'對手':'你'}</span><strong>${p.score}<small> 分</small></strong><span>${p.won.length} 位客人</span></div>`).join('<i>：</i>');
  document.getElementById('history-round').innerHTML='<option value="all">全部回合</option>'+rounds.map(n=>`<option value="${n}" ${String(n)===filter.round?'selected':''}>第 ${n} 輪</option>`).join('');
  document.getElementById('history-order').value=filter.order;
  for(const b of document.querySelectorAll('[data-history-actor]'))b.setAttribute('aria-pressed',String(b.dataset.historyActor===filter.actor));
  for(const b of document.querySelectorAll('[data-history-kind]'))b.setAttribute('aria-pressed',String(b.dataset.historyKind===filter.kind));
  let chosen=events.filter(e=>(filter.actor==='all'||String(e.actor)===filter.actor)&&(filter.kind==='all'||(filter.kind==='other'?!['trade','take','effect'].includes(e.kind):e.kind===filter.kind))&&(filter.round==='all'||e.round===Number(filter.round)));
  if(filter.order==='old')chosen=chosen.slice().reverse();
  document.getElementById('history-count').textContent=`${chosen.length} 筆`;
  const groups=[];for(const e of chosen){let group=groups.at(-1);if(group?.round!==e.round){group={round:e.round,events:[]};groups.push(group);}group.events.push(e);}
  document.getElementById('history-list').innerHTML=groups.length?groups.map(g=>`<section class="journal-round" data-round="${g.round}"><h3>第 ${g.round} 輪${days.get(g.round)?`<small>${esc(days.get(g.round))}</small>`:''}</h3>${g.events.map(e=>{
   const cards=(Array.isArray(e.cards)?e.cards:[]).flatMap(ref=>{const card=window.GAME_DATA[ref.type]?.find(c=>c.key===ref.key);return card?[{...ref,card}]:[];});
   const images=cards.length?`<div class="journal-cards">${cards.map(({type,key,card})=>`<button data-card="${esc(type+':'+key)}" aria-label="放大 ${esc(card.name)}"><img src="${esc(card.image)}" alt="${esc(card.name)}" loading="lazy" decoding="async"></button>`).join('')}</div>`:'';
   const detail=e.kind==='trade'&&cards.length?`<details class="journal-explanation"><summary>判定詳情</summary><p>${esc(e.message)}</p></details>`:!cards.length||e.kind==='effect'||e.kind==='turn'?`<p>${esc(e.message)}</p>`:'';
   return `<article class="journal-entry" data-actor="${e.actor===null?'table':e.actor}" data-kind="${esc(e.kind)}"><header><span class="journal-actor actor-${e.actor}">${e.actor===0?'你':e.actor===1?'對手':'牌桌'}</span><strong>${esc(e.title)}</strong>${e.score?`<b class="journal-points">＋${e.score} 分</b>`:''}</header>${images}${detail}</article>`;
  }).join('')}</section>`).join(''):'<p class="journal-empty">目前沒有這類紀錄。</p>';
  document.getElementById('history-list').scrollTop=0;
 }
 window.MatchJournal={render};
})();
