import { createRoot } from "react-dom/client";
import { PaperReader, quoteReference } from "@/features/paper-reader/index.js";
import { Profiler, useState } from "react";
const large = location.search.includes("large"),
  fallback = location.search.includes("fallback");
const metadata = {
  id: "paper",
  title: "A Researcher Designed Reader",
  authors: ["Alice Zhang", "Bob Li"],
  year: "2025",
  venue: "Journal of Reproducible Fixtures",
  doi: "10.1234/readflow",
  citekey: "zhang2025reader",
};
function Fixture() {
  const [tone, setTone] = useState<any>(localStorage.getItem("fixture-tone") || "auto");
  const [active, setActive] = useState(true);
  const progress = (page, pages) => {
    localStorage.setItem("fixture-progress", String(page));
    window.fixture.progress.push({ page, pages });
  };
  Object.assign(window, {
    fixture: { ...(window.fixture || { progress: [], lookups: [] }), active: setActive },
  });
  return (
    <Profiler
      id="reader"
      onRender={() => {
        window.fixture.commits = (window.fixture.commits || 0) + 1;
      }}
    >
      <PaperReader
        attachmentId="attachment"
        metadata={metadata}
        active={active}
        tone={tone}
        setTone={(value) => {
          setTone(value);
          localStorage.setItem("fixture-tone", value);
        }}
        source={{
          url: `/fixtures/${location.search.includes("images") ? "paper-images" : large ? "paper-100" : fallback ? "paper-no-outline" : "paper"}.pdf`,
          headers: {},
        }}
        translated={{ url: "/fixtures/paper-translated.pdf", headers: {} }}
        resumePage={Number(localStorage.getItem("fixture-progress") || "1")}
        progress={progress}
        quote={(text, page, format) =>
          quoteReference(
            text,
            metadata.authors,
            metadata.year,
            page,
            format === "gbt" ? "ZHANG A, LI B. A Researcher Designed Reader[J]. 2025." : undefined,
          )
        }
        lookup={async (query) => {
          window.fixture.lookups.push(query);
          return [{ id: "existing", title: query }];
        }}
        reveal={() => {}}
        translation={{ label: "已译", running: false, start: () => {}, cancel: () => {} }}
      />
    </Profiler>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
