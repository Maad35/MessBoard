(function (root) {
  'use strict';
  var active = null, clickToken = null, releaseShield = null;

  function bodyClass(enabled) {
    var body = root && root.document && root.document.body;
    if (!body) return;
    body.className = body.className.replace(/(?:^|\s)numeric-scrubbing(?=\s|$)/g, '').trim();
    if (enabled) body.className += ' numeric-scrubbing';
  }

  function number(value) {
    if (typeof value !== 'number' && typeof value !== 'string') return NaN;
    if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(String(value).trim())) return NaN;
    return isFinite(Number(value)) ? Number(value) : NaN;
  }
  function attribute(input, name, fallback) {
    var value = input.getAttribute(name);
    return value === null || value === '' ? fallback : number(value);
  }
  function valid(g) {
    return !g.input.disabled && !g.input.readOnly && (!g.options.valid || g.options.valid() !== false);
  }

  function consume(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
  function rollback(gesture) {
    gesture.input.value = gesture.original;
    if (gesture.options.cancel) gesture.options.cancel();
  }
  function finish(commit) {
    var gesture = active;
    if (!gesture) return;
    active = null;
    try {
      if (gesture.started) {
        if (commit && !valid(gesture)) commit = false;
        if (commit && gesture.options.commit) gesture.options.commit(gesture.value);
        else if (!commit) rollback(gesture);
      }
    } catch (error) {
      if (commit && gesture.started) {
        try { rollback(gesture); } catch (ignored) { /* Preserve original failure. */ }
      }
      throw error;
    } finally {
      if (gesture.started && !gesture.released) releaseShield = gesture.input;
      gesture.input.__numericScrubbing = false;
      bodyClass(false);
    }
  }
  function move(event) {
    try { update(event); } catch (error) {
      try { finish(false); } catch (ignored) { /* Preserve original failure. */ }
      throw error;
    }
  }
  function update(event) {
    var g = active, value;
    if (g && !valid(g)) { if (g.started) consume(event); finish(false); return; }
    if (g && event.buttons === 0) { if (g.started) consume(event); finish(false); return; }
    if (g && !isFinite(event.clientX)) { finish(false); return; }
    if (!g || (!g.started && Math.abs(event.clientX - g.x) < 3)) return;
    consume(event);
    if (!g.started) {
      g.started = true;
      g.input.__numericScrubbing = true;
      bodyClass(true);
      if (g.options.begin && g.options.begin() === false) {
        g.started = false;
        finish(false);
        return;
      }
      if (active !== g) return;
      if (!valid(g)) { finish(false); return; }
    }
    g.raw += (event.clientX - g.lastX) * g.sensitivity * (event.altKey ? 0.1 : event.shiftKey ? 10 : 1);
    if (!isFinite(g.raw)) { finish(false); return; }
    g.lastX = event.clientX;
    g.raw = Math.max(g.min, Math.min(g.max, g.raw));
    value = g.step ? g.base + Math.round((g.raw - g.base) / g.step) * g.step : g.raw;
    value = Math.max(g.min, Math.min(g.max, Number(value.toPrecision(15))));
    if (!isFinite(value)) { finish(false); return; }
    g.value = value;
    g.input.value = String(value);
    if (g.options.preview) g.options.preview(value);
  }
  function up(event) {
    var token, input = active ? active.input : releaseShield;
    if (!input) return;
    if (releaseShield || active.started) {
      consume(event);
      token = {input:input, target:event.target};
      clickToken = token;
      root.setTimeout(function () { if (clickToken === token) clickToken = null; }, 0);
    }
    else event.stopPropagation();
    releaseShield = null;
    if (active) active.released = true;
    finish(true);
  }
  function bind(input, options) {
    var destroyed = false;
    options = options || {};
    input.className += ' numeric-scrub';
    function down(event) {
      var value = number(input.value), any = input.getAttribute('step') === 'any';
      var step = any ? 0 : attribute(input, 'step', 1);
      var min = attribute(input, 'min', -Infinity), max = attribute(input, 'max', Infinity);
      var sensitivity = options.sensitivity === undefined ? (step || 1) / 2 : number(options.sensitivity);
      if (options.step !== undefined) step = number(options.step);
      if (event.button !== 0 || !isFinite(event.clientX) || !isFinite(value) ||
          (!(step > 0) && !(any && options.step === undefined)) || !isFinite(step) || !(sensitivity > 0) || !isFinite(sensitivity) ||
          isNaN(min) || isNaN(max) || min > max || !valid({input:input, options:options})) return;
      event.stopPropagation();
      active = {input:input, options:options, x:event.clientX,
        original:input.value,
        raw:value, lastX:event.clientX, value:value, step:step, sensitivity:sensitivity,
        min:min, max:max, base:isFinite(min) ? min : 0, started:false};
    }
    input.addEventListener('mousedown', down, false);
    function cancel() { if (!destroyed && active && active.input === input) finish(false); }
    return {cancel:cancel, destroy:function () {
      if (destroyed) return;
      try { cancel(); } finally {
        destroyed = true;
        input.removeEventListener('mousedown', down, false);
        input.className = input.className.replace(/(?:^|\s)numeric-scrub(?=\s|$)/g, '').trim();
      }
    }};
  }
  if (root && root.addEventListener) {
    root.addEventListener('mousedown', function () { clickToken = null; finish(false); releaseShield = null; }, true);
    root.addEventListener('click', function (event) {
      var token = clickToken;
      clickToken = null;
      if (token && event.detail !== 0 && (event.target === token.input || event.target === token.target)) consume(event);
    }, true);
    root.addEventListener('mousemove', move, true);
    root.addEventListener('mouseup', up, true);
    root.addEventListener('change', function (event) {
      if (event.target && event.target.__numericScrubbing) event.stopImmediatePropagation();
    }, true);
    root.addEventListener('selectstart', function (event) {
      if (active && active.started) consume(event);
    }, true);
    root.addEventListener('keydown', function (event) {
      if (active && (event.key === 'Escape' || event.keyCode === 27)) {
        consume(event);
        finish(false);
      } else if (active && ['Shift','Alt','Control','Meta'].indexOf(event.key) < 0) {
        consume(event);
      }
    }, true);
    root.addEventListener('blur', function (event) {
      if (active && (event.target === root || event.target === active.input)) {
        if (active.started && event.target === active.input) event.stopImmediatePropagation();
        finish(false);
      }
    }, true);
  }
  var api = {bind:bind, cancelAll:function () { finish(false); }, isActive:function (input) {
    return !!(active && active.started && (!input || input === active.input));
  }};
  if (root) root.NumericScrub = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
}(typeof window !== 'undefined' ? window : null));