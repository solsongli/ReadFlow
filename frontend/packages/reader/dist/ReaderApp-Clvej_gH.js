var zn = (e) => {
  throw TypeError(e);
};
var Dn = (e, t, n) => t.has(e) || zn("Cannot " + n);
var Qe = (e, t, n) => (Dn(e, t, "read from private field"), n ? n.call(e) : t.get(e)), _n = (e, t, n) => t.has(e) ? zn("Cannot add the same private member more than once") : t instanceof WeakSet ? t.add(e) : t.set(e, n), Fn = (e, t, n, r) => (Dn(e, t, "write to private field"), r ? r.call(e, n) : t.set(e, n), n);
import { jsxs as D, jsx as h, Fragment as At } from "react/jsx-runtime";
import { useMemo as q, useState as L, useEffect as $, useCallback as x, useRef as A, useLayoutEffect as Oe, memo as an, forwardRef as ho, useImperativeHandle as sn, createContext as cn, useContext as ln, useSyncExternalStore as po, useId as dn, Suspense as go, lazy as un } from "react";
import { requireAdapter as ye, getReaderAdapters as se } from "./adapters.js";
import { resolveReaderDownloadName as bo, createReaderServerFavoritesPort as yo, resolveReaderDownloadUrls as vo, READER_PROGRESS_COPY as Re, trimString as it, READER_DOWNLOAD_ACTIONS as wo, disabledReason as So } from "./runtime/state.js";
import { d as Po } from "./ask-answerer-GNQdzitl.js";
import "@retainpdf/api/conversations";
import { r as Io, b as Ro } from "./page-config-Ct7qR5rm.js";
import { c as To, n as Eo, f as _t, h as On, a as Mo, b as ko, i as Ir, p as xt, g as Rr, r as Tr, j as $n, e as No } from "./reader-regions-DsePY7B_.js";
import { i as Ao, c as xo } from "./live-translation-CbniFg2b.js";
import { sortByPageAndCreatedAt as Co, buildAnnotationsMarkdown as Lo, groupByPageAndCreatedAt as zo } from "./runtime/content.js";
import { toast as Vt, Toaster as Do } from "sonner";
import { X as Xe, Radio as _o, FileText as Er, Columns2 as Mr, Languages as kr, FileCode2 as Nr, Sparkles as fn, GripHorizontal as Fo, StickyNote as Ct, Sigma as Oo, Table2 as $o, Type as jo, Image as Uo, Check as Bo, Copy as Ho, Keyboard as Wo, Download as Jo, Bookmark as Vo } from "lucide-react";
import { pdfjs as qo, Page as Ko, Document as Go } from "react-pdf";
import { e as Yo, m as Zo, a as Xo } from "./markdown-math-XkF5urpn.js";
const Qo = (...e) => {
  var t, n;
  return ((n = (t = se()) == null ? void 0 : t.isMockMode) == null ? void 0 : n.call(t, ...e)) ?? !1;
}, ea = "", ta = Object.freeze({
  progress: "retainpdf-reader-progress"
}), na = (e) => {
  var t, n;
  return ((n = (t = se()) == null ? void 0 : t.resolveResourceUrl) == null ? void 0 : n.call(t, e)) ?? e;
}, Al = (...e) => {
  var n;
  return (((n = se()) == null ? void 0 : n.fetchProtected) ?? fetch)(...e);
}, Ne = () => ye("defaultReaderDataPort"), jn = () => ye("defaultReaderPageConfigPort"), xl = {
  get apiPrefix() {
    return Ne().apiPrefix;
  },
  fetchProtected: (...e) => Ne().fetchProtected(...e),
  loadMarkdownPayload: (e) => Ne().loadMarkdownPayload(e),
  loadMarkdownSource: (e) => Ne().loadMarkdownSource(e),
  loadMarkdownRange: (e, t, n, r, o) => Ne().loadMarkdownRange(e, t, n, r, o),
  loadJobPayload: (e) => Ne().loadJobPayload(e),
  loadReaderPayload: (e, t) => Ne().loadReaderPayload(e, t),
  get liveTranslation() {
    return Ne().liveTranslation;
  }
}, Ar = {
  messageTargetOrigin: () => jn().messageTargetOrigin(),
  readerJobId: () => jn().readerJobId()
}, ra = () => {
  var e;
  return ((e = se()) == null ? void 0 : e.liveTranslation) ?? null;
}, ct = () => {
  var t;
  const e = se();
  return (e == null ? void 0 : e.pdf) ?? {
    fetchProtected: (e == null ? void 0 : e.fetchProtected) ?? ((t = e == null ? void 0 : e.defaultReaderDataPort) == null ? void 0 : t.fetchProtected) ?? fetch,
    resolvePdfjsVendorUrl: (n = "") => {
      var r;
      return ((r = e == null ? void 0 : e.resolvePdfjsVendorUrl) == null ? void 0 : r.call(e, n)) ?? "";
    }
  };
}, mn = () => {
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
      var o;
      return ((o = e.resolveReaderTranslatedPdfUrl) == null ? void 0 : o.call(e, n, r)) ?? "";
    },
    resolveReaderArtifactUrl: (n) => {
      var r;
      return ((r = e.resolveReaderArtifactUrl) == null ? void 0 : r.call(e, n)) ?? "";
    }
  };
}, Cl = () => {
  var e;
  return ((e = se()) == null ? void 0 : e.aiOperations) ?? null;
}, Ll = () => {
  var e;
  return ((e = se()) == null ? void 0 : e.conversations) ?? null;
}, zl = () => {
  var e;
  return ((e = se()) == null ? void 0 : e.askChat) ?? null;
}, oa = (...e) => {
  var t, n;
  return ((n = (t = se()) == null ? void 0 : t.resolveReaderAnchor) == null ? void 0 : n.call(t, ...e)) ?? null;
}, aa = () => {
  var e, t;
  return ((t = (e = se()) == null ? void 0 : e.resolveReaderDocumentId) == null ? void 0 : t.call(e)) ?? "";
}, sa = (...e) => {
  var t, n;
  return ((n = (t = se()) == null ? void 0 : t.resolveReaderJobId) == null ? void 0 : n.call(t, ...e)) ?? "";
}, ia = (...e) => {
  var t, n;
  return ((n = (t = se()) == null ? void 0 : t.resolveReaderDownloadName) == null ? void 0 : n.call(t, ...e)) ?? bo(...e);
}, ca = (...e) => {
  var t, n;
  return ((n = (t = se()) == null ? void 0 : t.resolveReaderDownloadUrls) == null ? void 0 : n.call(t, ...e)) ?? vo(...e);
}, la = (...e) => ye("downloadProtectedResource")(...e), da = (...e) => ye("failDownloadToast")(...e), Dl = (e, t) => ye("resolveMarkdownAssetUrl")(e, t), _l = (e = {}) => {
  const t = se();
  return Po({
    apiPrefix: (t == null ? void 0 : t.apiPrefix) || "/api/v1",
    ask: t == null ? void 0 : t.askDocumentAi,
    documentByJobId: t == null ? void 0 : t.fetchDocumentByJobId,
    ...e
  });
}, hn = "/api/v1", Fl = (e = hn, t = {}) => {
  var n;
  return ye("fetchFavorites")(
    ((n = se()) == null ? void 0 : n.apiPrefix) ?? e,
    t
  );
};
function Ol(e = {}) {
  const t = se();
  return yo({
    apiPrefix: (t == null ? void 0 : t.apiPrefix) ?? hn,
    documentByJobId: (...n) => ye("fetchDocumentByJobId")(...n),
    submitFavorite: (...n) => ye("createFavorite")(...n),
    loadFavorites: (...n) => ye("fetchFavorites")(...n),
    removeFavorite: (...n) => ye("deleteFavorite")(...n),
    ...e
  });
}
function ua() {
  const e = () => {
    var r;
    return Io(
      ((r = globalThis.location) == null ? void 0 : r.search) || ""
    );
  }, [t, n] = L(e);
  return $(() => {
    var l, c, i, d;
    const r = () => n(e()), o = (c = (l = globalThis.history) == null ? void 0 : l.pushState) == null ? void 0 : c.bind(globalThis.history), a = (d = (i = globalThis.history) == null ? void 0 : i.replaceState) == null ? void 0 : d.bind(globalThis.history);
    let s = !1;
    if (o && a)
      try {
        const u = (f) => function(...m) {
          const P = f.apply(this, m);
          return r(), globalThis.dispatchEvent(new Event("pushstate")), globalThis.dispatchEvent(new Event("replacestate")), globalThis.dispatchEvent(new Event("locationchange")), P;
        };
        globalThis.history.pushState = u(o), globalThis.history.replaceState = u(a), s = !0;
      } catch {
      }
    return window.addEventListener("popstate", r), window.addEventListener("hashchange", r), window.addEventListener("pushstate", r), window.addEventListener("replacestate", r), window.addEventListener("locationchange", r), () => {
      if (window.removeEventListener("popstate", r), window.removeEventListener("hashchange", r), window.removeEventListener("pushstate", r), window.removeEventListener("replacestate", r), window.removeEventListener("locationchange", r), s && o && a)
        try {
          globalThis.history.pushState = o, globalThis.history.replaceState = a;
        } catch {
        }
    };
  }, []), t;
}
function fa() {
  const e = ua(), t = q(() => sa(Ar), [e]), n = q(() => aa(), [e]), r = t || n ? `job:${t}|document:${n}` : `location:${e}`;
  return { locationKey: e, jobId: t, routeDocumentId: n, sessionIdentity: r };
}
function ma(e) {
  const {
    routeDocumentId: t,
    jobId: n,
    sessionIdentity: r,
    sessionIdentityRef: o,
    documentIdRef: a,
    sessionJobIdRef: s,
    switchToSourceMode: l
  } = e, [c, i] = L({
    documentId: "",
    jobId: ""
  }), [d, u] = L({
    documentId: "",
    jobId: ""
  }), f = c.documentId === t ? c.jobId : "", m = d.documentId === t ? d.jobId : "", P = n || f, [g, p] = L({
    jobId: "",
    documentId: ""
  }), b = g.jobId === P ? g.documentId : "", S = t || b, I = !!t && !P, [y, w] = L(null), N = (y == null ? void 0 : y.sessionIdentity) === r && y.documentId === S ? y : null, E = I || !!N, _ = x((R) => {
    const T = `${R.documentId || ""}`.trim();
    if (!T || a.current && a.current !== T) return;
    if (!a.current && s.current)
      p({
        jobId: s.current,
        documentId: T
      });
    else if (!a.current)
      return;
    const v = `${R.revision || ""}`.trim() || `${Date.now()}`;
    w({
      documentId: T,
      revision: v,
      sessionIdentity: o.current
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
        p((T) => T.jobId === R.jobId && T.documentId === R.documentId ? T : { jobId: R.jobId, documentId: R.documentId });
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
    setResolvedJobDocument: p,
    jobDocumentId: b,
    documentId: S,
    sourceOnly: I,
    committedDocumentSource: y,
    setCommittedDocumentSource: w,
    activeCommittedDocumentSource: N,
    sourceViewOnly: E,
    refreshCommittedDocument: _,
    applyIdentityEvent: k
  };
}
const ha = /* @__PURE__ */ new Set(["succeeded", "failed", "cancelled", "canceled"]);
function Un(e) {
  return `${(e == null ? void 0 : e.status) || ""}`.trim().toLowerCase();
}
function pa(e) {
  var r, o, a, s;
  if (!e || typeof e != "object") return "";
  const t = e, n = [
    t.document_id,
    t.documentId,
    (r = t.document) == null ? void 0 : r.document_id,
    (o = t.book_summary) == null ? void 0 : o.document_id,
    (s = (a = t.request_payload) == null ? void 0 : a.source) == null ? void 0 : s.document_id
  ];
  for (const l of n) {
    const c = `${l || ""}`.trim();
    if (c) return c;
  }
  return "";
}
function Bn(e, t) {
  const n = `/api/v1/documents/${encodeURIComponent(e)}/source.pdf`, r = `${t || ""}`.trim();
  return na(r ? `${n}?version=${encodeURIComponent(r)}` : n);
}
function ga(e, t = "") {
  const n = `${e || ""}`.trim(), r = `${t || ""}`.trim();
  return !!(!n || r && (n === r || n === `${r}.pdf`) || /^\d{8,14}-[0-9a-f]{4,}$/i.test(n));
}
function ba(e, t) {
  var r;
  const n = [
    e == null ? void 0 : e.title,
    e == null ? void 0 : e.display_name,
    e == null ? void 0 : e.source_file_name,
    (r = e == null ? void 0 : e.book_summary) == null ? void 0 : r.source_file_name
  ];
  for (const o of n) {
    const a = `${o || ""}`.trim();
    if (a && !ga(a, t))
      return a.replace(/\.pdf$/i, "");
  }
  return "";
}
function qt({
  percent: e,
  text: t,
  stage: n
}) {
  var r;
  try {
    (r = window.parent) == null || r.postMessage(
      {
        type: ta.progress,
        stage: n,
        percent: e,
        text: t
      },
      Ar.messageTargetOrigin()
    );
  } catch {
  }
}
function Tt(e, t, n, r = "progress") {
  e({
    loading: !0,
    percent: t,
    text: n,
    stage: r,
    failed: !1
  }), qt({ percent: t, text: n, stage: r });
}
function ya(e) {
  const {
    sessionJobId: t,
    sessionIdentity: n,
    sessionIdentityRef: r,
    sessionJobIdRef: o,
    sessionEpochRef: a,
    closingRef: s
  } = e, [l, c] = L(null), [i, d] = L(null), [u, f] = L(""), [m, P] = L(0), g = u === n ? l : null, p = u === n ? i : null, b = Un(g), S = ha.has(b), I = x(() => {
    P((k) => k + 1);
  }, []), y = x((k) => {
    c(k.jobPayload), d(k.manifestPayload), f(k.sessionIdentity);
  }, []), w = x((k) => {
    c(null), d(null), f(k);
  }, []), N = A(""), E = A(""), _ = x(async () => {
    const k = o.current;
    if (!k || N.current === k) return;
    const R = mn().loadJobPayload;
    if (typeof R != "function") return;
    const T = a.current.value;
    N.current = k;
    try {
      const v = await R(k);
      if (s.current || a.current.value !== T || o.current !== k || !v || typeof v != "object")
        return;
      const M = Un(v);
      c(v), f(r.current), M === "succeeded" && E.current !== k && (E.current = k, P((C) => C + 1));
    } catch {
    } finally {
      N.current === k && (N.current = "");
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
    scopedManifestPayload: p,
    jobStatus: b,
    jobTerminal: S,
    jobRefreshRevision: m,
    refreshJobArtifacts: I,
    refreshJobStatus: _,
    publishPayload: y,
    clearPayload: w
  };
}
function Kt(e) {
  document.body.classList.remove(
    "reader-mode-source",
    "reader-mode-translated",
    "reader-mode-compare"
  ), document.body.classList.add(`reader-mode-${e}`);
}
function va(e, t) {
  e(t), Kt(t);
}
function wa(e) {
  const [t, n] = L(e ? "source" : "compare"), r = x((a) => {
    e && a !== "source" || (n(a), Kt(a));
  }, [e]), o = x((a) => {
    va(n, a);
  }, []);
  return $(() => (e && document.documentElement.classList.add("reader-source-only"), Kt(t), () => {
    document.documentElement.classList.remove("reader-source-only");
  }), [e, t]), { mode: t, setMode: r, setModeState: n, switchSessionMode: o };
}
function Hn(e) {
  return typeof e == "string" ? e.trim() : `${e ?? ""}`.trim();
}
function Sa(e) {
  const t = (e == null ? void 0 : e.data) ?? e, n = t && typeof t == "object" ? t : {};
  return {
    activeJobId: Hn(n.active_job_id),
    activeVersionId: Hn(n.active_version_id)
  };
}
function Pa(e) {
  const { link: t, rejectedDocumentJobId: n, hasCommittedSource: r } = e, o = t.activeJobId && t.activeJobId !== n && !t.activeJobId.startsWith("doc:") ? t.activeJobId : "";
  return o ? { kind: "follow-active-job", jobId: o, activeVersionId: t.activeVersionId } : t.activeVersionId && !r ? { kind: "open-committed-source", documentId: "", revision: t.activeVersionId } : { kind: "open-source-url" };
}
function Ia(e) {
  const {
    payloadDocumentId: t,
    linkedActiveJobId: n,
    linkedActiveVersionId: r,
    sessionJobId: o,
    hasCommittedSource: a
  } = e;
  return t && r && n === o && !a ? { kind: "restore-committed-source", documentId: t, revision: r } : { kind: "open-job-artifacts" };
}
function Ra(e) {
  return e.status === 404 && !e.jobId && !!e.routeDocumentId && !!e.documentJobId && e.sessionJobId === e.documentJobId;
}
function Ta(e) {
  return e ? { data: e.data.slice() } : null;
}
const Ea = 2, ve = /* @__PURE__ */ new Map();
function Gt(e, t) {
  ve.delete(e), ve.set(e, t);
}
function Ma(e) {
  if (ve.size < Ea) return;
  const t = ve.keys().next().value;
  t && ve.delete(t);
}
function Ft(e) {
  const t = `${e || ""}`.trim();
  if (!t || !ve.has(t)) return null;
  const n = ve.get(t);
  return Gt(t, n), n;
}
async function xr(e, t = ct().fetchProtected, n = {}) {
  const r = `${e || ""}`.trim();
  if (!r)
    return null;
  if (ve.has(r)) {
    const l = ve.get(r);
    return Gt(r, l), l;
  }
  const o = await t(r, { signal: n.signal });
  if (!o.ok) {
    const l = new Error(`读取 PDF 失败 (${o.status})`);
    throw l.status = o.status, l;
  }
  const a = await o.arrayBuffer(), s = { data: new Uint8Array(a) };
  return ve.has(r) ? Gt(r, s) : (Ma(), ve.set(r, s)), s;
}
function ka(e = "", t = null) {
  const [n, r] = L(
    () => t || Ft(e)
  ), [o, a] = L(
    () => !!`${e || ""}`.trim() && !t && !Ft(e)
  ), [s, l] = L("");
  return $(() => {
    if (t) {
      r(t), a(!1), l("");
      return;
    }
    const c = `${e || ""}`.trim();
    if (!c) {
      r(null), a(!1), l("");
      return;
    }
    const i = Ft(c);
    if (i) {
      r(i), a(!1), l("");
      return;
    }
    let d = !1;
    return a(!0), l(""), r(null), xr(c).then((u) => {
      d || (r(u), a(!1));
    }).catch((u) => {
      d || (r(null), a(!1), l((u == null ? void 0 : u.message) || String(u)));
    }), () => {
      d = !0;
    };
  }, [e, t]), { file: n, loading: o, error: s };
}
function Na(e) {
  const { sessionEpochRef: t, closingRef: n, abort: r, sessionEpoch: o } = e;
  let a = !1;
  const s = () => r.signal.aborted || n.current || t.current.value !== o;
  return {
    signal: r.signal,
    isClosedOrStale: s,
    isInactive: () => a || s(),
    markFailed: () => {
      a = !0;
    }
  };
}
async function Yt(e) {
  const { url: t, label: n, percentStart: r, percentEnd: o, fence: a, setBoot: s } = e;
  if (!t || a.isInactive())
    return null;
  Tt(s, r, n, "download");
  const l = await xr(t, ct().fetchProtected, {
    signal: a.signal
  });
  return a.isInactive() ? null : (Tt(s, o, n, "download"), l);
}
async function Aa(e) {
  const { sourceFinal: t, translatedFinal: n, fence: r, setBoot: o } = e;
  Tt(o, 25, "正在下载 PDF…", "download");
  const a = [];
  let s = null, l = null;
  return t && a.push(
    Yt({
      url: t,
      label: "正在下载原文 PDF…",
      percentStart: 30,
      percentEnd: 55,
      fence: r,
      setBoot: o
    }).then((d) => {
      s = d;
    })
  ), n && a.push(
    Yt({
      url: n,
      label: "正在下载译文 PDF…",
      percentStart: 55,
      percentEnd: 85,
      fence: r,
      setBoot: o
    }).then((d) => {
      l = d;
    })
  ), await Promise.all(a), r.isInactive() ? { status: "inactive" } : !!t && !s || !!n && !l ? { status: "incomplete" } : { status: "downloaded", sourceBytes: s, translatedBytes: l };
}
const vt = {
  regions: null,
  metadata: null
};
function xa(e) {
  const {
    sessionJobId: t,
    jobId: n,
    routeDocumentId: r,
    documentJobId: o,
    rejectedDocumentJobId: a,
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
    closingRef: p,
    activeLoadAbortRef: b
  } = e, [S, I] = L(""), [y, w] = L(""), [N, E] = L(null), [_, k] = L(null), [R, T] = L(!1), [v, M] = L(""), [C, z] = L([]), [F, B] = L(() => ({
    source: null,
    translated: null
  })), [ee, X] = L(
    vt
  ), [oe, re] = L({
    loading: !0,
    percent: 4,
    text: Re.boot,
    stage: "progress",
    failed: !1
  });
  return $(() => {
    const ie = new AbortController(), U = g.current.value, K = Na({
      sessionEpochRef: g,
      closingRef: p,
      abort: ie,
      sessionEpoch: U
    });
    b.current = ie;
    const Z = mn();
    if (p.current)
      return ie.abort(), () => {
        b.current === ie && (b.current = null);
      };
    function Q(H, V) {
      K.markFailed(), re({
        loading: !1,
        percent: 100,
        text: H,
        stage: "failed",
        failed: !0
      }), qt({ percent: 100, text: V, stage: "failed" });
    }
    function le() {
      T(!0), re({
        loading: !1,
        percent: 100,
        text: Re.ready,
        stage: "ready",
        failed: !1
      }), qt({ percent: 100, text: Re.ready, stage: "ready" });
    }
    function he() {
      return i != null && i.documentId ? Bn(
        i.documentId,
        i.revision
      ) : Qo() ? ea : Z.resolveResourceUrl(`/api/v1/documents/${encodeURIComponent(r)}/source.pdf`);
    }
    async function me() {
      let H = { activeJobId: "", activeVersionId: "" };
      try {
        const ge = await Z.fetchProtected(
          Z.resolveResourceUrl(`/api/v1/documents/${encodeURIComponent(r)}`)
        );
        if (ge != null && ge.ok) {
          const Le = await ge.json().catch(() => null);
          H = Sa(Le);
        }
      } catch {
      }
      const V = Pa({
        link: H,
        rejectedDocumentJobId: a,
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
      const ae = he();
      if (K.isInactive()) return;
      I(ae), w(""), M(""), f(c);
      const Pe = await Yt({
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
    async function pe() {
      var yt;
      const H = await ((yt = Z.loadSessionSnapshot) == null ? void 0 : yt.call(Z, {
        jobId: t,
        documentId: r,
        routeDocumentId: r,
        committedSource: i,
        includeOptionalArtifacts: !i
      })), V = H ? {
        jobPayload: H.sourcePayload,
        manifestPayload: H.manifestPayload,
        readerMetadata: H.readerMetadata,
        regionsPayload: H.regions,
        readerErrors: H.readerErrors
      } : await Z.loadReaderPayload(t, {
        // committedSource 分支会丢弃 regions/metadata（旧页序已失效），
        // 直接跳过这两个可选请求，避免无效网络往返。
        includeOptionalArtifacts: !i
      });
      if (K.isInactive()) return;
      let ae = null;
      if (n && !r) {
        try {
          ae = await Z.fetchDocumentByJobId(hn, t);
        } catch {
        }
        if (K.isInactive()) return;
      }
      const Pe = pa(V.jobPayload) || `${(ae == null ? void 0 : ae.document_id) || ""}`.trim();
      Pe && !r && d({
        type: "resolved-job-document",
        jobId: t,
        documentId: Pe
      });
      const ge = Ia({
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
      const Le = Z.resolveReaderSourcePdf(V.manifestPayload), gt = Z.resolveReaderTranslatedPdfUrl(V.jobPayload, V.manifestPayload), Dt = typeof Le == "string" ? Le : Z.resolveReaderArtifactUrl(Le), bt = r || Pe, Ie = i != null && i.documentId ? Bn(
        i.documentId,
        i.revision
      ) : Dt || (bt ? Z.resolveResourceUrl(`/api/v1/documents/${encodeURIComponent(bt)}/source.pdf`) : ""), ke = i ? "" : gt || "";
      if (I(Ie || ""), w(ke), M(ba(V.jobPayload, t)), u({
        jobPayload: V.jobPayload || null,
        manifestPayload: V.manifestPayload || null,
        sessionIdentity: c
      }), z(i ? [] : To(V.regionsPayload)), B(i ? { source: null, translated: null } : Eo(V.readerMetadata)), X(i ? vt : V.readerErrors ?? vt), !Ie && !ke) {
        Q(Re.failed, Re.failed);
        return;
      }
      const Ue = await Aa({
        sourceFinal: Ie || "",
        translatedFinal: ke,
        fence: K,
        setBoot: re
      });
      if (Ue.status !== "inactive") {
        if (Ue.status === "incomplete") {
          Q("PDF 下载失败，请重试", "PDF 下载失败");
          return;
        }
        E(Ue.sourceBytes), k(Ue.translatedBytes), le();
      }
    }
    async function j() {
      T(!1), E(null), k(null), z([]), B({ source: null, translated: null }), X(vt), Tt(re, 8, Re.metadata, "metadata");
      try {
        if (s) {
          await me();
          return;
        }
        if (!t) {
          Q(Re.failed, Re.failed);
          return;
        }
        await pe();
      } catch (H) {
        if (K.isClosedOrStale() || (H == null ? void 0 : H.name) === "AbortError") return;
        K.markFailed();
        const V = Number(H == null ? void 0 : H.status);
        if (Ra({
          status: V,
          jobId: n,
          routeDocumentId: r,
          documentJobId: o,
          sessionJobId: t
        })) {
          d({ type: "missing-document-job", documentId: r, jobId: t }), d({ type: "cleared-resolved-document-job" }), m("source");
          return;
        }
        const ae = H instanceof Error ? H.message : Re.failed;
        Q(ae, ae);
      }
    }
    return j(), () => {
      ie.abort(), b.current === ie && (b.current = null);
    };
  }, [t, r, o, a, s, l, i, P, n, c, d, u, f, m]), {
    sourceUrl: S,
    translatedUrl: y,
    sourceFile: N,
    translatedFile: _,
    assetsReady: R,
    title: v,
    regions: C,
    readerMetadata: F,
    readerErrors: ee,
    boot: oe
  };
}
function Ca() {
  const e = A(!1), t = A(null), { locationKey: n, jobId: r, routeDocumentId: o, sessionIdentity: a } = fa(), s = A({ identity: "", value: 0 });
  s.current.identity !== a && (s.current = {
    identity: a,
    value: s.current.value + 1
  }, e.current = !1);
  const l = A(a), c = A(""), i = A(""), d = A(() => {
  }), u = x(() => d.current(), []), f = ma({
    routeDocumentId: o,
    jobId: r,
    sessionIdentity: a,
    sessionIdentityRef: l,
    documentIdRef: c,
    sessionJobIdRef: i,
    switchToSourceMode: u
  }), {
    sessionJobId: m,
    documentId: P,
    sourceOnly: g,
    sourceViewOnly: p
  } = f, { mode: b, setMode: S, switchSessionMode: I } = wa(p);
  d.current = () => {
    I("source");
  }, l.current = a, c.current = P, i.current = m;
  const y = ya({
    sessionJobId: m,
    sessionIdentity: a,
    sessionIdentityRef: l,
    sessionJobIdRef: i,
    sessionEpochRef: s,
    closingRef: e
  }), {
    scopedJobPayload: w,
    scopedManifestPayload: N,
    jobStatus: E,
    jobTerminal: _,
    jobRefreshRevision: k,
    refreshJobArtifacts: R,
    refreshJobStatus: T
  } = y, v = xa({
    sessionJobId: m,
    jobId: r,
    routeDocumentId: o,
    documentJobId: f.documentJobId,
    rejectedDocumentJobId: f.rejectedDocumentJobId,
    sourceOnly: g,
    locationKey: n,
    sessionIdentity: a,
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
      fetchProtected: mn().fetchProtected,
      jobId: m,
      jobPayload: w,
      manifestPayload: N,
      sourceUrl: v.sourceUrl,
      translatedUrl: v.translatedUrl,
      sourceOnly: p
    }),
    [m, w, N, v.sourceUrl, v.translatedUrl, p]
  );
  return {
    jobId: m,
    jobStatus: E,
    workflow: `${(w == null ? void 0 : w.workflow) || ""}`.trim().toLowerCase(),
    jobTerminal: _,
    documentId: P,
    sessionIdentity: a,
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
const La = 160, za = 8, Da = 960;
function _a() {
  const e = A(null), [t, n] = L(null), [r, o] = L(Da), a = x((s) => {
    e.current = s, n(s);
  }, []);
  return $(() => {
    const s = t;
    if (!s || typeof ResizeObserver > "u")
      return;
    const l = (i) => {
      !Number.isFinite(i) || i < La || o((d) => Math.abs(d - i) < za ? d : i);
    }, c = new ResizeObserver((i) => {
      var d, u;
      l(((u = (d = i[0]) == null ? void 0 : d.contentRect) == null ? void 0 : u.width) ?? s.clientWidth);
    });
    return c.observe(s), l(s.clientWidth), () => c.disconnect();
  }, [t]), {
    shellRef: e,
    shellEl: t,
    shellWidth: r,
    bindShell: a
  };
}
function Fa(e) {
  const { mode: t, sourceOnly: n, assetsReady: r, hasSource: o, hasTranslated: a } = e, s = r && o, l = r && a && !n, c = t === "source" || t === "compare", i = !n && (t === "translated" || t === "compare");
  return {
    mountSource: s,
    mountTranslated: l,
    showSource: c,
    showTranslated: i,
    compareMode: t === "compare" && c && i && s && l,
    primaryPane: t === "translated" ? "translated" : "source"
  };
}
const Ot = { source: 0, translated: 0 };
function Oa(e, t) {
  const {
    mode: n,
    sourceOnly: r,
    assetsReady: o,
    sourceUrl: a,
    translatedUrl: s,
    sourceFile: l,
    translatedFile: c
  } = e, i = `${(t == null ? void 0 : t.identityKey) || ""}\0${a}\0${s}`, d = A(i);
  d.current = i;
  const [u, f] = L(() => ({
    identity: i,
    pages: Ot
  })), [m, P] = L(() => ({ identity: i, tick: 0 })), g = u.identity === i ? u.pages : Ot, p = m.identity === i ? m.tick : 0, b = Fa({
    mode: n,
    sourceOnly: r,
    assetsReady: o,
    hasSource: !!l || !!a,
    hasTranslated: !!c
  }), { primaryPane: S } = b, I = x((T, v) => {
    d.current === i && f((M) => {
      const C = M.identity === i ? M.pages : Ot;
      return C[v] === T && M.identity === i ? M : {
        identity: i,
        pages: { ...C, [v]: T }
      };
    });
  }, [i]), y = A(null), w = x(() => {
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
  const N = q(
    () => Math.max(g.source, g.translated),
    [g]
  ), E = S === "translated" ? g.translated : g.source || g.translated, _ = t == null ? void 0 : t.userZoom, k = t == null ? void 0 : t.shellWidth, R = `${i}-${p}-${_}-${n}-${g.source}-${g.translated}-${k}`;
  return {
    ...b,
    numPagesByPane: g,
    hudNumPages: N,
    primaryNumPages: E,
    metricsTick: p,
    onNumPages: I,
    onMetrics: w,
    rowSyncRevision: R
  };
}
const Ge = "data-reader-page", Ye = "data-reader-pane", pn = "data-natural-height", $a = "reader-react-root", ja = "reader-react-grid", Ua = "reader-react-scroll-shell", Ba = "reader-react-pdf-pane", Cr = "reader-react-pdf-page", Et = "reader-react-pdf-page-placeholder", gn = "reader-react-pdf-page-slot";
function lt(e, t) {
  const n = e != null ? `[${Ge}="${e}"]` : `[${Ge}]`;
  return t ? `${n}[${Ye}="${t}"]` : n;
}
function Ha() {
  return `.${gn}[${Ge}]`;
}
function Lt(e) {
  return Number(e.getAttribute(Ge));
}
const Lr = 0.25, zr = 1, Wa = 0.05, ht = 0.5, Ja = 16, Va = 8;
function ot(e) {
  return ht;
}
function zt(e) {
  return Number.isFinite(e) ? Math.min(zr, Math.max(Lr, e)) : ht;
}
function dt(e, t) {
  const n = zt(Number(e) + t * Wa);
  return Math.round(n * 100) / 100;
}
function qa(e) {
  return Math.round(zt(e) * 100);
}
function Ka(e) {
  const n = (Number(e) || 0) - Ja - Va;
  return Math.max(160, Math.floor(n));
}
function Ga(e, t = ht) {
  const n = zt(t);
  return Ka((Number(e) || 0) * n);
}
function Ya(e, t) {
  if (!e || !Number.isFinite(t) || t <= 0 || Math.abs(t - 1) < 1e-3)
    return;
  const n = e.scrollLeft + e.clientWidth / 2, r = e.scrollTop + e.clientHeight / 2, o = Array.from(
    e.querySelectorAll(`[${Ye}]`)
  ).map((s) => ({
    pane: s,
    cx: s.scrollLeft + s.clientWidth / 2,
    hadOverflow: s.scrollWidth > s.clientWidth + 1
  })), a = () => {
    e.scrollLeft = Math.max(0, n * t - e.clientWidth / 2), e.scrollTop = Math.max(0, r * t - e.clientHeight / 2);
    for (const { pane: s, cx: l, hadOverflow: c } of o) {
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
    requestAnimationFrame(a);
  });
}
const Za = "retainpdf:reader:view:v1:", Wn = /* @__PURE__ */ new Set([
  "source",
  "translated",
  "markdown",
  "ai"
]), Xa = /* @__PURE__ */ new Set([
  "source",
  "compare",
  "translated"
]);
function Dr() {
  try {
    return typeof globalThis.localStorage > "u" ? null : globalThis.localStorage;
  } catch {
    return null;
  }
}
function Zt(e) {
  return `${e || ""}`.trim();
}
function Qa({
  documentId: e,
  jobId: t
}) {
  const n = Zt(e);
  if (n) return `document:${n}`;
  const r = Zt(t);
  return r ? `job:${r}` : "";
}
function _r(e) {
  const t = Zt(e);
  return t ? `${Za}${t}` : "";
}
function es(e) {
  if (!e || typeof e != "object") return;
  const t = Math.floor(Number(e.page)), n = Number(e.fraction);
  if (!(!Number.isFinite(t) || t < 1 || !Number.isFinite(n)))
    return {
      page: t,
      fraction: Math.max(0, Math.min(1, n))
    };
}
function ts(e) {
  if (e === null) return null;
  if (!e || typeof e != "object") return;
  const t = `${e.left || ""}`, n = `${e.right || ""}`;
  if (!(!Wn.has(t) || !Wn.has(n) || t === n))
    return { left: t, right: n };
}
function ns(e) {
  return e === null ? null : e === "markdown" || e === "ai" ? e : void 0;
}
function rs(e) {
  return Xa.has(e) ? e : void 0;
}
function Fr(e) {
  if (!e || typeof e != "object") return null;
  const t = e;
  if (t.schema !== "retainpdf_reader_view_v1") return null;
  const n = es(t.anchor), r = Number(t.zoom), o = rs(t.mode), a = ts(t.splitLayout), s = ns(t.assistantPanel);
  return {
    schema: "retainpdf_reader_view_v1",
    ...n ? { anchor: n } : {},
    ...Number.isFinite(r) ? { zoom: Math.max(0.25, Math.min(1, r)) } : {},
    ...o !== void 0 ? { mode: o } : {},
    ...a !== void 0 ? { splitLayout: a } : {},
    ...s !== void 0 ? { assistantPanel: s } : {},
    updatedAt: Number.isFinite(Number(t.updatedAt)) ? Number(t.updatedAt) : 0
  };
}
function Ee(e, t = Dr()) {
  const n = _r(e);
  if (!n || !t) return null;
  try {
    const r = t.getItem(n);
    return r ? Fr(JSON.parse(r)) : null;
  } catch {
    return null;
  }
}
function Mt(e, t, n = Dr()) {
  const r = _r(e);
  if (!r || !n) return null;
  const o = Ee(e, n), a = Fr({
    schema: "retainpdf_reader_view_v1",
    ...o || {},
    ...t,
    updatedAt: Date.now()
  });
  if (!a) return null;
  try {
    return n.setItem(r, JSON.stringify(a)), a;
  } catch {
    return null;
  }
}
function os(e, t, n = "") {
  const [r, o] = L(() => {
    var u;
    return ((u = Ee(n)) == null ? void 0 : u.zoom) ?? ot();
  }), a = A(r), s = A(n);
  a.current = r;
  const l = A(1);
  $(() => {
    var f;
    if (s.current === n) return;
    s.current = n;
    const u = ((f = Ee(n)) == null ? void 0 : f.zoom) ?? ot();
    l.current = 1, a.current = u, o(u);
  }, [e, n]);
  const c = x((u) => {
    const f = zt(u), m = a.current;
    Math.abs(f - m) < 5e-4 || (l.current = f / (m || 1), Mt(s.current, { zoom: f }), o(f));
  }, []), i = x((u) => {
    c(dt(a.current, u));
  }, [c]), d = x((u) => {
    c(ot());
  }, [c]);
  return Oe(() => {
    const u = l.current;
    Math.abs(u - 1) < 1e-3 || (l.current = 1, Ya(t == null ? void 0 : t.current, u));
  }, [r, t]), { userZoom: r, onZoomChange: c, stepZoom: i, resetZoom: d };
}
function as(e, t = !0) {
  const [n, r] = L(null), o = x(() => {
    var l, c;
    r(null);
    const s = (l = globalThis.getSelection) == null ? void 0 : l.call(globalThis);
    (c = s == null ? void 0 : s.removeAllRanges) == null || c.call(s);
  }, []), a = e.current ?? null;
  return $(() => {
    if (!t)
      return;
    const s = () => {
      var z, F;
      const g = e.current, p = (z = globalThis.getSelection) == null ? void 0 : z.call(globalThis);
      if (!g || !p || p.isCollapsed || !p.rangeCount) {
        r(null);
        return;
      }
      const b = p.getRangeAt(0);
      if (!g.contains(b.commonAncestorContainer)) {
        r(null);
        return;
      }
      const S = `${p.toString() || ""}`.replace(/\s+/g, " ").trim();
      if (S.length < 2) {
        r(null);
        return;
      }
      let I = b.commonAncestorContainer;
      I.nodeType === Node.TEXT_NODE && (I = I.parentElement);
      const y = (F = I == null ? void 0 : I.closest) == null ? void 0 : F.call(
        I,
        lt()
      );
      if (!y || !g.contains(y)) {
        r(null);
        return;
      }
      const w = Math.max(1, Math.floor(Lt(y) || 1)), E = y.getAttribute(Ye) === "translated" ? "translated" : "source", _ = b.getClientRects(), k = _[_.length - 1] || b.getBoundingClientRect();
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
      g.key === "Escape" && o();
    }, m = () => {
      r((g) => g && null);
    };
    document.addEventListener("mouseup", c), document.addEventListener("pointerup", i), document.addEventListener("touchend", d), document.addEventListener("selectionchange", u), document.addEventListener("keyup", f);
    const P = a ?? e.current;
    return P == null || P.addEventListener("scroll", m, { passive: !0 }), window.addEventListener("scroll", m, { passive: !0, capture: !0 }), () => {
      document.removeEventListener("mouseup", c), document.removeEventListener("pointerup", i), document.removeEventListener("touchend", d), document.removeEventListener("selectionchange", u), document.removeEventListener("keyup", f), P == null || P.removeEventListener("scroll", m), window.removeEventListener("scroll", m, !0);
    };
  }, [t, a, o]), { selection: n, clearSelection: o };
}
function ss(e) {
  const { mode: t, setMode: n, beginModeSwitch: r } = e, o = A(t), a = A(n), s = A(r);
  return o.current = t, a.current = n, s.current = r, { setModeKeepingPage: x((c) => {
    c !== o.current && (s.current(), a.current(c));
  }, []) };
}
function is() {
  const [e, t] = L(null), n = x((s) => {
    t(s);
  }, []), r = x((s = null) => {
    t((l) => !s || l === s ? null : l);
  }, []), o = x((s) => {
    t((l) => l === s ? null : s);
  }, []), a = x(
    (s) => e === s,
    [e]
  );
  return { active: e, open: n, close: r, toggle: o, isOpen: a };
}
const bn = 48;
function Or(e, t = bn) {
  return e.getBoundingClientRect().top + t;
}
function $r(e, t) {
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
  const o = Lt(n);
  if (!Number.isFinite(o) || o < 1)
    return null;
  const a = n.getBoundingClientRect(), s = a.height > 0 ? a.height : 1, l = Math.min(1, Math.max(0, (t - a.top) / s));
  return { el: n, page: o, fraction: l };
}
function $t(e, t, n = bn) {
  if (!e)
    return null;
  const r = lt(void 0, t), o = Array.from(e.querySelectorAll(r));
  if (!o.length || e.getBoundingClientRect().height <= 0)
    return null;
  const s = Or(e, n), l = $r(o, s);
  return l ? { page: l.page, fraction: l.fraction } : null;
}
function yn(e, t, n = "auto", r, o = bn) {
  if (!e || !t)
    return !1;
  const a = Math.max(1, Math.floor(Number(t.page) || 1)), s = Math.min(1, Math.max(0, Number(t.fraction) || 0));
  let l = null;
  if (r && (l = e.querySelector(lt(a, r))), l || (l = e.querySelector(lt(a))), !l)
    return !1;
  const c = e.getBoundingClientRect(), i = l.getBoundingClientRect();
  if (c.height <= 0 || i.height < 8 && l.offsetHeight < 8)
    return !1;
  const d = i.height > 0 ? i.height : l.offsetHeight, u = e.scrollTop + (i.top - c.top), f = Math.max(0, u + s * d - o);
  return n === "auto" ? e.scrollTop = f : e.scrollTo({ top: f, behavior: n }), !0;
}
function cs(e, t, n = "smooth", r) {
  return yn(
    e,
    { page: t, fraction: 0 },
    n,
    r
  );
}
function Xt(e, t, n) {
  const r = (n == null ? void 0 : n.behavior) ?? "auto", o = (n == null ? void 0 : n.delaysMs) ?? [0, 32, 120, 280];
  let a = !1, s = !1;
  const l = [], c = () => {
    var d;
    if (a) return;
    yn(
      e(),
      t,
      r,
      n == null ? void 0 : n.pane
    ) && !s && (s = !0, (d = n == null ? void 0 : n.onDone) == null || d.call(n));
  };
  for (const i of o)
    i <= 0 ? requestAnimationFrame(() => {
      requestAnimationFrame(c);
    }) : l.push(setTimeout(c, i));
  return () => {
    a = !0;
    for (const i of l)
      clearTimeout(i);
  };
}
function ls(e, t, n) {
  return Xt(
    e,
    { page: t, fraction: 0 },
    n
  );
}
function kt(e, t) {
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
function ds(e, t, n = !0, r = "", o) {
  const [a, s] = L(1);
  return $(() => {
    if (!n || t <= 0) {
      s(1);
      return;
    }
    const l = e.current;
    if (!l)
      return;
    let c = !1, i = null, d = 0;
    const u = lt(void 0, o), f = () => {
      if (c) return;
      const g = Array.from(l.querySelectorAll(u));
      if (!g.length)
        return;
      const p = Or(l), b = $r(g, p);
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
  }, [e, t, n, r, o]), a;
}
const us = `canvas, .react-pdf__Page, .${Cr}, .${Et}`, Jn = /* @__PURE__ */ new WeakMap();
function fs(e) {
  const t = Number(e.getAttribute(pn));
  if (Number.isFinite(t) && t > 0)
    return t;
  let n = Jn.get(e);
  if ((n == null || !n.isConnected) && (n = e.querySelector(us), Jn.set(e, n)), n) {
    const o = n.getBoundingClientRect().height;
    if (Number.isFinite(o) && o > 0)
      return o;
  }
  const r = e.getBoundingClientRect().height;
  return Number.isFinite(r) && r > 0 ? r : 0;
}
function ms(e, t) {
  if (e.size !== t.size) return !1;
  for (const [n, r] of t)
    if (e.get(n) !== r) return !1;
  return !0;
}
function hs(e) {
  const t = /* @__PURE__ */ new Map();
  e.querySelectorAll(Ha()).forEach((r) => {
    const o = Lt(r);
    if (!Number.isFinite(o) || o < 1) return;
    const a = fs(r);
    if (a <= 0) return;
    const s = t.get(o) || { height: 0, count: 0 };
    s.height = Math.max(s.height, a), s.count += 1, t.set(o, s);
  });
  const n = /* @__PURE__ */ new Map();
  return t.forEach((r, o) => {
    r.count >= 2 && r.height > 0 && n.set(o, Math.ceil(r.height));
  }), n;
}
function ps(e, t, n = "", r) {
  const [o, a] = L(() => /* @__PURE__ */ new Map()), s = A(o), l = A(r);
  return l.current = r, Oe(() => {
    if (!t) {
      s.current.size !== 0 && (s.current = /* @__PURE__ */ new Map(), a(s.current));
      return;
    }
    let c = !1, i = 0, d = !1, u = !1;
    const f = () => {
      var w;
      if (c) return;
      const I = e.current;
      if (!I) return;
      const y = hs(I);
      ms(s.current, y) || (s.current = y, a(y)), d && !u && (u = !0, (w = l.current) == null || w.call(l));
    }, m = () => {
      cancelAnimationFrame(i), i = requestAnimationFrame(() => {
        requestAnimationFrame(f);
      });
    };
    m();
    const P = window.setTimeout(m, 100), g = window.setTimeout(() => {
      d = !0, m();
    }, 300), p = window.setTimeout(m, 700), b = e.current;
    let S = null;
    return b && typeof ResizeObserver < "u" && (S = new ResizeObserver(() => m()), S.observe(b)), () => {
      c = !0, cancelAnimationFrame(i), window.clearTimeout(P), window.clearTimeout(g), window.clearTimeout(p), S == null || S.disconnect();
    };
  }, [e, t, n]), o;
}
const gs = [0, 48, 140, 320, 560], bs = 700, ys = [80, 200, 400], vs = 500, ws = 50, Ss = 180, Vn = [0, 48, 140, 320, 700, 1200];
function Ps(e, t) {
  var T;
  const {
    primaryPane: n,
    mode: r,
    enabled: o = !0,
    persistenceKey: a = "",
    restoreReady: s = !0
  } = t, l = A(
    ((T = Ee(a)) == null ? void 0 : T.anchor) || { page: 1, fraction: 0 }
  ), c = A(null), i = A(!1), d = A(r), u = A(null), f = A(null), m = A(null), P = A(null), g = A(a), p = A(""), b = A(n);
  b.current = n;
  const S = x(() => {
    var v;
    (v = u.current) == null || v.call(u), u.current = null, f.current != null && (clearTimeout(f.current), f.current = null);
  }, []), I = x((v = !1) => {
    P.current != null && (clearTimeout(P.current), P.current = null);
    const M = () => {
      P.current = null, Mt(g.current, {
        anchor: be(l.current)
      });
    };
    v ? M() : P.current = setTimeout(M, Ss);
  }, []), y = x((v) => {
    l.current = be(v), c.current = null, m.current != null && clearTimeout(m.current), m.current = setTimeout(() => {
      m.current = null, i.current = !1;
    }, ws);
  }, []);
  $(() => {
    if (!o)
      return;
    let v = !1, M = null, C = null, z = null;
    const F = () => {
      if (v) return;
      const B = e.current;
      if (!B) {
        z = setTimeout(F, 50);
        return;
      }
      M = B, C = () => {
        if (i.current)
          return;
        const ee = $t(M, b.current);
        ee && (l.current = ee, I());
      }, M.addEventListener("scroll", C, { passive: !0 }), i.current || C();
    };
    return F(), () => {
      v = !0, z != null && clearTimeout(z), M && C && M.removeEventListener("scroll", C);
    };
  }, [o, r, n, e, I]), Oe(() => {
    var M;
    if (g.current === a) return;
    I(!0), S(), m.current != null && (clearTimeout(m.current), m.current = null), g.current = a, p.current = "";
    const v = (M = Ee(a)) == null ? void 0 : M.anchor;
    l.current = v ? be(v) : { page: 1, fraction: 0 }, c.current = null, i.current = !!a, d.current = r;
  }, [a, r, I, S]), $(() => {
    var M;
    if (!o || !s || !a || p.current === a) return;
    p.current = a;
    const v = be(
      ((M = Ee(a)) == null ? void 0 : M.anchor) || { page: 1, fraction: 0 }
    );
    return l.current = v, c.current = v, i.current = !0, S(), u.current = Xt(
      () => e.current,
      v,
      {
        behavior: "auto",
        pane: b.current,
        delaysMs: Vn,
        onDone: () => y(v)
      }
    ), f.current = setTimeout(() => {
      f.current = null, y(v);
    }, Math.max(...Vn) + 160), () => S();
  }, [o, s, a, e, y, S]), $(() => {
    if (d.current === r)
      return;
    if (d.current = r, !o) {
      i.current = !1, c.current = null, S();
      return;
    }
    const v = c.current ? be(c.current) : be(l.current);
    return i.current = !0, c.current = v, l.current = v, S(), u.current = Xt(
      () => e.current,
      v,
      {
        behavior: "auto",
        pane: n,
        // 等页宽/行高同步后再钉；同一 locked 幂等，不会越滚越远
        delaysMs: gs,
        onDone: () => y(v)
      }
    ), f.current = setTimeout(() => {
      f.current = null, y(v);
    }, bs), () => {
      S();
    };
  }, [r, o, n, e, y, S]), $(() => () => {
    S(), m.current != null && (clearTimeout(m.current), m.current = null), I(!0);
  }, [S, I]);
  const w = x(() => {
    const v = $t(
      e.current,
      b.current
    );
    return be(v || l.current);
  }, [e]), N = x(() => {
    i.current = !0;
    const v = $t(
      e.current,
      b.current
    ), M = be(v ?? l.current);
    return l.current = M, c.current = M, I(), M;
  }, [e, I]), E = x((v, M, C) => {
    const z = C || b.current, F = kt(v, M || 1), B = { page: F, fraction: 0 };
    l.current = B, i.current = !0, c.current = B, I(), S(), cs(e.current, F, "smooth", z), u.current = ls(
      () => e.current,
      F,
      {
        behavior: "auto",
        pane: z,
        delaysMs: ys,
        onDone: () => y(B)
      }
    ), f.current = setTimeout(() => {
      f.current = null, y(B);
    }, vs);
  }, [e, y, S, I]), _ = x(() => be(l.current), []), k = x(() => i.current, []), R = x(() => {
    if (!i.current || !c.current)
      return;
    const v = be(c.current);
    yn(
      e.current,
      v,
      "auto",
      b.current
    );
  }, [e]);
  return {
    lockFromShell: w,
    beginModeSwitch: N,
    goToPage: E,
    getAnchor: _,
    isRestoring: k,
    repinIfRestoring: R
  };
}
function Is(e, t) {
  if (!e) return null;
  if (e.blockId && t) {
    const o = t(e.blockId);
    if (o != null && Number.isFinite(o) && o >= 1)
      return Math.floor(o);
  }
  if (e.pageIdx === null || e.pageIdx === void 0) return null;
  const n = Number(e.pageIdx);
  if (!Number.isFinite(n)) return null;
  const r = Math.floor(n) + 1;
  return r >= 1 ? r : null;
}
function jr(e, t, n) {
  const r = `${(n == null ? void 0 : n.jobId) || ""}`.trim(), o = `${(n == null ? void 0 : n.documentId) || ""}`.trim(), a = `j:${r}:d:${o}`;
  return t == null ? `${a}:none:${(e == null ? void 0 : e.blockId) || ""}` : `${a}:p:${t}:b:${(e == null ? void 0 : e.blockId) || ""}`;
}
const Rs = [0, 80, 200, 400, 800], Ts = 120, Es = 400;
function Ms(e, t, n) {
  const { enabled: r, numPages: o, goToPage: a, resolveBlockPage: s, onAnchorApplied: l, jobId: c, documentId: i } = e, d = A(a);
  d.current = a;
  const u = A(s);
  u.current = s;
  const f = A(l);
  f.current = l;
  const m = A(n);
  m.current = n, $(() => {
    var I, y;
    if (!r || !Number.isFinite(o) || o < 1)
      return;
    const P = oa(), g = Is(P, u.current), p = jr(P, g, { jobId: c, documentId: i });
    if (t.current === p)
      return;
    if (g == null) {
      t.current = p, (I = m.current) == null || I.call(m);
      return;
    }
    t.current = p, P && ((y = f.current) == null || y.call(f, P, g));
    const b = [];
    let S = 0;
    for (const w of Rs)
      S = Math.max(S, w), b.push(
        setTimeout(() => {
          d.current(g);
        }, w)
      );
    return b.push(
      setTimeout(() => {
        var w;
        (w = m.current) == null || w.call(m);
      }, S + Ts)
    ), () => {
      for (const w of b) clearTimeout(w);
    };
  }, [r, o, c, i, t]);
}
function ks(e) {
  var a;
  const t = globalThis.window;
  if (!t || typeof ((a = t.history) == null ? void 0 : a.replaceState) != "function") return;
  const n = t.location, r = `${e || ""}`, o = `${n.pathname}${r ? `?${r}` : ""}${n.hash || ""}`;
  t.history.replaceState(null, "", o);
}
function Ns(e, t, n) {
  const {
    syncEnabled: r,
    currentPage: o,
    resolveBlockPage: a,
    syncDebounceMs: s = Es,
    jobId: l,
    documentId: c,
    applyReaderSearch: i
  } = e, d = A(a);
  d.current = a;
  const u = A(i);
  u.current = i;
  const f = A(0);
  $(() => {
    if (!n || !r || !t.current || !Number.isFinite(o) || o < 1 || f.current === o) return;
    const m = setTimeout(() => {
      var b;
      const P = ((b = globalThis.location) == null ? void 0 : b.search) || "", g = Ro(P, o, d.current);
      if (f.current = o, g === null) return;
      const p = `${new URLSearchParams(g).get("block_id") || ""}`.trim();
      t.current = jr(
        { blockId: p },
        o,
        { jobId: l, documentId: c }
      ), (u.current || ks)(g);
    }, s);
    return () => clearTimeout(m);
  }, [
    n,
    r,
    o,
    s,
    l,
    c,
    t
  ]);
}
function As(e) {
  const t = A(""), [n, r] = L(!1), o = x(() => r(!0), []), a = {
    enabled: e.enabled,
    numPages: e.numPages,
    goToPage: e.goToPage,
    resolveBlockPage: e.resolveBlockPage,
    onAnchorApplied: e.onAnchorApplied,
    jobId: e.jobId,
    documentId: e.documentId
  };
  Ms(a, t, o), Ns(e, t, n);
}
const et = {
  layoutByPage: /* @__PURE__ */ new Map(),
  pagesByPage: /* @__PURE__ */ new Map(),
  lastSeq: 0,
  connection: "idle",
  jobStatus: "",
  error: ""
};
function xs(e) {
  return new Map(((e == null ? void 0 : e.pages) || []).map((t) => [t.page_idx, t]));
}
function qn(e, t) {
  return e.attempt !== t.attempt ? e.attempt < t.attempt ? -1 : 1 : e.generation !== t.generation ? e.generation < t.generation ? -1 : 1 : 0;
}
function Ur(e, t, n) {
  if (n.page_idx !== t.page_idx) return "retry";
  const r = qn(n, t);
  if (r < 0 || r === 0 && n.page_hash !== t.page_hash) return "retry";
  if (!e) return "accept";
  const o = qn(n, e);
  return o < 0 ? "ignore" : o === 0 ? n.page_hash === e.pageHash ? "ignore" : "retry" : "accept";
}
function Cs(e, t, n) {
  if (t.seq <= e.lastSeq) return e;
  const r = e.pagesByPage.get(t.page_idx), o = Ur(r, t, n);
  if (o === "retry") return e;
  if (o === "ignore")
    return { ...e, lastSeq: t.seq, connection: "live", error: "" };
  const a = new Map(n.items.map((c) => [c.item_id, c])), s = new Map((r == null ? void 0 : r.changedAtSeqById) || []);
  for (const c of t.changed_item_ids)
    a.has(c) && s.set(c, t.seq);
  const l = new Map(e.pagesByPage);
  return l.set(t.page_idx, {
    attempt: n.attempt,
    generation: n.generation,
    pageHash: n.page_hash,
    itemsById: a,
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
const Kn = [250, 500, 1e3, 2e3, 4e3], jt = [80, 160, 320, 640, 1e3, 1500], Gn = [250, 500, 1e3, 2e3, 4e3, 5e3], Ls = /* @__PURE__ */ new Set(["succeeded", "failed", "cancelled", "canceled"]);
function Qt(e, t) {
  return new Promise((n, r) => {
    if (t.aborted) {
      r(new DOMException("Aborted", "AbortError"));
      return;
    }
    const o = () => {
      clearTimeout(a), r(new DOMException("Aborted", "AbortError"));
    }, a = setTimeout(() => {
      t.removeEventListener("abort", o), n();
    }, e);
    t.addEventListener("abort", o, { once: !0 });
  });
}
function vn(e) {
  return Ao(e) ? `${e.code || ""}`.trim() : "";
}
function wt(e, t) {
  const n = vn(e);
  return n === "LIVE_TRANSLATION_PAGE_NOT_COMMITTED" ? "尚未收到可显示的页面译文" : n === "LIVE_TRANSLATION_LAYOUT_NOT_READY" ? "正在等待 OCR 版面数据" : `${(e == null ? void 0 : e.message) || ""}`.trim() || t;
}
async function zs(e, t, n, r, o) {
  let a = null;
  for (let s = 0; ; s += 1) {
    try {
      const c = await o.fetchPage(e, t.page_idx, { signal: r });
      if (Ur(n.pagesByPage.get(t.page_idx), t, c) !== "retry")
        return c;
      a = xo(
        "Authoritative page snapshot has not reached the event generation",
        409,
        "LIVE_TRANSLATION_SNAPSHOT_UNAVAILABLE"
      );
    } catch (c) {
      if ((c == null ? void 0 : c.name) === "AbortError") throw c;
      a = c;
      const i = vn(c);
      if (i && ![
        "LIVE_TRANSLATION_PAGE_NOT_COMMITTED",
        "LIVE_TRANSLATION_SNAPSHOT_UNAVAILABLE"
      ].includes(i)) throw c;
    }
    const l = jt[Math.min(s, jt.length - 1)];
    if (await Qt(l, r), s >= jt.length + 2) throw a;
  }
}
function Ds({
  jobId: e,
  jobStatus: t,
  enabled: n,
  liveTranslationPort: r = void 0
}) {
  const [o, a] = L(et), s = A(o), l = A("");
  s.current = o;
  const c = `${e || ""}`.trim(), i = `${t || ""}`.trim().toLowerCase(), d = Ls.has(i) ? i : "";
  return $(() => {
    if (!n || !c) {
      l.current = "", s.current = et, a(et);
      return;
    }
    const u = r === void 0 ? ra() : r, f = l.current === c;
    if (l.current = c, !u) {
      const I = {
        ...f ? s.current : et,
        connection: d ? "terminal" : "unavailable",
        jobStatus: i,
        error: "实时译文暂不可用"
      };
      s.current = I, a(I);
      return;
    }
    const m = new AbortController();
    let P = !1;
    const g = {
      ...f ? s.current : et,
      connection: d ? "terminal" : "connecting",
      jobStatus: i,
      error: ""
    };
    s.current = g, a(g);
    const p = (I) => {
      m.signal.aborted || a((y) => {
        const w = I(y);
        return s.current = w, w;
      });
    }, b = async () => {
      let I = 0;
      for (; !m.signal.aborted; )
        try {
          const y = await u.fetchLayout(c, { signal: m.signal });
          P = !0, p((w) => ({
            ...w,
            layoutByPage: xs(y),
            jobStatus: i,
            error: ""
          }));
          return;
        } catch (y) {
          if ((y == null ? void 0 : y.name) === "AbortError") return;
          const w = vn(y);
          if (!(w === "LIVE_TRANSLATION_LAYOUT_NOT_READY" || !w)) {
            p((E) => ({
              ...E,
              connection: d ? "terminal" : "unavailable",
              jobStatus: i,
              error: wt(y, "实时译文暂不可用")
            }));
            return;
          }
          if (d) {
            p((E) => ({
              ...E,
              connection: "terminal",
              jobStatus: i,
              error: ""
            }));
            return;
          }
          p((E) => ({
            ...E,
            connection: "connecting",
            jobStatus: i,
            error: wt(y, "正在等待 OCR 版面数据")
          })), await Qt(Kn[Math.min(I, Kn.length - 1)], m.signal).catch(() => {
          }), I += 1;
        }
    };
    return (async () => {
      if (await b(), !P || m.signal.aborted) return;
      let I = 0;
      for (; !m.signal.aborted; ) {
        d || p((y) => ({
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
                w = await zs(
                  c,
                  y,
                  s.current,
                  m.signal,
                  u
                );
              } catch (N) {
                if ((N == null ? void 0 : N.name) === "AbortError" || m.signal.aborted) throw N;
                p((E) => ({
                  ...E,
                  lastSeq: Math.max(E.lastSeq, y.seq),
                  error: wt(N, "部分页面的实时译文暂时取不到")
                }));
                return;
              }
              p((N) => {
                const E = Cs(N, y, w);
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
          p((w) => ({
            ...w,
            connection: d ? "terminal" : "reconnecting",
            jobStatus: i,
            error: wt(y, "实时译文连接已中断，正在重连")
          }));
        }
        if (m.signal.aborted) return;
        if (d) {
          p((y) => ({
            ...y,
            connection: "terminal",
            jobStatus: i
          }));
          return;
        }
        await Qt(Gn[Math.min(I, Gn.length - 1)], m.signal).catch(() => {
        }), I += 1;
      }
    })(), () => m.abort();
  }, [n, r, c, d]), o;
}
const _s = 2e3;
function Fs(e) {
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
const Os = /* @__PURE__ */ new Set(["book", "translate"]);
function Br(e) {
  return !!(e.jobId && e.sourceUrl && Os.has(e.workflow));
}
function $s(e) {
  return !!(Br(e) && !(e.jobStatus === "succeeded" && e.translatedUrl));
}
function js() {
  const e = Ca(), t = Br({
    jobId: e.jobId,
    sourceUrl: e.sourceUrl,
    workflow: e.workflow
  }), n = $s({
    jobId: e.jobId,
    sourceUrl: e.sourceUrl,
    translatedUrl: e.translatedUrl,
    jobStatus: e.jobStatus,
    workflow: e.workflow
  }), r = Ds({
    jobId: e.jobId,
    jobStatus: e.jobStatus,
    enabled: t
  }), o = is(), { shellRef: a, shellEl: s, shellWidth: l, bindShell: c } = _a(), i = Qa({
    documentId: e.documentId,
    jobId: e.jobId
  }), d = `${i}\0${e.jobId}\0${e.sourceUrl}\0${e.translatedUrl}`, { userZoom: u, onZoomChange: f } = os(e.mode, a, i), m = Oa(
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
    repinIfRestoring: p
  } = Ps(a, {
    primaryPane: m.primaryPane,
    mode: e.mode,
    enabled: !e.boot.loading,
    persistenceKey: i,
    restoreReady: m.primaryNumPages > 0
  });
  $(() => {
    p();
  }, [l, p]);
  const b = ps(
    a,
    m.compareMode,
    m.rowSyncRevision,
    p
  ), S = ds(
    a,
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
  }, [g, m.hudNumPages, m.primaryNumPages, m.numPagesByPane]), [y, w] = L(null), N = A(null), E = x((U) => {
    N.current && clearTimeout(N.current), w(U), U && (N.current = setTimeout(() => w(null), _s));
  }, []);
  $(() => () => {
    N.current && clearTimeout(N.current);
  }, []);
  const _ = x((U) => {
    const K = _t(e.regions, U);
    return K ? On(K, m.primaryPane).page : null;
  }, [e.regions, m.primaryPane]), k = x((U, K) => {
    const Z = K || m.primaryPane, Q = typeof U == "object" && U ? `${U.block_id || ""}`.trim() : "", le = typeof U == "object" && U ? `${U.image_url || ""}`.trim() : "", he = typeof U == "object" && U ? U.page_idx != null ? Number(U.page_idx) + 1 : U.page != null ? Number(U.page) : null : typeof U == "number" ? U + 1 : null, me = Mo(e.regions, le, he) || _t(e.regions, Q) || (typeof U == "object" ? ko(e.regions, U) : null);
    let pe = me ? On(me, Z).page : null;
    pe == null && (pe = Fs(U)), !(pe == null || pe < 1) && (E(me), I(pe, Z));
  }, [E, I, m.primaryPane, e.regions]);
  As({
    enabled: !e.boot.loading && !e.boot.failed && e.assetsReady,
    syncEnabled: !e.boot.loading && !e.boot.failed && e.assetsReady,
    numPages: m.hudNumPages || 0,
    currentPage: S,
    goToPage: I,
    resolveBlockPage: _,
    jobId: e.jobId,
    documentId: e.documentId,
    onAnchorApplied: (U) => {
      E(_t(e.regions, U.blockId));
    }
  });
  const { setModeKeepingPage: R } = ss({
    mode: e.mode,
    setMode: e.setMode,
    beginModeSwitch: P
  }), [T, v] = L(null), {
    selection: M,
    clearSelection: C
  } = as(a, !e.boot.loading && !e.boot.failed), z = x(() => {
    v(null), C();
  }, [C]), F = x((U) => {
    C(), v(U);
  }, [C]);
  $(() => {
    M && v(null);
  }, [M]), $(() => {
    const U = a.current;
    if (!U) return;
    const K = () => v(null);
    return U.addEventListener("scroll", K, { passive: !0 }), () => U.removeEventListener("scroll", K);
  }, [s, a]);
  const B = M || T;
  $(() => {
    E(null), z();
  }, [d, E, z]);
  const ee = !e.boot.loading && !e.boot.failed, X = q(() => o, [o.active, o.open, o.close, o.toggle, o.isOpen]), oe = q(() => ({ bindShell: c, shellEl: s, shellWidth: l, shellRef: a }), [c, s, l, a]), re = q(() => ({
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
    selectRegion: F,
    viewStateKey: i,
    liveTranslation: r,
    liveTranslationAvailable: n
  }), [e, oe, m, re, b, I, y, k, R, ee, X, B, z, F, u, f, i, r, n]);
  return q(() => ({
    ...ie,
    currentPage: S
  }), [ie, S]);
}
const Us = [
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
], Bs = [
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
function Hs(e) {
  const t = e.length === 1 ? e.toLowerCase() : e;
  for (const n of Us)
    if (n.keys.some(
      (o) => o.length === 1 ? o === t : o === e
    )) return n;
  return null;
}
function Ws(e) {
  if (!(e instanceof HTMLElement))
    return !1;
  const t = e.tagName;
  return t === "INPUT" || t === "TEXTAREA" || t === "SELECT" || e.isContentEditable ? !0 : !!e.closest("input, textarea, select, [contenteditable='true']");
}
function Js(e) {
  const {
    mode: t,
    sourceOnly: n,
    setMode: r,
    userZoom: o,
    onZoomChange: a,
    currentPage: s,
    numPages: l,
    goToPage: c,
    enabled: i = !0
  } = e;
  $(() => {
    if (!i)
      return;
    const d = (u) => {
      if (u.defaultPrevented || u.metaKey || u.ctrlKey || u.altKey || Ws(u.target))
        return;
      const f = u.key, m = Hs(f);
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
              a(dt(o, 1));
              return;
            case "zoom-out":
              a(dt(o, -1));
              return;
            case "zoom-reset":
              a(ot());
              return;
            case "next-page":
              c(kt(s + 1, l));
              return;
            case "prev-page":
              c(kt(s - 1, l));
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
    o,
    a,
    s,
    l,
    c
  ]);
}
const Vs = "retainpdf:soft-reader-close";
function qs() {
  return new URL("./index.html", window.location.href).href;
}
function Ks() {
  if (typeof window > "u" || window.self === window.top) return !1;
  try {
    return window.parent.postMessage(
      { type: Vs },
      window.location.origin
    ), !0;
  } catch {
    return !1;
  }
}
function Gs(e, t, n) {
  if (n <= 1 || !e) return !1;
  try {
    const r = new URL(t), o = new URL(e, r);
    return o.origin === r.origin && !/reader\.html$/i.test(o.pathname) && !/detail\.html$/i.test(o.pathname);
  } catch {
    return !1;
  }
}
function Ys() {
  if (!(typeof window > "u") && !Ks()) {
    if (Gs(
      document.referrer,
      window.location.href,
      window.history.length
    )) {
      window.history.back();
      return;
    }
    window.location.assign(qs());
  }
}
function Zs({ onBeforeClose: e } = {}) {
  return /* @__PURE__ */ D(
    "button",
    {
      id: "reader-close-home-btn",
      type: "button",
      className: "reader-close-home-btn",
      "aria-label": "返回主页",
      title: "返回主页",
      onClick: () => {
        e == null || e(), Ys();
      },
      children: [
        /* @__PURE__ */ h(Xe, { className: "reader-close-home-icon", size: 18, strokeWidth: 2.25, "aria-hidden": !0 }),
        /* @__PURE__ */ h("span", { className: "reader-close-home-label", children: "关闭" })
      ]
    }
  );
}
let Yn = !1;
function Xs() {
  if (Yn)
    return;
  const e = ct().resolvePdfjsVendorUrl("build/pdf.worker.mjs");
  e && (qo.GlobalWorkerOptions.workerSrc = e, Yn = !0);
}
const Qs = {
  formula: "公式",
  table: "表格",
  figure: "图片",
  text: "文字",
  region: "区域"
};
function ei({
  pane: e,
  width: t,
  height: n,
  regions: r,
  onSelect: o
}) {
  const a = r.flatMap((s) => {
    if (!Ir(s.region)) return [];
    const l = xt(s, t, n);
    return l ? [{ highlight: s, rect: l }] : [];
  });
  return a.length ? /* @__PURE__ */ h("div", { className: "reader-structure-selection-layer", "aria-label": "PDF 结构选择层", children: a.map(({ highlight: s, rect: l }) => {
    const c = s.region, i = Rr(c), d = Qs[i];
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
          o == null || o({
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
          /* @__PURE__ */ h("span", { className: "reader-structure-selection-label", "aria-hidden": "true", children: d }),
          /* @__PURE__ */ h("span", { className: "sr-only", children: Tr(c, e) })
        ]
      },
      c.itemId
    );
  }) }) : null;
}
function ti(e, t, n) {
  return e.flatMap((r) => {
    if (Rr(r.region) !== "text") return [];
    const o = xt(r, t, n);
    return o ? [{ itemId: r.itemId, highlight: r, rect: o }] : [];
  });
}
function Zn(e, t, n) {
  let r = null, o = Number.POSITIVE_INFINITY;
  for (const a of e) {
    const { rect: s } = a;
    if (t < s.left || t > s.left + s.width || n < s.top || n > s.top + s.height)
      continue;
    const l = s.width * s.height;
    l < o && (r = a, o = l);
  }
  return r;
}
function ni({ target: e }) {
  return e ? /* @__PURE__ */ h("div", { className: "reader-text-hover-layer", "aria-hidden": "true", children: /* @__PURE__ */ h(
    "div",
    {
      className: "reader-text-hover-frame",
      "data-reader-text-hover-id": e.itemId,
      style: e.rect,
      children: /* @__PURE__ */ h("span", { className: "reader-text-hover-label", children: "文字" })
    }
  ) }) : null;
}
function ri(e, t) {
  const n = e.page_idx + 1, r = {
    page: n,
    bbox: t.bbox,
    unit: "pdf_point",
    origin: "top_left",
    text: t.source_text
  }, o = {
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
    region: o,
    box: r,
    pageSize: { page: n, width: e.width, height: e.height }
  };
}
function oi(e, t, n, r) {
  if (!e || !t) return [];
  const o = [];
  for (const a of e.blocks) {
    const s = t.itemsById.get(a.item_id);
    if (!(s != null && s.translated_text)) continue;
    const l = xt(
      ri(e, a),
      n,
      r
    );
    l && o.push({
      itemId: a.item_id,
      translatedText: s.translated_text,
      status: s.status,
      kind: a.kind,
      sourceText: a.source_text,
      typography: a.typography,
      rect: l,
      changedAtSeq: t.changedAtSeqById.get(a.item_id) || 0,
      changedNow: t.changedAtSeqById.get(a.item_id) === t.lastEventSeq
    });
  }
  return o;
}
const ai = '"Source Han Serif SC", "Noto Serif CJK SC", "Songti SC", serif', si = 256, tt = /* @__PURE__ */ new Map();
function ii(e) {
  return `${e || ""}`.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
function ci(e) {
  const t = `${e || ""}`, { text: n, slots: r } = Yo(t, { bareLatex: !0 }), o = ii(n), a = Zo(o, r);
  if (!r.length)
    return { fallbackHtml: a, richHtml: Promise.resolve(a), hasMath: !1 };
  let s = tt.get(t);
  if (!s && (s = Xo(o, r), tt.set(t, s), tt.size > si)) {
    const l = tt.keys().next().value;
    l !== void 0 && tt.delete(l);
  }
  return { fallbackHtml: a, richHtml: s, hasMath: !0 };
}
function Ut(e) {
  return /title|heading|header|display_formula|equation/i.test(e);
}
function Te(e) {
  const t = Number(e);
  return Number.isFinite(t) && t > 0 ? t : void 0;
}
function li(e, t) {
  const n = e.typography, r = Te(t) || 1, o = Te(n == null ? void 0 : n.font_size_pt), a = Math.max(1, `${e.sourceText || ""}`.split(/\n+/).length), s = e.rect.height / Math.max(1.28, a * 1.18), l = Ut(e.kind) ? 24 : /caption|footnote|table/i.test(e.kind) ? 9.5 : 11, c = Math.max(5.5 * r, Math.min(s, l * r)), i = Te(n == null ? void 0 : n.fit_min_font_size_pt), d = Te(n == null ? void 0 : n.fit_max_font_size_pt), u = Math.max(3.5, (i || 5.5) * r), f = Math.max(
    u,
    d ? d * r : o ? o * r : c
  ), m = o ? o * r : c, P = Te(n == null ? void 0 : n.leading_em), g = [
    Te(n == null ? void 0 : n.padding_top_pt) || 0,
    Te(n == null ? void 0 : n.padding_right_pt) || 0,
    Te(n == null ? void 0 : n.padding_bottom_pt) || 0,
    Te(n == null ? void 0 : n.padding_left_pt) || 0
  ].map((p) => p * r);
  return {
    fontFamily: `${(n == null ? void 0 : n.font_family) || ""}`.trim() || ai,
    fontSizePx: Math.max(u, Math.min(f, m)),
    minFontSizePx: u,
    maxFontSizePx: f,
    // Typst leading is the additional inter-line gap, unlike CSS line-height.
    lineHeight: P ? 1 + P : 1.3,
    fontWeight: (n == null ? void 0 : n.font_weight) || (Ut(e.kind) ? 600 : 400),
    textAlign: ["left", "center", "right", "justify"].includes(`${(n == null ? void 0 : n.text_align) || ""}`) ? n == null ? void 0 : n.text_align : Ut(e.kind) ? "center" : "justify",
    padding: g,
    exact: !!o
  };
}
function di(e, t, n, r) {
  const { minFontSizePx: o, maxFontSizePx: a } = r, s = /* @__PURE__ */ new Map(), l = (u) => {
    const f = s.get(u);
    if (f !== void 0) return f;
    const { width: m, height: P } = e(u), g = m <= t + 0.5 && P <= n + 0.5;
    return s.set(u, g), g;
  };
  let c = o, i = a, d = Math.min(r.requestedFontSizePx, i);
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
  return Math.max(o, d);
}
const ui = 512, nt = /* @__PURE__ */ new Map();
let en = 0;
typeof document < "u" && document.fonts && (document.fonts.ready.then(() => {
  en += 1;
}).catch(() => {
}), typeof document.fonts.addEventListener == "function" && document.fonts.addEventListener("loadingdone", () => {
  en += 1;
}));
function fi(e, t, n, r) {
  return [
    en,
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
function mi({ item: e, pageScale: t }) {
  const n = A(null), r = q(
    () => ci(e.translatedText),
    [e.translatedText]
  ), [o, a] = L(r.fallbackHtml), s = q(
    () => li(e, t),
    [e, t]
  );
  $(() => {
    let u = !0;
    return a(r.fallbackHtml), r.hasMath && r.richHtml.then((f) => {
      u && a(f);
    }), () => {
      u = !1;
    };
  }, [r]), Oe(() => {
    const u = n.current;
    if (!u) return;
    const [f, m, P, g] = s.padding, p = Math.max(1, e.rect.width - g - m), b = Math.max(1, e.rect.height - f - P), S = fi(o, p, b, s);
    let I = nt.get(S);
    if (I === void 0 && (I = di(
      (y) => (u.style.fontSize = `${y}px`, { width: u.scrollWidth, height: u.scrollHeight }),
      p,
      b,
      {
        minFontSizePx: s.minFontSizePx,
        maxFontSizePx: s.maxFontSizePx,
        requestedFontSizePx: s.fontSizePx,
        exact: s.exact
      }
    ), nt.set(S, I), nt.size > ui)) {
      const y = nt.keys().next().value;
      y !== void 0 && nt.delete(y);
    }
    u.style.fontSize = `${I.toFixed(2)}px`;
  }, [o, e.rect.height, e.rect.width, s]);
  const [l, c, i, d] = s.padding;
  return /* @__PURE__ */ h(
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
      children: /* @__PURE__ */ h(
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
          dangerouslySetInnerHTML: { __html: o }
        }
      )
    }
  );
}
function hi({
  layoutPage: e,
  pageState: t,
  width: n,
  height: r
}) {
  const o = q(
    () => oi(e, t, n, r),
    [r, e, t, n]
  );
  return o.length ? /* @__PURE__ */ h(
    "div",
    {
      className: "reader-live-translation-overlay",
      "data-live-translation-page": e == null ? void 0 : e.page_idx,
      "data-live-translation-generation": t == null ? void 0 : t.generation,
      "aria-hidden": "true",
      children: o.map((a) => /* @__PURE__ */ h(
        mi,
        {
          item: a,
          pageScale: e != null && e.width ? n / e.width : 1
        },
        `${a.itemId}:${a.changedAtSeq}`
      ))
    }
  ) : null;
}
const pi = an(hi), Hr = 1.414;
function gi({
  pageNumber: e,
  width: t,
  devicePixelRatio: n,
  pane: r,
  active: o = !1,
  syncedMinHeight: a = 0,
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
  const p = A(l ?? Hr), [b, S] = L(p.current);
  $(() => {
    l != null && Math.abs(l - p.current) >= 1e-3 && (p.current = l, S(l));
  }, [l]);
  const I = A(i);
  I.current = i;
  const y = A((z) => {
    var F;
    (F = I.current) == null || F.call(I, z);
  }).current, w = Math.max(120, Math.floor(t * b)), N = Math.max(w, Math.ceil(a || 0)), E = xt(d, t, w), _ = q(
    () => ti(u, t, w),
    [w, u, t]
  ), [k, R] = L(null), T = q(
    () => _.find((z) => z.itemId === k) || null,
    [k, _]
  ), v = (z) => {
    if (z.buttons !== 0) {
      R(null);
      return;
    }
    const F = z.currentTarget.getBoundingClientRect(), B = Zn(
      _,
      z.clientX - F.left,
      z.clientY - F.top
    ), ee = (B == null ? void 0 : B.itemId) || null;
    R((X) => X === ee ? X : ee);
  }, M = (z) => {
    var ee, X, oe;
    if (!f || (X = (ee = z.target) == null ? void 0 : ee.closest) != null && X.call(ee, ".reader-structure-selection-target") || `${((oe = window.getSelection()) == null ? void 0 : oe.toString()) || ""}`.trim()) return;
    const F = z.currentTarget.getBoundingClientRect(), B = Zn(
      _,
      z.clientX - F.left,
      z.clientY - F.top
    );
    B && f({
      selectionType: "region",
      region: B.highlight.region,
      kind: "text",
      page: B.highlight.box.page,
      pane: r === "translated" ? "translated" : "source",
      rect: {
        left: F.left + B.rect.left,
        top: F.top + B.rect.top,
        width: B.rect.width,
        height: B.rect.height
      }
    });
  }, C = (z) => {
    !Number.isFinite(z) || z <= 0 || Math.abs(p.current - z) < 1e-3 || (p.current = z, S(z), c == null || c(e, z));
  };
  return /* @__PURE__ */ D(
    "div",
    {
      ref: y,
      [Ge]: e,
      [Ye]: r,
      [pn]: w,
      className: gn,
      onPointerMoveCapture: v,
      onClick: M,
      onPointerLeave: () => R(null),
      style: {
        width: t,
        height: N,
        minHeight: N
      },
      children: [
        o ? /* @__PURE__ */ h(
          Ko,
          {
            pageNumber: e,
            width: t,
            devicePixelRatio: n,
            renderTextLayer: !0,
            renderAnnotationLayer: !1,
            className: Cr,
            loading: /* @__PURE__ */ h(
              "div",
              {
                className: Et,
                style: { width: t, height: w }
              }
            ),
            onLoadSuccess: (z) => {
              try {
                const F = z.getViewport({ scale: 1 });
                if (F.width > 0) {
                  const B = F.height / F.width;
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
        ) : /* @__PURE__ */ h(
          "div",
          {
            className: Et,
            style: { width: t, height: w },
            "aria-hidden": !0
          }
        ),
        E ? /* @__PURE__ */ h(
          "div",
          {
            className: "reader-react-pdf-region-highlight",
            "data-reader-region-id": d == null ? void 0 : d.itemId,
            style: E,
            "aria-hidden": "true"
          }
        ) : null,
        o && g ? /* @__PURE__ */ h(
          pi,
          {
            layoutPage: m,
            pageState: P,
            width: t,
            height: w
          }
        ) : null,
        /* @__PURE__ */ h(ni, { target: o ? T : null }),
        /* @__PURE__ */ h(
          ei,
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
const bi = an(gi), Bt = 5, yi = "120% 0px", vi = 120;
let Xn = 1;
const Qn = /* @__PURE__ */ new WeakMap();
function wi(e) {
  if (!e) return 0;
  const t = Qn.get(e);
  if (t) return t;
  const n = Xn;
  return Xn += 1, Qn.set(e, n), n;
}
function Si() {
  const e = typeof window < "u" && window.devicePixelRatio || 1;
  return Math.max(1, Math.min(e, 2));
}
const Pi = ho(
  function({
    pane: t,
    url: n = "",
    preloadedFile: r = null,
    userZoom: o = 1,
    visible: a = !0,
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
    readerMetadata: p = null,
    onSelectRegion: b,
    liveTranslation: S,
    showLiveTranslation: I = t === "source",
    liveTranslationPendingLabel: y = "",
    paneAction: w
  }, N) {
    Xs();
    const { file: E, loading: _, error: k } = ka(n, r), R = `${n}\0${wi(E)}`, T = A(R);
    T.current = R;
    const v = q(
      () => Ta(E),
      [E, n]
    ), [M, C] = L(0), [z, F] = L(""), [B, ee] = L(null), [X, oe] = L(480), re = A(null), ie = A(0), U = q(() => Si(), []), K = q(() => ({
      cMapUrl: ct().resolvePdfjsVendorUrl("cmaps/"),
      cMapPacked: !0,
      standardFontDataUrl: ct().resolvePdfjsVendorUrl("standard_fonts/")
    }), []);
    sn(N, () => B, [B]), $(() => {
      const O = (W) => {
        !Number.isFinite(W) || W < 80 || Math.abs(W - ie.current) < 8 || (ie.current = W, oe(W));
      }, G = c && c >= 80 ? c : (l == null ? void 0 : l.clientWidth) || 0;
      if (O(G), !l || typeof ResizeObserver > "u" || c && c >= 80) return;
      const J = new ResizeObserver((W) => {
        var te, ne;
        const ce = ((ne = (te = W[0]) == null ? void 0 : te.contentRect) == null ? void 0 : ne.width) ?? l.clientWidth;
        !Number.isFinite(ce) || ce < 80 || (re.current && clearTimeout(re.current), re.current = setTimeout(() => O(ce), 80));
      });
      return J.observe(l), () => {
        J.disconnect(), re.current && clearTimeout(re.current);
      };
    }, [c, l, a]);
    const Z = q(
      () => Ga(X, o),
      [X, o]
    ), [Q, le] = L(() => /* @__PURE__ */ new Map()), [he, me] = L(() => /* @__PURE__ */ new Set()), [pe, j] = L(() => /* @__PURE__ */ new Set()), H = A(/* @__PURE__ */ new Map()), V = A(null), ae = A(/* @__PURE__ */ new Map()), Pe = x((O, G) => {
      le((J) => {
        if (J.get(O) === G) return J;
        const W = new Map(J);
        return W.set(O, G), W;
      });
    }, []), ge = x((O, G) => {
      const J = H.current, W = J.get(O);
      if (W && V.current)
        try {
          V.current.unobserve(W);
        } catch {
        }
      if (G) {
        if (J.set(O, G), V.current)
          try {
            V.current.observe(G);
          } catch {
          }
      } else
        J.delete(O);
    }, []), Le = A(/* @__PURE__ */ new Map()), gt = x((O) => {
      const G = Le.current;
      let J = G.get(O);
      return J || (J = (W) => ge(O, W), G.set(O, J)), J;
    }, [ge]);
    $(() => {
      if (typeof IntersectionObserver > "u") return;
      const O = ae.current, G = new IntersectionObserver(
        (J) => {
          const W = [], ce = [];
          for (const te of J) {
            const ne = te.target, fe = Lt(ne);
            Number.isFinite(fe) && (te.isIntersecting ? W : ce).push(fe);
          }
          if ((W.length || ce.length) && me((te) => {
            let ne = null;
            for (const fe of W)
              te.has(fe) || (ne = ne || new Set(te), ne.add(fe));
            for (const fe of ce)
              te.has(fe) && (ne = ne || new Set(te), ne.delete(fe));
            return ne || te;
          }), W.length) {
            for (const te of W) {
              const ne = O.get(te);
              ne && (clearTimeout(ne), O.delete(te));
            }
            j((te) => {
              let ne = null;
              for (const fe of W)
                te.has(fe) || (ne = ne || new Set(te), ne.add(fe));
              return ne || te;
            });
          }
          for (const te of ce)
            O.has(te) || O.set(te, setTimeout(() => {
              O.delete(te), j((ne) => {
                if (!ne.has(te)) return ne;
                const fe = new Set(ne);
                return fe.delete(te), fe;
              });
            }, vi));
        },
        { root: l, rootMargin: yi, threshold: 0 }
      );
      V.current = G;
      for (const J of H.current.values())
        try {
          G.observe(J);
        } catch {
        }
      return () => {
        G.disconnect(), V.current === G && (V.current = null);
        for (const J of O.values()) clearTimeout(J);
        O.clear();
      };
    }, [l]), Oe(() => {
      C(0), F(""), me(/* @__PURE__ */ new Set()), j(/* @__PURE__ */ new Set()), le(/* @__PURE__ */ new Map()), H.current.clear();
      const O = ae.current;
      for (const G of O.values()) clearTimeout(G);
      O.clear(), m == null || m(0, t);
    }, [R, m, t]);
    const Dt = x(
      ({ numPages: O }) => {
        T.current === R && (C(O), F(""), m == null || m(O, t), u == null || u({ numPages: O, pane: t }));
      },
      [R, u, m, t]
    ), bt = x(
      (O) => {
        if (T.current !== R) return;
        const G = (O == null ? void 0 : O.message) || "PDF 解析失败";
        F(G), C(0), m == null || m(0, t), f == null || f(O, t);
      },
      [R, f, m, t]
    ), Ie = q(
      () => M > 0 ? Array.from({ length: M }, (O, G) => G + 1) : [],
      [M]
    );
    $(() => {
      typeof IntersectionObserver < "u" || j(new Set(Ie));
    }, [Ie]);
    const ke = q(
      () => $n(P, p, t),
      [P, p, t]
    ), Ue = q(() => {
      const O = /* @__PURE__ */ new Map();
      for (const G of g) {
        const J = $n(G, p, t);
        if (!J) continue;
        const W = O.get(J.box.page) || [];
        W.push(J), O.set(J.box.page, W);
      }
      return O;
    }, [t, p, g]), yt = q(() => {
      if (M === 0) return /* @__PURE__ */ new Set();
      if (!(!!l && typeof IntersectionObserver < "u" && a)) return new Set(Ie);
      if (he.size === 0) {
        const J = Math.min(M, Bt * 2 + 1);
        return new Set(Array.from({ length: J }, (W, ce) => ce + 1));
      }
      const G = /* @__PURE__ */ new Set();
      for (const J of he)
        for (let W = -Bt; W <= Bt; W++) {
          const ce = J + W;
          ce >= 1 && ce <= M && G.add(ce);
        }
      return G;
    }, [M, Ie, l, a, he]), fo = !n || !!k || !!z, mo = n && (k || z) || s;
    return /* @__PURE__ */ D(
      "section",
      {
        ref: ee,
        className: `reader-panel ${Ba}${a ? "" : " is-hidden"}`,
        [Ye]: t,
        "data-reader-engine": "react-pdf",
        "data-reader-visible": a ? "true" : "false",
        "data-live-translation-status": (S == null ? void 0 : S.jobStatus) || void 0,
        "aria-hidden": a ? void 0 : !0,
        "aria-label": t === "source" ? "原文 PDF" : "译文 PDF",
        children: [
          w ? /* @__PURE__ */ h("div", { className: "reader-react-pdf-pane-action", children: w }) : null,
          y ? /* @__PURE__ */ D("div", { className: "reader-live-translation-waiting", role: "status", children: [
            /* @__PURE__ */ h("span", { className: "reader-live-translation-waiting-dot", "aria-hidden": "true" }),
            /* @__PURE__ */ h("span", { children: y })
          ] }) : null,
          fo && !_ ? /* @__PURE__ */ h("div", { className: "reader-empty reader-react-pdf-empty", "data-reader-pdf-empty": t, children: mo }) : null,
          _ ? /* @__PURE__ */ h("div", { className: "reader-empty reader-react-pdf-loading", "data-reader-pdf-loading": t, children: "正在加载 PDF…" }) : null,
          v && !k ? /* @__PURE__ */ h("div", { className: "reader-viewer-wrap reader-react-pdf-wrap", children: /* @__PURE__ */ h(
            Go,
            {
              file: v,
              loading: null,
              error: null,
              options: K,
              onLoadSuccess: Dt,
              onLoadError: bt,
              className: "reader-react-pdf-document",
              children: Ie.map((O) => {
                if (yt.has(O))
                  return /* @__PURE__ */ h(
                    bi,
                    {
                      pane: t,
                      pageNumber: O,
                      width: Z,
                      devicePixelRatio: U,
                      active: pe.has(O),
                      syncedMinHeight: (i == null ? void 0 : i.get(O)) || 0,
                      onMetrics: d,
                      cachedAspect: Q.get(O),
                      onAspectChange: Pe,
                      sentinelRef: gt(O),
                      regionHighlight: (ke == null ? void 0 : ke.box.page) === O ? ke : null,
                      regionTargets: Ue.get(O),
                      onSelectRegion: b,
                      liveTranslationLayout: S == null ? void 0 : S.layoutByPage.get(O - 1),
                      liveTranslationPage: S == null ? void 0 : S.pagesByPage.get(O - 1),
                      showLiveTranslation: I
                    },
                    `${t}-${O}`
                  );
                const J = Q.get(O) ?? Hr, W = Math.max(120, Math.floor(Z * J)), ce = Math.max(W, Math.ceil((i == null ? void 0 : i.get(O)) || 0));
                return /* @__PURE__ */ h(
                  "div",
                  {
                    ref: gt(O),
                    [Ge]: O,
                    [Ye]: t,
                    [pn]: W,
                    className: gn,
                    style: {
                      width: Z,
                      height: ce,
                      minHeight: ce
                    },
                    children: /* @__PURE__ */ h(
                      "div",
                      {
                        className: Et,
                        style: { width: Z, height: W },
                        "aria-hidden": !0
                      }
                    )
                  },
                  `${t}-${O}`
                );
              })
            },
            R
          ) }) : null
        ]
      }
    );
  }
), er = an(Pi), Wr = cn(null), Jr = cn(null);
function Ii({ value: e, hud: t, children: n }) {
  return /* @__PURE__ */ h(Wr.Provider, { value: e, children: /* @__PURE__ */ h(Jr.Provider, { value: t, children: n }) });
}
function pt() {
  return ln(Wr);
}
function Ri() {
  return ln(Jr);
}
function Ti({
  mode: e,
  compareMode: t,
  showSource: n,
  showTranslated: r,
  markdownSplit: o,
  overlayOnSource: a = !1
}) {
  const s = o && e === "compare";
  return {
    mode: s ? "source" : e,
    compareMode: t && !o,
    showSource: s ? !0 : n,
    showTranslated: s ? !1 : r
  };
}
function Ei(e, t, n = e * 2) {
  return t ? Math.min(e * 2, n) : e;
}
function Mi(e) {
  return e ? e.connection === "terminal" && e.jobStatus === "failed" ? e.pagesByPage.size > 0 ? `翻译已暂停，已保留 ${e.pagesByPage.size} 页译文` : "翻译已暂停，原始 PDF 仍可阅读" : e.connection === "terminal" && ["cancelled", "canceled"].includes(e.jobStatus) ? e.pagesByPage.size > 0 ? `翻译已取消，已保留 ${e.pagesByPage.size} 页译文` : "翻译已取消，原始 PDF 仍可阅读" : e.pagesByPage.size > 0 ? "" : e.connection === "unavailable" ? e.error || "实时译文暂不可用，原始 PDF 仍可阅读" : e.error ? e.error : e.layoutByPage.size === 0 ? "正在完成 OCR，译文将在这里逐页出现" : "版面已就绪，正在等待首个译文页面" : "";
}
function ki(e) {
  const t = pt(), {
    markdownSplit: n = !1,
    assistantSplit: r = !1,
    liveTranslation: o,
    paneComposition: a
  } = e, s = (a == null ? void 0 : a.visibleMode) ?? e.mode ?? "compare", l = (a == null ? void 0 : a.compareMode) ?? e.compareMode ?? s === "compare", c = (a == null ? void 0 : a.showSource) ?? e.showSource ?? !0, i = (a == null ? void 0 : a.showTranslated) ?? e.showTranslated ?? (s === "compare" || s === "translated"), d = (a == null ? void 0 : a.overlayOnSource) ?? e.overlayOnSource ?? !1, u = e.bindShell ?? (t == null ? void 0 : t.bindShell), f = e.shellEl ?? (t == null ? void 0 : t.shellEl) ?? null, m = e.userZoom ?? (t == null ? void 0 : t.userZoom) ?? ht, P = e.shellWidth ?? (t == null ? void 0 : t.shellWidth) ?? 0, g = e.rowHeights ?? (t == null ? void 0 : t.rowHeights), p = e.mountSource ?? (t == null ? void 0 : t.mountSource) ?? !1, b = e.mountTranslated ?? (t == null ? void 0 : t.mountTranslated) ?? !1, S = e.sourceViewOnly ?? (t == null ? void 0 : t.sourceViewOnly) ?? !1, I = e.sourceUrl ?? (t == null ? void 0 : t.sourceUrl) ?? "", y = e.translatedUrl ?? (t == null ? void 0 : t.translatedUrl) ?? "", w = e.sourceFile ?? (t == null ? void 0 : t.sourceFile) ?? null, N = e.translatedFile ?? (t == null ? void 0 : t.translatedFile) ?? null, E = e.onMetrics ?? (t == null ? void 0 : t.onMetrics), _ = e.onNumPagesChange ?? (t == null ? void 0 : t.onNumPagesChange), k = e.activeRegion ?? (t == null ? void 0 : t.activeRegion), R = e.regions ?? (t == null ? void 0 : t.regions) ?? [], T = e.readerMetadata ?? (t == null ? void 0 : t.readerMetadata), v = e.onSelectRegion ?? (t == null ? void 0 : t.onSelectRegion), M = Ti({
    mode: s,
    compareMode: l,
    showSource: c,
    showTranslated: i,
    markdownSplit: n,
    overlayOnSource: d
  }), C = Ei(
    P,
    n || r,
    typeof document > "u" ? P * 2 : document.documentElement.clientWidth
  );
  return /* @__PURE__ */ h(
    "div",
    {
      ref: u,
      className: Ua,
      "data-reader-region-count": R.length,
      "data-reader-structured-region-count": R.filter(Ir).length,
      "data-reader-metadata-ready": T ? "true" : "false",
      children: /* @__PURE__ */ D(
        "main",
        {
          className: `${ja} reader-mode-${M.mode}`,
          "data-reader-mode": n ? "markdown-split" : r ? "assistant-split" : s,
          children: [
            p ? /* @__PURE__ */ h(
              er,
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
                liveTranslation: d ? o : void 0,
                showLiveTranslation: d,
                liveTranslationPendingLabel: d ? Mi(o) : "",
                paneAction: d ? /* @__PURE__ */ D(At, { children: [
                  e.sourcePaneAction,
                  /* @__PURE__ */ h(
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
            b ? /* @__PURE__ */ h(
              er,
              {
                pane: "translated",
                url: y,
                preloadedFile: N,
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
const Ni = [
  { id: "source", label: "源文件", Icon: Er },
  { id: "compare", label: "对照", Icon: Mr },
  { id: "translated", label: "翻译文件", Icon: kr }
];
function Ai(e) {
  return e.connection === "live" ? `实时译文 · ${e.pagesByPage.size} 页` : e.connection === "reconnecting" ? "实时译文 · 重连中" : e.connection === "unavailable" ? "实时译文 · 不可用" : e.connection === "terminal" ? e.jobStatus === "failed" ? "实时译文 · 已暂停" : e.jobStatus === "cancelled" || e.jobStatus === "canceled" ? "实时译文 · 已取消" : e.jobStatus === "succeeded" ? "实时译文 · 已完成" : "实时译文 · 已结束" : e.error || "实时译文 · 连接中";
}
function xi(e) {
  return e.id === "translated" ? e.sourceViewOnly : e.id === "compare" ? !e.documentReady || e.sourceViewOnly && !e.liveTranslationAvailable : !1;
}
function Ci(e) {
  const t = pt(), {
    mode: n,
    documentReady: r,
    onModeChange: o,
    liveTranslation: a = null
  } = e, s = e.sourceViewOnly ?? (t == null ? void 0 : t.sourceViewOnly) ?? !1, l = a ? Ai(a.state) : "";
  return /* @__PURE__ */ D("header", { className: "reader-workspace-bar", children: [
    a ? /* @__PURE__ */ D(
      "button",
      {
        type: "button",
        className: `reader-live-translation-toggle is-${a.state.connection}${a.visible ? " is-active" : ""}`,
        "aria-pressed": a.visible,
        "aria-label": a.visible ? "隐藏实时译文" : "显示实时译文",
        title: a.state.error || l,
        onClick: a.onToggle,
        children: [
          /* @__PURE__ */ h(_o, { size: 14, strokeWidth: 2.2, "aria-hidden": !0 }),
          /* @__PURE__ */ h("span", { className: "reader-live-translation-toggle-label", children: l })
        ]
      }
    ) : null,
    /* @__PURE__ */ h("div", { className: "reader-workspace-tabs", role: "tablist", "aria-label": "阅读工作区", children: Ni.map(({ id: c, label: i, Icon: d }) => {
      const u = n === c, f = xi({
        id: c,
        documentReady: r,
        sourceViewOnly: s,
        liveTranslationAvailable: !!a
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
          onClick: () => o(c),
          children: [
            /* @__PURE__ */ h(d, { size: 15, strokeWidth: 2.2, "aria-hidden": !0 }),
            /* @__PURE__ */ h("span", { className: "reader-workspace-tab-label", children: i })
          ]
        },
        c
      );
    }) })
  ] });
}
const tr = [
  { id: "markdown", label: "Markdown", Icon: Nr },
  { id: "ai", label: "AI 问答", Icon: fn }
];
function Li(e) {
  const t = pt(), { active: n } = e, r = e.onSelect ?? (t == null ? void 0 : t.assistant.select) ?? (() => {
  }), o = e.onClose ?? (t == null ? void 0 : t.assistant.close) ?? (() => {
  });
  return n ? /* @__PURE__ */ D("header", { className: "reader-assistant-dock-header", children: [
    /* @__PURE__ */ h("div", { className: "reader-assistant-dock-tabs", role: "tablist", "aria-label": "阅读辅助面板", children: tr.map(({ id: a, label: s, Icon: l }) => {
      const c = n === a;
      return /* @__PURE__ */ D(
        "button",
        {
          type: "button",
          role: "tab",
          "aria-selected": c,
          className: `reader-assistant-dock-tab${c ? " is-active" : ""}`,
          onClick: () => r(a),
          children: [
            /* @__PURE__ */ h(l, { size: 15, strokeWidth: 2.15, "aria-hidden": !0 }),
            /* @__PURE__ */ h("span", { children: s })
          ]
        },
        a
      );
    }) }),
    /* @__PURE__ */ h(
      "button",
      {
        type: "button",
        className: "reader-assistant-dock-close",
        "aria-label": "关闭阅读辅助面板",
        title: "关闭辅助面板",
        onClick: o,
        children: /* @__PURE__ */ h(Xe, { size: 16, strokeWidth: 2.25, "aria-hidden": !0 })
      }
    )
  ] }) : /* @__PURE__ */ h("nav", { className: "reader-assistant-rail", "aria-label": "阅读辅助工具", children: tr.map(({ id: a, label: s, Icon: l }) => /* @__PURE__ */ D(
    "button",
    {
      type: "button",
      className: "reader-assistant-rail-button",
      "aria-label": `打开${s}`,
      title: s,
      onClick: () => r(a),
      children: [
        /* @__PURE__ */ h(l, { size: 18, strokeWidth: 2, "aria-hidden": !0 }),
        /* @__PURE__ */ h("span", { children: s === "AI 问答" ? "AI" : "MD" })
      ]
    },
    a
  )) });
}
function zi(e, t) {
  const n = getComputedStyle(e), r = parseFloat(n.fontSize);
  return t * r;
}
function Di(e, t) {
  const n = getComputedStyle(e.ownerDocument.documentElement), r = parseFloat(n.fontSize);
  return t * r;
}
function _i(e) {
  return e / 100 * window.innerHeight;
}
function Fi(e) {
  return e / 100 * window.innerWidth;
}
function Oi(e) {
  switch (typeof e) {
    case "number":
      return [e, "px"];
    case "string": {
      const t = parseFloat(e);
      return e.endsWith("%") ? [t, "%"] : e.endsWith("px") ? [t, "px"] : e.endsWith("rem") ? [t, "rem"] : e.endsWith("em") ? [t, "em"] : e.endsWith("vh") ? [t, "vh"] : e.endsWith("vw") ? [t, "vw"] : [t, "%"];
    }
  }
}
function rt({
  groupSize: e,
  panelElement: t,
  styleProp: n
}) {
  let r;
  const [o, a] = Oi(n);
  switch (a) {
    case "%": {
      r = o / 100 * e;
      break;
    }
    case "px": {
      r = o;
      break;
    }
    case "rem": {
      r = Di(t, o);
      break;
    }
    case "em": {
      r = zi(t, o);
      break;
    }
    case "vh": {
      r = _i(o);
      break;
    }
    case "vw": {
      r = Fi(o);
      break;
    }
  }
  return r;
}
function ue(e) {
  return parseFloat(e.toFixed(3));
}
function Ze({
  group: e
}) {
  const { orientation: t, panels: n } = e;
  return n.reduce((r, o) => (r += t === "horizontal" ? o.element.offsetWidth : o.element.offsetHeight, r), 0);
}
function tn(e) {
  const { panels: t } = e, n = Ze({ group: e });
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
    const { element: o, panelConstraints: a } = r;
    let s = 0;
    if (a.collapsedSize !== void 0) {
      const d = rt({
        groupSize: n,
        panelElement: o,
        styleProp: a.collapsedSize
      });
      s = ue(d / n * 100);
    }
    let l;
    if (a.defaultSize !== void 0) {
      const d = rt({
        groupSize: n,
        panelElement: o,
        styleProp: a.defaultSize
      });
      l = ue(d / n * 100);
    }
    let c = 0;
    if (a.minSize !== void 0) {
      const d = rt({
        groupSize: n,
        panelElement: o,
        styleProp: a.minSize
      });
      c = ue(d / n * 100);
    }
    let i = 100;
    if (a.maxSize !== void 0) {
      const d = rt({
        groupSize: n,
        panelElement: o,
        styleProp: a.maxSize
      });
      i = ue(d / n * 100);
    }
    return {
      groupResizeBehavior: a.groupResizeBehavior,
      collapsedSize: s,
      collapsible: a.collapsible === !0,
      defaultSize: l,
      disabled: a.disabled,
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
function nn(e, t) {
  return Array.from(t).sort(
    e === "horizontal" ? $i : ji
  );
}
function $i(e, t) {
  const n = e.element.offsetLeft - t.element.offsetLeft;
  return n !== 0 ? n : e.element.offsetWidth - t.element.offsetWidth;
}
function ji(e, t) {
  const n = e.element.offsetTop - t.element.offsetTop;
  return n !== 0 ? n : e.element.offsetHeight - t.element.offsetHeight;
}
function Vr(e) {
  return e !== null && typeof e == "object" && "nodeType" in e && e.nodeType === Node.ELEMENT_NODE;
}
function qr(e, t) {
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
function Ui({
  orientation: e,
  rects: t,
  targetRect: n
}) {
  const r = {
    x: n.x + n.width / 2,
    y: n.y + n.height / 2
  };
  let o, a = Number.MAX_VALUE;
  for (const s of t) {
    const { x: l, y: c } = qr(r, s), i = e === "horizontal" ? l : c;
    i < a && (a = i, o = s);
  }
  return Y(o, "No rect found"), o;
}
let St;
function Bi() {
  return St === void 0 && (typeof matchMedia == "function" ? St = !!matchMedia("(pointer:coarse)").matches : St = !1), St;
}
function Kr(e) {
  const { element: t, orientation: n, panels: r, separators: o } = e, a = nn(
    n,
    Array.from(t.children).filter(Vr).map((P) => ({ element: P }))
  ).map(({ element: P }) => P), s = [];
  let l = !1, c = !1, i = -1, d = -1, u = 0, f, m = [];
  {
    let P = -1;
    for (const g of a)
      g.hasAttribute("data-panel") && (P++, g.hasAttribute("data-disabled") || (u++, i === -1 && (i = P), d = P));
  }
  if (u > 1) {
    let P = -1;
    for (const g of a)
      if (g.hasAttribute("data-panel")) {
        P++;
        const p = r.find(
          (b) => b.element === g
        );
        if (p) {
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
                  const N = m[0], E = Ui({
                    orientation: n,
                    rects: [b, S],
                    targetRect: N.element.getBoundingClientRect()
                  });
                  I = [
                    N,
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
              const N = Bi() ? e.resizeTargetMinimumSize.coarse : e.resizeTargetMinimumSize.fine;
              if (w.width < N) {
                const _ = N - w.width;
                w = new DOMRect(
                  w.x - _ / 2,
                  w.y,
                  w.width + _,
                  w.height
                );
              }
              if (w.height < N) {
                const _ = N - w.height;
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
                groupSize: Ze({ group: e }),
                panels: [f, p],
                separator: "width" in y ? void 0 : y,
                rect: w
              }), l = !1;
            }
          }
          c = !1, f = p, m = [];
        }
      } else if (g.hasAttribute("data-separator")) {
        g.ariaDisabled !== null && (l = !0);
        const p = o.find(
          (b) => b.element === g
        );
        p ? m.push(p) : (f = void 0, m = []);
      } else
        c = !0;
  }
  return s;
}
var xe;
class Gr {
  constructor() {
    _n(this, xe, {});
  }
  addListener(t, n) {
    const r = Qe(this, xe)[t];
    return r === void 0 ? Qe(this, xe)[t] = [n] : r.includes(n) || r.push(n), () => {
      this.removeListener(t, n);
    };
  }
  emit(t, n) {
    const r = Qe(this, xe)[t];
    if (r !== void 0)
      if (r.length === 1)
        r[0].call(null, n);
      else {
        let o = !1, a = null;
        const s = Array.from(r);
        for (let l = 0; l < s.length; l++) {
          const c = s[l];
          try {
            c.call(null, n);
          } catch (i) {
            a === null && (o = !0, a = i);
          }
        }
        if (o)
          throw a;
      }
  }
  removeAllListeners() {
    Fn(this, xe, {});
  }
  removeListener(t, n) {
    const r = Qe(this, xe)[t];
    if (r !== void 0) {
      const o = r.indexOf(n);
      o >= 0 && r.splice(o, 1);
    }
  }
}
xe = new WeakMap();
let qe = {
  cursorFlags: 0,
  state: "inactive"
};
const wn = new Gr();
function De() {
  return qe;
}
function Hi(e) {
  return wn.addListener("change", e);
}
function Wi(e) {
  const t = qe, n = { ...qe };
  n.cursorFlags = e, qe = n, wn.emit("change", {
    prev: t,
    next: n
  });
}
function Ke(e) {
  const t = qe;
  qe = e, wn.emit("change", {
    prev: t,
    next: e
  });
}
const Ji = (e) => e, Ht = () => {
}, Yr = 1, Zr = 2, Xr = 4, Qr = 8, nr = 3, rr = 12;
let Pt;
function or() {
  return Pt === void 0 && (Pt = !1, typeof window < "u" && (window.navigator.userAgent.includes("Chrome") || window.navigator.userAgent.includes("Firefox")) && (Pt = !0)), Pt;
}
function Vi({
  cursorFlags: e,
  groups: t,
  state: n
}) {
  let r = 0, o = 0;
  switch (n) {
    case "active":
    case "hover":
      t.forEach((a) => {
        if (!a.mutableState.disableCursor)
          switch (a.orientation) {
            case "horizontal": {
              r++;
              break;
            }
            case "vertical": {
              o++;
              break;
            }
          }
      });
  }
  if (!(r === 0 && o === 0)) {
    switch (n) {
      case "active": {
        if (e && or()) {
          const a = (e & Yr) !== 0, s = (e & Zr) !== 0, l = (e & Xr) !== 0, c = (e & Qr) !== 0;
          if (a)
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
    return or() ? r > 0 && o > 0 ? "move" : r > 0 ? "ew-resize" : "ns-resize" : r > 0 && o > 0 ? "grab" : r > 0 ? "col-resize" : "row-resize";
  }
}
const ar = /* @__PURE__ */ new WeakMap();
function Sn(e) {
  if (e.defaultView === null || e.defaultView === void 0)
    return;
  let { prevStyle: t, styleSheet: n } = ar.get(e) ?? {};
  n === void 0 && (n = new e.defaultView.CSSStyleSheet(), e.adoptedStyleSheets && (Object.isExtensible(e.adoptedStyleSheets) ? e.adoptedStyleSheets.push(n) : e.adoptedStyleSheets = [
    ...e.adoptedStyleSheets,
    n
  ]));
  const r = De();
  switch (r.state) {
    case "active":
    case "hover": {
      const o = Vi({
        cursorFlags: r.cursorFlags,
        groups: r.hitRegions.map((s) => s.group),
        state: r.state
      }), a = `*, *:hover {cursor: ${o} !important; }`;
      if (t === a)
        return;
      t = a, o ? n.cssRules.length === 0 ? n.insertRule(a) : n.replaceSync(a) : n.cssRules.length === 1 && n.deleteRule(0);
      break;
    }
    case "inactive": {
      t = void 0, n.cssRules.length === 1 && n.deleteRule(0);
      break;
    }
  }
  ar.set(e, {
    prevStyle: t,
    styleSheet: n
  });
}
let Se = /* @__PURE__ */ new Map();
const eo = new Gr();
function qi(e) {
  Se = new Map(Se), Se.delete(e);
}
function sr(e, t) {
  for (const [n] of Se)
    if (n.id === e)
      return n;
}
function Ce(e, t) {
  for (const [n, r] of Se)
    if (n.id === e)
      return r;
  if (t)
    throw Error(`Could not find data for Group with id ${e}`);
}
function $e() {
  return Se;
}
function Pn(e, t) {
  return eo.addListener("groupChange", (n) => {
    n.group.id === e && t(n);
  });
}
function Me(e, t, n) {
  const r = Se.get(e);
  Se = new Map(Se), Se.set(e, t), eo.emit("groupChange", {
    group: e,
    isUserInteraction: (n == null ? void 0 : n.isUserInteraction) === !0,
    prev: r,
    next: t
  });
}
function to(e) {
  const t = De();
  let n = !1;
  switch (t.state) {
    case "active":
      Ke({
        cursorFlags: 0,
        state: "inactive"
      }), t.hitRegions.length > 0 && (Sn(e), n = !0, t.hitRegions.forEach((r) => {
        const o = Ce(r.group.id, !0);
        Me(r.group, o, {
          isUserInteraction: !0
        });
      }));
  }
  return n;
}
function ir(e) {
  e.defaultPrevented || to(e.currentTarget);
}
function Ki(e, t, n) {
  let r, o = {
    x: 1 / 0,
    y: 1 / 0
  };
  for (const a of t) {
    const s = qr(n, a.rect);
    switch (e) {
      case "horizontal": {
        s.x <= o.x && (r = a, o = s);
        break;
      }
      case "vertical": {
        s.y <= o.y && (r = a, o = s);
        break;
      }
    }
  }
  return r ? {
    distance: o,
    hitRegion: r
  } : void 0;
}
function Gi(e) {
  return e !== null && typeof e == "object" && "nodeType" in e && e.nodeType === Node.DOCUMENT_FRAGMENT_NODE;
}
function Yi(e, t) {
  if (e === t) throw new Error("Cannot compare node with itself");
  const n = {
    a: dr(e),
    b: dr(t)
  };
  let r;
  for (; n.a.at(-1) === n.b.at(-1); )
    r = n.a.pop(), n.b.pop();
  Y(
    r,
    "Stacking order can only be calculated for elements with a common ancestor"
  );
  const o = {
    a: lr(cr(n.a)),
    b: lr(cr(n.b))
  };
  if (o.a === o.b) {
    const a = r.childNodes, s = {
      a: n.a.at(-1),
      b: n.b.at(-1)
    };
    let l = a.length;
    for (; l--; ) {
      const c = a[l];
      if (c === s.a) return 1;
      if (c === s.b) return -1;
    }
  }
  return Math.sign(o.a - o.b);
}
const Zi = /\b(?:position|zIndex|opacity|transform|webkitTransform|mixBlendMode|filter|webkitFilter|isolation)\b/;
function Xi(e) {
  const t = getComputedStyle(no(e) ?? e).display;
  return t === "flex" || t === "inline-flex";
}
function Qi(e) {
  const t = getComputedStyle(e);
  return !!(t.position === "fixed" || t.zIndex !== "auto" && (t.position !== "static" || Xi(e)) || +t.opacity < 1 || "transform" in t && t.transform !== "none" || "webkitTransform" in t && t.webkitTransform !== "none" || "mixBlendMode" in t && t.mixBlendMode !== "normal" || "filter" in t && t.filter !== "none" || "webkitFilter" in t && t.webkitFilter !== "none" || "isolation" in t && t.isolation === "isolate" || Zi.test(t.willChange) || t.webkitOverflowScrolling === "touch");
}
function cr(e) {
  let t = e.length;
  for (; t--; ) {
    const n = e[t];
    if (Y(n, "Missing node"), Qi(n)) return n;
  }
  return null;
}
function lr(e) {
  return e && Number(getComputedStyle(e).zIndex) || 0;
}
function dr(e) {
  const t = [];
  for (; e; )
    t.push(e), e = no(e);
  return t;
}
function no(e) {
  const { parentNode: t } = e;
  return Gi(t) ? t.host : t;
}
function ec(e, t) {
  return e.x < t.x + t.width && e.x + e.width > t.x && e.y < t.y + t.height && e.y + e.height > t.y;
}
function tc({
  groupElement: e,
  hitRegion: t,
  pointerEventTarget: n
}) {
  if (!Vr(n) || n.contains(e) || e.contains(n))
    return !0;
  if (Yi(n, e) > 0) {
    let r = n;
    for (; r; ) {
      if (r.contains(e))
        return !0;
      if (ec(r.getBoundingClientRect(), t))
        return !1;
      r = r.parentElement;
    }
  }
  return !0;
}
function In(e, t) {
  const n = [];
  return t.forEach((r, o) => {
    if (o.disabled)
      return;
    const a = Kr(o), s = Ki(o.orientation, a, {
      x: e.clientX,
      y: e.clientY
    });
    s && s.distance.x <= 0 && s.distance.y <= 0 && tc({
      groupElement: o.element,
      hitRegion: s.hitRegion.rect,
      pointerEventTarget: e.target
    }) && n.push(s.hitRegion);
  }), n;
}
function nc(e, t) {
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
function Je({
  overrideDisabledPanels: e,
  panelConstraints: t,
  prevSize: n,
  size: r
}) {
  const {
    collapsedSize: o = 0,
    collapsible: a,
    disabled: s,
    maxSize: l = 100,
    minSize: c = 0
  } = t;
  if (s && !e)
    return n;
  if (we(r, c) < 0)
    if (a) {
      const i = (o + c) / 2;
      we(r, i) < 0 ? r = o : r = c;
    } else
      r = c;
  return r = Math.min(l, r), r = ue(r), r;
}
function ut({
  delta: e,
  initialLayout: t,
  panelConstraints: n,
  pivotIndices: r,
  prevLayout: o,
  trigger: a
}) {
  if (de(e, 0))
    return t;
  const s = a === "imperative-api", l = Object.values(t), c = Object.values(o), i = [...l], [d, u] = r;
  Y(d != null, "Invalid first pivot index"), Y(u != null, "Invalid second pivot index");
  let f = 0;
  switch (a) {
    case "keyboard": {
      {
        const g = e < 0 ? u : d, p = n[g];
        Y(
          p,
          `Panel constraints not found for index ${g}`
        );
        const {
          collapsedSize: b = 0,
          collapsible: S,
          minSize: I = 0
        } = p;
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
        const g = e < 0 ? d : u, p = n[g];
        Y(
          p,
          `No panel constraints found for index ${g}`
        );
        const {
          collapsedSize: b = 0,
          collapsible: S,
          minSize: I = 0
        } = p;
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
      const g = e < 0 ? u : d, p = n[g];
      Y(
        p,
        `Panel constraints not found for index ${g}`
      );
      const b = l[g], { collapsible: S, collapsedSize: I, minSize: y } = p;
      if (S && we(b, y) < 0)
        if (e > 0) {
          const w = y - I, N = w / 2, E = b + e;
          we(E, y) < 0 && (e = we(e, N) <= 0 ? 0 : w);
        } else {
          const w = y - I, N = 100 - w / 2, E = b - e;
          we(E, y) < 0 && (e = we(100 + e, N) > 0 ? 0 : -w);
        }
      break;
    }
  }
  {
    const g = e < 0 ? 1 : -1;
    let p = e < 0 ? u : d, b = 0;
    for (; ; ) {
      const I = l[p];
      Y(
        I != null,
        `Previous layout not found for panel index ${p}`
      );
      const y = Je({
        overrideDisabledPanels: s,
        panelConstraints: n[p],
        prevSize: I,
        size: 100
      }) - I;
      if (b += y, p += g, p < 0 || p >= n.length)
        break;
    }
    const S = Math.min(Math.abs(e), Math.abs(b));
    e = e < 0 ? 0 - S : S;
  }
  {
    let g = e < 0 ? d : u;
    for (; g >= 0 && g < n.length; ) {
      const p = Math.abs(e) - Math.abs(f), b = l[g];
      Y(
        b != null,
        `Previous layout not found for panel index ${g}`
      );
      const S = b - p, I = Je({
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
  if (nc(c, i))
    return o;
  {
    const g = e < 0 ? u : d, p = l[g];
    Y(
      p != null,
      `Previous layout not found for panel index ${g}`
    );
    const b = p + f, S = Je({
      overrideDisabledPanels: s,
      panelConstraints: n[g],
      prevSize: p,
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
        const N = w + I, E = Je({
          overrideDisabledPanels: s,
          panelConstraints: n[y],
          prevSize: w,
          size: N
        });
        if (de(w, E) || (I -= E - w, i[y] = E), de(I, 0))
          break;
        e > 0 ? y-- : y++;
      }
    }
  }
  const m = Object.values(i).reduce(
    (g, p) => p + g,
    0
  );
  if (!de(m, 100, 0.1))
    return o;
  const P = Object.keys(o);
  return i.reduce((g, p, b) => (g[P[b]] = p, g), {});
}
function _e(e, t) {
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
  const n = Object.values(e), r = [...n], o = r.reduce(
    (l, c) => l + c,
    0
  );
  if (r.length !== t.length)
    throw Error(
      `Invalid ${t.length} panel layout: ${r.map((l) => `${l}%`).join(", ")}`
    );
  if (!de(o, 100) && r.length > 0)
    for (let l = 0; l < t.length; l++) {
      const c = r[l];
      Y(c != null, `No layout data found for index ${l}`);
      const i = 100 / o * c;
      r[l] = i;
    }
  let a = 0;
  for (let l = 0; l < t.length; l++) {
    const c = n[l];
    Y(c != null, `No layout data found for index ${l}`);
    const i = r[l];
    Y(i != null, `No layout data found for index ${l}`);
    const d = Je({
      overrideDisabledPanels: !0,
      panelConstraints: t[l],
      prevSize: c,
      size: i
    });
    i != d && (a += i - d, r[l] = d);
  }
  if (!de(a, 0))
    for (let l = 0; l < t.length; l++) {
      const c = r[l];
      Y(c != null, `No layout data found for index ${l}`);
      const i = c + a, d = Je({
        overrideDisabledPanels: !0,
        panelConstraints: t[l],
        prevSize: c,
        size: i
      });
      if (c !== d && (a -= d - c, r[l] = d, de(a, 0)))
        break;
    }
  const s = Object.keys(e);
  return r.reduce((l, c, i) => (l[s[i]] = c, l), {});
}
function ro({
  groupId: e,
  panelId: t
}) {
  const n = () => {
    const c = $e();
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
  }, o = () => {
    const c = n().group.panels.find((i) => i.id === t);
    if (c !== void 0)
      return c;
    throw Error(`Layout not found for Panel ${t}`);
  }, a = () => {
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
    const f = a(), m = i.findIndex((p) => p.id === t), P = m === 0, g = m === i.length - 1;
    if (g && c < f && (P || i.slice(0, m).every((p, b) => {
      const S = u[b];
      return (S == null ? void 0 : S.collapsible) && de(S.collapsedSize, d[S.panelId]);
    }))) {
      const p = i.slice(0, m).reduce((b, S) => b + d[S.id], 0);
      return {
        ...d,
        [t]: ue(100 - p)
      };
    }
    return ut({
      delta: g ? f - c : c - f,
      initialLayout: d,
      panelConstraints: u,
      pivotIndices: g ? [m - 1, m] : [m, m + 1],
      prevLayout: d,
      trigger: "imperative-api"
    });
  }, l = (c) => {
    const i = a();
    if (c === i)
      return;
    const {
      defaultLayoutDeferred: d,
      derivedPanelConstraints: u,
      group: f,
      groupSize: m,
      layout: P,
      separatorToPanels: g
    } = n(), p = s({
      nextSize: c,
      panels: f.panels,
      prevLayout: P,
      derivedPanelConstraints: u
    }), b = Fe({
      layout: p,
      panelConstraints: u
    });
    _e(P, b) || Me(f, {
      defaultLayoutDeferred: d,
      derivedPanelConstraints: u,
      groupSize: m,
      layout: b,
      separatorToPanels: g
    });
  };
  return {
    collapse: () => {
      const { collapsible: c, collapsedSize: i } = r(), { mutableValues: d } = o(), u = a();
      c && u !== i && (d.expandToSize = u, l(i));
    },
    expand: () => {
      const { collapsible: c, collapsedSize: i, minSize: d } = r(), { mutableValues: u } = o(), f = a();
      if (c && f === i) {
        let m = u.expandToSize ?? d;
        m === 0 && (m = 1), l(m);
      }
    },
    getSize: () => {
      const { group: c } = n(), i = a(), { element: d } = o(), u = c.orientation === "horizontal" ? d.offsetWidth : d.offsetHeight;
      return {
        asPercentage: i,
        inPixels: u
      };
    },
    isCollapsed: () => {
      const { collapsible: c, collapsedSize: i } = r(), d = a();
      return c && de(i, d);
    },
    resize: (c) => {
      const { group: i } = n(), { element: d } = o(), u = Ze({ group: i }), f = rt({
        groupSize: u,
        panelElement: d,
        styleProp: c
      }), m = ue(f / u * 100);
      l(m);
    }
  };
}
function ur(e) {
  if (e.defaultPrevented)
    return;
  const t = $e();
  In(e, t).forEach((n) => {
    if (n.separator && !n.separator.disableDoubleClick) {
      const r = n.panels.find(
        (o) => o.panelConstraints.defaultSize !== void 0
      );
      if (r) {
        const o = r.panelConstraints.defaultSize, a = ro({
          groupId: n.group.id,
          panelId: r.id
        });
        a && o !== void 0 && (a.resize(o), e.preventDefault());
      }
    }
  });
}
function Rt(e) {
  const t = $e();
  for (const [n] of t)
    if (n.separators.some(
      (r) => r.element === e
    ))
      return n;
  throw Error("Could not find parent Group for separator element");
}
function oo({
  groupId: e
}) {
  const t = () => {
    const n = $e();
    for (const [r, o] of n)
      if (r.id === e)
        return { group: r, ...o };
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
        derivedPanelConstraints: o,
        group: a,
        groupSize: s,
        layout: l,
        separatorToPanels: c
      } = t(), i = Fe({
        layout: n,
        panelConstraints: o
      });
      return r ? l : (_e(l, i) || Me(a, {
        defaultLayoutDeferred: r,
        derivedPanelConstraints: o,
        groupSize: s,
        layout: i,
        separatorToPanels: c
      }), i);
    }
  };
}
function ze(e, t) {
  const n = Rt(e), r = Ce(n.id, !0), o = n.separators.find(
    (d) => d.element === e
  );
  Y(o, "Matching separator not found");
  const a = r.separatorToPanels.get(o);
  Y(a, "Matching panels not found");
  const s = a.map((d) => n.panels.indexOf(d)), l = oo({ groupId: n.id }).getLayout(), c = ut({
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
  _e(l, i) || Me(
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
function fr(e) {
  if (e.defaultPrevented)
    return;
  const t = e.currentTarget, n = Rt(t);
  if (!n.disabled)
    switch (e.key) {
      case "ArrowDown": {
        e.preventDefault(), n.orientation === "vertical" && ze(t, 5);
        break;
      }
      case "ArrowLeft": {
        e.preventDefault(), n.orientation === "horizontal" && ze(t, -5);
        break;
      }
      case "ArrowRight": {
        e.preventDefault(), n.orientation === "horizontal" && ze(t, 5);
        break;
      }
      case "ArrowUp": {
        e.preventDefault(), n.orientation === "vertical" && ze(t, -5);
        break;
      }
      case "End": {
        e.preventDefault(), ze(t, 100);
        break;
      }
      case "Enter": {
        e.preventDefault();
        const r = Rt(t), o = Ce(r.id, !0), { derivedPanelConstraints: a, layout: s, separatorToPanels: l } = o, c = r.separators.find(
          (f) => f.element === t
        );
        Y(c, "Matching separator not found");
        const i = l.get(c);
        Y(i, "Matching panels not found");
        const d = i[0], u = a.find(
          (f) => f.panelId === d.id
        );
        if (Y(u, "Panel metadata not found"), u.collapsible) {
          const f = s[d.id], m = u.collapsedSize === f ? r.mutableState.expandedPanelSizes[d.id] ?? u.minSize : u.collapsedSize;
          ze(t, m - f);
        }
        break;
      }
      case "F6": {
        e.preventDefault();
        const r = Rt(t).separators.map(
          (s) => s.element
        ), o = Array.from(r).findIndex(
          (s) => s === e.currentTarget
        );
        Y(o !== null, "Index not found");
        const a = e.shiftKey ? o > 0 ? o - 1 : r.length - 1 : o + 1 < r.length ? o + 1 : 0;
        r[a].focus({
          preventScroll: !0
        });
        break;
      }
      case "Home": {
        e.preventDefault(), ze(t, -100);
        break;
      }
    }
}
function mr(e) {
  if (e.defaultPrevented || e.pointerType === "mouse" && e.button > 0)
    return;
  const t = $e(), n = In(e, t), r = /* @__PURE__ */ new Map();
  let o = !1;
  n.forEach((a) => {
    a.separator && (o || (o = !0, a.separator.element.focus({
      // @ts-expect-error https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/focus#browser_compatibility
      focusVisible: !1,
      preventScroll: !0
    })));
    const s = t.get(a.group);
    s && r.set(a.group, s.layout);
  }), Ke({
    cursorFlags: 0,
    hitRegions: n,
    initialLayoutMap: r,
    pointerDownAtPoint: { x: e.clientX, y: e.clientY },
    state: "active"
  }), n.length && e.preventDefault();
}
function ao({
  document: e,
  event: t,
  hitRegions: n,
  initialLayoutMap: r,
  mountedGroups: o,
  pointerDownAtPoint: a,
  prevCursorFlags: s
}) {
  let l = 0;
  n.forEach((i) => {
    const { group: d, groupSize: u } = i, { orientation: f, panels: m } = d, { disableCursor: P } = d.mutableState;
    let g = 0;
    a ? f === "horizontal" ? g = (t.clientX - a.x) / u * 100 : g = (t.clientY - a.y) / u * 100 : f === "horizontal" ? g = t.clientX < 0 ? -100 : 100 : g = t.clientY < 0 ? -100 : 100;
    const p = r.get(d), b = o.get(d);
    if (!p || !b)
      return;
    const {
      defaultLayoutDeferred: S,
      derivedPanelConstraints: I,
      groupSize: y,
      layout: w,
      separatorToPanels: N
    } = b;
    if (I && w && N) {
      const E = ut({
        delta: g,
        initialLayout: p,
        panelConstraints: I,
        pivotIndices: i.panels.map((_) => m.indexOf(_)),
        prevLayout: w,
        trigger: "mouse-or-touch"
      });
      if (_e(E, w)) {
        if (g !== 0 && !P)
          switch (f) {
            case "horizontal": {
              l |= g < 0 ? Yr : Zr;
              break;
            }
            case "vertical": {
              l |= g < 0 ? Xr : Qr;
              break;
            }
          }
      } else
        Me(i.group, {
          defaultLayoutDeferred: S,
          derivedPanelConstraints: I,
          groupSize: y,
          layout: E,
          separatorToPanels: N
        });
    }
  });
  let c = 0;
  t.movementX === 0 ? c |= s & nr : c |= l & nr, t.movementY === 0 ? c |= s & rr : c |= l & rr, Wi(c), Sn(e);
}
function hr(e) {
  const t = $e(), n = De();
  switch (n.state) {
    case "active":
      ao({
        document: e.currentTarget,
        event: e,
        hitRegions: n.hitRegions,
        initialLayoutMap: n.initialLayoutMap,
        mountedGroups: t,
        prevCursorFlags: n.cursorFlags
      });
  }
}
function pr(e) {
  var r, o;
  if (e.defaultPrevented)
    return;
  const t = De(), n = $e();
  switch (t.state) {
    case "active": {
      if (
        // Skip this check for "pointerleave" events, else Firefox triggers a false positive (see #514)
        e.buttons === 0
      ) {
        Ke({
          cursorFlags: 0,
          state: "inactive"
        }), t.hitRegions.forEach((a) => {
          const s = Ce(a.group.id, !0);
          Me(a.group, s, {
            isUserInteraction: !0
          });
        });
        return;
      }
      for (const a of t.hitRegions)
        if (a.separator) {
          const { element: s } = a.separator;
          (r = s.hasPointerCapture) != null && r.call(s, e.pointerId) || ((o = s.setPointerCapture) == null || o.call(s, e.pointerId));
        }
      ao({
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
      const a = In(e, n);
      a.length === 0 ? t.state !== "inactive" && Ke({
        cursorFlags: 0,
        state: "inactive"
      }) : Ke({
        cursorFlags: 0,
        hitRegions: a,
        state: "hover"
      }), Sn(e.currentTarget);
      break;
    }
  }
}
function gr(e) {
  if (e.relatedTarget instanceof HTMLIFrameElement)
    switch (De().state) {
      case "hover":
        Ke({
          cursorFlags: 0,
          state: "inactive"
        });
    }
}
function br(e) {
  e.defaultPrevented || e.pointerType === "mouse" && e.button > 0 || to(e.currentTarget) && e.preventDefault();
}
function yr(e) {
  let t = 0, n = 0;
  const r = {};
  for (const a of e)
    if (a.defaultSize !== void 0) {
      t++;
      const s = ue(a.defaultSize);
      n += s, r[a.panelId] = s;
    } else
      r[a.panelId] = void 0;
  const o = e.length - t;
  if (o !== 0) {
    const a = ue((100 - n) / o);
    for (const s of e)
      s.defaultSize === void 0 && (r[s.panelId] = a);
  }
  return r;
}
function rc(e, t, n) {
  if (!n[0])
    return;
  const r = e.panels.find((c) => c.element === t);
  if (!r || !r.onResize)
    return;
  const o = Ze({ group: e }), a = e.orientation === "horizontal" ? r.element.offsetWidth : r.element.offsetHeight, s = r.mutableValues.prevSize, l = {
    asPercentage: ue(a / o * 100),
    inPixels: a
  };
  r.mutableValues.prevSize = l, r.onResize(l, r.id, s);
}
function oc(e, t) {
  if (Object.keys(e).length !== Object.keys(t).length)
    return !1;
  for (const n in e)
    if (e[n] !== t[n])
      return !1;
  return !0;
}
function ac({
  group: e,
  nextGroupSize: t,
  prevGroupSize: n,
  prevLayout: r
}) {
  if (n <= 0 || t <= 0 || n === t)
    return r;
  let o = 0, a = 0, s = !1;
  const l = /* @__PURE__ */ new Map(), c = [];
  for (const u of e.panels) {
    const f = r[u.id] ?? 0;
    switch (u.panelConstraints.groupResizeBehavior) {
      case "preserve-pixel-size": {
        s = !0;
        const m = f / 100 * n, P = ue(
          m / t * 100
        );
        l.set(u.id, P), o += P;
        break;
      }
      case "preserve-relative-size":
      default: {
        c.push(u.id), a += f;
        break;
      }
    }
  }
  if (!s || c.length === 0)
    return r;
  const i = 100 - o, d = { ...r };
  if (l.forEach((u, f) => {
    d[f] = u;
  }), a > 0)
    for (const u of c) {
      const f = r[u] ?? 0;
      d[u] = ue(
        f / a * i
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
function sc(e, t) {
  const n = e.map((o) => o.id), r = Object.keys(t);
  if (n.length !== r.length)
    return !1;
  for (const o of n)
    if (!r.includes(o))
      return !1;
  return !0;
}
const Be = /* @__PURE__ */ new Map();
function ic(e) {
  let t = !0;
  Y(
    e.element.ownerDocument.defaultView,
    "Cannot register an unmounted Group"
  );
  const n = e.element.ownerDocument.defaultView.ResizeObserver, r = /* @__PURE__ */ new Set(), o = /* @__PURE__ */ new Set(), a = new n((P) => {
    for (const g of P) {
      const { borderBoxSize: p, target: b } = g;
      if (b === e.element) {
        if (t) {
          const S = Ze({ group: e });
          if (S === 0)
            return;
          const I = Ce(e.id);
          if (!I)
            return;
          const y = tn(e), w = I.defaultLayoutDeferred ? yr(y) : I.layout, N = ac({
            group: e,
            nextGroupSize: S,
            prevGroupSize: I.groupSize,
            prevLayout: w
          }), E = Fe({
            layout: N,
            panelConstraints: y
          });
          if (!I.defaultLayoutDeferred && _e(I.layout, E) && oc(
            I.derivedPanelConstraints,
            y
          ) && I.groupSize === S)
            return;
          Me(e, {
            defaultLayoutDeferred: !1,
            derivedPanelConstraints: y,
            groupSize: S,
            layout: E,
            separatorToPanels: I.separatorToPanels
          });
        }
      } else
        rc(e, b, p);
    }
  });
  a.observe(e.element), e.panels.forEach((P) => {
    Y(
      !r.has(P.id),
      `Panel ids must be unique; id "${P.id}" was used more than once`
    ), r.add(P.id), P.onResize && a.observe(P.element);
  });
  const s = Ze({ group: e }), l = tn(e), c = e.panels.map(({ id: P }) => P).join(",");
  let i = e.mutableState.defaultLayout;
  i && (sc(e.panels, i) || (i = void 0));
  const d = e.mutableState.layouts[c] ?? i ?? yr(l), u = Fe({
    layout: d,
    panelConstraints: l
  }), f = e.element.ownerDocument;
  Be.set(
    f,
    (Be.get(f) ?? 0) + 1
  );
  const m = /* @__PURE__ */ new Map();
  return Kr(e).forEach((P) => {
    P.separator && m.set(P.separator, P.panels);
  }), Me(e, {
    defaultLayoutDeferred: s === 0,
    derivedPanelConstraints: l,
    groupSize: s,
    layout: u,
    separatorToPanels: m
  }), e.separators.forEach((P) => {
    Y(
      !o.has(P.id),
      `Separator ids must be unique; id "${P.id}" was used more than once`
    ), o.add(P.id), P.element.addEventListener("keydown", fr);
  }), Be.get(f) === 1 && (f.addEventListener("contextmenu", ir, !0), f.addEventListener("dblclick", ur, !0), f.addEventListener("pointerdown", mr, !0), f.addEventListener("pointerleave", hr), f.addEventListener("pointermove", pr), f.addEventListener("pointerout", gr), f.addEventListener("pointerup", br, !0)), function() {
    t = !1, Be.set(
      f,
      Math.max(0, (Be.get(f) ?? 0) - 1)
    ), qi(e), e.separators.forEach((P) => {
      P.element.removeEventListener("keydown", fr);
    }), Be.get(f) || (f.removeEventListener(
      "contextmenu",
      ir,
      !0
    ), f.removeEventListener(
      "dblclick",
      ur,
      !0
    ), f.removeEventListener(
      "pointerdown",
      mr,
      !0
    ), f.removeEventListener("pointerleave", hr), f.removeEventListener("pointermove", pr), f.removeEventListener("pointerout", gr), f.removeEventListener("pointerup", br, !0)), a.disconnect();
  };
}
function cc() {
  const [e, t] = L({}), n = x(() => t({}), []);
  return [e, n];
}
function Rn(e) {
  const t = dn();
  return `${e ?? t}`;
}
const je = typeof window < "u" ? Oe : $;
function at(e) {
  const t = A(e);
  return je(() => {
    t.current = e;
  }, [e]), x(
    (...n) => {
      var r;
      return (r = t.current) == null ? void 0 : r.call(t, ...n);
    },
    [t]
  );
}
function Tn(...e) {
  return at((t) => {
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
function En(e) {
  const t = A({ ...e });
  return je(() => {
    for (const n in e)
      t.current[n] = e[n];
  }, [e]), t.current;
}
const so = cn(null);
function lc(e, t) {
  const n = A({
    getLayout: () => ({}),
    setLayout: Ji
  });
  sn(t, () => n.current, []), je(() => {
    Object.assign(
      n.current,
      oo({ groupId: e })
    );
  });
}
function io({
  children: e,
  className: t,
  defaultLayout: n,
  disableCursor: r,
  disabled: o,
  elementRef: a,
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
  const P = A({
    onLayoutChange: {},
    onLayoutChanged: {}
  }), g = at((T) => {
    _e(P.current.onLayoutChange, T) || (P.current.onLayoutChange = T, c == null || c(T));
  }), p = at(
    (T, v) => {
      _e(P.current.onLayoutChanged, T) || (P.current.onLayoutChanged = T, i == null || i(T, { isUserInteraction: v }));
    }
  ), b = Rn(l), S = A(null), [I, y] = cc(), w = A({
    lastExpandedPanelSizes: {},
    layouts: {},
    panels: [],
    resizeTargetMinimumSize: u,
    separators: []
  }), N = Tn(S, a);
  lc(b, s);
  const E = at(
    (T, v) => {
      const M = De(), C = sr(T), z = Ce(T);
      if (z) {
        let F = !1;
        switch (M.state) {
          case "active": {
            F = M.hitRegions.some(
              (B) => B.group === C
            );
            break;
          }
        }
        return {
          flexGrow: z.layout[v] ?? 1,
          pointerEvents: F ? "none" : void 0
        };
      }
      if (n != null && n[v])
        return {
          flexGrow: n == null ? void 0 : n[v]
        };
    }
  ), _ = En({
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
        return v.panels = nn(d, [
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
        return v.separators = nn(d, [
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
          (F) => F.id === T
        );
        M && (M.panelConstraints.disabled = v);
        const C = sr(b), z = Ce(b);
        C && z && Me(C, {
          ...z,
          derivedPanelConstraints: tn(C)
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
  ), R = A(null);
  return je(() => {
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
      disabled: !!o,
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
    const z = ic(C), { defaultLayoutDeferred: F, derivedPanelConstraints: B, layout: ee } = Ce(C.id, !0);
    !F && B.length > 0 && (g(ee), p(ee, !1));
    const X = Pn(b, (oe) => {
      const { defaultLayoutDeferred: re, derivedPanelConstraints: ie, layout: U } = oe.next;
      if (re || ie.length === 0)
        return;
      const K = C.panels.map(({ id: Q }) => Q).join(",");
      C.mutableState.layouts[K] = U, ie.forEach((Q) => {
        if (Q.collapsible) {
          const { layout: le } = oe.prev ?? {};
          if (le) {
            const he = de(
              Q.collapsedSize,
              U[Q.panelId]
            ), me = de(
              Q.collapsedSize,
              le[Q.panelId]
            );
            he && !me && (C.mutableState.expandedPanelSizes[Q.panelId] = le[Q.panelId]);
          }
        }
      });
      const Z = De().state !== "active";
      g(U), Z && p(U, oe.isUserInteraction);
    });
    return () => {
      R.current = null, z(), X();
    };
  }, [
    o,
    b,
    p,
    g,
    d,
    I,
    _
  ]), $(() => {
    const T = R.current;
    T && (T.mutableState.defaultLayout = n, T.mutableState.disableCursor = !!r);
  }), /* @__PURE__ */ h(so.Provider, { value: k, children: /* @__PURE__ */ h(
    "div",
    {
      ...m,
      className: t,
      "data-group": !0,
      "data-testid": b,
      id: b,
      ref: N,
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
io.displayName = "Group";
function Mn() {
  const e = ln(so);
  return Y(
    e,
    "Group Context not found; did you render a Panel or Separator outside of a Group?"
  ), e;
}
function dc(e, t) {
  const { id: n } = Mn(), r = A({
    collapse: Ht,
    expand: Ht,
    getSize: () => ({
      asPercentage: 0,
      inPixels: 0
    }),
    isCollapsed: () => !1,
    resize: Ht
  });
  sn(t, () => r.current, []), je(() => {
    Object.assign(
      r.current,
      ro({ groupId: n, panelId: e })
    );
  });
}
function rn({
  children: e,
  className: t,
  collapsedSize: n = "0%",
  collapsible: r = !1,
  defaultSize: o,
  disabled: a,
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
  const g = !!c, p = Rn(c), b = En({
    disabled: a
  }), S = A(null), I = Tn(S, s), {
    getPanelStyles: y,
    id: w,
    orientation: N,
    registerPanel: E,
    updatePanelProps: _
  } = Mn(), k = u !== null, R = at(
    (C, z, F) => {
      u == null || u(C, c, F);
    }
  );
  je(() => {
    const C = S.current;
    if (C !== null) {
      const z = {
        element: C,
        id: p,
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
          defaultSize: o,
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
    o,
    k,
    p,
    g,
    i,
    d,
    R,
    E,
    b
  ]), $(() => {
    _(p, { disabled: a });
  }, [a, p, _]), dc(p, f);
  const T = () => {
    const C = y(w, p);
    if (C)
      return JSON.stringify(C);
  }, v = po(
    (C) => Pn(w, C),
    T,
    T
  );
  let M;
  return v ? M = JSON.parse(v) : o !== void 0 ? M = {
    flexGrow: void 0,
    flexShrink: void 0,
    flexBasis: o
  } : M = { flexGrow: 1 }, /* @__PURE__ */ h(
    "div",
    {
      ...P,
      "data-disabled": a || void 0,
      "data-panel": !0,
      "data-testid": p,
      id: p,
      ref: I,
      style: {
        ...uc,
        display: "flex",
        flexBasis: 0,
        flexShrink: 1,
        overflow: "visible",
        ...M
      },
      children: /* @__PURE__ */ h(
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
            touchAction: N === "horizontal" ? "pan-y" : "pan-x"
          },
          children: e
        }
      )
    }
  );
}
rn.displayName = "Panel";
const uc = {
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
function fc({
  layout: e,
  panelConstraints: t,
  panelId: n,
  panelIndex: r
}) {
  let o, a;
  const s = e[n], l = t.find(
    (c) => c.panelId === n
  );
  if (l) {
    const c = l.maxSize, i = l.collapsible ? l.collapsedSize : l.minSize, d = [r, r + 1];
    a = Fe({
      layout: ut({
        delta: i - s,
        initialLayout: e,
        panelConstraints: t,
        pivotIndices: d,
        prevLayout: e
      }),
      panelConstraints: t
    })[n], o = Fe({
      layout: ut({
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
    valueMax: o,
    valueMin: a,
    valueNow: s
  };
}
function co({
  children: e,
  className: t,
  disabled: n,
  disableDoubleClick: r,
  elementRef: o,
  id: a,
  style: s,
  ...l
}) {
  const c = Rn(a), i = En({
    disabled: n,
    disableDoubleClick: r
  }), [d, u] = L({}), [f, m] = L("inactive"), [P, g] = L(!1), p = A(null), b = Tn(p, o), {
    disableCursor: S,
    id: I,
    orientation: y,
    registerSeparator: w,
    updateSeparatorProps: N
  } = Mn(), E = y === "horizontal" ? "vertical" : "horizontal";
  je(() => {
    const R = p.current;
    if (R !== null) {
      const T = {
        disabled: i.disabled,
        disableDoubleClick: i.disableDoubleClick,
        element: R,
        id: c
      }, v = w(T), M = Hi(
        (z) => {
          m(
            z.next.state !== "inactive" && z.next.hitRegions.some(
              (F) => F.separator === T
            ) ? z.next.state : "inactive"
          );
        }
      ), C = Pn(
        I,
        (z) => {
          const { derivedPanelConstraints: F, layout: B, separatorToPanels: ee } = z.next, X = ee.get(T);
          if (X) {
            const oe = X[0], re = X.indexOf(oe);
            u(
              fc({
                layout: B,
                panelConstraints: F,
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
    N(c, { disabled: n, disableDoubleClick: r });
  }, [n, r, c, N]);
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
  return /* @__PURE__ */ h(
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
co.displayName = "Separator";
const kn = 30, Nn = 65, ft = 50, mc = 100 - Nn, hc = 100 - kn;
function pc(e) {
  const t = Number(e);
  return Number.isFinite(t) ? Math.min(Nn, Math.max(kn, t)) : ft;
}
function An(e) {
  return 100 - e;
}
function He(e) {
  return `${e}%`;
}
const xn = "reader-document", mt = "reader-assistant", lo = "retainpdf.reader.ai-split-layout.v1", gc = {
  [xn]: An(ft),
  [mt]: ft
};
function Cn(e) {
  const t = pc(e == null ? void 0 : e[mt]);
  return {
    [xn]: An(t),
    [mt]: t
  };
}
function bc() {
  try {
    const e = JSON.parse(localStorage.getItem(lo) || "null");
    return Cn(e);
  } catch {
    return gc;
  }
}
function yc(e) {
  try {
    localStorage.setItem(lo, JSON.stringify(Cn(e)));
  } catch {
  }
}
function Wt(e, t) {
  const n = e == null ? void 0 : e.closest(".reader-react-root");
  if (!n) return;
  const r = Cn(t);
  n.style.setProperty(
    "--reader-ai-split-width",
    `${r[mt]}vw`
  );
}
function vc() {
  const e = A(null), [t] = L(bc);
  Oe(() => {
    const o = e.current;
    return Wt(o, t), () => {
      var a;
      (a = o == null ? void 0 : o.closest(".reader-react-root")) == null || a.style.removeProperty("--reader-ai-split-width");
    };
  }, [t]);
  const n = x((o) => {
    Wt(e.current, o);
  }, []), r = x((o, a) => {
    Wt(e.current, o), a.isUserInteraction && yc(o);
  }, []);
  return /* @__PURE__ */ D(
    io,
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
        /* @__PURE__ */ h(
          rn,
          {
            id: xn,
            defaultSize: He(An(ft)),
            minSize: He(mc),
            maxSize: He(hc)
          }
        ),
        /* @__PURE__ */ h(
          co,
          {
            id: "reader-ai-split-separator",
            className: "reader-ai-split-separator",
            "aria-label": "调整文档与 AI 问答宽度",
            children: /* @__PURE__ */ h("span", { "aria-hidden": "true" })
          }
        ),
        /* @__PURE__ */ h(
          rn,
          {
            id: mt,
            defaultSize: He(ft),
            minSize: He(kn),
            maxSize: He(Nn)
          }
        )
      ]
    }
  );
}
const Ae = 12, wc = 4;
function Ve(e, t, n) {
  if (typeof window > "u") return { x: e, y: t };
  const r = Math.min(n, window.innerWidth - Ae * 2), o = Math.max(Ae, window.innerWidth - r - Ae), a = Math.min(window.innerHeight * 0.9, 860), s = Math.max(Ae, window.innerHeight - a - Ae);
  return {
    x: Math.min(o, Math.max(Ae, e)),
    y: Math.min(s, Math.max(Ae, t))
  };
}
function vr(e) {
  if (typeof window > "u") return { x: 24, y: 72 };
  const t = Math.min(e, window.innerWidth - Ae * 2);
  return Ve(window.innerWidth - t - 20, 72, e);
}
function Sc(e, t) {
  try {
    const n = localStorage.getItem(e);
    if (!n) return vr(t);
    const r = JSON.parse(n);
    if (typeof r.x == "number" && typeof r.y == "number")
      return Ve(r.x, r.y, t);
  } catch {
  }
  return vr(t);
}
function Pc(e, t) {
  try {
    localStorage.setItem(e, JSON.stringify(t));
  } catch {
  }
}
function Ic({
  id: e,
  open: t,
  title: n,
  subtitle: r = "拖动标题可移动",
  titleIcon: o,
  storageKey: a,
  ariaLabel: s,
  className: l = "",
  width: c = 360,
  placement: i = "floating",
  showHeader: d = !0,
  onClose: u,
  toolbar: f,
  children: m
}) {
  const P = i === "workspace", g = i === "dock-right", p = g || P, [b, S] = L(() => Sc(a, c)), [I, y] = L(!1), w = A(null);
  $(() => {
    !t || p || S((k) => Ve(k.x, k.y, c));
  }, [p, t, c]), $(() => {
    if (!t || p) return;
    const k = () => S((R) => Ve(R.x, R.y, c));
    return window.addEventListener("resize", k), () => window.removeEventListener("resize", k);
  }, [p, t, c]), $(() => {
    if (!t) return;
    const k = (R) => {
      var v;
      if (R.key !== "Escape") return;
      const T = R.target;
      (v = T == null ? void 0 : T.closest) != null && v.call(T, "textarea, input, select, [contenteditable='true']") || (R.preventDefault(), u());
    };
    return window.addEventListener("keydown", k), () => window.removeEventListener("keydown", k);
  }, [t, u]);
  const N = x((k) => {
    var R, T;
    p || k.button === 0 && ((T = (R = k.target) == null ? void 0 : R.closest) != null && T.call(R, "button") || (k.currentTarget.setPointerCapture(k.pointerId), w.current = {
      pointerId: k.pointerId,
      startX: k.clientX,
      startY: k.clientY,
      originX: b.x,
      originY: b.y,
      moved: !1
    }, y(!0)));
  }, [p, b.x, b.y]), E = x((k) => {
    const R = w.current;
    if (!R || R.pointerId !== k.pointerId) return;
    const T = k.clientX - R.startX, v = k.clientY - R.startY;
    !R.moved && Math.hypot(T, v) < wc || (R.moved = !0, S(Ve(R.originX + T, R.originY + v, c)));
  }, [c]), _ = x((k) => {
    const R = w.current;
    if (!(!R || R.pointerId !== k.pointerId)) {
      w.current = null, y(!1);
      try {
        k.currentTarget.releasePointerCapture(k.pointerId);
      } catch {
      }
      R.moved && S((T) => {
        const v = Ve(T.x, T.y, c);
        return Pc(a, v), v;
      });
    }
  }, [a, c]);
  return t ? /* @__PURE__ */ D(
    "aside",
    {
      id: e,
      className: `reader-notes-panel reader-notes-panel--${P ? "workspace" : g ? "docked" : "float"}${p ? "" : " reader-floating-surface"}${d ? " has-panel-header" : " is-headerless"}${f ? " has-panel-toolbar" : ""}${I ? " is-dragging" : ""} ${l}`.trim(),
      style: p ? void 0 : { left: b.x, top: b.y, width: Math.min(c, typeof window < "u" ? window.innerWidth - 24 : c) },
      "aria-label": s,
      role: "dialog",
      "aria-modal": "false",
      children: [
        d ? /* @__PURE__ */ D(
          "header",
          {
            className: "reader-notes-panel-head",
            onPointerDown: N,
            onPointerMove: E,
            onPointerUp: _,
            onPointerCancel: _,
            children: [
              p ? null : /* @__PURE__ */ h("div", { className: "reader-notes-panel-drag", "aria-hidden": "true", children: /* @__PURE__ */ h(Fo, { size: 14, strokeWidth: 2.25 }) }),
              /* @__PURE__ */ D("div", { className: "reader-notes-panel-head-text", children: [
                /* @__PURE__ */ D("strong", { children: [
                  o,
                  n
                ] }),
                r ? /* @__PURE__ */ h("span", { children: r }) : null
              ] }),
              /* @__PURE__ */ h("button", { type: "button", className: "reader-notes-close reader-floating-close", "aria-label": `关闭${n}`, onClick: u, children: /* @__PURE__ */ h(Xe, { size: 14, strokeWidth: 2.5, "aria-hidden": !0 }) })
            ]
          }
        ) : null,
        f ? /* @__PURE__ */ h("div", { className: "reader-notes-panel-toolbar", children: f }) : null,
        /* @__PURE__ */ h("div", { className: "reader-notes-panel-body", children: m })
      ]
    }
  ) : null;
}
function Rc({
  note: e,
  onJump: t,
  onUpdateNote: n,
  onRemove: r,
  disabled: o
}) {
  const [a, s] = L(!1), [l, c] = L(e.note);
  return $(() => {
    a || c(e.note);
  }, [e.note, a]), /* @__PURE__ */ D("article", { className: "reader-notes-item", children: [
    /* @__PURE__ */ D("div", { className: "reader-notes-item-top", children: [
      /* @__PURE__ */ h("span", { className: "reader-notes-kind", children: e.pane === "translated" ? "译文" : "原文" }),
      /* @__PURE__ */ D("div", { className: "reader-notes-item-actions", children: [
        /* @__PURE__ */ h("button", { type: "button", className: "reader-notes-link", onClick: () => t(e), children: "定位" }),
        /* @__PURE__ */ h("button", { type: "button", className: "reader-notes-danger", disabled: o, onClick: () => r(e.id), children: "删除" })
      ] })
    ] }),
    /* @__PURE__ */ h("p", { className: "reader-notes-quote", children: e.quote }),
    e.translatedQuote ? /* @__PURE__ */ D("p", { className: "reader-notes-note", children: [
      "译文：",
      e.translatedQuote
    ] }) : null,
    a ? /* @__PURE__ */ D("div", { className: "reader-notes-editor", children: [
      /* @__PURE__ */ h(
        "textarea",
        {
          className: "reader-notes-textarea",
          value: l,
          placeholder: "写点想法…",
          rows: 3,
          disabled: o,
          onChange: (i) => c(i.target.value)
        }
      ),
      /* @__PURE__ */ D("div", { className: "reader-notes-editor-actions", children: [
        /* @__PURE__ */ h(
          "button",
          {
            type: "button",
            className: "reader-notes-primary",
            disabled: o,
            onClick: async () => {
              await n(e.id, l) !== !1 && s(!1);
            },
            children: "保存"
          }
        ),
        /* @__PURE__ */ h("button", { type: "button", className: "reader-notes-link", onClick: () => s(!1), children: "取消" })
      ] })
    ] }) : e.note ? /* @__PURE__ */ h(
      "button",
      {
        type: "button",
        className: "reader-notes-note",
        disabled: o,
        onClick: () => s(!0),
        title: "点击编辑",
        children: e.note
      }
    ) : /* @__PURE__ */ h("button", { type: "button", className: "reader-notes-add-note", disabled: o, onClick: () => s(!0), children: "添加笔记" })
  ] });
}
function Tc({
  open: e,
  groups: t,
  count: n,
  onClose: r,
  onJump: o,
  onUpdateNote: a,
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
    Ic,
    {
      id: "reader-notes-panel",
      open: e,
      title: "批注",
      subtitle: u === "server" ? "选中 PDF 文字后可添加 · 保存到文献库" : "选中 PDF 文字后可添加 · 本地保存",
      titleIcon: /* @__PURE__ */ h(Ct, { size: 14, strokeWidth: 2.25, "aria-hidden": !0 }),
      storageKey: "retainpdf.reader.notes-float.pos.v1",
      ariaLabel: "批注",
      onClose: r,
      toolbar: /* @__PURE__ */ D(At, { children: [
        /* @__PURE__ */ D("span", { className: "reader-notes-count", children: [
          n,
          " 条"
        ] }),
        /* @__PURE__ */ h(
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
        c ? /* @__PURE__ */ h("p", { role: "status", className: "reader-notes-empty", children: "正在载入批注…" }) : null,
        i ? /* @__PURE__ */ h("p", { role: "status", className: "reader-notes-empty", children: "正在保存批注…" }) : null,
        d ? /* @__PURE__ */ D("div", { role: "alert", className: "reader-notes-empty", children: [
          /* @__PURE__ */ h("p", { children: d }),
          f ? /* @__PURE__ */ h("button", { type: "button", className: "reader-notes-link", disabled: i, onClick: f, children: "重新载入" }) : null
        ] }) : null,
        n === 0 ? /* @__PURE__ */ h("p", { className: "reader-notes-empty", children: "暂无批注。在 PDF 上拖选文字，点「添加批注」。" }) : t.map((g) => /* @__PURE__ */ D("section", { className: "reader-notes-group", children: [
          /* @__PURE__ */ D("h3", { className: "reader-notes-group-title", children: [
            "第 ",
            g.page,
            " 页"
          ] }),
          g.items.map((p) => /* @__PURE__ */ h(
            Rc,
            {
              note: p,
              onJump: o,
              onUpdateNote: a,
              onRemove: s,
              disabled: i || c
            },
            p.id
          ))
        ] }, g.page))
      ]
    }
  );
}
function Ec({
  regionsFailed: e = !1,
  metadataFailed: t = !1
}) {
  const [n, r] = L(!1);
  if ($(() => {
    !e && !t && r(!1);
  }, [e, t]), n || !e && !t)
    return null;
  const o = [
    e ? "译文区域" : "",
    t ? "阅读元数据" : ""
  ].filter(Boolean);
  return /* @__PURE__ */ D("div", { className: "reader-error-notice", role: "status", "data-reader-error-notice": "true", children: [
    /* @__PURE__ */ D("span", { className: "reader-error-notice-text", children: [
      o.join("、"),
      "加载失败，正文仍可正常阅读。"
    ] }),
    /* @__PURE__ */ h(
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
function Mc({
  loading: e,
  failed: t,
  text: n,
  percent: r,
  regionsError: o = !1,
  metadataError: a = !1
}) {
  return !e && !t ? /* @__PURE__ */ h(Ec, { regionsFailed: o, metadataFailed: a }) : /* @__PURE__ */ D(At, { children: [
    e ? /* @__PURE__ */ h("div", { className: "reader-boot-loading", "data-reader-boot-loading": "true", children: /* @__PURE__ */ D("div", { className: "reader-boot-loading-card", children: [
      /* @__PURE__ */ h("div", { className: "reader-boot-loading-text", children: n }),
      /* @__PURE__ */ h("div", { className: "reader-boot-loading-track", children: /* @__PURE__ */ h(
        "span",
        {
          className: "reader-boot-loading-bar",
          style: { width: `${Math.max(0, Math.min(100, r))}%` }
        }
      ) })
    ] }) }) : null,
    t ? /* @__PURE__ */ h("div", { className: "reader-react-error", role: "alert", children: n }) : null
  ] });
}
async function kc(e) {
  var o;
  const t = `${e || ""}`;
  if (!t) throw new Error("empty selection");
  try {
    if ((o = navigator.clipboard) != null && o.writeText) {
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
function Nc({
  selection: e,
  onDismiss: t,
  onAskAi: n,
  onAddNote: r
}) {
  const [o, a] = L(!1), s = e ? e.selectionType === "text" ? `${e.pane}:${e.page}:${e.quote}` : `${e.region.itemId}:${e.pane}` : "";
  if ($(() => a(!1), [s]), !e)
    return null;
  const l = typeof window < "u" ? window.innerWidth : 800, c = typeof window < "u" ? window.innerHeight : 600, i = e.rect.left + e.rect.width / 2, d = 170, u = Math.min(Math.max(16 + d, i), l - 16 - d), f = e.rect.top > 72, m = f ? Math.max(12, e.rect.top - 8) : Math.min(c - 12, e.rect.top + e.rect.height + 8), P = f ? "above" : "below", g = e.pane === "translated" ? "译文" : "原文", p = e.selectionType === "text" ? "text" : e.kind, b = e.selectionType === "text" ? e.quote : Tr(e.region, e.pane), S = p === "formula" ? "公式" : p === "table" ? "表格" : p === "figure" ? "图片" : p === "text" ? "文字" : "区域", I = p === "formula" ? No(b) : b, y = p === "formula" ? Oo : p === "table" ? $o : p === "text" ? jo : Uo;
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
            /* @__PURE__ */ h(y, { size: 15, strokeWidth: 2.1, "aria-hidden": !0 }),
            /* @__PURE__ */ h("span", { children: S }),
            /* @__PURE__ */ h("span", { className: "reader-sel-pop-context-divider", "aria-hidden": !0, children: "·" }),
            /* @__PURE__ */ h("span", { children: g }),
            /* @__PURE__ */ h("span", { className: "reader-sel-pop-context-divider", "aria-hidden": !0, children: "·" }),
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
                    await kc(I), a(!0), window.setTimeout(() => a(!1), 1400);
                  } catch (w) {
                    console.warn("[reader-selection] copy failed", w);
                  }
                },
                children: [
                  o ? /* @__PURE__ */ h(Bo, { size: 15, strokeWidth: 2.4, "aria-hidden": !0 }) : /* @__PURE__ */ h(Ho, { size: 15, strokeWidth: 2.2, "aria-hidden": !0 }),
                  /* @__PURE__ */ h("span", { children: o ? "已复制" : p === "formula" ? "复制 LaTeX" : "复制" })
                ]
              }
            ) : /* @__PURE__ */ h("span", { className: "reader-sel-pop-selection-hint", children: "已选择图片" }),
            r && I ? /* @__PURE__ */ D(
              "button",
              {
                type: "button",
                className: "reader-sel-pop-btn reader-sel-pop-btn--secondary",
                onClick: () => r({ page: e.page, pane: e.pane, quote: I }),
                children: [
                  /* @__PURE__ */ h(Ct, { size: 15, strokeWidth: 2.2, "aria-hidden": !0 }),
                  /* @__PURE__ */ h("span", { children: "添加批注" })
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
                  /* @__PURE__ */ h(fn, { size: 15, strokeWidth: 2.2, "aria-hidden": !0 }),
                  /* @__PURE__ */ h("span", { children: "问 AI" })
                ]
              }
            ) : null,
            /* @__PURE__ */ h(
              "button",
              {
                type: "button",
                className: "reader-sel-pop-btn reader-sel-pop-btn--ghost",
                onClick: t,
                "aria-label": "取消选区",
                title: "取消",
                children: /* @__PURE__ */ h(Xe, { size: 15, strokeWidth: 2.5, "aria-hidden": !0 })
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ h("span", { className: "reader-sel-pop-caret", "aria-hidden": "true" })
      ]
    }
  );
}
function Ac(e) {
  if (!(e instanceof HTMLElement)) return !1;
  const t = e.tagName;
  return t === "INPUT" || t === "TEXTAREA" || t === "SELECT" || e.isContentEditable ? !0 : !!e.closest("input, textarea, select, [contenteditable='true']");
}
function xc() {
  const [e, t] = L(!1), n = dn(), r = A(null);
  return $(() => {
    if (!e) return;
    const o = (s) => {
      const l = r.current;
      l && s.target instanceof Node && !l.contains(s.target) && t(!1);
    }, a = (s) => {
      s.key === "Escape" && (s.preventDefault(), t(!1));
    };
    return document.addEventListener("mousedown", o), window.addEventListener("keydown", a), () => {
      document.removeEventListener("mousedown", o), window.removeEventListener("keydown", a);
    };
  }, [e]), $(() => {
    const o = (a) => {
      if (a.defaultPrevented || a.metaKey || a.ctrlKey || a.altKey || Ac(a.target)) return;
      const s = a.key;
      if (s === "?" || s === "h" || s === "H" || s === "/") {
        if (s === "/" && !a.shiftKey)
          return;
        a.preventDefault(), t((l) => !l);
      }
    };
    return window.addEventListener("keydown", o), () => window.removeEventListener("keydown", o);
  }, []), /* @__PURE__ */ D("div", { className: "reader-react-shortcuts", ref: r, "data-reader-shortcuts": "", children: [
    /* @__PURE__ */ h(
      "button",
      {
        type: "button",
        className: `reader-react-hud-btn reader-react-shortcuts-btn${e ? " is-active" : ""}`,
        "aria-label": "快捷键说明",
        "aria-expanded": e,
        "aria-controls": n,
        title: "快捷键（H 或 ?）",
        onClick: () => t((o) => !o),
        children: /* @__PURE__ */ h(Wo, { className: "reader-react-shortcuts-icon", size: 16, strokeWidth: 2.25, "aria-hidden": !0 })
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
            /* @__PURE__ */ h("strong", { children: "快捷键" }),
            /* @__PURE__ */ h(
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
          /* @__PURE__ */ h("div", { className: "reader-react-shortcuts-body", children: Bs.map((o) => /* @__PURE__ */ D("section", { className: "reader-react-shortcuts-group", children: [
            /* @__PURE__ */ h("h3", { children: o.title }),
            /* @__PURE__ */ h("ul", { children: o.items.map((a) => /* @__PURE__ */ D("li", { children: [
              /* @__PURE__ */ h("kbd", { children: a.keys }),
              /* @__PURE__ */ h("span", { children: a.desc })
            ] }, `${o.title}-${a.keys}`)) })
          ] }, o.title)) }),
          /* @__PURE__ */ h("p", { className: "reader-react-shortcuts-foot", children: "在输入框内不会触发快捷键" })
        ]
      }
    ) : null
  ] });
}
const Cc = Object.freeze([
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
]), Lc = ["source", "sideBySide", "translated"], zc = { source: "", translated: "", sideBySide: "" };
function Dc(e) {
  if (e.sourceOnly || !e.jobId) {
    const t = it(e.sourceUrl), n = it(e.translatedUrl);
    return {
      source: t,
      translated: n,
      // sideBySide requires dedicated artifact; no fallback to source url
      sideBySide: ""
    };
  }
  return ca({
    jobId: e.jobId,
    jobPayload: e.jobPayload,
    manifestPayload: e.manifestPayload
  });
}
function _c(e) {
  const [t, n] = L(() => /* @__PURE__ */ new Set()), r = q(
    () => e ? Dc(e) : zc,
    [e]
  ), o = q(
    () => Lc.filter((s) => !(e != null && e.sourceOnly && s !== "source")),
    [e == null ? void 0 : e.sourceOnly]
  ), a = x(async (s) => {
    if (!e) return;
    const l = it(r[s]);
    if (!(!l || t.has(s)))
      try {
        const c = e.jobId ? ia(s, {
          jobId: e.jobId,
          jobPayload: e.jobPayload,
          manifestPayload: e.manifestPayload
        }) : `${e.sourceOnly ? "document" : "reader"}-${s}.pdf`;
        await la(
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
        da(i), n((d) => {
          const u = new Set(d);
          return u.delete(s), u;
        });
      }
  }, [r, t, e]);
  return { urls: r, downloadItems: o, busyActions: t, handleDownload: a };
}
function Fc(e) {
  const [t, n] = L(!1), r = x(() => n(!1), []), o = x(() => n((a) => !a), []);
  return $(() => {
    if (!t) return;
    const a = (l) => {
      const c = e.current;
      c && l.target instanceof Node && !c.contains(l.target) && n(!1);
    }, s = (l) => {
      l.key === "Escape" && (l.preventDefault(), n(!1));
    };
    return document.addEventListener("mousedown", a), window.addEventListener("keydown", s), () => {
      document.removeEventListener("mousedown", a), window.removeEventListener("keydown", s);
    };
  }, [t, e]), { open: t, setOpen: n, closeMenu: r, toggleMenu: o };
}
const uo = "retainpdf.reader.fab.pos.v1", Nt = 52, We = 12, Oc = 6;
function st(e, t) {
  if (typeof window > "u")
    return { x: e, y: t };
  const n = Math.max(We, window.innerWidth - Nt - We), r = Math.max(We, window.innerHeight - Nt - We);
  return {
    x: Math.min(n, Math.max(We, e)),
    y: Math.min(r, Math.max(We, t))
  };
}
function wr() {
  return typeof window > "u" ? { x: 24, y: 120 } : st(
    window.innerWidth - Nt - 20,
    window.innerHeight - Nt - 88
  );
}
function $c() {
  try {
    const e = localStorage.getItem(uo);
    if (!e) return wr();
    const t = JSON.parse(e);
    if (typeof t.x == "number" && typeof t.y == "number")
      return st(t.x, t.y);
  } catch {
  }
  return wr();
}
function jc(e) {
  try {
    localStorage.setItem(uo, JSON.stringify(e));
  } catch {
  }
}
function Uc(e) {
  return typeof window < "u" && e.y > window.innerHeight * 0.55;
}
function Bc(e = {}) {
  const { onDragStart: t, onActivate: n } = e, [r, o] = L(() => $c()), a = A(null);
  $(() => {
    const i = () => o((d) => st(d.x, d.y));
    return window.addEventListener("resize", i), () => window.removeEventListener("resize", i);
  }, []);
  const s = x((i) => {
    i.button === 0 && (i.currentTarget.setPointerCapture(i.pointerId), a.current = {
      pointerId: i.pointerId,
      startX: i.clientX,
      startY: i.clientY,
      originX: r.x,
      originY: r.y,
      moved: !1
    });
  }, [r.x, r.y]), l = x((i) => {
    const d = a.current;
    if (!d || d.pointerId !== i.pointerId) return;
    const u = i.clientX - d.startX, f = i.clientY - d.startY;
    !d.moved && Math.hypot(u, f) < Oc || (d.moved || (d.moved = !0, t == null || t()), o(st(d.originX + u, d.originY + f)));
  }, [t]), c = x((i) => {
    const d = a.current;
    if (!(!d || d.pointerId !== i.pointerId)) {
      a.current = null;
      try {
        i.currentTarget.releasePointerCapture(i.pointerId);
      } catch {
      }
      if (d.moved) {
        o((u) => {
          const f = st(u.x, u.y);
          return jc(f), f;
        });
        return;
      }
      n == null || n();
    }
  }, [n]);
  return {
    pos: r,
    openUp: Uc(r),
    onPointerDown: s,
    onPointerMove: l,
    onPointerUp: c
  };
}
const Hc = {
  source: Er,
  sideBySide: Mr,
  translated: kr
}, Wc = {
  source: "原文",
  sideBySide: "对照",
  translated: "译文"
};
function Jc({ onClose: e }) {
  return /* @__PURE__ */ D("header", { className: "reader-fab-menu-head", children: [
    /* @__PURE__ */ D("div", { className: "reader-fab-menu-head-text", children: [
      /* @__PURE__ */ h("strong", { children: "工具" }),
      /* @__PURE__ */ h("span", { children: "拖动圆钮可移动" })
    ] }),
    /* @__PURE__ */ h(
      "button",
      {
        type: "button",
        className: "reader-fab-menu-close reader-floating-close",
        "aria-label": "关闭菜单",
        onClick: e,
        children: /* @__PURE__ */ h(Xe, { size: 14, strokeWidth: 2.5, "aria-hidden": !0 })
      }
    )
  ] });
}
function Vc({
  index: e,
  icon: t,
  title: n,
  sub: r,
  active: o,
  disabled: a,
  onClick: s
}) {
  return /* @__PURE__ */ D(
    "button",
    {
      type: "button",
      role: "menuitem",
      className: `reader-fab-row${o ? " is-active" : ""}${a ? " is-disabled" : ""}`,
      "aria-pressed": o,
      disabled: a,
      onClick: s,
      style: { "--fab-i": e + 1 },
      children: [
        /* @__PURE__ */ h("span", { className: "reader-fab-row-icon", "aria-hidden": "true", children: /* @__PURE__ */ h(t, { size: 18, strokeWidth: 2 }) }),
        /* @__PURE__ */ D("span", { className: "reader-fab-row-copy", children: [
          /* @__PURE__ */ h("span", { className: "reader-fab-row-title", children: n }),
          /* @__PURE__ */ h("span", { className: "reader-fab-row-sub", children: r })
        ] })
      ]
    }
  );
}
function qc({
  urls: e,
  items: t,
  busyActions: n,
  onDownload: r
}) {
  return /* @__PURE__ */ D("div", { className: "reader-fab-section", role: "group", "aria-label": "下载", children: [
    /* @__PURE__ */ D("div", { className: "reader-fab-section-head", children: [
      /* @__PURE__ */ h(Jo, { size: 12, strokeWidth: 2.5, "aria-hidden": !0 }),
      /* @__PURE__ */ h("span", { children: "下载 PDF" })
    ] }),
    /* @__PURE__ */ h("div", { className: "reader-fab-download-grid", children: t.map((o, a) => {
      const s = wo[o], l = it(e[o]), c = n.has(o), i = !!l && !c, d = i ? "" : So(o, e), u = Hc[o];
      return /* @__PURE__ */ D(
        "button",
        {
          type: "button",
          role: "menuitem",
          id: `reader-fab-download-${o}`,
          className: `reader-fab-chip${c ? " is-busy" : ""}${i ? "" : " is-disabled"}`,
          disabled: !i,
          title: i ? `下载${s.label}` : d,
          onClick: () => void r(o),
          style: { "--fab-i": a },
          children: [
            /* @__PURE__ */ h("span", { className: "reader-fab-chip-icon", "aria-hidden": "true", children: /* @__PURE__ */ h(u, { size: 16, strokeWidth: 2 }) }),
            /* @__PURE__ */ h("span", { className: "reader-fab-chip-label", children: Wc[o] }),
            /* @__PURE__ */ h("span", { className: "reader-fab-chip-state", children: c ? "…" : i ? "↓" : "—" })
          ]
        },
        o
      );
    }) }),
    t.every((o) => !it(e[o])) ? /* @__PURE__ */ h("p", { className: "reader-fab-empty", children: "产物尚未就绪" }) : null
  ] });
}
const Kc = {
  favorites: Vo,
  markdown: Nr,
  ai: fn,
  notes: Ct
}, Gc = Cc;
function Yc(e) {
  const { activeTool: t, noteCount: n, onToggleTool: r } = e, o = pt(), a = e.sourceOnly ?? (o == null ? void 0 : o.sourceOnly) ?? !1, s = e.download ?? (o == null ? void 0 : o.download), l = A(null), c = dn(), { open: i, setOpen: d, closeMenu: u, toggleMenu: f } = Fc(l), { pos: m, openUp: P, onPointerDown: g, onPointerMove: p, onPointerUp: b } = Bc({
    onDragStart: u,
    onActivate: f
  }), { urls: S, downloadItems: I, busyActions: y, handleDownload: w } = _c(s), N = x((E) => {
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
              /* @__PURE__ */ h(Jc, { onClose: u }),
              (() => {
                const E = t === "notes";
                return /* @__PURE__ */ D(
                  "button",
                  {
                    type: "button",
                    role: "menuitem",
                    className: `reader-fab-row${E ? " is-active" : ""}`,
                    "aria-pressed": E,
                    onClick: () => N("notes"),
                    style: { "--fab-i": 0 },
                    children: [
                      /* @__PURE__ */ h("span", { className: "reader-fab-row-icon", "aria-hidden": "true", children: /* @__PURE__ */ h(Ct, { size: 18, strokeWidth: 2 }) }),
                      /* @__PURE__ */ D("span", { className: "reader-fab-row-copy", children: [
                        /* @__PURE__ */ h("span", { className: "reader-fab-row-title", children: "批注" }),
                        /* @__PURE__ */ h("span", { className: "reader-fab-row-sub", children: E ? "关闭悬浮窗" : "本地批注 · 导出" })
                      ] }),
                      n > 0 ? /* @__PURE__ */ h("span", { className: "reader-fab-row-badge", children: n }) : null
                    ]
                  }
                );
              })(),
              Gc.map((E, _) => {
                const k = Kc[E.id], R = t === E.id, T = E.needsJob && a;
                let v = R ? E.subOpen : E.subIdle;
                return T && (v = "需打开任务阅读"), /* @__PURE__ */ h(
                  Vc,
                  {
                    index: _,
                    icon: k,
                    title: E.label,
                    sub: v,
                    active: R,
                    disabled: T,
                    onClick: () => N(E.id)
                  },
                  E.id
                );
              }),
              /* @__PURE__ */ h(
                qc,
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
        /* @__PURE__ */ h(
          "button",
          {
            type: "button",
            className: `reader-fab-trigger${i ? " is-open" : ""}${t ? " has-active-tool" : ""}`,
            "aria-label": i ? "收起工具菜单" : "打开工具菜单",
            "aria-expanded": i,
            "aria-controls": i ? c : void 0,
            "aria-haspopup": "menu",
            onPointerDown: g,
            onPointerMove: p,
            onPointerUp: b,
            onPointerCancel: b,
            children: /* @__PURE__ */ h("span", { className: "reader-fab-icon", "aria-hidden": "true", children: i ? /* @__PURE__ */ h(Xe, { size: 20, strokeWidth: 2.5 }) : /* @__PURE__ */ D("span", { className: "reader-fab-dots", children: [
              /* @__PURE__ */ h("i", {}),
              /* @__PURE__ */ h("i", {}),
              /* @__PURE__ */ h("i", {})
            ] }) })
          }
        )
      ]
    }
  );
}
function Zc(e) {
  const t = pt(), n = Ri(), { mode: r = "compare", modeControls: o } = e, a = e.userZoom ?? (t == null ? void 0 : t.userZoom) ?? ht, s = e.onZoomChange ?? (t == null ? void 0 : t.onZoomChange) ?? (() => {
  }), l = e.currentPage ?? (n == null ? void 0 : n.currentPage) ?? 1, c = e.numPages ?? (n == null ? void 0 : n.numPages) ?? 0, i = e.onGoToPage ?? (t == null ? void 0 : t.goToPage), d = qa(a), u = a > Lr + 1e-3, f = a < zr - 1e-3, m = ot(), P = "50%（半屏，对照铺满）", [g, p] = L(!1), [b, S] = L(`${l}`);
  $(() => {
    g || S(`${Math.min(Math.max(l, 1), Math.max(c, 1))}`);
  }, [l, c, g]);
  const I = () => {
    if (p(!1), !i || c <= 0)
      return;
    const y = Number(`${b}`.trim());
    i(kt(y, c));
  };
  return /* @__PURE__ */ D("div", { className: "reader-react-hud", "data-reader-hud": "true", children: [
    o ? /* @__PURE__ */ h("div", { className: "reader-react-hud-group reader-react-hud-modes", children: o }) : null,
    /* @__PURE__ */ h("div", { className: "reader-react-hud-group", "aria-label": "页码", children: g ? /* @__PURE__ */ D(
      "form",
      {
        className: "reader-react-hud-page-form",
        onSubmit: (y) => {
          y.preventDefault(), I();
        },
        children: [
          /* @__PURE__ */ h(
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
                y.key === "Escape" && (y.preventDefault(), p(!1), S(`${l}`));
              }
            }
          ),
          /* @__PURE__ */ D("span", { className: "reader-react-hud-page-suffix", children: [
            "/ ",
            c || "—"
          ] })
        ]
      }
    ) : /* @__PURE__ */ h(
      "button",
      {
        type: "button",
        className: "reader-react-hud-page reader-react-hud-page-btn",
        "aria-label": c > 0 ? `跳转页码，当前第 ${l} 页，共 ${c} 页` : "页码",
        title: c > 0 ? "点击输入页码跳转" : void 0,
        disabled: !i || c <= 0,
        onClick: () => {
          !i || c <= 0 || (S(`${l}`), p(!0));
        },
        children: c > 0 ? `${Math.min(l, c)} / ${c}` : "—"
      }
    ) }),
    /* @__PURE__ */ D("div", { className: "reader-react-hud-group", "aria-label": "缩放", children: [
      /* @__PURE__ */ h(
        "button",
        {
          type: "button",
          className: "reader-react-hud-btn",
          "aria-label": "缩小",
          disabled: !u,
          onClick: () => s(dt(a, -1)),
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
      /* @__PURE__ */ h(
        "button",
        {
          type: "button",
          className: "reader-react-hud-btn",
          "aria-label": "放大",
          disabled: !f,
          onClick: () => s(dt(a, 1)),
          children: "+"
        }
      )
    ] }),
    /* @__PURE__ */ h("div", { className: "reader-react-hud-group reader-react-hud-help", "aria-label": "帮助", children: /* @__PURE__ */ h(xc, {}) })
  ] });
}
function Ln(e) {
  const t = `${e.jobId || ""}`.trim(), n = `${e.documentId || ""}`.trim();
  return t ? `retainpdf.reader.notes.v1:job:${t}` : n ? `retainpdf.reader.notes.v1:doc:${n}` : "retainpdf.reader.notes.v1:anonymous";
}
function Xc() {
  return typeof crypto < "u" && typeof crypto.randomUUID == "function" ? crypto.randomUUID() : `note-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
function Qc(e) {
  return {
    pageIdx: Number(e.page) - 1,
    quoteText: e.quote,
    note: e.note,
    createdAt: e.createdAt
  };
}
function It(e) {
  return Co(e, (t) => t.page);
}
function el(e) {
  return zo(e, (t) => t.page).map((t) => ({ page: t.pageIdx, items: t.items }));
}
function tl(e, t) {
  return Lo({
    title: e,
    annotations: t.map(Qc)
  });
}
function nl(e) {
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
function Sr(e) {
  if (typeof localStorage > "u")
    return [];
  try {
    return nl(localStorage.getItem(Ln(e)));
  } catch {
    return [];
  }
}
function rl(e, t) {
  if (!(typeof localStorage > "u"))
    try {
      localStorage.setItem(Ln(e), JSON.stringify(t));
    } catch (n) {
      console.warn("[reader-notes] persist failed", n);
    }
}
function ol(e, t = {}) {
  var k;
  const n = q(() => ({
    jobId: `${e.jobId || ""}`.trim(),
    documentId: `${e.documentId || ""}`.trim()
  }), [e.jobId, e.documentId]), r = ((k = se()) == null ? void 0 : k.annotationDataPort) ?? null, o = (r == null ? void 0 : r.resolveScope(n)) ?? null, a = r ? `server:${(o == null ? void 0 : o.key) || "unresolved"}:${n.documentId}:${n.jobId}` : Ln(n), [s, l] = L(() => ({
    key: a,
    notes: r ? [] : Sr(n),
    loading: !!(r && o),
    saving: !1,
    error: null
  })), [c, i] = L(0), d = A(a);
  d.current = a;
  const u = A(s);
  u.current = s;
  const f = A(0), m = A(!1), P = A(Promise.resolve()), g = A(0), p = t.onAfterAdd, b = x((R) => {
    const T = { ...u.current, ...R };
    u.current = T, l(T);
  }, []);
  $(() => {
    m.current = !0;
    const R = ++f.current, T = new AbortController();
    return g.current = 0, P.current = Promise.resolve(), b({ key: a, notes: r ? [] : Sr(n), loading: !!(r && o), saving: !1, error: null }), r && o && r.load(o, { signal: T.signal }).then((v) => {
      m.current && R === f.current && d.current === a && b({ notes: It(v), loading: !1 });
    }).catch((v) => {
      !T.signal.aborted && m.current && R === f.current && d.current === a && b({ loading: !1, error: `批注读取失败：${v instanceof Error ? v.message : "请重试"}` });
    }), () => {
      m.current = !1, T.abort();
    };
  }, [a, r, c, b]), $(() => {
    !r && s.key === a && rl(n, s.notes);
  }, [r, s.notes, s.key, a, n]);
  const S = x(async (R, T) => {
    const v = f.current, M = () => m.current && v === f.current && d.current === a;
    if (!o || u.current.key !== a || u.current.loading || u.current.error)
      return b({ error: u.current.error || "批注尚未载入，请稍后重试。" }), p == null || p(), null;
    g.current++, b({ saving: !0, error: null });
    const C = P.current;
    let z;
    P.current = new Promise((F) => {
      z = F;
    });
    try {
      if (await C, !M()) return null;
      const F = await R();
      return M() ? (T(F), F) : null;
    } catch (F) {
      return M() && b({ error: `批注保存失败：${F instanceof Error ? F.message : "请重试，原批注未被改动"}` }), null;
    } finally {
      z(), M() && (g.current--, b({ saving: g.current > 0 }));
    }
  }, [a, o == null ? void 0 : o.key, p, b]), I = x((R) => {
    const T = `${R.quote || ""}`.trim();
    if (!T) return null;
    const v = {
      id: Xc(),
      page: Math.max(1, Math.floor(Number(R.page) || 1)),
      pane: R.pane === "translated" ? "translated" : "source",
      quote: T,
      note: `${R.note || ""}`.trim(),
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    return r ? (p == null || p(), !Number.isInteger(R.page) || R.page < 1 ? (b({ error: "原文页码无效，批注未保存。" }), null) : S(() => r.create(o, v), (M) => {
      b({ notes: It([M, ...u.current.notes.filter((C) => C.id !== M.id)]) });
    })) : (b({ notes: It([v, ...u.current.notes]) }), p == null || p(), v);
  }, [r, o == null ? void 0 : o.key, S, p, b]), y = x((R, T) => {
    const v = `${T || ""}`.trim();
    if (!r) {
      b({ notes: u.current.notes.map((M) => M.id === R ? { ...M, note: v } : M) });
      return;
    }
    return S(async () => {
      const M = u.current.notes.find((C) => C.id === R);
      if (!M) throw new Error("批注已不存在，请重新载入。");
      return r.update(o, { ...M, note: v });
    }, (M) => b({ notes: It(u.current.notes.map((C) => C.id === R ? M : C)) })).then(Boolean);
  }, [r, o == null ? void 0 : o.key, S, b]), w = x((R) => {
    if (!r) {
      b({ notes: u.current.notes.filter((T) => T.id !== R) });
      return;
    }
    return S(async () => {
      if (!u.current.notes.some((T) => T.id === R)) throw new Error("批注已不存在，请重新载入。");
      return await r.remove(o, R), !0;
    }, () => b({ notes: u.current.notes.filter((T) => T.id !== R) })).then(Boolean);
  }, [r, o == null ? void 0 : o.key, S, b]), N = s.key === a ? s : { ...s, notes: [], error: null, loading: !!(r && o) }, E = N.notes, _ = x(async (R = "") => {
    var T, v;
    try {
      return await ((v = (T = navigator.clipboard) == null ? void 0 : T.writeText) == null ? void 0 : v.call(T, tl(R, E))), !0;
    } catch {
      return !1;
    }
  }, [E]);
  return {
    notes: E,
    groups: q(() => el(E), [E]),
    addFromQuote: I,
    updateNote: y,
    remove: w,
    exportMarkdown: _,
    count: E.length,
    loading: N.loading,
    saving: N.saving,
    error: N.error,
    storageMode: r ? "server" : "local",
    reload: () => i((R) => R + 1)
  };
}
const on = "download-toast";
function al({
  title: e = "下载中",
  status: t = "正在准备...",
  meta: n = "等待响应...",
  percent: r = NaN,
  tone: o = "progress"
}) {
  const a = Number.isFinite(r) ? Math.max(4, Math.min(100, Number(r) || 0)) : 18;
  return /* @__PURE__ */ D("div", { className: "download-toast-card reader-floating-surface", "data-tone": o, "aria-live": "polite", children: [
    /* @__PURE__ */ D("div", { className: "download-toast-head", children: [
      /* @__PURE__ */ h("div", { id: "download-toast-title", className: "download-toast-title", children: e }),
      /* @__PURE__ */ h("div", { id: "download-toast-status", className: "download-toast-status", children: t })
    ] }),
    /* @__PURE__ */ h("div", { className: "download-toast-track", children: /* @__PURE__ */ h("span", { id: "download-toast-bar", className: "download-toast-bar", style: { width: `${a}%` } }) }),
    /* @__PURE__ */ h("div", { id: "download-toast-meta", className: "download-toast-meta", children: n })
  ] });
}
function sl(e = {}) {
  const {
    visible: t = !1,
    title: n = "下载中",
    status: r = "正在准备...",
    meta: o = "等待响应...",
    percent: a = NaN,
    tone: s = "progress"
  } = e;
  if (!t) {
    Vt.dismiss(on);
    return;
  }
  Vt.custom(
    () => /* @__PURE__ */ h(al, { title: n, status: r, meta: o, percent: a, tone: s }),
    { id: on, duration: 1 / 0 }
  );
}
function il() {
  const e = x((t) => {
    t && (t.setState = sl, t.hide = () => Vt.dismiss(on));
  }, []);
  return /* @__PURE__ */ D(At, { children: [
    /* @__PURE__ */ h(Do, { position: "bottom-right" }),
    /* @__PURE__ */ h("download-toast", { style: { display: "none" }, "aria-hidden": "true", ref: e })
  ] });
}
const cl = un(() => import("./ReaderFavoritesPanel-CPUYLjvd.js").then((e) => ({ default: e.ReaderFavoritesPanel }))), ll = un(() => import("./ReaderMarkdownPanel-1N66JXSf.js").then((e) => ({ default: e.ReaderMarkdownPanel }))), dl = un(() => import("./ReaderAiPanel-CrAONqI1.js").then((e) => ({ default: e.ReaderAiPanel })));
function Jt(e) {
  const t = A(!1);
  return e && (t.current = !0), t.current;
}
function ul(e) {
  return "workspace";
}
function fl(e) {
  const t = e.sourceOnly || !e.translatedUrl, n = !!(e.overlayContentAvailable && e.liveTranslationVisible && !e.assistantOpen), o = e.assistantPdfPane || (e.assistantOpen && e.mode === "compare" ? "source" : e.mode);
  return {
    kind: n ? "live-overlay" : o === "compare" ? "final-compare" : o === "translated" ? "translated-only" : "source-only",
    visibleMode: o,
    compareMode: o === "compare",
    showSource: n || o !== "translated",
    showTranslated: o === "translated" || o === "compare",
    overlayOnSource: n,
    sourceOnly: e.sourceOnly,
    sourceViewOnly: t
  };
}
function ml(e, t) {
  return e === "compare" ? t ? !0 : null : !1;
}
function Pr(e, t) {
  var n, r, o, a;
  return e === "compare" ? null : (t == null ? void 0 : t.assistantPanel) === "markdown" || (t == null ? void 0 : t.assistantPanel) === "ai" ? t.assistantPanel : ((n = t == null ? void 0 : t.splitLayout) == null ? void 0 : n.left) === "ai" || ((r = t == null ? void 0 : t.splitLayout) == null ? void 0 : r.right) === "ai" ? "ai" : ((o = t == null ? void 0 : t.splitLayout) == null ? void 0 : o.left) === "markdown" || ((a = t == null ? void 0 : t.splitLayout) == null ? void 0 : a.right) === "markdown" ? "markdown" : null;
}
function hl() {
  const e = js(), { boot: t, panes: n, sessionFiles: r, tools: o, session: a } = e, [s, l] = L(() => Pr(e.mode, Ee(e.viewStateKey))), [c, i] = L(null), [d, u] = L(null), [f, m] = L(!1), P = A(e.selection);
  P.current = e.selection;
  const g = A(e.viewStateKey), p = A(null), b = s !== null, S = e.liveTranslationAvailable || e.liveTranslation.pagesByPage.size > 0, I = fl({
    mode: e.mode,
    sourceOnly: e.sourceOnly,
    translatedUrl: r.translatedUrl,
    overlayContentAvailable: S,
    liveTranslationVisible: f,
    assistantOpen: b,
    assistantPdfPane: c
  }), y = I.sourceViewOnly, w = I.visibleMode, [N, E] = L(!1), _ = x(() => E(!0), []), k = x(() => E((j) => !j), []), R = ol(
    { jobId: a.jobId, documentId: a.documentId },
    { onAfterAdd: _ }
  ), T = x((j) => {
    const H = P.current;
    Promise.resolve(R.addFromQuote(j)).then((V) => {
      V && P.current === H && e.clearSelection();
    });
  }, [R.addFromQuote, e.clearSelection]), v = x((j) => {
    e.goToPage(j.page, j.pane === "translated" ? "translated" : "source");
  }, [e.goToPage]), M = x(
    () => R.exportMarkdown(a.title || ""),
    [R.exportMarkdown, a.title]
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
        l(Pr(e.mode, j)), i(null);
        return;
      }
      Mt(e.viewStateKey, { assistantPanel: s, splitLayout: null });
    }
  }, [s, t.loading, e.mode, e.viewStateKey]), $(() => {
    if (!(t.loading || t.failed)) {
      if (p.current !== e.viewStateKey) {
        p.current = e.viewStateKey;
        const j = Ee(e.viewStateKey), H = y ? "source" : j == null ? void 0 : j.mode;
        H && H !== e.mode && e.setModeKeepingPage(H);
        return;
      }
      Mt(e.viewStateKey, { mode: e.mode });
    }
  }, [t.failed, t.loading, e.mode, e.setModeKeepingPage, e.viewStateKey, y]);
  const C = s || (e.mode === "compare" ? "compare" : "reading"), z = Jt(o.isOpen("favorites")), F = Jt(s === "markdown"), B = Jt(s === "ai");
  Js({
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
    o.close();
  }, [o]), X = x(() => {
    l(null), i(null), u(null);
  }, []), oe = x((j) => {
    const H = w === "translated" ? "translated" : "source";
    e.jumpToAnchor(j, H);
  }, [e.jumpToAnchor, w]), re = x((j) => {
    a.refreshCommittedDocument(j);
  }, [a.refreshCommittedDocument]), ie = x((j) => {
    o.close(), i(null);
    const H = ml(j, e.liveTranslationAvailable);
    H !== null && m(H), e.setModeKeepingPage(j);
  }, [e.liveTranslationAvailable, e.setModeKeepingPage, o]), U = q(() => !S || !I.showSource ? null : /* @__PURE__ */ h(
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
    o.toggle(j);
  }, [s, k, o]), Q = N ? "notes" : s ?? o.active, le = x((j) => {
    const H = j.pane === "translated" && !y ? "translated" : "source";
    u(j), l("ai"), i(H), e.clearSelection();
  }, [e.clearSelection, y]), he = q(() => ({
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
    regions: a.regions,
    readerMetadata: a.readerMetadata,
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
    a.regions,
    a.readerMetadata,
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
  }), [e.currentPage, n.hudNumPages]), pe = [
    $a,
    `is-workspace-${C}`,
    b ? "is-assistant-open" : "",
    I.overlayOnSource ? "is-live-translation-overlay" : ""
  ].filter(Boolean).join(" ");
  return /* @__PURE__ */ h(Ii, { value: he, hud: me, children: /* @__PURE__ */ D("div", { className: pe, "data-reader-engine": "react-pdf", "data-reader-workspace": C, children: [
    /* @__PURE__ */ h(Mc, { loading: t.loading, failed: t.failed, text: t.text, percent: t.percent, regionsError: !!a.readerErrors.regions, metadataError: !!a.readerErrors.metadata }),
    /* @__PURE__ */ h(Zs, { onBeforeClose: a.prepareClose }),
    /* @__PURE__ */ h(
      Ci,
      {
        mode: w,
        documentReady: !!a.jobId,
        sourceViewOnly: y,
        onModeChange: ie,
        liveTranslation: S ? {
          visible: f,
          state: e.liveTranslation,
          onToggle: () => m((j) => !j)
        } : null
      }
    ),
    /* @__PURE__ */ h(Li, { active: s }),
    b ? /* @__PURE__ */ h(vc, {}) : null,
    e.showHud ? /* @__PURE__ */ h(Yc, { activeTool: Q, noteCount: R.count, onToggleTool: Z }) : null,
    /* @__PURE__ */ h(ki, { paneComposition: I, markdownSplit: s === "markdown", assistantSplit: b, liveTranslation: e.liveTranslation, sourcePaneAction: U }),
    e.showHud ? /* @__PURE__ */ h(
      Zc,
      {
        mode: w,
        modeControls: null
      }
    ) : null,
    /* @__PURE__ */ D(go, { fallback: null, children: [
      z ? /* @__PURE__ */ h(cl, { open: o.isOpen("favorites"), jobId: a.jobId, documentId: a.documentId, onClose: ee, onJumpPage: e.goToPage }) : null,
      F ? /* @__PURE__ */ h(ll, { open: s === "markdown", jobId: a.jobId, sourceOnly: e.sourceOnly, layout: "workspace", side: "right", onClose: X }) : null,
      B ? /* @__PURE__ */ h(dl, { open: s === "ai", jobId: a.jobId, documentId: a.documentId, sessionIdentity: a.sessionIdentity, layout: ul(e.mode), side: "right", selectionContext: d, onClearSelectionContext: () => u(null), onClose: X, onJumpCitation: oe, onDocumentCommitted: re }, a.documentId || a.jobId || "reader-ai-pending") : null
    ] }),
    /* @__PURE__ */ h(
      Tc,
      {
        open: N,
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
    /* @__PURE__ */ h(Nc, { selection: e.selection, onDismiss: e.clearSelection, onAskAi: le, onAddNote: T }),
    /* @__PURE__ */ h(il, {})
  ] }) });
}
function $l() {
  return /* @__PURE__ */ h(hl, {});
}
export {
  hn as A,
  $l as R,
  hl as a,
  Ic as b,
  Ol as c,
  xl as d,
  Al as e,
  Fl as f,
  Ll as g,
  Cl as h,
  zl as i,
  _l as j,
  Dl as r
};
//# sourceMappingURL=ReaderApp-Clvej_gH.js.map
