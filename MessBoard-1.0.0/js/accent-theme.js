/* Chrome only: content colors remain independent of these tokens. */
(function(root,factory){var value=factory();root.AccentTheme=value;if(typeof module==='object'&&module.exports)module.exports=value;})(this,function(){
  var DEFAULT='#4096f3';
  function normalize(value,fallback){
    if(typeof value!=='string'||!/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value))return fallback||DEFAULT;
    var color=value.toLowerCase();
    return color.length===4?'#'+color[1]+color[1]+color[2]+color[2]+color[3]+color[3]:color;
  }
  function rgb(hex){return [parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16)];}
  function hex(channels){return '#'+channels.map(function(v){return ('0'+Math.round(v).toString(16)).slice(-2);}).join('');}
  function mix(a,b,amount){return a.map(function(v,i){return Math.round(v+(b[i]-v)*amount);});}
  function luminance(color){
    var c=rgb(color).map(function(v){v/=255;return v<=0.04045?v/12.92:Math.pow((v+0.055)/1.055,2.4);});
    return c[0]*0.2126+c[1]*0.7152+c[2]*0.0722;
  }
  function contrast(a,b){var x=luminance(a),y=luminance(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);}
  function ink(background){
    if(contrast('#171717',background)>=4.5)return '#171717';
    return contrast('#ffffff',background)>=4.5?'#ffffff':'#000000';
  }
  function readable(color,surface,minimum){
    var c=rgb(color),text=color;
    // Includes the brightest normal chrome active state, not only the rail.
    for(var i=1;i<=100&&(contrast(text,'#45454c')<minimum||contrast(text,surface)<minimum);i++)text=hex(mix(c,[255,255,255],i/100));
    return text;
  }
  function tokens(value){
    var color=normalize(value),c=rgb(color);
    // Preserve explicitly saved legacy purple; other colors use neutral blends.
    var surface=color==='#a5a0ff'?'#353344':hex(mix([29,29,29],c,0.18));
    var border=color==='#a5a0ff'?'#595572':hex(mix([37,37,37],c,0.4));
    var hover=hex(mix(c,[255,255,255],0.24));
    return {
      '--accent':color,
      '--accent-surface':surface,
      '--accent-border':border,
      '--accent-wash':'rgba('+c.join(', ')+', 0.12)',
      '--accent-ink':ink(color),
      '--accent-text':readable(color,surface,4.5),
      '--accent-indicator':readable(color,surface,3),
      '--accent-hover':hover,
      '--accent-hover-ink':ink(hover)
    };
  }
  /* Panel theme: the user picks the panel surface and the text color; the
   * rest of the chrome ladder (deep background, controls, hover, borders,
   * muted text) is derived so one pair of colors themes every panel and
   * menu. At the stock pair the derivations reproduce the shipped chrome. */
  function panelTokens(panelValue,textValue){
    var p=rgb(normalize(panelValue,'#252525')),t=rgb(normalize(textValue,'#e6e6e6'));
    return {
      '--rail':hex(p),
      '--deep':hex(mix(p,[0,0,0],0.38)),
      '--control':hex(mix(p,[255,255,255],0.05)),
      '--hover':hex(mix(p,[255,255,255],0.10)),
      '--line':hex(mix(p,[255,255,255],0.11)),
      '--ink':hex(t),
      '--muted':hex(mix(t,p,0.33))
    };
  }
  return {tokens:tokens,panelTokens:panelTokens};
});
