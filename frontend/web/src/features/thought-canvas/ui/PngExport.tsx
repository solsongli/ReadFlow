import { useState } from "react";
import { Button } from "@/ui/wb/Button.js";
import { downloadBlob } from "@/platform/utils/downloads.js";
import { canvasPng } from "../state/export-png.js";
import type { CanvasData } from "../domain/types.js";
export function PngExport({
  data,
  surface,
}: {
  data: CanvasData;
  surface: React.RefObject<HTMLDivElement | null>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <>
      <Button
        size="sm"
        disabled={busy}
        onClick={async () => {
          if (!surface.current) return;
          setBusy(true);
          setError("");
          try {
            downloadBlob(await canvasPng(data, surface.current), `${data.name}.png`);
          } catch {
            setError("PNG 导出失败，请检查图片加载后重试。");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "正在导出…" : "导出 PNG"}
      </Button>
      {error ? (
        <span role="status" className="text-wb-text-3">
          {error}
        </span>
      ) : null}
    </>
  );
}
