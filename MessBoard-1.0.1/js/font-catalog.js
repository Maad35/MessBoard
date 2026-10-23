(function (root, factory) {
  var value = factory();
  root.FontCatalog = value;
  if (typeof module === 'object' && module.exports) module.exports = value;
})(this, function () {
  // Windows fallback: faces that ship with Windows.
  var windowsFallback = ['Segoe UI', 'Arial', 'Calibri', 'Consolas', 'Georgia', 'Times New Roman', 'Verdana'];
  // macOS fallback: faces that ship with macOS (no Segoe UI / Calibri there).
  var macFallback = ['Helvetica Neue', 'Helvetica', 'SF Pro Text', 'Avenir Next', 'Menlo', 'Monaco', 'Times New Roman'];
  // Neutral list for platforms with no supported enumeration backend.
  var genericFallback = ['Arial', 'Courier New', 'Georgia', 'Helvetica', 'Times New Roman', 'Verdana'];

  // Literal command only: queries and font names never become shell input.
  var windowsScript = '[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding; ' +
    'Add-Type -AssemblyName System.Drawing; ' +
    '$fonts=New-Object System.Drawing.Text.InstalledFontCollection; ' +
    'try { @($fonts.Families | ForEach-Object { $_.Name }) | ConvertTo-Json -Compress } ' +
    'finally { $fonts.Dispose() }';

  // Literal JavaScript-for-Automation program; no interpolation of any kind.
  // ObjC.import / $.<Class> / ObjC.deepUnwrap are the documented JXA ObjC bridge:
  //   https://developer.apple.com/library/archive/releasenotes/InterapplicationCommunication/RN-JavaScriptForAutomation/Articles/OSX10-10.html
  // Argument-less ObjC methods and properties are read as JS properties, hence
  // `sharedFontManager` and `availableFontFamilies` carry no call parentheses.
  //   https://developer.apple.com/documentation/appkit/nsfontmanager/shared
  //   https://developer.apple.com/documentation/appkit/nsfontmanager/availablefontfamilies
  var macScript = "ObjC.import('AppKit'); " +
    'JSON.stringify(ObjC.deepUnwrap($.NSFontManager.sharedFontManager.availableFontFamilies))';

  // One entry per supported platform. Argument arrays are rebuilt per request so
  // a consumer cannot mutate the shared constants, and never carry user data.
  var backends = {
    win32: {
      fallback: windowsFallback,
      file: 'powershell.exe',
      args: function () { return ['-NoProfile', '-NonInteractive', '-Command', windowsScript]; }
    },
    darwin: {
      fallback: macFallback,
      file: '/usr/bin/osascript',
      args: function () { return ['-l', 'JavaScript', '-e', macScript]; }
    }
  };

  function normalize(values) {
    if (typeof values === 'string') values = [values];
    var names = [];
    var seen = Object.create(null);
    values.forEach(function (value) {
      if (typeof value !== 'string' || /[\x00-\x1f\x7f-\x9f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/.test(value)) return;
      var name = value.trim();
      var key = name.toLowerCase();
      if (!name || name.length > 128 || seen[key]) return;
      seen[key] = true;
      names.push(name);
    });
    return names.sort(function (a, b) {
      a = a.toLowerCase();
      b = b.toLowerCase();
      return a < b ? -1 : a > b ? 1 : 0;
    }).slice(0, 5000);
  }

  // create({ execFile: childProcess.execFile.bind(childProcess), platform: process.platform, buffer: Buffer })
  // platform selects the enumeration backend: 'win32' (PowerShell InstalledFontCollection)
  // or 'darwin' (osascript JXA + NSFontManager). Any other value, including null or
  // an unknown string, has no backend: load reports an explicit Error with fallback
  // names and never spawns a process. When platform is OMITTED (or undefined) the
  // Windows backend is used, so existing callers and tests keep their behavior.
  // Buffer is optional and unused: both literal commands need no encoding.
  // load(callback) calls callback(error, names); cache/fallback hits are synchronous.
  // Each instance caches success only. A subsequent load retries a failed request.
  // Names are plain data, not HTML/CSS fragments; consumers must render them safely.
  function create(options) {
    var execFile = options && options.execFile;
    var platform = options && options.platform !== undefined ? options.platform : 'win32';
    var backend = typeof platform === 'string' && Object.prototype.hasOwnProperty.call(backends, platform)
      ? backends[platform]
      : null;
    var fallback = backend ? backend.fallback : genericFallback;
    var cached = null;
    var pending = null;
    return {
      load: function (callback) {
        if (cached !== null) {
          callback(null, cached.slice());
          return;
        }
        if (pending) {
          pending.push(callback);
          return;
        }
        if (!backend) {
          callback(new Error('Installed font enumeration unsupported on this platform'), fallback.slice());
          return;
        }
        if (typeof execFile !== 'function') {
          callback(new Error('Installed font enumeration unavailable'), fallback.slice());
          return;
        }
        pending = [callback];
        var settled = false;
        function complete(error, stdout) {
          if (settled) return;
          settled = true;
          var names = fallback;
          if (!error) {
            try { names = normalize(JSON.parse(stdout.replace(/^\ufeff/, ''))); }
            catch (parseError) { error = new Error('Invalid installed font enumeration output'); }
          }
          if (!error) cached = names;
          var callbacks = pending;
          pending = null;
          var callbackError;
          callbacks.forEach(function (done) {
            try { done(error || null, names.slice()); }
            catch (thrown) { if (!callbackError) callbackError = thrown; }
          });
          if (callbackError) throw callbackError;
        }
        try {
          execFile(backend.file, backend.args(), {
            encoding: 'utf8', timeout: 8000, maxBuffer: 1048576, windowsHide: true
          }, complete);
        } catch (spawnError) {
          if (settled) throw spawnError;
          complete(spawnError);
        }
      }
    };
  }

  return { create: create };
});
