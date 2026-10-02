import { useWb, useWorkbench } from "../context.js";
export function ServiceBanner() {
  const wb = useWorkbench();
  const connection = useWb((state) => state.connection);
  if (!connection.unavailable) return null;
  return <div role="status" className="flex shrink-0 items-center justify-between gap-3 border-b border-wb-line-soft bg-wb-panel-2 px-5 py-2 text-[12px] text-wb-text-3"><span>无法连接本地文献服务</span><button type="button" disabled={connection.retrying} onClick={() => void wb.retryService()} className="rounded-md px-2 py-1 text-wb-link disabled:text-wb-text-3">{connection.retrying ? "正在重试…" : "重试"}</button></div>;
}
