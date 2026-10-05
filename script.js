'use strict';
const scene = document.querySelector('.scene');
const world = document.querySelector('#world');
const canvas = document.querySelector('#water');
const ctx = canvas.getContext('2d');
const hitContext=document.createElement('canvas').getContext('2d');
const $ = id => document.getElementById(id);
const islands = [...document.querySelectorAll('.island')];
const W=1200,H=800,CELL=8,COLS=W/CELL,ROWS=H/CELL;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const camera={x:600,y:400,tx:600,ty:400,scale:1};
let routes=[],selected=-1,nextId=1,editing=false,start=null,paused=reduced,last=0;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const mix=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
const message=text=>$('status').textContent=text;
const obstacles=islands.map(el=>{
  const svg=el.querySelector('svg'), vb=svg.viewBox.baseVal;
  const scale=el.offsetWidth/vb.width;
  const path=new Path2D();
  path.addPath(new Path2D(el.querySelector('path').getAttribute('d')),
    new DOMMatrix([scale,0,0,scale,el.offsetLeft,el.offsetTop]));
  return path;
});
function blocked(p,margin=14){
  if(p.x<margin||p.y<margin||p.x>W-margin||p.y>H-margin)return true;
  hitContext.lineWidth=margin*2;
  return obstacles.some(path=>hitContext.isPointInPath(path,p.x,p.y)||
    (margin>0&&hitContext.isPointInStroke(path,p.x,p.y)));
}
function clearLine(a,b,margin=14){
  const steps=Math.max(1,Math.ceil(distance(a,b)/3));
  for(let i=0;i<=steps;i++)if(blocked(mix(a,b,i/steps),margin))return false;
  return true;
}
const cellPoint=i=>({x:(i%COLS)*CELL+CELL/2,y:Math.floor(i/COLS)*CELL+CELL/2});
const grid=Uint8Array.from({length:COLS*ROWS},(_,i)=>blocked(cellPoint(i),26)?1:0);
class Heap{
  constructor(){this.a=[];}
  push(item){let i=this.a.length;this.a.push(item);while(i){const p=(i-1)>>1;if(this.a[p].f<=item.f)break;this.a[i]=this.a[p];i=p;}this.a[i]=item;}
  pop(){const root=this.a[0],tail=this.a.pop();if(this.a.length){let i=0;while(i*2+1<this.a.length){let j=i*2+1;if(j+1<this.a.length&&this.a[j+1].f<this.a[j].f)j++;if(this.a[j].f>=tail.f)break;this.a[i]=this.a[j];i=j;}this.a[i]=tail;}return root;}
}
function nearestCell(p){
  let best=-1,d=Infinity;
  const cx=Math.floor(p.x/CELL),cy=Math.floor(p.y/CELL);
  for(let y=cy-3;y<=cy+3;y++)for(let x=cx-3;x<=cx+3;x++){
    if(x<0||y<0||x>=COLS||y>=ROWS)continue;
    const i=y*COLS+x,q=cellPoint(i),v=distance(p,q);
    if(!grid[i]&&v<d&&clearLine(p,q)){best=i;d=v;}
  }
  return best;
}
function plan(a,b){
  if(blocked(a)||blocked(b)||distance(a,b)<24)return null;
  if(clearLine(a,b))return [a,b];
  const from=nearestCell(a),to=nearestCell(b);
  if(from<0||to<0)return null;
  const costs=new Float64Array(grid.length).fill(Infinity);
  const parent=new Int32Array(grid.length).fill(-1),closed=new Uint8Array(grid.length);
  const heap=new Heap();costs[from]=0;heap.push({i:from,f:distance(cellPoint(from),b)});
  const dirs=[[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
  while(heap.a.length){
    const {i}=heap.pop();if(closed[i])continue;
    if(i===to){
      const path=[b];let n=i;while(n!==-1){path.push(cellPoint(n));n=parent[n];}path.push(a);path.reverse();
      const simple=[a];let k=0;
      while(k<path.length-1){let j=path.length-1;while(j>k+1&&!clearLine(path[k],path[j],26))j--;simple.push(path[j]);k=j;}
      return smooth(simple);
    }
    closed[i]=1;const x=i%COLS,y=Math.floor(i/COLS);
    for(const [dx,dy] of dirs){
      const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=COLS||ny>=ROWS)continue;
      const j=ny*COLS+nx;if(grid[j]||closed[j])continue;
      if(dx&&dy&&(grid[y*COLS+nx]||grid[ny*COLS+x]))continue;
      const g=costs[i]+CELL*Math.hypot(dx,dy);
      if(g<costs[j]){costs[j]=g;parent[j]=i;heap.push({i:j,f:g+distance(cellPoint(j),cellPoint(to))});}
    }
  }
  return null;
}
function smooth(points){
  const result=[points[0]];
  for(let i=1;i<points.length-1;i++){
    const a=points[i-1],b=points[i],c=points[i+1];
    const radius=Math.min(45,distance(a,b)*.25,distance(b,c)*.25);
    const entry=mix(b,a,radius/distance(a,b)),exit=mix(b,c,radius/distance(b,c));
    const curve=[];
    for(let j=0;j<=24;j++){const t=j/24;curve.push({x:(1-t)**2*entry.x+2*(1-t)*t*b.x+t*t*exit.x,y:(1-t)**2*entry.y+2*(1-t)*t*b.y+t*t*exit.y});}
    if(curve.every((p,j)=>!blocked(p)&&(!j||clearLine(curve[j-1],p))))result.push(...curve);
    else result.push(b);
  }
  result.push(points.at(-1));
  return result.every((p,i)=>!i||clearLine(result[i-1],p))?result:points;
}
function measure(route){
  route.lengths=[0];for(let i=1;i<route.points.length;i++)route.lengths.push(route.lengths[i-1]+distance(route.points[i-1],route.points[i]));
  route.length=route.lengths.at(-1);route.phase=0;
}
function at(route,d){
  d=Math.max(0,Math.min(d,route.length));
  let lo=1,hi=route.lengths.length-1;
  while(lo<hi){const mid=(lo+hi)>>1;if(route.lengths[mid]<d)lo=mid+1;else hi=mid;}
  const a=route.points[lo-1],b=route.points[lo];
  const p=mix(a,b,(d-route.lengths[lo-1])/(route.lengths[lo]-route.lengths[lo-1]||1));
  p.angle=Math.atan2(b.y-a.y,b.x-a.x);return p;
}
function letter(id){let n=id,text="";do{text=String.fromCharCode(65+n%26)+text;n=Math.floor(n/26)-1;}while(n>=0);return text;}
function endpointLabel(id,end=0){return `${letter(Math.floor(id/13))}${(id%13)*2+1+end}`;}
function routeName(r){return `${endpointLabel(r.id)}–${endpointLabel(r.id,1)}`;}
const easeOut=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
function endLength(r){return Math.min(r.length*.42,Math.max(100,r.width*1.8));}
function endFade(r,p){
  const length=endLength(r);if(distance(p,r.b)>length*1.7)return 1;
  let best=Infinity,progress=0;
  for(let i=1;i<r.points.length;i++){
    const a=r.points[i-1],b=r.points[i],dx=b.x-a.x,dy=b.y-a.y;
    const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));
    const q=mix(a,b,t),d=distance(p,q);
    if(d<best){best=d;progress=r.lengths[i-1]+t*(r.lengths[i]-r.lengths[i-1]);}
  }
  return easeOut((r.length-progress)/length);
}
function freeId(){let id=0;while(routes.some(r=>r.id===id))id++;return id;}
function save(){try{localStorage.setItem('island-currents-v2',JSON.stringify(routes.map(({id,a,b,speed,width,strength})=>({id,a,b,speed,width,strength}))));}catch{}}
function updateUI(){
  $('routes').replaceChildren(...routes.map(r=>new Option(routeName(r),String(r.id),false,r.id===selected)));
  const route=routes.find(r=>r.id===selected);
  for(const id of ['routes','speed','width','strength','reverse','delete'])$(id).disabled=!route;
  $('speed').value=route?route.speed:35;
  $('speed-value').textContent=`${route?route.speed:35} map px/s`;
  $('width').value=route?.width??70;$('width-value').textContent=`${route?.width??70} map px`;
  $('strength').value=route?.strength??1;$('strength-value').textContent=(route?.strength??1).toFixed(2);
  $('add').textContent=editing?'Cancel':' + Add current';
  $('add').setAttribute('aria-pressed',String(editing));
  scene.classList.toggle('editing',editing);
  $('pause').textContent=paused?'Play':'Pause';$('pause').setAttribute('aria-pressed',String(paused));
}
function cancel(){editing=false;start=null;updateUI();}
$('add').onclick=()=>{if(editing){cancel();message('Cancelled.');}else{editing=true;start=null;updateUI();message('Choose a start point in the water. Esc to cancel.');}};
$('routes').onchange=()=>{selected=Number($('routes').value);updateUI();};
$('speed').oninput=()=>{const r=routes.find(r=>r.id===selected);if(r){r.speed=Number($('speed').value);$('speed-value').textContent=`${r.speed} map px/s`;save();rebuildField();}};
$('reverse').onclick=()=>{const r=routes.find(r=>r.id===selected);if(r){[r.a,r.b]=[r.b,r.a];r.points.reverse();measure(r);save();rebuildField();message(`${routeName(r)}: direction reversed.`);}};
$('delete').onclick=()=>{routes=routes.filter(r=>r.id!==selected);selected=routes.at(-1)?.id??-1;save();rebuildField();updateUI();message('Current deleted. Its endpoint numbers are available again.');};
$('pause').onclick=()=>{paused=!paused;updateUI();};
$('overview').onclick=()=>{camera.tx=600;camera.ty=400;};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&editing){cancel();message('Cancelled.');}});
islands.forEach((island,i)=>island.addEventListener('click',e=>{
  if(editing)return;e.stopPropagation();
  camera.tx=i?252:650;camera.ty=i?240:380;
  islands.forEach((el,j)=>{el.classList.toggle('active',i===j);el.setAttribute('aria-pressed',String(i===j));});
}));
function mapPoint(e){const r=world.getBoundingClientRect();return{x:(e.clientX-r.left)/camera.scale,y:(e.clientY-r.top)/camera.scale};}
world.addEventListener('click',e=>{
  const p=mapPoint(e);
  if(!editing){
    let best=null,d=20;for(const r of routes)for(let k=0;k<=r.length;k+=6){const v=distance(at(r,k),p);if(v<d){d=v;best=r;}}
    if(best){selected=best.id;updateUI();}return;
  }
  if(blocked(p)){message('Choose open water, a little farther from the shore.');return;}
  if(!start){start=p;message('Choose the end point. The current will avoid both islands.');return;}
  if(distance(start,p)<24){message('Choose an end point farther from the start.');return;}
  const points=plan(start,p);
  if(!points){message('No clear route found. Choose another end point.');return;}
  const route={id:freeId(),a:start,b:p,points,speed:35,width:70,strength:1};measure(route);routes.push(route);selected=route.id;
  cancel();save();rebuildField();message(`${routeName(route)} created. Adjust speed, width and strength below.`);
});
const fx=new Float32Array(grid.length),fy=new Float32Array(grid.length),wet=new Float32Array(grid.length);
const solid=Uint8Array.from({length:grid.length},(_,i)=>blocked(cellPoint(i),4)?1:0);
let tracers=[],flowTime=0,fieldPending=false;
const washCanvas=document.createElement('canvas');washCanvas.width=COLS;washCanvas.height=ROWS;
const washContext=washCanvas.getContext('2d');
const trailCanvas=document.createElement('canvas');trailCanvas.width=W;trailCanvas.height=H;
const ink=trailCanvas.getContext('2d');
for(const name of ['width','strength'])$(name).oninput=()=>{
  const r=routes.find(r=>r.id===selected);if(!r)return;
  r[name]=Number($(name).value);
  $(`${name}-value`).textContent=name==='width'?`${r.width} map px`:r.strength.toFixed(2);
  save();if(!fieldPending){fieldPending=true;requestAnimationFrame(()=>{fieldPending=false;rebuildField();});}
};
function isSolid(x,y){
  if(x<5||y<5||x>W-5||y>H-5)return true;
  return !!solid[Math.floor(y/CELL)*COLS+Math.floor(x/CELL)];
}
function rebuildField(){
  fx.fill(0);fy.fill(0);wet.fill(0);
  const contributions=[];
  for(const r of routes){
    const vx=new Float32Array(grid.length),vy=new Float32Array(grid.length),weights=new Float32Array(grid.length);
    const nearest=new Float32Array(grid.length).fill(Infinity);
    const radius=r.width*.5;
    for(let d=0;d<=r.length;d+=6){
      const p=at(r,d),tx=Math.cos(p.angle),ty=Math.sin(p.angle);
      const taper=easeOut((r.length-d)/endLength(r));
      const range=(radius+10)*(.06+.94*taper);
      for(let y=Math.max(0,Math.floor((p.y-range)/CELL));y<Math.min(ROWS,Math.ceil((p.y+range)/CELL));y++){
        for(let x=Math.max(0,Math.floor((p.x-range)/CELL));x<Math.min(COLS,Math.ceil((p.x+range)/CELL));x++){
          const i=y*COLS+x;if(solid[i])continue;
          const q=cellPoint(i),dx=q.x-p.x,dy=q.y-p.y,dist=Math.hypot(dx,dy);
          if(dist>=range||dist>=nearest[i])continue;
          nearest[i]=dist;
          const edge=Math.max(0,1-dist/range);
          const weight=edge*edge*r.strength*taper;
          weights[i]=r.speed>0?weight:0;
          const cross=dx*(-ty)+dy*tx;
          const speed=r.speed*(.1+.9*taper),pull=.22+(1-taper)*.7;
          vx[i]=(tx+ty*cross/Math.max(20,range)*pull)*speed;
          vy[i]=(ty-tx*cross/Math.max(20,range)*pull)*speed;
        }
      }
    }
    contributions.push({vx,vy,weights});
  }
  for(let i=0;i<grid.length;i++){
    if(solid[i])continue;
    let sum=0,energy=0,x=0,y=0,peak=0;
    for(const c of contributions){const w=c.weights[i];sum+=w;peak=Math.max(peak,w);x+=c.vx[i]*w;y+=c.vy[i]*w;energy+=Math.hypot(c.vx[i],c.vy[i])*w;}
    if(sum===0)continue;
    x/=sum;y/=sum;energy/=sum;
    // A shared velocity field merges crossing streams. Opposed streams form lateral shear.
    const conflict=Math.max(0,1-Math.hypot(x,y)/(energy||1));
    if(conflict>.08){
      let dominant=contributions[0],weight=0;
      for(const c of contributions)if(c.weights[i]>weight){weight=c.weights[i];dominant=c;}
      const len=Math.hypot(dominant.vx[i],dominant.vy[i])||1;
      const q=cellPoint(i),side=Math.sin(q.x*.018+q.y*.013)>=0?1:-1;
      x+=-dominant.vy[i]/len*energy*conflict*.6*side;
      y+=dominant.vx[i]/len*energy*conflict*.6*side;
    }
    // Remove the velocity component that points into a nearby solid cell.
    const q=cellPoint(i),probe=14;
    if(isSolid(q.x+Math.sign(x)*probe,q.y))x=0;
    if(isSolid(q.x,q.y+Math.sign(y)*probe))y=0;
    fx[i]=x;fy[i]=y;wet[i]=Math.min(1,peak);
  }
  const wash=washContext.createImageData(COLS,ROWS);
  for(let i=0;i<wet.length;i++){
    wash.data[i*4]=54;wash.data[i*4+1]=94;wash.data[i*4+2]=88;
    wash.data[i*4+3]=Math.round(22*wet[i]);
  }
  washContext.putImageData(wash,0,0);
  tracers=[];ink.clearRect(0,0,W,H);
  for(const r of routes){
    const count=Math.min(180,Math.max(28,Math.floor(r.length*r.width/480)));
    for(let i=0;i<count;i++)tracers.push({...seed(r,true),priority:i/count});
  }
  tracers.sort((a,b)=>a.priority-b.priority);
}
function seed(r,spread=false){
  for(let attempt=0;attempt<15;attempt++){
    const p=at(r,spread?Math.random()*r.length:Math.random()*Math.min(50,r.length));
    const taper=endFade(r,p);
    const offset=(Math.random()-.5)*r.width*.9*(.06+.94*taper);
    const x=p.x-Math.sin(p.angle)*offset,y=p.y+Math.cos(p.angle)*offset;
    if(!isSolid(x,y))return {x,y,owner:r.id,age:Math.random()*5,life:8+Math.random()*14,alpha:.2+Math.random()*.25,size:1.5+Math.random()*1.9};
  }
  return {x:r.a.x,y:r.a.y,owner:r.id,age:0,life:12,alpha:.25,size:.7};
}
function velocity(x,y){
  const gx=Math.max(0,Math.min(COLS-1.001,x/CELL-.5)),gy=Math.max(0,Math.min(ROWS-1.001,y/CELL-.5));
  const ix=Math.floor(gx),iy=Math.floor(gy),tx=gx-ix,ty=gy-iy;
  let vx=0,vy=0,w=0;
  for(let a=0;a<2;a++)for(let b=0;b<2;b++){
    const k=(iy+b)*COLS+ix+a,t=(a?tx:1-tx)*(b?ty:1-ty);
    vx+=fx[k]*t;vy+=fy[k]*t;w+=wet[k]*t;
  }
  return {x:vx,y:vy,w};
}
function marker(p,text,color){
  ctx.fillStyle=color;ctx.beginPath();ctx.roundRect(p.x-18,p.y-12,36,24,12);ctx.fill();
  ctx.fillStyle='#fff';ctx.font='bold 10px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,p.x,p.y);
}
function installTerrain(){
  islands.forEach((island,index)=>{
    const svg=island.querySelector('svg');
    if(svg.querySelector('.terrain-lines'))return;
    const {width,height}=svg.viewBox.baseVal;
    const coast=svg.querySelector('.land').getAttribute('d');
    let lines='';
    for(let row=0;row<11;row++){
      let d='';
      for(let x=-20;x<=width+20;x+=12){
        const y=height*(.08+row*.087)+Math.sin(x/width*7+row*.24)*height*.035+
          Math.sin(x/width*13-row*.18)*height*.012;
        d+=`${x===-20?'M':'L'}${x.toFixed(1)},${y.toFixed(1)} `;
      }
      lines+=`<path d="${d}"/>`;
    }
    svg.insertAdjacentHTML('beforeend',`<defs><clipPath id="terrain-${index}"><path d="${coast}"/></clipPath></defs><g class="terrain-lines" clip-path="url(#terrain-${index})" aria-hidden="true">${lines}</g>`);
  });
}
let echoLayers=null;
function buildEchoLayers(){
  return obstacles.map(path=>{
    const layer=document.createElement('canvas');layer.width=W;layer.height=H;
    const g=layer.getContext('2d');
    for(const radius of [10,22,36]){
      const ring=document.createElement('canvas');ring.width=W;ring.height=H;
      const brush=ring.getContext('2d');
      brush.strokeStyle='#e8efdb';brush.lineJoin='round';brush.lineWidth=radius*2+1.3;brush.stroke(path);
      brush.globalCompositeOperation='destination-out';brush.lineWidth=radius*2;brush.stroke(path);brush.fill(path);
      g.globalAlpha=radius===10?.5:.25;g.drawImage(ring,0,0);
    }
    return layer;
  });
}
function paintPigment(p,r,i){
  const taper=endFade(r,p);
  const life=Math.max(0,Math.min(1,p.age/1.4,(p.life-p.age)/1.8));
  const alpha=life*taper*taper*Math.min(1.2,r.strength)*(p.visibility||0);
  if(alpha<.02)return;
  const length=(i%4===0?115:48+(i%5)*11)*(.3+.7*taper);
  const points=[];let x=p.x,y=p.y;
  // Integrate a flexible brush stroke through the shared field.
  for(let j=0;j<=24;j++){
    const v=velocity(x,y),speed=Math.hypot(v.x,v.y);
    if(speed<.2||v.w<.002||isSolid(x,y))break;
    const nx=-v.y/speed,ny=v.x/speed,t=j/24;
    const wave=Math.sin(t*5-p.age*.85+i*2.3)*Math.sin(Math.PI*t)*2.8;
    points.push({x:x+nx*wave,y:y+ny*wave,nx,ny});
    x-=v.x/speed*length/24;y-=v.y/speed*length/24;
  }
  if(points.length<5)return;
  const edge=(offset,color,thickness)=>{
    const left=[],right=[];
    points.forEach((q,j)=>{
      const t=j/(points.length-1);
      const width=Math.sin(Math.PI*t)**.8*thickness*taper*(.84+.16*Math.sin(t*17+i));
      left.push({x:q.x+q.nx*(offset+width),y:q.y+q.ny*(offset+width)});
      right.push({x:q.x+q.nx*(offset-width),y:q.y+q.ny*(offset-width)});
    });
    ink.beginPath();left.forEach((q,j)=>j?ink.lineTo(q.x,q.y):ink.moveTo(q.x,q.y));
    right.reverse().forEach(q=>ink.lineTo(q.x,q.y));ink.closePath();ink.fillStyle=color;ink.fill();
  };
  edge(0,`rgba(47,89,82,${alpha*.26})`,i%4===0?2.4:1.5);
  edge(2.1,`rgba(247,244,224,${alpha*.66})`,i%4===0?1.9:1.05);
  // Small, intermittent paper gaps suggest dry-brush texture.
  if(i%3===0){
    ink.beginPath();
    points.forEach((q,j)=>{if(j<5||j>14)return;j===5?ink.moveTo(q.x+q.nx*2,q.y+q.ny*2):ink.lineTo(q.x+q.nx*2,q.y+q.ny*2);});
    ink.lineWidth=.55;ink.strokeStyle=`rgba(186,207,197,${alpha*.75})`;ink.stroke();
  }
}
function draw(dt){
  if(!echoLayers)echoLayers=buildEchoLayers();
  ctx.clearRect(0,0,W,H);
  if(!paused&&dt>0)flowTime+=dt;
  echoLayers.forEach((layer,i)=>{ctx.globalAlpha=.2+Math.sin(flowTime*.3+i*2.3)*.05;ctx.drawImage(layer,0,0,W,H);});
  ctx.globalAlpha=1;ink.clearRect(0,0,W,H);
  ink.imageSmoothingEnabled=true;ink.drawImage(washCanvas,0,0,W,H);
  ink.globalCompositeOperation='destination-out';for(const path of obstacles)ink.fill(path);
  ink.globalCompositeOperation='source-over';ctx.drawImage(trailCanvas,0,0,W,H);
  ink.clearRect(0,0,W,H);
  const occupied=new Set();let visible=0;
  const routeMap=new Map(routes.map(r=>[r.id,r]));
  for(let i=0;i<tracers.length;i++){
    const p=tracers[i],r=routeMap.get(p.owner);if(!r||r.strength===0)continue;
    if(!paused&&dt>0&&r.speed>0){
      const v=velocity(p.x,p.y),speed=Math.hypot(v.x,v.y),taper=endFade(r,p);
      let nx=p.x+v.x*dt,ny=p.y+v.y*dt;
      if(isSolid(nx,ny)){
        if(!isSolid(nx,p.y))ny=p.y;else if(!isSolid(p.x,ny))nx=p.x;
        else {tracers[i]=seed(r,true);continue;}
      }
      p.age+=dt;
      if(p.age>p.life||v.w<.004||speed<.3||taper<.006){tracers[i]=seed(r,true);continue;}
      p.x=nx;p.y=ny;
    }
    const cell=`${Math.floor(p.x/60)},${Math.floor(p.y/44)}`;
    const admitted=visible<70&&!occupied.has(cell)&&endFade(r,p)>.05;
    if(admitted){occupied.add(cell);visible++;}
    if(!paused&&dt>0)p.visibility=(p.visibility||0)+((admitted?1:0)-(p.visibility||0))*(1-Math.exp(-dt*7));
    if(p.visibility>.015)paintPigment(p,r,i);
  }
  ink.globalCompositeOperation='destination-out';ink.fillStyle='#000';
  for(const path of obstacles)ink.fill(path);
  ink.globalCompositeOperation='source-over';ctx.drawImage(trailCanvas,0,0,W,H);
  const active=routes.find(r=>r.id===selected);
  if(active){marker(active.a,endpointLabel(active.id),'#34534f');marker(active.b,endpointLabel(active.id,1),'#966945');}
  if(start)marker(start,endpointLabel(freeId()),'#34534f');
}
function updateResolution(){
  const ratio=Math.max(1,Math.min(3,camera.scale*(globalThis.devicePixelRatio||1)));
  const width=Math.round(W*ratio),height=Math.round(H*ratio);
  if(canvas.width!==width||canvas.height!==height){
    canvas.width=width;canvas.height=height;trailCanvas.width=width;trailCanvas.height=height;
    ctx.setTransform(width/W,0,0,height/H,0,0);ink.setTransform(width/W,0,0,height/H,0,0);
  }
}

