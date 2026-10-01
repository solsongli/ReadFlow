// 拖放协议：列表行把选中的文献 id 写进自定义 MIME，侧栏分组读取后「加入」（不移动）。
export const DRAG_MIME = "application/x-readflow-items";

export function writeDraggedIds(transfer: DataTransfer, ids: string[]): void {
  transfer.setData(DRAG_MIME, JSON.stringify(ids));
  transfer.setData("text/plain", `${ids.length} 篇文献`);
  transfer.effectAllowed = "copy";
}

export function readDraggedIds(transfer: DataTransfer): string[] {
  try {
    const value = JSON.parse(transfer.getData(DRAG_MIME) || "[]");
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}
