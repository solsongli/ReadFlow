import { Settings } from "lucide-react";
import { IconButton } from "@/ui/wb/Button.js";
import { MenuContent, MenuItem, MenuLabel, MenuRadioGroup, MenuRadioItem, MenuRoot, MenuSeparator, MenuTrigger } from "@/ui/wb/Menu.js";
import type { ThemePreference } from "../../domain/workbench-store.js";
import { useWb, useWorkbench } from "../context.js";

export function SettingsMenu() {
  const wb = useWorkbench();
  const theme = useWb((state) => state.theme);
  return (
    <MenuRoot>
      <MenuTrigger asChild>
        <IconButton label="设置" title="设置（Ctrl ,）"><Settings size={17} strokeWidth={1.7} aria-hidden="true" /></IconButton>
      </MenuTrigger>
      <MenuContent align="start" side="top">
        <MenuItem shortcut="Ctrl ," onSelect={() => wb.openSettings()}>设置…</MenuItem>
        <MenuSeparator />
        <MenuLabel>外观</MenuLabel>
        <MenuRadioGroup value={theme} onValueChange={(value) => wb.setPrefs({ theme: value as ThemePreference })}>
          <MenuRadioItem value="system">跟随系统</MenuRadioItem>
          <MenuRadioItem value="light">浅色</MenuRadioItem>
          <MenuRadioItem value="dark">深色</MenuRadioItem>
        </MenuRadioGroup>
        <MenuSeparator />
      </MenuContent>
    </MenuRoot>
  );
}
