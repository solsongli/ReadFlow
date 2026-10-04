import { useEffect, useState } from "react";
export interface BlockModePreferences {
  disabled: boolean;
  hintDismissed: boolean;
  save: (value: { blockModeDisabled?: boolean; blockModeHintDismissed?: boolean }) => void;
}
export function useBlockMode(hasTranslation: boolean, preferences: BlockModePreferences, language: string) {
  const [manual, setManual] = useState(false);
  useEffect(() => setManual(false), [language]);
  const enabled = !preferences.disabled && (manual || hasTranslation);
  return {
    enabled,
    hint: enabled && !preferences.hintDismissed,
    dismissHint: () => preferences.save({ blockModeHintDismissed: true }),
    toggle() {
      setManual(!enabled);
      preferences.save({ blockModeDisabled: enabled });
    },
  };
}
