export function assistanceMock(query) {
  const sessions = new Map();
  const calls = [];
  const status = {
    service: "本地假服务",
    model: "fixture",
    target: "fixture-service",
    external_models_allowed: true,
  };
  let offline = query.includes("ai-offline");
  async function route(route) {
    const url = new URL(route.request().url()),
      path = url.pathname;
    if (path === "/api/research/workbench/assistance/status") {
      await route.fulfill(
        offline ? { status: 503, json: { error: { code: "ai_offline" } } } : { json: status },
      );
      return true;
    }
    const match = path.match(
      /^\/api\/research\/workbench\/items\/([^/]+)\/assistance\/(translate|conversation|ask)$/,
    );
    if (!match) return false;
    const method = route.request().method();
    const value = method === "POST" ? route.request().postDataJSON() : {};
    const item = match[1],
      action = match[2];
    if (!sessions.has(item)) sessions.set(item, { messages: [], consent_target: "", generation: 0 });
    const session = sessions.get(item);
    if (action === "translate") {
      calls.push({ action, text: value.text });
      await route.fulfill({ json: { text: "【译】" + value.text, service: status.service } });
      return true;
    }
    if (action === "conversation") {
      if (method === "DELETE") {
        session.messages = [];
        session.consent_target = "";
        session.generation++;
      }
      await route.fulfill({ json: session });
      return true;
    }
    calls.push({ action, question: value.question, context: value });
    if (!value.consent && session.consent_target !== status.target) {
      await route.fulfill({ status: 409, json: { error: { code: "consent_required" } } });
      return true;
    }
    if (value.remember) session.consent_target = status.target;
    const text = value.question.includes("闪卡建议")
      ? JSON.stringify({ front: "这段证据支持什么结论？", back: "这是仅供验收的闪卡建议。" })
      : "这是假回答 (p. 2)\n\n**本地证据**，请核对原文。";
    session.messages.push({
      id: String(session.messages.length),
      role: "user",
      body: value.question,
      page: value.page,
    });
    session.messages.push({
      id: String(session.messages.length),
      role: "assistant",
      body: text,
      page: value.page,
    });
    const events = [
      { type: "delta", text: "这是假回答 " },
      { type: "delta", text: "(p. 2)" },
      { type: "done", text },
    ];
    await route.fulfill({
      contentType: "text/event-stream",
      body: events.map((event) => "data: " + JSON.stringify(event) + "\n\n").join(""),
    });
    return true;
  }
  return {
    route,
    calls,
    sessions,
    setOffline: (value) => {
      offline = value;
    },
  };
}
