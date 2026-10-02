// Entirely synthetic settings services. No real credentials, model probes or downloads.
import { createRoot } from "react-dom/client";
import { createWorkbench, WorkbenchProvider, WorkbenchShell } from "@/features/workbench/index.js";
import { createHeadlessTranslationSettings, createHeadlessAgentSettings } from "@/features/credentials/domain.js";
import { createSettingsServices } from "@/features/workbench/state/settings-services.js";
import { createSettingsGlossaries } from "@/features/workbench/state/settings-glossaries.js";

function fixture() {
  const calls = { probes: 0, installs: 0, previews: 0, removes: 0, aiSaves: 0, aiReads: 0, imports: 0, glossaryParses: 0 };
  const rows = [1, 2].map((n) => ({ id: `paper${n}`, title: `Synthetic Paper ${n}`, title_translated: "合成文献", authors: ["Demo Author"], item_type: "document", date: "2026", year: "2026", venue: "", venue_short: "", doi: "", url: "", tags: [], group_ids: [], citekey: `demo${n}`, citekey_pinned: false, attachment_count: n, attachment_id: `pdf${n}`, document_id: `document${n}`, page_count: 8, text_status: "needs_ocr", notes_count: n, annotations_count: 0, starred: false, read_status: "unread", read_page: null, read_pages: 8, last_opened_at: null, deleted_at: null, source: "pdf", translation: { status: "none" }, created_at: "2026-10-02", updated_at: "2026-10-02" }));
  const module = { id: "RapidOCR CPU", engine_version: "1.0-demo", model_version: "demo-v1", status: "not_installed", error: null, download_enabled: true, total_bytes: 12582912, files: [{ path: "demo.onnx", url: "https://models.example.test/releases/demo.onnx", bytes: 12582912, sha256: "fixture", kind: "model" }], downloaded_bytes: 0 };
  const ai = { schema: "retainpdf_ai_runtime_config_view_v1", configured_runtime: "python", active_runtime: "python_markdown", agent_confirmation_mode: "explicit", configured_revision: 1, active_revision: 1, restart_state: "active", restart_required: false, llm_base_url: "https://model.example.test/v1", llm_model: "demo-model", llm_api_key_configured: false, llm_api_key: "", llm_api_key_masked: "", fx_gateway_base_url: "", fx_model: "", fx_gateway_api_key_configured: false, fx_gateway_api_key: "", fx_gateway_api_key_masked: "" };
  const glossaries = new Map([
    ["g1", { glossary_id: "g1", name: "机器人术语", entries: [{ source: "robot", target: "机器人", level: "canonical", match_mode: "exact", note: "" }] }],
  ]);
  const data = { module, ai, aiReadError: "" as string | number, failSave: false, conflict: false, failModules: false, moduleTicks: 0 };
  const settingsFactory = () => ({
    ...createSettingsServices(),
    translation: createHeadlessTranslationSettings({ validate: async () => { calls.probes++; return { ok: true, summary: "检测通过" }; } }),
    agent: createHeadlessAgentSettings({
      read: async () => {
        calls.aiReads++;
        if (data.aiReadError === "network") throw new TypeError("Failed to fetch");
        if (data.aiReadError) throw new Error(`Synthetic AI failure (${data.aiReadError})`);
        return structuredClone(ai) as never;
      },
      update: async (value) => {
        if (data.conflict) { ai.configured_revision++; throw new Error("配置已更新 (409)"); }
        calls.aiSaves++;
        Object.assign(ai, { configured_runtime: value.agent_runtime, active_runtime: value.agent_runtime, agent_confirmation_mode: value.agent_confirmation_mode, llm_base_url: value.llm_base_url, llm_model: value.llm_model, fx_gateway_base_url: value.fx_gateway_base_url, fx_model: value.fx_model, configured_revision: ai.configured_revision + 1, active_revision: ai.configured_revision + 1 });
        if (value.llm_api_key) { ai.llm_api_key = value.llm_api_key; ai.llm_api_key_configured = true; }
        if (value.fx_gateway_api_key) { ai.fx_gateway_api_key = value.fx_gateway_api_key; ai.fx_gateway_api_key_configured = true; }
        return structuredClone(ai) as never;
      },
    }),
    glossaries: createSettingsGlossaries({ api: {
      fetchGlossaries: async () => ({ items: [...glossaries.values()].map((entry) => ({ glossary_id: entry.glossary_id, name: entry.name, entry_count: entry.entries.length })) }),
      fetchGlossary: async (id) => structuredClone(glossaries.get(id)),
      createGlossary: async (_prefix, value) => { const id = `g${glossaries.size + 1}`; const row = { ...value as object, glossary_id: id } as never; glossaries.set(id, row); return row; },
      updateGlossary: async (_prefix, id, value) => { const row = { ...value as object, glossary_id: id } as never; glossaries.set(id, row); return row; },
      deleteGlossary: async (_prefix, id) => { glossaries.delete(id); },
      exportGlossaryCsv: async () => new Response("source,target\nrobot,机器人"),
      parseGlossaryCsv: async (_prefix, value) => { calls.glossaryParses++; const entries = value.trim().split(/\r?\n/).slice(1).map((line) => { const [source, target] = line.split(","); return { source, target, level: "canonical", match_mode: "case_insensitive", note: "" }; }); return { entries, entry_count: entries.length }; },
    } }),
    ocr: {
      modules: async () => { if (data.failModules) throw new Error("Fixture error"); if (module.status === "downloading" && ++data.moduleTicks >= 2) module.status = "ready"; return { modules: [structuredClone(module)] } as never; },
      preview: async () => { calls.previews++; return { ...structuredClone(module), preview_hash: "fixture-preview" } as never; },
      install: async (_id, preview) => { if (preview !== "fixture-preview") throw new Error("Preview mismatch"); if (!module.download_enabled) throw new Error("当前服务未允许下载。"); calls.installs++; module.status = "downloading"; data.moduleTicks = 0; return { module_id: module.id, status: "downloading" }; },
      remove: async () => { calls.removes++; module.status = "not_installed"; return {}; },
      cancel: async () => { module.status = "not_installed"; return {}; },
    },
  });
  const api = {
    list: async () => ({ items: structuredClone(rows), total: rows.length, groups: [], tags: [], counts: { all: rows.length, unread: rows.length, starred: 0, recent: 0, unfiled: rows.length, trash: 0, notes: rows.length, needs_ocr: rows.length, missing_doi: rows.length, no_zh_title: 0 } }),
    row: async (id) => structuredClone(rows.find((row) => row.id === id)),
    item: async (id) => ({ ...rows.find((row) => row.id === id), attachments: [], notes: [], abstract: "" }),
    desk: async () => ({ total: rows.length, continue_reading: [], to_read: structuredClone(rows), recent_items: structuredClone(rows), recent_annotations: [], recent_notes: [], attention: { missing_doi: [], needs_ocr: rows.map((r) => r.id), untranslated_titles: [] }, today: { opened: 0, notes: 0, annotations: 0 }, counts: { total: rows.length, translated: 0, notes: 3, annotations: 0, groups: 0 }, translation: { running: [], queued: 0, done: 0, recent_done: null } }),
    ocrJobs: async () => ({ jobs: [] }), ocrModules: async () => ({ modules: [module] }),
    markOpened: async (id) => ({ ...rows.find((row) => row.id === id), read_status: "reading" }),
    nativeReader: async (id) => ({ attachment: { reader_url: `./reader.html?attachment=${id}` } }),
    previewImport: async () => ({ plan_hash: "fixture", counts: { items: 1, collections: 0, tags: 0, notes: 0, annotations: 0 }, warnings: [] }),
    commitImport: async () => { calls.imports++; return { created_items: 1, updated_items: 0 }; },
  };
  const wb = createWorkbench({ api: api as never, storage: localStorage, createSettingsServices: settingsFactory as never });
  wb.store.actions.patch({ main: "library", theme: "light" });
  Object.assign(window, { fixture: { wb, calls, data, glossaries } });
  createRoot(document.getElementById("workbench-root")!).render(<WorkbenchProvider workbench={wb}><WorkbenchShell /></WorkbenchProvider>);
}
fixture();
