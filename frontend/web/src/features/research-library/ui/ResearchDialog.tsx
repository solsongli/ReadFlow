import type { ReactNode } from "react";
import { Dialog, DialogBody, DialogCloseButton, DialogContent, DialogHeader, DialogShell, DialogTitle } from "@/ui/components/dialog.js";

export function ResearchDialog({ title, onClose, pending = false, children, size = "wide" }: {
  title: string; onClose: () => void; pending?: boolean; children: ReactNode; size?: "compact" | "standard" | "wide" | "workspace";
}) {
  return <Dialog open onOpenChange={(next) => { if (!next && !pending) onClose(); }}>
    <DialogContent size={size} showCloseButton={false} aria-describedby={undefined}>
      <DialogShell><DialogHeader><DialogTitle>{title}</DialogTitle><DialogCloseButton disabled={pending} /></DialogHeader>
        <DialogBody className="research-dialog-body">{children}</DialogBody>
      </DialogShell>
    </DialogContent>
  </Dialog>;
}
