import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
function files(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(root + "/" + entry.name)
      : /\.tsx?$/.test(entry.name)
        ? [root + "/" + entry.name]
        : [],
  );
}
test("paper reader uses readable line widths rather than compressed modules", () => {
  const errors = [];
  for (const file of [...files("src/features/paper-reader"), ...files("src/features/thought-canvas"), ...files("src/features/flashcards")]) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, index) => {
      // Long literal text (including Tailwind classes and URLs) is not executable compression.
      const withoutStrings = line.replace(/"[^"\n]*"|'[^'\n]*'|`[^`\n]*`/g, '"text"');
      if (line.length > 140 && withoutStrings.length > 140) errors.push(`${file}:${index + 1}`);
    });
  }
  assert.deepEqual(errors, []);
});
