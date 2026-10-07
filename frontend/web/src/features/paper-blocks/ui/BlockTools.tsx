import { ChevronDown } from "lucide-react";
import { Button } from "@/ui/wb/Button.js";
import {
  MenuRoot,
  MenuTrigger,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
} from "@/ui/wb/Menu.js";
import { downloadBlob } from "@/platform/utils/downloads.js";
import type { BlockStatus } from "../domain/model.js";
import { pdfFormats, type TranslationFormat } from "../domain/formats.js";
import type { blocksApi } from "../state/api.js";
export function BlockTools({
  recheck,
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
  recheck: () => void;
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
      <Button size="sm" aria-pressed={enabled} onClick={toggle}>
        块模式
      </Button>
      <MenuRoot>
        <MenuTrigger asChild>
          <Button size="sm" aria-label="翻译菜单" title="翻译、版式与导出">
            翻译 <ChevronDown size={12} aria-hidden="true" />
          </Button>
        </MenuTrigger>
        <MenuContent>
          {usage ? <MenuLabel>{usage}</MenuLabel> : null}
          <MenuItem disabled={running} onSelect={start}>
            {status?.result ? "补翻／重新排版" : legacy ? "翻译全文（块级）" : "翻译全文"}
          </MenuItem>
          <MenuItem disabled={!status?.has_translation || running} onSelect={render}>
            {variants.layout ? "仅重新排版" : "生成原版式"}
          </MenuItem>
          <MenuItem disabled={!status?.has_translation || running} onSelect={recheck}>
            本地重新质检
          </MenuItem>
          <MenuSeparator />
          <MenuLabel>译文版式</MenuLabel>
          <MenuRadioGroup
            aria-label="译文版式"
            value={variants.selected || format}
            onValueChange={(value) => {
              const next = value as TranslationFormat;
              setFormat?.(next);
              if (next === "layout" && !variants.layout) render();
            }}
          >
            <MenuRadioItem
              value="layout"
              disabled={!variants.layout && (!status?.has_translation || running)}
            >
              原版式
            </MenuRadioItem>
            <MenuRadioItem value="reflow" disabled={!variants.reflow}>
              重排
            </MenuRadioItem>
          </MenuRadioGroup>
          <MenuSeparator />
          <MenuLabel>导出译文</MenuLabel>
          <MenuItem
            disabled={!variants.layout || running}
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
            disabled={!variants.aligned || running}
            onSelect={() =>
              void api
                .pdf("aligned")
                .then((blob) => downloadBlob(blob, "ReadFlow-逐行对齐译文.pdf"))
                .catch(() => error("译文下载失败，请重试。"))
            }
          >
            逐行对齐 PDF
          </MenuItem>
          <MenuItem
            disabled={!variants.reflow || running}
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
            disabled={!status?.document || running}
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
