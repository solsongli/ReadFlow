import { useEffect, useState } from "react";
import { fetchGlossaryApi } from "@/platform/api/index.js";
import { loadDeveloperStoredConfig } from "@/platform/config/persisted-config.js";
import type { PaperTerm } from "../domain/model.js";
export function useUserTerms(active: boolean) {
  const [terms, setTerms] = useState<PaperTerm[]>([]);
  useEffect(() => {
    if (!active) return;
    let gone = false;
    const id = String(loadDeveloperStoredConfig().glossaryId || "");
    if (!id) {
      setTerms([]);
      return;
    }
    void fetchGlossaryApi(id, "/api/v1")
      .then((data) => {
        if (!gone)
          setTerms(
            (data.entries || [])
              .filter(
                (e: { source?: string; target?: string; match_mode?: string }) =>
                  e.source && e.target && e.match_mode !== "regex",
              )
              .map((e: PaperTerm) => ({ ...e, kind: "user" })),
          );
      })
      .catch(() => {
        if (!gone) setTerms([]);
      });
    return () => {
      gone = true;
    };
  }, [active]);
  return terms;
}
