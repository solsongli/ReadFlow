import type { Block } from "./model.js";
export function marginTypography(block: Block, scale: number) {
  return {
    fontSize: Math.max(11, (block.text_size || block.size || 10) * scale),
    lineHeight: 1.45,
    fontWeight: ["title", "heading"].includes(block.type) ? 650 : 400,
  };
}
