import { readFile } from "node:fs/promises";
import { sourceRuns } from "../../src/features/paper-blocks/domain/model.js";
export async function blocksMock(query, suppliedManifest) {
  const fixture = query.includes("blocks");
  const corpus = new URLSearchParams(query.replace(/^\?/, "")).get("corpus");
  const manifest =
    suppliedManifest ||
    (fixture
      ? JSON.parse(
          await readFile(
            corpus ? `/tmp/readflow-x6/${corpus}/manifest.json` : "tests/fixtures/blocks/manifest.json",
            "utf8",
          ),
        )
      : null);
  if (manifest && query.includes("x2")) {
    const figure = manifest.blocks.find((block) => block.type === "figure");
    figure.figure_text = [
      { id: "label", text: "Training input", translatable: true },
      { id: "tick", text: "100%", translatable: false },
    ];
  }
  let document = null,
    result = null,
    language = "zh-CN",
    fail = false,
    ticks = 0;
  if (manifest && query.includes("x6")) {
    document = structuredClone(manifest);
    if (!corpus)
      document.blocks.forEach((block, index) => {
        if (
          ["title", "heading", "text", "caption", "abstract", "list", "footnote"].includes(block.type) &&
          index % 3 !== 2
        ) {
          block.translation =
            "【译】" +
            "这是一段用于离线验收的中文译文，保留原论文布局与数学结构。".repeat(
              Math.max(1, Math.ceil(block.text.length / 120)),
            );
          block.translation_runs = [
            { kind: "text", text: block.translation },
            { kind: "sub", text: "i" },
            { kind: "super", text: "2" },
          ];
          block.translation += "i2";
        }
        if (["figure", "table"].includes(block.type) && block.figure_text?.length) {
          block.figure_text[0].translation = "训练输入";
        }
      });
  }
  if (query.includes("x7")) {
    result = {
      revision: "layout-test",
      language,
      layout_ready: true,
      aligned_ready: true,
      reflow_ready: true,
    };
    const label = document?.blocks.find((b) => b.type === "figure" && b.figure_text?.length)?.figure_text[0];
    if (label) label.translation = "这是用于检查自动缩小和完整悬停提示的较长图内标签";
  }
  const jobs = [],
    requests = [];
  let terms = { entries: [], revision: 0, prepared: false };
  let qa;
  if (query.includes("x8")) {
    terms = { entries: [{ source: "policy", target: "策略", keep: false }], revision: 1, prepared: true };
    qa = { checked: 8, retried: 2, needs_review: 1 };
    const review = document?.blocks.find((b) => b.type === "text");
    if (review) {
      review.qa = { issues: ["numbers"], retried: true };
      review.translation_runs = [
        { kind: "text", text: "任务。", bold: true },
        ...(review.translation_runs || []),
      ];
      review.translation = review.translation_runs.map((r) => r.text).join("");
    }
  }
  if (query.includes("x9")) {
    terms = {
      entries: [
        { source: corpus ? "robot" : "method", target: "机器人方法", kind: "term" },
        {
          source: corpus === "2304.02643" ? "segmentation" : corpus ? "policy" : "model",
          target: "控制策略",
          kind: "term",
        },
      ],
      revision: 1,
      prepared: true,
    };
    if (document)
      for (const block of document.blocks) {
        if (["title", "heading", "abstract", "text", "caption"].includes(block.type)) {
          block.translation =
            (block.type === "heading" ? "【译】章节：" : "【译】") +
            "机器人方法与控制策略用于研究与验证。".repeat(Math.max(1, Math.ceil(block.text.length / 80)));
          block.translation_runs = [{ kind: "text", text: block.translation }];
        }
      }
  }
  if (query.includes("summary")) {
    qa = { checked: 345, retried: 24, needs_review: 6 };
    result = {
      revision: "summary",
      language,
      layout_ready: true,
      aligned_ready: true,
      reflow_ready: true,
      qa,
      layout_overflow: ["a"],
      layout_truncated: ["a"],
      layout_render_fallback: ["b"],
      layout_label_fallback: ["c", "d"],
      label_fallback: ["e"],
      render_fallback: [],
    };
  }
  if (query.includes("repaired-sam")) {
    document = JSON.parse(await readFile("/tmp/readflow-x9b/sam-final/ui-document.json", "utf8"));
  }
  if (query.includes("diagnostics")) {
    const detail = { stage: "terms", exception: "ConnectTimeout" };
    result = {
      revision: "diagnostics",
      language,
      layout_ready: true,
      aligned_ready: true,
      reflow_ready: true,
      error: { code: "network", message: "无法连接模型服务或请求超时", details: detail },
      diagnostics: [detail],
    };
    jobs.push({
      id: "failed",
      scope: "full",
      phase: "失败",
      status: "failed",
      percent: 0,
      error: result.error,
      diagnostics: [detail],
    });
  }
  const active = (job) => ["running", "queued", "cancelling"].includes(job.status);
  const state = (requestedLanguage) => {
    const current = jobs.filter(active);
    return {
      document:
        requestedLanguage === language
          ? document
          : document && {
              ...document,
              blocks: document.blocks.map((b) => ({
                ...b,
                translation: undefined,
                translation_runs: undefined,
              })),
            },
      job: current.find((j) => j.scope === "full") || current[0] || jobs.at(-1) || null,
      jobs,
      result,
      terms,
      qa,
      renderer_ready: true,
      language: requestedLanguage,
      has_translation: requestedLanguage === language && Boolean(document?.blocks.some((b) => b.translation)),
    };
  };
  return {
    requests: () => requests,
    legacy() {
      result = { revision: "legacy", language };
    },
    publishBatch(text = "【首批译文】") {
      const job = jobs.find((j) => active(j) && j.scope === "full");
      if (!job) return;
      document = {
        ...manifest,
        blocks: manifest.blocks.map((block) =>
          block.type === "text"
            ? {
                ...block,
                translation: text + block.text,
                translation_runs: [{ kind: "text", text }, ...sourceRuns(block)],
              }
            : block,
        ),
      };
      Object.assign(job, { phase: "翻译", percent: 55, notices: ["thinking_unsupported"] });
    },
    rendering() {
      const job = jobs.find((j) => active(j) && j.scope === "full");
      if (job) Object.assign(job, { phase: "正在排版译文 PDF", percent: 90 });
    },
    fail: () => {
      fail = true;
    },
    finish(id = jobs.at(-1)?.id) {
      const job = jobs.find((j) => j.id === id);
      if (!job || !active(job)) return;
      if (fail) {
        Object.assign(job, {
          status: "failed",
          phase: "失败",
          error: { code: "network", message: "无法连接模型服务。" },
        });
        fail = false;
        return;
      }
      const request = requests.find((r) => r.id === id);
      language = request.language || "zh-CN";
      document = {
        ...manifest,
        blocks: manifest.blocks.map((block) => {
          const selected = request.block_id
            ? [request.block_id, manifest.blocks.find((b) => b.id === request.block_id)?.caption_id]
            : null;
          const old = document?.blocks.find((b) => b.id === block.id);
          return !selected || selected.includes(block.id)
            ? {
                ...block,
                translation: "【译】" + block.text,
                translation_runs: [{ kind: "text", text: "【译】" }, ...sourceRuns(block)],
                figure_text: block.figure_text?.map((label) => ({
                  ...label,
                  translation: label.translatable ? "训练输入" : "",
                })),
              }
            : old || block;
        }),
      };
      if (!request.block_id)
        result = {
          revision: String(ticks),
          language,
          fallback_blocks: [],
          usage: { total_tokens: 842 },
        };
      if (!request.block_id && query.includes("x2c"))
        result = {
          revision: String(ticks),
          language,
          translation_fallback: [],
          render_fallback: ["missing-asset"],
          label_fallback: ["figure"],
          usage: { total_tokens: 842, reasoning_tokens: 512 },
        };
      Object.assign(job, { phase: "完成", status: "done", percent: 100 });
    },
    async route(route) {
      const url = new URL(route.request().url()),
        path = url.pathname;
      if (!/^\/api\/research\/workbench\/items\/[^/]+\/blocks(?:\/|$)/.test(path)) return false;
      if (/\/files\/[a-f0-9]{24}\.png$/.test(path)) {
        if (
          query.includes("auth-thumbs") &&
          route.request().headers()["x-api-key"] !== "offline-thumbnail-fixture"
        ) {
          await route.fulfill({ status: 401 });
          return true;
        }
        await route.fulfill({
          body: await readFile(
            `/tmp/readflow-x6/${corpus ? corpus + "/" : ""}assets/${path.split("/").at(-1)}`,
          ),
          contentType: "image/png",
        });
      } else if (/\/files\/[a-f0-9]{24}\.pdf$/.test(path)) {
        await route.fulfill({
          body: await readFile(
            `/tmp/readflow-x6/${corpus ? corpus + "/" : ""}assets/${path.split("/").at(-1)}`,
          ),
          contentType: "application/pdf",
        });
      } else if (path.endsWith("/files/translated-layout.pdf")) {
        await route.fulfill({
          body: await readFile("tests/fixtures/blocks/translated.pdf"),
          contentType: "application/pdf",
        });
      } else if (path.endsWith("/files/translated-aligned.pdf")) {
        await route.fulfill({
          body: await readFile("tests/fixtures/blocks/translated.pdf"),
          contentType: "application/pdf",
        });
      } else if (path.endsWith("/files/translated.pdf")) {
        await route.fulfill({
          body: await readFile("tests/fixtures/blocks/translated.pdf"),
          contentType: "application/pdf",
        });
      } else if (path.endsWith("/extract")) {
        document = document || structuredClone(manifest);
        const job = {
          id: `extract-${++ticks}`,
          scope: "extract",
          phase: "已提取",
          status: "done",
          percent: 100,
        };
        jobs.push(job);
        await route.fulfill({ status: 202, json: job });
      } else if (path.endsWith("/terms")) {
        const body = route.request().postDataJSON();
        terms = {
          entries: body.entries,
          revision: terms.revision + 1,
          prepared: true,
          affected: [document.blocks.find((b) => b.type === "text").id],
        };
        await route.fulfill({ json: terms });
      } else if (path.endsWith("/recheck")) {
        qa = { checked: 8, retried: 0, needs_review: 0 };
        await route.fulfill({ json: { qa, model_requests: 0 } });
      } else if (path.endsWith("/render")) {
        requests.push({ render_only: true, ...route.request().postDataJSON() });
        result = {
          revision: "local-render",
          language,
          layout_ready: true,
          aligned_ready: true,
          reflow_ready: true,
        };
        const job = { id: "local-render", scope: "full", phase: "完成", status: "done", percent: 100 };
        jobs.push(job);
        await route.fulfill({ status: 202, json: job });
      } else if (path.endsWith("/translate")) {
        const body = route.request().postDataJSON();
        const scope = body.block_id ? "block" : "full";
        let job = jobs.find((j) => active(j) && j.scope === scope && j.block_id === body.block_id);
        if (!job) {
          job = {
            id: String(++ticks),
            scope,
            block_id: body.block_id,
            phase: "翻译",
            percent: 35,
            status: "running",
          };
          requests.push({ ...body, id: job.id });
          jobs.push(job);
        }
        document = document || structuredClone(manifest);
        await route.fulfill({ status: 202, json: job });
      } else if (path.endsWith("/cancel")) {
        const job = jobs.find((j) => j.id === path.split("/").at(-2));
        Object.assign(job, { phase: "已取消", status: "cancelled", percent: 35 });
        await route.fulfill({ json: job });
      } else if (path.endsWith("/latex")) {
        await route.fulfill({ body: Buffer.from("synthetic-zip"), contentType: "application/zip" });
      } else {
        await route.fulfill({ json: state(url.searchParams.get("language") || "zh-CN") });
      }
      return true;
    },
  };
}
