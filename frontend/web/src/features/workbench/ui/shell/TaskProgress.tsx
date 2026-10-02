import { backgroundProgress } from "../../domain/presentation.js";
import { useWb } from "../context.js";

export function TaskProgress() {
  const jobs = useWb((state) => state.ocrJobs);
  const rows = useWb((state) => state.list.result?.items ?? []);
  const desk = useWb((state) => state.desk.data);
  const progress = backgroundProgress(jobs, [...rows, ...(desk?.continue_reading ?? []), ...(desk?.to_read ?? []), ...(desk?.recent_items ?? [])], desk?.translation);
  if (!progress) return null;
  return (
    <span className="inline-flex h-7 w-[30px] shrink-0 items-center justify-center" title={progress.title}>
      <svg role="progressbar" aria-label={`后台任务（${progress.count}）`} aria-valuetext={progress.title} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent ?? undefined} width="18" height="18" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2.4" className="text-wb-line-strong" />
        <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" pathLength="100" strokeDasharray={`${Math.max(3, progress.percent ?? 25)} 100`} transform="rotate(-90 12 12)" className="text-wb-link" />
      </svg>
    </span>
  );
}
