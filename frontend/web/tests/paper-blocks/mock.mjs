import { readFile } from "node:fs/promises";
import { sourceRuns } from "../../src/features/paper-blocks/domain/model.js";
export async function blocksMock(query) {
  const fixture = query.includes("blocks");
  const manifest = fixture ? JSON.parse(await readFile("tests/fixtures/blocks/manifest.json", "utf8")) : null;
  let document = null,
    result = null,
    language = "zh-CN",
    fail = false,
    ticks = 0;
  const jobs = [],
    requests = [];
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
      renderer_ready: true,
      language: requestedLanguage,
      has_translation: requestedLanguage === language && Boolean(document?.blocks.some((b) => b.translation)),
    };
  };
  return {
    requests: () => requests,
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
              }
            : old || block;
        }),
      };
      if (!request.block_id) result = { revision: String(ticks), language, fallback_blocks: [] };
      Object.assign(job, { phase: "完成", status: "done", percent: 100 });
    },
    async route(route) {
      const url = new URL(route.request().url()),
        path = url.pathname;
      if (!/^\/api\/research\/workbench\/items\/[^/]+\/blocks(?:\/|$)/.test(path)) return false;
      if (path.endsWith("/files/translated.pdf")) {
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
