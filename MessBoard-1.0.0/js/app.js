(function(){
'use strict';
var fs=null,path=null,os=null,childProcess=null,http=null,https=null;if(typeof require==='function'){fs=require('fs');path=require('path');os=require('os');childProcess=require('child_process');http=require('http');https=require('https');}
var assets=fs?BoardAssets.create({fs:fs,path:path,crypto:require('crypto')}):null,filesUI=null;
function guardFileJobInput(e){
 if(!filesUI||!filesUI.isBusy())return;
 if(e.target&&e.target.closest&&e.target.closest('#filesPanel')){
  if(e.type==='keydown'&&['Tab','Enter',' ','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End','PageUp','PageDown'].indexOf(e.key)>=0&&!e.ctrlKey&&!e.metaKey&&!e.altKey)return;
  if(e.type!=='keydown'&&e.type!=='paste'&&e.type!=='cut'&&e.type!=='drop')return;
 }
 if(e.type==='keydown'&&e.key==='Tab'){var cancel=document.getElementById('cancelFileJob'),next=cancel&&!cancel.hidden&&!cancel.disabled?cancel:document.getElementById('closeFiles');if(next)next.focus();}
 e.preventDefault();e.stopImmediatePropagation();
}
['mousedown','click','dblclick','keydown','paste','cut','drop','input','change','contextmenu','wheel'].forEach(function(type){window.addEventListener(type,guardFileJobInput,{capture:true,passive:false});});
var settingsScrub=null;
var preferenceStorage=null;try{preferenceStorage=window.localStorage;}catch(ignore){}
var preferences=AppPreferences.create({storage:preferenceStorage}),preferencesUI=null;
var cs=new CSInterface(),board=new BoardModel(),boardPath=null,space=false,pan=null,action=null,noticeTimer=null,menuPoint=null,lastCanvasPoint=null,toolbarTimer=null,gridVisible=true,drawMode=false,textMode=false,sectionMode=false,colorPreview=null,colorPicker=null,drawFrame=0,screenSampler=null;
var viewport=document.getElementById('viewport'),world=document.getElementById('world'),empty=document.getElementById('empty'),startupGate=document.getElementById('startupGate'),contextMenu=document.getElementById('contextMenu'),layout=null;
function toast(msg){var n=document.getElementById('notice');n.textContent=msg;n.classList.add('show');clearTimeout(noticeTimer);noticeTimer=setTimeout(function(){n.classList.remove('show');},2600);}
function basename(p){return String(p).replace(/\\/g,'/').split('/').pop();}
function setBoardName(){document.getElementById('boardName').textContent=boardPath?BoardStorage.displayName(boardPath):'Untitled board';}
function boardPoint(clientX,clientY){var r=viewport.getBoundingClientRect();return{x:(clientX-r.left-board.camera.x)/board.camera.zoom,y:(clientY-r.top-board.camera.y)/board.camera.zoom};}
/* Photoshop-style rotation: hover just outside a selection corner to reveal a
 * rotate cursor; drag from there to rotate. The old .rotate dot is gone. */
var ROTATE_ZONE_PX=16,viewportRectCache=null;
window.addEventListener('resize',function(){viewportRectCache=null;});
// While Ctrl (or Cmd) is held, note text shows the I-beam: Ctrl+drag is the
// highlight gesture there, so the cursor must not promise a move. The class
// lives on the viewport and the CSS scopes the cursor to .note-content.
function syncCtrlCursor(e){viewport.classList.toggle('ctrl-text',!!(e.ctrlKey||e.metaKey));}
document.addEventListener('keydown',syncCtrlCursor);document.addEventListener('keyup',syncCtrlCursor);window.addEventListener('blur',function(){viewport.classList.remove('ctrl-text');});
var ROTATE_CURSORS=[
'url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%2228%22%20height%3D%2228%22%20viewBox%3D%220%200%2032%2032%22%3E%3Cpath%20d%3D%22M28.9%2C17.7%20A11%2C11%200%200%201%2017.7%2C28.9%22%20fill%3D%22none%22%20stroke%3D%22black%22%20stroke-width%3D%223.5%22%20stroke-linecap%3D%22butt%22/%3E%3Cpath%20d%3D%22M26.0%2C11.4%20L34.8%2C16.1%20L23.9%2C21.1%20Z%22%20fill%3D%22black%22/%3E%3Cpath%20d%3D%22M11.4%2C26.0%20L21.1%2C23.9%20L16.1%2C34.8%20Z%22%20fill%3D%22black%22/%3E%3Cpath%20d%3D%22M28.9%2C17.7%20A11%2C11%200%200%201%2017.7%2C28.9%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22butt%22/%3E%3Cpath%20d%3D%22M26.0%2C11.4%20L33.5%2C15.6%20L24.4%2C19.8%20Z%22%20fill%3D%22white%22/%3E%3Cpath%20d%3D%22M11.4%2C26.0%20L19.8%2C24.4%20L15.6%2C33.5%20Z%22%20fill%3D%22white%22/%3E%3C/svg%3E") 14 14, auto',
'url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%2228%22%20height%3D%2228%22%20viewBox%3D%220%200%2032%2032%22%3E%3Cpath%20d%3D%22M14.3%2C28.9%20A11%2C11%200%200%201%203.1%2C17.7%22%20fill%3D%22none%22%20stroke%3D%22black%22%20stroke-width%3D%223.5%22%20stroke-linecap%3D%22butt%22/%3E%3Cpath%20d%3D%22M20.6%2C26.0%20L15.9%2C34.8%20L10.9%2C23.9%20Z%22%20fill%3D%22black%22/%3E%3Cpath%20d%3D%22M6.0%2C11.4%20L8.1%2C21.1%20L-2.8%2C16.1%20Z%22%20fill%3D%22black%22/%3E%3Cpath%20d%3D%22M14.3%2C28.9%20A11%2C11%200%200%201%203.1%2C17.7%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22butt%22/%3E%3Cpath%20d%3D%22M20.6%2C26.0%20L16.4%2C33.5%20L12.2%2C24.4%20Z%22%20fill%3D%22white%22/%3E%3Cpath%20d%3D%22M6.0%2C11.4%20L7.6%2C19.8%20L-1.5%2C15.6%20Z%22%20fill%3D%22white%22/%3E%3C/svg%3E") 14 14, auto',
'url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%2228%22%20height%3D%2228%22%20viewBox%3D%220%200%2032%2032%22%3E%3Cpath%20d%3D%22M17.7%2C3.1%20A11%2C11%200%200%201%2028.9%2C14.3%22%20fill%3D%22none%22%20stroke%3D%22black%22%20stroke-width%3D%223.5%22%20stroke-linecap%3D%22butt%22/%3E%3Cpath%20d%3D%22M11.4%2C6.0%20L16.1%2C-2.8%20L21.1%2C8.1%20Z%22%20fill%3D%22black%22/%3E%3Cpath%20d%3D%22M26.0%2C20.6%20L23.9%2C10.9%20L34.8%2C15.9%20Z%22%20fill%3D%22black%22/%3E%3Cpath%20d%3D%22M17.7%2C3.1%20A11%2C11%200%200%201%2028.9%2C14.3%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22butt%22/%3E%3Cpath%20d%3D%22M11.4%2C6.0%20L15.6%2C-1.5%20L19.8%2C7.6%20Z%22%20fill%3D%22white%22/%3E%3Cpath%20d%3D%22M26.0%2C20.6%20L24.4%2C12.2%20L33.5%2C16.4%20Z%22%20fill%3D%22white%22/%3E%3C/svg%3E") 14 14, auto',
'url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%2228%22%20height%3D%2228%22%20viewBox%3D%220%200%2032%2032%22%3E%3Cpath%20d%3D%22M3.1%2C14.3%20A11%2C11%200%200%201%2014.3%2C3.1%22%20fill%3D%22none%22%20stroke%3D%22black%22%20stroke-width%3D%223.5%22%20stroke-linecap%3D%22butt%22/%3E%3Cpath%20d%3D%22M6.0%2C20.6%20L-2.8%2C15.9%20L8.1%2C10.9%20Z%22%20fill%3D%22black%22/%3E%3Cpath%20d%3D%22M20.6%2C6.0%20L10.9%2C8.1%20L15.9%2C-2.8%20Z%22%20fill%3D%22black%22/%3E%3Cpath%20d%3D%22M3.1%2C14.3%20A11%2C11%200%200%201%2014.3%2C3.1%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22butt%22/%3E%3Cpath%20d%3D%22M6.0%2C20.6%20L-1.5%2C16.4%20L7.6%2C12.2%20Z%22%20fill%3D%22white%22/%3E%3Cpath%20d%3D%22M20.6%2C6.0%20L12.2%2C7.6%20L16.4%2C-1.5%20Z%22%20fill%3D%22white%22/%3E%3C/svg%3E") 14 14, auto'
];
var rotateZoneRotDeg=0,rotateCursorCache={};
/* The baked corner glyphs assume an unrotated frame. For a rotated item the
 * same artwork is re-emitted with an SVG rotate so the arrow stays tangent
 * to the corner the pointer is actually beside. Hotspot stays 14 14. */
function rotateCursorFor(zone,deg){
 var r=Math.round(((deg%360)+360)%360);
 if(!r)return ROTATE_CURSORS[zone];
 var key=zone+'|'+r;
 if(rotateCursorCache[key])return rotateCursorCache[key];
 var raw=ROTATE_CURSORS[zone];
 var svg=decodeURIComponent(raw.slice(raw.indexOf('"')+1,raw.lastIndexOf('"')));
 var start=svg.indexOf('<svg');if(start>0)svg=svg.slice(start);
 var at=svg.indexOf('>')+1,close=svg.lastIndexOf('</svg>');
 svg=svg.slice(0,at)+'<g transform="rotate('+r+' 16 16)">'+svg.slice(at,close)+'</g></svg>';
 var out='url("data:image/svg+xml,'+encodeURIComponent(svg)+'") 14 14, auto';
 if(Object.keys(rotateCursorCache).length>96)rotateCursorCache={};
 rotateCursorCache[key]=out;return out;
}

function rotateZoneAt(clientX,clientY){
 if(!board||!board.selection.length)return -1;
 var items=board.selectedItems().filter(function(i){return !i.hidden;});
 if(items.length&&items.every(function(i){return i.type==='section';}))return -1;
 if(!items.length||!board.transformableItems().length)return -1;
 var bounds,rot=0;
 if(items.length===1){var it=items[0];bounds={minX:it.x,minY:it.y,maxX:it.x+it.width,maxY:it.y+it.height};rot=(Number(it.rotation)||0)*Math.PI/180;}
 else bounds=Geometry.sceneBounds(items);
 rotateZoneRotDeg=rot*180/Math.PI;
 var z=board.camera.zoom;
 if(!viewportRectCache)viewportRectCache=viewport.getBoundingClientRect();
 var px=clientX-viewportRectCache.left,py=clientY-viewportRectCache.top;
 var cx=(bounds.minX+bounds.maxX)/2*z+board.camera.x,cy=(bounds.minY+bounds.maxY)/2*z+board.camera.y;
 var hw=(bounds.maxX-bounds.minX)/2*z,hh=(bounds.maxY-bounds.minY)/2*z;
 var dx=px-cx,dy=py-cy,cos=Math.cos(-rot),sin=Math.sin(-rot);
 var lx=dx*cos-dy*sin,ly=dx*sin+dy*cos;
 if(Math.abs(lx)<=hw+3&&Math.abs(ly)<=hh+3)return -1;
 var corners=[[hw,hh],[-hw,hh],[hw,-hh],[-hw,-hh]],r2=ROTATE_ZONE_PX*ROTATE_ZONE_PX;
 for(var i=0;i<4;i++){var ex=lx-corners[i][0],ey=ly-corners[i][1];if(ex*ex+ey*ey<=r2)return i;}
 return -1;
}
function hexRgba(hex,a){var n=parseInt(hex.slice(1),16);return'rgba('+((n>>16)&255)+','+((n>>8)&255)+','+(n&255)+','+a+')';}
var cameraFrame=0,boardUI=null,drawingUI=null,drawingEditId=null,cropUI=null,aeUI=null,shellUI=null,noteUI=null,appliedAccent=null,appliedPanelTheme=null,pendingImports=0;
// Windows and macOS differ in command key, snap modifier and shortcut wording.
var platform=PlatformServices.create({platform:typeof process!=='undefined'&&process?process.platform:'',navigator:typeof navigator!=='undefined'?navigator:null});
var dialogs=createFileDialogs();
function createFileDialogs(){
 var host=typeof window!=='undefined'?window:null,api=null;
 // Real CEP always uses the packaged backend. A failed native initialization
 // stays unavailable rather than silently reverting to the legacy picker.
 if(host&&host.__adobe_cep__){
  try{api=NativeFileDialogs.create({platform:platform.platform,path:path,extensionPath:cs.getSystemPath(CSInterface.SystemPath.EXTENSION),env:process.env,execFileSync:childProcess.execFileSync});}catch(ignore){}
  return FileDialogs.create({api:api,path:path});
 }
 // Browser regression runners inject a disk-isolated API and never spawn UI.
 return FileDialogs.create({host:host,path:path});
}
// Cancel is silent; only a real failure or a missing runtime is worth a message.
function reportDialog(label,result){if(result&&result.status!=='canceled'&&result.error)toast(label+' · '+result.error.message);}
function applyPlatformLabels(){
 if(!platform.isMac)return;
 var nodes=document.querySelectorAll('kbd,.editor-shortcuts dd,[title]'),i;
 for(i=0;i<nodes.length;i++){
  var node=nodes[i];
  if(node.hasAttribute('title'))node.setAttribute('title',platform.label(node.getAttribute('title')));
  if(node.tagName==='KBD'||node.tagName==='DD')node.textContent=platform.label(node.textContent);
 }
}
function scheduleCameraRender(){if(cameraFrame)return;cameraFrame=requestAnimationFrame(function(){cameraFrame=0;renderCamera();});}
var appearanceSignature=null,appearanceBoard=null,renderedZoom=null,renderedReadout=null,gridPaint=null,lastThumbMode=null;
/* Grid tiles are painted once per settings/zoom change onto dedicated layer
 * divs whose camera-independent offsets are baked into a static
 * background-position. The camera hot path only writes each layer's transform
 * (camera modulo the tile period), so panning and zooming never repaint the
 * grid and the grid cannot desync from the composited board content. */
function appearanceStateSignature(s){
 return s.accentColor+'|'+s.background+'|'+s.gridType+'|'+s.gridColor+'|'+s.gridOpacity+'|'+s.gridSize+'|'+s.autoHideToolbar+'|'+board.camera.zoom+'|'+(colorPreview?colorPreview.target+colorPreview.color:'');
}
function renderCamera(){
 if(board!==appearanceBoard){appearanceBoard=board;appearanceSignature=null;gridPaint=null;renderedZoom=null;renderedReadout=null;}
 var signature=appearanceStateSignature(typeof settingsScrub!=='undefined'&&settingsScrub?settingsScrub.settings(board):board.settings);
 if(signature!==appearanceSignature){appearanceSignature=signature;applyBoardAppearance();}else applyGridPosition();
 var z=board.camera.zoom;
 if(z!==renderedZoom){renderedZoom=z;viewport.style.setProperty('--resize-handle-size',10/z+'px');viewport.style.setProperty('--resize-handle-edge',-8/z+'px');viewport.style.setProperty('--resize-handle-half',-5/z+'px');viewport.style.setProperty('--selection-gap',-3/z+'px');viewport.style.setProperty('--selection-stroke',1/z+'px');}
 world.style.transform='translate3d('+board.camera.x+'px,'+board.camera.y+'px,0) scale('+z+')';
 var wantThumbMode=board.settings.thumbnailsEnabled&&z<board.settings.thumbnailSwapZoom?'1':'';
 if(wantThumbMode!==lastThumbMode){lastThumbMode=wantThumbMode;swapThumbnailMode();}
 var readout=Math.round(z*100)+'% · '+board.items.length+' reference'+(board.items.length===1?'':'s')+(board.selection.length?' · '+board.selection.length+' selected':'');if(readout!==renderedReadout){renderedReadout=readout;chromeEl('readout').textContent=readout;}
 if(boardUI&&board.selection.length)boardUI.renderSelection();if(cropUI&&cropUI.isActive())cropUI.refresh();if(aeUI&&aeUI.isOpen())aeUI.refresh();}
function toolbarBlocked(){return (drawingUI&&drawingUI.isOpen())||(noteUI&&noteUI.isOpen())||(shellUI&&shellUI.isOpen())||(cropUI&&cropUI.isActive())||(aeUI&&aeUI.isOpen())||!!document.querySelector('.tool-panel:not([hidden])')||!document.getElementById('colorPopover').hidden||!contextMenu.hidden||(document.activeElement&&document.activeElement.isContentEditable);}
function showToolbar(){clearTimeout(toolbarTimer);document.body.classList.remove('toolbar-hidden');}
function scheduleToolbarHide(){clearTimeout(toolbarTimer);if(!board.settings.autoHideToolbar||toolbarBlocked())return;toolbarTimer=setTimeout(function(){if(board.settings.autoHideToolbar&&!toolbarBlocked())document.body.classList.add('toolbar-hidden');},1500);}
function gridMod(v,p){return ((v%p)+p)%p;}
function gridEnsureLayer(id){
 var el=document.getElementById(id);
 if(!el){el=document.createElement('div');el.id=id;el.className='gridlayer';el.setAttribute('aria-hidden','true');viewport.insertBefore(el,world);}
 el.style.display='block';
 return el;
}
function gridHideLayer(id){var el=document.getElementById(id);if(el)el.style.display='none';}
/* The .gridlayer divs are inset by -64px on every side so the translated tile
 * always covers the viewport. The camera translation must therefore add the
 * 64px back, otherwise the pattern sits 64px off and the offset drifts with
 * the period while zooming (grid visibly detaches from the cursor). */
var GRID_LAYER_INSET=64;
function applyGridPosition(){
 if(!gridPaint||!gridPaint.parts.length)return;
 var cx=board.camera.x+GRID_LAYER_INSET,cy=board.camera.y+GRID_LAYER_INSET,period=gridPaint.period,i,part;
 for(i=0;i<gridPaint.parts.length;i++){
  part=gridPaint.parts[i];
  part.el.style.transform='translate3d('+(part.followX?gridMod(cx,period):0)+'px,'+(part.followY?gridMod(cy,period):0)+'px,0)';
 }
}
function applyBoardAppearance(){
 var s=typeof settingsScrub!=='undefined'&&settingsScrub?settingsScrub.settings(board):board.settings,camera=board.camera;
 if(colorPreview&&colorPreview.board===board){s=Object.assign({},s);if(colorPreview.target==='bgColor')s.background=colorPreview.color;if(colorPreview.target==='gridColor')s.gridColor=colorPreview.color;if(colorPreview.target==='accentColor')s.accentColor=colorPreview.color;if(colorPreview.target==='panelColor')s.panelColor=colorPreview.color;if(colorPreview.target==='textColor')s.textColor=colorPreview.color;}
 if(appliedAccent!==s.accentColor){var tokens=AccentTheme.tokens(s.accentColor);Object.keys(tokens).forEach(function(key){document.documentElement.style.setProperty(key,tokens[key]);});setWell('accentColor',s.accentColor);appliedAccent=s.accentColor;}
 if(appliedPanelTheme!==s.panelColor+'|'+s.textColor){var ptokens=AccentTheme.panelTokens(s.panelColor,s.textColor);Object.keys(ptokens).forEach(function(key){document.documentElement.style.setProperty(key,ptokens[key]);});setWell('panelColor',s.panelColor);setWell('textColor',s.textColor);appliedPanelTheme=s.panelColor+'|'+s.textColor;}
 document.body.classList.toggle('toolbar-auto-hide',s.autoHideToolbar);if(!s.autoHideToolbar)showToolbar();
 viewport.style.backgroundColor=s.background;
 // Defensive: the pre-P0 implementation painted the grid as viewport
 // backgrounds. Clear any stale ones so only the compositor layers show.
 viewport.style.backgroundImage='none';viewport.style.backgroundSize='';viewport.style.backgroundRepeat='';viewport.style.backgroundPosition='';
 // Hide every grid layer first; the branch below re-shows only what it needs.
 // This also heals stale layers left visible by an older revision.
 gridHideLayer('gridlayer');gridHideLayer('gridlayerH');gridHideLayer('gridlayerV');
 if(s.gridType==='none'){gridPaint={mode:'none',period:0,parts:[]};return;}
 var levels=GridPattern.layers(s.gridSize,camera.zoom,s.gridOpacity),child=levels[0],parent=levels[1],period=parent.period,half=child.offset;
 var childColor=hexRgba(s.gridColor,child.alpha),parentColor=hexRgba(s.gridColor,parent.alpha);
 if(s.gridType==='dots'){
  // One parent tile owns all four positions: parent corner plus the three
  // midpoint children that divide a parent square into four equal squares.
  // The constant per-layer offsets are baked into a static background-position;
  // the hot path only translates the layer, so the pattern is pixel-identical
  // to the old per-frame background-position without ever repainting.
  var el=gridEnsureLayer('gridlayer');
  var dotChild='radial-gradient(circle at center,'+childColor+' 1px,transparent 1px)',dotParent='radial-gradient(circle at center,'+parentColor+' 1px,transparent 1px)',dotSize=period+'px '+period+'px';
  el.style.backgroundImage=[dotChild,dotChild,dotChild,dotParent].join(',');
  el.style.backgroundSize=[dotSize,dotSize,dotSize,dotSize].join(',');
  el.style.backgroundRepeat='repeat,repeat,repeat,repeat';
  el.style.backgroundPosition='0px '+(-half)+'px,'+(-half)+'px 0px,0px 0px,'+(-half)+'px '+(-half)+'px';
  gridPaint={mode:'dots',period:period,parts:[{el:el,followX:true,followY:true}]};
 }else{
  // Every generation shares the parent period. Child lines sit at the exact
  // midpoint; they are not an independently repeated half-size grid.
  // Horizontal and vertical line sets follow only their own axis, so they
  // live on two layers that the hot path translates independently.
  var elH=gridEnsureLayer('gridlayerH'),elV=gridEnsureLayer('gridlayerV');
  elH.style.backgroundImage=['linear-gradient('+childColor+' 1px,transparent 1px)','linear-gradient('+parentColor+' 1px,transparent 1px)'].join(',');
  elH.style.backgroundSize=['100% '+period+'px','100% '+period+'px'].join(',');
  elH.style.backgroundRepeat='repeat-y,repeat-y';
  elH.style.backgroundPosition='0px '+half+'px,0px 0px';
  elV.style.backgroundImage=['linear-gradient(90deg,'+childColor+' 1px,transparent 1px)','linear-gradient(90deg,'+parentColor+' 1px,transparent 1px)'].join(',');
  elV.style.backgroundSize=[period+'px 100%',period+'px 100%'].join(',');
  elV.style.backgroundRepeat='repeat-x,repeat-x';
  elV.style.backgroundPosition=half+'px 0px,0px 0px';
  gridPaint={mode:'lines',period:period,parts:[{el:elH,followX:false,followY:true},{el:elV,followX:true,followY:false}]};
 }
 applyGridPosition();
}
/* P2: thumbnail proxies. Large images are downscaled once at import; the board
 * displays the small proxy until the user zooms past thumbnailSwapZoom, when
 * the full-resolution original is swapped in. Send-to-AE and export always
 * use the original. */
function thumbDir(){if(!ensureLayout())return null;return layout.thumbs||null;}
function thumbPathFor(sourcePath){
 var dir=thumbDir();if(!dir||!sourcePath)return null;
 var h=0,s=String(sourcePath);
 for(var i=0;i<s.length;i++){h=((h<<5)-h+s.charCodeAt(i))|0;}
 var name=(h>>>0).toString(16);
 var ext=/\.(png|webp|gif)$/i.test(s)?'.png':'.jpg';
 return dir+require('path').sep+name+ext;
}
function thumbExists(sourcePath){
 var p=thumbPathFor(sourcePath);
 if(!p)return false;
 try{return fs.existsSync(p)&&fs.statSync(p).isFile();}catch(e){return false;}
}
function generateThumbnail(sourcePath,done){
 done=done||function(){};
 if(/\.gif$/i.test(sourcePath||'')){done(null);return;}
 var dest=thumbPathFor(sourcePath);
 if(!dest){done(null);return;}
 if(thumbExists(sourcePath)){done(dest);return;}
 var maxDim=board&&board.settings?board.settings.thumbnailSize:1024;
 var img=new Image();
 img.onload=function(){
  try{
   if(img.naturalWidth<=maxDim&&img.naturalHeight<=maxDim){done(null);return;}
   var scale=Math.min(1,maxDim/Math.max(img.naturalWidth,img.naturalHeight));
   var w=Math.max(1,Math.round(img.naturalWidth*scale)),h=Math.max(1,Math.round(img.naturalHeight*scale));
   var canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
   canvas.getContext('2d').drawImage(img,0,0,w,h);
   var ext=dest.slice(-4).toLowerCase();
   canvas.toBlob(function(blob){
    if(!blob){done(null);return;}
    var reader=new FileReader();
    reader.onload=function(){
     try{
      fs.writeFileSync(dest,Buffer.from(new Uint8Array(reader.result)));
      done(dest);
     }catch(e){done(null);}
    };
    reader.onerror=function(){done(null);};
    reader.readAsArrayBuffer(blob);
   },ext==='.png'?'image/png':'image/jpeg',.85);
  }catch(e){done(null);}
 };
 img.onerror=function(){done(null);};
 try{img.src=PathCodec.toFileUrl(sourcePath);}catch(e){done(null);}
}
function thumbUrlFor(item){
 if(!board||!board.settings.thumbnailsEnabled||!item||item.type!=='image')return null;
 if(/\.gif$/i.test(item.path||''))return null;
 if(board.camera.zoom>=board.settings.thumbnailSwapZoom)return null;
 var p=thumbPathFor(item.path);
 if(!p)return null;
 try{if(!(fs.existsSync(p)&&fs.statSync(p).isFile()))return null;}catch(e){return null;}
 try{return PathCodec.toFileUrl(p);}catch(e){return null;}
}
function queueThumbnails(items){
 (items||[]).forEach(function(item){
  if(!item||item.type!=='image'||!item.path)return;
  if(thumbExists(item.path))return;
  generateThumbnail(item.path,function(dest){
   if(dest)render();
  });
 });
}
/* Items-panel row preview: prefer the thumbnail file when it exists so the
 * panel does not keep a full-size texture per row. Falls back to the original. */
/* Mini thumbnails (96px) live beside board thumbnails with a mini- prefix.
 * Panel rows render at ~28px, so these keep texture memory tiny. */
var MINI_THUMB_DIM=96,miniThumbInFlight={};
function miniThumbPathFor(sourcePath){
 var dir=thumbDir();if(!dir||!sourcePath)return null;
 var h=0,s=String(sourcePath);
 for(var i=0;i<s.length;i++){h=((h<<5)-h+s.charCodeAt(i))|0;}
 var name='mini-'+(h>>>0).toString(16);
 var ext=/\.(png|webp|gif)$/i.test(s)?'.png':'.jpg';
 return dir+require('path').sep+name+ext;
}
function miniThumbExists(sourcePath){
 var p=miniThumbPathFor(sourcePath);
 if(!p)return false;
 try{return fs.existsSync(p)&&fs.statSync(p).isFile();}catch(e){return false;}
}
function generateMiniThumbnail(sourcePath,done){
 done=done||function(){};
 var dest=miniThumbPathFor(sourcePath);
 if(!dest){done(null);return;}
 if(miniThumbExists(sourcePath)){done(dest);return;}
 if(miniThumbInFlight[dest]){done(null);return;}
 miniThumbInFlight[dest]=true;
 function finish(value){delete miniThumbInFlight[dest];done(value);}
 var srcPath=thumbExists(sourcePath)?thumbPathFor(sourcePath):sourcePath;
 var img=new Image();
 img.onload=function(){
  try{
   if(img.naturalWidth<=MINI_THUMB_DIM&&img.naturalHeight<=MINI_THUMB_DIM){finish(null);return;}
   var scale=Math.min(1,MINI_THUMB_DIM/Math.max(img.naturalWidth,img.naturalHeight));
   var w=Math.max(1,Math.round(img.naturalWidth*scale)),h=Math.max(1,Math.round(img.naturalHeight*scale));
   var canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
   canvas.getContext('2d').drawImage(img,0,0,w,h);
   var ext=dest.slice(-4).toLowerCase();
   canvas.toBlob(function(blob){
    if(!blob){finish(null);return;}
    var reader=new FileReader();
    reader.onload=function(){try{fs.writeFileSync(dest,Buffer.from(new Uint8Array(reader.result)));finish(dest);}catch(e){finish(null);}};
    reader.onerror=function(){finish(null);};
    reader.readAsArrayBuffer(blob);
   },ext==='.png'?'image/png':'image/jpeg',.85);
  }catch(e){finish(null);}
 };
 img.onerror=function(){finish(null);};
 try{img.src=PathCodec.toFileUrl(srcPath);}catch(e){finish(null);}
}
function panelImageURL(item){
 if(!item||item.type!=='image'||item.missing)return '';
 try{
  if(board&&board.settings&&board.settings.thumbnailsEnabled){
   if(miniThumbExists(item.path))return PathCodec.toFileUrl(miniThumbPathFor(item.path));
   generateMiniThumbnail(item.path,function(dest){if(dest)render();});
   if(thumbExists(item.path))return PathCodec.toFileUrl(thumbPathFor(item.path));
  }
  return PathCodec.toFileUrl(item.path);
 }catch(e){return '';}
}
/* Swap all visible image elements between thumbnail and full-res when the
 * zoom crosses thumbnailSwapZoom. Runs from renderCamera (not full render). */
function swapThumbnailMode(){
 if(!board)return;
 var refs=world.querySelectorAll('.reference'),i,el,item,img,thumbUrl,url,wantThumb;
 for(i=0;i<refs.length;i++){
  el=refs[i];if(el.dataset.type!=='image')continue;
  item=board.getItem(el.dataset.id);if(!item)continue;
  img=el.querySelector('img');if(!img)continue;
  thumbUrl=thumbUrlFor(item);url=thumbUrl||PathCodec.toFileUrl(item.path);wantThumb=thumbUrl?'1':'';
  if(img.dataset.path!==item.path||img.dataset.thumb!==wantThumb){
   delete el.dataset.imageError;img.dataset.path=item.path;img.dataset.thumb=wantThumb;img.src=url;
  }
 }
}
function strokeMarkup(s){return DrawingRenderer.svg(s);}
function drawingMarkup(item){return '<svg viewBox="0 0 '+(item.sourceWidth||item.width)+' '+(item.sourceHeight||item.height)+'" preserveAspectRatio="none">'+item.strokes.map(strokeMarkup).join('')+'</svg>';}
function renderDrawing(node,item){
 // Node-local signature: no global ID cache or retained old boards/history.
 var signature=JSON.stringify([item.sourceWidth||item.width,item.sourceHeight||item.height,item.strokes]);
 if(node._drawingSignature===signature)return;
 node.innerHTML=drawingMarkup(item);node._drawingSignature=signature;
}
function imageFailureMessage(file){
 if(fs){try{if(!fs.statSync(file).isFile())return 'Source missing — double click to relink';}catch(e){return e.code==='ENOENT'||e.code==='ENOTDIR'?'Source missing — double click to relink':'Cannot read image — check file permissions or relink';}}
 return 'Image unreadable or unsupported — convert to PNG/JPEG, then relink';
}
function bindImageFeedback(img,node,item){
 var owner=board,file=item.path;
 function current(){return board===owner&&board.getItem(item.id)===item&&item.path===file;}
 img.onerror=function(){if(!current())return;item.missing=true;node.dataset.imageError=imageFailureMessage(file);node.classList.add('missing');};
 img.onload=function(){if(!current())return;item.missing=false;delete node.dataset.imageError;node.classList.remove('missing');};
}
function createReferenceElement(item){var el=document.createElement('div');el.className='reference';el.dataset.id=item.id;if(item.type==='image'){var imgWrap=document.createElement('div');imgWrap.className='image-clip';var img=document.createElement('img');bindImageFeedback(img,el,item);imgWrap.appendChild(img);el.appendChild(imgWrap);}else if(item.type==='note'){var shell=document.createElement('div');shell.className='note-shell';var align=document.createElement('div');align.className='note-align';var note=document.createElement('div');note.className='note-content note-flow';align.appendChild(note);shell.appendChild(align);el.appendChild(shell);}else if(item.type==='link'){var card=document.createElement('div');card.className='link-card';card.innerHTML='<div class="link-titlebar"><span></span><button data-link-action="open">Open</button><button data-link-action="stop">Stop</button></div><div class="link-body"></div>';el.appendChild(card);}else if(item.type==='section'){var frame=document.createElement('div');frame.className='section-frame';var slab=document.createElement('span');slab.className='section-label';frame.appendChild(slab);el.appendChild(frame);}else{var drawing=document.createElement('div');drawing.className='drawing-content';el.appendChild(drawing);}var dirs=['n','s','e','w','nw','ne','sw','se'];for(var k=0;k<8;k++){var h=document.createElement('span');h.className='handle';h.dataset.dir=dirs[k];el.appendChild(h);}world.appendChild(el);return el;}
function render(){if(cameraFrame){cancelAnimationFrame(cameraFrame);cameraFrame=0;}if(drawingUI)drawingUI.refresh();if(action&&action.type==='draw'&&action.board!==board)cancelDrawGesture();if(noteUI)noteUI.refresh();renderCamera();
 chromeEl('focusSelectionBtn').disabled=!board.selectedItems().some(function(i){return !i.hidden;});
 var live=Object.create(null),existing=Object.create(null),references=world.querySelectorAll('.reference');
 var selectionIds=board.selectedIds;/* O(1) membership mirror maintained by the model */
 for(var r=0;r<references.length;r++)existing[references[r].dataset.id]=references[r];
 for(var i=0;i<board.items.length;i++){
  var item=noteUI?noteUI.item(board.items[i]):board.items[i];if(drawingUI)item=drawingUI.item(item);var el=existing[item.id];
  if(el&&el.dataset.type!==item.type){world.removeChild(el);el=null;}el=el||createReferenceElement(item);el.dataset.type=item.type;live[item.id]=true;
  el.className='reference '+item.type+(selectionIds.has(item.id)?' selected':'')+(item.missing?' missing':'')+(item.locked?' locked':'');
  el.style.left=item.x+'px';el.style.top=item.y+'px';el.style.width=item.width+'px';el.style.height=item.height+'px';el.style.zIndex=item.type==='section'?0:item.z;el.style.transform='rotate('+item.rotation+'deg)';el.style.opacity=String(item.opacity===undefined?1:item.opacity);
  if(item.type==='image'){
   var img=el.querySelector('img'),thumbUrl=thumbUrlFor(item),url=thumbUrl||PathCodec.toFileUrl(item.path),c=item.crop||{left:0,top:0,right:0,bottom:0},wantThumb=thumbUrl?'1':'';
   bindImageFeedback(img,el,item);
   if(img.dataset.path!==item.path||img.dataset.thumb!==wantThumb){delete el.dataset.imageError;img.dataset.path=item.path;img.dataset.thumb=wantThumb;img.src=url;}img.style.width=(100/(1-c.left-c.right))+'%';img.style.height=(100/(1-c.top-c.bottom))+'%';img.style.left=(-c.left*100/(1-c.left-c.right))+'%';img.style.top=(-c.top*100/(1-c.top-c.bottom))+'%';img.style.transform='scale('+(item.flipH?-1:1)+','+(item.flipV?-1:1)+')';
  }else if(item.type==='note'){
   var shell=el.querySelector('.note-shell'),align=el.querySelector('.note-align'),note=el.querySelector('.note-content'),style=NoteStyle.style(item),vertical=style.textOrientation==='vertical';if(document.activeElement!==note&&note.dataset.text!==item.text){note.dataset.text=item.text;note.innerHTML=noteMarkup(item.text);}
   note.style.fontSize=style.fontSize+'px';note.style.fontFamily=NoteStyle.cssFamily(style.fontFamily);note.style.color=style.color;note.style.lineHeight=style.lineHeight;note.style.letterSpacing=style.letterSpacing+'px';
   // The outer reference paints the whole note box: a manual resize grows the
   // reference while .note-content only fills it, so any background left on the
   // content layer exposed a differently colored gap outside the text area.
   note.style.background='transparent';
   el.style.background=style.background===null?'transparent':style.background;
   // The full-size wrapper owns alignment; the child remains one inline text
   // flow so hyperlink spans never become separate flex rows.
   align.style.display='flex';align.style.flexDirection=vertical?'row':'column';align.style.justifyContent=vertical?(style.align==='center'?'center':style.align==='left'?'flex-start':'flex-end'):(style.valign==='middle'?'center':style.valign==='bottom'?'flex-end':'flex-start');align.style.alignItems='stretch';
   note.style.flex='0 1 auto';note.style.width=vertical?'auto':'100%';note.style.height=vertical?'100%':'auto';note.style.maxHeight=vertical?'100%':'none';note.style.textAlign=vertical?(style.valign==='middle'?'center':style.valign==='bottom'?'end':'start'):(item.align||'left');
   note.style.fontWeight=style.bold?'700':'400';note.style.fontStyle=style.italic?'italic':'normal';note.style.textDecoration=style.underline?'underline':'none';
   shell.style.padding=style.padding+'px';note.style.padding='0';el.style.borderRadius=style.cornerRadius+'px';
   // Vertical = Japanese tategaki: letters stay upright, flow runs top-to-bottom,
   // columns right-to-left. text-orientation:upright keeps Latin glyphs unrotated.
   if(style.textOrientation==='vertical'){note.style.writingMode='vertical-rl';note.style.textOrientation='upright';}
   else{note.style.writingMode='horizontal-tb';note.style.textOrientation='mixed';}
  }else if(item.type==='link'){renderLink(el,item);el.style.setProperty('--link-scale',String(Math.max(.6,Math.min(2.2,(item.height||405)/405))));}else if(item.type==='section'){styleSectionElement(el,item);}else renderDrawing(el.querySelector('.drawing-content'),item);
 }
 var nodes=world.querySelectorAll('.reference');for(var n=nodes.length-1;n>=0;n--)if(!live[nodes[n].dataset.id])world.removeChild(nodes[n]);
 empty.className=board.items.length?'hidden':'';chromeEl('undoBtn').disabled=!board.undoStack.length;chromeEl('redoBtn').disabled=!board.redoStack.length;if(boardUI)boardUI.refresh();refreshEditorControls();scheduleAutosave();
}
function ensureLayout(target){target=target||layout;if(!target)return false;fs.mkdirSync(target.root,{recursive:true});fs.mkdirSync(target.pasted,{recursive:true});fs.mkdirSync(target.captures,{recursive:true});fs.mkdirSync(target.assets,{recursive:true});if(target.thumbs)fs.mkdirSync(target.thumbs,{recursive:true});return true;}
function requireBoard(){if(boardPath&&layout)return true;toast('Create or open a board first.');startupGate.classList.remove('hidden');return false;}
/* Persistence lifecycle start */
var chromeCache=null;
/* Memoized resolver for the few chrome elements read on every render/camera
 * frame (readout, undo/redo buttons, focus button, save status). First miss
 * resolves via getElementById and stores; later frames reuse the handle.
 * One-off wiring lookups elsewhere stay direct — only hot paths use this. */
function chromeEl(id){
 if(!chromeCache)chromeCache=Object.create(null);
 if(chromeCache[id]===undefined)chromeCache[id]=document.getElementById(id);
 return chromeCache[id];
}
var autoTimer=null,persistence=null,activatingBoard=false;
function boardFingerprint(model){var data=JSON.parse(model.toJSON());data.items.forEach(function(item){delete item.missing;});return JSON.stringify(data);}
function sourceImagePaths(model){return model.items.filter(function(item){return item.type==='image';}).map(function(item){return item.path;});}
function publishNewBoard(target,model,protectedImages){
 var owned=[];
 function mkdir(dir){
  if(fs.existsSync(dir))return;
  var parent=path.dirname(dir);if(parent!==dir)mkdir(parent);
  fs.mkdirSync(dir);owned.push({path:dir,stat:fs.lstatSync(dir,{bigint:true})});
 }
 try{
  mkdir(target.root);mkdir(target.pasted);mkdir(target.captures);mkdir(target.assets);
  FilesUI.atomicWrite(fs,path,target.boardPath,assets.serialize(model,target.boardPath),protectedImages);
 }catch(e){
  // Never recurse: a concurrent occupant makes rmdir fail and is retained.
  for(var i=owned.length-1;i>=0;i--){try{var entry=owned[i],now=fs.lstatSync(entry.path,{bigint:true});if(now.isDirectory()&&!now.isSymbolicLink()&&now.dev===entry.stat.dev&&now.ino===entry.stat.ino&&now.birthtimeNs===entry.stat.birthtimeNs)fs.rmdirSync(entry.path);}catch(ignore){}}
  throw e;
 }
}
function persistenceFor(model,file,target){
 var saved=boardFingerprint(model),state={board:model,saved:saved,recovery:saved,pending:false,error:'',saveError:'',lastSaved:null,lastRecovery:null,savedRevision:model.revision,recoveryRevision:model.revision};
 if(fs.existsSync(target.autosave)){
  try{state.recovery=boardFingerprint(BoardModel.fromJSON(assets.deserialize(fs.readFileSync(target.autosave,'utf8'),file)));state.pending=state.recovery!==saved;}
  catch(e){state.pending=true;state.error='Existing recovery cannot be read: '+e.message;}
 }
 return state;
}
function refreshPersistence(){
 var status=chromeEl('saveStatus');if(!status)return;
 status.hidden=!persistence;
 if(!persistence)return;
 var dirty=board.revision!==persistence.savedRevision;
 status.textContent=persistence.error?'Recovery failed':persistence.saveError?'Save failed':persistence.pending?'Recovery available':dirty?'Unsaved changes':'Saved';
 status.title=persistence.error||persistence.saveError||(persistence.pending?'A different recovery backup is protected. Choose Recover or Keep current.':dirty?'Use Save to update the board file. Recovery is a separate backup.':'The current board matches the saved file.');
 status.setAttribute('data-error',String(!!(persistence.error||persistence.saveError)));
 var panel=document.getElementById('recoveryBar');if(panel)panel.hidden=!(persistence.pending||persistence.error||persistence.saveError);
 var details=document.getElementById('recoveryMessage');if(details)details.textContent=persistence.error?'Recovery failed · '+persistence.error:persistence.saveError?'Save failed · '+persistence.saveError:persistence.pending?'A different recovery backup was found. Recover it, or keep this board and archive the backup.':'';
 var recover=document.getElementById('recoveryAccept'),keep=document.getElementById('recoveryKeep'),retry=document.getElementById('recoveryRetry');
 if(recover)recover.hidden=!persistence.pending;if(keep)keep.hidden=!persistence.pending;if(retry)retry.hidden=persistence.pending||!(persistence.error||persistence.saveError);
 var detail=document.getElementById('saveDetails');if(detail)detail.textContent=(dirty?'Board file has unsaved changes.':'Board file is up to date.')+(persistence.lastSaved?' Last saved '+persistence.lastSaved.toLocaleTimeString()+'.':'')+(persistence.lastRecovery?' Recovery backup '+persistence.lastRecovery.toLocaleTimeString()+'.':'');
}
function scheduleAutosave(){
 if(activatingBoard||!fs||!boardPath||!layout||!persistence||persistence.board!==board)return;
 clearTimeout(autoTimer);autoTimer=null;refreshPersistence();
 if(persistence.pending||persistence.error||board.revision===persistence.recoveryRevision&&!board.transaction)return;
 var owner=board;autoTimer=setTimeout(function(){autoTimer=null;if(owner!==board)return;flushRecovery();},500);
}
function flushRecovery(){
 if(!persistence||persistence.board!==board)return true;
 clearTimeout(autoTimer);autoTimer=null;
 if(persistence.pending)return boardFingerprint(board)!==persistence.recovery&&boardFingerprint(board)===persistence.saved;
 try{var snapshot=boardFingerprint(board);if(snapshot!==persistence.recovery){ensureLayout();FilesUI.atomicWrite(fs,path,layout.autosave,assets.serialize(board,boardPath),[boardPath].concat(sourceImagePaths(board)));persistence.recovery=snapshot;persistence.recoveryRevision=board.revision;persistence.lastRecovery=new Date();}persistence.error='';refreshPersistence();return true;}
 catch(e){persistence.error=e.message;refreshPersistence();toast('Recovery failed · '+e.message+' · keep this board open and retry.');return false;}
}
function pendingBoardEdit(){return !!((typeof action!=='undefined'&&action)||(typeof pan!=='undefined'&&pan)||board.transaction);}
function prepareBoardSwitch(){
 if(pendingBoardEdit()){toast('Finish the current edit before changing boards.');return false;}
 if(!flushRecovery()){if(persistence&&persistence.pending)toast('Choose Recover or Keep current before leaving this board.');return false;}
 return true;
}
function archiveRecovery(data){
 var target=path.join(layout.root,'autosave-preserved-'+Date.now()+'-'+Math.random().toString(16).slice(2)+'.json');
 ensureLayout();fs.writeFileSync(target,data,{flag:'wx'});prunePreservedRecoveries();return target;
}
function prunePreservedRecoveries(keep){
 keep=keep||5;
 try{
  var files=fs.readdirSync(layout.root).filter(function(f){return f.indexOf('autosave-preserved-')===0&&f.slice(-5)==='.json';});
  if(files.length<=keep)return;
  files.sort();
  files.slice(0,files.length-keep).forEach(function(f){try{fs.unlinkSync(path.join(layout.root,f));}catch(e){}});
 }catch(e){}
}
function keepCurrentRecovery(){
 if(fileOperationBusy()||!persistence||!persistence.pending)return false;
 if(pendingBoardEdit()){toast('Finish the current edit before choosing a recovery.');return false;}
 try{
  if(fs.existsSync(layout.autosave))archiveRecovery(fs.readFileSync(layout.autosave));
  FilesUI.atomicWrite(fs,path,layout.autosave,assets.serialize(board,boardPath),[boardPath].concat(sourceImagePaths(board)));
  persistence.pending=false;persistence.recovery=boardFingerprint(board);persistence.error='';persistence.lastRecovery=new Date();refreshPersistence();toast('Current board kept · previous recovery archived in the board folder.');return true;
 }catch(e){persistence.error=e.message;refreshPersistence();toast('Recovery remains protected · '+e.message);return false;}
}
function activateBoard(nextBoard,file,target,state,commit){
 var filesPanel=document.getElementById('filesPanel'),old={board:board,file:boardPath,layout:layout,persistence:persistence,filesHidden:filesPanel.hidden,startupHidden:startupGate.classList.contains('hidden')},held=null,references,i;
 clearTimeout(autoTimer);autoTimer=null;activatingBoard=true;
 try{
  // Only scene references belong to the board; persistent editor overlays stay attached.
  if(typeof world!=='undefined'){references=world.querySelectorAll('.reference');held=document.createDocumentFragment();for(i=0;i<references.length;i++)if(references[i].parentNode===world)held.appendChild(references[i]);}
  board=nextBoard;boardPath=file;layout=target;persistence=state;setBoardName();lastThumbMode=null;render();if(typeof queueThumbnails==='function')queueThumbnails(board.items);filesPanel.hidden=true;startupGate.classList.add('hidden');refreshPersistence();if(commit)commit();
 }
 catch(e){
  board=old.board;boardPath=old.file;layout=old.layout;persistence=old.persistence;
  if(held){references=world.querySelectorAll('.reference');for(i=0;i<references.length;i++)if(references[i].parentNode===world)world.removeChild(references[i]);world.appendChild(held);}
  try{filesPanel.hidden=old.filesHidden;startupGate.classList[old.startupHidden?'add':'remove']('hidden');setBoardName();render();refreshPersistence();}catch(restoreError){toast('Board retained · canvas refresh failed: '+restoreError.message);}
  throw e;
 }finally{activatingBoard=false;}
}
function settleWindowEdits(){
 space=false;pan=null;viewport.classList.remove('panning');viewport.classList.remove('drag-moving');viewport.classList.remove('action-drag');if(viewport.style&&viewport.style.removeProperty)viewport.style.removeProperty('--action-cursor');cancelDrawGesture();
 if(action){if(action.type!=='marquee')board.commitTransaction();action=null;marquee.hidden=true;document.getElementById('rotationReadout').hidden=true;}
 stopErasing();
}
function handleWindowBlur(){settleWindowEdits();flushRecovery();}
function handleBeforeUnload(event){
 settleWindowEdits();
 if(typeof screenSampler!=='undefined'&&screenSampler)screenSampler.dispose();
 if(!flushRecovery()||pendingImports||(typeof filesUI!=='undefined'&&filesUI&&filesUI.isBusy())||(typeof aeUI!=='undefined'&&aeUI&&aeUI.isBusy())){event.preventDefault();event.returnValue='';return '';}
}
/* Persistence lifecycle end */
function naturalSize(file,done){
 var img=new Image(),settled=false,timer;pendingImports++;
 function finish(size){if(settled)return;settled=true;clearTimeout(timer);try{done(size);}finally{pendingImports--;}}
 img.onload=function(){var cap=4096,scale=Math.min(1,cap/Math.max(img.naturalWidth,img.naturalHeight));finish({width:Math.max(80,Math.round(img.naturalWidth*scale)),height:Math.max(60,Math.round(img.naturalHeight*scale))});};
 img.onerror=function(){finish({width:320,height:220});};timer=setTimeout(img.onerror,15000);
 try{img.src=PathCodec.toFileUrl(file);}catch(e){img.onerror();}
}
// Pasted/imported images land at full natural size (up to 4096px). Reframe the
// camera only when the new image does not fit the viewport; a paste that fits
// must never disturb the current view.
function fitsViewport(item){var z=board.camera.zoom;return item.width*z<=viewport.clientWidth&&item.height*z<=viewport.clientHeight;}
function reframeIfNeeded(item){if(!item||item.type!=='image'||typeof viewport==='undefined'||!viewport||!board||!Geometry||typeof Geometry.fitCamera!=='function')return;if(fitsViewport(item))return;board.setCamera(Geometry.fitCamera([item],{x:0,y:0,width:viewport.clientWidth,height:viewport.clientHeight},32));}
function addFiles(files,cx,cy){var list=Array.prototype.slice.call(files||[]).filter(function(f){return /\.(png|jpe?g|gif|webp|bmp|tiff?|svg|heic|avif|mp4|webm|ogg)$/i.test(f.path||f.name||'');});if(!list.length){toast('No supported image or video files found.');return;}var added=[],pending=list.length;function maybeArrange(){if(--pending>0)return;if(added.length>=2){board.setSelection(added.map(function(it){return it.id;}));var gap=layoutGapValue();if(board.autoArrangeSelected({gap:gap})){render();toast(added.length+' files arranged');}}}list.forEach(function(f,index){var p=f.path||f.name;if(/\.(mp4|webm|ogg)$/i.test(p)){addVideoFile(f,cx+index*28,cy+index*28,function(vitem){if(vitem)added.push(vitem);maybeArrange();});return;}naturalSize(p,function(size){var item=board.addImage(p,cx+index*28,cy+index*28,size);if(item)added.push(item);queueThumbnails([item]);render();reframeIfNeeded(item);maybeArrange();});});}
/* Local video: poster first (real first frame), playback streams from the
 * original path. Nothing is copied — boards stay portable, videos relink. */
function addVideoFile(file,cx,cy,done){var p=file.path||file.name;if(!requireBoard()){if(done)done(null);return;}pendingImports++;captureVideoPoster(p,function(poster,missing,size){pendingImports--;var w=640,h=360;if(size&&size.width>0&&size.height>0){var cap=4096,vscale=Math.min(1,cap/Math.max(size.width,size.height));w=Math.max(80,Math.round(size.width*vscale));h=Math.max(60,Math.round(size.height*vscale));}var item=board.addVideo(cx,cy,{path:p,poster:poster,name:basename(p),width:w,height:h});if(missing)toast('Video added · MP4 (H.264) or WebM required for playback.');render();reframeIfNeeded(item);if(done)done(item);});}
function captureVideoPoster(file,done){var video=document.createElement('video'),settled=false;video.muted=true;video.preload='metadata';
 function finish(poster,size){if(settled)return;settled=true;try{video.pause&&video.pause();}catch(ignore){}video.src='';done(poster||'',!poster,size||null);}
 video.onloadeddata=function(){try{video.currentTime=Math.min(.1,video.duration/2);}catch(e){finish('');}};
 video.onseeked=function(){var dims={width:video.videoWidth||0,height:video.videoHeight||0};try{var canvas=document.createElement('canvas');var scale=Math.min(1,960/Math.max(video.videoWidth||1,video.videoHeight||1));canvas.width=Math.max(2,Math.round((video.videoWidth||320)*scale));canvas.height=Math.max(2,Math.round((video.videoHeight||180)*scale));canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);finish(canvas.toDataURL('image/jpeg',.8),dims);}catch(e){finish('',dims);}};
 video.onerror=function(){finish('');};
 try{video.src=PathCodec.toFileUrl(file);}catch(e){finish('');return;}
 setTimeout(function(){finish('');},15000);
}
var nativePastePoint=null;
function openPicker(point){
 if(fileOperationBusy()||!requireBoard())return;
 var owner=board,rect=viewport.getBoundingClientRect(),source=point&&typeof point.x==='number'&&!point.type?point:boardPoint(rect.left+rect.width/2,rect.top+rect.height/2);
 // Copy the coordinates: a reused menu object may move while the dialog is open.
 var p={x:source.x,y:source.y};
 var result=dialogs.openMany({kind:'add-images',title:'Add images and videos',extensions:FileDialogs.IMAGE_EXTENSIONS.concat(FileDialogs.VIDEO_EXTENSIONS)});
 if(result.status!=='chosen'){if(result.status!=='canceled')reportDialog('Add images',result);return;}
 // The modal dialog can outlive the board it was opened from.
 if(board!==owner||fileOperationBusy())return;
 addFiles(result.paths.map(function(file){return{path:file};}),p.x,p.y);
}
function openRelinkPicker(item){
 if(fileOperationBusy()||!requireBoard()||!item||item.type!=='image'||item.hidden||item.locked||board.transformableItems().indexOf(item)<0||(item.groupId&&item.groupId!==board.editingGroup))return;
 var owner=board,id=item.id,original=item;
 var result=dialogs.open({kind:'relink-image',title:'Relink image',extensions:FileDialogs.IMAGE_EXTENSIONS});
 if(result.status!=='chosen'){if(result.status!=='canceled')reportDialog('Relink image',result);return;}
 if(board!==owner||fileOperationBusy())return;
 var current=board.getItem(id);
 if(current!==original||current.hidden||current.locked||board.transformableItems().indexOf(current)<0||(current.groupId&&current.groupId!==board.editingGroup))return;
 board.beginTransaction();board.updateItem(id,{path:result.path,missing:false});board.commitTransaction();render();
}
viewport.addEventListener('dragover',function(e){e.preventDefault();e.dataTransfer.dropEffect='copy';});viewport.addEventListener('drop',function(e){e.preventDefault();if(!requireBoard())return;var p=boardPoint(e.clientX,e.clientY);addFiles(e.dataTransfer.files,p.x,p.y);});
viewport.addEventListener('wheel',function(e){e.preventDefault();var rect=viewport.getBoundingClientRect();board.zoomAt(board.camera.zoom*Math.exp(-e.deltaY*.0012),e.clientX-rect.left,e.clientY-rect.top);scheduleCameraRender();},{passive:false});
function undo(){cancelDrawGesture();if(drawingUI)drawingUI.close();if(board.undo()){render();toast('Undo');}}function redo(){cancelDrawGesture();if(drawingUI)drawingUI.close();if(board.redo()){render();toast('Redo');}}
function rectFromPoints(a,b){return{minX:Math.min(a.x,b.x),minY:Math.min(a.y,b.y),maxX:Math.max(a.x,b.x),maxY:Math.max(a.y,b.y)};}
// Shift while drawing a section locks the frame to 1:1, growing to the
// larger drag dimension, exactly like the Shape tool's perfect proportions.
function sectionDragPoint(start,p,lock){if(!lock)return p;var dx=p.x-start.x,dy=p.y-start.y,side=Math.max(Math.abs(dx),Math.abs(dy));return{x:start.x+(dx<0?-side:side),y:start.y+(dy<0?-side:side)};}
// Alt during creation snaps the drag point to other items' edges and
// centers, the same object snap Alt gives a move (8px screen threshold, a
// zero-size rect turns snapMove into a point snap). Nothing is being moved,
// so every visible item is a target, sections included: aligning a new
// frame to an existing frame's edge is the point.
function altSnapPoint(p,b,exclude){var others=b.items.filter(function(i){return !i.hidden&&!(exclude&&exclude.indexOf(i.id)>=0);});if(!others.length)return p;var s=Geometry.snapMove({x:p.x,y:p.y,width:0,height:0},others,8/b.camera.zoom);return{x:s.x,y:s.y};}
// Alt during a resize snaps the dragged edge (or edges, for a corner) to
// other items' edges and centers, the same snap Alt gives a move. The
// selection itself is excluded from the targets so an edge cannot stick to
// the box being resized.
function resizeSnapDelta(snap,dir,dx,dy,b){var bounds=snap.bounds;if(dir.indexOf('e')>=0)dx=altSnapPoint({x:bounds.maxX+dx,y:bounds.minY},b,b.selection).x-bounds.maxX;if(dir.indexOf('w')>=0)dx=altSnapPoint({x:bounds.minX+dx,y:bounds.minY},b,b.selection).x-bounds.minX;if(dir.indexOf('s')>=0)dy=altSnapPoint({x:bounds.minX,y:bounds.maxY+dy},b,b.selection).y-bounds.maxY;if(dir.indexOf('n')>=0)dy=altSnapPoint({x:bounds.minX,y:bounds.minY+dy},b,b.selection).y-bounds.minY;return{dx:dx,dy:dy};}
function measureNote(item,text){var s=NoteStyle.style(item),pad=s.padding,vertical=s.textOrientation==='vertical';var probe=document.createElement('div');probe.style.cssText='position:absolute;visibility:hidden;white-space:pre-wrap;overflow:hidden;overflow-wrap:anywhere;word-wrap:break-word;word-break:break-word;box-sizing:border-box;padding:'+pad+'px';if(vertical){probe.style.height=item.height+'px';probe.style.width='1px';probe.style.writingMode='vertical-rl';probe.style.textOrientation='upright';}else probe.style.width=item.width+'px';probe.style.font=NoteStyle.font(item);probe.style.fontWeight=s.bold?'700':'400';probe.style.fontStyle=s.italic?'italic':'normal';probe.style.lineHeight=s.lineHeight;probe.style.letterSpacing=s.letterSpacing+'px';probe.style.textAlign=item.align||'left';probe.innerHTML='';var lines=String(text===undefined?item.text:text||'').split('\n');lines.forEach(function(line,index){var p=document.createElement('div');p.textContent=line||'\u00a0';if(index>0&&s.paragraphSpacing)p.style.marginTop=s.paragraphSpacing+'px';probe.appendChild(p);});document.body.appendChild(probe);var size=vertical?Math.max(56,Math.ceil(probe.scrollWidth)):Math.max(56,Math.ceil(probe.scrollHeight));document.body.removeChild(probe);return size;}
function autoSizeNote(el,item){var s=NoteStyle.style(item),vertical=s.textOrientation==='vertical',size=el?Math.max(56,Math.ceil((vertical?el.scrollWidth:el.scrollHeight)+s.padding*2)):measureNote(item),manual=vertical?item.widthManual:item.heightManual,current=vertical?item.width:item.height,key=vertical?'width':'height',patch={};
 // A manually resized note keeps its size: typing never shrinks it back, and
 // the box only grows when the text actually overflows it.
 if(manual&&size<=current+1)return;
 if(Math.abs(size-current)>1){patch[key]=size;if(vertical){var d=size-current,r=(Number(item.rotation)||0)*Math.PI/180;patch.x=item.x-d*(Math.cos(r)+1)/2;patch.y=item.y-d*Math.sin(r)/2;}board.updateItem(item.id,patch);var ref=el&&el.closest&&el.closest('.reference');if(ref){ref.style[key]=size+'px';if(patch.x!==undefined)ref.style.left=patch.x+'px';if(patch.y!==undefined)ref.style.top=patch.y+'px';}}}
function escapeHtml(value){return String(value||'').replace(/[&<>"']/g,function(ch){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];});}
function noteMarkup(text){
 text=String(text||'');var out='',last=0,match,re=/(https?:\/\/[^\s<>"']+)/gi;
 while((match=re.exec(text))){var url=match[1],tail='';while(/[),.!?;:]$/.test(url)){tail=url.slice(-1)+tail;url=url.slice(0,-1);}out+=escapeHtml(text.slice(last,match.index))+'<span class="note-link" data-note-url="'+escapeHtml(url)+'">'+escapeHtml(url)+'</span>'+escapeHtml(tail);last=match.index+match[1].length;}
 return out+escapeHtml(text.slice(last));
}
function parseMediaUrl(text){var url=String(text||'').trim();if(!/^https?:\/\/\S+$/i.test(url))return null;var match=/(?:youtube\.com\/(?:watch\?[^\s]*v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/i.exec(url);if(match)return{url:url,provider:'youtube',videoId:match[1],thumbnail:'https://i.ytimg.com/vi/'+match[1]+'/maxresdefault.jpg',title:'YouTube video',mediaType:'video'};if(/\.(?:png|jpe?g|gif|webp|bmp|svg)(?:[?#].*)?$/i.test(url))return{url:url,provider:'direct',thumbnail:url,title:basename(url.split(/[?#]/)[0]),mediaType:'image'};if(/\.(?:mp4|webm|ogg)(?:[?#].*)?$/i.test(url))return{url:url,provider:'direct',title:basename(url.split(/[?#]/)[0]),mediaType:'video'};return{url:url,provider:'link',title:url.replace(/^https?:\/\//i,'').split('/')[0],mediaType:'link'};}
function openExternal(url){if(typeof url!=='string'||!/^https?:\/\/[^\s]+$/i.test(url)){toast('Only HTTP or HTTPS links can be opened.');return;}try{if(cs&&typeof cs.openURLInDefaultBrowser==='function'&&cs.openURLInDefaultBrowser(url)!==false)return;window.open(url,'_blank','noopener,noreferrer');}catch(e){toast('Unable to open this link in the browser.');}}
function linkMarkup(item){if(item.mediaType==='image')return'<img class="link-media" src="'+escapeHtml(item.url)+'">';var media=item.thumbnail?'<img class="link-media" data-yt-thumb="'+escapeHtml(item.thumbnail)+'" src="'+escapeHtml(item.thumbnail)+'">':'<div class="link-placeholder">'+escapeHtml(item.title)+'</div>';return media+(item.mediaType==='video'?'<button class="link-play" data-link-action="play">Play</button>':'');}
function videoPosterMarkup(item){var media=item.poster?'<img class="link-media" src="'+escapeHtml(item.poster)+'">':'<div class="link-placeholder">'+escapeHtml(item.title||'Video')+'</div>';return media+'<button class="link-play" data-link-action="play">Play</button>';}
// YouTube fallback thumbs (sd/hq) are 4:3 letterboxed: the true 16:9 picture
// sits in a black-barred frame. Counter-zoom it with pure CSS from the decoded
// natural ratio — no layout reads (getBoundingClientRect) here, those caused
// visible jank when a saved board re-rendered many links at once.
function wireYtThumbnails(scope){
 scope.querySelectorAll('img[data-yt-thumb]').forEach(function(img){
  if(img.dataset.ytWired)return;img.dataset.ytWired='1';
  img.onerror=function(){
   var base=img.dataset.ytThumb.replace(/\/[a-z]+default\.jpg.*$/i,'');
   var chain=['maxresdefault','sddefault','hqdefault'];
   var current=(img.src.match(/([a-z]+)default\.jpg/i)||[])[1]||'maxresdefault';
   var next=chain[chain.indexOf(current)+1];
   if(next)img.src=base+'/'+next+'.jpg';else img.removeAttribute('data-yt-wired');
  };
  img.onload=function(){
   if(!img.naturalWidth||!img.naturalHeight)return;
   var ratio=img.naturalWidth/img.naturalHeight;
   // Card content is 16:9 by construction (link cards are created 960x540);
   // compare against 16/9 without touching layout.
   if(ratio<16/9-0.01){
    var zoom=(16/9)/ratio; // >1: how much taller the raw image is than the card
    img.style.setProperty('--yt-zoom',String(zoom));
   }
  };
 });
}
function renderLink(el,item){var card=el.querySelector('.link-card'),body=card.querySelector('.link-body');card.querySelector('.link-titlebar span').textContent=item.title;var playing=!!el.querySelector('.link-player');/* The player is created by playLink, which records the intent first; render
   * must only rebuild when reality differs from that intent. Rebuilding on
   * every unrelated render destroyed live iframes/video elements. */if(body.dataset.url!==item.url||playing!==!!el._playerActive){el._playerActive=playing;body.dataset.url=item.url;body.innerHTML=item.provider==='local'?videoPosterMarkup(item):linkMarkup(item);wireYtThumbnails(body);}}
var youtubeTitleCache=Object.create(null);
function fetchYouTubeTitle(item,done){
 if(!https||!item||item.provider!=='youtube'){done('');return;}
 if(youtubeTitleCache[item.videoId]!==undefined){done(youtubeTitleCache[item.videoId]);return;}
 var endpoint='https://www.youtube.com/oembed?url='+encodeURIComponent(item.url)+'&format=json',settled=false;
 function finish(title){if(settled)return;settled=true;title=String(title||'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,300);youtubeTitleCache[item.videoId]=title;done(title);}
 var request=https.get(endpoint,function(response){var body='';if(response.statusCode!==200){response.resume();finish('');return;}response.setEncoding('utf8');response.on('data',function(chunk){if(body.length<65536)body+=chunk;});response.on('end',function(){try{finish(JSON.parse(body).title);}catch(ignore){finish('');}});});
 request.setTimeout(5000,function(){request.destroy();finish('');});request.on('error',function(){finish('');});
}
function hydrateYouTubeTitle(owner,item){
 if(!item||item.provider!=='youtube'||item.title!=='YouTube video')return;
 fetchYouTubeTitle(item,function(title){if(!title||board!==owner)return;var live=board.getItem(item.id);if(live!==item||item.title!=='YouTube video')return;item.title=title;board.bump();render();});
}
var mediaServer=null,mediaServerUrl='';function ensureMediaServer(done){if(mediaServerUrl){done(mediaServerUrl);return;}if(!http){done('');return;}mediaServer=http.createServer(function(req,res){var requestUrl=String(req.url||''),parts=requestUrl.replace(/^\//,'').split('?'),videoId=parts[0],query=new URLSearchParams(parts[1]||''),itemId=query.get('item')||'',start=Math.max(0,Math.floor(Number(query.get('start'))||0));res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Referrer-Policy':'origin'});res.end('<!doctype html><meta name="referrer" content="origin"><style>html,body,#player{margin:0;width:100%;height:100%;border:0;background:#000;overflow:hidden}</style><div id="player"></div><script src="https://www.youtube.com/iframe_api"><\/script><script>var videoId='+JSON.stringify(videoId)+',itemId='+JSON.stringify(itemId)+',start='+start+';function report(state){parent.postMessage({type:\'messboard-youtube-state\',itemId:itemId,state:state},\'*\')}function onYouTubeIframeAPIReady(){new YT.Player(\'player\',{videoId:videoId,playerVars:{autoplay:1,start:start,rel:0,enablejsapi:1},events:{onStateChange:function(e){if(e.data===YT.PlayerState.ENDED)report(\'ended\')}}})}<\/script>');});mediaServer.listen(0,'127.0.0.1',function(){mediaServerUrl='http://127.0.0.1:'+mediaServer.address().port+'/';done(mediaServerUrl);});mediaServer.on('error',function(){mediaServer=null;done('');});}
function bindPlaybackFeedback(body){var video=body.querySelector('video');if(video)video.onerror=function(){if(body.querySelector('video')===video)body.textContent='Online playback failed — use Open to try the browser, or Stop to retry.';};}
function stopLinkPlayback(itemId){var item=board.getItem(itemId);if(!item||item.type!=='link')return;var el=BoardUI.reference(world,item.id),body=el&&el.querySelector('.link-body');if(body){el._playerActive=false;body.dataset.url='';body.classList.remove('vc-live','vc-cursor-none','vc-paused','vc-flash');renderLink(el,item);}viewport.focus();}
window.addEventListener('message',function(event){var message=event.data;if(!message||message.type!=='messboard-youtube-state'||message.state!=='ended')return;if(typeof event.origin==='string'&&event.origin.indexOf('http://127.0.0.1:')!==0)return;stopLinkPlayback(message.itemId);});
/* Fixed-width control bar for local video players. It lives inside the card in
 * board coordinates (always spans the video, never "adaptive"), because the
 * native <video> control bar mis-sizes under the world transform in CEP. */
var VC_PLAY_SVG='<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
    VC_PAUSE_SVG='<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>',
    VC_VOL_SVG='<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3z"/><path d="M16 8a5 5 0 0 1 0 8" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    VC_MUTE_SVG='<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3z"/><path d="M16 9l6 6M22 9l-6 6" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    VC_FULL_SVG='<svg viewBox="0 0 24 24"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>',
    VC_EXIT_SVG='<svg viewBox="0 0 24 24"><path d="M4 9h5V4M20 9h-5V4M20 15h-5v5M4 15h5v5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function attachVideoControls(body,video){
 body.classList.add('vc-live');
 var bar=document.createElement('div');
 bar.className='video-controls';
 bar.innerHTML='<div class="vc-progress"><div class="vc-bubble">0:00</div><div class="vc-track"><div class="vc-buffered"></div><div class="vc-played"></div></div><div class="vc-knob"></div></div><div class="vc-row"><button type="button" class="vc-play" title="Play / Pause">'+VC_PAUSE_SVG+'</button><span class="vc-time">0:00 / 0:00</span><button type="button" class="vc-mute" title="Mute / Unmute">'+VC_VOL_SVG+'</button><button type="button" class="vc-full" title="Fullscreen">'+VC_FULL_SVG+'</button></div>';
 body.appendChild(bar);
 var center=document.createElement('button');center.type='button';center.className='vc-center';center.title='Play / Pause';center.innerHTML=VC_PLAY_SVG;body.appendChild(center);
 var play=bar.querySelector('.vc-play'),time=bar.querySelector('.vc-time'),mute=bar.querySelector('.vc-mute'),full=bar.querySelector('.vc-full'),
     prog=bar.querySelector('.vc-progress'),played=bar.querySelector('.vc-played'),buffered=bar.querySelector('.vc-buffered'),knob=bar.querySelector('.vc-knob'),bubble=bar.querySelector('.vc-bubble'),scrubbing=false;
 var iconState={};
 function setIcon(el,key,svg){if(iconState[key]!==svg){iconState[key]=svg;el.innerHTML=svg;}}
 function fmt(s){s=Math.max(0,Math.floor(s||0));var m=Math.floor(s/60);return (Math.floor(m/60)>0?Math.floor(m/60)+':'+('0'+(m%60)).slice(-2):m)+':'+('0'+(s%60)).slice(-2);}
 function sync(){
  var d=video.duration||0,frac=d>0?video.currentTime/d:0;
  time.textContent=fmt(video.currentTime)+' / '+fmt(d);
  played.style.width=(frac*100)+'%';
  knob.style.left=(frac*100)+'%';
  var b=0;try{if(video.buffered&&video.buffered.length&&d>0)b=video.buffered.end(video.buffered.length-1)/d;}catch(e){}
  buffered.style.width=(Math.max(0,Math.min(1,b))*100)+'%';
  setIcon(play,'play',video.paused?VC_PLAY_SVG:VC_PAUSE_SVG);
  setIcon(mute,'mute',video.muted?VC_MUTE_SVG:VC_VOL_SVG);
  setIcon(full,'full',(document.fullscreenElement||document.webkitFullscreenElement)===body?VC_EXIT_SVG:VC_FULL_SVG);
  setIcon(center,'center',(video.paused||video.ended)?VC_PLAY_SVG:VC_PAUSE_SVG);
  body.classList.toggle('vc-paused',video.paused||video.ended);
 }
 function placeBubble(frac){
  var w=prog.clientWidth||0,d=video.duration||0;
  bubble.style.left=Math.max(22,Math.min(Math.max(22,w-22),frac*w))+'px';
  bubble.textContent=fmt(d*frac);
 }
 function moveBubble(e){
  var w=prog.clientWidth||0;if(w<=0)return;
  placeBubble(Math.max(0,Math.min(1,e.offsetX/w)));
 }
 function seekTo(e){
  // offsetX is in the bar's local units, so world scale/rotation stay correct.
  var w=prog.clientWidth||0,d=video.duration||0;
  if(w>0&&d>0){
   var frac=Math.max(0,Math.min(1,e.offsetX/w));
   video.currentTime=frac*d;
   // Paint the target immediately; the element confirms a beat later.
   played.style.width=(frac*100)+'%';knob.style.left=(frac*100)+'%';
   time.textContent=fmt(video.currentTime)+' / '+fmt(d);
   placeBubble(frac);
  }
 }
 prog.addEventListener('pointerdown',function(e){e.stopPropagation();scrubbing=true;clearTimeout(hideTimer);setBarHidden(false);bar.classList.add('scrubbing');try{prog.setPointerCapture(e.pointerId);}catch(err){}seekTo(e);});
 prog.addEventListener('pointermove',function(e){if(scrubbing)seekTo(e);else moveBubble(e);});
 function endScrub(){if(!scrubbing)return;scrubbing=false;bar.classList.remove('scrubbing');sync();armHide();}
 prog.addEventListener('pointerup',endScrub);
 prog.addEventListener('pointercancel',endScrub);
 var hideTimer=null;
 function setBarHidden(hidden){
  bar.classList.toggle('vc-hidden',hidden);
  body.classList.toggle('vc-cursor-none',hidden);
  if(hidden)bar.classList.remove('scrubbing');
 }
 function armHide(){
  clearTimeout(hideTimer);
  if(video.paused||video.ended||scrubbing)return;
  hideTimer=setTimeout(function(){setBarHidden(true);},2500);
 }
 function wake(){setBarHidden(false);armHide();}
 body.addEventListener('pointermove',wake);
 body.addEventListener('pointerdown',wake);
 body.addEventListener('pointerleave',function(){clearTimeout(hideTimer);if(!video.paused&&!scrubbing)hideTimer=setTimeout(function(){setBarHidden(true);},600);});
 function togglePlay(){if(video.paused||video.ended)video.play();else video.pause();}
 play.addEventListener('click',function(e){e.stopPropagation();togglePlay();});
 var flashTimer=null;
 function flashCenter(){body.classList.remove('vc-flash');void body.offsetWidth;body.classList.add('vc-flash');clearTimeout(flashTimer);flashTimer=setTimeout(function(){body.classList.remove('vc-flash');},450);}
 center.addEventListener('click',function(e){e.stopPropagation();togglePlay();flashCenter();});
 video.addEventListener('click',function(){togglePlay();flashCenter();});
 mute.addEventListener('click',function(e){e.stopPropagation();video.muted=!video.muted;sync();});
 function toggleFull(){
  if(document.fullscreenElement||document.webkitFullscreenElement){if(document.exitFullscreen)document.exitFullscreen();else if(document.webkitExitFullscreen)document.webkitExitFullscreen();}
  else if(body.requestFullscreen){var p=body.requestFullscreen();if(p&&p.catch)p.catch(function(){if(video.webkitEnterFullscreen)video.webkitEnterFullscreen();});}
  else if(video.webkitEnterFullscreen)video.webkitEnterFullscreen();
 }
 full.addEventListener('click',function(e){e.stopPropagation();toggleFull();});
 video.addEventListener('timeupdate',sync);
 video.addEventListener('progress',sync);
 video.addEventListener('play',function(){sync();armHide();});video.addEventListener('pause',function(){sync();clearTimeout(hideTimer);setBarHidden(false);});video.addEventListener('ended',function(){clearTimeout(hideTimer);setBarHidden(false);});
 video.addEventListener('loadedmetadata',sync);video.addEventListener('volumechange',sync);
 sync();
}
function playLink(el,item){var body=el.querySelector('.link-body');if(item.provider==='youtube'){el._playerActive=true;ensureMediaServer(function(base){if(!base){el._playerActive=false;body.textContent='Online playback unavailable — use Open to try the browser.';return;}body.innerHTML='<iframe class="link-player" src="'+base+encodeURIComponent(item.videoId)+'?item='+encodeURIComponent(item.id)+'" frameborder="0" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>';});}else if(item.provider==='local'){el._playerActive=true;stopLinkPlayback(board.items.map(function(x){return x.id;}).find(function(id){var other=board.getItem(id);return other!==item&&other.type==='link'&&other.provider==='local'&&BoardUI.reference(world,id,'.link-player');})||'');var url=PathCodec.toFileUrl(item.path);var video=document.createElement('video');video.className='link-player';video.autoplay=true;video.src=url;if(item.poster)video.poster=item.poster;video.onerror=function(){if(body.querySelector('video')===video)body.textContent='This video cannot be played here — convert to MP4 (H.264) or WebM, then relink.';};body.innerHTML='';body.appendChild(video);attachVideoControls(body,video);}else if(item.mediaType==='video'){el._playerActive=true;body.classList.add('vc-live');body.innerHTML='<video class="link-player" src="'+escapeHtml(item.url)+'" controls autoplay></video>';bindPlaybackFeedback(body);}else openExternal(item.url);}
viewport.addEventListener('mousedown',function(e){
 if(BoardUI.isEditing(e.target)||e.target.closest('#groupScope'))return;
 if(e.button!==0&&e.button!==1)return;
 var noteLink=e.target.closest('[data-note-url]'),noteEditor=noteLink&&noteLink.closest('.note-content');
 if(e.button===0&&e.ctrlKey&&noteLink&&!noteEditor.isContentEditable){e.preventDefault();e.stopPropagation();openExternal(noteLink.dataset.noteUrl);return;}
 viewport.focus();var target=e.target.closest('.reference'),id=target&&target.dataset.id,p=boardPoint(e.clientX,e.clientY),item=id&&board.getItem(id),overlay=e.target.closest('#selectionBox'),handle=e.target.classList.contains('handle'),rotation=rotateZoneAt(e.clientX,e.clientY)>=0;
 if(space||e.button===1){pan={sx:e.clientX,sy:e.clientY,x:board.camera.x,y:board.camera.y};viewport.classList.add('panning');e.preventDefault();return;}
 if(!drawMode&&item&&board.editingGroup&&item.groupId!==board.editingGroup){board.exitGroup();}
 if(!drawMode&&target&&e.target.closest('.link-player,.video-controls,.vc-center,[data-link-action]')&&!handle){if(board.selection.indexOf(id)<0){board.setSelection([id]);render();}return;}
 // Highlighting note text without edit mode is a deliberate gesture:
 // Ctrl+drag on the text (the note selects itself first when needed). A
 // plain drag anywhere on the note moves it, like every other item type.
 var nc=e.target.closest&&e.target.closest('.note-content');
 if(nc&&!handle&&!rotation&&(e.ctrlKey||e.metaKey)){var nr=nc.closest('.reference'),nid=nr&&nr.dataset.id;if(nid){if(board.selection.indexOf(nid)<0){board.setSelection([nid]);render();}return;}}
 // Board gestures must not extend native text ranges; editors/media returned above.
 e.preventDefault();var selection=window.getSelection();if(selection&&(world.contains(selection.anchorNode)||world.contains(selection.focusNode)))selection.removeAllRanges();
 // A section is a region, not an obstacle: a click on its frame area counts
 // as empty canvas for the placement gestures below (note, marquee, another
 // section). Only the label and the resize handles stay solid, so label
 // drags and handle resizes keep working exactly as before.
 var sectionBody=item&&item.type==='section'&&!handle&&!e.target.closest('.section-label');
 if(sectionMode&&(!target||sectionBody)&&!overlay){action={type:'section',start:p,current:p};marquee.hidden=true;marquee.classList.add('section-preview');paintDragRect(p);e.preventDefault();return;}
 if(textMode&&(!target||sectionBody)&&!overlay){placeText(e.altKey?altSnapPoint(p,board):p);e.preventDefault();return;}
 if(drawMode){var drawing=drawingUI.snapshot();if(drawing){action={type:'draw',board:board,tool:drawing.tool,style:drawing.style,start:p,points:[[p.x,p.y]],tolerance:.5/board.camera.zoom};if(drawing.tool==='pen'&&typeof StrokeFilter!=='undefined')action.filter=StrokeFilter.create(drawing.style?drawing.style.stabilize:0,p.x,p.y,performance.now());scheduleDrawPreview(action,e.shiftKey,e.altKey);}e.preventDefault();return;}
 if((!target||sectionBody)&&!overlay&&!rotation){action={type:'marquee',start:p,sx:e.clientX,sy:e.clientY,add:e.shiftKey};var vr=viewport.getBoundingClientRect();marquee.hidden=true;marquee.style.left=(e.clientX-vr.left)+'px';marquee.style.top=(e.clientY-vr.top)+'px';marquee.style.width='0px';marquee.style.height='0px';if(!e.shiftKey)board.setSelection([]);render();return;}
 if(id&&e.shiftKey&&!handle&&!rotation){board.toggleSelection(id);render();return;}
 if(id&&board.selection.indexOf(id)<0)board.setSelection([id]);
 var movable=board.transformableItems();if(!movable.length||(item&&movable.every(function(i){return i.id!==id;}))){render();return;}
 var actionKind=handle?'resize':rotation?'rotate':'move';
 if(actionKind==='move'){
  // Dragging a section frame takes everything spatially inside along.
  var seenCarry=Object.create(null),carried=[];movable.forEach(function(mi){seenCarry[mi.id]=true;});
  movable.forEach(function(mi){if(mi.type==='section'&&mi.follow!==false)board.sectionContents(mi).forEach(function(x){if(!seenCarry[x.id]){seenCarry[x.id]=true;carried.push(x);}});});
  if(carried.length)movable=movable.concat(carried);
 }
 var snapshot=SelectionGeometry.snapshot(movable);board.beginTransaction();
 action={type:actionKind,dir:e.target.dataset.dir,start:p,snapshot:snapshot};
 if(rotation){action.zone=rotateZoneAt(e.clientX,e.clientY);action.angle=Math.atan2(p.y-snapshot.center.y,p.x-snapshot.center.x)*180/Math.PI;action.lastAngle=action.angle;action.totalAngle=0;}
 render();e.preventDefault();
});
window.addEventListener('mousemove',dragMoveHandler);
// Selection highlight: highlight all occurrences of selected text within a note (scope A)
(function(){
 var HIGHLIGHT_CLASS='sel-match-hl';
 function clearHighlights(){
  var els=document.querySelectorAll('.'+HIGHLIGHT_CLASS);
  for(var i=0;i<els.length;i++){
   var el=els[i],parent=el.parentNode;
   while(el.firstChild)parent.insertBefore(el.firstChild,el);
   parent.removeChild(el);
   parent.normalize();
  }
 }
 function getTextNodes(root){
  var nodes=[],walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,null,false),n;
  while(n=walker.nextNode())nodes.push(n);
  return nodes;
 }
 function getCharOffset(root,node,offset){
  var walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,null,false),n,pos=0;
  while(n=walker.nextNode()){
   if(n===node)return pos+offset;
   pos+=n.textContent.length;
  }
  return -1;
 }
 function nodeForOffset(root,offset){
  var walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,null,false),n,pos=0;
  while(n=walker.nextNode()){
   var len=n.textContent.length;
   if(pos+len>=offset)return{node:n,offset:offset-pos};
   pos+=len;
  }
  return null;
 }
 function highlightMatches(noteEl,searchText,selStart,selEnd){
  clearHighlights();
  if(!searchText)return;
  var fullText=noteEl.textContent,lowerFull=fullText.toLowerCase(),lower=searchText.toLowerCase();
  var matches=[],idx=0,m;
  while((m=lowerFull.indexOf(lower,idx))>=0){matches.push(m);idx=m+searchText.length;}
  if(!matches.length)return;
  var textNodes=getTextNodes(noteEl),nodeOffsets=[],pos=0,i;
  for(i=0;i<textNodes.length;i++){nodeOffsets.push(pos);pos+=textNodes[i].textContent.length;}
  for(i=0;i<textNodes.length;i++){
   var node=textNodes[i],text=node.textContent,nodeStart=nodeOffsets[i],nodeEnd=nodeStart+text.length;
   var frag=document.createDocumentFragment(),lastIdx=0,hasMatch=false;
   for(var j=0;j<matches.length;j++){
    var ms=matches[j],me=ms+searchText.length;
    if(me<=nodeStart||ms>=nodeEnd)continue;
    var rs=Math.max(ms,nodeStart)-nodeStart,re=Math.min(me,nodeEnd)-nodeStart;
    var absRs=nodeStart+rs,absRe=nodeStart+re;
    if(absRs>=selStart&&absRe<=selEnd)continue;
    hasMatch=true;
    if(rs>lastIdx)frag.appendChild(document.createTextNode(text.slice(lastIdx,rs)));
    var mark=document.createElement('span');
    mark.className=HIGHLIGHT_CLASS;
    mark.textContent=text.slice(rs,re);
    frag.appendChild(mark);
    lastIdx=re;
   }
   if(hasMatch){
    if(lastIdx<text.length)frag.appendChild(document.createTextNode(text.slice(lastIdx)));
    node.parentNode.replaceChild(frag,node);
   }
  }
  var sPos=nodeForOffset(noteEl,selStart),ePos=nodeForOffset(noteEl,selEnd);
  if(sPos&&ePos){
   var range=document.createRange();
   range.setStart(sPos.node,sPos.offset);
   range.setEnd(ePos.node,ePos.offset);
   var sel=window.getSelection();
   sel.removeAllRanges();
   sel.addRange(range);
  }
 }
 var highlightTimer=null;
 document.addEventListener('mouseup',function(e){
  if(highlightTimer)clearTimeout(highlightTimer);
  highlightTimer=setTimeout(function(){
   var sel=window.getSelection();
   if(!sel||sel.isCollapsed||sel.rangeCount===0){clearHighlights();return;}
   var range=sel.getRangeAt(0),noteEl=null;
   var node=range.commonAncestorContainer;
   var el=node.nodeType===3?node.parentNode:node;
   if(el&&el.closest)noteEl=el.closest('.note-content');
   if(!noteEl){clearHighlights();return;}
   if(noteEl.isContentEditable||BoardUI.isEditing(noteEl)){clearHighlights();return;}
   var selectedText=sel.toString();
   if(!selectedText){clearHighlights();return;}
   var selStart=getCharOffset(noteEl,range.startContainer,range.startOffset);
   var selEnd=getCharOffset(noteEl,range.endContainer,range.endOffset);
   if(selStart>selEnd){var tmp=selStart;selStart=selEnd;selEnd=tmp;}
   highlightMatches(noteEl,selectedText,selStart,selEnd);
  },50);
 });
 document.addEventListener('mousedown',function(){
  if(highlightTimer)clearTimeout(highlightTimer);
  clearHighlights();
 });
})();
// The move cursor follows the drag, not the hover: while a move action is
// live the viewport wears drag-moving and CSS holds the cursor at "move".
// Resize and rotate drags pin their own cursor the same way (action-drag),
// so leaving the 10px handle or crossing the item cannot steal it mid-drag.
var RESIZE_CURSORS={n:'ns-resize',s:'ns-resize',e:'ew-resize',w:'ew-resize',nw:'nwse-resize',se:'nwse-resize',ne:'nesw-resize',sw:'nesw-resize'};
function syncDragCursor(){
 viewport.classList.toggle('drag-moving',!!(action&&action.type==='move'));
 var pin='';
 if(action&&action.type==='resize')pin=RESIZE_CURSORS[action.dir]||'';
 else if(action&&board&&action.type==='rotate'){var selT=board.selectedItems();pin=rotateCursorFor(action.zone||0,selT.length===1?(Number(selT[0].rotation)||0):0);}
 if(pin){if(viewport.style&&viewport.style.setProperty)viewport.style.setProperty('--action-cursor',pin);viewport.classList.add('action-drag');}
 else{viewport.classList.remove('action-drag');if(viewport.style&&viewport.style.removeProperty)viewport.style.removeProperty('--action-cursor');}
}
function dragMoveHandler(e){syncDragCursor();
 if(pan){board.camera.x=pan.x+e.clientX-pan.sx;board.camera.y=pan.y+e.clientY-pan.sy;scheduleCameraRender();return;}
 if(!action){var _rz=rotateZoneAt(e.clientX,e.clientY);viewport.style.cursor=_rz>=0?rotateCursorFor(_rz,rotateZoneRotDeg):'';return;}
 edgePanStep(e);
 var p=boardPoint(e.clientX,e.clientY);
 if(action.type==='draw'){var fp=action.filter?action.filter.add(p.x,p.y,performance.now()):null;action.points.push(fp||[p.x,p.y]);scheduleDrawPreview(action,e.shiftKey,e.altKey);return;}
 if(action.type==='section'){var sp=sectionDragPoint(action.start,p,e.shiftKey);if(e.altKey)sp=altSnapPoint(sp,board);action.current=sp;paintDragRect(sp);marquee.hidden=false;return;}
 if(action.type==='marquee'){paintDragRect(p);marquee.hidden=false;board.selectInRect(rectFromPoints(action.start,p),action.add);render();return;}
 var snap=action.snapshot,dx=p.x-action.start.x,dy=p.y-action.start.y,patches=[];
 if(action.type==='move'){
  if(e.shiftKey){var axis=Geometry.constrainAxis(dx,dy);dx=axis.x;dy=axis.y;}
  var anchor={x:snap.bounds.minX+dx,y:snap.bounds.minY+dy};
  if(platform.snap(e)){var point=Geometry.snapPoint(anchor,32);dx=point.x-snap.bounds.minX;dy=point.y-snap.bounds.minY;}
  if(e.altKey){var others=board.items.filter(function(i){return !i.hidden&&board.selection.indexOf(i.id)<0;}),snapped=Geometry.snapMove({x:snap.bounds.minX+dx,y:snap.bounds.minY+dy,width:snap.bounds.maxX-snap.bounds.minX,height:snap.bounds.maxY-snap.bounds.minY},others,8/board.camera.zoom);dx=snapped.x-snap.bounds.minX;dy=snapped.y-snap.bounds.minY;}
  snap.items.forEach(function(i){patches.push({id:i.id,x:i.x+dx,y:i.y+dy});});
 }else if(action.type==='resize'){if(e.altKey){var rd=resizeSnapDelta(snap,action.dir,dx,dy,board);dx=rd.dx;dy=rd.dy;}patches=SelectionGeometry.resize(snap,action.dir,dx,dy,e.shiftKey,platform.snap(e));}
 else{var raw=Math.atan2(p.y-snap.center.y,p.x-snap.center.x)*180/Math.PI,step=raw-action.lastAngle;while(step>180)step-=360;while(step< -180)step+=360;action.totalAngle+=step;action.lastAngle=raw;var quantize=platform.snap(e),angle=SelectionGeometry.rotationDelta(snap,action.totalAngle,quantize,e.shiftKey);patches=SelectionGeometry.rotate(snap,angle).filter(function(patch){for(var si=0;si<snap.items.length;si++)if(snap.items[si].id===patch.id)return snap.items[si].type!=='section';return true;});var readout=document.getElementById('rotationReadout');readout.hidden=false;readout.textContent=(snap.items.length===1?'':'Δ ')+(Math.round((snap.items.length===1?patches[0].rotation:angle)*10)/10)+'°'+(quantize?' · 10°':e.shiftKey?' · 45°':'');}
 patches.forEach(function(patch){board.updateItem(patch.id,patch);});
 if(action.type==='resize'&&snap.items.length===1&&snap.items[0].type==='note')resizeNoteHeight(board.getItem(snap.items[0].id),action.dir,e.shiftKey,platform.snap(e));
 render();
}
window.addEventListener('mouseup',function(e){if(!action&&!pan)return;stopEdgePan();document.getElementById('rotationReadout').hidden=true;if(action&&action.type==='draw'){var p=boardPoint(e.clientX,e.clientY),last=action.points[action.points.length-1];if(!last||last[0]!==p.x||last[1]!==p.y)action.points.push([p.x,p.y]);finishDrawing(action,e.shiftKey,e.altKey);clearDrawPreview();action=null;return;}if(action&&action.type==='section'){var endP=sectionDragPoint(action.start,boardPoint(e.clientX,e.clientY),e.shiftKey);if(e.altKey)endP=altSnapPoint(endP,board);var srect=rectFromPoints(action.start,endP);marquee.hidden=true;marquee.classList.remove('section-preview');action=null;
  if(srect.maxX-srect.minX<40||srect.maxY-srect.minY<40){var scx=(srect.minX+srect.maxX)/2,scy=(srect.minY+srect.maxY)/2;srect={minX:scx-480,minY:scy-270,maxX:scx+480,maxY:scy+270};}
  var createdSection=board.addSection(srect.minX,srect.minY,srect.maxX-srect.minX,srect.maxY-srect.minY,uniqueSectionName(),lastSectionStyle);clearSectionMode();render();editSectionName(board.getItem(createdSection.id));return;}
 if(action&&action.type!=='marquee')board.commitTransaction();if(action&&action.type==='marquee')marquee.hidden=true;if(pan)lastCanvasPoint=boardPoint(e.clientX,e.clientY);pan=null;action=null;viewport.classList.remove('panning');viewport.classList.remove('drag-moving');viewport.classList.remove('action-drag');if(viewport.style&&viewport.style.removeProperty)viewport.style.removeProperty('--action-cursor');render();});
function handlePropertiesShortcut(e){
 if((e.key||'').toLowerCase()!=='e'||e.ctrlKey||e.metaKey||e.altKey||e.shiftKey)return false;
 if(BoardUI.isEditing(e.target)||(e.target.closest&&e.target.closest('button,summary,a,[role="button"],.tool-panel,.command-menu,.context-menu')))return false;
 if(action||pan||pendingImports||(cropUI&&cropUI.isActive())||(colorPicker&&colorPicker.isOpen())||(filesUI&&filesUI.isBusy())||(aeUI&&aeUI.isBusy()))return false;
 e.preventDefault();showProperties();return true;
}
function handleCropShortcut(e){
 if((e.key||'').toLowerCase()!=='c'||e.ctrlKey||e.metaKey||e.altKey||e.shiftKey)return false;
 if(BoardUI.isEditing(e.target)||(e.target.closest&&e.target.closest('button,summary,a,[role="button"],.tool-panel,.command-menu,.context-menu')))return false;
 if(action||pan||pendingImports||(cropUI&&cropUI.isActive())||(colorPicker&&colorPicker.isOpen())||(filesUI&&filesUI.isBusy())||(aeUI&&aeUI.isBusy()))return false;
 if(!EditorCommands.state('crop',board).enabled)return false;
 e.preventDefault();document.getElementById('cropBtn').click();return true;
}
function handleSendShortcut(e){
 if((e.key||'').toLowerCase()!=='i'||e.ctrlKey||e.metaKey||e.altKey)return false;
 if(BoardUI.isEditing(e.target)||(e.target.closest&&e.target.closest('button,summary,a,[role="button"],.tool-panel,.command-menu,.context-menu')))return false;
 if(action||pan||pendingImports||(cropUI&&cropUI.isActive())||(colorPicker&&colorPicker.isOpen())||(filesUI&&filesUI.isBusy())||(aeUI&&aeUI.isBusy()))return false;
 if(!EditorCommands.state('send',board).enabled)return false;
 e.preventDefault();sendToAE(e.shiftKey);return true;
}
function activateCanvasTool(name){
 if(name==='select'){
  textMode=false;viewport.classList.remove('texting');document.getElementById('noteBtn').classList.remove('active');toggleDraw(false);stopErasing();clearSectionMode();
  if(shellUI){shellUI.closeMenus(false);shellUI.closePanels();}viewport.focus();return;
 }
 document.getElementById(name==='text'?'noteBtn':name+'Btn').click();
}
// Edge auto-pan while dragging: nearing the viewport edge scrolls the camera so
// a drag can travel beyond the visible panel without releasing the pointer.
// Marquee joins in: its start point is a fixed board coordinate and the box is
// painted in screen space, so panning stretches the live selection rect while
// the box outline stays between the drag start and the cursor.
var EDGE_PAN_ZONE=28,EDGE_PAN_SPEED=1.2,edgePanFrame=0,edgePanDir={x:0,y:0},edgePanEvent=null,edgePanLooping=false;
function edgePanDelta(e){
 var r=viewport.getBoundingClientRect(),x=0,y=0;
 if(e.clientX-r.left<EDGE_PAN_ZONE)x=1;else if(r.right-e.clientX<EDGE_PAN_ZONE)x=-1;
 if(e.clientY-r.top<EDGE_PAN_ZONE)y=1;else if(r.bottom-e.clientY<EDGE_PAN_ZONE)y=-1;
 return{x:x,y:y};
}
function edgePanSpeed(){var v=typeof preferences!=='undefined'&&preferences?preferences.get().edgePanSpeed:2.5;return typeof v==='number'&&isFinite(v)&&v>=0.1?v:2.5;}
function edgePanTick(){
 edgePanFrame=0;
 if(!action||action.type==='draw'){edgePanDir={x:0,y:0};return;}
 var px=edgePanEvent?edgePanEvent.clientX:0,py=edgePanEvent?edgePanEvent.clientY:0;
 // Feed the live pointer through the same mousemove path: the camera shift moves
 // the board under the stationary cursor, so the item keeps following it. The
 // looping guard stops the nested edgePanStep call from spawning extra loops.
 var fake={clientX:px,clientY:py,shiftKey:edgePanEvent&&edgePanEvent.shiftKey,altKey:edgePanEvent&&edgePanEvent.altKey,ctrlKey:edgePanEvent&&edgePanEvent.ctrlKey,metaKey:edgePanEvent&&edgePanEvent.metaKey,target:edgePanEvent?edgePanEvent.target:null,preventDefault:function(){}};
 var speed=edgePanSpeed();
 board.camera.x+=edgePanDir.x*speed;board.camera.y+=edgePanDir.y*speed;scheduleCameraRender();
 edgePanLooping=true;dragMoveHandler(fake);edgePanLooping=false;
 if((edgePanDir.x||edgePanDir.y)&&!edgePanFrame)edgePanFrame=requestAnimationFrame(edgePanTick);
}
function edgePanStep(e){
 if(edgePanLooping)return;
 var dir=action&&action.type!=='draw'?edgePanDelta(e):{x:0,y:0};
 edgePanDir=dir;edgePanEvent=e;
 if((dir.x||dir.y)&&!edgePanFrame)edgePanFrame=requestAnimationFrame(edgePanTick);
}
function stopEdgePan(){if(edgePanFrame){cancelAnimationFrame(edgePanFrame);edgePanFrame=0;}edgePanDir={x:0,y:0};edgePanEvent=null;}
function handleArrangeShortcut(e){
 if((e.key||'').toLowerCase()!=='a'||e.ctrlKey||e.metaKey||e.altKey||e.shiftKey)return false;
 if(BoardUI.isEditing(e.target)||(e.target.closest&&e.target.closest('button,summary,a,[role="button"],.tool-panel,.command-menu,.context-menu')))return false;
 if(action||pan||pendingImports||(cropUI&&cropUI.isActive())||(colorPicker&&colorPicker.isOpen())||(filesUI&&filesUI.isBusy())||(aeUI&&aeUI.isBusy()))return false;
 e.preventDefault();runArrangePanel();return true;
}
function runArrangePanel(){
 if(!requireBoard())return;
 showToolbar();
 document.getElementById('arrangePanel').hidden=false;
}
function handleToolShortcut(e){
 var key=(e.key||'').toLowerCase(),tool={v:'select',p:'draw',u:'shape',t:'text'}[key];
 if(!tool||e.ctrlKey||e.metaKey||e.altKey||e.shiftKey)return false;
 if(BoardUI.isEditing(e.target)||(e.target.closest&&e.target.closest('button,summary,a,[role="button"],.tool-panel,.command-menu,.context-menu')))return false;
 if(action||pan||pendingImports||(cropUI&&cropUI.isActive())||(colorPicker&&colorPicker.isOpen())||(filesUI&&filesUI.isBusy())||(aeUI&&aeUI.isBusy()))return false;
 e.preventDefault();activateCanvasTool(tool);return true;
}
window.addEventListener('keydown',function(e){
 if(BoardUI.isEditing(e.target)){if(e.key==='Escape')e.target.blur();return;}
 if(handlePropertiesShortcut(e))return;
 if(handleCropShortcut(e))return;
 if(handleSendShortcut(e))return;
 if(handleToolShortcut(e))return;
 if(handleArrangeShortcut(e))return;
 if(e.key.toLowerCase()==='f'&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!(e.target.closest&&e.target.closest('button,summary,a,.tool-panel,.command-menu,.context-menu'))){e.preventDefault();if(e.shiftKey)fit();else focusItems();return;}
 var commandKey=platform.command(e);
 if(e.code==='Space'&&!(e.target.closest&&e.target.closest('button,summary,a,[role="button"]'))){space=true;e.preventDefault();}
 if((e.key==='Delete'||e.key==='Backspace')&&board.selection.length){e.preventDefault();board.removeSelected();render();}
 if(commandKey&&e.key.toLowerCase()==='z'){e.preventDefault();if(e.shiftKey)redo();else undo();}
 if(commandKey&&e.key.toLowerCase()==='y'){e.preventDefault();redo();}
 if(commandKey&&e.key.toLowerCase()==='a'){e.preventDefault();board.setSelection(board.items.filter(function(x){return !x.hidden&&(!board.editingGroup||x.groupId===board.editingGroup);}).map(function(x){return x.id;}));render();}
 if(commandKey&&e.key.toLowerCase()==='s'){e.preventDefault();if(e.shiftKey)requestSaveAs();else saveBoard();}
 // Ctrl+C/V use native clipboard events, not a stale internal buffer.
 if(commandKey&&e.key.toLowerCase()==='d'){e.preventDefault();board.duplicateSelected(16,16);render();}
 if(e.key==='Escape'){hideMenu();if(board.editingGroup){board.exitGroup();render();}}
});window.addEventListener('keyup',function(e){if(e.code==='Space')space=false;});
function resizeNoteHeight(item,dir,shift,ctrl){
 var vertical=NoteStyle.style(item).textOrientation==='vertical',proposed=item.height,proposedWidth=item.width,hx=dir.indexOf('w')>=0?-1:dir.indexOf('e')>=0?1:0,hy=dir.indexOf('n')>=0?-1:dir.indexOf('s')>=0?1:0;
 // A proportional gesture scales the font too. Do not break its aspect lock.
 if(shift)return;
 if(vertical){
  // Height changes reflow vertical columns; width is their growth axis.
  if(!hx){var contentWidth=measureNote(item),manualWidth=item.widthManual?(Number(item.manualWidth)||proposedWidth):0,width=Math.max(contentWidth,manualWidth),delta=width-proposedWidth,r=(Number(item.rotation)||0)*Math.PI/180;board.updateItem(item.id,{width:width,x:item.x-delta*(Math.cos(r)+1)/2,y:item.y-delta*Math.sin(r)/2});return;}
  // East/west handles explicitly own width, mirroring horizontal manual height.
  board.updateItem(item.id,{widthManual:true,manualWidth:proposedWidth});
  var width=Math.max(proposedWidth,measureNote(item));
  if(ctrl)width=Math.ceil(width/32)*32;
  var delta=width-proposedWidth,r=(Number(item.rotation)||0)*Math.PI/180;board.updateItem(item.id,{width:width,x:item.x+delta*(hx*Math.cos(r)-1)/2,y:item.y+hx*delta*Math.sin(r)/2});return;
 }
 // Width-only resize may shrink after reflow, but never below a height that the
 // user explicitly chose with a vertical handle.
 if(!hy){var contentHeight=measureNote(item),manualHeight=item.heightManual?(Number(item.manualHeight)||proposed):0;board.updateItem(item.id,{height:Math.max(contentHeight,manualHeight)});return;}
 // A manual resize takes ownership of the height: autosize becomes grow-only.
 board.updateItem(item.id,{heightManual:true,manualHeight:proposed});
 autoSizeNote(null,item);var height=hy?Math.max(proposed,item.height):item.height;
 // Text reflow is a minimum, not permission to break the requested size snap.
 if(ctrl)height=Math.ceil(height/32)*32;
 var delta=height-proposed,r=item.rotation*Math.PI/180;
 // Reflow adjusts height around the same opposite edge, including rotated notes.
 board.updateItem(item.id,{height:height,x:item.x-Math.sin(r)*hy*delta/2,y:item.y+Math.cos(r)*hy*delta/2-delta/2});
}

function noteEditorText(el){var out='';function read(node){if(node.nodeType===3){out+=node.nodeValue||'';return;}if(node.nodeType!==1)return;var tag=node.tagName;if(tag==='BR'){out+='\n';return;}if((tag==='DIV'||tag==='P')&&out&&out.slice(-1)!=='\n')out+='\n';for(var child=node.firstChild;child;child=child.nextSibling)read(child);}for(var child=el.firstChild;child;child=child.nextSibling)read(child);return out.replace(/\r\n?/g,'\n');}
function editText(item,point){var el=BoardUI.reference(world,item.id,'.note-content');if(!el)return;el.textContent=item.text;el.dataset.text=item.text;el.contentEditable='true';el.focus();var range=null;if(point&&document.caretRangeFromPoint)range=document.caretRangeFromPoint(point.x,point.y);if(!range||!el.contains(range.startContainer)){range=document.createRange();range.selectNodeContents(el);range.collapse(false);}var sel=window.getSelection();sel.removeAllRanges();sel.addRange(range);board.beginTransaction();var commit=function(){var text=noteEditorText(el);el.contentEditable='false';el.oninput=null;el.onkeydown=null;el.onpaste=null;var item2=board.getItem(item.id);if(item2){board.updateItem(item.id,{text:text});autoSizeNote(el,board.getItem(item.id));}delete el.dataset.text;board.commitTransaction();render();};el.onkeydown=function(e){if(e.key==='Enter'){e.preventDefault();document.execCommand('insertText',false,'\n');}};el.onpaste=function(e){e.preventDefault();var text=e.clipboardData&&e.clipboardData.getData('text/plain')||'';document.execCommand('insertText',false,text.replace(/\r\n?/g,'\n'));};el.oninput=function(){var live=board.getItem(item.id);board.updateItem(item.id,{text:noteEditorText(el)});autoSizeNote(el,live);if(boardUI)boardUI.renderSelection();};el.onblur=commit;}
world.addEventListener('dblclick',function(e){var el=e.target.closest('.reference');if(!el)return;var item=board.getItem(el.dataset.id);if(!item)return;if(item.groupId&&board.editingGroup!==item.groupId){board.enterGroup(item.groupId,item.id);render();return;}if(item.locked)return;if(item.type==='section'){editSectionName(item);return;}if(item.type==='note')editText(item,{x:e.clientX,y:e.clientY});else if(item.missing)openRelinkPicker(item);});
world.addEventListener('click',function(e){var button=e.target.closest('[data-link-action]');if(!button)return;var el=button.closest('.reference'),item=el&&board.getItem(el.dataset.id);if(!item||item.type!=='link')return;e.preventDefault();e.stopPropagation();if(button.dataset.linkAction==='play')playLink(el,item);else if(button.dataset.linkAction==='stop')stopLinkPlayback(item.id,0);else openExternal(item.url);});
/* Board-anchored on purpose: renderCamera transforms world points by
 * (point * zoom + camera), so the preview tracks the canvas exactly while
 * edge-panning scrolls the board under a stationary pointer. */
/* Drag rectangles are painted in board space through the camera, never in
 * screen space: during edge pan the camera moves under a stationary cursor,
 * and a screen-anchored box would freeze while the board slides beneath it. */
function paintDragRect(p){
 var r=rectFromPoints(action.start,p),z=board.camera.zoom;
 marquee.style.left=(r.minX*z+board.camera.x)+'px';marquee.style.top=(r.minY*z+board.camera.y)+'px';
 marquee.style.width=((r.maxX-r.minX)*z)+'px';marquee.style.height=((r.maxY-r.minY)*z)+'px';
}
var lastSectionStyle={};
try{var savedSectionStyle=JSON.parse(localStorage.getItem('messboard.section-style.v1')||'{}');if(savedSectionStyle&&typeof savedSectionStyle==='object')lastSectionStyle=savedSectionStyle;}catch(ignoreStyle){}
function rememberSectionStyle(patch){
 var keys=Object.keys(patch);
 for(var i=0;i<keys.length;i++){if(patch[keys[i]]===undefined)delete lastSectionStyle[keys[i]];else lastSectionStyle[keys[i]]=patch[keys[i]];}
 try{localStorage.setItem('messboard.section-style.v1',JSON.stringify(lastSectionStyle));}catch(ignoreStyle2){}
}
function sectionRgba(hex,alpha){var s=String(hex||'');if(!/^#[0-9a-f]{6}$/i.test(s))return null;var n=parseInt(s.slice(1),16);return 'rgba('+((n>>16)&255)+','+((n>>8)&255)+','+(n&255)+','+alpha+')';}
/* Style sizes are relative to the section's own footprint: the factor is 1
 * at the default 960x540 creation size and clamps to [.5, 6], mirroring how
 * link titlebars scale from their item height. BoardUI.sectionLabelH uses
 * the same formula for selection framing. */
function sectionScale(item){return Math.max(.5,Math.min(6,Math.max((item.width||960)/960,(item.height||540)/540)));}
function styleSectionElement(el,item){
 var frame=el.querySelector('.section-frame'),label=el.querySelector('.section-label');if(!frame||!label)return;
 var color=item.color||(board.settings&&board.settings.accentColor)||'#4096f3';
 var tint=item.tint===undefined?.1:item.tint;
 var selected=board.selection.indexOf(item.id)>=0;
 var ss=sectionScale(item);
 frame.style.borderColor=sectionRgba(color,selected?1:.55)||'';
 frame.style.background=tint>0?(sectionRgba(color,tint)||''):'transparent';
 frame.style.borderWidth=((item.strokeWidth||1.5)*ss)+'px';
 frame.style.borderStyle=item.strokeStyle==='dashed'?'dashed':'solid';
 frame.style.borderRadius=((item.cornerRadius||0)*ss)+'px';
 frame.className='section-frame pos-'+(item.labelPos||'tl')+(item.labelOutside?' out':'');
 frame.style.setProperty('--section-scale',String(ss));
 label.style.fontSize=((item.labelSize==='s'?16:item.labelSize==='l'?30:22)*ss)+'px';
 label.style.display=item.labelHidden?'none':'';
 if(document.activeElement!==label&&label.dataset.name!==item.name){label.dataset.name=item.name;label.textContent=item.name;}
}
function previewSectionStyle(item,patch){
 var el=BoardUI.reference(world,item.id);if(!el)return;
 styleSectionElement(el,Object.assign({},item,patch));
}
function uniqueSectionName(){var used=Object.create(null);board.items.forEach(function(i){if(i.type==='section')used[i.name]=true;});var n=1;while(used['Section '+n])n++;return 'Section '+n;}
function clearSectionMode(){if(!sectionMode)return;sectionMode=false;document.getElementById('sectionBtn').classList.remove('active');viewport.classList.remove('sectioning');}
function toggleSectionTool(){if(!requireBoard())return;var on=!sectionMode;clearSectionMode();textMode=false;viewport.classList.remove('texting');document.getElementById('noteBtn').classList.remove('active');toggleDraw(false);if(on){sectionMode=true;document.getElementById('sectionBtn').classList.add('active');viewport.classList.add('sectioning');viewport.focus();}}
function editSectionName(item){
 if(!item||item.type!=='section')return;
 var el=BoardUI.reference(world,item.id),label=el&&el.querySelector('.section-label');
 if(!label||label.isContentEditable)return;
 var original=item.name;
 label.contentEditable='true';label.focus();
 try{var range=document.createRange();range.selectNodeContents(label);var sel=window.getSelection();sel.removeAllRanges();sel.addRange(range);}catch(ignore){}
 function finish(commit){
  label.contentEditable='false';label.removeEventListener('blur',onBlur);label.removeEventListener('keydown',onKey);
  var value=label.textContent.replace(/\s+/g,' ').trim().slice(0,128);
  if(commit&&value&&value!==original){board.beginTransaction();board.updateItem(item.id,{name:value});board.commitTransaction();}
  render();
 }
 function onBlur(){finish(true);}
 function onKey(e){if(e.key==='Enter'){e.preventDefault();label.blur();}else if(e.key==='Escape'){e.preventDefault();label.textContent=original;finish(false);}e.stopPropagation();}
 label.addEventListener('blur',onBlur);label.addEventListener('keydown',onKey);
}
function placeText(p){var note=board.addNote(p.x,p.y,'');board.updateItem(note.id,{text:'',width:280,height:measureNote(Object.assign({},note,{width:280}),'')});textMode=false;viewport.classList.remove('texting');document.getElementById('noteBtn').classList.remove('active');render();editText(board.getItem(note.id));}
function addNote(){if(!requireBoard())return;clearSectionMode();textMode=!textMode;drawMode=false;toggleDraw(false);document.getElementById('noteBtn').classList.toggle('active',textMode);viewport.classList.toggle('texting',textMode);if(textMode)viewport.focus();}
function constrainedDrawPoints(a,shift,alt){var tool=a.tool,pts=a.points.slice(),last=pts[pts.length-1];if(tool!=='pen'&&tool!=='eraser'){var dx=last[0]-a.start.x,dy=last[1]-a.start.y;if(shift){if(tool==='line'){var angle=Math.atan2(dy,dx),snap=Math.round(angle/(Math.PI/4))*Math.PI/4,len=Math.sqrt(dx*dx+dy*dy);last=[a.start.x+Math.cos(snap)*len,a.start.y+Math.sin(snap)*len];}else{var size=Math.max(Math.abs(dx),Math.abs(dy));last=[a.start.x+(dx<0?-size:size),a.start.y+(dy<0?-size:size)];}}if(alt){var sp=altSnapPoint({x:last[0],y:last[1]},a.board);last=[sp.x,sp.y];}pts[pts.length-1]=last;}return pts;}
function previewMarkup(a,shift,alt){if(a.tool==='eraser')return '';var s=DrawingGeometry.stroke(a.tool,constrainedDrawPoints(a,shift,alt),a.style,a.tolerance);if(!s)return '';return '<g transform="translate('+board.camera.x+' '+board.camera.y+') scale('+board.camera.zoom+')">'+strokeMarkup(s)+'</g>';}
function scheduleDrawPreview(a,shift,alt){a.previewShift=shift;a.previewAlt=alt;if(drawFrame)return;drawFrame=requestAnimationFrame(function(){drawFrame=0;if(action!==a||a.board!==board)return;var svg=document.getElementById('drawPreview');svg.style.display='block';svg.innerHTML=previewMarkup(a,a.previewShift,a.previewAlt);});}
function clearDrawPreview(){cancelAnimationFrame(drawFrame);drawFrame=0;var svg=document.getElementById('drawPreview');svg.style.display='none';svg.innerHTML='';}
function cancelDrawGesture(){if(!action||action.type!=='draw')return false;action=null;clearDrawPreview();return true;}
function finishDrawing(a,shift,alt){
 if(a.board!==board)return;var pts=constrainedDrawPoints(a,shift,alt);if(pts.length<2)return;
 if(a.tool==='eraser'){
  var minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;pts.forEach(function(p){minX=Math.min(minX,p[0]);minY=Math.min(minY,p[1]);maxX=Math.max(maxX,p[0]);maxY=Math.max(maxY,p[1]);});
  var hit=board.items.filter(function(item){if(item.type!=='drawing'||item.hidden||item.locked||(item.groupId&&item.groupId!==board.editingGroup)||(board.editingGroup&&item.groupId!==board.editingGroup))return false;var b=Geometry.itemBounds(item);return b.minX<=maxX&&b.maxX>=minX&&b.minY<=maxY&&b.maxY>=minY;}).map(function(item){return item.id;});
  if(hit.length){board.beginTransaction();board.items=board.items.filter(function(item){return hit.indexOf(item.id)<0;});board.selection=board.selection.filter(function(id){return hit.indexOf(id)<0;});board.items.forEach(function(item,i){item.z=i+1;});board.commitTransaction();render();}return;
 }
 var item=DrawingGeometry.createItem(a.tool,pts,a.style,a.tolerance);if(!item)return;
 board.addDrawing(item.x,item.y,item.strokes,{width:item.width,height:item.height,sourceWidth:item.sourceWidth,sourceHeight:item.sourceHeight});render();
}
function toggleDraw(on){if(!drawingUI)return;if(on===false){drawingUI.close();return;}if(on===true||document.getElementById('drawPanel').hidden)drawingUI.open('draw');else drawingUI.close();}
function setWell(id,color){var el=document.getElementById(id);el.textContent=color;el.parentNode.querySelector('span').style.background=color;}
function syncSettings(){var s=board.settings;document.getElementById('autoHideToolbar').checked=s.autoHideToolbar;setWell('bgColor',s.background);setWell('accentColor',s.accentColor);setWell('panelColor',s.panelColor);setWell('textColor',s.textColor);document.getElementById('gridType').value=s.gridType;setWell('gridColor',s.gridColor);document.getElementById('gridSize').value=s.gridSize;document.getElementById('gridOpacity').value=s.gridOpacity;var opacity=document.getElementById('gridOpacityNumber');if(opacity)opacity.value=Math.round(s.gridOpacity*100);document.getElementById('thumbnailsEnabled').checked=s.thumbnailsEnabled;document.getElementById('thumbnailSize').value=String(s.thumbnailSize);document.getElementById('thumbnailSwapZoom').value=String(s.thumbnailSwapZoom);}
function updateSettings(event){var id=event.target.id,value=document.getElementById(id),settings={};settings[id]=(id==='autoHideToolbar'||id==='thumbnailsEnabled')?value.checked:id==='gridType'?value.value:Number(value.value);board.setSettings(settings);lastThumbMode=null;render();scheduleToolbarHide();}
function closeColor(){if(colorPicker)colorPicker.close(false,false);}
function openColor(target,button){
 if((cropUI&&cropUI.isActive())||!requireBoard())return;
 if(/^(draw|shape|editStroke)(Color|FillColor)$/.test(target)){if(drawingUI)drawingUI.openColor(target,button);return;}
 if(target==='noteBackground'||target==='noteTextColor'){if(noteUI)noteUI.openColor(target,button);return;}
 closeColor();
 if(target==='bgColor'||target==='gridColor'||target==='accentColor'||target==='panelColor'||target==='textColor')syncSettings();
 var owner=board,original=document.getElementById(target).textContent,drawingId=drawingEditId;
 colorPicker.open(original,button,function(color){
  if(board!==owner)return;
  setWell(target,color);colorPreview={board:owner,target:target,color:color,drawingId:drawingId};
  if(target==='editStrokeColor')previewDrawingColor();else applyBoardAppearance();
 },function(accepted,color){
  colorPreview=null;
  if(board!==owner)return;
  setWell(target,accepted?color:original);
  if(accepted&&(target==='bgColor'||target==='gridColor'||target==='accentColor'||target==='panelColor'||target==='textColor')){var patch={};patch[target==='bgColor'?'background':target]=color;board.setSettings(patch);}
  if(accepted&&target==='editStrokeColor'){var item=board.getItem(drawingId);if(item&&!item.locked){board.beginTransaction();item.strokes.forEach(function(stroke){stroke.color=color;});board.commitTransaction();}}
  render();
 });
}
function previewDrawingColor(){
 if(!colorPreview||colorPreview.board!==board||colorPreview.target!=='editStrokeColor')return;
 var item=board.getItem(colorPreview.drawingId),node=item&&BoardUI.reference(world,item.id,'.drawing-content');
 if(node){var draft=Object.assign({},item);draft.strokes=item.strokes.map(function(stroke){return Object.assign({},stroke,{color:colorPreview.color});});renderDrawing(node,draft);}
}
screenSampler=ScreenSampler.create({
  platform:platform.platform,
  spawn:childProcess&&childProcess.spawn&&childProcess.spawn.bind(childProcess),
  execFile:childProcess&&childProcess.execFile.bind(childProcess),
  env:typeof process!=='undefined'?process.env:null,
  fs:fs,path:path,
  extensionPath:cs.getSystemPath(CSInterface.SystemPath.EXTENSION),
  EyeDropper:typeof EyeDropper!=='undefined'?EyeDropper:null
});
function pickScreenColor(done){
 toast('Click a color on screen…');
 return screenSampler.pick(done);
}
colorPicker=ColorPicker.create({pick:pickScreenColor,toast:toast});
document.querySelectorAll('.color-well').forEach(function(button){button.onclick=function(e){e.preventDefault();openColor(button.dataset.colorTarget,button);};});
function saveBoard(){
 if(!fs||!requireBoard())return false;
 if(persistence&&persistence.pending){refreshPersistence();toast('Choose Recover or Keep current before saving.');return false;}
 try{
  ensureLayout();FilesUI.atomicWrite(fs,path,boardPath,assets.serialize(board,boardPath),sourceImagePaths(board));
  if(persistence){persistence.saved=boardFingerprint(board);persistence.savedRevision=board.revision;persistence.saveError='';persistence.lastSaved=new Date();}
  var recovered=flushRecovery();setBoardName();refreshPersistence();toast(recovered?'Board saved · '+basename(boardPath):'Board file saved · recovery backup failed. Retry recovery before closing.');return true;
 }catch(e){if(persistence)persistence.saveError=e.message;refreshPersistence();toast('Save failed · '+e.message);return false;}
}
function saveBoardAs(file){
 if(!fs||!requireBoard()||fileOperationBusy())return false;
 if(action||pan||board.transaction){toast('Finish the current edit before Save As.');return false;}
 try{
  var target=BoardStorage.newBoardPath(file),result,nextBoard;
  if(path.resolve(target)===path.resolve(boardPath))return saveBoard();
  var targetLayout=BoardStorage.layoutFor(target),legacyTarget=target.replace(/\.messboard$/i,'.aeref.json');
  var targetOccupied=fs.existsSync(targetLayout.boardPath)||fs.existsSync(targetLayout.root)||(legacyTarget!==target&&fs.existsSync(legacyTarget));
  if(targetOccupied&&!confirm('Replace existing board "'+basename(target)+'"? Its saved content and owned assets will be replaced by this board.'))return false;
  if(!prepareBoardSwitch())return false;
  var snapshot=BoardModel.fromJSON(board.toJSON());
  result=assets.saveAs(snapshot,boardPath,target,targetOccupied?{overwrite:true}:undefined);nextBoard=BoardModel.fromJSON(result.data);
  // History contains paths in the original tree: a copy starts fresh.
  nextBoard.setSelection(board.selection.slice());
  var nextLayout=BoardStorage.layoutFor(result.boardPath),nextPersistence=persistenceFor(nextBoard,result.boardPath,nextLayout);nextPersistence.lastSaved=new Date();activateBoard(nextBoard,result.boardPath,nextLayout,nextPersistence);
 }catch(e){toast('Save As failed · '+e.message);return false;}
 // The copy and identity are committed. Chrome focus/panel errors are not save failures.
 try{if(shellUI){shellUI.closePanels();shellUI.closeMenus(false);}viewport.focus();}
 catch(uiError){toast('Board saved as · '+basename(boardPath)+' · UI refresh failed: '+uiError.message);return true;}
 toast('Board saved as · '+basename(boardPath));return true;
}
function requestSaveAs(){
 if(!fs||!requireBoard()||fileOperationBusy())return;
 if(action||pan||board.transaction){toast('Finish the current edit before Save As.');return;}
 var owner=board,source=boardPath;
 var result=dialogs.save({kind:'save-as',title:'Save Board As',defaultDirectory:path.dirname(boardPath),name:BoardStorage.displayName(boardPath)+' Copy',extension:'messboard',replaces:FileDialogs.BOARD_EXTENSIONS,prompt:'Board name'});
 if(board!==owner||boardPath!==source)return;
 if(result.status==='chosen')saveBoardAs(result.path);
 else if(result.status!=='canceled')reportDialog('Save As',result);
}
document.getElementById('saveAsBtn').onclick=requestSaveAs;
document.getElementById('accentReset').onclick=function(){closeColor();board.setSettings({accentColor:'#4096f3'});if(typeof syncSettings==='function')syncSettings();render();};
document.getElementById('panelThemeReset').onclick=function(){closeColor();board.setSettings({panelColor:'#252525',textColor:'#e6e6e6'});if(typeof syncSettings==='function')syncSettings();render();};
document.getElementById('bgReset').onclick=function(){closeColor();board.setSettings({background:'#1d1d1d'});if(typeof syncSettings==='function')syncSettings();render();};
document.getElementById('gridReset').onclick=function(){closeColor();board.setSettings({gridType:'dots',gridSize:32,gridColor:'#ffffff',gridOpacity:.2});if(typeof syncSettings==='function')syncSettings();render();};
function importBoardFile(file,request){
 if(!file||!request||request.board!==board||!fs||!assets||!requireBoard()||fileOperationBusy())return false;
 if(action||pan||board.transaction){toast('Finish the current edit before importing a board.');return false;}
 try{
  var ids=BoardImport.create({fs:fs,assets:assets,BoardModel:BoardModel,Geometry:Geometry}).importFile(board,file,request.point);
  if(!ids.length){toast('This board has no items to import.');return false;}
  if(shellUI){shellUI.closeMenus(false);shellUI.closePanels();}render();viewport.focus();
  toast('Imported '+ids.length+' item'+(ids.length===1?'':'s')+' · linked images stay in their original location.');return true;
 }catch(e){toast('Import failed · '+e.message);return false;}
}
function requestBoardImport(){
 if(!fs||!assets||!requireBoard()||fileOperationBusy())return;
 if(action||pan||board.transaction){toast('Finish the current edit before importing a board.');return;}
 var rect=viewport.getBoundingClientRect(),request={board:board,point:boardPoint(rect.left+rect.width/2,rect.top+rect.height/2)};
 var result=dialogs.open({kind:'import-board',title:'Import board into current canvas',extensions:FileDialogs.BOARD_EXTENSIONS});
 if(result.status==='chosen')importBoardFile(result.path,request);
 else if(result.status!=='canceled')reportDialog('Import board',result);
}
function fileOperationBusy(){if(pendingImports||(filesUI&&filesUI.isBusy())||(aeUI&&aeUI.isBusy())){toast('Wait for the current operation to finish.');return true;}if(cropUI&&cropUI.isActive()){toast('Finish or cancel the crop first.');return true;}closeColor();return false;}
function createBoard(file){if(fileOperationBusy())return;try{
 var nextLayout=BoardStorage.layoutFor(BoardStorage.newBoardPath(file)),nextBoard=new BoardModel({settings:preferences.newBoardSettings()}),exists=fs.existsSync(nextLayout.boardPath);
 // A new manifest must not reuse another board's assets/recovery namespace.
 if(!exists&&(fs.existsSync(nextLayout.root)||fs.existsSync(nextLayout.boardPath.replace(/\.messboard$/i,'.aeref.json'))))throw new Error('This name already has board data. Choose another name or open the existing board.');
 if(exists&&!confirm('Replace existing board "'+basename(nextLayout.boardPath)+'"?'))return;
 if(!prepareBoardSwitch())return;
 var protectedImages=sourceImagePaths(board),nextPersistence=persistenceFor(nextBoard,nextLayout.boardPath,nextLayout);nextPersistence.lastSaved=new Date();
 // Publish only after activation succeeds; a failed render must not replace a primary.
 activateBoard(nextBoard,nextLayout.boardPath,nextLayout,nextPersistence,function(){publishNewBoard(nextLayout,nextBoard,protectedImages);});toast('Board created · '+basename(boardPath));
 }catch(e){toast('Create failed · '+e.message);}}
var RECENT_KEY='messboard.recent-boards.v1',MAX_RECENT=3;
function getRecentBoards(){try{var list=JSON.parse(localStorage.getItem(RECENT_KEY)||'[]');return Array.isArray(list)?list.filter(function(p){return typeof p==='string';}):[];}catch(e){return [];}}
function addRecentBoard(file){
 if(!file||typeof file!=='string')return;
 var list=getRecentBoards().filter(function(p){return p!==file;});
 list.unshift(file);
 list=list.slice(0,MAX_RECENT);
 try{localStorage.setItem(RECENT_KEY,JSON.stringify(list));}catch(e){}
 renderRecentBoards();
}
function renderRecentBoards(){
 var list=getRecentBoards(),wrap=document.getElementById('startupRecent'),container=document.getElementById('startupRecentList');
 if(!wrap||!container)return;
 container.innerHTML='';
 if(!list.length){wrap.hidden=true;return;}
 wrap.hidden=false;
 list.forEach(function(file){
  var btn=document.createElement('button');
  btn.className='startup-recent-item';
  btn.textContent=file.split(/[\\/]/).pop()||file;
  btn.title=file;
  btn.onclick=function(){openBoardFile(file);};
  container.appendChild(btn);
 });
}
function openBoardFile(file){if(fileOperationBusy())return;try{var text=fs?fs.readFileSync(file,'utf8'):null;if(!text)throw new Error('Cannot read board');var nextBoard=BoardModel.fromJSON(assets.deserialize(text,file)),nextLayout=BoardStorage.layoutFor(file);nextLayout.boardPath=file;for(var i=0;i<nextBoard.items.length;i++)if(nextBoard.items[i].type==='image')nextBoard.items[i].missing=fs?!fs.existsSync(nextBoard.items[i].path):false;if(!prepareBoardSwitch())return;var nextPersistence=persistenceFor(nextBoard,file,nextLayout);activateBoard(nextBoard,file,nextLayout,nextPersistence);addRecentBoard(file);toast(persistence.pending?'Board opened · recovery backup preserved':'Board opened');}catch(e){toast('Open failed · '+e.message);}}
function frameItems(items){if(action||pan||(cropUI&&cropUI.isActive()))return false;var visible=items.filter(function(i){return !i.hidden;});if(!visible.length)return false;if(shellUI){shellUI.closePanels();shellUI.closeMenus(false);}hideMenu();var top=board.settings.autoHideToolbar?Math.min(96,viewport.clientHeight/3):0,camera=Geometry.fitCamera(visible,{x:0,y:top,width:viewport.clientWidth,height:viewport.clientHeight-top},32);board.setCamera(camera);viewport.focus();render();scheduleToolbarHide();return true;}
function focusItems(items){return frameItems(items||board.selectedItems());}
function fit(){if(action||pan||(cropUI&&cropUI.isActive()))return;if(!board.items.some(function(i){return !i.hidden;})){board.setCamera({x:0,y:0,zoom:1});render();return;}frameItems(board.items);}
function autosavePath(){return layout?layout.autosave:null;}
function restoreAutosave(){if(fileOperationBusy()||!requireBoard())return;if(pendingBoardEdit()){toast('Finish the current edit before recovering.');return;}var file=autosavePath();if(!file||!fs.existsSync(file)){toast('No autosave is available for this board.');return;}try{var text=fs.readFileSync(file,'utf8'),nextBoard=BoardModel.fromJSON(assets.deserialize(text,boardPath));for(var i=0;i<nextBoard.items.length;i++)if(nextBoard.items[i].type==='image')nextBoard.items[i].missing=!fs.existsSync(nextBoard.items[i].path);if(persistence&&boardFingerprint(board)!==persistence.saved)archiveRecovery(assets.serialize(board,boardPath));var state=Object.assign({},persistence,{board:nextBoard,recovery:boardFingerprint(nextBoard),pending:false,error:'',savedRevision:0});activateBoard(nextBoard,boardPath,layout,state);toast('Recovery loaded · use Save to update the board file.');}catch(e){if(persistence)persistence.error=e.message;refreshPersistence();toast('Recovery failed · '+e.message);}}
function aeCall(method,arg,callback){cs.evalScript('MessBoardHost.'+method+'('+PathCodec.jsxString(arg)+')',function(raw){var r;try{r=JSON.parse(raw);}catch(e){r={ok:false,error:raw||'Invalid AE response'};}if(!r.ok)toast(r.error||'After Effects operation failed');else callback(r.data);});}
function capture(){if(aeUI)aeUI.capture('comp');}
function sendToAE(replace){if(aeUI)aeUI.send(!!replace);}
function pasteDir(){if(!requireBoard())return null;ensureLayout();return layout.pasted;}
function addBlob(blob,point){
 if(!fs||!requireBoard())return;var reader=new FileReader(),settled=false;pendingImports++;
 function finish(){if(settled)return false;settled=true;pendingImports--;return true;}
 reader.onload=function(){if(settled)return;try{var bytes=new Uint8Array(reader.result),buffer=Buffer.from(bytes),file=path.join(pasteDir(),'paste-'+Date.now()+'.png');fs.writeFileSync(file,buffer);naturalSize(file,function(size){var item=board.addImage(file,point.x,point.y,size);queueThumbnails([item]);render();reframeIfNeeded(item);toast('Clipboard image pasted');});}catch(err){toast('Paste failed · '+err.message);}finally{finish();}};
 reader.onerror=reader.onabort=function(){if(finish())toast('Clipboard image could not be read.');};
 try{reader.readAsArrayBuffer(blob);}catch(err){finish();toast('Paste failed · '+err.message);}
}
function addClipboardText(text,point){text=String(text||'').replace(/\r\n?/g,'\n');if(!text||!requireBoard())return false;var note=board.addNote(point.x,point.y,text);autoSizeNote(null,note);board.setSelection([note.id]);render();toast('Clipboard text pasted as note');return true;}
function addClipboardLink(text,point){var data=parseMediaUrl(text);if(!data||!requireBoard())return false;
 if(data.mediaType==='link')return false;
 // Size the card from the real thumbnail geometry so the paste matches the media:
 // YouTube maxresdefault is 1280x720 (16:9), capped to 960 wide for the board.
 var w=data.provider==='youtube'||data.mediaType==='video'||data.mediaType==='image'?960:720,h=Math.round(w*9/16);
 var item=board.addLink(point.x,point.y,Object.assign({},data,{width:w,height:h})),owner=board;render();if(data.provider==='youtube')hydrateYouTubeTitle(owner,board.getItem(item.id));toast(data.provider==='youtube'?'YouTube link pasted':'Link pasted');return true;}
function pasteClipboardImage(point,event){
 point=point||menuPoint||lastCanvasPoint||boardPoint(viewport.clientWidth/2,viewport.clientHeight/2);
 function accept(input){
  if(typeof boardUI!=='undefined'&&boardUI&&boardUI.paste(input,point))return true;
  var data=input.clipboardData,items=data&&data.items;
  if(items){for(var i=0;i<items.length;i++){if(items[i].type&&items[i].type.indexOf('image/')===0){addBlob(items[i].getAsFile(),point);input.preventDefault();return true;}}}
  var text=data&&data.getData('text/plain');if(text&&(addClipboardLink(text,point)||addClipboardText(text,point))){input.preventDefault();return true;}
  return false;
 }
 if(event){accept(event);return;}
 if(!requireBoard())return;
 function nativePaste(){var pasted=false;try{viewport.focus();nativePastePoint=point;pasted=document.execCommand('paste');}catch(ignore){}finally{nativePastePoint=null;}if(!pasted)toast('Press Ctrl+V to paste clipboard content.');}
 var clipboard=navigator.clipboard;
 if(clipboard&&(clipboard.read||clipboard.readText)){
  var settled=false,timer;pendingImports++;
  function finish(){if(settled)return;settled=true;clearTimeout(timer);pendingImports--;}
  function failed(){if(settled)return;finish();nativePaste();}
  function deliver(values){if(settled)return;var image=values.image,input={clipboardData:{items:image?[{type:image.type,getAsFile:function(){return image.blob;}}]:[],getData:function(type){return values[type]||'';}},preventDefault:function(){}};if(!accept(input))toast('Clipboard has no supported image, text or board items.');}
  timer=setTimeout(function(){if(!settled)toast('Clipboard read timed out · press Ctrl+V to paste.');finish();},30000);
  try{
   var read=clipboard.read?Promise.resolve().then(function(){return clipboard.read();}).then(function(entries){
    if(settled)return;var values={},seen={},reads=[];
    entries.forEach(function(entry){entry.types.forEach(function(type){var image=type.indexOf('image/')===0,key=image?'image':type;if(seen[key]||(!image&&type!=='text/plain'&&type!=='application/x-messboard-items'))return;seen[key]=true;reads.push(Promise.resolve().then(function(){return entry.getType(type);}).then(function(blob){if(image){values.image={type:type,blob:blob};return;}return blob.text().then(function(text){values[type]=text;});}).catch(function(){}));});});
    return Promise.all(reads).then(function(){if(reads.length&&!Object.keys(values).length)throw new Error('No readable clipboard formats');deliver(values);});
   }).catch(function(err){if(settled)return;if(!clipboard.readText)throw err;return clipboard.readText().then(function(text){deliver({'text/plain':text});});}):Promise.resolve().then(function(){return clipboard.readText();}).then(function(text){deliver({'text/plain':text});});
   read.then(finish,failed);
  }catch(err){failed();}
 }else nativePaste();
}
function copyImageWithNativeHelper(file){ClipboardProcess.copyImage({execFile:childProcess&&childProcess.execFile.bind(childProcess),env:typeof process!=='undefined'?process.env:null,platform:platform.platform},file,function(err){toast(err?err.message:'Selected image copied');});}
function copySelected(){var item=board.selection.length===1&&board.getItem(board.selection[0]);if(!item||item.type!=='image'||item.missing){toast('Select one available image first.');return;}if(navigator.clipboard&&navigator.clipboard.write&&typeof ClipboardItem!=='undefined'){fetch(PathCodec.toFileUrl(item.path)).then(function(r){return r.blob();}).then(function(blob){var payload={};payload[blob.type||'image/png']=blob;return navigator.clipboard.write([new ClipboardItem(payload)]);}).then(function(){toast('Selected image copied');}).catch(function(){copyImageWithNativeHelper(item.path);});}else copyImageWithNativeHelper(item.path);}
function revealSelectedSource(){
 var item=board.selection.length===1&&board.getItem(board.selection[0]),file=SourceLocation.pathFor(item);
 if(!file){toast('Select one local image, GIF or video first.');return false;}
 if(!childProcess||!fs){toast('Reveal source is unavailable.');return false;}
 SourceLocation.reveal({platform:platform.platform,fs:fs,path:path,extensionPath:cs.getSystemPath(CSInterface.SystemPath.EXTENSION),env:process.env,execFileSync:childProcess.execFileSync,execFile:childProcess.execFile.bind(childProcess)},file,function(error){if(error)toast(error.message);});return true;
}
function toggleGrid(){gridVisible=!gridVisible;viewport.classList.toggle('no-grid',!gridVisible);refreshEditorCommands();}
function layoutGapValue(){var el=document.getElementById('layoutGapNumber');var v=parseInt(el&&el.value,10);return isNaN(v)?20:Math.max(0,Math.min(200,v));}function runArrange(kind,value){var changed=false,gap=layoutGapValue();if(kind==='align')changed=board.alignSelected(value);else if(kind==='distribute')changed=board.distributeSelected(value);else if(kind==='match')changed=board.matchSelected(value);else if(kind==='grid')changed=board.autoArrangeSelected({gap:gap});else if(kind==='pack')changed=board.packSelected(gap);else if(kind==='stack')changed=board.stackSelected(value,gap);if(changed){render();toast('Selection arranged');}else toast('Select more items first.');}
function hideMenu(){if(shellUI)shellUI.closeContext();else contextMenu.hidden=true;}
function editorContext(canvas){var item=board.selection.length===1&&board.getItem(board.selection[0]);return{canvas:canvas,clipboard:boardUI&&boardUI.hasClipboard(),gridVisible:gridVisible,hasBoard:!!boardPath,busy:!!(cropUI&&cropUI.isActive()),playing:!!item&&!!BoardUI.reference(world,item.id,'.link-player'),sourceLabel:SourceLocation.label(platform.platform)};}
function refreshEditorCommands(canvas){var context=editorContext(canvas),container=canvas===undefined?document:contextMenu;container.querySelectorAll('[data-command]').forEach(function(button){var state=EditorCommands.state(button.dataset.command,board,context);button.disabled=!state.enabled;button.hidden=canvas===undefined?(button.dataset.command==='reveal-source'?!state.visible:false):!state.visible;if(button.dataset.command==='lock'||button.dataset.command==='grid'||button.dataset.command==='reveal-source')button.textContent=state.label;});}
function refreshEditorControls(){
 var a=EditorCommands.arrangement(board),b=document.getElementById('arrangeStatus');
 ['alignLeft','alignCenter','alignRight','alignTop','alignMiddle','alignBottom','matchWidth','matchHeight','matchBoth','autoGrid','packItems','normalizeLargest','normalizeSmallest'].forEach(function(id){document.getElementById(id).disabled=!a.align;});
 ['distributeH','distributeV'].forEach(function(id){document.getElementById(id).disabled=!a.distribute;});
 b.textContent=a.units<2?'Select at least two movable objects or groups.':a.units+' movable objects / groups. Size matching uses the first selected item.';
 if(!document.getElementById('propertiesPanel').hidden)refreshProperties();
 if(!document.getElementById('settingsPanel').hidden&&!colorPreview)syncSettings();
 if(typeof syncOpacityControls==='function')syncOpacityControls();
 if(!shellUI||!shellUI.isOpen())refreshEditorCommands();
}
function openEditorPanel(id){if(cropUI&&cropUI.isActive())return false;stopErasing();textMode=false;viewport.classList.remove('texting');document.getElementById('noteBtn').classList.remove('active');if(shellUI){shellUI.closeMenus(false);shellUI.closePanels(id);}document.getElementById(id).hidden=false;showToolbar();return true;}
function stopErasing(){if(drawingUI&&drawingUI.isErasing())drawingUI.close();}
function refreshProperties(){var items=board.selectedItems(),one=items.length===1?items[0]:null,canEdit=one&&!one.hidden&&!one.locked&&board.transformableItems().indexOf(one)>=0&&(!one.groupId||one.groupId===board.editingGroup);document.getElementById('appearanceProperties').hidden=!items.length;document.getElementById('imageProperties').hidden=!one||one.type!=='image';document.getElementById('linkProperties').hidden=!one||one.type!=='link'||one.provider==='local';
 var secBlock=document.getElementById('sectionProperties');secBlock.hidden=!(one&&one.type==='section');if(one&&one.type==='section')syncSectionProperties(one);
 var flipH=document.getElementById('flipH'),flipV=document.getElementById('flipV');
 if(one&&one.type==='image'){flipH.disabled=!canEdit||one.missing;flipV.disabled=!canEdit||one.missing;flipH.checked=one.flipH===true;flipV.checked=one.flipV===true;}
 var linkUrl=document.getElementById('linkUrl'),applyLinkUrl=document.getElementById('applyLinkUrl');if(one&&one.type==='link'){if(document.activeElement!==linkUrl)linkUrl.value=one.url;linkUrl.disabled=!canEdit;applyLinkUrl.disabled=!canEdit;}
 var reveal=document.getElementById('revealSource'),sourcePanel=document.getElementById('sourceProperties'),sourceName=document.getElementById('sourceName'),sourcePath=SourceLocation.pathFor(one),revealState=EditorCommands.state('reveal-source',board,editorContext());sourcePanel.hidden=!revealState.visible;sourceName.textContent=sourcePath?basename(sourcePath):'';sourceName.title=sourcePath||'';reveal.hidden=!revealState.visible;reveal.disabled=!revealState.enabled;reveal.textContent=revealState.label;
 document.getElementById('propertiesSummary').textContent=!items.length?'Select an image, text, drawing or shape to edit its properties.':!one?'Mixed selection · opacity applies to every selected object.':!canEdit?'This item is locked, hidden or inside a group. Unlock it or enter its group to edit.':one.type==='image'?(one.missing?'Source missing · relink this image.':Math.round(one.width)+' × '+Math.round(one.height)+' board units · source image stays unchanged.'):one.type==='link'?(one.provider==='local'?'Local video · source file stays unchanged.':one.url):one.type==='section'?'Section · drag its label to move it together with everything inside. Double-click the label to rename.':'Use the matching text or drawing inspector to edit this object.';syncOpacityControls();}
function selectedSection(){var one=board.selection.length===1?board.getItem(board.selection[0]):null;return one&&one.type==='section'?one:null;}
function markSeg(id,key,value){document.querySelectorAll('#'+id+' button').forEach(function(b){b.classList.toggle('active',b.dataset[key]===value);});}
function syncSectionColor(item){
 var effective=item.color||board.settings.accentColor||'#4096f3';
 var well=document.getElementById('sectionColorWell'),hexEl=document.getElementById('sectionColorHex');
 hexEl.textContent=item.color?item.color:'Theme';
 well.querySelector('span').style.background=effective;
 well.title=item.color?('Custom color '+item.color+' · click to change'):'Theme accent '+effective+' · click to pick a custom color';
 document.getElementById('sectionColorTheme').disabled=!item.color;
}
function openSectionColor(button){
 var sec=selectedSection();if(!sec||!colorPicker)return;
 var original=sec.color||board.settings.accentColor||'#4096f3',owner=board,startItem=sec;
 colorPicker.open(original,button,function(color){if(board===owner)previewSectionStyle(startItem,{color:color});},function(accepted,color){if(board!==owner)return;if(accepted)commitSectionStyle({color:color});else render();});
}
function syncSectionProperties(item){
 var canEdit=!item.hidden&&!item.locked&&board.transformableItems().indexOf(item)>=0;
 var nameInput=document.getElementById('sectionName');if(document.activeElement!==nameInput)nameInput.value=item.name||'';
 var tintPct=Math.round((item.tint===undefined?.1:item.tint)*100);
 var tintEl=document.getElementById('sectionTint'),tintNum=document.getElementById('sectionTintNumber');
 if(document.activeElement!==tintEl)tintEl.value=String(tintPct);if(document.activeElement!==tintNum)tintNum.value=String(tintPct);
 var radius=item.cornerRadius||0,radEl=document.getElementById('sectionRadius'),radNum=document.getElementById('sectionRadiusNumber');
 if(document.activeElement!==radEl)radEl.value=String(radius);if(document.activeElement!==radNum)radNum.value=String(radius);
 markSeg('sectionStrokeWidth','w',String(item.strokeWidth||1.5));
 markSeg('sectionStrokeStyle','s',item.strokeStyle||'solid');
 markSeg('sectionLabelSize','z',item.labelSize||'m');
 markSeg('sectionAnchorPad','p',item.labelPos||'tl');
 markSeg('sectionLabelPlace','o',item.labelOutside?'out':'in');
 document.getElementById('sectionLabelShow').checked=!item.labelHidden;
 document.getElementById('sectionFollow').checked=item.follow!==false;
 syncSectionColor(item);
 document.querySelectorAll('#sectionProperties input, #sectionProperties select, #sectionProperties button').forEach(function(c){c.disabled=!canEdit;});
}
function commitSectionStyle(patch){
 var sec=selectedSection();if(!sec)return false;
 var ok=board.setSectionStyle(sec.id,patch);
 if(ok){rememberSectionStyle(patch);render();var fresh=board.getItem(sec.id);if(fresh)syncSectionProperties(fresh);}
 return ok;
}
document.getElementById('sectionName').addEventListener('change',function(){
 var sec=selectedSection();if(!sec)return;
 var value=this.value.replace(/\s+/g,' ').trim().slice(0,128);
 if(value&&value!==sec.name){board.beginTransaction();board.updateItem(sec.id,{name:value});board.commitTransaction();render();}
 refreshProperties();
});
(function(){
 var tintEl=document.getElementById('sectionTint'),tintNum=document.getElementById('sectionTintNumber');
 tintEl.addEventListener('input',function(){var sec=selectedSection();if(sec)previewSectionStyle(sec,{tint:Number(tintEl.value)/100});tintNum.value=tintEl.value;});
 tintEl.addEventListener('change',function(){commitSectionStyle({tint:Number(tintEl.value)/100});});
 tintNum.addEventListener('change',function(){var v=Math.max(0,Math.min(60,Number(tintNum.value)||0));tintEl.value=String(v);commitSectionStyle({tint:v/100});});
 var radEl=document.getElementById('sectionRadius'),radNum=document.getElementById('sectionRadiusNumber');
 radEl.addEventListener('input',function(){var sec=selectedSection();if(sec)previewSectionStyle(sec,{cornerRadius:Number(radEl.value)});radNum.value=radEl.value;});
 radEl.addEventListener('change',function(){commitSectionStyle({cornerRadius:Number(radEl.value)});});
 radNum.addEventListener('change',function(){var v=Math.max(0,Math.min(48,Number(radNum.value)||0));radEl.value=String(v);commitSectionStyle({cornerRadius:v});});
 [['sectionStrokeWidth','w','strokeWidth',function(v){return Number(v);}],['sectionStrokeStyle','s','strokeStyle',function(v){return v;}],['sectionLabelSize','z','labelSize',function(v){return v;}]].forEach(function(cfg){
  document.getElementById(cfg[0]).addEventListener('click',function(e){var b=e.target.closest('button');if(!b||b.disabled)return;var patch={};patch[cfg[2]]=cfg[3](b.dataset[cfg[1]]);commitSectionStyle(patch);});
 });
 document.getElementById('sectionColorWell').onclick=function(){openSectionColor(this);};
 document.getElementById('sectionColorTheme').onclick=function(){commitSectionStyle({color:undefined});};
 document.getElementById('sectionAnchorPad').addEventListener('click',function(e){var b=e.target.closest('button');if(!b||b.disabled)return;commitSectionStyle({labelPos:b.dataset.p});});
 document.getElementById('sectionLabelPlace').addEventListener('click',function(e){var b=e.target.closest('button');if(!b||b.disabled)return;commitSectionStyle({labelOutside:b.dataset.o==='out'});});
 document.getElementById('sectionLabelShow').addEventListener('change',function(){commitSectionStyle({labelHidden:!this.checked});});
 document.getElementById('sectionFollow').addEventListener('change',function(){commitSectionStyle({follow:this.checked});});
 document.getElementById('sectionArrange').onclick=function(){var sec=selectedSection();if(!sec)return;var gapEl=document.getElementById('layoutGap'),gap=gapEl?Number(gapEl.value):24;if(board.arrangeSectionContents(sec,isFinite(gap)?gap:24)){render();toast('Section contents arranged.');}else toast('A section needs at least two items inside to arrange.');};
 document.getElementById('sectionFit').onclick=function(){var sec=selectedSection();if(sec)fitSectionToContents(sec);};
})();
function fitSectionToContents(sec){
 var contents=board.sectionContents(sec);
 if(!contents.length){toast('This section is empty.');return;}
 var bounds=null;
 contents.forEach(function(it){var b=Geometry.itemBounds(it);if(!bounds)bounds={minX:b.minX,minY:b.minY,maxX:b.maxX,maxY:b.maxY};else{bounds.minX=Math.min(bounds.minX,b.minX);bounds.minY=Math.min(bounds.minY,b.minY);bounds.maxX=Math.max(bounds.maxX,b.maxX);bounds.maxY=Math.max(bounds.maxY,b.maxY);}});
 var pad=32;
 board.beginTransaction();
 board.updateItem(sec.id,{x:bounds.minX-pad,y:bounds.minY-pad,width:(bounds.maxX-bounds.minX)+pad*2,height:(bounds.maxY-bounds.minY)+pad*2});
 board.commitTransaction();render();
}
function commitImageFlip(key,checked){var one=board.selection.length===1?board.getItem(board.selection[0]):null;if(!one||one.type!=='image')return;var flipH=key==='flipH'?checked:one.flipH===true,flipV=key==='flipV'?checked:one.flipV===true;board.setImageFlip(one.id,flipH,flipV);render();}
function commitLinkUrl(){
 var item=board.selection.length===1&&board.getItem(board.selection[0]),input=document.getElementById('linkUrl');if(!item||item.type!=='link'||input.disabled)return false;
 var value=String(input.value||'').trim();if(value===item.url)return false;var parsed=parseMediaUrl(value);if(!parsed){toast('Enter a valid HTTP or HTTPS URL.');input.focus();return false;}
 stopLinkPlayback(item.id);var patch={url:parsed.url,provider:parsed.provider,videoId:parsed.videoId||'',thumbnail:parsed.thumbnail||'',title:parsed.title,mediaType:parsed.mediaType};board.beginTransaction();board.updateItem(item.id,patch);board.commitTransaction();var owner=board;render();if(parsed.provider==='youtube')hydrateYouTubeTitle(owner,board.getItem(item.id));toast('Link updated');return true;
}
function opacitySelection(){return board.selectedItems().filter(function(item){return !item.hidden&&!item.locked&&board.transformableItems().indexOf(item)>=0&&(!item.groupId||item.groupId===board.editingGroup);});}
function syncOpacityControls(){
 var items=opacitySelection(),first=items.length?BoardModel.opacity(items[0]):1,mixed=items.some(function(item){return BoardModel.opacity(item)!==first;});
 document.querySelectorAll('[data-object-opacity]').forEach(function(slider){slider.disabled=!items.length;slider.value=String(Math.round(first*100));});
 document.querySelectorAll('[data-object-opacity-number]').forEach(function(input){input.disabled=!items.length;input.value=mixed?'':String(Math.round(first*100));input.placeholder=mixed?'Mixed':'';});
}
function previewOpacity(value){opacitySelection().forEach(function(item){var el=BoardUI.reference(world,item.id);if(el)el.style.opacity=String(value);});}
function commitOpacity(value){if(!isFinite(value)||value<0||value>1){render();syncOpacityControls();return false;}var changed=board.setSelectedOpacity(value);render();syncOpacityControls();return changed;}
document.querySelectorAll('[data-object-opacity]').forEach(function(slider){slider.addEventListener('input',function(){var value=Number(slider.value)/100;previewOpacity(value);var input=slider.parentNode.querySelector('[data-object-opacity-number]');if(input)input.value=slider.value;});slider.addEventListener('change',function(){commitOpacity(Number(slider.value)/100);});});
document.querySelectorAll('[data-object-opacity-number]').forEach(function(input){
 var scrub=null;
 function sameScrub(){return scrub&&board===scrub.board&&!board.transaction&&JSON.stringify(board.selection)===scrub.selection&&opacitySelection().map(function(item){return item.id;}).join('|')===scrub.ids;}
 input.addEventListener('input',function(){if(input.__numericScrubbing)return;var value=Number(input.value);if(input.value!==''&&isFinite(value)&&value>=0&&value<=100){previewOpacity(value/100);var slider=input.parentNode.querySelector('[data-object-opacity]');if(slider)slider.value=String(value);}});
 input.addEventListener('change',function(){if(!input.__numericScrubbing)commitOpacity(Number(input.value)/100);});
 input.addEventListener('keydown',function(e){if(input.__numericScrubbing)return;if(e.key==='Enter'){e.preventDefault();commitOpacity(Number(input.value)/100);}else if(e.key==='Escape'){e.preventDefault();render();syncOpacityControls();}});
 if(window.NumericScrub)window.NumericScrub.bind(input,{
  begin:function(){var items=opacitySelection();if(!items.length||board.transaction)return false;scrub={board:board,selection:JSON.stringify(board.selection),ids:items.map(function(item){return item.id;}).join('|')};return true;},
  valid:function(){return scrub?sameScrub():opacitySelection().length>0&&!board.transaction;},
  preview:function(value){if(!sameScrub())return;previewOpacity(value/100);var slider=input.parentNode.querySelector('[data-object-opacity]');if(slider)slider.value=String(value);},
  commit:function(value){if(!sameScrub()){scrub=null;render();syncOpacityControls();return;}scrub=null;commitOpacity(value/100);},
  cancel:function(){scrub=null;render();syncOpacityControls();}
 });
});
function showProperties(){if(!requireBoard())return;stopErasing();var item=board.selection.length===1&&board.getItem(board.selection[0]);if(item&&EditorCommands.state('note-settings',board).enabled){noteUI.open();return;}if(item&&EditorCommands.state('edit-drawing',board).enabled){drawingUI.edit(item);return;}if(openEditorPanel('propertiesPanel')){refreshProperties();refreshEditorCommands();}}
function showPalette(){
 var items=board.selectedItems().filter(function(i){return i.type==='image'&&!i.hidden;});
 if(!items.length)return;
 var item=items[0];
 var url=item.type==='image'&&!item.missing?PathCodec.toFileUrl(item.path):'';
 if(!url){toast('Image file not available.');return;}
 toast('Extracting colors…');
 ColorPalette.extractFromPath(url,8,function(colors){
  var panel=document.getElementById('palettePanel'),swatches=document.getElementById('paletteSwatches');
  swatches.innerHTML='';
  if(!colors.length){toast('Could not extract colors.');return;}
  currentPaletteColors=colors.slice();
  currentPaletteSource=items[0];
  colors.forEach(function(hex){
   var div=document.createElement('div');
   div.className='palette-swatch';
   div.style.background=hex;
   div.title=hex+' (click to copy)';
   var label=document.createElement('span');
   label.textContent=hex;
   div.appendChild(label);
   div.onclick=function(){
    if(navigator.clipboard&&navigator.clipboard.writeText){
     navigator.clipboard.writeText(hex).then(function(){toast('Copied '+hex);});
    }else{
     var ta=document.createElement('textarea');
     ta.value=hex;document.body.appendChild(ta);ta.select();
     try{document.execCommand('copy');toast('Copied '+hex);}catch(e){}
     document.body.removeChild(ta);
    }
   };
   swatches.appendChild(div);
  });
  panel.hidden=false;
 });
}
var currentPaletteColors=[],currentPaletteSource=null;
document.getElementById('closePalette').onclick=function(){document.getElementById('palettePanel').hidden=true;};
function paletteToPNG(colors,cb){
 var n=colors.length,cellW=120,cellH=100,cols=Math.min(4,n),rows=Math.ceil(n/cols);
 var canvas=document.createElement('canvas');
 canvas.width=cols*cellW; canvas.height=rows*cellH;
 var ctx=canvas.getContext('2d');
 colors.forEach(function(hex,idx){
  var col=idx%cols,row=Math.floor(idx/cols),x=col*cellW,y=row*cellH;
  ctx.fillStyle=hex; ctx.fillRect(x,y,cellW,cellH);
  ctx.fillStyle='rgba(0,0,0,0.55)'; ctx.fillRect(x,y+cellH-24,cellW,24);
  ctx.fillStyle='#fff'; ctx.font='13px monospace'; ctx.textAlign='center';
  ctx.fillText(hex,x+cellW/2,y+cellH-8);
 });
 canvas.toBlob(function(blob){cb(blob);},'image/png');
}
document.getElementById('placePaletteBtn').onclick=function(){
 if(!currentPaletteColors.length||!requireBoard())return;
 var dir=pasteDir(); if(!dir)return;
 paletteToPNG(currentPaletteColors,function(blob){
  if(!blob){toast('Failed to create palette image.');return;}
  var reader=new FileReader();
  reader.onload=function(){
   try{
    var file=path.join(dir,'palette-'+Date.now()+'.png');
    fs.writeFileSync(file,Buffer.from(new Uint8Array(reader.result)));
    var src=currentPaletteSource,px=boardPoint(viewport.clientWidth/2,viewport.getBoundingClientRect().top+viewport.clientHeight/2);
    if(src){px={x:src.x+src.width/2,y:src.y+src.height+40};}
    naturalSize(file,function(size){
     var item=board.addImage(file,px.x,px.y,size);
     queueThumbnails([item]);render();reframeIfNeeded(item);
     document.getElementById('palettePanel').hidden=true;
     toast('Palette placed on board');
    });
   }catch(err){toast('Failed · '+err.message);}
  };
  reader.readAsArrayBuffer(blob);
 });
};
function executeEditorCommand(name){
 var context=editorContext();return EditorCommands.run(name,board,context,function(){
  if(name!=='erase')stopErasing();
  if(name==='canvas-settings'){document.getElementById('settingsBtn').click();document.getElementById('settingsPanel').scrollTop=0;return;}
  if(name==='properties'){showProperties();return;}
  if(name==='reveal-source'){revealSelectedSource();return;}
  if(name==='ae-tools'){if(!(cropUI&&cropUI.isActive()))aeUI.open();return;}
  if(name==='text'||name==='draw'||name==='shape'||name==='erase'){document.getElementById(name==='text'?'noteBtn':name+'Btn').click();return;}
  if(name==='crop'){document.getElementById('cropBtn').click();return;}
  if(name==='import-board'){requestBoardImport();return;}
  if(name==='note-settings'){noteUI.open();return;}
  if(name==='arrange'){document.getElementById('arrangeBtn').click();return;}
  if(name==='select-all'){board.setSelection(board.items.filter(function(i){return !i.hidden&&(!board.editingGroup||i.groupId===board.editingGroup);}).map(function(i){return i.id;}));render();return;}
  if(name==='deselect'){board.setSelection([]);render();return;}
  if(boardUI.command(name,menuPoint))return;
  if(name==='add')openPicker(menuPoint);else if(name==='paste')pasteClipboardImage(menuPoint);else if(name==='duplicate'){board.duplicateSelected(16,16);render();}else if(name==='group'){board.groupSelected();render();}else if(name==='ungroup'){board.ungroupSelected();render();}else if(name==='lock'){board.toggleLockSelected();render();}else if(name==='front'||name==='forward'||name==='backward'||name==='back'){board.reorderSelected(name);render();}else if(name==='capture')capture();else if(name==='send')sendToAE();else if(name==='replace')sendToAE(true);else if(name==='extract-colors')showPalette();else if(name==='save')saveBoard();else if(name==='open')requestOpen();else if(name==='recover')restoreAutosave();else if(name==='fit')fit();else if(name==='grid')toggleGrid();else if(name==='delete'){board.removeSelected();render();}
 });
}
viewport.addEventListener('contextmenu',function(e){if(BoardUI.isEditing(e.target))return;e.preventDefault();if(cropUI&&cropUI.isActive())return;var ref=e.target.closest('.reference'),item=ref&&board.getItem(ref.dataset.id);if(item&&board.editingGroup&&item.groupId!==board.editingGroup)board.exitGroup();if(ref&&board.selection.indexOf(ref.dataset.id)<0)board.setSelection([ref.dataset.id]);render();menuPoint=boardPoint(e.clientX,e.clientY);shellUI.openContext(e,!ref);});
viewport.addEventListener('mousemove',function(e){if(pan)return;lastCanvasPoint=boardPoint(e.clientX,e.clientY);});document.addEventListener('paste',function(e){var target=e.target;if(target&&target.isContentEditable)return;if(BoardUI.isEditing(target))return;if(!requireBoard())return;var point=nativePastePoint||lastCanvasPoint||boardPoint(viewport.clientWidth/2,viewport.getBoundingClientRect().top+viewport.clientHeight/2);pasteClipboardImage(point,e);});
function requestNew(){
 if(fileOperationBusy())return;
 var owner=board,source=boardPath;
 if(boardPath&&board.items.length&&!confirm('Create a new board and close the current one?'))return;
 var result=dialogs.save({kind:'new-board',title:'Create MessBoard Board',defaultDirectory:boardPath?path.dirname(boardPath):'',name:'New Board',extension:'messboard',replaces:FileDialogs.BOARD_EXTENSIONS,confirm:'Create',prompt:'Board name'});
 if(board!==owner||boardPath!==source)return;
 if(result.status==='chosen')createBoard(result.path);
 else if(result.status!=='canceled')reportDialog('New board',result);
}
function requestOpen(){
 if(fileOperationBusy())return;
 var owner=board,source=boardPath;
 var result=dialogs.open({kind:'open-board',title:'Open board',defaultDirectory:boardPath?path.dirname(boardPath):'',extensions:FileDialogs.BOARD_EXTENSIONS});
 if(board!==owner||boardPath!==source)return;
 if(result.status==='chosen')openBoardFile(result.path);
 else if(result.status!=='canceled')reportDialog('Open board',result);
}
document.getElementById('arrangeBtn').onclick=function(){showToolbar();if(!requireBoard())return;document.getElementById('arrangePanel').hidden=false;};document.getElementById('closeArrange').onclick=function(){document.getElementById('arrangePanel').hidden=true;};[['alignLeft','align','left'],['alignCenter','align','center'],['alignRight','align','right'],['alignTop','align','top'],['alignMiddle','align','middle'],['alignBottom','align','bottom'],['distributeH','distribute','horizontal'],['distributeV','distribute','vertical'],['matchWidth','match','width'],['matchHeight','match','height'],['matchBoth','match','both'],['autoGrid','grid',''],['packItems','pack',''],['stackH','stack','horizontal'],['stackV','stack','vertical']].forEach(function(x){document.getElementById(x[0]).onclick=function(){runArrange(x[1],x[2]);};});var gapRange=document.getElementById('layoutGap'),gapNum=document.getElementById('layoutGapNumber');if(gapRange&&gapNum){gapRange.oninput=function(){gapNum.value=gapRange.value;};gapNum.oninput=function(){gapRange.value=gapNum.value;};}document.querySelector('.rail').addEventListener('mouseenter',showToolbar);document.querySelector('.rail').addEventListener('mouseleave',scheduleToolbarHide);document.getElementById('toolbarHotzone').addEventListener('mouseenter',showToolbar);viewport.addEventListener('mouseenter',scheduleToolbarHide);viewport.addEventListener('mousemove',scheduleToolbarHide);document.getElementById('autoHideToolbar').onchange=updateSettings;document.getElementById('settingsBtn').onclick=function(){showToolbar();if(!requireBoard())return;syncSettings();document.getElementById('settingsPanel').hidden=false;};document.getElementById('closeSettings').onclick=function(){document.getElementById('settingsPanel').hidden=true;};['gridType','gridSize','gridOpacity'].forEach(function(id){document.getElementById(id).onchange=updateSettings;});document.getElementById('thumbnailsEnabled').onchange=updateSettings;document.getElementById('thumbnailSize').onchange=updateSettings;document.getElementById('thumbnailSwapZoom').onchange=updateSettings;document.getElementById('noteBtn').onclick=addNote;document.getElementById('sectionBtn').onclick=toggleSectionTool;document.getElementById('drawBtn').onclick=function(){if(requireBoard())toggleDraw();};document.getElementById('closeDraw').onclick=function(){toggleDraw(false);};document.getElementById('undoBtn').onclick=undo;document.getElementById('redoBtn').onclick=redo;document.getElementById('addBtn').onclick=openPicker;document.getElementById('emptyAdd').onclick=openPicker;document.getElementById('saveBtn').onclick=saveBoard;document.getElementById('openBtn').onclick=requestOpen;
document.getElementById('openRecentBtn').onclick=function(){
 var list=getRecentBoards();
 if(!list.length){toast('No recent boards.');return;}
 // Show in startup gate for selection
 var gate=document.getElementById('startupGate');
 if(gate){gate.classList.remove('hidden');renderRecentBoards();}
};document.getElementById('newBtn').onclick=requestNew;document.getElementById('startupNew').onclick=requestNew;document.getElementById('startupOpen').onclick=requestOpen;renderRecentBoards();document.getElementById('fitBtn').onclick=fit;document.getElementById('restoreBtn').onclick=restoreAutosave;document.getElementById('captureBtn').onclick=capture;document.getElementById('importBtn').onclick=sendToAE;
settingsScrub=SettingsScrub.create({get:function(id){return document.getElementById(id);},panel:document.getElementById('settingsPanel'),board:function(){return board;},busy:function(){return !boardPath||fileOperationBusy()||!!(cropUI&&cropUI.isActive());},paint:applyBoardAppearance,render:render});
function stopLink(node,item){stopLinkPlayback(item.id);}
function editDrawing(item){if(drawingUI)drawingUI.edit(item);}
boardUI=BoardUI.create({board:function(){return board;},displayItem:function(item){if(noteUI)item=noteUI.item(item);if(drawingUI)item=drawingUI.item(item);return item;},render:render,toast:toast,showToolbar:showToolbar,focusItems:focusItems,editText:editText,editDrawing:editDrawing,copyImage:copySelected,relink:openRelinkPicker,playLink:playLink,stopLink:stopLink,openExternal:openExternal,requireBoard:requireBoard,busy:function(){return !!(pendingImports||action||pan||(filesUI&&filesUI.isBusy())||(aeUI&&aeUI.isBusy())||(cropUI&&cropUI.isActive()));},imageURL:panelImageURL,executeCommand:executeEditorCommand});
document.getElementById('focusSelectionBtn').onclick=function(){focusItems();};
function retryImage(id){var img=BoardUI.reference(world,id,'img');if(img)delete img.dataset.path;}
filesUI=FilesUI.create({board:function(){return board;},boardPath:function(){return boardPath;},assets:function(){return assets;},fs:function(){return fs;},path:function(){return path;},buffer:function(data,encoding){return Buffer.from(data,encoding);},retryImage:retryImage,requireBoard:requireBoard,render:render,save:saveBoard,showToolbar:showToolbar,dialogs:function(){return dialogs;},blocked:function(){return fileOperationBusy()||pendingBoardEdit();},busyChanged:function(){if(boardUI)boardUI.refresh();if(drawingUI)drawingUI.refresh();if(noteUI)noteUI.refresh();},frame:function(){return{width:viewport.clientWidth,height:viewport.clientHeight,padding:32};}});
cropUI=CropUI.create({getBoard:function(){return board;},world:world,viewport:viewport,boardPoint:boardPoint,render:render,toast:toast,showToolbar:showToolbar,onStart:function(){textMode=false;toggleDraw(false);viewport.classList.remove('texting');document.getElementById('noteBtn').classList.remove('active');hideMenu();closeColor();if(shellUI){shellUI.closeMenus(false);shellUI.closePanels();}}});
aeUI=AEUI.create({getBoard:function(){return board;},boardPath:function(){return boardPath;},getLayout:function(){return layout;},fs:function(){return fs;},path:function(){return path;},requireBoard:requireBoard,render:render,save:saveBoard,showToolbar:showToolbar,toast:toast,point:function(){var r=viewport.getBoundingClientRect();return boardPoint(r.left+r.width/2,r.top+r.height/2);},otherBusy:function(){return (filesUI&&filesUI.isBusy())||(cropUI&&cropUI.isActive());}});
document.getElementById('cropBtn').onclick=function(){if(!fileOperationBusy()&&requireBoard())cropUI.start();};
document.getElementById('sendBtn').onclick=function(){if(!fileOperationBusy()&&requireBoard())sendToAE();};
document.getElementById('replaceBtn').onclick=function(){if(!fileOperationBusy()&&requireBoard())sendToAE(true);};
document.getElementById('aeBtn').onclick=function(){if(!(cropUI&&cropUI.isActive()))aeUI.open();};
var cropCommand=document.createElement('button');cropCommand.dataset.command='crop';cropCommand.textContent='Crop image…';var cropHint=document.createElement('kbd');cropHint.textContent='C';cropCommand.appendChild(cropHint);contextMenu.insertBefore(cropCommand,contextMenu.querySelector('[data-command="copy-image"]'));
['text','draw','shape','erase','properties','canvas-settings'].forEach(function(name){var button=document.createElement('button'),label=EditorCommands.state(name,board).label,key={text:'T',draw:'P',shape:'U',properties:'E'}[name];button.dataset.command=name;button.textContent=label;if(key){var hint=document.createElement('kbd');hint.textContent=key;button.appendChild(hint);}contextMenu.appendChild(button);});
// Isolate a draft crop from all other editing actions; navigation remains live.
window.addEventListener('keydown',function(e){if(cropUI.isActive()){cropUI.keydown(e);e.stopImmediatePropagation();if(!BoardUI.isEditing(e.target))e.preventDefault();}},true);
document.addEventListener('click',function(e){if(!cropUI.isActive())return;if(e.target.closest('.rail,.tool-panel,.command-menu,#contextMenu,#colorPopover')){e.preventDefault();e.stopImmediatePropagation();toast('Finish or cancel the crop first.');}},true);
document.addEventListener('paste',function(e){if(cropUI.isActive()){e.preventDefault();e.stopImmediatePropagation();}},true);
viewport.addEventListener('drop',function(e){if(cropUI.isActive()){e.preventDefault();e.stopImmediatePropagation();}},true);
noteUI=NoteUI.create({board:function(){return board;},render:render,measure:measureNote,setWell:setWell,picker:colorPicker,closeColor:closeColor,requireBoard:requireBoard,showToolbar:showToolbar,catalog:FontCatalog.create({execFile:childProcess&&childProcess.execFile.bind(childProcess),platform:platform.platform}),busy:function(){return (cropUI&&cropUI.isActive())||(filesUI&&filesUI.isBusy())||(aeUI&&aeUI.isBusy());},prepare:function(){textMode=false;toggleDraw(false);viewport.classList.remove('texting');document.getElementById('noteBtn').classList.remove('active');if(shellUI){shellUI.closeMenus(false);shellUI.closePanels('noteSettingsPanel');}}});
drawingUI=DrawingUI.create({board:function(){return board;},render:render,requireBoard:requireBoard,setWell:setWell,picker:colorPicker,closeColor:closeColor,showToolbar:showToolbar,cancelGesture:cancelDrawGesture,busy:function(){return (cropUI&&cropUI.isActive());},modeChanged:function(mode){if(mode)clearSectionMode();drawMode=!!mode;viewport.classList.toggle('drawing',drawMode);viewport.classList.toggle('tool-draw',mode==='draw');viewport.classList.toggle('tool-shape',mode==='shape');viewport.classList.toggle('tool-erase',mode==='erase');if(mode)viewport.focus();},prepare:function(panel){textMode=false;viewport.classList.remove('texting');document.getElementById('noteBtn').classList.remove('active');if(shellUI){shellUI.closeMenus(false);shellUI.closePanels(panel);}}});
document.getElementById('shapeBtn').onclick=function(){if(drawingUI.snapshot()&&drawingUI.snapshot().tool!=='pen'&&drawingUI.snapshot().tool!=='line'&&!document.getElementById('shapePanel').hidden)drawingUI.close();else drawingUI.open('shape');};
window.addEventListener('blur',handleWindowBlur);
window.addEventListener('beforeunload',handleBeforeUnload);
shellUI=ShellUI.create({board:function(){return board;},viewport:viewport,showToolbar:showToolbar,stopText:function(){textMode=false;viewport.classList.remove('texting');document.getElementById('noteBtn').classList.remove('active');},stopDrawing:function(){toggleDraw(false);},stopErasing:stopErasing,cancelDrawingGesture:cancelDrawGesture,closeColor:closeColor,closeNote:function(){if(noteUI)noteUI.close();},cropActive:function(){return cropUI.isActive();},command:executeEditorCommand,configureContext:refreshEditorCommands,refreshCommands:function(){menuPoint=null;refreshEditorCommands();}});
function applyToolbarLabels(mode){document.body.classList.toggle('toolbar-icons',mode==='icons');}
preferencesUI=PreferencesUI.create({preferences:preferences,board:function(){return board;},hasBoard:function(){return !!boardPath;},applyLabels:applyToolbarLabels,toast:toast});
applyToolbarLabels(preferences.get().toolbarLabels);
document.getElementById('recoveryAccept').onclick=restoreAutosave;
document.getElementById('recoveryKeep').onclick=keepCurrentRecovery;
document.getElementById('recoveryRetry').onclick=function(){if(!fileOperationBusy()){if(persistence&&persistence.saveError)saveBoard();else flushRecovery();}};
document.getElementById('saveStatus').onclick=function(){document.getElementById('filesBtn').click();};
document.getElementById('recoveryBar').addEventListener('keydown',function(e){e.stopPropagation();});
document.getElementById('preferencesBtn').onclick=function(){if(openEditorPanel('preferencesPanel'))preferencesUI.open();};
document.getElementById('shortcutsBtn').onclick=function(){openEditorPanel('shortcutsPanel');};document.getElementById('aboutBtn').onclick=function(){openEditorPanel('aboutPanel');};
document.getElementById('propertiesBtn').onclick=showProperties;
['flipH','flipV'].forEach(function(id){document.getElementById(id).addEventListener('change',function(){commitImageFlip(id,this.checked);});});
document.getElementById('applyLinkUrl').onclick=commitLinkUrl;document.getElementById('linkUrl').addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();commitLinkUrl();}else if(e.key==='Escape'){e.preventDefault();refreshProperties();this.blur();}});
['Properties','Shortcuts','About'].forEach(function(name){document.getElementById('close'+name).onclick=function(){document.getElementById(name.charAt(0).toLowerCase()+name.slice(1)+'Panel').hidden=true;};});
document.querySelectorAll('.toolstrip button').forEach(function(button){button.setAttribute('aria-label',button.title||button.textContent.trim());});
applyPlatformLabels();
render();
})();
