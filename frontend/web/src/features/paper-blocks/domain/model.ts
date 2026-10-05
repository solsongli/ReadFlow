export interface InlineRun {
  kind: "text" | "super" | "sub";
  text: string;
}
export interface Anchor {
  page: number;
  bbox: number[];
  pdf_bbox: number[];
  view_bbox: number[];
}
export interface Block {
  id: string;
  page: number;
  type: string;
  text: string;
  anchors: Anchor[];
  translation?: string;
  translation_runs?: InlineRun[];
  protected?: Array<{
    start: number;
    end: number;
    text: string;
    runs?: InlineRun[];
  }>;
  caption_id?: string;
  asset?: string;
  figure_text?: Array<{
    id: string;
    text: string;
    translation?: string;
    translatable?: boolean;
  }>;
}
export interface BlockStatus {
  document: {
    schema_version: number;
    blocks: Block[];
    warnings: string[];
  } | null;
  jobs?: BlockJob[];
  job: BlockJob | null;
  has_translation?: boolean;
  needs_extract?: boolean;
  language?: string;
  result: {
    revision: string;
    language: string;
    fallback_blocks?: string[];
    render_fallback?: string[];
    label_fallback?: string[];
    translation_fallback?: string[];
    usage?: BlockUsage;
    notices?: string[];
  } | null;
  renderer_ready: boolean;
}
export interface BlockJob {
  id: string;
  status: string;
  scope?: "extract" | "block" | "full";
  block_id?: string;
  phase: string;
  percent: number;
  fallback_blocks?: string[];
  translation_fallback?: string[];
  error?: { code: string; message: string };
  usage?: BlockUsage;
  notices?: string[];
}
export interface BlockUsage {
  total_tokens: number;
  reasoning_tokens?: number;
}
export function sourceRuns(block: Block): InlineRun[] {
  const runs: InlineRun[] = [];
  const points = Array.from(block.text);
  let cursor = 0;
  for (const part of block.protected || []) {
    runs.push({
      kind: "text",
      text: points.slice(cursor, part.start).join(""),
    });
    runs.push(...(part.runs || [{ kind: "text" as const, text: part.text }]));
    cursor = part.end;
  }
  runs.push({ kind: "text", text: points.slice(cursor).join("") });
  return runs;
}
export function jobViews(status: BlockStatus | null, blockId?: string) {
  const jobs = status?.jobs || (status?.job ? [status.job] : []);
  const active = jobs.filter((job) => busy(job.status));
  const full =
    active.find((job) => (job.scope || "full") === "full") ||
    [...jobs].reverse().find((job) => (job.scope || "full") === "full");
  const block = active.find((job) => job.scope === "block" && job.block_id === blockId);
  return {
    full,
    block,
    extracting: active.some((job) => job.scope === "extract"),
    active: active.length > 0,
  };
}
export function blockAt(blocks: Block[], page: number, x: number, y: number) {
  return blocks
    .flatMap((block) =>
      block.type === "header" || block.type === "footer"
        ? []
        : block.anchors
            .filter(
              (a) =>
                a.page === page &&
                x >= a.view_bbox[0] &&
                x <= a.view_bbox[2] &&
                y >= a.view_bbox[1] &&
                y <= a.view_bbox[3],
            )
            .map((anchor) => ({ block, anchor })),
    )
    .sort(
      (a, b) =>
        (a.anchor.view_bbox[2] - a.anchor.view_bbox[0]) * (a.anchor.view_bbox[3] - a.anchor.view_bbox[1]) -
        (b.anchor.view_bbox[2] - b.anchor.view_bbox[0]) * (b.anchor.view_bbox[3] - b.anchor.view_bbox[1]),
    )[0];
}
export function plainClick(distance: number, selection: string, detail: number, prevented: boolean) {
  return distance < 5 && !selection.trim() && detail === 1 && !prevented;
}
export function busy(status?: string) {
  return ["queued", "running", "cancelling"].includes(status || "");
}
