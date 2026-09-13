const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const wall=document.querySelector('#wall'),dialog=document.querySelector('#detail'),motion=document.querySelector('#motion');
let data={peliculas:{},funciones:[],sedes:[],generadoEn:null},players=new Map(),visible=new Set(),paused=false,items=[],apiReady=false,opened=null;
const query=new URLSearchParams(location.search);let sede=['003','002','001'].includes(query.get('sede'))?query.get('sede'):'003',requestedDate=query.get('fecha');
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Mexico_City'}).format(new Date());
let date=requestedDate||today();
const MODES=['scatter','ribbons','orbit','depth','mosaic'];
let mode=MODES.includes(query.get('vista'))?query.get('vista'):'ribbons',pan={x:0,y:0},zoom=1,drag=null,suppressClick=false,observer=null;
let generation=0;const loading=new Set(),ready=new Set(),deadlines=new Map();
const MAX_STARTS=3;
const stalled=new Set();
function discardPlayer(i){clearTimeout(deadlines.get(i));deadlines.delete(i);loading.delete(i);ready.delete(i);const p=players.get(i);players.delete(i);p?.destroy?.();const t=atlas.querySelector(`[data-index="${i}"]`);if(t){t.classList.remove("is-playing");t.querySelector(".video-stage").innerHTML=`<div id="player-${i}"></div>`;}}
const icons=[ '<rect x="2" y="3" width="8" height="5"/><rect x="14" y="6" width="8" height="5"/><rect x="5" y="15" width="10" height="6"/>','<path d="M1 5h22M1 12h22M1 19h22"/>','<ellipse cx="12" cy="12" rx="10" ry="7"/><circle cx="12" cy="12" r="2"/>','<path d="m2 8 10-5 10 5-10 5zM2 13l10 5 10-5M2 18l10 5 10-5"/>','<rect x="2" y="3" width="11" height="8"/><rect x="15" y="3" width="7" height="12"/><rect x="2" y="13" width="11" height="8"/><path d="M15 17h7v4h-7z"/>' ];
const labels=['Constelación libre','Corrientes de trailers','Órbita de trailers','Constelación en profundidad','Mosaico continuo'];
const controls=document.createElement('nav');controls.className='constellation-controls';controls.setAttribute('aria-label','Variaciones de constelación');controls.innerHTML=MODES.map((m,i)=>`<button data-mode="${m}" aria-label="${labels[i]}" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true">${icons[i]}</svg></button>`).join('')+'<i></i><button data-action="reset" aria-label="Centrar constelación"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="6"/><path d="M12 1v5m0 12v5M1 12h5m12 0h5"/></svg></button><button data-action="zoom-out" aria-label="Alejar"><svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg></button><button data-action="zoom-in" aria-label="Acercar"><svg viewBox="0 0 24 24"><path d="M5 12h14M12 5v14"/></svg></button>';
controls.innerHTML='';document.body.append(controls);controls.append(motion);
const days=document.createElement('nav');days.className='screening-days';days.setAttribute('aria-label','Cartelera de Xoco');
const tomorrow=()=>{const d=new Date(today()+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10);};
const venues=[['003','Xoco'],['002','Churubusco'],['001','Chapultepec']];
function updateDays(){days.innerHTML=`<div class="venue-tabs">${venues.map(([id,name])=>`<button data-venue="${id}" aria-pressed="${sede===id}">${name}</button>`).join('')}</div>`;}
days.onclick=e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.venue)sede=b.dataset.venue;pan={x:0,y:0};zoom=1;const u=new URL(location.href);u.searchParams.set('fecha',date);u.searchParams.set('sede',sede);history.replaceState(null,'',u);updateDays();render();wall.scrollTop=0;};
document.body.append(days);updateDays();
const atlas=document.createElement('div');atlas.className='moving-atlas';wall.append(atlas);
function render(){
 generation++;deadlines.forEach(clearTimeout);deadlines.clear();loading.clear();ready.clear();stalled.clear();
 observer?.disconnect();players.forEach(p=>p.destroy?.());players.clear();visible.clear();
 const grouped=new Map();for(const f of data.funciones){if(f.sede!==sede||f.fecha!==date)continue;const p=data.peliculas[f.pelicula];if(!p?.trailer)continue;if(!grouped.has(f.pelicula))grouped.set(f.pelicula,{p,times:new Set(),rooms:new Set()});const r=grouped.get(f.pelicula);f.horarios.forEach(h=>r.times.add(h));if(f.sala)r.rooms.add(f.sala);}
 items=[...grouped.values()].sort((a,b)=>(Number(b.p.votos)||0)-(Number(a.p.votos)||0)||a.p.titulo.localeCompare(b.p.titulo));

 atlas.innerHTML=items.map((r,i)=>`<button class="tile" data-index="${i}" aria-label="Ver ficha de ${esc(r.p.titulo)}"><div class="video-stage"><div id="player-${i}"></div></div><span class="loading-orbit" aria-hidden="true"></span></button>`).join('');
 if(!items.length){atlas.innerHTML='<p class="empty-state">No hay trailers disponibles para esta sede y fecha.</p>';updateMotion();return;}
 layout();observer=new IntersectionObserver(entries=>{for(const e of entries){const i=+e.target.dataset.index;if(e.isIntersecting)visible.add(i);else visible.delete(i);}syncPlayers();},{root:wall,rootMargin:'0px',threshold:0});atlas.querySelectorAll('.tile').forEach(t=>observer.observe(t));updateMotion();
}
function layout(){
 mode='ribbons';document.body.dataset.view=mode;controls.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));
 const W=innerWidth,H=innerHeight,mobile=W<700,unit=mobile?W*.56:W*.29;
 atlas.querySelectorAll('.tile:not(.failed)').forEach((t,i)=>{
 let x=0,y=0,w=unit,h=unit*.57,r=0,z=1;const col=i%4,row=Math.floor(i/4);
 if(mode==='scatter'){w=unit*(i%5===0?1.25:.87);h=w*.59;x=(col-1.45)*unit*1.16+(row%2)*unit*.35;y=(row-1.5)*unit*.81;r=[-5,3,-2,5][i%4];}
 if(mode==='ribbons'){w=mobile?W*.78:W*.37;h=w*.55;x=(col-1.5)*(w+12)+(row%2)*w*.45;y=(row-1.3)*(h+18);r=row%2?-6:6;}
 if(mode==='orbit'){const ring=i<9?0:1,n=ring?Math.max(1,items.length-9):8,j=ring?i-9:i-1,angle=(j/n)*Math.PI*2;const rx=(mobile?W*.66:W*.36)*(ring?1.95:1),ry=(mobile?H*.32:H*.32)*(ring?1.95:1);w=unit*(i===0?1.12:ring?.82:.85);h=w*.57;x=i===0?-w/2:Math.cos(angle)*rx-w/2;y=i===0?-h/2:Math.sin(angle)*ry-h/2;r=i===0?0:Math.sin(angle)*9;}
 if(mode==='depth'){const scale=[1.25,.72,1,.84][i%4];w=unit*scale;h=w*.62;x=(col-1.5)*unit*1.02+(row%2)*unit*.33;y=(row-1.55)*unit*.75;r=[-8,6,-3,8][i%4];z=Math.round(scale*10);}
 if(mode==='mosaic'){w=mobile?W*.68:W*.34;h=w*.64;x=(col-1.5)*(w+5)+(row%2)*(w*.25);y=(row-1.5)*(h+5);r=0;}
 Object.assign(t.style,{left:`${x}px`,top:`${y}px`,width:`${w}px`,height:`${h}px`,transform:`rotate(${r}deg)`,zIndex:z});
 });applyTransform();
}
function applyTransform(){atlas.style.transform=`translate(${pan.x}px,${pan.y}px) scale(${zoom})`;}

