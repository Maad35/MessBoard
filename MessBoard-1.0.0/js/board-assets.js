(function(root, factory) {
 var value = factory();
 root.BoardAssets = value;
 if (typeof module === 'object' && module.exports) module.exports = value;
})(this, function() {
 'use strict';
 function create(options) {
  var fs = options.fs, path = options.path, crypto = options.crypto;
  function snapshot(board) {
   var value = board && typeof board.toJSON === 'function' ? board.toJSON() : board;
   return JSON.parse(typeof value === 'string' ? value : JSON.stringify(value));
  }
  function absolute(file, boardPath) {
   return path.resolve(path.dirname(path.resolve(boardPath)), file);
  }
  function images(data) {
   return data.items.filter(function(item) { return item && item.type === 'image'; });
  }
  // Always pass the logical board filename, including for autosave payloads.
  function serialize(board, boardPath) {
   var copy = snapshot(board), base = path.dirname(path.resolve(boardPath));
   images(copy).forEach(function(item) {
    var file = absolute(item.path, boardPath), relative = path.relative(base, file);
    item.path = relative && relative !== '..' && relative.slice(0, 3) !== '..' + path.sep && !path.isAbsolute(relative) ? relative.split(path.sep).join('/') : file;
   });
   return JSON.stringify(copy, null, 2);
  }
  // Structural/model validation deliberately belongs to BoardModel.fromJSON.
  function deserialize(text, boardPath) {
   var copy = JSON.parse(text);
   images(copy).forEach(function(item) { item.path = absolute(item.path, boardPath); });
   return copy;
  }
  function assetDirectory(boardPath) {
   // Match BoardStorage roots while retaining the injected native/path.posix semantics.
   // Raw .json/.aeref retain their suffix in the historical sibling directory.
   var file = path.resolve(boardPath), name = path.basename(file).replace(/\.(messboard|aeref\.json)$/i, '');
   return path.join(path.dirname(file), name + '_files', 'assets');
  }
  function assetName(file, bytes) {
   var extension = path.extname(file).toLowerCase();
   if (!/^\.[a-z0-9]{1,10}$/.test(extension)) extension = '.bin';
   return crypto.createHash('sha256').update(bytes).digest('hex') + extension;
  }
  function sameBytes(a, b) {
   if (a.length !== b.length) return false;
   for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
   return true;
  }
  function collisionName(name, n) {
   var extension = path.extname(name);
   return n ? name.slice(0, name.length - extension.length) + '-' + n + extension : name;
  }
  // Synchronous in-memory operations: cap source payload at 256 MiB and
  // image references at 10000 (ZIP adds 2 entries). ZIP32 only, no ZIP64.
  // ZIP assembly temporarily retains source buffers plus the output buffer.
  var MAX_BYTES = 268435456, MAX_REFERENCES = 10000;
  function loadSources(items, boardPath) {
   if (items.length > MAX_REFERENCES) throw new Error('Image reference limit: 10000');
   var total = 0, unique = Object.create(null), sources = items.map(function(item) {
    var file = absolute(item.path, boardPath), key = pathKey(file), source = unique[key];
    if (!source) {
     var stat = fs.statSync(file);
     if (!stat.isFile()) throw new Error('Not a file: ' + file);
     total += stat.size;
     if (total > MAX_BYTES) throw new Error('Source size limit: 256 MiB');
     source = unique[key] = {file: file, size: stat.size};
    }
    return {item: item, id: item.id, source: source};
   });
   sources.forEach(function(reference) {
    var source = reference.source;
    if (!source.bytes) {
     source.bytes = fs.readFileSync(source.file);
     total += source.bytes.length - source.size;
     if (total > MAX_BYTES) throw new Error('Source size limit: 256 MiB');
    }
    reference.file = source.file; reference.bytes = source.bytes;
   });
   return sources;
  }
  // Counts refer to selected references: each is either copied or reused.
  function collect(board, boardPath, ids) {
   var result = {updates: [], copied: 0, reused: 0}, directory = assetDirectory(boardPath);
   var sources = loadSources(images(snapshot(board)).filter(function(item) { return !ids || ids.indexOf(item.id) >= 0; }), boardPath);
   var created = [];
   try {
    sources.forEach(function(source) {
     var bytes = source.bytes, name = assetName(source.file, bytes), target, n = 0;
     do {
      target = path.join(directory, collisionName(name, n++));
     } while (fs.existsSync(target) && (!fs.lstatSync(target).isFile() || !sameBytes(fs.readFileSync(target), bytes)));
     fs.mkdirSync(directory, {recursive: true});
     if (fs.existsSync(target)) result.reused++;
     else {
      // Exclusive open establishes ownership before any potentially partial write.
      var fd = fs.openSync(target, 'wx');
      created.push(target);
      try { fs.writeFileSync(fd, bytes); } finally { fs.closeSync(fd); }
      result.copied++;
     }
     result.updates.push({id: source.id, path: target});
    });
   } catch (error) {
    created.reverse().forEach(function(file) { try { fs.unlinkSync(file); } catch (cleanup) { error.message += '; cleanup failed: ' + cleanup.message; } });
    throw error;
   }
   return result;
  }
  function scanMissing(board, boardPath) {
   var missing = [];
   images(snapshot(board)).forEach(function(item) {
    var file = absolute(item.path, boardPath), exists = false;
    try { exists = fs.statSync(file).isFile(); } catch (error) { /* Missing or inaccessible. */ }
    if (!exists) missing.push({id: item.id, path: file, name: path.basename(file)});
   });
   return missing;
  }
  function pathKey(file) { return path.sep === '\\' ? file.toLowerCase() : file; }
  function batchRelink(board, boardPath, folder) {
   folder = path.resolve(folder);
   if (!fs.lstatSync(folder).isDirectory()) throw new Error('Relink folder must be a directory, not a symlink');
   var index = Object.create(null), groups = Object.create(null), result = {updates: [], unresolved: [], ambiguous: []};
   var stack = [folder];
   while (stack.length) {
    var directory = stack.pop();
    fs.readdirSync(directory).sort().forEach(function(name) {
     var file = path.join(directory, name), stat = fs.lstatSync(file);
     if (stat.isSymbolicLink()) return;
     if (stat.isDirectory()) stack.push(file);
     else if (stat.isFile()) {
      var key = name.toLowerCase();
      if (!index[key]) index[key] = [];
      index[key].push(file);
     }
    });
   }
   scanMissing(board, boardPath).forEach(function(item) {
    var key = pathKey(item.path), candidates;
    if (!groups[key]) groups[key] = (index[item.name.toLowerCase()] || []).sort();
    candidates = groups[key];
    if (candidates.length === 1) result.updates.push({id: item.id, path: candidates[0]});
    else if (candidates.length > 1) result.ambiguous.push({id: item.id, path: item.path, candidates: candidates.slice()});
    else result.unresolved.push({id: item.id, path: item.path, reason: 'No matching filename found'});
   });
   return result;
  }
  function crc32(bytes) {
   var crc = 0xffffffff;
   for (var i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (var bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
   }
   return (crc ^ 0xffffffff) >>> 0;
  }
  function zipStore(entries, BufferType) {
   var chunks = [], central = [], offset = 0, centralSize = 0;
   entries.forEach(function(entry) {
    var name = BufferType.from(entry.name, 'utf8'), bytes = entry.bytes, crc = crc32(bytes);
    var local = BufferType.alloc(30), record = BufferType.alloc(46);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); local.writeUInt16LE(0x800, 6);
    local.writeUInt16LE(33, 12); // DOS date 1980-01-01, deterministic and valid.
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(bytes.length, 18); local.writeUInt32LE(bytes.length, 22);
    local.writeUInt16LE(name.length, 26);
    record.writeUInt32LE(0x02014b50, 0);
    record.writeUInt16LE(20, 4); record.writeUInt16LE(20, 6); record.writeUInt16LE(0x800, 8);
    record.writeUInt16LE(33, 14);
    record.writeUInt32LE(crc, 16); record.writeUInt32LE(bytes.length, 20); record.writeUInt32LE(bytes.length, 24);
    record.writeUInt16LE(name.length, 28); record.writeUInt32LE(offset, 42);
    chunks.push(local, name, bytes); central.push(record, name);
    offset += local.length + name.length + bytes.length;
    centralSize += record.length + name.length;
   });
   var end = BufferType.alloc(22);
   end.writeUInt32LE(0x06054b50, 0);
   end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
   end.writeUInt32LE(centralSize, 12); end.writeUInt32LE(offset, 16);
   return BufferType.concat(chunks.concat(central, [end]));
  }
  function sameFile(a, b) {
   if (pathKey(path.resolve(a)) === pathKey(path.resolve(b))) return true;
   if (!fs.existsSync(a) || !fs.existsSync(b)) return false;
   if (pathKey(fs.realpathSync(a)) === pathKey(fs.realpathSync(b))) return true;
   // Windows file IDs can exceed Number precision; BigInt stats avoid false aliases.
   var sa = fs.statSync(a, {bigint: true}), sb = fs.statSync(b, {bigint: true});
   return String(sa.ino) !== '0' && sa.ino === sb.ino && sa.dev === sb.dev;
  }
  function canonical(file) {
   file = path.resolve(file);
   if (fs.existsSync(file)) return fs.realpathSync(file);
   var parent = path.dirname(file);
   return parent === file ? file : path.join(canonical(parent), path.basename(file));
  }
  function inside(directory, file) {
   var relative = path.relative(directory, file);
   return relative === '' || (relative !== '..' && relative.slice(0, 3) !== '..' + path.sep && !path.isAbsolute(relative));
  }
  function protectTarget(copy, boardPath, zipPath) {
   var content = path.dirname(assetDirectory(boardPath));
   if (inside(content, path.resolve(zipPath)) || inside(canonical(content), canonical(zipPath))) throw new Error('ZIP target is protected board-owned content');
   var protectedFiles = [path.resolve(boardPath)].concat(images(copy).map(function(item) { return absolute(item.path, boardPath); }));
   protectedFiles.forEach(function(file) {
    if (sameFile(zipPath, file)) throw new Error('ZIP target is a protected board/source file: ' + file);
   });
  }
  // files counts all ZIP entries; bytes is the final ZIP size, not source size.
  function exportPackage(board, boardPath, zipPath) {
   var copy = snapshot(board), entries = [], names = Object.create(null);
   var sources = loadSources(images(copy), boardPath);
   protectTarget(copy, boardPath, zipPath);
   var BufferType = crypto.randomBytes(0).constructor;
   sources.forEach(function(source) {
    var bytes = source.bytes, base = assetName(source.file, bytes), name, n = 0;
    do { name = 'Board_files/assets/' + collisionName(base, n++); } while (names[name] && !sameBytes(names[name], bytes));
    if (!names[name]) { names[name] = bytes; entries.push({name: name, bytes: bytes}); }
    source.item.path = name;
   });
   // Keep manifest allocation bounded separately from source media payload.
   var manifest = JSON.stringify(copy, null, 2);
   if (BufferType.byteLength(manifest, 'utf8') > 8388608) throw new Error('ZIP metadata limit: 8 MiB');
   entries.unshift({name: 'Board.messboard', bytes: BufferType.from(manifest, 'utf8')});
   entries.push({name: 'README.txt', bytes: BufferType.from('MessBoard portable board\nExtract the entire ZIP together, then open Board.messboard.\nKeep Board_files beside the board; it contains the local image assets.\nOnline links and thumbnails remain online and require internet access; remote media is not included.\n', 'utf8')});
   var zip = zipStore(entries, BufferType), target = path.resolve(zipPath);
   var temporary = path.join(path.dirname(target), '.board-package-' + crypto.randomBytes(16).toString('hex') + '.tmp');
   var fd = fs.openSync(temporary, 'wx'), owned = true;
   try {
    try { fs.writeFileSync(fd, zip); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    protectTarget(snapshot(board), boardPath, target);
    fs.renameSync(temporary, target);
    owned = false;
   } finally {
    if (owned) fs.unlinkSync(temporary);
   }
   return {files: entries.length, bytes: zip.length};
  }
  function existingEntry(file) {
   try { return fs.lstatSync(file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }
  function saveAsTargetState(targetPath, targetRoot) {
   var legacy = targetPath.replace(/\.messboard$/i, '.aeref.json');
   return {manifest: existingEntry(targetPath), root: existingEntry(targetRoot), legacy: legacy !== targetPath ? existingEntry(legacy) : null, legacyPath: legacy};
  }
  // Overwrite is only ever offered for a namespace that is recognizably a
  // board: a manifest file, or an owned folder carrying board markers. A
  // foreign folder that merely shares the name is never deleted.
  function assertReplaceableTarget(targetPath, targetRoot) {
   var state = saveAsTargetState(targetPath, targetRoot);
   if (!state.manifest && !state.root && !state.legacy) return false;
   if (state.manifest && (state.manifest.isSymbolicLink() || !state.manifest.isFile())) throw new Error('Save As cannot replace the destination manifest: ' + targetPath);
   if (state.legacy && (state.legacy.isSymbolicLink() || !state.legacy.isFile())) throw new Error('Save As cannot replace the destination legacy manifest: ' + state.legacyPath);
   if (state.root) {
    if (state.root.isSymbolicLink() || !state.root.isDirectory()) throw new Error('Save As cannot replace the destination folder: ' + targetRoot);
    if (!state.manifest) {
     var markers = ['autosave.json', 'pasted', 'captures', 'assets', 'thumbs'].some(function(name) { return !!existingEntry(path.join(targetRoot, name)); });
     if (!markers) throw new Error('Save As destination folder does not look like a MessBoard board folder: ' + targetRoot);
    }
   }
   return true;
  }
  function removeTargetTree(root) {
   var entries = 0;
   (function walk(dir) {
    fs.readdirSync(dir).forEach(function(name) {
     var file = path.join(dir, name), stat = fs.lstatSync(file);
     if (++entries > MAX_REFERENCES) throw new Error('Save As replace entry limit: 10000');
     if (stat.isSymbolicLink()) throw new Error('Save As cannot replace a folder containing a symlink: ' + file);
     if (stat.isDirectory()) { walk(file); fs.rmdirSync(file); }
     else if (stat.isFile()) fs.unlinkSync(file);
     else throw new Error('Save As cannot replace an unsupported entry: ' + file);
    });
   })(root);
   fs.rmdirSync(root);
  }
  function replaceSaveAsTarget(targetPath, targetRoot) {
   if (!assertReplaceableTarget(targetPath, targetRoot)) return;
   var state = saveAsTargetState(targetPath, targetRoot);
   if (state.root) removeTargetTree(targetRoot);
   if (state.manifest) fs.unlinkSync(targetPath);
   if (state.legacy) fs.unlinkSync(state.legacyPath);
   unusedSaveAsTarget(targetPath, targetRoot);
  }
  function unusedSaveAsTarget(targetPath, targetRoot) {
   var legacy = targetPath.replace(/\.messboard$/i, '.aeref.json');
   if (existingEntry(targetPath) || existingEntry(targetRoot) || (legacy !== targetPath && existingEntry(legacy))) throw new Error('Save As needs an unused name: destination manifest, legacy manifest or owned directory already exists');
  }
  function protectSaveAs(copy, sourcePath, sourceRoot, targetPath, targetRoot) {
   var source = canonical(sourceRoot), target = canonical(targetRoot), manifest = canonical(targetPath);
   if (inside(sourceRoot, targetPath) || inside(sourceRoot, targetRoot) || inside(targetRoot, sourceRoot) ||
       inside(source, manifest) || inside(source, target) || inside(target, source)) throw new Error('Save As target overlaps protected board-owned content');
   [sourcePath].concat(images(copy).map(function(item) { return absolute(item.path, sourcePath); })).forEach(function(file) {
    if (sameFile(targetPath, file) || pathKey(manifest) === pathKey(canonical(file)) || inside(targetRoot, file) || inside(target, canonical(file))) throw new Error('Save As target is a protected board/source file: ' + file);
   });
  }
  function saveAs(board, sourcePath, targetPath, options) {
   var overwrite = !!(options && options.overwrite === true);
   sourcePath = path.resolve(sourcePath); targetPath = path.resolve(targetPath);
   var copy = snapshot(board), sourceRoot = path.dirname(assetDirectory(sourcePath));
   var targetRoot = path.dirname(assetDirectory(targetPath)), files = [], directories = [''];
   if (images(copy).length > MAX_REFERENCES) throw new Error('Save As image reference limit: 10000');
   protectSaveAs(copy, sourcePath, sourceRoot, targetPath, targetRoot);
   if (!overwrite) unusedSaveAsTarget(targetPath, targetRoot);
   var rootStat = existingEntry(sourceRoot);
   if (rootStat && rootStat.isSymbolicLink()) throw new Error('Board-owned symlink is not supported: ' + sourceRoot);
   if (rootStat && !rootStat.isDirectory()) throw new Error('Board-owned root is not a directory: ' + sourceRoot);
   var stack = rootStat ? [''] : [], totalBytes = 0;
   while (stack.length) {
    var relative = stack.pop(), directory = path.join(sourceRoot, relative);
    fs.readdirSync(directory).sort().forEach(function(name) {
     var child = path.join(relative, name), file = path.join(sourceRoot, child), stat = fs.lstatSync(file);
     if (stat.isSymbolicLink()) throw new Error('Board-owned symlink is not supported: ' + file);
     if (!relative && pathKey(name) === 'autosave.json') return;
     if (files.length + directories.length > MAX_REFERENCES) throw new Error('Save As owned entry limit: 10000');
     if (stat.isDirectory()) { directories.push(child); stack.push(child); }
     else if (stat.isFile()) {
      totalBytes += Number(stat.size);
      if (totalBytes > MAX_BYTES) throw new Error('Save As source size limit: 256 MiB');
      files.push({from: file, to: path.join(targetRoot, child)});
     }
     else throw new Error('Unsupported board-owned file: ' + file);
    });
   }
   files.sort(function(a, b) { return a.from.localeCompare(b.from); });
   var relocations = files.slice(), byPath = Object.create(null), byIdentity = Object.create(null);
   function identity(file) {
    if (!fs.existsSync(file)) return '';
    var stat = fs.statSync(file, {bigint: true});
    return String(stat.ino) === '0' ? '' : String(stat.dev) + ':' + String(stat.ino);
   }
   files.forEach(function(entry) {
    byPath[pathKey(entry.from)] = entry;
    byPath[pathKey(canonical(entry.from))] = entry;
    var id = identity(entry.from);
    if (id && !byIdentity[id]) byIdentity[id] = entry;
   });
   images(copy).forEach(function(item) {
    var file = absolute(item.path, sourcePath), real = canonical(file);
    var owned = byPath[pathKey(file)] || byPath[pathKey(real)] || byIdentity[identity(file)];
    if (!owned && (inside(sourceRoot, file) || inside(canonical(sourceRoot), real) || sameFile(file, path.join(sourceRoot, 'autosave.json')))) throw new Error('Missing or unsupported board-owned file: ' + file);
    if (owned && !byPath[pathKey(file)]) { relocations.push({from: file, to: owned.to}); byPath[pathKey(file)] = owned; }
    item.path = owned ? owned.to : file;
   });
   var manifest = serialize(copy, targetPath), BufferType = crypto.randomBytes(0).constructor;
   if (BufferType.byteLength(manifest, 'utf8') > 8388608) throw new Error('Save As metadata limit: 8 MiB');
   var stage, stagedFiles = [], stagedDirectories = [], published = [], parents = [], failure = null;
   function mkdir(file, list) { fs.mkdirSync(file); list.push({file: file, directory: true, id: identity(file)}); }
   function ensureParent(file) {
    if (existingEntry(file)) return;
    ensureParent(path.dirname(file)); mkdir(file, parents);
   }
   function publish(from, to) { fs.linkSync(from, to); published.push({file: to, directory: false, id: identity(to)}); }
   function noteFailure(error) { if (failure) failure.message += '; cleanup failed: ' + error.message; else failure = error; }
   function cleanOwned(entries) {
    entries.reverse().forEach(function(entry) {
     try {
      if (identity(entry.file) !== entry.id) return;
      if (entry.directory) fs.rmdirSync(entry.file); else fs.unlinkSync(entry.file);
     } catch (cleanup) { noteFailure(cleanup); }
    });
   }
   try {
    ensureParent(path.dirname(targetPath));
    stage = fs.mkdtempSync(path.join(path.dirname(targetPath), '.board-save-as-')); stagedDirectories.push(stage);
    directories.forEach(function(relative) {
     var directory = path.join(stage, 'content', relative);
     fs.mkdirSync(directory); stagedDirectories.push(directory);
    });
    var copiedBytes = 0;
    files.forEach(function(file) {
     var size = Number(fs.lstatSync(file.from).size);
     if (copiedBytes + size > MAX_BYTES) throw new Error('Save As source size limit: 256 MiB');
     var current = file.from;
     while (inside(sourceRoot, current)) {
      if (fs.lstatSync(current).isSymbolicLink()) throw new Error('Board-owned symlink changed during Save As: ' + current);
      if (current === sourceRoot) break;
      current = path.dirname(current);
     }
     var target = path.join(stage, 'content', path.relative(sourceRoot, file.from));
     stagedFiles.push(target);
     fs.copyFileSync(file.from, target, fs.constants.COPYFILE_EXCL);
     copiedBytes += Number(fs.lstatSync(target).size);
     if (copiedBytes > MAX_BYTES) throw new Error('Save As source size limit: 256 MiB');
    });
    var stagedManifest = path.join(stage, 'manifest');
    var fd = fs.openSync(stagedManifest, 'wx'); stagedFiles.push(stagedManifest);
    try { fs.writeFileSync(fd, manifest, 'utf8'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    if (overwrite) replaceSaveAsTarget(targetPath, targetRoot); else unusedSaveAsTarget(targetPath, targetRoot);
    directories.forEach(function(relative) { mkdir(path.join(targetRoot, relative), published); });
    files.forEach(function(file) { publish(path.join(stage, 'content', path.relative(sourceRoot, file.from)), file.to); });
    // Hard-link publication is atomic and fails if a concurrent destination exists;
    // rename would silently replace that destination on POSIX.
    publish(stagedManifest, targetPath);
   } catch (error) { failure = error; }
   stagedFiles.reverse().forEach(function(file) { try { if (existingEntry(file)) fs.unlinkSync(file); } catch (cleanup) { noteFailure(cleanup); } });
   stagedDirectories.reverse().forEach(function(directory) { try { fs.rmdirSync(directory); } catch (cleanup) { noteFailure(cleanup); } });
   if (failure) { cleanOwned(published); cleanOwned(parents); throw failure; }
   return {boardPath: targetPath, data: copy, copied: files.length, relocations: relocations};
  }
  // Rotation-aware axis-aligned bounds, matching Geometry.itemBounds without a
  // startup dependency: this module must load in the browser with no require().
  function itemBounds(item) {
   var w = Number(item.width) || 0, h = Number(item.height) || 0;
   var cx = (Number(item.x) || 0) + w / 2, cy = (Number(item.y) || 0) + h / 2;
   var angle = (Number(item.rotation) || 0) * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
   var corners = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
   var box = {minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity};
   corners.forEach(function(point) {
    var x = cx + point[0] * c - point[1] * s, y = cy + point[0] * s + point[1] * c;
    box.minX = Math.min(box.minX, x); box.maxX = Math.max(box.maxX, x);
    box.minY = Math.min(box.minY, y); box.maxY = Math.max(box.maxY, y);
   });
   return box;
  }
  // A camera is a pure view transform, so framing never moves the items themselves.
  // Hidden items cannot be seen, so they only frame the view when nothing else can.
  var FRAME_WIDTH = 1200, FRAME_HEIGHT = 800, FRAME_PADDING = 32;
  function frameCamera(items, frame) {
   if (frame === undefined || frame === null) frame = {width: FRAME_WIDTH, height: FRAME_HEIGHT, padding: FRAME_PADDING};
   if (!frame || typeof frame !== 'object' || Array.isArray(frame) ||
       typeof frame.width !== 'number' || !isFinite(frame.width) || frame.width <= 0 ||
       typeof frame.height !== 'number' || !isFinite(frame.height) || frame.height <= 0 ||
       (frame.padding !== undefined && (typeof frame.padding !== 'number' || !isFinite(frame.padding)))) throw new Error('Invalid export selection frame');
   var padding = frame.padding === undefined ? FRAME_PADDING : frame.padding;
   padding = Math.max(0, Math.min(padding, (Math.min(frame.width, frame.height) - 1) / 2));
   var visible = items.filter(function(item) { return !item.hidden; });
   var framed = visible.length ? visible : items, box = null;
   framed.forEach(function(item) {
    var bounds = itemBounds(item);
    if (!isFinite(bounds.minX) || !isFinite(bounds.minY) || !isFinite(bounds.maxX) || !isFinite(bounds.maxY)) return;
    box = box ? {minX: Math.min(box.minX, bounds.minX), minY: Math.min(box.minY, bounds.minY),
     maxX: Math.max(box.maxX, bounds.maxX), maxY: Math.max(box.maxY, bounds.maxY)} : bounds;
   });
   if (!box) return {x: 0, y: 0, zoom: 1};
   var width = Math.max(1, box.maxX - box.minX), height = Math.max(1, box.maxY - box.minY);
   var zoom = Math.max(0.1, Math.min(1, (frame.width - 2 * padding) / width, (frame.height - 2 * padding) / height));
   var camera = {x: frame.width / 2 - (box.minX + box.maxX) * zoom / 2, y: frame.height / 2 - (box.minY + box.maxY) * zoom / 2, zoom: zoom};
   return isFinite(camera.x) && isFinite(camera.y) && isFinite(camera.zoom) ? camera : {x: 0, y: 0, zoom: 1};
  }
  function selectedDocument(board, ids, frame) {
   if (!Array.isArray(ids) || !ids.length) throw new Error('Export selection needs at least one item');
   if (ids.length > MAX_REFERENCES) throw new Error('Export selection reference limit: 10000');
   var source = snapshot(board), wanted = Object.create(null), found = Object.create(null), members = Object.create(null);
   ids.forEach(function(id) { wanted[id] = true; });
   // Collect in source order first; selection order must not affect z-order ties.
   var items = source.items.filter(function(item) {
    if (!item || !wanted[item.id]) return false;
    if (found[item.id]) return false;
    found[item.id] = true;
    if (item.groupId) members[item.groupId] = (members[item.groupId] || 0) + 1;
    return true;
   });
   ids.forEach(function(id) { if (!found[id]) throw new Error('Unknown item for export: ' + id); });
   // Sort by rendered z-order, retaining source order for ties in older CEF.
   items = items.map(function(item, index) { return {item: item, index: index}; }).sort(function(a, b) {
    return a.item.z - b.item.z || a.index - b.index;
   }).map(function(entry) { return entry.item; });
   var maxId = 0;
   items.forEach(function(item, index) {
    item.z = index + 1;
    // A one-member group link would silently promote the item to a group of one.
    if (item.groupId && members[item.groupId] < 2) delete item.groupId;
    [item.id, item.groupId].forEach(function(value) {
     var match = /^(?:ref|group)-(\d+)$/.exec(value || '');
     if (match) maxId = Math.max(maxId, Number(match[1]));
    });
   });
   // Ordinary version-1 document: no history, no selection, no AE project association.
   return {version: 1, nextId: maxId + 1, camera: frameCamera(items, frame), settings: source.settings, projectLink: null, items: items};
  }
  function readSources(items, boardPath, label) {
   try { return loadSources(items, boardPath); } catch (error) {
    if (/^(?:ENOENT|ENOTDIR|EACCES|EPERM|EISDIR)$/.test(error.code || '')) throw new Error(label + ' is missing or unreadable: ' + absolute(error.path || '', boardPath));
    throw error;
   }
  }
  // Ordinary .messboard document containing only the selected items and the local
  // images they reference. Never mutates the board and never writes to the source.
  function exportSelection(board, boardPath, targetPath, ids, frame) {
   boardPath = path.resolve(boardPath); targetPath = path.resolve(targetPath);
   var copy = selectedDocument(board, ids, frame), full = snapshot(board);
   var sourceRoot = path.dirname(assetDirectory(boardPath)), targetRoot = path.dirname(assetDirectory(targetPath));
   var targetAssets = assetDirectory(targetPath);
   // Image references are always local files; a URL here is a broken reference,
   // never a link item, so it must be reported rather than silently rewritten.
   var local = images(copy);
   protectSaveAs(full, boardPath, sourceRoot, targetPath, targetRoot);
   unusedSaveAsTarget(targetPath, targetRoot);
   // Reject oversized non-path metadata before allocating media buffers. Source
   // paths are replaced on export, so omit them from this lower-bound preflight;
   // the final serialized manifest is checked again with its portable paths.
   var BufferType = crypto.randomBytes(0).constructor;
   var metadata = JSON.stringify(copy, function(key, value) { return key === 'path' && this.type === 'image' ? '' : value; }, 2);
   if (BufferType.byteLength(metadata, 'utf8') > 8388608) throw new Error('Export selection metadata limit: 8 MiB');
   var sources = readSources(local, boardPath, 'Exported image');
   var assets = [], byName = Object.create(null), byHash = Object.create(null);
   sources.forEach(function(source) {
    var bytes = source.bytes, base = assetName(source.file, bytes), name, n = 0;
    var hash = base.slice(0, base.length - path.extname(base).length), matches = byHash[hash] || [];
    for (var i = 0; i < matches.length; i++) {
     if (sameBytes(matches[i].bytes, bytes)) { source.item.path = path.join(targetAssets, matches[i].name); return; }
    }
    // Identical bytes share one asset regardless of extension; hash collisions
    // still get distinct names and never substitute another image's bytes.
    do { name = collisionName(base, n++); } while (byName[name] && !sameBytes(byName[name], bytes));
    if (!byName[name]) {
     var asset = {name: name, bytes: bytes};
     byName[name] = bytes; assets.push(asset); matches.push(asset); byHash[hash] = matches;
    }
    source.item.path = path.join(targetAssets, name);
   });
   var manifest = serialize(copy, targetPath);
   if (BufferType.byteLength(manifest, 'utf8') > 8388608) throw new Error('Export selection metadata limit: 8 MiB');
   protectSaveAs(full, boardPath, sourceRoot, targetPath, targetRoot);
   publishDocument(targetPath, targetRoot, assets.length ? [path.basename(targetAssets)] : [], assets, manifest);
   return {boardPath: targetPath, data: copy, items: copy.items.length, copied: assets.length};
  }
  // Stage every byte beside the destination, then publish the manifest last with a
  // no-replace hard link, rolling back only the entries this call created.
  function publishDocument(targetPath, targetRoot, directories, assets, manifest) {
   var stage, stagedFiles = [], stagedDirectories = [], published = [], parents = [], failure = null;
   function identity(file) {
    if (!fs.existsSync(file)) return '';
    var stat = fs.statSync(file, {bigint: true});
    return String(stat.ino) === '0' ? '' : String(stat.dev) + ':' + String(stat.ino);
   }
   function mkdir(file, list) { fs.mkdirSync(file); list.push({file: file, directory: true, id: identity(file)}); }
   function ensureParent(file) {
    if (existingEntry(file)) return;
    ensureParent(path.dirname(file)); mkdir(file, parents);
   }
   function link(from, to) {
    // The staged inode is ours; a post-link pathname may already be a replacement.
    var id = identity(from);
    fs.linkSync(from, to); published.push({file: to, directory: false, id: id});
    if (identity(to) !== id) throw new Error('Export destination changed during publication');
   }
   function noteFailure(error) { if (failure) failure.message += '; cleanup failed: ' + error.message; else failure = error; }
   function cleanOwned(entries) {
    entries.reverse().forEach(function(entry) {
     try {
      if (identity(entry.file) !== entry.id) return;
      if (entry.directory) fs.rmdirSync(entry.file); else fs.unlinkSync(entry.file);
     } catch (cleanup) { noteFailure(cleanup); }
    });
   }
   try {
    ensureParent(path.dirname(targetPath));
    stage = fs.mkdtempSync(path.join(path.dirname(targetPath), '.board-export-selection-'));
    stagedDirectories.push({file: stage, directory: true, id: identity(stage)});
    assets.forEach(function(asset) {
     var staged = path.join(stage, asset.name), fd = fs.openSync(staged, 'wx');
     stagedFiles.push({file: staged, directory: false, id: identity(staged)});
     try { fs.writeFileSync(fd, asset.bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    });
    var stagedManifest = path.join(stage, 'manifest'), manifestFd = fs.openSync(stagedManifest, 'wx');
    stagedFiles.push({file: stagedManifest, directory: false, id: identity(stagedManifest)});
    try { fs.writeFileSync(manifestFd, manifest, 'utf8'); fs.fsyncSync(manifestFd); } finally { fs.closeSync(manifestFd); }
    unusedSaveAsTarget(targetPath, targetRoot);
    mkdir(targetRoot, published);
    directories.forEach(function(relative) { mkdir(path.join(targetRoot, relative), published); });
    assets.forEach(function(asset) { link(path.join(stage, asset.name), path.join(targetRoot, directories[0], asset.name)); });
    link(stagedManifest, targetPath);
   } catch (error) { failure = error; }
   cleanOwned(stagedFiles); cleanOwned(stagedDirectories);
   if (failure) { cleanOwned(published); cleanOwned(parents); throw failure; }
  }
  // Public async contract: snapshot before returning, then Promise of the same
  // result as the sync API. job callbacks receive no paths. Progress counters are
  // local to each phase/file, not a monotonic overall percentage. "commit" is the
  // last cancelable checkpoint; publication and rollback are finite synchronous
  // sections with no callbacks. Cancellation after publication cannot undo success.
  // Temporary cleanup is identity-checked, never recursive. A cleanup failure
  // before commit is appended to the rejection; after commit success stays success
  // (a locked/replaced temporary entry may remain). ZIP publication never replaces
  // an existing target and requires filesystem hard-link support.
  // Sources remain buffered (256 MiB cap); ZIP writes slices without a second full
  // archive allocation. Snapshot/JSON metadata (8 MiB), single filesystem calls,
  // allocation and final commit are synchronous; this is cooperative, not realtime.
  // Async work uses bounded 64 KiB slices, with a timer turn between slices.
  // Node 12/CEP: no workers, async syntax, or dependency on fs.promises.
  var ASYNC_CHUNK = 65536;
  function asyncJob(job) {
   job = job || {};
   return {
    check: function() {
     if (typeof job.isCanceled === 'function' && job.isCanceled()) {
      var error = new Error('Operation canceled'); error.code = 'CANCELED'; throw error;
     }
    },
    turn: function(phase, completed, total) {
     var self = this;
     return new Promise(function(resolve, reject) {
      setTimeout(function() {
       try {
        self.check();
        if (typeof job.onProgress === 'function') job.onProgress({phase: phase, completed: completed, total: total});
        self.check(); resolve();
       } catch (error) { reject(error); }
      }, 0);
     });
    }
   };
  }
  function asyncEach(list, action) {
   var index = 0;
   function next() { return index < list.length ? Promise.resolve().then(function() { return action(list[index], index++); }).then(next) : Promise.resolve(); }
   return next();
  }
  function asyncIdentity(file) {
   try {
    var stat = fs.lstatSync(file, {bigint: true});
    return String(stat.ino) === '0' ? '' : String(stat.dev) + ':' + String(stat.ino);
   } catch (error) { if (error.code === 'ENOENT') return ''; throw error; }
  }
  function asyncStamp(file) {
   var stat = fs.lstatSync(file, {bigint: true});
   return [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(':');
  }
  function asyncRead(file, size, job, phase) {
   var fd, bytes, offset = 0, BufferType = crypto.randomBytes(0).constructor;
   return job.turn(phase, 0, size).then(function() {
    fd = fs.openSync(file, 'r');
    var stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size !== size) throw new Error('Source changed during read');
    bytes = BufferType.alloc(size);
    var initialStamp = asyncStamp(file), initialHandle = fs.fstatSync(fd, {bigint: true});
    function read() {
     if (offset >= size) {
      var finalHandle = fs.fstatSync(fd, {bigint: true});
      if (fs.fstatSync(fd).size !== size || asyncStamp(file) !== initialStamp || initialHandle.mtimeNs !== finalHandle.mtimeNs || initialHandle.ctimeNs !== finalHandle.ctimeNs) throw new Error('Source changed during read');
      return bytes;
     }
     var count = fs.readSync(fd, bytes, offset, Math.min(ASYNC_CHUNK, size - offset), offset);
     if (!count) throw new Error('Source changed during read');
     offset += count;
     return job.turn(phase, offset, size).then(read);
    }
    return read();
   }).then(function(value) { if (fd !== undefined) { fs.closeSync(fd); fd = undefined; } return value; }, function(error) {
    if (fd !== undefined) { try { fs.closeSync(fd); } catch (close) { error.message += '; close failed: ' + close.message; } }
    throw error;
   });
  }
  function asyncSources(items, boardPath, job) {
   if (items.length > MAX_REFERENCES) return Promise.reject(new Error('Image reference limit: 10000'));
   var unique = Object.create(null), sources = [], refs = [], total = 0;
   return asyncEach(items, function(item, i) {
    return job.turn('preflight', i, items.length).then(function() {
     var file = absolute(item.path, boardPath), key = pathKey(file), source = unique[key];
     if (!source) {
      var stat = fs.statSync(file);
      if (!stat.isFile()) throw new Error('Not a regular source file');
      total += stat.size;
      if (total > MAX_BYTES) throw new Error('Source size limit: 256 MiB');
      source = unique[key] = {file: file, size: stat.size}; sources.push(source);
     }
     refs.push({item: item, id: item.id, source: source});
    });
   }).then(function() {
    return asyncEach(sources, function(source) {
     return asyncRead(source.file, source.size, job, 'read').then(function(bytes) {
      source.bytes = bytes;
      var hash = crypto.createHash('sha256'), offset = 0;
      function step() {
       return job.turn('hash', offset, bytes.length).then(function() {
        if (offset >= bytes.length) {
         var extension = path.extname(source.file).toLowerCase();
         source.name = hash.digest('hex') + (/^\.[a-z0-9]{1,10}$/.test(extension) ? extension : '.bin'); return;
        }
        var end = Math.min(offset + ASYNC_CHUNK, bytes.length);
        hash.update(bytes.slice(offset, end)); offset = end; return step();
       });
      }
      return step();
     });
    });
   }).then(function() { return refs; });
  }
  function asyncEqual(a, b, job) {
   var offset = 0;
   if (a.length !== b.length) return Promise.resolve(false);
   function step() {
    return job.turn('compare', offset, a.length).then(function() {
     var end = Math.min(offset + ASYNC_CHUNK, a.length);
     for (; offset < end; offset++) if (a[offset] !== b[offset]) return false;
     return offset < a.length ? step() : true;
    });
   }
   return step();
  }
  function asyncTransaction() {
   var staged = [], published = [], parents = [];
   function record(file, directory, list) {
    var entry = {file: file, directory: directory, id: asyncIdentity(file)};
    if (!entry.id) throw new Error('Filesystem identity unavailable');
    list.push(entry); return entry;
   }
   function ensure(directory) {
    if (existingEntry(directory)) return;
    ensure(path.dirname(directory)); fs.mkdirSync(directory); record(directory, true, parents);
   }
   function clean(list, error) {
    list.slice().reverse().forEach(function(entry) {
     try {
      if (!entry.id || asyncIdentity(entry.file) !== entry.id) return;
      if (entry.directory) fs.rmdirSync(entry.file); else fs.unlinkSync(entry.file);
     } catch (failure) { if (error) error.message += '; cleanup failed: ' + failure.message; }
    });
   }
   return {
    stage: function(parent) {
     ensure(parent);
     var directory = fs.mkdtempSync(path.join(parent, '.board-async-')); record(directory, true, staged); return directory;
    },
    write: function(file, chunks, job, phase) {
     var fd, chunkIndex = 0, offset = 0, completed = 0, total = 0;
     chunks.forEach(function(bytes) { total += bytes.length; });
     return job.turn(phase, 0, total).then(function() {
      fd = fs.openSync(file, 'wx');
      // Capture ownership from the handle, never from a possibly replaced name.
      var stat = fs.fstatSync(fd, {bigint: true});
      var id = String(stat.ino) === '0' ? '' : String(stat.dev) + ':' + String(stat.ino);
      if (!id) throw new Error('Filesystem identity unavailable');
      staged.push({file: file, directory: false, id: id});
      function step() {
       while (chunkIndex < chunks.length && offset === chunks[chunkIndex].length) { chunkIndex++; offset = 0; }
       if (chunkIndex === chunks.length) { fs.fsyncSync(fd); return; }
       var bytes = chunks[chunkIndex], count = fs.writeSync(fd, bytes, offset, Math.min(ASYNC_CHUNK, bytes.length - offset));
       if (!count) throw new Error('No progress writing staged output');
       offset += count; completed += count;
       return job.turn(phase, completed, total).then(step);
      }
      return step();
     }).then(function() { if (fd !== undefined) { fs.closeSync(fd); fd = undefined; } }, function(error) {
      if (fd !== undefined) { try { fs.closeSync(fd); } catch (close) { error.message += '; close failed: ' + close.message; } }
      throw error;
     });
    },
    ensure: ensure,
    publish: function(from, to) {
     var owned = staged.filter(function(entry) { return !entry.directory && entry.file === from; })[0];
     var id = owned && owned.id;
     if (!id || asyncIdentity(from) !== id) throw new Error('Staged output changed before publication');
     fs.linkSync(from, to); published.push({file: to, id: id});
     if (asyncIdentity(to) !== id) throw new Error('Destination changed during publication');
    },
    finish: function(error) { clean(staged, error); if (error) { clean(published, error); clean(parents, error); } }
   };
  }
  function asyncSnapshot(board) {
   var value = board && typeof board.toJSON === 'function' ? board.toJSON() : board;
   var text = typeof value === 'string' ? value : JSON.stringify(value), BufferType = crypto.randomBytes(0).constructor;
   if (BufferType.byteLength(text, 'utf8') > 8388608) throw new Error('Board metadata limit: 8 MiB');
   var copy = JSON.parse(text);
   if (!copy || !Array.isArray(copy.items)) throw new Error('Invalid board items');
   if (images(copy).length > MAX_REFERENCES) throw new Error('Image reference limit: 10000');
   return copy;
  }
  function collectAsync(board, boardPath, ids, job) {
   var copy, selected;
   try { copy = asyncSnapshot(board); boardPath = path.resolve(boardPath); selected = ids ? ids.slice() : null; } catch (error) { return Promise.reject(error); }
   var control = asyncJob(job), tx = asyncTransaction(), result = {updates: [], copied: 0, reused: 0};
   var directory = assetDirectory(boardPath), plans = Object.create(null), staged = [], stage, destination;
   return control.turn('preflight', 0, 1).then(function() {
    destination = canonical(directory);
    return asyncSources(images(copy).filter(function(item) { return !selected || selected.indexOf(item.id) >= 0; }), boardPath, control);
   }).then(function(refs) {
    return asyncEach(refs, function(ref) {
     var source = ref.source, n = 0;
     function choose() {
      var target = path.join(directory, collisionName(source.name, n++)), planned = plans[target], stat = existingEntry(target);
      if (planned) return asyncEqual(planned.bytes, source.bytes, control).then(function(equal) {
       if (!equal) return choose();
       result.reused++; result.updates.push({id: ref.id, path: target});
      });
      if (stat) {
       if (!stat.isFile() || stat.size !== source.bytes.length) return control.turn('compare', 0, 1).then(choose);
       var id = asyncStamp(target);
       return asyncRead(target, stat.size, control, 'compare').then(function(bytes) { return asyncEqual(bytes, source.bytes, control); }).then(function(equal) {
        if (!equal) return choose();
        plans[target] = {bytes: source.bytes, id: id, target: target};
        result.reused++; result.updates.push({id: ref.id, path: target});
       });
      }
      if (!stage) stage = tx.stage(path.dirname(boardPath));
      var file = path.join(stage, String(staged.length));
      return tx.write(file, [source.bytes], control, 'copy').then(function() {
       var plan = {bytes: source.bytes, from: file, target: target}; plans[target] = plan; staged.push(plan);
       result.copied++; result.updates.push({id: ref.id, path: target});
      });
     }
     return choose();
    });
   }).then(function() { return control.turn('commit', 0, 1); }).then(function() {
    control.check();
    if (pathKey(canonical(directory)) !== pathKey(destination)) throw new Error('Collect destination changed before commit');
    Object.keys(plans).forEach(function(key) { var plan = plans[key]; if (plan.id && asyncStamp(plan.target) !== plan.id) throw new Error('Reused asset changed before commit'); });
    if (staged.length) tx.ensure(directory);
    staged.forEach(function(plan) { tx.publish(plan.from, plan.target); });
    tx.finish(); return result;
   }).catch(function(error) { tx.finish(error); throw error; });
  }
  function asyncZip(entries, job) {
   var BufferType = crypto.randomBytes(0).constructor, chunks = [], central = [], offset = 0, centralSize = 0;
   return asyncEach(entries, function(entry) {
    var position = 0, crc = 0xffffffff, bytes = entry.bytes;
    function step() {
     return job.turn('crc', position, bytes.length).then(function() {
      var end = Math.min(position + ASYNC_CHUNK, bytes.length);
      for (; position < end; position++) {
       crc ^= bytes[position];
       for (var bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
      }
      if (position < bytes.length) return step();
      crc = (crc ^ 0xffffffff) >>> 0;
      var name = BufferType.from(entry.name, 'utf8'), local = BufferType.alloc(30), record = BufferType.alloc(46);
      local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x800, 6); local.writeUInt16LE(33, 12);
      local.writeUInt32LE(crc, 14); local.writeUInt32LE(bytes.length, 18); local.writeUInt32LE(bytes.length, 22); local.writeUInt16LE(name.length, 26);
      record.writeUInt32LE(0x02014b50, 0); record.writeUInt16LE(20, 4); record.writeUInt16LE(20, 6); record.writeUInt16LE(0x800, 8); record.writeUInt16LE(33, 14);
      record.writeUInt32LE(crc, 16); record.writeUInt32LE(bytes.length, 20); record.writeUInt32LE(bytes.length, 24); record.writeUInt16LE(name.length, 28); record.writeUInt32LE(offset, 42);
      chunks.push(local, name, bytes); central.push(record, name);
      offset += local.length + name.length + bytes.length; centralSize += record.length + name.length;
     });
    }
    return step();
   }).then(function() {
    var end = BufferType.alloc(22);
    end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(centralSize, 12); end.writeUInt32LE(offset, 16);
    return {chunks: chunks.concat(central, [end]), bytes: offset + centralSize + end.length};
   });
  }
  function asyncProtect(copy, boardPath, target, control) {
   var items = images(copy), offset = 0;
   function step() {
    return control.turn('protect', offset, items.length).then(function() {
     protectTarget({items: items.slice(offset, offset + 32)}, boardPath, target);
     offset += 32;
     return offset < items.length ? step() : undefined;
    });
   }
   return step();
  }
  function exportPackageAsync(board, boardPath, target, job) {
   var copy;
   try { copy = asyncSnapshot(board); boardPath = path.resolve(boardPath); target = path.resolve(target); } catch (error) { return Promise.reject(error); }
   var protectedCopy = snapshot(copy), control = asyncJob(job), tx = asyncTransaction(), entries = [], names = Object.create(null), result, temporary;
   return control.turn('preflight', 0, 1).then(function() {
    return asyncProtect(protectedCopy, boardPath, target, control);
   }).then(function() {
    return asyncSources(images(copy), boardPath, control);
   }).then(function(refs) {
    return asyncEach(refs, function(ref) {
     var source = ref.source, n = 0;
     function choose() {
      var name = 'Board_files/assets/' + collisionName(source.name, n++);
      if (names[name]) return asyncEqual(names[name], source.bytes, control).then(function(equal) {
       if (!equal) return choose(); ref.item.path = name;
      });
      names[name] = source.bytes; entries.push({name: name, bytes: source.bytes}); ref.item.path = name;
      return control.turn('package', entries.length, refs.length);
     }
     return choose();
    });
   }).then(function() {
    var BufferType = crypto.randomBytes(0).constructor, manifest = JSON.stringify(copy, null, 2);
    if (BufferType.byteLength(manifest, 'utf8') > 8388608) throw new Error('ZIP metadata limit: 8 MiB');
    entries.unshift({name: 'Board.messboard', bytes: BufferType.from(manifest, 'utf8')});
    entries.push({name: 'README.txt', bytes: BufferType.from('MessBoard portable board\nExtract the entire ZIP together, then open Board.messboard.\nKeep Board_files beside the board; it contains the local image assets.\nOnline links and thumbnails remain online and require internet access; remote media is not included.\n', 'utf8')});
    return asyncZip(entries, control);
   }).then(function(zip) {
    result = {files: entries.length, bytes: zip.bytes};
    temporary = path.join(tx.stage(path.dirname(target)), 'package.zip');
    return tx.write(temporary, zip.chunks, control, 'write');
   }).then(function() { return control.turn('commit', 0, 1); }).then(function() {
    control.check(); protectTarget(protectedCopy, boardPath, target);
    tx.publish(temporary, target); tx.finish(); return result;
   }).catch(function(error) { tx.finish(error); throw error; });
  }
  function asyncDirectory(directory) {
   if (typeof fs.opendirSync === 'function') return Promise.resolve(fs.opendirSync(directory));
   // fs.opendir arrived in Node 12.12. Older CEP Node uses off-thread readdir.
   return new Promise(function(resolve, reject) {
    fs.readdir(directory, function(error, names) {
     if (error) { reject(error); return; }
     if (names.length > MAX_REFERENCES) { reject(new Error('Relink folder entry limit: 10000')); return; }
     var index = 0;
     resolve({readSync: function() { return index < names.length ? {name: names[index++]} : null; }, closeSync: function() { names = []; }});
    });
   });
  }
  function batchRelinkAsync(board, boardPath, folder, job) {
   var copy;
   try { copy = asyncSnapshot(board); boardPath = path.resolve(boardPath); folder = path.resolve(folder); } catch (error) { return Promise.reject(error); }
   var control = asyncJob(job), index = Object.create(null), result = {updates: [], unresolved: [], ambiguous: []}, stack = [folder], visited = 0;
   return control.turn('preflight', 0, 1).then(function() {
    if (images(copy).length > MAX_REFERENCES) throw new Error('Image reference limit: 10000');
    if (!fs.lstatSync(folder).isDirectory()) throw new Error('Relink folder must be a directory, not a symlink');
    function walk() {
     if (!stack.length) return;
     var directory = stack.pop(), handle, directoryId = asyncIdentity(directory);
     function verifyDirectory() {
      if (!fs.lstatSync(directory).isDirectory() || asyncIdentity(directory) !== directoryId) throw new Error('Relink directory changed during scan');
     }
     return control.turn('scan', visited, MAX_REFERENCES).then(function() {
      verifyDirectory(); return asyncDirectory(directory);
     }).then(function(opened) {
      handle = opened; control.check();
      function batch() {
       verifyDirectory();
       for (var i = 0; i < 32; i++) {
        var entry = handle.readSync();
        if (!entry) return;
        if (++visited > MAX_REFERENCES) throw new Error('Relink folder entry limit: 10000');
        var file = path.join(directory, entry.name), stat = fs.lstatSync(file);
        if (stat.isSymbolicLink()) continue;
        if (stat.isDirectory()) stack.push(file);
        else if (stat.isFile()) {
         var key = entry.name.toLowerCase(); if (!index[key]) index[key] = []; index[key].push(file);
        }
       }
       return control.turn('scan', visited, MAX_REFERENCES).then(batch);
      }
      return batch();
     }).then(function() { handle.closeSync(); handle = null; return walk(); }, function(error) {
      if (handle) { try { handle.closeSync(); } catch (close) { error.message += '; close failed: ' + close.message; } }
      throw error;
     });
    }
    return walk();
   }).then(function() {
    var items = images(copy);
    return asyncEach(items, function(item, i) {
     return control.turn('match', i, items.length).then(function() {
      var file = absolute(item.path, boardPath), exists = false;
      try { exists = fs.statSync(file).isFile(); } catch (error) { /* Matches scanMissing semantics. */ }
      if (exists) return;
      var candidates = (index[path.basename(file).toLowerCase()] || []).slice().sort();
      if (candidates.length === 1) result.updates.push({id: item.id, path: candidates[0]});
      else if (candidates.length > 1) result.ambiguous.push({id: item.id, path: file, candidates: candidates});
      else result.unresolved.push({id: item.id, path: file, reason: 'No matching filename found'});
     });
    });
   }).then(function() { return control.turn('commit', 0, 1); }).then(function() { control.check(); return result; });
  }
  return {serialize: serialize, deserialize: deserialize, collect: collect, collectAsync: collectAsync, scanMissing: scanMissing, batchRelink: batchRelink, batchRelinkAsync: batchRelinkAsync, exportPackage: exportPackage, exportPackageAsync: exportPackageAsync, saveAs: saveAs, exportSelection: exportSelection};
 }
 return {create: create};
});
