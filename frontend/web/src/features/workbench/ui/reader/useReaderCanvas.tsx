import { useEffect, useState } from "react";
import {
  CanvasDock,
  CanvasPicker,
  canvasApi,
  useCanvases,
  type CanvasReference,
} from "@/features/thought-canvas/index.js";
export function useReaderCanvas(item: string, active: boolean, revision: number) {
  const workspace = useCanvases();
  const [links, setLinks] = useState<CanvasReference[]>([]);
  const [picker, setPicker] = useState<{ annotationIds?: string[]; text?: string } | null>(null);
  useEffect(() => {
    if (!active) {
      return;
    }
    let alive = true;
    void canvasApi
      .references(item)
      .then((value) => {
        if (alive) {
          setLinks(value);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [item, active, workspace.revision, revision]);
  return {
    dock: <CanvasDock />,
    picker: picker ? (
      <CanvasPicker
        annotationIds={picker.annotationIds} text={picker.text}
        resolve={() => workspace.resolveSelection(item)}
        close={() => setPicker(null)}
      />
    ) : null,
    ports: {
      canvasLinks: links,
      openCanvasLink: workspace.open,
      addAnnotationToCanvas: (id: string) => setPicker({ annotationIds: [id] }),
      addSelectionToCanvas: () => setPicker({}),
      registerCanvasSelection: (provider: () => Promise<string[]>) =>
        workspace.registerSelection(item, provider),
    },
    addText: (text: string) => setPicker({ text }),
    changed: () => void workspace.reload(),
  };
}
