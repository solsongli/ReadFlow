export function canvasMock(annotations, query = "") {
  const documents = new Map();
  let count = 0;
  if (query.includes("canvas-large")) {
    const nodes = Array.from({ length: 300 }, (_, i) => ({
      id: `node-${i}`,
      type: i % 20 === 0 ? "group" : "sticky",
      x: (i % 20) * 320,
      y: Math.floor(i / 20) * 230,
      width: 260,
      height: 180,
      text: `Thought ${i}`,
    }));
    const edges = Array.from({ length: 200 }, (_, i) => ({
      id: `edge-${i}`,
      from_id: `node-${i}`,
      to_id: `node-${i + 1}`,
      label: "支持",
      style: "arrow",
    }));
    documents.set("large", { id: "large", name: "Large research canvas", group_id: null, nodes, edges });
  }
  const references = (annotation_id, item_id) =>
    [...documents.values()].flatMap((canvas) =>
      canvas.nodes
        .filter(
          (node) =>
            node.annotation_id &&
            (annotation_id ? node.annotation_id === annotation_id : node.item_id === item_id),
        )
        .map((node) => ({
          annotation_id: node.annotation_id,
          node_id: node.id,
          canvas_id: canvas.id,
          name: canvas.name,
        })),
    );
  function detach(id, policy) {
    const refs = references(id);
    if (refs.length && !policy) return false;
    for (const canvas of documents.values()) {
      const ids = canvas.nodes.filter((n) => n.annotation_id === id).map((n) => n.id);
      if (policy === "remove") {
        canvas.nodes = canvas.nodes.filter((n) => !ids.includes(n.id));
        canvas.edges = canvas.edges.filter((e) => !ids.includes(e.from_id) && !ids.includes(e.to_id));
      } else
        canvas.nodes = canvas.nodes.map((n) =>
          ids.includes(n.id) ? { ...n, annotation_id: null, orphaned: true } : n,
        );
    }
    return true;
  }
  async function route(route) {
    const url = new URL(route.request().url());
    const root = "/api/research/workbench/canvases";
    if (!url.pathname.startsWith(root)) return false;
    const parts = url.pathname.slice(root.length).split("/").filter(Boolean);
    const method = route.request().method();
    const body = ["POST", "PATCH"].includes(method) ? route.request().postDataJSON() : {};
    let result;
    if (parts[0] === "references")
      result = { items: references(url.searchParams.get("annotation_id"), url.searchParams.get("item_id")) };
    else if (!parts.length) {
      if (method === "POST") {
        const canvas = {
          id: `canvas-${++count}`,
          name: body.name,
          group_id: body.group_id || null,
          nodes: [],
          edges: [],
        };
        documents.set(canvas.id, canvas);
        result = canvas;
      } else result = { items: [...documents.values()].map(({ nodes, edges, ...meta }) => meta) };
    } else {
      const canvas = documents.get(parts[0]);
      if (!canvas) {
        await route.fulfill({ status: 404, json: { error: { message: "Missing canvas" } } });
        return true;
      }
      if (method === "DELETE") {
        documents.delete(canvas.id);
        await route.fulfill({ status: 204 });
        return true;
      }
      if (method === "PATCH") {
        if (body.name) canvas.name = body.name;
        if ("group_id" in body) canvas.group_id = body.group_id;
        canvas.nodes = canvas.nodes.filter((n) => !body.delete_nodes?.includes(n.id));
        canvas.edges = canvas.edges.filter(
          (e) =>
            !body.delete_edges?.includes(e.id) &&
            !body.delete_nodes?.includes(e.from_id) &&
            !body.delete_nodes?.includes(e.to_id),
        );
        for (const node of body.nodes || []) {
          const old = canvas.nodes.find((n) => n.id === node.id);
          const annotation = annotations().find((a) => a.id === node.annotation_id);
          const value = {
            ...old,
            ...node,
            ...(annotation
              ? {
                  quote: annotation.quote,
                  color: annotation.color,
                  page: annotation.page_index + 1,
                  item_id: annotation.item_id,
                  type: annotation.image_ref ? "image" : node.type,
                  image_ref: annotation.image_ref,
                  image: annotation.image,
                  title: `Paper ${annotation.item_id}`,
                  citekey: "zhang2025",
                }
              : {}),
          };
          canvas.nodes = canvas.nodes.filter((n) => n.id !== node.id);
          canvas.nodes.push(value);
        }
        for (const edge of body.edges || []) {
          canvas.edges = canvas.edges.filter((e) => e.id !== edge.id);
          canvas.edges.push(edge);
        }
      }
      if (parts[1] === "nodes" && parts[3] === "image") {
        const node = canvas.nodes.find((n) => n.id === parts[2]);
        await route.fulfill({
          contentType: "image/png",
          body: Buffer.from(node.image.split(",")[1], "base64"),
        });
        return true;
      }
      result = canvas;
    }
    await route.fulfill({ json: result });
    return true;
  }
  return { route, documents, detach, references };
}
