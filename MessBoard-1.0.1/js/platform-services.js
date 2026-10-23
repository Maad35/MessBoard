/* Browser global and CommonJS export are published independently for CEP mixed context. */
(function (root, factory) {
  var value = factory();
  root.PlatformServices = value;
  if (typeof module === 'object' && module.exports) module.exports = value;
})(this, function () {
  'use strict';

  // Only Windows and macOS are supported hosts. An unknown platform keeps
  // Windows-style chords so shortcuts stay usable, but callers can branch on it.
  function detect(host) {
    if (!host || typeof host !== 'object') return 'unsupported';
    var platform = typeof host.platform === 'string' ? host.platform.toLowerCase() : '';
    // An explicit Node platform is authoritative; navigator strings are a fallback.
    if (platform === 'darwin' || platform === 'win32') return platform;
    if (platform) return 'unsupported';
    var nav = host.navigator;
    if (nav && typeof nav === 'object') {
      var id = typeof nav.platform === 'string' && nav.platform ? nav.platform
        : typeof nav.userAgent === 'string' ? nav.userAgent : '';
      if (/mac/i.test(id)) return 'darwin';
      if (/win/i.test(id)) return 'win32';
    }
    return 'unsupported';
  }

  function create(options) {
    var platform = detect(options || {});
    var mac = platform === 'darwin';

    function primary(event) {
      if (!event || typeof event !== 'object') return null;
      var meta = !!event.metaKey, ctrl = !!event.ctrlKey;
      // Both modifiers together is ambiguous; refuse rather than guess.
      if (meta && ctrl) return false;
      return mac ? meta : ctrl;
    }

    return {
      platform: platform,
      isMac: mac,
      // Command chords (Save, Undo, Select all). Alt/Option is excluded so
      // AltGr text entry on Windows and Option characters on macOS stay native.
      command: function (event) {
        var pressed = primary(event);
        if (pressed !== true) return false;
        return !event.altKey;
      },
      // Transform snapping. Alt remains free because nearby snapping combines
      // with grid snapping, and macOS Control-drag stays a secondary click.
      snap: function (event) {
        return primary(event) === true;
      },
      label: function (text) {
        if (typeof text !== 'string' || !text) return '';
        if (!mac) return text;
        return text.replace(/\bCtrl\b/g, 'Cmd').replace(/\bAlt\b/g, 'Option');
      }
    };
  }

  return { detect: detect, create: create };
});
