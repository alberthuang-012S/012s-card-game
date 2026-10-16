/* Read-only full-card preview. Selecting a card and inspecting it remain separate actions. */
(() => {
  'use strict';
  const data=window.GAME_DATA,cards=new Map();
  for(const type of ['products','contacts','customers','monsters','days'])for(const card of data[type])cards.set(`${type}:${card.key}`,card);
  const panel=document.createElement('aside');panel.id='hover-preview';panel.hidden=true;panel.setAttribute('aria-hidden','true');
  const image=document.createElement('img'),caption=document.createElement('div'),name=document.createElement('strong'),hint=document.createElement('small');
  caption.append(name,hint);panel.append(image,caption);document.body.append(panel);
  let timer=null,source=null,hovered=null,sequence=0,keyboardNavigation=false;
  const canHover=()=>innerWidth>=600&&matchMedia('(hover:hover) and (pointer:fine)').matches;
  const busy=()=>document.getElementById('game')?.dataset.busy==='true'||document.body.classList.contains('motion-playing');
  function hide(){clearTimeout(timer);timer=null;panel.hidden=true;source?.classList.remove('hand-reading');source=null;sequence++;}
  function reset(){hide();hovered=null;}
  function getSource(node){return node?.closest?.('[data-preview]')||node?.closest?.('[data-card]')||null;}
  function place(){
    if(!source?.isConnected||panel.hidden)return;
    const bounds=source.getBoundingClientRect(),gap=12,padding=9;
    const ratio=image.naturalWidth&&image.naturalHeight?image.naturalWidth/image.naturalHeight:63/88;
    const right=innerWidth-bounds.right-gap,left=bounds.left-gap;
    const width=Math.max(100,Math.min(320,innerWidth-padding*2,(innerHeight-72)*ratio,Math.max(left,right)));
    if(width<180){hide();return;}
    const height=width/ratio+48;
    let x=right>=width?bounds.right+gap:left>=width?bounds.left-gap-width:bounds.x<innerWidth/2?innerWidth-width-padding:padding;
    let y=Math.max(padding,Math.min(innerHeight-height-padding,bounds.y+(bounds.height-height)/2));
    x=Math.max(padding,Math.min(innerWidth-width-padding,x));
    Object.assign(panel.style,{left:`${x}px`,top:`${y}px`,width:`${width}px`});
  }
  function show(node){
    if(!node?.isConnected||busy()||document.querySelector('dialog[open]')&&!node.closest('dialog[open]'))return;
    const ref=node.dataset.preview||node.dataset.card,card=cards.get(ref);if(!card)return;
    const host=node.closest('dialog[open]')||document.body;if(panel.parentElement!==host)host.append(panel);
    source=node;const held=!!node.closest('#hand-rail')&&document.getElementById('game')?.dataset.cardView==='face';
    panel.classList.toggle('hand-lift-preview',held);if(held)source.classList.add('hand-reading');
    image.src=card.image;image.alt=`${card.name}完整卡面`;name.textContent=card.name;
    hint.textContent=node.matches('.library-card')?'點選縮圖固定查看 · Esc 收起':'按放大圖示固定查看 · Esc 收起';
    panel.dataset.card=ref;panel.hidden=false;place();
    const current=++sequence;image.decode().then(()=>{if(current===sequence)place();}).catch(()=>{});
  }
  function schedule(node){hide();if(!node)return;timer=setTimeout(()=>{timer=null;show(node);},220);}
  document.addEventListener('pointerover',event=>{
    if(event.pointerType==='touch'||!canHover())return;
    const node=getSource(event.target);if(node===hovered)return;hovered=node;schedule(node);
  });
  document.addEventListener('pointerout',event=>{
    const next=getSource(event.relatedTarget);if(next===hovered)return;hovered=null;hide();
  });
  document.addEventListener('pointermove',event=>{
    if(event.pointerType==='touch'||!canHover()||hovered)return;
    const node=getSource(event.target);if(node){hovered=node;schedule(node);}
  });
  document.addEventListener('focusin',event=>{
    const node=getSource(event.target);
    if(keyboardNavigation&&node&&innerWidth>=600)requestAnimationFrame(()=>{
      if(keyboardNavigation&&node.contains(document.activeElement))schedule(node);
    });
  });
  document.addEventListener('focusout',hide);
  document.addEventListener('pointerdown',()=>{keyboardNavigation=false;hide();},{passive:true});
  document.addEventListener('keydown',event=>{if(event.key==='Tab'||event.key.startsWith('Arrow'))keyboardNavigation=true;if(['Escape','Enter',' '].includes(event.key))hide();});
  document.addEventListener('wheel',()=>{keyboardNavigation=false;},{passive:true});
  document.addEventListener('scroll',reset,true);window.addEventListener('resize',reset);window.addEventListener('blur',reset);
  document.addEventListener('close',reset,true);
  window.CardPreview={hide,reset};
})();
