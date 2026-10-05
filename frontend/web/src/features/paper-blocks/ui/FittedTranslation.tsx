import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { fitTypography } from "../domain/typography.js";
import type { InlineRun } from "../domain/model.js";
import { InlineRuns } from "./InlineRuns.js";
export function FittedTranslation({
  text,
  runs,
  base,
  label = false,
}: {
  text: string;
  runs?: InlineRun[];
  base: number;
  label?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null),
    content = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 }),
    [overflow, setOverflow] = useState(false);
  useEffect(() => {
    const element = root.current!;
    const measure = () => setSize({ width: element.clientWidth, height: element.clientHeight });
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    void document.fonts.ready.then(measure);
    return () => observer.disconnect();
  }, []);
  const runSignature = JSON.stringify(runs);
  useLayoutEffect(() => {
    const element = content.current!;
    if (!size.width || !size.height) return;
    element.style.removeProperty("-webkit-line-clamp");
    element.style.display = "block";
    const fitted = fitTypography(text, size.width, size.height, base);
    element.style.fontSize = `${fitted.size}px`;
    if (!label) {
      const actual = element.scrollHeight;
      if (actual > size.height) {
        fitted.size = Math.max(base * 0.65, fitted.size * Math.sqrt(size.height / actual) * 0.97);
        element.style.fontSize = `${fitted.size}px`;
        if (element.scrollHeight > size.height) {
          fitted.size = base * 0.65;
          element.style.fontSize = `${fitted.size}px`;
        }
      }
      fitted.overflow = element.scrollHeight > size.height;
    }
    element.style.display = "-webkit-box";
    element.style.webkitLineClamp = String(Math.max(1, Math.floor(size.height / (fitted.size * 1.18))));
    setOverflow(fitted.overflow);
  }, [text, runSignature, base, size, label]);
  return (
    <div ref={root} className={label ? "pb-label-text" : "pb-inline-text"} data-inline-overflow={overflow}>
      <div ref={content} className="pb-fitted-content">
        <InlineRuns text={text} runs={runs} />
      </div>
      {overflow ? (
        <span className="pb-overflow-mark" aria-hidden="true">
          …
        </span>
      ) : null}
    </div>
  );
}
