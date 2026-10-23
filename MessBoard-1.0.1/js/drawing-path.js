/* Shared source-coordinate paths. Preparation is opt-in at stroke finalization;
 * never rewrite saved strokes while rendering. Browser global + CommonJS. */
(function (root, factory) {
    var value = factory();
    root.DrawingPath = value;
    if (typeof module === 'object' && module.exports) module.exports = value;
}(this, function () {
    'use strict';
    function finite(value) { return typeof value === 'number' && isFinite(value); }
    function copyPoints(points, dedupe) {
        var out = [], previous;
        if (!Array.isArray(points)) return out;
        for (var i = 0; i < points.length; i++) {
            var p = points[i];
            if (!Array.isArray(p) || !finite(p[0]) || !finite(p[1])) continue;
            if (dedupe && previous && p[0] === previous[0] && p[1] === previous[1]) continue;
            previous = [p[0], p[1]]; out.push(previous);
        }
        return out;
    }
    function nearSegment(p, a, b, tolerance2) {
        var dx = b[0] - a[0], dy = b[1] - a[1], length2 = dx * dx + dy * dy;
        if (!finite(length2)) return false; // Huge finite inputs: retain, do not guess.
        var t = length2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length2)) : 0;
        var x = p[0] - a[0] - t * dx, y = p[1] - a[1] - t * dy;
        return x * x + y * y <= tolerance2;
    }
    function prepare(points, tolerance) {
        var source = copyPoints(points, true);
        tolerance = finite(tolerance) && tolerance >= 0 ? tolerance : 0.5;
        if (source.length < 3 || tolerance === 0) return source;
        var out = [source[0]], anchor = 0, tolerance2 = tolerance * tolerance;
        // Fixed 32-sample window bounds work to O(n), not recursive RDP/O(n²).
        // Check every skipped point, so local removals cannot accumulate drift.
        while (anchor < source.length - 1) {
            var best = anchor + 1, limit = Math.min(source.length - 1, anchor + 32);
            for (var end = anchor + 2; end <= limit; end++) {
                var before = source[end - 2], corner = source[end - 1], next = source[end];
                var dot = (corner[0] - before[0]) * (next[0] - corner[0]) + (corner[1] - before[1]) * (next[1] - corner[1]);
                if (dot <= 0) break; // Retain right angles and reversals.
                var acceptable = true;
                for (var j = anchor + 1; j < end; j++) {
                    if (!nearSegment(source[j], source[anchor], next, tolerance2)) { acceptable = false; break; }
                }
                if (!acceptable) break;
                best = end;
            }
            out.push(source[best]); anchor = best;
        }
        return out;
    }
    function commands(stroke) {
        stroke = stroke || {};
        var points = copyPoints(stroke.points, false), out = [];
        if (!points.length) return out;
        out.push({type: 'M', x: points[0][0], y: points[0][1]});
        var smooth = stroke.tool === 'pen' && stroke.smoothing === 1;
        for (var i = 1; i < points.length; i++) {
            var p = points[i];
            if (smooth && i < points.length - 1) {
                var next = points[i + 1];
                out.push({type: 'Q', cx: p[0], cy: p[1], x: p[0] / 2 + next[0] / 2, y: p[1] / 2 + next[1] / 2});
            } else out.push({type: 'L', x: p[0], y: p[1]});
        }
        return out;
    }
    function svg(stroke) {
        return commands(stroke).map(function (c) {
            return c.type === 'Q' ? 'Q ' + c.cx + ' ' + c.cy + ' ' + c.x + ' ' + c.y : c.type + ' ' + c.x + ' ' + c.y;
        }).join(' ');
    }
    // Append geometry only; callers own beginPath, caps, joins, stroke and dot fill.
    function trace(ctx, stroke) {
        commands(stroke).forEach(function (c) {
            if (c.type === 'M') ctx.moveTo(c.x, c.y);
            else if (c.type === 'Q') ctx.quadraticCurveTo(c.cx, c.cy, c.x, c.y);
            else ctx.lineTo(c.x, c.y);
        });
    }
    return {prepare: prepare, commands: commands, svg: svg, trace: trace};
}));
