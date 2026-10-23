/* One native file-dialog layer for every board operation.
   Browser global and CommonJS export are published independently for CEP mixed context. */
(function (root, factory) {
  var value = factory();
  root.FileDialogs = value;
  if (typeof module === 'object' && module.exports) module.exports = value;
})(this, function () {
  'use strict';

  // .messboard leads so the native dialog preselects it; legacy documents stay openable.
  var BOARD_EXTENSIONS = ['messboard', 'aeref.json', 'json', 'aeref'];
  var IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'tif', 'tiff', 'avif', 'heic'];
  // Only containers CEPHtmlEngine can actually decode: H.264 MP4, WebM, OGG.
  var VIDEO_EXTENSIONS = ['mp4', 'webm', 'ogg'];

  function outcome(status, extra) {
    var result = { status: status };
    if (extra) for (var key in extra) if (Object.prototype.hasOwnProperty.call(extra, key)) result[key] = extra[key];
    return result;
  }

  function failure(message) {
    return outcome('failed', { error: new Error(message) });
  }

  function create(options) {
    var deps = options || {};
    // Accept either an explicit api (tests) or the host window (panel).
    var api = deps.api || (deps.host && deps.host.cep ? deps.host.cep.fs : null);
    var pathApi = deps.path;
    // Per-kind memory: choosing an image must not move the next board dialog.
    var directories = Object.create(null);
    var open = false;

    function usable(method) {
      return !!(api && typeof api[method] === 'function');
    }

    function directoryOf(file) {
      if (!pathApi || typeof pathApi.dirname !== 'function') return '';
      try { return pathApi.dirname(file); } catch (error) { return ''; }
    }

    function remember(kind, file) {
      var folder = directoryOf(file);
      if (folder) directories[kind] = folder;
    }

    function initial(request) {
      if (typeof request.directory === 'string' && request.directory) return request.directory;
      return directories[request.kind] || request.defaultDirectory || '';
    }

    // The native call is modal, so one request at a time. The guard is released in
    // every branch, including a throwing host, so a failure cannot wedge the panel.
    function guarded(method, work) {
      if (open) return outcome('busy');
      if (!usable(method)) return outcome('unavailable', { error: new Error('File dialogs are unavailable in this runtime.') });
      open = true;
      try {
        return work();
      } catch (error) {
        // Host messages can quote paths; report a fixed message instead.
        return failure('The system file dialog could not be opened.');
      } finally {
        open = false;
      }
    }

    // `replaces` lists extensions this document type owns. Choosing "Copy.json"
    // in a .messboard dialog must yield Copy.messboard, not Copy.json.messboard.
    function normalize(file, extension, replaces) {
      if (!extension) return file;
      var pattern = '\\.' + extension.replace(/\./g, '\\.') + '$';
      if (new RegExp(pattern, 'i').test(file)) return file;
      for (var i = 0; i < (replaces || []).length; i++) {
        var owned = new RegExp('\\.' + replaces[i].replace(/\./g, '\\.') + '$', 'i');
        if (owned.test(file)) return file.replace(owned, '') + '.' + extension;
      }
      return file + '.' + extension;
    }

    function resolve(request, raw) {
      // A native dialog reports cancel as an empty selection, not as an error.
      if (!raw || !raw.data || (raw.data.length === 0)) {
        return raw && raw.err ? failure('The system file dialog failed · error ' + raw.err) : outcome('canceled');
      }
      if (raw.err) return failure('The system file dialog failed · error ' + raw.err);
      var file = typeof raw.data === 'string' ? raw.data : raw.data[0];
      if (typeof file !== 'string' || !file) return outcome('canceled');
      if (request.extension) file = normalize(file, request.extension, request.replaces);
      if (request.directory === true) directories[request.kind] = file;
      else remember(request.kind, file);
      return outcome('chosen', { path: file });
    }

    return {
      isOpen: function () { return open; },
      save: function (request) {
        request = request || {};
        return guarded('showSaveDialogEx', function () {
          var filter = request.extension ? ['*.' + request.extension] : [];
          var name = request.extension ? normalize(request.name || '', request.extension, request.replaces) : (request.name || '');
          return resolve(request, api.showSaveDialogEx(
            request.title || 'Save', initial(request), filter, name,
            filter[0] || '', request.confirm || 'Save', request.prompt || 'File name'
          ));
        });
      },
      open: function (request) {
        request = request || {};
        return guarded('showOpenDialog', function () {
          // A directory picker must not receive file-type filters.
          var types = request.directory === true ? [] : (request.extensions || []);
          return resolve(request, api.showOpenDialog(
            false, request.directory === true, request.title || 'Open', initial(request), types
          ));
        });
      },
      // Add images is the only multi-selection flow; everything else takes one path.
      openMany: function (request) {
        request = request || {};
        return guarded('showOpenDialog', function () {
          var raw = api.showOpenDialog(true, false, request.title || 'Open', initial(request), request.extensions || []);
          if (!raw || !raw.data || !raw.data.length) {
            return raw && raw.err ? failure('The system file dialog failed · error ' + raw.err) : outcome('canceled');
          }
          if (raw.err) return failure('The system file dialog failed · error ' + raw.err);
          var files = [].slice.call(raw.data).filter(function (file) { return typeof file === 'string' && file; });
          if (!files.length) return outcome('canceled');
          remember(request.kind, files[0]);
          return outcome('chosen', { paths: files });
        });
      }
    };
  }

  return { create: create, BOARD_EXTENSIONS: BOARD_EXTENSIONS, IMAGE_EXTENSIONS: IMAGE_EXTENSIONS, VIDEO_EXTENSIONS: VIDEO_EXTENSIONS };
});
