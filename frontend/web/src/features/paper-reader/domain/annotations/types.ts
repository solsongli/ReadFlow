export const COLORS = ["yellow", "blue", "green", "red", "purple"] as const;
export type AnnotationColor = (typeof COLORS)[number];
export type AnnotationType = "highlight" | "underline" | "sticky" | "region" | "ink";
export type Tool = "select" | AnnotationType | "erase";
export type Semantics = Record<AnnotationColor, string>;
export const DEFAULT_SEMANTICS: Semantics = {
  yellow: "重要",
  blue: "方法",
  green: "结论 / 结果",
  red: "疑问 / 存疑",
  purple: "概念 / 术语",
};
export interface Point {
  x: number;
  y: number;
}
export interface Rect extends Point {
  width: number;
  height: number;
}
export interface Annotation {
  id: string;
  item_id: string;
  attachment_id: string;
  page_index: number;
  type: AnnotationType;
  color: AnnotationColor;
  rects: Rect[];
  quote: string;
  note: string;
  ink: Point[];
  width: 1 | 2 | 4;
  image_ref: string;
  image?: string;
  created_at: string;
  updated_at: string;
  source_id?: string | null;
}
export interface SelectionAnchor {
  page: number;
  rects: Rect[];
  quote: string;
}
export function normalizeSemantics(value: unknown): Semantics {
  const labels = { ...DEFAULT_SEMANTICS };
  if (!value || typeof value !== "object") {
    return labels;
  }
  for (const color of COLORS) {
    const name = (value as Record<string, unknown>)[color];
    if (typeof name === "string" && name.trim() && name.length <= 40) {
      labels[color] = name.trim();
    }
  }
  return labels;
}
