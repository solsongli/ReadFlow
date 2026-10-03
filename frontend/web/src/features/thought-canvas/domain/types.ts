export interface Point {
  x: number;
  y: number;
}
export interface Rect extends Point {
  width: number;
  height: number;
}
export interface View extends Point {
  zoom: number;
}
export type NodeType = "excerpt" | "sticky" | "todo" | "image" | "paper" | "text" | "group";
export interface CanvasNode extends Rect {
  id: string;
  type: NodeType;
  text: string;
  annotation_id?: string | null;
  item_id?: string | null;
  page?: number;
  quote?: string;
  title?: string;
  authors?: string[];
  year?: string;
  venue?: string;
  citekey?: string;
  color?: string;
  image_ref?: string;
  orphaned?: boolean;
}
export interface CanvasEdge {
  id: string;
  from_id: string;
  to_id: string;
  label: string;
  style: "arrow" | "line";
}
export interface CanvasSummary {
  id: string;
  name: string;
  group_id: string | null;
  updated_at: string;
}
export interface CanvasData extends CanvasSummary {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}
export interface CanvasPatch {
  nodes?: CanvasNode[];
  edges?: CanvasEdge[];
  delete_nodes?: string[];
  delete_edges?: string[];
  name?: string;
  group_id?: string | null;
}
export interface CanvasReference {
  canvas_id: string;
  node_id: string;
  annotation_id: string;
  name: string;
}
export interface SourceTarget {
  itemId: string;
  page?: number;
  annotationId?: string;
}
export interface CanvasDrop {
  type: "annotation" | "selection" | "paper";
  itemId: string;
  annotationId?: string;
}
export const CANVAS_DRAG = "application/x-readflow-canvas";
