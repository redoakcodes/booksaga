// Platform detection for conditional feature enabling.
//
// Native spell check (red squiggles) is currently gated to macOS inside Tauri,
// where WKWebView activates Apple's NSSpellChecker when spellcheck="true" is
// set on a contenteditable element.
//
// TODO: implement spell check for Windows (Tauri) and Linux (Tauri).

const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

// navigator.platform is deprecated but reliable for this purpose.
// On macOS it is "MacIntel" or "MacM1" etc.; on iOS it is "iPhone"/"iPad".
const isMac =
  typeof navigator !== "undefined" && /^Mac/.test(navigator.platform);

/** True only when running inside Tauri on macOS. */
export const nativeSpellCheck = isTauri && isMac;
