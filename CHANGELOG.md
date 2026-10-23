# Changelog

All notable changes to MessBoard are documented here. Versions follow
[Semantic Versioning](https://semver.org/): patch (1.0.x) for fixes,
minor (1.x.0) for new features, major (x.0.0) for breaking changes.

## [1.0.1] - 2026-10-23

### Changed

- Menus in the top menu bar now open by click only. Previously, once one
  menu was open, hovering a sibling menu opened it automatically. The
  compact "Menu" list at narrow panel widths behaves the same way: its
  menu rows open by click only, never on hover.

## [1.0.0] - 2026-10-23

First versioned release.

### Added

- Infinite reference board inside After Effects: images, notes, drawings,
  board sections, and local and online video cards on a pan-and-zoom canvas.
- Send and Replace to After Effects with smart placement. Notes become
  native AE text layers, and comp frames can be captured at full resolution.
- Boards saved as `.messboard` files, with collect, relink, and ZIP
  package export.
- Items panel with layer list, search, and still first-frame thumbnails
  for GIFs. GIFs keep animating on the board itself.
- Recent boards (up to 3) on the startup screen and in the Board menu.

### Fixed

- GIF thumbnails for the Items panel are now generated when a GIF is
  imported or a board is opened, and for GIFs of any size, instead of
  only lazily when the panel happened to be opened.
- The Items panel no longer flickers when several GIF thumbnails finish
  generating at once. Thumbnail updates are coalesced into a single
  targeted repaint.
- New boards and Save As copies now appear in Recent boards immediately,
  not only after being opened once.
- Tool panels no longer play an entrance animation. In the CEP
  compositor its dropped frames could collapse into a one-frame
  whole-panel flash when a panel opened.
