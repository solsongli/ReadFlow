import { ServiceBanner } from "../shell/ServiceBanner.js";
import { BookOpenText, ChevronLeft, Info, Languages, Library, MessageSquare, ScanText, Settings } from "lucide-react";
import { cn } from "@/ui/lib/utils.js";
import { Button } from "@/ui/wb/Button.js";
import { SETTINGS_SECTIONS } from "../../domain/settings.js";
import { useWb, useWorkbench } from "../context.js";
import { AboutSettings } from "./AboutSettings.js";
import { AgentSettings } from "./AgentSettings.js";
import { GeneralSettings } from "./GeneralSettings.js";
import { GlossarySettings } from "./GlossarySettings.js";
import { LibrarySettings } from "./LibrarySettings.js";
import { OcrSettings } from "./OcrSettings.js";
import { TranslationSettings } from "./TranslationSettings.js";

const ICONS = { general: Settings, translation: Languages, ocr: ScanText, ai: MessageSquare, glossaries: BookOpenText, library: Library, about: Info };
const COLORS = { general: "bg-[var(--wb-settings-general)]", translation: "bg-[var(--wb-settings-translation)]", ocr: "bg-[var(--wb-settings-ocr)]", ai: "bg-[var(--wb-settings-ai)]", glossaries: "bg-[var(--wb-settings-glossaries)]", library: "bg-[var(--wb-settings-library)]", about: "bg-[var(--wb-settings-about)]" };
const PAGES = { general: GeneralSettings, translation: TranslationSettings, ocr: OcrSettings, ai: AgentSettings, glossaries: GlossarySettings, library: LibrarySettings, about: AboutSettings };
export function SettingsView() {
  const wb = useWorkbench();
  const section = useWb((state) => state.settingsSection);
  const selected = SETTINGS_SECTIONS.find((entry) => entry.id === section)!;
  const Page = PAGES[section];
  return <section aria-label="ReadFlow 设置" className="flex min-h-0 min-w-0 flex-1 flex-col bg-wb-panel">
    <header className="flex h-[52px] shrink-0 items-center gap-3 border-b border-wb-line-soft px-4"><Button variant="ghost" size="sm" icon={<ChevronLeft size={15} aria-hidden="true" />} onClick={wb.closeSettings}>完成</Button><span className="text-[12px] text-wb-text-3">设置</span></header><ServiceBanner />
    <div className="flex min-h-0 flex-1">
      <nav aria-label="设置分类" className="wb-scroll w-[184px] shrink-0 border-r border-wb-line-soft bg-wb-sidebar p-2.5">
        {SETTINGS_SECTIONS.map((entry) => { const Icon = ICONS[entry.id]; return <button key={entry.id} type="button" aria-current={entry.id === section ? "page" : undefined} onClick={() => wb.setSettingsSection(entry.id)} className={cn("wb-transition mb-1 flex min-h-9 w-full items-center gap-2.5 rounded-lg px-2 text-left text-[13px]", entry.id === section ? "bg-wb-selected font-medium" : "hover:bg-wb-hover")}><span aria-hidden="true" className={cn("inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[var(--wb-settings-on-icon)]", COLORS[entry.id])}><Icon size={15} strokeWidth={1.8} /></span>{entry.title}</button>; })}
      </nav>
      <main aria-label={selected.title} className="wb-scroll min-w-0 flex-1"><div className="mx-auto flex w-full max-w-[850px] flex-col gap-5 px-6 py-7">
        <div><h1 className="m-0 text-[28px] font-bold tracking-[-0.025em]">{selected.title}</h1>{section !== "about" ? <p className="mb-0 mt-2 text-[13px] text-wb-text-3">{selected.description}</p> : null}</div>
        <Page key={section} />
      </div></main>
    </div>
  </section>;
}
