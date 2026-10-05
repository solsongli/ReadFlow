/** DOM-free adapter over the same profiles, validation and save flow as the legacy settings. */
import { validateDeepSeekToken } from "@/platform/api/index.js";
import { API_PREFIX } from "@/platform/config/api-constants.js";
import { loadPersistedConfig } from "@/platform/config/desktop-persistence.js";
import { loadBrowserStoredConfig, loadDeveloperStoredConfig, savePersistedDeveloperStoredConfig } from "@/platform/config/persisted-config.js";
import { TRANSLATION_PROVIDER_OPTIONS, isOfficialDeepSeekBaseUrl } from "@/platform/config/providers.js";
import { defaultModelApiKey, defaultModelBaseUrl, defaultModelName } from "@/platform/config/runtime.js";
import { createDeveloperConfigResolver, resolveWorkflowDefaults, normalizeWorkflow, normalizeMathMode, workflowConstants } from "@/features/ingest/domain.js";
import { defaultCredentialsStatePort } from "./default-state-port.js";
import type { CredentialsStatePort } from "./state.js";
import { createCredentialAccess } from "./credential-access.js";
import { createTranslationProfiles } from "./translation-profiles.js";
import { createBrowserCredentialSaveFlow } from "./save-flow.js";
import { createCredentialDialogFlow } from "./dialog-flow.js";
import { translationConfigError, translationWorkersError } from "./translation-profile.js";
import { runDeepSeekConnectivityCheck } from "./validation.js";

export interface TranslationDraft { provider: string; baseUrl: string; model: string; apiKey: string; workers: string }
export type SettingsFeedback = { message: string; tone: string };
export interface HeadlessTranslationEnv {
  statePort?: CredentialsStatePort;
  load?: () => Promise<{ browser: Record<string, unknown>; developer: Record<string, unknown> }>;
  readDeveloper?: () => Record<string, unknown>;
  saveDeveloper?: (value: Record<string, unknown>) => Promise<unknown>;
  validate?: typeof validateDeepSeekToken;
}

