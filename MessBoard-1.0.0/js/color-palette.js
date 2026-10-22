(function(root){
 "use strict";
 var MAX_DIM = 80;

 function rgbToHex(r,g,b){
  function h(n){var s=Math.max(0,Math.min(255,Math.round(n))).toString(16);return s.length<2?'0'+s:s;}
  return '#'+h(r)+h(g)+h(b);
 }
 function saturation(r,g,b){
  var mx=Math.max(r,g,b),mn=Math.min(r,g,b);
  return mx===0?0:(mx-mn)/mx;
 }
 function luminance(r,g,b){return 0.299*r+0.587*g+0.114*b;}

 // Median-cut: recursively split the box with the largest channel range
 function medianCut(pixels,depth){
  if(depth<=0||pixels.length<2) return [pixels];
  var rMin=255,rMax=0,gMin=255,gMax=0,bMin=255,bMax=0,i,p;
  for(i=0;i<pixels.length;i++){p=pixels[i];
   if(p[0]<rMin)rMin=p[0]; if(p[0]>rMax)rMax=p[0];
   if(p[1]<gMin)gMin=p[1]; if(p[1]>gMax)gMax=p[1];
   if(p[2]<bMin)bMin=p[2]; if(p[2]>bMax)bMax=p[2];}
  var rR=rMax-rMin,gR=gMax-gMin,bR=bMax-bMin;
  var ch=rR>=gR?(rR>=bR?0:2):(gR>=bR?1:2);
  var sorted=pixels.slice().sort(function(a,b){return a[ch]-b[ch];});
  var mid=Math.floor(sorted.length/2);
  var left=sorted.slice(0,mid),right=sorted.slice(mid);
  if(!left.length||!right.length) return [pixels];
  return medianCut(left,depth-1).concat(medianCut(right,depth-1));
 }

 function extract(imageEl,count){
  count = Math.max(3, Math.min(12, count||8));
  var w = imageEl.naturalWidth||imageEl.width, h = imageEl.naturalHeight||imageEl.height;
  if(!w||!h) return [];
  var scale = Math.min(1, MAX_DIM/Math.max(w,h));
  var cw = Math.max(1,Math.round(w*scale)), ch = Math.max(1,Math.round(h*scale));
  var canvas = document.createElement('canvas');
  canvas.width=cw; canvas.height=ch;
  var ctx = canvas.getContext('2d');
  try{ ctx.drawImage(imageEl,0,0,cw,ch); }catch(e){ return []; }
  var data;
  try{ data = ctx.getImageData(0,0,cw,ch).data; }catch(e){ return []; }
  var pixels=[],i,r,g,b;
  for(i=0;i<data.length;i+=4){
   if(data[i+3]<128) continue;
   r=data[i];g=data[i+1];b=data[i+2];
   // Skip near-black and near-white (usually not useful as "palette")
   var lum=luminance(r,g,b);
   if(lum<12||lum>243) continue;
   pixels.push([r,g,b]);
  }
  if(!pixels.length) return [];
  var depth=Math.ceil(Math.log2(count));
  var boxes=medianCut(pixels,depth);
  // Score boxes: average color, weighted by size and saturation
  var scored=boxes.map(function(box){
   var sr=0,sg=0,sb=0,ss=0,j;
   for(j=0;j<box.length;j++){sr+=box[j][0];sg+=box[j][1];sb+=box[j][2];ss+=saturation(box[j][0],box[j][1],box[j][2]);}
   var n=box.length;
   return {r:sr/n,g:sg/n,b:sb/n,count:n,sat:ss/n};
  });
  // Sort by count boosted by saturation (vibrant colors rank higher)
  scored.sort(function(a,b){return (b.count*(0.5+b.sat))-(a.count*(0.5+a.sat));});
  var result=[],seen={};
  for(i=0;i<scored.length&&result.length<count;i++){
   var hex=rgbToHex(scored[i].r,scored[i].g,scored[i].b);
   if(seen[hex]) continue;
   seen[hex]=true;
   result.push(hex);
  }
  return result;
 }

 function extractFromPath(path,count,done){
  var img=new Image();
  img.onload=function(){ done(extract(img,count)); };
  img.onerror=function(){ done([]); };
  img.src=path;
 }

 root.ColorPalette={extract:extract,extractFromPath:extractFromPath,rgbToHex:rgbToHex};
})(typeof window!=='undefined'?window:globalThis);
if(typeof module!=='undefined'&&module.exports)module.exports=globalThis.ColorPalette;
