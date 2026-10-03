const i = "retainpdf:soft-reader-close", p = [85, 90, 95, 100, 110, 120, 130], o = '"ReadFlow Inter", "Inter", "Noto Sans CJK SC", "Source Han Sans SC", system-ui, sans-serif', d = {
  default: o,
  sans: '"Noto Sans CJK SC", "Source Han Sans SC", system-ui, sans-serif',
  serif: '"Noto Serif CJK SC", "Source Han Serif SC", "Source Han Serif", Georgia, serif',
  kai: '"AR PL UKai CN", "AR PL UKai TW", "KaiTi", "STKaiti", "Noto Serif CJK SC", serif'
};
function m(e) {
  return typeof e == "string" && ["default", "sans", "serif", "kai", "custom"].includes(e);
}
function a(e) {
  return typeof e == "string" && e.trim().length > 0 && e.length <= 160 && !/[\x00-\x1f\x7f;{}]/.test(e);
}
function y(e) {
  if (!e || typeof e != "object" || Array.isArray(e)) return !1;
  const r = e;
  return Object.keys(r).every((t) => ["font", "family", "textScale"].includes(t)) && m(r.font) && p.some((t) => t === r.textScale) && (r.font === "custom" ? a(r.family) : r.family === void 0);
}
function h(e) {
  return e.font !== "custom" ? d[e.font] : a(e.family) ? `${'"' + e.family.trim().replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"'}, ${o}` : o;
}
function c(e) {
  return typeof e == "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(e);
}
function u(e) {
  return e === "light" || e === "dark";
}
function g(e) {
  const r = new URLSearchParams(e);
  if (r.get("embed") !== "workbench") return null;
  const t = r.get("research_item_id");
  return { scheme: r.get("scheme") === "dark" ? "dark" : "light", itemId: c(t) ? t : null };
}
function f(e) {
  return !!(e && typeof e == "object" && !Array.isArray(e));
}
function s(e, r) {
  return Object.keys(e).every((t) => r.includes(t));
}
function S(e, r) {
  return Number.isInteger(e) && Number.isInteger(r) && Number(e) >= 1 && Number(r) >= Number(e) && Number(r) <= 1e5;
}
function b(e) {
  return !f(e) || e.type !== "readflow:scheme" || !u(e.scheme) || !s(e, ["type", "scheme", "appearance"]) || "appearance" in e && !y(e.appearance) ? null : { type: "readflow:scheme", scheme: e.scheme, ..."appearance" in e ? { appearance: e.appearance } : {} };
}
function k(e, r, t) {
  return t != null && e.origin === r && e.source === t;
}
function C(e, r) {
  return f(e) ? e.type === i && s(e, ["type"]) ? { type: i } : !c(e.itemId) || e.itemId !== r ? null : (e.type === "readflow:notes-changed" || e.type === "readflow:reader-ready") && s(e, ["type", "itemId"]) ? { type: e.type, itemId: r } : e.type === "readflow:reader-progress" && s(e, ["type", "itemId", "page", "pages"]) && S(e.page, e.pages) ? { type: e.type, itemId: r, page: e.page, pages: Number(e.pages) } : null : null;
}
function N(e) {
  return !!(e && typeof e == "object" && ("code" in e || "status" in e));
}
function E(e, r, t) {
  const n = new Error(e);
  return n.name = "ReaderTransportError", r !== void 0 && (n.status = r), t && (n.code = t), n;
}
export {
  i as S,
  p as W,
  c as a,
  u as b,
  E as c,
  C as d,
  b as e,
  y as f,
  m as g,
  a as h,
  N as i,
  g as p,
  k as t,
  S as v,
  h as w
};
//# sourceMappingURL=live-translation-DXyeQ4W0.js.map
