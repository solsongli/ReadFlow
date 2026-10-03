import { S as n, W as o, c, i as d, a as i, b as E, p as b, d as h, e as p, t as m, v as k, f as S, g as W, h as g, w as u } from "./live-translation-DXyeQ4W0.js";
import { c as f } from "./ai-chat-ZSCffLDD.js";
function a(e) {
  return Number(e == null ? void 0 : e.status) || 0;
}
function s(e) {
  return e instanceof Error && e.message.trim() ? e.message.trim() : "操作请求失败，请重试。";
}
export {
  n as SOFT_READER_CLOSE_MESSAGE,
  o as WORKBENCH_TEXT_SCALES,
  f as createReaderMessageId,
  c as createReaderTransportError,
  d as isReaderTransportError,
  i as isWorkbenchItemId,
  E as isWorkbenchScheme,
  b as parseWorkbenchEmbed,
  h as parseWorkbenchReaderMessage,
  p as parseWorkbenchSchemeMessage,
  s as readerOperationErrorMessage,
  a as readerOperationErrorStatus,
  m as trustedWorkbenchMessage,
  k as validReaderProgress,
  S as validWorkbenchAppearance,
  W as validWorkbenchFont,
  g as validWorkbenchFontFamily,
  u as workbenchFontStack
};
//# sourceMappingURL=contracts.js.map
