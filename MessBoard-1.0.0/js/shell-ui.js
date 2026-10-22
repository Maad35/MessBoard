(function(root,factory){var value=factory(root);root.ShellUI=value;if(typeof module==='object'&&module.exports)module.exports=value;})(this,function(root){
 'use strict';
 function create(hooks){
  hooks=hooks||{};
  var doc=root.document,menu=doc.getElementById('contextMenu'),opener=null,activeMenu=null,panelOpener=null,canvasContext=false;
  var groups=[],contextButtons=Array.prototype.slice.call(menu.querySelectorAll('[data-command]'));
  var canvasCommands=['add','paste','paste-items','text','draw','shape','erase','fit','grid','canvas-settings','capture','items'];
  var contextHidden=contextButtons.map(function(button){return button.hidden;});
  var path=[],hoverTimer=null,closeTimer=null,refreshing=false,pointer=null,swallowedKeys={};
  var panels=Array.prototype.slice.call(doc.querySelectorAll('.tool-panel'));
  var triggers={settingsBtn:'settingsPanel',arrangeBtn:'arrangePanel',itemsBtn:'itemsPanel',filesBtn:'filesPanel',drawBtn:'drawPanel',shapeBtn:'shapePanel',drawingSettingsBtn:'drawingEditPanel',aeBtn:'aePanel',noteSettingsBtn:'noteSettingsPanel',preferencesBtn:'preferencesPanel',shortcutsBtn:'shortcutsPanel',aboutBtn:'aboutPanel',propertiesBtn:'propertiesPanel'};
  var commandPanels={arrange:'arrangePanel',items:'itemsPanel','edit-drawing':'drawingEditPanel','note-settings':'noteSettingsPanel','canvas-settings':'settingsPanel',properties:'propertiesPanel',draw:'drawPanel',shape:'shapePanel',preferences:'preferencesPanel',shortcuts:'shortcutsPanel',about:'aboutPanel'};
  function each(nodes,fn){Array.prototype.forEach.call(nodes,fn);}
  function cropping(){return hooks.cropActive&&hooks.cropActive();}
  function editing(node){return !!(node&&(node.isContentEditable||node.closest&&node.closest('input,textarea,select,[contenteditable="true"]')));}
  function shellPanel(node){return node&&node.closest&&node.closest('#propertiesPanel,#preferencesPanel,#shortcutsPanel,#aboutPanel');}
  function cancelTimers(){root.clearTimeout(hoverTimer);root.clearTimeout(closeTimer);hoverTimer=null;closeTimer=null;}
  function trimPath(length){
   while(path.length>length){var entry=path.pop();entry.menu.hidden=true;if(entry.button)entry.button.setAttribute('aria-expanded','false');if(entry.inline&&path.length)path[path.length-1].menu.hidden=false;}
  }
  function back(){if(path.length<2)return;var button=path[path.length-1].button;cancelTimers();trimPath(path.length-1);button.focus();}
  function closeMenus(restore){
   cancelTimers();trimPath(0);
   each(doc.querySelectorAll('.command-menu'),function(node){node.hidden=true;});
   each(doc.querySelectorAll('[data-menu]'),function(node){node.setAttribute('aria-expanded','false');});
   activeMenu=null;pointer=null;
   if(restore&&opener)opener.focus();
  }
  function depthOf(container){for(var i=0;i<path.length;i++)if(path[i].menu===container)return i;return -1;}
  function openSubmenu(button,focus){
   if(cropping())return;
   var parent=button.closest('.command-menu'),depth=depthOf(parent),target=doc.getElementById(button.dataset.submenu);
   if(depth<0||!target||button.disabled||button.hidden)return;
   if(activeMenu!==menu)refreshGlobal();
   cancelTimers();trimPath(depth+1);target.hidden=false;button.setAttribute('aria-expanded','true');
   target.classList.add('editor-menu','editor-flyout');doc.body.appendChild(target);
   var rect=parent.getBoundingClientRect(),row=button.getBoundingClientRect(),backButton=target.querySelector('[data-menu-back]');
   if(!backButton){backButton=doc.createElement('button');backButton.type='button';backButton.dataset.menuBack='true';backButton.className='editor-menu-back';backButton.textContent='Back';backButton.setAttribute('role','menuitem');target.insertBefore(backButton,target.firstChild);}
   backButton.hidden=true;constrain(target);
   var width=target.offsetWidth,right=rect.right+4,left=rect.left-width-4,inline=right+width>root.innerWidth-4&&left<4;
   backButton.hidden=!inline;target.classList.toggle('editor-menu-inline',inline);
   place(target,inline?rect.left:right+width<=root.innerWidth-4?right:left,inline?rect.top:row.top);
   if(inline)parent.hidden=true;
   path.push({menu:target,button:button,inline:inline,origin:pointer});
   if(focus){var options=choices(target);if(options.length)options[0].focus();}
  }
  function closePanels(except){
   if(hooks.closeColor)hooks.closeColor();else doc.getElementById('colorPopover').hidden=true;
   panels.forEach(function(panel){if(panel.id!==except&&!panel.hidden){if(panel.id==='drawPanel'||panel.id==='shapePanel'||panel.id==='drawingEditPanel')hooks.stopDrawing();else if(panel.id==='noteSettingsPanel'&&hooks.closeNote)hooks.closeNote();else panel.hidden=true;}});
   syncPanels();
  }
  function syncPanels(){
   Object.keys(triggers).forEach(function(id){var button=doc.getElementById(id),panel=doc.getElementById(triggers[id]);if(button&&panel){button.setAttribute('aria-expanded',String(!panel.hidden));button.setAttribute('aria-controls',panel.id);}});
  }
  function position(node,anchor){
   var r=anchor.getBoundingClientRect();constrain(node);
   place(node,r.left,r.bottom+4+node.offsetHeight>root.innerHeight-4&&r.top-node.offsetHeight-4>=4?r.top-node.offsetHeight-4:r.bottom+4);
  }
  function constrain(node){node.style.maxWidth=Math.max(0,root.innerWidth-8)+'px';node.style.maxHeight=Math.max(0,root.innerHeight-8)+'px';node.style.right='auto';}
  function place(node,x,y){constrain(node);node.style.left=Math.max(4,Math.min(x,root.innerWidth-node.offsetWidth-4))+'px';node.style.top=Math.max(4,Math.min(y,root.innerHeight-node.offsetHeight-4))+'px';}
  function choices(container){return Array.prototype.filter.call(container.querySelectorAll('button'),function(node){return !node.disabled&&!node.hidden&&node.getClientRects().length;});}
  function openMenu(button,focus){
   if(cropping())return;
   var target=doc.getElementById(button.dataset.menu),same=activeMenu===target;
   closeMenus(false);menu.hidden=true;
   if(!target||same&&!focus)return;
   refreshGlobal();target.classList.add('editor-menu');target.classList.remove('editor-flyout');target.classList.remove('editor-menu-inline');
   var backButton=target.querySelector('[data-menu-back]');if(backButton)backButton.hidden=true;
   opener=button;activeMenu=target;target.hidden=false;button.setAttribute('aria-expanded','true');hooks.showToolbar();position(target,button);
   path=[{menu:target,button:button}];
   refreshProxies(target);
   if(focus){var nodes=choices(target);if(nodes.length)nodes[0].focus();}
  }
  each(doc.querySelectorAll('[data-menu]'),function(button){
   button.setAttribute('aria-haspopup','menu');button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls',button.dataset.menu);
   button.addEventListener('click',function(){openMenu(button,false);});
  });
  each(doc.querySelectorAll('.command-menu button'),function(button){button.setAttribute('role','menuitem');});
  function refreshProxies(container){each(container.querySelectorAll('[data-activate]'),function(proxy){var action=doc.getElementById(proxy.dataset.activate);proxy.disabled=!action||action.disabled;});}
  function refreshGlobal(){if(refreshing)return;refreshing=true;try{if(hooks.refreshCommands)hooks.refreshCommands();}finally{refreshing=false;}}
  function group(title,names){
   var flyout=doc.createElement('div'),button=doc.createElement('button');
   flyout.id='editor-context-'+groups.length;flyout.className='editor-flyout command-menu editor-menu';flyout.hidden=true;flyout.setAttribute('role','menu');flyout.setAttribute('aria-label',title);
   button.type='button';button.textContent=title;button.dataset.submenu=flyout.id;button.className='editor-submenu';button.setAttribute('aria-haspopup','menu');button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls',flyout.id);
   var children=contextButtons.filter(function(node){return names.indexOf(node.dataset.command)>=0;});
   children.forEach(function(node){flyout.appendChild(node);});
   menu.appendChild(button);doc.body.appendChild(flyout);groups.push({button:button,menu:flyout,children:children});
  }
  // Keep editing commands directly reachable; disclose less-frequent commands by task.
  each(menu.querySelectorAll(':scope > span'),function(divider){divider.parentNode.removeChild(divider);});
  menu.classList.add('editor-menu','command-menu');
  group('Organize',['group','ungroup','enter-group','exit-group','lock','hide','items']);
  group('Stack order',['front','forward','backward','back']);
  group('After Effects',['capture','send','replace']);

  var heading=doc.createElement('div');heading.className='menu-heading';menu.insertBefore(heading,menu.firstChild);
  (function(){
   var sepAfter=['arrange','hide','back','properties'];
   each(menu.querySelectorAll(':scope > button'),function(btn){
    var cmd=btn.dataset.command;
    if(sepAfter.indexOf(cmd)>=0){
     var sep=doc.createElement('span');
     btn.parentNode.insertBefore(sep,btn.nextSibling);
    }
   });
  })();
  var remove=menu.querySelector('[data-command="delete"]');if(remove)menu.appendChild(remove);
  each(menu.querySelectorAll('button'),function(button){button.setAttribute('role','menuitem');});
  function refreshContext(){
   // BoardUI queries #contextMenu. Temporarily reattach portals synchronously
   // so its existing rules and dynamic labels see the original nodes, not clones.
   if(hooks.configureContext){
    contextButtons.forEach(function(button,index){button.hidden=contextHidden[index];});
    groups.forEach(function(entry){menu.appendChild(entry.menu);});
    try{hooks.configureContext(canvasContext);}finally{groups.forEach(function(entry){doc.body.appendChild(entry.menu);});}
    contextHidden=contextButtons.map(function(button){return button.hidden;});
   }
   var items=hooks.board?hooks.board().selectedItems():[];
   heading.textContent=canvasContext||!items.length?'Canvas':items.length+' selected';
   contextButtons.forEach(function(button,index){var name=button.dataset.command;button.hidden=contextHidden[index]||['save','open','recover','new','save-as'].indexOf(name)>=0||(canvasContext&&canvasCommands.indexOf(name)<0);});
   groups.forEach(function(entry){entry.button.hidden=!entry.children.some(function(button){return !button.hidden;});});
   repairPath();
  }
  function repairPath(){
   for(var i=1;i<path.length;i++){if(path[i].button.hidden||path[i].button.disabled){cancelTimers();trimPath(i);break;}}
   if(path.length&&containsMenu(doc.activeElement)&&!doc.activeElement.getClientRects().length){var options=choices(path[path.length-1].menu);if(options.length)options[0].focus();}
   path.forEach(function(entry){if(!entry.menu.hidden)place(entry.menu,parseFloat(entry.menu.style.left)||4,parseFloat(entry.menu.style.top)||4);});
  }
  function switchTop(direction){
   if(!activeMenu||activeMenu===menu||path.length!==1)return;
   var buttons=Array.prototype.filter.call(doc.querySelectorAll('[data-menu]'),function(button){return !button.disabled&&!button.hidden&&button.getClientRects().length&&button.parentNode===opener.parentNode;});
   var index=buttons.indexOf(opener);if(index>=0&&buttons.length>1)openMenu(buttons[(index+direction+buttons.length)%buttons.length],true);
  }
  function containsMenu(node){return !!(node&&node.closest&&node.closest('.editor-menu,.command-menu,#contextMenu'));}
  function closeContext(restore){if(activeMenu===menu||!menu.hidden)closeMenus(restore);}
  function refresh(){if(refreshing)return;refreshing=true;try{if(activeMenu===menu||!menu.hidden)refreshContext();else if(hooks.refreshCommands)hooks.refreshCommands();each(doc.querySelectorAll('.command-menu'),refreshProxies);repairPath();syncToolbar();syncPanels();}finally{refreshing=false;}}
  function syncToolbar(){
   each(doc.querySelectorAll('.toolstrip'),function(strip){each(strip.querySelectorAll('button'),function(button){
    button.classList.toggle('editor-has-icon',!!button.querySelector('svg'));
    var label=button.textContent.trim();if(!button.getAttribute('aria-label')&&label)button.setAttribute('aria-label',label);
    if(!button.getAttribute('title')&&label)button.setAttribute('title',label);
   });});
  }
  function openContext(event,canvas){
   if(cropping()||editing(event.target))return false;
   if(event.preventDefault)event.preventDefault();
   closeMenus(false);canvasContext=!!canvas;opener=hooks.viewport;activeMenu=menu;
   refreshContext();menu.hidden=false;if(hooks.showToolbar)hooks.showToolbar();
   path=[{menu:menu,button:null}];
   place(menu,event.clientX,event.clientY);
   return true;
  }
  doc.addEventListener('mousedown',function(e){if(!e.target.closest('.command-menu,[data-menu]'))closeMenus(false);},true);
  doc.addEventListener('click',function(e){
   var button=e.target.closest('button');if(!button)return;
   if(cropping()&&(containsMenu(button)||button.dataset.menu||button.dataset.command)){e.preventDefault();e.stopImmediatePropagation();closeMenus(false);return;}
   if(button.disabled||button.hidden)return;
   if(button.dataset.menuBack){e.preventDefault();e.stopImmediatePropagation();back();return;}
   if(button.dataset.submenu){e.preventDefault();e.stopImmediatePropagation();openSubmenu(button,true);return;}
   if(button.dataset.menu)return;
   if(button.dataset.activate){
    e.preventDefault();e.stopImmediatePropagation();var proxyTarget=doc.getElementById(button.dataset.activate);
    closeMenus(false);if(proxyTarget&&proxyTarget!==button&&!proxyTarget.disabled)proxyTarget.click();syncPanels();return;
   }
   var id=button.dataset.activate||button.id,command=button.dataset.command,target=triggers[id];
   if(commandPanels[command])target=commandPanels[command];
   if(hooks.stopErasing&&id!=='eraseBtn'&&command!=='erase'&&(command||target||button.closest('.rail')||containsMenu(button)))hooks.stopErasing();
   if(target){if(hooks.stopText)hooks.stopText();panelOpener=button;closePanels(target);}
   if(id==='noteBtn'||id==='cropBtn'||command==='text'||command==='crop')closePanels();
   if(command&&hooks.command){e.preventDefault();e.stopImmediatePropagation();closeMenus(false);var result=hooks.command(command);syncPanels();return result;}
  },true);
  doc.addEventListener('click',function(e){
   if(e.target.closest('button')&&containsMenu(e.target))closeMenus(false);
   syncPanels();
  });
  function hover(e){
   var button=e.target.closest&&e.target.closest('button');
   if(button&&button.dataset.menu){if(activeMenu&&activeMenu!==menu&&activeMenu.id!==button.dataset.menu)openMenu(button,false);return;}
   if(containsMenu(e.target)){root.clearTimeout(closeTimer);closeTimer=null;}
   if(!button||!containsMenu(button)||!activeMenu||(e.relatedTarget&&button.contains(e.relatedTarget)))return;
   cancelTimers();var depth=depthOf(button.closest('.command-menu'));if(depth<0)return;
   var child=path[depth+1];if(child&&child.button===button)return;
   var delay=child&&safeTravel(child,{x:e.clientX,y:e.clientY})?250:100;
   hoverTimer=root.setTimeout(function(){hoverTimer=null;if(button.dataset.submenu)openSubmenu(button,false);else trimPath(depth+1);},delay);
  }
  doc.addEventListener('mouseover',hover);
  function safeTravel(entry,point){
   if(entry.inline||!entry.origin)return false;
   var rect=entry.menu.getBoundingClientRect(),origin=entry.origin;
   var edge=rect.left>=origin.x?rect.left:rect.right,dx=edge-origin.x;
   if(!dx)return false;var progress=(point.x-origin.x)/dx;
   if(progress<0||progress>1.15)return false;
   var top=origin.y+(rect.top-12-origin.y)*progress,bottom=origin.y+(rect.bottom+12-origin.y)*progress;
   return point.y>=Math.min(top,bottom)-4&&point.y<=Math.max(top,bottom)+4;
  }
  doc.addEventListener('mousemove',function(e){
   if(!activeMenu)return;pointer={x:e.clientX,y:e.clientY};
   path.forEach(function(entry){if(entry.button&&entry.button.contains(e.target))entry.origin=pointer;});
  });
  doc.addEventListener('mouseout',function(e){
   if(!activeMenu||!containsMenu(e.target))return;
   if(path.length&&path[path.length-1].inline)return;
   var from=e.target.closest&&e.target.closest('button');
   if(from&&(!e.relatedTarget||!from.contains(e.relatedTarget))){root.clearTimeout(hoverTimer);hoverTimer=null;}
   if(containsMenu(e.relatedTarget))return;
   root.clearTimeout(closeTimer);closeTimer=root.setTimeout(function(){closeTimer=null;trimPath(1);},320);
  });
  doc.addEventListener('scroll',function(e){
   var depth=depthOf(e.target);if(depth<0)return;
   // Browser scroll-into-view can arrive after mouseover. Keep that intent;
   // closing an anchored child must not cancel the pending parent hover.
   trimPath(depth+1);
   if(pointer&&doc.elementFromPoint){var target=doc.elementFromPoint(pointer.x,pointer.y);if(target)hover({target:target,clientX:pointer.x,clientY:pointer.y});}
  },true);
  root.addEventListener('resize',function(){closeMenus(false);});
  root.addEventListener('blur',function(){closeMenus(false);swallowedKeys={};});
  root.addEventListener('keydown',function(e){
   if(cropping())return;
   var trigger=e.target.closest&&e.target.closest('[data-menu]'),container=path.length?path[path.length-1].menu:null;
   if(!container&&shellPanel(e.target)&&e.key!=='Escape'){e.stopImmediatePropagation();return;}
   if(trigger&&(e.key==='ArrowDown'||e.key==='ArrowUp')){e.preventDefault();e.stopImmediatePropagation();openMenu(trigger,true);var initial=choices(activeMenu);if(e.key==='ArrowUp'&&initial.length)initial[initial.length-1].focus();return;}
   if(container){
    swallowedKeys[e.code||e.key]=true;
    e.stopImmediatePropagation();
    if(editing(e.target)){closeMenus(false);return;}
    if(e.key==='Tab'){closeMenus(true);return;}
    e.preventDefault();cancelTimers();
    if(trigger&&(e.key==='Enter'||e.key===' '||e.code==='Space')){openMenu(trigger,false);return;}
    if(e.key==='Escape'){if(path.length>1)back();else closeMenus(true);return;}
    if(e.key==='ArrowLeft'){if(path.length>1)back();else switchTop(-1);return;}
    var focused=doc.activeElement;
    if(e.key==='ArrowRight'){if(focused&&focused.dataset&&focused.dataset.submenu)openSubmenu(focused,true);else switchTop(1);return;}
    if(e.key==='Enter'||e.key===' '||e.code==='Space'){if(focused&&focused.tagName==='BUTTON'&&containsMenu(focused))focused.click();return;}
    var options=choices(container),index=options.indexOf(doc.activeElement),next;
    if(e.key==='ArrowDown')next=(index+1)%options.length;
    else if(e.key==='ArrowUp')next=index<0?options.length-1:(index-1+options.length)%options.length;
    else if(e.key==='Home')next=0;
    else if(e.key==='End')next=options.length-1;
    if(next!==undefined&&options.length)options[next].focus();
   }else if(!editing(e.target)&&!(e.target.closest&&e.target.closest('#noteSettingsPanel,#drawPanel,#shapePanel,#drawingEditPanel'))&&e.key==='Escape'){
    if(hooks.cancelDrawingGesture&&hooks.cancelDrawingGesture()){e.preventDefault();e.stopImmediatePropagation();return;}
    var color=doc.getElementById('colorPopover');
    if(!color.hidden){if(hooks.closeColor)hooks.closeColor();else color.hidden=true;e.stopImmediatePropagation();return;}
    if(panels.some(function(panel){return !panel.hidden;})){closePanels();if(panelOpener&&panelOpener.getClientRects().length)panelOpener.focus();else hooks.viewport.focus();e.preventDefault();e.stopImmediatePropagation();}
   }
  },true);
  root.addEventListener('keyup',function(e){
   var key=e.code||e.key,swallowed=swallowedKeys[key];delete swallowedKeys[key];
   // Space can begin on the canvas and end over chrome: release the pan latch.
   if(e.code==='Space'&&!swallowed)return;
   if((activeMenu||swallowed)&&!cropping()){e.stopImmediatePropagation();if(!editing(e.target)&&e.key!=='Tab')e.preventDefault();}
   else if(shellPanel(e.target))e.stopImmediatePropagation();
  },true);
  ['copy','cut','paste'].forEach(function(type){root.addEventListener(type,function(e){if(activeMenu||shellPanel(e.target)){if(!editing(e.target))e.preventDefault();e.stopImmediatePropagation();}},true);});
  each(doc.querySelectorAll('.command-menu'),function(container){container.classList.add('editor-menu');container.setAttribute('role','menu');each(container.querySelectorAll('button'),function(button){button.setAttribute('role','menuitem');button.tabIndex=-1;});});
  each(doc.querySelectorAll('[data-submenu]'),function(button){button.classList.add('editor-submenu');button.setAttribute('aria-haspopup','menu');button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls',button.dataset.submenu);});
  ['arrangePanel','preferencesPanel','propertiesPanel','shortcutsPanel','aboutPanel'].forEach(function(id){var panel=doc.getElementById(id);if(panel)panel.classList.add('editor-panel');});
  syncToolbar();
  syncPanels();
  return{isOpen:function(){return !!activeMenu;},closeMenus:closeMenus,closePanels:closePanels,refreshContext:refreshContext,openContext:openContext,closeContext:closeContext,refresh:refresh,containsMenu:containsMenu};
 }
 return{create:create};
});
