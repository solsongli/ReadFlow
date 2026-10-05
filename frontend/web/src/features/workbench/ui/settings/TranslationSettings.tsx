import { translationReady } from "../../domain/translation.js";
import { useEffect, useState } from "react";
import type { TranslationDraft, SettingsFeedback } from "@/features/credentials/domain.js";
import { Button } from "@/ui/wb/Button.js";
import { SecretField } from "@/ui/wb/SecretField.js";
import { useWb, useWorkbench } from "../context.js";
import { SETTINGS_INPUT, SettingsCard, SettingsRow, SettingsStatus } from "./SettingsParts.js";
import { RenderFontSettings } from "./RenderFontSettings.js";

export function TranslationSettings() {
  const wb = useWorkbench();
  const language = useWb((state) => state.blockLanguage);
  const imageText = useWb((state) => state.blockImageText);
  return (
    <>
      <TranslationServiceSettings />
      <SettingsCard title="块级翻译" description="阅读器块级译文采用内置思源宋体；下方排版字体用于兼容任务。">
        <SettingsRow label="目标语言">
          <select
            aria-label="块翻译目标语言"
            className={SETTINGS_INPUT}
            value={language}
            onChange={(event) => wb.setPrefs({ blockLanguage: event.target.value })}
          >
            <option value="zh-CN">中文</option>
            <option value="en">English</option>
            <option value="ja">日本語</option>
            <option value="de">Deutsch</option>
            <option value="fr">Français</option>
          </select>
        </SettingsRow>
        <SettingsRow label="译文 PDF 中翻译图内文字">
          <input
            type="checkbox"
            aria-label="译文 PDF 中翻译图内文字"
            checked={imageText}
            onChange={(event) => wb.setPrefs({ blockImageText: event.target.checked })}
          />
        </SettingsRow>
      </SettingsCard>
      <RenderFontSettings />
    </>
  );
}

function TranslationServiceSettings() {
  const wb = useWorkbench();
  const service = wb.settingsServices().translation;
  const disableThinking = useWb((state) => state.translationDisableThinking);
  const [draft, setDraft] = useState<TranslationDraft | null>(null);
  const [savedDraft, setSavedDraft] = useState<TranslationDraft | null>(null);
  const [status, setStatus] = useState<SettingsFeedback>({ message: "", tone: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let current = true;
    service
      .load()
      .then((value) => {
        if (current) {
          setDraft(value);
          setSavedDraft(value);
        }
      })
      .catch(() => {
        if (current) setStatus({ message: "配置读取失败，请重新打开此页。", tone: "error" });
      });
    return () => {
      current = false;
    };
  }, [service]);
  function change(patch: Partial<TranslationDraft>) {
    if (!draft) return;
    const next = { ...draft, ...patch };
    setDraft(next);
    service.write(next);
    setStatus({ message: "有未保存的更改。", tone: "" });
  }
  async function run(action: "save" | "detect") {
    if (!draft || busy) return;
    setBusy(true);
    setStatus({ message: action === "save" ? "正在保存…" : "正在检测…", tone: "" });
    try {
      const result = await service[action](draft);
      setStatus(result);
      if (action === "save" && result.tone === "error")
        wb.failure(new Error(result.message), () => run("save"));
      if (action === "save" && result.tone === "valid") {
        setDraft(service.read());
        setSavedDraft(service.read());
        wb.dismissNotice();
        wb.translations.clearIssue();
      }
    } catch {
      if (action === "save") wb.failure(new Error("保存失败，请重试。"), () => run("save"));
      setStatus({
        message: action === "save" ? "保存失败，请重试。" : "检测失败，请检查配置后重试。",
        tone: "error",
      });
    } finally {
      setBusy(false);
    }
  }
  if (!draft) return <SettingsStatus message={status.message || "正在读取配置…"} tone={status.tone} />;
  return (
    <>
      <p role="status" className="m-0 text-[0.8125rem] text-wb-text-3">
        {savedDraft && translationReady(savedDraft)
          ? `已就绪 · ${service.providers.find((p) => p.id === savedDraft.provider)?.label ?? savedDraft.provider} · ${savedDraft.model}`
          : "未配置"}
      </p>
      <SettingsCard
        title="翻译服务"
        description="用于阅读器与翻译任务。保存不会发送模型请求；API Key 留空会保留当前服务的已有配置。"
      >
        <SettingsRow label="服务">
          <select
            aria-label="翻译服务"
            className={SETTINGS_INPUT}
            disabled={busy}
            value={draft.provider}
            onChange={(event) => {
              setDraft(service.switchProvider(event.target.value, draft));
              setStatus({ message: "有未保存的更改。", tone: "" });
            }}
          >
            {service.providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.label}
              </option>
            ))}
          </select>
        </SettingsRow>
        <SettingsRow label="API URL">
          <input
            aria-label="翻译 API URL"
            type="url"
            className={SETTINGS_INPUT}
            value={draft.baseUrl}
            disabled={busy}
            onChange={(event) => change({ baseUrl: event.target.value })}
          />
        </SettingsRow>
        <SettingsRow label="模型">
          <input
            aria-label="翻译模型"
            className={SETTINGS_INPUT}
            value={draft.model}
            disabled={busy}
            onChange={(event) => change({ model: event.target.value })}
          />
        </SettingsRow>
        <SettingsRow label="API Key">
          <div className="flex min-w-0 items-center gap-2">
            {draft.apiKey.trim() ? (
              <span className="shrink-0 text-[0.71875rem] text-wb-text-3">已配置</span>
            ) : null}
            <SecretField
              key={draft.provider}
              className="flex-1"
              label="翻译 API Key"
              value={draft.apiKey}
              placeholder="尚未填写"
              disabled={busy}
              onChange={(event) => change({ apiKey: event.target.value })}
            />
          </div>
        </SettingsRow>
        <SettingsRow label="并发数">
          <input
            aria-label="翻译并发数"
            type="number"
            min={1}
            max={service.providers.find((p) => p.id === draft.provider)?.maxWorkers ?? 100}
            className={SETTINGS_INPUT}
            value={draft.workers}
            disabled={busy}
            onChange={(event) => change({ workers: event.target.value })}
          />
        </SettingsRow>
        <SettingsRow label="翻译时关闭模型思考（更快、更省）">
          <input
            type="checkbox"
            aria-label="翻译时关闭模型思考（更快、更省）"
            checked={disableThinking}
            onChange={(event) => wb.setPrefs({ translationDisableThinking: event.target.checked })}
          />
        </SettingsRow>
      </SettingsCard>
      <p className="m-0 text-xs text-wb-text-3">
        关闭思考仅对已确认支持的 DeepSeek 官方服务生效，不影响 AI
        伴读和出题。并发上限为所有翻译任务合计；遇到限流会自动降低。
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={busy} onClick={() => void run("detect")}>
          检测接口
        </Button>
        <span className="text-[0.75rem] text-wb-text-3">会向所选服务发送一次很小的请求</span>
        <span className="flex-1" />
        <Button variant="primary" disabled={busy} onClick={() => void run("save")}>
          保存
        </Button>
      </div>
      <SettingsStatus {...status} />
    </>
  );
}
