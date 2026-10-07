import { readFile, writeFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
import { readerBrowser } from "./browser.mjs";
import { resolve } from "node:path";
const output = resolve(process.env.READFLOW_X11_OUTPUT_DIR || "/tmp/readflow-x11");
await mkdir(output, { recursive: true });
const before = process.argv.includes("--before");
const plugins = before
  ? [
      {
        name: "prior-selection-observers",
        setup(build) {
          build.onLoad({ filter: /SelectionTools\.tsx$|useAnnotationReader\.ts$/ }, async ({ path }) => {
            let contents = await readFile(path, "utf8");
            contents = contents.replace(
              "return settledSelection(() => root.current, selection);",
              'document.addEventListener("selectionchange", selection); return () => document.removeEventListener("selectionchange", selection);',
            );
            contents = contents.replace(
              "const stopSelection = settledSelection(() => root.current, capture);",
              'document.addEventListener("selectionchange",capture); const stopSelection=()=>document.removeEventListener("selectionchange",capture);',
            );
            return { contents, loader: path.endsWith("tsx") ? "tsx" : "ts" };
          });
        },
      },
    ]
  : [];
const e = await readerBrowser("", "tests/paper-reader/fixture.tsx", { dpr: 1, plugins });
try {
  await e.page.waitForTimeout(300);
  const points = await e.page.evaluate(() => {
    const spans = [...document.querySelector(".pr-text-layer").querySelectorAll("span")].filter(
      (s) => s.textContent.trim() && s.getBoundingClientRect().bottom < innerHeight - 80,
    );
    const a = spans[0].getBoundingClientRect(),
      b = spans[Math.min(8, spans.length - 1)].getBoundingClientRect();
    window.fixture.commits = 0;
    window.probe = { frames: [], tasks: [], changes: 0 };
    let running = true,
      previous;
    function frame(t) {
      if (previous) window.probe.frames.push(t - previous);
      previous = t;
      if (running) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    const o = new PerformanceObserver((l) =>
      window.probe.tasks.push(...l.getEntries().map((x) => x.duration)),
    );
    o.observe({ type: "longtask" });
    document.addEventListener("selectionchange", () => window.probe.changes++);
    window.stopProbe = () => {
      running = false;
      o.disconnect();
    };
    return {
      start: { x: a.left + 2, y: a.top + a.height / 2 },
      end: { x: b.right - 2, y: b.top + b.height / 2 },
    };
  });
  await e.page.mouse.move(points.start.x, points.start.y);
  await e.page.mouse.down();
  await e.page.mouse.move(points.end.x, points.end.y, { steps: 120 });
  const dragCommits = await e.page.evaluate(() => window.fixture.commits);
  await e.page.mouse.up();
  await e.page.waitForTimeout(150);
  const result = await e.page.evaluate(() => {
    window.stopProbe();
    const p = window.probe;
    p.frames.sort((a, b) => a - b);
    return {
      longTasks: p.tasks.length,
      maxTaskMs: Math.max(0, ...p.tasks),
      frames: p.frames.length,
      p50Ms: p.frames[Math.floor(p.frames.length * 0.5)],
      p95Ms: p.frames[Math.floor(p.frames.length * 0.95)],
      selectionChanges: p.changes,
      selectedChars: getSelection().toString().length,
    };
  });
  result.dragCommits = dragCommits;
  assert.ok(result.selectedChars > 50);
  assert.deepEqual(e.errors, []);
  await writeFile(`${output}/selection-${before ? "before" : "after"}.json`, JSON.stringify(result, null, 2));
  console.log(result);
  if (!before) assert.ok(dragCommits <= 2);
} finally {
  await e.browser.close();
}
