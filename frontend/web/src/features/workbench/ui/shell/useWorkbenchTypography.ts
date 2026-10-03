import { useLayoutEffect } from "react";
import { typographyVariables } from "../../domain/typography.js";
import { useWb } from "../context.js";

export function useWorkbenchTypography() {
  const uiFont = useWb((state) => state.uiFont);
  const customFont = useWb((state) => state.customFont);
  const textScale = useWb((state) => state.textScale);
  const noteFont = useWb((state) => state.noteFont);
  useLayoutEffect(() => {
    const root = document.documentElement;
    const properties = typographyVariables({ uiFont, customFont, textScale, noteFont });
    for (const [key, value] of Object.entries(properties)) root.style.setProperty(key, value);
    return () => { for (const key of Object.keys(properties)) root.style.removeProperty(key); };
  }, [uiFont, customFont, textScale, noteFont]);
}