function syncPlayers(){
 if(!apiReady)return;
 const active=!paused&&!document.hidden&&!dialog.open;
 for(const [i,p] of players){
  if(loading.has(i)&&(!active||!visible.has(i))){discardPlayer(i);continue;}
  if(!ready.has(i))continue;
  const wanted=active&&visible.has(i),state=p.getPlayerState?.();
  if(!wanted&&state!==2)p.pauseVideo();
  else if(wanted&&state!==1&&state!==3){p.mute();p.playVideo();}
 }
 if(!active)return;
 const queue=[...visible].filter(i=>!players.has(i)&&!stalled.has(i)&&!atlas.querySelector(`[data-index="${i}"]`)?.classList.contains('failed'));
 queue.sort((a,b)=>{
  const distance=i=>{const r=atlas.querySelector(`[data-index="${i}"]`).getBoundingClientRect();return Math.hypot(r.x+r.width/2-innerWidth/2,r.y+r.height/2-(wall.getBoundingClientRect().top+wall.clientHeight/2))};
  return distance(a)-distance(b);
 });
 for(const i of queue){
  if(loading.size>=MAX_STARTS)break;
  const r=items[i],t=atlas.querySelector(`[data-index="${i}"]`),epoch=generation;
  if(!r||!t)continue;
  loading.add(i);
  const release=()=>{loading.delete(i);clearTimeout(deadlines.get(i));deadlines.delete(i)};
  const fail=()=>{if(epoch!==generation)return;release();t.classList.remove('is-playing');t.classList.add('failed');players.get(i)?.destroy?.();ready.delete(i);layout();syncPlayers()};
  // A slow connection is not evidence that a trailer is unavailable.
  deadlines.set(i,setTimeout(()=>{if(epoch!==generation||players.get(i)!==player)return;stalled.add(i);discardPlayer(i);t.classList.add('stalled');syncPlayers();},30000));
  const ids=[...new Set([r.p.trailer,...(r.p.trailers||[])])].slice(0,3);let candidate=0;
  const player=new YT.Player('player-'+i,{videoId:ids[0],host:'https://www.youtube-nocookie.com',playerVars:{autoplay:1,mute:1,controls:0,playsinline:1,rel:0,disablekb:1,fs:0,origin:location.origin},events:{
   onReady:e=>{if(epoch!==generation||players.get(i)!==e.target)return;ready.add(i);e.target.mute();const f=e.target.getIframe();f.tabIndex=-1;f.setAttribute('aria-hidden','true');if(!paused&&!document.hidden&&!dialog.open&&visible.has(i))e.target.playVideo();else e.target.pauseVideo();},
   onStateChange:e=>{if(epoch!==generation||players.get(i)!==e.target)return;if(e.data===1){release();t.classList.add('is-playing');syncPlayers();}else{t.classList.remove('is-playing');if(e.data===0&&!paused&&visible.has(i)&&!dialog.open){e.target.seekTo(0,true);e.target.playVideo();}}},
   onError:e=>{if(epoch!==generation||players.get(i)!==e.target)return;if([100,101,150].includes(e.data)&&candidate+1<ids.length){candidate++;e.target.loadVideoById(ids[candidate]);}else fail();},
   onAutoplayBlocked:()=>{if(epoch!==generation)return;paused=true;updateMotion();}
  }});players.set(i,player);
 }
}
window.onYouTubeIframeAPIReady=()=>{apiReady=true;syncPlayers();};
function updateMotion(){document.body.classList.toggle('paused',paused);motion.setAttribute('aria-label',paused?'Reproducir trailers':'Pausar trailers');motion.removeAttribute('title');motion.innerHTML=paused?'<svg viewBox="0 0 24 24"><path d="m8 5 11 7-11 7z"/></svg>':'<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></svg>';syncPlayers();}
motion.onclick=()=>{paused=!paused;stalled.clear();atlas.querySelectorAll('.stalled').forEach(t=>t.classList.remove('stalled'));updateMotion();};
wall.addEventListener('pointerdown',e=>{if(e.isPrimary===false||e.button!==0)return;suppressClick=false;drag={id:e.pointerId,x:e.clientX,y:e.clientY,ox:pan.x,oy:pan.y,moved:false};});
window.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.id)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.hypot(dx,dy)>8)drag.moved=true;if(drag.moved){pan={x:Math.max(-2400,Math.min(2400,drag.ox+dx)),y:Math.max(-2000,Math.min(2000,drag.oy+dy))};applyTransform();}});
window.addEventListener('pointerup',e=>{if(!drag||e.pointerId!==drag.id)return;suppressClick=!!drag.moved;drag=null;});window.addEventListener('pointercancel',()=>drag=null);
wall.addEventListener('wheel',e=>{e.preventDefault();if(e.ctrlKey){zoom=Math.max(.5,Math.min(1.8,zoom-e.deltaY*.004));}else{pan.x-=e.deltaX;pan.y-=e.deltaY;}applyTransform();},{passive:false});
window.addEventListener('keydown',e=>{if(dialog.open||!e.key.startsWith('Arrow'))return;e.preventDefault();pan.x+=e.key==='ArrowRight'?-130:e.key==='ArrowLeft'?130:0;pan.y+=e.key==='ArrowDown'?-130:e.key==='ArrowUp'?130:0;applyTransform();});
window.addEventListener('resize',layout);
function openCard(i){const r=items[i],p=r.p;opened=wall.querySelector('[data-index="'+i+'"]');const venue=data.sedes.find(s=>s.id===sede)?.nombre||'Cineteca';
 document.querySelector('#detail-content').innerHTML=`<div class="detail-video"><iframe src="https://www.youtube-nocookie.com/embed/${esc(p.trailer)}?autoplay=1&mute=1&playsinline=1&rel=0" title="Tráiler de ${esc(p.titulo)}" allow="autoplay; encrypted-media; picture-in-picture" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div><div class="panel"><h2 id="film-title">${esc(p.titulo)}${p.tituloOriginal?`<span class="orig">${esc(p.tituloOriginal)}</span>`:''}</h2>${p.sinopsis?`<p class="sinopsis">${esc(p.sinopsis)}</p>`:''}<dl class="dl"><div><dt>Dirección</dt><dd>${esc(p.director)||'—'}</dd></div><div><dt>País y año</dt><dd>${esc(p.pais)} · ${esc(p.ano)}</dd></div><div><dt>Duración</dt><dd>${esc(p.duracion)} min</dd></div><div><dt>Sede${r.rooms.size?' · Sala':''}</dt><dd>${esc(venue)}${r.rooms.size?' · '+esc([...r.rooms].join(' · ')):''}</dd></div></dl><p class="date-label">${esc(new Intl.DateTimeFormat('es-MX',{dateStyle:'full',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z')))}</p><div class="times">${[...r.times].sort().map(h=>`<span class="badge">${esc(h)}</span>`).join('')}</div>${p.critica!=null?`<div class="scores">Crítica <strong>${esc(p.critica)}%</strong></div>`:''}${p.publico!=null?`<div class="scores"><span>${esc(p.publicoFuente||'Público')} rating</span> <strong>${Number(p.publico).toFixed(1)}</strong><span> · ${Number(p.votos||0).toLocaleString('es-MX')} votos</span></div>`:''}<hr class="sep">${p.resenas?.length?`<div class="quotes">${p.resenas.map(x=>`<blockquote>“${esc(x.texto)}”<cite>${x.url?`<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.autor)}</a>`:esc(x.autor)}</cite></blockquote>`).join('')}</div>`:'<p class="rt">Sin reseñas disponibles para esta película.</p>'}<div class="links"><a href="${esc(p.urlCineteca)}" target="_blank" rel="noopener">Ficha en Cineteca ↗</a>${p.urlImdb?`<a href="${esc(p.urlImdb)}" target="_blank" rel="noopener">IMDb ↗</a>`:''}</div><p class="source-note">Cartelera de Aura · Actualizada ${esc(new Intl.DateTimeFormat('es-MX',{dateStyle:'short',timeStyle:'short',timeZone:'America/Mexico_City'}).format(new Date(data.generadoEn)))}. Confirma las funciones en Cineteca.</p><p class="source-note">Information courtesy of IMDb (https://www.imdb.com). Used with permission. · Datos de películas de TMDB.</p></div>`;
 dialog.showModal();dialog.scrollTop=0;syncPlayers();}
