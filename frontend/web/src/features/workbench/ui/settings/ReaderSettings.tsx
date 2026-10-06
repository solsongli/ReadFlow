import { useWb, useWorkbench } from "../context.js";
import { SettingsCard, SettingsRow } from "./SettingsParts.js";
export function ReaderSettings() {
  const wb = useWorkbench();
  const termHover = useWb((s) => s.termHover),
    bilingualOutline = useWb((s) => s.bilingualOutline);
  return (
    <SettingsCard title="阅读辅助" description="仅在本机处理已有术语与块译文；不会自动调用模型。">
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
