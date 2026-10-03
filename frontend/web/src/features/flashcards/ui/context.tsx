import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { request } from "../state/api.js";
import { learningDay, type Card, type CardSource, type Deck, type ReviewLog } from "../domain/model.js";
import { CardEditor } from "./CardEditor.js";
interface Ports {
  open: () => void;
  source: (source: CardSource) => void;
  limits: { newCards: number; reviews: number };
  groups: Array<{ id: string; name: string }>;
}
interface Workspace extends Ports {
  cards: Card[];
  decks: Deck[];
  logs: ReviewLog[];
  day: string;
  error: string;
  reload: () => Promise<void>;
  create: (source: CardSource) => void;
  edit: (card: Card) => void;
}
const Context = createContext<Workspace | null>(null);
export function useFlashcards() {
  return useContext(Context);
}
export function FlashcardProvider({ children, ...ports }: Ports & { children: ReactNode }) {
  const [cards, setCards] = useState<Card[]>([]);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [logs, setLogs] = useState<ReviewLog[]>([]);
  const [day, setDay] = useState(learningDay);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<Card | CardSource | null>(null);
  async function reload() {
    try {
      const today = learningDay();
      const result = await request<{ items: Card[] }>("flashcards");
      const groups = await request<{ items: Deck[] }>("decks");
      const reviews = await request<{ items: ReviewLog[] }>(`card-reviews?day=${today}`);
      setCards(result.items);
      setDecks(groups.items);
      setLogs(reviews.items);
      setDay(today);
      setError("");
    } catch (failure) {
      setError((failure as Error).message);
    }
  }
  useEffect(() => {
    void reload();
    const refresh = () => void reload();
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void reload();
    }, 60000);
    return () => {
      window.removeEventListener("focus", refresh);
      window.clearInterval(timer);
    };
  }, []);
  const value = { ...ports, cards, decks, logs, day, error, reload, create: setDraft, edit: setDraft };
  return (
    <Context.Provider value={value}>
      {children}
      {draft ? (
        <CardEditor
          key={"id" in draft ? draft.id : "new"}
          draft={draft}
          workspace={value}
          close={() => setDraft(null)}
        />
      ) : null}
    </Context.Provider>
  );
}
export type { Workspace };
