import { useEffect, useState } from "react";
import { resolveWorkbenchScheme } from "../../domain/reader-messages.js";
import { useWb } from "../context.js";

export function useWorkbenchScheme() {
  const preference = useWb((state) => state.theme);
  const [systemDark, setSystemDark] = useState(() => typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-color-scheme: dark)").matches));
  useEffect(() => {
    const query = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!query) return;
    const changed = () => setSystemDark(query.matches);
    changed();
    query.addEventListener("change", changed);
    return () => query.removeEventListener("change", changed);
  }, []);
  return resolveWorkbenchScheme(preference, systemDark);
}
