import type { CanvasData, CanvasNode } from "./types.js";
import { contains } from "./geometry.js";
export function outline(canvas: CanvasData): string {
  const nodes = [...canvas.nodes].sort((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id));
  const assigned = new Set<string>();
  const lines = [`# ${canvas.name}`];
  const emit = (node: CanvasNode) => {
    assigned.add(node.id);
    lines.push(`- ${(node.text || node.title || (node.quote ? "摘录" : node.type)).replace(/\n/g, "\n  ")}`);
    if (node.quote && node.quote !== node.text) {
      lines.push(...node.quote.split("\n").map((line) => `  > ${line}`));
    }
    if (node.item_id) {
      lines.push(`  来源：${node.title || ""} · 第 ${node.page || 1} 页 · @${node.citekey || ""}`);
    }
    if (node.orphaned) {
      lines.push("  原批注已删除");
    }
  };
  const groups = nodes.filter((n) => n.type === "group");
  for (const group of groups) {
    lines.push(`\n## ${group.text || "分组"}`);
    nodes.filter((n) => n.type !== "group" && !assigned.has(n.id) && contains(group, n)).forEach(emit);
  }
  const rest = nodes.filter((n) => n.type !== "group" && !assigned.has(n.id));
  if (rest.length && groups.length) {
    lines.push("\n## 未分组");
  }
  rest.forEach(emit);
  if (canvas.edges.length) {
    lines.push("\n## 关系");
  }
  const title = (id: string) => {
    const n = nodes.find((node) => node.id === id);
    return (n?.text || n?.quote || n?.title || n?.type || "").split("\n")[0];
  };
  canvas.edges.forEach((edge) => lines.push(`- ${title(edge.from_id)} —${edge.label}→ ${title(edge.to_id)}`));
  return lines.join("\n") + "\n";
}
