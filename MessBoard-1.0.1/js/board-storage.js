(function(root,factory){var value=factory();root.BoardStorage=value;if(typeof module==='object'&&module.exports){module.exports=value;}})(this,function(){
 var WINDOWS='\\',POSIX='/';
 // Windows evidence: a drive letter, a UNC prefix, or an existing backslash.
 // A single leading slash is POSIX-absolute and outranks a backslash later in
 // the string, because backslash is a legal macOS filename character.
 function separator(p){
  if(/^[A-Za-z]:/.test(p)||/^[\\/]{2}/.test(p))return WINDOWS;
  if(/^\//.test(p))return POSIX;
  return /\\/.test(p)?WINDOWS:POSIX;
 }
 function normalize(input){
  var p=String(input);
  if(separator(p)!==WINDOWS)return p;
  p=p.replace(/\//g,WINDOWS);
  // A UNC path keeps exactly two leading separators.
  return /^\\{2,}/.test(p)?WINDOWS+WINDOWS+p.replace(/^\\+/,''):p;
 }
 // Raw .json/.aeref boards historically keep that suffix in their content root.
 function layoutFor(input){var p=normalize(input),sep=separator(String(input));if(!/\.(messboard|aeref\.json|json|aeref)$/i.test(p))p+='.messboard';var base=p.replace(/\.(messboard|aeref\.json)$/i,''),rootDir=base+'_files';return{boardPath:p,root:rootDir,pasted:rootDir+sep+'pasted',captures:rootDir+sep+'captures',assets:rootDir+sep+'assets',thumbs:rootDir+sep+'thumbs',autosave:rootDir+sep+'autosave.json'};}
 // Only the New workflow may change a supplied legacy extension.
 function newBoardPath(input){var p=normalize(input);return /\.messboard$/i.test(p)?p:p.replace(/\.(aeref\.json|json|aeref)$/i,'')+'.messboard';}
 // Backslash is a literal filename character on POSIX, so only split real separators.
 function displayName(input){var p=String(input),parts=separator(p)===WINDOWS?normalize(p).split(WINDOWS):p.split(POSIX);return parts.pop().replace(/\.(messboard|aeref\.json|json|aeref)$/i,'');}
 return{layoutFor:layoutFor,newBoardPath:newBoardPath,displayName:displayName};
});
