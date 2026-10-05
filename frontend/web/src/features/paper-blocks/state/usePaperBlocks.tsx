import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/ui/wb/Button.js";
import { BlockTools } from "../ui/BlockTools.js";
import { pdfFormats, type TranslationFormat } from "../domain/formats.js";
import type { AssistancePorts } from "@/features/reader-assistance/domain.js";
import { blocksApi } from "./api.js";
import { useBlockMode, type BlockModePreferences } from "./useBlockMode.js";
import { busy, jobViews, type Block, type BlockStatus } from "../domain/model.js";
import { useBlockReading } from "./useBlockReading.js";
import { BlockCard } from "../ui/BlockCard.js";
import { fallbackMessages, usageText } from "../domain/status.js";
export function usePaperBlocks(
  item: string,
  attachment: string,
  ports: AssistancePorts,
  active: boolean,
  language: string,
  legacyAvailable = false,
  notify?: (message: string) => void,
  preferences: BlockModePreferences = {
    disabled: false,
    hintDismissed: true,
    save: () => {},
  },
  options: {
    imageText: boolean;
    currentPage?: () => number;
    format?: TranslationFormat;
    setFormat?: (format: TranslationFormat) => void;
  } = { imageText: true },
) {
  const api = useMemo(() => blocksApi(item, attachment, language), [item, attachment, language]);
  const [status, setStatus] = useState<BlockStatus | null>(null);
  const mode = useBlockMode(
    Boolean(status?.has_translation && status.language === language),
    preferences,
    language,
  );
  const enabled = mode.enabled;
  const [error, setError] = useState("");
  const [dismissed, setDismissed] = useState("");
  const [sending, setSending] = useState(false);
  const lastRequest = useRef<{ id?: string; force: boolean; extract: boolean; render?: boolean }>({
    force: false,
    extract: false,
  });
  const mounted = useRef(true);
  const refreshing = useRef(false);
  const previousJob = useRef<BlockStatus["job"]>(null);
  const announce = useRef(notify);
  announce.current = notify;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const reading = useBlockReading(
    status,
    active,
    enabled,
    options.imageText,
    api.url,
    () => {
      if (!enabled) mode.toggle();
    },
    (id) => void start(id),
    sending,
  );
  const { selected, setSelected } = reading;
  useEffect(() => {
    const selectionChanged = () => {
      const selection = window.getSelection();
      const parent = selection?.anchorNode?.parentElement;
      if (selection?.toString().trim() && parent?.closest("[data-paper-page]")) setSelected(null);
    };
    document.addEventListener("selectionchange", selectionChanged);
    return () => document.removeEventListener("selectionchange", selectionChanged);
  }, []);
  const refresh = useCallback(async () => {
    if (refreshing.current) return;
    refreshing.current = true;
    try {
      const value = await api.status();
      if (mounted.current) {
        if (
          previousJob.current?.id === value.job?.id &&
          busy(previousJob.current?.status) &&
          value.job?.status === "done" &&
          value.job?.phase === "完成"
        ) {
          announce.current?.("块翻译已完成，译文已更新。");
        }
        previousJob.current = value.job;
        setStatus(value);
      }
    } catch (failure) {
      if (mounted.current) setError((failure as Error).message);
    } finally {
      refreshing.current = false;
    }
  }, [api]);
  useEffect(() => {
    if (!active || !attachment) return;
    void refresh();
    const timer = setInterval(() => void refresh(), jobViews(status).active ? 800 : 5000);
    return () => clearInterval(timer);
  }, [active, attachment, refresh, status?.job?.status, status?.jobs?.filter((j) => busy(j.status)).length]);
  const jobs = jobViews(status, selected?.id);
  const running =
    (sending && !lastRequest.current.id && !lastRequest.current.extract) || busy(jobs.full?.status);
  const blockRunning = sending || Boolean(jobs.block) || jobs.extracting;
  const extractionStarted = useRef(false);
  useEffect(() => {
    if (
      active &&
      enabled &&
      status &&
      (!status.document || status.needs_extract) &&
      !jobs.extracting &&
      !extractionStarted.current
    ) {
      extractionStarted.current = true;
      void start(undefined, false, true);
    }
  }, [active, enabled, status?.document, status?.needs_extract, jobs.extracting]);
  async function start(id?: string, force = false, extract = false) {
    if (sending) return;
    setSending(true);
    setError("");
    setDismissed("");
    lastRequest.current = { id, force, extract };
    try {
      const config = extract ? {} : await ports.translationConfig();
      const job = await api.start(
        {
          ...config,
          attachment_id: attachment,
          language,
          block_id: id,
          force,
          image_text: options.imageText,
          current_page: options.currentPage?.(),
        },
        extract,
      );
      if (mounted.current)
        setStatus((old) => ({
          ...old!,
          job,
          jobs: [...(old?.jobs || []), job],
        }));
      previousJob.current = job;
      await refresh();
    } catch (failure) {
      if (mounted.current)
        setError(
          (failure as { code?: string }).code === "unconfigured"
            ? "还没有配置翻译服务"
            : (failure as Error).message || "块翻译未能开始，请检查服务设置。",
        );
    } finally {
      if (mounted.current) setSending(false);
    }
  }
  async function renderCached() {
    if (sending || running) return;
    setSending(true);
    setError("");
    lastRequest.current = { force: false, extract: false, render: true };
    try {
      const job = await api.render({ attachment_id: attachment, language, image_text: options.imageText });
      if (mounted.current) setStatus((old) => ({ ...old!, job, jobs: [...(old?.jobs || []), job] }));
      await refresh();
    } catch (failure) {
      if (mounted.current) setError((failure as Error).message);
    } finally {
      if (mounted.current) setSending(false);
    }
  }
  const variant = pdfFormats(status?.result || null, options.format || "layout");
  const blocks = status?.document?.blocks || [];
  const block = blocks.find((b) => b.id === selected?.id);
  const usage = usageText(jobs.full?.usage ?? status?.result?.usage);
  const issue = error || (dismissed === status?.job?.id ? "" : status?.job?.error?.message);
  const fallbacks = fallbackMessages(status?.result || null, status?.job || null);
  return {
    layoutAligned: variant.selected === "layout",
    translated:
      status?.result && variant.selected
        ? api.url(`/files/${variant.filename}?revision=${encodeURIComponent(status.result.revision)}`)
        : undefined,
    translation: {
      running,
      label: jobs.full ? `${jobs.full.phase} ${jobs.full.percent}%` : "翻译全文",
      percent: jobs.full?.percent,
      start: () => void start(),
      cancel: () => {
        if (jobs.full)
          void api
            .cancel(jobs.full.id)
            .then(refresh)
            .catch(() => setError("取消失败，请重试。"));
      },
    },
    inlineAvailable: Boolean(status?.has_translation && status.language === language),
    registerBlockNavigation: reading.registerNavigation,
    sidebar: reading.sidebar,
    overlay: reading.overlay,
    tools: (
      <BlockTools
        status={status}
        api={api}
        format={options.format || "layout"}
        setFormat={options.setFormat}
        enabled={enabled}
        running={running}
        legacy={legacyAvailable}
        usage={usage}
        start={() => void start()}
        render={() => void renderCached()}
        error={setError}
        toggle={() => {
          mode.toggle();
          setSelected(null);
          extractionStarted.current = false;
        }}
      />
    ),
    panel: (
      <>
        {reading.figure}
        {active && mode.hint ? (
          <div
            role="status"
            className="absolute bottom-3 right-3 z-40 flex max-w-lg items-center gap-3 rounded-xl bg-wb-panel p-3 shadow-wb-pop"
          >
            <span>单击段落查看译文；拖动仍是选字和批注</span>
            <Button size="sm" onClick={mode.dismissHint}>
              知道了
            </Button>
          </div>
        ) : null}
        {jobs.block && active ? (
          <div
            role="status"
            className="absolute bottom-3 left-3 z-40 rounded-xl bg-wb-panel p-2 shadow-wb-pop"
          >
            单块翻译 · {jobs.block.percent}%
            <Button
              size="sm"
              onClick={() =>
                void api
                  .cancel(jobs.block!.id)
                  .then(refresh)
                  .catch(() => setError("取消失败，请重试。"))
              }
            >
              取消单块翻译
            </Button>
          </div>
        ) : null}
        {selected && block && active ? (
          <BlockCard
            key={block.id}
            block={block}
            blocks={blocks}
            item={item}
            x={selected.x}
            y={selected.y}
            ports={ports}
            translate={(id, force) => void start(id, force)}
            running={blockRunning}
            move={reading.move}
            enlarge={() => reading.enlarge(block)}
            close={() => setSelected(null)}
          />
        ) : null}
        {issue && active ? (
          <div
            role="status"
            className="absolute bottom-3 left-3 z-40 max-w-lg rounded-xl bg-wb-panel p-3 shadow-wb-pop"
          >
            {issue}
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={running}
                onClick={() => {
                  const request = lastRequest.current;
                  if (request.render) void renderCached();
                  else void start(request.id, request.force, request.extract);
                }}
              >
                重试
              </Button>
              <Button size="sm" onClick={() => ports.settings("translation")}>
                去设置
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setError("");
                  setDismissed(status?.job?.id || "");
                }}
              >
                收起
              </Button>
            </div>
          </div>
        ) : null}
        {enabled &&
          status?.document?.warnings.map((w) => (
            <p
              key={w}
              role="status"
              className="absolute bottom-2 left-3 rounded-lg bg-wb-panel p-2 text-sm text-wb-text-3"
            >
              {w}
            </p>
          ))}
        {fallbacks.length ? (
          <div
            role="status"
            className="absolute bottom-2 left-3 max-w-lg space-y-1 rounded-lg bg-wb-panel p-2 text-sm text-wb-text-3"
          >
            {fallbacks.map((item) => (
              <p className="m-0" key={item.kind} data-block-fallback={item.kind}>
                {item.text}
              </p>
            ))}
          </div>
        ) : null}
      </>
    ),
  };
}
