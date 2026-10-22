/* Pure source-space drawing geometry; never prepares saved strokes on read. */
(function(root,factory){var style=root.DrawingStyle,path=root.DrawingPath;if(!style&&typeof require==='function')style=require('./drawing-style.js');if(!path&&typeof require==='function')path=require('./drawing-path.js');var value=factory(style,path);root.DrawingGeometry=value;if(typeof module==='object'&&module.exports)module.exports=value;}(this,function(Style,Path){
 'use strict';
 function clone(value){return JSON.parse(JSON.stringify(value));}
 function stroke(tool,points,style,tolerance){
  if(!/^(pen|line|rect|roundrect|ellipse|triangle|diamond|star)$/.test(tool))return null;
  var p=Path.prepare(points,tool==='pen'?tolerance:0);if(!p.length)return null;
  var s=Style.upgrade({tool:tool,color:style&&style.color},style);if(!Style.valid(s))return null;
  var a=p[0],b=p[p.length-1];
  if(tool==='pen'){s.points=p;s.smoothing=1;s.arrowTangentVersion=1;s.arrowTangentSpan=(typeof tolerance==='number'&&isFinite(tolerance)&&tolerance>=0?tolerance:0.5)*16;}
  else if(tool==='line'){if(a[0]===b[0]&&a[1]===b[1])return null;s.points=[a,b];}
  else{
   var x=Math.min(a[0],b[0]),y=Math.min(a[1],b[1]),w=Math.abs(a[0]-b[0]),h=Math.abs(a[1]-b[1]);if(!w||!h||!isFinite(w)||!isFinite(h))return null;
   if(tool==='ellipse'){s.cx=x+w/2;s.cy=y+h/2;s.rx=w/2;s.ry=h/2;}
   else{s.x=x;s.y=y;s.w=w;s.h=h;}
  }
  return s;
 }
 function command(type,x,y,cx,cy){var c={type:type,x:x,y:y};if(type==='Q'){c.cx=cx;c.cy=cy;}return c;}
 function polygon(points){return points.map(function(p,i){return command(i?'L':'M',p[0],p[1]);}).concat([{type:'Z'}]);}
 function shape(s,r){
  var x=s.x,y=s.y,w=s.w,h=s.h;
  if(s.tool==='ellipse')return [command('M',s.cx+s.rx,s.cy),{type:'E',cx:s.cx,cy:s.cy,rx:s.rx,ry:s.ry},{type:'Z'}];
  if(s.tool==='triangle')return polygon([[x+w/2,y],[x+w,y+h],[x,y+h]]);
  if(s.tool==='diamond')return polygon([[x+w/2,y],[x+w,y+h/2],[x+w/2,y+h],[x,y+h/2]]);
  if(s.tool==='star'){
   var p=[],minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
   for(var i=0;i<10;i++){var a=-Math.PI/2+i*Math.PI/5,v=i%2?0.45:1,px=Math.cos(a)*v,py=Math.sin(a)*v;p.push([px,py]);minX=Math.min(minX,px);maxX=Math.max(maxX,px);minY=Math.min(minY,py);maxY=Math.max(maxY,py);}
   return polygon(p.map(function(q){return [x+(q[0]-minX)/(maxX-minX)*w,y+(q[1]-minY)/(maxY-minY)*h];}));
  }
  if(s.tool==='roundrect'&&r)return [command('M',x+r,y),command('L',x+w-r,y),command('Q',x+w,y+r,x+w,y),command('L',x+w,y+h-r),command('Q',x+w-r,y+h,x+w,y+h),command('L',x+r,y+h),command('Q',x,y+h-r,x,y+h),command('L',x,y+r),command('Q',x+r,y,x,y),{type:'Z'}];
  return polygon([[x,y],[x+w,y],[x+w,y+h],[x,y+h]]);
 }
 function point(c){return [c.x,c.y];}
 function lerp(a,b,t){return [a[0]*(1-t)+b[0]*t,a[1]*(1-t)+b[1]*t];}
 function distance(a,b){return Math.hypot(b[0]-a[0],b[1]-a[1]);}
 function at(seg,t){return seg.c?lerp(lerp(seg.a,seg.c,t),lerp(seg.c,seg.b,t),t):lerp(seg.a,seg.b,t);}
 function segments(commands){
  var out=[],a;
  commands.forEach(function(c){if(c.type==='M'){a=point(c);return;}var seg={a:a,b:point(c),c:c.type==='Q'?[c.cx,c.cy]:null,table:[0],length:0},prev=a,n=seg.c?24:1;
   for(var i=1;i<=n;i++){var p=at(seg,i/n);seg.length+=distance(prev,p);seg.table.push(seg.length);prev=p;}
   if(seg.length>0)out.push(seg);a=seg.b;
  });return out;
 }
 function timeAt(seg,length){
  if(length<=0)return 0;if(length>=seg.length)return 1;
  for(var i=1;i<seg.table.length;i++)if(seg.table[i]>=length){var before=seg.table[i-1];return (i-1+(length-before)/(seg.table[i]-before))/(seg.table.length-1);}
  return 1;
 }
 function trim(segs,start,end){
  var out=[],position=0;
  segs.forEach(function(seg){var low=Math.max(0,start-position),high=Math.min(seg.length,end-position);position+=seg.length;if(high<=low)return;
   var t0=timeAt(seg,low),t1=timeAt(seg,high),a=at(seg,t0),b=at(seg,t1);
   if(!out.length)out.push(command('M',a[0],a[1]));
   if(seg.c){var derivative=lerp([seg.c[0]-seg.a[0],seg.c[1]-seg.a[1]],[seg.b[0]-seg.c[0],seg.b[1]-seg.c[1]],t0);out.push(command('Q',b[0],b[1],a[0]+(t1-t0)*derivative[0],a[1]+(t1-t0)*derivative[1]));}
   else out.push(command('L',b[0],b[1]));
  });return out;
 }
 // A short spatial chord rejects noisy last-sample tangents while keeping
 // the tip exact. Repeated motion inside the same radius cannot consume the
 // window. Opt-in metadata keeps existing saved arrows unchanged.
 function terminalInside(segs,start,span){
  var index=start?0:segs.length-1,step=start?1:-1,tip=start?segs[0].a:segs[index].b,furthest=tip,maxDistance=0;
  for(;index>=0&&index<segs.length;index+=step){var seg=segs[index];
   var samples=seg.table.length-1,previous=start?0:1;
   for(var j=1;j<=samples;j++){
    var t=start?j/samples:1-j/samples,p=at(seg,t),length=distance(tip,p);
    // Stop at a meaningful local turn instead of crossing back through the
    // tip to the older, opposite branch of a hairpin. Tiny jitter cannot arm
    // this guard, even after arbitrarily many stationary pointer samples.
    if(maxDistance>=span/2&&(length<maxDistance*0.75||(p[0]-tip[0])*(furthest[0]-tip[0])+(p[1]-tip[1])*(furthest[1]-tip[1])<=0))return furthest;
    if(length>=span){
     var low=previous,high=t;
     for(var k=0;k<12;k++){var mid=(low+high)/2;if(distance(tip,at(seg,mid))<span)low=mid;else high=mid;}
     return at(seg,high);
    }
    if(length>maxDistance){maxDistance=length;furthest=p;}previous=t;
   }
  }
  return furthest;
 }
 function head(seg,start,length,inside){
  var tip=start?seg.a:seg.b;inside=inside||seg.c|| (start?seg.b:seg.a);
  if(distance(tip,inside)===0)inside=start?seg.b:seg.a;
  var magnitude=distance(tip,inside),ux=(inside[0]-tip[0])/magnitude,uy=(inside[1]-tip[1])/magnitude;
  var bx=tip[0]+ux*length,by=tip[1]+uy*length,half=length/2;
  return [tip.slice(),[bx-uy*half,by+ux*half],[bx+uy*half,by-ux*half]];
 }
 // An arc-length inset is not an intersection with a tangent-aligned head.
 // Keep the original trimmed curve, joining only its exposed end to the neck.
 // The neck lies behind the tip by more than the round-cap radius.
 function joinHead(commands,triangle,start,width){
  if(!commands.length)return;
  var tip=triangle[0],base=lerp(triangle[1],triangle[2],0.5),length=distance(tip,base),ux=(base[0]-tip[0])/length,uy=(base[1]-tip[1])/length;
  var c=start?commands[0]:commands[commands.length-1],dx=c.x-tip[0],dy=c.y-tip[1],axial=dx*ux+dy*uy,side=Math.abs(dx*uy-dy*ux),radius=width/2;
  if(axial>radius&&axial<=length&&side<=axial/2)return;
  var inset=Math.max(length*0.65,radius+Math.min(radius,length)*0.1),neck=[tip[0]+ux*inset,tip[1]+uy*inset];
  if(start){commands[0]=command('L',c.x,c.y);commands.unshift(command('M',neck[0],neck[1]));}
  else commands.push(command('L',neck[0],neck[1]));
 }
 function describe(s){
  var style=Style.resolve(s),d={style:style,commands:[],heads:[],dash:style.pattern==='dashed'?[style.width*style.dashLength,style.width*style.dashGap]:style.pattern==='dotted'?[0,style.width*3]:[],radius:0};
  if(!/^(pen|line)$/.test(s.tool)){d.radius=s.tool==='roundrect'?Math.min(style.radius,s.w/2,s.h/2):0;d.commands=shape(s,d.radius);d.closed=true;return d;}
  d.commands=Path.commands(s);var segs=segments(d.commands),total=0;segs.forEach(function(seg){total+=seg.length;});
  if(!segs.length){if(d.commands.length)d.dot=point(d.commands[0]);d.commands=[];return d;}
  var start=style.arrow==='start'||style.arrow==='both',end=style.arrow==='end'||style.arrow==='both';
  if(start||end){
   var length=Math.min(style.width*4*style.arrowSize,total/(start&&end?2:1));
   var stable=s.tool==='pen'&&s.arrowTangentVersion===1,span=Math.min(total,Math.max(length/2,s.arrowTangentSpan||0));
   if(start)d.heads.push(head(segs[0],true,length,stable?terminalInside(segs,true,span):null));if(end)d.heads.push(head(segs[segs.length-1],false,length,stable?terminalInside(segs,false,span):null));
   // Very short straight double arrows already meet at their bases. Curved
   // heads need a shaft; clamp its render-only width to their available neck.
   var headsOnly=s.tool==='line'&&segs.length===1&&start&&end&&length*2>=total&&style.width*1.2>=total;
   style.width=Math.min(style.width,length*0.4);
   var inset=length*0.65;d.commands=headsOnly?[]:trim(segs,start?inset:0,total-(end?inset:0));
   if(start)joinHead(d.commands,d.heads[0],true,style.width);
   if(end)joinHead(d.commands,d.heads[d.heads.length-1],false,style.width);
  }
  return d;
 }
 function bounds(s){
  var b={minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity};
  var points=s.points||[];
  if(s.tool==='ellipse')points=[[s.cx-s.rx,s.cy-s.ry],[s.cx+s.rx,s.cy+s.ry]];
  else if(!/^(pen|line)$/.test(s.tool))points=[[s.x,s.y],[s.x+s.w,s.y+s.h]];
  points.forEach(function(p){b.minX=Math.min(b.minX,p[0]);b.minY=Math.min(b.minY,p[1]);b.maxX=Math.max(b.maxX,p[0]);b.maxY=Math.max(b.maxY,p[1]);});
  var style=Style.resolve(s),pad=style.outlineEnabled?style.width/2:0;
  b={minX:b.minX-pad,minY:b.minY-pad,maxX:b.maxX+pad,maxY:b.maxY+pad};
  if(s.appearanceVersion===2){
   var d=describe(s);
   d.heads.forEach(function(head){head.forEach(function(p){b.minX=Math.min(b.minX,p[0]);b.minY=Math.min(b.minY,p[1]);b.maxX=Math.max(b.maxX,p[0]);b.maxY=Math.max(b.maxY,p[1]);});});
   if(d.heads.length)d.commands.forEach(function(c){
    b.minX=Math.min(b.minX,c.x-pad);b.minY=Math.min(b.minY,c.y-pad);b.maxX=Math.max(b.maxX,c.x+pad);b.maxY=Math.max(b.maxY,c.y+pad);
   });
  }
  else if(s.style==='arrow'&&s.points&&s.points.length>1){
   var end=s.points[s.points.length-1],previous=s.points[s.points.length-2],angle=Math.atan2(end[1]-previous[1],end[0]-previous[0]),length=Math.max(10,s.width*4);
   [-1,1].forEach(function(sign){var x=end[0]-Math.cos(angle+sign*Math.PI/6)*length,y=end[1]-Math.sin(angle+sign*Math.PI/6)*length;b.minX=Math.min(b.minX,x);b.minY=Math.min(b.minY,y);b.maxX=Math.max(b.maxX,x);b.maxY=Math.max(b.maxY,y);});
  }
  return b;
 }
 function translate(s,x,y){
  if(s.points)s.points=s.points.map(function(p){return [p[0]+x,p[1]+y];});
  if(s.tool==='ellipse'){s.cx+=x;s.cy+=y;}
  else if(!/^(pen|line)$/.test(s.tool)){s.x+=x;s.y+=y;}
  return s;
 }
 function createItem(tool,points,style,tolerance){
  var s=stroke(tool,points,style,tolerance);if(!s)return null;
  var b=bounds(s),width=Math.max(20,b.maxX-b.minX),height=Math.max(20,b.maxY-b.minY);
  var x=b.minX-(width-(b.maxX-b.minX))/2,y=b.minY-(height-(b.maxY-b.minY))/2;
  return {x:x,y:y,width:width,height:height,sourceWidth:width,sourceHeight:height,strokes:[translate(s,-x,-y)]};
 }
 function restyle(item,patch){
  if(!item||!Array.isArray(item.strokes)||!patch||typeof patch!=='object')return null;
  var next=clone(item),changed=false,invalid=false;
  next.strokes=next.strokes.map(function(s){
   var view=Style.resolve(s),applicable={},isPath=/^(pen|line)$/.test(s.tool);
   Object.keys(patch).forEach(function(key){
    if(!Object.prototype.hasOwnProperty.call(view,key)||key==='appearanceVersion')return;
    if(isPath&&/^(fillEnabled|fillColor|outlineEnabled|radius)$/.test(key))return;
    if(!isPath&&/^(arrow|arrowSize)$/.test(key))return;
    if(key==='radius'&&s.tool!=='roundrect')return;
    if(view[key]!==patch[key])applicable[key]=patch[key];
   });
   if(!Object.keys(applicable).length)return s;
   changed=true;var upgraded=Style.upgrade(s,applicable);if(!Style.valid(upgraded))invalid=true;return upgraded;
  });
  if(invalid)return null;if(!changed)return next;
  var sw=item.sourceWidth||item.width,sh=item.sourceHeight||item.height,sx=item.width/sw,sy=item.height/sh;
  // Seed from the first stroke's real bounds, then union the rest. Seeding from
  // the old frame (0..sourceWidth) only ever grows the bounds — shrinking the
  // stroke width could never shrink the item back and the outline floated
  // outside the shape edge.
  var b=null;
  next.strokes.forEach(function(s){var r=bounds(s);if(!b){b=r;return;}b.minX=Math.min(b.minX,r.minX);b.minY=Math.min(b.minY,r.minY);b.maxX=Math.max(b.maxX,r.maxX);b.maxY=Math.max(b.maxY,r.maxY);});
  if(!b)b={minX:0,minY:0,maxX:sw,maxY:sh};
  next.sourceWidth=b.maxX-b.minX;next.sourceHeight=b.maxY-b.minY;
  next.width=next.sourceWidth*sx;next.height=next.sourceHeight*sy;
  var dx=(b.minX+b.maxX-sw)*sx/2,dy=(b.minY+b.maxY-sh)*sy/2,a=(item.rotation||0)*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
  next.x=item.x+item.width/2+c*dx-s*dy-next.width/2;next.y=item.y+item.height/2+s*dx+c*dy-next.height/2;
  next.strokes.forEach(function(stroke){translate(stroke,-b.minX,-b.minY);});
  return next;
 }
 return {stroke:stroke,createItem:createItem,bounds:bounds,describe:describe,restyle:restyle};
}));
