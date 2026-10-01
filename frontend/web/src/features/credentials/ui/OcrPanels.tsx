import { ResearchOcrPanel } from "@/features/research-library/ui/ResearchOcrPanel.js";
import { researchLibraryApi } from "@/platform/api/research-library.js";

/** Settings and the library share the same module API and management surface. */
export function OcrPanels() {
  return <div className="credential-provider-panels"><ResearchOcrPanel api={researchLibraryApi} items={[]} managementOnly /></div>;
}
