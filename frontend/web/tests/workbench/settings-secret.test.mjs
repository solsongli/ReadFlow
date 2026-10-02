import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
const dom = new JSDOM("<div id='root'></div><button id='outside'>Outside</button>", { url: "http://settings.test" });
for (const name of ["window", "document", "HTMLElement", "HTMLInputElement", "Event", "FocusEvent"]) Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name] });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = await import("react");
const { createRoot } = await import("react-dom/client");
const { SecretField } = await import("@/ui/wb/SecretField.js");
test("secret controls mask by default and restore masking on blur, app blur and page remount", async () => {
  const root = createRoot(document.getElementById("root"));
  const render = (key) => React.createElement(SecretField, { key, label: "测试凭据", value: "演示凭据", onChange() {} });
  try {
    await React.act(async () => root.render(render("translation")));
    assert.equal(document.querySelector("input").type, "password");
    await React.act(async () => document.querySelector("#root button").click());
    assert.equal(document.querySelector("input").type, "text");
    await React.act(async () => document.getElementById("outside").focus());
    assert.equal(document.querySelector("input").type, "password");
    await React.act(async () => document.querySelector("#root button").click());
    await React.act(async () => window.dispatchEvent(new Event("blur")));
    assert.equal(document.querySelector("input").type, "password");
    await React.act(async () => document.querySelector("#root button").click());
    await React.act(async () => root.render(render("ai")));
    assert.equal(document.querySelector("input").type, "password");
  } finally { await React.act(async () => root.unmount()); dom.window.close(); }
});
