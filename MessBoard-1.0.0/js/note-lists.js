/* Pure list transforms for note text. Plain-text markers keep the .messboard
 * format unchanged: a bulleted note is just text with '• ' / '1. ' prefixes.
 * Toggle semantics (Excel-like): if every non-empty line already has the marker,
 * remove it; otherwise add it to every non-empty line. Blank lines stay blank. */
(function(root,factory){var value=factory();root.NoteLists=value;if(typeof module==='object'&&module.exports)module.exports=value;})(this,function(){
 var BULLET=/^\s*[•·▪◦‣-]\s+/;
 var NUMBER=/^\s*\d+[.)]\s+/;
 function split(text){return String(text||'').replace(/\r\n?/g,'\n').split('\n');}
 function strip(line){return line.replace(BULLET,'').replace(NUMBER,'');}
 function hasMarker(lines,re){var any=false;for(var i=0;i<lines.length;i++){if(!lines[i].trim())continue;any=true;if(!re.test(lines[i]))return false;}return any;}
 function apply(text,marker){
  var lines=split(text),marked=hasMarker(lines,marker==='• '?BULLET:NUMBER),out=[],n=0;
  for(var i=0;i<lines.length;i++){
   var line=lines[i];
   if(!line.trim()){out.push(marked?'':'');continue;}
   line=strip(line);
   if(marked)out.push(line);
   else{if(marker!=='• ')n++;out.push((marker==='• '?'• ':n+'. ')+line);}
  }
  return out.join('\n');
 }
 return{
  bullets:function(text){return apply(text,'• ');},
  numbers:function(text){return apply(text,'num');},
  isBulleted:function(text){return hasMarker(split(text),BULLET);},
  isNumbered:function(text){return hasMarker(split(text),NUMBER);}
 };
});
