import type { InlineRun } from "../domain/model.js";
export function InlineRuns({ runs, text }: { runs?: InlineRun[]; text: string }) {
  if (!runs?.length) return <>{text}</>;
  return (
    <>
      {runs.map((run, index) => {
        const text =
          run.kind === "super" ? (
            <sup>{run.text}</sup>
          ) : run.kind === "sub" ? (
            <sub>{run.text}</sub>
          ) : (
            run.text
          );
        return run.bold ? <strong key={index}>{text}</strong> : <span key={index}>{text}</span>;
      })}
    </>
  );
}
