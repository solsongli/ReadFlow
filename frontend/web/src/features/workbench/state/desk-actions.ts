import type { WorkbenchRow } from "@/platform/contracts/workbench.js";
import { canStartOcr, ocrAvailability } from "../domain/desk.js";
import type { Workbench } from "./controller.js";

/** Recheck readiness at submission time. This path has no module download/install call. */
export async function startDeskOcr(wb: Workbench, selected: WorkbenchRow[]) {
  const [{ modules }, { jobs }] = await Promise.all([wb.api.ocrModules(), wb.api.ocrJobs()]);
  const { ready, reason } = ocrAvailability(modules);
  if (!ready) throw new Error(reason);
  let started = 0;
  const failed: string[] = [];
  const seen = new Set<string>();
  for (const row of selected) {
    if (!canStartOcr(row, jobs) || seen.has(row.attachment_id!)) continue;
    seen.add(row.attachment_id!);
    try {
      await wb.api.startOcrJob(row.attachment_id!, ready.id);
      started += 1;
    } catch { failed.push(row.title); }
  }
  await wb.refreshAll();
  return { started, failed };
}
