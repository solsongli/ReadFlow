import { useEffect, useRef, useState } from "react";
import { getDesktopHost } from "@/platform/desktop/host.js";

export function useReaderFullscreen(
  enabled: boolean,
  focus: boolean,
  setFocus: (value: boolean) => void,
) {
  const [active, setActive] = useState(false);
  const previousFocus = useRef(false);
  const host = getDesktopHost();
  const change = async (next: boolean) => {
    if (next) {
      previousFocus.current = focus;
      setFocus(true);
    }
    try {
      if (host) {
        const result = await host.setFullScreen(next);
        setActive(Boolean(result?.fullscreen ?? next));
      } else if (next) {
        await document.documentElement.requestFullscreen();
        setActive(true);
      } else {
        if (document.fullscreenElement) await document.exitFullscreen();
        setActive(false);
      }
      if (!next) setFocus(previousFocus.current);
    } catch {
      if (next) setFocus(previousFocus.current);
      setActive(false);
    }
  };
  useEffect(() => {
    const browser = () => {
      const next = Boolean(document.fullscreenElement);
      setActive(next);
      if (!next) setFocus(previousFocus.current);
    };
    const removeDesktop = host?.onFullScreenChange((next) => {
      setActive(next);
      if (!next) setFocus(previousFocus.current);
    });
    document.addEventListener("fullscreenchange", browser);
    return () => {
      document.removeEventListener("fullscreenchange", browser);
      removeDesktop?.();
    };
  }, [host, setFocus]);
  useEffect(() => {
    if (!enabled || !active) return;
    const key = (event: KeyboardEvent) => {
      if (event.key === "F11" || event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        void change(false);
      }
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [enabled, active, focus]);
  useEffect(() => {
    if (!enabled || active) return;
    const key = (event: KeyboardEvent) => {
      if (event.key !== "F11") return;
      event.preventDefault();
      event.stopPropagation();
      void change(true);
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [enabled, active, focus]);
  return { active, toggle: () => void change(!active) };
}
