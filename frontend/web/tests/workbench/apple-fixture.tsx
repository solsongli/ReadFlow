// Offline browser fixture: real workbench components, an in-memory API, no backend or credentials.
import { createSettingsServices } from "@/features/workbench/state/settings-services.js";
import { createSettingsGlossaries } from "@/features/workbench/state/settings-glossaries.js";
import { createRoot } from "react-dom/client";
import { createWorkbench, WorkbenchProvider, WorkbenchShell } from "@/features/workbench/index.js";

function fixture() {
  const dashboard = new URL(location.href).searchParams.has("desk");
  const settings = { ocrStatus: "ready", ocrError: "", failOcr: false, failList: false, failDesk: false, offline: false, failWrite: false };
  const titles = [
    ["SafeVLA: Towards Safety Alignment of Vision-Language-Action Model via Constrained Learning", "SafeVLA：基于约束学习的视觉-语言-动作模型安全对齐"],
    ["OpenVLA: An Open-Source Vision-Language-Action Model", "OpenVLA：开源的视觉-语言-动作模型"],
    ["π0: A Vision-Language-Action Flow Model for General Robot Control", "π0：面向通用机器人控制的视觉-语言-动作流模型"],
    ["RT-2: Vision-Language-Action Models Transfer Web Knowledge to Robotic Control", "RT-2：视觉-语言-动作模型将网络知识迁移到机器人控制"],
    ["Octo: An Open-Source Generalist Robot Policy", ""],
    ["Diffusion Policy: Visuomotor Policy Learning via Action Diffusion", "扩散策略：基于动作扩散的视觉运动策略学习"],
    ["Open X-Embodiment: Robotic Learning Datasets and RT-X Models", "Open X-Embodiment：机器人学习数据集与 RT-X 模型"],
    ["Mobile ALOHA: Learning Bimanual Mobile Manipulation with Low-Cost Whole-Body Teleoperation", "Mobile ALOHA：借助低成本全身遥操作学习双臂移动操作"],
    ["Learning Fine-Grained Bimanual Manipulation with Low-Cost Hardware", "用低成本硬件学习精细的双臂操作"],
    ["RT-1: Robotics Transformer for Real-World Control at Scale", "RT-1：面向大规模真实世界控制的机器人 Transformer"],
    ["Safe RLHF: Safe Reinforcement Learning from Human Feedback", "Safe RLHF：基于人类反馈的安全强化学习"],
  ];
  const rows = titles.map(([title, title_translated], index) => ({
    id: String(index + 1), title, title_translated, item_type: "preprint",
    authors: index === 0 ? ["Borong Zhang", "Yuhao Zhang", "Jiaming Ji", "Yingshan Lei"] : ["Moo Jin Kim", "Ada Li"],
    date: "2025-03-05", year: String(2025 - index % 3), venue: "arXiv", venue_short: "arXiv",
    doi: "10.48550/arXiv.2503.03480", url: "", tags: index === 0 ? ["安全", "方法"] : [],
    group_ids: index === 0 ? ["vla", "safe", "ch2"] : index < 5 ? ["vla"] : [],
    citekey: `zhang2025paper${index}`, citekey_pinned: false, attachment_count: 1, attachment_id: `pdf${index}`,
    document_id: `doc${index}`, page_count: 32, text_status: "native_text", notes_count: index % 4, annotations_count: 0,
    starred: false, read_status: index === 0 ? "read" : "unread", read_page: null, read_pages: 32, last_opened_at: null,
    deleted_at: null, source: "pdf", translation: { status: index === 0 ? "done" : index === 1 ? "running" : index === 2 ? "queued" : index === 3 ? "failed" : "none", percent: index === 1 ? 62 : null },
    created_at: `2026-09-${String(30 - index).padStart(2, "0")}T12:00:00`, updated_at: "2026-09-30T12:00:00",
  }));
  if (dashboard) {
    rows[0].text_status = "needs_ocr";
    rows[3].text_status = "partial_needs_ocr";
    rows[3].doi = "";
    for (const [index, row] of rows.slice(0, 3).entries()) {
      Object.assign(row, { last_opened_at: "2026-10-02T09:30:00", read_status: "reading", read_page: [3, 13, 24][index], read_pages: 32 });
    }
  }
  if (new URL(location.href).searchParams.has("large")) {
    const base = rows[0]; rows.splice(0, rows.length, ...Array.from({ length: 2000 }, (_, i) => ({ ...base, id: String(i + 1), title: `Research paper ${String(i + 1).padStart(4, "0")} — A long synthetic English title for windowing`, title_translated: i % 2 ? `第 ${i + 1} 篇合成文献的长中文题名，用于检查截断与悬停提示` : "", group_ids: i % 3 ? ["vla", "safe"] : ["ch2"], translation: { status: "none" }, notes_count: 0 })));
  }
  const emptySeed = { ...rows[0] };
  if (new URL(location.href).searchParams.has("empty")) rows.splice(0);
  const groups = [
    { id: "vla", name: "具身智能 · VLA", parent_id: null, count: 5, direct_count: 5 },
    { id: "safe", name: "安全对齐", parent_id: "vla", count: 1, direct_count: 1 },
    { id: "thesis", name: "毕业论文", parent_id: null, count: 1, direct_count: 0 },
    { id: "ch2", name: "第二章 相关工作", parent_id: "thesis", count: 1, direct_count: 1 },
    { id: "meeting", name: "组会 10-08", parent_id: null, count: 0, direct_count: 0 },
  ];
  const tags = ["待精读", "方法", "综述", "安全", "机器人", "视觉", "语言", "行动", "数据集", "基准"].map((name) => ({ name, count: 1 }));
  if (new URL(location.href).searchParams.has("empty")) { groups.splice(0); tags.splice(0); }
  const jobs = [];
  const calls = [];
  const item = (id) => ({ ...rows.find((r) => r.id === id), attachments: [{ id: rows.find((r) => r.id === id)?.attachment_id }], notes: [], abstract: "Vision-language-action models (VLAs) show potential as generalist robot policies. However, these models pose extreme safety challenges during real-world deployment, including the risk of harm to the environment, the robot itself, and humans. How can safety constraints be explicitly integrated into VLAs without loss of performance? ".repeat(3) });
  const api = {
  async pdfMetadata() { return { eligible: false, title: null, changes: [], token: null }; },
    async notes() { return { items: [], total: 0, counts: { total: 0, notes: 0, annotations: 0 } }; },
    async list(query) {
      calls.push({ method: "list", query });
      if (settings.offline) throw Object.assign(new Error("本地服务暂不可用"), { status: 503 });
      if (settings.failList) throw new Error("Fixture list error");
      const active = rows.filter((r) => !r.deleted_at);
      let items = rows.filter((r) => query.view === "trash" ? r.deleted_at : !r.deleted_at);
      if (query.view === "notes") items = items.filter((r) => r.notes_count > 0);
      if (query.view === "needs_ocr") items = items.filter((r) => ["needs_ocr", "partial_needs_ocr"].includes(r.text_status));
      if (query.view === "missing_doi") items = items.filter((r) => !r.doi && r.item_type !== "note");
      if (query.view === "no_zh_title") items = items.filter((r) => !r.title_translated);
      if (query.view === "unread") items = items.filter((r) => r.read_status === "unread");
      if (query.view === "starred") items = items.filter((r) => r.starred);
      if (query.view === "unfiled") items = items.filter((r) => !r.group_ids.length);
      if (query.view === "recent") items = items.filter((r) => r.last_opened_at);
      if (query.groupId) items = items.filter((r) => r.group_ids.includes(query.groupId));
      if (query.tag) items = items.filter((r) => r.tags.includes(query.tag));
      if (query.query) items = items.filter((r) => [r.title, r.title_translated, r.authors.join(" ")].join(" ").toLowerCase().includes(query.query.toLowerCase()));
      const key = { added: "created_at", author: "authors", opened: "last_opened_at" }[query.sort] ?? query.sort;
      items.sort((a, b) => String(a[key]).localeCompare(String(b[key])) * (query.order === "desc" ? -1 : 1));
      return structuredClone({ items, total: items.length, groups, tags, counts: { notes: active.filter((r) => r.notes_count > 0).length, needs_ocr: active.filter((r) => ["needs_ocr", "partial_needs_ocr"].includes(r.text_status)).length, missing_doi: active.filter((r) => !r.doi).length, no_zh_title: active.filter((r) => !r.title_translated).length, all: active.length, unread: active.filter((r) => r.read_status === "unread").length, starred: active.filter((r) => r.starred).length, unfiled: active.filter((r) => !r.group_ids.length).length, recent: 0, trash: rows.length - active.length } });
    },
    async item(id) { return structuredClone(item(id)); },
    async desk() {
      if (settings.offline) throw Object.assign(new Error("本地服务暂不可用"), { status: 503 });
      if (settings.failDesk) throw new Error("Fixture desk error");
      const live = rows.filter((r) => !r.deleted_at);
      const translated = live.filter((r) => r.translation.status === "done");
      return structuredClone({
        total: live.length, continue_reading: dashboard ? live.filter((r) => r.last_opened_at).slice(0, 3) : [],
        to_read: live.filter((r) => r.read_status === "unread").slice(0, 5), recent_items: live.slice(0, 5),
        recent_annotations: dashboard && live.length ? [
          { id: "note1", item_id: "1", item_title: rows[0]?.title, page_idx: 0, quote: "Vision-language-action models show potential as generalist robot policies. How can safety constraints be integrated without loss of performance?", created_at: "2026-10-02T10:41:00" },
          { id: "note2", item_id: "2", item_title: rows[1]?.title, page_idx: 2, quote: "An open-source approach to generalist robot learning from large-scale visual and language observations.", created_at: "2026-10-02T10:39:00" },
          { id: "note3", item_id: "3", item_title: rows[2]?.title, page_idx: 3, quote: "A flow-based policy can learn continuous actions from multimodal inputs.", created_at: "2026-10-02T10:36:00" },
        ] : [], recent_notes: [],
        attention: { missing_doi: live.filter((r) => !r.doi).map((r) => r.id), needs_ocr: live.filter((r) => ["needs_ocr", "partial_needs_ocr"].includes(r.text_status)).map((r) => r.id), untranslated_titles: live.filter((r) => !r.title_translated).map((r) => r.id) },
        today: { opened: live.length ? 1 : 0, annotations: live.length ? 3 : 0, notes: live.length ? 2 : 0 },
        ...(dashboard ? { counts: { total: live.length, translated: translated.length, notes: live.reduce((sum, row) => sum + row.notes_count, 0), annotations: live.length ? 3 : 0, groups: groups.length },
        translation: { running: live.filter((r) => r.translation.status === "running").map((r) => ({ item_id: r.id, title: r.title, title_translated: r.title_translated, percent: r.translation.percent })), queued: live.filter((r) => r.translation.status === "queued").length, done: translated.length, recent_done: translated[0] ? { item_id: translated[0].id, title: translated[0].title, finished_at: "2026-10-02T09:30:00" } : null } } : {}),
      });
    },
    async ocrModules() { calls.push({ method: "ocrModules" }); return { modules: [{ id: "local-test", status: settings.ocrStatus, error: settings.ocrError, engine_version: "test", model_version: "test", files: [], download_enabled: false, total_bytes: 0 }] }; },
    async startOcrJob(attachment_id, module_id) {
      calls.push({ method: "startOcrJob", attachment_id, module_id });
      if (settings.failOcr) throw new Error("Fixture OCR error");
      const job = { id: `job${jobs.length}`, attachment_id, module_id, status: "queued", completed_pages: 0, total_pages: 32 };
      jobs.push(job); return job;
    },
    async ocrJobs() { return structuredClone({ jobs }); },
    async updateState(id, patch) { calls.push({ method: "updateState" }); if (settings.failWrite) throw Object.assign(new Error("本地服务暂不可用"), { status: 503 }); Object.assign(rows.find((r) => r.id === id), patch); return item(id); },
    async changeGroup(id, add, remove) { for (const r of rows) { if (add.includes(r.id) && !r.group_ids.includes(id)) r.group_ids.push(id); if (remove.includes(r.id)) r.group_ids = r.group_ids.filter((g) => g !== id); } return {}; },
    async createGroup(name, parent_id) { const group = { id: `g${groups.length}`, name, parent_id, count: 0, direct_count: 0 }; groups.push(group); return group; },
    async renameGroup(id, name) { Object.assign(groups.find((g) => g.id === id), { name }); return {}; },
    async deleteGroup(id) { groups.splice(groups.findIndex((g) => g.id === id), 1); for (const r of rows) r.group_ids = r.group_ids.filter((g) => g !== id); return {}; },
    async trash(ids) { for (const r of rows) if (ids.includes(r.id)) r.deleted_at = "2026-10-01"; return {}; },
    async restore(ids) { for (const r of rows) if (ids.includes(r.id)) r.deleted_at = null; return {}; },
    async nativeReader(id) { return { attachment: { reader_url: `/reader.html?attachment=${id}` } }; },
    async markOpened(id) { rows.find((r) => r.id === id).last_opened_at = "2026-10-01"; return {}; },
    async exportItem(id, format) { calls.push({ method: "export", id, format }); },
    async previewImport() { return { plan_hash: "fixture", counts: { items: 1, collections: 0, tags: 0, notes: 0, annotations: 0 }, warnings: [] }; },
    async commitImport() { return { created_items: 1, updated_items: 0 }; },
    async upload(file) { calls.push({ method: "upload", name: file.name }); if (!rows.length) rows.push({ ...emptySeed, title: file.name, translation: { status: "none" } }); return { item: rows[0] }; },
  };
  const wb = createWorkbench({ api: api as never, storage: localStorage, createSettingsServices: () => {
    const services = createSettingsServices();
    return { ...services, ocr: { ...services.ocr, modules: api.ocrModules as never },
      glossaries: createSettingsGlossaries({ initialize: async () => {}, readOptions: () => ({}), saveOptions: async () => {}, api: {
        fetchGlossaries: async () => ({ items: [] }), fetchGlossary: async () => ({}), createGlossary: async () => ({}), updateGlossary: async () => ({}),
        deleteGlossary: async () => ({}), exportGlossaryCsv: async () => new Response(""), parseGlossaryCsv: async () => ({ entries: [] }),
      } }),
    };
  } });
  wb.store.actions.patch({ main: dashboard ? "desk" : "library", expandedGroups: ["vla", "thesis"] });
  Object.assign(window, { fixture: { wb, rows, groups, jobs, calls, settings } });
  createRoot(document.getElementById("workbench-root")!).render(<WorkbenchProvider workbench={wb}><WorkbenchShell /></WorkbenchProvider>);
}
fixture();
