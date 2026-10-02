/** Same runtime endpoint, revisions and confirmation semantics as AgentRuntimeSettingsCard. */
import { fetchAgentRuntimeConfig, updateAgentRuntimeConfig, type AgentRuntimeConfigView, type AgentRuntimeConfigUpdate, type AgentRuntimeMode } from "@/platform/api/index.js";
import { notifyCredentialsChanged } from "@/platform/contracts/credentials-contract.js";

export interface AgentSettingsDraft {
  mode: AgentRuntimeMode; confirmation: "explicit" | "green_light";
  baseUrl: string; model: string; modelKey: string; gatewayUrl: string; gatewayModel: string; gatewayKey: string;
}
export function agentSettingsDraft(config: AgentRuntimeConfigView): AgentSettingsDraft {
  const active = (config.active_runtime || "").toLowerCase();
  const fallback = active.includes("openai") ? "openai" : active.includes("fx") ? "fx" : "python";
  return { mode: config.configured_runtime || fallback, confirmation: config.agent_confirmation_mode || "explicit",
    baseUrl: config.llm_base_url || "https://api.deepseek.com/v1", model: config.llm_model || "deepseek-flash", modelKey: config.llm_api_key || "",
    gatewayUrl: config.fx_gateway_base_url || "", gatewayModel: config.fx_model || "", gatewayKey: config.fx_gateway_api_key || "" };
}
export function agentRestartPending(config: AgentRuntimeConfigView): boolean {
  return config.restart_required || config.restart_state === "pending" || config.active_revision !== config.configured_revision;
}
export function agentSettingsPayload(draft: AgentSettingsDraft, config: AgentRuntimeConfigView): AgentRuntimeConfigUpdate {
  if (draft.mode !== "fx" && !draft.modelKey.trim() && !config.llm_api_key_configured) throw new Error("请先配置模型 API Key，或使用翻译配置。");
  if (draft.mode === "fx" && !draft.gatewayKey.trim() && !config.fx_gateway_api_key_configured) throw new Error("请先配置 Gateway Key。");
  return { expected_revision: config.configured_revision, agent_runtime: draft.mode, agent_confirmation_mode: draft.confirmation,
    llm_base_url: draft.baseUrl.trim(), llm_model: draft.model.trim(), fx_gateway_base_url: draft.gatewayUrl.trim(), fx_model: draft.gatewayModel.trim(),
    ...(draft.modelKey.trim() ? { llm_api_key: draft.modelKey.trim() } : {}), ...(draft.gatewayKey.trim() ? { fx_gateway_api_key: draft.gatewayKey.trim() } : {}) };
}
export function createHeadlessAgentSettings(env: { read?: typeof fetchAgentRuntimeConfig; update?: typeof updateAgentRuntimeConfig; announce?: () => void } = {}) {
  const announce = env.announce ?? notifyCredentialsChanged;
  return {
    announce,
    load: () => (env.read ?? fetchAgentRuntimeConfig)(),
    async save(draft: AgentSettingsDraft, config: AgentRuntimeConfigView) {
      const next = await (env.update ?? updateAgentRuntimeConfig)(agentSettingsPayload(draft, config));
      announce();
      return next;
    },
  };
}
export type HeadlessAgentSettings = ReturnType<typeof createHeadlessAgentSettings>;

export function agentRuntimeLabel(runtime = ""): string {
  const name = runtime.toLowerCase();
  if (name.includes("openai")) return "OpenAI 兼容 Agent";
  if (name.includes("fx")) return "FX Gateway Agent";
  return /python|markdown|retrieval/.test(name) ? "Markdown 检索问答" : "不可用";
}
