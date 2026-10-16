/* Presentation only: fan geometry and a read-only touch lift. */
(() => {
  'use strict';
  const dialog=document.createElement('dialog');
  dialog.id='held-dialog';dialog.className='held-dialog';dialog.setAttribute('aria-labelledby','held-title');
  dialog.innerHTML='<h2 id="held-title" class="visually-hidden"></h2><img class="held-face" alt=""><p class="held-context"></p><div class="held-actions"><button type="button" class="primary-button" data-held-play>放上桌</button><button type="button" class="outline-button" data-held-cancel>放回手中</button></div>';
  document.body.append(dialog);
  let play=null,origin=null;
  function reset(){play=null;origin=null;if(dialog.open)dialog.close();}
  function layout(){
    const rail=document.getElementById('hand-rail');if(!rail)return;
    const cards=[...rail.querySelectorAll('.game-card')].filter(c=>getComputedStyle(c.parentElement).display!=='none');
    const mobile=matchMedia('(max-width:950px)').matches,width=mobile?138:180;
    const step=mobile?72:Math.min(112,Math.max(52,(rail.clientWidth-width-28)/Math.max(1,cards.length-1)));
    const span=width+step*Math.max(0,cards.length-1),start=Math.max(14,(rail.clientWidth-span)/2);
    cards.forEach((card,i)=>{
      const offset=cards.length>1?(i/(cards.length-1)-.5)*2:0;
      card.style.setProperty('--fan-left',`${start+i*step}px`);
      card.style.setProperty('--fan-y',`${Math.abs(offset)*18}px`);
      card.style.setProperty('--fan-angle',`${offset*7}deg`);
      card.style.setProperty('--fan-order',String(i+1));
      card.style.setProperty('--fan-width',`${width}px`);
      card.style.setProperty('--fan-hit-width',`${i===cards.length-1?width:step}px`);
    });
    rail.style.setProperty('--fan-span',`${span+start+18}px`);
    rail.classList.toggle('fan-empty',!cards.length);
  }
  function lift(button,{label='放上桌',context='',onPlay}){
    reset();window.CardPreview?.reset();
    const article=button.closest('[data-preview]'),ref=article?.dataset.preview;if(!ref)return;
    const split=ref.indexOf(':'),type=ref.slice(0,split),key=ref.slice(split+1);
    const card=window.GAME_DATA[type]?.find(c=>c.key===key);if(!card)return;
    origin=button;play=onPlay;
    dialog.querySelector('h2').textContent=card.name;
    const image=dialog.querySelector('img');image.src=card.image;image.alt=`${card.name}完整卡面`;
    dialog.querySelector('.held-context').textContent=context;
    dialog.querySelector('[data-held-play]').textContent=label;
    dialog.querySelector('[data-held-cancel]').textContent=article.classList.contains('on-table')?'繼續留在桌上':'放回手中';
    dialog.showModal();
    if(!matchMedia('(prefers-reduced-motion:reduce)').matches){
      const from=article.getBoundingClientRect(),to=image.getBoundingClientRect();
      image.animate([{transform:`translate(${from.x+from.width/2-to.x-to.width/2}px,${from.y+from.height/2-to.y-to.height/2}px) scale(.38) rotate(-5deg)`,opacity:.7},{transform:'translate(0,0) scale(1) rotate(0)',opacity:1}],{duration:210,easing:'cubic-bezier(.2,.8,.2,1)'});
    }
  }
  dialog.querySelector('[data-held-cancel]').addEventListener('click',reset);
  dialog.querySelector('[data-held-play]').addEventListener('click',()=>{
    const callback=play,source=origin;reset();
    if(source?.isConnected&&!source.disabled)callback?.();
  });
  dialog.addEventListener('close',()=>{play=null;origin=null;});
  dialog.addEventListener('click',event=>{if(event.target===dialog){const b=dialog.getBoundingClientRect();if(event.clientX<b.left||event.clientX>b.right||event.clientY<b.top||event.clientY>b.bottom)reset();}});
  window.addEventListener('resize',layout);
  window.HandFeel={layout,lift,reset};
})();
