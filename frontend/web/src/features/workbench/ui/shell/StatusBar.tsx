import { Dot } from "@/ui/wb/Chip.js";
import { Kbd } from "@/ui/wb/Kbd.js";
import { useWb } from "../context.js";

const HINTS: Array<[string[], string]> = [
  [["J", "K"], "移动"],
  [["Enter"], "打开"],
  [["G"], "加入分组"],
  [["S"], "星标"],
  [["Ctrl K"], "命令"],
];

export function StatusBar() {
  const total = useWb((state) => state.list.result?.counts.all ?? state.desk.data?.total ?? null);
  const jobs = useWb((state) => state.ocrJobs);
  const running = jobs.filter((job) => job.status === "running" || job.status === "queued");

  return (
    <footer className="flex h-[26px] shrink-0 items-center gap-4 border-t border-wb-chrome-line bg-wb-chrome px-3 text-[11.5px] text-wb-text-2">
      <span className="inline-flex items-center gap-1.5">
        <Dot className="bg-wb-accent" />
        本地库 <span className="wb-numeric">{total ?? "—"}</span> 篇
      </span>
      {running.length ? (
        <span>
          OCR：<span className="wb-numeric">{running[0].completed_pages}/{running[0].total_pages}</span> 页
          {running.length > 1 ? ` · 排队 ${running.length - 1}` : ""}
        </span>
      ) : null}
      <span className="flex-1" />
      {HINTS.map(([keys, label]) => (
        <span key={label} className="inline-flex items-center gap-1">
          {keys.map((key) => (
            <Kbd key={key}>{key}</Kbd>
          ))}
          {label}
        </span>
      ))}
    </footer>
  );
}
