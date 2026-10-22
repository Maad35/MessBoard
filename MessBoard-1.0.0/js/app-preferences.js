/* Local application preferences; never edits or migrates a board.
 *
 * AppPreferences.create({storage: adapter}) accepts synchronous Storage-style
 * getItem(key)/setItem(key, text). Omit storage to use window.localStorage;
 * explicitly pass null for memory-only use. Reads never write or repair data.
 * Key: messboard.preferences.v1. Payload/get():
 *   {version: 1, toolbarLabels: 'labels'|'icons', newBoardDefaults: null|settings}
 * get(), newBoardSettings(), lastError() return detached snapshots.
 * setToolbarLabels(mode), captureDefaults(board.settings), resetDefaults()
 * return true only when persisted; false means validation/storage failure.
 * Valid changes remain usable in memory after write failure. Invalid arguments
 * leave prior state untouched. lastError() is null or {code, message}; a
 * successful write clears it. Codes: invalid-toolbar-labels,
 * invalid-board-defaults, corrupt-storage, storage-unavailable,
 * storage-write-failed. Always surface errors to the user.
 *
 * Captured settings whitelist: background/gridColor/accentColor as #RGB or
 * #RRGGBB (normalized to lowercase six-digit hex); gridType lines/dots/none;
 * numeric gridSize 8..256; numeric gridOpacity 0..1; boolean autoHideToolbar.
 * All seven fields are required. Other fields are discarded, never serialized.
 * Null defaults mean use the existing BoardModel defaults, not copied values.
 * ONLY the parent's explicit New command should construct:
 *   new BoardModel({settings: preferences.newBoardSettings()})
 * Never apply these settings on startup, Open, recovery, or Save As, and never
 * call board.setSettings() to apply defaults (that creates false edit history).
 */
(function (root, factory) {
 'use strict';
 var api = factory(root);
 root.AppPreferences = api;
 if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this, function (root) {
 'use strict';
 var KEY = 'messboard.preferences.v1';
 function clone(value) { return JSON.parse(JSON.stringify(value)); }
 function record(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
 function hex(value) {
  if (typeof value !== 'string' || !/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)) return null;
  value = value.toLowerCase();
  return value.length === 4 ? '#' + value[1] + value[1] + value[2] + value[2] + value[3] + value[3] : value;
 }
 function numberIn(value, min, max) { return typeof value === 'number' && isFinite(value) && value >= min && value <= max; }
 function boardDefaults(value) {
  if (!record(value)) return null;
  var background = hex(value.background), gridColor = hex(value.gridColor), accentColor = hex(value.accentColor);
  var panelColor = value.panelColor === undefined ? '#252525' : hex(value.panelColor);
  var textColor = value.textColor === undefined ? '#e6e6e6' : hex(value.textColor);
  if (!panelColor || !textColor) return null;
  if (!background || !gridColor || !accentColor || ['lines', 'dots', 'none'].indexOf(value.gridType) < 0 ||
      !numberIn(value.gridSize, 8, 256) || !numberIn(value.gridOpacity, 0, 1) || typeof value.autoHideToolbar !== 'boolean') return null;
  if (typeof value.thumbnailsEnabled !== 'boolean' || [512, 1024, 2048].indexOf(value.thumbnailSize) < 0 ||
      !numberIn(value.thumbnailSwapZoom, 0.25, 4)) return null;
  return {background: background, gridType: value.gridType, gridSize: value.gridSize, gridColor: gridColor,
   gridOpacity: value.gridOpacity, autoHideToolbar: value.autoHideToolbar, accentColor: accentColor,
   panelColor: panelColor, textColor: textColor,
   thumbnailsEnabled: value.thumbnailsEnabled, thumbnailSize: value.thumbnailSize, thumbnailSwapZoom: value.thumbnailSwapZoom};
 }
 function create(options) {
  options = options || {};
  var state = {version: 1, toolbarLabels: 'labels', newBoardDefaults: null, edgePanSpeed: 2.5}, error = null;
  var storage = null, raw = null;
  try {
   storage = Object.prototype.hasOwnProperty.call(options, 'storage') ? options.storage : root.localStorage;
   if (!storage || typeof storage.getItem !== 'function') throw new Error('Storage unavailable');
   raw = storage.getItem(KEY);
  } catch (ignoredRead) {
   error = {code: 'storage-unavailable', message: 'Local preference storage is unavailable. Changes apply to this session only.'};
  }
  if (raw !== null) {
   try {
    var saved = JSON.parse(raw), defaults = saved && saved.newBoardDefaults === null ? null : boardDefaults(saved && saved.newBoardDefaults);
    var speed = record(saved) && numberIn(saved.edgePanSpeed, 0.1, 10) ? Math.round(saved.edgePanSpeed * 10) / 10 : 2.5;
    if (!record(saved) || saved.version !== 1 || (saved.toolbarLabels !== 'labels' && saved.toolbarLabels !== 'icons' && saved.toolbarLabels !== 'auto') ||
        (saved.newBoardDefaults !== null && !defaults)) throw new Error('Invalid preferences');
    state = {version: 1, toolbarLabels: saved.toolbarLabels === 'auto' ? 'labels' : saved.toolbarLabels, newBoardDefaults: defaults, edgePanSpeed: speed};
   } catch (ignored) { error = {code: 'corrupt-storage', message: 'Saved preferences are invalid or unsupported. Built-in preferences are in use.'}; }
  }
  function persist() {
   try {
    if (!storage || typeof storage.setItem !== 'function') {
     error = {code: 'storage-unavailable', message: 'Local preference storage is unavailable. Changes apply to this session only.'}; return false;
    }
    storage.setItem(KEY, JSON.stringify(state)); error = null; return true;
   }
   catch (ignoredWrite) {
    error = {code: 'storage-write-failed', message: 'Preferences could not be saved. Changes apply to this session only.'}; return false;
   }
  }
  function setToolbarLabels(mode) {
   if (mode !== 'labels' && mode !== 'icons') {
    error = {code: 'invalid-toolbar-labels', message: 'Toolbar labels must be Labels or Icons.'}; return false;
   }
   state.toolbarLabels = mode; return persist();
  }
  function setEdgePanSpeed(value) {
   if (!numberIn(value, 0.1, 10)) {
    error = {code: 'invalid-edge-pan-speed', message: 'Edge pan speed must be a number between 0.1 and 10.'}; return false;
   }
   state.edgePanSpeed = Math.round(value * 10) / 10; return persist();
  }
  return {
   get: function () { return clone(state); },
   setToolbarLabels: setToolbarLabels,
   setEdgePanSpeed: setEdgePanSpeed,
   captureDefaults: function (settings) {
    var value = boardDefaults(settings);
    if (!value) { error = {code: 'invalid-board-defaults', message: 'Current board appearance contains invalid settings. Defaults were not changed.'}; return false; }
    state.newBoardDefaults = value; return persist();
   },
   resetDefaults: function () { state.newBoardDefaults = null; return persist(); },
   newBoardSettings: function () { return clone(state.newBoardDefaults); },
   lastError: function () { return clone(error); }
  };
 }
 return {create: create};
});
