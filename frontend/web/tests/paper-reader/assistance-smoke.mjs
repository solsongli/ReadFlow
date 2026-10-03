import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { readerBrowser } from "./browser.mjs";
const output = "/tmp/readflow-r4/screenshots";
await mkdir(output, { recursive: true });
const checks = [];
async function open(query) {
  const env = await readerBrowser(query, "tests/paper-reader/integration-fixture.tsx");
  try {
    await env.page.getByRole("option", { name: "Paper a", exact: true }).dblclick();
    const input = env.page.getByRole("spinbutton", { name: "页码" });
    await input.fill("1");
    await input.press("Enter");
    await env.page.locator('[data-paper-page="1"] .pr-text-layer span').first().waitFor();
    return env;
  } catch (error) {
    await env.browser.close();
    throw error;
  }
}
async function select(page) {
  await page
    .locator("[data-annotation-source=true] .pr-text-layer span")
    .filter({ hasText: "We follow" })
    .first()
    .evaluate((span) => {
      const range = document.createRange();
      range.selectNodeContents(span);
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    });
  await page.getByRole("toolbar", { name: "选中文字工具条" }).waitFor();
}
const env = await open("?configured");
const { page, assistance, annotations, canvases } = env;
try {
  assert.equal(assistance.calls.length, 0);
  await select(page);
  await page
    .getByRole("toolbar", { name: "选中文字工具条" })
    .getByRole("button", { name: "翻译", exact: true })
    .click();
  const card = page.getByRole("region", { name: "选段译文" });
  await card.getByText(/【译】We follow/).waitFor();
  await card.getByRole("button", { name: "复制译文", exact: true }).click();
  assert.match(await page.evaluate(() => navigator.clipboard.readText()), /【译】/);
  await card.getByRole("button", { name: "作为批注说明保存", exact: true }).click();
  await card.getByText("已保存为批注说明", { exact: true }).waitFor();
  assert.match(annotations()[0].note, /【译】/);
  await page.screenshot({ path: output + "/selection-translation.png" });
  await card.getByRole("button", { name: "关闭", exact: true }).click();
  const popup = page.getByRole("region", { name: "编辑批注" });
  if (await popup.count()) await popup.getByRole("button", { name: "收起", exact: true }).click();
  await select(page);
  await page.getByLabel("原文页面", { exact: true }).focus();
  await page.keyboard.press("t");
  await card.getByText(/【译】We follow/).waitFor();
  assert.equal(assistance.calls.filter((c) => c.action === "translate").length, 1);
  await card.getByRole("button", { name: "关闭", exact: true }).click();
  checks.push("selection translation, copy, annotation save, T shortcut and session cache");
  await select(page);
  await page
    .getByRole("toolbar", { name: "选中文字工具条" })
    .getByRole("button", { name: "问 AI", exact: true })
    .click();
  await page.evaluate(() => {
    const fetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const response = await fetch(...args);
      if (!String(args[0]).endsWith("/assistance/ask") || !response.ok) return response;
      const chunks = (await response.text()).split("\n\n").filter(Boolean);
      const encoder = new TextEncoder();
      return new Response(
        new ReadableStream({
          start(controller) {
            chunks.forEach((chunk, index) =>
              setTimeout(() => {
                controller.enqueue(encoder.encode(chunk + "\n\n"));
                if (index === chunks.length - 1) controller.close();
              }, index * 180),
            );
          },
        }),
        { headers: { "Content-Type": "text/event-stream" } },
      );
    };
  });
  const panel = page.getByRole("region", { name: "AI 伴读对话" });
  await panel.getByRole("textbox", { name: "向 AI 提问" }).fill("解释这段证据");
  await panel.getByRole("button", { name: "提问", exact: true }).click();
  const privacy = panel.getByRole("region", { name: "发送隐私确认" });
  await privacy.waitFor();
  assert.equal(assistance.calls.filter((c) => c.action === "ask").length, 0);
  await page.screenshot({ path: output + "/privacy-confirmation.png" });
  await privacy.getByRole("checkbox", { name: "本文献不再提示", exact: true }).check();
  assert.equal(assistance.calls.filter((c) => c.action === "ask").length, 0);
  await privacy.getByRole("button", { name: "发送", exact: true }).click();
  await panel.getByRole("article", { name: "正在生成的回答" }).waitFor();
  await panel.getByRole("button", { name: "保存为笔记", exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector('textarea[aria-label="向 AI 提问"]')?.value === "");
  assert.equal(assistance.calls.filter((c) => c.action === "ask").length, 1);
  assert.match(assistance.calls.find((c) => c.action === "ask").context.selection, /We follow/);
  assert.ok(assistance.calls.find((c) => c.action === "ask").context.page_text.length > 0);
  await panel.getByRole("link", { name: "(p. 2)", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("input[name=page]").value === "2");
  await page.screenshot({ path: output + "/ai-answer.png" });
  checks.push("quoted question, explicit privacy approval, SSE answer and page navigation");
  await panel.getByRole("button", { name: "加入画布", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "加入画布", exact: true });
  await picker.getByRole("textbox", { name: "画布名称", exact: true }).fill("AI ideas");
  await picker.getByRole("button", { name: "新建并加入", exact: true }).click();
  await picker.waitFor({ state: "hidden" });
  assert.equal([...canvases.documents.values()][0].nodes[0].type, "sticky");
  assert.match([...canvases.documents.values()][0].nodes[0].text, /这是假回答/);
  await panel.getByRole("button", { name: "保存为笔记", exact: true }).click();
  await page.getByRole("textbox", { name: "笔记正文", exact: true }).waitFor();
  assert.match(await page.getByRole("textbox", { name: "笔记正文", exact: true }).inputValue(), /这是假回答/);
  checks.push("answer to canvas sticky and notes workspace");
  await page
    .getByRole("navigation", { name: "阅读器标签页" })
    .getByRole("button", { name: "Paper a", exact: true })
    .click();
  await panel.getByRole("textbox", { name: "向 AI 提问" }).fill("继续解释");
  await panel.getByRole("button", { name: "提问", exact: true }).click();
  await page.waitForTimeout(150);
  assert.equal(await privacy.count(), 0);
  assert.equal(assistance.calls.filter((c) => c.action === "ask").length, 2);
  await page.waitForTimeout(400);
  assistance.setOffline(true);
  await page.reload();
  await page.getByRole("option", { name: "Paper a", exact: true }).dblclick();
  await page.getByRole("tab", { name: "AI", exact: true }).click();
  await panel.getByRole("status").filter({ hasText: "本地 AI 服务未运行" }).waitFor();
  assert.ok((await panel.getByRole("button", { name: "保存为笔记", exact: true }).count()) > 0);
  await page.screenshot({ path: output + "/offline-history.png" });
  checks.push("saved history remains readable while AI runtime is offline");
  await panel.getByRole("textbox", { name: "向 AI 提问" }).fill("保留待重试的问题");
  await panel.getByRole("button", { name: "提问", exact: true }).click();
  await panel.getByRole("status").filter({ hasText: "本地 AI 服务未运行" }).waitFor();
  await panel.getByRole("button", { name: "提问", exact: true }).waitFor();
  assert.equal(await panel.getByRole("textbox", { name: "向 AI 提问" }).inputValue(), "保留待重试的问题");
  assistance.setOffline(false);
  await panel.getByRole("button", { name: "重试", exact: true }).click();
  await panel.getByRole("button", { name: "清空会话", exact: true }).click();
  await panel.getByRole("button", { name: "确认清空", exact: true }).click();
  await page.waitForTimeout(100);
  assert.equal(assistance.sessions.get("a").messages.length, 0);
  checks.push("remembered per-paper consent and conversation clearing");
  assert.deepEqual(env.errors, []);
  assert.deepEqual(env.unexpected, []);
} catch (error) {
  await page.screenshot({ path: output + "/failure.png" });
  console.log({ errors: env.errors, unexpected: env.unexpected });
  throw error;
} finally {
  await env.browser.close();
}
for (const [query, label] of [
  ["", "unconfigured translation guide"],
  ["?ai-offline", "offline AI explanation"],
]) {
  const env = await open(query);
  const page = env.page;
  try {
    if (query) {
      await page.getByRole("tab", { name: "AI", exact: true }).click();
      await page
        .getByRole("status")
        .filter({ hasText: "本地 AI 服务未运行。AI 伴读需要它在后台运行；正式版启动时会自动开启。" })
        .waitFor();
    } else {
      await select(page);
      await page
        .getByRole("toolbar", { name: "选中文字工具条" })
        .getByRole("button", { name: "翻译", exact: true })
        .click();
      const region = page.getByRole("region", { name: "选段译文" });
      await region.getByText("还没有配置翻译服务", { exact: false }).waitFor();
      await region.getByRole("button", { name: "去设置", exact: true }).waitFor();
    }
    assert.equal(env.assistance.calls.length, 0);
    assert.deepEqual(env.errors, []);
    checks.push(label);
  } finally {
    await env.browser.close();
  }
}
await writeFile("/tmp/readflow-r4/scenarios.json", JSON.stringify(checks, null, 2));
console.log("PASS", checks.length, checks);
