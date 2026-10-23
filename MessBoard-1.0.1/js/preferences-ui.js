/* Preferences view/controller; parent owns the panel markup and menu entry.
 *
 * PreferencesUI.create({preferences, board, applyLabels, toast,
 *                       hasBoard?, document?}) -> {open, close, refresh}.
 * Required: preferences is an AppPreferences instance; board() returns the
 * latest BoardModel or null; applyLabels('labels'|'icons') updates chrome only;
 * toast(message) displays feedback. Optional hasBoard() must reflect the saved
 * board-path gate (without it, an available board.settings permits capture).
 * Optional document enables injected DOM tests; otherwise window.document.
 * create applies stored labels once, refreshes, and binds listeners once.
 * open refreshes each time and focuses the label select; close hides and
 * restores opener focus. refresh updates values/status/capture availability;
 * call it after document switches if the panel remains open. This controller
 * never changes board settings, assets, serialization, or Undo history.
 *
 * Load app-preferences.js and preferences-ui.js before app.js. Required HTML:
 * <section id="preferencesPanel" hidden aria-labelledby="preferencesTitle">
 *   <h2 id="preferencesTitle">MessBoard Preferences</h2>
 *   <p>This installation</p>
 *   <label for="toolbarLabels">Toolbar labels</label>
 *   <select id="toolbarLabels"><option value="labels">Labels</option>
 *     <option value="icons">Icons</option></select>
 *   <h3>New board defaults</h3>
 *   <button type="button" id="useBoardDefaults">Use current board as defaults</button>
 *   <button type="button" id="resetBoardDefaults">Restore defaults</button>
 *   <p id="preferencesStatus" role="status" aria-live="polite"></p>
 *   <button type="button" id="closePreferences">Close</button>
 * </section>
 * Parent owns styling, command/menu integration, toolbar auto-hide inhibition,
 * and canceling incompatible popovers/tools before open(). Keep accessible
 * names/tooltips in both label modes. The panel stops bubbling keydown/keyup
 * without cancelling native controls (except Escape); any parent capture-phase
 * shortcuts or clipboard handlers must separately exempt this panel.
 */
(function (root, factory) {
 'use strict';
 var api = factory(root);
 root.PreferencesUI = api;
 if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this, function (root) {
 'use strict';
 function create(hooks) {
  var doc = hooks.document || root.document, preferences = hooks.preferences;
  var panel = doc.getElementById('preferencesPanel'), labels = doc.getElementById('toolbarLabels');
  var capture = doc.getElementById('useBoardDefaults'), reset = doc.getElementById('resetBoardDefaults');
  var status = doc.getElementById('preferencesStatus'), closeButton = doc.getElementById('closePreferences');
  var noBoard = 'Create or open a board before capturing its appearance defaults.', returnFocus = null;
  function currentBoard() {
   if (hooks.hasBoard && !hooks.hasBoard()) return null;
   var board = hooks.board(); return board && board.settings ? board : null;
  }
  function refresh() {
   var state = preferences.get();
   labels.value = state.toolbarLabels;
   capture.disabled = !currentBoard();
   if (speed) speed.value = String(state.edgePanSpeed);
   if (speedNumber) speedNumber.value = String(state.edgePanSpeed);
   var error = preferences.lastError();
   status.textContent = (error ? error.message + ' ' : '') + (state.newBoardDefaults ?
    'New boards use saved appearance defaults. ' : 'New boards use built-in appearance defaults. ') +
    'Existing boards remain unchanged.' + (capture.disabled ? ' ' + noBoard : '');
  }
  function report(message) { refresh(); var error = preferences.lastError(); hooks.toast(error ? error.message : message); }
  function open() {
   if (panel.hidden) returnFocus = doc.activeElement;
   refresh(); panel.hidden = false; labels.focus();
  }
  function close() {
   var target = returnFocus;
   panel.hidden = true; returnFocus = null;
   if (target && typeof target.focus === 'function') target.focus();
  }
  panel.addEventListener('keydown', function (event) {
   if (panel.hidden) return;
   event.stopPropagation();
   if (event.key === 'Escape') { event.preventDefault(); close(); }
  });
  panel.addEventListener('keyup', function (event) { if (!panel.hidden && event.code !== 'Space') event.stopPropagation(); });
  ['copy', 'cut', 'paste'].forEach(function (type) {
   panel.addEventListener(type, function (event) {
    if (panel.hidden) return;
    event.stopPropagation();
    if (!/^(INPUT|TEXTAREA)$/.test(event.target.tagName) && !event.target.isContentEditable) event.preventDefault();
   });
  });
  closeButton.addEventListener('click', close);
  labels.addEventListener('change', function () {
   preferences.setToolbarLabels(labels.value);
   hooks.applyLabels(preferences.get().toolbarLabels);
   report('Toolbar labels updated for this installation.');
  });
  capture.addEventListener('click', function () {
   var board = currentBoard();
   if (!board) { refresh(); hooks.toast(noBoard); return; }
   preferences.captureDefaults(board.settings);
   report('Current appearance saved as defaults for new boards. Existing boards remain unchanged.');
  });
  reset.addEventListener('click', function () {
   preferences.resetDefaults();
   report('Built-in defaults restored for new boards. Existing boards remain unchanged.');
  });
  var speed = doc.getElementById('edgePanSpeed'), speedNumber = doc.getElementById('edgePanSpeedNumber');
  if (speed && speedNumber) {
   function syncSpeed(value, commit) {
    var n = Number(value);
    if (value === '' || !isFinite(n)) return;
    n = Math.max(0.2, Math.min(6, Math.round(n * 10) / 10));
    speed.value = String(n); speedNumber.value = String(n);
    if (commit) {
     preferences.setEdgePanSpeed(n);
     report('Edge pan speed set to ' + n + ' px per frame.');
    }
   }
   speed.addEventListener('input', function () { syncSpeed(speed.value, false); });
   speed.addEventListener('change', function () { syncSpeed(speed.value, true); });
   speedNumber.addEventListener('change', function () { syncSpeed(speedNumber.value, true); });
   speedNumber.addEventListener('keydown', function (e) { if (e.key === 'Enter') syncSpeed(speedNumber.value, true); });
   if (root.NumericScrub) {
    function scrubHooks(syncTo) {
     return {
      begin: function () { return true; },
      valid: function () { return true; },
      preview: function (value) { syncSpeed(value, false); },
      commit: function (value) { syncSpeed(syncTo(value), true); },
      cancel: function () { syncSpeed(preferences.get().edgePanSpeed, false); }
     };
    }
    root.NumericScrub.bind(speed, scrubHooks(function (v) { return v; }));
    root.NumericScrub.bind(speedNumber, scrubHooks(function (v) { return Math.round(v * 10) / 10; }));
   }
  }
  hooks.applyLabels(preferences.get().toolbarLabels);
  refresh();
  return {open: open, close: close, refresh: refresh};
 }
 return {create: create};
});
