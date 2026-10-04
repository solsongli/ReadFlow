import type { CanvasData, CanvasNode } from "../domain/types.js";
import { edgePath } from "../domain/geometry.js";
import { ellipsize, wrapLines } from "../domain/text-wrap.js";
import { canvasApi } from "./api.js";
/** Draw the complete logical graph, independent of viewport culling. */
export async function canvasPng(data: CanvasData, element: HTMLElement): Promise<Blob> {
  const style = getComputedStyle(element);
  const color = (name: string) => style.getPropertyValue(name).trim();
  const nodesById = new Map(data.nodes.map((node) => [node.id, node]));
  const bounds = [...data.nodes];
  const geometry = data.edges.flatMap((edge) => {
    const a = nodesById.get(edge.from_id),
      b = nodesById.get(edge.to_id);
    return a && b ? [edgePath(a, b).bounds] : [];
  });
  const boxes = [...bounds, ...geometry];
  // Crop to the content, not the canvas origin, so a graph far from (0, 0) is not mostly margin.
  const padding = 48;
  const empty = boxes.length === 0;
  const minX = (empty ? 0 : Math.min(...boxes.map((n) => n.x))) - padding;
  const minY = (empty ? 0 : Math.min(...boxes.map((n) => n.y))) - padding;
  const width = (empty ? 400 : Math.max(...boxes.map((n) => n.x + n.width))) - minX + padding;
  const height = (empty ? 260 : Math.max(...boxes.map((n) => n.y + n.height))) - minY + padding;
  const scale = Math.min(2, 8192 / Math.max(width, height), Math.sqrt(16_000_000 / (width * height)));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(width * scale));
  canvas.height = Math.max(1, Math.floor(height * scale));
  const ctx = canvas.getContext("2d")!;
  const font = style.fontFamily;
  const measure = (value: string) => ctx.measureText(value).width;
  ctx.scale(scale, scale);
  ctx.fillStyle = color("--wb-desk-bg");
  ctx.fillRect(0, 0, width, height);
  ctx.translate(-minX, -minY);
  function rounded(x: number, y: number, w: number, h: number, fill: string) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 12);
    ctx.fillStyle = fill;
    ctx.fill();
  }
  function text(value: string, x: number, y: number, w: number, maxHeight: number, serif = false) {
    ctx.font = `14px ${serif ? 'Georgia, "Noto Serif CJK SC", serif' : font}`;
    ctx.fillStyle = color("--wb-text");
    const lines = wrapLines(value, w, measure, Math.max(1, Math.floor(maxHeight / 21)));
    lines.forEach((line, index) => ctx.fillText(line, x, y + index * 21));
  }
  function background(node: CanvasNode) {
    if (node.type !== "text")
      rounded(
        node.x,
        node.y,
        node.width,
        node.height,
        color(node.type === "group" ? "--tc-group" : node.type === "sticky" ? "--tc-sticky" : "--wb-panel"),
      );
    if (node.type !== "text" && node.type !== "group") {
      ctx.strokeStyle = color("--wb-line-soft");
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    if (node.type === "excerpt" || node.type === "image") {
      // Same left accent as the interactive card: the annotation colour, else the system accent.
      const accent = /^[a-z]+$/.test(node.color || "") ? color(`--pr-${node.color}`) : "";
      ctx.save();
      ctx.clip();
      ctx.fillStyle = accent || color("--wb-accent");
      ctx.fillRect(node.x, node.y, 4, node.height);
      ctx.restore();
    }
    if (node.type === "todo") {
      ctx.strokeStyle = color("--tc-todo");
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
  for (const node of data.nodes.filter((n) => n.type === "group")) {
    background(node);
    text(node.text, node.x + 12, node.y + 23, node.width - 24, 32);
  }
  const index = new Map(data.nodes.map((n) => [n.id, n]));
  for (const edge of data.edges) {
    const a = index.get(edge.from_id),
      b = index.get(edge.to_id);
    if (!a || !b) continue;
    const route = edgePath(a, b);
    ctx.strokeStyle = color("--wb-text-3");
    ctx.lineWidth = 1.5;
    ctx.stroke(new Path2D(route.path));
    if (edge.style === "arrow") {
      const points = route.path.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
      const [x, y] = points.slice(-2),
        angle = Math.atan2(y - points[5], x - points[4]);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-9, -4);
      ctx.lineTo(-9, 4);
      ctx.closePath();
      ctx.fillStyle = color("--wb-text-3");
      ctx.fill();
      ctx.restore();
    }
    if (edge.label) {
      ctx.font = `12px ${font}`;
      const labelWidth = Math.min(240, ctx.measureText(edge.label).width + 16);
      rounded(
        route.label.x - labelWidth / 2,
        route.label.y - 24,
        labelWidth,
        25,
        color("--tc-edge-label-bg"),
      );
      ctx.fillStyle = color("--tc-edge-label-text");
      ctx.fillText(ellipsize(edge.label, labelWidth - 16, measure), route.label.x - labelWidth / 2 + 8, route.label.y - 7);
    }
  }
  try {
    for (const node of data.nodes.filter((n) => n.type !== "group")) {
      background(node);
      ctx.save();
      ctx.beginPath();
      ctx.rect(node.x + 8, node.y + 8, node.width - 16, node.height - 16);
      ctx.clip();
      let top = node.y + 24;
      if (node.image_ref) {
        const url = await canvasApi.image(data.id, node.id);
        try {
          const image = new Image();
          image.src = url;
          await image.decode();
          const ratio = Math.min((node.width - 24) / image.width, (node.height - 65) / image.height);
          ctx.drawImage(image, node.x + 12, node.y + 12, image.width * ratio, image.height * ratio);
          top = node.y + 24 + image.height * ratio;
        } finally {
          URL.revokeObjectURL(url);
        }
      }
      const body = [
        node.quote,
        node.text,
        node.type === "paper"
          ? [node.title, node.authors?.join("、"), node.year, node.venue].filter(Boolean).join("\n")
          : "",
      ]
        .filter(Boolean)
        .join("\n");
      text(
        body,
        node.x + 12,
        top,
        node.width - 24,
        Math.max(21, node.y + node.height - top - 40),
        Boolean(node.quote),
      );
      if (node.item_id) {
        ctx.fillStyle = color("--wb-text-3");
        ctx.font = `11px ${font}`;
        ctx.fillText(
          ellipsize(`${node.title || "来源文献"} · 第 ${node.page || 1} 页`, node.width - 24, measure),
          node.x + 12,
          node.y + node.height - 14,
        );
      }
      ctx.restore();
    }
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("无法生成 PNG，请缩小画布后重试。"))),
        "image/png",
      ),
    );
  } finally {
    canvas.width = canvas.height = 0;
  }
}
