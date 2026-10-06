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
} from "@/ui/wb/Menu.js";
import type { PaperTone } from "../domain/types.js";
export function ReaderActions({
  tone,
  setTone,
  bookmark,
  focus,
  toggleFocus,
}: {
  tone: PaperTone;
  setTone: (value: PaperTone) => void;
  bookmark: () => void;
  focus: boolean;
  toggleFocus: () => void;
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
