import type { Annotation } from "./types.js";
export interface Change {
  before: Annotation | null;
  after: Annotation | null;
}
export interface AnnotationHistory {
  past: Change[][];
  future: Change[][];
}
export function remember(history: AnnotationHistory, changes: Change[]): AnnotationHistory {
  return { past: [...history.past.slice(-49), changes], future: [] };
}
export function step(history: AnnotationHistory, redo: boolean) {
  const stack = redo ? history.future : history.past;
  const changes = stack.at(-1);
  if (!changes) {
    return null;
  }
  return {
    changes: redo
      ? changes
      : changes.map(({ before, after }) => ({ before: after, after: before })).reverse(),
    history: redo
      ? { past: [...history.past, changes], future: history.future.slice(0, -1) }
      : { past: history.past.slice(0, -1), future: [...history.future, changes] },
  };
}
