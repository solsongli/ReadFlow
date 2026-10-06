import { useEffect, useRef, useState } from "react";
import { buildApiHeaders } from "@/platform/config/runtime.js";
export function useFigureThumbnail(url: string) {
  const root = useRef<HTMLDivElement>(null);
  const [image, setImage] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const target = root.current;
    if (!target) return;
    const controller = new AbortController();
    let started = false,
      objectUrl = "";
    setImage("");
    setFailed(false);
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || started) return;
        started = true;
        void fetch(url, { headers: buildApiHeaders(), signal: controller.signal })
          .then(async (response) => {
            if (!response.ok) throw new Error("thumbnail");
            const blob = await response.blob();
            if (controller.signal.aborted) return;
            objectUrl = URL.createObjectURL(blob);
            setImage(objectUrl);
          })
          .catch(() => {
            if (!controller.signal.aborted) setFailed(true);
          });
      },
      { rootMargin: "100px" },
    );
    observer.observe(target);
    return () => {
      controller.abort();
      observer.disconnect();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);
  return { root, image, failed };
}