export function createHeadlessTranslationSettings(env: HeadlessTranslationEnv = {}) {
  const elements = { apiKeyInput: { value: "" }, modelBaseUrlInput: { value: "" }, modelNameInput: { value: "" }, translationWorkersInput: { value: "5" }, mathModeSelect: { value: "direct_typst" } };
  const elementsPort = { elements: () => elements };
  const credentials = env.statePort ?? defaultCredentialsStatePort;
  const profiles = createTranslationProfiles({ dialogElementsPort: elementsPort });
  let task: Record<string, unknown> = {};
  let initialized = false;
  let feedback: SettingsFeedback = { message: "", tone: "" };
  const readDeveloper = env.readDeveloper ?? loadDeveloperStoredConfig;
  const saveDeveloper = env.saveDeveloper ?? savePersistedDeveloperStoredConfig;
  function safeMessage(message: string) {
    let text = message;
    const values = [elements.apiKeyInput.value, ...Object.values(profiles.persistable()).map((profile) => profile.apiKey)];
    for (const value of values) if (value) text = text.split(value).join("[已隐藏]");
    return text;
  }
  const status = (message = "", tone = "") => { feedback = { message: safeMessage(message), tone }; };
  const access = createCredentialAccess({ credentialsStatePort: credentials });
  const { developerConfigWithDefaults } = createDeveloperConfigResolver({
    getDeveloperConfig: () => ({ ...readDeveloper(), ...task }), normalizeWorkflow, normalizeMathMode,
    defaults: resolveWorkflowDefaults(workflowConstants()), defaultModelName, defaultModelBaseUrl,
  });
  const dialog = createCredentialDialogFlow({
    viewPort: { setOcrValidationMessage: () => {}, setDeepSeekValidationMessage: () => {}, setDeepSeekTopUpVisible: () => {}, setDialogStatus: () => {} },
    credentialsStatePort: credentials, access, translation: profiles,
    getTaskOptions: developerConfigWithDefaults, defaultModelApiKey, defaultModelBaseUrl,
    dialogElementsPort: { ...elementsPort, syncOcrProviderControls: () => {} },
    balanceState: { resetDeepSeekBalance: () => {} }, uploadState: {}, runtimeEnv: { isDesktopMode: () => false },
  });
  const flow = createBrowserCredentialSaveFlow({
    viewPort: { setDialogStatus: status, setDeepSeekValidationMessage: status },
    credentialsStatePort: credentials,
    access, translation: profiles,
    getTaskOptions: developerConfigWithDefaults, defaultModelApiKey, defaultModelBaseUrl,
    saveTaskOptions: async (options) => { task = { ...readDeveloper(), ...options as Record<string, unknown> }; await saveDeveloper(task); },
    // Shared savePersisted* already writes the desktop snapshot; no legacy setup-dialog gate is needed.
    setupModePort: { currentSetupMode: () => false }, runtimeEnv: { isDesktopMode: () => false },
    dialogElementsPort: elementsPort, syncBrowserDialogFromCredentialState: dialog.syncBrowserDialogFromCredentialState,
  });
  function read(): TranslationDraft {
    return { provider: profiles.getCurrentProvider(), baseUrl: elements.modelBaseUrlInput.value, model: elements.modelNameInput.value, apiKey: elements.apiKeyInput.value, workers: elements.translationWorkersInput.value };
  }
  async function load(force = false) {
    if (!initialized || force) {
      const config = await (env.load ? env.load() : loadPersistedConfig().then(() => ({ browser: loadBrowserStoredConfig(), developer: loadDeveloperStoredConfig() })));
      credentials.setCredentials(config.browser);
      task = config.developer;
      // Same defaults -> profile hydration -> field synchronization as the legacy dialog.
      dialog.syncBrowserDialogFromCredentialState();
      const stored = task.translationProfiles as Record<string, { workers?: unknown }> | undefined;
      // Workflow defaults are not a saved preference. Only explicit values override service defaults.
      if (stored?.[profiles.getCurrentProvider()]?.workers == null && task.workers == null) {
        const url = elements.modelBaseUrlInput.value.trim();
        elements.translationWorkersInput.value = url && isOfficialDeepSeekBaseUrl(url) ? "8" : "4";
      }
      initialized = true;
    }
    return read();
  }
  function write(draft: TranslationDraft) {
    if (draft.provider !== profiles.getCurrentProvider()) { profiles.captureCurrent(); profiles.applyProfile(draft.provider); }
    elements.apiKeyInput.value = draft.apiKey;
    elements.modelBaseUrlInput.value = draft.baseUrl;
    elements.modelNameInput.value = draft.model;
    elements.translationWorkersInput.value = draft.workers;
  }
  function switchProvider(provider: string, draft: TranslationDraft) {
    write(draft); profiles.captureCurrent(); profiles.applyProfile(provider);
    return read();
  }
  function error(draft: TranslationDraft) {
    return translationConfigError(draft.baseUrl, draft.model) || translationWorkersError(draft.workers, draft.provider);
  }
  async function save(draft: TranslationDraft): Promise<SettingsFeedback> {
    write(draft);
    const invalid = error(draft);
    if (invalid) return { message: invalid, tone: "error" };
    await flow.handleSave();
    return feedback;
  }
  async function detect(draft: TranslationDraft): Promise<SettingsFeedback> {
    write(draft);
    const invalid = error(draft);
    if (invalid) return { message: invalid, tone: "error" };
    await runDeepSeekConnectivityCheck({ apiPrefix: API_PREFIX, apiKey: draft.apiKey, baseUrl: draft.baseUrl, model: draft.model,
      validateDeepSeekToken: env.validate ?? validateDeepSeekToken, setDeepSeekValidationMessage: status });
    return feedback;
  }
  return { load, read, write, switchProvider, save, detect, providers: TRANSLATION_PROVIDER_OPTIONS.map(({ id, label, maxWorkers }) => ({ id, label, maxWorkers })) };
}
export type HeadlessTranslationSettings = ReturnType<typeof createHeadlessTranslationSettings>;
