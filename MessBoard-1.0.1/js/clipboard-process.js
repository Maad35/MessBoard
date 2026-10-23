(function (root, factory) {
  var value = factory();
  root.ClipboardProcess = value;
  if (typeof module === 'object' && module.exports) module.exports = value;
})(this, function () {
  'use strict';

  var PATH_VARIABLE = 'MESSBOARD_CLIPBOARD_IMAGE_PATH';

  // This program is constant. A file path is data, never PowerShell source.
  var windowsScript = "$ErrorActionPreference = 'Stop'; " +
    'Add-Type -AssemblyName System.Windows.Forms; ' +
    'Add-Type -AssemblyName System.Drawing; ' +
    '$source = $null; $bitmap = $null; ' +
    'try { $source = [System.Drawing.Image]::FromFile($env:MESSBOARD_CLIPBOARD_IMAGE_PATH); ' +
    '$bitmap = New-Object System.Drawing.Bitmap $source; ' +
    '[System.Windows.Forms.Clipboard]::SetImage($bitmap) } ' +
    'finally { if ($bitmap) { $bitmap.Dispose() }; if ($source) { $source.Dispose() } }';

  // This program is constant too. osascript passes trailing command arguments to
  // the run handler as a list of strings, so the path arrives as argv data and is
  // never compiled as JavaScript source. Every failure throws: a JXA error exits
  // non-zero, so a silent "success" with an empty pasteboard is impossible.
  var darwinScript = [
    'function run(argv) {',
    "  ObjC.import('AppKit');",
    '  var path = argv && argv.length ? argv[argv.length - 1] : null;',
    "  if (typeof path !== 'string' || !path) throw new Error('missing image path argument');",
    '  // $() boxes the argv string as an NSString instead of relying on coercion.',
    '  var image = $.NSImage.alloc.initWithContentsOfFile($(path));',
    "  if (!image || image.isNil()) throw new Error('unreadable image');",
    '  var board = $.NSPasteboard.generalPasteboard;',
    "  if (!board || board.isNil()) throw new Error('pasteboard unavailable');",
    '  // Argument-less selectors are properties in JXA; -clearContents returns the change count.',
    '  var changeCount = board.clearContents;',
    '  var written = board.writeObjects($.NSArray.arrayWithObject(image));',
    "  if (written !== true && written != 1) throw new Error('pasteboard write rejected');",
    "  return 'ok ' + changeCount;",
    '}'
  ].join('\n');

  function failure(code, message) {
    var error = new Error(message);
    error.code = code;
    return error;
  }

  // copyImage({execFile, env: process.env, platform: process.platform}, file, done)
  // done(error|null) is required; validation callbacks may run synchronously.
  // The helper does not require Node or touch the parent environment/clipboard
  // directly. Only the explicitly injected platform process performs the copy.
  function copyImage(dependencies, file, done) {
    var settled = false;
    var platform = dependencies ? dependencies.platform : null;
    var isWindows = platform === 'win32';
    var isMac = platform === 'darwin';
    function complete(error) {
      if (settled) return;
      settled = true;
      if (!error) { done(null); return; }
      // Never expose subprocess messages/stdout/stderr or environment values.
      if (error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
        done(failure('COPY_OUTPUT_LIMIT', 'Clipboard copy exceeded its output limit.'));
      } else if (error.killed || error.code === 'ETIMEDOUT') {
        done(failure('COPY_TIMEOUT', 'Clipboard copy timed out. Try again.'));
      } else if (error.code === 'ENOENT') {
        done(failure('COPY_UNAVAILABLE', isMac
          ? 'The macOS scripting runtime is unavailable.'
          : 'Windows PowerShell is unavailable.'));
      } else {
        done(failure('COPY_FAILED', 'Clipboard copy failed. Check that the image is readable and try again.'));
      }
    }
    if (!isWindows && !isMac) {
      done(failure('UNSUPPORTED_PLATFORM', 'Clipboard image fallback is available only on Windows and macOS.'));
      return;
    }
    if (typeof dependencies.execFile !== 'function' || !dependencies.env ||
        typeof dependencies.env !== 'object' || Array.isArray(dependencies.env)) {
      done(failure('COPY_UNAVAILABLE', 'Copy is unavailable in this CEP runtime.'));
      return;
    }
    // Validate transport, not filesystem syntax. Preserve all accepted text exactly.
    if (typeof file !== 'string' || !file.trim() || file.indexOf('\u0000') !== -1 || file.length > 32766) {
      done(failure('INVALID_IMAGE_PATH', 'Invalid clipboard image path.'));
      return;
    }
    try {
      var env = Object.create(null);
      Object.keys(dependencies.env).forEach(function (key) {
        // Windows environment keys are case-insensitive; remove stale aliases.
        if (key.toUpperCase() !== PATH_VARIABLE) env[key] = dependencies.env[key];
      });
      if (isMac) {
        dependencies.execFile('/usr/bin/osascript', ['-l', 'JavaScript', '-e', darwinScript, file], {
          env: env, shell: false, windowsHide: true,
          timeout: 10000, maxBuffer: 65536, encoding: 'utf8'
        }, complete);
        return;
      }
      env[PATH_VARIABLE] = file;
      dependencies.execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-STA', '-Command', windowsScript], {
        env: env, shell: false, windowsHide: true,
        timeout: 10000, maxBuffer: 65536, encoding: 'utf8'
      }, complete);
    } catch (error) {
      if (settled) throw error;
      complete(error);
    }
  }

  return { copyImage: copyImage };
});
