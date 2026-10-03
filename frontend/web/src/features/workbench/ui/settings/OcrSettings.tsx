import { useEffect, useState } from "react";
import type { ResearchOcrModule, ResearchOcrPreview } from "@/platform/contracts/research-library.js";
import { Button } from "@/ui/wb/Button.js";
import { formatStorageBytes, moduleSources } from "../../domain/settings.js";
import { useWorkbench } from "../context.js";
import { SettingsCard, SettingsStatus } from "./SettingsParts.js";

const STATE = { ready: "就绪", not_installed: "未安装", downloading: "下载中", removing: "移除中", error: "不可用" };
export function OcrSettings() {
  const wb = useWorkbench();
  const service = wb.settingsServices().ocr;
  const [modules, setModules] = useState<ResearchOcrModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [confirm, setConfirm] = useState<{ type: "install"; module: ResearchOcrPreview } | { type: "remove"; module: ResearchOcrModule } | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    setLoading(true);
    service.modules(abort.signal).then(({ modules: next }) => {
      if (abort.signal.aborted) return;
      setModules(next); setError("");
      if (next.some((module) => ["downloading", "removing"].includes(module.status))) timer = setTimeout(() => setVersion((value) => value + 1), 1500);
    }).catch(() => { if (!abort.signal.aborted) setError("模块状态读取失败，请刷新重试。"); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => { abort.abort(); clearTimeout(timer); };
  }, [service, version]);
  async function preview(module: ResearchOcrModule) {
    setBusy(true); setError("");
    try { setConfirm({ type: "install", module: await service.preview(module.id) }); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "无法读取安装信息，请刷新状态后重试。"); }
    finally { setBusy(false); }
  }
  async function apply() {
    if (!confirm) return;
    setBusy(true); setError("");
    try {
      if (confirm.type === "install") {
        if (!confirm.module.download_enabled) { setError("当前服务未允许下载 OCR 模块。"); return; }
        await service.install(confirm.module.id, confirm.module.preview_hash);
      } else await service.remove(confirm.module.id);
      setConfirm(null); setVersion((value) => value + 1); wb.dismissNotice();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "操作失败，请重试。"); wb.failure(failure, apply); }
    finally { setBusy(false); }
  }
  async function cancelDownload(module: ResearchOcrModule) {
    setBusy(true);
    try { await service.cancel(module.id); setVersion((value) => value + 1); }
    catch { setError("取消下载失败，请刷新状态后重试。"); wb.failure(new Error("取消下载失败。"), () => cancelDownload(module)); }
    finally { setBusy(false); }
  }
  return <>
    <div className="flex justify-end"><Button disabled={busy || loading} onClick={() => setVersion(version + 1)}>刷新状态</Button></div>
    {modules.map((module) => <SettingsCard key={module.id} title="RapidOCR">
      <div className="flex items-start justify-between gap-4 px-3.5 py-3"><span className="min-w-0"><span className="block font-medium">{module.id}</span><span className="mt-1 block text-[0.75rem] text-wb-text-3">版本 {module.engine_version} · 模型 {module.model_version}</span></span><span className="shrink-0 text-[0.75rem] text-wb-text-3">{STATE[module.status]}</span></div>
      <div className="wb-info-row relative flex flex-wrap items-center justify-between gap-3 px-3.5 py-3">
        <span className="text-[0.75rem] text-wb-text-3">{module.status === "downloading" ? `${formatStorageBytes(module.downloaded_bytes ?? 0)} / ` : ""}{formatStorageBytes(module.total_bytes)}</span>
        <span className="flex gap-2">
          {module.status === "downloading" ? <Button size="sm" disabled={busy} onClick={() => void cancelDownload(module)}>取消下载</Button> : null}
          {["ready", "error"].includes(module.status) ? <Button size="sm" disabled={busy} onClick={() => setConfirm({ type: "remove", module })}>移除模块</Button> : null}
          {["not_installed", "error"].includes(module.status) ? <Button size="sm" disabled={busy || !module.download_enabled} onClick={() => void preview(module)}>下载并安装…</Button> : null}
        </span>
      </div>
      {module.error || (!module.download_enabled && module.status !== "ready") ? <p className="m-0 px-3.5 pb-3 text-[0.75rem] text-wb-text-3">{module.error || "当前服务未允许下载。请由服务管理方开启后再安装。"}</p> : null}
      {confirm?.module.id === module.id ? <div role="alertdialog" aria-label={confirm.type === "install" ? "确认安装 OCR" : "确认移除 OCR"} className="mx-3 mb-3 rounded-xl bg-wb-panel p-3">
        {confirm.type === "install" ? <><p className="m-0 font-medium">下载并安装 {module.id}？</p><p className="my-2 text-[0.75rem] text-wb-text-3">下载大小：{formatStorageBytes(confirm.module.total_bytes)}</p><p className="my-2 break-all text-[0.75rem] text-wb-text-3">来源：{moduleSources(confirm.module.files).join("、")}</p>{!confirm.module.download_enabled ? <p className="text-[0.75rem] text-wb-text-3">当前服务未允许下载。</p> : null}</> : <p className="m-0 text-[0.75rem] leading-relaxed">移除本地 OCR 模块？文献和笔记会保留。</p>}
        <div className="mt-3 flex justify-end gap-2"><Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirm(null)}>取消</Button><Button size="sm" variant={confirm.type === "install" ? "primary" : "danger"} disabled={busy || (confirm.type === "install" && !confirm.module.download_enabled)} onClick={() => void apply()}>{confirm.type === "install" ? "确认下载并安装" : "确认移除"}</Button></div>
      </div> : null}
    </SettingsCard>)}
    {!modules.length ? <SettingsStatus message={loading ? "正在读取模块状态…" : "未检测到本地 OCR 模块。"} /> : null}
    <SettingsStatus message={error} tone="error" />
    <p className="m-0 text-[0.75rem] leading-relaxed text-wb-text-3">优先使用 PDF 文字层，只识别缺字页面。模型安装后，OCR 在本机运行。</p>
  </>;
}
