(function(root,factory){var value=factory();root.PathCodec=value;if(typeof module==='object'&&module.exports){module.exports=value;}})(this,function(){
 function encode(segment){return encodeURIComponent(segment);}
 function toFileUrl(path){
  var p=String(path),segments,host='';
  if(/^[\\/]{2}/.test(p)){
   // UNC: the first segment is an authority, not part of the path.
   segments=p.replace(/^[\\/]+/,'').replace(/\\/g,'/').split('/');
   host=encode(segments.shift()||'');
   return 'file://'+host+'/'+segments.map(encode).join('/');
  }
  if(/^[A-Za-z]:/.test(p)){
   segments=p.replace(/\\/g,'/').split('/');
   // The drive specifier must keep its colon unencoded.
   var drive=segments.shift();
   return 'file:///'+drive+'/'+segments.map(encode).join('/');
  }
  // POSIX: backslash is a legal filename character and stays inside a segment.
  segments=p.replace(/^\/+/,'').split('/');
  return 'file:///'+segments.map(encode).join('/');
 }
 function jsxString(value){return JSON.stringify(String(value)).replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');}
 return {toFileUrl:toFileUrl,jsxString:jsxString};
});
