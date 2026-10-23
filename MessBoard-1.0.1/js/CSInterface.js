(function(root){
 function CSInterface(){}
 CSInterface.prototype.evalScript=function(script,callback){if(root.__adobe_cep__)root.__adobe_cep__.evalScript(script,callback||function(){});else if(callback)callback(JSON.stringify({ok:false,error:'CEP host unavailable'}));};
 CSInterface.prototype.getSystemPath=function(type){
  var value=root.__adobe_cep__?root.__adobe_cep__.getSystemPath(type):'';
  // CEP returns a file URI on some hosts. Decode only that form, once; native
  // paths may legitimately contain a literal percent-encoded-looking filename.
  if(typeof value!=='string'||!/^file:\/\//i.test(value))return value;
  var match=/^file:\/\/([^/]*)(\/.*)$/i.exec(value);
  if(!match)return '';
  var authority=match[1],file=decodeURIComponent(match[2]);
  if(authority&&authority.toLowerCase()!=='localhost')return '//'+decodeURIComponent(authority)+file;
  return /^\/[a-z]:\//i.test(file)?file.slice(1):file;
 };
 CSInterface.prototype.openURLInDefaultBrowser=function(url){if(root.cep&&root.cep.util&&root.cep.util.openURLInDefaultBrowser)return root.cep.util.openURLInDefaultBrowser(url);return false;};
 CSInterface.SystemPath={EXTENSION:'extension',USER_DATA:'userData'};
 root.CSInterface=CSInterface;
})(this);
