import { useState } from "react";
import { Button } from "@/ui/wb/Button.js";
import { useWorkbench } from "../context.js";
import { SettingsCard, SettingsRow, SettingsStatus } from "./SettingsParts.js";

export function AboutSettings() {
  const version = useWorkbench().settingsServices().version();
  const [logo, setLogo] = useState(true);
  const [license, setLicense] = useState<string | null>(null);
  const [error, setError] = useState("");
  async function showLicense() {
    try { const response = await fetch("./src/assets/fonts/inter/LICENSE.txt"); if (!response.ok) throw new Error(); setLicense(await response.text()); setError(""); }
    catch { setError("许可文件暂时无法读取。"); }
  }
  return <>
    <div className="flex items-center gap-4 py-2">{logo ? <img src="./src/assets/readflow-logo.svg" alt="ReadFlow" className="h-16 w-16" onError={() => setLogo(false)} /> : <span className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-wb-fill text-[24px] font-semibold">RF</span>}<div><p className="m-0 text-[24px] font-bold tracking-[-0.02em]">ReadFlow</p><p className="m-0 mt-1 text-[13px] text-wb-text-3">{version}</p></div></div>
    <p className="m-0 text-[13px] leading-relaxed text-wb-text-3">面向科研的文献管理、双语阅读与笔记工具</p>
    <SettingsCard title="开源许可">
      <SettingsRow label="基于 RetainPDF 开源项目"><span className="text-[12px] text-wb-text-3">MIT License</span></SettingsRow>
      <SettingsRow label="Inter 字体"><a href="./src/assets/fonts/inter/LICENSE.txt" className="text-[12px] text-wb-link hover:underline" onClick={(event) => { event.preventDefault(); void showLicense(); }}>SIL Open Font License（OFL）</a></SettingsRow>
    </SettingsCard>
    {license != null ? <SettingsCard title="Inter 字体许可"><div className="p-3.5"><pre className="wb-scroll m-0 max-h-60 whitespace-pre-wrap break-words font-wb-sans text-[12px] text-wb-text-2">{license}</pre><Button size="sm" className="mt-3" onClick={() => setLicense(null)}>收起许可</Button></div></SettingsCard> : null}
    <SettingsStatus message={error} tone="error" />
    <div><Button onClick={() => window.location.assign("./index.html")}>打开旧版界面</Button></div>
  </>;
}
