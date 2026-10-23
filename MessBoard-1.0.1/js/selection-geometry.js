(function(root, factory) {
    // CEP can expose Node globals in a browser; prefer the preloaded script.
    var geometry = root.Geometry;
    if (!geometry && typeof module === 'object' && module.exports) geometry = require('./geometry.js');
    var value = factory(geometry);
    root.SelectionGeometry = value;
    if (typeof module === 'object' && module.exports) module.exports = value;
})(this, function(Geometry) {
    'use strict';

    function clone(value) {
        if (!value || typeof value !== 'object') return value;
        var copy = Array.isArray(value) ? [] : {};
        for (var key in value) {
            if (Object.prototype.hasOwnProperty.call(value, key)) copy[key] = clone(value[key]);
        }
        return copy;
    }

    function deepFreeze(value) {
        if (!value || typeof value !== 'object') return value;
        for (var key in value) {
            if (Object.prototype.hasOwnProperty.call(value, key)) deepFreeze(value[key]);
        }
        return Object.freeze(value);
    }

    // Deep, frozen copy of ALL supplied items; filtering/transactions belong to callers.
    // Bounds are the world-space union of rotated rectangles. Empty bounds are null.
    function snapshot(items) {
        var copies = clone(items);
        var bounds = Geometry.sceneBounds(copies);
        return deepFreeze({
            items: copies,
            bounds: bounds,
            center: bounds ? {x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2} : {x: 0, y: 0}
        });
    }

    // dir: n/ne/e/se/s/sw/w/nw; dx/dy: total world delta since this snapshot.
    // Returns fresh {id,x,y,width,height,rotation,fontSize?} patches, never mutations.
    // Corners use the larger active scale; sides use ONLY their active axis.
    // Numeric fontSize scales proportionally, and stays unchanged on free resizing.
    function resize(saved, dir, dx, dy, shift, ctrl) {
        if (!saved.items.length) return [];
        var item = saved.items[0];
        var hx = dir.indexOf('e') >= 0 ? 1 : dir.indexOf('w') >= 0 ? -1 : 0;
        var hy = dir.indexOf('s') >= 0 ? 1 : dir.indexOf('n') >= 0 ? -1 : 0;
        if (saved.items.length > 1) {
            // A uniform world transform preserves rotated members without shearing.
            var bounds = saved.bounds;
            var groupWidth = bounds.maxX - bounds.minX;
            var groupHeight = bounds.maxY - bounds.minY;
            var groupSX = 1 + hx * dx / groupWidth;
            var groupSY = 1 + hy * dy / groupHeight;
            var groupScale = hx && hy ? Math.max(groupSX, groupSY) : hx ? groupSX : groupSY;
            var minimumScale = 0;
            for (var index = 0; index < saved.items.length; index++) {
                minimumScale = Math.max(minimumScale, 40 / saved.items[index].width, 30 / saved.items[index].height);
            }
            groupScale = ctrl ? snapScale(groupSX, groupSY, hx, hy, groupWidth, groupHeight, minimumScale) : Math.max(groupScale, minimumScale);
            var anchorX = saved.center.x - hx * groupWidth / 2;
            var anchorY = saved.center.y - hy * groupHeight / 2;
            return saved.items.map(function(member) {
                var width = member.width * groupScale;
                var height = member.height * groupScale;
                var patch = {
                    id: member.id,
                    x: anchorX + (member.x + member.width / 2 - anchorX) * groupScale - width / 2,
                    y: anchorY + (member.y + member.height / 2 - anchorY) * groupScale - height / 2,
                    width: width,
                    height: height,
                    rotation: Number(member.rotation) || 0
                };
                if (typeof member.fontSize === 'number') patch.fontSize = member.fontSize * groupScale;
                return patch;
            });
        }
        var rotation = (Number(item.rotation) || 0) * Math.PI / 180;
        // Project pointer motion onto the single item's unrotated axes.
        var c = Math.cos(rotation), s = Math.sin(rotation);
        var localX = dx * c + dy * s;
        var localY = -dx * s + dy * c;
        var width = item.width + hx * localX;
        var height = item.height + hy * localY;
        var proportional = shift || (item.type === 'link' && item.mediaType === 'video');
        if (proportional) {
            var sx = width / item.width;
            var sy = height / item.height;
            var scale = hx && hy ? Math.max(sx, sy) : hx ? sx : sy;
            var minimum = Math.max(40 / item.width, 30 / item.height);
            scale = ctrl ? snapScale(sx, sy, hx, hy, item.width, item.height, minimum) : Math.max(scale, minimum);
            width = item.width * scale;
            height = item.height * scale;
        } else {
            width = ctrl && hx ? snapSize(width, 40) : Math.max(40, width);
            height = ctrl && hy ? snapSize(height, 30) : Math.max(30, height);
        }
        var moveX = hx * (width - item.width) / 2;
        var moveY = hy * (height - item.height) / 2;
        // Move the center by the rotated half-size change, keeping the opposite
        // corner (or edge midpoint for a side handle) stationary in world space.
        var patch = {
            id: item.id,
            x: item.x + item.width / 2 + moveX * c - moveY * s - width / 2,
            y: item.y + item.height / 2 + moveX * s + moveY * c - height / 2,
            width: width,
            height: height,
            rotation: Number(item.rotation) || 0
        };
        if (typeof item.fontSize === 'number') patch.fontSize = item.fontSize * (proportional ? scale : 1);
        return [patch];
    }

    function snapSize(value, minimum) {
        return Math.max(Math.ceil(minimum / 32), Math.round(value / 32)) * 32;
    }

    // Snap the dimension driving the existing proportional scale; do not round
    // both dimensions independently (that would distort images/rotated groups).
    function snapScale(sx, sy, hx, hy, width, height, minimum) {
        var useX = hx && (!hy || sx >= sy - 1e-12);
        var size = useX ? width : height, scale = useX ? sx : sy;
        return snapSize(size * scale, size * minimum) / size;
    }

    // Total angle from the original snapshot, not an incremental angle. The pivot
    // stays saved.center even though the resulting world AABB can have a new center.
    function rotate(saved, deltaDegrees) {
        var radians = deltaDegrees * Math.PI / 180;
        var c = Math.cos(radians), s = Math.sin(radians);
        return saved.items.map(function(item) {
            var dx = item.x + item.width / 2 - saved.center.x;
            var dy = item.y + item.height / 2 - saved.center.y;
            var patch = {
                id: item.id,
                x: saved.center.x + dx * c - dy * s - item.width / 2,
                y: saved.center.y + dx * s + dy * c - item.height / 2,
                width: item.width,
                height: item.height,
                rotation: (Number(item.rotation) || 0) + deltaDegrees
            };
            if (typeof item.fontSize === 'number') patch.fontSize = item.fontSize;
            return patch;
        });
    }

    function rotationDelta(saved, degrees, ctrl, shift) {
        if (ctrl) {
            var base = saved.items.length === 1 ? Number(saved.items[0].rotation) || 0 : 0;
            return Geometry.snapAngle(base + degrees, 10) - base;
        }
        return shift ? Geometry.snapAngle(degrees, 45) : degrees;
    }
    return {snapshot: snapshot, resize: resize, rotate: rotate, rotationDelta: rotationDelta};
});
