(function(root,factory){var value=factory(root.FileDialogs||(typeof require==='function'?require('./file-dialogs.js'):null));root.FilesUI=value;if(typeof module==='object'&&module.exports)module.exports=value;})(this,function(FileDialogs){
 'use strict';
 function atomicWrite(fs,path,target,data,protectedPaths){
  var output=path.resolve(target);
  function key(p){return path.sep==='\\'?p.toLowerCase():p;}
  if((protectedPaths||[]).some(function(p){
   if(key(path.resolve(p))===key(output))return true;
   if(!fs.existsSync(output)||!fs.existsSync(p))return false;
   if(fs.realpathSync&&key(fs.realpathSync(output))===key(fs.realpathSync(p)))return true;
   if(fs.statSync){var a=fs.statSync(output,{bigint:true}),b=fs.statSync(p,{bigint:true});return a.ino!==undefined&&String(a.ino)!=='0'&&a.ino===b.ino&&a.dev===b.dev;}
   return false;
  }))throw new Error('Cannot overwrite a protected board or source image.');
  var temp=output+'.tmp-'+Date.now()+'-'+Math.random().toString(16).slice(2);
  try{fs.writeFileSync(temp,data,{flag:'wx'});fs.renameSync(temp,output);}catch(error){try{if(fs.existsSync(temp))fs.unlinkSync(temp);}catch(ignore){}throw error;}
 }
 function create(hooks){
  var panel=document.getElementById('filesPanel'),status=document.getElementById('filesStatus'),list=document.getElementById('missingList'),busy=false,activeJob=null,cancelButton=document.getElementById('cancelFileJob');
  if(cancelButton){cancelButton.hidden=true;cancelButton.onclick=function(){if(activeJob){activeJob.canceled=true;cancelButton.disabled=true;report('Cancel requested · waiting for safe cleanup…');}};}
  function report(message){status.textContent=message;}
  function available(){if(!hooks.requireBoard())return false;if(!hooks.assets()){report('File operations need the Adobe CEP Node runtime.');return false;}return true;}
  function lock(on){busy=on;panel.setAttribute('aria-busy',String(on));Array.prototype.forEach.call(panel.querySelectorAll('button:not(#closeFiles)'),function(b){b.disabled=on;});if(cancelButton){cancelButton.hidden=!activeJob;cancelButton.disabled=!activeJob||activeJob.canceled;}if(hooks.busyChanged)hooks.busyChanged(on);}
  function run(label,work){if(busy||!available()||(hooks.blocked&&hooks.blocked()))return;lock(true);report(label);setTimeout(function(){Promise.resolve().then(work).catch(function(error){report(error.message||String(error));}).then(function(){lock(false);});},20);}
  function runJob(label,work){
   if(busy||!available()||(hooks.blocked&&hooks.blocked()))return;
   var owner=hooks.board(),source=hooks.boardPath(),raw=typeof owner.toJSON==='function'?owner.toJSON():JSON.stringify(owner),snapshot=JSON.parse(raw),job={canceled:false};
   job.isCanceled=function(){return job.canceled||hooks.board()!==owner||hooks.boardPath()!==source;};
   job.onProgress=function(progress){if(activeJob!==job||job.canceled)return;report(label+' · '+progress.phase+' · '+progress.completed+(progress.total?'/'+progress.total:''));};
   job.current=function(){return hooks.board()===owner&&hooks.boardPath()===source;};
   activeJob=job;lock(true);report(label);
   setTimeout(function(){Promise.resolve().then(function(){if(job.isCanceled()){var e=new Error('Operation canceled.');e.code='CANCELED';throw e;}return work(snapshot,source,job);}).catch(function(error){report(error.code==='CANCELED'?'Operation canceled · no result applied.':error.message||String(error));}).then(function(){activeJob=null;lock(false);});},20);
  }
  function protectedPaths(){return[hooks.boardPath()].concat(hooks.board().items.filter(function(i){return i.type==='image';}).map(function(i){return i.path;}));}
  // One shared dialog layer. A canceled dialog returns null; a real failure throws
  // so run() reports it, and the two outcomes are never confused.
  function saveDialog(extension,label){
   var path=hooks.path(),base=path.basename(hooks.boardPath()).replace(/\.(messboard|aeref\.json|json|aeref)$/i,'');
   var result=hooks.dialogs().save({kind:extension,title:label,defaultDirectory:path.dirname(hooks.boardPath()),name:base,extension:extension,prompt:'File name'});
   if(result.status==='canceled')return null;
   if(result.status!=='chosen')throw result.error||new Error('The system file dialog is unavailable.');
   return result.path;
  }
  function openDialog(directory,title){
   var request={kind:directory?'search-folder':'relink-image',title:title,directory:directory?true:false,defaultDirectory:hooks.path().dirname(hooks.boardPath())};
   if(!directory)request.extensions=FileDialogs.IMAGE_EXTENSIONS;
   var result=hooks.dialogs().open(request);
   if(result.status==='canceled')return null;
   if(result.status!=='chosen')throw result.error||new Error('The system file dialog is unavailable.');
   return result.path;
  }
  function apply(updates){if(!updates.length)return;var b=hooks.board();b.beginTransaction();updates.forEach(function(u){b.updateItem(u.id,{path:u.path,missing:false});hooks.retryImage(u.id);});b.commitTransaction();hooks.render();}
  function scan(){var missing=hooks.assets().scanMissing(hooks.board(),hooks.boardPath()),map={};missing.forEach(function(m){map[m.id]=true;});hooks.board().items.forEach(function(i){if(i.type==='image'){if(i.missing&&!map[i.id])hooks.retryImage(i.id);i.missing=!!map[i.id];}});list.textContent='';missing.forEach(function(m){var row=document.createElement('div');row.className='missing-row';row.dataset.missingId=m.id;var text=document.createElement('span');text.textContent=m.name;text.title=m.path;row.appendChild(text);var button=document.createElement('button');button.textContent='Relink…';button.dataset.relinkId=m.id;row.appendChild(button);list.appendChild(row);});hooks.render();return missing;}
  function collect(ids){runJob('Collecting local images…',function(snapshot,source,job){var api=hooks.assets();return Promise.resolve(api.collectAsync(snapshot,source,ids,job)).then(function(r){if(!job.current())return report('Assets copied, but board changed · no paths applied.');apply(r.updates);var saved=hooks.save();scan();report(r.copied+' assets copied · '+r.reused+' reused. '+(saved?'Source files unchanged.':'Board not saved. Check the destination and retry Save.'));});});}
  document.getElementById('filesBtn').onclick=function(){if(!available())return;panel.hidden=false;hooks.showToolbar();try{var missing=scan();report(missing.length?missing.length+' missing references. Relink before collecting or packaging.':'All local images are available.');}catch(e){report(e.message);}};
  document.getElementById('closeFiles').onclick=function(){if(!busy)panel.hidden=true;};
  document.getElementById('collectAll').onclick=function(){collect();};
  document.getElementById('collectSelection').onclick=function(){var ids=hooks.board().selectedItems().filter(function(i){return i.type==='image';}).map(function(i){return i.id;});if(!ids.length)return report('Select one or more local images first.');collect(ids);};
  document.getElementById('scanMissing').onclick=function(){run('Checking references…',function(){report(scan().length+' missing references.');});};
  document.getElementById('batchRelink').onclick=function(){runJob('Searching folder…',function(snapshot,source,job){var folder=openDialog(true,'Find missing images in folder');if(!folder)return report('Folder search canceled.');var api=hooks.assets();return Promise.resolve(api.batchRelinkAsync(snapshot,source,folder,job)).then(function(r){if(job.isCanceled())return report('Folder search canceled · no paths applied.');apply(r.updates);scan();report(r.updates.length+' relinked · '+r.unresolved.length+' unresolved · '+r.ambiguous.length+' ambiguous. Duplicate names require manual relink.');});});};
  list.addEventListener('click',function(e){var button=e.target.closest('[data-relink-id]');if(!button)return;var id=button.dataset.relinkId;run('Choose replacement image…',function(){var file=openDialog(false,'Relink missing image');if(!file)return report('Relink canceled.');if(!hooks.fs().statSync(file).isFile())throw new Error('Replacement must be a file.');var item=hooks.board().getItem(id),old=item&&item.path;if(!old)return;var updates=hooks.board().items.filter(function(i){return i.type==='image'&&i.path===old;}).map(function(i){return{id:i.id,path:file};});apply(updates);scan();report(updates.length+' references relinked. Undo is available.');});});
  document.getElementById('exportPackage').onclick=function(){runJob('Preparing portable ZIP…',function(snapshot,source,job){var target=saveDialog('zip','Export board package');if(!target)return report('Package export canceled.');var api=hooks.assets();return Promise.resolve(api.exportPackageAsync(snapshot,source,target,job)).then(function(r){report('Package saved · '+r.files+' files. Extract ZIP, then open Board.messboard. Online media remain links.');},function(error){if(error.code==='EEXIST')return report('ZIP destination already exists · choose a new file name. Existing files are never replaced.');throw error;});});};
  document.getElementById('exportSelectionBoard').onclick=function(){
   if(busy||!available())return;
   var owner=hooks.board(),source=hooks.boardPath(),ids=owner.selection.slice();
   if(!ids.length)return report('Select one or more items first.');
   run('Exporting selection…',function(){
    if(hooks.board()!==owner||hooks.boardPath()!==source)return report('Selection export canceled: the board changed.');
    var path=hooks.path(),base=path.basename(source).replace(/\.(messboard|aeref\.json|json|aeref)$/i,''),result=hooks.dialogs().save({kind:'selection-board',title:'Export selection as board',defaultDirectory:path.dirname(source),name:base+' Selection',extension:'messboard',replaces:FileDialogs.BOARD_EXTENSIONS,prompt:'Board name'});
    if(result.status==='canceled')return report('Selection export canceled.');
    if(result.status!=='chosen')throw result.error||new Error('The system file dialog is unavailable.');
    if(hooks.board()!==owner||hooks.boardPath()!==source)return report('Selection export canceled: the board changed.');
    var exported=hooks.assets().exportSelection(owner,source,result.path,ids,hooks.frame?hooks.frame():undefined);
    report('Selection exported · '+exported.items+' items · '+exported.copied+' assets copied. Keep the board and companion folder together.');
   });
  };
  document.getElementById('exportPNG').onclick=function(){run('Rendering PNG…',function(){
   var b=hooks.board(),items=document.getElementById('exportScope').value==='selection'?b.selectedItems():b.items,snapshot=JSON.parse(JSON.stringify(items)),settings=JSON.parse(JSON.stringify(b.settings)),protectedSnapshot=protectedPaths(),target=saveDialog('png','Export board PNG');if(!target)return report('PNG export canceled.');
   return BoardExport.render(snapshot,{scale:Number(document.getElementById('exportScale').value),padding:24,background:document.getElementById('exportTransparent').checked?null:settings.background}).then(function(result){var data=result.canvas.toDataURL('image/png').split(',')[1];atomicWrite(hooks.fs(),hooks.path(),target,hooks.buffer(data,'base64'),protectedSnapshot.concat(protectedPaths()));report('PNG saved · '+result.canvas.width+' × '+result.canvas.height+(result.warnings.length?' · '+result.warnings.join(' · '):''));});
  });};
  return{isBusy:function(){return busy;},isOpen:function(){return !panel.hidden;}};
 }
 return{create:create,atomicWrite:atomicWrite};
});
