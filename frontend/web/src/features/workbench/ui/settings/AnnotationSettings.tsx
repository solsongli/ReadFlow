import { useWb, useWorkbench } from "../context.js";
import { SettingsCard, SettingsRow, SETTINGS_INPUT } from "./SettingsParts.js";
export function AnnotationSettings() {
  const labels = useWb((state) => state.annotationSemantics);
  const wb = useWorkbench();
  return (
    <SettingsCard title="批注颜色含义" description="颜色名称用于阅读器批注栏和导出；更改会自动保存。">
      {(["yellow", "blue", "green", "red", "purple"] as const).map((color, index) => (
        <SettingsRow key={color} label={["黄色", "蓝色", "绿色", "红色", "紫色"][index]}>
          <input
            aria-label={`${color} 颜色含义`}
            className={SETTINGS_INPUT}
            value={labels[color]}
            maxLength={40}
            onChange={(event) =>
              wb.setPrefs({ annotationSemantics: { ...labels, [color]: event.target.value } })
            }
          />
        </SettingsRow>
      ))}
    </SettingsCard>
  );
}
