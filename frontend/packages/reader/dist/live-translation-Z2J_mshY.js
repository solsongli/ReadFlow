const o = "retainpdf:soft-reader-close";
function i(e) {
  return typeof e == "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(e);
}
function a(e) {
  return e === "light" || e === "dark";
}
function f(e) {
  const r = new URLSearchParams(e);
  if (r.get("embed") !== "workbench") return null;
  const t = r.get("research_item_id");
  return { scheme: r.get("scheme") === "dark" ? "dark" : "light", itemId: i(t) ? t : null };
}
function c(e) {
  return !!(e && typeof e == "object" && !Array.isArray(e));
}
function s(e, r) {
  return Object.keys(e).every((t) => r.includes(t));
}
function d(e, r) {
  return Number.isInteger(e) && Number.isInteger(r) && Number(e) >= 1 && Number(r) >= Number(e) && Number(r) <= 1e5;
}
function p(e) {
  return c(e) && e.type === "readflow:scheme" && a(e.scheme) && s(e, ["type", "scheme"]) ? { type: "readflow:scheme", scheme: e.scheme } : null;
}
function m(e, r, t) {
  return t != null && e.origin === r && e.source === t;
}
function y(e, r) {
  return c(e) ? e.type === o && s(e, ["type"]) ? { type: o } : !i(e.itemId) || e.itemId !== r ? null : (e.type === "readflow:notes-changed" || e.type === "readflow:reader-ready") && s(e, ["type", "itemId"]) ? { type: e.type, itemId: r } : e.type === "readflow:reader-progress" && s(e, ["type", "itemId", "page", "pages"]) && d(e.page, e.pages) ? { type: e.type, itemId: r, page: e.page, pages: Number(e.pages) } : null : null;
}
function h(e) {
  return !!(e && typeof e == "object" && ("code" in e || "status" in e));
}
function u(e, r, t) {
  const n = new Error(e);
  return n.name = "ReaderTransportError", r !== void 0 && (n.status = r), t && (n.code = t), n;
}
export {
  o as S,
  i as a,
  a as b,
  u as c,
  y as d,
  p as e,
  h as i,
  f as p,
  m as t,
  d as v
};
//# sourceMappingURL=live-translation-Z2J_mshY.js.map
