import { useEffect, useState } from "react";
import { Button } from "@/ui/wb/Button.js";
import { useWorkbench } from "../context.js";
import { SETTINGS_INPUT, SettingsCard, SettingsRow, SettingsStatus } from "./SettingsParts.js";

export function RenderFontSettings() {
  const wb = useWorkbench();
  const service = wb.settingsServices().fonts.render;
  const [fonts, setFonts] = useState<Array<{ family: string; available: boolean }>>([]);
  const [selected, setSelected] = useState(service.read);
  const [error, setError] = useState("");
  const [retryFamily, setRetryFamily] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  function save(family: string) {
    try { setSelected(service.save(family)); setError(""); setRetryFamily(null); wb.dismissNotice(); }
    catch { const failure = new Error("译文排版字体未能保存，请重试。"); setError(failure.message); setRetryFamily(family); wb.failure(failure, async () => save(family)); }
  }
  useEffect(() => service.subscribe(() => setSelected(service.read())), [service]);
  useEffect(() => {
    let live = true; setError("");
    service.list().then((value) => { if (live) setFonts(value); }).catch(() => { if (live) setError("译文排版字体列表读取失败，请重试。"); });
    return () => { live = false; };
  }, [service, attempt]);
  return <SettingsCard title="译文排版字体" description="影响之后新生成的译文 PDF">
    <SettingsRow label="排版字体"><select aria-label="译文排版字体" className={SETTINGS_INPUT} value={fonts.some((font) => font.family === selected) ? selected : ""} onChange={(event) => save(event.target.value)}>
      {!fonts.some((font) => font.family === selected) ? <option value="" disabled>{selected}（当前已保存）</option> : null}
      {fonts.map((font) => <option key={font.family} value={font.family} disabled={!font.available}>{font.family}{font.available ? "" : "（不可用）"}</option>)}
    </select></SettingsRow>
    {error ? <div className="flex items-center justify-between gap-3 p-3.5"><SettingsStatus message={error} /><Button size="sm" onClick={() => retryFamily ? save(retryFamily) : setAttempt((value) => value + 1)}>重试</Button></div> : null}
  </SettingsCard>;
}
