/** Local reading/text extraction needs no cloud credentials at first launch. */
export interface DesktopCredentialSnapshot { ocrProvider?: string; ocrCredentialRef?: string; translationCredentialRef?: string; paddleToken?: string; mineruToken?: string; modelApiKey?: string }
export function hasDesktopCredentials(_snapshot?: DesktopCredentialSnapshot | null): boolean {
  return true;
}
