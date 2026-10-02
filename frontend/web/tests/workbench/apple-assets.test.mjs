import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, mkdirSync, copyFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const theme = readFileSync("src/styles/themes/workbench.css", "utf8");
const tokens = (body) => Object.fromEntries([...body.matchAll(/(--wb-[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2]]));
function luminance(hex) {
  const channels = hex.slice(1).match(/../g).map((s) => parseInt(s, 16) / 255).map((n) => n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
function contrast(a, b) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test("Apple text and button tokens meet AA in light and dark surfaces", () => {
  const light = tokens(theme.match(/\[data-wb-theme="light"\]\s*\{([^}]+)\}/)[1]);
  const dark = tokens(theme.match(/\[data-wb-theme="dark"\]\s*\{([^}]+)\}/)[1]);
  for (const palette of [light, dark]) {
    for (const background of ["--wb-panel", "--wb-sidebar", "--wb-panel-2", "--wb-desk-card", "--wb-desk-inset"]) {
      assert.ok(contrast(palette["--wb-text-3"], palette[background]) >= 4.5, `secondary text on ${background}`);
    }
    for (const tool of ["translate", "ai", "import", "ocr", "notes", "glossary"]) assert.ok(contrast(palette["--wb-on-tool"], palette[`--wb-tool-${tool}`]) >= 3, `tool icon ${tool}`);
    assert.ok(contrast(palette["--wb-accent"], palette["--wb-on-accent"]) >= 4.5, "button text contrast");
  }
  assert.deepEqual(tokens(theme.slice(theme.indexOf("@media"))), dark, "system dark matches explicit dark");
});

test("built Inter URLs resolve from both repository and prepare-style copied assets", () => {
  const built = resolve("dist/css/workbench.css");
  const css = readFileSync(built, "utf8");
  const urls = [...css.matchAll(/url\(([^)]+)\)/g)].map((match) => match[1].replace(/["']/g, "")).filter((url) => url.includes("InterVariable"));
  assert.equal(urls.length, 2);
  const target = mkdtempSync(join(tmpdir(), "readflow-fonts-"));
  try {
    const copiedCss = join(target, "dist/css/workbench.css");
    mkdirSync(dirname(copiedCss), { recursive: true });
    copyFileSync(built, copiedCss);
    for (const url of urls) {
      const original = resolve(dirname(built), url);
      assert.match(original, /src\/assets\/fonts\/inter\/InterVariable(?:-Italic)?\.woff2$/);
      const copied = resolve(dirname(copiedCss), url);
      assert.ok(copied.startsWith(target + "/src/assets/"));
      mkdirSync(dirname(copied), { recursive: true });
      copyFileSync(original, copied);
      assert.deepEqual(readFileSync(copied), readFileSync(original));
      assert.equal(readFileSync(copied).subarray(0, 4).toString(), "wOF2");
    }
  } finally { rmSync(target, { recursive: true, force: true }); }
});
