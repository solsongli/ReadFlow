import { jsxs as t, Fragment as n, jsx as a } from "react/jsx-runtime";
import { createRoot as c } from "react-dom/client";
import { u as i, d as s, R as m } from "./ReaderApp-Cuw4yhFt.js";
import { i as u, c as f } from "./answer-enhance-D8zK9znw.js";
function l() {
  return i(), null;
}
function p(o = document.body) {
  o.classList.add("reader-body", "reader-mode-compare"), globalThis.window && window.self !== window.top && o.classList.add("reader-embedded");
}
function b(o = document.body, e) {
  Array.from(o.children).forEach((r) => {
    r.tagName !== "SCRIPT" && r.id !== "reader-root" && r !== e && r.remove();
  });
}
function y(o = document.body) {
  let e = document.getElementById("reader-root");
  return e || (e = document.createElement("div"), e.id = "reader-root", o.appendChild(e)), e;
}
function k(o = {}) {
  const e = o.body ?? document.body, r = o.root ?? y(e);
  s(), f(), u(), p(e), o.purgeLegacyMarkup !== !1 && b(e, r);
  const d = c(r);
  return d.render(/* @__PURE__ */ t(n, { children: [
    /* @__PURE__ */ a(l, {}),
    /* @__PURE__ */ a(m, {})
  ] })), d;
}
export {
  k as bootReader,
  b as purgeLegacyMarkup,
  y as resolveReaderRoot,
  p as syncReaderBodyClasses
};
//# sourceMappingURL=boot.js.map
