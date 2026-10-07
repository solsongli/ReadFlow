// In-memory /workbench/todos for offline browser fixtures; mirrors backend/library_mvp/todos.py ordering.
export function createTodoRoutes(titles = {}) {
  const todos = [];
  let serial = 0;
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS" };
  const listing = () =>
    [...todos].sort((a, b) => a.done - b.done || (a.done ? (b.done_at || "").localeCompare(a.done_at || "") : a.position - b.position));
  const reply = (route, status, body) =>
    route.fulfill({ status, headers: { ...cors, "content-type": "application/json" }, body: body === undefined ? "" : JSON.stringify(body) });
  async function handle(route) {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const match = path.match(/\/api\/research\/workbench\/todos(?:\/([^/]+))?$/);
    if (!match) return false;
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors }), true;
    const body = request.postData() ? JSON.parse(request.postData()) : {};
    const tail = match[1] && decodeURIComponent(match[1]);
    const now = () => new Date(Date.UTC(2026, 9, 7, 8, 0, serial++)).toISOString();
    if (!tail && request.method() === "GET") return reply(route, 200, { items: listing() }), true;
    if (!tail && request.method() === "POST") {
      if (!body.title?.trim()) return reply(route, 400, { error: { message: "title must not be empty." } }), true;
      const open = todos.filter((t) => !t.done);
      const todo = { id: `todo${serial}`, title: body.title.trim(), done: false, position: Math.max(0, ...open.map((t) => t.position)) + 1,
        due: body.due || null, item_id: body.item_id || null, item_title: body.item_id ? titles[body.item_id] ?? null : null,
        created_at: now(), updated_at: now(), done_at: null };
      todos.push(todo);
      return reply(route, 201, todo), true;
    }
    if (tail === "reorder") {
      body.ids.forEach((id, index) => (todos.find((t) => t.id === id).position = index + 1));
      return reply(route, 200, { items: listing() }), true;
    }
    if (tail === "clear-done") {
      const removed = todos.filter((t) => t.done).length;
      todos.splice(0, todos.length, ...todos.filter((t) => !t.done));
      return reply(route, 200, { removed }), true;
    }
    const todo = todos.find((t) => t.id === tail);
    if (!todo) return reply(route, 404, { error: { message: "missing" } }), true;
    if (request.method() === "DELETE") {
      todos.splice(todos.indexOf(todo), 1);
      return reply(route, 204), true;
    }
    if ("done" in body && body.done !== todo.done) {
      todo.done_at = body.done ? now() : null;
      if (!body.done) todo.position = Math.max(0, ...todos.filter((t) => !t.done).map((t) => t.position)) + 1;
    }
    Object.assign(todo, body, { updated_at: now() });
    if ("item_id" in body) todo.item_title = body.item_id ? titles[body.item_id] ?? null : null;
    return reply(route, 200, todo), true;
  }
  return { todos, handle };
}
