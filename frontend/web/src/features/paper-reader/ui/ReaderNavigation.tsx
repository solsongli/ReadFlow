import type { useReaderModel } from "../state/useReaderModel.js";
import type { PaperReaderProps } from "./PaperReader.js";
import { NavigationPanel } from "./NavigationPanel.js";

export function ReaderNavigation({
  model,
  ports,
  hidden,
}: {
  model: ReturnType<typeof useReaderModel>;
  ports: PaperReaderProps;
  hidden: boolean;
}) {
  if (hidden || !model.main.pdf) return null;
  const search = model.searcher;
  const searchDocument =
    search.scope === "source"
      ? model.source
      : model.mode === "compare"
        ? model.comparison
        : model.translated;
  return (
    <NavigationPanel
      figures={ports.figures}
      tab={model.nav}
      setTab={model.setNav}
      outline={model.headings}
      current={model.currentHeading?.id ?? ""}
      pdf={model.main.pdf}
      queue={model.queue}
      bookmarks={model.reading.bookmarks}
      remove={(id) => void model.reading.remove(id)}
      jump={model.jump}
      query={search.query}
      setQuery={search.setQuery}
      searchOptions={search.options}
      setSearchOptions={search.setOptions}
      hits={search.hits}
      resultIndex={search.resultIndex}
      selectResult={search.selectResult}
      compare={model.mode === "compare"}
      searchScope={search.scope}
      setSearchScope={search.setCompareScope}
      indexed={searchDocument.indexed}
      indexedPages={searchDocument.indexedPages}
      totalPages={searchDocument.pdf?.numPages || 0}
    />
  );
}
