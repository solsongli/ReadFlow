import { listFonts } from "@retainpdf/api/fonts";
import { API_PREFIX } from "@/platform/config/api-constants.js";
import { getStoredFontFamily, setStoredFontFamily, RENDER_FONT_STORAGE_KEY, RENDER_FONT_CHANGE_EVENT } from "@/features/settings/domain.js";
import { validWorkbenchFontFamily } from "../domain/interface-fonts.js";

export interface InstalledFont { family: string; chinese: boolean }
function fontBridge() {
  const bridge = typeof window !== "undefined" ? window.retainPdfDesktop : undefined;
  return typeof bridge?.listInstalledFonts === "function" ? bridge.listInstalledFonts as () => Promise<unknown> : null;
}
export function createSettingsFonts() {
  return {
    desktop: () => Boolean(fontBridge()),
    async installed(): Promise<InstalledFont[]> {
      const load = fontBridge();
      if (!load) return [];
      const values = await load();
      if (!Array.isArray(values)) throw new Error("无法读取本机字体。");
      return values.filter((value): value is InstalledFont => value && validWorkbenchFontFamily(value.family) && typeof value.chinese === "boolean");
    },
    render: {
      list: () => listFonts(API_PREFIX),
      read: getStoredFontFamily,
      save(family: string) {
        const saved = setStoredFontFamily(family);
        if (getStoredFontFamily() !== saved) throw new Error("译文排版字体未能保存，请重试。");
        return saved;
      },
      subscribe(listener: () => void) {
        const storage = (event: StorageEvent) => { if (event.key === RENDER_FONT_STORAGE_KEY || event.key === null) listener(); };
        window.addEventListener(RENDER_FONT_CHANGE_EVENT, listener);
        window.addEventListener("storage", storage);
        return () => { window.removeEventListener(RENDER_FONT_CHANGE_EVENT, listener); window.removeEventListener("storage", storage); };
      },
    },
  };
}
