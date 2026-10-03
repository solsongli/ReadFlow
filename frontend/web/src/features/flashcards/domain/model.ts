export type CardKind = "question" | "cloze" | "term";
export interface CardSource {
  item_id: string;
  page: number;
  annotation_id?: string | null;
  quote: string;
  translation?: string;
  item_title?: string;
  link?: () => Promise<string | undefined>;
}
export interface Card extends CardSource {
  id: string;
  deck_id: string;
  kind: CardKind;
  front: string;
  back: string;
  explanation: string;
  tags: string;
  suspended: boolean;
  orphaned?: boolean;
  due: string;
  interval: number;
  repetitions: number;
  ease: number;
  version: number;
}
export interface Deck {
  id: string;
  name: string;
  group_id?: string | null;
}
export interface ReviewLog {
  card_id: string;
  rating: number;
  previous: string;
}
export function learningDay(now = new Date()): string {
  const local = new Date(now);
  if (local.getHours() < 4) local.setDate(local.getDate() - 1);
  return `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(local.getDate()).padStart(2, "0")}`;
}
export function schedule(card: Pick<Card, "interval" | "repetitions" | "ease">, rating: number) {
  let { interval, repetitions, ease } = card;
  ease = Math.max(1.3, ease);
  if (rating === 1) {
    interval = 0;
    repetitions = 0;
    ease = Math.max(1.3, ease - 0.2);
  } else if (rating === 2) {
    interval = Math.max(1, Math.round(interval * 1.2));
    ease = Math.max(1.3, ease - 0.15);
    repetitions++;
  } else if (rating === 3) {
    interval = repetitions === 0 ? 1 : repetitions === 1 ? 6 : Math.max(1, Math.round(interval * ease));
    repetitions++;
  } else if (rating === 4) {
    interval = Math.max(4, Math.round(Math.max(interval, 1) * ease * 1.3));
    ease += 0.15;
    repetitions++;
  } else throw new Error("无效评分");
  return { interval: Math.min(36500, interval), repetitions, ease: Math.round(ease * 100) / 100 };
}
export function reviewQueue(
  cards: Card[],
  logs: ReviewLog[],
  day: string,
  newLimit: number,
  reviewLimit: number,
) {
  const seen = new Map<string, boolean>();
  for (const log of logs) {
    if (!seen.has(log.card_id)) seen.set(log.card_id, JSON.parse(log.previous).due === "0001-01-01");
  }
  let fresh = Math.max(0, newLimit - [...seen.values()].filter(Boolean).length);
  let old = Math.max(0, reviewLimit - [...seen.values()].filter((v) => !v).length);
  return cards
    .filter((card) => !card.suspended && card.due <= day)
    .filter((card) => {
      if (seen.has(card.id)) return true;
      if (card.due === "0001-01-01") return fresh-- > 0;
      return old-- > 0;
    });
}
export function cloze(text: string, start: number, end: number) {
  if (start < 0 || end <= start || end > text.length) throw new Error("请先在原文中选取需要挖空的词语。");
  return text.slice(0, start) + "[▢]" + text.slice(end);
}
export function cardsCsv(cards: Card[]) {
  const cell = (value: string) =>
    `"${(/^[=+@\-\t\r]/.test(value) ? "'" : "") + value.replaceAll('"', '""')}"`;
  return (
    "\uFEFF" +
    [
      ["正面", "背面", "引文", "来源", "页码"],
      ...cards.map((c) => [
        c.front,
        [c.back, c.translation, c.explanation].filter(Boolean).join("\n"),
        c.quote,
        c.item_title || "",
        String(c.page),
      ]),
    ]
      .map((row) => row.map(cell).join(","))
      .join("\r\n")
  );
}
