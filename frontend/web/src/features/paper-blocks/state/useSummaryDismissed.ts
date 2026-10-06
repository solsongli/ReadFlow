import { useEffect, useState } from "react";
import { summaryStorageKey } from "../domain/summary.js";
export function useSummaryDismissed(item: string) {
  const key = summaryStorageKey(item);
  const read = () => {
    try {
      return localStorage.getItem(key) === "1";
    } catch {
      return false;
    }
  };
  const [dismissed, setDismissed] = useState(read);
  useEffect(() => {
    setDismissed(read());
    const change = (event: StorageEvent) => {
      if (event.key === key) setDismissed(event.newValue === "1");
    };
    window.addEventListener("storage", change);
    return () => window.removeEventListener("storage", change);
  }, [key]);
  return {
    dismissed,
    dismiss: () => {
      setDismissed(true);
      try {
        localStorage.setItem(key, "1");
      } catch {
        /* Session dismissal still works with storage disabled. */
      }
    },
  };
}
