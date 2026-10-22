(function(root,factory){var geometry=root.Geometry,crop=root.ImageCrop,noteStyle=root.NoteStyle,drawingStyle=root.DrawingStyle;if(!geometry&&typeof require==='function')geometry=require('./geometry.js');if(!crop&&typeof require==='function')crop=require('./image-crop.js');if(!noteStyle&&typeof require==='function')noteStyle=require('./note-style.js');if(!drawingStyle&&typeof require==='function')drawingStyle=require('./drawing-style.js');var value=factory(geometry,crop,noteStyle,drawingStyle);root.BoardModel=value;if(typeof module==='object'&&module.exports)module.exports=value;})(this,function(Geometry,ImageCrop,NoteStyle,DrawingStyle){
 function clone(o){return JSON.parse(JSON.stringify(o));}
 function defaults(){return{background:'#1d1d1d',gridType:'dots',gridSize:32,gridColor:'#ffffff',gridOpacity:.2,autoHideToolbar:true,accentColor:'#4096f3',panelColor:'#252525',textColor:'#e6e6e6',thumbnailsEnabled:true,thumbnailSize:1024,thumbnailSwapZoom:.75};}
 function accentColor(value,fallback){if(typeof value!=='string'||!/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value))return fallback||'#4096f3';var color=value.toLowerCase();return color.length===4?'#'+color[1]+color[1]+color[2]+color[2]+color[3]+color[3]:color;}
 function settings(value){var out=defaults(),v=value||{},keys=['background','gridType','gridSize','gridColor','gridOpacity','autoHideToolbar','accentColor','panelColor','textColor','thumbnailsEnabled','thumbnailSize','thumbnailSwapZoom'];for(var i=0;i<keys.length;i++)if(v[keys[i]]!==undefined)out[keys[i]]=v[keys[i]];out.gridType=/^(lines|dots|none)$/.test(out.gridType)?out.gridType:'dots';out.gridSize=Math.max(2,Math.min(256,Number(out.gridSize)||32));out.gridOpacity=Math.max(0,Math.min(1,Number(out.gridOpacity)));out.autoHideToolbar=out.autoHideToolbar!==false;out.accentColor=accentColor(out.accentColor);out.panelColor=accentColor(out.panelColor,'#252525');out.textColor=accentColor(out.textColor,'#e6e6e6');out.thumbnailsEnabled=out.thumbnailsEnabled!==false;out.thumbnailSize=[512,1024,2048].indexOf(Number(out.thumbnailSize))>=0?Number(out.thumbnailSize):1024;out.thumbnailSwapZoom=Math.min(4,Math.max(.25,Number(out.thumbnailSwapZoom)||.75));return out;}
 function validProjectLink(link){return link===null||!!(link&&typeof link==='object'&&!Array.isArray(link)&&typeof link.path==='string'&&link.path.length&&!/[\u0000]/.test(link.path)&&typeof link.name==='string'&&!/[\u0000]/.test(link.name));}
 function projectLink(link){if(link===undefined)return null;if(!validProjectLink(link))throw new Error('Invalid board project link');return link===null?null:{path:link.path,name:link.name};}
 function BoardModel(data,options){data=data||{};options=options||{};this.version=1;this.items=Array.isArray(data.items)?clone(data.items):[];this.camera=data.camera||{x:0,y:0,zoom:1};this.settings=settings(data.settings);this.projectLink=projectLink(data.projectLink);this.selection=[];this.editingGroup=null;this.nextId=data.nextId||1;this.historyLimit=options.historyLimit||200;this.undoStack=[];this.redoStack=[];this.transaction=null;this.revision=1;this.selectedIds=new Set();}
 /* Derived O(1) membership mirror of this.selection. The array stays the
  * serialisable source of truth (toJSON/undo payloads unchanged); refreshIds
  * rebuilds the mirror after every write to the array. */
 BoardModel.prototype.refreshIds=function(){this.selectedIds=new Set(this.selection);};
/* O(1) change detection for the persistence hot path: any committed mutation
 * (transaction commit, restore, clearHistory, real updateItem change) bumps
 * the revision. Reads never do. Camera pan/zoom mutates this.camera directly
 * without calling the model API, so navigating never marks the board dirty. */
BoardModel.prototype.bump=function(){this.revision++;};
 BoardModel.prototype.state=function(){return{items:clone(this.items),settings:clone(this.settings),projectLink:clone(this.projectLink),nextId:this.nextId,selection:this.selection.slice(),editingGroup:this.editingGroup};};
 function repairScope(board){
  if(board.editingGroup&&!board.items.some(function(x){return x.groupId===board.editingGroup;}))board.editingGroup=null;
  var seen=Object.create(null);
  board.selection=board.selection.filter(function(id){var x=board.getItem(id);if(!x||seen[id]||(board.editingGroup&&x.groupId!==board.editingGroup))return false;seen[id]=true;return true;});
 }
 BoardModel.prototype.restore=function(s){var link=projectLink(s.projectLink);this.items=clone(s.items);this.settings=settings(s.settings);this.projectLink=link;this.nextId=s.nextId;this.selection=(s.selection||[]).slice();this.editingGroup=s.editingGroup||null;repairScope(this);this.refreshIds();this.revision++;};
 BoardModel.prototype.beginTransaction=function(){if(!this.transaction)this.transaction=this.state();};
 BoardModel.prototype.commitTransaction=function(){if(!this.transaction)return false;repairScope(this);var before=JSON.stringify(this.transaction),after=JSON.stringify(this.state());if(before!==after){this.undoStack.push(this.transaction);if(this.undoStack.length>this.historyLimit)this.undoStack.shift();this.redoStack=[];this.revision++;}this.transaction=null;return before!==after;};
 BoardModel.prototype.clearHistory=function(){this.undoStack=[];this.redoStack=[];this.transaction=null;this.revision++;};
 BoardModel.prototype.undo=function(){if(!this.undoStack.length)return false;this.redoStack.push(this.state());this.restore(this.undoStack.pop());return true;};
 BoardModel.prototype.redo=function(){if(!this.redoStack.length)return false;this.undoStack.push(this.state());this.restore(this.redoStack.pop());return true;};
 BoardModel.prototype.addItem=function(item){this.beginTransaction();item.id=item.id||'ref-'+this.nextId++;item.z=this.items.length+1;this.items.push(item);this.selection=[item.id];this.refreshIds();this.commitTransaction();return clone(item);};
 BoardModel.prototype.addImage=function(path,cx,cy,size){size=size||{};var w=Math.max(40,Number(size.width)||320),h=Math.max(40,Number(size.height)||220);return this.addItem({type:'image',path:path,x:cx-w/2,y:cy-h/2,width:w,height:h,rotation:0,missing:false});};
 BoardModel.prototype.addNote=function(x,y,text){return this.addItem({type:'note',x:x,y:y,width:520,height:292,rotation:0,text:text||'Double-click to edit',fontFamily:'Segoe UI',fontSize:50,color:'#eee8da',background:'#141414',align:'left'});};
 BoardModel.prototype.addLink=function(x,y,data){data=data||{};var w=Math.max(40,Number(data.width)||720),h=Math.max(40,Number(data.height)||405);return this.addItem({type:'link',x:x,y:y,width:w,height:h,rotation:0,url:data.url,provider:data.provider||'link',videoId:data.videoId||'',thumbnail:data.thumbnail||'',title:data.title||data.url,mediaType:data.mediaType||'link'});};
 /* Local videos are references, never copies: files are commonly hundreds of
  * megabytes and boards stay portable without them. `path` is the original
  * file; `poster` is a generated board-relative JPEG for the stopped state. */
 BoardModel.prototype.addVideo=function(x,y,data){data=data||{};var w=Math.max(40,Number(data.width)||640),h=Math.max(40,Number(data.height)||360);return this.addItem({type:'link',x:x,y:y,width:w,height:h,rotation:0,url:'',provider:'local',videoId:'',thumbnail:data.poster||'',title:data.title||data.name||'Local video',mediaType:'video',path:data.path||'',poster:data.poster||''});};
 /* Sections are named frames (Figma-style). Membership is spatial, never
  * stored: an item belongs to a section while its center sits inside the
  * frame. Sections never rotate and never join groups. */
 var SECTION_STYLE_KEYS=['color','tint','follow','strokeWidth','strokeStyle','cornerRadius','labelSize','labelPos','labelOutside','labelHidden'];
 function sectionStyleInvalid(patch){
  if(!patch||typeof patch!=='object')return true;
  if(patch.color!==undefined&&!(typeof patch.color==='string'&&/^#[0-9a-f]{6}$/i.test(patch.color)))return true;
  if(patch.tint!==undefined&&!(finiteNumber(patch.tint)&&patch.tint>=0&&patch.tint<=1))return true;
  if(patch.follow!==undefined&&typeof patch.follow!=='boolean')return true;
  if(patch.strokeWidth!==undefined&&!(finiteNumber(patch.strokeWidth)&&patch.strokeWidth>=0.5&&patch.strokeWidth<=6))return true;
  if(patch.strokeStyle!==undefined&&patch.strokeStyle!=='solid'&&patch.strokeStyle!=='dashed')return true;
  if(patch.cornerRadius!==undefined&&!(finiteNumber(patch.cornerRadius)&&patch.cornerRadius>=0&&patch.cornerRadius<=64))return true;
  if(patch.labelSize!==undefined&&['s','m','l'].indexOf(patch.labelSize)<0)return true;
  if(patch.labelPos!==undefined&&['tl','tc','tr','ml','c','mr','bl','bc','br'].indexOf(patch.labelPos)<0)return true;
  if(patch.labelOutside!==undefined&&typeof patch.labelOutside!=='boolean')return true;
  if(patch.labelHidden!==undefined&&typeof patch.labelHidden!=='boolean')return true;
  return false;
 }
 BoardModel.prototype.addSection=function(x,y,w,h,name,style){
  w=Math.max(40,Number(w)||960);h=Math.max(40,Number(h)||540);
  name=typeof name==='string'&&name.trim()?name.trim().slice(0,128):'Section';
  var item={type:'section',x:Number(x)||0,y:Number(y)||0,width:w,height:h,rotation:0,name:name};
  if(style&&typeof style==='object')for(var i=0;i<SECTION_STYLE_KEYS.length;i++){
   var key=SECTION_STYLE_KEYS[i],probe={};
   if(style[key]!==undefined){probe[key]=style[key];if(!sectionStyleInvalid(probe))item[key]=style[key];}
  }
  return this.addItem(item);
 };
 BoardModel.prototype.setSectionStyle=function(id,patch){
  if(this.transaction||!patch||typeof patch!=='object')return false;
  var item=this.getItem(id);if(!item||item.type!=='section'||item.locked)return false;
  var clean={},keys=Object.keys(patch),i;
  for(i=0;i<keys.length;i++)if(SECTION_STYLE_KEYS.indexOf(keys[i])>=0)clean[keys[i]]=patch[keys[i]];
  if(sectionStyleInvalid(clean))return false;
  var changed=false;for(i=0;i<SECTION_STYLE_KEYS.length;i++){var k=SECTION_STYLE_KEYS[i];if(k in clean&&item[k]!==clean[k])changed=true;}
  if(!changed)return false;
  this.beginTransaction();
  for(i=0;i<SECTION_STYLE_KEYS.length;i++){var key2=SECTION_STYLE_KEYS[i];if(key2 in clean){if(clean[key2]===undefined)delete item[key2];else item[key2]=clean[key2];}}
  return this.commitTransaction();
 };
 BoardModel.prototype.arrangeSectionContents=function(section,gap){
  if(this.transaction||!section||section.type!=='section')return false;
  var contents=this.sectionContents(section);if(contents.length<2)return false;
  gap=finiteNumber(gap)&&gap>=0?gap:24;
  var pad=24;
  var sorted=contents.slice().sort(function(a,b){var ra=Math.round(a.y/40),rb=Math.round(b.y/40);return (ra-rb)||(a.x-b.x);});
  var cellW=0,cellH=0,i;
  for(i=0;i<sorted.length;i++){cellW=Math.max(cellW,sorted[i].width);cellH=Math.max(cellH,sorted[i].height);}
  var innerW=Math.max(cellW,section.width-pad*2);
  var cols=Math.max(1,Math.floor((innerW+gap)/(cellW+gap)));
  this.beginTransaction();
  for(i=0;i<sorted.length;i++){
   var col=i%cols,row=Math.floor(i/cols);
   sorted[i].x=section.x+pad+col*(cellW+gap)+(cellW-sorted[i].width)/2;
   sorted[i].y=section.y+pad+row*(cellH+gap)+(cellH-sorted[i].height)/2;
  }
  return this.commitTransaction();
 };
 BoardModel.prototype.sectionContents=function(section){
  var out=[];if(!section||section.type!=='section')return out;
  for(var i=0;i<this.items.length;i++){
   var x=this.items[i];
   if(x===section||x.type==='section'||x.hidden||x.locked)continue;
   if(x.groupId&&this.editingGroup!==x.groupId)continue;
   var cx=x.x+x.width/2,cy=x.y+x.height/2;
   if(cx>=section.x&&cx<=section.x+section.width&&cy>=section.y&&cy<=section.y+section.height)out.push(x);
  }
  return out;
 };
 BoardModel.prototype.addDrawing=function(x,y,strokes,bounds){bounds=bounds||{width:320,height:220};var w=Math.max(20,bounds.width),h=Math.max(20,bounds.height);return this.addItem({type:'drawing',x:x,y:y,width:w,height:h,sourceWidth:w,sourceHeight:h,rotation:0,strokes:clone(strokes||[])});};
 BoardModel.prototype.setSettings=function(patch){this.beginTransaction();var next=clone(this.settings);for(var k in patch)if(Object.prototype.hasOwnProperty.call(patch,k))next[k]=patch[k];this.settings=settings(next);this.commitTransaction();};
 BoardModel.prototype.setProjectLink=function(link){if(!validProjectLink(link))return false;this.beginTransaction();this.projectLink=projectLink(link);return this.commitTransaction();};
 BoardModel.prototype.getItem=function(id){for(var i=0;i<this.items.length;i++)if(this.items[i].id===id)return this.items[i];return null;};
 function validNoteFamily(value){return typeof value==='string'&&!/[\u0000-\u001f\u007f-\u009f]/.test(value)&&value.trim().length>0&&value.trim().length<=128;}
 BoardModel.prototype.setNoteStyle=function(id,patch){
  var item=this.getItem(id);
  if(this.transaction||!NoteStyle||!item||item.type!=='note'||this.selection.length!==1||this.selection[0]!==id||
   (item.groupId&&this.editingGroup!==item.groupId)||this.transformableItems().indexOf(item)<0)return false;
  if(!patch||typeof patch!=='object'||Array.isArray(patch))return false;
  var normalized=NoteStyle.style(patch),current=NoteStyle.style(item),next={},keys=Object.keys(patch);
  for(var i=0;i<keys.length;i++){
   var key=keys[i],value=patch[key];
   if(key==='fontFamily'){if(!validNoteFamily(value))return false;}
   else if(key==='fontSize'){if(!finiteNumber(value)||value<1||value>512)return false;}
   else if(key==='align'){if(!/^(?:left|center|right|justify)$/.test(value))return false;}
   else if(key==='lineHeight'){if(!finiteNumber(value)||value<.8||value>3)return false;}
   else if(key==='letterSpacing'){if(!finiteNumber(value)||value<-5||value>20)return false;}
   else if(key==='paragraphSpacing'){if(!finiteNumber(value)||value<0||value>96)return false;}
   else if(key==='valign'){if(!/^(?:top|middle|bottom)$/.test(value))return false;}
   else if(key==='bold'||key==='italic'||key==='underline'){if(typeof value!=='boolean')return false;}
   else if(key==='padding'){if(!finiteNumber(value)||value<0||value>64)return false;}
   else if(key==='cornerRadius'){if(!finiteNumber(value)||value<0||value>64)return false;}
   else if(key==='textOrientation'){if(!/^(?:horizontal|vertical)$/.test(value))return false;}
   else if(key==='color'||key==='background'){if(typeof value!=='string'||!/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value))return false;}
   else if(key==='height'){if(!finiteNumber(value)||value<=0)return false;}
   else if(key==='width'){if(current.textOrientation!=='vertical'&&normalized.textOrientation!=='vertical'||!finiteNumber(value)||value<=0)return false;}
   else return false;
   if(key==='height'||key==='width'){if(item[key]!==value)next[key]=value;}
   else if(current[key]!==normalized[key])next[key]=normalized[key];
  }
  if(!Object.keys(next).length)return false;
  this.beginTransaction();this.updateItem(id,next);return this.commitTransaction();
 };
 BoardModel.prototype.setImageFlip=function(id,flipH,flipV){
  var item=this.getItem(id);
  if(!item||item.type!=='image'||item.missing||this.selection.length!==1||this.selection[0]!==id||
   (item.groupId&&this.editingGroup!==item.groupId)||this.transformableItems().indexOf(item)<0)return false;
  if(typeof flipH!=='boolean'||typeof flipV!=='boolean')return false;
  var current={flipH:item.flipH===true,flipV:item.flipV===true};
  if(current.flipH===flipH&&current.flipV===flipV)return false;
  var patch={};if(current.flipH!==flipH)patch.flipH=flipH;if(current.flipV!==flipV)patch.flipV=flipV;
  this.beginTransaction();this.updateItem(id,patch);return this.commitTransaction();
 };
 BoardModel.prototype.setImageCrop=function(id,crop){
  var item=this.getItem(id);
  if(!ImageCrop||!item||item.type!=='image'||item.missing||this.selection.length!==1||this.selection[0]!==id||
   (item.groupId&&this.editingGroup!==item.groupId)||this.transformableItems().indexOf(item)<0||!ImageCrop.valid(crop))return false;
  var current=item.crop===undefined?ImageCrop.empty():item.crop;
  if(ImageCrop.valid(current)&&current.left===crop.left&&current.top===crop.top&&current.right===crop.right&&current.bottom===crop.bottom)return false;
  var patch=ImageCrop.apply(item,crop);if(!patch)return false;
  this.beginTransaction();this.updateItem(id,patch);return this.commitTransaction();
 };
 BoardModel.prototype.updateItem=function(id,patch){var item=this.getItem(id);if(!item)return null;var locked=item.locked,changed=false;for(var k in patch)if(Object.prototype.hasOwnProperty.call(patch,k)&&k!=='id'&&!(locked&&/^(x|y|width|height|rotation)$/.test(k))){if(item[k]!==patch[k])changed=true;item[k]=patch[k];}if(changed&&!this.transaction)this.revision++;return clone(item);};
 function itemOpacity(item){return item&&item.opacity!==undefined?item.opacity:1;}
 BoardModel.opacity=itemOpacity;
 BoardModel.prototype.setSelectedOpacity=function(value){
  if(this.transaction||!finiteNumber(value)||value<0||value>1)return false;
  var selected=this.selectedItems();if(!selected.length||selected.every(function(item){return itemOpacity(item)===value;}))return false;
  this.beginTransaction();for(var i=0;i<selected.length;i++)selected[i].opacity=value;return this.commitTransaction();
 };
 BoardModel.prototype.setSelection=function(ids){
  ids=Array.isArray(ids)?ids:[];
  var explicit=Object.create(null),seen=Object.create(null),valid=[],i,j,item,member;
  for(i=0;i<ids.length;i++)explicit[ids[i]]=true;
  for(i=0;i<ids.length;i++){
   item=this.getItem(ids[i]);
   if(!item||(this.editingGroup&&item.groupId!==this.editingGroup))continue;
   if(item.groupId&&!this.editingGroup){
    for(j=0;j<this.items.length;j++){
     member=this.items[j];
     if(member.groupId===item.groupId&&(!member.hidden||explicit[member.id])&&!seen[member.id]){seen[member.id]=true;valid.push(member.id);}
    }
   }else if(!seen[item.id]){seen[item.id]=true;valid.push(item.id);}
  }
  this.selection=valid;this.refreshIds();
 };
 BoardModel.prototype.toggleSelection=function(id){
  var item=this.getItem(id),self=this;
  if(!item||item.hidden||(this.editingGroup&&item.groupId!==this.editingGroup))return;
  if(this.selection.indexOf(id)>=0){
   this.selection=this.selection.filter(function(selected){var x=self.getItem(selected);return selected!==id&&!(item.groupId&&!self.editingGroup&&x&&x.groupId===item.groupId);});
  }else this.setSelection(this.selection.concat([id]));
  this.refreshIds();
 };
 BoardModel.prototype.enterGroup=function(groupId,itemId){
  var item=this.getItem(itemId);
  if(typeof groupId!=='string'||!groupId||!item||item.groupId!==groupId)return false;
  this.editingGroup=groupId;this.selection=[itemId];this.refreshIds();return true;
 };
 BoardModel.prototype.exitGroup=function(){
  if(!this.editingGroup)return false;
  var groupId=this.editingGroup;this.editingGroup=null;
  this.selection=this.items.filter(function(x){return x.groupId===groupId&&!x.hidden;}).map(function(x){return x.id;});
  this.refreshIds();return true;
 };
 BoardModel.prototype.removeSelected=function(){if(!this.selection.length)return false;this.beginTransaction();var map=Object.create(null);for(var i=0;i<this.selection.length;i++)map[this.selection[i]]=true;this.items=this.items.filter(function(x){return !map[x.id];});this.selection=[];this.refreshIds();return this.commitTransaction();};
 BoardModel.prototype.selectInRect=function(r,add){
  var ids=add?this.selectedItems().filter(function(x){return !x.hidden;}).map(function(x){return x.id;}):[];
  for(var i=0;i<this.items.length;i++){
   var x=this.items[i];if(x.hidden||x.type==='section')continue;
   var b=Geometry.itemBounds(x),hit=b.minX<=r.maxX&&b.maxX>=r.minX&&b.minY<=r.maxY&&b.maxY>=r.minY;
   if(hit&&ids.indexOf(x.id)<0)ids.push(x.id);
  }
  this.setSelection(ids);
 };
 BoardModel.prototype.selectedItems=function(){var self=this;return this.selection.map(function(id){return self.getItem(id);}).filter(Boolean);};
 BoardModel.prototype.transformableItems=function(){
  var blocked=Object.create(null),scope=this.editingGroup;
  if(!scope)for(var i=0;i<this.items.length;i++){var x=this.items[i];if(x.groupId&&(x.locked||x.hidden))blocked[x.groupId]=true;}
  return this.selectedItems().filter(function(x){return !x.locked&&!x.hidden&&(!scope||x.groupId===scope)&&!blocked[x.groupId];});
 };
 BoardModel.prototype.normalizeZ=function(){for(var i=0;i<this.items.length;i++)this.items[i].z=i+1;};
 BoardModel.prototype.exportSelection=function(){return{format:'messboard-items',version:1,items:clone(this.selectedItems())};};
 function cloneIntoBoard(board,items,dx,dy){
  if(!items.length)return [];
  var reserved=Object.create(null),groups=Object.create(null),ids=[],i;
  var all=board.items.concat(items);
  for(i=0;i<all.length;i++){reserved[all[i].id]=true;if(all[i].groupId)reserved[all[i].groupId]=true;}
  function fresh(prefix){var id;do{id=prefix+board.nextId++;}while(reserved[id]);reserved[id]=true;return id;}
  board.beginTransaction();
  for(i=0;i<items.length;i++){
   var copy=clone(items[i]);copy.id=fresh('ref-');copy.x+=dx;copy.y+=dy;
   if(copy.groupId){if(!groups[copy.groupId])groups[copy.groupId]=fresh('group-');copy.groupId=groups[copy.groupId];}
   copy.z=board.items.length+1;board.items.push(copy);ids.push(copy.id);
  }
  board.editingGroup=null;board.selection=ids;board.refreshIds();board.commitTransaction();return ids;
 }
 BoardModel.prototype.pasteItems=function(payload,point){
  var items,b,dx,dy;
  try{
   payload=typeof payload==='string'?JSON.parse(payload):payload;
   if(!payload||payload.format!=='messboard-items'||payload.version!==1)return [];
   if(point!==undefined&&point!==null&&(!finiteNumber(point.x)||!finiteNumber(point.y)))return [];
   items=BoardModel.fromJSON({version:payload.version,items:payload.items}).items;
   if(!items.length)return [];
   b=Geometry.sceneBounds(items);dx=point?point.x-b.minX:16;dy=point?point.y-b.minY:16;
   for(var i=0;i<items.length;i++)if(!finiteNumber(items[i].x+dx)||!finiteNumber(items[i].y+dy))return [];
  }catch(error){return [];}
  return cloneIntoBoard(this,items,dx,dy);
 };
 BoardModel.prototype.duplicateSelected=function(dx,dy){
  dx=dx===undefined?16:Number(dx);dy=dy===undefined?16:Number(dy);
  if(!isFinite(dx)||!isFinite(dy))return [];
  return cloneIntoBoard(this,this.selectedItems(),dx,dy);
 };
 BoardModel.prototype.reorderSelected=function(mode){var map=Object.create(null),i;for(i=0;i<this.selection.length;i++)map[this.selection[i]]=true;if(!this.selection.length)return false;this.beginTransaction();if(mode==='front'||mode==='back'){var chosen=this.items.filter(function(x){return map[x.id];}),rest=this.items.filter(function(x){return !map[x.id];});this.items=mode==='front'?rest.concat(chosen):chosen.concat(rest);}else if(mode==='forward'){for(i=this.items.length-2;i>=0;i--)if(map[this.items[i].id]&&!map[this.items[i+1].id]){var a=this.items[i];this.items[i]=this.items[i+1];this.items[i+1]=a;}}else if(mode==='backward'){for(i=1;i<this.items.length;i++)if(map[this.items[i].id]&&!map[this.items[i-1].id]){var b=this.items[i];this.items[i]=this.items[i-1];this.items[i-1]=b;}}this.normalizeZ();return this.commitTransaction();};
 // Outside edit scope a group is one transform unit, never independent children.
 function transformUnits(board){
  var selected=board.transformableItems(),seen=Object.create(null),units=[];
  for(var i=0;i<selected.length;i++){
   var item=selected[i],members=[item];
   if(item.type==='section')continue;
   if(item.groupId&&!board.editingGroup){
    if(seen[item.groupId])continue;seen[item.groupId]=true;
    members=board.items.filter(function(x){return x.groupId===item.groupId;});
   }
   var b=Geometry.sceneBounds(members);
   units.push({items:members,bounds:b,width:b.maxX-b.minX,height:b.maxY-b.minY});
  }
  return units;
 }
 function unitsBounds(units){
  var b={minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity};
  for(var i=0;i<units.length;i++){var r=units[i].bounds;b.minX=Math.min(b.minX,r.minX);b.minY=Math.min(b.minY,r.minY);b.maxX=Math.max(b.maxX,r.maxX);b.maxY=Math.max(b.maxY,r.maxY);}
  return b;
 }
 function moveUnit(unit,dx,dy){for(var i=0;i<unit.items.length;i++){unit.items[i].x+=dx;unit.items[i].y+=dy;}}
 BoardModel.prototype.alignSelected=function(mode){
  var a=transformUnits(this);if(a.length<2||!/^(left|center|right|top|middle|bottom)$/.test(mode))return false;
  var b=unitsBounds(a);this.beginTransaction();
  for(var i=0;i<a.length;i++){
   var r=a[i].bounds,dx=0,dy=0;
   if(mode==='left')dx=b.minX-r.minX;else if(mode==='center')dx=(b.minX+b.maxX-r.minX-r.maxX)/2;else if(mode==='right')dx=b.maxX-r.maxX;
   else if(mode==='top')dy=b.minY-r.minY;else if(mode==='middle')dy=(b.minY+b.maxY-r.minY-r.maxY)/2;else if(mode==='bottom')dy=b.maxY-r.maxY;
   moveUnit(a[i],dx,dy);
  }
  return this.commitTransaction();
 };
 BoardModel.prototype.distributeSelected=function(axis){
  var a=transformUnits(this);if(a.length<3||!/^(horizontal|vertical)$/.test(axis))return false;
  var horizontal=axis==='horizontal',key=horizontal?'minX':'minY',size=horizontal?'width':'height';
  for(var i=0;i<a.length;i++)a[i].order=i;
  a.sort(function(x,y){return x.bounds[key]-y.bounds[key]||x.order-y.order;});
  var start=a[0].bounds[key],end=a[a.length-1].bounds[key]+a[a.length-1][size],total=0;
  for(i=0;i<a.length;i++)total+=a[i][size];
  var gap=(end-start-total)/(a.length-1),cursor=start;this.beginTransaction();
  for(i=0;i<a.length;i++){var delta=cursor-a[i].bounds[key];moveUnit(a[i],horizontal?delta:0,horizontal?0:delta);cursor+=a[i][size]+gap;}
  return this.commitTransaction();
 };
 function scaleUnit(unit,sx,sy){
  var cx=(unit.bounds.minX+unit.bounds.maxX)/2,cy=(unit.bounds.minY+unit.bounds.maxY)/2;
  for(var i=0;i<unit.items.length;i++){
   var x=unit.items[i],mx=x.x+x.width/2,my=x.y+x.height/2;
   x.width*=sx;x.height*=sy;x.x=cx+(mx-cx)*sx-x.width/2;x.y=cy+(my-cy)*sy-x.height/2;
   if(x.type==='note'&&sx===sy&&finiteNumber(x.fontSize))x.fontSize*=sx;
  }
 }
 BoardModel.prototype.matchSelected=function(mode){
  var a=transformUnits(this);if(a.length<2||!/^(width|height|both)$/.test(mode))return false;
  var source=a[0];this.beginTransaction();
  for(var i=1;i<a.length;i++){
   var unit=a[i],x=unit.items[0],sx=source.width/unit.width,sy=source.height/unit.height;
   // Both fits aspect-preserving units inside the target; only plain notes/drawings stretch.
   if(mode==='width')sy=sx;else if(mode==='height')sx=sy;
   else if(!(unit.items.length===1&&(!x.groupId||this.editingGroup)&&x.rotation%360===0&&/^(note|drawing)$/.test(x.type)))sx=sy=Math.min(sx,sy);
   scaleUnit(unit,sx,sy);
  }
  return this.commitTransaction();
 };
 BoardModel.prototype.normalizeSelected=function(mode){
  var a=transformUnits(this);if(a.length<2||!/^(largest|smallest)$/.test(mode))return false;
  var target=a[0].width*a[0].height;
  for(var i=1;i<a.length;i++){var area=a[i].width*a[i].height;target=mode==='largest'?Math.max(target,area):Math.min(target,area);}
  this.beginTransaction();
  for(i=0;i<a.length;i++){var factor=Math.sqrt(target/(a[i].width*a[i].height));scaleUnit(a[i],factor,factor);}
  return this.commitTransaction();
 };
 function nonnegative(value,fallback){return value!==undefined&&isFinite(Number(value))?Math.max(0,Number(value)):fallback;}
 BoardModel.prototype.autoArrangeSelected=function(options){
  var a=transformUnits(this);if(a.length<2)return false;options=options||{};
  var columns=Math.max(1,Math.floor(nonnegative(options.columns,Math.ceil(Math.sqrt(a.length))))),gap=nonnegative(options.gap,20),b=unitsBounds(a),cellW=0,cellH=0;
  for(var i=0;i<a.length;i++){cellW=Math.max(cellW,a[i].width);cellH=Math.max(cellH,a[i].height);}
  this.beginTransaction();
  for(i=0;i<a.length;i++)moveUnit(a[i],b.minX+(i%columns)*(cellW+gap)-a[i].bounds.minX,b.minY+Math.floor(i/columns)*(cellH+gap)-a[i].bounds.minY);
  return this.commitTransaction();
 };
 BoardModel.prototype.stackSelected=function(axis,gap){
  var a=transformUnits(this);if(a.length<2||!/^(horizontal|vertical)$/.test(axis))return false;
  gap=nonnegative(gap,20);var horizontal=axis==='horizontal',b=unitsBounds(a),i;
  for(i=0;i<a.length;i++)a[i].order=i;
  a.sort(function(x,y){return horizontal?x.bounds.minX-y.bounds.minX||x.order-y.order:x.bounds.minY-y.bounds.minY||x.order-y.order;});
  this.beginTransaction();
  var cursor=horizontal?b.minX:b.minY;
  var crossCenter=horizontal?(b.minY+b.maxY)/2:(b.minX+b.maxX)/2;
  for(i=0;i<a.length;i++){
   var mainDelta=cursor-(horizontal?a[i].bounds.minX:a[i].bounds.minY);
   var crossDelta=crossCenter-(horizontal?(a[i].bounds.minY+a[i].bounds.maxY)/2:(a[i].bounds.minX+a[i].bounds.maxX)/2);
   moveUnit(a[i],horizontal?mainDelta:crossDelta,horizontal?crossDelta:mainDelta);
   cursor+=(horizontal?a[i].width:a[i].height)+gap;
  }
  return this.commitTransaction();
 };
 // Growing binary-tree bin packer: each leaf is actual remaining rectangular space.
 function packingSlot(node,w,h){
  if(node.used)return packingSlot(node.right,w,h)||packingSlot(node.down,w,h);
  return w<=node.width&&h<=node.height?node:null;
 }
 function splitSlot(node,w,h){
  node.used=true;
  node.down={x:node.x,y:node.y+h,width:node.width,height:node.height-h};
  node.right={x:node.x+w,y:node.y,width:node.width-w,height:h};
 }
 BoardModel.prototype.packSelected=function(gap){
  var a=transformUnits(this);if(a.length<2)return false;gap=nonnegative(gap,10);
  var b=unitsBounds(a),i;
  for(i=0;i<a.length;i++)a[i].order=i;
  a.sort(function(x,y){return Math.max(y.width,y.height)-Math.max(x.width,x.height)||y.width*y.height-x.width*x.height||x.order-y.order;});
  var root={x:0,y:0,width:a[0].width+gap,height:a[0].height+gap},positions=[];
  for(i=0;i<a.length;i++){
   var w=a[i].width+gap,h=a[i].height+gap,node=packingSlot(root,w,h);
   if(!node){
    var right=h<=root.height,down=w<=root.width;
    // Prefer growing toward a square when both directions are possible.
    if(right&&(!down||root.height>=root.width+w||root.width<root.height+h)){
     root={x:0,y:0,width:root.width+w,height:root.height,used:true,down:root,right:{x:root.width,y:0,width:w,height:root.height}};
    }else{
     root={x:0,y:0,width:root.width,height:root.height+h,used:true,right:root,down:{x:0,y:root.height,width:root.width,height:h}};
    }
    node=packingSlot(root,w,h);
   }
   splitSlot(node,w,h);positions.push({x:node.x,y:node.y});
  }
  this.beginTransaction();
  for(i=0;i<a.length;i++)moveUnit(a[i],b.minX+positions[i].x-a[i].bounds.minX,b.minY+positions[i].y-a[i].bounds.minY);
  return this.commitTransaction();
 };
 BoardModel.prototype.groupSelected=function(){var a=this.selectedItems().filter(function(x){return x.type!=='section';});if(a.length<2)return null;this.beginTransaction();var id='group-'+this.nextId++;for(var i=0;i<a.length;i++)a[i].groupId=id;this.commitTransaction();return id;};
 BoardModel.prototype.ungroupSelected=function(){var a=this.selectedItems();if(!a.length)return false;this.beginTransaction();for(var i=0;i<a.length;i++)delete a[i].groupId;return this.commitTransaction();};
 BoardModel.prototype.toggleLockSelected=function(){var a=this.selectedItems();if(!a.length)return false;this.beginTransaction();var lock=!a.every(function(x){return x.locked;});for(var i=0;i<a.length;i++)a[i].locked=lock;return this.commitTransaction();};
 BoardModel.prototype.setItemsHidden=function(ids,hidden){
  if(!Array.isArray(ids)||typeof hidden!=='boolean')return false;
  this.beginTransaction();
  for(var i=0;i<ids.length;i++){var item=this.getItem(ids[i]);if(item&&!!item.hidden!==hidden)item.hidden=hidden;}
  this.setSelection(this.selectedItems().filter(function(x){return !x.hidden;}).map(function(x){return x.id;}));
  return this.commitTransaction();
 };
 BoardModel.prototype.hideSelected=function(){return this.setItemsHidden(this.selection.slice(),true);};
 BoardModel.prototype.setCamera=function(c){this.camera={x:Number(c.x)||0,y:Number(c.y)||0,zoom:Math.max(.02,Math.min(8,Number(c.zoom)||1))};};
 BoardModel.prototype.zoomAt=function(next,sx,sy){next=Math.max(.02,Math.min(8,next));var old=this.camera.zoom;this.camera.x=sx-(sx-this.camera.x)*(next/old);this.camera.y=sy-(sy-this.camera.y)*(next/old);this.camera.zoom=next;};
 BoardModel.prototype.toJSON=function(){return JSON.stringify({version:1,nextId:this.nextId,camera:this.camera,settings:this.settings,projectLink:this.projectLink,items:this.items},null,2);};
 function finiteNumber(value){return typeof value==='number'&&isFinite(value);}
 // Capture metadata is inert JSON. Known host fields retain strict numeric/string types.
 function safeMetadata(value,depth){
  if(depth>5)return false;
  if(value===null||typeof value==='boolean')return true;
  if(typeof value==='number')return finiteNumber(value);
  if(typeof value==='string')return value.length<=32768&&value.indexOf('\u0000')<0;
  if(!value||typeof value!=='object')return false;
  var keys=Object.keys(value);if(keys.length>128)return false;
  for(var i=0;i<keys.length;i++)if(/^(?:__proto__|prototype|constructor)$/.test(keys[i])||!safeMetadata(value[keys[i]],depth+1))return false;
  return true;
 }
 function validCapture(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||!safeMetadata(value,0))return false;
  var strings=['path','name','projectPath','projectName','compName','sessionToken'],numbers=['compId','time','frameRate','width','height','frame','frameNumber','pixelAspect'],i,key;
  for(i=0;i<strings.length;i++){key=strings[i];if(Object.prototype.hasOwnProperty.call(value,key)&&typeof value[key]!=='string')return false;}
  for(i=0;i<numbers.length;i++){key=numbers[i];if(Object.prototype.hasOwnProperty.call(value,key)&&(!finiteNumber(value[key])||(/^(compId|frameRate|width|height|pixelAspect)$/.test(key)&&value[key]<=0)))return false;}
  if(value.compId!==undefined&&Math.floor(value.compId)!==value.compId)return false;
  if(value.mode!==undefined&&(typeof value.mode!=='string'||!/^(comp|layers|workarea)$/.test(value.mode)))return false;
  var lists=['layerIds','layerIndices'];
  for(i=0;i<lists.length;i++)if(value[lists[i]]!==undefined){
   var list=value[lists[i]];if(!Array.isArray(list))return false;
   for(var j=0;j<list.length;j++)if(!finiteNumber(list[j])||list[j]<=0||Math.floor(list[j])!==list[j])return false;
  }
  return true;
 }
 // The AE bridge must validate metadata with exactly the same schema as reopening.
 BoardModel.validCaptureMetadata=validCapture;
 // Drawing fields are interpolated into SVG by the panel; never accept attribute text.
 function validDrawing(item){
  if(!Array.isArray(item.strokes))return false;
  var dimensions=['sourceWidth','sourceHeight'];
  for(var n=0;n<dimensions.length;n++)if(Object.prototype.hasOwnProperty.call(item,dimensions[n])&&(!finiteNumber(item[dimensions[n]])||item[dimensions[n]]<=0))return false;
  for(var i=0;i<item.strokes.length;i++){
   var s=item.strokes[i];
   if(!s||typeof s.tool!=='string')return false;
   if(s.appearanceVersion!==undefined){
    if(!DrawingStyle||!DrawingStyle.valid(s)||!/^(pen|line|rect|roundrect|ellipse|triangle|diamond|star)$/.test(s.tool))return false;
   }else if(!/^(pen|line|rect|ellipse)$/.test(s.tool)||!finiteNumber(s.width)||s.width<=0||typeof s.color!=='string'||
    !/^(#[0-9a-f]{3,4}|#[0-9a-f]{6}|#[0-9a-f]{8}|[a-z]+|rgba?\([0-9.,% +\-]+\))$/i.test(s.color)||
    (s.style!==undefined&&(typeof s.style!=='string'||!/^(solid|dotted|arrow)$/.test(s.style))))return false;
   if(s.tool==='pen'||s.tool==='line'){
    if(!Array.isArray(s.points)||!s.points.length)return false;
    for(var j=0;j<s.points.length;j++){var p=s.points[j];if(!Array.isArray(p)||p.length!==2||!finiteNumber(p[0])||!finiteNumber(p[1]))return false;}
   }else if(s.tool==='ellipse'){
    if(!finiteNumber(s.cx)||!finiteNumber(s.cy)||!finiteNumber(s.rx)||!finiteNumber(s.ry)||s.rx<0||s.ry<0)return false;
   }else if(!finiteNumber(s.x)||!finiteNumber(s.y)||!finiteNumber(s.w)||!finiteNumber(s.h)||s.w<0||s.h<0)return false;
  }
  return true;
 }
 BoardModel.fromJSON=function(text){
  var d=typeof text==='string'?JSON.parse(text):text,seen=Object.create(null),maxId=0,items=[];
  if(!d||d.version!==1||!Array.isArray(d.items))throw new Error('Invalid board data');
  for(var i=0;i<d.items.length;i++){
   var x=d.items[i],validType=x&&/^(image|note|drawing|link|section)$/.test(x.type);
   if(x&&x.type==='section'&&x.labelPos==='above'){x.labelPos='tc';x.labelOutside=true;}
   if(!validType||typeof x.id!=='string'||seen[x.id]||!finiteNumber(x.x)||!finiteNumber(x.y)||!finiteNumber(x.width)||!finiteNumber(x.height)||x.width<=0||x.height<=0||!finiteNumber(x.rotation)||!finiteNumber(x.z)||
    (Object.prototype.hasOwnProperty.call(x,'groupId')&&typeof x.groupId!=='string')||
    (Object.prototype.hasOwnProperty.call(x,'locked')&&typeof x.locked!=='boolean')||
    (Object.prototype.hasOwnProperty.call(x,'hidden')&&typeof x.hidden!=='boolean')||
    (Object.prototype.hasOwnProperty.call(x,'opacity')&&(!finiteNumber(x.opacity)||x.opacity<0||x.opacity>1))||
    ((Object.prototype.hasOwnProperty.call(x,'flipH')||Object.prototype.hasOwnProperty.call(x,'flipV'))&&(x.type!=='image'||typeof x.flipH!=='boolean'&&x.flipH!==undefined||typeof x.flipV!=='boolean'&&x.flipV!==undefined))||
    (x.type==='image'&&(typeof x.path!=='string'||!x.path))||
    (Object.prototype.hasOwnProperty.call(x,'crop')&&(x.type!=='image'||!ImageCrop||!ImageCrop.valid(x.crop)||!ImageCrop.full(x)))||
    (Object.prototype.hasOwnProperty.call(x,'capture')&&(x.type!=='image'||!validCapture(x.capture)))||
    (x.type==='section'&&(typeof x.name!=='string'||!x.name.trim()||x.name.length>128||/[\u0000-\u001f\u007f-\u009f]/.test(x.name)||sectionStyleInvalid(x)))||
    (x.type==='note'&&typeof x.text!=='string')||
    (x.type==='note'&&Object.prototype.hasOwnProperty.call(x,'fontFamily')&&!validNoteFamily(x.fontFamily))||
    (x.type==='drawing'&&!validDrawing(x))||
    (x.type==='link'&&(x.provider==='local'
     ?(typeof x.path!=='string'||!x.path||/[\u0000-\u001f]/.test(x.path))
     :(typeof x.url!=='string'||!/^https?:\/\//i.test(x.url)))))throw new Error('Invalid board item');
   seen[x.id]=true;
   var m=/^(?:ref|group)-(\d+)$/.exec(x.id),g=/^(?:ref|group)-(\d+)$/.exec(x.groupId||'');
   if(m)maxId=Math.max(maxId,Number(m[1]));if(g)maxId=Math.max(maxId,Number(g[1]));
   var copy=clone(x);
   if(copy.type==='drawing'){copy.sourceWidth=Number(copy.sourceWidth)||copy.width;copy.sourceHeight=Number(copy.sourceHeight)||copy.height;}
   items.push(copy);
  }
  if(d.camera&&(!finiteNumber(d.camera.x)||!finiteNumber(d.camera.y)||!finiteNumber(d.camera.zoom)||d.camera.zoom<=0))throw new Error('Invalid board camera');
  var nextId=Number(d.nextId);if(!isFinite(nextId)||nextId<1)nextId=1;
  return new BoardModel({items:items,camera:d.camera?clone(d.camera):undefined,settings:d.settings,projectLink:d.projectLink,nextId:Math.max(Math.ceil(nextId),maxId+1)});
 };
 return BoardModel;
});
