var MessBoardHost = MessBoardHost || {};
MessBoardHost.result = function(ok, data, error) { return JSON.stringify({ok:ok, data:data || null, error:error || null}); };
MessBoardHost.sessionToken = function() {
    var project = app.project, root = project ? project.rootFolder : null;
    var sameSession = false;
    // AE invalidates native handles when a project closes. Even === / !==
    // can throw for the cached project or root; treat that as a new session.
    try { sameSession = !!MessBoardHost._token && MessBoardHost._project === project && MessBoardHost._root === root; }
    catch (invalidPreviousProject) { sameSession = false; }
    if (!sameSession) {
        MessBoardHost._project = project; MessBoardHost._root = root;
        MessBoardHost._token = String(new Date().getTime()) + "-" + String(Math.random()).slice(2);
    }
    return MessBoardHost._token;
};
MessBoardHost.getContext = function() {
    try {
        var project = app.project, file = project ? project.file : null;
        var comp = project ? project.activeItem : null, selected = [], info = null, i;
        if (comp && comp instanceof CompItem) {
            info = {id:comp.id, name:comp.name, width:comp.width, height:comp.height,
                time:comp.time, frameDuration:comp.frameDuration, duration:comp.duration,
                workAreaStart:comp.workAreaStart, workAreaDuration:comp.workAreaDuration};
            for (i = 0; i < comp.selectedLayers.length; i++) {
                var layer = comp.selectedLayers[i];
                selected.push({id:typeof layer.id === "number" ? layer.id : null, index:layer.index, name:layer.name});
            }
        }
        return MessBoardHost.result(true, {projectPath:file ? file.fsName : "", projectName:file ? file.name : "Untitled",
            comp:info, selectedLayers:selected, sessionToken:MessBoardHost.sessionToken()}, null);
    } catch (e) { return MessBoardHost.result(false, null, e.toString()); }
};
(function(api) {
    function fail(message) { throw new Error(message); }
    function number(value, name, positive) {
        if (typeof value !== "number" || !isFinite(value) || Math.abs(value) > 1000000000 || (positive && value <= 0)) fail("Invalid " + name + ".");
        return value;
    }
    function list(value) { return Object.prototype.toString.call(value) === "[object Array]"; }
    function object(value) { return value && typeof value === "object" && !list(value); }
    function parse(payload) {
        if (typeof payload !== "string") fail("Expected a JSON string.");
        var value = JSON.parse(payload);
        if (!object(value)) fail("Expected a request object.");
        return value;
    }
    function fileFor(path) {
        if (typeof path !== "string" || !path || /[\x00-\x1f]/.test(path) || !(/^[A-Za-z]:[\\\/]/.test(path) || /^\//.test(path) || /^\\\\/.test(path))) fail("Expected an absolute file path.");
        return new File(path);
    }
    function samePath(a, b) {
        var x = a.replace(/\\/g, "/"), y = b.replace(/\\/g, "/");
        if (/^[A-Za-z]:\//.test(x) || /^\/\//.test(x)) return x.toLowerCase() === y.toLowerCase();
        return x === y;
    }
    function waitForOutput(path) {
        // saveFrameToPng can return before its async disk write completes. Keep
        // solos isolated until positive size is unchanged across two 50ms polls.
        var previous = -1, stable = 0, elapsed = 0;
        while (elapsed <= 15000) {
            var fresh = new File(path), size = fresh.exists ? fresh.length : 0;
            if (size > 0 && size === previous) stable++; else stable = 0;
            if (stable >= 2) return fresh;
            previous = size;
            if (elapsed === 15000) break;
            $.sleep(50); elapsed += 50;
        }
        fail("Timed out waiting for completed capture output: " + path);
    }
    function target(request, required) {
        var project = app.project, comp = project ? project.activeItem : null;
        if (request.sessionToken !== undefined && request.sessionToken !== api.sessionToken()) fail("Project session changed; refresh context first.");
        if (!(comp && comp instanceof CompItem)) fail("Open an active composition first.");
        if (required || request.projectPath !== undefined) {
            if (typeof request.projectPath !== "string") fail("Project identity is required.");
            var current = project.file ? project.file.fsName : "";
            if ((request.projectPath === "") !== (current === "") || (current && !samePath(fileFor(request.projectPath).fsName, current))) fail("Project changed; refresh context first.");
        }
        if (required || request.compId !== undefined) {
            number(request.compId, "composition ID", true);
            if (request.compId !== comp.id) fail("Active composition changed; refresh context first.");
        }
        number(comp.width, "composition width", true); number(comp.height, "composition height", true);
        return comp;
    }
    function preflight(request) {
        if (request.mode !== "actual" && request.mode !== "fit") fail("Invalid import mode.");
        if (!list(request.items) || !request.items.length) fail("Select at least one image.");
        var ids = {}, i, j, keys = ["x", "y", "width", "height", "rotation", "z"];
        for (i = 0; i < request.items.length; i++) {
            var item = request.items[i];
            if (!object(item) || typeof item.id !== "string" || !item.id || ids["$" + item.id]) fail("Invalid or duplicate reference ID.");
            ids["$" + item.id] = true;
            if (item.type !== undefined && item.type !== "image" && item.type !== "note" && item.type !== "link") fail("Only image, note and local video references can be imported.");
            for (j = 0; j < keys.length; j++) number(item[keys[j]], keys[j], keys[j] === "width" || keys[j] === "height");
            if (item.crop !== null && item.crop !== undefined) {
                if (!object(item.crop)) fail("Invalid crop.");
                var c = item.crop, edges = ["left", "top", "right", "bottom"];
                for (j = 0; j < edges.length; j++) if (number(c[edges[j]], "crop " + edges[j]) < 0) fail("Crop cannot be negative.");
                if (1 - c.left - c.right < 0.001 - 0.000000000001 || 1 - c.top - c.bottom < 0.001 - 0.000000000001) fail("Crop must retain at least 0.001 of each source dimension.");
            }
            if (item.type === "note") {
                if (typeof item.text !== "string") fail("Note text must be a string.");
                continue;
            }
            var file = fileFor(item.path);
            if (!/\.(png|jpe?g|tiff?|bmp|gif|psd|psb|exr|tga|hdr|dpx|cin|mp4|m4v|webm|ogg)$/i.test(file.name)) fail("Unsupported reference type.");
            if (!file.exists) fail("Reference file is missing: " + file.fsName);
            var options = new ImportOptions(file);
            if (!options.canImportAs(ImportAsType.FOOTAGE)) fail("After Effects cannot import this image as footage.");
            options.importAs = ImportAsType.FOOTAGE; options.sequence = false;
            item.options = options;
        }
    }
    function existingFootage(file) {
        var project = app.project, i, item;
        if (!project) return null;
        for (i = 1; i <= project.numItems; i++) {
            item = project.item(i);
            if (item && item.file && samePath(item.file.fsName, file.fsName)) return item;
        }
        return null;
    }
    function importBatch(payload, nativeSize) {
        var began = false, ownedLayers = [], ownedFootage = [], error = null, cleanup = [];
        try {
            var request = parse(payload), comp = target(request, true), entries = [], i;
            // Rotated board geometry is defined in square pixels. Source PAR is
            // compensated below; non-square target comps are rejected explicitly.
            if (comp.pixelAspect !== undefined && comp.pixelAspect !== 1) fail("Import requires a square-pixel composition.");
            preflight(request);
            var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (i = 0; i < request.items.length; i++) {
                var item = request.items[i], angle = item.rotation * Math.PI / 180;
                var cx = item.x + item.width / 2, cy = item.y + item.height / 2;
                var rx = (Math.abs(Math.cos(angle)) * item.width + Math.abs(Math.sin(angle)) * item.height) / 2;
                var ry = (Math.abs(Math.sin(angle)) * item.width + Math.abs(Math.cos(angle)) * item.height) / 2;
                minX = Math.min(minX, cx - rx); maxX = Math.max(maxX, cx + rx);
                minY = Math.min(minY, cy - ry); maxY = Math.max(maxY, cy + ry);
                entries.push({item:item, order:i, cx:cx, cy:cy});
            }
            entries.sort(function(a, b) { return a.item.z - b.item.z || a.order - b.order; });
            var centerX = (minX + maxX) / 2, centerY = (minY + maxY) / 2, imports = [];
            // 5% margin on each edge; fit may enlarge as well as shrink.
            var factor = request.mode === "fit" ? Math.min(comp.width * 0.9 / (maxX - minX), comp.height * 0.9 / (maxY - minY)) : 1;
            app.beginUndoGroup("MessBoard - Import References"); began = true;
            var replaceMode = !!request.replace;
            var selectedTextLayers = [];
            var selectedFootageLayers = [];
            var anchorLayer = null;
            try {
                var selLayers = comp.selectedLayers;
                for (var sl = 0; sl < selLayers.length; sl++) {
                    if (!anchorLayer || selLayers[sl].index < anchorLayer.index) anchorLayer = selLayers[sl];
                    if (replaceMode) {
                        if (selLayers[sl] instanceof TextLayer) selectedTextLayers.push(selLayers[sl]);
                        else if (selLayers[sl] instanceof AVLayer) selectedFootageLayers.push(selLayers[sl]);
                    }
                }
            } catch (se) {}
            function placeNewLayer(newLayer) {
                if (!anchorLayer) return;
                try {
                    newLayer.moveBefore(anchorLayer);
                    newLayer.inPoint = anchorLayer.inPoint;
                    newLayer.outPoint = anchorLayer.outPoint;
                } catch (pe) {}
            }
            var textReplaced = false;
            var footageReplaced = {};
            var footageItemCount = 0;
            for (var fcount = 0; fcount < entries.length; fcount++) if (entries[fcount].item.type !== "note") footageItemCount++;
            var singleFootageReplaced = false;
            for (i = 0; i < entries.length; i++) {
                var entry = entries[i]; item = entry.item;
                var layer;
                if (item.type === "note") {
                    if (replaceMode && selectedTextLayers.length && !textReplaced) {
                        textReplaced = true;
                        var firstReplaced = null;
                        for (var ti = 0; ti < selectedTextLayers.length; ti++) {
                            var updLayer = selectedTextLayers[ti];
                            try {
                                var uTextProp = updLayer.property("ADBE Text Properties").property("ADBE Text Document");
                                var uTextDoc = uTextProp.value;
                                uTextDoc.text = item.text || "";
                                uTextProp.setValue(uTextDoc);
                            } catch (te) { fail("Could not update text layer: " + te.toString()); }
                            if (!firstReplaced) firstReplaced = updLayer;
                        }
                        imports.push({id:item.id, layerId:firstReplaced.id, layerName:firstReplaced.name, replaced:true, replacedCount:selectedTextLayers.length});
                    } else {
                        layer = comp.layers.addText("");
                        ownedLayers.push(layer);
                        var tTransform = layer.property("ADBE Transform Group");
                        tTransform.property("ADBE Position").setValue([comp.width / 2 + (entry.cx - centerX) * factor, comp.height / 2 + (entry.cy - centerY) * factor]);
                        tTransform.property("ADBE Rotate Z").setValue(item.rotation);
                        tTransform.property("ADBE Opacity").setValue(item.opacity * 100);
                        try {
                            var newTextProp = layer.property("ADBE Text Properties").property("ADBE Text Document");
                            var newTextDoc = newTextProp.value;
                            newTextDoc.text = item.text || "";
                            newTextProp.setValue(newTextDoc);
                        } catch (nte) { fail("Could not set text layer content: " + nte.toString()); }
                        placeNewLayer(layer);
                        imports.push({id:item.id, layerId:layer.id, layerName:layer.name});
                    }
                    continue;
                }
                var footage = existingFootage(item.options.file);
                if (!footage) { footage = app.project.importFile(item.options); ownedFootage.push(footage); }
                number(footage.width, "source width", true); number(footage.height, "source height", true);
                if (replaceMode && selectedFootageLayers.length && footageItemCount === 1 && !singleFootageReplaced) {
                    singleFootageReplaced = true;
                    var replacedTotal = 0, firstFootageLayer = null;
                    for (var sf = 0; sf < selectedFootageLayers.length; sf++) {
                        var sLayer = selectedFootageLayers[sf];
                        try {
                            sLayer.replaceSource(footage, false);
                            replacedTotal++;
                            if (!firstFootageLayer) firstFootageLayer = sLayer;
                        } catch (sre) {}
                    }
                    if (!replacedTotal) fail("Could not replace any selected layer source.");
                    imports.push({id:item.id, layerId:firstFootageLayer.id, layerName:firstFootageLayer.name, replaced:true, replacedCount:replacedTotal});
                    continue;
                }
                var replacedFootage = null;
                if (replaceMode && selectedFootageLayers.length) {
                    for (var fl = 0; fl < selectedFootageLayers.length; fl++) {
                        var fcand = selectedFootageLayers[fl];
                        if (!footageReplaced[fcand.id]) { replacedFootage = fcand; footageReplaced[fcand.id] = true; break; }
                    }
                }
                if (replacedFootage) {
                    layer = replacedFootage;
                    try {
                        layer.replaceSource(footage, false);
                    } catch (re) { fail("Could not replace layer source: " + re.toString()); }
                    imports.push({id:item.id, layerId:layer.id, layerName:layer.name, replaced:true, replacedCount:1});
                    continue;
                }
                layer = comp.layers.add(footage);
                ownedLayers.push(layer);
                placeNewLayer(layer);
                var transform = layer.property("ADBE Transform Group");
                var crop = item.crop || {left:0, top:0, right:0, bottom:0};
                var left = crop.left * footage.width, top = crop.top * footage.height;
                var right = (1 - crop.right) * footage.width, bottom = (1 - crop.bottom) * footage.height;
                if (item.crop) {
                    var mask = layer.property("ADBE Mask Parade").addProperty("ADBE Mask Atom"), shape = new Shape();
                    shape.vertices = [[left, top], [right, top], [right, bottom], [left, bottom]];
                    shape.inTangents = [[0,0], [0,0], [0,0], [0,0]];
                    shape.outTangents = [[0,0], [0,0], [0,0], [0,0]]; shape.closed = true;
                    mask.maskMode = MaskMode.ADD;
                    mask.property("ADBE Mask Shape").setValue(shape);
                    mask.property("ADBE Mask Feather").setValue([0,0]);
                    mask.property("ADBE Mask Opacity").setValue(100);
                }
                transform.property("ADBE Anchor Point").setValue([(left + right) / 2, (top + bottom) / 2]);
                transform.property("ADBE Position").setValue([comp.width / 2 + (entry.cx - centerX) * factor, comp.height / 2 + (entry.cy - centerY) * factor]);
                var sourceAspect = footage.pixelAspect === undefined ? 1 : number(footage.pixelAspect, "source pixel aspect", true);
                transform.property("ADBE Scale").setValue(nativeSize ? [100,100] : [100 * item.width * factor / ((right - left) * sourceAspect), 100 * item.height * factor / (bottom - top)]);
                transform.property("ADBE Rotate Z").setValue(item.rotation);
                transform.property("ADBE Opacity").setValue(item.opacity * 100);
                imports.push({id:item.id, itemId:footage.id, layerId:layer.id, layerName:layer.name});
            }
        } catch (e) {
            error = e.toString();
            for (var l = ownedLayers.length - 1; l >= 0; l--) {
                try { ownedLayers[l].remove(); } catch (le) { cleanup.push("layer: " + le.toString()); }
            }
            for (var f = ownedFootage.length - 1; f >= 0; f--) {
                try { ownedFootage[f].remove(); } catch (fe) { cleanup.push("footage: " + fe.toString()); }
            }
        } finally {
            if (began) { try { app.endUndoGroup(); } catch (ue) { cleanup.push("undo group: " + ue.toString()); } }
        }
        if (cleanup.length) error = (error || "Import finalization failed.") + " Cleanup errors: " + cleanup.join("; ");
        return error ? api.result(false, null, error) : api.result(true, {count:imports.length, layers:imports, imports:imports}, null);
    }
    api.importReferences = function(payload) { return importBatch(payload, false); };
    MessBoardHost.importReference = function(filePath) {
        try {
            var context = JSON.parse(api.getContext());
            if (!context.ok || !context.data.comp) fail(context.error || "Open an active composition first.");
            var result = JSON.parse(importBatch(JSON.stringify({projectPath:context.data.projectPath,
                sessionToken:context.data.sessionToken, compId:context.data.comp.id, mode:"actual",
                items:[{id:"legacy", path:filePath, x:0, y:0, width:1, height:1, rotation:0, z:0, crop:null}]}), true));
            return result.ok ? api.result(true, {itemId:result.data.layers[0].itemId, layerName:result.data.layers[0].layerName}, null) : JSON.stringify(result);
        } catch (e) { return api.result(false, null, e.toString()); }
    };
    api.captureFrames = function(payload) {
        var solos = [], error = null, cleanup = [], ownedOutputs = [];
        try {
            var request = parse(payload), source = request.source, comp = null, i, j;
            if (source !== undefined && !object(source)) fail("Invalid capture source metadata.");
            if (source) {
                if (!object(source) || typeof source.projectPath !== "string") fail("Capture source project identity is missing.");
                var projectPath = app.project && app.project.file ? app.project.file.fsName : "";
                if ((source.projectPath === "") !== (projectPath === "") || (projectPath && !samePath(fileFor(source.projectPath).fsName, projectPath))) fail("Capture belongs to a different saved project.");
                if (!projectPath && source.sessionToken !== api.sessionToken()) fail("Unsaved capture belongs to a different or unknown project session.");
                if (request.sessionToken !== undefined && request.sessionToken !== api.sessionToken()) fail("Project session changed; refresh context first.");
                number(source.compId, "capture composition ID", true);
                if (request.compId !== undefined && request.compId !== source.compId) fail("Conflicting capture composition ID.");
                if (request.projectPath !== undefined && (typeof request.projectPath !== "string" || !samePath(request.projectPath, source.projectPath))) fail("Conflicting capture project path.");
                if (request.mode !== undefined && request.mode !== source.mode) fail("Conflicting capture mode.");
                if (request.count !== undefined && request.count !== 1) fail("Refresh accepts exactly one output.");
                if (!list(source.layerIds) || !list(source.layerIndices)) fail("Capture layer identity is missing.");
                if (source.layerIds.length > 128 || source.layerIndices.length > 128) fail("Selected-layer capture supports at most 128 layers. Use Comp frame for larger selections.");
                if (source.mode === "layers") {
                    if (!source.layerIds.length) fail("Capture source layer identity is missing.");
                    var seen = {};
                    for (i = 0; i < source.layerIds.length; i++) {
                        number(source.layerIds[i], "stable layer ID", true);
                        if (seen["$" + source.layerIds[i]]) fail("Duplicate capture layer ID.");
                        seen["$" + source.layerIds[i]] = true;
                    }
                } else if (source.layerIds.length || source.layerIndices.length) fail("Unexpected layer identities for composition capture.");
                for (i = 1; i <= app.project.numItems; i++) {
                    var candidateComp = app.project.item(i);
                    if (candidateComp instanceof CompItem && candidateComp.id === source.compId) comp = candidateComp;
                }
                if (!comp) fail("Capture source composition was deleted.");
                request.mode = source.mode;
            } else comp = target(request, false);
            if (request.mode !== "comp" && request.mode !== "layers" && request.mode !== "workarea") fail("Invalid capture mode.");
            var count = source ? 1 : (request.count === undefined ? (request.mode === "workarea" ? 4 : 1) : request.count);
            number(count, "capture count", true);
            if (Math.floor(count) !== count || (!source && request.mode === "workarea" ? (count < 2 || count > 12) : count !== 1)) fail("Invalid capture count.");
            if (!list(request.outputPaths) || request.outputPaths.length !== count) fail("Output paths must match capture count.");
            var files = [], i, j;
            for (i = 0; i < count; i++) {
                var output = fileFor(request.outputPaths[i]);
                if (!/\.png$/i.test(output.name)) fail("Capture output must be PNG.");
                if (output.exists) fail("Capture output already exists: " + output.fsName);
                for (j = 0; j < files.length; j++) if (samePath(files[j].fsName, output.fsName)) fail("Capture output paths must be unique.");
                files.push(output);
            }
            if (!source && request.mode === "layers" && !comp.selectedLayers.length) fail("Select at least one layer.");
            var file = files[0], time = number(source ? source.time : comp.time, "capture time");
            number(comp.duration, "composition duration", true); number(comp.frameDuration, "frame duration", true);
            if (time < 0 || time >= comp.duration) fail("Capture time is outside the composition.");
            var times = [time], captures = [], layerIds = [], layerIndices = [], selected = [];
            if (request.mode === "layers") {
                if (source) {
                    for (i = 0; i < source.layerIds.length; i++) {
                        var found = null;
                        for (j = 1; j <= comp.numLayers; j++) if (comp.layer(j).id === source.layerIds[i]) found = comp.layer(j);
                        if (!found) fail("Capture source layer was deleted.");
                        selected.push(found);
                    }
                } else selected = comp.selectedLayers;
                if (selected.length > 128) fail("Selected-layer capture supports at most 128 layers. Use Comp frame for larger selections.");
                for (i = 0; i < selected.length; i++) {
                    var stableId = selected[i].id;
                    if (typeof stableId !== "number" || !isFinite(stableId) || stableId <= 0 || Math.floor(stableId) !== stableId) fail("Selected-layer capture requires stable layer IDs (AE 22 or newer). Use Comp frame instead.");
                    number(selected[i].index, "layer index", true);
                    if (Math.floor(selected[i].index) !== selected[i].index) fail("Invalid layer index.");
                    layerIds.push(stableId);
                    layerIndices.push(selected[i].index);
                }
            }
            if (!source && request.mode === "workarea") {
                var start = number(comp.workAreaStart, "work area start"), length = number(comp.workAreaDuration, "work area duration", true);
                if (start < 0 || start + length > comp.duration + 0.0000001) fail("Work area is outside composition.");
                var first = Math.ceil(start / comp.frameDuration - 0.0000001);
                var last = Math.ceil(Math.min(start + length, comp.duration) / comp.frameDuration - 0.0000001) - 1;
                if (last - first + 1 < count) fail("Work area has fewer distinct frames than requested.");
                times = [];
                for (i = 0; i < count; i++) times.push((first + Math.round((last - first) * i / (count - 1))) * comp.frameDuration);
            }
            for (i = 0; i < files.length; i++) {
                if (!files[i].parent.exists && !files[i].parent.create()) fail("Cannot create capture folder.");
            }
            if (request.mode === "layers") {
                // Native solo isolation, not a duplicate comp. Camera/light/matte and
                // expression dependencies follow AE solo rules; nothing is auto-added.
                for (i = 1; i <= comp.numLayers; i++) {
                    var candidate = comp.layer(i), isolate = false;
                    for (j = 0; j < selected.length; j++) if (candidate === selected[j]) isolate = true;
                    solos.push({layer:candidate, value:candidate.solo, desired:isolate});
                }
                for (i = 0; i < solos.length; i++) if (solos[i].value !== solos[i].desired) solos[i].layer.solo = solos[i].desired;
            }
            for (i = 0; i < times.length; i++) {
                file = files[i]; time = times[i];
                // Recheck just before write. AE has no exclusive-create PNG API;
                // callers must supply private, unpredictable fresh output names.
                if (new File(file.fsName).exists) fail("Capture output already exists: " + file.fsName);
                ownedOutputs.push(file);
                comp.saveFrameToPng(time, file);
                file = waitForOutput(file.fsName);
                captures.push({path:file.fsName, width:comp.width, height:comp.height, name:comp.name,
                    capture:{projectPath:app.project.file ? app.project.file.fsName : "", compId:comp.id, compName:comp.name,
                        mode:request.mode, time:time, layerIds:layerIds, layerIndices:layerIndices, sessionToken:api.sessionToken()}});
            }
        } catch (e) { error = e.toString(); }
        finally {
            for (var s = 0; s < solos.length; s++) {
                try { if (solos[s].layer.solo !== solos[s].value) solos[s].layer.solo = solos[s].value; }
                catch (se) { cleanup.push("restore solo: " + se.toString()); }
            }
        }
        if (error || cleanup.length) {
            for (var o = 0; o < ownedOutputs.length; o++) {
                try { var owned = new File(ownedOutputs[o].fsName); if (owned.exists && !owned.remove()) fail("Cannot remove " + owned.fsName); }
                catch (oe) { cleanup.push("output: " + oe.toString()); }
            }
        }
        if (cleanup.length) error = (error || "Capture finalization failed.") + " Cleanup errors: " + cleanup.join("; ");
        return error ? api.result(false, null, error) : api.result(true, {captures:captures}, null);
    };
})(MessBoardHost);
MessBoardHost.captureActiveFrame = function(outputPath) {
    try {
        var result = JSON.parse(MessBoardHost.captureFrames(JSON.stringify({mode:"comp", outputPaths:[outputPath]})));
        return result.ok ? MessBoardHost.result(true, result.data.captures[0], null) : JSON.stringify(result);
    } catch (e) { return MessBoardHost.result(false, null, e.toString()); }
};
