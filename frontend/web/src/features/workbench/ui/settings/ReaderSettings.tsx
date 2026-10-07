import { useWb, useWorkbench } from "../context.js";
import { SettingsCard, SettingsRow } from "./SettingsParts.js";
export function ReaderSettings() {
  const wb = useWorkbench();
  const termHover = useWb((s) => s.termHover),
    bilingualOutline = useWb((s) => s.bilingualOutline);
  const marginNotes = useWb((s) => s.marginNotes);
  const marginSide = useWb((s) => s.marginSide);
  const marginTranslations = useWb((s) => s.marginTranslations);
  const alignmentGuide = useWb((s) => s.alignmentGuide);
  return (
    <SettingsCard title="阅读辅助" description="仅在本机处理已有术语与块译文；不会自动调用模型。">
      <SettingsRow label="页边批注">
        <input
          type="checkbox"
          aria-label="页边批注"
          checked={marginNotes}
          onChange={(e) => wb.setPrefs({ marginNotes: e.target.checked })}
        />
      </SettingsRow>
      <SettingsRow label="页边位置">
        <select
          aria-label="页边位置"
          value={marginSide}
          className="rounded-lg border-0 bg-wb-fill p-2"
          onChange={(e) => wb.setPrefs({ marginSide: e.target.value === "right" ? "right" : "auto" })}
        >
          <option value="auto">自动（按原文位置）</option>
          <option value="right">统一右侧</option>
        </select>
      </SettingsRow>
      <SettingsRow label="全部译文旁排">
        <input
          type="checkbox"
          aria-label="全部译文旁排"
          checked={marginTranslations}
          onChange={(e) => wb.setPrefs({ marginTranslations: e.target.checked })}
        />
      </SettingsRow>
      <SettingsRow label="对齐辅助线">
        <input
          type="checkbox"
          aria-label="对齐辅助线"
          checked={alignmentGuide}
          onChange={(e) => wb.setPrefs({ alignmentGuide: e.target.checked })}
        />
      </SettingsRow>
      <SettingsRow label="术语悬停释义">
        <input
          type="checkbox"
          aria-label="术语悬停释义"
          checked={termHover}
          onChange={(e) => wb.setPrefs({ termHover: e.target.checked })}
        />
      </SettingsRow>
      <SettingsRow label="目录显示译文">
        <input
          type="checkbox"
          aria-label="目录显示译文"
          checked={bilingualOutline}
          onChange={(e) => wb.setPrefs({ bilingualOutline: e.target.checked })}
        />
      </SettingsRow>
    </SettingsCard>
  );
}
