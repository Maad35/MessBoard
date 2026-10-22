/* Versioned appearance. Resolving is an editor view, never a migration. */
(function(root,factory){var value=factory();root.DrawingStyle=value;if(typeof module==='object'&&module.exports)module.exports=value;}(this,function(){
 'use strict';
 var fields=['color','width','pattern','arrow','arrowSize','dashLength','dashGap','fillEnabled','fillColor','outlineEnabled','radius'];
 var namedColors=('aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood '+
  'cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet '+
  'deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon '+
  'lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin '+
  'navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato transparent turquoise violet wheat white whitesmoke yellow yellowgreen').split(' ');
 function clone(value){return JSON.parse(JSON.stringify(value));}
 function resolve(stroke){
  var s=stroke||{},modern=s.appearanceVersion===2;
  var out={appearanceVersion:2,color:'#e6a43c',width:3,pattern:modern?'solid':s.style==='dotted'?'dotted':'solid',arrow:modern?'none':s.style==='arrow'?'end':'none',arrowSize:1,dashLength:4,dashGap:2,fillEnabled:false,fillColor:s.color===undefined?'#e6a43c':s.color,outlineEnabled:true,radius:12};
  fields.forEach(function(key){if(s[key]!==undefined&&(modern||key==='color'||key==='width'))out[key]=s[key];});
  return clone(out);
 }
 function upgrade(stroke,patch){var out=clone(stroke||{}),style=resolve(stroke);fields.forEach(function(key){if(patch&&patch[key]!==undefined)style[key]=clone(patch[key]);});Object.keys(style).forEach(function(key){out[key]=style[key];});delete out.style;return out;}
 function finite(value){return typeof value==='number'&&isFinite(value);}
 function color(value){
  if(typeof value!=='string')return false;
  if(namedColors.indexOf(value.toLowerCase())!==-1||/^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value))return true;
  // Portable comma notation only: RGB channels share units; alpha is 0..1.
  var match=/^(rgb|rgba)\(([^()]*)\)$/i.exec(value);
  if(!match)return false;
  var parts=match[2].split(','),percent;
  if(parts.length!==(match[1].toLowerCase()==='rgba'?4:3))return false;
  for(var i=0;i<parts.length;i++){
   var part=/^[ \t\r\n\f]*([+\-]?(?:\d*\.)?\d+)(%?)[ \t\r\n\f]*$/.exec(parts[i]);
   if(!part)return false;
   var isPercent=part[2]==='%',number=Number(part[1]);
   if(i===0)percent=isPercent;
   if(i<3&&isPercent!==percent||i===3&&isPercent)return false;
   if(!finite(number)||number<0||number>(i===3?1:isPercent?100:255))return false;
  }
  return true;
 }
 function valid(stroke){
  if(!stroke||stroke.appearanceVersion!==2)return false;
  if(stroke.arrowTangentVersion!==undefined&&(stroke.arrowTangentVersion!==1||!finite(stroke.arrowTangentSpan)||stroke.arrowTangentSpan<0))return false;
  if(stroke.arrowTangentSpan!==undefined&&stroke.arrowTangentVersion!==1)return false;
  var s=resolve(stroke);
  if(!color(s.color)||!color(s.fillColor)||!finite(s.width)||s.width<=0)return false;
  if(typeof s.pattern!=='string'||!/^(solid|dashed|dotted)$/.test(s.pattern)||typeof s.arrow!=='string'||!/^(none|start|end|both)$/.test(s.arrow))return false;
  if(!finite(s.arrowSize)||s.arrowSize<=0||!finite(s.dashLength)||s.dashLength<=0||!finite(s.dashGap)||s.dashGap<=0||!finite(s.radius)||s.radius<0)return false;
  if(typeof s.fillEnabled!=='boolean'||typeof s.outlineEnabled!=='boolean'||(!s.fillEnabled&&!s.outlineEnabled))return false;
  if(/^(pen|line)$/.test(stroke.tool)&&!s.outlineEnabled)return false;
  return true;
 }
 return {resolve:resolve,upgrade:upgrade,valid:valid};
}));
