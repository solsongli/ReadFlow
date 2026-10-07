import { MoreHorizontal } from "lucide-react";
import { IconButton } from "@/ui/wb/Button.js";
import {
  MenuRoot,
  MenuTrigger,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuCheckboxItem,
} from "@/ui/wb/Menu.js";
import type { PaperTone, ReaderPorts } from "../domain/types.js";
export function ReaderActions({
  tone,
  setTone,
  bookmark,
  focus,
  toggleFocus,
  margins,
  setMargins,
  alignmentGuide,
  setAlignmentGuide,
}: {
  tone: PaperTone;
  setTone: (value: PaperTone) => void;
  bookmark: () => void;
  focus: boolean;
  toggleFocus: () => void;
  margins?: ReaderPorts["marginPreferences"];
  setMargins?: ReaderPorts["setMarginPreferences"];
  alignmentGuide?: boolean;
  setAlignmentGuide?: ReaderPorts["setAlignmentGuide"];
}) {
  return (
    <MenuRoot>
      <MenuTrigger asChild>
        <IconButton label="更多阅读操作" title="更多阅读操作">
          <MoreHorizontal size={17} />
        </IconButton>
      </MenuTrigger>
      <MenuContent>
        <MenuItem onSelect={bookmark}>添加书签</MenuItem>
        <MenuItem onSelect={toggleFocus} shortcut="F">
          {focus ? "退出专注模式" : "专注模式"}
        </MenuItem>
        <MenuSeparator />
        {setAlignmentGuide ? (
          <MenuCheckboxItem
            checked={alignmentGuide !== false}
            onCheckedChange={(enabled) => setAlignmentGuide(enabled)}
          >
            对齐辅助线
          </MenuCheckboxItem>
        ) : null}
        {margins ? (
          <>
            <MenuCheckboxItem
              checked={margins.notes}
              onCheckedChange={(notes) => setMargins?.({ ...margins, notes })}
            >
              页边批注
            </MenuCheckboxItem>
            <MenuCheckboxItem
              checked={margins.translations}
              onCheckedChange={(translations) => setMargins?.({ ...margins, translations })}
            >
              全部译文旁排
            </MenuCheckboxItem>
            <MenuLabel>页边位置</MenuLabel>
            <MenuRadioGroup
              value={margins.side}
              onValueChange={(side) =>
                setMargins?.({ ...margins, side: side === "right" ? "right" : "auto" })
              }
            >
              <MenuRadioItem value="auto">自动（按原文位置）</MenuRadioItem>
              <MenuRadioItem value="right">统一右侧</MenuRadioItem>
            </MenuRadioGroup>
            <MenuSeparator />
          </>
        ) : null}
        <MenuLabel>页面底色</MenuLabel>
        <MenuRadioGroup
          aria-label="页面底色"
          value={tone}
          onValueChange={(value) => setTone(value as PaperTone)}
        >
          {(
            [
              ["auto", "跟随明暗"],
              ["white", "白纸"],
              ["sepia", "护眼米色"],
              ["night", "夜间"],
            ] as const
          ).map(([value, label]) => (
            <MenuRadioItem key={value} value={value}>
              {label}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuContent>
    </MenuRoot>
  );
}
