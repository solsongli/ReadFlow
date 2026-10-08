import type { TagColor, WorkbenchRow } from "@/platform/contracts/workbench.js";
import type { WorkbenchApi } from "@/platform/api/workbench.js";
import type { createWorkbenchStore, WorkbenchState } from "../domain/workbench-store.js";
import { toggleTagPlan } from "../domain/tags.js";

interface TagEnv {
  api: WorkbenchApi;
  store: ReturnType<typeof createWorkbenchStore>;
  rowById: (id: string) => WorkbenchRow | undefined;
  refreshList: () => Promise<void>;
  browse: (changes: Partial<Pick<WorkbenchState, "tag" | "query">>) => void;
  notify: (text: string, tone?: "info" | "success" | "error") => void;
  failure: (error: unknown, retry: () => Promise<unknown>) => void;
}

/** Zotero-style tagging: colored tags with 1–9 shortcuts, batch add/remove, rename and delete. */
export function createTagActions({ api, store, rowById, refreshList, browse, notify, failure }: TagEnv) {
  const get = () => store.getSnapshot();
  const setColors = (tagColors: TagColor[]) => store.actions.patch({ tagColors });

  async function guarded(work: () => Promise<unknown>) {
    try {
      await work();
    } catch (error) {
      failure(error, () => guarded(work));
    }
  }
  async function loadColors() {
    try {
      setColors(await api.tagColors());
    } catch {
      // Colors are an enhancement; the library stays usable without them.
    }
  }
  const apply = (itemIds: string[], add: string[], remove: string[] = []) =>
    guarded(async () => {
      if (!itemIds.length || (!add.length && !remove.length)) return;
      await api.applyTags(itemIds, add, remove);
      await refreshList();
    });
  /** Number keys 1–9: add the colored tag to every selected item, or remove it when all already have it. */
  async function toggleColored(position: number) {
    const tag = get().tagColors.find((entry) => entry.position === position);
    const ids = get().selectedIds;
    if (!tag || !ids.length) return false;
    const plan = toggleTagPlan(ids.map((id) => rowById(id)?.tags ?? []), tag.name);
    await apply(ids, plan.add, plan.remove);
    notify(plan.add.length ? `已添加标签「${tag.name}」` : `已移除标签「${tag.name}」`, "success");
    return true;
  }
  const setColor = (name: string, color: number, position?: number) =>
    guarded(async () => setColors(await api.setTagColor(name, color, position)));
  const clearColor = (name: string) => guarded(async () => setColors(await api.clearTagColor(name)));
  const rename = (from: string, to: string) =>
    guarded(async () => {
      const next = to.trim();
      if (!next || next === from) return;
      const result = await api.renameTag(from, next);
      setColors(result.colors);
      if (get().tag === from) browse({ tag: next, query: "" });
      else await refreshList();
      notify(`已重命名为「${next}」，涉及 ${result.updated} 篇`, "success");
    });
  const remove = (name: string) =>
    guarded(async () => {
      const result = await api.deleteTag(name);
      setColors(result.colors);
      if (get().tag === name) browse({ tag: null, query: "" });
      else await refreshList();
      notify(`已删除标签「${name}」，涉及 ${result.updated} 篇`, "success");
    });
  return { loadColors, apply, toggleColored, setColor, clearColor, rename, remove };
}
