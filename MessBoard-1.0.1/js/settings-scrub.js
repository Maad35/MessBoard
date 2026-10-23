/* Detached numeric appearance previews: no document writes until release. */
(function(root){
 'use strict';
 function create(hooks){
  var draft=null;
  function available(){return !hooks.panel.hidden&&!hooks.busy()&&!hooks.board().transaction;}
  function valid(){return available()&&(!draft||(draft.board===hooks.board()&&draft.original===JSON.stringify(hooks.board().settings)));}
  function settings(board){if(!draft||draft.board!==board||!valid())return board.settings;var result=Object.assign({},board.settings);result[draft.key]=draft.value;return result;}
  function sync(){var s=settings(hooks.board());hooks.get('gridSize').value=s.gridSize;hooks.get('gridOpacity').value=s.gridOpacity;hooks.get('gridOpacityNumber').value=Math.round(s.gridOpacity*100);}
  function cancel(){draft=null;sync();hooks.paint();}
  [['gridSize','gridSize',1],['gridOpacityNumber','gridOpacity',100]].forEach(function(spec){
   var node=hooks.get(spec[0]),key=spec[1],scale=spec[2];
   root.NumericScrub.bind(node,{
    begin:function(){if(!available())return false;draft={board:hooks.board(),key:key,value:hooks.board().settings[key],original:JSON.stringify(hooks.board().settings)};},
    valid:valid,
    preview:function(value){if(draft&&valid()){draft.value=value/scale;sync();hooks.paint();}},
    commit:function(value){if(!draft||!valid()){cancel();return;}var owner=draft.board,patch={};draft=null;patch[key]=value/scale;owner.setSettings(patch);sync();hooks.render();},
    cancel:cancel
   });
  });
  var opacity=hooks.get('gridOpacityNumber');
  opacity.addEventListener('change',function(){if(opacity.__numericScrubbing)return;var value=Number(opacity.value);if(available()&&opacity.value!==''&&isFinite(value)&&value>=0&&value<=100){hooks.board().setSettings({gridOpacity:value/100});hooks.render();}sync();});
  return{settings:settings,cancel:cancel,sync:sync};
 }
 root.SettingsScrub={create:create};if(typeof module==='object'&&module.exports)module.exports=root.SettingsScrub;
}(this));
