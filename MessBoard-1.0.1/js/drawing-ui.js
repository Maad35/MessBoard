/* Draw/Shape/Erase controller. All preview state is detached from BoardModel. */
(function(root){
 'use strict';
 var SHAPES=['rect','roundrect','ellipse','triangle','diamond','star'];
 var FIELDS={Color:'color',Width:'width',WidthNumber:'width',Style:'pattern',Stabilize:'stabilize',StabilizeNumber:'stabilize',DashLength:'dashLength',DashGap:'dashGap',Arrow:'arrow',ArrowSize:'arrowSize',FillEnabled:'fillEnabled',FillColor:'fillColor',OutlineEnabled:'outlineEnabled',Radius:'radius'};
 function copy(value){return JSON.parse(JSON.stringify(value));}
 function fresh(){return{appearanceVersion:2,color:'#4096f3',width:10,pattern:'solid',arrow:'none',arrowSize:1,dashLength:4,dashGap:2,fillEnabled:false,fillColor:'#4096f3',outlineEnabled:true,radius:12,stabilize:40};}
 function create(hooks){
  var doc=root.document,mode=null,returnMode=null,owner=null,id=null,draft=null,dirty=null,closing=false,baseItem=null,baseJSON=null;
  var defaults={draw:{tool:'pen',style:fresh()},shape:{tool:'rect',style:fresh()}};
  var numericHandles=[],session=0;
  function cancelNumeric(){numericHandles.forEach(function(handle){handle.cancel();});}
  function el(name){return doc.getElementById(name);}
  function eligible(){var b=hooks.board(),item=b.selection.length===1&&b.getItem(b.selection[0]);return item&&item.type==='drawing'&&item.strokes.length&&!item.hidden&&!item.locked&&(!item.groupId||item.groupId===b.editingGroup)&&b.transformableItems().indexOf(item)>=0?item:null;}
  function current(){var item=eligible();return owner===hooks.board()&&item&&item.id===id&&item===baseItem&&JSON.stringify(item)===baseJSON?item:null;}
  function remember(){baseItem=owner&&owner.getItem(id);baseJSON=baseItem?JSON.stringify(baseItem):null;}
  function mixed(){var item=mode==='edit'&&current();return !!item&&item.strokes.length>1;}
  function applicable(key){if(!mixed())return true;return ['color','width','pattern','dashLength','dashGap'].indexOf(key)>=0;}
  function value(){var item=mode==='edit'&&(draft||current());if(item)return{tool:item.strokes[0].tool,style:root.DrawingStyle.resolve(item.strokes[0])};var v=defaults[mode]&&copy(defaults[mode]);if(v&&dirty)v.style[dirty.key]=dirty.value;return v;}
  function prefix(){return mode==='edit'?'editStroke':mode==='draw'||mode==='shape'?mode:null;}
  function status(text){if(mode)el(mode==='edit'?'editDrawingStatus':prefix()+'Status').textContent=text||'';}
  function sync(){
   ['draw','shape'].forEach(function(name){var open=mode===name;el(name+'Panel').hidden=!open;el(name+'Btn').classList.toggle('active',open);el(name+'Btn').setAttribute('aria-pressed',String(open));el(name+'Btn').setAttribute('aria-expanded',String(open));});
   var erasing=mode==='erase',erase=el('eraseBtn'),hint=el('eraseStatus');erase.classList.toggle('active',erasing);erase.setAttribute('aria-pressed',String(erasing));hint.hidden=!erasing;hint.textContent=erasing?'Erase active — drawings & shapes only · Esc to stop':'';
   el('drawingEditPanel').hidden=mode!=='edit';if(!mode||erasing)return;
   var p=prefix(),v=value();if(!v)return;var s=v.style,multi=mixed(),shape=!multi&&SHAPES.indexOf(v.tool)>=0,heading=mode==='edit'?'drawingEditHeading':p+'Heading';
   el(heading).textContent=mode==='edit'?(shape?'Editing shape':'Editing drawing'):shape?'New shape':'New drawing';
   if(mode!=='edit')el(p+'Tool').value=v.tool;
   el(p+'Width').max=Math.max(64,s.width);el(p+'Width').min=Math.min(1,s.width);
   Object.keys(FIELDS).forEach(function(suffix){var node=el(p+suffix),key=FIELDS[suffix];if(!node)return;if(/Color$/.test(suffix))hooks.setWell(node.id,s[key]);else if(/Enabled$/.test(suffix))node.checked=s[key];else if(doc.activeElement!==node||!dirty)node.value=s[key];});
   if(multi){var styles=(draft||current()).strokes.map(root.DrawingStyle.resolve);Object.keys(FIELDS).forEach(function(suffix){var node=el(p+suffix),key=FIELDS[suffix];if(node&&styles.some(function(style){return style[key]!==s[key];})){if(/Color$/.test(suffix))node.textContent='Mixed';else if(!/Enabled$/.test(suffix)){node.value='';node.placeholder='Mixed';}}});}
   var stabFields=el('drawStabilizeFields');if(stabFields)stabFields.hidden=!(p==='draw'&&v.tool==='pen');el(p+'DashFields').hidden=s.pattern!=='dashed';el(p+'ArrowFields').hidden=shape||multi||s.arrow==='none';el(p+'RadiusFields').hidden=multi||v.tool!=='roundrect';el(p+'FillFields').hidden=!shape;el(p+'LineFields').hidden=shape||multi;
   var sample=el(p+'PatternSample');sample.setAttribute('data-pattern',s.pattern);var path=sample.querySelector('path');if(path)path.setAttribute('stroke-dasharray',s.pattern==='solid'?'none':s.pattern==='dashed'?(s.dashLength*2)+' '+(s.dashGap*2):'0 6');
   Object.keys(FIELDS).forEach(function(suffix){var node=el(p+suffix);if(node)node.disabled=false;});
   ['Color','Width','WidthNumber','Style','DashLength','DashGap'].forEach(function(suffix){el(p+suffix).disabled=shape&&!s.outlineEnabled;});el(p+'FillColor').disabled=!s.fillEnabled;
   ['Color','FillColor'].forEach(function(suffix){var well=el(p+suffix);if(well.parentNode&&well.parentNode.tagName==='BUTTON')well.parentNode.disabled=well.disabled;});
   el(mode==='edit'?'editDrawingHelp':p+'Help').textContent=multi?'Multiple strokes: only shared stroke fields are available. Changes apply to every stroke.':mode==='edit'?'Applies to this object only. Each change supports Undo.':shape?'Drag to place. Hold Shift for equal bounds.':'Drag to draw. Shift snaps a line to 45°. Escape cancels a gesture first.';
  }
  function cancel(repaint){var had=!!draft;draft=null;dirty=null;if(had&&repaint!==false)hooks.render();sync();}
  function close(){if(closing)return;closing=true;cancelNumeric();session++;hooks.cancelGesture();var had=!!draft;mode=null;returnMode=null;owner=null;id=null;draft=null;dirty=null;baseItem=null;baseJSON=null;pickerToken++;hooks.closeColor();sync();hooks.modeChanged(null);if(had)hooks.render();closing=false;}
  function open(next){if((hooks.busy&&hooks.busy())||!hooks.requireBoard())return false;close();hooks.prepare(next+'Panel');owner=hooks.board();mode=next==='shape'?'shape':'draw';sync();status('');hooks.modeChanged(mode);hooks.showToolbar();return true;}
  function toggleErase(){
   if(mode==='erase'){var next=owner===hooks.board()?returnMode:null;close();return next?open(next):true;}
   if((hooks.busy&&hooks.busy())||!hooks.requireBoard())return false;
   var previous=owner===hooks.board()&&(mode==='draw'||mode==='shape')?mode:null;close();hooks.prepare(null);owner=hooks.board();mode='erase';returnMode=previous;sync();hooks.modeChanged(mode);hooks.showToolbar();return true;
  }
  function edit(item){if(hooks.board().transaction||(hooks.busy&&hooks.busy())||!hooks.requireBoard())return false;var selected=eligible();if(!selected||(item&&item.id!==selected.id))return false;close();hooks.prepare('drawingEditPanel');mode='edit';owner=hooks.board();id=selected.id;remember();sync();status('');hooks.modeChanged(null);hooks.showToolbar();return true;}
  function valid(key,v){if(key==='pattern')return['solid','dashed','dotted'].indexOf(v)>=0;if(key==='arrow')return['none','start','end','both'].indexOf(v)>=0;if(/Enabled$/.test(key))return typeof v==='boolean';if(key==='color'||key==='fillColor')return /^#[0-9a-f]{6}$/i.test(v);return typeof v==='number'&&isFinite(v)&&(key==='width'?v>=1&&v<=64:key==='radius'?v>=0:key==='stabilize'?v>=0&&v<=100:v>0);}
  function patchFor(key,v){if(!mode||(mode==='edit'&&!current())||!applicable(key))return null;if(!valid(key,v)){status('Enter a valid value. Width is 1–64.');return null;}var s=value().style;if((key==='fillEnabled'&&!v&&!s.outlineEnabled)||(key==='outlineEnabled'&&!v&&!s.fillEnabled)){status('Keep Fill or Outline visible.');return null;}var patch={};patch[key]=v;status('');return patch;}
  function changed(item,patch){return item.strokes.some(function(s){var style=root.DrawingStyle.resolve(s);return Object.keys(patch).some(function(key){return style[key]!==patch[key];});});}
  function preview(key,v){var patch=patchFor(key,v);if(!patch)return false;dirty={key:key,value:v};if(mode==='edit'){var item=current();if(!item)return false;draft=root.DrawingGeometry.restyle(item,patch);hooks.render();}sync();return true;}
  function commit(key,v){var patch=patchFor(key,v);if(!patch){cancel();return false;}dirty=null;draft=null;if(mode!=='edit'){defaults[mode].style[key]=v;sync();return true;}var b=hooks.board(),item=current();if(!item||b.transaction)return false;if(!changed(item,patch)){sync();hooks.render();return false;}var next=root.DrawingGeometry.restyle(item,patch);b.beginTransaction();b.updateItem(id,next);b.commitTransaction();remember();hooks.render();sync();return true;}
  ['draw','shape','editStroke'].forEach(function(p){
   if(p!=='editStroke')el(p+'Tool').addEventListener('change',function(){if(mode!==p||(p==='shape'?SHAPES:['pen','line']).indexOf(this.value)<0)return;hooks.cancelGesture();defaults[p].tool=this.value;sync();});
   Object.keys(FIELDS).forEach(function(suffix){var node=el(p+suffix),key=FIELDS[suffix];if(!node||/Color$/.test(suffix))return;
    function read(){return /Enabled$/.test(suffix)?node.checked:(key==='pattern'||key==='arrow')?node.value:node.value===''?NaN:Number(node.value);}
    function accept(){if(node.__numericScrubbing||prefix()!==p||!mode)return;commit(key,read());}
    if(!/Enabled$/.test(suffix)&&key!=='pattern'&&key!=='arrow'){node.addEventListener('input',function(){if(node.__numericScrubbing)return;if(mode&&prefix()===p&&!preview(key,read()))dirty={key:key,value:NaN};});node.addEventListener('blur',function(){if(dirty&&dirty.key===key)accept();});}
    node.addEventListener('change',accept);
    if(root.NumericScrub&&['WidthNumber','DashLength','DashGap','ArrowSize','Radius'].indexOf(suffix)>=0){
     var saved=null;
     function available(){return prefix()===p&&owner===hooks.board()&&!owner.transaction&&!(hooks.busy&&hooks.busy())&&!el(p==='editStroke'?'drawingEditPanel':p+'Panel').hidden&&applicable(key)&&(mode!=='edit'||!!current());}
     function validScrub(){return !!saved&&session===saved.session&&available()&&owner===saved.owner&&id===saved.id&&JSON.stringify(owner.selection)===saved.selection;}
     numericHandles.push(root.NumericScrub.bind(node,{
      begin:function(){if(!available())return false;saved={session:session,owner:owner,id:id,selection:JSON.stringify(owner.selection),draft:draft,dirty:dirty,text:node.value};return true;},
      valid:function(){return saved?validScrub():available();},
      preview:function(value){if(validScrub())preview(key,value);},
      commit:function(value){if(!validScrub())return;saved=null;commit(key,value);},
      cancel:function(){var state=saved,valid=validScrub();saved=null;if(!state)return;if(!valid){draft=null;dirty=null;hooks.render();sync();return;}draft=state.draft;dirty=state.dirty;hooks.render();sync();node.value=state.text;}
     }));
    }
   });
  });
  el('eraseBtn').onclick=toggleErase;
  root.addEventListener('keydown',function(e){if(mode==='erase'&&e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();close();}},true);
  root.addEventListener('blur',function(){if(mode==='erase')close();});
  el('closeDraw').onclick=el('closeShape').onclick=el('closeDrawingEdit').onclick=close;
  ['drawPanel','shapePanel','drawingEditPanel'].forEach(function(id){var panel=el(id);
   panel.addEventListener('keydown',function(e){if(e.key==='Escape'){e.preventDefault();if(hooks.cancelGesture()){}else if(dirty||draft)cancel();else close();}else if(e.key==='Enter'&&dirty){e.preventDefault();commit(dirty.key,dirty.value);}e.stopPropagation();});
   panel.addEventListener('keyup',function(e){if(e.code!=='Space')e.stopPropagation();});
   ['copy','cut','paste'].forEach(function(type){panel.addEventListener(type,function(e){e.stopPropagation();if(!/^(INPUT|TEXTAREA)$/.test(e.target.tagName))e.preventDefault();});});
  });
  var pickerToken=0;
  function refresh(){
   if(mode==='edit'&&!current()){close();return;}
   if(mode&&owner&&owner!==hooks.board()){close();return;}
   if(mode&&hooks.busy&&hooks.busy()){close();return;}
   var selected=eligible(),button=el('drawingSettingsBtn');if(button){button.disabled=!selected;button.textContent=selected&&SHAPES.indexOf(selected.strokes[0].tool)>=0?'Shape settings…':'Drawing settings…';}
   if(mode)sync();
  }
  function openColor(target,button){
   if(!mode||target.indexOf(prefix())!==0||!el(target)||el(target).disabled)return false;hooks.closeColor();cancel();
   var key=/FillColor$/.test(target)?'fillColor':'color',v=value(),b=hooks.board(),m=mode,itemId=id,token=++pickerToken;
   function active(){return token===pickerToken&&mode===m&&hooks.board()===b&&id===itemId&&(m!=='edit'||!!current());}
   hooks.picker.open(v.style[key],button,function(color){if(active())preview(key,color);},function(accepted,color){if(!active())return;pickerToken++;if(accepted)commit(key,color);else cancel();});return true;
  }
  el('drawingSettingsBtn').onclick=function(){edit();};
  sync();
  return{open:open,edit:edit,close:close,refresh:refresh,toggleErase:toggleErase,isErasing:function(){return mode==='erase';},openColor:openColor,isOpen:function(){return !!mode;},snapshot:function(){return mode==='erase'?{tool:'eraser'}:defaults[mode]?copy(defaults[mode]):null;},item:function(item){return draft&&current()&&item.id===id?draft:item;}};
 }
 root.DrawingUI={create:create};if(typeof module==='object'&&module.exports)module.exports=root.DrawingUI;
}(this));
