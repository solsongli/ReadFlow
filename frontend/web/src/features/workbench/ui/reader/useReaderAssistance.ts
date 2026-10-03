import { createHeadlessTranslationSettings } from "@/features/credentials/domain.js";
import { loadDeveloperStoredConfig } from "@/platform/config/persisted-config.js";
import { translationPayload, translationReady } from "../../domain/translation.js";
import { useWorkbench } from "../context.js";
export function useReaderAssistance(item: string, title: string, canvas: (body: string) => void) {
  const wb = useWorkbench();
  return {
    translationConfig: async () => {
      const draft = await createHeadlessTranslationSettings().load();
      if (!translationReady(draft)) throw { code: "unconfigured" };
      return { translation: { ...translationPayload(draft, loadDeveloperStoredConfig()).translation },
        service: draft.provider };
    },
    settings: (section: "translation" | "ai") => wb.openSettings(section),
    note: async (body: string) => {
      const saved = await wb.api.createNote(item, { body });
      await wb.readerNotesChanged(item);
      await wb.notes.open({ id: item, title }, saved.id);
    },
    canvas,
  };
}
