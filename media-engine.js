(() => {
  'use strict';
  const assets=window.POTEMKIN_ASSETS,copy=window.POTEMKIN_CONTENT;
  if(!assets||!copy)return;
  const players=[];
  let motionOff=matchMedia('(prefers-reduced-motion: reduce)').matches,raf=0,last=0;
  const clamp=x=>Math.max(0,Math.min(1,x));
  const ease=x=>1-Math.pow(1-clamp(x),3);
  const loadImage=url=>new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=url;});
  function frameAt(asset,time){let at=0;const ms=Math.max(0,time)*1000;for(let i=0;i<asset.frameCount;i++){at+=asset.durations[i];if(ms<at)return i;}return asset.frameCount-1;}
  function clipEffect(ctx,effect,p,w,h){
    ctx.beginPath();
    if(effect==='rift'){const x=(w+h)*p-h;ctx.moveTo(x,0);ctx.lineTo(x+h,h);ctx.lineTo(0,h);ctx.lineTo(0,0);}
    else if(effect==='scan'){ctx.rect(0,0,w,h*p);}
    else if(effect==='grasp'){ctx.rect(0,0,w*p/2,h);ctx.rect(w-w*p/2,0,w*p/2,h);}
    else if(effect==='ascent'){const y=h*(1-p);ctx.moveTo(0,y);ctx.lineTo(w,y-h*.25);ctx.lineTo(w,h);ctx.lineTo(0,h);}
    else if(effect==='rush'){ctx.rect(0,0,w*p,h);}
    else if(effect==='flick'){ctx.arc(w*.78,h*.38,Math.hypot(w,h)*p,0,Math.PI*2);}
    else if(effect==='stamp'){ctx.arc(w*.5,h*.5,Math.hypot(w,h)*.55*p,0,Math.PI*2);}
    else if(effect==='fracture'){for(let row=0;row<10;row++){const part=clamp(p*1.4-row*.04),width=w*part;ctx.rect(row%2?w-width:0,row*h/10,width,h/10+1);}}
    else if(effect==='ember'){const size=24;for(let y=0;y<h;y+=size)for(let x=0;x<w;x+=size){const seed=((x*13+y*7)%137)/137;if(seed<p)ctx.rect(x,y,size+1,size+1);}}
    else ctx.rect(0,h*(1-p),w,h*p);
    ctx.clip();
  }
  function draw(player,time,final=false){
    if(!player.image)return;
    const {asset,canvas,ctx,scratch,sctx,element}=player;
    const bounds=element.querySelector('.media-stage').getBoundingClientRect();
    if(bounds.width<1||bounds.height<1)return;
    const ratio=Math.min(devicePixelRatio||1,2),width=Math.round(bounds.width*ratio),height=Math.round(bounds.height*ratio);
    if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
    const w=asset.width,h=asset.height;
    if(scratch.width!==w||scratch.height!==h){scratch.width=w;scratch.height=h;}
    const isSequence=asset.frameCount>1;
    const frame=isSequence?frameAt(asset,final?Infinity:Math.max(0,time-(asset.id==='victory-salute'?.32:.12))):0;
    const sx=isSequence?(frame%asset.columns)*w:0,sy=isSequence?Math.floor(frame/asset.columns)*h:0;
    sctx.clearRect(0,0,w,h);sctx.globalCompositeOperation='source-over';
    sctx.drawImage(player.image,sx,sy,w,h,0,0,w,h);
    const scale=Math.min(width/w,height/h)*.97,dw=w*scale,dh=h*scale;
    const progress=final?1:ease((time-.18)/1.55);
    const shift=(1-progress)*(player.effect==='rush'?-35:player.effect==='ascent'?0:16)*ratio;
    const lift=(1-progress)*(player.effect==='ascent'?30:0)*ratio;
    const x=(width-dw)/2+shift,y=(height-dh)/2+lift;
    ctx.clearRect(0,0,width,height);ctx.imageSmoothingEnabled=!asset.pixelArt;
    ctx.globalAlpha=final?1:ease(time/.28);
    sctx.globalCompositeOperation='source-in';sctx.fillStyle=player.ink;sctx.fillRect(0,0,w,h);sctx.globalCompositeOperation='source-over';
    if(!final&&progress<1&&!asset.monochrome){ctx.save();ctx.globalAlpha*=.2*(1-progress);ctx.drawImage(scratch,x-13*ratio,y+5*ratio,dw,dh);ctx.restore();}
    ctx.drawImage(scratch,x,y,dw,dh);
    if(!asset.monochrome){
      sctx.clearRect(0,0,w,h);sctx.drawImage(player.image,sx,sy,w,h,0,0,w,h);
      ctx.save();ctx.translate(x,y);if(!final)clipEffect(ctx,player.effect,progress,dw,dh);ctx.drawImage(scratch,0,0,dw,dh);ctx.restore();
    }else if(!final){
      // A monochrome asset keeps its silhouette color throughout.
      ctx.globalAlpha=1;
    }
    ctx.globalAlpha=1;
    element.dataset.frame=String(frame);
  }
  async function ensure(player){
    if(player.image)return true;
    if(player.loading)return player.loading;
    player.loading=loadImage(player.asset.atlas||player.asset.file).then(image=>{
      player.image=image;player.canvas.hidden=false;player.poster.hidden=true;
      player.element.dataset.loaded='true';return true;
    }).catch(()=>{player.element.dataset.failed='true';player.poster.hidden=player.poster.complete&&!player.poster.naturalWidth;player.canvas.hidden=true;if(player.poster.hidden)player.element.querySelector('.image-fallback').hidden=false;return false;});
    return player.loading;
  }
  function schedule(){if(!raf){last=performance.now();raf=requestAnimationFrame(tick);}}
  function tick(now){
    const delta=Math.min((now-last)/1000,.06);last=now;raf=0;let active=false;
    for(const p of players){
      if(!p.visible||p.done||!p.image||motionOff||document.hidden)continue;
      p.elapsed+=delta;draw(p,p.elapsed);
      if(p.elapsed>=Math.max(1.9,(p.asset.durationSeconds||0)+.22)){p.done=true;p.element.classList.remove('is-playing');draw(p,p.elapsed,true);p.element.dataset.complete='true';}
      else active=true;
    }
    if(active)raf=requestAnimationFrame(tick);
  }
  async function activate(player,replay=false){
    if(replay){player.elapsed=0;player.done=false;player.element.dataset.complete='false';player.element.classList.remove('is-playing');void player.element.offsetWidth;}
    if(motionOff){player.done=true;player.poster.hidden=false;player.canvas.hidden=true;return;}
    if(!await ensure(player))return;
    if(player.done){draw(player,99,true);return;}
    player.element.classList.add('is-playing');draw(player,player.elapsed);schedule();
  }
  const observer='IntersectionObserver'in window?new IntersectionObserver(entries=>{
    for(const entry of entries){const p=players.find(item=>item.element===entry.target);p.visible=entry.isIntersecting&&entry.intersectionRatio>.05;if(p.visible)activate(p);}
  },{threshold:[0,.08,.25]}):null;
  document.querySelectorAll('[data-media-id]').forEach(element=>{
    const asset=assets.find(item=>item.id===element.dataset.mediaId);if(!asset)return;
    const canvas=element.querySelector('canvas'),scratch=document.createElement('canvas');
    const p={element,asset,canvas,ctx:canvas.getContext('2d'),scratch,sctx:scratch.getContext('2d'),poster:element.querySelector('.media-poster'),ink:copy.media[asset.id].ink,effect:element.dataset.effect,elapsed:0,done:false,visible:false,image:null,loading:null};
    if(!p.ctx||!p.sctx)return;
    players.push(p);element.querySelector('.replay-media')?.addEventListener('click',()=>activate(p,true));
    p.poster.addEventListener('error',()=>{p.poster.hidden=true;element.querySelector('.image-fallback').hidden=false;});
    if(p.poster.complete&&!p.poster.naturalWidth){p.poster.hidden=true;element.querySelector('.image-fallback').hidden=false;}
    if(observer)observer.observe(element);else{p.visible=true;activate(p);}
  });
  window.PotemkinMotion={
    setPaused(off){motionOff=off;for(const p of players){p.element.classList.remove('is-playing');if(off){p.poster.hidden=false;p.canvas.hidden=true;}else if(p.visible){p.done=false;p.elapsed=0;activate(p);}}},
    refresh(){for(const p of players){const r=p.element.getBoundingClientRect();p.visible=r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight;if(p.visible)activate(p);}},
    skip(){for(const p of players)if(p.visible){p.done=true;p.element.classList.remove('is-playing');if(p.image)draw(p,99,true);else p.poster.hidden=false;}},
    getState(){return players.map(p=>({id:p.asset.id,visible:p.visible,done:p.done,loaded:!!p.image,frame:Number(p.element.dataset.frame||0)}));}
  };
  let resize;
  addEventListener('resize',()=>{clearTimeout(resize);resize=setTimeout(()=>{for(const p of players)if(p.visible&&p.image)draw(p,p.elapsed,p.done);},120);});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule();});
})();
