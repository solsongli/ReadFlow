import { parseWorkbenchEmbed } from "@retainpdf/reader/contracts";

/** Only the host knows where its bundled UI fonts are served. No global/legacy styles change. */
export function loadWorkbenchReaderFonts(win: Window = window) {
  if (!parseWorkbenchEmbed(win.location.search) || typeof FontFace === "undefined" || !win.document.fonts) return;
  for (const [file, style] of [["InterVariable.woff2", "normal"], ["InterVariable-Italic.woff2", "italic"]]) {
    const url = new URL(`./src/assets/fonts/inter/${file}`, win.location.href);
    const face = new FontFace("ReadFlow Inter", `url("${url.href}")`, { style, weight: "100 900", display: "swap" });
    win.document.fonts.add(face);
    void face.load().catch(() => undefined);
  }
}

export function notifyWorkbenchNotesChanged(itemId: string, win: Window = window) {
  const embed = parseWorkbenchEmbed(win.location.search);
  if (!embed || embed.itemId !== itemId || win.parent === win) return;
  win.parent.postMessage({ type: "readflow:notes-changed", itemId }, win.location.origin);
}
