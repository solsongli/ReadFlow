import { jsxs as x, jsx as i, Fragment as ue } from "react/jsx-runtime";
import { useId as Ae, useState as W, useCallback as H, useRef as j, useEffect as q, useLayoutEffect as Pt, createContext as Lt, useContext as at, useMemo as Q } from "react";
import { Square as Ot, ArrowUp as Dt, Copy as Ft, GitBranch as jt, RefreshCw as zt, Sigma as it, Table2 as Bt, Image as qt, Type as Wt, X as _e, BookOpen as ot, Sparkles as Ie, Loader2 as xe, FileText as Le, ArrowDown as ct, Quote as Ht, ListTree as Kt, FlaskConical as Ut, ShieldCheck as Gt, Bot as Yt, ChevronUp as Vt, ChevronDown as lt, TriangleAlert as dt, ExternalLink as Xt, Check as ut, Circle as Qt, Plus as Jt, Pencil as Zt, Trash2 as en } from "lucide-react";
import { b as ye, e as be, g as Ue, h as tn, d as nn, R as rn } from "./boot-BZJU4VGb.js";
import { ThreadPrimitive as ae, ComposerPrimitive as Me, MessagePrimitive as mt, ActionBarPrimitive as Ee, useAui as sn, SelectionToolbarPrimitive as an, useExternalStoreRuntime as on, AssistantRuntimeProvider as cn } from "@assistant-ui/react";
import { D as ft, f as ln, l as pt, F as Ce, E as ht, B as dn, c as un, j as mn, o as fn, i as pn, z as hn, M as gn, d as pe, q as le, C as Ge, k as yn, v as bn } from "./answer-enhance-qpcdy3sI.js";
import wn, { setCustomComponents as vn, PreCodeNode as In, MathInlineNode as Rn } from "markstream-react";
import { createPortal as Nn } from "react-dom";
import { r as gt } from "./reader-regions-DsePY7B_.js";
import { b as Mn, m as $n, s as Cn, l as yt, c as we, d as De, a as kn } from "./answer-quote-B7l9lW76.js";
import { Chat as An, useChat as _n } from "@ai-sdk/react";
import { describeToolEvent as xn } from "@retainpdf/domain/ai";
import { toSessionSummary as Sn } from "@retainpdf/domain/session";
import { l as Tn } from "./ask-answerer-C84H8lXs.js";
import { getConversation as Ye, messagesToBranchItems as ke, nextForkConversationTitle as En } from "@retainpdf/api/conversations";
import { c as Pe } from "./ai-chat-ZSCffLDD.js";
import { agentOperationShouldReplace as Pn, agentOperationEventSeq as Ln, agentOperationShouldPoll as On, agentOperationErrorStatus as Dn, agentOperationErrorMessage as Fn, resolveAgentOperationActionKey as jn, clearAgentOperationActionKey as zn } from "@retainpdf/api/agent-operation-model";
const Bn = "retainpdf-chart", qn = 6, Wn = 40, Hn = /* @__PURE__ */ new Set(["bar", "line", "pie"]);
function Kn(t) {
  if (typeof t == "number") return Number.isFinite(t) ? t : null;
  if (typeof t == "string" && t.trim()) {
    const e = Number(t);
    return Number.isFinite(e) ? e : null;
  }
  return null;
}
function ve(t, e = "") {
  return `${t ?? ""}`.trim() || e;
}
function Un(t) {
  if (!Array.isArray(t)) return [];
  const e = [];
  for (const n of t) {
    if (!n || typeof n != "object") continue;
    const r = n, s = Kn(r.value ?? r.y);
    if (s !== null && (e.push({ label: ve(r.label ?? r.x, `${e.length + 1}`), value: s }), e.length >= Wn))
      break;
  }
  return e;
}
function Gn(t) {
  if (!Array.isArray(t)) return [];
  const e = [];
  for (const n of t) {
    if (!n || typeof n != "object") continue;
    const r = n, s = Un(r.points ?? r.data);
    if (s.length && (e.push({ name: ve(r.name, `系列 ${e.length + 1}`), points: s }), e.length >= qn))
      break;
  }
  return e;
}
function Yn(t) {
  const e = `${t || ""}`.trim();
  if (!e) return null;
  let n;
  try {
    n = JSON.parse(e);
  } catch {
    return null;
  }
  if (!n || typeof n != "object" || Array.isArray(n)) return null;
  const r = n, s = `${r.kind ?? r.type ?? ""}`.trim().toLowerCase();
  if (!Hn.has(s)) return null;
  const a = Gn(r.series);
  if (!a.length) return null;
  const o = s === "pie" ? a.slice(0, 1) : a;
  return {
    kind: s,
    title: ve(r.title),
    xLabel: ve(r.xLabel ?? r.x_label),
    yLabel: ve(r.yLabel ?? r.y_label),
    series: o
  };
}
function Vn(t) {
  const e = t.series.flatMap((o) => o.points.map((c) => c.value)), n = Math.min(...e), r = Math.max(...e), s = Math.min(0, n), a = Math.max(0, r);
  return s === a ? { min: s, max: a + 1 } : { min: s, max: a };
}
function Fe(t) {
  let e = [];
  for (const n of t.series)
    n.points.length > e.length && (e = n.points);
  return e.map((n) => n.label);
}
const bt = 640, je = 300, X = { top: 16, right: 16, bottom: 44, left: 52 }, he = bt - X.left - X.right, ie = je - X.top - X.bottom, Ve = [
  "var(--chart-1, #4c6ef5)",
  "var(--chart-2, #f08c00)",
  "var(--chart-3, #2f9e44)",
  "var(--chart-4, #e03131)",
  "var(--chart-5, #ae3ec9)",
  "var(--chart-6, #0c8599)"
], Re = (t) => Ve[t % Ve.length];
function Xn(t, e) {
  return Array.from({ length: 5 }, (r, s) => t + (e - t) * s / 4);
}
function Qn(t) {
  const e = Math.abs(t);
  return e >= 1e4 ? `${(t / 1e3).toFixed(0)}k` : Number.isInteger(t) ? `${t}` : t.toFixed(e < 1 ? 2 : 1);
}
function Jn(t) {
  return t <= 8 ? 1 : Math.ceil(t / 8);
}
function Zn({
  spec: t,
  min: e,
  max: n,
  labels: r
}) {
  const s = (c) => X.top + ie - (c - e) / (n - e) * ie, a = Jn(r.length), o = he / Math.max(1, r.length);
  return /* @__PURE__ */ x("g", { className: "reader-answer-chart-axes", children: [
    Xn(e, n).map((c) => /* @__PURE__ */ x("g", { children: [
      /* @__PURE__ */ i(
        "line",
        {
          className: "reader-answer-chart-grid",
          x1: X.left,
          x2: X.left + he,
          y1: s(c),
          y2: s(c)
        }
      ),
      /* @__PURE__ */ i("text", { className: "reader-answer-chart-tick", x: X.left - 8, y: s(c), textAnchor: "end", dominantBaseline: "middle", children: Qn(c) })
    ] }, c)),
    r.map((c, d) => d % a === 0 ? /* @__PURE__ */ i(
      "text",
      {
        className: "reader-answer-chart-tick",
        x: X.left + o * (d + 0.5),
        y: X.top + ie + 18,
        textAnchor: "middle",
        children: c.length > 10 ? `${c.slice(0, 9)}…` : c
      },
      `${c}-${d}`
    ) : null),
    t.yLabel ? /* @__PURE__ */ i("text", { className: "reader-answer-chart-axis-label", x: X.left, y: X.top - 4, textAnchor: "start", children: t.yLabel }) : null,
    t.xLabel ? /* @__PURE__ */ i(
      "text",
      {
        className: "reader-answer-chart-axis-label",
        x: X.left + he,
        y: je - 6,
        textAnchor: "end",
        children: t.xLabel
      }
    ) : null
  ] });
}
function er({ spec: t, min: e, max: n }) {
  const r = Fe(t), s = he / Math.max(1, r.length), a = s * 0.7, o = a / t.series.length, c = (l) => X.top + ie - (l - e) / (n - e) * ie, d = c(0);
  return /* @__PURE__ */ i(ue, { children: t.series.map((l, m) => /* @__PURE__ */ i("g", { fill: Re(m), children: l.points.map((f, g) => {
    const p = c(f.value), u = X.left + s * g + (s - a) / 2 + o * m;
    return /* @__PURE__ */ i(
      "rect",
      {
        x: u,
        y: Math.min(p, d),
        width: Math.max(1, o - 1),
        height: Math.max(1, Math.abs(d - p)),
        rx: 2,
        children: /* @__PURE__ */ i("title", { children: `${l.name} · ${f.label}: ${f.value}` })
      },
      `${f.label}-${g}`
    );
  }) }, l.name)) });
}
function tr({ spec: t, min: e, max: n }) {
  const r = Fe(t), s = he / Math.max(1, r.length), a = (c) => X.top + ie - (c - e) / (n - e) * ie, o = (c) => X.left + s * (c + 0.5);
  return /* @__PURE__ */ i(ue, { children: t.series.map((c, d) => {
    const l = c.points.map((m, f) => `${f === 0 ? "M" : "L"} ${o(f)} ${a(m.value)}`).join(" ");
    return /* @__PURE__ */ x("g", { stroke: Re(d), fill: Re(d), children: [
      /* @__PURE__ */ i("path", { className: "reader-answer-chart-line", d: l, fill: "none" }),
      c.points.map((m, f) => /* @__PURE__ */ i(
        "circle",
        {
          cx: o(f),
          cy: a(m.value),
          r: 3,
          stroke: "none",
          children: /* @__PURE__ */ i("title", { children: `${c.name} · ${m.label}: ${m.value}` })
        },
        `${m.label}-${f}`
      ))
    ] }, c.name);
  }) });
}
function nr({ spec: t }) {
  var d;
  const e = ((d = t.series[0]) == null ? void 0 : d.points) ?? [], n = e.map((l) => Math.max(0, l.value)), r = n.reduce((l, m) => l + m, 0);
  if (r <= 0) return null;
  const s = X.left + he / 2, a = X.top + ie / 2, o = Math.min(he, ie) / 2 - 8;
  let c = -Math.PI / 2;
  return /* @__PURE__ */ i(ue, { children: e.map((l, m) => {
    const f = n[m] / r, g = c + f * Math.PI * 2, p = s + o * Math.cos(c), u = a + o * Math.sin(c), A = s + o * Math.cos(g), T = a + o * Math.sin(g), C = f > 0.5 ? 1 : 0, N = f >= 1 ? `M ${s} ${a - o} A ${o} ${o} 0 1 1 ${s - 0.01} ${a - o} Z` : `M ${s} ${a} L ${p} ${u} A ${o} ${o} 0 ${C} 1 ${A} ${T} Z`;
    return c = g, /* @__PURE__ */ i("path", { d: N, fill: Re(m), children: /* @__PURE__ */ i("title", { children: `${l.label}: ${l.value}（${(f * 100).toFixed(1)}%）` }) }, `${l.label}-${m}`);
  }) });
}
function rr({ spec: t }) {
  var n;
  const e = t.kind === "pie" ? (((n = t.series[0]) == null ? void 0 : n.points) ?? []).map((r) => r.label) : t.series.map((r) => r.name);
  return e.length < 2 ? null : /* @__PURE__ */ i("ul", { className: "reader-answer-chart-legend", children: e.map((r, s) => /* @__PURE__ */ x("li", { children: [
    /* @__PURE__ */ i("span", { className: "reader-answer-chart-swatch", style: { background: Re(s) }, "aria-hidden": !0 }),
    r
  ] }, `${r}-${s}`)) });
}
function sr({ spec: t }) {
  const e = Ae(), { min: n, max: r } = Vn(t), s = Fe(t), a = t.title || `${t.series.length} 个系列的${t.kind === "pie" ? "占比" : "对比"}图`;
  return /* @__PURE__ */ x("figure", { className: "reader-answer-chart", children: [
    /* @__PURE__ */ x(
      "svg",
      {
        className: `reader-answer-chart-svg is-${t.kind}`,
        viewBox: `0 0 ${bt} ${je}`,
        role: "img",
        "aria-labelledby": e,
        preserveAspectRatio: "xMidYMid meet",
        children: [
          /* @__PURE__ */ i("title", { id: e, children: a }),
          t.kind !== "pie" ? /* @__PURE__ */ i(Zn, { spec: t, min: n, max: r, labels: s }) : null,
          t.kind === "bar" ? /* @__PURE__ */ i(er, { spec: t, min: n, max: r }) : null,
          t.kind === "line" ? /* @__PURE__ */ i(tr, { spec: t, min: n, max: r }) : null,
          t.kind === "pie" ? /* @__PURE__ */ i(nr, { spec: t }) : null
        ]
      }
    ),
    /* @__PURE__ */ i(rr, { spec: t }),
    t.title ? /* @__PURE__ */ i("figcaption", { className: "reader-answer-chart-caption", children: t.title }) : null
  ] });
}
const ar = 1600;
function ir(t) {
  const e = `${t || ""}`.trim().toLowerCase();
  return !e || e === "text" || e === "plain" ? "" : {
    js: "JavaScript",
    jsx: "JSX",
    ts: "TypeScript",
    tsx: "TSX",
    py: "Python",
    python: "Python",
    rs: "Rust",
    rust: "Rust",
    sh: "Shell",
    bash: "Shell",
    zsh: "Shell",
    json: "JSON",
    yaml: "YAML",
    yml: "YAML",
    sql: "SQL",
    html: "HTML",
    css: "CSS",
    md: "Markdown",
    markdown: "Markdown"
  }[e] || e;
}
function or({
  language: t,
  code: e,
  children: n
}) {
  const [r, s] = W(!1), a = ir(t), o = H(() => {
    var d;
    const c = `${e || ""}`;
    c.trim() && ((d = navigator.clipboard) == null || d.writeText(c).then(
      () => {
        var l;
        s(!0), (l = globalThis.setTimeout) == null || l.call(globalThis, () => s(!1), ar);
      },
      () => {
      }
    ));
  }, [e]);
  return /* @__PURE__ */ x("div", { className: "reader-answer-code", children: [
    /* @__PURE__ */ x("div", { className: "reader-answer-code-bar", children: [
      /* @__PURE__ */ i("span", { className: "reader-answer-code-lang", children: a }),
      /* @__PURE__ */ i(
        "button",
        {
          type: "button",
          className: "reader-answer-code-copy",
          onClick: o,
          title: "复制代码",
          children: r ? "已复制" : "复制"
        }
      )
    ] }),
    n
  ] });
}
const cr = 8, lr = 8;
function dr(t, e, n, { gap: r = cr, margin: s = lr } = {}) {
  const a = n.height - t.bottom, o = t.top, c = e.height + r + s, d = a >= c || a >= o ? "bottom" : "top", l = d === "bottom" ? t.bottom + r : t.top - r - e.height, m = Math.max(s, n.height - e.height - s), f = Math.min(Math.max(l, s), m), g = t.left + t.width / 2 - e.width / 2, p = Math.max(s, n.width - e.width - s);
  return { left: Math.min(Math.max(g, s), p), top: f, placement: d };
}
const ur = 240, wt = 180;
function vt(t, e) {
  const n = `${t || ""}`.replace(/\s+/g, " ").trim();
  return n.length <= e ? n : `${n.slice(0, e - 1)}…`;
}
function It(t, e) {
  return ft(t) === null ? [] : `${t.job_id || e || ""}`.trim() ? ["translated", "source"] : [];
}
function mr(t, e) {
  return It(t, e).length > 0 || vt(`${t.snippet || ""}`, wt).length > 0;
}
function fr({
  citation: t,
  jobId: e,
  anchor: n,
  cardId: r,
  onPointerEnter: s,
  onPointerLeave: a
}) {
  const o = j(null), c = j(null), d = It(t, e), l = ft(t), m = l === null ? null : l + 1, f = vt(`${t.snippet || ""}`, wt), [g, p] = W(
    d.length ? "loading" : "none"
  ), [u, A] = W(null);
  q(() => {
    const N = c.current;
    if (!N || !d.length) return;
    const $ = `${t.job_id || e || ""}`.trim(), v = new AbortController();
    return (async () => {
      for (const L of d) {
        const y = ln(
          $,
          l ?? 0,
          L,
          {}
        );
        if (!y) break;
        if (N.setAttribute("data-ai-src", y), N.classList.remove("is-missing"), await pt(N, { signal: v.signal }), v.signal.aborted) return;
        if (!N.classList.contains("is-missing")) {
          p("ready");
          return;
        }
      }
      v.signal.aborted || p("failed");
    })(), () => {
      v.abort(), Ce(N);
    };
  }, [t, e, l, d.length]), Pt(() => {
    const N = o.current;
    if (!N || !n) return;
    const $ = () => {
      const v = n.getBoundingClientRect(), L = N.getBoundingClientRect(), y = dr(
        { top: v.top, left: v.left, bottom: v.bottom, width: v.width },
        {
          width: L.width || N.offsetWidth,
          height: L.height || N.offsetHeight
        },
        { width: window.innerWidth || 0, height: window.innerHeight || 0 }
      );
      A((b) => b && b.left === y.left && b.top === y.top && b.placement === y.placement ? b : y);
    };
    return $(), window.addEventListener("scroll", $, !0), window.addEventListener("resize", $), () => {
      window.removeEventListener("scroll", $, !0), window.removeEventListener("resize", $);
    };
  }, [n, g, f]);
  const T = /* @__PURE__ */ x(
    "div",
    {
      ref: o,
      id: r,
      role: "tooltip",
      className: `reader-ai-citation-card${u ? " is-placed" : ""}`,
      "data-placement": (u == null ? void 0 : u.placement) || "bottom",
      style: { left: `${(u == null ? void 0 : u.left) ?? 0}px`, top: `${(u == null ? void 0 : u.top) ?? 0}px` },
      onMouseEnter: s,
      onMouseLeave: a,
      children: [
        d.length ? /* @__PURE__ */ x("div", { className: "reader-ai-citation-card-figure", "data-state": g, children: [
          /* @__PURE__ */ i(
            "img",
            {
              ref: c,
              alt: m ? `第 ${m} 页预览` : "来源页预览",
              className: "reader-ai-citation-card-thumb",
              decoding: "async",
              width: ur
            }
          ),
          g === "failed" ? /* @__PURE__ */ i("span", { className: "reader-ai-citation-card-thumb-fallback", children: "预览暂不可用" }) : null
        ] }) : null,
        /* @__PURE__ */ x("div", { className: "reader-ai-citation-card-text", children: [
          /* @__PURE__ */ i("div", { className: "reader-ai-citation-card-head", children: m ? `第 ${m} 页` : "来源" }),
          f ? /* @__PURE__ */ i("p", { className: "reader-ai-citation-card-snippet", children: f }) : null
        ] })
      ]
    }
  ), C = typeof document > "u" ? null : document.body;
  return C ? Nn(T, C) : T;
}
const pr = 140, Xe = 180;
function hr({ citation: t, label: e, jobId: n, onJump: r }) {
  const [s, a] = W(!1), o = j(null), c = j(null), d = `reader-ai-citation-card-${Ae().replace(/[^a-zA-Z0-9_-]/g, "")}`, l = ht(t), m = mr(t, n), f = H(() => {
    c.current !== null && (clearTimeout(c.current), c.current = null);
  }, []), g = H((A, T) => {
    f(), c.current = setTimeout(() => {
      c.current = null, a(A);
    }, T);
  }, [f]);
  q(() => () => f(), [f]), q(() => {
    m || a(!1);
  }, [m]);
  const p = H(() => {
    f(), a(!0);
  }, [f]), u = H(() => {
    f(), a(!1);
  }, [f]);
  return /* @__PURE__ */ x(ue, { children: [
    /* @__PURE__ */ x(
      "button",
      {
        ref: o,
        type: "button",
        className: "reader-ai-citation-ref",
        "data-page": l ?? void 0,
        "aria-describedby": s ? d : void 0,
        "aria-expanded": m ? s : void 0,
        title: l ? `跳到第 ${l} 页` : "定位来源",
        onClick: (A) => {
          A.preventDefault(), A.stopPropagation(), u(), r == null || r(t);
        },
        onMouseEnter: m ? () => g(!0, pr) : void 0,
        onMouseLeave: m ? () => g(!1, Xe) : void 0,
        onFocus: m ? p : void 0,
        onBlur: m ? u : void 0,
        onKeyDown: (A) => {
          A.key === "Escape" && s && (A.stopPropagation(), u());
        },
        children: [
          "[",
          e,
          "]"
        ]
      }
    ),
    s && m ? /* @__PURE__ */ i(
      fr,
      {
        citation: t,
        jobId: n,
        anchor: o.current,
        cardId: d,
        onPointerEnter: p,
        onPointerLeave: () => g(!1, Xe)
      }
    ) : null
  ] });
}
const Rt = "retainpdf-ai-answer", Qe = 320, gr = 2, ze = Lt({
  final: !1,
  jobId: "",
  citations: []
});
function yr(t) {
  const e = Number(t.naturalWidth) || 0, n = t.closest(".reader-ai-image-jump"), r = n || t, s = e > 0 && e < Qe;
  if (t.classList.toggle("is-low-resolution", s), n == null || n.classList.toggle("is-low-resolution", s), s) {
    const a = Math.min(
      Qe,
      Math.max(e, e * gr)
    );
    r.style.setProperty("--reader-ai-image-width", `${a}px`);
  } else
    r.style.removeProperty("--reader-ai-image-width");
}
function br({ node: t }) {
  const { final: e, jobId: n, citations: r, onJumpCitation: s } = at(ze), a = j(null), o = j(null), c = `${t.alt || ""}`.trim(), d = dn(t.src, n, {}, un(r)), l = mn(t.src, r, n), m = ht(l), f = H((p) => {
    var T;
    const u = a.current;
    if (u === p || ((T = o.current) == null || T.abort(), o.current = null, u && Ce(u), a.current = p, !p || !d)) return;
    const A = new AbortController();
    o.current = A, (async () => {
      for (const C of [0, 250, 750, 1500]) {
        if (C && await new Promise(($) => globalThis.setTimeout($, C)), A.signal.aborted) return;
        const N = a.current;
        if (!N || N !== p || N.classList.contains("is-hydrated") && N.src.startsWith("blob:")) return;
        await pt(N, { signal: A.signal });
      }
    })();
  }, [d]);
  if (q(() => () => {
    var p;
    (p = o.current) == null || p.abort(), o.current = null, Ce(a.current), a.current = null;
  }, []), !d)
    return e ? /* @__PURE__ */ i("span", { className: "aui-image-blocked", children: c ? `[图片不可用：${c}]` : "[图片不可用]" }) : /* @__PURE__ */ i("span", { className: "aui-image-pending", "aria-label": c || "图片加载中", children: c ? `[图片：${c}]` : "[图片加载中]" });
  const g = /* @__PURE__ */ i(
    "img",
    {
      ref: f,
      alt: c,
      "data-ai-src": d,
      decoding: "async",
      loading: "lazy",
      onLoad: (p) => yr(p.currentTarget),
      title: t.title || void 0
    }
  );
  return !l || !s ? g : /* @__PURE__ */ x(
    "button",
    {
      type: "button",
      className: "reader-ai-image-jump",
      "data-page": m ?? void 0,
      title: m ? `定位到 PDF 第 ${m} 页` : "定位到图片来源",
      onClick: (p) => {
        p.preventDefault(), p.stopPropagation(), s({ ...l, image_url: d });
      },
      children: [
        g,
        /* @__PURE__ */ i("span", { className: "reader-ai-image-jump-label", "aria-hidden": "true", children: m ? `定位 p.${m}` : "定位来源" })
      ]
    }
  );
}
function wr({ node: t }) {
  const { citations: e, jobId: n, onJumpCitation: r } = at(ze), s = `${t.href || ""}`.match(/^#retainpdf-citation-(\d+)$/), a = s ? e.find((c) => `${c.ref}` === s[1]) : null;
  if (a)
    return /* @__PURE__ */ i(
      hr,
      {
        citation: a,
        label: `${(s == null ? void 0 : s[1]) ?? ""}`,
        jobId: n,
        onJump: r
      }
    );
  const o = `${t.text || t.href || ""}`.trim();
  return /* @__PURE__ */ i(
    "span",
    {
      className: "aui-md-extlink",
      "data-href": `${t.href || ""}`.trim() || void 0,
      title: o || void 0,
      children: o
    }
  );
}
function vr(t) {
  const e = t.node;
  if (`${(e == null ? void 0 : e.language) || ""}`.trim().toLowerCase() === Bn) {
    const n = Yn(`${(e == null ? void 0 : e.code) || ""}`);
    if (n) return /* @__PURE__ */ i(sr, { spec: n });
  }
  return /* @__PURE__ */ i(or, { language: `${(e == null ? void 0 : e.language) || ""}`, code: `${(e == null ? void 0 : e.code) || ""}`, children: /* @__PURE__ */ i(In, { node: t.node }) });
}
function Ir({ node: t }) {
  return /* @__PURE__ */ i(
    Rn,
    {
      node: t.markup === "$$" ? { ...t, markup: "$" } : t
    }
  );
}
vn(Rt, {
  image: br,
  link: wr,
  math_inline: Ir,
  code_block: vr
});
function Rr({
  content: t,
  final: e,
  indexKey: n,
  jobId: r,
  citations: s = [],
  onJumpCitation: a,
  onClickCapture: o
}) {
  return /* @__PURE__ */ i(ze.Provider, { value: { final: e, jobId: r, citations: s, onJumpCitation: a }, children: /* @__PURE__ */ i(
    "div",
    {
      className: "retain-markstream-shell",
      "data-markdown-renderer": "markstream-react",
      onClickCapture: o,
      children: /* @__PURE__ */ i(
        wn,
        {
          batchRendering: !e,
          content: t,
          customId: Rt,
          fade: !1,
          final: e,
          htmlPolicy: "escape",
          indexKey: n,
          maxLiveNodes: 0,
          renderCodeBlocksAsPre: !0,
          showTooltips: !1,
          smoothStreaming: !1,
          typewriter: !1
        }
      )
    }
  ) });
}
function Nr({
  content: t,
  streaming: e = !1,
  citations: n = [],
  jobId: r = "",
  className: s = "",
  streamingClassName: a = "",
  pendingClassName: o = "",
  finalClassName: c = "",
  citationFooterMax: d = 5,
  onJumpCitation: l
}) {
  var C;
  const m = j(null), f = Ae(), g = e ? `${t || ""}` : `${t || ""}`.trim(), p = `${r || ((C = n.find((N) => N.job_id)) == null ? void 0 : C.job_id) || ""}`.trim(), u = Q(() => {
    const N = /* @__PURE__ */ new Map();
    for (const $ of n)
      fn($) && N.set(`${$.ref}`, $);
    return N;
  }, [n]), A = Q(
    () => pn(g, u),
    [g, u]
  );
  return q(() => {
    var v;
    const N = m.current;
    if (!N || !g) return;
    const $ = N.parentElement;
    if ($ instanceof HTMLElement) {
      if (e) {
        (v = $.querySelector(".reader-ai-citations")) == null || v.remove();
        return;
      }
      hn($, n, {
        onJump: (L) => l == null ? void 0 : l(L),
        answerText: g,
        max: d
      });
    }
  }, [e, p, u, n, l, g, d]), q(() => () => Ce(m.current), []), g.trim() ? /* @__PURE__ */ i("div", { ref: m, className: `${s} ${e ? a : c || o}`.trim(), children: /* @__PURE__ */ i(
    Rr,
    {
      content: A,
      final: !e,
      indexKey: f,
      jobId: p,
      citations: n,
      onJumpCitation: l,
      onClickCapture: (N) => {
        const $ = N.target;
        $ instanceof Element && $.closest("a[href]") && (N.preventDefault(), N.stopPropagation());
      }
    }
  ) }) : null;
}
function Nt(t) {
  return t.content.filter((e) => e.type === "text").map((e) => e.text).join(`
`).trim();
}
function Je({ label: t }) {
  return /* @__PURE__ */ x("div", { className: "aui-thinking", role: "status", "aria-live": "polite", children: [
    /* @__PURE__ */ i(xe, { className: "aui-spin", size: 14, strokeWidth: 2.4, "aria-hidden": !0 }),
    /* @__PURE__ */ i("span", { children: t || "思考中…" })
  ] });
}
function Mr({ message: t }) {
  return /* @__PURE__ */ i(mt.Root, { className: "aui-msg aui-msg-user", "data-role": "user", children: /* @__PURE__ */ i("div", { className: "aui-msg-bubble", children: /* @__PURE__ */ i("div", { className: "aui-md-plain", children: Nt(t) }) }) });
}
function $r({
  jobId: t,
  message: e,
  citations: n,
  progress: r,
  incompleteReason: s,
  streaming: a,
  branchBusy: o,
  onJumpCitation: c,
  onBranchFromAnswer: d
}) {
  const l = Nt(e);
  return /* @__PURE__ */ i(mt.Root, { className: "aui-msg aui-msg-assistant", "data-role": "assistant", children: /* @__PURE__ */ x("div", { className: "aui-msg-stack", children: [
    a && r ? /* @__PURE__ */ i(Je, { label: r }) : null,
    a && !r && !l ? /* @__PURE__ */ i(Je, { label: "思考中…" }) : null,
    !a && s === "rounds_exhausted" ? /* @__PURE__ */ i("div", { className: "aui-msg-truncated", role: "status", children: "检索与计算的步数已用尽，这个回答是提前收尾的——追问一句可以让它接着做。" }) : null,
    l ? /* @__PURE__ */ i("div", { className: "aui-msg-bubble", children: /* @__PURE__ */ i(
      Nr,
      {
        content: l,
        streaming: a,
        citations: n,
        jobId: t,
        className: "aui-md",
        streamingClassName: "aui-md-streaming",
        pendingClassName: "aui-md-pending",
        finalClassName: "aui-md-final",
        onJumpCitation: c
      }
    ) }) : null,
    /* @__PURE__ */ x(
      Ee.Root,
      {
        className: "aui-msg-actions",
        "data-reader-ai-actions": "",
        hideWhenRunning: !0,
        autohide: "not-last",
        children: [
          /* @__PURE__ */ i(Ee.Copy, { className: "aui-action-btn", "aria-label": "复制答案", title: "复制答案", children: /* @__PURE__ */ i(Ft, { size: 14, strokeWidth: 2.1, "aria-hidden": !0 }) }),
          d ? /* @__PURE__ */ i(
            "button",
            {
              type: "button",
              className: "aui-action-btn aui-action-btn-branch",
              "aria-label": "从这里开新对话",
              title: "从这里开新对话",
              disabled: o,
              onClick: async () => {
                pe(1200, { overlayDelayMs: 0 }), le(1200), await d(e.id);
              },
              children: /* @__PURE__ */ i(jt, { size: 14, strokeWidth: 2.2, "aria-hidden": !0 })
            }
          ) : null,
          /* @__PURE__ */ i(Ee.Reload, { className: "aui-action-btn", "aria-label": "重新生成", title: "重新生成", children: /* @__PURE__ */ i(zt, { size: 14, strokeWidth: 2.2, "aria-hidden": !0 }) })
        ]
      }
    )
  ] }) });
}
function Mt({
  jobId: t,
  citationsByMessageId: e,
  progressByMessageId: n,
  incompleteByMessageId: r,
  streamingAssistantId: s,
  isRunning: a,
  branchBusy: o,
  onJumpCitation: c,
  onBranchFromAnswer: d
}) {
  return /* @__PURE__ */ i("div", { className: "aui-message-group", "data-slot": "aui_message-group", children: /* @__PURE__ */ i(ae.Messages, { children: ({ message: l }) => {
    var f;
    if (l.role === "user") return /* @__PURE__ */ i(Mr, { message: l });
    if (l.role !== "assistant") return null;
    const m = ((f = l.status) == null ? void 0 : f.type) === "running" || a && s === l.id;
    return /* @__PURE__ */ i(
      $r,
      {
        jobId: t,
        message: l,
        citations: e[l.id] || [],
        progress: n[l.id] || "",
        incompleteReason: r[l.id] || "",
        streaming: m,
        branchBusy: o,
        onJumpCitation: c,
        onBranchFromAnswer: d
      }
    );
  } }) });
}
function Cr({
  mode: t,
  disabled: e,
  onChange: n
}) {
  return /* @__PURE__ */ x("div", { className: "aui-assistant-mode", role: "group", "aria-label": "AI 模式", children: [
    /* @__PURE__ */ x(
      "button",
      {
        type: "button",
        className: t !== "operations" ? "is-active" : "",
        "aria-pressed": t !== "operations",
        disabled: e,
        onClick: () => n == null ? void 0 : n("reading"),
        children: [
          /* @__PURE__ */ i(ot, { size: 12, strokeWidth: 2.2, "aria-hidden": !0 }),
          /* @__PURE__ */ i("span", { children: "阅读问答" })
        ]
      }
    ),
    /* @__PURE__ */ x(
      "button",
      {
        type: "button",
        className: t === "operations" ? "is-active" : "",
        "aria-pressed": t === "operations",
        disabled: e,
        onClick: () => n == null ? void 0 : n("operations"),
        children: [
          /* @__PURE__ */ i(Ie, { size: 12, strokeWidth: 2.2, "aria-hidden": !0 }),
          /* @__PURE__ */ i("span", { children: "PDF Agent" })
        ]
      }
    )
  ] });
}
function kr({
  selectionContext: t,
  onClear: e
}) {
  if (!t) return null;
  const n = t.selectionType === "text" ? "text" : t.kind, r = t.selectionType === "text" ? t.quote : gt(t.region, t.pane), s = n === "formula" ? "公式" : n === "table" ? "表格" : n === "figure" ? "图片" : "文字";
  return /* @__PURE__ */ x("div", { className: "aui-selection-context", "data-reader-ai-selection-context": "", children: [
    /* @__PURE__ */ i(n === "formula" ? it : n === "table" ? Bt : n === "figure" ? qt : Wt, { size: 14, strokeWidth: 2.1, "aria-hidden": !0 }),
    /* @__PURE__ */ x("span", { className: "aui-selection-context-meta", children: [
      t.pane === "translated" ? "译文" : "原文",
      " · ",
      t.page,
      " 页 · ",
      s
    ] }),
    /* @__PURE__ */ i("span", { className: "aui-selection-context-text", children: r || "已选择此区域" }),
    /* @__PURE__ */ i(
      "button",
      {
        type: "button",
        className: "aui-selection-context-remove",
        "aria-label": "移除选区上下文",
        title: "移除选区",
        onClick: e,
        children: /* @__PURE__ */ i(_e, { size: 13, strokeWidth: 2.4, "aria-hidden": !0 })
      }
    )
  ] });
}
function $t({
  isRunning: t,
  branchBusy: e,
  mode: n,
  onModeChange: r,
  selectionContext: s,
  onClearSelectionContext: a
}) {
  return /* @__PURE__ */ x(Me.Root, { className: "aui-composer", "data-reader-ai-composer": "", children: [
    /* @__PURE__ */ x("div", { className: "aui-composer-shell", children: [
      n !== "operations" ? /* @__PURE__ */ i(kr, { selectionContext: s, onClear: a }) : null,
      /* @__PURE__ */ i(
        Me.Input,
        {
          className: "aui-input",
          rows: 1,
          placeholder: n === "operations" ? "描述要执行的 PDF 操作…" : "询问当前文档…",
          "aria-label": n === "operations" ? "描述 PDF 操作" : "向文档 AI 提问",
          autoFocus: !0,
          enterKeyHint: "send",
          disabled: e,
          submitMode: "enter"
        }
      ),
      /* @__PURE__ */ x("div", { className: "aui-composer-toolbar", children: [
        /* @__PURE__ */ i(Cr, { mode: n, disabled: t || e, onChange: r }),
        /* @__PURE__ */ i("div", { className: "aui-composer-actions", children: t ? /* @__PURE__ */ i(Me.Cancel, { className: "aui-send aui-send-stop", "aria-label": "停止生成", children: /* @__PURE__ */ i(Ot, { size: 12, strokeWidth: 2.6, "aria-hidden": !0 }) }) : /* @__PURE__ */ i(Me.Send, { className: "aui-send", "aria-label": "发送", children: /* @__PURE__ */ i(Dt, { size: 16, strokeWidth: 2.5, "aria-hidden": !0 }) }) })
      ] })
    ] }),
    /* @__PURE__ */ i("p", { className: "aui-hint", children: "AI 可能会出错，请核对原文与引用" })
  ] });
}
function Ct() {
  return /* @__PURE__ */ x("div", { className: "aui-composer aui-composer-locked", role: "alert", children: [
    /* @__PURE__ */ i("p", { className: "aui-llm-lock-msg", children: gn }),
    /* @__PURE__ */ i("p", { className: "aui-hint", children: "请到首页「设置 → API 设置」填写模型 Key 后即可提问" })
  ] });
}
const Ar = [
  { prompt: "把第 1 页旋转 90 度。", label: "旋转页面", icon: Le },
  { prompt: "删除最后一页。", label: "删除页面", icon: Le }
];
function _r({
  jobId: t,
  empty: e,
  citationsByMessageId: n,
  progressByMessageId: r,
  incompleteByMessageId: s,
  streamingAssistantId: a,
  isRunning: o,
  missingLlmKey: c,
  branchBusy: d,
  agentRequestBlocked: l = !1,
  agentOperationPanel: m,
  onModeChange: f,
  onJumpCitation: g,
  onBranchFromAnswer: p
}) {
  const u = d || l;
  return /* @__PURE__ */ x(ue, { children: [
    e ? /* @__PURE__ */ x("div", { className: "aui-empty", children: [
      /* @__PURE__ */ i("div", { className: "aui-empty-mascot", "aria-hidden": !0, children: /* @__PURE__ */ i("span", { className: "aui-empty-mascot-face", children: /* @__PURE__ */ i(Ie, { size: 21, strokeWidth: 1.9 }) }) }),
      /* @__PURE__ */ i("h2", { className: "aui-empty-title", children: "想怎样处理 PDF？" }),
      /* @__PURE__ */ i("p", { className: "aui-empty-sub", children: "创建候选版本后由你预览和确认" }),
      /* @__PURE__ */ i("div", { className: "aui-suggestions", role: "group", "aria-label": "推荐问题", children: Ar.map((A) => {
        const T = A.icon;
        return /* @__PURE__ */ x(
          ae.Suggestion,
          {
            prompt: A.prompt,
            send: !0,
            type: "button",
            className: "aui-suggestion",
            disabled: u || c,
            children: [
              /* @__PURE__ */ i(T, { size: 14, strokeWidth: 2, "aria-hidden": !0, className: "aui-suggestion-icon" }),
              /* @__PURE__ */ i("span", { className: "aui-suggestion-label", children: A.label })
            ]
          },
          A.prompt
        );
      }) })
    ] }) : null,
    /* @__PURE__ */ i(
      Mt,
      {
        jobId: t,
        citationsByMessageId: n,
        progressByMessageId: r,
        incompleteByMessageId: s,
        streamingAssistantId: a,
        isRunning: o,
        branchBusy: d,
        onJumpCitation: g,
        onBranchFromAnswer: p
      }
    ),
    m,
    /* @__PURE__ */ x(ae.ViewportFooter, { className: "aui-thread-viewport-footer", children: [
      !e && !d ? /* @__PURE__ */ i(
        ae.ScrollToBottom,
        {
          className: "aui-scroll-bottom-btn aui-scroll-bottom",
          "aria-label": "滚到最新",
          children: /* @__PURE__ */ i(ct, { size: 16, strokeWidth: 2.25, "aria-hidden": !0 })
        }
      ) : null,
      c ? /* @__PURE__ */ i(Ct, {}) : /* @__PURE__ */ i(
        $t,
        {
          isRunning: o,
          branchBusy: u,
          mode: "operations",
          onModeChange: f,
          selectionContext: null,
          onClearSelectionContext: void 0
        }
      )
    ] })
  ] });
}
function xr() {
  const t = sn(), e = (n) => {
    var o, c, d;
    n.preventDefault();
    const r = `${((o = globalThis.getSelection) == null ? void 0 : o.call(globalThis)) || ""}`.trim();
    if (!r) return;
    const s = Mn(r);
    if (!s) return;
    const a = t.thread.composer();
    a.setText($n(a.getState().text || "", s));
    try {
      (d = (c = globalThis.getSelection) == null ? void 0 : c.call(globalThis)) == null || d.removeAllRanges();
    } catch {
    }
  };
  return /* @__PURE__ */ i(an.Root, { className: "reader-ai-selection-toolbar", children: /* @__PURE__ */ x(
    "button",
    {
      type: "button",
      className: "reader-ai-selection-quote",
      onPointerDown: e,
      title: "引用这段话继续提问",
      children: [
        /* @__PURE__ */ i(Ht, { size: 12, strokeWidth: 2.4, "aria-hidden": !0 }),
        /* @__PURE__ */ i("span", { children: "引用" })
      ]
    }
  ) });
}
const Sr = [
  { prompt: "用几句话总结这篇文献的核心内容。", label: "总结本文", icon: ot },
  { prompt: "这篇文献的主要结论是什么？", label: "提炼主要结论", icon: Kt },
  { prompt: "作者用了什么方法或模型？", label: "梳理方法与模型", icon: Ut },
  { prompt: "解释文中的关键公式。", label: "解释关键公式", icon: it }
];
function Tr({
  jobId: t,
  empty: e,
  citationsByMessageId: n,
  progressByMessageId: r,
  incompleteByMessageId: s,
  streamingAssistantId: a,
  isRunning: o,
  missingLlmKey: c,
  branchBusy: d,
  composerDisabled: l = !1,
  onModeChange: m,
  onJumpCitation: f,
  onBranchFromAnswer: g,
  selectionContext: p = null,
  onClearSelectionContext: u,
  footerExtra: A = null
}) {
  return /* @__PURE__ */ x(ue, { children: [
    e ? /* @__PURE__ */ x("div", { className: "aui-empty", children: [
      /* @__PURE__ */ i("div", { className: "aui-empty-mascot", "aria-hidden": !0, children: /* @__PURE__ */ i("span", { className: "aui-empty-mascot-face", children: /* @__PURE__ */ i(Ie, { size: 21, strokeWidth: 1.9 }) }) }),
      /* @__PURE__ */ i("h2", { className: "aui-empty-title", children: "一起读懂这篇文档" }),
      /* @__PURE__ */ i("p", { className: "aui-empty-sub", children: "总结、解释、检索与计算，不修改 PDF" }),
      /* @__PURE__ */ i("div", { className: "aui-suggestions", role: "group", "aria-label": "推荐问题", children: Sr.map((T) => {
        const C = T.icon;
        return /* @__PURE__ */ x(
          ae.Suggestion,
          {
            prompt: T.prompt,
            send: !0,
            type: "button",
            className: "aui-suggestion",
            disabled: d || l || c,
            children: [
              /* @__PURE__ */ i(C, { size: 14, strokeWidth: 2, "aria-hidden": !0, className: "aui-suggestion-icon" }),
              /* @__PURE__ */ i("span", { className: "aui-suggestion-label", children: T.label })
            ]
          },
          T.prompt
        );
      }) })
    ] }) : null,
    /* @__PURE__ */ i(xr, {}),
    /* @__PURE__ */ i(
      Mt,
      {
        jobId: t,
        citationsByMessageId: n,
        progressByMessageId: r,
        incompleteByMessageId: s,
        streamingAssistantId: a,
        isRunning: o,
        branchBusy: d,
        onJumpCitation: f,
        onBranchFromAnswer: g
      }
    ),
    A,
    /* @__PURE__ */ x(ae.ViewportFooter, { className: "aui-thread-viewport-footer", children: [
      !e && !d ? /* @__PURE__ */ i(
        ae.ScrollToBottom,
        {
          className: "aui-scroll-bottom-btn aui-scroll-bottom",
          "aria-label": "滚到最新",
          children: /* @__PURE__ */ i(ct, { size: 16, strokeWidth: 2.25, "aria-hidden": !0 })
        }
      ) : null,
      c ? /* @__PURE__ */ i(Ct, {}) : /* @__PURE__ */ i(
        $t,
        {
          isRunning: o,
          branchBusy: d || l,
          mode: "reading",
          onModeChange: m,
          selectionContext: p,
          onClearSelectionContext: u
        }
      )
    ] })
  ] });
}
function Er({
  jobId: t,
  messages: e,
  citationsByMessageId: n,
  progressByMessageId: r,
  incompleteByMessageId: s,
  streamingAssistantId: a,
  isRunning: o,
  missingLlmKey: c,
  branchBusy: d,
  agentRequestBlocked: l = !1,
  agentOperationPanel: m,
  assistantMode: f = "reading",
  onAssistantModeChange: g,
  onJumpCitation: p,
  onBranchFromAnswer: u,
  selectionContext: A = null,
  onClearSelectionContext: T
}) {
  const C = e.length === 0, N = f === "operations";
  return /* @__PURE__ */ i(
    ae.Root,
    {
      className: `aui-thread aui-thread-root${c ? " is-llm-locked" : ""}`,
      "data-chat-ui": "assistant-ui-official-thread",
      children: /* @__PURE__ */ i(
        ae.Viewport,
        {
          className: "aui-viewport",
          "data-slot": "aui_thread-viewport",
          "data-reader-ai-viewport": "true",
          turnAnchor: "top",
          autoScroll: !0,
          children: /* @__PURE__ */ i("div", { className: `aui-thread-inner${C ? " is-empty" : ""}`, children: N ? /* @__PURE__ */ i(
            _r,
            {
              jobId: t,
              empty: C,
              citationsByMessageId: n,
              progressByMessageId: r,
              incompleteByMessageId: s,
              streamingAssistantId: a,
              isRunning: o,
              missingLlmKey: c,
              branchBusy: d,
              agentRequestBlocked: l,
              agentOperationPanel: m,
              onModeChange: g,
              onJumpCitation: p,
              onBranchFromAnswer: u
            }
          ) : /* @__PURE__ */ i(
            Tr,
            {
              jobId: t,
              empty: C,
              citationsByMessageId: n,
              progressByMessageId: r,
              incompleteByMessageId: s,
              streamingAssistantId: a,
              isRunning: o,
              missingLlmKey: c,
              branchBusy: d,
              composerDisabled: l,
              onModeChange: g,
              onJumpCitation: p,
              onBranchFromAnswer: u,
              selectionContext: A,
              onClearSelectionContext: T
            }
          ) })
        }
      )
    }
  );
}
const kt = "retainpdf.reader-agent-operation.dismissed.v1", Pr = /* @__PURE__ */ new Set(["failed", "cancelled"]);
function Ze(t) {
  return [
    `${t.operation_id || ""}`.trim(),
    Number(t.current_attempt) || 0,
    `${t.status || ""}`
  ].join(":");
}
function Lr() {
  var t;
  try {
    const e = JSON.parse(((t = globalThis.localStorage) == null ? void 0 : t.getItem(kt)) || "[]");
    return new Set(Array.isArray(e) ? e.filter((n) => typeof n == "string") : []);
  } catch {
    return /* @__PURE__ */ new Set();
  }
}
function Or(t) {
  var e;
  try {
    (e = globalThis.localStorage) == null || e.setItem(
      kt,
      JSON.stringify(Array.from(t).slice(-100))
    );
  } catch {
  }
}
function At(t, e) {
  switch (t) {
    case "draft":
    case "awaiting_confirmation":
      return e === "green_light" ? "等待自动执行" : "等待确认";
    case "queued":
      return "等待执行";
    case "running":
      return "正在执行";
    case "validating":
      return "正在验证";
    case "result_ready":
      return e === "green_light" ? "等待自动应用" : "候选已就绪";
    case "committed":
      return e === "green_light" ? "AI 已直接应用" : "已应用";
    case "failed":
      return "执行失败";
    case "cancelled":
      return "已取消";
    case "ambiguous":
      return "结果不确定";
    default:
      return `${t}`;
  }
}
function Dr(t) {
  switch (t) {
    case "draft":
    case "awaiting_confirmation":
      return [
        { action: "cancel", label: "拒绝" },
        { action: "run", label: "确认执行", primary: !0 }
      ];
    case "queued":
    case "running":
    case "validating":
      return [{ action: "cancel", label: "取消 PDF 操作", danger: !0 }];
    case "result_ready":
      return [
        { action: "cancel", label: "拒绝候选" },
        { action: "commit", label: "接受并应用", primary: !0 }
      ];
    case "failed":
      return [{ action: "retry", label: "重试", primary: !0 }];
    case "ambiguous":
      return [{ action: "retry", label: "确认风险并重试", danger: !0, risk: !0 }];
    default:
      return [];
  }
}
function Fr(t) {
  return t === "failed" || t === "ambiguous" ? dt : t === "cancelled" ? _e : t === "committed" || t === "result_ready" ? ut : ["queued", "running", "validating"].includes(t) ? xe : Qt;
}
function jr({ events: t, mode: e }) {
  return /* @__PURE__ */ i("ol", { className: "reader-agent-operation-timeline", "aria-label": "PDF 操作步骤", children: t.map((n) => {
    const r = Fr(n.status), s = ["queued", "running", "validating"].includes(n.status);
    return /* @__PURE__ */ x("li", { children: [
      /* @__PURE__ */ i(r, { className: s ? "is-spinning" : "", size: 12, "aria-hidden": !0 }),
      /* @__PURE__ */ i("span", { children: n.summary || n.event || At(n.status, e) }),
      /* @__PURE__ */ i("time", { children: n.ts ? new Date(n.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "" })
    ] }, `${n.attempt}:${n.seq}`);
  }) });
}
function zr({
  operation: t,
  loadCandidate: e
}) {
  const [n, r] = W(!1), [s, a] = W(""), [o, c] = W(""), d = j("");
  return q(() => {
    let l = !1;
    return c(""), e(t).then((m) => {
      if (l) return;
      const f = URL.createObjectURL(m);
      d.current && URL.revokeObjectURL(d.current), d.current = f, a(f);
    }).catch(() => {
      l || c("候选 PDF 加载失败，请重试。");
    }), () => {
      l = !0;
    };
  }, [e, t.operation_id, t.current_attempt]), q(() => () => {
    d.current && URL.revokeObjectURL(d.current);
  }, []), /* @__PURE__ */ x(ue, { children: [
    /* @__PURE__ */ x("div", { className: "reader-agent-operation-candidate", children: [
      /* @__PURE__ */ x("div", { children: [
        /* @__PURE__ */ i(Le, { size: 13, "aria-hidden": !0 }),
        /* @__PURE__ */ i("span", { children: "候选 PDF" })
      ] }),
      /* @__PURE__ */ i("button", { type: "button", disabled: !s, onClick: () => r((l) => !l), children: s ? n ? "收起" : "预览" : "加载中…" }),
      /* @__PURE__ */ i(
        "button",
        {
          type: "button",
          disabled: !s,
          "aria-label": "新窗口打开候选 PDF",
          onClick: () => window.open(s, "_blank", "noopener,noreferrer"),
          children: /* @__PURE__ */ i(Xt, { size: 12, "aria-hidden": !0 })
        }
      )
    ] }),
    n ? /* @__PURE__ */ i("iframe", { className: "reader-agent-operation-preview", src: s, title: "候选 PDF 预览" }) : null,
    o ? /* @__PURE__ */ i("p", { className: "reader-agent-operation-error", role: "alert", children: o }) : null
  ] });
}
function Br({
  entry: t,
  mode: e,
  loadCandidate: n,
  onAction: r,
  onDismiss: s
}) {
  var T;
  const { operation: a, pendingAction: o, error: c } = t, [d, l] = W(!1), [m, f] = W(!1), g = a.events || [], p = Dr(a.status), u = !!((a.status === "result_ready" || a.status === "committed") && a.candidate_available), A = Pr.has(a.status);
  return /* @__PURE__ */ x("article", { className: `reader-agent-operation-card is-${a.status}`, "data-operation-id": a.operation_id, children: [
    /* @__PURE__ */ x("header", { children: [
      /* @__PURE__ */ i("span", { className: "reader-agent-operation-icon", "aria-hidden": !0, children: /* @__PURE__ */ i(Yt, { size: 15 }) }),
      /* @__PURE__ */ x("div", { className: "reader-agent-operation-title", children: [
        /* @__PURE__ */ i("span", { children: "PDF 操作" }),
        /* @__PURE__ */ i("strong", { children: a.intent_summary || "处理当前 PDF" })
      ] }),
      /* @__PURE__ */ x("div", { className: "reader-agent-operation-head-actions", children: [
        /* @__PURE__ */ i("span", { className: "reader-agent-operation-status", children: At(a.status, e) }),
        A ? /* @__PURE__ */ i(
          "button",
          {
            type: "button",
            className: "reader-agent-operation-dismiss",
            "aria-label": a.status === "failed" ? "隐藏这条失败提示" : "隐藏这条已取消提示",
            title: "隐藏",
            onClick: () => s(a),
            children: /* @__PURE__ */ i(_e, { size: 13, "aria-hidden": !0 })
          }
        ) : null
      ] })
    ] }),
    (T = a.affected_pages) != null && T.length ? /* @__PURE__ */ x("p", { className: "reader-agent-operation-scope", children: [
      "影响页码：",
      a.affected_pages.join("、")
    ] }) : null,
    g.length ? /* @__PURE__ */ x("div", { className: "reader-agent-operation-details", children: [
      /* @__PURE__ */ x("button", { type: "button", onClick: () => l((C) => !C), children: [
        d ? /* @__PURE__ */ i(Vt, { size: 12, "aria-hidden": !0 }) : /* @__PURE__ */ i(lt, { size: 12, "aria-hidden": !0 }),
        d ? "收起步骤" : `执行步骤 ${g.length}`
      ] }),
      d ? /* @__PURE__ */ i(jr, { events: g, mode: e }) : null
    ] }) : null,
    u ? /* @__PURE__ */ i(zr, { operation: a, loadCandidate: n }) : null,
    c ? /* @__PURE__ */ i("p", { className: "reader-agent-operation-error", role: "alert", children: c }) : null,
    m ? /* @__PURE__ */ x("div", { className: "reader-agent-operation-risk", role: "alertdialog", "aria-label": "确认重复执行风险", children: [
      /* @__PURE__ */ i(dt, { size: 14, "aria-hidden": !0 }),
      /* @__PURE__ */ i("p", { children: "上一次执行结果不确定，重试可能重复操作。确认接受风险后再继续。" }),
      /* @__PURE__ */ x("div", { children: [
        /* @__PURE__ */ i("button", { type: "button", onClick: () => f(!1), disabled: !!o, children: "返回" }),
        /* @__PURE__ */ i(
          "button",
          {
            type: "button",
            className: "is-danger",
            disabled: !!o,
            onClick: async () => {
              await r("retry", a, { acceptDuplicateRisk: !0 }), f(!1);
            },
            children: o === "retry" ? "处理中…" : "接受风险并重试"
          }
        )
      ] })
    ] }) : p.length ? /* @__PURE__ */ i("div", { className: "reader-agent-operation-actions", children: p.map((C) => /* @__PURE__ */ i(
      "button",
      {
        type: "button",
        className: C.primary ? "is-primary" : C.danger ? "is-danger" : "",
        disabled: !!o,
        onClick: () => {
          C.risk ? f(!0) : r(C.action, a);
        },
        children: o === C.action ? "处理中…" : C.label
      },
      C.action
    )) }) : null
  ] });
}
function qr({
  entries: t,
  confirmationMode: e,
  runtimeRestarting: n,
  loadCandidate: r,
  onAction: s
}) {
  const [a, o] = W(Lr), c = t.filter((l) => !a.has(Ze(l.operation)));
  function d(l) {
    const m = Ze(l);
    o((f) => {
      const g = new Set(f);
      return g.add(m), Or(g), g;
    });
  }
  return /* @__PURE__ */ x("section", { className: `reader-agent-operations${c.length ? " has-operations" : ""}`, "aria-label": "AI PDF 操作", children: [
    /* @__PURE__ */ x("div", { className: `reader-agent-mode${e === "green_light" ? " is-green" : ""}`, children: [
      /* @__PURE__ */ i(Gt, { size: 13, "aria-hidden": !0 }),
      /* @__PURE__ */ i("span", { children: e === "green_light" ? "绿灯模式 · 自动执行并应用" : "需要确认 · 操作前等待授权" })
    ] }),
    n ? /* @__PURE__ */ x("div", { className: "reader-agent-restarting", role: "status", children: [
      /* @__PURE__ */ i(xe, { className: "is-spinning", size: 13, "aria-hidden": !0 }),
      "正在重启 Agent，新请求暂不可用"
    ] }) : null,
    c.map((l) => /* @__PURE__ */ i(
      Br,
      {
        entry: l,
        mode: e,
        loadCandidate: r,
        onAction: s,
        onDismiss: d
      },
      l.operation.operation_id
    ))
  ] });
}
const Wr = (t) => t, Hr = Object.freeze([]), Kr = Object.freeze({}), et = Object.freeze({}), Ur = Object.freeze({
  entries: [],
  confirmationMode: "explicit",
  runtimeRestarting: !1,
  runtimeCredentialConfigured: !1,
  perform: async () => {
  },
  loadCandidate: async () => new Blob()
});
function Gr(t) {
  return t.content.filter((e) => e.type === "text").map((e) => e.text).join(`
`).trim();
}
function Yr(t, e, n) {
  var r, s, a, o;
  return ((r = t.status) == null ? void 0 : r.type) === "running" || n && e === t.id ? { type: "running" } : ((s = t.status) == null ? void 0 : s.type) === "incomplete" || ((a = t.status) == null ? void 0 : a.type) === "error" ? {
    type: "incomplete",
    reason: ((o = t.status) == null ? void 0 : o.reason) === "cancelled" ? "cancelled" : "error"
  } : { type: "complete", reason: "stop" };
}
function Vr({
  jobId: t = "",
  messages: e = Hr,
  citationsByMessageId: n = Kr,
  progressByMessageId: r = et,
  contentByMessageId: s = et,
  streamingAssistantId: a = "",
  isRunning: o = !1,
  onSubmit: c,
  onRetry: d,
  onCancel: l,
  onJumpCitation: m,
  onBranchFromAnswer: f,
  branchBusy: g = !1,
  agentOperations: p = Ur,
  assistantMode: u = "reading",
  onAssistantModeChange: A,
  selectionContext: T = null,
  onClearSelectionContext: C
}) {
  const [, N] = W(0);
  q(() => {
    const I = () => N((S) => S + 1);
    return window.addEventListener("focus", I), window.addEventListener("storage", I), document.addEventListener(Ge, I), () => {
      window.removeEventListener("focus", I), window.removeEventListener("storage", I), document.removeEventListener(Ge, I);
    };
  }, []);
  const $ = !yn() && !p.runtimeCredentialConfigured, v = Q(() => e.map((I) => ({
    id: I.id,
    role: I.role,
    content: s[I.id] || I.content || "",
    ...I.role === "assistant" ? { status: Yr(I, a, o) } : {}
  })), [s, o, e, a]), L = Q(() => {
    var S, w;
    const I = {};
    for (const k of e) {
      if (k.role !== "assistant") continue;
      const P = `${((S = k.status) == null ? void 0 : S.reason) || ""}`.trim();
      ((w = k.status) == null ? void 0 : w.type) === "incomplete" && P && P !== "cancelled" && (I[k.id] = P);
    }
    return I;
  }, [e]), y = H(async (I) => {
    const S = I ? Math.max(0, e.findIndex((k) => k.id === I) + 1) : 0, w = e.slice(S).find((k) => k.role === "assistant");
    w && await d(w.id);
  }, [e, d]), b = H(async (I) => {
    const S = Gr(I);
    !S || o || g || p.runtimeRestarting || $ || await c(S);
  }, [p.runtimeRestarting, g, o, $, c]), M = H(async () => {
    await l();
  }, [l]), E = Q(() => ({
    messages: v,
    isRunning: o,
    isDisabled: g || p.runtimeRestarting || $,
    convertMessage: Wr,
    onNew: b,
    onReload: y,
    onCancel: M
  }), [
    p.runtimeRestarting,
    g,
    M,
    b,
    o,
    $,
    y,
    v
  ]), R = on(E);
  return /* @__PURE__ */ i(cn, { runtime: R, children: /* @__PURE__ */ i(
    Er,
    {
      jobId: t,
      messages: e,
      citationsByMessageId: n,
      progressByMessageId: r,
      incompleteByMessageId: L,
      streamingAssistantId: a,
      isRunning: o,
      missingLlmKey: $,
      branchBusy: g,
      agentRequestBlocked: p.runtimeRestarting,
      assistantMode: u,
      onAssistantModeChange: A,
      selectionContext: T,
      onClearSelectionContext: C,
      agentOperationPanel: p.entries.length > 0 || p.runtimeRestarting ? /* @__PURE__ */ i(
        qr,
        {
          entries: p.entries,
          confirmationMode: p.confirmationMode,
          runtimeRestarting: p.runtimeRestarting,
          loadCandidate: p.loadCandidate,
          onAction: p.perform
        }
      ) : null,
      onJumpCitation: m,
      onBranchFromAnswer: f
    }
  ) });
}
function $e(t = 900, e = 0) {
  pe(t, { overlayDelayMs: e }), le(t);
}
function Xr({
  sessions: t,
  activeId: e,
  busy: n = !1,
  disabled: r = !1,
  errorText: s = "",
  onSwitch: a,
  onNew: o,
  onDelete: c,
  onRename: d
}) {
  const l = t.length > 0, m = n || r, [f, g] = W(!1), [p, u] = W(""), [A, T] = W(""), C = j(null), N = Ae();
  function $(w) {
    const k = `${w || ""}`.match(/^fork-(\d+)-(.*)$/i);
    if (!k) return w;
    const P = k[2].trim();
    return P ? `${P} · 分支${k[1]}` : `分支${k[1]}`;
  }
  const v = j(!1), L = j(null), y = t.find((w) => w.id === e) || null, b = y ? y.messageCount ? $(y.title) : `${$(y.title)}（空）` : l ? "选择以往对话" : "新对话";
  q(() => {
    if (!f) {
      u("");
      return;
    }
    const w = (O) => {
      if (v.current) return;
      const h = C.current;
      h && (O.target instanceof Node && h.contains(O.target) || (g(!1), u("")));
    }, k = (O) => {
      O.key === "Escape" && (g(!1), u(""));
    }, P = window.setTimeout(() => {
      document.addEventListener("pointerdown", w, !0);
    }, 0);
    return document.addEventListener("keydown", k), () => {
      window.clearTimeout(P), document.removeEventListener("pointerdown", w, !0), document.removeEventListener("keydown", k);
    };
  }, [f]), q(() => {
    if (!p) return;
    const w = L.current;
    w && (w.focus(), w.select());
  }, [p]);
  const M = (w) => {
    const k = `${w || ""}`.trim();
    !k || m || v.current || p || (v.current = !0, $e(1e3, 0), requestAnimationFrame(() => {
      g(!1), window.setTimeout(() => {
        (async () => {
          try {
            await a(k);
          } finally {
            $e(400, 0), v.current = !1;
          }
        })();
      }, 40);
    }));
  }, E = (w) => {
    m || (u(w.id), T(w.title || ""));
  }, R = () => {
    const w = p, k = A;
    u(""), w && d(w, k);
  }, I = () => {
    u(""), T("");
  }, S = (w) => {
    var O;
    if (m || v.current) return;
    const k = w.title || "未命名对话";
    (O = globalThis.confirm) != null && O.call(globalThis, `确定删除对话「${k}」？此操作不可恢复。`) && (v.current = !0, $e(800, 0), (async () => {
      try {
        await c(w.id);
      } finally {
        v.current = !1;
      }
    })());
  };
  return /* @__PURE__ */ x(
    "div",
    {
      className: "aui-session-bar",
      "data-reader-ai-sessions": "",
      ref: C,
      onPointerDown: (w) => {
        w.stopPropagation();
      },
      onClick: (w) => {
        w.stopPropagation();
      },
      children: [
        /* @__PURE__ */ x("div", { className: "aui-session-row", children: [
          /* @__PURE__ */ x(
            "button",
            {
              type: "button",
              className: `aui-session-trigger${f ? " is-open" : ""}`,
              "aria-label": "切换对话窗口",
              "aria-haspopup": "listbox",
              "aria-expanded": f,
              "aria-controls": N,
              disabled: m || !l,
              title: b,
              onClick: () => {
                m || !l || g((w) => !w);
              },
              children: [
                /* @__PURE__ */ i("span", { className: "aui-session-trigger-label", children: b }),
                /* @__PURE__ */ i(lt, { size: 14, strokeWidth: 2.4, "aria-hidden": !0 })
              ]
            }
          ),
          /* @__PURE__ */ x(
            "button",
            {
              type: "button",
              className: "aui-session-btn",
              disabled: m,
              title: "新对话窗口",
              "aria-label": "新对话",
              onClick: () => {
                m || v.current || (v.current = !0, $e(800), g(!1), u(""), window.setTimeout(() => {
                  (async () => {
                    try {
                      await o();
                    } finally {
                      v.current = !1;
                    }
                  })();
                }, 40));
              },
              children: [
                n ? /* @__PURE__ */ i(xe, { className: "aui-spin", size: 14, strokeWidth: 2.4, "aria-hidden": !0 }) : /* @__PURE__ */ i(Jt, { size: 14, strokeWidth: 2.4, "aria-hidden": !0 }),
                /* @__PURE__ */ i("span", { children: "新对话" })
              ]
            }
          )
        ] }),
        f && l ? /* @__PURE__ */ i(
          "ul",
          {
            id: N,
            className: "aui-session-list",
            role: "listbox",
            "aria-label": "以往对话",
            children: t.map((w) => {
              const k = w.messageCount ? $(w.title) : `${$(w.title)}（空）`, P = w.id === e, O = p === w.id;
              return /* @__PURE__ */ i("li", { className: "aui-session-row-item", role: "presentation", children: O ? /* @__PURE__ */ x("div", { className: "aui-session-edit", children: [
                /* @__PURE__ */ i(
                  "input",
                  {
                    ref: L,
                    className: "aui-session-edit-input",
                    value: A,
                    maxLength: 80,
                    "aria-label": "对话标题",
                    disabled: m,
                    onChange: (h) => T(h.target.value),
                    onKeyDown: (h) => {
                      h.key === "Enter" ? (h.preventDefault(), R()) : h.key === "Escape" && (h.preventDefault(), I());
                    },
                    onClick: (h) => h.stopPropagation()
                  }
                ),
                /* @__PURE__ */ i(
                  "button",
                  {
                    type: "button",
                    className: "aui-session-icon-btn",
                    "aria-label": "保存标题",
                    title: "保存",
                    disabled: m || !A.trim(),
                    onClick: (h) => {
                      h.stopPropagation(), R();
                    },
                    children: /* @__PURE__ */ i(ut, { size: 13, strokeWidth: 2.5, "aria-hidden": !0 })
                  }
                ),
                /* @__PURE__ */ i(
                  "button",
                  {
                    type: "button",
                    className: "aui-session-icon-btn",
                    "aria-label": "取消重命名",
                    title: "取消",
                    disabled: m,
                    onClick: (h) => {
                      h.stopPropagation(), I();
                    },
                    children: /* @__PURE__ */ i(_e, { size: 13, strokeWidth: 2.5, "aria-hidden": !0 })
                  }
                )
              ] }) : /* @__PURE__ */ x(ue, { children: [
                /* @__PURE__ */ x(
                  "button",
                  {
                    type: "button",
                    role: "option",
                    "aria-selected": P,
                    className: `aui-session-item${P ? " is-active" : ""}`,
                    disabled: m,
                    title: k,
                    onPointerDown: (h) => {
                      h.stopPropagation(), !P && !m && le(1e3);
                    },
                    onClick: (h) => {
                      if (h.preventDefault(), h.stopPropagation(), P) {
                        g(!1);
                        return;
                      }
                      M(w.id);
                    },
                    children: [
                      /* @__PURE__ */ i("span", { className: "aui-session-item-title", children: k }),
                      P ? /* @__PURE__ */ i("span", { className: "aui-session-item-badge", children: "当前" }) : null
                    ]
                  }
                ),
                /* @__PURE__ */ i(
                  "button",
                  {
                    type: "button",
                    className: "aui-session-icon-btn",
                    "aria-label": `重命名 ${k}`,
                    title: "重命名",
                    disabled: m,
                    onClick: (h) => {
                      h.preventDefault(), h.stopPropagation(), E(w);
                    },
                    children: /* @__PURE__ */ i(Zt, { size: 13, strokeWidth: 2.4, "aria-hidden": !0 })
                  }
                ),
                /* @__PURE__ */ i(
                  "button",
                  {
                    type: "button",
                    className: "aui-session-icon-btn is-danger",
                    "aria-label": `删除 ${k}`,
                    title: "删除",
                    disabled: m,
                    onClick: (h) => {
                      h.preventDefault(), h.stopPropagation(), S(w);
                    },
                    children: /* @__PURE__ */ i(en, { size: 13, strokeWidth: 2.4, "aria-hidden": !0 })
                  }
                )
              ] }) }, w.id);
            })
          }
        ) : null,
        s ? /* @__PURE__ */ i("div", { className: "aui-session-error", role: "alert", children: s }) : null
      ]
    }
  );
}
function _t(t) {
  return ((t == null ? void 0 : t.parts) || []).filter((e) => e.type === "text").map((e) => e.text).join("").trim();
}
function Qr(t, e) {
  const n = `${e.question || ""}`.trim();
  if (n) return n;
  for (let r = t.length - 1; r >= 0; r -= 1) {
    const s = t[r];
    if (s.role !== "user") continue;
    const a = _t(s);
    if (a) return a;
  }
  return "";
}
function Jr(t) {
  const e = Number(t == null ? void 0 : t.status) || 0, n = `${(t == null ? void 0 : t.message) || ""}`;
  return e === 502 || /\b502\b/.test(n);
}
class Zr {
  constructor(e) {
    this.options = e;
  }
  async sendMessages({
    abortSignal: e,
    body: n,
    messages: r,
    trigger: s
  }) {
    var T, C, N, $;
    const a = n || {}, o = Qr(r, a);
    if (!o) throw new Error("请输入问题。");
    const c = a.assistantMode || ((C = (T = this.options).getAssistantMode) == null ? void 0 : C.call(T)) || "reading", d = a.scope || "document", l = a.context ? { ...a.context } : null, m = `${a.assistantMessageId || ""}`.trim() || `a-${Date.now().toString(36)}`, f = `${m}-text`, g = this.options.getRemoteAnswerer(), p = (($ = (N = this.options).getLocalAnswerer) == null ? void 0 : $.call(N)) || null;
    if (!g && !p)
      throw new Error("问答暂不可用：请确认已打开任务阅读器。");
    let u = !1;
    const A = /* @__PURE__ */ new Set();
    return new ReadableStream({
      cancel: () => {
        u = !0;
      },
      start: (v) => {
        let L = "", y = {
          citations: [],
          progress: s === "regenerate-message" ? "正在重新生成…" : "正在检索文档…",
          status: "running"
        };
        const b = (E) => {
          if (!u)
            try {
              v.enqueue(E);
            } catch {
              u = !0;
            }
        }, M = (E) => {
          y = { ...y, ...E }, b({ type: "message-metadata", messageMetadata: y });
        };
        b({ type: "start", messageId: m, messageMetadata: y }), b({ type: "start-step" }), b({ type: "text-start", id: f }), (async () => {
          var E, R, I, S, w, k;
          try {
            if (await ((E = g == null ? void 0 : g.ensureLoaded) == null ? void 0 : E.call(g, this.options.jobId)), e != null && e.aborted) throw new Error("aborted");
            let P = g || p, O = !1, h;
            try {
              h = await P.answer({
                question: o,
                assistantMode: c,
                scope: d,
                context: l,
                parentId: `${a.parentId || ""}`.trim(),
                regenerate: a.regenerate ?? s === "regenerate-message",
                userMessageId: `${a.userMessageId || ""}`.trim(),
                assistantMessageId: m,
                onAgentSessionEvent: (_) => {
                  var Z, ne, se;
                  const F = (Z = _ == null ? void 0 : _.capabilities) == null ? void 0 : Z.document_operation_confirmation_mode;
                  (F === "explicit" || F === "green_light") && ((se = (ne = this.options).onConfirmationMode) == null || se.call(ne, F));
                },
                onAgentOperationEvent: (_) => {
                  var Z, ne;
                  const F = `${(_ == null ? void 0 : _.operation_id) || ""}`.trim();
                  F && ((ne = (Z = this.options).onAgentOperationSignal) == null || ne.call(Z, {
                    operationId: F,
                    conversationId: `${(_ == null ? void 0 : _.conversation_id) || ""}`.trim() || void 0
                  }));
                },
                onAgentConfirmationRequiredEvent: (_) => {
                  var oe, ee;
                  const F = `${(_ == null ? void 0 : _.operation_id) || ""}`.trim();
                  if (!F) return;
                  const Z = `${(_ == null ? void 0 : _.action) || ""}`, ne = `${(_ == null ? void 0 : _.current_attempt) ?? ""}`, se = `${F}:${ne}:${Z}`;
                  A.has(se) || (A.add(se), (ee = (oe = this.options).onAgentOperationSignal) == null || ee.call(oe, { operationId: F }));
                },
                onToolEvent: (_) => {
                  if (L || e != null && e.aborted) return;
                  const F = xn(_);
                  F && M({ progress: F });
                },
                onProgressEvent: (_) => {
                  if (L || e != null && e.aborted) return;
                  const F = `${(_ == null ? void 0 : _.message) || ""}`.trim();
                  F && M({ progress: F });
                },
                onAnswerDelta: (_, F) => {
                  !F || e != null && e.aborted || (L += F, y.progress && M({ progress: "" }), b({ type: "text-delta", id: f, delta: F }));
                },
                onCompress: (_) => {
                  if (L || e != null && e.aborted) return;
                  const F = Number(_ == null ? void 0 : _.dropped_turns) || 0;
                  F && M({ progress: `已压缩 ${F} 轮早期对话` });
                },
                signal: e
              });
            } catch (_) {
              if (e != null && e.aborted || c === "operations" || !g || !p || !Jr(_)) throw _;
              if (O = !0, M({ progress: "在线服务暂不可用，改用本地检索…" }), await ((R = p.ensureLoaded) == null ? void 0 : R.call(p, this.options.jobId)), e != null && e.aborted) throw new Error("aborted");
              P = p, h = await P.answer({
                question: o,
                assistantMode: c,
                scope: d,
                context: l,
                signal: e
              });
            }
            if (e != null && e.aborted) {
              M({ progress: "", status: "cancelled", statusText: "已取消" }), b({ type: "abort", reason: "cancelled" });
              return;
            }
            const z = h == null ? void 0 : h.confirmationMode;
            (z === "explicit" || z === "green_light") && ((S = (I = this.options).onConfirmationMode) == null || S.call(I, z));
            const G = `${(h == null ? void 0 : h.conversationId) || ""}`.trim() || void 0, D = /* @__PURE__ */ new Set();
            for (const _ of (h == null ? void 0 : h.operationRefs) || []) {
              const F = typeof _ == "string" ? _ : `${(_ == null ? void 0 : _.operation_id) || ""}`;
              F.trim() && D.add(F.trim());
            }
            for (const _ of (h == null ? void 0 : h.confirmationRequests) || []) {
              const F = `${(_ == null ? void 0 : _.operation_id) || ""}`.trim();
              F && D.add(F);
            }
            for (const _ of D)
              (k = (w = this.options).onAgentOperationSignal) == null || k.call(w, {
                operationId: _,
                conversationId: G,
                confirmationMode: z || void 0
              });
            const B = bn(h == null ? void 0 : h.citations);
            let Y = Cn(
              `${(h == null ? void 0 : h.answer) || L || ""}`.trim() || "没有找到可用回答。",
              B
            );
            if (O && (Y += `

_在线服务暂不可用，以上来自本地文档检索。_`), (h == null ? void 0 : h.persisted) === !1 && (Y += `

_⚠️ 本轮回答未能写入历史记录（存储暂时不可用），刷新后可能丢失。_`), !L)
              b({ type: "text-delta", id: f, delta: Y });
            else if (Y.startsWith(L)) {
              const _ = Y.slice(L.length);
              _ && b({ type: "text-delta", id: f, delta: _ });
            }
            b({ type: "text-end", id: f }), M({
              citations: B,
              persisted: (h == null ? void 0 : h.persisted) !== !1,
              progress: "",
              status: "complete",
              incompleteReason: `${(h == null ? void 0 : h.incompleteReason) || ""}`.trim()
            }), b({ type: "finish-step" }), b({ type: "finish", finishReason: "stop", messageMetadata: y });
          } catch (P) {
            if (e != null && e.aborted)
              M({ progress: "", status: "cancelled", statusText: "已取消" }), b({ type: "abort", reason: "cancelled" });
            else {
              const O = P instanceof Error && P.message ? P.message : "生成回答失败，请重试。";
              M({ progress: "", status: "error", statusText: O }), b({ type: "error", errorText: O });
            }
          } finally {
            if (!u) {
              u = !0;
              try {
                v.close();
              } catch {
              }
            }
          }
        })();
      }
    });
  }
  async reconnectToStream() {
    return null;
  }
}
function es(t) {
  return _t(t);
}
function xt(t) {
  return t.map((e) => {
    var n, r;
    return {
      id: e.id,
      role: e.role,
      metadata: e.role === "assistant" ? {
        citations: e.citations || [],
        progress: e.progress || "",
        status: ((n = e.status) == null ? void 0 : n.type) === "running" ? "running" : ((r = e.status) == null ? void 0 : r.type) === "incomplete" ? e.status.reason === "cancelled" ? "cancelled" : "error" : "complete"
      } : void 0,
      parts: [{ type: "text", text: e.content || "" }]
    };
  });
}
function ts(t) {
  const e = t.metadata || {}, n = e.status === "running", r = e.status === "cancelled" || e.status === "error", s = es(t), a = s.trim() || (r ? `${e.statusText || ""}`.trim() : "");
  return {
    id: t.id,
    role: t.role,
    content: t.role === "assistant" ? a : s,
    ...t.role === "assistant" ? {
      citations: e.citations || [],
      progress: e.progress || "",
      // 「答完了但没做完」和「中断/出错」是两回事:正文是完整的一段话,只是背后的
      // 工作被轮次预算截断了。所以它走 incomplete + 具体原因,而不是 error。
      status: n ? { type: "running" } : r ? {
        type: "incomplete",
        reason: e.status === "cancelled" ? "cancelled" : "error"
      } : `${e.incompleteReason || ""}`.trim() ? {
        type: "incomplete",
        reason: `${e.incompleteReason}`.trim()
      } : { type: "complete", reason: "stop" }
    } : {}
  };
}
function ns(t) {
  const e = j(t.remoteAnswerer), n = j(t.localAnswerer), r = j(t.onAgentOperationSignal), s = j(t.onConfirmationMode), a = j(t.onStopped);
  a.current = t.onStopped;
  const o = j(t.assistantMode);
  e.current = t.remoteAnswerer, n.current = t.localAnswerer, r.current = t.onAgentOperationSignal, s.current = t.onConfirmationMode, o.current = t.assistantMode;
  const c = Q(() => new An({
    id: `reader-${t.jobId || "idle"}`,
    transport: new Zr({
      jobId: t.jobId,
      getRemoteAnswerer: () => e.current,
      getLocalAnswerer: () => n.current,
      getAssistantMode: () => o.current,
      onAgentOperationSignal: (d) => {
        var l;
        return (l = r.current) == null ? void 0 : l.call(r, d);
      },
      onConfirmationMode: (d) => {
        var l;
        return (l = s.current) == null ? void 0 : l.call(s, d);
      }
    })
  }), [t.jobId]);
  return q(() => {
    t.enabled || c.stop().finally(() => {
      var d;
      return (d = a.current) == null ? void 0 : d.call(a);
    });
  }, [c, t.enabled]), q(() => () => {
    c.stop().finally(() => {
      var d;
      return (d = a.current) == null ? void 0 : d.call(a);
    });
  }, [c]), _n({ chat: c, experimental_throttle: 16 });
}
function rs(t) {
  for (let e = t.length - 1; e >= 0; e -= 1)
    if (t[e].role === "assistant") return t[e];
}
function Be(t, e) {
  return {
    version: 1,
    headId: e,
    items: t.map((n) => {
      var r;
      return {
        parentId: n.parentId,
        message: {
          id: n.message.id,
          role: n.message.role,
          content: n.message.content,
          ...n.message.progress ? { progress: n.message.progress } : {},
          ...(r = n.message.citations) != null && r.length ? { citations: n.message.citations } : {},
          ...n.message.status ? {
            status: {
              type: n.message.status.type,
              ...n.message.status.reason ? { reason: `${n.message.status.reason}` } : {}
            }
          } : {}
        }
      };
    })
  };
}
function St(t) {
  return {
    items: t.items.map((e) => ({
      parentId: e.parentId,
      message: {
        ...e.message,
        citations: e.message.citations || [],
        status: e.message.status
      }
    })),
    headId: t.headId
  };
}
function de(t, e) {
  if (!t.length) return [];
  const n = new Map(t.map((c) => [c.message.id, c])), r = e && n.get(e) || t.at(-1);
  if (!r) return [];
  const s = [];
  let a = r;
  const o = /* @__PURE__ */ new Set();
  for (; a && !o.has(a.message.id); )
    o.add(a.message.id), s.push(a.message), a = a.parentId ? n.get(a.parentId) : void 0;
  return s.reverse();
}
function ss(t, e) {
  var n;
  return e ? ((n = t.find((r) => r.message.id === e)) == null ? void 0 : n.message) ?? null : null;
}
function as(t, e) {
  const n = new Map(t.map((o) => [o.message.id, o]));
  let r = n.get(e);
  if (!r) return [];
  const s = [], a = /* @__PURE__ */ new Set();
  for (; r && !a.has(r.message.id); )
    a.add(r.message.id), s.push(r), r = r.parentId ? n.get(r.parentId) : void 0;
  return s.reverse();
}
function is(t, e, n) {
  var m, f, g, p;
  const r = `${e || ""}`.trim();
  if (!r || !t.length) return [];
  let s = r;
  t.some((u) => u.message.id === s) || (n && t.some((u) => u.message.id === n) ? s = n : s = ((m = [...t].reverse().find((u) => u.message.role === "assistant")) == null ? void 0 : m.message.id) || "");
  let a = as(t, s);
  if (a.length >= 2 && ((f = a.at(-1)) == null ? void 0 : f.message.role) === "assistant") return a;
  a.length === 1 && ((g = a[0]) == null ? void 0 : g.message.role) === "user" && (a = []);
  const o = de(t, n || s);
  let c = o.findIndex((u) => u.id === s);
  if (c < 0 && (c = o.length - 1), c < 0) return a;
  const d = new Map(t.map((u) => [u.message.id, u])), l = o.slice(0, c + 1).map((u) => d.get(u.id)).filter((u) => !!u);
  for (; l.length && ((p = l.at(-1)) == null ? void 0 : p.message.role) !== "assistant"; ) l.pop();
  return l.length ? l : a;
}
function Oe(t) {
  return t.map((e) => ({
    parentId: e.parentId,
    message: {
      ...e.message,
      citations: e.message.citations || [],
      status: e.message.status
    }
  }));
}
const os = {
  stopStream: () => Promise.resolve(),
  clearMessages: () => {
  },
  showMessages: () => {
  }
};
function cs(t) {
  var n;
  const e = {};
  for (const r of t) {
    const s = r.message;
    s.role === "assistant" && ((n = s.citations) != null && n.length) && (e[s.id] = s.citations);
  }
  return e;
}
function ls(t) {
  const e = {};
  for (const n of t) {
    const r = n.message;
    r.role === "assistant" && r.progress && (e[r.id] = r.progress);
  }
  return e;
}
function ds(t) {
  const e = {};
  for (const n of t) {
    const r = n.message;
    r.content && (e[r.id] = r.content);
  }
  return e;
}
function us(t, e, n) {
  var s;
  const r = e || ((s = n == null ? void 0 : n.getConversationId) == null ? void 0 : s.call(n)) || "";
  return (t || []).map((a) => ({
    ...Sn(a, { active: r }),
    active: a.conversation_id === r
  }));
}
function ms(t) {
  const { setItems: e, setHeadId: n } = t;
  return {
    readItems: () => t.itemsRef.current,
    readHeadId: () => t.headIdRef.current,
    appendExchange: ({ parentId: r, userId: s, assistantId: a, question: o, progress: c }) => {
      e((d) => [
        ...d,
        { parentId: r, message: { id: s, role: "user", content: o } },
        {
          parentId: s,
          message: {
            id: a,
            role: "assistant",
            content: "",
            progress: c,
            status: { type: "running" },
            citations: []
          }
        }
      ]), n(a);
    },
    appendRetryTurn: ({ assistantId: r, branchParent: s }) => {
      e((a) => [
        ...a,
        {
          parentId: s,
          message: {
            id: r,
            role: "assistant",
            content: "",
            progress: "正在重新生成…",
            status: { type: "running" },
            citations: []
          }
        }
      ]), n(r);
    },
    markRunningCancelled: () => {
      e(
        (r) => r.map(
          (s) => {
            var a;
            return ((a = s.message.status) == null ? void 0 : a.type) === "running" ? {
              ...s,
              message: {
                ...s.message,
                status: { type: "incomplete", reason: "cancelled" },
                progress: "",
                content: s.message.content.trim() || "已取消"
              }
            } : s;
          }
        )
      );
    },
    markRunningAsError: (r) => {
      const s = `${r || ""}`.trim() || "生成回答失败，请重试。";
      e((a) => a.map((o) => {
        var c;
        return ((c = o.message.status) == null ? void 0 : c.type) === "running" ? {
          ...o,
          message: {
            ...o.message,
            content: o.message.content.trim() || s,
            progress: "",
            citations: [],
            status: { type: "incomplete", reason: "error" }
          }
        } : o;
      }));
    },
    mergeChatMirror: (r) => {
      r.size && e((s) => s.map((a) => {
        const o = r.get(a.message.id);
        return o ? { ...a, message: { ...a.message, ...o } } : a;
      }));
    }
  };
}
function fs(t) {
  const {
    jobId: e,
    documentId: n,
    enabled: r,
    refreshSessions: s,
    applyConversationTree: a,
    remoteRef: o,
    streamRef: c,
    itemsRef: d,
    documentIdRef: l,
    lastJobRef: m,
    persistReadyRef: f,
    switchTokenRef: g,
    sessionListGenerationRef: p,
    activeConversationIdRef: u,
    setItems: A,
    setHeadId: T,
    setSessions: C,
    setActiveConversationId: N,
    setSessionBusy: $
  } = t;
  q(() => {
    const v = o.current;
    if (!e) {
      p.current += 1, g.current += 1, A([]), T(null), C([]), N(""), c.current.clearMessages(), u.current = "", m.current = "", l.current = "", f.current = !1;
      return;
    }
    const L = m.current !== e;
    if (L && (p.current += 1, g.current += 1, m.current = e, f.current = !1, A([]), T(null), c.current.clearMessages(), C([]), N(""), u.current = "", l.current = "", $(!1)), !r || !v) {
      p.current += 1;
      return;
    }
    let y = !1;
    return (async () => {
      var S, w, k, P;
      let b = `${n || l.current || ""}`.trim();
      if (!b) {
        try {
          b = `${await ((S = v.getDocumentId) == null ? void 0 : S.call(v)) || ""}`.trim();
        } catch {
          b = "";
        }
        if (y) return;
      }
      b && (l.current = b);
      let M = null;
      if (!y && b && (M = await s(b)), !(L || !d.current.length) || y) {
        y || (f.current = !0);
        return;
      }
      const R = Tn({ jobId: e, documentId: b }) || `${((w = v.getConversationId) == null ? void 0 : w.call(v)) || ""}`.trim();
      if (R) {
        N(R), u.current = R, (k = v.setConversationId) == null || k.call(v, R, b);
        try {
          const O = await Ye(R);
          if (y) return;
          const h = ke(O.messages || []);
          if (h.length) {
            a(h, O.head_id), requestAnimationFrame(() => {
              y || (f.current = !0);
            });
            return;
          }
        } catch {
        }
      }
      if (!y && b)
        try {
          const O = M ?? await s(b);
          if (y || !O) return;
          const h = O[0];
          if (h != null && h.conversation_id) {
            const z = h.conversation_id;
            N(z), u.current = z, (P = v.setConversationId) == null || P.call(v, z, b);
            try {
              const G = await Ye(z);
              if (y) return;
              a(
                ke(G.messages || []),
                G.head_id
              ), requestAnimationFrame(() => {
                y || (f.current = !0);
              });
              return;
            } catch {
            }
          }
        } catch {
        }
      if (y) return;
      const I = yt({ jobId: e, documentId: b }, R);
      if (I != null && I.items.length) {
        const O = St(I);
        A(O.items), T(O.headId), c.current.showMessages(de(O.items, O.headId));
      } else
        A([]), T(null), c.current.clearMessages();
      requestAnimationFrame(() => {
        y || (f.current = !0);
      });
    })(), () => {
      y = !0, p.current += 1;
    };
  }, [e, n, r, s, a]);
}
function ps(t) {
  const {
    jobId: e,
    documentId: n,
    items: r,
    headId: s,
    activeConversationId: a,
    documentIdRef: o,
    persistReadyRef: c
  } = t;
  q(() => {
    if (!e || !c.current) return;
    const d = a, l = { jobId: e, documentId: n || o.current }, m = window.setTimeout(() => {
      if (!r.length) {
        we(l, d);
        return;
      }
      De(l, Be(r, s), d);
    }, 280);
    return () => window.clearTimeout(m);
  }, [e, n, r, s, a]);
}
function hs(t) {
  const {
    jobId: e,
    documentId: n,
    sessionBusy: r,
    sessions: s,
    streamRef: a,
    remoteRef: o,
    itemsRef: c,
    headIdRef: d,
    activeConversationIdRef: l,
    documentIdRef: m,
    switchTokenRef: f,
    persistReadyRef: g,
    setSessionBusy: p,
    setSessionError: u,
    setActiveConversationId: A,
    setItems: T,
    setHeadId: C,
    setSessions: N,
    refreshSessions: $,
    applyConversationTree: v
  } = t, L = H(() => {
    var I, S;
    const R = `${((S = (I = o.current) == null ? void 0 : I.getConversationId) == null ? void 0 : S.call(I)) || ""}`.trim();
    R && A(R);
  }, []), y = H(async () => {
    var I, S;
    if (r) return;
    await a.current.stopStream(), pe(900), le(900), p(!0), u("");
    const R = ++f.current;
    try {
      if (await new Promise((P) => {
        window.setTimeout(P, 40);
      }), R !== f.current) return;
      const w = o.current, k = m.current || `${await ((I = w == null ? void 0 : w.getDocumentId) == null ? void 0 : I.call(w)) || ""}`.trim();
      if (R !== f.current) return;
      m.current = k, (S = w == null ? void 0 : w.clearConversationId) == null || S.call(w, k), A(""), l.current = "", T([]), C(null), a.current.clearMessages(), we({ jobId: e, documentId: k }), k && await $(k, R);
    } catch (w) {
      console.warn("[reader-ai] new session failed", w), u("无法创建新对话，请重试。");
    } finally {
      R === f.current && p(!1);
    }
  }, [e, $, r]), b = H(async (R) => {
    var P, O, h, z, G;
    const I = `${R || ""}`.trim();
    if (!I)
      return u("无法分支：消息 id 无效。"), !1;
    if (r)
      return u("请稍候，当前有会话操作进行中。"), !1;
    await a.current.stopStream();
    const S = is(c.current, I, d.current);
    if (!S.length)
      return u("无法分支：找不到到此答案的对话路径。"), !1;
    if (S[S.length - 1].message.role !== "assistant")
      return u("只能从助手答案处开新对话。"), !1;
    p(!0), u("");
    const k = ++f.current;
    try {
      if (await new Promise((K) => {
        window.setTimeout(K, 40);
      }), k !== f.current) return !1;
      const D = o.current;
      let B = m.current || `${await ((P = D == null ? void 0 : D.getDocumentId) == null ? void 0 : P.call(D)) || ""}`.trim();
      if (k !== f.current) return !1;
      if (m.current = B, !B)
        try {
          if (B = `${await ((O = D == null ? void 0 : D.getDocumentId) == null ? void 0 : O.call(D)) || ""}`.trim(), k !== f.current) return !1;
          m.current = B;
        } catch {
          B = "";
        }
      if (!B)
        return u("无法分支：文档未就绪，请稍后重试。"), !1;
      const Y = S.map((K, ce) => ({
        id: K.message.id,
        role: K.message.role,
        content: K.message.content,
        citations: K.message.citations,
        parentId: ce === 0 ? null : S[ce - 1].message.id
      })), _ = l.current || ((h = D == null ? void 0 : D.getConversationId) == null ? void 0 : h.call(D)) || "", F = (s || []).find((K) => K.conversation_id === _), Z = Y.find((K) => K.role === "user"), ne = `${(F == null ? void 0 : F.title) || ""}`.trim() || `${(Z == null ? void 0 : Z.content) || ""}`.replace(/\s+/g, " ").trim() || "未命名对话", se = (s || []).map((K) => K.title || ""), oe = En(ne, se), ee = await ye().forkFromPath({
        documentId: B,
        title: oe,
        path: Y
      });
      if (k !== f.current) return !1;
      const U = Oe(ee.items), J = ((z = U[U.length - 1]) == null ? void 0 : z.message.id) || null, V = ee.conversation.conversation_id;
      if (!V || !U.length)
        throw new Error("fork returned empty conversation");
      return pe(600), le(600), T(U), C(J), a.current.showMessages(de(U, J)), A(V), l.current = V, (G = D == null ? void 0 : D.setConversationId) == null || G.call(D, V, B), N((K) => {
        const ce = {
          conversation_id: V,
          title: oe,
          document_id: B,
          created_at: ee.conversation.created_at || (/* @__PURE__ */ new Date()).toISOString(),
          updated_at: ee.conversation.updated_at || (/* @__PURE__ */ new Date()).toISOString(),
          message_count: U.length,
          head_id: J || ""
        }, me = K.filter((ge) => ge.conversation_id !== V);
        return [ce, ...me];
      }), De(
        { jobId: e, documentId: B },
        Be(U, J),
        V
      ), await $(B, k), !0;
    } catch (D) {
      return console.warn("[reader-ai] branch from answer failed", D), k === f.current && u("分支失败：未能复制上文到新对话。请检查网络后重试。"), !1;
    } finally {
      k === f.current && p(!1);
    }
  }, [e, $, r, s]), M = H(async (R) => {
    var w, k, P, O;
    const I = `${R || ""}`.trim();
    if (!I || r) return;
    await a.current.stopStream(), p(!0), u("");
    const S = ++f.current;
    try {
      const h = o.current, z = m.current || `${await ((w = h == null ? void 0 : h.getDocumentId) == null ? void 0 : w.call(h)) || ""}`.trim();
      if (S !== f.current) return;
      m.current = z;
      try {
        await ye().delete(I);
      } catch (B) {
        if ((Number(B == null ? void 0 : B.status) || 0) !== 404) throw B;
      }
      we({ jobId: e, documentId: z }, I);
      const D = (l.current || ((k = h == null ? void 0 : h.getConversationId) == null ? void 0 : k.call(h)) || "") === I;
      if (N((B) => B.filter((Y) => Y.conversation_id !== I)), D) {
        (P = h == null ? void 0 : h.clearConversationId) == null || P.call(h, z), A(""), l.current = "", T([]), C(null), a.current.clearMessages(), we({ jobId: e, documentId: z });
        const B = z ? await $(z, S) : [];
        if (S !== f.current || !B) return;
        const Y = B[0];
        if (Y != null && Y.conversation_id) {
          const _ = Y.conversation_id;
          A(_), l.current = _;
          try {
            const F = await ye().get(_);
            if (S !== f.current) return;
            v(
              ke(F.messages || []),
              F.head_id
            ), (O = h == null ? void 0 : h.setConversationId) == null || O.call(h, _, z);
          } catch {
            T([]), C(null);
          }
        }
      } else z && await $(z, S);
    } catch (h) {
      console.warn("[reader-ai] delete session failed", h), u("删除对话失败，请重试。");
    } finally {
      S === f.current && p(!1);
    }
  }, [v, e, $, r]), E = H(async (R, I) => {
    const S = `${R || ""}`.trim(), w = `${I || ""}`.replace(/\s+/g, " ").trim();
    if (!S || !w || r) return;
    p(!0), u("");
    const k = ++f.current;
    try {
      const P = w.slice(0, 80);
      if (await ye().patch(S, { title: P }), k !== f.current) return;
      N(
        (h) => h.map(
          (z) => z.conversation_id === S ? { ...z, title: P } : z
        )
      );
      const O = m.current;
      O && await $(O, k);
    } catch (P) {
      console.warn("[reader-ai] rename session failed", P), u("重命名失败，请重试。");
    } finally {
      k === f.current && p(!1);
    }
  }, [$, r]);
  return {
    adoptRemoteConversationId: L,
    newSession: y,
    branchFromAnswer: b,
    removeSession: M,
    renameSession: E
  };
}
function gs(t) {
  var oe;
  const {
    jobId: e,
    documentId: n = "",
    enabled: r,
    remoteAnswerer: s = null,
    stream: a = os
  } = t, [o, c] = W([]), [d, l] = W(null), [m, f] = W([]), [g, p] = W(""), [u, A] = W(!1), [T, C] = W(""), N = j(o), $ = j(d), v = j(g), L = j(!1), y = j(""), b = j(""), M = j(0), E = j(0), R = j(a);
  R.current = a;
  const I = j(s);
  I.current = s, N.current = o, $.current = d, v.current = g;
  const S = H(async (ee = "", U) => {
    const J = `${ee || b.current || ""}`.trim(), V = ++E.current;
    if (!J)
      return V === E.current && (U === void 0 || U === M.current) && f([]), [];
    try {
      const K = ye();
      if (!K) return null;
      const me = (await K.list({ document_id: J, limit: 50 })).conversations || [];
      return V === E.current && J === `${b.current || ""}`.trim() && (U === void 0 || U === M.current) ? (f(me), me) : null;
    } catch {
      return null;
    }
  }, []), w = H((ee, U) => {
    var K;
    const J = Oe(ee), V = `${U || ""}`.trim() || ((K = J[J.length - 1]) == null ? void 0 : K.message.id) || null;
    c(J), l(V), R.current.showMessages(de(J, V));
  }, []), k = H(() => `${n || b.current || e}`.trim(), [n, e]);
  fs({
    jobId: e,
    documentId: n,
    enabled: r,
    refreshSessions: S,
    applyConversationTree: w,
    remoteRef: I,
    streamRef: R,
    itemsRef: N,
    documentIdRef: b,
    lastJobRef: y,
    persistReadyRef: L,
    switchTokenRef: M,
    sessionListGenerationRef: E,
    activeConversationIdRef: v,
    setItems: c,
    setHeadId: l,
    setSessions: f,
    setActiveConversationId: p,
    setSessionBusy: A
  }), ps({
    jobId: e,
    documentId: n,
    items: o,
    headId: d,
    activeConversationId: g,
    documentIdRef: b,
    persistReadyRef: L
  });
  const P = Q(
    () => de(o, d),
    [o, d]
  ), O = Q(
    () => cs(o),
    [o]
  ), h = Q(
    () => ls(o),
    [o]
  ), z = Q(
    () => ds(o),
    [o]
  ), G = Q(() => ms({ setItems: c, setHeadId: l, itemsRef: N, headIdRef: $ }), []), {
    adoptRemoteConversationId: D,
    newSession: B,
    branchFromAnswer: Y,
    removeSession: _,
    renameSession: F
  } = hs({
    jobId: e,
    documentId: n,
    sessionBusy: u,
    sessions: m,
    streamRef: R,
    remoteRef: I,
    itemsRef: N,
    headIdRef: $,
    activeConversationIdRef: v,
    documentIdRef: b,
    switchTokenRef: M,
    persistReadyRef: L,
    setSessionBusy: A,
    setSessionError: C,
    setActiveConversationId: p,
    setItems: c,
    setHeadId: l,
    setSessions: f,
    refreshSessions: S,
    applyConversationTree: w
  }), Z = H(async (ee) => {
    var K, ce, me, ge, qe, We, He, Ke;
    const U = `${ee || ""}`.trim(), J = v.current || ((ce = (K = I.current) == null ? void 0 : K.getConversationId) == null ? void 0 : ce.call(K)) || "";
    if (!U || U === J || u) return;
    await R.current.stopStream(), pe(1200), le(1200), A(!0), C("");
    const V = ++M.current;
    L.current = !1, p(U), v.current = U, c([]), l(null), R.current.clearMessages();
    try {
      if (await new Promise((Ne) => {
        window.setTimeout(Ne, 80);
      }), V !== M.current) return;
      try {
        (qe = (ge = (me = globalThis.document) == null ? void 0 : me.activeElement) == null ? void 0 : ge.blur) == null || qe.call(ge);
      } catch {
      }
      const te = I.current, re = b.current || `${await ((We = te == null ? void 0 : te.getDocumentId) == null ? void 0 : We.call(te)) || ""}`.trim();
      if (V !== M.current) return;
      b.current = re;
      const fe = ye();
      if (!fe) throw new Error("Reader conversations unavailable");
      const Se = await fe.get(U);
      if (V !== M.current) return;
      pe(800), le(800);
      const Te = ke(Se.messages || []);
      if (w(Te, Se.head_id), (He = te == null ? void 0 : te.setConversationId) == null || He.call(te, U, re), L.current = !0, Te.length) {
        const Ne = Oe(Te);
        De(
          { jobId: e, documentId: re },
          Be(
            Ne,
            `${Se.head_id || ""}`.trim() || ((Ke = Ne.at(-1)) == null ? void 0 : Ke.message.id) || null
          ),
          U
        );
      } else
        we({ jobId: e, documentId: re }, U);
      re && await S(re, V), pe(350), le(350);
    } catch (te) {
      if (console.warn("[reader-ai] switch session failed", te), V === M.current) {
        C("加载该对话失败，请检查网络后重试。");
        const re = yt(
          { jobId: e, documentId: n || b.current },
          U
        );
        if (re != null && re.items.length) {
          const fe = St(re);
          c(fe.items), l(fe.headId), R.current.showMessages(de(fe.items, fe.headId));
        } else
          c([]), l(null);
        L.current = !0;
      }
    } finally {
      V === M.current && A(!1);
    }
  }, [
    w,
    e,
    n,
    S,
    u
  ]), ne = Q(
    () => us(m, g, s),
    [m, g, s]
  ), se = Q(() => ({
    refreshSessions: S,
    adoptRemoteConversationId: D,
    newSession: B,
    switchSession: Z,
    removeSession: _,
    renameSession: F,
    branchFromAnswer: Y
  }), [
    S,
    D,
    B,
    Z,
    _,
    F,
    Y
  ]);
  return {
    items: o,
    headId: d,
    messages: P,
    citationsByMessageId: O,
    progressByMessageId: h,
    contentByMessageId: z,
    sessions: ne,
    activeConversationId: g || ((oe = s == null ? void 0 : s.getConversationId) == null ? void 0 : oe.call(s)) || "",
    sessionBusy: u,
    sessionError: T,
    resolveRequestScopeKey: k,
    tree: G,
    sessionCommands: se
  };
}
const ys = "retainpdf.reader.ai.request.v1:", bs = Object.freeze({
  assistantMode: "reading",
  scope: "document",
  context: null
});
function Tt(t, e) {
  return `${ys}${`${t || ""}`.trim()}:${`${e || ""}`.trim()}`;
}
function ws(t) {
  if (!t || typeof t != "object" || Array.isArray(t)) return null;
  const e = t, n = e.assistantMode === "operations" ? "operations" : e.assistantMode === "reading" ? "reading" : null, r = e.scope === "selection" || e.scope === "page" || e.scope === "document" ? e.scope : null;
  if (!n || !r) return null;
  const s = e.context && typeof e.context == "object" && !Array.isArray(e.context) ? { ...e.context } : null;
  return { assistantMode: n, scope: r, context: s };
}
function tt(t, e, n) {
  var a;
  const r = `${t || ""}`.trim(), s = `${e || ""}`.trim();
  if (!(!r || !s))
    try {
      (a = globalThis.localStorage) == null || a.setItem(
        Tt(r, s),
        JSON.stringify(n)
      );
    } catch {
    }
}
function nt(t, e) {
  var s;
  const n = `${t || ""}`.trim(), r = `${e || ""}`.trim();
  if (!n || !r) return null;
  try {
    const a = (s = globalThis.localStorage) == null ? void 0 : s.getItem(Tt(n, r));
    return a ? ws(JSON.parse(a)) : null;
  } catch {
    return null;
  }
}
function vs(t) {
  const e = `${t.scopeKey || ""}`.trim(), n = `${t.jobId || ""}`.trim(), r = `${t.assistantMessageId || ""}`.trim();
  return nt(e, r) || (e !== n ? nt(n, r) : null) || bs;
}
function Is(t) {
  const { assistantMode: e, selectionContext: n } = t;
  return e === "operations" ? { assistantMode: e, scope: "document", context: null } : n ? { assistantMode: e, scope: "selection", context: { ...n } } : { assistantMode: e, scope: "document", context: null };
}
function Rs(t) {
  var L;
  const { jobId: e, assistantMode: n, selectionContext: r = null, tree: s, chat: a, getScopeKey: o } = t, c = j(s);
  c.current = s;
  const d = j(a);
  d.current = a;
  const l = j(n);
  l.current = n;
  const m = j(r);
  m.current = r;
  const f = j(o);
  f.current = o;
  const g = a.status, p = g === "submitted" || g === "streaming", u = j(p);
  u.current = p;
  const A = p ? `${((L = rs(a.messages)) == null ? void 0 : L.id) || ""}` : "", T = a.messages, C = a.error;
  q(() => {
    if (!T.length) return;
    const y = new Map(T.map((M) => [M.id, M])), b = /* @__PURE__ */ new Map();
    for (const [M, E] of y)
      b.set(M, ts(E));
    c.current.mergeChatMirror(b);
  }, [T]), q(() => {
    !C || g !== "error" || c.current.markRunningAsError(C.message);
  }, [C, g]);
  const N = H(async (y) => {
    if (u.current) return;
    const b = `${y || ""}`.trim();
    if (!b) return;
    const M = c.current, E = d.current, R = l.current, I = m.current, S = f.current(), w = M.readHeadId(), k = Pe("u"), P = Pe("a"), O = Is({
      assistantMode: R,
      selectionContext: (I == null ? void 0 : I.selectionType) === "text" ? {
        page: I.page,
        page_idx: Math.max(0, I.page - 1),
        pane: I.pane,
        kind: "text",
        block_id: "",
        quoteText: I.quote
      } : I ? {
        page: I.page,
        page_idx: Math.max(0, I.page - 1),
        pane: I.pane,
        kind: I.kind,
        block_id: I.selectionType === "region" ? I.region.itemId : "",
        quoteText: gt(I.region, I.pane)
      } : null
    });
    tt(S, P, O), M.appendExchange({
      parentId: w,
      userId: k,
      assistantId: P,
      question: b,
      progress: O.assistantMode === "operations" ? "正在规划 PDF 操作…" : "正在理解文档…"
    }), await E.sendUserMessage(
      { id: k, role: "user", parts: [{ type: "text", text: b }] },
      {
        body: {
          assistantMessageId: P,
          assistantMode: O.assistantMode,
          parentId: w,
          question: b,
          regenerate: !1,
          userMessageId: k,
          scope: O.scope,
          context: O.context
        }
      }
    );
  }, []), $ = H(async (y) => {
    if (u.current) return;
    const b = c.current, M = d.current, E = b.readItems(), R = E.find(
      (G) => G.message.id === y && G.message.role === "assistant"
    ), I = (R == null ? void 0 : R.parentId) ?? null, S = I ? ss(E, I) : null;
    let w = "", k = I;
    if ((S == null ? void 0 : S.role) === "user")
      w = S.content.trim();
    else {
      const G = de(E, I ?? b.readHeadId());
      for (let D = G.length - 1; D >= 0; D -= 1)
        if (G[D].role === "user") {
          w = G[D].content.trim(), k = G[D].id;
          break;
        }
    }
    if (!w) return;
    const P = Pe("a"), O = k || I, h = f.current(), z = vs({
      scopeKey: h,
      jobId: e,
      assistantMessageId: y
    });
    tt(h, P, z), b.appendRetryTurn({ assistantId: P, branchParent: O }), M.replaceVisible(xt(de(E, y))), await M.regenerateFrom({
      messageId: y,
      body: {
        assistantMessageId: P,
        assistantMode: z.assistantMode,
        parentId: O,
        question: w,
        regenerate: !0,
        userMessageId: k || "",
        scope: z.scope,
        context: z.context
      }
    });
  }, [e]), v = H(async () => {
    await d.current.stopStream(), c.current.markRunningCancelled();
  }, []);
  return {
    isRunning: p,
    streamingAssistantId: A,
    submitQuestion: N,
    retryAnswer: $,
    cancelAnswer: v
  };
}
const Ns = "retainpdf.reader-agent-operation.action-key.v1:", Ms = "reader-";
function rt(t, e) {
  return On(t, e);
}
function $s(t) {
  return Ln(t);
}
function Cs(t, e) {
  return Pn(t, e);
}
function ks(t) {
  return Dn(t);
}
function As(t) {
  return Fn(t);
}
function _s({
  conversationId: t,
  enabled: e,
  discovering: n,
  signal: r,
  confirmationModeHint: s,
  onDocumentCommitted: a
}) {
  const [o, c] = W({}), [d, l] = W("explicit"), [m, f] = W(!1), [g, p] = W(!1), u = j(/* @__PURE__ */ new Set()), A = j(/* @__PURE__ */ new Set()), T = j(/* @__PURE__ */ new Set()), C = H((y, b = !1) => {
    y != null && y.operation_id && c((M) => {
      const E = M[y.operation_id];
      return Cs(E == null ? void 0 : E.operation, y) ? {
        ...M,
        [y.operation_id]: {
          ...E,
          operation: y,
          pendingAction: void 0,
          error: void 0
        }
      } : !b || !(E != null && E.pendingAction) ? M : {
        ...M,
        [y.operation_id]: { ...E, pendingAction: void 0 }
      };
    });
  }, []), N = H(async (y, b = !1) => {
    const M = `${y || ""}`.trim(), E = `refresh:${M}`;
    if (!(!M || u.current.has(E))) {
      u.current.add(E);
      try {
        const R = be();
        if (!R) return;
        C(await R.get(M), b);
      } catch {
      } finally {
        u.current.delete(E);
      }
    }
  }, [C]), $ = H(async () => {
    const y = `${t || ""}`.trim(), b = `recover:${y}`;
    if (!(!e || !y || u.current.has(b))) {
      u.current.add(b);
      try {
        const M = be();
        if (!M) return;
        const E = await M.list(y, {});
        if (!T.current.has(y)) {
          for (const R of E.operations || [])
            R.status === "committed" && A.current.add(R.operation_id);
          T.current.add(y);
        }
        for (const R of E.operations || []) C(R);
      } catch {
      } finally {
        u.current.delete(b);
      }
    }
  }, [t, e, C]);
  q(() => {
    if (!e) return;
    let y = !1;
    const b = async () => {
      try {
        const E = be();
        if (!E) return;
        const R = await E.fetchRuntimeConfig();
        if (y) return;
        l(R.agent_confirmation_mode || "explicit"), p(!!R.llm_api_key_configured), f(
          R.restart_required || R.restart_state === "pending" || R.active_revision !== R.configured_revision
        );
      } catch {
        y || (f(!1), p(!1));
      }
    };
    b();
    const M = window.setInterval(b, 3e3);
    return () => {
      y = !0, window.clearInterval(M);
    };
  }, [e]), q(() => {
    s && l(s);
  }, [s]), q(() => {
    r != null && r.confirmationMode && l(r.confirmationMode), r != null && r.operationId && N(r.operationId);
  }, [N, r]), q(() => {
    $();
  }, [$]), q(() => {
    n || $();
  }, [n, $]);
  const v = Q(
    () => Object.values(o).filter((y) => !!t && y.operation.conversation_id === t).sort((y, b) => `${y.operation.created_at || ""}`.localeCompare(`${b.operation.created_at || ""}`)),
    [t, o]
  );
  q(() => {
    var y;
    for (const b of v) {
      const M = b.operation;
      M.status !== "committed" || A.current.has(M.operation_id) || (A.current.add(M.operation_id), a == null || a({
        documentId: M.document_id,
        revision: ((y = M.candidate) == null ? void 0 : y.version_id) || `${M.updated_at || ""}` || `${M.operation_id}:${$s(M)}`
      }));
    }
  }, [v, a]);
  const L = v.some((y) => rt(y.operation.status, d));
  return q(() => {
    if (!e || !t || !n && !L) return;
    const y = window.setInterval(() => {
      $();
      for (const b of v)
        rt(b.operation.status, d) && N(b.operation.operation_id);
    }, 1400);
    return () => window.clearInterval(y);
  }, [d, t, n, e, v, L, $, N]), q(() => {
    if (!e) return;
    const y = () => void $(), b = () => {
      document.visibilityState === "visible" && y();
    };
    return window.addEventListener("online", y), document.addEventListener("visibilitychange", b), () => {
      window.removeEventListener("online", y), document.removeEventListener("visibilitychange", b);
    };
  }, [e, $]), {
    entries: v,
    confirmationMode: d,
    runtimeRestarting: m,
    runtimeCredentialConfigured: g,
    setEntriesById: c,
    inFlightRef: u,
    upsert: C,
    refresh: N
  };
}
function xs() {
  try {
    return globalThis.sessionStorage;
  } catch {
    return;
  }
}
function Et() {
  return {
    storagePrefix: Ns,
    keyPrefix: Ms,
    storage: xs()
  };
}
function Ss(t, e, n) {
  return jn(t, e, n, Et());
}
function st(t, e, n) {
  zn(t, e, n, Et());
}
function Ts({
  refresh: t,
  upsert: e,
  setEntriesById: n,
  inFlightRef: r
}) {
  const s = j(/* @__PURE__ */ new Map());
  return { perform: H(async (o, c, d = {}) => {
    const l = `${c.operation_id || ""}`.trim(), m = `action:${l}`;
    if (!l || r.current.has(m)) return;
    if (o === "retry" && c.status === "ambiguous" && d.acceptDuplicateRisk !== !0) {
      n((p) => ({
        ...p,
        [l]: {
          ...p[l],
          error: "请先确认重复执行风险，再重新执行操作。"
        }
      }));
      return;
    }
    const f = Ss(l, o, s.current);
    r.current.add(m), n((p) => ({
      ...p,
      [l]: { ...p[l], pendingAction: o, error: void 0 }
    }));
    const g = {
      idempotency_key: f,
      expected_status: c.status,
      expected_attempt: c.current_attempt,
      expected_program_sha256: c.program_sha256 || ""
    };
    try {
      const p = be();
      if (!p) throw new Error("Reader AI operations unavailable");
      let u;
      o === "run" ? u = await p.run(l, g) : o === "cancel" ? u = await p.cancel(l, { ...g, reason: "user_rejected" }) : o === "commit" ? u = await p.commit(l, g) : u = await p.retry(l, d.acceptDuplicateRisk ? { ...g, accept_duplicate_risk: !0 } : g), st(l, o, s.current), e(u, !0);
    } catch (p) {
      ks(p) === 409 ? (st(l, o, s.current), await t(l, !0)) : n((u) => ({
        ...u,
        [l]: {
          ...u[l],
          pendingAction: void 0,
          error: As(p)
        }
      }));
    } finally {
      r.current.delete(m);
    }
  }, [t, e]) };
}
function Es({
  conversationId: t,
  enabled: e,
  discovering: n,
  signal: r,
  confirmationModeHint: s,
  onDocumentCommitted: a
}) {
  const o = _s({
    conversationId: t,
    enabled: e,
    discovering: n,
    signal: r,
    confirmationModeHint: s,
    onDocumentCommitted: a
  }), { perform: c } = Ts({
    refresh: o.refresh,
    upsert: o.upsert,
    setEntriesById: o.setEntriesById,
    inFlightRef: o.inFlightRef
  }), d = H((l) => {
    var m;
    return ((m = be()) == null ? void 0 : m.fetchCandidate(l.operation_id)) ?? Promise.reject(new Error("Reader AI operations unavailable"));
  }, []);
  return {
    entries: o.entries,
    confirmationMode: o.confirmationMode,
    runtimeRestarting: o.runtimeRestarting,
    runtimeCredentialConfigured: o.runtimeCredentialConfigured,
    perform: c,
    loadCandidate: d
  };
}
function Ps(t) {
  var E;
  const {
    jobId: e,
    documentId: n = "",
    sessionIdentity: r = "",
    enabled: s,
    selectionContext: a = null,
    onDocumentCommitted: o
  } = t, c = `${e}\0${n}\0${r}`, [d, l] = W("reading"), [m, f] = W(null), [g, p] = W();
  q(() => {
    l("reading"), f(null), p(void 0);
  }, [c]);
  const u = Q(() => {
    var R;
    return !s || !e ? null : ((R = Ue()) == null ? void 0 : R.createRemoteAnswerer({ jobId: e, documentId: n })) ?? tn({ jobId: e, documentId: n });
  }, [n, s, e]), A = Q(() => {
    var R;
    return !s || !e ? null : ((R = Ue()) == null ? void 0 : R.createLocalAnswerer({ jobId: e })) ?? kn({
      loadMarkdownPayload: nn.loadMarkdownPayload
    });
  }, [s, e]), T = j(null), C = ns({
    jobId: e,
    enabled: s,
    remoteAnswerer: u,
    localAnswerer: A,
    assistantMode: d,
    onAgentOperationSignal: (R) => {
      f({ ...R, nonce: Date.now() + Math.random() });
    },
    onConfirmationMode: p,
    onStopped: () => {
      var R;
      return (R = T.current) == null ? void 0 : R.markRunningCancelled();
    }
  }), N = Q(() => ({
    messages: C.messages,
    status: C.status,
    error: C.error,
    sendUserMessage: (R, I) => C.sendMessage(
      R,
      I
    ),
    regenerateFrom: (R) => C.regenerate(
      R
    ),
    stopStream: () => C.stop(),
    replaceVisible: (R) => C.setMessages([...R])
  }), [C]), $ = Q(() => ({
    stopStream: () => N.stopStream(),
    clearMessages: () => N.replaceVisible([]),
    showMessages: (R) => N.replaceVisible(xt(R))
  }), [N]), v = gs({
    jobId: e,
    documentId: n,
    enabled: s,
    remoteAnswerer: u,
    stream: $
  });
  T.current = v.tree;
  const L = Rs({
    jobId: e,
    assistantMode: d,
    selectionContext: a,
    tree: v.tree,
    chat: N,
    getScopeKey: () => v.resolveRequestScopeKey()
  }), y = v.activeConversationId || (m == null ? void 0 : m.conversationId) || `${((E = u == null ? void 0 : u.getConversationId) == null ? void 0 : E.call(u)) || ""}`.trim(), b = Es({
    conversationId: y,
    enabled: s,
    discovering: L.isRunning,
    signal: m,
    confirmationModeHint: g,
    onDocumentCommitted: o
  }), M = j(!1);
  return q(() => {
    M.current = !1;
  }, [e]), q(() => {
    M.current = !1;
  }, [c]), q(() => {
    M.current && !L.isRunning && (v.sessionCommands.refreshSessions(), v.sessionCommands.adoptRemoteConversationId()), M.current = L.isRunning;
  }, [v, L.isRunning]), {
    citationsByMessageId: v.citationsByMessageId,
    progressByMessageId: v.progressByMessageId,
    contentByMessageId: v.contentByMessageId,
    streamingAssistantId: L.streamingAssistantId,
    isRunning: L.isRunning,
    messages: v.messages,
    sessions: v.sessions,
    activeConversationId: v.activeConversationId,
    sessionBusy: v.sessionBusy,
    sessionError: v.sessionError,
    submitQuestion: L.submitQuestion,
    retryAnswer: L.retryAnswer,
    cancelAnswer: L.cancelAnswer,
    newSession: v.sessionCommands.newSession,
    switchSession: v.sessionCommands.switchSession,
    removeSession: v.sessionCommands.removeSession,
    renameSession: v.sessionCommands.renameSession,
    branchFromAnswer: v.sessionCommands.branchFromAnswer,
    agentOperations: b,
    assistantMode: d,
    setAssistantMode: l
  };
}
function Js({
  open: t,
  jobId: e,
  documentId: n = "",
  sessionIdentity: r = "",
  onClose: s,
  onJumpCitation: a,
  onDocumentCommitted: o,
  layout: c = "floating",
  side: d = "right",
  selectionContext: l = null,
  onClearSelectionContext: m
}) {
  const f = t && !!e, {
    citationsByMessageId: g,
    progressByMessageId: p,
    contentByMessageId: u,
    streamingAssistantId: A,
    isRunning: T,
    sessions: C,
    activeConversationId: N,
    sessionBusy: $,
    sessionError: v,
    messages: L,
    submitQuestion: y,
    retryAnswer: b,
    cancelAnswer: M,
    newSession: E,
    switchSession: R,
    removeSession: I,
    renameSession: S,
    branchFromAnswer: w,
    agentOperations: k,
    assistantMode: P,
    setAssistantMode: O
  } = Ps({
    jobId: e,
    documentId: n,
    sessionIdentity: r,
    enabled: f,
    selectionContext: l,
    onDocumentCommitted: o
  }), [h, z] = W(""), G = H(async (B) => {
    z(""), await w(B) && (z(
      "已保存新对话（fork-n-原名）：复制了到此答案的上文，原对话不变。顶部列表可切换。"
    ), window.setTimeout(() => z(""), 6e3));
  }, [w]), D = H((B) => {
    a(B);
  }, [a]);
  return /* @__PURE__ */ i(
    rn,
    {
      id: "reader-ai-panel",
      open: t,
      title: "RetainPDF AI",
      titleIcon: /* @__PURE__ */ i(Ie, { size: 14, strokeWidth: 2.1, "aria-hidden": !0 }),
      storageKey: "retainpdf.reader.ai-float.pos.v2",
      ariaLabel: "阅读问答",
      width: 420,
      placement: c === "workspace" ? "workspace" : c === "docked" ? "dock-right" : "floating",
      showHeader: c !== "workspace",
      className: `reader-float-ai is-${c}${c === "workspace" ? ` is-pane-${d}` : ""}${$ ? " is-session-busy" : ""}`,
      onClose: s,
      children: e ? /* @__PURE__ */ x("div", { className: "reader-float-ai-body", children: [
        /* @__PURE__ */ i(
          Xr,
          {
            sessions: C,
            activeId: N,
            busy: $,
            errorText: v,
            onSwitch: R,
            onNew: E,
            onDelete: I,
            onRename: S
          }
        ),
        h ? /* @__PURE__ */ i("div", { className: "aui-session-banner", role: "status", children: h }) : null,
        /* @__PURE__ */ i("div", { className: "reader-float-ai-thread-wrap", "aria-busy": $ || void 0, children: /* @__PURE__ */ i(
          Vr,
          {
            jobId: e,
            messages: L,
            citationsByMessageId: g,
            progressByMessageId: p,
            contentByMessageId: u,
            streamingAssistantId: A,
            isRunning: T,
            onSubmit: y,
            onRetry: b,
            onCancel: M,
            onJumpCitation: D,
            onBranchFromAnswer: G,
            branchBusy: $,
            agentOperations: k,
            assistantMode: P,
            onAssistantModeChange: O,
            selectionContext: l,
            onClearSelectionContext: m
          }
        ) })
      ] }) : /* @__PURE__ */ x("div", { className: "reader-float-ai-empty", children: [
        /* @__PURE__ */ i(Ie, { size: 22, strokeWidth: 1.75, "aria-hidden": !0 }),
        /* @__PURE__ */ i("p", { children: "当前文档还没有可用于 AI 的解析产物" }),
        /* @__PURE__ */ i("span", { children: "请先完成 OCR 文档解析" })
      ] })
    }
  );
}
export {
  Js as ReaderAiPanel
};
//# sourceMappingURL=ReaderAiPanel-Xlx2EfoT.js.map
