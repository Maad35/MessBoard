/* Pen input stabilization: a One Euro filter (Casiez et al.) over raw
 * pointer samples. The cutoff rises with speed, so slow strokes shed
 * hand jitter while fast strokes keep tracking the hand. Strength is
 * the panel's 0..100 Smoothing value; 0 disables the filter entirely
 * (create returns null and callers keep the raw point stream). */
(function(root,factory){var value=factory();root.StrokeFilter=value;if(typeof module==='object'&&module.exports)module.exports=value;}(this,function(){
 'use strict';
 var DCUTOFF=1; // Hz, for the derivative estimate; the classic default.
 function alpha(cutoff,dt){var tau=1/(2*Math.PI*cutoff);return 1/(1+tau/dt);}
 function create(strength,x,y,t){
  var s=Number(strength);
  if(!isFinite(s)||s<=0)return null;
  s=Math.min(100,s);
  // Strength maps exponentially: gentle at the low end, rope-like at 100.
  var minCutoff=9*Math.pow(0.8/9,s/100);   // 9 Hz at 0 .. 0.8 Hz at 100
  var beta=0.03+0.09*(s/100);              // speed sensitivity (board units)
  var xHat=x,yHat=y,dxHat=0,dyHat=0,lastT=t;
  function add(nx,ny,nt){
   if(!isFinite(nx)||!isFinite(ny))return [xHat,yHat];
   var dt=(nt-lastT)/1000;
   if(!(dt>0))return [xHat,yHat];
   if(dt>0.1)dt=0.1; // a stall must not freeze the stroke; beta catches up
   var ad=alpha(DCUTOFF,dt);
   dxHat+=ad*((nx-xHat)/dt-dxHat);
   dyHat+=ad*((ny-yHat)/dt-dyHat);
   xHat+=alpha(minCutoff+beta*Math.abs(dxHat),dt)*(nx-xHat);
   yHat+=alpha(minCutoff+beta*Math.abs(dyHat),dt)*(ny-yHat);
   lastT=nt;
   return [xHat,yHat];
  }
  return {add:add};
 }
 return {create:create};
}));
