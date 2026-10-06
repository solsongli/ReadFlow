export const OVERVIEW_SECTIONS = [
  ["motivation", "研究问题与动机"],
  ["methods", "核心方法"],
  ["results", "实验与主要结果"],
  ["conclusions", "结论与局限"],
  ["related_work", "与相关工作的关系"],
] as const;
export interface OverviewEntry {
  text: string;
  page: number | null;
  trusted: boolean;
}
export interface Overview {
  sections: Record<(typeof OVERVIEW_SECTIONS)[number][0], OverviewEntry[]>;
  service?: string;
  model?: string;
  target: string;
  created_at: string;
  pages: number[];
  attachment_id: string;
}
export function overviewMarkdown(value: Overview, title: string) {
  return (
    `# ${title} · 论文速览\n\n> AI 导读，请核对原文；未提供的内容不代表论文没有讨论。\n\n` +
    OVERVIEW_SECTIONS.map(
      ([key, label]) =>
        `## ${label}\n\n` +
        value.sections[key]
          .map((row) => `- ${row.text} ${row.trusted ? `(p. ${row.page})` : "（页码待核对）"}`)
          .join("\n"),
    ).join("\n\n")
  );
}