wall.onclick=e=>{const t=e.target.closest('.tile');if(t&&(!suppressClick||e.detail===0))openCard(+t.dataset.index);};
document.querySelector('.close').onclick=()=>dialog.close();dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});dialog.addEventListener('close',()=>{document.querySelector('#detail-content').innerHTML='';opened?.focus({preventScroll:true});syncPlayers();});document.addEventListener('visibilitychange',syncPlayers);
let pendingData=null;
function acceptData(d){
 const stamp=new Date(d?.generadoEn);const stale=!Number.isFinite(stamp.getTime())||new Intl.DateTimeFormat('en-CA',{timeZone:'America/Mexico_City'}).format(stamp)<today();
 document.querySelector('#schedule-status').textContent=stale?'Cartelera sin actualizar. Confirma los horarios en Cineteca.':'';
if(!d?.peliculas||!Array.isArray(d.sedes)||!Array.isArray(d.funciones)||!d.funciones.length||d.generadoEn===data.generadoEn)return;if(dialog.open){pendingData=d;return;}const previous=items.map(r=>[r.p.filmId,r.p.trailer]);data=d;const upcoming=[...new Set(d.funciones.filter(f=>f.sede===sede&&f.fecha===date&&d.peliculas[f.pelicula]?.trailer).map(f=>f.pelicula))];if(upcoming.length===items.length&&previous.every(([id,trailer])=>upcoming.includes(id)&&d.peliculas[id]?.trailer===trailer)){for(const r of items){r.p=d.peliculas[r.p.filmId];const fs=d.funciones.filter(f=>f.pelicula===r.p.filmId&&f.sede===sede&&f.fecha===date);r.times=new Set(fs.flatMap(f=>f.horarios));r.rooms=new Set(fs.map(f=>f.sala).filter(Boolean));}}else render();}
dialog.addEventListener("close",()=>{if(pendingData){const d=pendingData;pendingData=null;acceptData(d);}});
wall.setAttribute('aria-busy','true');const script=document.createElement('script');script.src='https://www.youtube.com/iframe_api';document.head.append(script);
fetch(location.hostname==='127.0.0.1'||location.hostname==='localhost'?'https://aura-connectivity-test.hectorcflores.chatgpt.site/data/cartelera.json':'./data/cartelera.json',{cache:'no-store',signal:AbortSignal.timeout(10000)}).then(r=>{if(!r.ok)throw Error();return r.json()}).then(d=>{acceptData(d);wall.removeAttribute('aria-busy');}).catch(()=>{wall.removeAttribute('aria-busy');atlas.innerHTML='<button class="schedule-retry" onclick="location.reload()">Reintentar cartelera</button>';});
