import { OPS, type PDFPageProxy } from "pdfjs-dist";
import { imageRegions } from "../domain/image-regions.js";
export async function restoreImageColors(
  page: PDFPageProxy,
  original: HTMLCanvasElement,
  overlay: HTMLCanvasElement,
  viewport: { transform: number[] },
  ratio: number,
  cancelled: () => boolean,
) {
  const started = performance.now();
  const list = await page.getOperatorList();
  if (cancelled()) return;
  const regions = imageRegions(list, OPS, viewport.transform);
  overlay.dataset.imageRegions = String(regions.length);
  if (!regions.length) {
    overlay.width = overlay.height = 0;
    return;
  }
  const bounds = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
  for (const region of regions)
    for (const point of region) {
      bounds.left = Math.min(bounds.left, point.x);
      bounds.top = Math.min(bounds.top, point.y);
      bounds.right = Math.max(bounds.right, point.x);
      bounds.bottom = Math.max(bounds.bottom, point.y);
    }
  const left = Math.max(0, Math.floor(bounds.left * ratio));
  const top = Math.max(0, Math.floor(bounds.top * ratio));
  const right = Math.min(original.width, Math.ceil(bounds.right * ratio));
  const bottom = Math.min(original.height, Math.ceil(bounds.bottom * ratio));
  overlay.width = Math.max(0, right - left);
  overlay.height = Math.max(0, bottom - top);
  if (!overlay.width || !overlay.height) return;
  // Allocate only the image envelope, not a second HiDPI bitmap for the entire paper page.
  Object.assign(overlay.style, {
    left: `${(left / original.width) * 100}%`,
    top: `${(top / original.height) * 100}%`,
    width: `${(overlay.width / original.width) * 100}%`,
    height: `${(overlay.height / original.height) * 100}%`,
    right: "auto",
    bottom: "auto",
  });
  overlay.dataset.pixelLeft = String(left);
  overlay.dataset.pixelTop = String(top);
  const context = overlay.getContext("2d")!;
  context.save();
  context.setTransform(ratio, 0, 0, ratio, -left, -top);
  context.beginPath();
  for (const region of regions) {
    const area = region.reduce((sum, point, index) => {
      const next = region[(index + 1) % region.length];
      return sum + point.x * next.y - point.y * next.x;
    }, 0);
    const polygon = area < 0 ? [...region].reverse() : region;
    context.moveTo(polygon[0].x, polygon[0].y);
    for (const point of polygon.slice(1)) context.lineTo(point.x, point.y);
    context.closePath();
  }
  context.clip();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.drawImage(original, -left, -top);
  context.restore();
  overlay.dataset.restoreMs = (performance.now() - started).toFixed(2);
}
