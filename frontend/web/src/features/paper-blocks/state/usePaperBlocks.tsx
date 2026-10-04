import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/ui/wb/Button.js";
import { MenuRoot, MenuTrigger, MenuContent, MenuItem } from "@/ui/wb/Menu.js";
import { downloadBlob } from "@/platform/utils/downloads.js";
import type { AssistancePorts } from "@/features/reader-assistance/domain.js";
import { blocksApi } from "./api.js";
import { useBlockMode, type BlockModePreferences } from "./useBlockMode.js";
import { busy, jobViews, type Block, type BlockStatus } from "../domain/model.js";
import { BlockLayer } from "../ui/BlockLayer.js";
import { BlockCard } from "../ui/BlockCard.js";
export function usePaperBlocks(
  item: string,
  attachment: string,
  ports: AssistancePorts,
  active: boolean,
  language: string,
  legacyAvailable = false,
  notify?: (message: string) => void,
  preferences: BlockModePreferences = { disabled: false, hintDismissed: true, save: () => {} },
) {
  const api = useMemo(() => blocksApi(item, attachment, language), [item, attachment, language]);
  const [status, setStatus] = useState<BlockStatus | null>(null);
  const mode = useBlockMode(
    Boolean(status?.has_translation && status.language === language),
    preferences,
    language,
  );
  const enabled = mode.enabled;
  const [selected, setSelected] = useState<{ id: string; x: number; y: number } | null>(null);
  const [error, setError] = useState("");
  const [dismissed, setDismissed] = useState("");
  const [sending, setSending] = useState(false);
  const lastRequest = useRef<{ id?: string; force: boolean; extract: boolean }>({
    force: false,
    extract: false,
  });
  const mounted = useRef(true);
  const previousJob = useRef<BlockStatus["job"]>(null);
  const announce = useRef(notify);
  announce.current = notify;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
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
        { ...config, attachment_id: attachment, language, block_id: id, force },
        extract,
      );
      if (mounted.current) setStatus((old) => ({ ...old!, job, jobs: [...(old?.jobs || []), job] }));
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
  const open = useCallback((block: Block, x: number, y: number) => setSelected({ id: block.id, x, y }), []);
  const blocks = status?.document?.blocks || [];
  const block = blocks.find((b) => b.id === selected?.id);
  const issue = error || (dismissed === status?.job?.id ? "" : status?.job?.error?.message);
  const fallback = status?.job?.fallback_blocks?.length || status?.result?.fallback_blocks.length || 0;
  return {
    translated: status?.result
      ? api.url(`/files/translated.pdf?revision=${encodeURIComponent(status.result.revision)}`)
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
    overlay: (page: number, interactive: boolean) => (
      <BlockLayer blocks={blocks} page={page} active={active && enabled && interactive} open={open} />
    ),
    tools: (
      <>
        <Button
          size="sm"
          aria-pressed={enabled}
          onClick={() => {
            mode.toggle();
            setSelected(null);
            extractionStarted.current = false;
          }}
        >
          块模式
        </Button>
        {status?.result || legacyAvailable ? (
          <Button size="sm" disabled={running} onClick={() => void start()}>
            {status?.result ? "补翻／重新排版" : "翻译全文（块级）"}
          </Button>
        ) : null}
        <MenuRoot>
          <MenuTrigger asChild>
            <Button size="sm" disabled={!status?.document || running}>
              导出译文
            </Button>
          </MenuTrigger>
          <MenuContent>
            <MenuItem
              disabled={!status?.result}
              onSelect={() =>
                void api
                  .pdf()
                  .then((blob) => downloadBlob(blob, "ReadFlow-译文.pdf"))
                  .catch(() => setError("译文下载失败，请重试。"))
              }
            >
              下载译文 PDF
            </MenuItem>
            <MenuItem
              onSelect={() =>
                void api
                  .latex()
                  .then((blob) => downloadBlob(blob, "ReadFlow-LaTeX.zip"))
                  .catch(() => setError("导出失败，请重试。"))
              }
            >
              导出 LaTeX 工程
            </MenuItem>
          </MenuContent>
        </MenuRoot>
      </>
    ),
    panel: (
      <>
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
                  void start(request.id, request.force, request.extract);
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
        {fallback ? (
          <p
            role="status"
            className="absolute bottom-2 left-3 rounded-lg bg-wb-panel p-2 text-sm text-wb-text-3"
          >
            {fallback} 个块暂时保留原文，可补翻后重新排版。
          </p>
        ) : null}
      </>
    ),
  };
}
