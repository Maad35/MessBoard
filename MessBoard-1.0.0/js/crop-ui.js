/* Browser: load ImageCrop and PathCodec before this file; CommonJS is also supported. */
(function(root,factory){var crop=root.ImageCrop,codec=root.PathCodec;if(!crop&&typeof require==='function')crop=require('./image-crop.js');if(!codec&&typeof require==='function')codec=require('./path-codec.js');var value=factory(crop,codec);root.CropUI=value;if(typeof module==='object'&&module.exports)module.exports=value;})(this,function(ImageCrop,PathCodec){
 'use strict';
 function create(hooks){
  var viewport=hooks.viewport,world=hooks.world,doc=viewport.ownerDocument||document,win=doc.defaultView||window;
  var session=null,gesture=null,previousFocus=null;
  function element(tag,id,className,parent,text){var el=doc.createElement(tag);if(id)el.id=id;el.className=className||'';if(text)el.textContent=text;if(parent)parent.appendChild(el);return el;}
  var overlay=element('div','cropOverlay','crop-overlay',viewport),image=element('img',null,'crop-source',overlay);
  overlay.setAttribute('aria-label','Crop image');image.alt='';image.draggable=false;
  var shades=[],sides=['top','right','bottom','left'],i;
  for(i=0;i<sides.length;i++)shades.push(element('div',null,'crop-shade crop-shade-'+sides[i],overlay));
  var box=element('div','cropBox','crop-box',overlay);box.setAttribute('data-crop-action','move');box.tabIndex=0;box.setAttribute('aria-label','Move crop area with arrow keys');
  var handles=[],directions=['nw','n','ne','e','se','s','sw','w'];
  for(i=0;i<directions.length;i++){
   var handle=element('div',null,'crop-handle crop-handle-'+directions[i],box);handle.setAttribute('data-crop-handle',directions[i]);handle.setAttribute('aria-hidden','true');handles.push(handle);
  }
  var bar=element('div','cropBar','crop-bar',viewport);bar.setAttribute('role','toolbar');bar.setAttribute('aria-label','Image crop');
  element('span',null,'crop-label',bar,'Crop');
  var resetButton=element('button','cropReset','',bar,'Reset'),cancelButton=element('button','cropCancel','',bar,'Cancel'),doneButton=element('button','cropDone','crop-done',bar,'Done');
  resetButton.type=cancelButton.type=doneButton.type='button';resetButton.title='Preview the full image';cancelButton.title='Cancel crop (Escape)';doneButton.title='Apply crop (Enter)';
  overlay.hidden=bar.hidden=true;
  function report(text){if(hooks.toast)hooks.toast(text);}
  function consume(event){if(event.preventDefault)event.preventDefault();if(event.stopImmediatePropagation)event.stopImmediatePropagation();else if(event.stopPropagation)event.stopPropagation();}
  function eligible(board,id){
   var item=board&&board.getItem(id);
   return !!(item&&item.type==='image'&&item.path&&!item.missing&&!item.hidden&&!item.locked&&board.selection.length===1&&board.selection[0]===id&&(!item.groupId||board.editingGroup===item.groupId)&&board.transformableItems().indexOf(item)>=0&&ImageCrop.full(item));
  }
  function sameSource(item){return item&&item.path===session.source.path&&item.x===session.source.x&&item.y===session.source.y&&item.width===session.source.width&&item.height===session.source.height&&item.rotation===session.source.rotation&&JSON.stringify(item.crop)===JSON.stringify(session.source.crop);}
  function rect(el,x,y,width,height){el.style.left=x+'px';el.style.top=y+'px';el.style.width=Math.max(0,width)+'px';el.style.height=Math.max(0,height)+'px';}
  function refresh(){
   if(!session)return;
   var board=hooks.getBoard();
   if(board!==session.board||!eligible(board,session.id)||!sameSource(board.getItem(session.id))){cancel();return;}
   var full=session.full,crop=session.draft,zoom=board.camera.zoom||1,w=full.width*zoom,h=full.height*zoom,l=crop.left*w,t=crop.top*h,r=crop.right*w,b=crop.bottom*h;
   rect(overlay,full.x*zoom+board.camera.x,full.y*zoom+board.camera.y,w,h);overlay.style.transform='rotate('+full.rotation+'deg)';
   rect(box,l,t,w-l-r,h-t-b);rect(shades[0],0,0,w,t);rect(shades[1],w-r,t,r,h-t-b);rect(shades[2],0,h-b,w,b);rect(shades[3],0,t,l,h-t-b);
   box.style.borderWidth='1px';
   for(var n=0;n<handles.length;n++){handles[n].style.width='16px';handles[n].style.height='16px';}
   var center=ImageCrop.worldPoint(full,{x:(1+crop.left-crop.right)/2,y:(1+crop.top-crop.bottom)/2});
   var barWidth=bar.offsetWidth||252,barHeight=bar.offsetHeight||40,angle=full.rotation*Math.PI/180;
   var bottom=full.y+full.height/2+(Math.abs(Math.sin(angle))*full.width+Math.abs(Math.cos(angle))*full.height)/2;
   bar.style.left=Math.max(8,Math.min(viewport.clientWidth-barWidth-8,center.x*zoom+board.camera.x-barWidth/2))+'px';
   bar.style.top=Math.max(8,Math.min(viewport.clientHeight-barHeight-8,bottom*zoom+board.camera.y+18))+'px';
  }
  function finish(){
   session=null;gesture=null;overlay.hidden=bar.hidden=true;world.classList.remove('crop-editing');
   if(hooks.render)hooks.render();if(previousFocus&&previousFocus.focus)previousFocus.focus();previousFocus=null;
  }
  function cancel(){if(!session)return false;finish();return true;}
  function done(){
   if(!session)return false;
   var board=hooks.getBoard();if(board!==session.board||!eligible(board,session.id)||!sameSource(board.getItem(session.id))){report('Image changed. Start crop again.');cancel();return false;}
   board.setImageCrop(session.id,session.draft);finish();return true;
  }
  function reset(){if(!session)return;gesture=null;session.draft=ImageCrop.empty();refresh();}
  function start(id){
   if(session)return false;var board=hooks.getBoard();id=id||(board&&board.selection[0]);
   if(!eligible(board,id)){report('Select one available, unlocked image. Enter its group to crop a member.');return false;}
   if(hooks.onStart)hooks.onStart();
   var item=board.getItem(id);previousFocus=doc.activeElement;
   session={board:board,id:id,source:JSON.parse(JSON.stringify(item)),full:ImageCrop.full(item),draft:item.crop?ImageCrop.copy(item.crop):ImageCrop.empty()};
   image.src=/^(?:https?:|data:|blob:|file:)/i.test(item.path)?item.path:PathCodec.toFileUrl(item.path);
   overlay.hidden=bar.hidden=false;world.classList.add('crop-editing');if(hooks.showToolbar)hooks.showToolbar();refresh();box.focus();return true;
  }
  function keydown(event){
   if(!session)return false;
   var key=event.key||({13:'Enter',27:'Escape'})[event.keyCode];
   if(key==='Escape'){consume(event);cancel();return true;}
   if((key==='Enter'||key===' '||event.code==='Space')&&bar.contains(event.target)){
    consume(event);if(event.target===cancelButton)cancel();else if(event.target===resetButton)reset();else if(event.target===doneButton)done();return true;
   }
   if(key==='Enter'){consume(event);done();return true;}
   if(/^Arrow(Left|Right|Up|Down)$/.test(key)&&!bar.contains(event.target)){
    var amount=event.shiftKey?10:1,dx=key==='ArrowLeft'?-amount:key==='ArrowRight'?amount:0,dy=key==='ArrowUp'?-amount:key==='ArrowDown'?amount:0;
    session.draft=ImageCrop.drag(session.draft,'move',dx/session.full.width,dy/session.full.height);consume(event);refresh();return true;
   }
   // Keep tab focus inside the inline crop controls while other editing is blocked.
   if(key==='Tab'){
    var order=[box,resetButton,cancelButton,doneButton],index=order.indexOf(doc.activeElement),step=event.shiftKey?-1:1;
    order[(index+step+order.length)%order.length].focus();consume(event);return true;
   }
   return false;
  }
  function blocks(event){return !!session&&(!event||(event.type!=='wheel'&&event.button!==1));}
  function down(event){
   if(!blocks(event))return;
   var target=event.target,handle=null;
   while(target&&target!==viewport){
    if(target.getAttribute){handle=target.getAttribute('data-crop-handle')||target.getAttribute('data-crop-action');if(handle)break;}
    target=target.parentNode;
   }
   consume(event);
   if(event.button!==0||!handle)return;
   box.focus();var point=hooks.boardPoint(event.clientX,event.clientY);
   gesture={handle:handle,crop:ImageCrop.copy(session.draft),point:ImageCrop.localPoint(session.full,point)};
  }
  function move(event){
   if(!session||!gesture)return;consume(event);
   var local=ImageCrop.localPoint(session.full,hooks.boardPoint(event.clientX,event.clientY));
   var next=ImageCrop.drag(gesture.crop,gesture.handle,local.x-gesture.point.x,local.y-gesture.point.y);
   if(next){session.draft=next;refresh();}
  }
  function up(event){if(!session||!gesture)return;move(event);gesture=null;consume(event);}
  viewport.addEventListener('mousedown',down,true);
  win.addEventListener('mousemove',move,true);win.addEventListener('mouseup',up,true);
  win.addEventListener('blur',function(){gesture=null;},true);
  viewport.addEventListener('contextmenu',function(event){if(session)consume(event);},true);
  viewport.addEventListener('dblclick',function(event){if(session)consume(event);},true);
  viewport.addEventListener('dragstart',function(event){if(session)consume(event);},true);
  viewport.addEventListener('click',function(event){
   if(!session||!bar.contains(event.target))return;
   consume(event);if(event.target===doneButton)done();else if(event.target===cancelButton)cancel();else if(event.target===resetButton)reset();
  },true);
  return{start:start,cancel:cancel,isActive:function(){return !!session;},refresh:refresh,keydown:keydown,blocks:blocks};
 }
 return{create:create};
});
