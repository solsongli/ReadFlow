/** Only fixed error categories and code locations leave the boundary; never props, URLs or raw text. */
export function safeDiagnostics(error: unknown, componentStack: string): string {
  const value = error instanceof Error ? error : new Error();
  const names = ["Error", "TypeError", "ReferenceError", "RangeError", "SyntaxError", "URIError", "EvalError"];
  const name = names.includes(value.name) ? value.name : "Error";
  const message = /Maximum update depth exceeded/.test(value.message) ? "Maximum update depth exceeded"
    : /Rendered (more|fewer) hooks/.test(value.message) ? "React hook order changed"
    : /Objects are not valid as a React child/.test(value.message) ? "Objects are not valid as a React child"
    : /Cannot read properties of (undefined|null)/.test(value.message) ? "Cannot read properties of a missing value"
    : /Minified React error #(\d{1,4})/.test(value.message) ? `Minified React error #${value.message.match(/Minified React error #(\d{1,4})/)![1]}`
    : "组件渲染异常（原始消息已隐藏）";
  const known = ["WorkbenchShell", "WorkbenchLayout", "WorkbenchProvider", "ItemList", "ItemRow", "Inspector", "DeskView", "NotesView", "NoteEditor", "SettingsView", "ReaderHost", "ReaderFrame", "Sidebar", "CommandPalette", "TranslationSettings", "AgentSettings"];
  const stack = componentStack.split("\n").filter((line) => line.trim()).slice(0, 40).map((line) => {
    const component = line.match(/^\s*(?:at|in)\s+([\w$]+)/)?.[1] ?? "";
    const location = line.match(/:(\d+):(\d+)\)?\s*$/);
    return `at ${known.includes(component) ? component : "<component>"}${location ? ` (${location[1]}:${location[2]})` : ""}`;
  }).join("\n");
  return `ReadFlow\n错误名：${name}\n消息：${message}\n组件栈：\n${stack || "<unavailable>"}`;
}
