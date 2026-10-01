// 全局唯一的隐藏 PDF 选择框由 WorkbenchShell 渲染；任何入口（菜单、命令面板、空状态）都经这里触发。
export const PDF_PICKER_ID = "wb-pdf-picker";

export function openPdfPicker(): void {
  const input = document.getElementById(PDF_PICKER_ID);
  if (input instanceof HTMLInputElement) {
    input.value = "";
    input.click();
  }
}
