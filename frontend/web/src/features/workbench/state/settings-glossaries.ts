import { createGlossariesViewFeature, mountGlossariesFeature } from "@/features/glossaries/index.js";
import { fetchGlossariesApi, fetchGlossaryApi, createGlossaryApi, updateGlossaryApi, deleteGlossaryApi, exportGlossaryCsvApi, parseGlossaryCsvApi } from "@/platform/api/index.js";
import { API_PREFIX } from "@/platform/config/api-constants.js";
import { loadPersistedConfig } from "@/platform/config/desktop-persistence.js";
import { loadDeveloperStoredConfig, savePersistedDeveloperStoredConfig } from "@/platform/config/persisted-config.js";
import { notifyCredentialsChanged } from "@/platform/contracts/credentials-contract.js";

export function createSettingsGlossaries(env: {
  api?: { fetchGlossaries: typeof fetchGlossariesApi; fetchGlossary: typeof fetchGlossaryApi; createGlossary: typeof createGlossaryApi; updateGlossary: typeof updateGlossaryApi; deleteGlossary: typeof deleteGlossaryApi; exportGlossaryCsv: typeof exportGlossaryCsvApi; parseGlossaryCsv: typeof parseGlossaryCsvApi };
  initialize?: () => Promise<unknown>;
  readOptions?: () => Record<string, unknown>;
  saveOptions?: (value: Record<string, unknown>) => Promise<unknown>;
} = {}) {
  const read = env.readOptions ?? loadDeveloperStoredConfig;
  const save = env.saveOptions ?? savePersistedDeveloperStoredConfig;
  const view = createGlossariesViewFeature({ dialogStore: { open: () => {}, close: () => {} } });
  async function enable(id: string) {
    await save({ ...read(), glossaryId: id });
    notifyCredentialsChanged();
  }
  const feature = mountGlossariesFeature({ apiPrefix: API_PREFIX,
    ...(env.api ?? { fetchGlossaries: fetchGlossariesApi, fetchGlossary: fetchGlossaryApi, createGlossary: createGlossaryApi, updateGlossary: updateGlossaryApi, deleteGlossary: deleteGlossaryApi, exportGlossaryCsv: exportGlossaryCsvApi, parseGlossaryCsv: parseGlossaryCsvApi }),
    viewPort: view.viewPort,
    refreshWorkflowGlossaries: async () => {
      const enabled = String(read().glossaryId || "");
      if (enabled && !view.store.getSnapshot().items.some((item) => item.glossary_id === enabled)) await enable("");
    },
  });
  feature.bindEvents();
  return { view, feature, enable, enabled: () => String(read().glossaryId || ""),
    async open() { await (env.initialize ?? loadPersistedConfig)(); await feature.open(); },
  };
}
export type SettingsGlossaries = ReturnType<typeof createSettingsGlossaries>;
