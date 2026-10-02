import { LIBRARY_TAB, type WorkbenchStore } from "../domain/workbench-store.js";
import type { SettingsSection } from "../domain/settings.js";
import { createSettingsServices, type SettingsServices } from "./settings-services.js";

export function createSettingsNavigation(store: WorkbenchStore, factory: () => SettingsServices = createSettingsServices) {
  let services: SettingsServices | null = null;
  return {
    settingsServices: () => services ?? (services = factory()),
    openSettings(section: SettingsSection = "general") {
      const state = store.getSnapshot();
      store.actions.patch({ main: "settings", activeTab: LIBRARY_TAB, settingsSection: section,
        settingsReturn: state.main === "settings" ? state.settingsReturn : { main: state.main, activeTab: state.activeTab } });
    },
    closeSettings() {
      const state = store.getSnapshot();
      const back = state.settingsReturn;
      store.actions.patch({ main: back.main, activeTab: back.activeTab === LIBRARY_TAB || state.tabs.some((tab) => tab.id === back.activeTab) ? back.activeTab : LIBRARY_TAB });
    },
    setSettingsSection: (settingsSection: SettingsSection) => store.actions.patch({ settingsSection }),
  };
}
