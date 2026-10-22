# MessBoard

Your beautifully messy visual workspace, inside After Effects.

MessBoard is a CEP panel for Adobe After Effects that gives you an
infinite reference board in the spirit of PureRef, without leaving your
composition. Drop in images, videos, notes, and drawings, arrange them
however you like, and send what you need straight into the active comp.

Made by **Maad**. Open source · Not for sale.

## Features

- Infinite canvas with pan, zoom, grid, and board sections that frame
  and carry related references together
- Images, sticky notes with rich styling, freehand drawing and shapes
  with an input smoothing slider, and link cards
- Local videos (MP4/WebM) and YouTube links that play right on the board
  with a custom control bar, plus freeze-frame thumbnails in the Items
  panel
- Send to After Effects with `I`, Replace with `Shift+I`, with smart
  placement above the selected layer and matching in/out points
- Lossless comp frame capture at full composition resolution
- Color palette extraction from any reference image
- Autosave with recovery, recent boards, collect and relink, and ZIP
  export of a board with its assets

## Requirements

- Adobe After Effects 2020 (17.0) or newer
- Windows or macOS

## Installation

1. Download the release and unzip it. You get a `MessBoard-1.0.0`
   folder; the extension itself is the inner folder of the same name.
2. Copy the inner `MessBoard-1.0.0` folder into the CEP extensions
   folder (create it if it does not exist):
   - Windows: `%APPDATA%\Adobe\CEP\extensions\`
   - macOS: `~/Library/Application Support/Adobe/CEP/extensions/`
3. MessBoard is distributed unsigned, so enable unsigned extensions
   once (standard step for folder-installed CEP panels):
   - Windows: in `HKEY_CURRENT_USER\Software\Adobe\CSXS.10`, add a
     string value named `PlayerDebugMode` set to `1`. Newer After
     Effects versions may also read `CSXS.11` or `CSXS.12`; add the
     same value there if the panel does not appear.
   - macOS: run `defaults write com.adobe.CSXS.10 PlayerDebugMode 1`
     in Terminal.
4. Restart After Effects and open **Window > Extensions > MessBoard**.

## Documentation

The full guide ships in the release next to the extension folder as
`MessBoard-Guide.html`. Keyboard shortcuts are also listed inside the
app under **MessBoard > Keyboard shortcuts**.

## Development

- `cep/` is the extension source (panel in vanilla JS with no bundler,
  `jsx/host.jsx` is the ExtendScript host and must stay ES3-safe)
- `tests/` holds the test suite: `node --test tests/*.test.js`
- `npm run check` verifies the build contract (required files present,
  all JavaScript parses)
- `HANDOFF.md` documents the architecture, the hard constraints, and
  the behavior decisions that must not change silently

## License

Free to use, copy, modify, and distribute under the same terms.
**Not for sale.** No warranty. See `LICENSE` for the full text.

Copyright 2026 Maad.
