var Fn = (e) => {
  throw TypeError(e);
};
var $n = (e, t, n) => t.has(e) || Fn("Cannot " + n);
var nt = (e, t, n) => ($n(e, t, "read from private field"), n ? n.call(e) : t.get(e)), jn = (e, t, n) => t.has(e) ? Fn("Cannot add the same private member more than once") : t instanceof WeakSet ? t.add(e) : t.set(e, n), Un = (e, t, n, r) => ($n(e, t, "write to private field"), r ? r.call(e, n) : t.set(e, n), n);
import { jsxs as D, jsx as p, Fragment as xt } from "react/jsx-runtime";
import { useEffect as $, useRef as N, useMemo as q, useState as L, useCallback as x, useLayoutEffect as $e, memo as cn, forwardRef as Ro, useImperativeHandle as ln, createContext as dn, useContext as un, useSyncExternalStore as To, useId as fn, Suspense as Eo, lazy as mn } from "react";
import { requireAdapter as ye, getReaderAdapters as se } from "./adapters.js";
import { resolveReaderDownloadName as Mo, createReaderServerFavoritesPort as ko, resolveReaderDownloadUrls as No, READER_PROGRESS_COPY as Re, trimString as lt, READER_DOWNLOAD_ACTIONS as Ao, disabledReason as xo } from "./runtime/state.js";
import { d as Co } from "./ask-answerer-GNQdzitl.js";
import "@retainpdf/api/conversations";
import { r as Lo, b as zo } from "./page-config-Ct7qR5rm.js";
import { c as Do, n as _o, f as Ot, h as Bn, a as Oo, b as Fo, i as Mr, p as Ct, g as kr, r as Nr, j as Wn, e as $o } from "./reader-regions-DsePY7B_.js";
import { p as Me, b as Ar, f as jo, w as Uo, t as Bo, e as Wo, v as Ho, i as Jo, c as Vo, S as qo } from "./live-translation-DXyeQ4W0.js";
import { sortByPageAndCreatedAt as Ko, buildAnnotationsMarkdown as Go, groupByPageAndCreatedAt as Yo } from "./runtime/content.js";
import { toast as qt, Toaster as Zo } from "sonner";
import { X as tt, Radio as Xo, FileText as xr, Columns2 as Cr, Languages as Lr, FileCode2 as zr, Sparkles as pn, GripHorizontal as Qo, StickyNote as Lt, Sigma as ea, Table2 as ta, Type as na, Image as ra, Check as oa, Copy as aa, Keyboard as sa, Download as ia, Bookmark as ca } from "lucide-react";
import { pdfjs as la, Page as da, Document as ua } from "react-pdf";
import { e as fa, m as ma, a as pa } from "./markdown-math-XkF5urpn.js";
const Dr = "retainpdf.theme", Kt = "classic", hn = [
  {
    id: "classic",
    label: "经典",
    description: "黑白灰克制，默认观感",
    group: "light",
    order: 10,
    preview: {
      bg: "#f5f5f7",
      paper: "#ffffff",
      accent: "#1d1d1f",
      ink: "#1d1d1f",
      danger: "#ff3b30"
    }
  },
  {
    id: "jiangnan",
    label: "素纸",
    description: "冷石灰底 · 冷青绿强调（去土黄）",
    group: "accent",
    order: 20,
    decorPack: "jiangnan",
    preview: {
      bg: "#f1f0ed",
      paper: "#fbfaf8",
      accent: "#2a5f57",
      ink: "#1b1b1d",
      danger: "#c23b32"
    }
  },
  {
    id: "mojia",
    label: "墨家",
    description: "素绢暖底 · 青铜机关",
    group: "accent",
    order: 25,
    decorPack: "mojia",
    series: "baijia",
    preview: {
      bg: "#f2efe8",
      paper: "#faf8f1",
      accent: "#4c6658",
      ink: "#26221b",
      danger: "#b23b32"
    }
  },
  {
    id: "seacliff",
    label: "雾青",
    description: "冷灰蓝底 · 青灰强调",
    group: "accent",
    order: 30,
    preview: {
      bg: "#eef1f4",
      paper: "#f8f9fb",
      accent: "#2d5f6e",
      ink: "#1a1d21",
      danger: "#c23b32"
    }
  },
  {
    id: "graphite",
    label: "石墨",
    description: "中性深灰 · 工作台阅读",
    group: "dark",
    order: 45,
    preview: { bg: "#1e1e1e", paper: "#2c2c2e", accent: "#0a84ff", ink: "#f5f5f7", danger: "#ff6961" }
  },
  {
    id: "night",
    label: "黛瓦夜色",
    description: "深底阅读 · 黛瓦墨黑",
    group: "dark",
    order: 40,
    preview: {
      bg: "#141618",
      paper: "#1e2226",
      accent: "#5aa88e",
      ink: "#e8e6e3",
      danger: "#e07068"
    }
  }
];
function _r() {
  return [...hn].sort((e, t) => e.order - t.order || e.id.localeCompare(t.id));
}
function ha(e) {
  return hn.find((t) => t.id === e);
}
function Or(e) {
  return typeof e == "string" && hn.some((t) => t.id === e);
}
_r().map((e) => e.id);
Object.fromEntries(
  _r().map((e) => [e.id, { id: e.id, label: e.label, description: e.description }])
);
const ga = "retainpdf:theme-change";
function Fr() {
  var r, a, o;
  const e = Me(((a = (r = globalThis.window) == null ? void 0 : r.location) == null ? void 0 : a.search) || "");
  if (!e) return null;
  const t = (o = globalThis.document) == null ? void 0 : o.documentElement.dataset.readerScheme;
  return (Ar(t) ? t : e.scheme) === "dark" ? "graphite" : "classic";
}
function $r(e) {
  var n;
  if (typeof document > "u") return;
  document.documentElement.dataset.theme = e, document.documentElement.dataset.readerTheme = e;
  const t = ((n = ha(e)) == null ? void 0 : n.group) || "light";
  document.documentElement.dataset.themeGroup = t, document.documentElement.classList.toggle("theme-dark", t === "dark");
}
function gn(e) {
  var t, n;
  !Me(((n = (t = globalThis.window) == null ? void 0 : t.location) == null ? void 0 : n.search) || "") || !Ar(e) || (document.documentElement.dataset.readerEmbed = "workbench", document.documentElement.dataset.readerScheme = e, $r(e === "dark" ? "graphite" : "classic"));
}
function ba(e) {
  var t, n;
  !Me(((n = (t = globalThis.window) == null ? void 0 : t.location) == null ? void 0 : n.search) || "") || !jo(e) || (document.documentElement.style.setProperty("--readflow-ui-font", Uo(e)), document.documentElement.style.setProperty("--readflow-ui-scale", String(e.textScale / 100)));
}
function ya() {
  const e = Fr();
  if (e) return e;
  if (typeof localStorage > "u") return Kt;
  try {
    const t = `${localStorage.getItem(Dr) || ""}`.trim();
    if (Or(t)) return t;
  } catch {
  }
  return Kt;
}
function va(e) {
  const t = Fr();
  if (t)
    return gn(t === "graphite" ? "dark" : "light"), t;
  const n = Or(e) ? e : Kt;
  try {
    localStorage.setItem(Dr, n);
  } catch {
  }
  if ($r(n), typeof window < "u")
    try {
      window.dispatchEvent(
        new CustomEvent(ga, { detail: { theme: n } })
      );
    } catch {
    }
  return n;
}
function Zl() {
  var t, n;
  const e = Me(((n = (t = globalThis.window) == null ? void 0 : t.location) == null ? void 0 : n.search) || "");
  return e ? (gn(e.scheme), e.scheme === "dark" ? "graphite" : "classic") : va(ya());
}
function Xl() {
  $(() => {
    const e = Me(window.location.search);
    if (!e || window.parent === window) return;
    const t = (n) => {
      if (!Bo(n, window.location.origin, window.parent)) return;
      const r = Wo(n.data);
      r && (gn(r.scheme), r.appearance && ba(r.appearance));
    };
    return window.addEventListener("message", t), e.itemId && window.parent.postMessage({ type: "readflow:reader-ready", itemId: e.itemId }, window.location.origin), () => window.removeEventListener("message", t);
  }, []);
}
function wa(e, t, n) {
  const r = N(null), a = N(""), o = N(null), s = N(n);
  s.current = n, $(() => {
    const l = Me(window.location.search);
    if (!n || !(l != null && l.itemId) || window.parent === window || !Ho(e, t)) {
      r.current = null, o.current && clearTimeout(o.current), o.current = null;
      return;
    }
    const c = { type: "readflow:reader-progress", itemId: l.itemId, page: e, pages: t };
    if (!o.current && a.current === JSON.stringify(c)) {
      r.current = null;
      return;
    }
    r.current = c, !o.current && (o.current = setTimeout(() => {
      o.current = null;
      const i = r.current;
      !i || !s.current || (a.current = JSON.stringify(i), window.parent.postMessage(i, window.location.origin), r.current = null);
    }, 1e3));
  }, [e, t, n]), $(() => {
    if (!Me(window.location.search) || window.parent === window) return;
    const l = () => {
      o.current && clearTimeout(o.current), o.current = null;
      const c = r.current;
      r.current = null, c && s.current && window.parent.postMessage(c, window.location.origin);
    };
    return window.addEventListener("pagehide", l), () => {
      window.removeEventListener("pagehide", l), l();
    };
  }, []);
}
const Sa = (...e) => {
  var t, n;
  return ((n = (t = se()) == null ? void 0 : t.isMockMode) == null ? void 0 : n.call(t, ...e)) ?? !1;
}, Pa = "", Ia = Object.freeze({
  progress: "retainpdf-reader-progress"
}), Ra = (e) => {
  var t, n;
  return ((n = (t = se()) == null ? void 0 : t.resolveResourceUrl) == null ? void 0 : n.call(t, e)) ?? e;
}, Ql = (...e) => {
  var n;
  return (((n = se()) == null ? void 0 : n.fetchProtected) ?? fetch)(...e);
}, Ae = () => ye("defaultReaderDataPort"), Hn = () => ye("defaultReaderPageConfigPort"), ed = {
  get apiPrefix() {
    return Ae().apiPrefix;
  },
  fetchProtected: (...e) => Ae().fetchProtected(...e),
  loadMarkdownPayload: (e) => Ae().loadMarkdownPayload(e),
  loadMarkdownSource: (e) => Ae().loadMarkdownSource(e),
  loadMarkdownRange: (e, t, n, r, a) => Ae().loadMarkdownRange(e, t, n, r, a),
  loadJobPayload: (e) => Ae().loadJobPayload(e),
  loadReaderPayload: (e, t) => Ae().loadReaderPayload(e, t),
  get liveTranslation() {
    return Ae().liveTranslation;
  }
}, jr = {
  messageTargetOrigin: () => Hn().messageTargetOrigin(),
  readerJobId: () => Hn().readerJobId()
}, Ta = () => {
  var e;
  return ((e = se()) == null ? void 0 : e.liveTranslation) ?? null;
}, dt = () => {
  var t;
  const e = se();
  return (e == null ? void 0 : e.pdf) ?? {
    fetchProtected: (e == null ? void 0 : e.fetchProtected) ?? ((t = e == null ? void 0 : e.defaultReaderDataPort) == null ? void 0 : t.fetchProtected) ?? fetch,
    resolvePdfjsVendorUrl: (n = "") => {
      var r;
      return ((r = e == null ? void 0 : e.resolvePdfjsVendorUrl) == null ? void 0 : r.call(e, n)) ?? "";
    }
  };
}, bn = () => {
  const e = se();
  if (e != null && e.sessionData) return e.sessionData;
  const t = e == null ? void 0 : e.defaultReaderDataPort;
  if (!t) throw new Error("Reader adapter missing: defaultReaderDataPort (call setReaderAdapters)");
  return {
    loadReaderPayload: t.loadReaderPayload,
    loadJobPayload: t.loadJobPayload,
    fetchDocumentByJobId: (...n) => ye("fetchDocumentByJobId")(...n),
    fetchProtected: t.fetchProtected,
    resolveResourceUrl: e.resolveResourceUrl ?? ((n) => n),
    resolveReaderSourcePdf: (n) => {
      var r;
      return ((r = e.resolveReaderSourcePdf) == null ? void 0 : r.call(e, n)) ?? null;
    },
    resolveReaderTranslatedPdfUrl: (n, r) => {
      var a;
      return ((a = e.resolveReaderTranslatedPdfUrl) == null ? void 0 : a.call(e, n, r)) ?? "";
    },
    resolveReaderArtifactUrl: (n) => {
      var r;
      return ((r = e.resolveReaderArtifactUrl) == null ? void 0 : r.call(e, n)) ?? "";
    }
  };
}, td = () => {
  var e;
  return ((e = se()) == null ? void 0 : e.aiOperations) ?? null;
}, nd = () => {
  var e;
  return ((e = se()) == null ? void 0 : e.conversations) ?? null;
}, rd = () => {
  var e;
  return ((e = se()) == null ? void 0 : e.askChat) ?? null;
}, Ea = (...e) => {
  var t, n;
  return ((n = (t = se()) == null ? void 0 : t.resolveReaderAnchor) == null ? void 0 : n.call(t, ...e)) ?? null;
}, Ma = () => {
  var e, t;
  return ((t = (e = se()) == null ? void 0 : e.resolveReaderDocumentId) == null ? void 0 : t.call(e)) ?? "";
}, ka = (...e) => {
  var t, n;
  return ((n = (t = se()) == null ? void 0 : t.resolveReaderJobId) == null ? void 0 : n.call(t, ...e)) ?? "";
}, Na = (...e) => {
  var t, n;
  return ((n = (t = se()) == null ? void 0 : t.resolveReaderDownloadName) == null ? void 0 : n.call(t, ...e)) ?? Mo(...e);
}, Aa = (...e) => {
  var t, n;
  return ((n = (t = se()) == null ? void 0 : t.resolveReaderDownloadUrls) == null ? void 0 : n.call(t, ...e)) ?? No(...e);
}, xa = (...e) => ye("downloadProtectedResource")(...e), Ca = (...e) => ye("failDownloadToast")(...e), od = (e, t) => ye("resolveMarkdownAssetUrl")(e, t), ad = (e = {}) => {
  const t = se();
  return Co({
    apiPrefix: (t == null ? void 0 : t.apiPrefix) || "/api/v1",
    ask: t == null ? void 0 : t.askDocumentAi,
    documentByJobId: t == null ? void 0 : t.fetchDocumentByJobId,
    ...e
  });
}, yn = "/api/v1", sd = (e = yn, t = {}) => {
  var n;
  return ye("fetchFavorites")(
    ((n = se()) == null ? void 0 : n.apiPrefix) ?? e,
    t
  );
};
function id(e = {}) {
  const t = se();
  return ko({
    apiPrefix: (t == null ? void 0 : t.apiPrefix) ?? yn,
    documentByJobId: (...n) => ye("fetchDocumentByJobId")(...n),
    submitFavorite: (...n) => ye("createFavorite")(...n),
    loadFavorites: (...n) => ye("fetchFavorites")(...n),
    removeFavorite: (...n) => ye("deleteFavorite")(...n),
    ...e
  });
}
function La() {
  const e = () => {
    var r;
    return Lo(
      ((r = globalThis.location) == null ? void 0 : r.search) || ""
    );
  }, [t, n] = L(e);
  return $(() => {
    var l, c, i, d;
    const r = () => n(e()), a = (c = (l = globalThis.history) == null ? void 0 : l.pushState) == null ? void 0 : c.bind(globalThis.history), o = (d = (i = globalThis.history) == null ? void 0 : i.replaceState) == null ? void 0 : d.bind(globalThis.history);
    let s = !1;
    if (a && o)
      try {
        const u = (f) => function(...m) {
          const P = f.apply(this, m);
          return r(), globalThis.dispatchEvent(new Event("pushstate")), globalThis.dispatchEvent(new Event("replacestate")), globalThis.dispatchEvent(new Event("locationchange")), P;
        };
        globalThis.history.pushState = u(a), globalThis.history.replaceState = u(o), s = !0;
      } catch {
      }
    return window.addEventListener("popstate", r), window.addEventListener("hashchange", r), window.addEventListener("pushstate", r), window.addEventListener("replacestate", r), window.addEventListener("locationchange", r), () => {
      if (window.removeEventListener("popstate", r), window.removeEventListener("hashchange", r), window.removeEventListener("pushstate", r), window.removeEventListener("replacestate", r), window.removeEventListener("locationchange", r), s && a && o)
        try {
          globalThis.history.pushState = a, globalThis.history.replaceState = o;
        } catch {
        }
    };
  }, []), t;
}
function za() {
  const e = La(), t = q(() => ka(jr), [e]), n = q(() => Ma(), [e]), r = t || n ? `job:${t}|document:${n}` : `location:${e}`;
  return { locationKey: e, jobId: t, routeDocumentId: n, sessionIdentity: r };
}
function Da(e) {
  const {
    routeDocumentId: t,
    jobId: n,
    sessionIdentity: r,
    sessionIdentityRef: a,
    documentIdRef: o,
    sessionJobIdRef: s,
    switchToSourceMode: l
  } = e, [c, i] = L({
    documentId: "",
    jobId: ""
  }), [d, u] = L({
    documentId: "",
    jobId: ""
  }), f = c.documentId === t ? c.jobId : "", m = d.documentId === t ? d.jobId : "", P = n || f, [g, h] = L({
    jobId: "",
    documentId: ""
  }), b = g.jobId === P ? g.documentId : "", S = t || b, I = !!t && !P, [y, w] = L(null), A = (y == null ? void 0 : y.sessionIdentity) === r && y.documentId === S ? y : null, E = I || !!A, _ = x((R) => {
    const T = `${R.documentId || ""}`.trim();
    if (!T || o.current && o.current !== T) return;
    if (!o.current && s.current)
      h({
        jobId: s.current,
        documentId: T
      });
    else if (!o.current)
      return;
    const v = `${R.revision || ""}`.trim() || `${Date.now()}`;
    w({
      documentId: T,
      revision: v,
      sessionIdentity: a.current
    }), l();
  }, []);
  $(() => {
    w((R) => R && R.sessionIdentity !== r ? null : R);
  }, [r]);
  const k = x((R) => {
    switch (R.type) {
      case "resolved-document-job":
        i({ documentId: R.documentId, jobId: R.jobId });
        break;
      case "cleared-resolved-document-job":
        i({ documentId: "", jobId: "" });
        break;
      case "missing-document-job":
        u({ documentId: R.documentId, jobId: R.jobId });
        break;
      case "resolved-job-document":
        h((T) => T.jobId === R.jobId && T.documentId === R.documentId ? T : { jobId: R.jobId, documentId: R.documentId });
        break;
      case "committed-source":
        w({
          documentId: R.documentId,
          revision: R.revision,
          sessionIdentity: R.sessionIdentity
        });
        break;
    }
  }, []);
  return {
    resolvedDocumentJob: c,
    setResolvedDocumentJob: i,
    missingDocumentJob: d,
    setMissingDocumentJob: u,
    documentJobId: f,
    rejectedDocumentJobId: m,
    sessionJobId: P,
    resolvedJobDocument: g,
    setResolvedJobDocument: h,
    jobDocumentId: b,
    documentId: S,
    sourceOnly: I,
    committedDocumentSource: y,
    setCommittedDocumentSource: w,
    activeCommittedDocumentSource: A,
    sourceViewOnly: E,
    refreshCommittedDocument: _,
    applyIdentityEvent: k
  };
}
const _a = /* @__PURE__ */ new Set(["succeeded", "failed", "cancelled", "canceled"]);
function Jn(e) {
  return `${(e == null ? void 0 : e.status) || ""}`.trim().toLowerCase();
}
function Oa(e) {
  var r, a, o, s;
  if (!e || typeof e != "object") return "";
  const t = e, n = [
    t.document_id,
    t.documentId,
    (r = t.document) == null ? void 0 : r.document_id,
    (a = t.book_summary) == null ? void 0 : a.document_id,
    (s = (o = t.request_payload) == null ? void 0 : o.source) == null ? void 0 : s.document_id
  ];
  for (const l of n) {
    const c = `${l || ""}`.trim();
    if (c) return c;
  }
  return "";
}
function Vn(e, t) {
  const n = `/api/v1/documents/${encodeURIComponent(e)}/source.pdf`, r = `${t || ""}`.trim();
  return Ra(r ? `${n}?version=${encodeURIComponent(r)}` : n);
}
function Fa(e, t = "") {
  const n = `${e || ""}`.trim(), r = `${t || ""}`.trim();
  return !!(!n || r && (n === r || n === `${r}.pdf`) || /^\d{8,14}-[0-9a-f]{4,}$/i.test(n));
}
function $a(e, t) {
  var r;
  const n = [
    e == null ? void 0 : e.title,
    e == null ? void 0 : e.display_name,
    e == null ? void 0 : e.source_file_name,
    (r = e == null ? void 0 : e.book_summary) == null ? void 0 : r.source_file_name
  ];
  for (const a of n) {
    const o = `${a || ""}`.trim();
    if (o && !Fa(o, t))
      return o.replace(/\.pdf$/i, "");
  }
  return "";
}
function Gt({
  percent: e,
  text: t,
  stage: n
}) {
  var r;
  try {
    (r = window.parent) == null || r.postMessage(
      {
        type: Ia.progress,
        stage: n,
        percent: e,
        text: t
      },
      jr.messageTargetOrigin()
    );
  } catch {
  }
}
function Et(e, t, n, r = "progress") {
  e({
    loading: !0,
    percent: t,
    text: n,
    stage: r,
    failed: !1
  }), Gt({ percent: t, text: n, stage: r });
}
function ja(e) {
  const {
    sessionJobId: t,
    sessionIdentity: n,
    sessionIdentityRef: r,
    sessionJobIdRef: a,
    sessionEpochRef: o,
    closingRef: s
  } = e, [l, c] = L(null), [i, d] = L(null), [u, f] = L(""), [m, P] = L(0), g = u === n ? l : null, h = u === n ? i : null, b = Jn(g), S = _a.has(b), I = x(() => {
    P((k) => k + 1);
  }, []), y = x((k) => {
    c(k.jobPayload), d(k.manifestPayload), f(k.sessionIdentity);
  }, []), w = x((k) => {
    c(null), d(null), f(k);
  }, []), A = N(""), E = N(""), _ = x(async () => {
    const k = a.current;
    if (!k || A.current === k) return;
    const R = bn().loadJobPayload;
    if (typeof R != "function") return;
    const T = o.current.value;
    A.current = k;
    try {
      const v = await R(k);
      if (s.current || o.current.value !== T || a.current !== k || !v || typeof v != "object")
        return;
      const M = Jn(v);
      c(v), f(r.current), M === "succeeded" && E.current !== k && (E.current = k, P((C) => C + 1));
    } catch {
    } finally {
      A.current === k && (A.current = "");
    }
  }, []);
  return $(() => {
    E.current = "";
  }, [n]), $(() => {
    if (!t || S || !g) return;
    const k = window.setInterval(() => {
      _();
    }, 1e3);
    return () => window.clearInterval(k);
  }, [S, _, g, t]), {
    jobPayload: l,
    setJobPayload: c,
    manifestPayload: i,
    setManifestPayload: d,
    payloadSessionIdentity: u,
    setPayloadSessionIdentity: f,
    scopedJobPayload: g,
    scopedManifestPayload: h,
    jobStatus: b,
    jobTerminal: S,
    jobRefreshRevision: m,
    refreshJobArtifacts: I,
    refreshJobStatus: _,
    publishPayload: y,
    clearPayload: w
  };
}
function Yt(e) {
  document.body.classList.remove(
    "reader-mode-source",
    "reader-mode-translated",
    "reader-mode-compare"
  ), document.body.classList.add(`reader-mode-${e}`);
}
function Ua(e, t) {
  e(t), Yt(t);
}
function Ba(e) {
  const [t, n] = L(e ? "source" : "compare"), r = x((o) => {
    e && o !== "source" || (n(o), Yt(o));
  }, [e]), a = x((o) => {
    Ua(n, o);
  }, []);
  return $(() => (e && document.documentElement.classList.add("reader-source-only"), Yt(t), () => {
    document.documentElement.classList.remove("reader-source-only");
  }), [e, t]), { mode: t, setMode: r, setModeState: n, switchSessionMode: a };
}
function qn(e) {
  return typeof e == "string" ? e.trim() : `${e ?? ""}`.trim();
}
function Wa(e) {
  const t = (e == null ? void 0 : e.data) ?? e, n = t && typeof t == "object" ? t : {};
  return {
    activeJobId: qn(n.active_job_id),
    activeVersionId: qn(n.active_version_id)
  };
}
function Ha(e) {
  const { link: t, rejectedDocumentJobId: n, hasCommittedSource: r } = e, a = t.activeJobId && t.activeJobId !== n && !t.activeJobId.startsWith("doc:") ? t.activeJobId : "";
  return a ? { kind: "follow-active-job", jobId: a, activeVersionId: t.activeVersionId } : t.activeVersionId && !r ? { kind: "open-committed-source", documentId: "", revision: t.activeVersionId } : { kind: "open-source-url" };
}
function Ja(e) {
  const {
    payloadDocumentId: t,
    linkedActiveJobId: n,
    linkedActiveVersionId: r,
    sessionJobId: a,
    hasCommittedSource: o
  } = e;
  return t && r && n === a && !o ? { kind: "restore-committed-source", documentId: t, revision: r } : { kind: "open-job-artifacts" };
}
function Va(e) {
  return e.status === 404 && !e.jobId && !!e.routeDocumentId && !!e.documentJobId && e.sessionJobId === e.documentJobId;
}
function qa(e) {
  return e ? { data: e.data.slice() } : null;
}
const Ka = 2, ve = /* @__PURE__ */ new Map();
function Zt(e, t) {
  ve.delete(e), ve.set(e, t);
}
function Ga(e) {
  if (ve.size < Ka) return;
  const t = ve.keys().next().value;
  t && ve.delete(t);
}
function Ft(e) {
  const t = `${e || ""}`.trim();
  if (!t || !ve.has(t)) return null;
  const n = ve.get(t);
  return Zt(t, n), n;
}
async function Ur(e, t = dt().fetchProtected, n = {}) {
  const r = `${e || ""}`.trim();
  if (!r)
    return null;
  if (ve.has(r)) {
    const l = ve.get(r);
    return Zt(r, l), l;
  }
  const a = await t(r, { signal: n.signal });
  if (!a.ok) {
    const l = new Error(`读取 PDF 失败 (${a.status})`);
    throw l.status = a.status, l;
  }
  const o = await a.arrayBuffer(), s = { data: new Uint8Array(o) };
  return ve.has(r) ? Zt(r, s) : (Ga(), ve.set(r, s)), s;
}
function Ya(e = "", t = null) {
  const [n, r] = L(
    () => t || Ft(e)
  ), [a, o] = L(
    () => !!`${e || ""}`.trim() && !t && !Ft(e)
  ), [s, l] = L("");
  return $(() => {
    if (t) {
      r(t), o(!1), l("");
      return;
    }
    const c = `${e || ""}`.trim();
    if (!c) {
      r(null), o(!1), l("");
      return;
    }
    const i = Ft(c);
    if (i) {
      r(i), o(!1), l("");
      return;
    }
    let d = !1;
    return o(!0), l(""), r(null), Ur(c).then((u) => {
      d || (r(u), o(!1));
    }).catch((u) => {
      d || (r(null), o(!1), l((u == null ? void 0 : u.message) || String(u)));
    }), () => {
      d = !0;
    };
  }, [e, t]), { file: n, loading: a, error: s };
}
function Za(e) {
  const { sessionEpochRef: t, closingRef: n, abort: r, sessionEpoch: a } = e;
  let o = !1;
  const s = () => r.signal.aborted || n.current || t.current.value !== a;
  return {
    signal: r.signal,
    isClosedOrStale: s,
    isInactive: () => o || s(),
    markFailed: () => {
      o = !0;
    }
  };
}
async function Xt(e) {
  const { url: t, label: n, percentStart: r, percentEnd: a, fence: o, setBoot: s } = e;
  if (!t || o.isInactive())
    return null;
  Et(s, r, n, "download");
  const l = await Ur(t, dt().fetchProtected, {
    signal: o.signal
  });
  return o.isInactive() ? null : (Et(s, a, n, "download"), l);
}
async function Xa(e) {
  const { sourceFinal: t, translatedFinal: n, fence: r, setBoot: a } = e;
  Et(a, 25, "正在下载 PDF…", "download");
  const o = [];
  let s = null, l = null;
  return t && o.push(
    Xt({
      url: t,
      label: "正在下载原文 PDF…",
      percentStart: 30,
      percentEnd: 55,
      fence: r,
      setBoot: a
    }).then((d) => {
      s = d;
    })
  ), n && o.push(
    Xt({
      url: n,
      label: "正在下载译文 PDF…",
      percentStart: 55,
      percentEnd: 85,
      fence: r,
      setBoot: a
    }).then((d) => {
      l = d;
    })
  ), await Promise.all(o), r.isInactive() ? { status: "inactive" } : !!t && !s || !!n && !l ? { status: "incomplete" } : { status: "downloaded", sourceBytes: s, translatedBytes: l };
}
const wt = {
  regions: null,
  metadata: null
};
function Qa(e) {
  const {
    sessionJobId: t,
    jobId: n,
    routeDocumentId: r,
    documentJobId: a,
    rejectedDocumentJobId: o,
    sourceOnly: s,
    locationKey: l,
    sessionIdentity: c,
    committedSource: i,
    applyIdentityEvent: d,
    publishPayload: u,
    clearPayload: f,
    switchSessionMode: m,
    jobRefreshRevision: P,
    sessionEpochRef: g,
    closingRef: h,
    activeLoadAbortRef: b
  } = e, [S, I] = L(""), [y, w] = L(""), [A, E] = L(null), [_, k] = L(null), [R, T] = L(!1), [v, M] = L(""), [C, z] = L([]), [O, B] = L(() => ({
    source: null,
    translated: null
  })), [ee, X] = L(
    wt
  ), [oe, re] = L({
    loading: !0,
    percent: 4,
    text: Re.boot,
    stage: "progress",
    failed: !1
  });
  return $(() => {
    const ie = new AbortController(), U = g.current.value, K = Za({
      sessionEpochRef: g,
      closingRef: h,
      abort: ie,
      sessionEpoch: U
    });
    b.current = ie;
    const Z = bn();
    if (h.current)
      return ie.abort(), () => {
        b.current === ie && (b.current = null);
      };
    function Q(W, V) {
      K.markFailed(), re({
        loading: !1,
        percent: 100,
        text: W,
        stage: "failed",
        failed: !0
      }), Gt({ percent: 100, text: V, stage: "failed" });
    }
    function le() {
      T(!0), re({
        loading: !1,
        percent: 100,
        text: Re.ready,
        stage: "ready",
        failed: !1
      }), Gt({ percent: 100, text: Re.ready, stage: "ready" });
    }
    function pe() {
      return i != null && i.documentId ? Vn(
        i.documentId,
        i.revision
      ) : Sa() ? Pa : Z.resolveResourceUrl(`/api/v1/documents/${encodeURIComponent(r)}/source.pdf`);
    }
    async function me() {
      let W = { activeJobId: "", activeVersionId: "" };
      try {
        const ge = await Z.fetchProtected(
          Z.resolveResourceUrl(`/api/v1/documents/${encodeURIComponent(r)}`)
        );
        if (ge != null && ge.ok) {
          const ze = await ge.json().catch(() => null);
          W = Wa(ze);
        }
      } catch {
      }
      const V = Ha({
        link: W,
        rejectedDocumentJobId: o,
        hasCommittedSource: !!i
      });
      if (V.kind === "follow-active-job") {
        if (K.isInactive()) return;
        d({
          type: "resolved-document-job",
          documentId: r,
          jobId: V.jobId
        }), V.activeVersionId ? (i || d({
          type: "committed-source",
          documentId: r,
          revision: V.activeVersionId,
          sessionIdentity: c
        }), m("source")) : m("compare");
        return;
      }
      if (V.kind === "open-committed-source") {
        if (K.isInactive()) return;
        d({
          type: "committed-source",
          documentId: r,
          revision: V.revision,
          sessionIdentity: c
        }), m("source");
        return;
      }
      const ae = pe();
      if (K.isInactive()) return;
      I(ae), w(""), M(""), f(c);
      const Pe = await Xt({
        url: ae,
        label: "正在下载原文 PDF…",
        percentStart: 30,
        percentEnd: 85,
        fence: K,
        setBoot: re
      });
      if (!K.isInactive()) {
        if (!Pe) {
          Q("源文件不可用：该文档没有可读取的源 PDF。", "源文件下载失败");
          return;
        }
        E(Pe), le();
      }
    }
    async function he() {
      var vt;
      const W = await ((vt = Z.loadSessionSnapshot) == null ? void 0 : vt.call(Z, {
        jobId: t,
        documentId: r,
        routeDocumentId: r,
        committedSource: i,
        includeOptionalArtifacts: !i
      })), V = W ? {
        jobPayload: W.sourcePayload,
        manifestPayload: W.manifestPayload,
        readerMetadata: W.readerMetadata,
        regionsPayload: W.regions,
        readerErrors: W.readerErrors
      } : await Z.loadReaderPayload(t, {
        // committedSource 分支会丢弃 regions/metadata（旧页序已失效），
        // 直接跳过这两个可选请求，避免无效网络往返。
        includeOptionalArtifacts: !i
      });
      if (K.isInactive()) return;
      let ae = null;
      if (n && !r) {
        try {
          ae = await Z.fetchDocumentByJobId(yn, t);
        } catch {
        }
        if (K.isInactive()) return;
      }
      const Pe = Oa(V.jobPayload) || `${(ae == null ? void 0 : ae.document_id) || ""}`.trim();
      Pe && !r && d({
        type: "resolved-job-document",
        jobId: t,
        documentId: Pe
      });
      const ge = Ja({
        payloadDocumentId: Pe,
        linkedActiveJobId: `${(ae == null ? void 0 : ae.active_job_id) || ""}`.trim(),
        linkedActiveVersionId: `${(ae == null ? void 0 : ae.active_version_id) || ""}`.trim(),
        sessionJobId: t,
        hasCommittedSource: !!i
      });
      if (ge.kind === "restore-committed-source") {
        if (K.isInactive()) return;
        d({
          type: "committed-source",
          documentId: ge.documentId,
          revision: ge.revision,
          sessionIdentity: c
        }), m("source");
        return;
      }
      const ze = Z.resolveReaderSourcePdf(V.manifestPayload), bt = Z.resolveReaderTranslatedPdfUrl(V.jobPayload, V.manifestPayload), _t = typeof ze == "string" ? ze : Z.resolveReaderArtifactUrl(ze), yt = r || Pe, Ie = i != null && i.documentId ? Vn(
        i.documentId,
        i.revision
      ) : _t || (yt ? Z.resolveResourceUrl(`/api/v1/documents/${encodeURIComponent(yt)}/source.pdf`) : ""), Ne = i ? "" : bt || "";
      if (I(Ie || ""), w(Ne), M($a(V.jobPayload, t)), u({
        jobPayload: V.jobPayload || null,
        manifestPayload: V.manifestPayload || null,
        sessionIdentity: c
      }), z(i ? [] : Do(V.regionsPayload)), B(i ? { source: null, translated: null } : _o(V.readerMetadata)), X(i ? wt : V.readerErrors ?? wt), !Ie && !Ne) {
        Q(Re.failed, Re.failed);
        return;
      }
      const Be = await Xa({
        sourceFinal: Ie || "",
        translatedFinal: Ne,
        fence: K,
        setBoot: re
      });
      if (Be.status !== "inactive") {
        if (Be.status === "incomplete") {
          Q("PDF 下载失败，请重试", "PDF 下载失败");
          return;
        }
        E(Be.sourceBytes), k(Be.translatedBytes), le();
      }
    }
    async function j() {
      T(!1), E(null), k(null), z([]), B({ source: null, translated: null }), X(wt), Et(re, 8, Re.metadata, "metadata");
      try {
        if (s) {
          await me();
          return;
        }
        if (!t) {
          Q(Re.failed, Re.failed);
          return;
        }
        await he();
      } catch (W) {
        if (K.isClosedOrStale() || (W == null ? void 0 : W.name) === "AbortError") return;
        K.markFailed();
        const V = Number(W == null ? void 0 : W.status);
        if (Va({
          status: V,
          jobId: n,
          routeDocumentId: r,
          documentJobId: a,
          sessionJobId: t
        })) {
          d({ type: "missing-document-job", documentId: r, jobId: t }), d({ type: "cleared-resolved-document-job" }), m("source");
          return;
        }
        const ae = W instanceof Error ? W.message : Re.failed;
        Q(ae, ae);
      }
    }
    return j(), () => {
      ie.abort(), b.current === ie && (b.current = null);
    };
  }, [t, r, a, o, s, l, i, P, n, c, d, u, f, m]), {
    sourceUrl: S,
    translatedUrl: y,
    sourceFile: A,
    translatedFile: _,
    assetsReady: R,
    title: v,
    regions: C,
    readerMetadata: O,
    readerErrors: ee,
    boot: oe
  };
}
function es() {
  const e = N(!1), t = N(null), { locationKey: n, jobId: r, routeDocumentId: a, sessionIdentity: o } = za(), s = N({ identity: "", value: 0 });
  s.current.identity !== o && (s.current = {
    identity: o,
    value: s.current.value + 1
  }, e.current = !1);
  const l = N(o), c = N(""), i = N(""), d = N(() => {
  }), u = x(() => d.current(), []), f = Da({
    routeDocumentId: a,
    jobId: r,
    sessionIdentity: o,
    sessionIdentityRef: l,
    documentIdRef: c,
    sessionJobIdRef: i,
    switchToSourceMode: u
  }), {
    sessionJobId: m,
    documentId: P,
    sourceOnly: g,
    sourceViewOnly: h
  } = f, { mode: b, setMode: S, switchSessionMode: I } = Ba(h);
  d.current = () => {
    I("source");
  }, l.current = o, c.current = P, i.current = m;
  const y = ja({
    sessionJobId: m,
    sessionIdentity: o,
    sessionIdentityRef: l,
    sessionJobIdRef: i,
    sessionEpochRef: s,
    closingRef: e
  }), {
    scopedJobPayload: w,
    scopedManifestPayload: A,
    jobStatus: E,
    jobTerminal: _,
    jobRefreshRevision: k,
    refreshJobArtifacts: R,
    refreshJobStatus: T
  } = y, v = Qa({
    sessionJobId: m,
    jobId: r,
    routeDocumentId: a,
    documentJobId: f.documentJobId,
    rejectedDocumentJobId: f.rejectedDocumentJobId,
    sourceOnly: g,
    locationKey: n,
    sessionIdentity: o,
    committedSource: f.activeCommittedDocumentSource,
    applyIdentityEvent: f.applyIdentityEvent,
    publishPayload: y.publishPayload,
    clearPayload: y.clearPayload,
    switchSessionMode: I,
    jobRefreshRevision: k,
    sessionEpochRef: s,
    closingRef: e,
    activeLoadAbortRef: t
  }), M = x(() => {
    var z;
    e.current = !0, (z = t.current) == null || z.abort();
  }, []), C = q(
    () => ({
      fetchProtected: bn().fetchProtected,
      jobId: m,
      jobPayload: w,
      manifestPayload: A,
      sourceUrl: v.sourceUrl,
      translatedUrl: v.translatedUrl,
      sourceOnly: h
    }),
    [m, w, A, v.sourceUrl, v.translatedUrl, h]
  );
  return {
    jobId: m,
    jobStatus: E,
    workflow: `${(w == null ? void 0 : w.workflow) || ""}`.trim().toLowerCase(),
    jobTerminal: _,
    documentId: P,
    sessionIdentity: o,
    sourceOnly: g,
    mode: b,
    setMode: S,
    sourceUrl: v.sourceUrl,
    translatedUrl: v.translatedUrl,
    sourceFile: v.sourceFile,
    translatedFile: v.translatedFile,
    assetsReady: v.assetsReady,
    boot: v.boot,
    title: v.title,
    regions: v.regions,
    readerMetadata: v.readerMetadata,
    readerErrors: v.readerErrors,
    download: C,
    refreshJobArtifacts: R,
    refreshJobStatus: T,
    refreshCommittedDocument: f.refreshCommittedDocument,
    prepareClose: M
  };
}
const ts = 160, ns = 8, rs = 960;
function os() {
  const e = N(null), [t, n] = L(null), [r, a] = L(rs), o = x((s) => {
    e.current = s, n(s);
  }, []);
  return $(() => {
    const s = t;
    if (!s || typeof ResizeObserver > "u")
      return;
    const l = (i) => {
      !Number.isFinite(i) || i < ts || a((d) => Math.abs(d - i) < ns ? d : i);
    }, c = new ResizeObserver((i) => {
      var d, u;
      l(((u = (d = i[0]) == null ? void 0 : d.contentRect) == null ? void 0 : u.width) ?? s.clientWidth);
    });
    return c.observe(s), l(s.clientWidth), () => c.disconnect();
  }, [t]), {
    shellRef: e,
    shellEl: t,
    shellWidth: r,
    bindShell: o
  };
}
function as(e) {
  const { mode: t, sourceOnly: n, assetsReady: r, hasSource: a, hasTranslated: o } = e, s = r && a, l = r && o && !n, c = t === "source" || t === "compare", i = !n && (t === "translated" || t === "compare");
  return {
    mountSource: s,
    mountTranslated: l,
    showSource: c,
    showTranslated: i,
    compareMode: t === "compare" && c && i && s && l,
    primaryPane: t === "translated" ? "translated" : "source"
  };
}
const $t = { source: 0, translated: 0 };
function ss(e, t) {
  const {
    mode: n,
    sourceOnly: r,
    assetsReady: a,
    sourceUrl: o,
    translatedUrl: s,
    sourceFile: l,
    translatedFile: c
  } = e, i = `${(t == null ? void 0 : t.identityKey) || ""}\0${o}\0${s}`, d = N(i);
  d.current = i;
  const [u, f] = L(() => ({
    identity: i,
    pages: $t
  })), [m, P] = L(() => ({ identity: i, tick: 0 })), g = u.identity === i ? u.pages : $t, h = m.identity === i ? m.tick : 0, b = as({
    mode: n,
    sourceOnly: r,
    assetsReady: a,
    hasSource: !!l || !!o,
    hasTranslated: !!c
  }), { primaryPane: S } = b, I = x((T, v) => {
    d.current === i && f((M) => {
      const C = M.identity === i ? M.pages : $t;
      return C[v] === T && M.identity === i ? M : {
        identity: i,
        pages: { ...C, [v]: T }
      };
    });
  }, [i]), y = N(null), w = x(() => {
    y.current && clearTimeout(y.current);
    const T = i;
    y.current = setTimeout(() => {
      y.current = null, d.current === T && P((v) => ({
        identity: T,
        tick: v.identity === T ? v.tick + 1 : 1
      }));
    }, 60);
  }, [i]);
  $(() => (y.current && (clearTimeout(y.current), y.current = null), f((T) => T.identity === i && T.pages.source === 0 && T.pages.translated === 0 ? T : { identity: i, pages: { source: 0, translated: 0 } }), P((T) => T.identity === i && T.tick === 0 ? T : { identity: i, tick: 0 }), () => {
    y.current && (clearTimeout(y.current), y.current = null);
  }), [i]);
  const A = q(
    () => Math.max(g.source, g.translated),
    [g]
  ), E = S === "translated" ? g.translated : g.source || g.translated, _ = t == null ? void 0 : t.userZoom, k = t == null ? void 0 : t.shellWidth, R = `${i}-${h}-${_}-${n}-${g.source}-${g.translated}-${k}`;
  return {
    ...b,
    numPagesByPane: g,
    hudNumPages: A,
    primaryNumPages: E,
    metricsTick: h,
    onNumPages: I,
    onMetrics: w,
    rowSyncRevision: R
  };
}
const Xe = "data-reader-page", Qe = "data-reader-pane", vn = "data-natural-height", is = "reader-react-root", cs = "reader-react-grid", ls = "reader-react-scroll-shell", ds = "reader-react-pdf-pane", Br = "reader-react-pdf-page", Mt = "reader-react-pdf-page-placeholder", wn = "reader-react-pdf-page-slot";
function ut(e, t) {
  const n = e != null ? `[${Xe}="${e}"]` : `[${Xe}]`;
  return t ? `${n}[${Qe}="${t}"]` : n;
}
function us() {
  return `.${wn}[${Xe}]`;
}
function zt(e) {
  return Number(e.getAttribute(Xe));
}
const Wr = 0.25, Hr = 1, fs = 0.05, ht = 0.5, ms = 16, ps = 8;
function Ke(e) {
  return ht;
}
function Dt(e) {
  return Number.isFinite(e) ? Math.min(Hr, Math.max(Wr, e)) : ht;
}
function Ge(e, t) {
  const n = Dt(Number(e) + t * fs);
  return Math.round(n * 100) / 100;
}
function hs(e) {
  return Math.round(Dt(e) * 100);
}
function gs(e) {
  const n = (Number(e) || 0) - ms - ps;
  return Math.max(160, Math.floor(n));
}
function bs(e, t = ht) {
  const n = Dt(t);
  return gs((Number(e) || 0) * n);
}
function ys(e, t) {
  if (!e || !Number.isFinite(t) || t <= 0 || Math.abs(t - 1) < 1e-3)
    return;
  const n = e.scrollLeft + e.clientWidth / 2, r = e.scrollTop + e.clientHeight / 2, a = Array.from(
    e.querySelectorAll(`[${Qe}]`)
  ).map((s) => ({
    pane: s,
    cx: s.scrollLeft + s.clientWidth / 2,
    hadOverflow: s.scrollWidth > s.clientWidth + 1
  })), o = () => {
    e.scrollLeft = Math.max(0, n * t - e.clientWidth / 2), e.scrollTop = Math.max(0, r * t - e.clientHeight / 2);
    for (const { pane: s, cx: l, hadOverflow: c } of a) {
      const i = Math.max(0, s.scrollWidth - s.clientWidth);
      if (i <= 0) {
        s.scrollLeft = 0;
        continue;
      }
      c ? s.scrollLeft = Math.min(
        i,
        Math.max(0, l * t - s.clientWidth / 2)
      ) : s.scrollLeft = i / 2;
    }
  };
  requestAnimationFrame(() => {
    requestAnimationFrame(o);
  });
}
const vs = "retainpdf:reader:view:v1:", Kn = /* @__PURE__ */ new Set([
  "source",
  "translated",
  "markdown",
  "ai"
]), ws = /* @__PURE__ */ new Set([
  "source",
  "compare",
  "translated"
]);
function Jr() {
  try {
    return typeof globalThis.localStorage > "u" ? null : globalThis.localStorage;
  } catch {
    return null;
  }
}
function Qt(e) {
  return `${e || ""}`.trim();
}
function Ss({
  documentId: e,
  jobId: t
}) {
  const n = Qt(e);
  if (n) return `document:${n}`;
  const r = Qt(t);
  return r ? `job:${r}` : "";
}
function Vr(e) {
  const t = Qt(e);
  return t ? `${vs}${t}` : "";
}
function Ps(e) {
  if (!e || typeof e != "object") return;
  const t = Math.floor(Number(e.page)), n = Number(e.fraction);
  if (!(!Number.isFinite(t) || t < 1 || !Number.isFinite(n)))
    return {
      page: t,
      fraction: Math.max(0, Math.min(1, n))
    };
}
function Is(e) {
  if (e === null) return null;
  if (!e || typeof e != "object") return;
  const t = `${e.left || ""}`, n = `${e.right || ""}`;
  if (!(!Kn.has(t) || !Kn.has(n) || t === n))
    return { left: t, right: n };
}
function Rs(e) {
  return e === null ? null : e === "markdown" || e === "ai" ? e : void 0;
}
function Ts(e) {
  return ws.has(e) ? e : void 0;
}
function qr(e) {
  if (!e || typeof e != "object") return null;
  const t = e;
  if (t.schema !== "retainpdf_reader_view_v1") return null;
  const n = Ps(t.anchor), r = Number(t.zoom), a = Ts(t.mode), o = Is(t.splitLayout), s = Rs(t.assistantPanel);
  return {
    schema: "retainpdf_reader_view_v1",
    ...n ? { anchor: n } : {},
    ...Number.isFinite(r) ? { zoom: Math.max(0.25, Math.min(1, r)) } : {},
    ...a !== void 0 ? { mode: a } : {},
    ...o !== void 0 ? { splitLayout: o } : {},
    ...s !== void 0 ? { assistantPanel: s } : {},
    updatedAt: Number.isFinite(Number(t.updatedAt)) ? Number(t.updatedAt) : 0
  };
}
function Ee(e, t = Jr()) {
  const n = Vr(e);
  if (!n || !t) return null;
  try {
    const r = t.getItem(n);
    return r ? qr(JSON.parse(r)) : null;
  } catch {
    return null;
  }
}
function kt(e, t, n = Jr()) {
  const r = Vr(e);
  if (!r || !n) return null;
  const a = Ee(e, n), o = qr({
    schema: "retainpdf_reader_view_v1",
    ...a || {},
    ...t,
    updatedAt: Date.now()
  });
  if (!o) return null;
  try {
    return n.setItem(r, JSON.stringify(o)), o;
  } catch {
    return null;
  }
}
function Es(e, t, n = "") {
  const [r, a] = L(() => {
    var u;
    return ((u = Ee(n)) == null ? void 0 : u.zoom) ?? Ke();
  }), o = N(r), s = N(n);
  o.current = r;
  const l = N(1);
  $(() => {
    var f;
    if (s.current === n) return;
    s.current = n;
    const u = ((f = Ee(n)) == null ? void 0 : f.zoom) ?? Ke();
    l.current = 1, o.current = u, a(u);
  }, [e, n]);
  const c = x((u) => {
    const f = Dt(u), m = o.current;
    Math.abs(f - m) < 5e-4 || (l.current = f / (m || 1), kt(s.current, { zoom: f }), a(f));
  }, []), i = x((u) => {
    c(Ge(o.current, u));
  }, [c]), d = x((u) => {
    c(Ke());
  }, [c]);
  return $e(() => {
    const u = l.current;
    Math.abs(u - 1) < 1e-3 || (l.current = 1, ys(t == null ? void 0 : t.current, u));
  }, [r, t]), { userZoom: r, onZoomChange: c, stepZoom: i, resetZoom: d };
}
function Ms(e, t = !0) {
  const [n, r] = L(null), a = x(() => {
    var l, c;
    r(null);
    const s = (l = globalThis.getSelection) == null ? void 0 : l.call(globalThis);
    (c = s == null ? void 0 : s.removeAllRanges) == null || c.call(s);
  }, []), o = e.current ?? null;
  return $(() => {
    if (!t)
      return;
    const s = () => {
      var z, O;
      const g = e.current, h = (z = globalThis.getSelection) == null ? void 0 : z.call(globalThis);
      if (!g || !h || h.isCollapsed || !h.rangeCount) {
        r(null);
        return;
      }
      const b = h.getRangeAt(0);
      if (!g.contains(b.commonAncestorContainer)) {
        r(null);
        return;
      }
      const S = `${h.toString() || ""}`.replace(/\s+/g, " ").trim();
      if (S.length < 2) {
        r(null);
        return;
      }
      let I = b.commonAncestorContainer;
      I.nodeType === Node.TEXT_NODE && (I = I.parentElement);
      const y = (O = I == null ? void 0 : I.closest) == null ? void 0 : O.call(
        I,
        ut()
      );
      if (!y || !g.contains(y)) {
        r(null);
        return;
      }
      const w = Math.max(1, Math.floor(zt(y) || 1)), E = y.getAttribute(Qe) === "translated" ? "translated" : "source", _ = b.getClientRects(), k = _[_.length - 1] || b.getBoundingClientRect();
      if (!k || k.width === 0 && k.height === 0) {
        r(null);
        return;
      }
      const R = typeof window < "u" ? window.innerWidth : 800, T = typeof window < "u" ? window.innerHeight : 600, v = 16, M = Math.min(Math.max(v, k.left), R - v), C = Math.min(Math.max(v, k.top), T - v);
      r({
        selectionType: "text",
        quote: S,
        page: w,
        pane: E,
        rect: {
          left: M,
          top: C,
          width: k.width,
          height: k.height
        }
      });
    }, l = () => {
      window.setTimeout(s, 0);
    }, c = () => {
      l();
    }, i = () => l(), d = () => l(), u = () => {
      l();
    }, f = (g) => {
      g.key === "Escape" && a();
    }, m = () => {
      r((g) => g && null);
    };
    document.addEventListener("mouseup", c), document.addEventListener("pointerup", i), document.addEventListener("touchend", d), document.addEventListener("selectionchange", u), document.addEventListener("keyup", f);
    const P = o ?? e.current;
    return P == null || P.addEventListener("scroll", m, { passive: !0 }), window.addEventListener("scroll", m, { passive: !0, capture: !0 }), () => {
      document.removeEventListener("mouseup", c), document.removeEventListener("pointerup", i), document.removeEventListener("touchend", d), document.removeEventListener("selectionchange", u), document.removeEventListener("keyup", f), P == null || P.removeEventListener("scroll", m), window.removeEventListener("scroll", m, !0);
    };
  }, [t, o, a]), { selection: n, clearSelection: a };
}
function ks(e) {
  const { mode: t, setMode: n, beginModeSwitch: r } = e, a = N(t), o = N(n), s = N(r);
  return a.current = t, o.current = n, s.current = r, { setModeKeepingPage: x((c) => {
    c !== a.current && (s.current(), o.current(c));
  }, []) };
}
function Ns() {
  const [e, t] = L(null), n = x((s) => {
    t(s);
  }, []), r = x((s = null) => {
    t((l) => !s || l === s ? null : l);
  }, []), a = x((s) => {
    t((l) => l === s ? null : s);
  }, []), o = x(
    (s) => e === s,
    [e]
  );
  return { active: e, open: n, close: r, toggle: a, isOpen: o };
}
const Sn = 48;
function Kr(e, t = Sn) {
  return e.getBoundingClientRect().top + t;
}
function Gr(e, t) {
  if (!e.length)
    return null;
  let n = null, r = -1 / 0;
  for (const c of e) {
    const i = c.getBoundingClientRect();
    i.height < 8 || i.width < 8 || i.top <= t + 1 && i.top >= r && (n = c, r = i.top);
  }
  if (!n && (n = e.find((i) => {
    const d = i.getBoundingClientRect();
    return d.height >= 8 && d.width >= 8;
  }) ?? e[0] ?? null, n)) {
    const i = [...e].reverse().find((d) => {
      const u = d.getBoundingClientRect();
      return u.height >= 8 && u.width >= 8;
    });
    i && i.getBoundingClientRect().bottom < t && (n = i);
  }
  if (!n)
    return null;
  const a = zt(n);
  if (!Number.isFinite(a) || a < 1)
    return null;
  const o = n.getBoundingClientRect(), s = o.height > 0 ? o.height : 1, l = Math.min(1, Math.max(0, (t - o.top) / s));
  return { el: n, page: a, fraction: l };
}
function jt(e, t, n = Sn) {
  if (!e)
    return null;
  const r = ut(void 0, t), a = Array.from(e.querySelectorAll(r));
  if (!a.length || e.getBoundingClientRect().height <= 0)
    return null;
  const s = Kr(e, n), l = Gr(a, s);
  return l ? { page: l.page, fraction: l.fraction } : null;
}
function Pn(e, t, n = "auto", r, a = Sn) {
  if (!e || !t)
    return !1;
  const o = Math.max(1, Math.floor(Number(t.page) || 1)), s = Math.min(1, Math.max(0, Number(t.fraction) || 0));
  let l = null;
  if (r && (l = e.querySelector(ut(o, r))), l || (l = e.querySelector(ut(o))), !l)
    return !1;
  const c = e.getBoundingClientRect(), i = l.getBoundingClientRect();
  if (c.height <= 0 || i.height < 8 && l.offsetHeight < 8)
    return !1;
  const d = i.height > 0 ? i.height : l.offsetHeight, u = e.scrollTop + (i.top - c.top), f = Math.max(0, u + s * d - a);
  return n === "auto" ? e.scrollTop = f : e.scrollTo({ top: f, behavior: n }), !0;
}
function As(e, t, n = "smooth", r) {
  return Pn(
    e,
    { page: t, fraction: 0 },
    n,
    r
  );
}
function en(e, t, n) {
  const r = (n == null ? void 0 : n.behavior) ?? "auto", a = (n == null ? void 0 : n.delaysMs) ?? [0, 32, 120, 280];
  let o = !1, s = !1;
  const l = [], c = () => {
    var d;
    if (o) return;
    Pn(
      e(),
      t,
      r,
      n == null ? void 0 : n.pane
    ) && !s && (s = !0, (d = n == null ? void 0 : n.onDone) == null || d.call(n));
  };
  for (const i of a)
    i <= 0 ? requestAnimationFrame(() => {
      requestAnimationFrame(c);
    }) : l.push(setTimeout(c, i));
  return () => {
    o = !0;
    for (const i of l)
      clearTimeout(i);
  };
}
function xs(e, t, n) {
  return en(
    e,
    { page: t, fraction: 0 },
    n
  );
}
function Nt(e, t) {
  if (!Number.isFinite(e))
    return 1;
  const n = Math.max(1, Math.floor(e));
  return !Number.isFinite(t) || t <= 0 ? n : Math.min(t, n);
}
function be(e) {
  return {
    page: Math.max(1, Math.floor(Number(e.page) || 1)),
    fraction: Math.min(1, Math.max(0, Number(e.fraction) || 0))
  };
}
function Cs(e, t, n = !0, r = "", a) {
  const [o, s] = L(1);
  return $(() => {
    if (!n || t <= 0) {
      s(1);
      return;
    }
    const l = e.current;
    if (!l)
      return;
    let c = !1, i = null, d = 0;
    const u = ut(void 0, a), f = () => {
      if (c) return;
      const g = Array.from(l.querySelectorAll(u));
      if (!g.length)
        return;
      const h = Kr(l), b = Gr(g, h);
      b && s(b.page);
    }, m = () => {
      c || (d && cancelAnimationFrame(d), d = requestAnimationFrame(() => {
        d = 0, f();
      }));
    }, P = () => {
      if (c) return;
      if (!Array.from(l.querySelectorAll(u)).length) {
        i = setTimeout(P, 120);
        return;
      }
      f(), l.addEventListener("scroll", m, { passive: !0 });
    };
    return P(), () => {
      c = !0, i && clearTimeout(i), d && cancelAnimationFrame(d), l.removeEventListener("scroll", m);
    };
  }, [e, t, n, r, a]), o;
}
const Ls = `canvas, .react-pdf__Page, .${Br}, .${Mt}`, Gn = /* @__PURE__ */ new WeakMap();
function zs(e) {
  const t = Number(e.getAttribute(vn));
  if (Number.isFinite(t) && t > 0)
    return t;
  let n = Gn.get(e);
  if ((n == null || !n.isConnected) && (n = e.querySelector(Ls), Gn.set(e, n)), n) {
    const a = n.getBoundingClientRect().height;
    if (Number.isFinite(a) && a > 0)
      return a;
  }
  const r = e.getBoundingClientRect().height;
  return Number.isFinite(r) && r > 0 ? r : 0;
}
function Ds(e, t) {
  if (e.size !== t.size) return !1;
  for (const [n, r] of t)
    if (e.get(n) !== r) return !1;
  return !0;
}
function _s(e) {
  const t = /* @__PURE__ */ new Map();
  e.querySelectorAll(us()).forEach((r) => {
    const a = zt(r);
    if (!Number.isFinite(a) || a < 1) return;
    const o = zs(r);
    if (o <= 0) return;
    const s = t.get(a) || { height: 0, count: 0 };
    s.height = Math.max(s.height, o), s.count += 1, t.set(a, s);
  });
  const n = /* @__PURE__ */ new Map();
  return t.forEach((r, a) => {
    r.count >= 2 && r.height > 0 && n.set(a, Math.ceil(r.height));
  }), n;
}
function Os(e, t, n = "", r) {
  const [a, o] = L(() => /* @__PURE__ */ new Map()), s = N(a), l = N(r);
  return l.current = r, $e(() => {
    if (!t) {
      s.current.size !== 0 && (s.current = /* @__PURE__ */ new Map(), o(s.current));
      return;
    }
    let c = !1, i = 0, d = !1, u = !1;
    const f = () => {
      var w;
      if (c) return;
      const I = e.current;
      if (!I) return;
      const y = _s(I);
      Ds(s.current, y) || (s.current = y, o(y)), d && !u && (u = !0, (w = l.current) == null || w.call(l));
    }, m = () => {
      cancelAnimationFrame(i), i = requestAnimationFrame(() => {
        requestAnimationFrame(f);
      });
    };
    m();
    const P = window.setTimeout(m, 100), g = window.setTimeout(() => {
      d = !0, m();
    }, 300), h = window.setTimeout(m, 700), b = e.current;
    let S = null;
    return b && typeof ResizeObserver < "u" && (S = new ResizeObserver(() => m()), S.observe(b)), () => {
      c = !0, cancelAnimationFrame(i), window.clearTimeout(P), window.clearTimeout(g), window.clearTimeout(h), S == null || S.disconnect();
    };
  }, [e, t, n]), a;
}
const Fs = [0, 48, 140, 320, 560], $s = 700, js = [80, 200, 400], Us = 500, Bs = 50, Ws = 180, Yn = [0, 48, 140, 320, 700, 1200];
function Hs(e, t) {
  var T;
  const {
    primaryPane: n,
    mode: r,
    enabled: a = !0,
    persistenceKey: o = "",
    restoreReady: s = !0
  } = t, l = N(
    ((T = Ee(o)) == null ? void 0 : T.anchor) || { page: 1, fraction: 0 }
  ), c = N(null), i = N(!1), d = N(r), u = N(null), f = N(null), m = N(null), P = N(null), g = N(o), h = N(""), b = N(n);
  b.current = n;
  const S = x(() => {
    var v;
    (v = u.current) == null || v.call(u), u.current = null, f.current != null && (clearTimeout(f.current), f.current = null);
  }, []), I = x((v = !1) => {
    P.current != null && (clearTimeout(P.current), P.current = null);
    const M = () => {
      P.current = null, kt(g.current, {
        anchor: be(l.current)
      });
    };
    v ? M() : P.current = setTimeout(M, Ws);
  }, []), y = x((v) => {
    l.current = be(v), c.current = null, m.current != null && clearTimeout(m.current), m.current = setTimeout(() => {
      m.current = null, i.current = !1;
    }, Bs);
  }, []);
  $(() => {
    if (!a)
      return;
    let v = !1, M = null, C = null, z = null;
    const O = () => {
      if (v) return;
      const B = e.current;
      if (!B) {
        z = setTimeout(O, 50);
        return;
      }
      M = B, C = () => {
        if (i.current)
          return;
        const ee = jt(M, b.current);
        ee && (l.current = ee, I());
      }, M.addEventListener("scroll", C, { passive: !0 }), i.current || C();
    };
    return O(), () => {
      v = !0, z != null && clearTimeout(z), M && C && M.removeEventListener("scroll", C);
    };
  }, [a, r, n, e, I]), $e(() => {
    var M;
    if (g.current === o) return;
    I(!0), S(), m.current != null && (clearTimeout(m.current), m.current = null), g.current = o, h.current = "";
    const v = (M = Ee(o)) == null ? void 0 : M.anchor;
    l.current = v ? be(v) : { page: 1, fraction: 0 }, c.current = null, i.current = !!o, d.current = r;
  }, [o, r, I, S]), $(() => {
    var M;
    if (!a || !s || !o || h.current === o) return;
    h.current = o;
    const v = be(
      ((M = Ee(o)) == null ? void 0 : M.anchor) || { page: 1, fraction: 0 }
    );
    return l.current = v, c.current = v, i.current = !0, S(), u.current = en(
      () => e.current,
      v,
      {
        behavior: "auto",
        pane: b.current,
        delaysMs: Yn,
        onDone: () => y(v)
      }
    ), f.current = setTimeout(() => {
      f.current = null, y(v);
    }, Math.max(...Yn) + 160), () => S();
  }, [a, s, o, e, y, S]), $(() => {
    if (d.current === r)
      return;
    if (d.current = r, !a) {
      i.current = !1, c.current = null, S();
      return;
    }
    const v = c.current ? be(c.current) : be(l.current);
    return i.current = !0, c.current = v, l.current = v, S(), u.current = en(
      () => e.current,
      v,
      {
        behavior: "auto",
        pane: n,
        // 等页宽/行高同步后再钉；同一 locked 幂等，不会越滚越远
        delaysMs: Fs,
        onDone: () => y(v)
      }
    ), f.current = setTimeout(() => {
      f.current = null, y(v);
    }, $s), () => {
      S();
    };
  }, [r, a, n, e, y, S]), $(() => () => {
    S(), m.current != null && (clearTimeout(m.current), m.current = null), I(!0);
  }, [S, I]);
  const w = x(() => {
    const v = jt(
      e.current,
      b.current
    );
    return be(v || l.current);
  }, [e]), A = x(() => {
    i.current = !0;
    const v = jt(
      e.current,
      b.current
    ), M = be(v ?? l.current);
    return l.current = M, c.current = M, I(), M;
  }, [e, I]), E = x((v, M, C) => {
    const z = C || b.current, O = Nt(v, M || 1), B = { page: O, fraction: 0 };
    l.current = B, i.current = !0, c.current = B, I(), S(), As(e.current, O, "smooth", z), u.current = xs(
      () => e.current,
      O,
      {
        behavior: "auto",
        pane: z,
        delaysMs: js,
        onDone: () => y(B)
      }
    ), f.current = setTimeout(() => {
      f.current = null, y(B);
    }, Us);
  }, [e, y, S, I]), _ = x(() => be(l.current), []), k = x(() => i.current, []), R = x(() => {
    if (!i.current || !c.current)
      return;
    const v = be(c.current);
    Pn(
      e.current,
      v,
      "auto",
      b.current
    );
  }, [e]);
  return {
    lockFromShell: w,
    beginModeSwitch: A,
    goToPage: E,
    getAnchor: _,
    isRestoring: k,
    repinIfRestoring: R
  };
}
function Js(e, t) {
  if (!e) return null;
  if (e.blockId && t) {
    const a = t(e.blockId);
    if (a != null && Number.isFinite(a) && a >= 1)
      return Math.floor(a);
  }
  if (e.pageIdx === null || e.pageIdx === void 0) return null;
  const n = Number(e.pageIdx);
  if (!Number.isFinite(n)) return null;
  const r = Math.floor(n) + 1;
  return r >= 1 ? r : null;
}
function Yr(e, t, n) {
  const r = `${(n == null ? void 0 : n.jobId) || ""}`.trim(), a = `${(n == null ? void 0 : n.documentId) || ""}`.trim(), o = `j:${r}:d:${a}`;
  return t == null ? `${o}:none:${(e == null ? void 0 : e.blockId) || ""}` : `${o}:p:${t}:b:${(e == null ? void 0 : e.blockId) || ""}`;
}
const Vs = [0, 80, 200, 400, 800], qs = 120, Ks = 400;
function Gs(e, t, n) {
  const { enabled: r, numPages: a, goToPage: o, resolveBlockPage: s, onAnchorApplied: l, jobId: c, documentId: i } = e, d = N(o);
  d.current = o;
  const u = N(s);
  u.current = s;
  const f = N(l);
  f.current = l;
  const m = N(n);
  m.current = n, $(() => {
    var I, y;
    if (!r || !Number.isFinite(a) || a < 1)
      return;
    const P = Ea(), g = Js(P, u.current), h = Yr(P, g, { jobId: c, documentId: i });
    if (t.current === h)
      return;
    if (g == null) {
      t.current = h, (I = m.current) == null || I.call(m);
      return;
    }
    t.current = h, P && ((y = f.current) == null || y.call(f, P, g));
    const b = [];
    let S = 0;
    for (const w of Vs)
      S = Math.max(S, w), b.push(
        setTimeout(() => {
          d.current(g);
        }, w)
      );
    return b.push(
      setTimeout(() => {
        var w;
        (w = m.current) == null || w.call(m);
      }, S + qs)
    ), () => {
      for (const w of b) clearTimeout(w);
    };
  }, [r, a, c, i, t]);
}
function Ys(e) {
  var o;
  const t = globalThis.window;
  if (!t || typeof ((o = t.history) == null ? void 0 : o.replaceState) != "function") return;
  const n = t.location, r = `${e || ""}`, a = `${n.pathname}${r ? `?${r}` : ""}${n.hash || ""}`;
  t.history.replaceState(null, "", a);
}
function Zs(e, t, n) {
  const {
    syncEnabled: r,
    currentPage: a,
    resolveBlockPage: o,
    syncDebounceMs: s = Ks,
    jobId: l,
    documentId: c,
    applyReaderSearch: i
  } = e, d = N(o);
  d.current = o;
  const u = N(i);
  u.current = i;
  const f = N(0);
  $(() => {
    if (!n || !r || !t.current || !Number.isFinite(a) || a < 1 || f.current === a) return;
    const m = setTimeout(() => {
      var b;
      const P = ((b = globalThis.location) == null ? void 0 : b.search) || "", g = zo(P, a, d.current);
      if (f.current = a, g === null) return;
      const h = `${new URLSearchParams(g).get("block_id") || ""}`.trim();
      t.current = Yr(
        { blockId: h },
        a,
        { jobId: l, documentId: c }
      ), (u.current || Ys)(g);
    }, s);
    return () => clearTimeout(m);
  }, [
    n,
    r,
    a,
    s,
    l,
    c,
    t
  ]);
}
function Xs(e) {
  const t = N(""), [n, r] = L(!1), a = x(() => r(!0), []), o = {
    enabled: e.enabled,
    numPages: e.numPages,
    goToPage: e.goToPage,
    resolveBlockPage: e.resolveBlockPage,
    onAnchorApplied: e.onAnchorApplied,
    jobId: e.jobId,
    documentId: e.documentId
  };
  Gs(o, t, a), Zs(e, t, n), wa(e.currentPage, e.numPages, n && e.syncEnabled);
}
const rt = {
  layoutByPage: /* @__PURE__ */ new Map(),
  pagesByPage: /* @__PURE__ */ new Map(),
  lastSeq: 0,
  connection: "idle",
  jobStatus: "",
  error: ""
};
function Qs(e) {
  return new Map(((e == null ? void 0 : e.pages) || []).map((t) => [t.page_idx, t]));
}
function Zn(e, t) {
  return e.attempt !== t.attempt ? e.attempt < t.attempt ? -1 : 1 : e.generation !== t.generation ? e.generation < t.generation ? -1 : 1 : 0;
}
function Zr(e, t, n) {
  if (n.page_idx !== t.page_idx) return "retry";
  const r = Zn(n, t);
  if (r < 0 || r === 0 && n.page_hash !== t.page_hash) return "retry";
  if (!e) return "accept";
  const a = Zn(n, e);
  return a < 0 ? "ignore" : a === 0 ? n.page_hash === e.pageHash ? "ignore" : "retry" : "accept";
}
function ei(e, t, n) {
  if (t.seq <= e.lastSeq) return e;
  const r = e.pagesByPage.get(t.page_idx), a = Zr(r, t, n);
  if (a === "retry") return e;
  if (a === "ignore")
    return { ...e, lastSeq: t.seq, connection: "live", error: "" };
  const o = new Map(n.items.map((c) => [c.item_id, c])), s = new Map((r == null ? void 0 : r.changedAtSeqById) || []);
  for (const c of t.changed_item_ids)
    o.has(c) && s.set(c, t.seq);
  const l = new Map(e.pagesByPage);
  return l.set(t.page_idx, {
    attempt: n.attempt,
    generation: n.generation,
    pageHash: n.page_hash,
    itemsById: o,
    changedAtSeqById: s,
    lastEventSeq: t.seq
  }), {
    ...e,
    pagesByPage: l,
    lastSeq: t.seq,
    connection: "live",
    error: ""
  };
}
const Xn = [250, 500, 1e3, 2e3, 4e3], Ut = [80, 160, 320, 640, 1e3, 1500], Qn = [250, 500, 1e3, 2e3, 4e3, 5e3], ti = /* @__PURE__ */ new Set(["succeeded", "failed", "cancelled", "canceled"]);
function tn(e, t) {
  return new Promise((n, r) => {
    if (t.aborted) {
      r(new DOMException("Aborted", "AbortError"));
      return;
    }
    const a = () => {
      clearTimeout(o), r(new DOMException("Aborted", "AbortError"));
    }, o = setTimeout(() => {
      t.removeEventListener("abort", a), n();
    }, e);
    t.addEventListener("abort", a, { once: !0 });
  });
}
function In(e) {
  return Jo(e) ? `${e.code || ""}`.trim() : "";
}
function St(e, t) {
  const n = In(e);
  return n === "LIVE_TRANSLATION_PAGE_NOT_COMMITTED" ? "尚未收到可显示的页面译文" : n === "LIVE_TRANSLATION_LAYOUT_NOT_READY" ? "正在等待 OCR 版面数据" : `${(e == null ? void 0 : e.message) || ""}`.trim() || t;
}
async function ni(e, t, n, r, a) {
  let o = null;
  for (let s = 0; ; s += 1) {
    try {
      const c = await a.fetchPage(e, t.page_idx, { signal: r });
      if (Zr(n.pagesByPage.get(t.page_idx), t, c) !== "retry")
        return c;
      o = Vo(
        "Authoritative page snapshot has not reached the event generation",
        409,
        "LIVE_TRANSLATION_SNAPSHOT_UNAVAILABLE"
      );
    } catch (c) {
      if ((c == null ? void 0 : c.name) === "AbortError") throw c;
      o = c;
      const i = In(c);
      if (i && ![
        "LIVE_TRANSLATION_PAGE_NOT_COMMITTED",
        "LIVE_TRANSLATION_SNAPSHOT_UNAVAILABLE"
      ].includes(i)) throw c;
    }
    const l = Ut[Math.min(s, Ut.length - 1)];
    if (await tn(l, r), s >= Ut.length + 2) throw o;
  }
}
function ri({
  jobId: e,
  jobStatus: t,
  enabled: n,
  liveTranslationPort: r = void 0
}) {
  const [a, o] = L(rt), s = N(a), l = N("");
  s.current = a;
  const c = `${e || ""}`.trim(), i = `${t || ""}`.trim().toLowerCase(), d = ti.has(i) ? i : "";
  return $(() => {
    if (!n || !c) {
      l.current = "", s.current = rt, o(rt);
      return;
    }
    const u = r === void 0 ? Ta() : r, f = l.current === c;
    if (l.current = c, !u) {
      const I = {
        ...f ? s.current : rt,
        connection: d ? "terminal" : "unavailable",
        jobStatus: i,
        error: "实时译文暂不可用"
      };
      s.current = I, o(I);
      return;
    }
    const m = new AbortController();
    let P = !1;
    const g = {
      ...f ? s.current : rt,
      connection: d ? "terminal" : "connecting",
      jobStatus: i,
      error: ""
    };
    s.current = g, o(g);
    const h = (I) => {
      m.signal.aborted || o((y) => {
        const w = I(y);
        return s.current = w, w;
      });
    }, b = async () => {
      let I = 0;
      for (; !m.signal.aborted; )
        try {
          const y = await u.fetchLayout(c, { signal: m.signal });
          P = !0, h((w) => ({
            ...w,
            layoutByPage: Qs(y),
            jobStatus: i,
            error: ""
          }));
          return;
        } catch (y) {
          if ((y == null ? void 0 : y.name) === "AbortError") return;
          const w = In(y);
          if (!(w === "LIVE_TRANSLATION_LAYOUT_NOT_READY" || !w)) {
            h((E) => ({
              ...E,
              connection: d ? "terminal" : "unavailable",
              jobStatus: i,
              error: St(y, "实时译文暂不可用")
            }));
            return;
          }
          if (d) {
            h((E) => ({
              ...E,
              connection: "terminal",
              jobStatus: i,
              error: ""
            }));
            return;
          }
          h((E) => ({
            ...E,
            connection: "connecting",
            jobStatus: i,
            error: St(y, "正在等待 OCR 版面数据")
          })), await tn(Xn[Math.min(I, Xn.length - 1)], m.signal).catch(() => {
          }), I += 1;
        }
    };
    return (async () => {
      if (await b(), !P || m.signal.aborted) return;
      let I = 0;
      for (; !m.signal.aborted; ) {
        d || h((y) => ({
          ...y,
          connection: y.lastSeq > 0 ? "reconnecting" : "connecting",
          jobStatus: i,
          // 保留已有错误：首页还没提交（lastSeq 为 0）时恰恰是最容易出错的阶段，
          // 此前这里把它清成空串，UI 于是一直显示「连接中」，用户看到的是
          // "正在努力"，实际可能已经在反复失败。
          error: y.error
        }));
        try {
          await u.streamEvents(c, {
            afterSeq: s.current.lastSeq,
            signal: m.signal,
            onEvent: async (y) => {
              if (y.seq <= s.current.lastSeq) return;
              let w;
              try {
                w = await ni(
                  c,
                  y,
                  s.current,
                  m.signal,
                  u
                );
              } catch (A) {
                if ((A == null ? void 0 : A.name) === "AbortError" || m.signal.aborted) throw A;
                h((E) => ({
                  ...E,
                  lastSeq: Math.max(E.lastSeq, y.seq),
                  error: St(A, "部分页面的实时译文暂时取不到")
                }));
                return;
              }
              h((A) => {
                const E = ei(A, y, w);
                return d ? {
                  ...E,
                  connection: "terminal",
                  jobStatus: i
                } : {
                  ...E,
                  jobStatus: i
                };
              }), I = 0;
            }
          });
        } catch (y) {
          if ((y == null ? void 0 : y.name) === "AbortError" || m.signal.aborted) return;
          h((w) => ({
            ...w,
            connection: d ? "terminal" : "reconnecting",
            jobStatus: i,
            error: St(y, "实时译文连接已中断，正在重连")
          }));
        }
        if (m.signal.aborted) return;
        if (d) {
          h((y) => ({
            ...y,
            connection: "terminal",
            jobStatus: i
          }));
          return;
        }
        await tn(Qn[Math.min(I, Qn.length - 1)], m.signal).catch(() => {
        }), I += 1;
      }
    })(), () => m.abort();
  }, [n, r, c, d]), a;
}
const oi = 2e3;
function ai(e) {
  if (typeof e == "number") {
    const r = Number(e);
    return !Number.isFinite(r) || r < 0 ? null : Math.floor(r) + 1;
  }
  if (!e || typeof e != "object") return null;
  const t = e.page_idx;
  if (t != null && `${t}`.trim() !== "") {
    const r = Number(t);
    return !Number.isFinite(r) || r < 0 ? null : Math.floor(r) + 1;
  }
  const n = e.page;
  if (n != null && `${n}`.trim() !== "") {
    const r = Number(n);
    return !Number.isFinite(r) || r < 1 ? null : Math.floor(r);
  }
  return null;
}
const si = /* @__PURE__ */ new Set(["book", "translate"]);
function Xr(e) {
  return !!(e.jobId && e.sourceUrl && si.has(e.workflow));
}
function ii(e) {
  return !!(Xr(e) && !(e.jobStatus === "succeeded" && e.translatedUrl));
}
function ci() {
  const e = es(), t = Xr({
    jobId: e.jobId,
    sourceUrl: e.sourceUrl,
    workflow: e.workflow
  }), n = ii({
    jobId: e.jobId,
    sourceUrl: e.sourceUrl,
    translatedUrl: e.translatedUrl,
    jobStatus: e.jobStatus,
    workflow: e.workflow
  }), r = ri({
    jobId: e.jobId,
    jobStatus: e.jobStatus,
    enabled: t
  }), a = Ns(), { shellRef: o, shellEl: s, shellWidth: l, bindShell: c } = os(), i = Ss({
    documentId: e.documentId,
    jobId: e.jobId
  }), d = `${i}\0${e.jobId}\0${e.sourceUrl}\0${e.translatedUrl}`, { userZoom: u, onZoomChange: f } = Es(e.mode, o, i), m = ss(
    {
      mode: e.mode,
      sourceOnly: e.sourceOnly,
      assetsReady: e.assetsReady,
      sourceUrl: e.sourceUrl,
      translatedUrl: e.translatedUrl,
      sourceFile: e.sourceFile,
      translatedFile: e.translatedFile
    },
    { userZoom: u, shellWidth: l, identityKey: d }
  ), {
    beginModeSwitch: P,
    goToPage: g,
    repinIfRestoring: h
  } = Hs(o, {
    primaryPane: m.primaryPane,
    mode: e.mode,
    enabled: !e.boot.loading,
    persistenceKey: i,
    restoreReady: m.primaryNumPages > 0
  });
  $(() => {
    h();
  }, [l, h]);
  const b = Os(
    o,
    m.compareMode,
    m.rowSyncRevision,
    h
  ), S = Cs(
    o,
    m.primaryNumPages,
    !e.boot.loading,
    `${e.mode}-${u}-${m.metricsTick}`,
    m.primaryPane
  ), I = x((U, K) => {
    var Q, le;
    const Z = Math.max(
      Number(m.hudNumPages) || 0,
      Number(m.primaryNumPages) || 0,
      Number((Q = m.numPagesByPane) == null ? void 0 : Q.source) || 0,
      Number((le = m.numPagesByPane) == null ? void 0 : le.translated) || 0
    );
    g(U, Z, K);
  }, [g, m.hudNumPages, m.primaryNumPages, m.numPagesByPane]), [y, w] = L(null), A = N(null), E = x((U) => {
    A.current && clearTimeout(A.current), w(U), U && (A.current = setTimeout(() => w(null), oi));
  }, []);
  $(() => () => {
    A.current && clearTimeout(A.current);
  }, []);
  const _ = x((U) => {
    const K = Ot(e.regions, U);
    return K ? Bn(K, m.primaryPane).page : null;
  }, [e.regions, m.primaryPane]), k = x((U, K) => {
    const Z = K || m.primaryPane, Q = typeof U == "object" && U ? `${U.block_id || ""}`.trim() : "", le = typeof U == "object" && U ? `${U.image_url || ""}`.trim() : "", pe = typeof U == "object" && U ? U.page_idx != null ? Number(U.page_idx) + 1 : U.page != null ? Number(U.page) : null : typeof U == "number" ? U + 1 : null, me = Oo(e.regions, le, pe) || Ot(e.regions, Q) || (typeof U == "object" ? Fo(e.regions, U) : null);
    let he = me ? Bn(me, Z).page : null;
    he == null && (he = ai(U)), !(he == null || he < 1) && (E(me), I(he, Z));
  }, [E, I, m.primaryPane, e.regions]);
  Xs({
    enabled: !e.boot.loading && !e.boot.failed && e.assetsReady,
    syncEnabled: !e.boot.loading && !e.boot.failed && e.assetsReady,
    numPages: m.hudNumPages || 0,
    currentPage: S,
    goToPage: I,
    resolveBlockPage: _,
    jobId: e.jobId,
    documentId: e.documentId,
    onAnchorApplied: (U) => {
      E(Ot(e.regions, U.blockId));
    }
  });
  const { setModeKeepingPage: R } = ks({
    mode: e.mode,
    setMode: e.setMode,
    beginModeSwitch: P
  }), [T, v] = L(null), {
    selection: M,
    clearSelection: C
  } = Ms(o, !e.boot.loading && !e.boot.failed), z = x(() => {
    v(null), C();
  }, [C]), O = x((U) => {
    C(), v(U);
  }, [C]);
  $(() => {
    M && v(null);
  }, [M]), $(() => {
    const U = o.current;
    if (!U) return;
    const K = () => v(null);
    return U.addEventListener("scroll", K, { passive: !0 }), () => U.removeEventListener("scroll", K);
  }, [s, o]);
  const B = M || T;
  $(() => {
    E(null), z();
  }, [d, E, z]);
  const ee = !e.boot.loading && !e.boot.failed, X = q(() => a, [a.active, a.open, a.close, a.toggle, a.isOpen]), oe = q(() => ({ bindShell: c, shellEl: s, shellWidth: l, shellRef: o }), [c, s, l, o]), re = q(() => ({
    sourceUrl: e.sourceUrl,
    translatedUrl: e.translatedUrl,
    sourceFile: e.sourceFile,
    translatedFile: e.translatedFile
  }), [e.sourceUrl, e.translatedUrl, e.sourceFile, e.translatedFile]), ie = q(() => ({
    session: e,
    boot: e.boot,
    sourceOnly: e.sourceOnly,
    mode: e.mode,
    userZoom: u,
    onZoomChange: f,
    shell: oe,
    panes: m,
    sessionFiles: re,
    rowHeights: b,
    goToPage: I,
    activeRegion: y,
    jumpToAnchor: k,
    setModeKeepingPage: R,
    download: e.download,
    showHud: ee,
    tools: X,
    selection: B,
    clearSelection: z,
    selectRegion: O,
    viewStateKey: i,
    liveTranslation: r,
    liveTranslationAvailable: n
  }), [e, oe, m, re, b, I, y, k, R, ee, X, B, z, O, u, f, i, r, n]);
  return q(() => ({
    ...ie,
    currentPage: S
  }), [ie, S]);
}
const li = [
  { action: "mode-source", keys: ["1"], mode: "source" },
  { action: "mode-compare", keys: ["2"], mode: "compare" },
  { action: "mode-translated", keys: ["3"], mode: "translated" },
  { action: "zoom-in", keys: ["+", "="] },
  { action: "zoom-out", keys: ["-", "_"] },
  { action: "zoom-reset", keys: ["0"] },
  { action: "next-page", keys: ["j", "ArrowDown", "PageDown"], requiresPages: !0 },
  { action: "prev-page", keys: ["k", "ArrowUp", "PageUp"], requiresPages: !0 },
  { action: "first-page", keys: ["Home"], requiresPages: !0 },
  { action: "last-page", keys: ["End"], requiresPages: !0 }
], di = [
  {
    title: "翻页",
    items: [
      { actions: ["next-page"], keys: "J · ↓ · PgDn", desc: "下一页" },
      { actions: ["prev-page"], keys: "K · ↑ · PgUp", desc: "上一页" },
      { actions: ["first-page", "last-page"], keys: "Home / End", desc: "首页 / 末页" },
      { actions: [], keys: "点底栏页码", desc: "输入页码跳转" }
    ]
  },
  {
    title: "缩放",
    items: [
      { actions: ["zoom-in", "zoom-out"], keys: "+ / −", desc: "放大 / 缩小" },
      { actions: ["zoom-reset"], keys: "0", desc: "重置为模式默认" },
      { actions: [], keys: "点百分比", desc: "重置为模式默认" }
    ]
  },
  {
    title: "模式",
    items: [
      { actions: ["mode-source"], keys: "1", desc: "源文件" },
      { actions: ["mode-compare"], keys: "2", desc: "对照" },
      { actions: ["mode-translated"], keys: "3", desc: "翻译文件" }
    ]
  }
];
function ui(e) {
  const t = e.length === 1 ? e.toLowerCase() : e;
  for (const n of li)
    if (n.keys.some(
      (a) => a.length === 1 ? a === t : a === e
    )) return n;
  return null;
}
function fi(e) {
  if (!(e instanceof HTMLElement))
    return !1;
  const t = e.tagName;
  return t === "INPUT" || t === "TEXTAREA" || t === "SELECT" || e.isContentEditable ? !0 : !!e.closest("input, textarea, select, [contenteditable='true']");
}
function mi(e) {
  const {
    mode: t,
    sourceOnly: n,
    setMode: r,
    userZoom: a,
    onZoomChange: o,
    currentPage: s,
    numPages: l,
    goToPage: c,
    enabled: i = !0
  } = e;
  $(() => {
    if (!i)
      return;
    const d = (u) => {
      if (!u.defaultPrevented && !u.isComposing && !u.altKey && (u.ctrlKey || u.metaKey) && ["=", "+", "-", "0"].includes(u.key) && Me(window.location.search)) {
        u.preventDefault(), o(u.key === "0" ? Ke() : Ge(a, u.key === "-" ? -1 : 1));
        return;
      }
      if (u.defaultPrevented || u.metaKey || u.ctrlKey || u.altKey || fi(u.target))
        return;
      const f = u.key, m = ui(f);
      if (m) {
        if (m.mode) {
          if (n && m.mode !== "source")
            return;
          u.preventDefault(), r(m.mode);
          return;
        }
        if (!(m.requiresPages && l <= 0))
          switch (u.preventDefault(), m.action) {
            case "zoom-in":
              o(Ge(a, 1));
              return;
            case "zoom-out":
              o(Ge(a, -1));
              return;
            case "zoom-reset":
              o(Ke());
              return;
            case "next-page":
              c(Nt(s + 1, l));
              return;
            case "prev-page":
              c(Nt(s - 1, l));
              return;
            case "first-page":
              c(1);
              return;
            case "last-page":
              c(l);
              return;
          }
      }
    };
    return window.addEventListener("keydown", d), () => window.removeEventListener("keydown", d);
  }, [
    i,
    t,
    n,
    r,
    a,
    o,
    s,
    l,
    c
  ]);
}
function pi() {
  return new URL("./index.html", window.location.href).href;
}
function hi() {
  if (typeof window > "u" || window.self === window.top) return !1;
  try {
    return window.parent.postMessage(
      { type: qo },
      window.location.origin
    ), !0;
  } catch {
    return !1;
  }
}
function gi(e, t, n) {
  if (n <= 1 || !e) return !1;
  try {
    const r = new URL(t), a = new URL(e, r);
    return a.origin === r.origin && !/reader\.html$/i.test(a.pathname) && !/detail\.html$/i.test(a.pathname);
  } catch {
    return !1;
  }
}
function bi() {
  if (!(typeof window > "u") && !hi()) {
    if (gi(
      document.referrer,
      window.location.href,
      window.history.length
    )) {
      window.history.back();
      return;
    }
    window.location.assign(pi());
  }
}
function yi({ onBeforeClose: e } = {}) {
  var n, r;
  return Me(((r = (n = globalThis.window) == null ? void 0 : n.location) == null ? void 0 : r.search) || "") ? null : /* @__PURE__ */ D(
    "button",
    {
      id: "reader-close-home-btn",
      type: "button",
      className: "reader-close-home-btn",
      "aria-label": "返回主页",
      title: "返回主页",
      onClick: () => {
        e == null || e(), bi();
      },
      children: [
        /* @__PURE__ */ p(tt, { className: "reader-close-home-icon", size: 18, strokeWidth: 2.25, "aria-hidden": !0 }),
        /* @__PURE__ */ p("span", { className: "reader-close-home-label", children: "关闭" })
      ]
    }
  );
}
let er = !1;
function vi() {
  if (er)
    return;
  const e = dt().resolvePdfjsVendorUrl("build/pdf.worker.mjs");
  e && (la.GlobalWorkerOptions.workerSrc = e, er = !0);
}
const wi = {
  formula: "公式",
  table: "表格",
  figure: "图片",
  text: "文字",
  region: "区域"
};
function Si({
  pane: e,
  width: t,
  height: n,
  regions: r,
  onSelect: a
}) {
  const o = r.flatMap((s) => {
    if (!Mr(s.region)) return [];
    const l = Ct(s, t, n);
    return l ? [{ highlight: s, rect: l }] : [];
  });
  return o.length ? /* @__PURE__ */ p("div", { className: "reader-structure-selection-layer", "aria-label": "PDF 结构选择层", children: o.map(({ highlight: s, rect: l }) => {
    const c = s.region, i = kr(c), d = wi[i];
    return /* @__PURE__ */ D(
      "button",
      {
        type: "button",
        className: `reader-structure-selection-target is-${i}`,
        "data-reader-region-id": c.itemId,
        "data-reader-region-kind": i,
        style: l,
        "aria-label": `${d}区域，点击选择`,
        title: `${d} · 点击选择`,
        onClick: (u) => {
          u.stopPropagation();
          const f = u.currentTarget.getBoundingClientRect();
          a == null || a({
            selectionType: "region",
            region: c,
            kind: i,
            page: s.box.page,
            pane: e,
            rect: {
              left: f.left,
              top: f.top,
              width: f.width,
              height: f.height
            }
          });
        },
        children: [
          /* @__PURE__ */ p("span", { className: "reader-structure-selection-label", "aria-hidden": "true", children: d }),
          /* @__PURE__ */ p("span", { className: "sr-only", children: Nr(c, e) })
        ]
      },
      c.itemId
    );
  }) }) : null;
}
function Pi(e, t, n) {
  return e.flatMap((r) => {
    if (kr(r.region) !== "text") return [];
    const a = Ct(r, t, n);
    return a ? [{ itemId: r.itemId, highlight: r, rect: a }] : [];
  });
}
function tr(e, t, n) {
  let r = null, a = Number.POSITIVE_INFINITY;
  for (const o of e) {
    const { rect: s } = o;
    if (t < s.left || t > s.left + s.width || n < s.top || n > s.top + s.height)
      continue;
    const l = s.width * s.height;
    l < a && (r = o, a = l);
  }
  return r;
}
function Ii({ target: e }) {
  return e ? /* @__PURE__ */ p("div", { className: "reader-text-hover-layer", "aria-hidden": "true", children: /* @__PURE__ */ p(
    "div",
    {
      className: "reader-text-hover-frame",
      "data-reader-text-hover-id": e.itemId,
      style: e.rect,
      children: /* @__PURE__ */ p("span", { className: "reader-text-hover-label", children: "文字" })
    }
  ) }) : null;
}
function Ri(e, t) {
  const n = e.page_idx + 1, r = {
    page: n,
    bbox: t.bbox,
    unit: "pdf_point",
    origin: "top_left",
    text: t.source_text
  }, a = {
    itemId: t.item_id,
    source: r,
    translated: r,
    markdown: t.source_text,
    regionType: t.kind,
    status: "live_translation",
    assetIds: [],
    assetUrls: []
  };
  return {
    itemId: t.item_id,
    region: a,
    box: r,
    pageSize: { page: n, width: e.width, height: e.height }
  };
}
function Ti(e, t, n, r) {
  if (!e || !t) return [];
  const a = [];
  for (const o of e.blocks) {
    const s = t.itemsById.get(o.item_id);
    if (!(s != null && s.translated_text)) continue;
    const l = Ct(
      Ri(e, o),
      n,
      r
    );
    l && a.push({
      itemId: o.item_id,
      translatedText: s.translated_text,
      status: s.status,
      kind: o.kind,
      sourceText: o.source_text,
      typography: o.typography,
      rect: l,
      changedAtSeq: t.changedAtSeqById.get(o.item_id) || 0,
      changedNow: t.changedAtSeqById.get(o.item_id) === t.lastEventSeq
    });
  }
  return a;
}
const Ei = '"Source Han Serif SC", "Noto Serif CJK SC", "Songti SC", serif', Mi = 256, ot = /* @__PURE__ */ new Map();
function ki(e) {
  return `${e || ""}`.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
function Ni(e) {
  const t = `${e || ""}`, { text: n, slots: r } = fa(t, { bareLatex: !0 }), a = ki(n), o = ma(a, r);
  if (!r.length)
    return { fallbackHtml: o, richHtml: Promise.resolve(o), hasMath: !1 };
  let s = ot.get(t);
  if (!s && (s = pa(a, r), ot.set(t, s), ot.size > Mi)) {
    const l = ot.keys().next().value;
    l !== void 0 && ot.delete(l);
  }
  return { fallbackHtml: o, richHtml: s, hasMath: !0 };
}
function Bt(e) {
  return /title|heading|header|display_formula|equation/i.test(e);
}
function Te(e) {
  const t = Number(e);
  return Number.isFinite(t) && t > 0 ? t : void 0;
}
function Ai(e, t) {
  const n = e.typography, r = Te(t) || 1, a = Te(n == null ? void 0 : n.font_size_pt), o = Math.max(1, `${e.sourceText || ""}`.split(/\n+/).length), s = e.rect.height / Math.max(1.28, o * 1.18), l = Bt(e.kind) ? 24 : /caption|footnote|table/i.test(e.kind) ? 9.5 : 11, c = Math.max(5.5 * r, Math.min(s, l * r)), i = Te(n == null ? void 0 : n.fit_min_font_size_pt), d = Te(n == null ? void 0 : n.fit_max_font_size_pt), u = Math.max(3.5, (i || 5.5) * r), f = Math.max(
    u,
    d ? d * r : a ? a * r : c
  ), m = a ? a * r : c, P = Te(n == null ? void 0 : n.leading_em), g = [
    Te(n == null ? void 0 : n.padding_top_pt) || 0,
    Te(n == null ? void 0 : n.padding_right_pt) || 0,
    Te(n == null ? void 0 : n.padding_bottom_pt) || 0,
    Te(n == null ? void 0 : n.padding_left_pt) || 0
  ].map((h) => h * r);
  return {
    fontFamily: `${(n == null ? void 0 : n.font_family) || ""}`.trim() || Ei,
    fontSizePx: Math.max(u, Math.min(f, m)),
    minFontSizePx: u,
    maxFontSizePx: f,
    // Typst leading is the additional inter-line gap, unlike CSS line-height.
    lineHeight: P ? 1 + P : 1.3,
    fontWeight: (n == null ? void 0 : n.font_weight) || (Bt(e.kind) ? 600 : 400),
    textAlign: ["left", "center", "right", "justify"].includes(`${(n == null ? void 0 : n.text_align) || ""}`) ? n == null ? void 0 : n.text_align : Bt(e.kind) ? "center" : "justify",
    padding: g,
    exact: !!a
  };
}
function xi(e, t, n, r) {
  const { minFontSizePx: a, maxFontSizePx: o } = r, s = /* @__PURE__ */ new Map(), l = (u) => {
    const f = s.get(u);
    if (f !== void 0) return f;
    const { width: m, height: P } = e(u), g = m <= t + 0.5 && P <= n + 0.5;
    return s.set(u, g), g;
  };
  let c = a, i = o, d = Math.min(r.requestedFontSizePx, i);
  if (l(d)) {
    if (!r.exact) {
      c = d;
      for (let u = 0; u < 6 && i > c; u += 1) {
        const f = (c + i) / 2;
        l(f) ? (d = f, c = f) : i = f;
      }
    }
  } else {
    i = d, d = c;
    for (let u = 0; u < 8 && i > c; u += 1) {
      const f = (c + i) / 2;
      l(f) ? (d = f, c = f) : i = f;
    }
  }
  return Math.max(a, d);
}
const Ci = 512, at = /* @__PURE__ */ new Map();
let nn = 0;
typeof document < "u" && document.fonts && (document.fonts.ready.then(() => {
  nn += 1;
}).catch(() => {
}), typeof document.fonts.addEventListener == "function" && document.fonts.addEventListener("loadingdone", () => {
  nn += 1;
}));
function Li(e, t, n, r) {
  return [
    nn,
    r.fontFamily,
    r.fontWeight,
    r.lineHeight,
    r.textAlign,
    r.minFontSizePx,
    r.maxFontSizePx,
    r.fontSizePx,
    r.exact ? 1 : 0,
    t,
    n,
    e
  ].join("");
}
function zi({ item: e, pageScale: t }) {
  const n = N(null), r = q(
    () => Ni(e.translatedText),
    [e.translatedText]
  ), [a, o] = L(r.fallbackHtml), s = q(
    () => Ai(e, t),
    [e, t]
  );
  $(() => {
    let u = !0;
    return o(r.fallbackHtml), r.hasMath && r.richHtml.then((f) => {
      u && o(f);
    }), () => {
      u = !1;
    };
  }, [r]), $e(() => {
    const u = n.current;
    if (!u) return;
    const [f, m, P, g] = s.padding, h = Math.max(1, e.rect.width - g - m), b = Math.max(1, e.rect.height - f - P), S = Li(a, h, b, s);
    let I = at.get(S);
    if (I === void 0 && (I = xi(
      (y) => (u.style.fontSize = `${y}px`, { width: u.scrollWidth, height: u.scrollHeight }),
      h,
      b,
      {
        minFontSizePx: s.minFontSizePx,
        maxFontSizePx: s.maxFontSizePx,
        requestedFontSizePx: s.fontSizePx,
        exact: s.exact
      }
    ), at.set(S, I), at.size > Ci)) {
      const y = at.keys().next().value;
      y !== void 0 && at.delete(y);
    }
    u.style.fontSize = `${I.toFixed(2)}px`;
  }, [a, e.rect.height, e.rect.width, s]);
  const [l, c, i, d] = s.padding;
  return /* @__PURE__ */ p(
    "div",
    {
      className: `reader-live-translation-item${e.changedNow ? " is-changed" : ""}`,
      "data-live-translation-item": e.itemId,
      "data-live-translation-kind": e.kind,
      "data-live-translation-status": e.status,
      "data-live-translation-typography": s.exact ? "typst" : "fitted",
      style: {
        ...e.rect,
        padding: `${l}px ${c}px ${i}px ${d}px`
      },
      children: /* @__PURE__ */ p(
        "div",
        {
          ref: n,
          className: "reader-live-translation-content",
          style: {
            fontFamily: s.fontFamily,
            fontSize: s.fontSizePx,
            fontWeight: s.fontWeight,
            lineHeight: s.lineHeight,
            textAlign: s.textAlign
          },
          dangerouslySetInnerHTML: { __html: a }
        }
      )
    }
  );
}
function Di({
  layoutPage: e,
  pageState: t,
  width: n,
  height: r
}) {
  const a = q(
    () => Ti(e, t, n, r),
    [r, e, t, n]
  );
  return a.length ? /* @__PURE__ */ p(
    "div",
    {
      className: "reader-live-translation-overlay",
      "data-live-translation-page": e == null ? void 0 : e.page_idx,
      "data-live-translation-generation": t == null ? void 0 : t.generation,
      "aria-hidden": "true",
      children: a.map((o) => /* @__PURE__ */ p(
        zi,
        {
          item: o,
          pageScale: e != null && e.width ? n / e.width : 1
        },
        `${o.itemId}:${o.changedAtSeq}`
      ))
    }
  ) : null;
}
const _i = cn(Di), Qr = 1.414;
function Oi({
  pageNumber: e,
  width: t,
  devicePixelRatio: n,
  pane: r,
  active: a = !1,
  syncedMinHeight: o = 0,
  onMetrics: s,
  cachedAspect: l,
  onAspectChange: c,
  sentinelRef: i,
  regionHighlight: d = null,
  regionTargets: u = [],
  onSelectRegion: f,
  liveTranslationLayout: m,
  liveTranslationPage: P,
  showLiveTranslation: g = r === "source"
}) {
  const h = N(l ?? Qr), [b, S] = L(h.current);
  $(() => {
    l != null && Math.abs(l - h.current) >= 1e-3 && (h.current = l, S(l));
  }, [l]);
  const I = N(i);
  I.current = i;
  const y = N((z) => {
    var O;
    (O = I.current) == null || O.call(I, z);
  }).current, w = Math.max(120, Math.floor(t * b)), A = Math.max(w, Math.ceil(o || 0)), E = Ct(d, t, w), _ = q(
    () => Pi(u, t, w),
    [w, u, t]
  ), [k, R] = L(null), T = q(
    () => _.find((z) => z.itemId === k) || null,
    [k, _]
  ), v = (z) => {
    if (z.buttons !== 0) {
      R(null);
      return;
    }
    const O = z.currentTarget.getBoundingClientRect(), B = tr(
      _,
      z.clientX - O.left,
      z.clientY - O.top
    ), ee = (B == null ? void 0 : B.itemId) || null;
    R((X) => X === ee ? X : ee);
  }, M = (z) => {
    var ee, X, oe;
    if (!f || (X = (ee = z.target) == null ? void 0 : ee.closest) != null && X.call(ee, ".reader-structure-selection-target") || `${((oe = window.getSelection()) == null ? void 0 : oe.toString()) || ""}`.trim()) return;
    const O = z.currentTarget.getBoundingClientRect(), B = tr(
      _,
      z.clientX - O.left,
      z.clientY - O.top
    );
    B && f({
      selectionType: "region",
      region: B.highlight.region,
      kind: "text",
      page: B.highlight.box.page,
      pane: r === "translated" ? "translated" : "source",
      rect: {
        left: O.left + B.rect.left,
        top: O.top + B.rect.top,
        width: B.rect.width,
        height: B.rect.height
      }
    });
  }, C = (z) => {
    !Number.isFinite(z) || z <= 0 || Math.abs(h.current - z) < 1e-3 || (h.current = z, S(z), c == null || c(e, z));
  };
  return /* @__PURE__ */ D(
    "div",
    {
      ref: y,
      [Xe]: e,
      [Qe]: r,
      [vn]: w,
      className: wn,
      onPointerMoveCapture: v,
      onClick: M,
      onPointerLeave: () => R(null),
      style: {
        width: t,
        height: A,
        minHeight: A
      },
      children: [
        a ? /* @__PURE__ */ p(
          da,
          {
            pageNumber: e,
            width: t,
            devicePixelRatio: n,
            renderTextLayer: !0,
            renderAnnotationLayer: !1,
            className: Br,
            loading: /* @__PURE__ */ p(
              "div",
              {
                className: Mt,
                style: { width: t, height: w }
              }
            ),
            onLoadSuccess: (z) => {
              try {
                const O = z.getViewport({ scale: 1 });
                if (O.width > 0) {
                  const B = O.height / O.width;
                  C(B);
                }
              } catch {
              }
              s == null || s();
            },
            onRenderSuccess: () => {
              s == null || s();
            }
          }
        ) : /* @__PURE__ */ p(
          "div",
          {
            className: Mt,
            style: { width: t, height: w },
            "aria-hidden": !0
          }
        ),
        E ? /* @__PURE__ */ p(
          "div",
          {
            className: "reader-react-pdf-region-highlight",
            "data-reader-region-id": d == null ? void 0 : d.itemId,
            style: E,
            "aria-hidden": "true"
          }
        ) : null,
        a && g ? /* @__PURE__ */ p(
          _i,
          {
            layoutPage: m,
            pageState: P,
            width: t,
            height: w
          }
        ) : null,
        /* @__PURE__ */ p(Ii, { target: a ? T : null }),
        /* @__PURE__ */ p(
          Si,
          {
            pane: r === "translated" ? "translated" : "source",
            width: t,
            height: w,
            regions: u,
            onSelect: f
          }
        )
      ]
    }
  );
}
const Fi = cn(Oi), Wt = 5, $i = "120% 0px", ji = 120;
let nr = 1;
const rr = /* @__PURE__ */ new WeakMap();
function Ui(e) {
  if (!e) return 0;
  const t = rr.get(e);
  if (t) return t;
  const n = nr;
  return nr += 1, rr.set(e, n), n;
}
function Bi() {
  const e = typeof window < "u" && window.devicePixelRatio || 1;
  return Math.max(1, Math.min(e, 2));
}
const Wi = Ro(
  function({
    pane: t,
    url: n = "",
    preloadedFile: r = null,
    userZoom: a = 1,
    visible: o = !0,
    emptyLabel: s = "暂无 PDF",
    scrollRoot: l = null,
    pageWidthOverride: c = null,
    rowHeights: i,
    onMetrics: d,
    onLoadSuccess: u,
    onLoadError: f,
    onNumPagesChange: m,
    activeRegion: P = null,
    regions: g = [],
    readerMetadata: h = null,
    onSelectRegion: b,
    liveTranslation: S,
    showLiveTranslation: I = t === "source",
    liveTranslationPendingLabel: y = "",
    paneAction: w
  }, A) {
    vi();
    const { file: E, loading: _, error: k } = Ya(n, r), R = `${n}\0${Ui(E)}`, T = N(R);
    T.current = R;
    const v = q(
      () => qa(E),
      [E, n]
    ), [M, C] = L(0), [z, O] = L(""), [B, ee] = L(null), [X, oe] = L(480), re = N(null), ie = N(0), U = q(() => Bi(), []), K = q(() => ({
      cMapUrl: dt().resolvePdfjsVendorUrl("cmaps/"),
      cMapPacked: !0,
      standardFontDataUrl: dt().resolvePdfjsVendorUrl("standard_fonts/")
    }), []);
    ln(A, () => B, [B]), $(() => {
      const F = (H) => {
        !Number.isFinite(H) || H < 80 || Math.abs(H - ie.current) < 8 || (ie.current = H, oe(H));
      }, G = c && c >= 80 ? c : (l == null ? void 0 : l.clientWidth) || 0;
      if (F(G), !l || typeof ResizeObserver > "u" || c && c >= 80) return;
      const J = new ResizeObserver((H) => {
        var te, ne;
        const ce = ((ne = (te = H[0]) == null ? void 0 : te.contentRect) == null ? void 0 : ne.width) ?? l.clientWidth;
        !Number.isFinite(ce) || ce < 80 || (re.current && clearTimeout(re.current), re.current = setTimeout(() => F(ce), 80));
      });
      return J.observe(l), () => {
        J.disconnect(), re.current && clearTimeout(re.current);
      };
    }, [c, l, o]);
    const Z = q(
      () => bs(X, a),
      [X, a]
    ), [Q, le] = L(() => /* @__PURE__ */ new Map()), [pe, me] = L(() => /* @__PURE__ */ new Set()), [he, j] = L(() => /* @__PURE__ */ new Set()), W = N(/* @__PURE__ */ new Map()), V = N(null), ae = N(/* @__PURE__ */ new Map()), Pe = x((F, G) => {
      le((J) => {
        if (J.get(F) === G) return J;
        const H = new Map(J);
        return H.set(F, G), H;
      });
    }, []), ge = x((F, G) => {
      const J = W.current, H = J.get(F);
      if (H && V.current)
        try {
          V.current.unobserve(H);
        } catch {
        }
      if (G) {
        if (J.set(F, G), V.current)
          try {
            V.current.observe(G);
          } catch {
          }
      } else
        J.delete(F);
    }, []), ze = N(/* @__PURE__ */ new Map()), bt = x((F) => {
      const G = ze.current;
      let J = G.get(F);
      return J || (J = (H) => ge(F, H), G.set(F, J)), J;
    }, [ge]);
    $(() => {
      if (typeof IntersectionObserver > "u") return;
      const F = ae.current, G = new IntersectionObserver(
        (J) => {
          const H = [], ce = [];
          for (const te of J) {
            const ne = te.target, fe = zt(ne);
            Number.isFinite(fe) && (te.isIntersecting ? H : ce).push(fe);
          }
          if ((H.length || ce.length) && me((te) => {
            let ne = null;
            for (const fe of H)
              te.has(fe) || (ne = ne || new Set(te), ne.add(fe));
            for (const fe of ce)
              te.has(fe) && (ne = ne || new Set(te), ne.delete(fe));
            return ne || te;
          }), H.length) {
            for (const te of H) {
              const ne = F.get(te);
              ne && (clearTimeout(ne), F.delete(te));
            }
            j((te) => {
              let ne = null;
              for (const fe of H)
                te.has(fe) || (ne = ne || new Set(te), ne.add(fe));
              return ne || te;
            });
          }
          for (const te of ce)
            F.has(te) || F.set(te, setTimeout(() => {
              F.delete(te), j((ne) => {
                if (!ne.has(te)) return ne;
                const fe = new Set(ne);
                return fe.delete(te), fe;
              });
            }, ji));
        },
        { root: l, rootMargin: $i, threshold: 0 }
      );
      V.current = G;
      for (const J of W.current.values())
        try {
          G.observe(J);
        } catch {
        }
      return () => {
        G.disconnect(), V.current === G && (V.current = null);
        for (const J of F.values()) clearTimeout(J);
        F.clear();
      };
    }, [l]), $e(() => {
      C(0), O(""), me(/* @__PURE__ */ new Set()), j(/* @__PURE__ */ new Set()), le(/* @__PURE__ */ new Map()), W.current.clear();
      const F = ae.current;
      for (const G of F.values()) clearTimeout(G);
      F.clear(), m == null || m(0, t);
    }, [R, m, t]);
    const _t = x(
      ({ numPages: F }) => {
        T.current === R && (C(F), O(""), m == null || m(F, t), u == null || u({ numPages: F, pane: t }));
      },
      [R, u, m, t]
    ), yt = x(
      (F) => {
        if (T.current !== R) return;
        const G = (F == null ? void 0 : F.message) || "PDF 解析失败";
        O(G), C(0), m == null || m(0, t), f == null || f(F, t);
      },
      [R, f, m, t]
    ), Ie = q(
      () => M > 0 ? Array.from({ length: M }, (F, G) => G + 1) : [],
      [M]
    );
    $(() => {
      typeof IntersectionObserver < "u" || j(new Set(Ie));
    }, [Ie]);
    const Ne = q(
      () => Wn(P, h, t),
      [P, h, t]
    ), Be = q(() => {
      const F = /* @__PURE__ */ new Map();
      for (const G of g) {
        const J = Wn(G, h, t);
        if (!J) continue;
        const H = F.get(J.box.page) || [];
        H.push(J), F.set(J.box.page, H);
      }
      return F;
    }, [t, h, g]), vt = q(() => {
      if (M === 0) return /* @__PURE__ */ new Set();
      if (!(!!l && typeof IntersectionObserver < "u" && o)) return new Set(Ie);
      if (pe.size === 0) {
        const J = Math.min(M, Wt * 2 + 1);
        return new Set(Array.from({ length: J }, (H, ce) => ce + 1));
      }
      const G = /* @__PURE__ */ new Set();
      for (const J of pe)
        for (let H = -Wt; H <= Wt; H++) {
          const ce = J + H;
          ce >= 1 && ce <= M && G.add(ce);
        }
      return G;
    }, [M, Ie, l, o, pe]), Po = !n || !!k || !!z, Io = n && (k || z) || s;
    return /* @__PURE__ */ D(
      "section",
      {
        ref: ee,
        className: `reader-panel ${ds}${o ? "" : " is-hidden"}`,
        [Qe]: t,
        "data-reader-engine": "react-pdf",
        "data-reader-visible": o ? "true" : "false",
        "data-live-translation-status": (S == null ? void 0 : S.jobStatus) || void 0,
        "aria-hidden": o ? void 0 : !0,
        "aria-label": t === "source" ? "原文 PDF" : "译文 PDF",
        children: [
          w ? /* @__PURE__ */ p("div", { className: "reader-react-pdf-pane-action", children: w }) : null,
          y ? /* @__PURE__ */ D("div", { className: "reader-live-translation-waiting", role: "status", children: [
            /* @__PURE__ */ p("span", { className: "reader-live-translation-waiting-dot", "aria-hidden": "true" }),
            /* @__PURE__ */ p("span", { children: y })
          ] }) : null,
          Po && !_ ? /* @__PURE__ */ p("div", { className: "reader-empty reader-react-pdf-empty", "data-reader-pdf-empty": t, children: Io }) : null,
          _ ? /* @__PURE__ */ p("div", { className: "reader-empty reader-react-pdf-loading", "data-reader-pdf-loading": t, children: "正在加载 PDF…" }) : null,
          v && !k ? /* @__PURE__ */ p("div", { className: "reader-viewer-wrap reader-react-pdf-wrap", children: /* @__PURE__ */ p(
            ua,
            {
              file: v,
              loading: null,
              error: null,
              options: K,
              onLoadSuccess: _t,
              onLoadError: yt,
              className: "reader-react-pdf-document",
              children: Ie.map((F) => {
                if (vt.has(F))
                  return /* @__PURE__ */ p(
                    Fi,
                    {
                      pane: t,
                      pageNumber: F,
                      width: Z,
                      devicePixelRatio: U,
                      active: he.has(F),
                      syncedMinHeight: (i == null ? void 0 : i.get(F)) || 0,
                      onMetrics: d,
                      cachedAspect: Q.get(F),
                      onAspectChange: Pe,
                      sentinelRef: bt(F),
                      regionHighlight: (Ne == null ? void 0 : Ne.box.page) === F ? Ne : null,
                      regionTargets: Be.get(F),
                      onSelectRegion: b,
                      liveTranslationLayout: S == null ? void 0 : S.layoutByPage.get(F - 1),
                      liveTranslationPage: S == null ? void 0 : S.pagesByPage.get(F - 1),
                      showLiveTranslation: I
                    },
                    `${t}-${F}`
                  );
                const J = Q.get(F) ?? Qr, H = Math.max(120, Math.floor(Z * J)), ce = Math.max(H, Math.ceil((i == null ? void 0 : i.get(F)) || 0));
                return /* @__PURE__ */ p(
                  "div",
                  {
                    ref: bt(F),
                    [Xe]: F,
                    [Qe]: t,
                    [vn]: H,
                    className: wn,
                    style: {
                      width: Z,
                      height: ce,
                      minHeight: ce
                    },
                    children: /* @__PURE__ */ p(
                      "div",
                      {
                        className: Mt,
                        style: { width: Z, height: H },
                        "aria-hidden": !0
                      }
                    )
                  },
                  `${t}-${F}`
                );
              })
            },
            R
          ) }) : null
        ]
      }
    );
  }
), or = cn(Wi), eo = dn(null), to = dn(null);
function Hi({ value: e, hud: t, children: n }) {
  return /* @__PURE__ */ p(eo.Provider, { value: e, children: /* @__PURE__ */ p(to.Provider, { value: t, children: n }) });
}
function gt() {
  return un(eo);
}
function Ji() {
  return un(to);
}
function Vi({
  mode: e,
  compareMode: t,
  showSource: n,
  showTranslated: r,
  markdownSplit: a,
  overlayOnSource: o = !1
}) {
  const s = a && e === "compare";
  return {
    mode: s ? "source" : e,
    compareMode: t && !a,
    showSource: s ? !0 : n,
    showTranslated: s ? !1 : r
  };
}
function qi(e, t, n = e * 2) {
  return t ? Math.min(e * 2, n) : e;
}
function Ki(e) {
  return e ? e.connection === "terminal" && e.jobStatus === "failed" ? e.pagesByPage.size > 0 ? `翻译已暂停，已保留 ${e.pagesByPage.size} 页译文` : "翻译已暂停，原始 PDF 仍可阅读" : e.connection === "terminal" && ["cancelled", "canceled"].includes(e.jobStatus) ? e.pagesByPage.size > 0 ? `翻译已取消，已保留 ${e.pagesByPage.size} 页译文` : "翻译已取消，原始 PDF 仍可阅读" : e.pagesByPage.size > 0 ? "" : e.connection === "unavailable" ? e.error || "实时译文暂不可用，原始 PDF 仍可阅读" : e.error ? e.error : e.layoutByPage.size === 0 ? "正在完成 OCR，译文将在这里逐页出现" : "版面已就绪，正在等待首个译文页面" : "";
}
function Gi(e) {
  const t = gt(), {
    markdownSplit: n = !1,
    assistantSplit: r = !1,
    liveTranslation: a,
    paneComposition: o
  } = e, s = (o == null ? void 0 : o.visibleMode) ?? e.mode ?? "compare", l = (o == null ? void 0 : o.compareMode) ?? e.compareMode ?? s === "compare", c = (o == null ? void 0 : o.showSource) ?? e.showSource ?? !0, i = (o == null ? void 0 : o.showTranslated) ?? e.showTranslated ?? (s === "compare" || s === "translated"), d = (o == null ? void 0 : o.overlayOnSource) ?? e.overlayOnSource ?? !1, u = e.bindShell ?? (t == null ? void 0 : t.bindShell), f = e.shellEl ?? (t == null ? void 0 : t.shellEl) ?? null, m = e.userZoom ?? (t == null ? void 0 : t.userZoom) ?? ht, P = e.shellWidth ?? (t == null ? void 0 : t.shellWidth) ?? 0, g = e.rowHeights ?? (t == null ? void 0 : t.rowHeights), h = e.mountSource ?? (t == null ? void 0 : t.mountSource) ?? !1, b = e.mountTranslated ?? (t == null ? void 0 : t.mountTranslated) ?? !1, S = e.sourceViewOnly ?? (t == null ? void 0 : t.sourceViewOnly) ?? !1, I = e.sourceUrl ?? (t == null ? void 0 : t.sourceUrl) ?? "", y = e.translatedUrl ?? (t == null ? void 0 : t.translatedUrl) ?? "", w = e.sourceFile ?? (t == null ? void 0 : t.sourceFile) ?? null, A = e.translatedFile ?? (t == null ? void 0 : t.translatedFile) ?? null, E = e.onMetrics ?? (t == null ? void 0 : t.onMetrics), _ = e.onNumPagesChange ?? (t == null ? void 0 : t.onNumPagesChange), k = e.activeRegion ?? (t == null ? void 0 : t.activeRegion), R = e.regions ?? (t == null ? void 0 : t.regions) ?? [], T = e.readerMetadata ?? (t == null ? void 0 : t.readerMetadata), v = e.onSelectRegion ?? (t == null ? void 0 : t.onSelectRegion), M = Vi({
    mode: s,
    compareMode: l,
    showSource: c,
    showTranslated: i,
    markdownSplit: n,
    overlayOnSource: d
  }), C = qi(
    P,
    n || r,
    typeof document > "u" ? P * 2 : document.documentElement.clientWidth
  );
  return /* @__PURE__ */ p(
    "div",
    {
      ref: u,
      className: ls,
      "data-reader-region-count": R.length,
      "data-reader-structured-region-count": R.filter(Mr).length,
      "data-reader-metadata-ready": T ? "true" : "false",
      children: /* @__PURE__ */ D(
        "main",
        {
          className: `${cs} reader-mode-${M.mode}`,
          "data-reader-mode": n ? "markdown-split" : r ? "assistant-split" : s,
          children: [
            h ? /* @__PURE__ */ p(
              or,
              {
                pane: "source",
                url: I,
                preloadedFile: w,
                userZoom: m,
                visible: M.showSource,
                scrollRoot: f,
                pageWidthOverride: C,
                rowHeights: M.compareMode ? g : void 0,
                onMetrics: E,
                emptyLabel: S ? "源文件不可用：该文档没有可读取的源 PDF。" : "暂无原文 PDF",
                onNumPagesChange: _,
                activeRegion: k,
                regions: R,
                readerMetadata: T,
                onSelectRegion: v,
                liveTranslation: d ? a : void 0,
                showLiveTranslation: d,
                liveTranslationPendingLabel: d ? Ki(a) : "",
                paneAction: d ? /* @__PURE__ */ D(xt, { children: [
                  e.sourcePaneAction,
                  /* @__PURE__ */ p(
                    "span",
                    {
                      className: "reader-source-overlay-badge",
                      "data-source-overlay-badge": "true",
                      title: "源栏正在叠加实时译文，右栏为最终译文 PDF",
                      children: "原文+实时译文叠加"
                    }
                  )
                ] }) : e.sourcePaneAction
              }
            ) : null,
            b ? /* @__PURE__ */ p(
              or,
              {
                pane: "translated",
                url: y,
                preloadedFile: A,
                userZoom: m,
                visible: M.showTranslated,
                scrollRoot: f,
                pageWidthOverride: C,
                rowHeights: M.compareMode ? g : void 0,
                onMetrics: E,
                emptyLabel: "暂无译文 PDF",
                onNumPagesChange: _,
                activeRegion: k,
                regions: R,
                readerMetadata: T,
                onSelectRegion: v,
                liveTranslation: void 0,
                showLiveTranslation: !1
              }
            ) : null
          ]
        }
      )
    }
  );
}
const Yi = [
  { id: "source", label: "源文件", Icon: xr },
  { id: "compare", label: "对照", Icon: Cr },
  { id: "translated", label: "翻译文件", Icon: Lr }
];
function Zi(e) {
  return e.connection === "live" ? `实时译文 · ${e.pagesByPage.size} 页` : e.connection === "reconnecting" ? "实时译文 · 重连中" : e.connection === "unavailable" ? "实时译文 · 不可用" : e.connection === "terminal" ? e.jobStatus === "failed" ? "实时译文 · 已暂停" : e.jobStatus === "cancelled" || e.jobStatus === "canceled" ? "实时译文 · 已取消" : e.jobStatus === "succeeded" ? "实时译文 · 已完成" : "实时译文 · 已结束" : e.error || "实时译文 · 连接中";
}
function Xi(e) {
  return e.id === "translated" ? e.sourceViewOnly : e.id === "compare" ? !e.documentReady || e.sourceViewOnly && !e.liveTranslationAvailable : !1;
}
function Qi(e) {
  const t = gt(), {
    mode: n,
    documentReady: r,
    onModeChange: a,
    liveTranslation: o = null
  } = e, s = e.sourceViewOnly ?? (t == null ? void 0 : t.sourceViewOnly) ?? !1, l = o ? Zi(o.state) : "";
  return /* @__PURE__ */ D("header", { className: "reader-workspace-bar", children: [
    o ? /* @__PURE__ */ D(
      "button",
      {
        type: "button",
        className: `reader-live-translation-toggle is-${o.state.connection}${o.visible ? " is-active" : ""}`,
        "aria-pressed": o.visible,
        "aria-label": o.visible ? "隐藏实时译文" : "显示实时译文",
        title: o.state.error || l,
        onClick: o.onToggle,
        children: [
          /* @__PURE__ */ p(Xo, { size: 14, strokeWidth: 2.2, "aria-hidden": !0 }),
          /* @__PURE__ */ p("span", { className: "reader-live-translation-toggle-label", children: l })
        ]
      }
    ) : null,
    /* @__PURE__ */ p("div", { className: "reader-workspace-tabs", role: "tablist", "aria-label": "阅读工作区", children: Yi.map(({ id: c, label: i, Icon: d }) => {
      const u = n === c, f = Xi({
        id: c,
        documentReady: r,
        sourceViewOnly: s,
        liveTranslationAvailable: !!o
      });
      return /* @__PURE__ */ D(
        "button",
        {
          type: "button",
          className: `reader-workspace-tab${u ? " is-active" : ""}`,
          role: "tab",
          "aria-selected": u,
          "aria-label": i,
          title: f ? `${i} 需要文档任务` : i,
          disabled: f,
          onClick: () => a(c),
          children: [
            /* @__PURE__ */ p(d, { size: 15, strokeWidth: 2.2, "aria-hidden": !0 }),
            /* @__PURE__ */ p("span", { className: "reader-workspace-tab-label", children: i })
          ]
        },
        c
      );
    }) })
  ] });
}
const ar = [
  { id: "markdown", label: "Markdown", Icon: zr },
  { id: "ai", label: "AI 问答", Icon: pn }
];
function ec(e) {
  const t = gt(), { active: n } = e, r = e.onSelect ?? (t == null ? void 0 : t.assistant.select) ?? (() => {
  }), a = e.onClose ?? (t == null ? void 0 : t.assistant.close) ?? (() => {
  });
  return n ? /* @__PURE__ */ D("header", { className: "reader-assistant-dock-header", children: [
    /* @__PURE__ */ p("div", { className: "reader-assistant-dock-tabs", role: "tablist", "aria-label": "阅读辅助面板", children: ar.map(({ id: o, label: s, Icon: l }) => {
      const c = n === o;
      return /* @__PURE__ */ D(
        "button",
        {
          type: "button",
          role: "tab",
          "aria-selected": c,
          className: `reader-assistant-dock-tab${c ? " is-active" : ""}`,
          onClick: () => r(o),
          children: [
            /* @__PURE__ */ p(l, { size: 15, strokeWidth: 2.15, "aria-hidden": !0 }),
            /* @__PURE__ */ p("span", { children: s })
          ]
        },
        o
      );
    }) }),
    /* @__PURE__ */ p(
      "button",
      {
        type: "button",
        className: "reader-assistant-dock-close",
        "aria-label": "关闭阅读辅助面板",
        title: "关闭辅助面板",
        onClick: a,
        children: /* @__PURE__ */ p(tt, { size: 16, strokeWidth: 2.25, "aria-hidden": !0 })
      }
    )
  ] }) : /* @__PURE__ */ p("nav", { className: "reader-assistant-rail", "aria-label": "阅读辅助工具", children: ar.map(({ id: o, label: s, Icon: l }) => /* @__PURE__ */ D(
    "button",
    {
      type: "button",
      className: "reader-assistant-rail-button",
      "aria-label": `打开${s}`,
      title: s,
      onClick: () => r(o),
      children: [
        /* @__PURE__ */ p(l, { size: 18, strokeWidth: 2, "aria-hidden": !0 }),
        /* @__PURE__ */ p("span", { children: s === "AI 问答" ? "AI" : "MD" })
      ]
    },
    o
  )) });
}
function tc(e, t) {
  const n = getComputedStyle(e), r = parseFloat(n.fontSize);
  return t * r;
}
function nc(e, t) {
  const n = getComputedStyle(e.ownerDocument.documentElement), r = parseFloat(n.fontSize);
  return t * r;
}
function rc(e) {
  return e / 100 * window.innerHeight;
}
function oc(e) {
  return e / 100 * window.innerWidth;
}
function ac(e) {
  switch (typeof e) {
    case "number":
      return [e, "px"];
    case "string": {
      const t = parseFloat(e);
      return e.endsWith("%") ? [t, "%"] : e.endsWith("px") ? [t, "px"] : e.endsWith("rem") ? [t, "rem"] : e.endsWith("em") ? [t, "em"] : e.endsWith("vh") ? [t, "vh"] : e.endsWith("vw") ? [t, "vw"] : [t, "%"];
    }
  }
}
function st({
  groupSize: e,
  panelElement: t,
  styleProp: n
}) {
  let r;
  const [a, o] = ac(n);
  switch (o) {
    case "%": {
      r = a / 100 * e;
      break;
    }
    case "px": {
      r = a;
      break;
    }
    case "rem": {
      r = nc(t, a);
      break;
    }
    case "em": {
      r = tc(t, a);
      break;
    }
    case "vh": {
      r = rc(a);
      break;
    }
    case "vw": {
      r = oc(a);
      break;
    }
  }
  return r;
}
function ue(e) {
  return parseFloat(e.toFixed(3));
}
function et({
  group: e
}) {
  const { orientation: t, panels: n } = e;
  return n.reduce((r, a) => (r += t === "horizontal" ? a.element.offsetWidth : a.element.offsetHeight, r), 0);
}
function rn(e) {
  const { panels: t } = e, n = et({ group: e });
  return n === 0 ? t.map((r) => ({
    groupResizeBehavior: r.panelConstraints.groupResizeBehavior,
    collapsedSize: 0,
    collapsible: r.panelConstraints.collapsible === !0,
    defaultSize: void 0,
    disabled: r.panelConstraints.disabled,
    minSize: 0,
    maxSize: 100,
    panelId: r.id
  })) : t.map((r) => {
    const { element: a, panelConstraints: o } = r;
    let s = 0;
    if (o.collapsedSize !== void 0) {
      const d = st({
        groupSize: n,
        panelElement: a,
        styleProp: o.collapsedSize
      });
      s = ue(d / n * 100);
    }
    let l;
    if (o.defaultSize !== void 0) {
      const d = st({
        groupSize: n,
        panelElement: a,
        styleProp: o.defaultSize
      });
      l = ue(d / n * 100);
    }
    let c = 0;
    if (o.minSize !== void 0) {
      const d = st({
        groupSize: n,
        panelElement: a,
        styleProp: o.minSize
      });
      c = ue(d / n * 100);
    }
    let i = 100;
    if (o.maxSize !== void 0) {
      const d = st({
        groupSize: n,
        panelElement: a,
        styleProp: o.maxSize
      });
      i = ue(d / n * 100);
    }
    return {
      groupResizeBehavior: o.groupResizeBehavior,
      collapsedSize: s,
      collapsible: o.collapsible === !0,
      defaultSize: l,
      disabled: o.disabled,
      minSize: c,
      maxSize: i,
      panelId: r.id
    };
  });
}
function Y(e, t = "Assertion error") {
  if (!e)
    throw Error(t);
}
function on(e, t) {
  return Array.from(t).sort(
    e === "horizontal" ? sc : ic
  );
}
function sc(e, t) {
  const n = e.element.offsetLeft - t.element.offsetLeft;
  return n !== 0 ? n : e.element.offsetWidth - t.element.offsetWidth;
}
function ic(e, t) {
  const n = e.element.offsetTop - t.element.offsetTop;
  return n !== 0 ? n : e.element.offsetHeight - t.element.offsetHeight;
}
function no(e) {
  return e !== null && typeof e == "object" && "nodeType" in e && e.nodeType === Node.ELEMENT_NODE;
}
function ro(e, t) {
  return {
    x: e.x >= t.left && e.x <= t.right ? 0 : Math.min(
      Math.abs(e.x - t.left),
      Math.abs(e.x - t.right)
    ),
    y: e.y >= t.top && e.y <= t.bottom ? 0 : Math.min(
      Math.abs(e.y - t.top),
      Math.abs(e.y - t.bottom)
    )
  };
}
function cc({
  orientation: e,
  rects: t,
  targetRect: n
}) {
  const r = {
    x: n.x + n.width / 2,
    y: n.y + n.height / 2
  };
  let a, o = Number.MAX_VALUE;
  for (const s of t) {
    const { x: l, y: c } = ro(r, s), i = e === "horizontal" ? l : c;
    i < o && (o = i, a = s);
  }
  return Y(a, "No rect found"), a;
}
let Pt;
function lc() {
  return Pt === void 0 && (typeof matchMedia == "function" ? Pt = !!matchMedia("(pointer:coarse)").matches : Pt = !1), Pt;
}
function oo(e) {
  const { element: t, orientation: n, panels: r, separators: a } = e, o = on(
    n,
    Array.from(t.children).filter(no).map((P) => ({ element: P }))
  ).map(({ element: P }) => P), s = [];
  let l = !1, c = !1, i = -1, d = -1, u = 0, f, m = [];
  {
    let P = -1;
    for (const g of o)
      g.hasAttribute("data-panel") && (P++, g.hasAttribute("data-disabled") || (u++, i === -1 && (i = P), d = P));
  }
  if (u > 1) {
    let P = -1;
    for (const g of o)
      if (g.hasAttribute("data-panel")) {
        P++;
        const h = r.find(
          (b) => b.element === g
        );
        if (h) {
          if (f) {
            const b = f.element.getBoundingClientRect(), S = g.getBoundingClientRect();
            let I;
            if (c) {
              const y = n === "horizontal" ? new DOMRect(
                b.right,
                b.top,
                0,
                b.height
              ) : new DOMRect(
                b.left,
                b.bottom,
                b.width,
                0
              ), w = n === "horizontal" ? new DOMRect(S.left, S.top, 0, S.height) : new DOMRect(S.left, S.top, S.width, 0);
              switch (m.length) {
                case 0: {
                  I = [
                    y,
                    w
                  ];
                  break;
                }
                case 1: {
                  const A = m[0], E = cc({
                    orientation: n,
                    rects: [b, S],
                    targetRect: A.element.getBoundingClientRect()
                  });
                  I = [
                    A,
                    E === b ? w : y
                  ];
                  break;
                }
                default: {
                  I = m;
                  break;
                }
              }
            } else
              m.length ? I = m : I = [
                n === "horizontal" ? new DOMRect(
                  b.right,
                  S.top,
                  S.left - b.right,
                  S.height
                ) : new DOMRect(
                  S.left,
                  b.bottom,
                  S.width,
                  S.top - b.bottom
                )
              ];
            for (const y of I) {
              let w = "width" in y ? y : y.element.getBoundingClientRect();
              const A = lc() ? e.resizeTargetMinimumSize.coarse : e.resizeTargetMinimumSize.fine;
              if (w.width < A) {
                const _ = A - w.width;
                w = new DOMRect(
                  w.x - _ / 2,
                  w.y,
                  w.width + _,
                  w.height
                );
              }
              if (w.height < A) {
                const _ = A - w.height;
                w = new DOMRect(
                  w.x,
                  w.y - _ / 2,
                  w.width,
                  w.height + _
                );
              }
              const E = P <= i || P > d;
              !l && !E && s.push({
                group: e,
                groupSize: et({ group: e }),
                panels: [f, h],
                separator: "width" in y ? void 0 : y,
                rect: w
              }), l = !1;
            }
          }
          c = !1, f = h, m = [];
        }
      } else if (g.hasAttribute("data-separator")) {
        g.ariaDisabled !== null && (l = !0);
        const h = a.find(
          (b) => b.element === g
        );
        h ? m.push(h) : (f = void 0, m = []);
      } else
        c = !0;
  }
  return s;
}
var Ce;
class ao {
  constructor() {
    jn(this, Ce, {});
  }
  addListener(t, n) {
    const r = nt(this, Ce)[t];
    return r === void 0 ? nt(this, Ce)[t] = [n] : r.includes(n) || r.push(n), () => {
      this.removeListener(t, n);
    };
  }
  emit(t, n) {
    const r = nt(this, Ce)[t];
    if (r !== void 0)
      if (r.length === 1)
        r[0].call(null, n);
      else {
        let a = !1, o = null;
        const s = Array.from(r);
        for (let l = 0; l < s.length; l++) {
          const c = s[l];
          try {
            c.call(null, n);
          } catch (i) {
            o === null && (a = !0, o = i);
          }
        }
        if (a)
          throw o;
      }
  }
  removeAllListeners() {
    Un(this, Ce, {});
  }
  removeListener(t, n) {
    const r = nt(this, Ce)[t];
    if (r !== void 0) {
      const a = r.indexOf(n);
      a >= 0 && r.splice(a, 1);
    }
  }
}
Ce = new WeakMap();
let Ye = {
  cursorFlags: 0,
  state: "inactive"
};
const Rn = new ao();
function _e() {
  return Ye;
}
function dc(e) {
  return Rn.addListener("change", e);
}
function uc(e) {
  const t = Ye, n = { ...Ye };
  n.cursorFlags = e, Ye = n, Rn.emit("change", {
    prev: t,
    next: n
  });
}
function Ze(e) {
  const t = Ye;
  Ye = e, Rn.emit("change", {
    prev: t,
    next: e
  });
}
const fc = (e) => e, Ht = () => {
}, so = 1, io = 2, co = 4, lo = 8, sr = 3, ir = 12;
let It;
function cr() {
  return It === void 0 && (It = !1, typeof window < "u" && (window.navigator.userAgent.includes("Chrome") || window.navigator.userAgent.includes("Firefox")) && (It = !0)), It;
}
function mc({
  cursorFlags: e,
  groups: t,
  state: n
}) {
  let r = 0, a = 0;
  switch (n) {
    case "active":
    case "hover":
      t.forEach((o) => {
        if (!o.mutableState.disableCursor)
          switch (o.orientation) {
            case "horizontal": {
              r++;
              break;
            }
            case "vertical": {
              a++;
              break;
            }
          }
      });
  }
  if (!(r === 0 && a === 0)) {
    switch (n) {
      case "active": {
        if (e && cr()) {
          const o = (e & so) !== 0, s = (e & io) !== 0, l = (e & co) !== 0, c = (e & lo) !== 0;
          if (o)
            return l ? "se-resize" : c ? "ne-resize" : "e-resize";
          if (s)
            return l ? "sw-resize" : c ? "nw-resize" : "w-resize";
          if (l)
            return "s-resize";
          if (c)
            return "n-resize";
        }
        break;
      }
    }
    return cr() ? r > 0 && a > 0 ? "move" : r > 0 ? "ew-resize" : "ns-resize" : r > 0 && a > 0 ? "grab" : r > 0 ? "col-resize" : "row-resize";
  }
}
const lr = /* @__PURE__ */ new WeakMap();
function Tn(e) {
  if (e.defaultView === null || e.defaultView === void 0)
    return;
  let { prevStyle: t, styleSheet: n } = lr.get(e) ?? {};
  n === void 0 && (n = new e.defaultView.CSSStyleSheet(), e.adoptedStyleSheets && (Object.isExtensible(e.adoptedStyleSheets) ? e.adoptedStyleSheets.push(n) : e.adoptedStyleSheets = [
    ...e.adoptedStyleSheets,
    n
  ]));
  const r = _e();
  switch (r.state) {
    case "active":
    case "hover": {
      const a = mc({
        cursorFlags: r.cursorFlags,
        groups: r.hitRegions.map((s) => s.group),
        state: r.state
      }), o = `*, *:hover {cursor: ${a} !important; }`;
      if (t === o)
        return;
      t = o, a ? n.cssRules.length === 0 ? n.insertRule(o) : n.replaceSync(o) : n.cssRules.length === 1 && n.deleteRule(0);
      break;
    }
    case "inactive": {
      t = void 0, n.cssRules.length === 1 && n.deleteRule(0);
      break;
    }
  }
  lr.set(e, {
    prevStyle: t,
    styleSheet: n
  });
}
let Se = /* @__PURE__ */ new Map();
const uo = new ao();
function pc(e) {
  Se = new Map(Se), Se.delete(e);
}
function dr(e, t) {
  for (const [n] of Se)
    if (n.id === e)
      return n;
}
function Le(e, t) {
  for (const [n, r] of Se)
    if (n.id === e)
      return r;
  if (t)
    throw Error(`Could not find data for Group with id ${e}`);
}
function je() {
  return Se;
}
function En(e, t) {
  return uo.addListener("groupChange", (n) => {
    n.group.id === e && t(n);
  });
}
function ke(e, t, n) {
  const r = Se.get(e);
  Se = new Map(Se), Se.set(e, t), uo.emit("groupChange", {
    group: e,
    isUserInteraction: (n == null ? void 0 : n.isUserInteraction) === !0,
    prev: r,
    next: t
  });
}
function fo(e) {
  const t = _e();
  let n = !1;
  switch (t.state) {
    case "active":
      Ze({
        cursorFlags: 0,
        state: "inactive"
      }), t.hitRegions.length > 0 && (Tn(e), n = !0, t.hitRegions.forEach((r) => {
        const a = Le(r.group.id, !0);
        ke(r.group, a, {
          isUserInteraction: !0
        });
      }));
  }
  return n;
}
function ur(e) {
  e.defaultPrevented || fo(e.currentTarget);
}
function hc(e, t, n) {
  let r, a = {
    x: 1 / 0,
    y: 1 / 0
  };
  for (const o of t) {
    const s = ro(n, o.rect);
    switch (e) {
      case "horizontal": {
        s.x <= a.x && (r = o, a = s);
        break;
      }
      case "vertical": {
        s.y <= a.y && (r = o, a = s);
        break;
      }
    }
  }
  return r ? {
    distance: a,
    hitRegion: r
  } : void 0;
}
function gc(e) {
  return e !== null && typeof e == "object" && "nodeType" in e && e.nodeType === Node.DOCUMENT_FRAGMENT_NODE;
}
function bc(e, t) {
  if (e === t) throw new Error("Cannot compare node with itself");
  const n = {
    a: pr(e),
    b: pr(t)
  };
  let r;
  for (; n.a.at(-1) === n.b.at(-1); )
    r = n.a.pop(), n.b.pop();
  Y(
    r,
    "Stacking order can only be calculated for elements with a common ancestor"
  );
  const a = {
    a: mr(fr(n.a)),
    b: mr(fr(n.b))
  };
  if (a.a === a.b) {
    const o = r.childNodes, s = {
      a: n.a.at(-1),
      b: n.b.at(-1)
    };
    let l = o.length;
    for (; l--; ) {
      const c = o[l];
      if (c === s.a) return 1;
      if (c === s.b) return -1;
    }
  }
  return Math.sign(a.a - a.b);
}
const yc = /\b(?:position|zIndex|opacity|transform|webkitTransform|mixBlendMode|filter|webkitFilter|isolation)\b/;
function vc(e) {
  const t = getComputedStyle(mo(e) ?? e).display;
  return t === "flex" || t === "inline-flex";
}
function wc(e) {
  const t = getComputedStyle(e);
  return !!(t.position === "fixed" || t.zIndex !== "auto" && (t.position !== "static" || vc(e)) || +t.opacity < 1 || "transform" in t && t.transform !== "none" || "webkitTransform" in t && t.webkitTransform !== "none" || "mixBlendMode" in t && t.mixBlendMode !== "normal" || "filter" in t && t.filter !== "none" || "webkitFilter" in t && t.webkitFilter !== "none" || "isolation" in t && t.isolation === "isolate" || yc.test(t.willChange) || t.webkitOverflowScrolling === "touch");
}
function fr(e) {
  let t = e.length;
  for (; t--; ) {
    const n = e[t];
    if (Y(n, "Missing node"), wc(n)) return n;
  }
  return null;
}
function mr(e) {
  return e && Number(getComputedStyle(e).zIndex) || 0;
}
function pr(e) {
  const t = [];
  for (; e; )
    t.push(e), e = mo(e);
  return t;
}
function mo(e) {
  const { parentNode: t } = e;
  return gc(t) ? t.host : t;
}
function Sc(e, t) {
  return e.x < t.x + t.width && e.x + e.width > t.x && e.y < t.y + t.height && e.y + e.height > t.y;
}
function Pc({
  groupElement: e,
  hitRegion: t,
  pointerEventTarget: n
}) {
  if (!no(n) || n.contains(e) || e.contains(n))
    return !0;
  if (bc(n, e) > 0) {
    let r = n;
    for (; r; ) {
      if (r.contains(e))
        return !0;
      if (Sc(r.getBoundingClientRect(), t))
        return !1;
      r = r.parentElement;
    }
  }
  return !0;
}
function Mn(e, t) {
  const n = [];
  return t.forEach((r, a) => {
    if (a.disabled)
      return;
    const o = oo(a), s = hc(a.orientation, o, {
      x: e.clientX,
      y: e.clientY
    });
    s && s.distance.x <= 0 && s.distance.y <= 0 && Pc({
      groupElement: a.element,
      hitRegion: s.hitRegion.rect,
      pointerEventTarget: e.target
    }) && n.push(s.hitRegion);
  }), n;
}
function Ic(e, t) {
  if (e.length !== t.length)
    return !1;
  for (let n = 0; n < e.length; n++)
    if (e[n] != t[n])
      return !1;
  return !0;
}
function de(e, t, n = 0) {
  return Math.abs(ue(e) - ue(t)) <= n;
}
function we(e, t) {
  return de(e, t) ? 0 : e > t ? 1 : -1;
}
function Ve({
  overrideDisabledPanels: e,
  panelConstraints: t,
  prevSize: n,
  size: r
}) {
  const {
    collapsedSize: a = 0,
    collapsible: o,
    disabled: s,
    maxSize: l = 100,
    minSize: c = 0
  } = t;
  if (s && !e)
    return n;
  if (we(r, c) < 0)
    if (o) {
      const i = (a + c) / 2;
      we(r, i) < 0 ? r = a : r = c;
    } else
      r = c;
  return r = Math.min(l, r), r = ue(r), r;
}
function ft({
  delta: e,
  initialLayout: t,
  panelConstraints: n,
  pivotIndices: r,
  prevLayout: a,
  trigger: o
}) {
  if (de(e, 0))
    return t;
  const s = o === "imperative-api", l = Object.values(t), c = Object.values(a), i = [...l], [d, u] = r;
  Y(d != null, "Invalid first pivot index"), Y(u != null, "Invalid second pivot index");
  let f = 0;
  switch (o) {
    case "keyboard": {
      {
        const g = e < 0 ? u : d, h = n[g];
        Y(
          h,
          `Panel constraints not found for index ${g}`
        );
        const {
          collapsedSize: b = 0,
          collapsible: S,
          minSize: I = 0
        } = h;
        if (S) {
          const y = l[g];
          if (Y(
            y != null,
            `Previous layout not found for panel index ${g}`
          ), de(y, b)) {
            const w = I - y;
            we(w, Math.abs(e)) > 0 && (e = e < 0 ? 0 - w : w);
          }
        }
      }
      {
        const g = e < 0 ? d : u, h = n[g];
        Y(
          h,
          `No panel constraints found for index ${g}`
        );
        const {
          collapsedSize: b = 0,
          collapsible: S,
          minSize: I = 0
        } = h;
        if (S) {
          const y = l[g];
          if (Y(
            y != null,
            `Previous layout not found for panel index ${g}`
          ), de(y, I)) {
            const w = y - b;
            we(w, Math.abs(e)) > 0 && (e = e < 0 ? 0 - w : w);
          }
        }
      }
      break;
    }
    default: {
      const g = e < 0 ? u : d, h = n[g];
      Y(
        h,
        `Panel constraints not found for index ${g}`
      );
      const b = l[g], { collapsible: S, collapsedSize: I, minSize: y } = h;
      if (S && we(b, y) < 0)
        if (e > 0) {
          const w = y - I, A = w / 2, E = b + e;
          we(E, y) < 0 && (e = we(e, A) <= 0 ? 0 : w);
        } else {
          const w = y - I, A = 100 - w / 2, E = b - e;
          we(E, y) < 0 && (e = we(100 + e, A) > 0 ? 0 : -w);
        }
      break;
    }
  }
  {
    const g = e < 0 ? 1 : -1;
    let h = e < 0 ? u : d, b = 0;
    for (; ; ) {
      const I = l[h];
      Y(
        I != null,
        `Previous layout not found for panel index ${h}`
      );
      const y = Ve({
        overrideDisabledPanels: s,
        panelConstraints: n[h],
        prevSize: I,
        size: 100
      }) - I;
      if (b += y, h += g, h < 0 || h >= n.length)
        break;
    }
    const S = Math.min(Math.abs(e), Math.abs(b));
    e = e < 0 ? 0 - S : S;
  }
  {
    let g = e < 0 ? d : u;
    for (; g >= 0 && g < n.length; ) {
      const h = Math.abs(e) - Math.abs(f), b = l[g];
      Y(
        b != null,
        `Previous layout not found for panel index ${g}`
      );
      const S = b - h, I = Ve({
        overrideDisabledPanels: s,
        panelConstraints: n[g],
        prevSize: b,
        size: S
      });
      if (!de(b, I) && (f += b - I, i[g] = I, f.toFixed(3).localeCompare(Math.abs(e).toFixed(3), void 0, {
        numeric: !0
      }) >= 0))
        break;
      e < 0 ? g-- : g++;
    }
  }
  if (Ic(c, i))
    return a;
  {
    const g = e < 0 ? u : d, h = l[g];
    Y(
      h != null,
      `Previous layout not found for panel index ${g}`
    );
    const b = h + f, S = Ve({
      overrideDisabledPanels: s,
      panelConstraints: n[g],
      prevSize: h,
      size: b
    });
    if (i[g] = S, !de(S, b)) {
      let I = b - S, y = e < 0 ? u : d;
      for (; y >= 0 && y < n.length; ) {
        const w = i[y];
        Y(
          w != null,
          `Previous layout not found for panel index ${y}`
        );
        const A = w + I, E = Ve({
          overrideDisabledPanels: s,
          panelConstraints: n[y],
          prevSize: w,
          size: A
        });
        if (de(w, E) || (I -= E - w, i[y] = E), de(I, 0))
          break;
        e > 0 ? y-- : y++;
      }
    }
  }
  const m = Object.values(i).reduce(
    (g, h) => h + g,
    0
  );
  if (!de(m, 100, 0.1))
    return a;
  const P = Object.keys(a);
  return i.reduce((g, h, b) => (g[P[b]] = h, g), {});
}
function Oe(e, t) {
  if (Object.keys(e).length !== Object.keys(t).length)
    return !1;
  for (const n in e)
    if (t[n] === void 0 || we(e[n], t[n]) !== 0)
      return !1;
  return !0;
}
function Fe({
  layout: e,
  panelConstraints: t
}) {
  const n = Object.values(e), r = [...n], a = r.reduce(
    (l, c) => l + c,
    0
  );
  if (r.length !== t.length)
    throw Error(
      `Invalid ${t.length} panel layout: ${r.map((l) => `${l}%`).join(", ")}`
    );
  if (!de(a, 100) && r.length > 0)
    for (let l = 0; l < t.length; l++) {
      const c = r[l];
      Y(c != null, `No layout data found for index ${l}`);
      const i = 100 / a * c;
      r[l] = i;
    }
  let o = 0;
  for (let l = 0; l < t.length; l++) {
    const c = n[l];
    Y(c != null, `No layout data found for index ${l}`);
    const i = r[l];
    Y(i != null, `No layout data found for index ${l}`);
    const d = Ve({
      overrideDisabledPanels: !0,
      panelConstraints: t[l],
      prevSize: c,
      size: i
    });
    i != d && (o += i - d, r[l] = d);
  }
  if (!de(o, 0))
    for (let l = 0; l < t.length; l++) {
      const c = r[l];
      Y(c != null, `No layout data found for index ${l}`);
      const i = c + o, d = Ve({
        overrideDisabledPanels: !0,
        panelConstraints: t[l],
        prevSize: c,
        size: i
      });
      if (c !== d && (o -= d - c, r[l] = d, de(o, 0)))
        break;
    }
  const s = Object.keys(e);
  return r.reduce((l, c, i) => (l[s[i]] = c, l), {});
}
function po({
  groupId: e,
  panelId: t
}) {
  const n = () => {
    const c = je();
    for (const [
      i,
      {
        defaultLayoutDeferred: d,
        derivedPanelConstraints: u,
        layout: f,
        groupSize: m,
        separatorToPanels: P
      }
    ] of c)
      if (i.id === e)
        return {
          defaultLayoutDeferred: d,
          derivedPanelConstraints: u,
          group: i,
          groupSize: m,
          layout: f,
          separatorToPanels: P
        };
    throw Error(`Group ${e} not found`);
  }, r = () => {
    const c = n().derivedPanelConstraints.find(
      (i) => i.panelId === t
    );
    if (c !== void 0)
      return c;
    throw Error(`Panel constraints not found for Panel ${t}`);
  }, a = () => {
    const c = n().group.panels.find((i) => i.id === t);
    if (c !== void 0)
      return c;
    throw Error(`Layout not found for Panel ${t}`);
  }, o = () => {
    const c = n().layout[t];
    if (c !== void 0)
      return c;
    throw Error(`Layout not found for Panel ${t}`);
  }, s = ({
    nextSize: c,
    panels: i,
    prevLayout: d,
    derivedPanelConstraints: u
  }) => {
    const f = o(), m = i.findIndex((h) => h.id === t), P = m === 0, g = m === i.length - 1;
    if (g && c < f && (P || i.slice(0, m).every((h, b) => {
      const S = u[b];
      return (S == null ? void 0 : S.collapsible) && de(S.collapsedSize, d[S.panelId]);
    }))) {
      const h = i.slice(0, m).reduce((b, S) => b + d[S.id], 0);
      return {
        ...d,
        [t]: ue(100 - h)
      };
    }
    return ft({
      delta: g ? f - c : c - f,
      initialLayout: d,
      panelConstraints: u,
      pivotIndices: g ? [m - 1, m] : [m, m + 1],
      prevLayout: d,
      trigger: "imperative-api"
    });
  }, l = (c) => {
    const i = o();
    if (c === i)
      return;
    const {
      defaultLayoutDeferred: d,
      derivedPanelConstraints: u,
      group: f,
      groupSize: m,
      layout: P,
      separatorToPanels: g
    } = n(), h = s({
      nextSize: c,
      panels: f.panels,
      prevLayout: P,
      derivedPanelConstraints: u
    }), b = Fe({
      layout: h,
      panelConstraints: u
    });
    Oe(P, b) || ke(f, {
      defaultLayoutDeferred: d,
      derivedPanelConstraints: u,
      groupSize: m,
      layout: b,
      separatorToPanels: g
    });
  };
  return {
    collapse: () => {
      const { collapsible: c, collapsedSize: i } = r(), { mutableValues: d } = a(), u = o();
      c && u !== i && (d.expandToSize = u, l(i));
    },
    expand: () => {
      const { collapsible: c, collapsedSize: i, minSize: d } = r(), { mutableValues: u } = a(), f = o();
      if (c && f === i) {
        let m = u.expandToSize ?? d;
        m === 0 && (m = 1), l(m);
      }
    },
    getSize: () => {
      const { group: c } = n(), i = o(), { element: d } = a(), u = c.orientation === "horizontal" ? d.offsetWidth : d.offsetHeight;
      return {
        asPercentage: i,
        inPixels: u
      };
    },
    isCollapsed: () => {
      const { collapsible: c, collapsedSize: i } = r(), d = o();
      return c && de(i, d);
    },
    resize: (c) => {
      const { group: i } = n(), { element: d } = a(), u = et({ group: i }), f = st({
        groupSize: u,
        panelElement: d,
        styleProp: c
      }), m = ue(f / u * 100);
      l(m);
    }
  };
}
function hr(e) {
  if (e.defaultPrevented)
    return;
  const t = je();
  Mn(e, t).forEach((n) => {
    if (n.separator && !n.separator.disableDoubleClick) {
      const r = n.panels.find(
        (a) => a.panelConstraints.defaultSize !== void 0
      );
      if (r) {
        const a = r.panelConstraints.defaultSize, o = po({
          groupId: n.group.id,
          panelId: r.id
        });
        o && a !== void 0 && (o.resize(a), e.preventDefault());
      }
    }
  });
}
function Tt(e) {
  const t = je();
  for (const [n] of t)
    if (n.separators.some(
      (r) => r.element === e
    ))
      return n;
  throw Error("Could not find parent Group for separator element");
}
function ho({
  groupId: e
}) {
  const t = () => {
    const n = je();
    for (const [r, a] of n)
      if (r.id === e)
        return { group: r, ...a };
    throw Error(`Could not find Group with id "${e}"`);
  };
  return {
    getLayout() {
      const { defaultLayoutDeferred: n, layout: r } = t();
      return n ? {} : r;
    },
    setLayout(n) {
      const {
        defaultLayoutDeferred: r,
        derivedPanelConstraints: a,
        group: o,
        groupSize: s,
        layout: l,
        separatorToPanels: c
      } = t(), i = Fe({
        layout: n,
        panelConstraints: a
      });
      return r ? l : (Oe(l, i) || ke(o, {
        defaultLayoutDeferred: r,
        derivedPanelConstraints: a,
        groupSize: s,
        layout: i,
        separatorToPanels: c
      }), i);
    }
  };
}
function De(e, t) {
  const n = Tt(e), r = Le(n.id, !0), a = n.separators.find(
    (d) => d.element === e
  );
  Y(a, "Matching separator not found");
  const o = r.separatorToPanels.get(a);
  Y(o, "Matching panels not found");
  const s = o.map((d) => n.panels.indexOf(d)), l = ho({ groupId: n.id }).getLayout(), c = ft({
    delta: t,
    initialLayout: l,
    panelConstraints: r.derivedPanelConstraints,
    pivotIndices: s,
    prevLayout: l,
    trigger: "keyboard"
  }), i = Fe({
    layout: c,
    panelConstraints: r.derivedPanelConstraints
  });
  Oe(l, i) || ke(
    n,
    {
      defaultLayoutDeferred: r.defaultLayoutDeferred,
      derivedPanelConstraints: r.derivedPanelConstraints,
      groupSize: r.groupSize,
      layout: i,
      separatorToPanels: r.separatorToPanels
    },
    // Keyboard resizes (arrow keys, Home/End, Enter collapse/expand) originate
    // from a real DOM event on the separator, so they are user interactions
    // just like pointer drags. This function is only reached from
    // onDocumentKeyDown. See #716.
    { isUserInteraction: !0 }
  );
}
function gr(e) {
  if (e.defaultPrevented)
    return;
  const t = e.currentTarget, n = Tt(t);
  if (!n.disabled)
    switch (e.key) {
      case "ArrowDown": {
        e.preventDefault(), n.orientation === "vertical" && De(t, 5);
        break;
      }
      case "ArrowLeft": {
        e.preventDefault(), n.orientation === "horizontal" && De(t, -5);
        break;
      }
      case "ArrowRight": {
        e.preventDefault(), n.orientation === "horizontal" && De(t, 5);
        break;
      }
      case "ArrowUp": {
        e.preventDefault(), n.orientation === "vertical" && De(t, -5);
        break;
      }
      case "End": {
        e.preventDefault(), De(t, 100);
        break;
      }
      case "Enter": {
        e.preventDefault();
        const r = Tt(t), a = Le(r.id, !0), { derivedPanelConstraints: o, layout: s, separatorToPanels: l } = a, c = r.separators.find(
          (f) => f.element === t
        );
        Y(c, "Matching separator not found");
        const i = l.get(c);
        Y(i, "Matching panels not found");
        const d = i[0], u = o.find(
          (f) => f.panelId === d.id
        );
        if (Y(u, "Panel metadata not found"), u.collapsible) {
          const f = s[d.id], m = u.collapsedSize === f ? r.mutableState.expandedPanelSizes[d.id] ?? u.minSize : u.collapsedSize;
          De(t, m - f);
        }
        break;
      }
      case "F6": {
        e.preventDefault();
        const r = Tt(t).separators.map(
          (s) => s.element
        ), a = Array.from(r).findIndex(
          (s) => s === e.currentTarget
        );
        Y(a !== null, "Index not found");
        const o = e.shiftKey ? a > 0 ? a - 1 : r.length - 1 : a + 1 < r.length ? a + 1 : 0;
        r[o].focus({
          preventScroll: !0
        });
        break;
      }
      case "Home": {
        e.preventDefault(), De(t, -100);
        break;
      }
    }
}
function br(e) {
  if (e.defaultPrevented || e.pointerType === "mouse" && e.button > 0)
    return;
  const t = je(), n = Mn(e, t), r = /* @__PURE__ */ new Map();
  let a = !1;
  n.forEach((o) => {
    o.separator && (a || (a = !0, o.separator.element.focus({
      // @ts-expect-error https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/focus#browser_compatibility
      focusVisible: !1,
      preventScroll: !0
    })));
    const s = t.get(o.group);
    s && r.set(o.group, s.layout);
  }), Ze({
    cursorFlags: 0,
    hitRegions: n,
    initialLayoutMap: r,
    pointerDownAtPoint: { x: e.clientX, y: e.clientY },
    state: "active"
  }), n.length && e.preventDefault();
}
function go({
  document: e,
  event: t,
  hitRegions: n,
  initialLayoutMap: r,
  mountedGroups: a,
  pointerDownAtPoint: o,
  prevCursorFlags: s
}) {
  let l = 0;
  n.forEach((i) => {
    const { group: d, groupSize: u } = i, { orientation: f, panels: m } = d, { disableCursor: P } = d.mutableState;
    let g = 0;
    o ? f === "horizontal" ? g = (t.clientX - o.x) / u * 100 : g = (t.clientY - o.y) / u * 100 : f === "horizontal" ? g = t.clientX < 0 ? -100 : 100 : g = t.clientY < 0 ? -100 : 100;
    const h = r.get(d), b = a.get(d);
    if (!h || !b)
      return;
    const {
      defaultLayoutDeferred: S,
      derivedPanelConstraints: I,
      groupSize: y,
      layout: w,
      separatorToPanels: A
    } = b;
    if (I && w && A) {
      const E = ft({
        delta: g,
        initialLayout: h,
        panelConstraints: I,
        pivotIndices: i.panels.map((_) => m.indexOf(_)),
        prevLayout: w,
        trigger: "mouse-or-touch"
      });
      if (Oe(E, w)) {
        if (g !== 0 && !P)
          switch (f) {
            case "horizontal": {
              l |= g < 0 ? so : io;
              break;
            }
            case "vertical": {
              l |= g < 0 ? co : lo;
              break;
            }
          }
      } else
        ke(i.group, {
          defaultLayoutDeferred: S,
          derivedPanelConstraints: I,
          groupSize: y,
          layout: E,
          separatorToPanels: A
        });
    }
  });
  let c = 0;
  t.movementX === 0 ? c |= s & sr : c |= l & sr, t.movementY === 0 ? c |= s & ir : c |= l & ir, uc(c), Tn(e);
}
function yr(e) {
  const t = je(), n = _e();
  switch (n.state) {
    case "active":
      go({
        document: e.currentTarget,
        event: e,
        hitRegions: n.hitRegions,
        initialLayoutMap: n.initialLayoutMap,
        mountedGroups: t,
        prevCursorFlags: n.cursorFlags
      });
  }
}
function vr(e) {
  var r, a;
  if (e.defaultPrevented)
    return;
  const t = _e(), n = je();
  switch (t.state) {
    case "active": {
      if (
        // Skip this check for "pointerleave" events, else Firefox triggers a false positive (see #514)
        e.buttons === 0
      ) {
        Ze({
          cursorFlags: 0,
          state: "inactive"
        }), t.hitRegions.forEach((o) => {
          const s = Le(o.group.id, !0);
          ke(o.group, s, {
            isUserInteraction: !0
          });
        });
        return;
      }
      for (const o of t.hitRegions)
        if (o.separator) {
          const { element: s } = o.separator;
          (r = s.hasPointerCapture) != null && r.call(s, e.pointerId) || ((a = s.setPointerCapture) == null || a.call(s, e.pointerId));
        }
      go({
        document: e.currentTarget,
        event: e,
        hitRegions: t.hitRegions,
        initialLayoutMap: t.initialLayoutMap,
        mountedGroups: n,
        pointerDownAtPoint: t.pointerDownAtPoint,
        prevCursorFlags: t.cursorFlags
      });
      break;
    }
    default: {
      const o = Mn(e, n);
      o.length === 0 ? t.state !== "inactive" && Ze({
        cursorFlags: 0,
        state: "inactive"
      }) : Ze({
        cursorFlags: 0,
        hitRegions: o,
        state: "hover"
      }), Tn(e.currentTarget);
      break;
    }
  }
}
function wr(e) {
  if (e.relatedTarget instanceof HTMLIFrameElement)
    switch (_e().state) {
      case "hover":
        Ze({
          cursorFlags: 0,
          state: "inactive"
        });
    }
}
function Sr(e) {
  e.defaultPrevented || e.pointerType === "mouse" && e.button > 0 || fo(e.currentTarget) && e.preventDefault();
}
function Pr(e) {
  let t = 0, n = 0;
  const r = {};
  for (const o of e)
    if (o.defaultSize !== void 0) {
      t++;
      const s = ue(o.defaultSize);
      n += s, r[o.panelId] = s;
    } else
      r[o.panelId] = void 0;
  const a = e.length - t;
  if (a !== 0) {
    const o = ue((100 - n) / a);
    for (const s of e)
      s.defaultSize === void 0 && (r[s.panelId] = o);
  }
  return r;
}
function Rc(e, t, n) {
  if (!n[0])
    return;
  const r = e.panels.find((c) => c.element === t);
  if (!r || !r.onResize)
    return;
  const a = et({ group: e }), o = e.orientation === "horizontal" ? r.element.offsetWidth : r.element.offsetHeight, s = r.mutableValues.prevSize, l = {
    asPercentage: ue(o / a * 100),
    inPixels: o
  };
  r.mutableValues.prevSize = l, r.onResize(l, r.id, s);
}
function Tc(e, t) {
  if (Object.keys(e).length !== Object.keys(t).length)
    return !1;
  for (const n in e)
    if (e[n] !== t[n])
      return !1;
  return !0;
}
function Ec({
  group: e,
  nextGroupSize: t,
  prevGroupSize: n,
  prevLayout: r
}) {
  if (n <= 0 || t <= 0 || n === t)
    return r;
  let a = 0, o = 0, s = !1;
  const l = /* @__PURE__ */ new Map(), c = [];
  for (const u of e.panels) {
    const f = r[u.id] ?? 0;
    switch (u.panelConstraints.groupResizeBehavior) {
      case "preserve-pixel-size": {
        s = !0;
        const m = f / 100 * n, P = ue(
          m / t * 100
        );
        l.set(u.id, P), a += P;
        break;
      }
      case "preserve-relative-size":
      default: {
        c.push(u.id), o += f;
        break;
      }
    }
  }
  if (!s || c.length === 0)
    return r;
  const i = 100 - a, d = { ...r };
  if (l.forEach((u, f) => {
    d[f] = u;
  }), o > 0)
    for (const u of c) {
      const f = r[u] ?? 0;
      d[u] = ue(
        f / o * i
      );
    }
  else {
    const u = ue(
      i / c.length
    );
    for (const f of c)
      d[f] = u;
  }
  return d;
}
function Mc(e, t) {
  const n = e.map((a) => a.id), r = Object.keys(t);
  if (n.length !== r.length)
    return !1;
  for (const a of n)
    if (!r.includes(a))
      return !1;
  return !0;
}
const We = /* @__PURE__ */ new Map();
function kc(e) {
  let t = !0;
  Y(
    e.element.ownerDocument.defaultView,
    "Cannot register an unmounted Group"
  );
  const n = e.element.ownerDocument.defaultView.ResizeObserver, r = /* @__PURE__ */ new Set(), a = /* @__PURE__ */ new Set(), o = new n((P) => {
    for (const g of P) {
      const { borderBoxSize: h, target: b } = g;
      if (b === e.element) {
        if (t) {
          const S = et({ group: e });
          if (S === 0)
            return;
          const I = Le(e.id);
          if (!I)
            return;
          const y = rn(e), w = I.defaultLayoutDeferred ? Pr(y) : I.layout, A = Ec({
            group: e,
            nextGroupSize: S,
            prevGroupSize: I.groupSize,
            prevLayout: w
          }), E = Fe({
            layout: A,
            panelConstraints: y
          });
          if (!I.defaultLayoutDeferred && Oe(I.layout, E) && Tc(
            I.derivedPanelConstraints,
            y
          ) && I.groupSize === S)
            return;
          ke(e, {
            defaultLayoutDeferred: !1,
            derivedPanelConstraints: y,
            groupSize: S,
            layout: E,
            separatorToPanels: I.separatorToPanels
          });
        }
      } else
        Rc(e, b, h);
    }
  });
  o.observe(e.element), e.panels.forEach((P) => {
    Y(
      !r.has(P.id),
      `Panel ids must be unique; id "${P.id}" was used more than once`
    ), r.add(P.id), P.onResize && o.observe(P.element);
  });
  const s = et({ group: e }), l = rn(e), c = e.panels.map(({ id: P }) => P).join(",");
  let i = e.mutableState.defaultLayout;
  i && (Mc(e.panels, i) || (i = void 0));
  const d = e.mutableState.layouts[c] ?? i ?? Pr(l), u = Fe({
    layout: d,
    panelConstraints: l
  }), f = e.element.ownerDocument;
  We.set(
    f,
    (We.get(f) ?? 0) + 1
  );
  const m = /* @__PURE__ */ new Map();
  return oo(e).forEach((P) => {
    P.separator && m.set(P.separator, P.panels);
  }), ke(e, {
    defaultLayoutDeferred: s === 0,
    derivedPanelConstraints: l,
    groupSize: s,
    layout: u,
    separatorToPanels: m
  }), e.separators.forEach((P) => {
    Y(
      !a.has(P.id),
      `Separator ids must be unique; id "${P.id}" was used more than once`
    ), a.add(P.id), P.element.addEventListener("keydown", gr);
  }), We.get(f) === 1 && (f.addEventListener("contextmenu", ur, !0), f.addEventListener("dblclick", hr, !0), f.addEventListener("pointerdown", br, !0), f.addEventListener("pointerleave", yr), f.addEventListener("pointermove", vr), f.addEventListener("pointerout", wr), f.addEventListener("pointerup", Sr, !0)), function() {
    t = !1, We.set(
      f,
      Math.max(0, (We.get(f) ?? 0) - 1)
    ), pc(e), e.separators.forEach((P) => {
      P.element.removeEventListener("keydown", gr);
    }), We.get(f) || (f.removeEventListener(
      "contextmenu",
      ur,
      !0
    ), f.removeEventListener(
      "dblclick",
      hr,
      !0
    ), f.removeEventListener(
      "pointerdown",
      br,
      !0
    ), f.removeEventListener("pointerleave", yr), f.removeEventListener("pointermove", vr), f.removeEventListener("pointerout", wr), f.removeEventListener("pointerup", Sr, !0)), o.disconnect();
  };
}
function Nc() {
  const [e, t] = L({}), n = x(() => t({}), []);
  return [e, n];
}
function kn(e) {
  const t = fn();
  return `${e ?? t}`;
}
const Ue = typeof window < "u" ? $e : $;
function it(e) {
  const t = N(e);
  return Ue(() => {
    t.current = e;
  }, [e]), x(
    (...n) => {
      var r;
      return (r = t.current) == null ? void 0 : r.call(t, ...n);
    },
    [t]
  );
}
function Nn(...e) {
  return it((t) => {
    e.forEach((n) => {
      if (n)
        switch (typeof n) {
          case "function": {
            n(t);
            break;
          }
          case "object": {
            n.current = t;
            break;
          }
        }
    });
  });
}
function An(e) {
  const t = N({ ...e });
  return Ue(() => {
    for (const n in e)
      t.current[n] = e[n];
  }, [e]), t.current;
}
const bo = dn(null);
function Ac(e, t) {
  const n = N({
    getLayout: () => ({}),
    setLayout: fc
  });
  ln(t, () => n.current, []), Ue(() => {
    Object.assign(
      n.current,
      ho({ groupId: e })
    );
  });
}
function yo({
  children: e,
  className: t,
  defaultLayout: n,
  disableCursor: r,
  disabled: a,
  elementRef: o,
  groupRef: s,
  id: l,
  onLayoutChange: c,
  onLayoutChanged: i,
  orientation: d = "horizontal",
  resizeTargetMinimumSize: u = {
    coarse: 20,
    fine: 10
  },
  style: f,
  ...m
}) {
  const P = N({
    onLayoutChange: {},
    onLayoutChanged: {}
  }), g = it((T) => {
    Oe(P.current.onLayoutChange, T) || (P.current.onLayoutChange = T, c == null || c(T));
  }), h = it(
    (T, v) => {
      Oe(P.current.onLayoutChanged, T) || (P.current.onLayoutChanged = T, i == null || i(T, { isUserInteraction: v }));
    }
  ), b = kn(l), S = N(null), [I, y] = Nc(), w = N({
    lastExpandedPanelSizes: {},
    layouts: {},
    panels: [],
    resizeTargetMinimumSize: u,
    separators: []
  }), A = Nn(S, o);
  Ac(b, s);
  const E = it(
    (T, v) => {
      const M = _e(), C = dr(T), z = Le(T);
      if (z) {
        let O = !1;
        switch (M.state) {
          case "active": {
            O = M.hitRegions.some(
              (B) => B.group === C
            );
            break;
          }
        }
        return {
          flexGrow: z.layout[v] ?? 1,
          pointerEvents: O ? "none" : void 0
        };
      }
      if (n != null && n[v])
        return {
          flexGrow: n == null ? void 0 : n[v]
        };
    }
  ), _ = An({
    defaultLayout: n,
    disableCursor: r
  }), k = q(
    () => ({
      get disableCursor() {
        return !!_.disableCursor;
      },
      getPanelStyles: E,
      id: b,
      orientation: d,
      registerPanel: (T) => {
        const v = w.current;
        return v.panels = on(d, [
          ...v.panels,
          T
        ]), y(), () => {
          v.panels = v.panels.filter(
            (M) => M !== T
          ), y();
        };
      },
      registerSeparator: (T) => {
        const v = w.current;
        return v.separators = on(d, [
          ...v.separators,
          T
        ]), y(), () => {
          v.separators = v.separators.filter(
            (M) => M !== T
          ), y();
        };
      },
      updatePanelProps: (T, { disabled: v }) => {
        const M = w.current.panels.find(
          (O) => O.id === T
        );
        M && (M.panelConstraints.disabled = v);
        const C = dr(b), z = Le(b);
        C && z && ke(C, {
          ...z,
          derivedPanelConstraints: rn(C)
        });
      },
      updateSeparatorProps: (T, {
        disabled: v,
        disableDoubleClick: M
      }) => {
        const C = w.current.separators.find(
          (z) => z.id === T
        );
        C && (C.disabled = v, C.disableDoubleClick = M);
      }
    }),
    [E, b, y, d, _]
  ), R = N(null);
  return Ue(() => {
    const T = S.current;
    if (T === null)
      return;
    const v = w.current;
    let M;
    if (_.defaultLayout !== void 0 && Object.keys(_.defaultLayout).length === v.panels.length) {
      M = {};
      for (const oe of v.panels) {
        const re = _.defaultLayout[oe.id];
        re !== void 0 && (M[oe.id] = re);
      }
    }
    const C = {
      disabled: !!a,
      element: T,
      id: b,
      mutableState: {
        defaultLayout: M,
        disableCursor: !!_.disableCursor,
        expandedPanelSizes: w.current.lastExpandedPanelSizes,
        layouts: w.current.layouts
      },
      orientation: d,
      panels: v.panels,
      resizeTargetMinimumSize: v.resizeTargetMinimumSize,
      separators: v.separators
    };
    R.current = C;
    const z = kc(C), { defaultLayoutDeferred: O, derivedPanelConstraints: B, layout: ee } = Le(C.id, !0);
    !O && B.length > 0 && (g(ee), h(ee, !1));
    const X = En(b, (oe) => {
      const { defaultLayoutDeferred: re, derivedPanelConstraints: ie, layout: U } = oe.next;
      if (re || ie.length === 0)
        return;
      const K = C.panels.map(({ id: Q }) => Q).join(",");
      C.mutableState.layouts[K] = U, ie.forEach((Q) => {
        if (Q.collapsible) {
          const { layout: le } = oe.prev ?? {};
          if (le) {
            const pe = de(
              Q.collapsedSize,
              U[Q.panelId]
            ), me = de(
              Q.collapsedSize,
              le[Q.panelId]
            );
            pe && !me && (C.mutableState.expandedPanelSizes[Q.panelId] = le[Q.panelId]);
          }
        }
      });
      const Z = _e().state !== "active";
      g(U), Z && h(U, oe.isUserInteraction);
    });
    return () => {
      R.current = null, z(), X();
    };
  }, [
    a,
    b,
    h,
    g,
    d,
    I,
    _
  ]), $(() => {
    const T = R.current;
    T && (T.mutableState.defaultLayout = n, T.mutableState.disableCursor = !!r);
  }), /* @__PURE__ */ p(bo.Provider, { value: k, children: /* @__PURE__ */ p(
    "div",
    {
      ...m,
      className: t,
      "data-group": !0,
      "data-testid": b,
      id: b,
      ref: A,
      style: {
        height: "100%",
        width: "100%",
        overflow: "hidden",
        ...f,
        display: "flex",
        flexDirection: d === "horizontal" ? "row" : "column",
        flexWrap: "nowrap",
        // Inform the browser that the library is handling touch events for this element
        // but still allow users to scroll content within panels in the non-resizing direction
        // NOTE This is not an inherited style
        // See github.com/bvaughn/react-resizable-panels/issues/662
        touchAction: d === "horizontal" ? "pan-y" : "pan-x"
      },
      children: e
    }
  ) });
}
yo.displayName = "Group";
function xn() {
  const e = un(bo);
  return Y(
    e,
    "Group Context not found; did you render a Panel or Separator outside of a Group?"
  ), e;
}
function xc(e, t) {
  const { id: n } = xn(), r = N({
    collapse: Ht,
    expand: Ht,
    getSize: () => ({
      asPercentage: 0,
      inPixels: 0
    }),
    isCollapsed: () => !1,
    resize: Ht
  });
  ln(t, () => r.current, []), Ue(() => {
    Object.assign(
      r.current,
      po({ groupId: n, panelId: e })
    );
  });
}
function an({
  children: e,
  className: t,
  collapsedSize: n = "0%",
  collapsible: r = !1,
  defaultSize: a,
  disabled: o,
  elementRef: s,
  groupResizeBehavior: l = "preserve-relative-size",
  id: c,
  maxSize: i = "100%",
  minSize: d = "0%",
  onResize: u,
  panelRef: f,
  style: m,
  ...P
}) {
  const g = !!c, h = kn(c), b = An({
    disabled: o
  }), S = N(null), I = Nn(S, s), {
    getPanelStyles: y,
    id: w,
    orientation: A,
    registerPanel: E,
    updatePanelProps: _
  } = xn(), k = u !== null, R = it(
    (C, z, O) => {
      u == null || u(C, c, O);
    }
  );
  Ue(() => {
    const C = S.current;
    if (C !== null) {
      const z = {
        element: C,
        id: h,
        idIsStable: g,
        mutableValues: {
          expandToSize: void 0,
          prevSize: void 0
        },
        onResize: k ? R : void 0,
        panelConstraints: {
          groupResizeBehavior: l,
          collapsedSize: n,
          collapsible: r,
          defaultSize: a,
          disabled: b.disabled,
          maxSize: i,
          minSize: d
        }
      };
      return E(z);
    }
  }, [
    l,
    n,
    r,
    a,
    k,
    h,
    g,
    i,
    d,
    R,
    E,
    b
  ]), $(() => {
    _(h, { disabled: o });
  }, [o, h, _]), xc(h, f);
  const T = () => {
    const C = y(w, h);
    if (C)
      return JSON.stringify(C);
  }, v = To(
    (C) => En(w, C),
    T,
    T
  );
  let M;
  return v ? M = JSON.parse(v) : a !== void 0 ? M = {
    flexGrow: void 0,
    flexShrink: void 0,
    flexBasis: a
  } : M = { flexGrow: 1 }, /* @__PURE__ */ p(
    "div",
    {
      ...P,
      "data-disabled": o || void 0,
      "data-panel": !0,
      "data-testid": h,
      id: h,
      ref: I,
      style: {
        ...Cc,
        display: "flex",
        flexBasis: 0,
        flexShrink: 1,
        overflow: "visible",
        ...M
      },
      children: /* @__PURE__ */ p(
        "div",
        {
          className: t,
          style: {
            maxHeight: "100%",
            maxWidth: "100%",
            flexGrow: 1,
            overflow: "auto",
            ...m,
            // Inform the browser that the library is handling touch events for this element
            // but still allow users to scroll content within panels in the non-resizing direction
            // NOTE This is not an inherited style
            // See github.com/bvaughn/react-resizable-panels/issues/662
            touchAction: A === "horizontal" ? "pan-y" : "pan-x"
          },
          children: e
        }
      )
    }
  );
}
an.displayName = "Panel";
const Cc = {
  minHeight: 0,
  maxHeight: "100%",
  height: "auto",
  minWidth: 0,
  maxWidth: "100%",
  width: "auto",
  border: "none",
  borderWidth: 0,
  padding: 0,
  margin: 0
};
function Lc({
  layout: e,
  panelConstraints: t,
  panelId: n,
  panelIndex: r
}) {
  let a, o;
  const s = e[n], l = t.find(
    (c) => c.panelId === n
  );
  if (l) {
    const c = l.maxSize, i = l.collapsible ? l.collapsedSize : l.minSize, d = [r, r + 1];
    o = Fe({
      layout: ft({
        delta: i - s,
        initialLayout: e,
        panelConstraints: t,
        pivotIndices: d,
        prevLayout: e
      }),
      panelConstraints: t
    })[n], a = Fe({
      layout: ft({
        delta: c - s,
        initialLayout: e,
        panelConstraints: t,
        pivotIndices: d,
        prevLayout: e
      }),
      panelConstraints: t
    })[n];
  }
  return {
    valueControls: n,
    valueMax: a,
    valueMin: o,
    valueNow: s
  };
}
function vo({
  children: e,
  className: t,
  disabled: n,
  disableDoubleClick: r,
  elementRef: a,
  id: o,
  style: s,
  ...l
}) {
  const c = kn(o), i = An({
    disabled: n,
    disableDoubleClick: r
  }), [d, u] = L({}), [f, m] = L("inactive"), [P, g] = L(!1), h = N(null), b = Nn(h, a), {
    disableCursor: S,
    id: I,
    orientation: y,
    registerSeparator: w,
    updateSeparatorProps: A
  } = xn(), E = y === "horizontal" ? "vertical" : "horizontal";
  Ue(() => {
    const R = h.current;
    if (R !== null) {
      const T = {
        disabled: i.disabled,
        disableDoubleClick: i.disableDoubleClick,
        element: R,
        id: c
      }, v = w(T), M = dc(
        (z) => {
          m(
            z.next.state !== "inactive" && z.next.hitRegions.some(
              (O) => O.separator === T
            ) ? z.next.state : "inactive"
          );
        }
      ), C = En(
        I,
        (z) => {
          const { derivedPanelConstraints: O, layout: B, separatorToPanels: ee } = z.next, X = ee.get(T);
          if (X) {
            const oe = X[0], re = X.indexOf(oe);
            u(
              Lc({
                layout: B,
                panelConstraints: O,
                panelId: oe.id,
                panelIndex: re
              })
            );
          }
        }
      );
      return () => {
        M(), C(), v();
      };
    }
  }, [I, c, w, i]), $(() => {
    A(c, { disabled: n, disableDoubleClick: r });
  }, [n, r, c, A]);
  let _;
  n && !S && (_ = "not-allowed");
  let k;
  if (n)
    k = "disabled";
  else
    switch (f) {
      case "active": {
        k = "active";
        break;
      }
      default:
        P ? k = "focus" : k = f;
    }
  return /* @__PURE__ */ p(
    "div",
    {
      ...l,
      "aria-controls": d.valueControls,
      "aria-disabled": n || void 0,
      "aria-orientation": E,
      "aria-valuemax": d.valueMax,
      "aria-valuemin": d.valueMin,
      "aria-valuenow": d.valueNow,
      children: e,
      className: t,
      "data-separator": k,
      "data-testid": c,
      id: c,
      onBlur: () => g(!1),
      onFocus: () => g(!0),
      ref: b,
      role: "separator",
      style: {
        flexBasis: "auto",
        cursor: _,
        ...s,
        flexGrow: 0,
        flexShrink: 0,
        // Inform the browser that the library is handling touch events for this element
        // See github.com/bvaughn/react-resizable-panels/issues/662
        touchAction: "none"
      },
      tabIndex: n ? void 0 : 0
    }
  );
}
vo.displayName = "Separator";
const Cn = 30, Ln = 65, mt = 50, zc = 100 - Ln, Dc = 100 - Cn;
function _c(e) {
  const t = Number(e);
  return Number.isFinite(t) ? Math.min(Ln, Math.max(Cn, t)) : mt;
}
function zn(e) {
  return 100 - e;
}
function He(e) {
  return `${e}%`;
}
const Dn = "reader-document", pt = "reader-assistant", wo = "retainpdf.reader.ai-split-layout.v1", Oc = {
  [Dn]: zn(mt),
  [pt]: mt
};
function _n(e) {
  const t = _c(e == null ? void 0 : e[pt]);
  return {
    [Dn]: zn(t),
    [pt]: t
  };
}
function Fc() {
  try {
    const e = JSON.parse(localStorage.getItem(wo) || "null");
    return _n(e);
  } catch {
    return Oc;
  }
}
function $c(e) {
  try {
    localStorage.setItem(wo, JSON.stringify(_n(e)));
  } catch {
  }
}
function Jt(e, t) {
  const n = e == null ? void 0 : e.closest(".reader-react-root");
  if (!n) return;
  const r = _n(t);
  n.style.setProperty(
    "--reader-ai-split-width",
    `${r[pt]}vw`
  );
}
function jc() {
  const e = N(null), [t] = L(Fc);
  $e(() => {
    const a = e.current;
    return Jt(a, t), () => {
      var o;
      (o = a == null ? void 0 : a.closest(".reader-react-root")) == null || o.style.removeProperty("--reader-ai-split-width");
    };
  }, [t]);
  const n = x((a) => {
    Jt(e.current, a);
  }, []), r = x((a, o) => {
    Jt(e.current, a), o.isUserInteraction && $c(a);
  }, []);
  return /* @__PURE__ */ D(
    yo,
    {
      id: "reader-ai-split",
      className: "reader-ai-split-resizer",
      elementRef: e,
      orientation: "horizontal",
      defaultLayout: t,
      onLayoutChange: n,
      onLayoutChanged: r,
      resizeTargetMinimumSize: { fine: 12, coarse: 28 },
      children: [
        /* @__PURE__ */ p(
          an,
          {
            id: Dn,
            defaultSize: He(zn(mt)),
            minSize: He(zc),
            maxSize: He(Dc)
          }
        ),
        /* @__PURE__ */ p(
          vo,
          {
            id: "reader-ai-split-separator",
            className: "reader-ai-split-separator",
            "aria-label": "调整文档与 AI 问答宽度",
            children: /* @__PURE__ */ p("span", { "aria-hidden": "true" })
          }
        ),
        /* @__PURE__ */ p(
          an,
          {
            id: pt,
            defaultSize: He(mt),
            minSize: He(Cn),
            maxSize: He(Ln)
          }
        )
      ]
    }
  );
}
const xe = 12, Uc = 4;
function qe(e, t, n) {
  if (typeof window > "u") return { x: e, y: t };
  const r = Math.min(n, window.innerWidth - xe * 2), a = Math.max(xe, window.innerWidth - r - xe), o = Math.min(window.innerHeight * 0.9, 860), s = Math.max(xe, window.innerHeight - o - xe);
  return {
    x: Math.min(a, Math.max(xe, e)),
    y: Math.min(s, Math.max(xe, t))
  };
}
function Ir(e) {
  if (typeof window > "u") return { x: 24, y: 72 };
  const t = Math.min(e, window.innerWidth - xe * 2);
  return qe(window.innerWidth - t - 20, 72, e);
}
function Bc(e, t) {
  try {
    const n = localStorage.getItem(e);
    if (!n) return Ir(t);
    const r = JSON.parse(n);
    if (typeof r.x == "number" && typeof r.y == "number")
      return qe(r.x, r.y, t);
  } catch {
  }
  return Ir(t);
}
function Wc(e, t) {
  try {
    localStorage.setItem(e, JSON.stringify(t));
  } catch {
  }
}
function Hc({
  id: e,
  open: t,
  title: n,
  subtitle: r = "拖动标题可移动",
  titleIcon: a,
  storageKey: o,
  ariaLabel: s,
  className: l = "",
  width: c = 360,
  placement: i = "floating",
  showHeader: d = !0,
  onClose: u,
  toolbar: f,
  children: m
}) {
  const P = i === "workspace", g = i === "dock-right", h = g || P, [b, S] = L(() => Bc(o, c)), [I, y] = L(!1), w = N(null);
  $(() => {
    !t || h || S((k) => qe(k.x, k.y, c));
  }, [h, t, c]), $(() => {
    if (!t || h) return;
    const k = () => S((R) => qe(R.x, R.y, c));
    return window.addEventListener("resize", k), () => window.removeEventListener("resize", k);
  }, [h, t, c]), $(() => {
    if (!t) return;
    const k = (R) => {
      var v;
      if (R.key !== "Escape") return;
      const T = R.target;
      (v = T == null ? void 0 : T.closest) != null && v.call(T, "textarea, input, select, [contenteditable='true']") || (R.preventDefault(), u());
    };
    return window.addEventListener("keydown", k), () => window.removeEventListener("keydown", k);
  }, [t, u]);
  const A = x((k) => {
    var R, T;
    h || k.button === 0 && ((T = (R = k.target) == null ? void 0 : R.closest) != null && T.call(R, "button") || (k.currentTarget.setPointerCapture(k.pointerId), w.current = {
      pointerId: k.pointerId,
      startX: k.clientX,
      startY: k.clientY,
      originX: b.x,
      originY: b.y,
      moved: !1
    }, y(!0)));
  }, [h, b.x, b.y]), E = x((k) => {
    const R = w.current;
    if (!R || R.pointerId !== k.pointerId) return;
    const T = k.clientX - R.startX, v = k.clientY - R.startY;
    !R.moved && Math.hypot(T, v) < Uc || (R.moved = !0, S(qe(R.originX + T, R.originY + v, c)));
  }, [c]), _ = x((k) => {
    const R = w.current;
    if (!(!R || R.pointerId !== k.pointerId)) {
      w.current = null, y(!1);
      try {
        k.currentTarget.releasePointerCapture(k.pointerId);
      } catch {
      }
      R.moved && S((T) => {
        const v = qe(T.x, T.y, c);
        return Wc(o, v), v;
      });
    }
  }, [o, c]);
  return t ? /* @__PURE__ */ D(
    "aside",
    {
      id: e,
      className: `reader-notes-panel reader-notes-panel--${P ? "workspace" : g ? "docked" : "float"}${h ? "" : " reader-floating-surface"}${d ? " has-panel-header" : " is-headerless"}${f ? " has-panel-toolbar" : ""}${I ? " is-dragging" : ""} ${l}`.trim(),
      style: h ? void 0 : { left: b.x, top: b.y, width: Math.min(c, typeof window < "u" ? window.innerWidth - 24 : c) },
      "aria-label": s,
      role: "dialog",
      "aria-modal": "false",
      children: [
        d ? /* @__PURE__ */ D(
          "header",
          {
            className: "reader-notes-panel-head",
            onPointerDown: A,
            onPointerMove: E,
            onPointerUp: _,
            onPointerCancel: _,
            children: [
              h ? null : /* @__PURE__ */ p("div", { className: "reader-notes-panel-drag", "aria-hidden": "true", children: /* @__PURE__ */ p(Qo, { size: 14, strokeWidth: 2.25 }) }),
              /* @__PURE__ */ D("div", { className: "reader-notes-panel-head-text", children: [
                /* @__PURE__ */ D("strong", { children: [
                  a,
                  n
                ] }),
                r ? /* @__PURE__ */ p("span", { children: r }) : null
              ] }),
              /* @__PURE__ */ p("button", { type: "button", className: "reader-notes-close reader-floating-close", "aria-label": `关闭${n}`, onClick: u, children: /* @__PURE__ */ p(tt, { size: 14, strokeWidth: 2.5, "aria-hidden": !0 }) })
            ]
          }
        ) : null,
        f ? /* @__PURE__ */ p("div", { className: "reader-notes-panel-toolbar", children: f }) : null,
        /* @__PURE__ */ p("div", { className: "reader-notes-panel-body", children: m })
      ]
    }
  ) : null;
}
function Jc({
  note: e,
  onJump: t,
  onUpdateNote: n,
  onRemove: r,
  disabled: a
}) {
  const [o, s] = L(!1), [l, c] = L(e.note);
  return $(() => {
    o || c(e.note);
  }, [e.note, o]), /* @__PURE__ */ D("article", { className: "reader-notes-item", children: [
    /* @__PURE__ */ D("div", { className: "reader-notes-item-top", children: [
      /* @__PURE__ */ p("span", { className: "reader-notes-kind", children: e.pane === "translated" ? "译文" : "原文" }),
      /* @__PURE__ */ D("div", { className: "reader-notes-item-actions", children: [
        /* @__PURE__ */ p("button", { type: "button", className: "reader-notes-link", onClick: () => t(e), children: "定位" }),
        /* @__PURE__ */ p("button", { type: "button", className: "reader-notes-danger", disabled: a, onClick: () => r(e.id), children: "删除" })
      ] })
    ] }),
    /* @__PURE__ */ p("p", { className: "reader-notes-quote", children: e.quote }),
    e.translatedQuote ? /* @__PURE__ */ D("p", { className: "reader-notes-note", children: [
      "译文：",
      e.translatedQuote
    ] }) : null,
    o ? /* @__PURE__ */ D("div", { className: "reader-notes-editor", children: [
      /* @__PURE__ */ p(
        "textarea",
        {
          className: "reader-notes-textarea",
          value: l,
          placeholder: "写点想法…",
          rows: 3,
          disabled: a,
          onChange: (i) => c(i.target.value)
        }
      ),
      /* @__PURE__ */ D("div", { className: "reader-notes-editor-actions", children: [
        /* @__PURE__ */ p(
          "button",
          {
            type: "button",
            className: "reader-notes-primary",
            disabled: a,
            onClick: async () => {
              await n(e.id, l) !== !1 && s(!1);
            },
            children: "保存"
          }
        ),
        /* @__PURE__ */ p("button", { type: "button", className: "reader-notes-link", onClick: () => s(!1), children: "取消" })
      ] })
    ] }) : e.note ? /* @__PURE__ */ p(
      "button",
      {
        type: "button",
        className: "reader-notes-note",
        disabled: a,
        onClick: () => s(!0),
        title: "点击编辑",
        children: e.note
      }
    ) : /* @__PURE__ */ p("button", { type: "button", className: "reader-notes-add-note", disabled: a, onClick: () => s(!0), children: "添加笔记" })
  ] });
}
function Vc({
  open: e,
  groups: t,
  count: n,
  onClose: r,
  onJump: a,
  onUpdateNote: o,
  onRemove: s,
  onExport: l,
  loading: c = !1,
  saving: i = !1,
  error: d = null,
  storageMode: u = "local",
  onRetry: f
}) {
  const [m, P] = L(!1);
  return /* @__PURE__ */ D(
    Hc,
    {
      id: "reader-notes-panel",
      open: e,
      title: "批注",
      subtitle: u === "server" ? "选中 PDF 文字后可添加 · 保存到文献库" : "选中 PDF 文字后可添加 · 本地保存",
      titleIcon: /* @__PURE__ */ p(Lt, { size: 14, strokeWidth: 2.25, "aria-hidden": !0 }),
      storageKey: "retainpdf.reader.notes-float.pos.v1",
      ariaLabel: "批注",
      onClose: r,
      toolbar: /* @__PURE__ */ D(xt, { children: [
        /* @__PURE__ */ D("span", { className: "reader-notes-count", children: [
          n,
          " 条"
        ] }),
        /* @__PURE__ */ p(
          "button",
          {
            type: "button",
            className: "reader-notes-export",
            disabled: m || n === 0,
            onClick: async () => {
              await l() && (P(!0), window.setTimeout(() => P(!1), 1800));
            },
            children: m ? "已复制" : "导出 Markdown"
          }
        )
      ] }),
      children: [
        c ? /* @__PURE__ */ p("p", { role: "status", className: "reader-notes-empty", children: "正在载入批注…" }) : null,
        i ? /* @__PURE__ */ p("p", { role: "status", className: "reader-notes-empty", children: "正在保存批注…" }) : null,
        d ? /* @__PURE__ */ D("div", { role: "alert", className: "reader-notes-empty", children: [
          /* @__PURE__ */ p("p", { children: d }),
          f ? /* @__PURE__ */ p("button", { type: "button", className: "reader-notes-link", disabled: i, onClick: f, children: "重新载入" }) : null
        ] }) : null,
        n === 0 ? /* @__PURE__ */ p("p", { className: "reader-notes-empty", children: "暂无批注。在 PDF 上拖选文字，点「添加批注」。" }) : t.map((g) => /* @__PURE__ */ D("section", { className: "reader-notes-group", children: [
          /* @__PURE__ */ D("h3", { className: "reader-notes-group-title", children: [
            "第 ",
            g.page,
            " 页"
          ] }),
          g.items.map((h) => /* @__PURE__ */ p(
            Jc,
            {
              note: h,
              onJump: a,
              onUpdateNote: o,
              onRemove: s,
              disabled: i || c
            },
            h.id
          ))
        ] }, g.page))
      ]
    }
  );
}
function qc({
  regionsFailed: e = !1,
  metadataFailed: t = !1
}) {
  const [n, r] = L(!1);
  if ($(() => {
    !e && !t && r(!1);
  }, [e, t]), n || !e && !t)
    return null;
  const a = [
    e ? "译文区域" : "",
    t ? "阅读元数据" : ""
  ].filter(Boolean);
  return /* @__PURE__ */ D("div", { className: "reader-error-notice", role: "status", "data-reader-error-notice": "true", children: [
    /* @__PURE__ */ D("span", { className: "reader-error-notice-text", children: [
      a.join("、"),
      "加载失败，正文仍可正常阅读。"
    ] }),
    /* @__PURE__ */ p(
      "button",
      {
        type: "button",
        className: "reader-error-notice-dismiss",
        "aria-label": "关闭提示",
        onClick: () => r(!0),
        children: "×"
      }
    )
  ] });
}
function Kc({
  loading: e,
  failed: t,
  text: n,
  percent: r,
  regionsError: a = !1,
  metadataError: o = !1
}) {
  return !e && !t ? /* @__PURE__ */ p(qc, { regionsFailed: a, metadataFailed: o }) : /* @__PURE__ */ D(xt, { children: [
    e ? /* @__PURE__ */ p("div", { className: "reader-boot-loading", "data-reader-boot-loading": "true", children: /* @__PURE__ */ D("div", { className: "reader-boot-loading-card", children: [
      /* @__PURE__ */ p("div", { className: "reader-boot-loading-text", children: n }),
      /* @__PURE__ */ p("div", { className: "reader-boot-loading-track", children: /* @__PURE__ */ p(
        "span",
        {
          className: "reader-boot-loading-bar",
          style: { width: `${Math.max(0, Math.min(100, r))}%` }
        }
      ) })
    ] }) }) : null,
    t ? /* @__PURE__ */ p("div", { className: "reader-react-error", role: "alert", children: n }) : null
  ] });
}
async function Gc(e) {
  var a;
  const t = `${e || ""}`;
  if (!t) throw new Error("empty selection");
  try {
    if ((a = navigator.clipboard) != null && a.writeText) {
      await navigator.clipboard.writeText(t);
      return;
    }
  } catch {
  }
  const n = document.createElement("textarea");
  n.value = t, n.setAttribute("readonly", ""), n.style.position = "fixed", n.style.opacity = "0", document.body.appendChild(n), n.select();
  const r = document.execCommand("copy");
  if (n.remove(), !r) throw new Error("copy failed");
}
function Yc({
  selection: e,
  onDismiss: t,
  onAskAi: n,
  onAddNote: r
}) {
  const [a, o] = L(!1), s = e ? e.selectionType === "text" ? `${e.pane}:${e.page}:${e.quote}` : `${e.region.itemId}:${e.pane}` : "";
  if ($(() => o(!1), [s]), !e)
    return null;
  const l = typeof window < "u" ? window.innerWidth : 800, c = typeof window < "u" ? window.innerHeight : 600, i = e.rect.left + e.rect.width / 2, d = 170, u = Math.min(Math.max(16 + d, i), l - 16 - d), f = e.rect.top > 72, m = f ? Math.max(12, e.rect.top - 8) : Math.min(c - 12, e.rect.top + e.rect.height + 8), P = f ? "above" : "below", g = e.pane === "translated" ? "译文" : "原文", h = e.selectionType === "text" ? "text" : e.kind, b = e.selectionType === "text" ? e.quote : Nr(e.region, e.pane), S = h === "formula" ? "公式" : h === "table" ? "表格" : h === "figure" ? "图片" : h === "text" ? "文字" : "区域", I = h === "formula" ? $o(b) : b, y = h === "formula" ? ea : h === "table" ? ta : h === "text" ? na : ra;
  return /* @__PURE__ */ D(
    "div",
    {
      className: `reader-sel-pop reader-sel-pop--${P} reader-sel-pop--region`,
      style: { left: u, top: m },
      role: "toolbar",
      "aria-label": "选区操作",
      onPointerDown: (w) => {
        w.preventDefault();
      },
      children: [
        /* @__PURE__ */ D("div", { className: "reader-sel-pop-card reader-floating-surface", children: [
          /* @__PURE__ */ D("div", { className: "reader-sel-pop-context", children: [
            /* @__PURE__ */ p(y, { size: 15, strokeWidth: 2.1, "aria-hidden": !0 }),
            /* @__PURE__ */ p("span", { children: S }),
            /* @__PURE__ */ p("span", { className: "reader-sel-pop-context-divider", "aria-hidden": !0, children: "·" }),
            /* @__PURE__ */ p("span", { children: g }),
            /* @__PURE__ */ p("span", { className: "reader-sel-pop-context-divider", "aria-hidden": !0, children: "·" }),
            /* @__PURE__ */ D("span", { children: [
              e.page,
              " 页"
            ] })
          ] }),
          /* @__PURE__ */ D("div", { className: "reader-sel-pop-actions", children: [
            I ? /* @__PURE__ */ D(
              "button",
              {
                type: "button",
                className: "reader-sel-pop-btn reader-sel-pop-btn--primary",
                onClick: async () => {
                  try {
                    await Gc(I), o(!0), window.setTimeout(() => o(!1), 1400);
                  } catch (w) {
                    console.warn("[reader-selection] copy failed", w);
                  }
                },
                children: [
                  a ? /* @__PURE__ */ p(oa, { size: 15, strokeWidth: 2.4, "aria-hidden": !0 }) : /* @__PURE__ */ p(aa, { size: 15, strokeWidth: 2.2, "aria-hidden": !0 }),
                  /* @__PURE__ */ p("span", { children: a ? "已复制" : h === "formula" ? "复制 LaTeX" : "复制" })
                ]
              }
            ) : /* @__PURE__ */ p("span", { className: "reader-sel-pop-selection-hint", children: "已选择图片" }),
            r && I ? /* @__PURE__ */ D(
              "button",
              {
                type: "button",
                className: "reader-sel-pop-btn reader-sel-pop-btn--secondary",
                onClick: () => r({ page: e.page, pane: e.pane, quote: I }),
                children: [
                  /* @__PURE__ */ p(Lt, { size: 15, strokeWidth: 2.2, "aria-hidden": !0 }),
                  /* @__PURE__ */ p("span", { children: "添加批注" })
                ]
              }
            ) : null,
            n ? /* @__PURE__ */ D(
              "button",
              {
                type: "button",
                className: "reader-sel-pop-btn reader-sel-pop-btn--secondary",
                onClick: () => n(e),
                children: [
                  /* @__PURE__ */ p(pn, { size: 15, strokeWidth: 2.2, "aria-hidden": !0 }),
                  /* @__PURE__ */ p("span", { children: "问 AI" })
                ]
              }
            ) : null,
            /* @__PURE__ */ p(
              "button",
              {
                type: "button",
                className: "reader-sel-pop-btn reader-sel-pop-btn--ghost",
                onClick: t,
                "aria-label": "取消选区",
                title: "取消",
                children: /* @__PURE__ */ p(tt, { size: 15, strokeWidth: 2.5, "aria-hidden": !0 })
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ p("span", { className: "reader-sel-pop-caret", "aria-hidden": "true" })
      ]
    }
  );
}
function Zc(e) {
  if (!(e instanceof HTMLElement)) return !1;
  const t = e.tagName;
  return t === "INPUT" || t === "TEXTAREA" || t === "SELECT" || e.isContentEditable ? !0 : !!e.closest("input, textarea, select, [contenteditable='true']");
}
function Xc() {
  const [e, t] = L(!1), n = fn(), r = N(null);
  return $(() => {
    if (!e) return;
    const a = (s) => {
      const l = r.current;
      l && s.target instanceof Node && !l.contains(s.target) && t(!1);
    }, o = (s) => {
      s.key === "Escape" && (s.preventDefault(), t(!1));
    };
    return document.addEventListener("mousedown", a), window.addEventListener("keydown", o), () => {
      document.removeEventListener("mousedown", a), window.removeEventListener("keydown", o);
    };
  }, [e]), $(() => {
    const a = (o) => {
      if (o.defaultPrevented || o.metaKey || o.ctrlKey || o.altKey || Zc(o.target)) return;
      const s = o.key;
      if (s === "?" || s === "h" || s === "H" || s === "/") {
        if (s === "/" && !o.shiftKey)
          return;
        o.preventDefault(), t((l) => !l);
      }
    };
    return window.addEventListener("keydown", a), () => window.removeEventListener("keydown", a);
  }, []), /* @__PURE__ */ D("div", { className: "reader-react-shortcuts", ref: r, "data-reader-shortcuts": "", children: [
    /* @__PURE__ */ p(
      "button",
      {
        type: "button",
        className: `reader-react-hud-btn reader-react-shortcuts-btn${e ? " is-active" : ""}`,
        "aria-label": "快捷键说明",
        "aria-expanded": e,
        "aria-controls": n,
        title: "快捷键（H 或 ?）",
        onClick: () => t((a) => !a),
        children: /* @__PURE__ */ p(sa, { className: "reader-react-shortcuts-icon", size: 16, strokeWidth: 2.25, "aria-hidden": !0 })
      }
    ),
    e ? /* @__PURE__ */ D(
      "div",
      {
        id: n,
        className: "reader-react-shortcuts-panel reader-floating-surface",
        role: "dialog",
        "aria-label": "阅读器快捷键",
        children: [
          /* @__PURE__ */ D("div", { className: "reader-react-shortcuts-head", children: [
            /* @__PURE__ */ p("strong", { children: "快捷键" }),
            /* @__PURE__ */ p(
              "button",
              {
                type: "button",
                className: "reader-react-shortcuts-close reader-floating-close",
                "aria-label": "关闭",
                onClick: () => t(!1),
                children: "×"
              }
            )
          ] }),
          /* @__PURE__ */ p("div", { className: "reader-react-shortcuts-body", children: di.map((a) => /* @__PURE__ */ D("section", { className: "reader-react-shortcuts-group", children: [
            /* @__PURE__ */ p("h3", { children: a.title }),
            /* @__PURE__ */ p("ul", { children: a.items.map((o) => /* @__PURE__ */ D("li", { children: [
              /* @__PURE__ */ p("kbd", { children: o.keys }),
              /* @__PURE__ */ p("span", { children: o.desc })
            ] }, `${a.title}-${o.keys}`)) })
          ] }, a.title)) }),
          /* @__PURE__ */ p("p", { className: "reader-react-shortcuts-foot", children: "在输入框内不会触发快捷键" })
        ]
      }
    ) : null
  ] });
}
const Qc = Object.freeze([
  {
    id: "favorites",
    label: "摘录",
    subIdle: "本书云端收藏",
    subOpen: "关闭悬浮窗",
    needsJob: !1
  },
  {
    id: "markdown",
    label: "Markdown",
    subIdle: "识别 / 译文文本",
    subOpen: "关闭悬浮窗",
    needsJob: !0
  },
  {
    id: "ai",
    label: "AI 问答",
    subIdle: "基于文档提问",
    subOpen: "关闭悬浮窗",
    needsJob: !0
  }
]), el = ["source", "sideBySide", "translated"], tl = { source: "", translated: "", sideBySide: "" };
function nl(e) {
  if (e.sourceOnly || !e.jobId) {
    const t = lt(e.sourceUrl), n = lt(e.translatedUrl);
    return {
      source: t,
      translated: n,
      // sideBySide requires dedicated artifact; no fallback to source url
      sideBySide: ""
    };
  }
  return Aa({
    jobId: e.jobId,
    jobPayload: e.jobPayload,
    manifestPayload: e.manifestPayload
  });
}
function rl(e) {
  const [t, n] = L(() => /* @__PURE__ */ new Set()), r = q(
    () => e ? nl(e) : tl,
    [e]
  ), a = q(
    () => el.filter((s) => !(e != null && e.sourceOnly && s !== "source")),
    [e == null ? void 0 : e.sourceOnly]
  ), o = x(async (s) => {
    if (!e) return;
    const l = lt(r[s]);
    if (!(!l || t.has(s)))
      try {
        const c = e.jobId ? Na(s, {
          jobId: e.jobId,
          jobPayload: e.jobPayload,
          manifestPayload: e.manifestPayload
        }) : `${e.sourceOnly ? "document" : "reader"}-${s}.pdf`;
        await xa(
          e.fetchProtected,
          l,
          c,
          c,
          null,
          (i) => n((d) => {
            const u = new Set(d);
            return i ? u.add(s) : u.delete(s), u;
          })
        );
      } catch (c) {
        const i = c instanceof Error ? c.message : "下载失败";
        Ca(i), n((d) => {
          const u = new Set(d);
          return u.delete(s), u;
        });
      }
  }, [r, t, e]);
  return { urls: r, downloadItems: a, busyActions: t, handleDownload: o };
}
function ol(e) {
  const [t, n] = L(!1), r = x(() => n(!1), []), a = x(() => n((o) => !o), []);
  return $(() => {
    if (!t) return;
    const o = (l) => {
      const c = e.current;
      c && l.target instanceof Node && !c.contains(l.target) && n(!1);
    }, s = (l) => {
      l.key === "Escape" && (l.preventDefault(), n(!1));
    };
    return document.addEventListener("mousedown", o), window.addEventListener("keydown", s), () => {
      document.removeEventListener("mousedown", o), window.removeEventListener("keydown", s);
    };
  }, [t, e]), { open: t, setOpen: n, closeMenu: r, toggleMenu: a };
}
const So = "retainpdf.reader.fab.pos.v1", At = 52, Je = 12, al = 6;
function ct(e, t) {
  if (typeof window > "u")
    return { x: e, y: t };
  const n = Math.max(Je, window.innerWidth - At - Je), r = Math.max(Je, window.innerHeight - At - Je);
  return {
    x: Math.min(n, Math.max(Je, e)),
    y: Math.min(r, Math.max(Je, t))
  };
}
function Rr() {
  return typeof window > "u" ? { x: 24, y: 120 } : ct(
    window.innerWidth - At - 20,
    window.innerHeight - At - 88
  );
}
function sl() {
  try {
    const e = localStorage.getItem(So);
    if (!e) return Rr();
    const t = JSON.parse(e);
    if (typeof t.x == "number" && typeof t.y == "number")
      return ct(t.x, t.y);
  } catch {
  }
  return Rr();
}
function il(e) {
  try {
    localStorage.setItem(So, JSON.stringify(e));
  } catch {
  }
}
function cl(e) {
  return typeof window < "u" && e.y > window.innerHeight * 0.55;
}
function ll(e = {}) {
  const { onDragStart: t, onActivate: n } = e, [r, a] = L(() => sl()), o = N(null);
  $(() => {
    const i = () => a((d) => ct(d.x, d.y));
    return window.addEventListener("resize", i), () => window.removeEventListener("resize", i);
  }, []);
  const s = x((i) => {
    i.button === 0 && (i.currentTarget.setPointerCapture(i.pointerId), o.current = {
      pointerId: i.pointerId,
      startX: i.clientX,
      startY: i.clientY,
      originX: r.x,
      originY: r.y,
      moved: !1
    });
  }, [r.x, r.y]), l = x((i) => {
    const d = o.current;
    if (!d || d.pointerId !== i.pointerId) return;
    const u = i.clientX - d.startX, f = i.clientY - d.startY;
    !d.moved && Math.hypot(u, f) < al || (d.moved || (d.moved = !0, t == null || t()), a(ct(d.originX + u, d.originY + f)));
  }, [t]), c = x((i) => {
    const d = o.current;
    if (!(!d || d.pointerId !== i.pointerId)) {
      o.current = null;
      try {
        i.currentTarget.releasePointerCapture(i.pointerId);
      } catch {
      }
      if (d.moved) {
        a((u) => {
          const f = ct(u.x, u.y);
          return il(f), f;
        });
        return;
      }
      n == null || n();
    }
  }, [n]);
  return {
    pos: r,
    openUp: cl(r),
    onPointerDown: s,
    onPointerMove: l,
    onPointerUp: c
  };
}
const dl = {
  source: xr,
  sideBySide: Cr,
  translated: Lr
}, ul = {
  source: "原文",
  sideBySide: "对照",
  translated: "译文"
};
function fl({ onClose: e }) {
  return /* @__PURE__ */ D("header", { className: "reader-fab-menu-head", children: [
    /* @__PURE__ */ D("div", { className: "reader-fab-menu-head-text", children: [
      /* @__PURE__ */ p("strong", { children: "工具" }),
      /* @__PURE__ */ p("span", { children: "拖动圆钮可移动" })
    ] }),
    /* @__PURE__ */ p(
      "button",
      {
        type: "button",
        className: "reader-fab-menu-close reader-floating-close",
        "aria-label": "关闭菜单",
        onClick: e,
        children: /* @__PURE__ */ p(tt, { size: 14, strokeWidth: 2.5, "aria-hidden": !0 })
      }
    )
  ] });
}
function ml({
  index: e,
  icon: t,
  title: n,
  sub: r,
  active: a,
  disabled: o,
  onClick: s
}) {
  return /* @__PURE__ */ D(
    "button",
    {
      type: "button",
      role: "menuitem",
      className: `reader-fab-row${a ? " is-active" : ""}${o ? " is-disabled" : ""}`,
      "aria-pressed": a,
      disabled: o,
      onClick: s,
      style: { "--fab-i": e + 1 },
      children: [
        /* @__PURE__ */ p("span", { className: "reader-fab-row-icon", "aria-hidden": "true", children: /* @__PURE__ */ p(t, { size: 18, strokeWidth: 2 }) }),
        /* @__PURE__ */ D("span", { className: "reader-fab-row-copy", children: [
          /* @__PURE__ */ p("span", { className: "reader-fab-row-title", children: n }),
          /* @__PURE__ */ p("span", { className: "reader-fab-row-sub", children: r })
        ] })
      ]
    }
  );
}
function pl({
  urls: e,
  items: t,
  busyActions: n,
  onDownload: r
}) {
  return /* @__PURE__ */ D("div", { className: "reader-fab-section", role: "group", "aria-label": "下载", children: [
    /* @__PURE__ */ D("div", { className: "reader-fab-section-head", children: [
      /* @__PURE__ */ p(ia, { size: 12, strokeWidth: 2.5, "aria-hidden": !0 }),
      /* @__PURE__ */ p("span", { children: "下载 PDF" })
    ] }),
    /* @__PURE__ */ p("div", { className: "reader-fab-download-grid", children: t.map((a, o) => {
      const s = Ao[a], l = lt(e[a]), c = n.has(a), i = !!l && !c, d = i ? "" : xo(a, e), u = dl[a];
      return /* @__PURE__ */ D(
        "button",
        {
          type: "button",
          role: "menuitem",
          id: `reader-fab-download-${a}`,
          className: `reader-fab-chip${c ? " is-busy" : ""}${i ? "" : " is-disabled"}`,
          disabled: !i,
          title: i ? `下载${s.label}` : d,
          onClick: () => void r(a),
          style: { "--fab-i": o },
          children: [
            /* @__PURE__ */ p("span", { className: "reader-fab-chip-icon", "aria-hidden": "true", children: /* @__PURE__ */ p(u, { size: 16, strokeWidth: 2 }) }),
            /* @__PURE__ */ p("span", { className: "reader-fab-chip-label", children: ul[a] }),
            /* @__PURE__ */ p("span", { className: "reader-fab-chip-state", children: c ? "…" : i ? "↓" : "—" })
          ]
        },
        a
      );
    }) }),
    t.every((a) => !lt(e[a])) ? /* @__PURE__ */ p("p", { className: "reader-fab-empty", children: "产物尚未就绪" }) : null
  ] });
}
const hl = {
  favorites: ca,
  markdown: zr,
  ai: pn,
  notes: Lt
}, gl = Qc;
function bl(e) {
  const { activeTool: t, noteCount: n, onToggleTool: r } = e, a = gt(), o = e.sourceOnly ?? (a == null ? void 0 : a.sourceOnly) ?? !1, s = e.download ?? (a == null ? void 0 : a.download), l = N(null), c = fn(), { open: i, setOpen: d, closeMenu: u, toggleMenu: f } = ol(l), { pos: m, openUp: P, onPointerDown: g, onPointerMove: h, onPointerUp: b } = ll({
    onDragStart: u,
    onActivate: f
  }), { urls: S, downloadItems: I, busyActions: y, handleDownload: w } = rl(s), A = x((E) => {
    r(E), d(!1);
  }, [r, d]);
  return /* @__PURE__ */ D(
    "div",
    {
      ref: l,
      className: `reader-fab${i ? " is-open" : ""}${P ? " is-open-up" : ""}`,
      style: { left: m.x, top: m.y },
      "data-reader-fab": "",
      children: [
        i ? /* @__PURE__ */ D(
          "div",
          {
            id: c,
            className: "reader-fab-menu reader-floating-surface",
            role: "menu",
            "aria-label": "阅读工具",
            children: [
              /* @__PURE__ */ p(fl, { onClose: u }),
              (() => {
                const E = t === "notes";
                return /* @__PURE__ */ D(
                  "button",
                  {
                    type: "button",
                    role: "menuitem",
                    className: `reader-fab-row${E ? " is-active" : ""}`,
                    "aria-pressed": E,
                    onClick: () => A("notes"),
                    style: { "--fab-i": 0 },
                    children: [
                      /* @__PURE__ */ p("span", { className: "reader-fab-row-icon", "aria-hidden": "true", children: /* @__PURE__ */ p(Lt, { size: 18, strokeWidth: 2 }) }),
                      /* @__PURE__ */ D("span", { className: "reader-fab-row-copy", children: [
                        /* @__PURE__ */ p("span", { className: "reader-fab-row-title", children: "批注" }),
                        /* @__PURE__ */ p("span", { className: "reader-fab-row-sub", children: E ? "关闭悬浮窗" : "本地批注 · 导出" })
                      ] }),
                      n > 0 ? /* @__PURE__ */ p("span", { className: "reader-fab-row-badge", children: n }) : null
                    ]
                  }
                );
              })(),
              gl.map((E, _) => {
                const k = hl[E.id], R = t === E.id, T = E.needsJob && o;
                let v = R ? E.subOpen : E.subIdle;
                return T && (v = "需打开任务阅读"), /* @__PURE__ */ p(
                  ml,
                  {
                    index: _,
                    icon: k,
                    title: E.label,
                    sub: v,
                    active: R,
                    disabled: T,
                    onClick: () => A(E.id)
                  },
                  E.id
                );
              }),
              /* @__PURE__ */ p(
                pl,
                {
                  urls: S,
                  items: I,
                  busyActions: y,
                  onDownload: w
                }
              )
            ]
          }
        ) : null,
        /* @__PURE__ */ p(
          "button",
          {
            type: "button",
            className: `reader-fab-trigger${i ? " is-open" : ""}${t ? " has-active-tool" : ""}`,
            "aria-label": i ? "收起工具菜单" : "打开工具菜单",
            "aria-expanded": i,
            "aria-controls": i ? c : void 0,
            "aria-haspopup": "menu",
            onPointerDown: g,
            onPointerMove: h,
            onPointerUp: b,
            onPointerCancel: b,
            children: /* @__PURE__ */ p("span", { className: "reader-fab-icon", "aria-hidden": "true", children: i ? /* @__PURE__ */ p(tt, { size: 20, strokeWidth: 2.5 }) : /* @__PURE__ */ D("span", { className: "reader-fab-dots", children: [
              /* @__PURE__ */ p("i", {}),
              /* @__PURE__ */ p("i", {}),
              /* @__PURE__ */ p("i", {})
            ] }) })
          }
        )
      ]
    }
  );
}
function yl(e) {
  const t = gt(), n = Ji(), { mode: r = "compare", modeControls: a } = e, o = e.userZoom ?? (t == null ? void 0 : t.userZoom) ?? ht, s = e.onZoomChange ?? (t == null ? void 0 : t.onZoomChange) ?? (() => {
  }), l = e.currentPage ?? (n == null ? void 0 : n.currentPage) ?? 1, c = e.numPages ?? (n == null ? void 0 : n.numPages) ?? 0, i = e.onGoToPage ?? (t == null ? void 0 : t.goToPage), d = hs(o), u = o > Wr + 1e-3, f = o < Hr - 1e-3, m = Ke(), P = "50%（半屏，对照铺满）", [g, h] = L(!1), [b, S] = L(`${l}`);
  $(() => {
    g || S(`${Math.min(Math.max(l, 1), Math.max(c, 1))}`);
  }, [l, c, g]);
  const I = () => {
    if (h(!1), !i || c <= 0)
      return;
    const y = Number(`${b}`.trim());
    i(Nt(y, c));
  };
  return /* @__PURE__ */ D("div", { className: "reader-react-hud", "data-reader-hud": "true", children: [
    a ? /* @__PURE__ */ p("div", { className: "reader-react-hud-group reader-react-hud-modes", children: a }) : null,
    /* @__PURE__ */ p("div", { className: "reader-react-hud-group", "aria-label": "页码", children: g ? /* @__PURE__ */ D(
      "form",
      {
        className: "reader-react-hud-page-form",
        onSubmit: (y) => {
          y.preventDefault(), I();
        },
        children: [
          /* @__PURE__ */ p(
            "input",
            {
              className: "reader-react-hud-page-input",
              type: "text",
              inputMode: "numeric",
              pattern: "[0-9]*",
              "aria-label": "跳转到页码",
              value: b,
              autoFocus: !0,
              onChange: (y) => S(y.target.value.replace(/[^\d]/g, "")),
              onBlur: I,
              onKeyDown: (y) => {
                y.key === "Escape" && (y.preventDefault(), h(!1), S(`${l}`));
              }
            }
          ),
          /* @__PURE__ */ D("span", { className: "reader-react-hud-page-suffix", children: [
            "/ ",
            c || "—"
          ] })
        ]
      }
    ) : /* @__PURE__ */ p(
      "button",
      {
        type: "button",
        className: "reader-react-hud-page reader-react-hud-page-btn",
        "aria-label": c > 0 ? `跳转页码，当前第 ${l} 页，共 ${c} 页` : "页码",
        title: c > 0 ? "点击输入页码跳转" : void 0,
        disabled: !i || c <= 0,
        onClick: () => {
          !i || c <= 0 || (S(`${l}`), h(!0));
        },
        children: c > 0 ? `${Math.min(l, c)} / ${c}` : "—"
      }
    ) }),
    /* @__PURE__ */ D("div", { className: "reader-react-hud-group", "aria-label": "缩放", children: [
      /* @__PURE__ */ p(
        "button",
        {
          type: "button",
          className: "reader-react-hud-btn",
          "aria-label": "缩小",
          disabled: !u,
          onClick: () => s(Ge(o, -1)),
          children: "−"
        }
      ),
      /* @__PURE__ */ D(
        "button",
        {
          type: "button",
          className: "reader-react-hud-btn reader-react-hud-zoom-label",
          "aria-label": `重置为${P}`,
          title: P,
          onClick: () => s(m),
          children: [
            d,
            "%"
          ]
        }
      ),
      /* @__PURE__ */ p(
        "button",
        {
          type: "button",
          className: "reader-react-hud-btn",
          "aria-label": "放大",
          disabled: !f,
          onClick: () => s(Ge(o, 1)),
          children: "+"
        }
      )
    ] }),
    /* @__PURE__ */ p("div", { className: "reader-react-hud-group reader-react-hud-help", "aria-label": "帮助", children: /* @__PURE__ */ p(Xc, {}) })
  ] });
}
function On(e) {
  const t = `${e.jobId || ""}`.trim(), n = `${e.documentId || ""}`.trim();
  return t ? `retainpdf.reader.notes.v1:job:${t}` : n ? `retainpdf.reader.notes.v1:doc:${n}` : "retainpdf.reader.notes.v1:anonymous";
}
function vl() {
  return typeof crypto < "u" && typeof crypto.randomUUID == "function" ? crypto.randomUUID() : `note-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
function wl(e) {
  return {
    pageIdx: Number(e.page) - 1,
    quoteText: e.quote,
    note: e.note,
    createdAt: e.createdAt
  };
}
function Rt(e) {
  return Ko(e, (t) => t.page);
}
function Sl(e) {
  return Yo(e, (t) => t.page).map((t) => ({ page: t.pageIdx, items: t.items }));
}
function Pl(e, t) {
  return Go({
    title: e,
    annotations: t.map(wl)
  });
}
function Il(e) {
  if (!e)
    return [];
  try {
    const t = JSON.parse(e);
    return Array.isArray(t) ? t.map((n) => ({
      id: `${(n == null ? void 0 : n.id) || ""}`.trim(),
      page: Math.max(1, Math.floor(Number(n == null ? void 0 : n.page) || 1)),
      pane: (n == null ? void 0 : n.pane) === "translated" ? "translated" : "source",
      quote: `${(n == null ? void 0 : n.quote) || ""}`.trim(),
      note: `${(n == null ? void 0 : n.note) || ""}`.trim(),
      createdAt: `${(n == null ? void 0 : n.createdAt) || ""}`.trim() || (/* @__PURE__ */ new Date()).toISOString()
    })).filter((n) => n.id && n.quote) : [];
  } catch {
    return [];
  }
}
function Tr(e) {
  if (typeof localStorage > "u")
    return [];
  try {
    return Il(localStorage.getItem(On(e)));
  } catch {
    return [];
  }
}
function Rl(e, t) {
  if (!(typeof localStorage > "u"))
    try {
      localStorage.setItem(On(e), JSON.stringify(t));
    } catch (n) {
      console.warn("[reader-notes] persist failed", n);
    }
}
function Tl(e, t = {}) {
  var k;
  const n = q(() => ({
    jobId: `${e.jobId || ""}`.trim(),
    documentId: `${e.documentId || ""}`.trim()
  }), [e.jobId, e.documentId]), r = ((k = se()) == null ? void 0 : k.annotationDataPort) ?? null, a = (r == null ? void 0 : r.resolveScope(n)) ?? null, o = r ? `server:${(a == null ? void 0 : a.key) || "unresolved"}:${n.documentId}:${n.jobId}` : On(n), [s, l] = L(() => ({
    key: o,
    notes: r ? [] : Tr(n),
    loading: !!(r && a),
    saving: !1,
    error: null
  })), [c, i] = L(0), d = N(o);
  d.current = o;
  const u = N(s);
  u.current = s;
  const f = N(0), m = N(!1), P = N(Promise.resolve()), g = N(0), h = t.onAfterAdd, b = x((R) => {
    const T = { ...u.current, ...R };
    u.current = T, l(T);
  }, []);
  $(() => {
    m.current = !0;
    const R = ++f.current, T = new AbortController();
    return g.current = 0, P.current = Promise.resolve(), b({ key: o, notes: r ? [] : Tr(n), loading: !!(r && a), saving: !1, error: null }), r && a && r.load(a, { signal: T.signal }).then((v) => {
      m.current && R === f.current && d.current === o && b({ notes: Rt(v), loading: !1 });
    }).catch((v) => {
      !T.signal.aborted && m.current && R === f.current && d.current === o && b({ loading: !1, error: `批注读取失败：${v instanceof Error ? v.message : "请重试"}` });
    }), () => {
      m.current = !1, T.abort();
    };
  }, [o, r, c, b]), $(() => {
    !r && s.key === o && Rl(n, s.notes);
  }, [r, s.notes, s.key, o, n]);
  const S = x(async (R, T) => {
    const v = f.current, M = () => m.current && v === f.current && d.current === o;
    if (!a || u.current.key !== o || u.current.loading || u.current.error)
      return b({ error: u.current.error || "批注尚未载入，请稍后重试。" }), h == null || h(), null;
    g.current++, b({ saving: !0, error: null });
    const C = P.current;
    let z;
    P.current = new Promise((O) => {
      z = O;
    });
    try {
      if (await C, !M()) return null;
      const O = await R();
      return M() ? (T(O), O) : null;
    } catch (O) {
      return M() && b({ error: `批注保存失败：${O instanceof Error ? O.message : "请重试，原批注未被改动"}` }), null;
    } finally {
      z(), M() && (g.current--, b({ saving: g.current > 0 }));
    }
  }, [o, a == null ? void 0 : a.key, h, b]), I = x((R) => {
    const T = `${R.quote || ""}`.trim();
    if (!T) return null;
    const v = {
      id: vl(),
      page: Math.max(1, Math.floor(Number(R.page) || 1)),
      pane: R.pane === "translated" ? "translated" : "source",
      quote: T,
      note: `${R.note || ""}`.trim(),
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    return r ? (h == null || h(), !Number.isInteger(R.page) || R.page < 1 ? (b({ error: "原文页码无效，批注未保存。" }), null) : S(() => r.create(a, v), (M) => {
      b({ notes: Rt([M, ...u.current.notes.filter((C) => C.id !== M.id)]) });
    })) : (b({ notes: Rt([v, ...u.current.notes]) }), h == null || h(), v);
  }, [r, a == null ? void 0 : a.key, S, h, b]), y = x((R, T) => {
    const v = `${T || ""}`.trim();
    if (!r) {
      b({ notes: u.current.notes.map((M) => M.id === R ? { ...M, note: v } : M) });
      return;
    }
    return S(async () => {
      const M = u.current.notes.find((C) => C.id === R);
      if (!M) throw new Error("批注已不存在，请重新载入。");
      return r.update(a, { ...M, note: v });
    }, (M) => b({ notes: Rt(u.current.notes.map((C) => C.id === R ? M : C)) })).then(Boolean);
  }, [r, a == null ? void 0 : a.key, S, b]), w = x((R) => {
    if (!r) {
      b({ notes: u.current.notes.filter((T) => T.id !== R) });
      return;
    }
    return S(async () => {
      if (!u.current.notes.some((T) => T.id === R)) throw new Error("批注已不存在，请重新载入。");
      return await r.remove(a, R), !0;
    }, () => b({ notes: u.current.notes.filter((T) => T.id !== R) })).then(Boolean);
  }, [r, a == null ? void 0 : a.key, S, b]), A = s.key === o ? s : { ...s, notes: [], error: null, loading: !!(r && a) }, E = A.notes, _ = x(async (R = "") => {
    var T, v;
    try {
      return await ((v = (T = navigator.clipboard) == null ? void 0 : T.writeText) == null ? void 0 : v.call(T, Pl(R, E))), !0;
    } catch {
      return !1;
    }
  }, [E]);
  return {
    notes: E,
    groups: q(() => Sl(E), [E]),
    addFromQuote: I,
    updateNote: y,
    remove: w,
    exportMarkdown: _,
    count: E.length,
    loading: A.loading,
    saving: A.saving,
    error: A.error,
    storageMode: r ? "server" : "local",
    reload: () => i((R) => R + 1)
  };
}
const sn = "download-toast";
function El({
  title: e = "下载中",
  status: t = "正在准备...",
  meta: n = "等待响应...",
  percent: r = NaN,
  tone: a = "progress"
}) {
  const o = Number.isFinite(r) ? Math.max(4, Math.min(100, Number(r) || 0)) : 18;
  return /* @__PURE__ */ D("div", { className: "download-toast-card reader-floating-surface", "data-tone": a, "aria-live": "polite", children: [
    /* @__PURE__ */ D("div", { className: "download-toast-head", children: [
      /* @__PURE__ */ p("div", { id: "download-toast-title", className: "download-toast-title", children: e }),
      /* @__PURE__ */ p("div", { id: "download-toast-status", className: "download-toast-status", children: t })
    ] }),
    /* @__PURE__ */ p("div", { className: "download-toast-track", children: /* @__PURE__ */ p("span", { id: "download-toast-bar", className: "download-toast-bar", style: { width: `${o}%` } }) }),
    /* @__PURE__ */ p("div", { id: "download-toast-meta", className: "download-toast-meta", children: n })
  ] });
}
function Ml(e = {}) {
  const {
    visible: t = !1,
    title: n = "下载中",
    status: r = "正在准备...",
    meta: a = "等待响应...",
    percent: o = NaN,
    tone: s = "progress"
  } = e;
  if (!t) {
    qt.dismiss(sn);
    return;
  }
  qt.custom(
    () => /* @__PURE__ */ p(El, { title: n, status: r, meta: a, percent: o, tone: s }),
    { id: sn, duration: 1 / 0 }
  );
}
function kl() {
  const e = x((t) => {
    t && (t.setState = Ml, t.hide = () => qt.dismiss(sn));
  }, []);
  return /* @__PURE__ */ D(xt, { children: [
    /* @__PURE__ */ p(Zo, { position: "bottom-right" }),
    /* @__PURE__ */ p("download-toast", { style: { display: "none" }, "aria-hidden": "true", ref: e })
  ] });
}
const Nl = mn(() => import("./ReaderFavoritesPanel-dnKLyRKZ.js").then((e) => ({ default: e.ReaderFavoritesPanel }))), Al = mn(() => import("./ReaderMarkdownPanel-5qtTE3s-.js").then((e) => ({ default: e.ReaderMarkdownPanel }))), xl = mn(() => import("./ReaderAiPanel-CxVL8Ul8.js").then((e) => ({ default: e.ReaderAiPanel })));
function Vt(e) {
  const t = N(!1);
  return e && (t.current = !0), t.current;
}
function Cl(e) {
  return "workspace";
}
function Ll(e) {
  const t = e.sourceOnly || !e.translatedUrl, n = !!(e.overlayContentAvailable && e.liveTranslationVisible && !e.assistantOpen), a = e.assistantPdfPane || (e.assistantOpen && e.mode === "compare" ? "source" : e.mode);
  return {
    kind: n ? "live-overlay" : a === "compare" ? "final-compare" : a === "translated" ? "translated-only" : "source-only",
    visibleMode: a,
    compareMode: a === "compare",
    showSource: n || a !== "translated",
    showTranslated: a === "translated" || a === "compare",
    overlayOnSource: n,
    sourceOnly: e.sourceOnly,
    sourceViewOnly: t
  };
}
function zl(e, t) {
  return e === "compare" ? t ? !0 : null : !1;
}
function Er(e, t) {
  var n, r, a, o;
  return e === "compare" ? null : (t == null ? void 0 : t.assistantPanel) === "markdown" || (t == null ? void 0 : t.assistantPanel) === "ai" ? t.assistantPanel : ((n = t == null ? void 0 : t.splitLayout) == null ? void 0 : n.left) === "ai" || ((r = t == null ? void 0 : t.splitLayout) == null ? void 0 : r.right) === "ai" ? "ai" : ((a = t == null ? void 0 : t.splitLayout) == null ? void 0 : a.left) === "markdown" || ((o = t == null ? void 0 : t.splitLayout) == null ? void 0 : o.right) === "markdown" ? "markdown" : null;
}
function Dl() {
  const e = ci(), { boot: t, panes: n, sessionFiles: r, tools: a, session: o } = e, [s, l] = L(() => Er(e.mode, Ee(e.viewStateKey))), [c, i] = L(null), [d, u] = L(null), [f, m] = L(!1), P = N(e.selection);
  P.current = e.selection;
  const g = N(e.viewStateKey), h = N(null), b = s !== null, S = e.liveTranslationAvailable || e.liveTranslation.pagesByPage.size > 0, I = Ll({
    mode: e.mode,
    sourceOnly: e.sourceOnly,
    translatedUrl: r.translatedUrl,
    overlayContentAvailable: S,
    liveTranslationVisible: f,
    assistantOpen: b,
    assistantPdfPane: c
  }), y = I.sourceViewOnly, w = I.visibleMode, [A, E] = L(!1), _ = x(() => E(!0), []), k = x(() => E((j) => !j), []), R = Tl(
    { jobId: o.jobId, documentId: o.documentId },
    { onAfterAdd: _ }
  ), T = x((j) => {
    const W = P.current;
    Promise.resolve(R.addFromQuote(j)).then((V) => {
      V && P.current === W && e.clearSelection();
    });
  }, [R.addFromQuote, e.clearSelection]), v = x((j) => {
    e.goToPage(j.page, j.pane === "translated" ? "translated" : "source");
  }, [e.goToPage]), M = x(
    () => R.exportMarkdown(o.title || ""),
    [R.exportMarkdown, o.title]
  );
  $(() => {
    u(null), m(!0), E(!1);
  }, [e.viewStateKey]), $(() => {
    e.session.jobTerminal && m(!1);
  }, [e.session.jobTerminal]), $(() => {
    if (!t.loading) {
      if (g.current !== e.viewStateKey) {
        g.current = e.viewStateKey;
        const j = Ee(e.viewStateKey);
        l(Er(e.mode, j)), i(null);
        return;
      }
      kt(e.viewStateKey, { assistantPanel: s, splitLayout: null });
    }
  }, [s, t.loading, e.mode, e.viewStateKey]), $(() => {
    if (!(t.loading || t.failed)) {
      if (h.current !== e.viewStateKey) {
        h.current = e.viewStateKey;
        const j = Ee(e.viewStateKey), W = y ? "source" : j == null ? void 0 : j.mode;
        W && W !== e.mode && e.setModeKeepingPage(W);
        return;
      }
      kt(e.viewStateKey, { mode: e.mode });
    }
  }, [t.failed, t.loading, e.mode, e.setModeKeepingPage, e.viewStateKey, y]);
  const C = s || (e.mode === "compare" ? "compare" : "reading"), z = Vt(a.isOpen("favorites")), O = Vt(s === "markdown"), B = Vt(s === "ai");
  mi({
    mode: w,
    sourceOnly: e.sourceOnly,
    setMode: e.setModeKeepingPage,
    userZoom: e.userZoom,
    onZoomChange: e.onZoomChange,
    currentPage: e.currentPage,
    numPages: n.hudNumPages,
    goToPage: e.goToPage,
    enabled: e.showHud
  });
  const ee = x(() => {
    a.close();
  }, [a]), X = x(() => {
    l(null), i(null), u(null);
  }, []), oe = x((j) => {
    const W = w === "translated" ? "translated" : "source";
    e.jumpToAnchor(j, W);
  }, [e.jumpToAnchor, w]), re = x((j) => {
    o.refreshCommittedDocument(j);
  }, [o.refreshCommittedDocument]), ie = x((j) => {
    a.close(), i(null);
    const W = zl(j, e.liveTranslationAvailable);
    W !== null && m(W), e.setModeKeepingPage(j);
  }, [e.liveTranslationAvailable, e.setModeKeepingPage, a]), U = q(() => !S || !I.showSource ? null : /* @__PURE__ */ p(
    "button",
    {
      type: "button",
      className: `reader-live-translation-toggle${f ? " is-active" : ""}`,
      onClick: () => m((j) => !j),
      "aria-pressed": f,
      title: f ? "隐藏实时译文" : "在原文 PDF 上叠加实时译文",
      children: "译文"
    }
  ), [S, I.showSource, f]), K = x((j) => {
    l(j), j !== "ai" && u(null);
  }, []), Z = x((j) => {
    if (j === "notes") {
      k();
      return;
    }
    if (j === "markdown" || j === "ai") {
      s === j ? (l(null), i(null), u(null)) : (l(j), i(null), j !== "ai" && u(null));
      return;
    }
    a.toggle(j);
  }, [s, k, a]), Q = A ? "notes" : s ?? a.active, le = x((j) => {
    const W = j.pane === "translated" && !y ? "translated" : "source";
    u(j), l("ai"), i(W), e.clearSelection();
  }, [e.clearSelection, y]), pe = q(() => ({
    bindShell: e.shell.bindShell,
    shellEl: e.shell.shellEl,
    shellWidth: e.shell.shellWidth,
    userZoom: e.userZoom,
    onZoomChange: e.onZoomChange,
    rowHeights: e.rowHeights,
    mountSource: e.panes.mountSource,
    mountTranslated: e.panes.mountTranslated,
    onMetrics: e.panes.onMetrics,
    onNumPagesChange: e.panes.onNumPages,
    sourceUrl: e.sessionFiles.sourceUrl,
    translatedUrl: e.sessionFiles.translatedUrl,
    sourceFile: e.sessionFiles.sourceFile,
    translatedFile: e.sessionFiles.translatedFile,
    regions: o.regions,
    readerMetadata: o.readerMetadata,
    activeRegion: e.activeRegion,
    onSelectRegion: e.selectRegion,
    sourceOnly: e.sourceOnly,
    sourceViewOnly: y,
    download: e.download,
    goToPage: e.goToPage,
    assistant: { select: K, close: X }
  }), [
    e.shell,
    e.userZoom,
    e.onZoomChange,
    e.rowHeights,
    e.panes,
    e.sessionFiles,
    o.regions,
    o.readerMetadata,
    e.activeRegion,
    e.selectRegion,
    e.sourceOnly,
    y,
    e.download,
    e.goToPage,
    K,
    X
  ]), me = q(() => ({
    currentPage: e.currentPage,
    numPages: n.hudNumPages
  }), [e.currentPage, n.hudNumPages]), he = [
    is,
    `is-workspace-${C}`,
    b ? "is-assistant-open" : "",
    I.overlayOnSource ? "is-live-translation-overlay" : ""
  ].filter(Boolean).join(" ");
  return /* @__PURE__ */ p(Hi, { value: pe, hud: me, children: /* @__PURE__ */ D("div", { className: he, "data-reader-engine": "react-pdf", "data-reader-workspace": C, children: [
    /* @__PURE__ */ p(Kc, { loading: t.loading, failed: t.failed, text: t.text, percent: t.percent, regionsError: !!o.readerErrors.regions, metadataError: !!o.readerErrors.metadata }),
    /* @__PURE__ */ p(yi, { onBeforeClose: o.prepareClose }),
    /* @__PURE__ */ p(
      Qi,
      {
        mode: w,
        documentReady: !!o.jobId,
        sourceViewOnly: y,
        onModeChange: ie,
        liveTranslation: S ? {
          visible: f,
          state: e.liveTranslation,
          onToggle: () => m((j) => !j)
        } : null
      }
    ),
    /* @__PURE__ */ p(ec, { active: s }),
    b ? /* @__PURE__ */ p(jc, {}) : null,
    e.showHud ? /* @__PURE__ */ p(bl, { activeTool: Q, noteCount: R.count, onToggleTool: Z }) : null,
    /* @__PURE__ */ p(Gi, { paneComposition: I, markdownSplit: s === "markdown", assistantSplit: b, liveTranslation: e.liveTranslation, sourcePaneAction: U }),
    e.showHud ? /* @__PURE__ */ p(
      yl,
      {
        mode: w,
        modeControls: null
      }
    ) : null,
    /* @__PURE__ */ D(Eo, { fallback: null, children: [
      z ? /* @__PURE__ */ p(Nl, { open: a.isOpen("favorites"), jobId: o.jobId, documentId: o.documentId, onClose: ee, onJumpPage: e.goToPage }) : null,
      O ? /* @__PURE__ */ p(Al, { open: s === "markdown", jobId: o.jobId, sourceOnly: e.sourceOnly, layout: "workspace", side: "right", onClose: X }) : null,
      B ? /* @__PURE__ */ p(xl, { open: s === "ai", jobId: o.jobId, documentId: o.documentId, sessionIdentity: o.sessionIdentity, layout: Cl(e.mode), side: "right", selectionContext: d, onClearSelectionContext: () => u(null), onClose: X, onJumpCitation: oe, onDocumentCommitted: re }, o.documentId || o.jobId || "reader-ai-pending") : null
    ] }),
    /* @__PURE__ */ p(
      Vc,
      {
        open: A,
        groups: R.groups,
        count: R.count,
        loading: R.loading,
        saving: R.saving,
        error: R.error,
        storageMode: R.storageMode,
        onRetry: R.reload,
        onClose: () => E(!1),
        onJump: v,
        onUpdateNote: R.updateNote,
        onRemove: R.remove,
        onExport: M
      }
    ),
    /* @__PURE__ */ p(Yc, { selection: e.selection, onDismiss: e.clearSelection, onAskAi: le, onAddNote: T }),
    /* @__PURE__ */ p(kl, {})
  ] }) });
}
function cd() {
  return /* @__PURE__ */ p(Dl, {});
}
export {
  yn as A,
  cd as R,
  Dl as a,
  Hc as b,
  id as c,
  Zl as d,
  ed as e,
  sd as f,
  Ql as g,
  nd as h,
  td as i,
  rd as j,
  ad as k,
  od as r,
  Xl as u
};
//# sourceMappingURL=ReaderApp-Cuw4yhFt.js.map
