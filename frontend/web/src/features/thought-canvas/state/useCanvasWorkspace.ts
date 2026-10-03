import { useCallback, useEffect, useRef, useState } from "react";
import { canvasApi } from "./api.js";
import { difference, remember, travel, type History } from "../domain/history.js";
import type { CanvasData, CanvasNode, CanvasSummary, Point, SourceTarget } from "../domain/types.js";
export function newIdentity() {
  return "canvas-" + crypto.getRandomValues(new Uint32Array(4)).join("-");
}
export interface WorkspacePorts {
  open: (id: string, name: string, nodeId?: string) => void;
  source: (target: SourceTarget) => void;
  deleted: (id: string) => void;
  groups: Array<{ id: string; name: string }>;
  resolveSelection?: (item: string) => Promise<string[]>;
}
export function useWorkspace(ports: WorkspacePorts) {
  const [list, setList] = useState<CanvasSummary[]>([]);
  const [documents, setDocuments] = useState<Record<string, CanvasData>>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState(0);
  const latest = useRef(documents);
  const acknowledged = useRef<Record<string, CanvasData>>({});
  const history = useRef<Record<string, History>>({});
  const pending = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const running = useRef(new Map<string, Promise<void>>());
  const deleted = useRef(new Set<string>());
  const selectionProviders = useRef(new Map<string, () => Promise<string[]>>());
  const retryAction = useRef<() => void>(() => void refresh());
  const portRef = useRef(ports);
  portRef.current = ports;
  function publish(id: string, value: CanvasData) {
    latest.current = { ...latest.current, [id]: value };
    setDocuments(latest.current);
  }
  async function refresh() {
    try {
      setList(await canvasApi.list());
      setError("");
    } catch (failure) {
      setError((failure as Error).message);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  const load = useCallback(async (id: string) => {
    if (latest.current[id]) {
      return;
    }
    try {
      const value = await canvasApi.get(id);
      if (!latest.current[id] && !deleted.current.has(id)) {
        acknowledged.current[id] = value;
        publish(id, value);
      }
    } catch (failure) {
      setError((failure as Error).message);
      retryAction.current = () => void load(id);
    }
  }, []);
  async function flush(id: string): Promise<void> {
    clearTimeout(pending.current.get(id));
    pending.current.delete(id);
    if (running.current.has(id)) {
      return running.current.get(id);
    }
    if (
      !acknowledged.current[id] ||
      !latest.current[id] ||
      acknowledged.current[id] === latest.current[id] ||
      deleted.current.has(id)
    ) {
      return;
    }
    const work = async () => {
      setSaving(true);
      try {
        while (!deleted.current.has(id)) {
          const before = acknowledged.current[id],
            after = latest.current[id];
          if (!before || !after || before === after) {
            break;
          }
          const result = await canvasApi.patch(id, difference(before, after));
          acknowledged.current[id] = result;
          // Keep newer unsaved geometry; merge canonical source metadata from the server.
          const current = latest.current[id];
          if (current === after) {
            publish(id, result);
          } else {
            publish(id, {
              ...current,
              nodes: current.nodes.map((node) => {
                const saved = result.nodes.find((value) => value.id === node.id);
                return saved ? { ...saved, ...node, image_ref: saved.image_ref } : node;
              }),
            });
          }
          if (current === after) {
            break;
          }
        }
        setRevision((value) => value + 1);
        setError("");
      } catch (failure) {
        setError((failure as Error).message);
        retryAction.current = () => void flush(id);
      } finally {
        running.current.delete(id);
        setSaving(running.current.size > 0 || pending.current.size > 0);
      }
    };
    const promise = work();
    running.current.set(id, promise);
    void promise.then(() => {
      if (running.current.get(id) === promise) {
        running.current.delete(id);
      }
    });
    return promise;
  }
  function change(id: string, next: CanvasData, record = true) {
    const previous = latest.current[id];
    if (!previous) {
      return;
    }
    if (record) {
      history.current[id] = remember(history.current[id] ?? { past: [], future: [] }, previous);
    }
    publish(id, next);
    setSaving(true);
    clearTimeout(pending.current.get(id));
    pending.current.set(
      id,
      setTimeout(() => void flush(id), 300),
    );
  }
  function undo(id: string, redo: boolean) {
    const current = latest.current[id];
    const result = current && travel(history.current[id] ?? { past: [], future: [] }, current, redo);
    if (!result) {
      return;
    }
    history.current[id] = result.history;
    change(id, { ...current, nodes: result.target.nodes, edges: result.target.edges }, false);
  }
  async function create(name: string, group: string | null = null, open = true) {
    try {
      const data = await canvasApi.create(name, group);
      acknowledged.current[data.id] = data;
      publish(data.id, data);
      await refresh();
      if (open) {
        portRef.current.open(data.id, data.name);
      }
      return data;
    } catch (failure) {
      setError((failure as Error).message);
    }
  }
  async function rename(id: string, name: string, group_id?: string | null) {
    try {
      await flush(id);
      const before = latest.current[id];
      const data = await canvasApi.patch(id, { name, ...(group_id !== undefined ? { group_id } : {}) });
      acknowledged.current[id] = data;
      const current = latest.current[id];
      publish(
        id,
        current && current !== before
          ? { ...current, name: data.name, group_id: data.group_id, updated_at: data.updated_at }
          : data,
      );
      await refresh();
    } catch (failure) {
      setError((failure as Error).message);
    }
  }
  async function remove(id: string) {
    try {
      await flush(id);
      await canvasApi.remove(id);
      deleted.current.add(id);
      clearTimeout(pending.current.get(id));
      portRef.current.deleted(id);
      await refresh();
    } catch (failure) {
      setError((failure as Error).message);
    }
  }
  async function add(id: string, value: Partial<CanvasNode>, at: Point = { x: 80, y: 80 }) {
    await load(id);
    const current = latest.current[id];
    if (!current) {
      return;
    }
    const node: CanvasNode = {
      id: newIdentity(),
      type: "sticky",
      x: at.x,
      y: at.y,
      width: 260,
      height: 180,
      text: "",
      ...value,
    };
    change(id, { ...current, nodes: [...current.nodes, node] });
    await flush(id);
    return node.id;
  }
  async function reload() {
    for (const id of Object.keys(latest.current)) {
      await flush(id);
      const current = latest.current[id];
      const data = await canvasApi.get(id);
      if (latest.current[id] === current && !running.current.has(id)) {
        if (
          JSON.stringify(current.nodes) !== JSON.stringify(data.nodes) ||
          JSON.stringify(current.edges) !== JSON.stringify(data.edges)
        ) {
          history.current[id] = { past: [], future: [] };
        }
        acknowledged.current[id] = data;
        publish(id, data);
      }
    }
    setRevision((value) => value + 1);
  }
  useEffect(
    () => () => {
      for (const [id, timer] of pending.current) {
        clearTimeout(timer);
        void flush(id);
      }
    },
    [],
  );
  return {
    list,
    documents,
    error,
    saving,
    revision,
    load,
    refresh,
    change,
    undo,
    create,
    rename,
    remove,
    add,
    reload,
    flush,
    open: ports.open,
    source: ports.source,
    groups: ports.groups,
    resolveSelection: (item: string) => selectionProviders.current.get(item)?.() ?? Promise.resolve([]),
    registerSelection: (item: string, provider: () => Promise<string[]>) => {
      selectionProviders.current.set(item, provider);
      return () => {
        if (selectionProviders.current.get(item) === provider) {
          selectionProviders.current.delete(item);
        }
      };
    },
    retry: () => retryAction.current(),
    history: history.current,
  };
}
export type Workspace = ReturnType<typeof useWorkspace>;
