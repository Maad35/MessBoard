/* Detached Canvas2D board export, independent of app.js and all viewport UI.
 * render(items, {scale:0.5|1|2|4, padding:24, background:null, loadImage?})
 *   -> Promise<{canvas:HTMLCanvasElement, warnings:string[]}>.
 * layout() and wrapText() are pure helpers. No model mutation or file writes.
 * Browser: preload Geometry, NoteStyle, DrawingPath and PathCodec; Node: guarded helper requires.
 * Default link cards are offline; a custom loader may provide a decoded thumbnail.
 */
(function (root, factory) {
    var geometry = root.Geometry, noteStyle = root.NoteStyle, drawingPath = root.DrawingPath;
    if (!geometry && typeof module === 'object' && module.exports && typeof require === 'function') geometry = require('./geometry.js');
    if (!noteStyle && typeof require === 'function') noteStyle = require('./note-style.js');
    if (!drawingPath && typeof require === 'function') drawingPath = require('./drawing-path.js');
    var drawingRenderer = root.DrawingRenderer, drawingGeometry = root.DrawingGeometry;
    if (!drawingRenderer && typeof require === 'function') drawingRenderer = require('./drawing-renderer.js');
    if (!drawingGeometry && typeof require === 'function') drawingGeometry = require('./drawing-geometry.js');
    var value = factory(root, geometry, noteStyle, drawingPath, drawingRenderer, drawingGeometry);
    root.BoardExport = value;
    if (typeof module === 'object' && module.exports) module.exports = value;
}(this, function (root, Geometry, NoteStyle, DrawingPath, DrawingRenderer, DrawingGeometry) {
    'use strict';

    function clone(value) { return JSON.parse(JSON.stringify(value)); }

    function finite(value) { return typeof value === 'number' && isFinite(value); }
    function positive(value, fallback) { return finite(value) && value > 0 ? value : fallback; }
    function union(a, b) {
        return {minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY),
            maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY)};
    }
    function paintedBounds(item) {
        var bounds = Geometry.itemBounds(item), pad = positive(item.borderWidth, 0) / 2 * Math.SQRT2;
        if (item.type === 'drawing') {
            var sx = item.width / positive(item.sourceWidth, item.width);
            var sy = item.height / positive(item.sourceHeight, item.height);
            var local = {minX: 0, minY: 0, maxX: item.width, maxY: item.height};
            (item.strokes || []).forEach(function (stroke) {
                if (stroke.appearanceVersion === 2) {
                    var painted = DrawingGeometry.bounds(stroke);
                    local.minX = Math.min(local.minX, painted.minX * sx); local.maxX = Math.max(local.maxX, painted.maxX * sx);
                    local.minY = Math.min(local.minY, painted.minY * sy); local.maxY = Math.max(local.maxY, painted.maxY * sy);
                    return;
                }
                var width = positive(stroke.width, 1);
                // Round joins/caps and arrowheads fit this conservative world margin.
                pad = Math.max(pad, (stroke.style === 'arrow' ? Math.max(10, width * 4) : width / 2) * Math.max(sx, sy));
                var points = stroke.points || [];
                if (stroke.tool === 'rect') points = [[stroke.x, stroke.y], [stroke.x + stroke.w, stroke.y + stroke.h]];
                if (stroke.tool === 'ellipse') points = [[stroke.cx - stroke.rx, stroke.cy - stroke.ry], [stroke.cx + stroke.rx, stroke.cy + stroke.ry]];
                points.forEach(function (point) {
                    if (!finite(point[0]) || !finite(point[1])) throw new Error('Invalid drawing coordinates');
                    local.minX = Math.min(local.minX, point[0] * sx); local.maxX = Math.max(local.maxX, point[0] * sx);
                    local.minY = Math.min(local.minY, point[1] * sy); local.maxY = Math.max(local.maxY, point[1] * sy);
                });
            });
            var dx = (local.minX + local.maxX - item.width) / 2;
            var dy = (local.minY + local.maxY - item.height) / 2;
            var angle = (item.rotation || 0) * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
            var w = local.maxX - local.minX, h = local.maxY - local.minY;
            bounds = union(bounds, Geometry.itemBounds({x: item.x + item.width / 2 + c * dx - s * dy - w / 2,
                y: item.y + item.height / 2 + s * dx + c * dy - h / 2, width: w, height: h, rotation: item.rotation}));
        }
        return {minX: bounds.minX - pad, minY: bounds.minY - pad, maxX: bounds.maxX + pad, maxY: bounds.maxY + pad};
    }

    // Pure layout; validates size before render allocates a canvas or starts I/O.
    function layout(items, options) {
        options = options || {};
        var scale = options.scale === undefined ? 1 : options.scale;
        var padding = options.padding === undefined ? 24 : options.padding;
        if (scale !== 0.5 && scale !== 1 && scale !== 2 && scale !== 4) throw new Error('Export scale must be 0.5, 1, 2 or 4');
        if (!finite(padding) || padding < 0) throw new Error('Invalid export padding');
        if (options.background !== undefined && options.background !== null && typeof options.background !== 'string') throw new Error('Invalid export background');
        if (!Array.isArray(items)) throw new Error('Invalid board items');
        // Validate before JSON cloning: JSON would silently convert NaN/Infinity to null.
        items.forEach(function (item) {
            if (item && item.hidden) return;
            if (!item || !finite(item.x) || !finite(item.y) || !finite(item.width) || !finite(item.height) ||
                    item.width <= 0 || item.height <= 0 || (item.rotation !== undefined && !finite(item.rotation))) throw new Error('Invalid item geometry');
        });
        var copies = clone(items).filter(function (item) { return !item.hidden; });
        if (!copies.length) throw new Error('No visible items to export (empty board)');
        var ordered = copies.map(function (item, index) { return {item: item, index: index}; });
        ordered.sort(function (a, b) { return (Number(a.item.z) || 0) - (Number(b.item.z) || 0) || a.index - b.index; });
        copies = ordered.map(function (entry) { return entry.item; });
        var bounds = paintedBounds(copies[0]);
        copies.slice(1).forEach(function (item) { bounds = union(bounds, paintedBounds(item)); });
        var width = Math.ceil((bounds.maxX - bounds.minX + padding * 2) * scale);
        var height = Math.ceil((bounds.maxY - bounds.minY + padding * 2) * scale);
        if (!finite(width) || !finite(height) || width <= 0 || height <= 0 || width > 16384 || height > 16384 || width * height > 64000000) {
            throw new Error('PNG export limit: 16384 px per edge and 64000000 pixels');
        }
        return {items: copies, bounds: bounds, scale: scale, padding: padding, width: width, height: height};
    }

    // Simple pre-wrap layout; no DOM probing, HTML, foreignObject or live styles.
    function wrapText(text, width, measure, maxLines) {
        var lines = [], limit = maxLines === undefined ? Infinity : maxLines;
        if (!(width > 0) || limit <= 0) return lines;
        var paragraphs = String(text === undefined ? '' : text).replace(/\r\n?/g, '\n').split('\n');
        for (var p = 0; p < paragraphs.length && lines.length < limit; p++) {
            var tokens = paragraphs[p].match(/\s+|\S+/g) || [], line = '';
            for (var t = 0; t < tokens.length && lines.length < limit; t++) {
                var token = tokens[t];
                if (line && measure(line + token) > width) { lines.push(line); line = ''; }
                // Preserve code points when a long URL/word must break anywhere.
                var chars = token.match(/[\uD800-\uDBFF][\uDC00-\uDFFF]|[\s\S]/g) || [];
                for (var k = 0; k < chars.length && lines.length < limit; k++) {
                    if (line && measure(line + chars[k]) > width) { lines.push(line); line = ''; }
                    line += chars[k];
                }
            }
            if (lines.length < limit) lines.push(line);
        }
        return lines;
    }

    function clipRect(ctx, x, y, w, h) { ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); }

    // Normalized note presentation for painting: falls back per-field so legacy
    // notes without the newer style props keep their previous look.
    function noteStyleHelpers(item) {
        var s = NoteStyle.style(item);
        var weight = s.bold ? '700 ' : '';
        var style = s.italic ? 'italic ' : '';
        return {
            font: weight + style + NoteStyle.font(item),
            lineHeight: s.lineHeight, padding: s.padding, cornerRadius: s.cornerRadius,
            align: s.align, valign: s.valign, underline: s.underline
        };
    }

    function paintNote(ctx, item) {
        var noteStyle = noteStyleHelpers(item);
        clipRect(ctx, 0, 0, item.width, item.height);
        if (item.background !== null) {
            ctx.fillStyle = item.background || '#292a25'; ctx.fillRect(0, 0, item.width, item.height);
        }
        var pad = noteStyle.padding;
        var size = positive(item.fontSize, 18), lineHeight = size * noteStyle.lineHeight;
        // Vertical (tategaki): one upright character per line, columns right-to-left.
        if (item.textOrientation === 'vertical') {
            ctx.font = noteStyle.font; ctx.fillStyle = item.color || '#eee8da'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
            var paragraphs = String(item.text === undefined ? '' : item.text).replace(/\r\n?/g, '\n').split('\n');
            var columnWidth = lineHeight;
            var columns = Math.max(1, Math.floor((item.width - pad * 2) / columnWidth));
            var perColumn = Math.max(1, Math.floor((item.height - pad * 2) / lineHeight));
            var chunks = [];
            for (var p = 0; p < paragraphs.length && chunks.length < columns; p++) {
                var chars = paragraphs[p].match(/[\uD800-\uDBFF][\uDC00-\uDFFF]|[\s\S]/g) || [''];
                for (var start = 0; start < chars.length && chunks.length < columns; start += perColumn) chunks.push(chars.slice(start, start + perColumn));
            }
            var blockWidth = chunks.length * columnWidth;
            var align = noteStyle.align === 'justify' ? 'right' : noteStyle.align;
            var blockRight = align === 'left' ? pad + blockWidth : align === 'center' ? (item.width + blockWidth) / 2 : item.width - pad;
            for (var col = 0; col < chunks.length; col++) {
                var chunk = chunks[col], used = chunk.length * lineHeight;
                var y = pad;
                if (noteStyle.valign === 'middle') y = Math.max(pad, (item.height - used) / 2);
                else if (noteStyle.valign === 'bottom') y = Math.max(pad, item.height - used - pad);
                var x = blockRight - columnWidth * (col + 0.5);
                for (var c = 0; c < chunk.length; c++) ctx.fillText(chunk[c], x, y + c * lineHeight);
            }
            return;
        }
        var radius = noteStyle.cornerRadius;
        var align = /^(left|center|right|justify)$/.test(item.align) ? item.align : 'left';
        ctx.font = noteStyle.font;
        ctx.fillStyle = item.color || '#eee8da'; ctx.textAlign = align === 'justify' ? 'left' : align; ctx.textBaseline = 'top';
        var x = align === 'center' ? item.width / 2 : align === 'right' ? item.width - pad : pad;
        var textWidth = item.width - pad * 2;
        var lines = wrapText(item.text, textWidth, function (text) { return ctx.measureText(text).width; }, Math.ceil(item.height / lineHeight));
        // Vertical alignment: compute total text block height, offset from top/center/bottom.
        var totalHeight = lines.length * lineHeight;
        var y = pad;
        if (noteStyle.valign === 'middle') y = Math.max(pad, (item.height - totalHeight) / 2);
        else if (noteStyle.valign === 'bottom') y = Math.max(pad, item.height - totalHeight - pad);
        for (var i = 0; i < lines.length; i++) ctx.fillText(lines[i], x, y + (lineHeight - size) / 2 + i * lineHeight);
    }

    function paintDrawing(ctx, item) {
        ctx.save();
        ctx.scale(item.width / positive(item.sourceWidth, item.width), item.height / positive(item.sourceHeight, item.height));
        try {
            (item.strokes || []).forEach(function (stroke) { DrawingRenderer.paint(ctx, stroke); });
        } finally { ctx.restore(); }
    }

    function paintPlaceholder(ctx, width, height, label) {
        ctx.save(); clipRect(ctx, 0, 0, width, height);
        ctx.fillStyle = '#281c19'; ctx.fillRect(0, 0, width, height);
        ctx.strokeStyle = '#925b4b'; ctx.lineWidth = 2; ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(width, height); ctx.moveTo(width, 0); ctx.lineTo(0, height); ctx.stroke();
        ctx.font = '12px "Segoe UI", sans-serif'; ctx.textBaseline = 'top'; ctx.textAlign = 'center'; ctx.fillStyle = '#f0b3a5';
        var lines = wrapText(label, Math.max(1, width - 16), function (text) { return ctx.measureText(text).width; }, Math.ceil(height / 16));
        for (var i = 0; i < lines.length; i++) ctx.fillText(lines[i], width / 2, 8 + i * 16);
        ctx.restore();
    }

    function paintImage(ctx, item, image) {
        var crop = item.crop || {}, left = Number(crop.left) || 0, top = Number(crop.top) || 0;
        var right = Number(crop.right) || 0, bottom = Number(crop.bottom) || 0;
        if (left < 0 || top < 0 || right < 0 || bottom < 0 || left + right >= 1 || top + bottom >= 1) throw new Error('Invalid image crop');
        ctx.save();
        if (item.flipH || item.flipV) {
            // Mirror around the item's own center so the frame stays in place.
            ctx.translate(item.width / 2, item.height / 2);
            ctx.scale(item.flipH ? -1 : 1, item.flipV ? -1 : 1);
            ctx.translate(-item.width / 2, -item.height / 2);
        }
        ctx.drawImage(image, left * image.naturalWidth, top * image.naturalHeight,
            (1 - left - right) * image.naturalWidth, (1 - top - bottom) * image.naturalHeight, 0, 0, item.width, item.height);
        ctx.restore();
    }

    function paintLink(ctx, item, image) {
        ctx.save(); clipRect(ctx, 0, 0, item.width, item.height);
        try {
        ctx.fillStyle = '#171816'; ctx.fillRect(0, 0, item.width, item.height);
        var top = Math.min(30, item.height), footer = Math.min(42, Math.max(0, item.height - top));
        var mediaHeight = item.height - top - footer;
        if (image && mediaHeight > 0) ctx.drawImage(image, 0, 0, image.naturalWidth, image.naturalHeight, 0, top, item.width, mediaHeight);
        ctx.fillStyle = '#292a25'; ctx.fillRect(0, 0, item.width, top);
        ctx.font = '600 12px "Segoe UI", sans-serif'; ctx.fillStyle = '#eee8da'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        var title = wrapText(item.title || item.url || 'Link', item.width - 18, function (text) { return ctx.measureText(text).width; }, 1);
        if (title.length) ctx.fillText(title[0], 9, 7);
        ctx.font = '12px "Segoe UI", sans-serif'; ctx.fillStyle = '#aaa497';
        var lines = wrapText(item.url || '', item.width - 18, function (text) { return ctx.measureText(text).width; }, Math.ceil(footer / 16));
        for (var i = 0; i < lines.length; i++) ctx.fillText(lines[i], 9, item.height - footer + 5 + i * 16);
        } finally { ctx.restore(); }
    }

    function paintItem(ctx, item, image, warnings) {
        ctx.save();
        ctx.globalAlpha = item.opacity === undefined ? 1 : item.opacity;
        ctx.translate(item.x + item.width / 2, item.y + item.height / 2);
        ctx.rotate((item.rotation || 0) * Math.PI / 180);
        ctx.translate(-item.width / 2, -item.height / 2);
        if (item.type === 'note') paintNote(ctx, item);
        else if (item.type === 'drawing') paintDrawing(ctx, item);
        else if (item.type === 'link') {
            try { paintLink(ctx, item, image); }
            catch (linkError) { warnings.push('Item ' + item.id + ': thumbnail unavailable (' + linkError.message + ')'); paintLink(ctx, item, null); }
        } else if (item.type === 'image') {
            if (!image) paintPlaceholder(ctx, item.width, item.height, 'Image unavailable');
            else {
                try { paintImage(ctx, item, image); }
                catch (imageError) { warnings.push('Item ' + item.id + ': image unavailable (' + imageError.message + ')'); paintPlaceholder(ctx, item.width, item.height, 'Image unavailable'); }
            }
        } else {
            warnings.push('Item ' + item.id + ': unsupported type ' + item.type);
            paintPlaceholder(ctx, item.width, item.height, 'Unsupported item');
        }
        if (positive(item.borderWidth, 0)) {
            ctx.lineWidth = item.borderWidth; ctx.strokeStyle = item.borderColor || '#3b3b34'; ctx.setLineDash([]);
            ctx.strokeRect(0, 0, item.width, item.height);
        }
        ctx.restore();
    }

    function defaultLoadImage(item) {
        // Link exports are offline cards. Only an explicit loader opts into thumbnails.
        if (item.type === 'link') return Promise.resolve(null);
        return new Promise(function (resolve, reject) {
            var source = item.path;
            if (!source || typeof source !== 'string') { resolve(null); return; }
            if (!/^(?:https?:|data:|blob:|file:)/i.test(source)) {
                if (!root.PathCodec) throw new Error('PathCodec is required for local images');
                source = root.PathCodec.toFileUrl(source);
            }
            var image = new root.Image(), timer;
            function finish(error) {
                clearTimeout(timer); image.onload = null; image.onerror = null;
                if (error) reject(error); else resolve(image);
            }
            image.onload = function () { finish(null); };
            image.onerror = function () { finish(new Error('Image could not be decoded')); };
            timer = setTimeout(function () { finish(new Error('Image load timed out')); }, 15000);
            try {
                if (/^(?:https?:)?\/\//i.test(source)) image.crossOrigin = 'anonymous';
                image.src = source;
            } catch (error) { finish(error); }
        });
    }

    // Snapshot synchronously, even though all validation/paint failures reject a Promise.
    function render(items, options) {
        var plan, background, loader;
        try {
            options = options || {};
            plan = layout(items, options);
            background = options.background === undefined ? null : options.background;
            if (options.loadImage !== undefined && typeof options.loadImage !== 'function') throw new Error('Invalid loadImage option');
            loader = options.loadImage || defaultLoadImage;
        } catch (error) { return Promise.reject(error); }
        return Promise.all(plan.items.map(function (item) {
            if (item.type !== 'image' && item.type !== 'link') return {image: null};
            return Promise.resolve().then(function () { return loader(clone(item)); }).then(function (image) {
                if (image && positive(image.naturalWidth, 0) && positive(image.naturalHeight, 0)) return {image: image};
                if (item.type === 'image') throw new Error('Image missing or undecoded');
                if (image) throw new Error('Thumbnail is not a decoded image');
                return {image: null};
            }).catch(function (error) { return {image: null, warning: 'Item ' + item.id + ': image unavailable (' + (error && error.message || String(error)) + ')'}; });
        })).then(function (loaded) {
            var canvas = root.document.createElement('canvas');
            canvas.width = plan.width; canvas.height = plan.height;
            var ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('Canvas2D is unavailable');
            if (background !== null) { ctx.fillStyle = background; ctx.fillRect(0, 0, canvas.width, canvas.height); }
            ctx.scale(plan.scale, plan.scale);
            ctx.translate(plan.padding - plan.bounds.minX, plan.padding - plan.bounds.minY);
            var warnings = [];
            plan.items.forEach(function (item, index) {
                if (loaded[index].warning) warnings.push(loaded[index].warning);
                paintItem(ctx, item, loaded[index].image, warnings);
            });
            // Proactively surface SecurityError/taint and encoder failures to the caller.
            var png = canvas.toDataURL('image/png');
            if (!/^data:image\/png[;,]/.test(png)) throw new Error('PNG encoder failed');
            return {canvas: canvas, warnings: warnings};
        });
    }

    return {render: render, layout: layout, wrapText: wrapText};
}));
