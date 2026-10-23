/* Pure note presentation helpers; never normalize stored board data on read. */
(function(root,factory){var value=factory();root.NoteStyle=value;if(typeof module==='object'&&module.exports)module.exports=value;})(this,function(){
 'use strict';
 function family(value){
  if(typeof value!=='string'||/[\u0000-\u001f\u007f-\u009f]/.test(value))return 'Segoe UI';
  value=value.trim();return value.length&&value.length<=128?value:'Segoe UI';
 }
 function cssFamily(value){return '"'+family(value).replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'", sans-serif';}
 function size(value){return typeof value==='number'&&isFinite(value)&&value>0?value:18;}
 function align(value){return /^(?:left|center|right|justify)$/.test(value)?value:'left';}
 function lineHeight(value){return typeof value==='number'&&isFinite(value)?Math.max(.8,Math.min(3,Math.round(value*100)/100)):1.35;}
 function letterSpacing(value){return typeof value==='number'&&isFinite(value)?Math.max(-5,Math.min(20,Math.round(value*10)/10)):0;}
 function paragraphSpacing(value){return typeof value==='number'&&isFinite(value)?Math.max(0,Math.min(96,Math.round(value))):0;}
 function valign(value){return /^(?:top|middle|bottom)$/.test(value)?value:'top';}
 function bold(value){return value===true;}
 function italic(value){return value===true;}
 function underline(value){return value===true;}
 function padding(value){return typeof value==='number'&&isFinite(value)?Math.max(0,Math.min(64,Math.round(value))):30;}
 function cornerRadius(value){return typeof value==='number'&&isFinite(value)?Math.max(0,Math.min(64,Math.round(value))):0;}
 function textOrientation(value){return value==='vertical'?'vertical':'horizontal';}
 function color(value,fallback){
  if(typeof value!=='string'||!/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value))return fallback;
  value=value.toLowerCase();return value.length===4?'#'+value[1]+value[1]+value[2]+value[2]+value[3]+value[3]:value;
 }
 function font(item){item=item||{};return size(item.fontSize)+'px '+cssFamily(item.fontFamily);}
 function style(item){item=item||{};return{fontFamily:family(item.fontFamily),fontSize:size(item.fontSize),color:color(item.color,'#eee8da'),background:item.background===null?null:color(item.background,'#292a25'),align:align(item.align),lineHeight:lineHeight(item.lineHeight),letterSpacing:letterSpacing(item.letterSpacing),paragraphSpacing:paragraphSpacing(item.paragraphSpacing),valign:valign(item.valign),bold:bold(item.bold),italic:italic(item.italic),underline:underline(item.underline),padding:padding(item.padding),cornerRadius:cornerRadius(item.cornerRadius),textOrientation:textOrientation(item.textOrientation)};}
 return{family:family,cssFamily:cssFamily,font:font,style:style,align:align,lineHeight:lineHeight,letterSpacing:letterSpacing,paragraphSpacing:paragraphSpacing,valign:valign,bold:bold,italic:italic,underline:underline,padding:padding,cornerRadius:cornerRadius,textOrientation:textOrientation};
});