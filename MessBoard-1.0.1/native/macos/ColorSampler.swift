// messboard-colorsampler - macOS screen color sampling helper for the MessBoard CEP panel.
//
// Prints exactly six uppercase hex digits (RRGGBB) to stdout and exits 0 when the user picks
// a color. Prints nothing and exits 1 when the user dismisses the sampler. That matches the
// Windows PowerShell eyedropper byte for byte, so cep/js/screen-sampler.js parses one format.
//
// Why a native helper exists: NSColorSampler.show(selectionHandler:) is a completion-handler
// (block) API, and the JXA Objective-C bridge cannot reliably pass blocks to Objective-C
// methods, so `osascript` cannot await the selection. A small signed binary is the honest
// option. See README.md for build, signing and notarization requirements.

import AppKit

// NSColorSampler needs a running AppKit application. .accessory keeps the helper out of the
// Dock and prevents it from stealing focus, so the panel's own UI stays put.
let app = NSApplication.shared
app.setActivationPolicy(.accessory)

func finish(_ hex: String?) -> Never {
    if let hex = hex {
        FileHandle.standardOutput.write(Data((hex + "\n").utf8))
        exit(0)
    }
    // No output at all on cancel: the caller treats non-hex output as a cancellation.
    exit(1)
}

func sample() {
    guard #available(macOS 10.15, *) else {
        finish(nil)
    }
    NSColorSampler().show { color in
        guard let color = color,
              // Convert through sRGB so the printed digits match what the user sees.
              let srgb = color.usingColorSpace(.sRGB) else {
            finish(nil)
        }
        let red = Int((srgb.redComponent * 255).rounded())
        let green = Int((srgb.greenComponent * 255).rounded())
        let blue = Int((srgb.blueComponent * 255).rounded())
        finish(String(format: "%02X%02X%02X", red, green, blue))
    }
}

// The caller enforces its own 30s timeout and kills this process on cancel, so the run loop
// simply waits for the selection handler to call exit().
DispatchQueue.main.async { sample() }
app.run()
