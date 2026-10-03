import { useEffect, useState } from "react";
import { Button } from "@/ui/wb/Button.js";
import { FONT_OPTIONS, WORKBENCH_TEXT_SCALES, textScaleIndex, type WorkbenchFont, type NoteFont } from "../../domain/typography.js";
import type { InstalledFont } from "../../state/settings-fonts.js";
import { useWb, useWorkbench } from "../context.js";
import { SETTINGS_INPUT, SettingsCard, SettingsRow, SettingsStatus } from "./SettingsParts.js";

export function TypographySettings() {
  const wb = useWorkbench();
  const service = wb.settingsServices().fonts;
  const uiFont = useWb((state) => state.uiFont);
  const customFont = useWb((state) => state.customFont);
  const textScale = useWb((state) => state.textScale);
  const noteFont = useWb((state) => state.noteFont);
  const [choosing, setChoosing] = useState(false);
  const [fonts, setFonts] = useState<InstalledFont[] | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const custom = service.desktop() && (choosing || uiFont === "custom");
  useEffect(() => {
    if (!custom) return;
    let live = true;
    setError("");
    service.installed().then((value) => { if (live) setFonts(value); }).catch(() => { if (live) setError("无法读取本机字体，仍可使用预置字体。"); });
    return () => { live = false; };
  }, [custom, attempt, service]);
  const visible = fonts?.filter((font) => font.family.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())) ?? [];
  return <SettingsCard title="字体与文字" description="界面更改立即生效，PDF 页面保留自己的字体与缩放。">
    <SettingsRow label="界面字体"><select aria-label="界面字体" className={SETTINGS_INPUT} value={custom ? "custom" : uiFont === "custom" ? "default" : uiFont} onChange={(event) => {
      const value = event.target.value as WorkbenchFont;
      if (value === "custom") setChoosing(true);
      else { setChoosing(false); wb.setPrefs({ uiFont: value }); }
    }}>{FONT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}{service.desktop() ? <option value="custom">其他已安装字体…</option> : null}</select></SettingsRow>
    {custom ? <div className="wb-info-row relative flex flex-col gap-2 p-3.5">
      <input type="search" aria-label="搜索本机字体" placeholder="搜索本机字体" value={search} className={SETTINGS_INPUT} onChange={(event) => setSearch(event.target.value)} />
      <select aria-label="已安装字体" className={SETTINGS_INPUT} disabled={!fonts} value={visible.some((font) => font.family === customFont) ? customFont : ""} onChange={(event) => { wb.setPrefs({ uiFont: "custom", customFont: event.target.value }); setChoosing(false); }}>
        <option value="" disabled>{fonts ? "选择本机字体" : "正在读取本机字体…"}</option>
        {visible.map((font) => <option key={font.family} value={font.family}>{font.family}{font.chinese ? " · 支持中文" : ""}</option>)}
      </select>
      {fonts && uiFont === "custom" && !fonts.some((font) => font.family === customFont) ? <SettingsStatus message="已保存的字体当前未安装，正使用回退字体。" /> : null}
      <div className="flex items-center gap-2"><SettingsStatus message={error || (fonts && !visible.length ? "没有匹配的本机字体。" : "")} /><Button size="sm" onClick={() => setAttempt((value) => value + 1)}>刷新字体</Button></div>
    </div> : null}
    <div className="wb-info-row relative break-words px-3.5 py-3 font-wb-sans text-[0.875rem]" aria-label="字体预览">ReadFlow 文献管理 · Bilingual Reading 2026</div>
    <SettingsRow label="文字大小" hint={`${textScale}%${textScale === 100 ? "（默认）" : ""}`}><div className="flex items-center gap-3"><span className="text-[0.75rem] text-wb-text-3">小</span><input type="range" min={0} max={WORKBENCH_TEXT_SCALES.length - 1} step={1} aria-label="文字大小" aria-valuetext={`${textScale}%`} value={textScaleIndex(textScale)} onChange={(event) => wb.setPrefs({ textScale: WORKBENCH_TEXT_SCALES[Number(event.target.value)] })} className="min-w-0 flex-1 accent-wb-accent" /><span className="text-[0.75rem] text-wb-text-3">大</span></div></SettingsRow>
    <SettingsRow label="笔记编辑器字体"><select aria-label="笔记编辑器字体" className={SETTINGS_INPUT} value={noteFont} onChange={(event) => wb.setPrefs({ noteFont: event.target.value as NoteFont })}><option value="interface">跟随界面</option><option value="serif">衬线</option><option value="mono">等宽</option></select></SettingsRow>
    <div className="wb-info-row relative flex justify-end p-3.5"><Button size="sm" title="恢复默认文字大小（100%）" onClick={() => wb.setPrefs({ textScale: 100 })}>恢复默认</Button></div>
  </SettingsCard>;
}
