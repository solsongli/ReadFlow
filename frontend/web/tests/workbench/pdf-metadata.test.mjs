import test from "node:test";
import assert from "node:assert/strict";
import { titleNeedsPdfReview } from "../../src/features/workbench/domain/pdf-metadata.js";

test("PDF title proposals are limited to filenames, identifiers and metadata placeholders", () => {
  for (const title of [
    "2406.09246",
    "paper.pdf",
    "Anonymous-file",
    "10.48550/arXiv.2406.09246",
    "LaTeX with hyperref",
  ])
    assert.equal(titleNeedsPdfReview(title, ["Anonymous-file.pdf"]), true);
  assert.equal(titleNeedsPdfReview("A title written by the user", ["2406.09246.pdf"]), false);
  assert.equal(titleNeedsPdfReview("", ["download.pdf"]), true);
});

test("metadata review includes empty and placeholder fields without requiring a filename title", async () => {
  const { metadataNeedsPdfReview, metadataValue } =
    await import("../../src/features/workbench/domain/pdf-metadata.js");
  const item = {
    title: "My title",
    authors: ["Actual Author"],
    attachments: [{ filename: "download.pdf" }],
    doi: "10.1234/manual",
    url: "https://example.test",
    date: "2019",
  };
  assert.equal(metadataNeedsPdfReview(item, "Journal"), false);
  assert.equal(metadataNeedsPdfReview({ ...item, authors: ["Anonymous Submission"] }, "Journal"), true);
  assert.equal(metadataNeedsPdfReview({ ...item, doi: "" }, "Journal"), true);
  assert.equal(metadataNeedsPdfReview({ ...item, authors: ["Actual Author", "Unknown"] }, "Journal"), false);
  assert.equal(metadataNeedsPdfReview({ ...item, attachments: [], doi: "" }, "Journal"), false);
  assert.equal(metadataValue([]), "空");
  assert.equal(metadataValue(["Alice Example", "Bob Researcher"]), "Alice Example、Bob Researcher");
});
