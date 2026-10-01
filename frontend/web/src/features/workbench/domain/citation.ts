// 参考文献格式化（纯函数）：GB/T 7714-2015 顺序编码制的常用著录形式 + BibTeX。
// 只用文献库已有字段（作者、题名、年份/日期、出处、DOI、URL）；卷期页码缺失时不臆造。

export interface CitableItem {
  title: string;
  authors: string[];
  date: string;
  year: string;
  venue: string;
  item_type: string;
  doi: string;
  url: string;
}

export type CitationFormat = "gbt7714" | "bibtex";

const CJK = /[㐀-鿿豈-﫿]/;
const GBT_TYPE: Record<string, string> = {
  journalArticle: "J",
  conferencePaper: "C",
  book: "M",
  bookSection: "M",
  thesis: "D",
  report: "R",
  patent: "P",
  standard: "S",
  dataset: "DS",
  preprint: "EB/OL",
  webpage: "EB/OL",
  blogPost: "EB/OL",
};

export function splitName(author: string): { family: string; given: string } {
  const value = author.trim();
  if (value.includes(",")) {
    const [family, given] = value.split(",", 2);
    return { family: family.trim(), given: (given ?? "").trim() };
  }
  if (CJK.test(value)) return { family: value, given: "" };
  const parts = value.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { family: value, given: "" };
  return { family: parts[parts.length - 1], given: parts.slice(0, -1).join(" ") };
}

export function gbtAuthor(author: string): string {
  if (CJK.test(author)) return author.trim();
  const { family, given } = splitName(author);
  const initials = given
    .split(/[\s\-.]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase())
    .join(" ");
  return [family.toUpperCase(), initials].filter(Boolean).join(" ");
}

export function gbtAuthors(authors: string[]): string {
  if (!authors.length) return "佚名";
  const shown = authors.slice(0, 3).map(gbtAuthor).join(", ");
  if (authors.length <= 3) return shown;
  return shown + (CJK.test(authors[0]) ? ", 等" : ", et al");
}

function endWithPeriod(value: string): string {
  const trimmed = value.trim();
  return /[.?!。？！]$/.test(trimmed) ? trimmed : trimmed + ".";
}

export function arxivId(item: Pick<CitableItem, "doi" | "url">): string {
  const fromDoi = /^10\.48550\/arxiv\.(.+)$/i.exec(item.doi.trim());
  if (fromDoi) return fromDoi[1];
  const fromUrl = /arxiv\.org\/(?:abs|pdf)\/([^\s?#]+?)(?:\.pdf)?(?:[?#].*)?$/i.exec(item.url.trim());
  return fromUrl ? fromUrl[1] : "";
}

function link(item: CitableItem): string {
  if (item.url) return item.url;
  return item.doi ? `https://doi.org/${item.doi}` : "";
}

export function formatGbt7714(item: CitableItem): string {
  const type = GBT_TYPE[item.item_type] ?? (arxivId(item) ? "EB/OL" : "Z");
  const head = `${endWithPeriod(gbtAuthors(item.authors))} ${item.title.trim()}[${type}]`;
  const year = item.year || "";
  if (type === "EB/OL") {
    const when = /^\d{4}-\d{2}-\d{2}/.test(item.date) ? item.date.slice(0, 10) : year;
    const parts = [head + ".", when ? `(${when}).` : "", link(item) ? link(item) + "." : ""];
    return parts.filter(Boolean).join(" ");
  }
  const doi = item.doi ? ` DOI: ${item.doi}.` : "";
  if (type === "C") {
    const venue = item.venue ? `//${item.venue}` : "";
    return `${head}${venue}. ${year ? year + "." : ""}${doi}`.replace(/\s+/g, " ").trim();
  }
  const tail = [item.venue, year].filter(Boolean).join(", ");
  return `${head}.${tail ? " " + tail + "." : ""}${doi}`;
}

const BIB_TYPE: Record<string, { type: string; venueField: string }> = {
  journalArticle: { type: "article", venueField: "journal" },
  conferencePaper: { type: "inproceedings", venueField: "booktitle" },
  book: { type: "book", venueField: "publisher" },
  bookSection: { type: "incollection", venueField: "booktitle" },
  thesis: { type: "phdthesis", venueField: "school" },
  report: { type: "techreport", venueField: "institution" },
};

function bibValue(value: string): string {
  return value.replace(/[{}]/g, "").replace(/\s+/g, " ").trim();
}

export function bibAuthor(author: string): string {
  if (CJK.test(author)) return bibValue(author);
  const { family, given } = splitName(author);
  return bibValue(given ? `${family}, ${given}` : family);
}

export function formatBibtex(item: CitableItem, citekey: string): string {
  const mapping = BIB_TYPE[item.item_type] ?? { type: "misc", venueField: "howpublished" };
  const eprint = arxivId(item);
  const fields: Array<[string, string]> = [
    ["title", `{${bibValue(item.title)}}`],
    ["author", item.authors.map(bibAuthor).join(" and ")],
    [mapping.venueField, eprint && mapping.type === "misc" ? "" : bibValue(item.venue)],
    ["year", item.year],
    ["doi", bibValue(item.doi)],
    ["url", bibValue(item.url)],
    ["eprint", eprint],
    ["archivePrefix", eprint ? "arXiv" : ""],
  ];
  const body = fields
    .filter(([, value]) => value)
    .map(([key, value]) => `  ${key} = {${value}},`)
    .join("\n");
  return `@${mapping.type}{${citekey},\n${body}\n}`;
}

export function formatCitation(format: CitationFormat, item: CitableItem, citekey: string): string {
  return format === "bibtex" ? formatBibtex(item, citekey) : formatGbt7714(item);
}
