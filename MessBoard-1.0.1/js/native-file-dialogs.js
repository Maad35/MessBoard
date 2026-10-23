/* Synchronous CEP-compatible native backend. No host/filesystem access at load.
   Inject {platform,path,extensionPath,env,execFileSync}; extensionPath is cep/.
   Scripts are constant packaged files, never synthesized from user input. */
(function (root, factory) {
  var value = factory();
  root.NativeFileDialogs = value;
  if (typeof module === 'object' && module.exports) module.exports = value;
})(this, function () {
  'use strict';
  function create(deps) {
    deps = deps || {};
    var busy = false;
    function fileSystemPath(file) {
      if (typeof file !== 'string' || !file || file.length > 32767 || /[\x00-\x1f]/.test(file)) return false;
      if (deps.platform === 'darwin') return file.charAt(0) === '/';
      // No shell namespace, NT device or extended-device path is a board file.
      if (/^[\\/]{2}[.?][\\/]/.test(file)) return false;
      return /^(?:[a-z]:[\\/]|\\\\[^\\]+\\[^\\]+)/i.test(file);
    }
    function invoke(request) {
      var empty = request.operation === 'save' ? '' : [];
      if (busy) return { err: 2, data: empty };
      busy = true;
      try {
        if ((deps.platform !== 'win32' && deps.platform !== 'darwin') || !deps.path ||
            typeof deps.execFileSync !== 'function' || !deps.extensionPath || !deps.env) throw new Error('unavailable');
        ['title', 'initial', 'name', 'selectedFilter', 'confirm', 'prompt'].forEach(function (key) {
          if (typeof request[key] !== 'string' || request[key].length > 4096 || /[\x00-\x1f]/.test(request[key])) throw new Error('input');
        });
        if (request.initial && !fileSystemPath(request.initial)) throw new Error('input');
        if (typeof request.multiple !== 'boolean' || !Array.isArray(request.extensions) || request.extensions.length > 64) throw new Error('input');
        request.extensions = request.extensions.map(function (ext) {
          if (typeof ext !== 'string' || !/^(?:\*\.)?[a-z0-9]+(?:\.[a-z0-9]+)*$/i.test(ext) || ext.length > 64) throw new Error('input');
          return ext.replace(/^\*\./, '');
        });
        // A CLR-only executable starts far faster than powershell.exe hosting the
        // same engine. Fall back to the PowerShell launcher only if it is missing
        // or produced no usable reply.
        var raw = '';
        var seen = {};
        Object.keys(deps.env).forEach(function (key) {
          if (key.toUpperCase() !== 'MESSBOARD_FILE_DIALOG_REQUEST') seen[key] = deps.env[key];
        });
        seen.MESSBOARD_FILE_DIALOG_REQUEST = JSON.stringify(request);
        if (seen.MESSBOARD_FILE_DIALOG_REQUEST.length > 16000) throw new Error('input');
        var shellOptions = { env: seen, encoding: 'utf8', shell: false, windowsHide: true, timeout: 300000, maxBuffer: 1048576 };
        if (deps.platform === 'darwin') {
          raw = deps.execFileSync('/usr/bin/osascript', ['-l', 'JavaScript', deps.path.join(deps.extensionPath, 'native', 'macos', 'FileDialogs.js')], shellOptions);
        } else {
          var directExe = deps.path.join(deps.extensionPath, 'native', 'windows', 'MessBoard.Dialogs.exe');
          var probeCancel = request.operation === 'probe-cancel';
          var directArgs = [];
          if (request.operation === 'selftest') directArgs.push('-SelfTest');
          if (probeCancel) directArgs.push('-ProbeCancel');
          try { raw = deps.execFileSync(directExe, directArgs, shellOptions); }
          catch (directError) { raw = ''; }
          if (typeof raw !== 'string' || raw.length === 0) {
            var fallbackArgs = ['-NoLogo', '-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass', '-File',
              deps.path.join(deps.extensionPath, 'native', 'windows', 'FileDialogs.ps1')];
            if (request.operation === 'selftest') fallbackArgs.push('-SelfTest');
            if (probeCancel) fallbackArgs.push('-ProbeCancel');
            raw = deps.execFileSync(deps.path.join(deps.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), fallbackArgs, shellOptions);
          }
        }
        if (typeof raw !== 'string' || raw.length > 1048576) throw new Error('protocol');
        var result = JSON.parse(raw);
        if (!result || result.version !== 1 || !Array.isArray(result.paths)) throw new Error('protocol');
        if (result.status === 'canceled' && result.paths.length === 0) return { err: 0, data: empty };
        if (result.status !== 'chosen' || !result.paths.length || result.paths.length > 1024 ||
            (!request.multiple && result.paths.length !== 1)) throw new Error('protocol');
        result.paths.forEach(function (file) {
          if (!fileSystemPath(file)) throw new Error('protocol');
        });
        return { err: 0, data: request.operation === 'save' ? result.paths[0] : result.paths };
      } catch (error) { return { err: 1, data: empty }; }
      finally { busy = false; }
    }
    return {
      showSaveDialogEx: function (title, initial, filters, name, selectedFilter, confirm, prompt) {
        return invoke({ version: 1, operation: 'save', title: title, initial: initial,
          name: name, extensions: filters,
          selectedFilter: selectedFilter, confirm: confirm, prompt: prompt, multiple: false });
      },
      showOpenDialog: function (multiple, chooseDirectory, title, initial, extensions) {
        return invoke({ version: 1, operation: chooseDirectory ? 'folder' : 'open', title: title, initial: initial,
          name: '', extensions: chooseDirectory ? [] : extensions, selectedFilter: '', confirm: '', prompt: '', multiple: multiple });
      }
    };
  }
  return { create: create };
});
