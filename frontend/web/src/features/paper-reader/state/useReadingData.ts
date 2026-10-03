import { useEffect, useMemo, useState } from "react";
import { readingApi, type ReadingData } from "./api.js";
export function useReadingData(itemId: string, active: boolean) {
  const api = useMemo(() => readingApi(itemId), [itemId]);
  const [data, set] = useState<ReadingData>({ bookmarks: [], seconds: 0 }),
    [error, setError] = useState("");
  const load = async () => {
    try {
      set(await api.load());
      setError("");
    } catch {
      setError("阅读记录暂不可用，请重试。");
    }
  };
  useEffect(() => {
    void load();
  }, [api]);
  useEffect(() => {
    if (!active) {
      return;
    }
    let start = performance.now(),
      pending = 0,
      lastActivity = performance.now(),
      saving = false;
    let record: { seconds: number; id: string } | null = null;
    const activity = () => {
      lastActivity = performance.now();
    };
    const save = async () => {
      const now = performance.now();
      if (document.visibilityState === "visible" && now - lastActivity < 120000) {
        pending += Math.min(30, (now - start) / 1000);
      }
      start = now;
      if (saving || (!record && pending < 1)) {
        return;
      }
      record ??= {
        seconds: Math.min(60, Math.floor(pending)),
        id: Array.from(crypto.getRandomValues(new Uint32Array(4))).join("-"),
      };
      const snapshot = record;
      saving = true;
      try {
        const result = await api.time(snapshot.seconds, snapshot.id);
        pending = Math.max(0, pending - snapshot.seconds);
        record = null;
        set((data) => ({ ...data, seconds: result.seconds }));
      } catch {
        setError("阅读时长未能同步，将重试。");
      } finally {
        saving = false;
      }
    };
    const timer = setInterval(() => void save(), 15000);
    window.addEventListener("pointerdown", activity);
    window.addEventListener("keydown", activity);
    window.addEventListener("wheel", activity);
    return () => {
      clearInterval(timer);
      void save();
      window.removeEventListener("pointerdown", activity);
      window.removeEventListener("keydown", activity);
      window.removeEventListener("wheel", activity);
    };
  }, [active, api]);
  const add = async (page: number, offset: number, name: string, mode: "source" | "translated") => {
    try {
      set(await api.add(page, offset, name, mode));
      setError("");
      return true;
    } catch {
      setError("书签未能保存，请重试。");
      return false;
    }
  };
  const remove = async (id: string) => {
    try {
      set(await api.remove(id));
      setError("");
    } catch {
      setError("书签未能删除，请重试。");
    }
  };
  return { ...data, error, load, add, remove, clearError: () => setError("") };
}