function resize(){
  const rect=scene.getBoundingClientRect(),panel=document.querySelector('.controls').getBoundingClientRect();
  camera.scale=Math.min((rect.width-24)/W,(rect.height-panel.height-44)/H);
  camera.scale=Math.max(.12,camera.scale);
  updateResolution();
}
function frame(t){
  const dt=last?Math.min((t-last)/1000,.04):0;last=t;
  const k=reduced?1:1-Math.exp(-dt*4);
  camera.x+=(camera.tx-camera.x)*k;camera.y+=(camera.ty-camera.y)*k;
  const available=scene.clientHeight-document.querySelector('.controls').offsetHeight-36;
  world.style.left=`${scene.clientWidth/2}px`;world.style.top=`${available/2}px`;
  world.style.transform=`scale(${camera.scale}) translate(${-camera.x}px,${-camera.y}px)`;
  draw(dt);requestAnimationFrame(frame);
}
try{
  const saved=localStorage.getItem('island-currents-v2');
  const stored=JSON.parse(saved||localStorage.getItem('island-currents-v1')||'[]');
  if(Array.isArray(stored))for(const item of stored.slice(0,40)){
    if(!item.a||!item.b||![item.a.x,item.a.y,item.b.x,item.b.y,item.speed,item.id].every(Number.isFinite))continue;
    const points=plan(item.a,item.b);if(!points)continue;
    const route={...item,id:saved?item.id:freeId(),width:Math.max(20,Math.min(180,Number(item.width)||70)),strength:Number.isFinite(item.strength)?Math.max(0,Math.min(2,item.strength)):1,points,speed:Math.max(0,Math.min(150,item.speed))};measure(route);routes.push(route);nextId=Math.max(nextId,item.id+1);
  }
  selected=routes.at(-1)?.id??-1;
}catch{}
installTerrain();rebuildField();updateUI();resize();addEventListener('resize',resize);requestAnimationFrame(frame);
