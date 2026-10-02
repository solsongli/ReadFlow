import { S as n, c as o, i as c, a as d, b as i, p as m, d as p, e as E, t as b, v as g } from "./live-translation-Z2J_mshY.js";
import { c as u } from "./ai-chat-ZSCffLDD.js";
function s(e) {
  return Number(e == null ? void 0 : e.status) || 0;
}
function a(e) {
  return e instanceof Error && e.message.trim() ? e.message.trim() : "操作请求失败，请重试。";
}
export {
  n as SOFT_READER_CLOSE_MESSAGE,
  u as createReaderMessageId,
  o as createReaderTransportError,
  c as isReaderTransportError,
  d as isWorkbenchItemId,
  i as isWorkbenchScheme,
  m as parseWorkbenchEmbed,
  p as parseWorkbenchReaderMessage,
  E as parseWorkbenchSchemeMessage,
  a as readerOperationErrorMessage,
  s as readerOperationErrorStatus,
  b as trustedWorkbenchMessage,
  g as validReaderProgress
};
//# sourceMappingURL=contracts.js.map
