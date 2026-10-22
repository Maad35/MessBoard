/* Single-note inspector. Draft appearance never enters serialized board state. */
(function (root) {
 'use strict';
 function create(hooks) {
  var doc=root.document,panel=doc.getElementById('noteSettingsPanel'),search=doc.getElementById('noteFontSearch'),list=doc.getElementById('noteFontList'),size=doc.getElementById('noteFontSize'),status=doc.getElementById('noteFontStatus');
  var alignGroup=doc.getElementById('noteSettingsPanel').querySelector('.style-toggles[aria-label="Alignment"]'),orientationGroup=doc.getElementById('noteTextOrientation'),lineHeight=doc.getElementById('noteLineHeight'),letterSpacing=doc.getElementById('noteLetterSpacing'),paragraphSpacing=doc.getElementById('noteParagraphSpacing'),padding=doc.getElementById('notePadding'),cornerRadius=doc.getElementById('noteCornerRadius'),boldToggle=doc.getElementById('noteBold'),italicToggle=doc.getElementById('noteItalic'),underlineToggle=doc.getElementById('noteUnderline'),bulletList=doc.getElementById('noteBulletList'),numberList=doc.getElementById('noteNumberList');
  var owner=null,id=null,draft=null,sizeDirty=false,names=[],fontError=false,loading=false,closing=false;
  var fontQuery='',matches=[],shown=0;
  var trigger=doc.getElementById('noteSettingsBtn');
  var context=doc.createElement('button');context.dataset.command='note-settings';context.textContent='Note settings…';context.setAttribute('role','menuitem');
  var menu=doc.getElementById('contextMenu');menu.insertBefore(context,menu.querySelector('[data-command="edit-note"]'));
  function eligible(b) {
   var item=b.selection.length===1&&b.getItem(b.selection[0]);
   return item&&item.type==='note'&&!item.locked&&!item.hidden&&(!item.groupId||item.groupId===b.editingGroup)&&b.transformableItems().indexOf(item)>=0?item:null;
  }
  function current() {var b=hooks.board(),item=eligible(b);return b===owner&&item&&item.id===id?item:null;}
  function active() {return !panel.hidden&&!!current();}
  function sync() {
   var item=current();if(!item)return;
   var value=root.NoteStyle.style(draft||item);
   if(doc.activeElement!==search)search.value=value.fontFamily;
   if(doc.activeElement!==size)size.value=value.fontSize;
   if(doc.activeElement!==alignGroup)alignGroup.querySelectorAll('button[data-halign]').forEach(function(btn){btn.setAttribute('aria-pressed',btn.dataset.halign===value.align?'true':'false');});
   if(alignGroup)alignGroup.querySelectorAll('button[data-valign]').forEach(function(btn){btn.setAttribute('aria-pressed',btn.dataset.valign===value.valign?'true':'false');});
   if(orientationGroup)orientationGroup.querySelectorAll('button[data-orientation]').forEach(function(btn){btn.setAttribute('aria-pressed',btn.dataset.orientation===value.textOrientation?'true':'false');});
   if(doc.activeElement!==lineHeight)lineHeight.value=value.lineHeight;
   if(doc.activeElement!==letterSpacing)letterSpacing.value=value.letterSpacing;
   if(doc.activeElement!==paragraphSpacing)paragraphSpacing.value=value.paragraphSpacing;
   boldToggle.setAttribute('aria-pressed',value.bold?'true':'false');
   italicToggle.setAttribute('aria-pressed',value.italic?'true':'false');
   underlineToggle.setAttribute('aria-pressed',value.underline?'true':'false');
   if(doc.activeElement!==padding)padding.value=value.padding;
   if(doc.activeElement!==cornerRadius)cornerRadius.value=value.cornerRadius;
   hooks.setWell('noteBackground',value.background||'#292a25');hooks.setWell('noteTextColor',value.color);
  }
  function cancel(repaint) {var had=!!draft;draft=null;sizeDirty=false;if(had&&repaint!==false)hooks.render();sync();}
  function measuredPatch(item,patch){var target=Object.assign({},item,patch),next=Object.assign({},patch),vertical=root.NoteStyle.style(target).textOrientation==='vertical';next[vertical?'width':'height']=hooks.measure(target);return next;}
  function preview(patch) {
   var item=current();if(!item||panel.hidden)return false;
   if(patch.fontFamily!==undefined||patch.fontSize!==undefined||patch.lineHeight!==undefined||patch.letterSpacing!==undefined||patch.paragraphSpacing!==undefined||patch.textOrientation!==undefined)patch=measuredPatch(item,patch);
   draft=Object.assign({},item,patch);
   hooks.render();return true;
  }
  function commit(patch) {
   var b=hooks.board(),item=current();if(!item)return false;
   var next=Object.assign({},patch);
   var before=root.NoteStyle.style(item);
   if((next.fontFamily!==undefined&&next.fontFamily!==before.fontFamily)||(next.fontSize!==undefined&&next.fontSize!==before.fontSize)||(next.lineHeight!==undefined&&next.lineHeight!==before.lineHeight)||(next.letterSpacing!==undefined&&next.letterSpacing!==before.letterSpacing)||(next.paragraphSpacing!==undefined&&next.paragraphSpacing!==before.paragraphSpacing)||(next.textOrientation!==undefined&&next.textOrientation!==before.textOrientation))next=measuredPatch(item,next);
   draft=null;
   var changed=b.setNoteStyle(id,next);hooks.render();sync();return changed;
  }
  function close() {
   if(closing)return;closing=true;if(sizeScrub)sizeScrub.cancel();sizeSnapshot=null;panel.hidden=true;draft=null;sizeDirty=false;owner=null;id=null;list.hidden=true;search.setAttribute('aria-expanded','false');
   hooks.closeColor();hooks.render();closing=false;
  }
  function refresh() {
   var item=eligible(hooks.board()),disabled=!item||hooks.busy();trigger.disabled=disabled;context.hidden=disabled;
   if(owner&&(!current()||panel.hidden||hooks.busy())){close();return;}
   if(!panel.hidden)sync();
  }
  function fontStatus() {
   if(loading){status.textContent='Loading installed fonts…';return;}
   var info=fontError?'Font list unavailable; common fonts shown.':names.length+' installed font families.';
   if(!list.hidden)info+=!matches.length?' No matching fonts. Try another name.':fontQuery?' '+matches.length+' matches.':'';
   if(!list.hidden&&shown<matches.length)info+=' Scroll for more.';
   status.textContent=info;
  }
  function appendFonts() {
   var end=Math.min(shown+60,matches.length),fragment=doc.createDocumentFragment();
   for(;shown<end;shown++){var name=matches[shown],button=doc.createElement('button');button.type='button';button.textContent=name;button.title=name;button.dataset.font=name;button.style.fontFamily=root.NoteStyle.cssFamily(name);fragment.appendChild(button);}
   list.appendChild(fragment);fontStatus();
  }
  function results() {
   if(!active())return;
   var query=fontQuery.toLowerCase();matches=names.filter(function(name){return name.toLowerCase().indexOf(query)>=0;});
   list.textContent='';list.scrollTop=0;shown=0;
   list.hidden=false;search.setAttribute('aria-expanded','true');appendFonts();
  }
  function browseFonts(){fontQuery='';search.select();results();}
  function open() {
   if(hooks.busy()||!hooks.requireBoard())return;
   var item=eligible(hooks.board());if(!item)return;
   // Finish native inline text editing before inspecting its style.
   if(doc.activeElement&&doc.activeElement.isContentEditable)doc.activeElement.blur();
   hooks.prepare();if(sizeScrub)sizeScrub.cancel();sizeSnapshot=null;sizeDirty=false;owner=hooks.board();id=item.id;draft=null;panel.hidden=false;list.hidden=true;
   search.value=root.NoteStyle.family(item.fontFamily);size.value=root.NoteStyle.style(item).fontSize;sync();hooks.showToolbar();
   loading=true;status.textContent='Loading installed fonts…';
   hooks.catalog.load(function(error,fonts){loading=false;fontError=!!error;names=fonts||[];if(!active())return;if(!list.hidden)results();else fontStatus();});
  }
  function openColor(target,button) {
   if(!active())return;cancel();hooks.closeColor();
   var item=current(),b=owner,noteId=id,key=target==='noteBackground'?'background':'color',original=root.NoteStyle.style(item)[key]||'#292a25';
   hooks.picker.open(original,button,function(color){if(owner!==b||id!==noteId||!active())return;var patch={};patch[key]=color;preview(patch);},function(accepted,color){
    if(owner!==b||id!==noteId||!active())return;
    if(accepted){var patch={};patch[key]=color;commit(patch);}else cancel();
   });
  }
  trigger.onclick=open;
  context.addEventListener('click',function(e){e.stopPropagation();menu.hidden=true;open();});
  doc.getElementById('closeNoteSettings').onclick=close;
  size.addEventListener('input',function(){if(size.__numericScrubbing)return;sizeDirty=true;var value=Number(size.value);if(size.value&&isFinite(value)&&value>=1&&value<=512)preview({fontSize:value});});
  var sizeSnapshot=null,sizeScrub=null;
  function validSizeScrub(){return !!sizeSnapshot&&active()&&!hooks.busy()&&!owner.transaction&&owner===sizeSnapshot.owner&&id===sizeSnapshot.id&&current()===sizeSnapshot.item&&JSON.stringify(current())===sizeSnapshot.json;}
  if(root.NumericScrub)sizeScrub=root.NumericScrub.bind(size,{
   begin:function(){if(!active()||hooks.busy()||owner.transaction)return false;sizeSnapshot={owner:owner,id:id,item:current(),json:JSON.stringify(current()),draft:draft,sizeDirty:sizeDirty,text:size.value};return true;},
   valid:function(){return sizeSnapshot?validSizeScrub():active()&&!hooks.busy()&&!owner.transaction;},
   preview:function(value){if(validSizeScrub())preview({fontSize:value});},
   commit:function(value){if(!validSizeScrub())return;sizeSnapshot=null;sizeDirty=false;commit({fontSize:value});size.value=root.NoteStyle.style(current()).fontSize;},
   cancel:function(){var saved=sizeSnapshot,valid=validSizeScrub();sizeSnapshot=null;if(!saved)return;if(!valid){draft=null;sizeDirty=false;hooks.render();sync();return;}draft=saved.draft;sizeDirty=saved.sizeDirty;hooks.render();sync();size.value=saved.text;}
  });
  function acceptSize(){if(size.__numericScrubbing||!sizeDirty)return;sizeDirty=false;var value=Number(size.value);if(size.value&&isFinite(value)&&value>=1&&value<=512)commit({fontSize:value});else cancel();var item=current();if(item)size.value=root.NoteStyle.style(item).fontSize;}
  size.addEventListener('change',acceptSize);
  size.addEventListener('blur',acceptSize);
  size.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();acceptSize();}else if(e.key==='Escape'){e.preventDefault();e.stopPropagation();cancel();if(current())size.value=root.NoteStyle.style(current()).fontSize;}});
  // Text layout controls: live preview on input, one undoable commit on change.
  // Alignment: 7 icon buttons in one Excel-like group (4 horizontal + 3 vertical).
  alignGroup.querySelectorAll('button[data-halign]').forEach(function(btn){
   btn.addEventListener('click',function(){commit({align:btn.dataset.halign});});
  });
  alignGroup.querySelectorAll('button[data-valign]').forEach(function(btn){
   btn.addEventListener('click',function(){commit({valign:btn.dataset.valign});});
  });
  orientationGroup.querySelectorAll('button[data-orientation]').forEach(function(btn){
   btn.addEventListener('click',function(){commit({textOrientation:btn.dataset.orientation});});
  });
  // List toggles: transform the text (plain-text markers), one undoable commit.
  function applyList(kind){
   var item=current();if(!item)return false;
   var text=item.text||'',next=root.NoteLists[kind](text);
   if(next===text)return false;
   var b=hooks.board();
   b.beginTransaction();b.updateItem(id,{text:next});b.commitTransaction();
   draft=null;hooks.render();sync();return true;
  }
  bulletList.addEventListener('click',function(){applyList('bullets');syncListButtons();});
  numberList.addEventListener('click',function(){applyList('numbers');syncListButtons();});
  function syncListButtons(){
   var item=current();if(!item)return;
   bulletList.setAttribute('aria-pressed',root.NoteLists.isBulleted(item.text)?'true':'false');
   numberList.setAttribute('aria-pressed',root.NoteLists.isNumbered(item.text)?'true':'false');
  }
  [[boldToggle,'bold'],[italicToggle,'italic'],[underlineToggle,'underline']].forEach(function(spec){
   var node=spec[0],key=spec[1];
   node.addEventListener('click',function(){commit((function(){var p={};p[key]=!node.getAttribute('aria-pressed')||node.getAttribute('aria-pressed')==='false';return p;})());});
  });
  [[lineHeight,'lineHeight',.8,3,0.05],[letterSpacing,'letterSpacing',-5,20,0.5],[paragraphSpacing,'paragraphSpacing',0,96,1],[padding,'padding',0,64,1],[cornerRadius,'cornerRadius',0,64,1]].forEach(function(spec){
   var node=spec[0],key=spec[1],min=spec[2],max=spec[3],step=spec[4],dirty=false,snapshot=null,scrub=null;
   function patchOf(value){var p={};p[key]=value;return p;}
   function styleNow(item){return root.NoteStyle.style(item)[key];}
   function validScrub(){return !!snapshot&&active()&&!hooks.busy()&&!owner.transaction&&owner===snapshot.owner&&id===snapshot.id&&current()===snapshot.item&&JSON.stringify(current())===snapshot.json;}
   node.addEventListener('input',function(){if(node.__numericScrubbing)return;dirty=true;var value=Number(node.value);if(node.value!==''&&isFinite(value)&&value>=min&&value<=max)preview(patchOf(value));});
   function accept(){if(node.__numericScrubbing||!dirty)return;dirty=false;var value=Number(node.value);if(node.value!==''&&isFinite(value)&&value>=min&&value<=max)commit(patchOf(value));else cancel();var item=current();if(item)node.value=styleNow(item);}
   node.addEventListener('change',accept);
   node.addEventListener('blur',accept);
   node.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();accept();}else if(e.key==='Escape'){e.preventDefault();e.stopPropagation();cancel();var item=current();if(item)node.value=styleNow(item);}});
   if(root.NumericScrub)scrub=root.NumericScrub.bind(node,{
    begin:function(){if(!active()||hooks.busy()||owner.transaction)return false;snapshot={owner:owner,id:id,item:current(),json:JSON.stringify(current()),draft:draft,dirty:dirty,text:node.value};return true;},
    valid:function(){return snapshot?validScrub():active()&&!hooks.busy()&&!owner.transaction;},
    preview:function(value){if(validScrub())preview(patchOf(value));},
    commit:function(value){if(!validScrub())return;snapshot=null;dirty=false;commit(patchOf(value));var item=current();if(item)node.value=styleNow(item);},
    cancel:function(){var saved=snapshot,valid=validScrub();snapshot=null;if(!saved)return;if(!valid){draft=null;dirty=false;hooks.render();sync();return;}draft=saved.draft;dirty=saved.dirty;hooks.render();sync();node.value=saved.text;}
   });
  });
  function dismissFonts(){cancel();list.hidden=true;search.setAttribute('aria-expanded','false');var item=current();if(item)search.value=root.NoteStyle.family(item.fontFamily);}
  search.addEventListener('focus',browseFonts);
  search.addEventListener('click',function(){if(list.hidden)browseFonts();});
  search.addEventListener('input',function(){fontQuery=search.value;cancel();results();});
  search.addEventListener('keydown',function(e){
   if(e.key==='ArrowDown'){e.preventDefault();if(list.hidden)results();if(list.firstChild)list.firstChild.focus();}
   else if(e.key==='Enter'){e.preventDefault();var value=search.value.toLowerCase(),exact=names.filter(function(name){return name.toLowerCase()===value;})[0];if(exact){commit({fontFamily:exact});list.hidden=true;search.setAttribute('aria-expanded','false');}else results();}
   else if(e.key==='Escape'){e.preventDefault();e.stopPropagation();dismissFonts();}
  });
  list.addEventListener('focusin',function(e){if(e.target.dataset.font)preview({fontFamily:e.target.dataset.font});});
  list.addEventListener('click',function(e){if(!e.target.dataset.font)return;commit({fontFamily:e.target.dataset.font});list.hidden=true;search.setAttribute('aria-expanded','false');search.value=root.NoteStyle.family(current().fontFamily);search.focus();list.hidden=true;search.setAttribute('aria-expanded','false');});
  list.addEventListener('scroll',function(){if(active()&&!list.hidden&&list.scrollTop+list.clientHeight>=list.scrollHeight-24&&shown<matches.length)appendFonts();});
  list.addEventListener('keydown',function(e){var buttons=Array.prototype.slice.call(list.children),index=buttons.indexOf(e.target);if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(e.key==='ArrowDown'&&index===buttons.length-1&&shown<matches.length){appendFonts();buttons=Array.prototype.slice.call(list.children);}var next=Math.max(0,Math.min(buttons.length-1,index+(e.key==='ArrowDown'?1:-1)));if(buttons[next])buttons[next].focus();}else if(e.key==='Escape'){e.preventDefault();e.stopPropagation();dismissFonts();search.focus();}});
  doc.addEventListener('mousedown',function(e){if(panel.hidden||list.hidden)return;if(e.target===search||e.target===list||list.contains(e.target))return;dismissFonts();});
  doc.addEventListener('focusin',function(e){if(!owner||!draft)return;var item=current();if(!item){cancel();return;}if(draft.fontFamily!==item.fontFamily&&!list.contains(e.target)&&e.target!==search){cancel();return;}if(panel.contains(e.target)||doc.getElementById('colorPopover').contains(e.target))return;cancel();},true);
  panel.addEventListener('keydown',function(e){if(e.key==='Escape'){e.preventDefault();close();}e.stopPropagation();});
  panel.addEventListener('keyup',function(e){if(e.code!=='Space')e.stopPropagation();});
  ['copy','cut','paste'].forEach(function(type){panel.addEventListener(type,function(e){e.stopPropagation();if(e.target.tagName!=='INPUT')e.preventDefault();});});
  return {open:open,close:close,refresh:refresh,isOpen:active,openColor:openColor,item:function(item){return draft&&active()&&item.id===id?draft:item;}};
 }
 root.NoteUI={create:create};
 if(typeof module==='object'&&module.exports)module.exports=root.NoteUI;
}(this));
