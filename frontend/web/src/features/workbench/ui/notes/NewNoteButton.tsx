import { SquarePen } from "lucide-react";
import { Button } from "@/ui/wb/Button.js";
import { useWb, useWorkbench } from "../context.js";
import { PaperLauncher } from "../desk/PaperLauncher.js";

export function NewNoteButton() {
  const wb = useWorkbench();
  const itemId = useWb((state) => state.notes.itemId);
  const open = useWb((state) => state.notes.pickerOpen);
  const button = <Button size="sm" shortcut="Ctrl N" icon={<SquarePen size={15} aria-hidden="true" />} onClick={itemId ? () => void wb.notes.create() : undefined}>新建笔记</Button>;
  return itemId ? button : <PaperLauncher kind="note" open={open} onOpenChange={wb.notes.setPicker}>{button}</PaperLauncher>;
}
