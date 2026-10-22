/* AE-style picker. Browser global and CommonJS coexist in CEP mixed context. */
(function (root) {
  'use strict';
  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
  function byte(n) { return Math.round(clamp(Number(n) || 0, 0, 255)); }
  function parseHex(text) {
    if (typeof text !== 'string') return null;
    var hex = text.replace(/^\s+|\s+$/g, '').replace(/^#/, '');
    if (!/^(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) return null;
    if (hex.length === 3) hex = hex.replace(/./g, function (c) { return c + c; });
    var value = parseInt(hex, 16);
    return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
  }
  function rgbToHex(rgb) {
    function part(n) { return ('0' + byte(n).toString(16)).slice(-2); }
    return '#' + part(rgb.r) + part(rgb.g) + part(rgb.b);
  }
  // HSV uses degrees and normalized saturation/value. RGB stays unrounded
  // until display/hex output, preventing drift while editing dark colors.
  function rgbToHsv(rgb, previousHue) {
    var r = clamp(rgb.r, 0, 255) / 255, g = clamp(rgb.g, 0, 255) / 255, b = clamp(rgb.b, 0, 255) / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
    var h = isFinite(previousHue) ? clamp(previousHue, 0, 360) : 0;
    if (delta) {
      if (max === r) h = ((g - b) / delta) % 6;
      else if (max === g) h = (b - r) / delta + 2;
      else h = (r - g) / delta + 4;
      h = (h * 60 + 360) % 360;
      if (h === 0 && previousHue === 360) h = 360;
    }
    return { h: h, s: max ? delta / max : 0, v: max };
  }
  function hsvToRgb(hsv) {
    var h = ((hsv.h % 360) + 360) % 360 / 60;
    var s = clamp(hsv.s, 0, 1), v = clamp(hsv.v, 0, 1);
    var c = v * s, x = c * (1 - Math.abs(h % 2 - 1)), m = v - c;
    var rgb = h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x];
    return { r: (rgb[0] + m) * 255, g: (rgb[1] + m) * 255, b: (rgb[2] + m) * 255 };
  }
  var channels = {
    h: { label: 'Hue', x: 's', y: 'v', max: 360 },
    s: { label: 'Saturation', x: 'h', y: 'v', max: 100 },
    v: { label: 'Brightness', x: 'h', y: 's', max: 100 },
    r: { label: 'Red', x: 'b', y: 'g', max: 255 },
    g: { label: 'Green', x: 'b', y: 'r', max: 255 },
    b: { label: 'Blue', x: 'r', y: 'g', max: 255 }
  };
  function channelMax(key) { return key === 'h' ? 360 : key === 's' || key === 'v' ? 1 : 255; }
  function copyHsv(hsv) { return { h: hsv.h, s: hsv.s, v: hsv.v }; }
  function planeState(mode, hsv, x, y) {
    var spec = channels[mode] || channels.h;
    var values = mode === 'r' || mode === 'g' || mode === 'b' ? hsvToRgb(hsv) : copyHsv(hsv);
    values[spec.x] = clamp(x, 0, 1) * channelMax(spec.x);
    values[spec.y] = (1 - clamp(y, 0, 1)) * channelMax(spec.y);
    return values;
  }
  // Pure sampling helpers: mode, HSV state, normalized x/y -> RGB.
  function planeColor(mode, hsv, x, y) {
    var values = planeState(mode, hsv, x, y);
    return mode === 'r' || mode === 'g' || mode === 'b' ? values : hsvToRgb(values);
  }
  function rampColor(mode, hsv, y) {
    var value = 1 - clamp(y, 0, 1);
    if (mode === 'h') return hsvToRgb({ h: value * 360, s: 1, v: 1 });
    var rgbMode = mode === 'r' || mode === 'g' || mode === 'b';
    var values = rgbMode ? hsvToRgb(hsv) : copyHsv(hsv);
    values[mode] = value * channelMax(mode);
    return rgbMode ? values : hsvToRgb(values);
  }
  function create(hooks) {
    hooks = hooks || {};
    var doc = root.document, win = doc.defaultView || root.window;
    function get(id) { return doc.getElementById(id); }
    var pop = get('colorPopover'), plane = get('colorSV'), slider = get('colorHue');
    var preview = get('colorPreview'), hexInput = get('colorHex');
    var fields = {}, displayed = {}, mode = 'h', hsv = { h: 0, s: 0, v: 0 }, original = '#000000';
    var opened = false, anchor = null, focusBefore = null, change = null, finished = null;
    var drag = null, planeSignature = '', rampSignature = '';
    var pendingPick = null, suppressSampleClick = false, pickButton = get('colorPick');
    var numericHandles = [], session = 0;
    function cancelNumeric() { numericHandles.forEach(function (handle) { handle.cancel(); }); }
    var planeCanvas = get('colorPlane'), rampCanvas = get('colorRamp');
    var radios = pop.querySelectorAll('input[name="colorChannel"]');
    Object.keys(channels).forEach(function (key) { fields[key] = get('color' + key.toUpperCase()); });
    function current() { return rgbToHex(hsvToRgb(hsv)); }
    function emit(value) { if (change) change(value); }
    function rgbMode() { return mode === 'r' || mode === 'g' || mode === 'b'; }
    function channelValues() { return rgbMode() ? hsvToRgb(hsv) : hsv; }
    function coordinates() {
      var spec = channels[mode], values = channelValues();
      return { x: values[spec.x] / channelMax(spec.x), y: 1 - values[spec.y] / channelMax(spec.y), t: 1 - values[mode] / channelMax(mode) };
    }
    function paint(canvas, sample) {
      var ctx = canvas.getContext('2d');
      if (!ctx) return;
      var width = canvas.width, height = canvas.height, image = ctx.createImageData(width, height), data = image.data;
      for (var y = 0; y < height; y++) {
        for (var x = 0; x < width; x++) {
          var rgb = sample(x / (width - 1), y / (height - 1)), i = (y * width + x) * 4;
          data[i] = byte(rgb.r); data[i + 1] = byte(rgb.g); data[i + 2] = byte(rgb.b); data[i + 3] = 255;
        }
      }
      ctx.putImageData(image, 0, 0);
    }
    function paintSurfaces() {
      var values = channelValues(), spec = channels[mode];
      // Round only cache keys to ignore floating-point HSV/RGB round-trip noise.
      function stable(value) { return Math.round(value * 1e8); }
      var ps = mode + ':' + stable(values[mode]);
      var rs = mode === 'h' ? 'h' : mode + ':' + stable(values[spec.x]) + ':' + stable(values[spec.y]);
      if (ps !== planeSignature) {
        paint(planeCanvas, function (x, y) { return planeColor(mode, hsv, x, y); }); planeSignature = ps;
      }
      if (rs !== rampSignature) {
        paint(rampCanvas, function (x, y) { return rampColor(mode, hsv, y); }); rampSignature = rs;
      }
    }
    function render(skip) {
      var rgb = hsvToRgb(hsv), color = rgbToHex(rgb);
      Object.keys(fields).forEach(function (key) {
        var value = key === 'h' ? hsv.h : key === 's' || key === 'v' ? hsv[key] * 100 : rgb[key];
        if (fields[key] !== skip) fields[key].value = displayed[key] = String(Math.round(value));
      });
      if (hexInput !== skip) hexInput.value = displayed.hex = color.slice(1).toUpperCase();
      get('colorNew').style.backgroundColor = color;
      get('colorOld').style.backgroundColor = original;
      var spec = channels[mode], pos = coordinates();
      get('colorCursor').style.left = (pos.x * 100) + '%';
      get('colorCursor').style.top = (pos.y * 100) + '%';
      get('colorHueCursor').style.top = (pos.t * 100) + '%';
      plane.setAttribute('aria-label', channels[spec.x].label + ' and ' + channels[spec.y].label + ' color plane');
      slider.setAttribute('aria-label', spec.label);
      slider.setAttribute('aria-valuemin', '0');
      slider.setAttribute('aria-valuemax', String(spec.max));
      slider.setAttribute('aria-valuenow', String(Math.round((1 - pos.t) * spec.max)));
      slider.setAttribute('aria-orientation', 'vertical');
      paintSurfaces();
    }
    function update(skip) { render(skip); if (preview.checked) emit(current()); }
    function setColor(hex) {
      var rgb = parseHex(hex);
      if (!opened || !rgb) return false;
      hsv = rgbToHsv(rgb, hsv.h); update(); return true;
    }
    function close(accept, restoreFocus) {
      if (!opened) return;
      cancelNumeric(); session++;
      var result = accept ? current() : original, old = original, onChange = change, onClose = finished;
      var focus = anchor || focusBefore;
      opened = false; drag = null; pop.hidden = true; change = finished = null;
      cancelPick();
      if (restoreFocus !== false && focus && focus.focus) focus.focus();
      if (onChange) onChange(result);
      if (onClose) onClose(!!accept, result, old);
    }
    function position() {
      if (!opened) return;
      var rect = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { left: 8, top: 8, bottom: 8 };
      var size = pop.getBoundingClientRect(), width = win.innerWidth || doc.documentElement.clientWidth;
      var height = win.innerHeight || doc.documentElement.clientHeight;
      var top = rect.bottom + 6;
      if (top + size.height > height - 8) top = rect.top - size.height - 6;
      pop.style.left = clamp(rect.left, 8, Math.max(8, width - size.width - 8)) + 'px';
      pop.style.top = clamp(top, 8, Math.max(8, height - size.height - 8)) + 'px';
    }
    function open(color, opener, onChange, onClose) {
      if (opened) close(false, false);
      var rgb = parseHex(color);
      if (!rgb) return false;
      anchor = opener; focusBefore = doc.activeElement;
      original = rgbToHex(rgb); hsv = rgbToHsv(rgb); change = onChange; finished = onClose;
      opened = true; pop.hidden = false; preview.checked = true; mode = 'h';
      Array.prototype.forEach.call(radios, function (radio) { radio.checked = radio.value === mode; });
      render(); position(); hexInput.focus(); return true;
    }
    function readField(key, input, normalize) {
      if (!opened) return;
      var raw = input.value.replace(/^\s+|\s+$/g, ''), rgb;
      // Merely tabbing through a rounded display must not quantize HSV state.
      if (normalize && raw === displayed[key]) { render(); return; }
      if (key === 'hex') {
        rgb = parseHex(raw);
        if (rgb) { hsv = rgbToHsv(rgb, hsv.h); update(normalize ? null : input); }
        else if (normalize) render();
        return;
      }
      if (!raw || !isFinite(Number(raw))) { if (normalize) render(); return; }
      var value = clamp(Number(raw), 0, channels[key].max);
      if (key === 'h' || key === 's' || key === 'v') hsv[key] = key === 'h' ? value : value / 100;
      else { rgb = hsvToRgb(hsv); rgb[key] = value; hsv = rgbToHsv(rgb, hsv.h); }
      update(normalize ? null : input);
    }
    function bindField(key, input) {
      input.addEventListener('input', function () { if (!input.__numericScrubbing) readField(key, input, false); });
      input.addEventListener('change', function () { if (!input.__numericScrubbing) readField(key, input, true); });
      input.addEventListener('blur', function () { if (!input.__numericScrubbing) readField(key, input, true); });
      if (key === 'hex' || !root.NumericScrub) return;
      var saved = null;
      function validScrub() { return !!saved && saved.session === session && opened && !pop.hidden && !pendingPick; }
      numericHandles.push(root.NumericScrub.bind(input, {
        begin: function () {
          if (!opened || pop.hidden || pendingPick) return false;
          var text = {}, display = {};
          Object.keys(fields).forEach(function (name) { text[name] = fields[name].value; display[name] = displayed[name]; });
          saved = { hsv: copyHsv(hsv), session: session, text: text, display: display, hex: hexInput.value, hexDisplay: displayed.hex }; return true;
        },
        valid: function () { return saved ? validScrub() : opened && !pop.hidden && !pendingPick; },
        preview: function () { if (validScrub()) readField(key, input, false); },
        commit: function () { if (!validScrub()) return; saved = null; render(); },
        cancel: function () {
          var state = saved, valid = validScrub(); saved = null;
          if (!valid) return;
          hsv = state.hsv; update();
          Object.keys(fields).forEach(function (name) { fields[name].value = state.text[name]; displayed[name] = state.display[name]; });
          hexInput.value = state.hex; displayed.hex = state.hexDisplay;
        }
      }));
    }
    function applyPoint(surface, x, y) {
      if (surface === plane) {
        var values = planeState(mode, hsv, x, y);
        hsv = rgbMode() ? rgbToHsv(values, hsv.h) : values;
      } else if (rgbMode()) {
        var rgb = hsvToRgb(hsv); rgb[mode] = (1 - clamp(y, 0, 1)) * 255; hsv = rgbToHsv(rgb, hsv.h);
      } else hsv[mode] = (1 - clamp(y, 0, 1)) * channelMax(mode);
      update();
    }
    function consume(event) { event.preventDefault(); event.stopImmediatePropagation(); }
    function pointer(event) {
      var rect = drag.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      applyPoint(drag, clamp((event.clientX - rect.left) / rect.width, 0, 1), clamp((event.clientY - rect.top) / rect.height, 0, 1));
    }
    [plane, slider].forEach(function (surface) {
      surface.addEventListener('mousedown', function (event) {
        if (!opened || event.button !== 0) return;
        consume(event); surface.focus(); drag = surface; pointer(event);
      });
    });
    win.addEventListener('mousemove', function (event) { if (opened && drag) { consume(event); pointer(event); } }, true);
    win.addEventListener('mouseup', function (event) { if (opened && drag) { consume(event); pointer(event); drag = null; } }, true);
    win.addEventListener('blur', function () { drag = null; });
    Array.prototype.forEach.call(radios, function (radio) {
      radio.addEventListener('change', function () {
        if (!opened || !radio.checked || !channels[radio.value]) return;
        mode = radio.value; drag = null;
        Array.prototype.forEach.call(radios, function (other) { other.checked = other.value === mode; });
        render();
      });
    });
    win.addEventListener('resize', position);
    win.addEventListener('mousedown', function (event) {
      if (pendingPick) { suppressSampleClick = true; consume(event); return; }
      suppressSampleClick = false;
      if (!opened || pop.contains(event.target) || (anchor && anchor.contains && anchor.contains(event.target))) return;
      close(false, false);
    }, true);
    win.addEventListener('mouseup', function (event) {
      if (pendingPick || suppressSampleClick) consume(event);
    }, true);
    win.addEventListener('click', function (event) {
      if (pendingPick || suppressSampleClick) { suppressSampleClick = false; consume(event); }
    }, true);
    function toast(error) { if (hooks.toast) hooks.toast(String(error && error.message || error)); }
    function cancelPick() {
      var task = pendingPick;
      pendingPick = null; suppressSampleClick = false; pickButton.disabled = false; pickButton.removeAttribute('aria-busy');
      doc.body.classList.remove('sampling-color');
      if (task && task.cancel) { try { task.cancel(); } catch (error) { toast(error); } }
    }
    function startPick() {
      if (!opened || pendingPick) return;
      if (!hooks.pick) { toast('System color sampling is not available.'); return; }
      drag = null;
      var task = { cancel: null, completed: false };
      pendingPick = task; suppressSampleClick = true;
      doc.body.classList.add('sampling-color');
      pickButton.disabled = true; pickButton.setAttribute('aria-busy', 'true');
      function complete(error, hex) {
        if (pendingPick !== task || !opened) return;
        pendingPick = null; task.completed = true;
        doc.body.classList.remove('sampling-color');
        pickButton.disabled = false; pickButton.removeAttribute('aria-busy');
        if (error) { toast(error); return; }
        if (hex != null && !setColor(hex)) toast('The sampled color was invalid.');
      }
      try {
        var cleanup = hooks.pick(complete);
        if (typeof cleanup === 'function') {
          if (pendingPick === task) task.cancel = cleanup;
          else if (!task.completed) cleanup();
        }
      } catch (error) { complete(error); }
    }
    pickButton.addEventListener('click', startPick);
    // Tab may leave this nonmodal popover, but its draft must not follow focus.
    win.addEventListener('focusin', function (event) {
      if (opened && !pop.contains(event.target)) close(false, false);
    }, true);
    ['copy', 'cut', 'paste'].forEach(function (type) {
      win.addEventListener(type, function (event) {
        if (!opened) return;
        event.stopImmediatePropagation();
        var target = event.target;
        var editable = pop.contains(target) && target.tagName === 'INPUT' && (target.type === 'text' || target.type === 'number');
        if (!editable) event.preventDefault();
      }, true);
    });
    function keyboard(event) {
      if (!opened) return;
      // Propagation is blocked, not default input editing or native control keys.
      event.stopImmediatePropagation();
      if (event.type !== 'keydown' || event.isComposing || event.keyCode === 229) return;
      var key = event.key, target = event.target || doc.activeElement;
      if (key === 'Escape' || key === 'Esc') { event.preventDefault(); close(false); return; }
      if (key === 'Enter' && target.tagName !== 'BUTTON' && target.type !== 'button' && target.type !== 'submit') {
        event.preventDefault(); close(true); return;
      }
      if (target !== plane && target !== slider) return;
      if (key !== 'ArrowUp' && key !== 'ArrowDown' && key !== 'ArrowLeft' && key !== 'ArrowRight') return;
      event.preventDefault();
      var pos = coordinates(), spec = channels[mode], step = event.shiftKey ? 10 : 1;
      if (target === slider) {
        pos.t += (key === 'ArrowUp' || key === 'ArrowRight' ? -step : step) / spec.max;
        applyPoint(slider, 0, pos.t);
      } else {
        if (key === 'ArrowLeft' || key === 'ArrowRight') pos.x += (key === 'ArrowLeft' ? -step : step) / channels[spec.x].max;
        else pos.y += (key === 'ArrowUp' ? -step : step) / channels[spec.y].max;
        applyPoint(plane, pos.x, pos.y);
      }
    }
    ['keydown', 'keyup', 'keypress'].forEach(function (type) { win.addEventListener(type, keyboard, true); });
    Object.keys(fields).forEach(function (key) { bindField(key, fields[key]); });
    bindField('hex', hexInput);
    get('colorDone').addEventListener('click', function () { close(true); });
    get('colorCancel').addEventListener('click', function () { close(false); });
    preview.addEventListener('change', function () { if (opened) emit(preview.checked ? current() : original); });
    return { open: open, close: close, isOpen: function () { return opened; }, setColor: setColor };
  }
  var api = { create: create, parseHex: parseHex, rgbToHex: rgbToHex, rgbToHsv: rgbToHsv, hsvToRgb: hsvToRgb, planeColor: planeColor, rampColor: rampColor };
  root.ColorPicker = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
}(typeof globalThis !== 'undefined' ? globalThis : this));
