import { createHeadlessTranslationSettings, createHeadlessAgentSettings } from "@/features/credentials/domain.js";
import { researchLibraryApi } from "@/platform/api/research-library.js";
import { createSettingsGlossaries } from "./settings-glossaries.js";

export function createSettingsServices() {
  return {
    translation: createHeadlessTranslationSettings(),
    agent: createHeadlessAgentSettings(),
    glossaries: createSettingsGlossaries(),
    ocr: {
      modules: researchLibraryApi.ocrModules, preview: researchLibraryApi.ocrPreview,
      install: researchLibraryApi.installOcr, remove: researchLibraryApi.removeOcr, cancel: researchLibraryApi.cancelOcrInstall,
    },
    version: () => {
      const bridge = typeof window !== "undefined" ? window.retainPdfDesktop : undefined;
      const value = bridge?.appVersion;
      return typeof value === "string" && value.trim() ? value.trim() : "开发版";
    },
  };
}
export type SettingsServices = ReturnType<typeof createSettingsServices>;
