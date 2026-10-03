import { useLayoutEffect, useRef, useState } from "react";
import { DEFAULT_LIST_METRICS, type ListMetrics } from "../../domain/virtual-list.js";

export function useListMetrics(typography: string, active: boolean) {
  const probe = useRef<HTMLDivElement>(null);
  const [metrics, setMetrics] = useState(DEFAULT_LIST_METRICS);
  useLayoutEffect(() => {
    const node = probe.current;
    if (!node) return;
    const measure = () => {
      const next = { ...DEFAULT_LIST_METRICS };
      for (const key of Object.keys(next) as Array<keyof ListMetrics>) {
        const height = node.querySelector<HTMLElement>(`[data-metric="${key}"]`)?.getBoundingClientRect().height;
        if (height && Number.isFinite(height)) next[key] = height;
      }
      setMetrics((current) => Object.keys(next).every((key) => next[key as keyof ListMetrics] === current[key as keyof ListMetrics]) ? current : next);
    };
    measure();
    const observer = new ResizeObserver(measure); observer.observe(node);
    document.fonts?.addEventListener("loadingdone", measure);
    return () => { observer.disconnect(); document.fonts?.removeEventListener("loadingdone", measure); };
  }, [typography, active]);
  const measurement = <div ref={probe} aria-hidden="true" className="wb-list-metrics pointer-events-none fixed -left-96 top-0 w-px overflow-hidden opacity-0">
    <div data-metric="compact" /><div data-metric="bilingual" /><div data-metric="normal" /><div data-metric="header" />
  </div>;
  return { metrics, measurement };
}
