# macOS color sampler helper

`messboard-colorsampler` is the macOS backend for the panel's eyedropper. It prints six
uppercase hex digits (`RRGGBB`) on success and nothing on cancel, which is the same contract
the Windows PowerShell eyedropper uses, so `cep/js/screen-sampler.js` parses one format on
both platforms.

**No compiled binary is committed to this repository.** The helper must be built, signed and
notarized on a Mac before packaging. When the binary is absent, `ScreenSampler.pick` returns an
explicit `SAMPLE_UNAVAILABLE` error rather than failing silently or inventing a color.

## Why a native helper is required

`NSColorSampler.show(selectionHandler:)` (macOS 10.15+) is the system color-sampling interface,
and it is a **completion-handler (block) API** — AppKit calls your block with the selected color
or `nil` on cancel.

- <https://developer.apple.com/documentation/appkit/nscolorsampler/show(selectionhandler:)> —
  "Displays the system color-sampling interface asynchronously and reports the selected color
  back to your app. macOS 10.15+."
- <https://developer.apple.com/documentation/appkit/nscolorsampler> — "When you call the
  `show(selectionHandler:)` method, AppKit shows the system's color sampler interface and reports
  the selected color back to the provided block."

That block is the blocker for a scriptless approach. The JXA Objective-C bridge cannot reliably
pass JavaScript functions as Objective-C block parameters:

- <https://bru6.de/jxa/marrying-jxa-with-objc> — passing code blocks (callbacks) to ObjC methods
  from JXA is documented as unreliable; the global `$.block` helper does not produce a usable
  block, and where function-to-block passing appears to work "the behavior is erratic."

So `osascript`/JXA **cannot** await the selection handler. Faking it (polling, screenshotting,
`Digital Color Meter` automation) would either need Screen Recording permission or return a color
the user never picked. A small, signed, notarized binary is the honest option.

The browser `EyeDropper` API is preferred when available and needs no helper, but it shipped in
Chromium 95 while CEP 11 embeds Chromium 88, so it is absent in the current CEP runtime and is
treated as an optional fast path:

- <https://developer.chrome.com/docs/capabilities/web-apis/eyedropper> — feature-detect with
  `if ('EyeDropper' in window)`; `open()` resolves with `{ sRGBHex }`. Supported on Windows,
  macOS and Linux.
- <https://developer.mozilla.org/en-US/docs/Web/API/EyeDropper> — API reference.
- <https://caniuse.com/?search=eyedropper> — Chromium 95+.
- <https://github.com/Adobe-CEP/CEP-Resources/blob/master/CEP_11.x/Documentation/CEP%2011.1%20HTML%20Extension%20Cookbook.md>
  — CEP 11.1 component table: Chromium 88 (CEP 9 was 61, CEP 10 was 74).

## Build (universal arm64 + x86_64)

Requires Xcode command line tools on macOS 10.15 or later.

```sh
cd cep/native/macos

swiftc -O -target arm64-apple-macos10.15  -o messboard-colorsampler-arm64  ColorSampler.swift
swiftc -O -target x86_64-apple-macos10.15 -o messboard-colorsampler-x86_64 ColorSampler.swift

lipo -create -output messboard-colorsampler \
  messboard-colorsampler-arm64 messboard-colorsampler-x86_64

lipo -info messboard-colorsampler   # expect: arm64 x86_64
rm messboard-colorsampler-arm64 messboard-colorsampler-x86_64
```

`-target ...-macos10.15` sets the deployment target so the binary also runs on older systems;
`NSColorSampler` is guarded with `#available(macOS 10.15, *)` regardless.

## Sign and notarize

Distribute with the hardened runtime enabled, which notarization requires:

```sh
codesign --force --timestamp --options runtime \
  --sign "Developer ID Application: YOUR NAME (TEAMID)" \
  messboard-colorsampler

codesign -dvvv --verbose=4 messboard-colorsampler   # expect: flags=0x10000(runtime), universal
```

A bare command line tool cannot be notarized on its own — submit it inside a zip or a signed
installer package:

```sh
ditto -c -k --keepParent messboard-colorsampler messboard-colorsampler.zip

xcrun notarytool submit messboard-colorsampler.zip \
  --keychain-profile "AC_NOTARY" --wait
```

Notes:

- `xcrun stapler` cannot staple a standalone executable. Ship the helper inside the signed and
  notarized extension/installer payload so Gatekeeper evaluates it there, or staple the enclosing
  `.pkg`/`.app`.
- Store the App Store Connect API key once with
  `xcrun notarytool store-credentials "AC_NOTARY" --key ... --key-id ... --issuer ...`.
- References:
  - <https://developer.apple.com/documentation/xcode/embedding-a-helper-tool-in-a-sandboxed-app>
  - <https://eclecticlight.co/2020/08/27/building-and-notarizing-command-tools-as-universal-binaries/>
  - <https://scriptingosx.com/2023/08/build-a-notarized-package-with-a-swift-package-manager-executable/>

## Packaging and permissions

- The binary must land at `<extensionPath>/native/macos/messboard-colorsampler` with the execute
  bit set (`chmod 755`). `ScreenSampler` probes exactly that path via the injected `fs`/`path`
  and `extensionPath`; it never searches elsewhere and never runs a compiler at runtime.
- If the CEP extension itself is signed with `ZXPSignCmd`, add the helper before signing so it is
  covered by the signature.
- `NSColorSampler` does **not** require Screen Recording permission, which is the main reason to
  prefer it over a `CGDisplayCreateImage`/ScreenCaptureKit screenshot approach.

## Manual verification (macOS only, cannot run on Windows CI)

```sh
./messboard-colorsampler ; echo "exit=$?"
```

Expect the system magnifier; clicking prints e.g. `1A2B3C` with `exit=0`, and pressing Escape
prints nothing with `exit=1`.
