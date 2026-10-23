/* Cross-platform screen color sampling. Browser global and CommonJS coexist in CEP mixed context. */
(function (root, factory) {
  var value = factory();
  root.ScreenSampler = value;
  if (typeof module === 'object' && module.exports) module.exports = value;
})(this, function () {
  'use strict';

  // This program is constant. It carries no interpolated data, so nothing can be injected.
  // It waits for the opening click to be released, waits for the next press, then copies the
  // single pixel under the cursor. No window, no dialog and no cursor change: the caller owns
  // all user-facing feedback.
  var windowsScript = 'Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; ' +
    'while([System.Windows.Forms.Control]::MouseButtons){Start-Sleep -Milliseconds 30}; ' +
    'while(-not [System.Windows.Forms.Control]::MouseButtons){Start-Sleep -Milliseconds 30}; ' +
    '$p=[System.Windows.Forms.Cursor]::Position; $bmp=New-Object System.Drawing.Bitmap 1,1; ' +
    '$g=[System.Drawing.Graphics]::FromImage($bmp); ' +
    '$g.CopyFromScreen($p.X,$p.Y,0,0,(New-Object System.Drawing.Size(1,1))); $c=$bmp.GetPixel(0,0); ' +
    '$g.Dispose(); $bmp.Dispose(); ' +
    "Write-Output ('{0:X2}{1:X2}{2:X2}' -f $c.R,$c.G,$c.B)";

  // Long-lived Windows helper. Loading Forms/Drawing is the expensive part, so do it once.
  // Commands and replies are fixed newline-delimited tokens; no user data enters the script.
  var windowsHostScript = '$ErrorActionPreference=\'Stop\'; ' +
    'Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; ' +
    '[Console]::Out.WriteLine(\'READY\'); [Console]::Out.Flush(); ' +
    'while(($line=[Console]::In.ReadLine()) -ne $null){ if($line -ne \'PICK\'){continue}; ' +
    'while([System.Windows.Forms.Control]::MouseButtons){Start-Sleep -Milliseconds 10}; ' +
    'while(-not [System.Windows.Forms.Control]::MouseButtons){Start-Sleep -Milliseconds 10}; ' +
    '$p=[System.Windows.Forms.Cursor]::Position; $bmp=New-Object System.Drawing.Bitmap 1,1; ' +
    '$g=[System.Drawing.Graphics]::FromImage($bmp); try{' +
    '$g.CopyFromScreen($p.X,$p.Y,0,0,(New-Object System.Drawing.Size(1,1))); $c=$bmp.GetPixel(0,0); ' +
    '[Console]::Out.WriteLine((\'COLOR {0:X2}{1:X2}{2:X2}\' -f $c.R,$c.G,$c.B)); [Console]::Out.Flush()' +
    '}finally{$g.Dispose();$bmp.Dispose()}}';

  // Packaged next to the extension. Built and signed ahead of release; see cep/native/macos/README.md.
  var HELPER_DIRECTORY = ['native', 'macos'];
  var HELPER_NAME = 'messboard-colorsampler';
  var TIMEOUT = 30000;
  var MAX_BUFFER = 65536;
  var SIX_HEX = /^[0-9A-F]{6}$/i;

  function failure(code, message) {
    var error = new Error(message);
    error.code = code;
    return error;
  }

  // Subprocess and platform messages may quote file contents, paths or environment values.
  // Map them onto a fixed vocabulary so nothing sensitive reaches the UI.
  function sanitize(error, unavailableMessage) {
    if (error && error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
      return failure('SAMPLE_OUTPUT_LIMIT', 'Color sampling exceeded its output limit.');
    }
    if (error && (error.killed || error.code === 'ETIMEDOUT')) {
      return failure('SAMPLE_TIMEOUT', 'Color sampling timed out. Try again.');
    }
    if (error && error.code === 'ENOENT') {
      return failure('SAMPLE_UNAVAILABLE', unavailableMessage);
    }
    return failure('SAMPLE_FAILED', 'Color sampling failed. Try again.');
  }

  function isFunction(value) { return typeof value === 'function'; }

  // pick({platform, execFile, env, fs, path, extensionPath, EyeDropper}, done)
  //   -> cancellation function, or null when nothing is pending.
  // done(error|null, '#rrggbb') runs exactly once. Late, duplicate and post-cancel
  // completions are dropped, so a canceled pick can never overwrite the caller's color.
  function pick(dependencies, done) {
    var settled = false, canceled = false, child = null;
    var deps = dependencies || {};

    function complete(error, hex) {
      if (settled || canceled) return;
      settled = true;
      if (error) { done(error); return; }
      done(null, hex);
    }

    // Both backends print six uppercase hex digits and nothing else. Anything else -
    // empty output, a dismissed sampler, unexpected chatter - is a cancellation, never a color.
    function accept(text) {
      var hex = String(text == null ? '' : text).trim();
      if (!SIX_HEX.test(hex)) { complete(failure('SAMPLE_CANCELED', 'Color pick canceled.')); return; }
      complete(null, '#' + hex.toLowerCase());
    }

    function fromProcess(unavailableMessage) {
      return function (error, stdout) {
        if (error) { complete(sanitize(error, unavailableMessage)); return; }
        accept(stdout);
      };
    }

    function cancellation() {
      return function () {
        if (settled || canceled) return;
        canceled = true;
        // The child may already be gone; a failed kill must not reach the caller.
        if (child && isFunction(child.kill)) { try { child.kill(); } catch (error) { /* already exited */ } }
        child = null;
      };
    }

    function spawn(program, args, options, unavailableMessage) {
      try {
        child = deps.execFile(program, args, options, fromProcess(unavailableMessage));
      } catch (error) {
        complete(sanitize(error, unavailableMessage));
        return null;
      }
      return cancellation();
    }

    if (deps.platform === 'win32') {
      if (!isFunction(deps.execFile)) {
        complete(failure('SAMPLE_UNAVAILABLE', 'Screen sampling is unavailable in this runtime.'));
        return null;
      }
      // UTF-16LE base64 is what -EncodedCommand expects. Buffer comes from the CEP Node runtime.
      var encoded;
      try {
        encoded = Buffer.from(windowsScript, 'utf16le').toString('base64');
      } catch (error) {
        complete(failure('SAMPLE_UNAVAILABLE', 'Screen sampling is unavailable in this runtime.'));
        return null;
      }
      return spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-STA', '-EncodedCommand', encoded], {
        shell: false, windowsHide: true, timeout: TIMEOUT, maxBuffer: MAX_BUFFER, encoding: 'utf8'
      }, 'Windows PowerShell is unavailable.');
    }

    if (deps.platform === 'darwin') {
      // Preferred: the browser eyedropper. CEP 11 ships Chromium 88 and the EyeDropper API
      // landed in Chromium 95, so this is present only in newer or external runtimes.
      if (isFunction(deps.EyeDropper)) {
        var pending;
        try {
          pending = new deps.EyeDropper().open({});
        } catch (error) {
          complete(failure('SAMPLE_FAILED', 'Color sampling failed. Try again.'));
          return null;
        }
        if (pending && isFunction(pending.then)) {
          pending.then(function (result) {
            accept(result && result.sRGBHex ? String(result.sRGBHex).replace(/^#/, '') : '');
          }, function () {
            // A rejection is an abort or an internal error; either way the user gets no color.
            complete(failure('SAMPLE_CANCELED', 'Color pick canceled.'));
          });
          return cancellation();
        }
        complete(failure('SAMPLE_FAILED', 'Color sampling failed. Try again.'));
        return null;
      }
      // Fallback: the signed NSColorSampler helper packaged with the extension.
      var unavailable = 'Screen sampling is unavailable in this runtime.';
      if (!isFunction(deps.execFile) || !deps.fs || !isFunction(deps.fs.existsSync) ||
          !deps.path || !isFunction(deps.path.join) ||
          typeof deps.extensionPath !== 'string' || !deps.extensionPath) {
        complete(failure('SAMPLE_UNAVAILABLE', unavailable));
        return null;
      }
      var helper = deps.path.join.apply(deps.path, [deps.extensionPath].concat(HELPER_DIRECTORY, [HELPER_NAME]));
      // No helper means no sampling. Never guess another location and never invent a color.
      if (!deps.fs.existsSync(helper)) {
        complete(failure('SAMPLE_UNAVAILABLE', 'Screen sampling is unavailable: the macOS color sampler helper is not installed.'));
        return null;
      }
      return spawn(helper, [], {
        shell: false, timeout: TIMEOUT, maxBuffer: MAX_BUFFER, encoding: 'utf8'
      }, 'Screen sampling is unavailable: the macOS color sampler helper is not installed.');
    }

    complete(failure('UNSUPPORTED_PLATFORM', 'Screen sampling is available only on Windows and macOS.'));
    return null;
  }

  function create(dependencies) {
    var deps=dependencies||{},child=null,ready=false,disposed=false,pending=null,buffer='',timer=null,restarting=false;
    var setTimer=deps.setTimeout||setTimeout,clearTimer=deps.clearTimeout||clearTimeout;
    function clear(){if(timer!==null){clearTimer(timer);timer=null;}}
    function failPending(error){var task=pending;pending=null;clear();if(task&&!task.canceled)task.done(error);}
    function start(){
      if(disposed||deps.platform!=='win32'||!isFunction(deps.spawn))return;
      var encoded;
      try{encoded=Buffer.from(windowsHostScript,'utf16le').toString('base64');}catch(error){return;}
      ready=false;buffer='';restarting=false;
      try{child=deps.spawn('powershell.exe',['-NoProfile','-NonInteractive','-STA','-EncodedCommand',encoded],{shell:false,windowsHide:true,stdio:['pipe','pipe','pipe']});}
      catch(error){child=null;return;}
      var owned=child;
      function stopped(){
        if(child!==owned)return;child=null;ready=false;clear();
        failPending(failure('SAMPLE_FAILED','Color sampling failed. Try again.'));
        if(!disposed&&!restarting)start();
      }
      if(owned.stdout&&isFunction(owned.stdout.on))owned.stdout.on('data',function(data){
        if(child!==owned||disposed)return;buffer+=String(data);var lines=buffer.split(/\r?\n/);buffer=lines.pop();
        for(var i=0;i<lines.length;i++){
          var line=lines[i].trim();
          if(line==='READY'){ready=true;if(pending)sendPick();}
          else if(/^COLOR [0-9A-F]{6}$/i.test(line)&&pending){var task=pending;pending=null;clear();if(!task.canceled)task.done(null,'#'+line.slice(6).toLowerCase());}
        }
      });
      if(isFunction(owned.on)){owned.on('error',stopped);owned.on('exit',stopped);}
    }
    function sendPick(){
      if(!pending||!ready||!child||!child.stdin||!isFunction(child.stdin.write))return;
      try{child.stdin.write('PICK\n');timer=setTimer(function(){restart(failure('SAMPLE_TIMEOUT','Color sampling timed out. Try again.'));},TIMEOUT);}
      catch(error){restart(failure('SAMPLE_FAILED','Color sampling failed. Try again.'));}
    }
    function restart(error){
      var old=child;restarting=true;child=null;ready=false;clear();failPending(error);
      if(old&&isFunction(old.kill)){try{old.kill();}catch(ignore){}}
      restarting=false;if(!disposed)start();
    }
    function warmPick(done){
      if(deps.platform!=='win32')return pick(deps,done);
      if(pending){done(failure('SAMPLE_FAILED','Color sampling is already active.'));return null;}
      if(!child)start();
      if(!child){done(failure('SAMPLE_UNAVAILABLE','Screen sampling is unavailable in this runtime.'));return null;}
      var task={done:done,canceled:false};pending=task;if(ready)sendPick();
      return function(){if(pending!==task||task.canceled)return;task.canceled=true;restart(null);};
    }
    function dispose(){disposed=true;var old=child;child=null;ready=false;clear();if(pending)pending.canceled=true;pending=null;if(old&&isFunction(old.kill)){try{old.kill();}catch(ignore){}}}
    if(deps.platform==='win32')start();
    return{pick:warmPick,dispose:dispose};
  }

  return { pick: pick, create:create };
});
