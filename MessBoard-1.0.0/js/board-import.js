(function(root, factory) {
 var value = factory();
 root.BoardImport = value;
 if (typeof module === 'object' && module.exports) module.exports = value;
})(this, function() {
 'use strict';
 function finiteNumber(value) { return typeof value === 'number' && isFinite(value); }
 function create(options) {
  var fs = options.fs, assets = options.assets, BoardModel = options.BoardModel, Geometry = options.Geometry;
  function importFile(board, file, point) {
   if (!board || typeof board.pasteItems !== 'function') throw new Error('Invalid active board for import.');
   if (board.transaction) throw new Error('Cannot import board while a transaction is active (board is busy).');
   if (!point || !finiteNumber(point.x) || !finiteNumber(point.y)) throw new Error('Invalid import world point.');
   if (typeof file !== 'string' || !file.length || /\u0000/.test(file)) throw new Error('Invalid board file path.');
   if (/\.pur$/i.test(file)) throw new Error('Native .pur files are not supported. Import a saved .messboard or legacy JSON board.');
   var stat, bytes;
   try { stat = fs.statSync(file); }
   catch (error) { throw new Error('Cannot read board file: ' + error.message); }
   if (!stat.isFile()) throw new Error('Invalid board file: not a regular file.');
   if (stat.size > 10 * 1024 * 1024) throw new Error('Board import size limit: 10 MiB.');
   try { bytes = fs.readFileSync(file); }
   catch (error) { throw new Error('Cannot read board file: ' + error.message); }
   if (bytes.length > 10 * 1024 * 1024) throw new Error('Board import size limit: 10 MiB.');
   var text = typeof bytes === 'string' ? bytes : bytes.toString('utf8');
   var decoded, incoming;
   try { decoded = assets.deserialize(text, file); }
   catch (error) { throw new Error('Invalid board file: ' + error.message); }
   if (decoded && Array.isArray(decoded.items) && decoded.items.length > 10000) throw new Error('Board import item limit: 10000.');
   try { incoming = BoardModel.fromJSON(decoded); }
   catch (error) { throw new Error('Invalid board file: ' + error.message); }
   if (!incoming.items.length) return [];
   incoming.items.forEach(function(item) {
    if (item.type !== 'image') return;
    try { item.missing = !fs.existsSync(item.path) || !fs.statSync(item.path).isFile(); }
    catch (error) { item.missing = true; }
   });
   var bounds = Geometry.sceneBounds(incoming.items);
   var topLeftPoint = {
    x: point.x - (bounds.maxX - bounds.minX) / 2,
    y: point.y - (bounds.maxY - bounds.minY) / 2
   };
   var ids = board.pasteItems({format: 'messboard-items', version: 1, items: incoming.items}, topLeftPoint);
   if (!ids.length) throw new Error('Invalid board geometry: cannot place imported items at this point.');
   return ids;
  }
  return {importFile: importFile};
 }
 return {create: create};
});
