import type { WorkbenchApi } from "@/platform/api/workbench.js";
import type { WorkbenchStore } from "../domain/workbench-store.js";
import { isLibraryUnavailable, retryDelay } from "../domain/resilience.js";

const READS = ["list", "row", "item", "desk", "notes", "ocrJobs", "ocrModules"];
export function createServiceRecovery(raw: WorkbenchApi, store: WorkbenchStore, recovered: () => Promise<unknown>, timers = {
  set: (work: () => void, ms: number): unknown => setTimeout(work, ms),
  clear: (id: unknown) => clearTimeout(id as ReturnType<typeof setTimeout>),
}) {
  const failed = new Map<string, (() => Promise<unknown>) | null>();
  let attempt = 0, timer: unknown, running = false, disposed = false;
  const stop = () => { if (timer != null) timers.clear(timer); timer = undefined; };
  const publish = () => store.actions.patch({ connection: { unavailable: failed.size > 0, retrying: running, attempt } });
  function schedule() {
    if (disposed || running || timer != null || !failed.size) return;
    timer = timers.set(() => { timer = undefined; void retry(); }, retryDelay(attempt));
  }
  function success(name: string) {
    if (!failed.delete(name)) return;
    if (!failed.size) { attempt = 0; stop(); }
    publish();
  }
  async function retry() {
    if (disposed || running || !failed.size) return;
    stop(); running = true; publish();
    const reads = [...failed].filter((entry): entry is [string, () => Promise<unknown>] => Boolean(entry[1]));
    await Promise.all(reads.map(async ([name, work]) => {
      try { await work(); failed.delete(name); }
      catch (error) { if (!isLibraryUnavailable(error)) failed.delete(name); }
    }));
    const writes = [...failed].filter(([, work]) => !work).map(([name]) => name);
    if (writes.length && raw.list) {
      // Writes are retried only by an explicit toast action, never by connection recovery.
      try { await raw.list({ view: "all", sort: "added", order: "desc" }); writes.forEach((name) => failed.delete(name)); }
      catch (error) { if (!isLibraryUnavailable(error)) writes.forEach((name) => failed.delete(name)); }
    }
    running = false;
    if (disposed) return;
    attempt = failed.size ? attempt + 1 : 0; publish();
    if (failed.size) schedule(); else await recovered();
  }
  const api = Object.fromEntries(Object.entries(raw).map(([name, value]) => [name, typeof value !== "function" ? value : async (...args: unknown[]) => {
    try { const result = await value.apply(raw, args); success(name); return result; }
    catch (error) {
      if (!disposed && isLibraryUnavailable(error)) {
        const retryArgs = args.map((arg) => typeof AbortSignal !== "undefined" && arg instanceof AbortSignal ? undefined : arg);
        failed.set(name, READS.includes(name) ? () => value.apply(raw, retryArgs) : null);
        publish(); schedule();
      }
      throw error;
    }
  }])) as WorkbenchApi;
  return { api, retry, dispose: () => { disposed = true; stop(); } };
}
