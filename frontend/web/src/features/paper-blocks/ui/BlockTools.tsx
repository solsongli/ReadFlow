import { Button } from "@/ui/wb/Button.js";
import { MenuRoot, MenuTrigger, MenuContent, MenuItem } from "@/ui/wb/Menu.js";
import { downloadBlob } from "@/platform/utils/downloads.js";
import type { BlockStatus } from "../domain/model.js";
import { pdfFormats, type TranslationFormat } from "../domain/formats.js";
import type { blocksApi } from "../state/api.js";
export function BlockTools({
  status,
  api,
  format,
  setFormat,
  enabled,
  running,
  legacy,
  usage,
  toggle,
  start,
  render,
  error,
}: {
  status: BlockStatus | null;
  api: ReturnType<typeof blocksApi>;
  format: TranslationFormat;
  setFormat?: (format: TranslationFormat) => void;
  enabled: boolean;
  running: boolean;
  legacy: boolean;
  usage: string;
  toggle: () => void;
  start: () => void;
  render: () => void;
  error: (text: string) => void;
}) {
  const variants = pdfFormats(status?.result || null, format);
  return (
    <>
      {usage ? (
        <span className="max-w-60 text-xs text-wb-text-3" role="status" title={usage}>
          {usage}
        </span>
      ) : null}
      <Button size="sm" aria-pressed={enabled} onClick={toggle}>
        块模式
      </Button>
      {status?.result ? (
        <select
          aria-label="译文版式"
          value={variants.selected || format}
          onChange={(event) => {
            const next = event.target.value as TranslationFormat;
            setFormat?.(next);
            if (next === "layout" && !variants.layout) render();
          }}
          className="rounded-lg border-0 bg-wb-fill px-2 py-1 text-xs text-wb-text"
        >
          <option value="layout" disabled={!variants.layout && (!status?.has_translation || running)}>
            原版式
          </option>
          <option value="reflow" disabled={!variants.reflow}>
            重排
          </option>
        </select>
      ) : null}
      {status?.result || legacy ? (
        <Button size="sm" disabled={running} onClick={start}>
          {status?.result ? "补翻／重新排版" : "翻译全文（块级）"}
        </Button>
      ) : null}
      {status?.has_translation ? (
        <Button size="sm" disabled={running} onClick={render} title="只使用已有块译文，不发送模型请求">
          {variants.layout ? "仅重新排版" : "生成原版式"}
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
            disabled={!variants.layout}
            onSelect={() =>
              void api
                .pdf("layout")
                .then((blob) => downloadBlob(blob, "ReadFlow-原版式译文.pdf"))
                .catch(() => error("译文下载失败，请重试。"))
            }
          >
            原版式 PDF（推荐）
          </MenuItem>
          <MenuItem
            disabled={!variants.reflow}
            onSelect={() =>
              void api
                .pdf("reflow")
                .then((blob) => downloadBlob(blob, "ReadFlow-重排译文.pdf"))
                .catch(() => error("译文下载失败，请重试。"))
            }
          >
            重排 PDF
          </MenuItem>
          <MenuItem
            onSelect={() =>
              void api
                .latex()
                .then((blob) => downloadBlob(blob, "ReadFlow-LaTeX.zip"))
                .catch(() => error("导出失败，请重试。"))
            }
          >
            LaTeX 工程
          </MenuItem>
        </MenuContent>
      </MenuRoot>
    </>
  );
}
