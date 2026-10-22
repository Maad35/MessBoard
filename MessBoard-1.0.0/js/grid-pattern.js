(function(root,factory){var value=factory();root.GridPattern=value;if(typeof module==='object'&&module.exports){module.exports=value;}})(this,function(){
 function layers(gridSize,zoom,opacity){
  var step=gridSize,cell=step*zoom;
  // Adjacent powers of two always share the same world-space origin.
  while(cell<24){step*=2;cell*=2;}
  while(cell>=48){step/=2;cell/=2;}
  // Keep the exact world-to-screen scale. Rounding the repeated tile creates a
  // per-cell error that accumulates with distance from the origin, making the
  // grid slide relative to board objects while zooming. The browser may raster
  // each fractional line to nearby pixels, but its geometric phase stays exact.
  var t=Math.log(cell/24)/Math.LN2;
  t=Math.max(0,Math.min(1,t));
  var fade=t*t*(3-2*t),fineAlpha=opacity*fade;
  // The child generation lives at the exact midpoint of the parent period.
  // It never paints the parent boundary, so both generations can be rasterized
  // from one shared tile without independently rounded phases.
  return[
   {step:cell/2,cell:cell/2,period:cell,offset:cell/2,alpha:fineAlpha},
   {step:cell,cell:cell,period:cell,offset:0,alpha:opacity}
  ];
 }
 return{layers:layers};
});
