(function(root,factory){var value=factory();root.AEWorkflow=value;if(typeof module==='object'&&module.exports)module.exports=value;})(this,function(){
 'use strict';
 function clone(x){return JSON.parse(JSON.stringify(x));}
 function prepareSend(items,context,mode){
  if(!context||!context.comp)throw new Error('Open an active composition in After Effects first.');
  var available=items.filter(function(i){return !i.hidden&&(i.type==='image'||(i.type==='link'&&i.provider==='local')||i.type==='note');});
  if(!available.length)throw new Error('Select at least one visible image, local video, or note.');
  if(available.some(function(i){return i.missing;}))throw new Error('Relink the missing selected references before sending.');
  if(mode!=='actual'&&mode!=='fit')throw new Error('Choose a supported layout size.');
  var sorted=available.map(function(i,index){return{item:i,index:index};}).sort(function(a,b){return a.item.z-b.item.z||a.index-b.index;});
  return{skipped:items.length-available.length,payload:{compId:context.comp.id,projectPath:context.projectPath||'',sessionToken:context.sessionToken||'',mode:mode,items:sorted.map(function(entry){var i=entry.item;var out={id:i.id,type:i.type,x:i.x,y:i.y,width:i.width,height:i.height,rotation:i.rotation,opacity:i.opacity===undefined?1:i.opacity,z:i.z};if(i.type==='note'){out.text=i._sendText!==undefined?i._sendText:(i.text||'');}else{out.path=i.path;out.crop=i.crop?clone(i.crop):null;}return out;})}};
 }
 return{prepareSend:prepareSend};
});
