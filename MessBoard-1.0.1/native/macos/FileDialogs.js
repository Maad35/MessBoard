/* Standalone JXA, invoked by /usr/bin/osascript -l JavaScript FileDialogs.js.
   AppKit contract only verified off-macOS. runModal belongs to this helper;
   an out-of-process NSPanel cannot be a sheet owned by an AE NSWindow.
   The synchronous caller gates the CEP panel while this helper is modal.
   No Apple Events, System Events, Finder activation or generated source. */
ObjC.import('AppKit');
ObjC.import('Foundation');

function run(argv) {
  'use strict';
  function reply(status, paths) { return JSON.stringify({ version: 1, status: status, paths: paths }); }
  try {
    var text = ObjC.unwrap($.NSProcessInfo.processInfo.environment.objectForKey('MESSBOARD_FILE_DIALOG_REQUEST'));
    if (typeof text !== 'string' || text.length > 16000) throw new Error('input');
    var r = JSON.parse(text);
    if (!r || r.version !== 1 || ['save', 'open', 'folder'].indexOf(r.operation) < 0) throw new Error('input');
    ['title', 'initial', 'name', 'selectedFilter', 'confirm', 'prompt'].forEach(function (key) {
      if (typeof r[key] !== 'string' || r[key].length > 4096 || /[\x00-\x1f]/.test(r[key])) throw new Error('input');
    });
    if (r.initial && r.initial.charAt(0) !== '/') throw new Error('input');
    if (typeof r.multiple !== 'boolean' || (r.operation === 'save' && r.multiple) || !Array.isArray(r.extensions) || r.extensions.length > 64) throw new Error('input');
    r.extensions.forEach(function (ext) {
      if (typeof ext !== 'string' || ext.length > 64 || !/^[a-z0-9]+(?:\.[a-z0-9]+)*$/i.test(ext)) throw new Error('input');
    });
    var owner = $.NSWorkspace.sharedWorkspace.frontmostApplication;
    var bundle = ObjC.unwrap(owner.bundleIdentifier);
    if (typeof bundle !== 'string' || !/^com\.adobe\.AfterEffects(?:\.|$)/i.test(bundle)) throw new Error('owner');
    var app = $.NSApplication.sharedApplication;
    app.setActivationPolicy(1); // accessory; no Dock icon
    var save = r.operation === 'save';
    var panel = save ? $.NSSavePanel.savePanel : $.NSOpenPanel.openPanel;
    panel.title = r.title;
    if (r.confirm) panel.prompt = r.confirm;
    if (r.prompt) panel.nameFieldLabel = r.prompt;
    if (r.initial && r.initial.charAt(0) === '/') panel.directoryURL = $.NSURL.fileURLWithPath(r.initial);
    panel.canCreateDirectories = save || r.operation === 'folder';
    panel.treatsFilePackagesAsDirectories = false;
    if (save) {
      panel.nameFieldStringValue = r.name;
      panel.extensionHidden = false;
      panel.canSelectHiddenExtension = true;
      panel.allowsOtherFileTypes = false;
    } else {
      panel.allowsMultipleSelection = r.multiple;
      panel.canChooseDirectories = r.operation === 'folder';
      panel.canChooseFiles = r.operation !== 'folder';
      panel.resolvesAliases = true;
    }
    // allowedFileTypes supports filename extensions on older AE-supported macOS.
    if (r.operation !== 'folder' && r.extensions.length) panel.allowedFileTypes = $(r.extensions);
    // Do not steal focus if the user switched to another app while configuring.
    if ($.NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier !== owner.processIdentifier) throw new Error('owner');
    app.activateIgnoringOtherApps(true); // only this dialog helper, never another app
    var response = panel.runModal;
    if (response === $.NSModalResponseCancel) return reply('canceled', []);
    if (response !== $.NSModalResponseOK) throw new Error('native');
    var paths = [];
    if (save) paths.push(ObjC.unwrap(panel.URL.path));
    else {
      var urls = panel.URLs;
      if (urls.count > 1024) throw new Error('size');
      for (var i = 0; i < urls.count; i++) paths.push(ObjC.unwrap(urls.objectAtIndex(i).path));
    }
    if (!paths.length || (!r.multiple && paths.length !== 1)) throw new Error('paths');
    paths.forEach(function (file) {
      if (typeof file !== 'string' || file.charAt(0) !== '/' || file.length > 32767 || /[\x00-\x1f]/.test(file)) throw new Error('paths');
    });
    var result = reply('chosen', paths);
    if (result.length > 250000) throw new Error('size'); // <= 1MB UTF-8
    return result;
  } catch (error) {
    return JSON.stringify({ version: 1, status: 'failed', paths: [], code: 'native' });
  }
}
