import { useState } from "react";
import { Button } from "@/ui/wb/Button.js";
import type { AssistancePorts } from "../../domain/assistance.js";
import type { PaperReaderProps } from "../../ui/PaperReader.js";
import type { useReaderModel } from "../useReaderModel.js";
import type { useAnnotationReader } from "../annotations/useAnnotationReader.js";
import { useReaderChat } from "./useChat.js";
import { useSelectionTranslation } from "./useTranslation.js";
import { ChatPanel } from "../../ui/assistance/ChatPanel.js";
import { TranslationCard } from "../../ui/assistance/TranslationCard.js";
const unavailable: AssistancePorts = {
  translationConfig: async () => {
    throw { code: "unconfigured" };
  },
  settings: () => {},
  note: async () => {},
  canvas: () => {},
};
export function useAssistance(
  ports: PaperReaderProps,
  model: ReturnType<typeof useReaderModel>,
  annotations: ReturnType<typeof useAnnotationReader>,
  reveal: () => void,
) {
  const actions = ports.assistance ?? unavailable;
  const [quote, setQuote] = useState({ text: "", key: 0 });
  const [panelRequest, setPanelRequest] = useState(0);
  const translation = useSelectionTranslation(ports.metadata.id, actions, annotations.readSelection);
  const chat = useReaderChat(ports.metadata.id);
  function ask() {
    reveal();
    const text = annotations
      .readSelection()
      .map((value) => `(p. ${value.page + 1}) ${value.quote}`)
      .join("\n");
    setQuote((value) => ({ text, key: value.key + 1 }));
    setPanelRequest((value) => value + 1);
    model.setRight(true);
    model.setFocus(false);
    window.getSelection()?.removeAllRanges();
  }
  function pageText() {
    const indexed = model.source.lines
      .filter((line) => line.page === model.position.page)
      .map((line) => line.text)
      .join("\n");
    if (indexed) return indexed.slice(0, 20000);
    const selector = `[data-annotation-source=true] [data-paper-page="${model.position.page}"] .pr-text-layer span`;
    return [...(model.root.current?.querySelectorAll(selector) ?? [])]
      .map((span) => span.textContent || "")
      .join("\n")
      .slice(0, 20000);
  }
  return {
    existingTranslation: translation.existing,
    tools: ports.assistance ? (
      <>
        <Button size="sm" title="翻译选中原文（T）" onClick={() => void translation.translate()}>
          翻译
        </Button>
        <Button size="sm" onClick={ask}>
          问 AI
        </Button>
      </>
    ) : null,
    key: (event: KeyboardEvent) => {
      if (
        !ports.assistance ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        model.mode === "translated"
      ) {
        return false;
      }
      if (event.key.toLowerCase() === "t" && annotations.readSelection().length) {
        void translation.translate();
        return true;
      }
      return false;
    },
    panelRequest,
    panel: ports.assistance ? (
      <ChatPanel
        chat={chat}
        ports={actions}
        quote={quote}
        pages={model.source.pdf?.numPages || 1}
        jump={(page) => model.jump(page, 0, 0, "source")}
        context={() => ({
          page: model.position.page,
          selection: quote.text,
          page_text: pageText(),
        })}
      />
    ) : undefined,
    card: ports.assistance ? (
      <TranslationCard
        translation={translation}
        ports={actions}
        root={model.root}
        save={(text, anchors) =>
          annotations.c.createBatch(
            anchors.map((anchor) => ({
              type: "highlight",
              color: annotations.c.color,
              note: text,
              quote: anchor.quote,
              page_index: anchor.page,
              rects: anchor.rects,
            })),
          )
        }
      />
    ) : null,
  };
}
