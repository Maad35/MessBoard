(function(root,factory){var value=factory();root.ImageCrop=value;if(typeof module==='object'&&module.exports)module.exports=value;})(this,function(){
 'use strict';
 var MIN_SPAN=.001;
 function finite(value){return typeof value==='number'&&isFinite(value);}
 function valid(crop){
  if(!crop||typeof crop!=='object'||Array.isArray(crop))return false;
  var keys=['left','top','right','bottom'];
  for(var i=0;i<keys.length;i++)if(!finite(crop[keys[i]])||crop[keys[i]]<0)return false;
  return crop.left+crop.right<=1-MIN_SPAN&&crop.top+crop.bottom<=1-MIN_SPAN;
 }
 function empty(){return{left:0,top:0,right:0,bottom:0};}
 function copy(crop){return{left:crop.left,top:crop.top,right:crop.right,bottom:crop.bottom};}
 function validRect(item){return item&&finite(item.x)&&finite(item.y)&&finite(item.width)&&finite(item.height)&&item.width>0&&item.height>0&&finite(item.rotation);}
 // Coordinates are normalized in the unrotated full source rectangle.
 function worldPoint(rect,point){
  var angle=rect.rotation*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),dx=(point.x-.5)*rect.width,dy=(point.y-.5)*rect.height;
  return{x:rect.x+rect.width/2+c*dx-s*dy,y:rect.y+rect.height/2+s*dx+c*dy};
 }
 function localPoint(rect,point){
  var angle=rect.rotation*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),dx=point.x-rect.x-rect.width/2,dy=point.y-rect.y-rect.height/2;
  return{x:.5+(c*dx+s*dy)/rect.width,y:.5+(-s*dx+c*dy)/rect.height};
 }
 function full(item){
  if(!validRect(item))return null;
  var crop=item.crop===undefined?empty():item.crop;if(!valid(crop))return null;
  var width=item.width/(1-crop.left-crop.right),height=item.height/(1-crop.top-crop.bottom);
  var angle=item.rotation*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),dx=(crop.right-crop.left)*width/2,dy=(crop.bottom-crop.top)*height/2;
  var rect={x:item.x+item.width/2+c*dx-s*dy-width/2,y:item.y+item.height/2+s*dx+c*dy-height/2,width:width,height:height,rotation:item.rotation};
  return validRect(rect)?rect:null;
 }
 function apply(item,crop){
  if(!valid(crop))return null;var rect=full(item);if(!rect)return null;
  var width=rect.width*(1-crop.left-crop.right),height=rect.height*(1-crop.top-crop.bottom);
  var center=worldPoint(rect,{x:(1+crop.left-crop.right)/2,y:(1+crop.top-crop.bottom)/2});
  var patch={x:center.x-width/2,y:center.y-height/2,width:width,height:height,crop:copy(crop)};
  return finite(patch.x)&&finite(patch.y)&&finite(width)&&finite(height)&&width>0&&height>0?patch:null;
 }
 function clamp(value,min,max){return Math.max(min,Math.min(max,value));}
 function drag(crop,handle,dx,dy){
  if(!valid(crop)||!finite(dx)||!finite(dy)||!/^(move|n|ne|e|se|s|sw|w|nw)$/.test(handle))return null;
  var next=copy(crop);
  if(handle==='move'){
   dx=clamp(dx,-crop.left,crop.right);dy=clamp(dy,-crop.top,crop.bottom);
   next.left+=dx;next.right-=dx;next.top+=dy;next.bottom-=dy;
  }else{
   if(handle.indexOf('w')>=0)next.left=clamp(crop.left+dx,0,1-MIN_SPAN-crop.right);
   if(handle.indexOf('e')>=0)next.right=clamp(crop.right-dx,0,1-MIN_SPAN-crop.left);
   if(handle.indexOf('n')>=0)next.top=clamp(crop.top+dy,0,1-MIN_SPAN-crop.bottom);
   if(handle.indexOf('s')>=0)next.bottom=clamp(crop.bottom-dy,0,1-MIN_SPAN-crop.top);
  }
  // Subtraction/addition at the minimum can round one ulp beyond the limit.
  if(next.left+next.right>1-MIN_SPAN)next.left=Math.max(0,1-MIN_SPAN-next.right-1e-12);
  if(next.top+next.bottom>1-MIN_SPAN)next.top=Math.max(0,1-MIN_SPAN-next.bottom-1e-12);
  return next;
 }
 return{MIN_SPAN:MIN_SPAN,valid:valid,empty:empty,copy:copy,full:full,apply:apply,worldPoint:worldPoint,localPoint:localPoint,drag:drag};
});
