/* Reveal local reference files without shell interpolation. */
(function(root,factory){var value=factory();root.SourceLocation=value;if(typeof module==='object'&&module.exports)module.exports=value;}(this,function(){
 'use strict';
 function pathFor(item){
  if(!item||typeof item.path!=='string'||!item.path)return'';
  if(item.type==='image')return item.path;
  if(item.type==='link'&&item.provider==='local')return item.path;
  return'';
 }
 function label(platform){return platform==='darwin'?'Reveal in Finder':'Show in Explorer';}
 function command(platform,file){
  if(platform==='darwin')return{file:'/usr/bin/open',args:['-R',file]};
  return null;
 }
 function reveal(dependencies,file,done){
  done=typeof done==='function'?done:function(){};
  var platform=dependencies&&dependencies.platform,launch=command(platform,file),stat;
  if(platform!=='win32'&&!launch){done(new Error('Reveal is unsupported on this platform.'));return;}
  if(!dependencies||!dependencies.fs){done(new Error('Reveal is unavailable.'));return;}
  try{stat=dependencies.fs.statSync(file);}catch(error){done(new Error('Source file is missing.'));return;}
  if(!stat.isFile()){done(new Error('Source path is not a regular file.'));return;}
  if(platform==='win32'){
   if(typeof dependencies.execFile!=='function'){done(new Error('Reveal is unavailable.'));return;}
   // explorer.exe /select, never SHOpenFolderAndSelectItems: repeated calls
   // to that API from a short-lived process can close the Explorer window it
   // opened and leave the file unrevealable until a reboot (field-audited
   // 2026-10-21). Explorer opening its own window has no such state.
   // The /select token must reach explorer.exe verbatim: Node's automatic
   // argument quoting wraps the whole token in quotes, explorer's own parser
   // then rejects it and falls back to the Documents folder. Quote the path
   // inside the token ourselves and resolve it absolute first.
   var target=dependencies.path&&typeof dependencies.path.resolve==='function'?dependencies.path.resolve(file):file;
   dependencies.execFile('explorer.exe',['/select,"'+target+'"'],{shell:false,windowsHide:false,windowsVerbatimArguments:true},function(error){
    // explorer.exe exits 1 even when it opened the window; only a spawn
    // failure carries a string code such as 'ENOENT'.
    if(error&&typeof error.code==='string'){done(new Error('Unable to reveal the source file.'));return;}
    done(null);
   });
   return;
  }
  if(typeof dependencies.execFile!=='function'){done(new Error('Reveal is unavailable.'));return;}
  dependencies.execFile(launch.file,launch.args,{shell:false,windowsHide:true},function(error){done(error?new Error('Unable to reveal the source file.'):null);});
 }
 return{pathFor:pathFor,label:label,command:command,reveal:reveal};
}));
