/* Shared editor command availability. Operations remain owned by the board/app. */
(function(root){
 'use strict';
 var canvas=['add','paste','paste-items','text','draw','shape','erase','fit','grid','canvas-settings','capture','ae-tools','items'];
 var labels={add:'Add files…',paste:'Paste clipboard', 'paste-items':'Paste items',text:'Text',draw:'Draw',shape:'Shape',erase:'Erase drawings & shapes',copy:'Copy items',duplicate:'Duplicate',delete:'Delete selection',group:'Group',ungroup:'Ungroup','enter-group':'Edit group contents','exit-group':'Exit group',lock:'Lock selection',hide:'Hide selection',front:'Bring to front',forward:'Bring forward',backward:'Send backward',back:'Send to back',arrange:'Arrange selection…',properties:'Properties…','edit-note':'Edit text','note-settings':'Text properties…','edit-drawing':'Edit appearance…',crop:'Crop image…','copy-image':'Copy image to clipboard',relink:'Relink image…','reveal-source':'Show in Explorer',play:'Play',stop:'Stop','open-link':'Open in browser',capture:'Capture AE frame','ae-tools':'AE tools…',send:'Send selected to AE',replace:'Replace in AE','extract-colors':'Extract colors…',save:'Save board',open:'Open board…',recover:'Recover autosave',fit:'Fit board',grid:'Hide grid','canvas-settings':'Canvas settings…',items:'Board items…','focus-selection':'Focus selection','select-all':'Select all',deselect:'Deselect all'};
 labels['import-board']='Import board into canvas…';
 function arrangement(board){
  var seen=Object.create(null),n=0;
  board.transformableItems().forEach(function(item){var key=item.groupId&&!board.editingGroup?'g:'+item.groupId:'i:'+item.id;if(!seen[key]){seen[key]=true;n++;}});
  return{units:n,align:n>=2,distribute:n>=3,match:n>=2,layout:n>=2};
 }
 function state(name,board,context){
  context=context||{};var items=board.selectedItems(),one=items.length===1?items[0]:null,has=items.length>0,movable=board.transformableItems(),editable=!!one&&!one.hidden&&!one.locked&&movable.indexOf(one)>=0&&(!one.groupId||board.editingGroup===one.groupId),group=items.length&&items[0].groupId&&items.every(function(i){return i.groupId===items[0].groupId;}),known=Object.prototype.hasOwnProperty.call(labels,name),enabled=known,visible=known,label=labels[name]||'';
  var localSource=!!one&&((one.type==='image'&&!!one.path)||(one.type==='link'&&one.provider==='local'&&!!one.path));
  var sendable=items.some(function(i){return !i.hidden&&(i.type==='image'||(i.type==='link'&&i.provider==='local')||i.type==='note');});
  var rules={copy:has,duplicate:has,delete:has,group:items.length>1&&!board.editingGroup,ungroup:items.some(function(i){return !!i.groupId;}),'enter-group':!!group&&!board.editingGroup,'exit-group':!!board.editingGroup,lock:has,hide:items.some(function(i){return !i.hidden;}),front:has,forward:has,backward:has,back:has,send:sendable,replace:sendable,'extract-colors':function(b){var s=b.selectedItems();return s.length===1&&s[0].type==='image'&&!s[0].hidden;},crop:editable&&one.type==='image'&&!one.missing,'copy-image':!!one&&one.type==='image'&&!one.missing,relink:editable&&one.type==='image','reveal-source':localSource&&!(one.type==='image'&&one.missing),'edit-note':editable&&one.type==='note','note-settings':editable&&one.type==='note','edit-drawing':editable&&one.type==='drawing',play:!!one&&one.type==='link'&&one.mediaType==='video',stop:!!one&&one.type==='link'&&!!context.playing,'open-link':!!one&&one.type==='link'&&one.provider!=='local','focus-selection':items.some(function(i){return !i.hidden;}),'select-all':board.items.some(function(i){return !i.hidden;}),deselect:has,'paste-items':!!context.clipboard};
  if(rules[name]!==undefined)enabled=rules[name];
  if(name==='reveal-source'){visible=localSource;label=context.sourceLabel||labels[name];}
  else if(['send','replace','extract-colors','crop','copy-image','relink','edit-note','note-settings','edit-drawing','play','stop','open-link','enter-group','exit-group'].indexOf(name)>=0)visible=enabled;
  if(context.canvas===true)visible=canvas.indexOf(name)>=0;
  else if(context.canvas===false&&['text','draw','shape','erase','add','canvas-settings','save','open','recover'].indexOf(name)>=0)visible=false;
  if(name==='lock')label=has&&items.every(function(i){return i.locked;})?'Unlock selection':'Lock selection';
  if(name==='grid')label=context.gridVisible===false?'Show grid':'Hide grid';
  if(context.hasBoard===false&&['open'].indexOf(name)<0)enabled=false;
  if(context.busy)enabled=false;
  return{visible:visible,enabled:enabled,label:label};
 }
 function run(name,board,context,dispatch){var s=state(name,board,context);if(!s.enabled)return false;dispatch(name);return true;}
 root.EditorCommands={state:state,arrangement:arrangement,run:run};if(typeof module==='object'&&module.exports)module.exports=root.EditorCommands;
}(this));
