import type { ReactNode } from "react";
import { FileText, Library, Monitor, Moon, Search, Settings, Sun, X } from "lucide-react";
import { cn } from "@/ui/lib/utils.js";
import { IconButton } from "@/ui/wb/Button.js";
import { Kbd } from "@/ui/wb/Kbd.js";
import { MenuContent, MenuItem, MenuLabel, MenuRadioGroup, MenuRadioItem, MenuRoot, MenuSeparator, MenuTrigger } from "@/ui/wb/Menu.js";
import { LIBRARY_TAB, type ThemePreference } from "../../domain/workbench-store.js";
import { useWb, useWorkbench } from "../context.js";

const THEME_ICON = { system: Monitor, light: Sun, dark: Moon } as const;

function Tab({ active, onSelect, onClose, icon, children, title }: {
  active: boolean;
  onSelect: () => void;
  onClose?: () => void;
  icon: ReactNode;
  children: ReactNode;
  title?: string;
}) {
  return (
    <div
      className={cn(
        "group relative -mb-px flex h-8 min-w-0 items-center gap-2 border border-transparent pl-3.5",
        onClose ? "w-[220px] pr-1.5" : "pr-3.5",
        active ? "rounded-t-md border-wb-chrome-line border-b-wb-bg bg-wb-bg font-medium text-wb-text" : "text-wb-text-2 hover:text-wb-text",
      )}
    >
      <button type="button" onClick={onSelect} title={title} className="flex min-w-0 flex-1 items-center gap-2 border-0 bg-transparent p-0 text-left">
        <span className="shrink-0 text-wb-text-3">{icon}</span>
        <span className="wb-truncate">{children}</span>
      </button>
      {onClose ? (
        <IconButton label="关闭标签页" size="xs" onClick={onClose} className="opacity-70 group-hover:opacity-100">
          <X size={12} strokeWidth={2.2} aria-hidden="true" />
        </IconButton>
      ) : null}
    </div>
  );
}

export function TitleBar() {
  const wb = useWorkbench();
  const tabs = useWb((state) => state.tabs);
  const activeTab = useWb((state) => state.activeTab);
  const theme = useWb((state) => state.theme);
  const ThemeIcon = THEME_ICON[theme];

  return (
    <header className="flex h-10 shrink-0 items-end gap-1 border-b border-wb-chrome-line bg-wb-chrome px-2.5">
      <div className="flex h-10 items-center gap-2 pl-1.5 pr-3">
        <span aria-hidden="true" className="inline-flex h-[18px] w-[18px] items-center justify-center rounded bg-wb-accent font-wb-mono text-[11px] font-medium text-wb-on-accent">
          rf
        </span>
        <span className="text-[13px] font-semibold">ReadFlow</span>
      </div>
      <nav aria-label="标签页" className="flex min-w-0 items-end gap-0.5">
        <Tab active={activeTab === LIBRARY_TAB} onSelect={() => wb.activateTab(LIBRARY_TAB)} icon={<Library size={14} aria-hidden="true" />}>
          文献库
        </Tab>
        {tabs.map((tab) => (
          <Tab
            key={tab.id}
            active={activeTab === tab.id}
            title={tab.title}
            onSelect={() => wb.activateTab(tab.id)}
            onClose={() => wb.closeTab(tab.id)}
            icon={<FileText size={14} aria-hidden="true" />}
          >
            {tab.title}
          </Tab>
        ))}
      </nav>
      <div className="flex h-10 min-w-0 flex-1 items-center justify-center px-3">
        <button
          type="button"
          onClick={() => wb.setPalette(true)}
          className="flex h-7 w-full max-w-[380px] items-center gap-2 rounded-md border border-wb-chrome-line bg-wb-panel px-2.5 text-left text-wb-text-3 hover:border-wb-line-strong"
        >
          <Search size={14} aria-hidden="true" />
          <span className="flex-1 wb-truncate">搜索题名（中英）、作者、全文，或输入命令…</span>
          <Kbd>Ctrl K</Kbd>
        </button>
      </div>
      <div className="flex h-10 items-center gap-0.5">
        <MenuRoot>
          <MenuTrigger asChild>
            <IconButton label="主题">
              <ThemeIcon size={15} aria-hidden="true" />
            </IconButton>
          </MenuTrigger>
          <MenuContent align="end">
            <MenuLabel>外观</MenuLabel>
            <MenuRadioGroup value={theme} onValueChange={(value) => wb.setPrefs({ theme: value as ThemePreference })}>
              <MenuRadioItem value="system">跟随系统</MenuRadioItem>
              <MenuRadioItem value="light">浅色</MenuRadioItem>
              <MenuRadioItem value="dark">深色</MenuRadioItem>
            </MenuRadioGroup>
          </MenuContent>
        </MenuRoot>
        <MenuRoot>
          <MenuTrigger asChild>
            <IconButton label="设置">
              <Settings size={15} aria-hidden="true" />
            </IconButton>
          </MenuTrigger>
          <MenuContent align="end">
            <MenuLabel>设置（过渡期沿用旧界面）</MenuLabel>
            <MenuItem onSelect={() => window.location.assign("./index.html?settings=api")}>翻译 / OCR 接口设置…</MenuItem>
            <MenuSeparator />
            <MenuItem onSelect={() => window.location.assign("./index.html")}>打开旧版界面</MenuItem>
          </MenuContent>
        </MenuRoot>
      </div>
    </header>
  );
}
