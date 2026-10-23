(function(root,factory){var value=factory(root);root.AEUI=value;if(typeof module==='object'&&module.exports)module.exports=value;})(this,function(root){
 'use strict';
 function create(hooks){
  var document=root.document,cs=new root.CSInterface(),busy=false,context=null;
  var panel=document.createElement('aside');panel.id='aePanel';panel.className='tool-panel ae-panel';panel.hidden=true;panel.setAttribute('aria-labelledby','aeHeading');
  panel.innerHTML='<h2 id="aeHeading">After Effects</h2>'+
   '<section><h3>Active composition</h3><p id="aeContext" class="panel-help">Read the active composition and selected layers.</p><button id="aeReadContext">Read context</button></section>'+
   '<section><h3>Send references</h3><p id="aeSelection" class="panel-help"></p><label for="aeSendMode">Layout size <select id="aeSendMode"><option value="actual" selected>Actual size</option><option value="fit">Fit to composition</option></select></label><p class="panel-help">Actual size: 1 board unit = 1 composition pixel.</p><button id="aeSend">Send selected images</button></section>'+
   '<section><h3>Capture to board</h3><div class="ae-actions"><button id="aeCaptureComp">Comp frame</button><button id="aeCaptureLayers">Selected layers</button></div><label for="aeSampleCount">Work area samples <input id="aeSampleCount" type="number" min="2" max="12" step="1" value="5"></label><button id="aeCaptureWorkarea">Capture work area</button><button id="aeRefreshCapture">Refresh selected captures</button><p class="panel-help">Captures stay beside the board. Refresh keeps the layout and previous files for Undo.</p></section>'+
   '<section><h3>Project link</h3><p id="aeProjectLink" class="panel-help"></p><div class="ae-actions"><button id="aeLinkProject">Link active project</button><button id="aeUnlinkProject">Unlink</button></div><p class="panel-help">Link a saved AEP to guard against sending to the wrong project. Linking does not save or open the AEP.</p></section>'+
   '<p id="aeStatus" class="panel-help" role="status" aria-live="polite"></p><button id="aeClose">Done</button>';
  document.body.appendChild(panel);
  var selectionLabel=el('aeSelection'),projectLabel=el('aeProjectLink'),controls=panel.querySelectorAll('button,input,select');
  var sampleScrub=null,sampleOwner=null,sampleBefore=null;
  if(root.NumericScrub)sampleScrub=root.NumericScrub.bind(el('aeSampleCount'),{
   begin:function(){if(panel.hidden||busy||(hooks.otherBusy&&hooks.otherBusy()))return false;sampleOwner=hooks.getBoard();sampleBefore=el('aeSampleCount').value;},
   valid:function(){return !panel.hidden&&!busy&&!(hooks.otherBusy&&hooks.otherBusy())&&(!sampleOwner||sampleOwner===hooks.getBoard());},
   preview:function(){},
   commit:function(){sampleOwner=null;sampleBefore=null;},
   cancel:function(){if(sampleBefore!==null)el('aeSampleCount').value=sampleBefore;sampleOwner=null;sampleBefore=null;}
  });
  function el(id){return document.getElementById(id);}
  function report(text){el('aeStatus').textContent=text;}
  function refresh(force){
   // Camera renders also call refresh; a closed idle panel has nothing to paint.
   if(panel.hidden&&!busy&&force!==true)return;
   var board=hooks.getBoard(),selected=board?board.selectedItems():[],link=board&&board.projectLink;
   var selectionText=selected.length+' board items selected.',projectText=link?'Linked: '+(link.name||link.path):'No project linked.',projectTitle=link?link.path:'',disabled=busy||!!(hooks.otherBusy&&hooks.otherBusy());
   if(selectionLabel.textContent!==selectionText)selectionLabel.textContent=selectionText;
   if(projectLabel.textContent!==projectText)projectLabel.textContent=projectText;
   if(projectLabel.title!==projectTitle)projectLabel.title=projectTitle;
   Array.prototype.forEach.call(controls,function(button){if(button.id!=='aeClose'&&button.disabled!==disabled)button.disabled=disabled;});
  }
  function available(){if(busy||(hooks.otherBusy&&hooks.otherBusy()))return false;if(!hooks.requireBoard()||!hooks.getBoard()||!hooks.boardPath()){report('Create or open a board first.');hooks.toast('Create or open a board first.');return false;}return true;}
  function lock(on){if(on&&sampleScrub)sampleScrub.cancel();busy=on;panel.setAttribute('aria-busy',String(on));refresh(true);}
  function call(method,payload){return new Promise(function(resolve,reject){
   var target;
   switch(method){case 'getContext':target='MessBoardHost.getContext';break;case 'captureFrames':target='MessBoardHost.captureFrames';break;case 'importReferences':target='MessBoardHost.importReferences';break;default:reject(new Error('Unsupported After Effects command.'));return;}
   var script=target+'('+(method==='getContext'?'':root.PathCodec.jsxString(JSON.stringify(payload)))+')';
   cs.evalScript(script,function(raw){var result;try{result=JSON.parse(raw);}catch(error){reject(new Error('Invalid After Effects response. Read context and retry.'));return;}if(!result||result.ok!==true){reject(new Error(result&&result.error||'Invalid After Effects response.'));return;}if(!result.data||typeof result.data!=='object'){reject(new Error('Invalid After Effects response data.'));return;}resolve(result.data);});
  });}
  function run(label,work){if(busy||(hooks.otherBusy&&hooks.otherBusy()))return Promise.resolve(false);lock(true);report(label);return Promise.resolve().then(work).then(function(){lock(false);return true;},function(error){var message=error.message||String(error);report(message);hooks.toast(message);lock(false);return false;});}
  function readContext(){return call('getContext').then(function(data){if(!data||typeof data.projectPath!=='string'||typeof data.projectName!=='string'||!Array.isArray(data.selectedLayers)||data.selectedLayers.some(function(layer){return !layer||!positive(layer.index)||typeof layer.name!=='string';})||(data.comp!==null&&(!data.comp||!positive(data.comp.id)||!positive(data.comp.width)||!positive(data.comp.height)||typeof data.comp.name!=='string')))throw new Error('Invalid After Effects context response. Read context and retry.');context=data;el('aeContext').textContent=(data.projectName||'Unsaved project')+' · '+(data.comp?data.comp.name+' · '+data.comp.width+' × '+data.comp.height:'No active composition')+'\n'+data.selectedLayers.map(function(layer){return layer.index+'. '+layer.name;}).join('\n');return data;});}
  function read(){return run('Reading After Effects…',function(){return readContext().then(function(){report('Context updated.');});});}
  function open(){panel.hidden=false;hooks.showToolbar();refresh();return read();}
  var fileSerial=0;
  function freshPaths(count){
   var fs=hooks.fs(),path=hooks.path(),folder=hooks.getLayout().captures,paths=[],file;
   fs.mkdirSync(folder,{recursive:true});
   while(paths.length<count){file=path.join(folder,'capture-'+Date.now()+'-'+Math.random().toString(16).slice(2)+'-'+fileSerial+++'.png');if(!fs.existsSync(file))paths.push(file);}
   return paths;
  }
  function positive(value){return typeof value==='number'&&isFinite(value)&&value>0;}
  function validSource(source){return source&&root.BoardModel.validCaptureMetadata(source)&&typeof source.projectPath==='string'&&positive(source.compId)&&typeof source.compName==='string'&&/^(comp|layers|workarea)$/.test(source.mode)&&typeof source.time==='number'&&isFinite(source.time)&&source.time>=0&&Array.isArray(source.layerIds)&&Array.isArray(source.layerIndices);}
  function verifyCaptures(result,paths){
   if(!result||!Array.isArray(result.captures)||result.captures.length!==paths.length)throw new Error('Capture response count does not match the request.');
   return result.captures.map(function(frame,index){
    if(!frame||typeof frame.path!=='string'||!hooks.path().isAbsolute(frame.path)||projectKey(hooks.path().resolve(frame.path))!==projectKey(hooks.path().resolve(paths[index])))throw new Error('Capture returned an unexpected output path.');
    frame.path=paths[index];
    if(!hooks.fs().existsSync(paths[index])||(hooks.fs().statSync&&!hooks.fs().statSync(paths[index]).isFile()))throw new Error('Capture output file is missing.');
    if(!positive(frame.width)||!positive(frame.height)||!validSource(frame.capture))throw new Error('Capture response has invalid dimensions or source metadata.');
    return frame;
   });
  }
  function sameBoard(board,boardPath){if(hooks.getBoard()!==board||hooks.boardPath()!==boardPath)throw new Error('Board changed while After Effects was working.');if(board.transaction)throw new Error('Finish the current board edit before applying After Effects results.');}
  function captureError(error,paths){
   var remaining=paths.filter(function(file){try{return hooks.fs().existsSync(file);}catch(ignore){return false;}}).length;
   throw new Error((error.message||String(error))+' Board unchanged.'+(remaining?' '+remaining+' new capture files remain in the captures folder.':''));
  }
  function capture(mode){
   if(!available())return Promise.resolve(false);
   mode=mode||'comp';var board=hooks.getBoard(),boardPath=hooks.boardPath(),point=hooks.point(),count=mode==='workarea'?Number(el('aeSampleCount').value):1,paths=[];
   return run('Capturing from After Effects…',function(){
    if(!/^(comp|layers|workarea)$/.test(mode))throw new Error('Choose comp, selected layers, or work area capture.');
    if(mode==='workarea'&&(!positive(count)||count!==Math.floor(count)||count<2||count>12))throw new Error('Work area samples must be a whole number from 2 to 12.');
    return readContext().then(function(data){
    sameBoard(board,boardPath);
    if(!data.comp)throw new Error('Open an active composition in After Effects first.');
    if(mode==='layers'&&!data.selectedLayers.length)throw new Error('Select one or more After Effects layers first.');
    paths=freshPaths(count);var payload={projectPath:data.projectPath,sessionToken:data.sessionToken||'',compId:data.comp.id,mode:mode,outputPaths:paths};if(mode==='workarea')payload.count=count;
    return call('captureFrames',payload).then(function(result){
     verifyCaptures(result,paths);sameBoard(board,boardPath);
     var sizes=result.captures.map(function(frame){var scale=Math.min(1,520/Math.max(frame.width,frame.height));return{width:frame.width*scale,height:frame.height*scale};});
     var total=sizes.reduce(function(sum,size){return sum+size.width;},0)+24*(sizes.length-1),left=point.x-total/2,ids=[];
     board.beginTransaction();result.captures.forEach(function(frame,index){
      var size=sizes[index],item={id:'ref-'+board.nextId++,type:'image',path:frame.path,name:frame.name,capture:frame.capture,width:size.width,height:size.height,x:left,y:point.y-size.height/2,rotation:0,z:board.items.length+1,missing:false};
      left+=size.width+24;board.items.push(item);ids.push(item.id);
     });board.editingGroup=null;board.selection=ids;board.commitTransaction();hooks.render();report(ids.length+' frames captured.');hooks.toast(ids.length+' frames captured.');
    });
   }).catch(function(error){captureError(error,paths);});});
  }
  function projectKey(value){return String(value||'').replace(/\\/g,'/').toLowerCase();}
  function checkProject(board,data){if(board.projectLink&&projectKey(board.projectLink.path)!==projectKey(data.projectPath))throw new Error('Active project differs from the linked project. Unlink or link the active project explicitly.');}
  function send(replace){
   if(!available())return Promise.resolve(false);
   var board=hooks.getBoard(),boardPath=hooks.boardPath(),items=JSON.parse(JSON.stringify(board.selectedItems())),mode=el('aeSendMode').value;
   try{
    var sel=window.getSelection&&window.getSelection();
    if(sel&&!sel.isCollapsed&&sel.rangeCount){
     var node=sel.anchorNode,noteEl=node&&(node.nodeType===3?node.parentNode:node);
     noteEl=noteEl&&noteEl.closest?noteEl.closest('.note-content'):null;
     var refEl=noteEl&&noteEl.closest?noteEl.closest('.reference'):null;
     var selText=sel.toString();
     if(noteEl&&refEl&&selText){
      for(var si=0;si<items.length;si++){
       if(items[si].id===refEl.dataset.id&&items[si].type==='note'){items[si]._sendText=selText;break;}
      }
     }
    }
   }catch(e){}
   return run('Sending references…',function(){return readContext().then(function(data){sameBoard(board,boardPath);checkProject(board,data);var prepared=root.AEWorkflow.prepareSend(items,data,mode);prepared.payload.replace=!!replace;return call('importReferences',prepared.payload).then(function(result){if(!result||result.count!==prepared.payload.items.length)throw new Error('After Effects import response count does not match the request. Check the composition before retrying.');var replaced=(result.layers||[]).reduce(function(n,l){return n+(l.replacedCount||(l.replaced?1:0));},0);var isReplace=!!prepared.payload.replace;var message=prepared.payload.items.length+(isReplace?' references replaced':' references sent')+(replaced&&!isReplace?' ('+replaced+' layer'+(replaced>1?'s':'')+' updated)':'')+' · '+prepared.skipped+' unsupported or hidden items skipped.';report(message);hooks.toast(message);});});});
  }
  function refreshCapture(){
   if(!available())return Promise.resolve(false);
   var board=hooks.getBoard(),boardPath=hooks.boardPath(),items=JSON.parse(JSON.stringify(board.selectedItems().filter(function(item){return item.type==='image'&&!item.hidden&&!item.locked&&item.capture;}))),paths=[],results=[];
   return run('Refreshing captures…',function(){if(!items.length)throw new Error('Select visible, unlocked captured images to refresh.');return readContext().then(function(data){
    sameBoard(board,boardPath);checkProject(board,data);
    function next(index){
     if(index===items.length)return;
     var output=freshPaths(1);paths.push(output[0]);
     return call('captureFrames',{source:items[index].capture,outputPaths:output}).then(function(result){results.push(verifyCaptures(result,output)[0]);return next(index+1);});
    }
    return next(0);
   }).then(function(){
    sameBoard(board,boardPath);verifyCaptures({captures:results},paths);
    items.forEach(function(item){if(JSON.stringify(board.getItem(item.id))!==JSON.stringify(item))throw new Error('A selected capture changed while After Effects was working. Retry with the current selection.');});
    board.beginTransaction();items.forEach(function(item,index){board.updateItem(item.id,{path:results[index].path,capture:results[index].capture,missing:false});});board.commitTransaction();hooks.render();report(items.length+' captures refreshed.');hooks.toast(items.length+' captures refreshed.');
   }).catch(function(error){captureError(error,paths);});});
  }
  function saveLink(board,link){
   board.setProjectLink(link);refresh();hooks.render();
   return Promise.resolve().then(function(){return hooks.save();}).then(function(saved){if(saved!==true)throw new Error('Project link changed, but board not saved. Retry Save.');report(link?'Project linked. Board saved.':'Project unlinked. Board saved.');},function(error){throw new Error('Project link changed, but board not saved. '+(error.message||String(error)));});
  }
  function linkProject(){if(!available())return Promise.resolve(false);var board=hooks.getBoard(),boardPath=hooks.boardPath();return run('Reading project to link…',function(){return readContext().then(function(data){sameBoard(board,boardPath);if(!data.projectPath)throw new Error('Save the active After Effects project before linking.');return saveLink(board,{path:data.projectPath,name:data.projectName});});});}
  function unlinkProject(){if(!available())return Promise.resolve(false);var board=hooks.getBoard();return run('Unlinking project…',function(){return saveLink(board,null);});}
  el('aeCaptureComp').onclick=function(){return capture('comp');};el('aeCaptureLayers').onclick=function(){return capture('layers');};el('aeCaptureWorkarea').onclick=function(){return capture('workarea');};
  el('aeSend').onclick=send;el('aeRefreshCapture').onclick=refreshCapture;
  el('aeLinkProject').onclick=linkProject;el('aeUnlinkProject').onclick=unlinkProject;
  el('aeReadContext').onclick=read;el('aeClose').onclick=function(){if(sampleScrub)sampleScrub.cancel();panel.hidden=true;};
  refresh(true);
  return{open:open,capture:capture,send:send,refreshCapture:refreshCapture,isBusy:function(){return busy;},isOpen:function(){return !panel.hidden;},refresh:refresh};
 }
 return{create:create};
});
