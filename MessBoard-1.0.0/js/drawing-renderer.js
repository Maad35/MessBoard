/* One appearance adapter for board/preview SVG and detached Canvas export. */
(function(root,factory){var geometry=root.DrawingGeometry,path=root.DrawingPath,style=root.DrawingStyle;if(!geometry&&typeof require==='function')geometry=require('./drawing-geometry.js');if(!path&&typeof require==='function')path=require('./drawing-path.js');if(!style&&typeof require==='function')style=require('./drawing-style.js');var value=factory(geometry,path,style);root.DrawingRenderer=value;if(typeof module==='object'&&module.exports)module.exports=value;}(this,function(Geometry,Path,Style){
 'use strict';
 function escape(value){return String(value).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
 function legacyHead(s){var p=s.points||[];if(s.style!=='arrow'||p.length<2)return [];
  var end=p[p.length-1],previous=p[p.length-2],angle=Math.atan2(end[1]-previous[1],end[0]-previous[0]),length=Math.max(10,s.width*4);
  return [end,[end[0]-Math.cos(angle-Math.PI/6)*length,end[1]-Math.sin(angle-Math.PI/6)*length],[end[0]-Math.cos(angle+Math.PI/6)*length,end[1]-Math.sin(angle+Math.PI/6)*length]];
 }
 function polygonSVG(p,color){return '<polygon points="'+escape(p.map(function(v){return v.join(',');}).join(' '))+'" fill="'+escape(color)+'"/>';}
 function legacySVG(s){
  var attrs=' fill="none" stroke="'+escape(s.color)+'" stroke-width="'+escape(s.width)+'" stroke-linecap="round" stroke-linejoin="round"'+(s.style==='dotted'?' stroke-dasharray="2 8"':''),out='',p=s.points||[];
  if(s.tool==='pen'||s.tool==='line'){
   if(p.length===1)return '<circle cx="'+escape(p[0][0])+'" cy="'+escape(p[0][1])+'" r="'+escape(s.width/2)+'" fill="'+escape(s.color)+'"/>';
   out='<path d="'+Path.svg(s)+'"'+attrs+'/>';var head=legacyHead(s);if(head.length)out+=polygonSVG(head,s.color);
  }else if(s.tool==='ellipse')out='<ellipse cx="'+escape(s.cx)+'" cy="'+escape(s.cy)+'" rx="'+escape(s.rx)+'" ry="'+escape(s.ry)+'"'+attrs+'/>';
  else out='<rect x="'+escape(s.x)+'" y="'+escape(s.y)+'" width="'+escape(s.w)+'" height="'+escape(s.h)+'"'+attrs+'/>';
  return out;
 }
 function polygonTrace(ctx,p){ctx.moveTo(p[0][0],p[0][1]);for(var i=1;i<p.length;i++)ctx.lineTo(p[i][0],p[i][1]);ctx.closePath();}
 function legacyPaint(ctx,s){
  var points=s.points||[],width=typeof s.width==='number'&&isFinite(s.width)&&s.width>0?s.width:1;
  ctx.strokeStyle=s.color||'#e6a43c';ctx.fillStyle=ctx.strokeStyle;ctx.lineWidth=width;ctx.lineJoin='round';ctx.lineCap='round';ctx.setLineDash(s.style==='dotted'?[2,8]:[]);ctx.beginPath();
  if(s.tool==='pen'||s.tool==='line'){
   if(!points.length)return;Path.trace(ctx,s);
   if(points.length===1){ctx.arc(points[0][0],points[0][1],width/2,0,Math.PI*2);ctx.fill();return;}
  }else if(s.tool==='rect')ctx.rect(s.x,s.y,s.w,s.h);
  else if(s.tool==='ellipse')ctx.ellipse(s.cx,s.cy,Math.abs(s.rx),Math.abs(s.ry),0,0,Math.PI*2);
  ctx.stroke();var head=legacyHead(Object.assign({},s,{width:width}));if(head.length){ctx.setLineDash([]);ctx.beginPath();polygonTrace(ctx,head);ctx.fill();}
 }
 function pathSVG(commands){return commands.map(function(c){
  if(c.type==='Z')return 'Z';
  if(c.type==='Q')return 'Q '+c.cx+' '+c.cy+' '+c.x+' '+c.y;
  if(c.type==='E')return 'A '+c.rx+' '+c.ry+' 0 1 1 '+(c.cx-c.rx)+' '+c.cy+' A '+c.rx+' '+c.ry+' 0 1 1 '+(c.cx+c.rx)+' '+c.cy;
  return c.type+' '+c.x+' '+c.y;
 }).join(' ');}
 function trace(ctx,commands){commands.forEach(function(c){
  if(c.type==='M')ctx.moveTo(c.x,c.y);else if(c.type==='L')ctx.lineTo(c.x,c.y);else if(c.type==='Q')ctx.quadraticCurveTo(c.cx,c.cy,c.x,c.y);
  else if(c.type==='E')ctx.ellipse(c.cx,c.cy,c.rx,c.ry,0,0,Math.PI*2);else if(c.type==='Z')ctx.closePath();
 });}
 function svg(s){
  if(!s)return '';
  if(s.appearanceVersion===undefined)return legacySVG(s);if(!Style.valid(s))return '';
  var d=Geometry.describe(s),style=d.style,out='';
  if(d.dot)return '<circle cx="'+escape(d.dot[0])+'" cy="'+escape(d.dot[1])+'" r="'+style.width/2+'" fill="'+escape(style.color)+'"/>';
  if(d.commands.length)out='<path d="'+escape(pathSVG(d.commands))+'" fill="'+escape(d.closed&&style.fillEnabled?style.fillColor:'none')+'" stroke="'+escape(style.outlineEnabled?style.color:'none')+'" stroke-width="'+style.width+'" stroke-linecap="round" stroke-linejoin="round"'+(style.outlineEnabled&&d.dash.length?' stroke-dasharray="'+d.dash.join(' ')+'"':'')+'/>';
  d.heads.forEach(function(head){out+=polygonSVG(head,style.color);});return out;
 }
 function modernPaint(ctx,s){
  if(!Style.valid(s))return;var d=Geometry.describe(s),style=d.style;
  ctx.lineWidth=style.width;ctx.lineCap='round';ctx.lineJoin='round';ctx.lineDashOffset=0;ctx.strokeStyle=style.color;ctx.fillStyle=style.fillColor;ctx.setLineDash(d.dash);
  if(d.dot){ctx.beginPath();ctx.arc(d.dot[0],d.dot[1],style.width/2,0,Math.PI*2);ctx.fillStyle=style.color;ctx.fill();return;}
  if(d.commands.length){ctx.beginPath();trace(ctx,d.commands);if(d.closed&&style.fillEnabled)ctx.fill();if(style.outlineEnabled)ctx.stroke();}
  ctx.setLineDash([]);ctx.fillStyle=style.color;d.heads.forEach(function(head){ctx.beginPath();polygonTrace(ctx,head);ctx.fill();});
 }
 function paint(ctx,s){if(!s)return;ctx.save();try{if(s.appearanceVersion===undefined)legacyPaint(ctx,s);else modernPaint(ctx,s);}finally{ctx.restore();}}
 return {svg:svg,paint:paint};
}));
