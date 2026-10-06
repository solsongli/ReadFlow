import { ReaderSettings } from "./ReaderSettings.js";
import { AnnotationSettings } from "./AnnotationSettings.js";
import { cn } from "@/ui/lib/utils.js";
import type { Density, ThemePreference } from "../../domain/workbench-store.js";
import { useWb, useWorkbench } from "../context.js";
import { SETTINGS_INPUT, SettingsCard, SettingsRow } from "./SettingsParts.js";
import { TypographySettings } from "./TypographySettings.js";

function ThemePreview({ dark }: { dark: boolean }) {
  return <span aria-hidden="true" className={cn("flex h-[3.875rem] flex-1 overflow-hidden rounded-md", dark ? "bg-[var(--wb-settings-preview-dark)]" : "bg-[var(--wb-settings-preview-light)]")}>
    <span className={cn("flex w-1/4 flex-col gap-1 p-1.5", dark ? "bg-[var(--wb-settings-preview-sidebar-dark)]" : "bg-[var(--wb-settings-preview-sidebar-light)]")}>
      {[0, 1, 2].map((n) => <span key={n} className="h-1 rounded-full bg-wb-text-3 opacity-35" />)}
    </span>
    <span className="flex flex-1 flex-col gap-1.5 p-2"><span className="h-1 w-3/5 rounded-full bg-wb-text-3 opacity-50" /><span className="h-1 w-4/5 rounded-full bg-wb-text-3 opacity-20" /><span className="h-1 w-3/5 rounded-full bg-wb-text-3 opacity-20" /></span>
  </span>;
}
export function GeneralSettings() {
  const wb = useWorkbench();
  const newLimit = useWb((s) => s.reviewNewLimit);
  const reviewLimit = useWb((s) => s.reviewLimit);
  const theme = useWb((state) => state.theme);
  const density = useWb((state) => state.density);
  const startView = useWb((state) => state.startView);
  return <>
    <SettingsCard title="外观">
      <div role="radiogroup" aria-label="外观模式" className="grid grid-cols-3 gap-3 p-3.5">
        {([['system', '跟随系统'], ['light', '浅色'], ['dark', '深色']] as const).map(([value, label]) => (
          <button key={value} type="button" role="radio" aria-checked={theme === value} onClick={() => wb.setPrefs({ theme: value as ThemePreference })}
            className={cn("wb-transition flex min-w-0 flex-col gap-2 rounded-xl border-2 bg-transparent p-2 text-[0.75rem]", theme === value ? "border-wb-accent" : "border-transparent hover:bg-wb-hover")}>
            <span className="flex w-full gap-px">{value === "system" ? <><ThemePreview dark={false} /><ThemePreview dark /></> : <ThemePreview dark={value === "dark"} />}</span>
            {label}
          </button>
        ))}
      </div>
    </SettingsCard>
    <TypographySettings />
    <ReaderSettings />
    <AnnotationSettings />
    <SettingsCard title="闪卡复习" description="按本地时间凌晨 4 点切换学习日。">
      <SettingsRow label="每日新卡上限"><input type="number" min="0" max="1000" aria-label="每日新卡上限"
        className={SETTINGS_INPUT} value={newLimit}
        onChange={(e) => wb.setPrefs({ reviewNewLimit: Math.max(0, Math.min(1000, Number(e.target.value))) })} /></SettingsRow>
      <SettingsRow label="每日复习上限"><input type="number" min="0" max="5000" aria-label="每日复习上限"
        className={SETTINGS_INPUT} value={reviewLimit}
        onChange={(e) => wb.setPrefs({ reviewLimit: Math.max(0, Math.min(5000, Number(e.target.value))) })} /></SettingsRow>
    </SettingsCard>
    <SettingsCard title="使用习惯" description="更改会自动保存在本机。">
      <SettingsRow label="文献列表默认密度"><select aria-label="文献列表默认密度" className={SETTINGS_INPUT} value={density} onChange={(event) => wb.setPrefs({ density: event.target.value as Density })}><option value="bilingual">双语</option><option value="compact">紧凑</option></select></SettingsRow>
      <SettingsRow label="启动时显示"><select aria-label="启动时显示" className={SETTINGS_INPUT} value={startView} onChange={(event) => wb.setPrefs({ startView: event.target.value as "desk" | "library" })}><option value="desk">书桌</option><option value="library">文献库</option></select></SettingsRow>
    </SettingsCard>
  </>;
}
