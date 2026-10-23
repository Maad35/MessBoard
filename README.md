# MessBoard

Your beautifully messy visual workspace, inside After Effects.

MessBoard is a CEP panel for Adobe After Effects that gives you an
infinite reference board in the spirit of PureRef, without leaving your
composition. Drop in images, videos, notes, and drawings, arrange them
however you like, and send what you need straight into the active comp.

Made by **Maad**. Open source · Not for sale.

Current version: **1.0.0** (see [CHANGELOG.md](CHANGELOG.md))

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

There are two ways to install MessBoard.

**Option A: ZXP package (easiest)**

1. Download `MessBoard-1.0.0.zxp` from this repository.
2. Install it with a free ZXP installer tool, for example
   [Anastasiy's Extension Manager](https://install.anastasiy.com/)
   or the ZXP Installer from aescripts + aeplugins. Select the
   downloaded file in the installer and let it finish.
3. Restart After Effects and open **Window > Extensions > MessBoard**.

The ZXP is signed with a self-signed certificate. The installer
tools above handle that automatically. If the panel does not appear
afterwards, enable unsigned extensions once as described in
Option B, then install the ZXP again.

**Option B: manual folder**

1. Take the `MessBoard-1.0.0` folder from this repository (use the
   green **Code** button above and choose **Download ZIP** if you
   want the whole repository as one file).
2. Copy the `MessBoard-1.0.0` folder into the CEP extensions
   folder (create it if it does not exist):
   - Windows: `%APPDATA%\Adobe\CEP\extensions\`
   - macOS: `~/Library/Application Support/Adobe/CEP/extensions/`
3. The folder install is unsigned, so enable unsigned extensions
   once (standard step for folder-installed CEP panels):
   - Windows: in `HKEY_CURRENT_USER\Software\Adobe\CSXS.10`, add a
     string value named `PlayerDebugMode` set to `1`. Newer After
     Effects versions may also read `CSXS.11` or `CSXS.12`; add the
     same value there if the panel does not appear.
   - macOS: run `defaults write com.adobe.CSXS.10 PlayerDebugMode 1`
     in Terminal.
4. Restart After Effects and open **Window > Extensions > MessBoard**.

## Documentation

The full guide is included in this repository as
`MessBoard-Guide.html`; open it in any web browser. Keyboard
shortcuts are also listed inside the app under
**MessBoard > Keyboard shortcuts**.

## Questions and bug reports

Open an issue in this repository. Please include your After Effects
version, your operating system, and what you were doing when the
problem happened.

## License

Free to use, copy, modify, and distribute under the same terms.
**Not for sale.** No warranty. See `LICENSE` for the full text.

Copyright 2026 Maad.
