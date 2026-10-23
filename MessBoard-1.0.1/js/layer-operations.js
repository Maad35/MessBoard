(function(root,factory){var value=factory();root.LayerOperations=value;if(typeof module==='object'&&module.exports)module.exports=value;})(this,function(){
 'use strict';
 function validName(value){return typeof value==='string'&&value.length<=128&&!/[\u0000-\u001f\u007f-\u009f]/.test(value);}
 function label(item){
  if(validName(item.name)&&item.name.trim())return item.name.trim();
  return item.type==='note'?(item.text||'Empty note').slice(0,40):item.type==='image'?String(item.path).replace(/\\/g,'/').split('/').pop():item.type==='link'?(item.title||item.url):'Drawing';
 }
 function descriptor(kind,id,items,depth,selection){
  var hidden=0,locked=0,selected=0;
  for(var i=0;i<items.length;i++){
   if(items[i].hidden)hidden++;if(items[i].locked)locked++;if(selection.indexOf(items[i].id)>=0)selected++;
  }
  var row={key:kind+':'+id,kind:kind,id:id,items:items,depth:depth,label:kind==='group'?'Group':label(items[0]),hidden:hidden===items.length,locked:locked===items.length,mixedHidden:hidden>0&&hidden<items.length,mixedLocked:locked>0&&locked<items.length,selected:selected>0,partialSelected:selected>0&&selected<items.length};
  if(kind==='group')row.expanded=true;
  return row;
 }
 function matches(item,query){return !query||[label(item),item.type,item.path||'',item.url||''].join('\n').toLowerCase().indexOf(query)>=0;}
 function rows(board,query,collapsed){
  query=typeof query==='string'?query.trim().toLowerCase():'';collapsed=collapsed||Object.create(null);
  var front=board.items.slice().reverse(),groups=Object.create(null),seen=Object.create(null),out=[],i,item;
  for(i=0;i<front.length;i++){
   item=front[i];if(item.groupId){if(!groups[item.groupId])groups[item.groupId]=[];groups[item.groupId].push(item);}
  }
  for(i=0;i<front.length;i++){
   item=front[i];
   if(item.groupId){
    if(seen[item.groupId])continue;seen[item.groupId]=true;
    var members=groups[item.groupId],header=descriptor('group',item.groupId,members,0,board.selection);
    var headerMatch=!query||header.label.toLowerCase().indexOf(query)>=0;
    var children=members.filter(function(member){return headerMatch||matches(member,query);});
    if(!children.length)continue;
    header.expanded=!!query||!(Object.prototype.hasOwnProperty.call(collapsed,item.groupId)&&collapsed[item.groupId]===true);
    out.push(header);
    if(header.expanded)for(var j=0;j<children.length;j++)out.push(descriptor('item',children[j].id,[children[j]],1,board.selection));
   }else if(matches(item,query))out.push(descriptor('item',item.id,[item],0,board.selection));
  }
  return out;
 }
 function rename(board,id,value){
  if(board.transaction||!validName(value))return false;
  var item=board.getItem(id),name=value.trim();
  if(!item||item.locked||(name&&item.name===name)||(!name&&!Object.prototype.hasOwnProperty.call(item,'name')))return false;
  board.beginTransaction();
  if(name)item.name=name;else delete item.name;
  return board.commitTransaction();
 }
 function move(board,ids,targetId,position){
  if(board.transaction||!Array.isArray(ids)||!ids.length||(position!=='before'&&position!=='after'))return false;
  var target=board.getItem(targetId),chosen=Object.create(null),groups=Object.create(null),scope=board.editingGroup,i,item;
  if(!target||target.hidden||target.locked||(scope&&target.groupId!==scope))return false;
  for(i=0;i<ids.length;i++){
   item=board.getItem(ids[i]);if(!item||chosen[ids[i]]||item.hidden||item.locked||(scope&&item.groupId!==scope))return false;chosen[ids[i]]=true;
   if(item.groupId)groups[item.groupId]=true;
  }
  if(!scope)for(i=0;i<board.items.length;i++){
   item=board.items[i];if(item.groupId&&groups[item.groupId])chosen[item.id]=true;
  }
  if(chosen[targetId])return false;
  var stack=board.items.filter(function(item){return !scope||item.groupId===scope;});
  var moving=stack.filter(function(item){return chosen[item.id];});
  var rest=stack.filter(function(item){return !chosen[item.id];});
  var targets=rest.filter(function(item){return !scope&&target.groupId?item.groupId===target.groupId:item===target;});
  if(moving.concat(targets).some(function(item){return item.hidden||item.locked;}))return false;
  // Storage is back-to-front: visible "before" inserts after the target block.
  var index=position==='before'?rest.indexOf(targets[targets.length-1])+1:rest.indexOf(targets[0]);
  var ordered=rest.slice(0,index).concat(moving,rest.slice(index)),cursor=0;
  // Group editing reuses only the group's existing absolute stack slots.
  var next=scope?board.items.map(function(item){return item.groupId===scope?ordered[cursor++]:item;}):ordered;
  if(next.every(function(item,index){return item===board.items[index];}))return false;
  board.beginTransaction();board.items=next;board.normalizeZ();return board.commitTransaction();
 }
 function setFlag(board,ids,key,value){
  if(board.transaction||!Array.isArray(ids)||!ids.length||(key!=='hidden'&&key!=='locked')||typeof value!=='boolean')return false;
  var items=[],i,item;
  for(i=0;i<ids.length;i++){
   item=board.getItem(ids[i]);if(!item)return false;
   if(!!item[key]!==value&&items.indexOf(item)<0)items.push(item);
  }
  if(!items.length)return false;
  if(key==='hidden')return board.setItemsHidden(ids,value);
  board.beginTransaction();
  for(i=0;i<items.length;i++)items[i].locked=value;
  return board.commitTransaction();
 }
 return {label:label,rows:rows,rename:rename,move:move,setFlag:setFlag};
});
