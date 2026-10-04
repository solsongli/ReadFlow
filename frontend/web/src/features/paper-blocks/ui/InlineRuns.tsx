import type { InlineRun } from "../domain/model.js";
export function InlineRuns({ runs, text }: { runs?: InlineRun[]; text: string }) {
  if (!runs?.length) return <>{text}</>;
  return (
    <>
      {runs.map((run, index) =>
        run.kind === "super" ? (
          <sup key={index}>{run.text}</sup>
        ) : run.kind === "sub" ? (
          <sub key={index}>{run.text}</sub>
        ) : (
          <span key={index}>{run.text}</span>
        ),
      )}
    </>
  );
}
