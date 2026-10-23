(function(root,factory){root.BoardUI=factory(root);})(this,function(root){
 'use strict';
 var MIME='application/x-messboard-items',PREFIX='MessBoard items\n';
 function editing(target){return target&&(target.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));}
 // Persisted IDs are literal data; only caller-authored child selectors are CSS.
 function reference(world,id,childSelector){
  var nodes=world.querySelectorAll('.reference');
  for(var i=0;i<nodes.length;i++)if(nodes[i].dataset.id===id)return childSelector?nodes[i].querySelector(childSelector):nodes[i];
  return null;
 }
 function create(hooks){
  var viewport=document.getElementById('viewport'),world=document.getElementById('world'),menu=document.getElementById('contextMenu');
  var box=document.getElementById('selectionBox'),scope=document.getElementById('groupScope'),list=document.getElementById('itemList'),panel=document.getElementById('itemsPanel'),clipboard=null;
  var dirs=['n','s','e','w','nw','ne','sw','se'],listSignature=null;
  var layers=root.LayerOperations;
  if(!layers)throw new Error('BoardUI requires LayerOperations. Load layer-operations.js first.');
  var listBoard=null,collapsed=Object.create(null),query='',rowData=Object.create(null);
  var renameDraft=null,swallowedKeys=Object.create(null),drag=null,dropMark=null,suppressClick=false,scrollFrame=null,rangeAnchor=null;
  var search=document.getElementById('itemsSearch'),clearSearch=document.getElementById('itemsClearSearch'),count=document.getElementById('itemsCount'),status=document.getElementById('itemsStatus');
  var footer=Object.create(null);['itemsRename','itemsUp','itemsDown','itemsGroup','itemsUngroup','itemsDuplicate','itemsDelete','itemsExitGroup','showAllItems'].forEach(function(id){footer[id]=document.getElementById(id);});
  var focusCommand=document.createElement('button');focusCommand.dataset.command='focus-selection';focusCommand.textContent='Focus selection';menu.insertBefore(focusCommand,menu.firstChild);
  dirs.forEach(function(dir){var dot=document.createElement('span');dot.className='handle';dot.dataset.dir=dir;box.appendChild(dot);});
  var memberFrames=[];
  function memberFrame(index){
   var frame=memberFrames[index];
   if(frame)return frame;
   frame=document.createElement('div');frame.className='selection-member-frame';viewport.appendChild(frame);memberFrames[index]=frame;return frame;
  }
  function hideMemberFrames(){for(var i=0;i<memberFrames.length;i++)memberFrames[i].style.display='none';}
  function board(){return hooks.board();}
  function attr(node,key,value){value=String(value);if(node.getAttribute(key)!==value)node.setAttribute(key,value);}
  function text(node,value){if(node&&node.textContent!==value)node.textContent=value;}
  // Only authored SVG reaches innerHTML. Item labels and paths are never markup.
  var icons={eye:'<path d="M2 8s2-5 6-5 6 5 6 5-2 5-6 5-6-5-6-5Z"/><circle cx="8" cy="8" r="2"/>',hidden:'<path d="m2 2 12 12M6 3.4A7 7 0 0 1 14 8l-2 2M10 12.6A7 7 0 0 1 2 8l2-2"/>',lock:'<rect x="4" y="7" width="8" height="7" rx="1"/><path d="M5 7V5a3 3 0 0 1 6 0v2"/>',unlock:'<rect x="4" y="7" width="8" height="7" rx="1"/><path d="M5 7V5a3 3 0 0 1 6 0"/>',chevron:'<path d="m6 4 4 4-4 4"/>',image:'<rect x="2" y="2" width="12" height="12" rx="1"/><circle cx="5" cy="5" r="1"/><path d="m3 12 4-4 3 3 2-2 2 3"/>',note:'<path d="M3 3h10M8 3v10M5 13h6"/>',drawing:'<path d="m8 2 6 6-6 6-6-6Z"/>',link:'<path d="m6 10 4-4M6 5l2-2a3 3 0 0 1 5 5l-2 2M10 11l-2 2a3 3 0 0 1-5-5l2-2"/>',group:'<path d="M2 5V3h5l2 2h5v8H2Z"/>'};
  function icon(node,key){if(node.dataset.icon===key)return;node.innerHTML='<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+icons[key]+'</svg>';node.dataset.icon=key;}
  function thumbnail(node,r){var item=r.items[0],type=r.kind==='group'?'group':item.type,url=type==='image'&&!item.missing&&hooks.imageURL?hooks.imageURL(item):'';
   if(url){if(node.dataset.source!==url){var img=node.querySelector?node.querySelector('img'):null;if(img){attr(img,'src',url);}else{node.textContent='';delete node.dataset.icon;img=document.createElement('img');attr(img,'src',url);attr(img,'alt','');img.draggable=false;node.appendChild(img);img.onerror=function(){if(img.parentNode===node){node.textContent='';icon(node,'image');}};}node.dataset.source=url;}}
   else{if(node.dataset.source){node.textContent='';delete node.dataset.source;delete node.dataset.icon;}icon(node,icons[type]?type:'drawing');}
  }
  function busy(){return !!(board().transaction||(hooks.busy&&hooks.busy()));}
  function ready(){return !panel.hidden&&listBoard===board()&&!busy()&&(!hooks.requireBoard||hooks.requireBoard());}
  function syncOwner(){if(listBoard===board())return;cancelDrag();finishRename(false);listBoard=board();collapsed=Object.create(null);query='';rangeAnchor=null;if(search)search.value='';rowData=Object.create(null);listSignature=null;}
  function finishRename(commit,focus){
   var draft=renameDraft;if(!draft)return;renameDraft=null;
   var valid=commit&&draft.input.value!==draft.initial&&draft.owner===board()&&ready()&&board().getItem(draft.id)===draft.item;
   if(draft.input.parentNode)draft.input.parentNode.removeChild(draft.input);draft.name.hidden=false;
   if(valid&&layers.rename(board(),draft.id,draft.input.value))hooks.render();
   refreshFooter();
   if(focus&&!panel.hidden&&list.contains(draft.name))draft.name.focus();
  }
  function startRename(row){
   if(!ready())return;if(!row){var selected=board().selectedItems();if(selected.length!==1)return;row=Array.prototype.filter.call(list.children,function(n){return n.dataset.itemId===selected[0].id;})[0];}
   var item=row&&board().getItem(row.dataset.itemId);if(!item||item.locked)return;
   finishRename(false);var input=document.createElement('input');input.className='item-rename';input.type='text';input.maxLength=128;input.value=item.name||layers.label(item);attr(input,'aria-label','Rename '+layers.label(item));
   renameDraft={owner:board(),id:item.id,item:item,input:input,initial:input.value,name:row.children[0]};row.children[0].hidden=true;row.appendChild(input);refreshFooter();
   input.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key==='Escape'){e.preventDefault();e.stopPropagation();swallowedKeys[e.code||e.key]=true;finishRename(e.key==='Enter',true);}});
   input.addEventListener('blur',function(){if(renameDraft&&renameDraft.input===input)finishRename(true);});input.focus();input.select();
  }
  function canTransform(){var b=board(),selected=b.selectedItems();return selected.length>0&&selected.length===b.transformableItems().length;}
  function stackTarget(direction){
   var b=board(),rows=layers.rows(b,'',Object.create(null)).filter(function(r){return b.editingGroup?r.kind==='item'&&r.items[0].groupId===b.editingGroup:r.depth===0;}),indices=[];
   rows.forEach(function(r,index){if(r.items.some(function(i){return b.selection.indexOf(i.id)>=0;}))indices.push(index);});
   if(!indices.length)return null;var index=direction==='up'?indices[0]-1:indices[indices.length-1]+1;
   return rows[index]?rows[index].items[0].id:null;
  }
  function refreshFooter(){
   var b=board(),selected=b.selectedItems(),blocked=busy()||!!renameDraft,can=!blocked&&canTransform(),rules={itemsRename:!blocked&&selected.length===1&&!selected[0].locked,itemsUp:can&&!!stackTarget('up'),itemsDown:can&&!!stackTarget('down'),itemsGroup:can&&selected.length>1&&!b.editingGroup,itemsUngroup:can&&selected.some(function(i){return !!i.groupId;}),itemsDuplicate:can,itemsDelete:can,itemsExitGroup:!blocked&&!!b.editingGroup,showAllItems:!blocked&&b.items.some(function(i){return i.hidden;})};
   Object.keys(footer).forEach(function(id){if(footer[id]&&footer[id].disabled!==!rules[id])footer[id].disabled=!rules[id];});
   if(footer.itemsExitGroup)footer.itemsExitGroup.hidden=!b.editingGroup;
  }
  function footerAction(action){
   if(!ready()||editing(document.activeElement)||renameDraft)return;var b=board(),selected=b.selectedItems();
   if(action==='show'){if(layers.setFlag(b,b.items.map(function(i){return i.id;}),'hidden',false))hooks.render();return;}
   if(action==='exit'){bExit();return;}if(!canTransform())return;
   if(action==='up'||action==='down'){var target=stackTarget(action);if(target&&layers.move(b,b.selection.slice(),target,action==='up'?'before':'after'))hooks.render();return;}
   if(action==='group'&&(selected.length<2||b.editingGroup))return;if(action==='ungroup'&&!selected.some(function(i){return !!i.groupId;}))return;
   if(action==='group')b.groupSelected();else if(action==='ungroup')b.ungroupSelected();else if(action==='duplicate')b.duplicateSelected();else if(action==='delete')b.removeSelected();hooks.render();
  }
  [['itemsUp','up'],['itemsDown','down'],['itemsGroup','group'],['itemsUngroup','ungroup'],['itemsDuplicate','duplicate'],['itemsDelete','delete']].forEach(function(pair){if(footer[pair[0]])footer[pair[0]].onclick=function(){footerAction(pair[1]);};});
  /* Link cards carry their titlebar above the item box; selection framing
   * must wrap titlebar + media as one unit. linkTitleH mirrors the
   * --link-scale formula in app.js renderLink. */
  function linkTitleH(item){return item&&item.type==='link'?30*Math.max(.6,Math.min(2.2,((item.height||405)/405))):0;}
  /* A section label parked outside its frame needs the same treatment on
   * whichever edge it hangs from. Chip height follows the same relative
   * scale as app.js sectionScale (font box plus the 8-unit outside gap);
   * side-hanging chips take their width from the live label element, whose
   * layout size is already in board units. */
  function sectionScaleOf(item){return Math.max(.5,Math.min(6,Math.max((item.width||960)/960,(item.height||540)/540)));}
  function frameExt(item){
   var ext={t:0,r:0,b:0,l:0};
   if(!item)return ext;
   if(item.type==='link'){ext.t=linkTitleH(item);return ext;}
   if(item.type!=='section'||item.labelHidden||!item.labelOutside)return ext;
   var ss=sectionScaleOf(item),fs=item.labelSize==='s'?16:item.labelSize==='l'?30:22,chipH=ss*(fs*1.25+18),pos=item.labelPos||'tl';
   if(pos==='tl'||pos==='tc'||pos==='tr'||pos==='c')ext.t=chipH;
   else if(pos==='bl'||pos==='bc'||pos==='br')ext.b=chipH;
   else{var node=reference(world,item.id,'.section-label'),w=node?node.offsetWidth:0;if(w){if(pos==='ml')ext.l=w+8*ss;else ext.r=w+8*ss;}}
   return ext;
  }
  function visualBounds(item){
   var e=frameExt(item);if(!e.t&&!e.r&&!e.b&&!e.l)return Geometry.itemBounds(item);
   var th=e.t;
   var cx=item.x+item.width/2,cy=item.y+item.height/2,r=(Number(item.rotation)||0)*Math.PI/180,c=Math.cos(r),s=Math.sin(r),
       pts=[[-item.width/2-e.l,-item.height/2-e.t],[item.width/2+e.r,-item.height/2-e.t],[item.width/2+e.r,item.height/2+e.b],[-item.width/2-e.l,item.height/2+e.b]],
       out={minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity};
   for(var n=0;n<pts.length;n++){var px=cx+pts[n][0]*c-pts[n][1]*s,py=cy+pts[n][0]*s+pts[n][1]*c;out.minX=Math.min(out.minX,px);out.minY=Math.min(out.minY,py);out.maxX=Math.max(out.maxX,px);out.maxY=Math.max(out.maxY,py);}
   return out;
  }
  function titleOriginY(item,th){return ((th+item.height/2)/(item.height+th)*100)+'%';}
  function displayItem(item){return hooks.displayItem?hooks.displayItem(item):item;}
  function renderSelection(){
   var b=board(),all=b.selectedItems().filter(function(i){return !i.hidden;}).map(displayItem),movable=b.transformableItems(),multi=all.length>1,c=b.camera,bounds;
   world.classList.toggle('multi-selection',multi);box.style.display='none';box.className='selected';box.style.transform='none';hideMemberFrames();
   box.style.transformOrigin='';
   if(all.length){
    if(all.length===1){var e1=frameExt(all[0]);bounds={minX:all[0].x-e1.l,minY:all[0].y-e1.t,maxX:all[0].x+all[0].width+e1.r,maxY:all[0].y+all[0].height+e1.b};box.style.transform='rotate('+all[0].rotation+'deg)';if(e1.t||e1.b)box.style.transformOrigin='50% '+(((e1.t+all[0].height/2)/(all[0].height+e1.t+e1.b))*100)+'%';}
    else{bounds=null;for(var bi=0;bi<all.length;bi++){var vb=visualBounds(all[bi]);bounds=bounds||{minX:vb.minX,minY:vb.minY,maxX:vb.maxX,maxY:vb.maxY};bounds.minX=Math.min(bounds.minX,vb.minX);bounds.minY=Math.min(bounds.minY,vb.minY);bounds.maxX=Math.max(bounds.maxX,vb.maxX);bounds.maxY=Math.max(bounds.maxY,vb.maxY);}}
    box.style.display='block';box.style.left=(bounds.minX*c.zoom+c.x)+'px';box.style.top=(bounds.minY*c.zoom+c.y)+'px';box.style.width=((bounds.maxX-bounds.minX)*c.zoom)+'px';box.style.height=((bounds.maxY-bounds.minY)*c.zoom)+'px';box.classList.toggle('transform-blocked',movable.length!==all.length);
    if(multi){for(var i=0;i<all.length;i++){var item=all[i],frame=memberFrame(i),fe=frameExt(item);frame.style.display='block';frame.style.left=((item.x-fe.l)*c.zoom+c.x)+'px';frame.style.top=((item.y-fe.t)*c.zoom+c.y)+'px';frame.style.width=((item.width+fe.l+fe.r)*c.zoom)+'px';frame.style.height=((item.height+fe.t+fe.b)*c.zoom)+'px';frame.style.transform='rotate('+item.rotation+'deg)';frame.style.transformOrigin=(fe.t||fe.b)?'50% '+(((fe.t+item.height/2)/(item.height+fe.t+fe.b))*100)+'%':'';}}
   }
   scope.hidden=!b.editingGroup;
   if(b.editingGroup)text(document.getElementById('groupScopeLabel'),'Editing '+b.editingGroup);
  }
  function refresh(){
   syncOwner();
   if(drag&&!dragValid())cancelDrag();
   if(renameDraft&&(panel.hidden||busy()||board().getItem(renameDraft.id)!==renameDraft.item))finishRename(false);
   var b=board(),allowed={};b.transformableItems().forEach(function(i){allowed[i.id]=true;});
   Array.prototype.forEach.call(world.querySelectorAll('.reference'),function(node){var item=b.getItem(node.dataset.id);if(!item)return;node.style.display=item.hidden?'none':'';node.classList.toggle('transform-blocked',!allowed[item.id]&&b.selection.indexOf(item.id)>=0);node.classList.toggle('outside-group',!!b.editingGroup&&item.groupId!==b.editingGroup);if(item.hidden){var video=node.querySelector('video');if(video)video.pause();var iframe=node.querySelector('iframe');if(iframe)hooks.stopLink(node,item);}});
   renderSelection();if(!panel.hidden)renderList();
  }
  function renderList(){
   syncOwner();var b=board(),data=layers.rows(b,query,collapsed);refreshFooter();
   text(count,String(b.items.length));text(status,b.selection.length+' selected · Front to back'+(b.items.length&&b.items.every(function(i){return i.hidden;})?' · All items hidden':''));
   if(clearSearch)clearSearch.hidden=!query;
   // Geometry/camera changes do not change the list's presentation.
   var signature=JSON.stringify([b.items.length,query,data.map(function(r){return[r.key,r.label,r.depth,r.expanded,r.hidden,r.locked,r.mixedHidden,r.mixedLocked,r.selected,r.partialSelected,r.items.map(function(i){return[i.id,i.type,i.groupId,i.path,!!i.missing];})];})]);
   if(signature===listSignature)return;
   rowData=Object.create(null);data.forEach(function(r){rowData[r.key]=r;});
   if(!data.length){list.textContent='';var empty=document.createElement('p');empty.textContent=b.items.length?'No matching items. Clear search to see all items.':'No items yet. Add or paste a reference.';list.appendChild(empty);listSignature=signature;return;}
   var rows=Object.create(null),live=Object.create(null);
   data.forEach(function(r){live[r.key]=true;});
   Array.prototype.slice.call(list.children).forEach(function(row){if(row.dataset.rowKey!==undefined&&live[row.dataset.rowKey])rows[row.dataset.rowKey]=row;else list.removeChild(row);});
   data.forEach(function(r,index){
    var row=rows[r.key],name,visibility,lock,item=r.items[0],group=r.kind==='group';
    if(!row){
     row=document.createElement('div');row.dataset.rowKey=r.key;if(group)row.dataset.groupId=r.id;else row.dataset.itemId=r.id;
     name=document.createElement('button');name.className='item-name';name.dataset.itemAction='select';row.appendChild(name);
     visibility=document.createElement('button');visibility.className='item-eye';visibility.dataset.itemAction='visibility';row.appendChild(visibility);
     lock=document.createElement('button');lock.className='item-lock';lock.dataset.itemAction='lock';row.appendChild(lock);
     var disclosure=document.createElement('button');disclosure.className='item-disclosure';disclosure.dataset.itemAction='disclosure';disclosure.hidden=!group;icon(disclosure,'chevron');row.appendChild(disclosure);
     var thumb=document.createElement('span');thumb.className='item-thumb';row.appendChild(thumb);
     var itemCount=document.createElement('span');itemCount.className='item-count';row.appendChild(itemCount);
    }else{name=row.children[0];visibility=row.children[1];lock=row.children[2];}
    var title=(group?'Group':item.type)+(item.groupId?' · '+item.groupId:'')+(r.hidden?' · Hidden':''),className='item-row'+(r.selected?' active':'')+(r.partialSelected?' partial':'')+(r.hidden?' is-hidden':'')+(r.locked?' is-locked':'')+(!group&&item.missing?' is-missing':'')+(group?' item-group':'')+(r.depth?' is-child':''),visibilityText=r.hidden?'Show':'Hide',lockText=r.locked?'Unlock':'Lock';
    if(row.className!==className)row.className=className;
    text(name,r.label);if(name.title!==title)name.title=title;
    attr(row,'role','treeitem');attr(row,'aria-level',r.depth+1);attr(row,'aria-selected',!!r.selected);
    if(group){attr(row,'aria-expanded',!!r.expanded);attr(row.children[3],'aria-label',(r.expanded?'Collapse ':'Expand ')+r.label);}
    icon(visibility,r.hidden?'hidden':'eye');attr(visibility,'aria-pressed',r.mixedHidden?'mixed':!!r.hidden);
    attr(visibility,'aria-label',visibilityText+' '+r.label);
    icon(lock,r.locked?'lock':'unlock');attr(lock,'aria-pressed',r.mixedLocked?'mixed':!!r.locked);
    attr(lock,'aria-label',lockText+' '+r.label);
    thumbnail(row.children[4],r);text(row.children[5],group?String(r.items.length):'');
    if(list.children[index]!==row)list.insertBefore(row,list.children[index]||null);
   });
   listSignature=signature;
  }
  /* Repaint only the visible rows' thumbnails, bypassing the list signature
   * (which intentionally ignores thumbnail URLs). Used when a panel mini
   * finishes generating after the list was already painted. */
  function refreshThumbnails(){
   if(panel.hidden||listBoard!==board())return;
   Array.prototype.forEach.call(list.children,function(row){
    var r=row.dataset.rowKey!==undefined?rowData[row.dataset.rowKey]:null;
    if(r&&row.children[4])thumbnail(row.children[4],r);
   });
  }
  function clearDrop(){if(dropMark){dropMark.className=dropMark.className.replace(/ drop-(before|after)/g,'');dropMark=null;}}
  function cancelDrag(){clearDrop();drag=null;if(scrollFrame!==null&&root.cancelAnimationFrame)root.cancelAnimationFrame(scrollFrame);scrollFrame=null;}
  function dragState(){var b=board();return JSON.stringify([b.selection,b.editingGroup,b.items.map(function(i){return[i.id,i.groupId,!!i.hidden,!!i.locked];})]);}
  function dragValid(){return drag&&drag.owner===board()&&ready()&&drag.state===dragState()&&drag.refs.every(function(i,index){return board().items[index]===i;});}
  function hitRow(e){var target=document.elementFromPoint?document.elementFromPoint(e.clientX,e.clientY):e.target;var row=target&&target.closest&&target.closest('[data-row-key]');return row&&list.contains(row)?row:null;}
  list.addEventListener('pointerdown',function(e){
   suppressClick=false;cancelDrag();if(e.button!==0||editing(e.target)||editing(document.activeElement)||!ready())return;
   var row=e.target.closest('[data-row-key]'),button=e.target.closest('[data-item-action]'),r=row&&rowData[row.dataset.rowKey];
   if(!r||(button&&button.dataset.itemAction!=='select'))return;
   var ids=r.selected?board().selection.slice():r.items.map(function(i){return i.id;});
   if(!ids.length||ids.some(function(id){var i=board().getItem(id);return !i||i.hidden||i.locked;}))return;
   drag={owner:board(),state:dragState(),refs:board().items.slice(),ids:ids,pointer:e.pointerId,x:e.clientX,y:e.clientY,active:false,target:null,position:null};e.preventDefault();row.children[0].focus();
  });
  function dragMove(e){
   if(!drag||e.pointerId!==drag.pointer)return;if(!dragValid()){cancelDrag();return;}
   if(!drag.active&&Math.abs(e.clientX-drag.x)+Math.abs(e.clientY-drag.y)<5)return;
   drag.active=true;suppressClick=true;e.preventDefault();clearDrop();drag.target=null;
   var bounds=list.getBoundingClientRect(),delta=e.clientY<bounds.top+24?-12:e.clientY>bounds.bottom-24?12:0;
   if(e.clientX<bounds.left||e.clientX>bounds.right)delta=0;
   if(delta){var previous=list.scrollTop;list.scrollTop=Math.max(0,Math.min(Math.max(0,list.scrollHeight-list.clientHeight),previous+delta));if(list.scrollTop!==previous&&scrollFrame===null&&root.requestAnimationFrame)scrollFrame=root.requestAnimationFrame(function(){scrollFrame=null;dragMove(e);});}
   var row=hitRow(e),r=row&&rowData[row.dataset.rowKey];if(!r)return;
   var target=r.items[0];if(!target||drag.ids.indexOf(target.id)>=0||target.hidden||target.locked)return;
   var rect=row.getBoundingClientRect(),position=e.clientY<(rect.top+rect.bottom)/2?'before':'after';
   drag.target=target.id;drag.position=position;dropMark=row;row.className+=' drop-'+position;
  }
  document.addEventListener('pointermove',dragMove);
  document.addEventListener('pointerup',function(e){if(!drag||e.pointerId!==drag.pointer)return;var draft=drag;if(draft.active)dragMove(e);var valid=drag&&drag.target&&draft.owner===board()&&ready();cancelDrag();if(valid&&layers.move(board(),draft.ids,draft.target,draft.position))hooks.render();});
  document.addEventListener('pointercancel',function(e){if(drag&&e.pointerId===drag.pointer)cancelDrag();});
  window.addEventListener('blur',function(){cancelDrag();finishRename(false);swallowedKeys=Object.create(null);});
  window.addEventListener('keydown',function(e){if(drag&&e.key==='Escape'){cancelDrag();e.preventDefault();e.stopImmediatePropagation();}},true);
  function selectionId(r){var item=r&&r.items[0];if(r&&r.kind==='group')item=r.items.filter(function(i){return !i.hidden;})[0]||item;return item&&item.id;}
  function selectRange(b,targetKey){
   var rows=Array.prototype.filter.call(list.children,function(n){return n.dataset.rowKey!==undefined;}),keys=rows.map(function(n){return n.dataset.rowKey;}),from=keys.indexOf(rangeAnchor),to=keys.indexOf(targetKey);
   if(from<0||to<0)return false;
   var start=Math.min(from,to),end=Math.max(from,to),ids=[];
   for(var i=start;i<=end;i++){var id=selectionId(rowData[keys[i]]);if(id&&ids.indexOf(id)<0)ids.push(id);}
   ids.sort(function(a,c){return b.items.indexOf(b.getItem(a))-b.items.indexOf(b.getItem(c));});
   b.setSelection(ids);return true;
  }
  list.addEventListener('click',function(e){if(suppressClick){e.preventDefault();return;}var button=e.target.closest('[data-item-action]'),row=button&&button.closest('[data-row-key]');if(!row||!ready()||editing(document.activeElement))return;var b=board(),r=rowData[row.dataset.rowKey],item=r&&b.getItem(r.items[0].id);if(!item)return;
   if(button.dataset.itemAction==='disclosure'){collapsed[r.id]=!collapsed[r.id];renderList();return;}
   if(button.dataset.itemAction==='visibility')layers.setFlag(b,r.items.map(function(i){return i.id;}),'hidden',!r.hidden);
   else if(button.dataset.itemAction==='lock')layers.setFlag(b,r.items.map(function(i){return i.id;}),'locked',!r.locked);
   else{if(r.kind==='group')item=r.items.filter(function(i){return !i.hidden;})[0]||item;if(b.editingGroup&&item.groupId!==b.editingGroup)b.exitGroup();if(e.shiftKey){if(!selectRange(b,row.dataset.rowKey))b.toggleSelection(item.id);}else if(e.ctrlKey||e.metaKey)b.toggleSelection(item.id);else{b.setSelection([item.id]);rangeAnchor=row.dataset.rowKey;}}
   hooks.render();
  });
  function enterRow(r){if(ready()&&r&&r.kind==='group'){board().enterGroup(r.id,r.items[0].id);hooks.render();}}
  list.addEventListener('dblclick',function(e){var button=e.target.closest('[data-item-action="select"]'),row=button&&button.closest('[data-row-key]'),r=row&&rowData[row.dataset.rowKey];if(!r||!ready())return;e.preventDefault();if(r.kind==='group'){enterRow(r);return;}var item=board().getItem(r.id);if(!item)return;if(item.hidden){hooks.toast('Show this item before focusing it.');return;}if(hooks.focusItems)hooks.focusItems([item]);});
  list.addEventListener('keydown',function(e){
   suppressClick=false;
   if(drag&&e.key==='Escape'){cancelDrag();e.preventDefault();e.stopPropagation();return;}
   if(editing(e.target)||panel.hidden||listBoard!==board())return;
   var rows=Array.prototype.filter.call(list.children,function(n){return n.dataset.rowKey!==undefined;}),row=e.target.closest('[data-row-key]'),index=rows.indexOf(row),r=row&&rowData[row.dataset.rowKey],next=index;
   if(e.key==='Home')next=0;else if(e.key==='End')next=rows.length-1;
   else if(e.key==='ArrowDown')next=Math.min(rows.length-1,index+1);else if(e.key==='ArrowUp')next=Math.max(0,index-1);
   else if((e.key==='ArrowLeft'||e.key==='ArrowRight')&&r){if(r.kind==='group'){collapsed[r.id]=e.key==='ArrowLeft';renderList();}else if(e.key==='ArrowLeft'&&r.depth){var parent=rows.filter(function(n){return n.dataset.groupId===r.items[0].groupId;})[0];if(parent)parent.children[0].focus();}}
   else if(e.key==='Enter'&&r){var control=e.target.closest('[data-item-action]');if(control&&control.dataset.itemAction!=='select')return;if(r.kind==='group')enterRow(r);else row.children[0].click();}
   else if(e.key==='F2'&&r)startRename(row);
   else return;
   e.preventDefault();e.stopPropagation();if(next!==index&&rows[next]){rows[next].children[0].focus();if(rows[next].scrollIntoView)rows[next].scrollIntoView({block:'nearest'});}
  });
  if(search)search.addEventListener('input',function(){if(listBoard!==board()){syncOwner();return;}query=search.value;renderList();});
  if(clearSearch)clearSearch.onclick=function(){query='';search.value='';renderList();search.focus();};
  var renameButton=document.getElementById('itemsRename');if(renameButton)renameButton.onclick=function(){if(!editing(document.activeElement))startRename();};
  panel.addEventListener('keydown',function(e){swallowedKeys[e.code||e.key]=true;e.stopPropagation();});
  panel.addEventListener('keyup',function(e){var key=e.code||e.key;if((e.code==='Space'||e.key===' ')&&!swallowedKeys[key])return;delete swallowedKeys[key];e.stopPropagation();});
  ['copy','cut','paste'].forEach(function(type){panel.addEventListener(type,function(e){if(editing(e.target))e.stopPropagation();});});
  function copy(event){
   var wsel=window.getSelection&&window.getSelection();
   if(wsel&&!wsel.isCollapsed&&wsel.rangeCount>0){
    var anode=wsel.anchorNode,ael=anode&&(anode.nodeType===3?anode.parentNode:anode);
    if(ael&&ael.closest){
     if(ael.closest('[contenteditable="true"]'))return false;
     if(ael.closest('.note-content'))return false;
    }
   }
   if(editing(event&&event.target)||!board().selection.length)return false;
   clipboard=board().exportSelection();
   if(event&&event.clipboardData){var text=JSON.stringify(clipboard);try{event.clipboardData.setData(MIME,text);}catch(ignore){}event.clipboardData.setData('text/plain',PREFIX+text);event.preventDefault();}
   return true;
  }
  function pastePayload(payload,point){var ids=board().pasteItems(payload,point);if(ids.length){hooks.render();hooks.toast('Pasted '+ids.length+' items');return true;}hooks.toast('Invalid board clipboard data.');return false;}
  function paste(event,point){
   if(editing(event.target))return true;
   var data=event.clipboardData;if(!data)return false;
   // External clipboard image retains priority over ordinary text.
   var raw='';try{raw=data.getData(MIME);}catch(ignore){}
   if(!raw){var text=data.getData('text/plain');if(text.indexOf(PREFIX)===0)raw=text.slice(PREFIX.length);}
   if(!raw)return false;
   event.preventDefault();if(raw.length>10000000){hooks.toast('Board clipboard is too large.');return true;}
   try{pastePayload(JSON.parse(raw),point);}catch(err){hooks.toast('Invalid board clipboard data.');}return true;
  }
  function copyMenu(){if(!copy(null))return;viewport.focus();var copied=false;try{copied=document.execCommand('copy');}catch(ignore){}hooks.toast(copied?'Selection copied':'Selection copied internally · use Paste items');}
  function allowedGroup(items){if(items.length<1||!items[0].groupId)return null;var id=items[0].groupId;return items.every(function(i){return i.groupId===id;})?id:null;}
  function configureMenu(){
   var b=board(),items=b.selectedItems(),one=items.length===1?items[0]:null,has=items.length>0,group=allowedGroup(items),movable=b.transformableItems();
   var rules={copy:has,'paste-items':!!clipboard,duplicate:has,group:items.length>1&&!b.editingGroup,ungroup:items.some(function(i){return !!i.groupId;}),'enter-group':!!group&&!b.editingGroup,'exit-group':!!b.editingGroup,lock:has,hide:items.some(function(i){return !i.hidden;}),front:has,forward:has,backward:has,back:has,delete:has,send:items.some(function(i){return i.type==='image'&&!i.hidden;}),crop:!!one&&one.type==='image'&&!one.missing&&!one.locked&&!one.hidden&&(!one.groupId||b.editingGroup===one.groupId),'copy-image':!!one&&one.type==='image'&&!one.missing,relink:!!one&&one.type==='image'&&!one.locked,'edit-note':!!one&&one.type==='note'&&!one.locked,'edit-drawing':!!one&&one.type==='drawing'&&!one.locked,play:!!one&&one.type==='link'&&one.mediaType==='video',stop:!!one&&one.type==='link'&&!!reference(world,one.id,'.link-player'),'open-link':!!one&&one.type==='link',arrange:movable.length>1};
   rules['edit-drawing']=!!one&&one.type==='drawing'&&!one.locked&&!one.hidden&&(!one.groupId||b.editingGroup===one.groupId)&&movable.indexOf(one)>=0;
   rules['note-settings']=!!one&&one.type==='note'&&!one.locked&&!one.hidden&&(!one.groupId||b.editingGroup===one.groupId)&&movable.indexOf(one)>=0;
   rules['focus-selection']=items.some(function(i){return !i.hidden;});
   Array.prototype.forEach.call(menu.querySelectorAll('[data-command]'),function(button){var cmd=button.dataset.command;button.hidden=rules[cmd]===false;button.disabled=false;if(cmd==='edit-drawing')button.textContent=one&&one.strokes&&one.strokes.length===1&&['rect','roundrect','ellipse','triangle','diamond','star'].indexOf(one.strokes[0].tool)>=0?'Shape settings…':'Drawing settings…';if(cmd==='lock')button.textContent=items.every(function(i){return i.locked;})?'Unlock selection':'Lock selection';});
   // Do not leave leading, repeated, or trailing separators after filtering.
   var divider=null,seen=false;
   Array.prototype.forEach.call(menu.children,function(node){if(node.tagName==='SPAN'){node.hidden=true;if(seen)divider=node;}else if(!node.hidden){if(divider)divider.hidden=false;divider=null;seen=true;}});
  }
  function command(name,point){
   var b=board(),item=b.selectedItems()[0],node=item&&reference(world,item.id);
   if(name==='focus-selection'){if(hooks.focusItems)hooks.focusItems();}
   else if(name==='copy')copyMenu();
   else if(name==='paste-items'){if(clipboard)pastePayload(clipboard,point);}
   else if(name==='hide'){b.hideSelected();hooks.render();}
   else if(name==='enter-group'){var group=allowedGroup(b.selectedItems());if(group){b.enterGroup(group,item.id);hooks.render();}}
   else if(name==='exit-group'){b.exitGroup();hooks.render();}
   else if(name==='edit-note'&&item&&!item.locked)hooks.editText(item);
   else if(name==='edit-drawing'&&item&&!item.locked){hooks.editDrawing(item);}
   else if(name==='copy-image')hooks.copyImage();
   else if(name==='relink'&&item&&!item.locked)hooks.relink(item);
   else if(name==='play'&&node)hooks.playLink(node,item);
   else if(name==='stop'&&node)hooks.stopLink(node,item);
   else if(name==='open-link'&&item)hooks.openExternal(item.url);
   else if(name==='arrange'){document.getElementById('arrangePanel').hidden=false;hooks.showToolbar();}
   else if(name==='items'){panel.hidden=false;renderList();hooks.showToolbar();}
   else return false;
   return true;
  }
  function closeItems(){cancelDrag();finishRename(false);panel.hidden=true;var trigger=document.getElementById('itemsBtn');(trigger&&!trigger.hidden?trigger:viewport).focus();}
  document.getElementById('itemsBtn').onclick=function(){if(!panel.hidden)closeItems();else{panel.hidden=false;renderList();hooks.showToolbar();}};
  document.getElementById('closeItems').onclick=closeItems;
  ['closeItems','itemsBtn'].forEach(function(id){document.getElementById(id).addEventListener('pointerdown',function(){finishRename(false);});});
  document.getElementById('exitGroup').onclick=function(){bExit();};
  var itemsExit=document.getElementById('itemsExitGroup');if(itemsExit)itemsExit.onclick=function(){footerAction('exit');};
  function bExit(){board().exitGroup();hooks.render();}
  document.getElementById('showAllItems').onclick=function(){footerAction('show');};
  document.getElementById('normalizeLargest').onclick=function(){if(board().normalizeSelected('largest'))hooks.render();};
  document.getElementById('normalizeSmallest').onclick=function(){if(board().normalizeSelected('smallest'))hooks.render();};
  document.addEventListener('copy',function(e){copy(e);});
  return{refresh:refresh,refreshThumbnails:refreshThumbnails,renderSelection:renderSelection,configureMenu:configureMenu,command:command,paste:paste,editing:editing,hasClipboard:function(){return !!clipboard;}};
 }
 return{create:create,isEditing:editing,reference:reference};
});
