import type {
  CredentialsFields,
  OcrTokenOptions,
} from "./state-types.js";
import { normalizeOcrProvider } from "@/platform/config/providers.js";

export function ocrTokenFromCredentials(
  credentials: Partial<CredentialsFields> = {},
  { defaultPaddleToken, providerId }: OcrTokenOptions = {},
): string {
  // Archived online tokens remain in storage but never enter local execution.
  return "";
}

export function hasCompleteCredentials(credentials: Partial<CredentialsFields> = {}, options: OcrTokenOptions = {}): boolean {
  // This predicate serves translation readiness; OCR-only has no credential gate.
  return Boolean(credentials.modelApiKey || credentials.translationCredentialRef);
}
