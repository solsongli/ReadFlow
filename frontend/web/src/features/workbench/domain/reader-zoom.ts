export type ReaderZoomPreference = "width" | "page" | number;

export function normalizeReaderZoom(value: unknown): ReaderZoomPreference | undefined {
  if (value === "width" || value === "page") return value;
  return typeof value === "number" && Number.isFinite(value) && value >= 0.2 && value <= 4
    ? value
    : undefined;
}

export function normalizeReaderZooms(value: unknown, limit = 100) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .flatMap(([id, zoom]) => {
        const normalized = normalizeReaderZoom(zoom);
        return id && id.length <= 200 && normalized !== undefined ? [[id, normalized] as const] : [];
      })
      .slice(-limit),
  );
}

export function rememberReaderZoom(
  current: Record<string, ReaderZoomPreference>,
  itemId: string,
  zoom: ReaderZoomPreference,
  limit = 100,
) {
  const entries = Object.entries(current).filter(([id]) => id !== itemId).slice(-(limit - 1));
  return Object.fromEntries([...entries, [itemId, zoom]]);
}
