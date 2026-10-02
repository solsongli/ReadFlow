import { useEffect, useState } from "react";
import { agentSettingsDraft, agentRestartPending, agentRuntimeLabel, type AgentSettingsDraft } from "@/features/credentials/domain.js";
import type { AgentRuntimeConfigView, AgentRuntimeMode } from "@/platform/api/index.js";
import { Button } from "@/ui/wb/Button.js";
import { SecretField } from "@/ui/wb/SecretField.js";
import { agentSettingsReadError, safeSettingsMessage } from "../../domain/settings.js";
import { useWorkbench } from "../context.js";
import { SETTINGS_INPUT, SettingsCard, SettingsRow, SettingsStatus } from "./SettingsParts.js";

export function AgentSettings() {
  const wb = useWorkbench();
  const service = wb.settingsServices().agent;
  const [config, setConfig] = useState<AgentRuntimeConfigView | null>(null);
  const [draft, setDraft] = useState<AgentSettingsDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState({ message: "", tone: "" });
  const [retry, setRetry] = useState(0);
  const [polling, setPolling] = useState(false);
  const [readFailed, setReadFailed] = useState(false);
  useEffect(() => {
    let live = true;
    setReadFailed(false); setStatus({ message: "", tone: "" });
    service.load().then((value) => { if (live) { setConfig(value); setDraft(agentSettingsDraft(value)); setPolling(agentRestartPending(value)); setStatus({ message: "", tone: "" }); } })
      .catch((failure) => { if (live) { setReadFailed(true); setStatus({ message: agentSettingsReadError(failure), tone: "" }); } });
    return () => { live = false; };
  }, [service, retry]);
  useEffect(() => {
    if (!polling) return;
    let live = true, attempts = 0;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      attempts++;
      try {
        const next = await service.load();
        if (!live) return;
        setConfig(next);
        if (!agentRestartPending(next)) { service.announce(); setPolling(false); setStatus({ message: "设置已生效。", tone: "valid" }); return; }
      } catch { /* The existing runtime can be briefly unavailable while applying settings. */ }
      if (!live) return;
      if (attempts >= 12) { service.announce(); setPolling(false); setStatus({ message: "设置已保存，服务仍在重启；稍后重新打开此页确认。", tone: "" }); return; }
      timer = setTimeout(() => void poll(), 500);
    };
    timer = setTimeout(() => void poll(), 500);
    return () => { live = false; clearTimeout(timer); };
  }, [polling, service]);
  function change(patch: Partial<AgentSettingsDraft>) { if (draft) { setDraft({ ...draft, ...patch }); setStatus({ message: "有未保存的更改。", tone: "" }); } }
  async function copyTranslation() {
    try {
      const values = await wb.settingsServices().translation.load();
      change({ baseUrl: values.baseUrl, model: values.model, modelKey: values.apiKey });
      setStatus({ message: "已填入翻译配置，保存后用于 AI 伴读。", tone: "" });
    } catch { setStatus({ message: "翻译配置读取失败。", tone: "error" }); }
  }
  async function save() {
    if (!draft || !config) return;
    setSaving(true); setStatus({ message: "正在保存…", tone: "" });
    try {
      const next = await service.save(draft, config); setConfig(next); wb.dismissNotice();
      setDraft({ ...draft, modelKey: next.llm_api_key ?? draft.modelKey, gatewayKey: next.fx_gateway_api_key ?? draft.gatewayKey });
      setPolling(agentRestartPending(next));
      setStatus({ message: agentRestartPending(next) ? "已保存，正在重启 Agent…" : "设置已保存。", tone: "valid" });
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : "保存失败，请重试。";
      if (message.includes("(409)")) {
        try { setConfig(await service.load()); } catch { /* Keep the draft. */ }
        setStatus({ message: "配置已在其他窗口更新。输入已保留，请确认后重新保存。", tone: "error" });
        wb.failure(new Error("配置已在其他窗口更新，请确认输入后重新保存。"), async () => { wb.openSettings("ai"); });
      } else {
        const safe = safeSettingsMessage(message, [draft.modelKey, draft.gatewayKey, config.llm_api_key || "", config.fx_gateway_api_key || ""]);
        setStatus({ message: safe, tone: "error" }); wb.failure(new Error(safe), save);
      }
    } finally { setSaving(false); }
  }
  if (!draft || !config) return <><SettingsStatus message={status.message || "正在读取运行时设置…"} />{readFailed ? <div><Button onClick={() => setRetry(retry + 1)}>重试</Button></div> : null}</>;
  const busy = saving || polling;
  const field = (key: keyof AgentSettingsDraft, label: string, type = "text") => <input aria-label={label} type={type} className={SETTINGS_INPUT} disabled={busy} value={draft[key]} onChange={(event) => change({ [key]: event.target.value })} />;
  return <>
    <SettingsCard title="运行方式" description="保存后沿用现有运行时配置；切换运行方式可能短暂重启 AI 服务。">
      <SettingsRow label="运行模式"><select aria-label="AI 运行模式" className={SETTINGS_INPUT} value={draft.mode} disabled={busy} onChange={(event) => change({ mode: event.target.value as AgentRuntimeMode })}><option value="python">Markdown 检索问答</option><option value="openai">OpenAI 兼容 Agent</option><option value="fx">FX Gateway Agent</option></select></SettingsRow>
      <SettingsRow label="当前运行"><span className="text-[12px] text-wb-text-3">{agentRuntimeLabel(config.active_runtime)}{polling ? " · 切换中" : ""}</span></SettingsRow>
      <SettingsRow label="操作确认"><select aria-label="操作确认方式" className={SETTINGS_INPUT} value={draft.confirmation} disabled={busy} onChange={(event) => change({ confirmation: event.target.value as AgentSettingsDraft["confirmation"] })}><option value="explicit">需要确认</option><option value="green_light">绿灯模式</option></select></SettingsRow>
    </SettingsCard>
    {draft.confirmation === "green_light" ? <p className="m-0 text-[12px] leading-relaxed text-wb-text-3">AI 可直接执行并应用受支持的 PDF 操作，无需逐步确认；不允许执行 shell 或任意系统命令。</p> : null}
    {draft.mode !== "fx" ? <SettingsCard title="问答模型">
      <SettingsRow label="API URL">{field("baseUrl", "AI 模型 API URL", "url")}</SettingsRow>
      <SettingsRow label="模型">{field("model", "AI 模型")}</SettingsRow>
      <SettingsRow label="API Key"><SecretField label="AI 模型 API Key" value={draft.modelKey} disabled={busy} placeholder={config.llm_api_key_configured ? "已保存，留空保持" : "尚未填写"} onChange={(event) => change({ modelKey: event.target.value })} /></SettingsRow>
      <div className="wb-info-row relative flex flex-wrap items-center gap-2 p-3.5"><Button size="sm" disabled={busy} onClick={() => void copyTranslation()}>使用翻译配置</Button><button type="button" onClick={() => wb.openSettings("translation")} className="text-[12px] text-wb-link">前往翻译设置</button></div>
    </SettingsCard> : <SettingsCard title="FX Gateway" description="URL 留空使用官方 Gateway；自定义地址仅支持本机 HTTP 与端口，远程服务请选择 OpenAI 兼容模式。">
      <SettingsRow label="Gateway URL（可选）">{field("gatewayUrl", "FX Gateway URL", "url")}</SettingsRow>
      <SettingsRow label="模型（可选）">{field("gatewayModel", "FX 模型")}</SettingsRow>
      <SettingsRow label="Gateway Key"><SecretField label="FX Gateway Key" value={draft.gatewayKey} disabled={busy} placeholder={config.fx_gateway_api_key_configured ? "已保存，留空保持" : "尚未填写"} onChange={(event) => change({ gatewayKey: event.target.value })} /></SettingsRow>
    </SettingsCard>}
    {draft.mode !== "fx" && !draft.modelKey && !config.llm_api_key_configured ? <SettingsStatus message="还没有模型凭据，请先在翻译或此处配置。" /> : null}
    <div className="flex items-center justify-between gap-3"><SettingsStatus {...status} /><Button variant="primary" disabled={busy} onClick={() => void save()}>{busy ? "正在应用…" : "保存设置"}</Button></div>
  </>;
}
