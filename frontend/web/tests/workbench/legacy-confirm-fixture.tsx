import { createRoot } from "react-dom/client";
import { PdfReader } from "@/app/research-library/PdfReader.js";
import { api } from "@/app/research-library/api.js";
const fixture = { deletes: 0, saved: 0 };
api.deleteNote = async () => { fixture.deletes++; };
Object.assign(window, { legacyFixture: fixture });
const item = { id: "synthetic-paper", title: "Synthetic paper", attachments: [], notes: [{ id: "synthetic-note", body: "Synthetic note", quote: "", translated_quote: "", attachment_id: null, page_idx: null, updated_at: "2026-10-02" }] };
createRoot(document.getElementById("root")!).render(<PdfReader item={item as never} jump={null} onSaved={async () => { fixture.saved++; }} notify={() => {}} />);
