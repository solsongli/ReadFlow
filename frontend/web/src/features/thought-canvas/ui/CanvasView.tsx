import { EdgeEditor } from "./EdgeEditor.js";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/ui/wb/Button.js";
import { downloadBlob } from "@/platform/utils/downloads.js";
import { CANVAS_DRAG, type CanvasData, type NodeType } from "../domain/types.js";
import { fit, visibleNodes, world, intersects } from "../domain/geometry.js";
import { parseDrop } from "../domain/drag.js";
import { outline } from "../domain/outline.js";
import { useCanvasGestures } from "../state/useCanvasGestures.js";
import { useCanvases } from "./context.js";
import { NodeCard } from "./NodeCard.js";
import { Edges } from "./Edges.js";
import { CanvasToolbar } from "./CanvasToolbar.js";
export function CanvasView({
  id,
  focusNode,
  focusKey,
  active = true,
  titleControl,
  endControl,
}: {
  id: string;
  focusNode?: string;
  focusKey?: number;
  active?: boolean;
  titleControl?: ReactNode;
  endControl?: ReactNode;
}) {
  const workspace = useCanvases();
  useEffect(() => {
    if (active) {
      void workspace.load(id);
    }
  }, [id, active]);
  const data = workspace.documents[id];
  if (!data) {
    return (
      <div role="status" className="p-5 text-wb-text-3">
        {workspace.error || "正在打开画布…"}
        {workspace.error ? <Button onClick={workspace.retry}>重试</Button> : null}
      </div>
    );
  }
  return (
    <CanvasSurface
      titleControl={titleControl}
      endControl={endControl}
      data={data}
      focusNode={focusNode}
      focusKey={focusKey}
      active={active}
    />
  );
}
function CanvasSurface({
  data,
  focusNode,
  focusKey,
  active,
  titleControl,
  endControl,
}: {
  data: CanvasData;
  focusNode?: string;
  focusKey?: number;
  active: boolean;
  titleControl?: ReactNode;
  endControl?: ReactNode;
}) {
  const workspace = useCanvases();
  const g = useCanvasGestures(
    data,
    (next) => workspace.change(data.id, next),
    (redo) => workspace.undo(data.id, redo),
  );
  const [size, setSize] = useState({ width: 800, height: 700 });
  const [dropError, setDropError] = useState("");
  const searchIndex = useRef(-1);
  const focusSeen = useRef("");
  useEffect(() => {
    const element = g.root.current!;
    const observer = new ResizeObserver(() =>
      setSize({ width: element.clientWidth, height: element.clientHeight }),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  function focus(id: string) {
    const node = data.nodes.find((n) => n.id === id);
    if (!node) {
      return;
    }
    g.setSelected([id]);
    g.setView((view) => ({
      ...view,
      x: size.width / 2 - (node.x + node.width / 2) * view.zoom,
      y: size.height / 2 - (node.y + node.height / 2) * view.zoom,
    }));
  }
  useEffect(() => {
    const key = `${focusNode}:${focusKey}`;
    if (
      focusNode &&
      active &&
      key !== focusSeen.current &&
      data.nodes.some((node) => node.id === focusNode)
    ) {
      focus(focusNode);
      focusSeen.current = key;
    }
  }, [focusNode, focusKey, active, data.nodes.length]);
  useEffect(() => {
    const element = g.root.current!;
    const wheel = (event: WheelEvent) => {
      if (!active) {
        return;
      }
      event.preventDefault();
      if (event.ctrlKey) {
        const rect = element.getBoundingClientRect();
        g.zoom(
          { x: event.clientX - rect.left, y: event.clientY - rect.top },
          g.view.zoom * Math.exp(-event.deltaY * 0.002),
        );
      } else {
        g.setView((view) => ({ ...view, x: view.x - event.deltaX, y: view.y - event.deltaY }));
      }
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [active, g.view]);
  const nodes = visibleNodes(g.nodes, g.view, size.width, size.height).sort(
    (a, b) => Number(b.type === "group") - Number(a.type === "group"),
  );
  function add(type: NodeType) {
    const center = world({ x: size.width / 2 - 130, y: size.height / 2 - 90 }, g.view);
    const start = { ...center };
    if (type !== "group") {
      for (let attempt = 0; attempt < 2000; attempt++) {
        if (
          !data.nodes.some(
            (node) =>
              node.type !== "group" &&
              intersects(node, { x: center.x - 15, y: center.y - 15, width: 290, height: 210 }),
          )
        ) {
          break;
        }
        center.x = start.x + ((attempt + 1) % 4) * 300;
        center.y = start.y + Math.floor((attempt + 1) / 4) * 220;
      }
    }
    const width = type === "group" ? 600 : 260;
    const height = type === "group" ? 400 : 180;
    void workspace
      .add(data.id, { type, width, height, text: type === "group" ? "分组" : "" }, center)
      .then((id) => {
        if (!id) {
          return;
        }
        g.setSelected([id]);
        g.setView((view) => ({
          ...view,
          x: size.width / 2 - (center.x + width / 2) * view.zoom,
          y: size.height / 2 - (center.y + height / 2) * view.zoom,
        }));
      });
  }
  function find(query: string, direction: number) {
    const results = data.nodes.filter((node) =>
      `${node.text} ${node.quote || ""} ${node.title || ""}`.toLowerCase().includes(query.toLowerCase()),
    );
    if (!query || !results.length) {
      return;
    }
    searchIndex.current = direction ? (searchIndex.current + direction + results.length) % results.length : 0;
    focus(results[searchIndex.current].id);
  }
  const edge = data.edges.find((value) => value.id === g.edge);
  return (
    <section
      onKeyDown={g.key}
      onKeyUp={g.release}
      data-thought-canvas={data.id}
      className="flex h-full min-h-0 min-w-0 flex-1 flex-col"
    >
      <CanvasToolbar
        title={data.name}
        titleControl={titleControl}
        endControl={endControl}
        gesture={g}
        add={add}
        fit={() => g.setView(fit(data.nodes, size.width, size.height))}
        undo={(redo) => workspace.undo(data.id, redo)}
        find={find}
        exportFile={() =>
          downloadBlob(new Blob([outline(data)], { type: "text/markdown;charset=utf-8" }), `${data.name}.md`)
        }
      />
      <div
        ref={g.root}
        tabIndex={0}
        aria-label="思考画布"
        className="tc-surface relative min-h-0 flex-1 overflow-clip outline-none"
        style={{
          backgroundPosition: `${g.view.x}px ${g.view.y}px`,
          backgroundSize: `${20 * g.view.zoom}px ${20 * g.view.zoom}px`,
        }}
        onPointerDown={g.down}
        onPointerMove={g.move}
        onPointerUp={g.up}
        onPointerCancel={g.up}
        onKeyDown={g.key}
        onKeyUp={g.release}
        onBlur={g.release}
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes(CANVAS_DRAG)) {
            event.preventDefault();
          }
        }}
        onDrop={async (event) => {
          const value = parseDrop(event.dataTransfer.getData(CANVAS_DRAG));
          if (!value) {
            return;
          }
          event.preventDefault();
          const bounds = event.currentTarget.getBoundingClientRect();
          const at = world({ x: event.clientX - bounds.left, y: event.clientY - bounds.top }, g.view);
          try {
            const ids =
              value.type === "selection"
                ? ((await workspace.resolveSelection?.(value.itemId)) ?? [])
                : value.annotationId
                  ? [value.annotationId]
                  : [];
            if (value.type === "selection" && !ids.length) {
              throw new Error("请先选中原文文字。");
            }
            if (value.type === "paper") {
              await workspace.add(data.id, { type: "paper", item_id: value.itemId }, at);
            } else {
              for (const [index, id] of ids.entries()) {
                await workspace.add(
                  data.id,
                  { type: "excerpt", annotation_id: id },
                  { x: at.x + index * 24, y: at.y + index * 24 },
                );
              }
            }
            setDropError("");
          } catch (failure) {
            setDropError((failure as Error).message);
          }
        }}
      >
        <Edges
          nodes={g.nodes}
          edges={data.edges}
          view={g.view}
          width={size.width}
          height={size.height}
          selected={g.edge}
          select={(id) => {
            g.setEdge(id);
            g.setSelected([]);
          }}
          connection={g.connection}
        />
        <div
          className="pointer-events-none absolute origin-top-left"
          style={{ transform: `translate(${g.view.x}px,${g.view.y}px) scale(${g.view.zoom})` }}
        >
          {nodes.map((node) => (
            <div key={node.id} className="pointer-events-auto">
              <NodeCard
                node={node}
                canvas={data.id}
                selected={g.selected.includes(node.id)}
                source={workspace.source}
                edit={(text) =>
                  workspace.change(data.id, {
                    ...data,
                    nodes: data.nodes.map((n) => (n.id === node.id ? { ...n, text } : n)),
                  })
                }
              />
            </div>
          ))}
          {g.selection ? (
            <div
              className="tc-marquee absolute"
              style={{
                left: g.selection.x,
                top: g.selection.y,
                width: g.selection.width,
                height: g.selection.height,
              }}
            />
          ) : null}
        </div>
        {!data.nodes.length ? (
          <p className="pointer-events-none absolute inset-x-8 top-16 text-center text-[0.8125rem] text-wb-text-3">
            把摘录拖到这里，或添加一张便签开始思考。
          </p>
        ) : null}
        {edge ? (
          <EdgeEditor
            edge={edge}
            remove={g.remove}
            save={(value) =>
              workspace.change(data.id, {
                ...data,
                edges: data.edges.map((e) => (e.id === value.id ? value : e)),
              })
            }
          />
        ) : null}
      </div>
      <div
        role="status"
        className="flex shrink-0 gap-2 bg-wb-panel px-3 py-1 text-[0.6875rem] text-wb-text-3"
      >
        {dropError || workspace.error || (workspace.saving ? "正在保存…" : "已保存")}
        {workspace.error ? (
          <Button size="sm" onClick={workspace.retry}>
            重试
          </Button>
        ) : null}
        <span className="ml-auto">空格拖动平移 · Ctrl 滚轮缩放</span>
      </div>
    </section>
  );
}
