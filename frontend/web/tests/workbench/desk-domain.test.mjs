import test from "node:test";
import assert from "node:assert/strict";
import { mailDate } from "@/features/workbench/domain/format.js";
import { backgroundProgress, rowMetadata } from "@/features/workbench/domain/presentation.js";
import { canStartOcr, deskSubtitle, ocrAvailability } from "@/features/workbench/domain/desk.js";
import { startDeskOcr } from "@/features/workbench/state/desk-actions.js";
import { createWorkbench } from "@/features/workbench/state/controller.js";

test("Mail dates use today, yesterday, weekdays, month/day and past years", () => {
  const now = new Date(2026, 9, 8, 14, 30);
  const day = (year, month, date, hour = 9, minute = 7) => new Date(year, month - 1, date, hour, minute).toISOString();
  assert.equal(mailDate(day(2026, 10, 8), now), "09:07");
  assert.equal(mailDate(day(2026, 10, 7, 23, 59), now), "昨天");
  assert.equal(mailDate(day(2026, 10, 6), now), "周二");
  assert.equal(mailDate(day(2026, 10, 4), now), "周日");
  assert.equal(mailDate(day(2026, 10, 2), now), "周五");
  assert.equal(mailDate(day(2026, 10, 1), now), "10月1日");
  assert.equal(mailDate(day(2026, 1, 2), now), "1月2日");
  assert.equal(mailDate(day(2025, 12, 31), now), "2025/12/31");
  assert.equal(mailDate(day(2026, 10, 9), now), "10月9日");
  assert.equal(mailDate(day(2025, 12, 31), new Date(2026, 0, 1)), "昨天");
  assert.equal(mailDate(null, now), "");
  assert.equal(mailDate("invalid", now), "");
});

test("Mail date local day boundaries survive DST transitions", () => {
  const prior = process.env.TZ;
  process.env.TZ = "America/Los_Angeles";
  try {
    assert.equal(mailDate("2026-03-08T00:30:00-08:00", new Date("2026-03-09T00:15:00-07:00")), "昨天");
    assert.equal(mailDate("2026-11-01T00:30:00-07:00", new Date("2026-11-02T00:15:00-08:00")), "昨天");
  } finally { if (prior == null) delete process.env.TZ; else process.env.TZ = prior; }
});

test("empty metadata has no lone placeholder in either density", () => {
  const empty = { authors: [], venue_short: "", year: "" };
  assert.equal(rowMetadata(empty), "");
  assert.equal(rowMetadata(empty, true), "");
});

test("dashboard subtitle uses the fixed local date and actual daily counts", () => {
  assert.equal(deskSubtitle({ opened: 3, annotations: 6, notes: 4 }, new Date(2026, 9, 1)), "10月1日 星期四 · 今天打开 3 篇，新增批注 6 条");
  assert.equal(deskSubtitle(undefined, new Date(2026, 9, 1)), "10月1日 星期四");
});

test("OCR availability only accepts ready and explains unavailable modules", () => {
  assert.equal(ocrAvailability([]).ready, null);
  for (const status of ["not_installed", "downloading", "removing", "error"]) assert.equal(ocrAvailability([{ id: "a", status }]).ready, null);
  assert.equal(ocrAvailability([{ id: "a", status: "error", error: "文件缺失" }]).reason, "文件缺失");
  assert.equal(ocrAvailability([{ id: "a", status: "error" }, { id: "b", status: "ready" }]).ready.id, "b");
});

const scan = { id: "a", title: "Scan", attachment_id: "pdf-a", text_status: "needs_ocr" };
test("OCR eligibility excludes missing PDFs, native text and active jobs", () => {
  assert.equal(canStartOcr(scan, []), true);
  assert.equal(canStartOcr({ ...scan, text_status: "partial_needs_ocr" }, []), true);
  assert.equal(canStartOcr({ ...scan, attachment_id: null }, []), false);
  assert.equal(canStartOcr({ ...scan, text_status: "native_text" }, []), false);
  for (const status of ["running", "queued"]) assert.equal(canStartOcr(scan, [{ attachment_id: "pdf-a", status }]), false);
  assert.equal(canStartOcr(scan, [{ attachment_id: "pdf-a", status: "error" }]), true);
});

test("OCR submission rechecks readiness and never invokes any install path", async () => {
  let submits = 0;
  const wb = { api: { ocrModules: async () => ({ modules: [{ id: "module", status: "not_installed" }] }), ocrJobs: async () => ({ jobs: [] }), startOcrJob: async () => { submits += 1; }, installOcr: () => assert.fail("No download allowed") }, refreshAll: async () => {} };
  await assert.rejects(startDeskOcr(wb, [scan]), /尚未安装/);
  assert.equal(submits, 0);
});

test("OCR starts eligible selection once, skips queued items and reports partial failures", async () => {
  const calls = [];
  const wb = { api: {
    ocrModules: async () => ({ modules: [{ id: "local", status: "ready" }] }),
    ocrJobs: async () => ({ jobs: [{ attachment_id: "queued", status: "queued" }] }),
    startOcrJob: async (attachment, module) => { calls.push([attachment, module]); if (attachment === "bad") throw new Error("failed"); },
  }, refreshAll: async () => calls.push("refresh") };
  const result = await startDeskOcr(wb, [scan, scan, { ...scan, attachment_id: "queued" }, { ...scan, attachment_id: "bad", title: "Failed" }]);
  assert.deepEqual(result, { started: 1, failed: ["Failed"] });
  assert.deepEqual(calls, [["pdf-a", "local"], ["bad", "local"], "refresh"]);
});

test("opening a picker result outside all cached lists loads the correct attachment", async () => {
  const requests = [];
  const wb = createWorkbench({ api: {
    item: async (id) => { requests.push(["item", id]); return { id, title: "Uncached", attachments: [{ id: "correct-pdf" }] }; },
    nativeReader: async (id) => { requests.push(["reader", id]); return { attachment: { reader_url: "./reader.html?job_id=test" } }; },
    markOpened: async () => ({}), list: async () => ({ items: [] }),
  } });
  wb.store.actions.detailLoaded({ id: "wrong", title: "Wrong", attachments: [{ id: "wrong-pdf" }] });
  assert.equal(await wb.openReader("right"), true);
  assert.deepEqual(requests, [["item", "right"], ["reader", "correct-pdf"]]);
  assert.equal(wb.store.getSnapshot().tabs[0].itemId, "right");
});

test("dashboard-wide running/queued jobs override stale list fragments in toolbar", () => {
  const progress = backgroundProgress([], [{ id: "stale", title: "stale", translation: { status: "running", percent: 10 } }], {
    running: [{ item_id: "offscreen", title: "Offscreen", percent: 60 }], queued: 2, done: 4, recent_done: null,
  });
  assert.equal(progress.count, 3);
  assert.equal(progress.percent, 20);
  assert.match(progress.title, /Offscreen/);
  assert.doesNotMatch(progress.title, /stale/);
  assert.equal(backgroundProgress([], [], { running: [], queued: 0, done: 4, recent_done: null }), null);
});
