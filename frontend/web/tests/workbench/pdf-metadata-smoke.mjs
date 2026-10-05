import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { readerBrowser } from "../paper-reader/browser.mjs";

const output = "/tmp/readflow-x5b/screenshots";
await mkdir(output, { recursive: true });
const { browser, page, errors, unexpected } = await readerBrowser(
  "",
  "tests/paper-reader/integration-fixture.tsx",
);
try {
  await page.getByRole("option", { name: "Paper a", exact: true }).waitFor();
  await page.evaluate(async () => {
    const { wb, rows, calls } = window.fixture;
    Object.assign(rows[0], {
      title: "2406.09246",
      authors: ["Anonymous Submission"],
      date: "",
      year: "",
      doi: "",
      url: "",
      venue: "",
    });
    Object.assign(rows[1], { doi: "10.1234/manual", url: "https://example.test/paper" });
    const fields = {
      title: "OpenVLA: An Open-Source Vision-Language-Action Model",
      authors: ["Moo Jin Kim", "Chelsea Finn"],
      date: "2024",
      doi: "10.48550/arXiv.2406.09246",
      url: "https://arxiv.org/abs/2406.09246",
      venue: "arXiv",
    };
    const changes = Object.entries(fields).map(([field, after]) => ({
      field,
      before: structuredClone(rows[0][field]),
      after,
    }));
    wb.api.item = async (id) => ({
      ...rows.find((r) => r.id === id),
      notes: [],
      abstract: "",
      attachments: [{ id, filename: id === "a" ? "2406.09246.pdf" : "download.pdf" }],
    });
    wb.api.pdfMetadata = async (id) => {
      calls.push(["proposal", id]);
      return {
        eligible: true,
        title: { value: fields.title, confidence: 0.95 },
        changes,
        token: "a".repeat(64),
      };
    };
    wb.api.applyPdfMetadata = async (id, token) => {
      calls.push(["apply", id, token]);
      const row = rows.find((r) => r.id === id);
      assertTitle(token === "a".repeat(64));
      Object.assign(row, fields, { year: "2024", venue_short: "arXiv" });
      return wb.api.item(id);
    };
    function assertTitle(condition) {
      if (!condition) throw new Error("Stale fixture title");
    }
    await wb.refreshAll();
  });
  await page.getByRole("option", { name: "2406.09246", exact: true }).click();
  const apply = page.getByRole("button", { name: "使用 PDF 中识别的信息", exact: true });
  await apply.waitFor();
  const preview = page.getByLabel("PDF 识别建议");
  for (const field of ["题名", "作者", "DOI", "URL", "日期", "出处"])
    assert.equal(await preview.locator("dt", { hasText: field }).count(), 1);
  await preview.scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(() => window.fixture.rows[0].title), "2406.09246");
  assert.equal(await page.evaluate(() => window.fixture.calls.filter((c) => c[0] === "apply").length), 0);
  await page.screenshot({ path: output + "/pdf-title-light.png", animations: "disabled" });
  await page.evaluate(() => window.fixture.wb.setPrefs({ theme: "dark" }));
  await page.waitForFunction(() => document.documentElement.dataset.wbTheme === "dark");
  await page.screenshot({ path: output + "/pdf-title-dark.png", animations: "disabled" });
  await apply.click();
  await page
    .getByRole("option", { name: "OpenVLA: An Open-Source Vision-Language-Action Model", exact: true })
    .waitFor();
  await apply.waitFor({ state: "hidden" });
  const saved = await page.evaluate(() => window.fixture.rows[0]);
  assert.deepEqual(saved.authors, ["Moo Jin Kim", "Chelsea Finn"]);
  assert.equal(saved.doi, "10.48550/arXiv.2406.09246");
  assert.equal(saved.url, "https://arxiv.org/abs/2406.09246");
  assert.equal(saved.date, "2024");
  assert.equal(saved.venue, "arXiv");
  assert.equal(await page.evaluate(() => window.fixture.calls.filter((c) => c[0] === "apply").length), 1);
  await page.getByRole("option", { name: "Paper b", exact: true }).click();
  assert.equal(await apply.count(), 0);
  assert.equal(
    await page.evaluate(() => window.fixture.calls.some((c) => c[0] === "proposal" && c[1] === "b")),
    false,
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(unexpected, []);
  console.log(
    "PASS: six-field readonly preview, explicit apply, user-field preservation, light/dark inspector",
  );
} finally {
  await browser.close();
}
