import { useFigureThumbnail } from "../state/useFigureThumbnail.js";
export function FigureThumbnail({ url, label }: { url: string; label: string }) {
  const { root, image, failed } = useFigureThumbnail(url);
  return (
    <div ref={root} className="mb-2 flex h-28 w-full items-center justify-center overflow-hidden rounded">
      {image ? (
        <img decoding="async" alt={label} className="max-h-28 w-full object-contain" src={image} />
      ) : (
        <span className="text-xs text-wb-text-3">{failed ? "缩略图暂不可用，可点放大" : "缩略图…"}</span>
      )}
    </div>
  );
}
