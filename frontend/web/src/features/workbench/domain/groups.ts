// 分组树（纯函数）。分组是多对多的：一篇文献可以出现在任意多个分组里。

import type { WorkbenchGroup } from "@/platform/contracts/workbench.js";

export interface GroupNode {
  id: string;
  name: string;
  parentId: string | null;
  count: number;
  directCount: number;
  depth: number;
  children: GroupNode[];
}

const collator = new Intl.Collator("zh-Hans-CN", { numeric: true, sensitivity: "base" });

export function compareGroupNames(a: { name: string }, b: { name: string }): number {
  return collator.compare(a.name, b.name);
}

/** Roots first; a parent that no longer exists (or a cycle) turns the node into a root. */
export function buildGroupTree(groups: WorkbenchGroup[]): GroupNode[] {
  const byId = new Map(groups.map((group) => [group.id, group]));
  const children = new Map<string | null, WorkbenchGroup[]>();
  for (const group of groups) {
    let parent = group.parent_id && byId.has(group.parent_id) ? group.parent_id : null;
    const seen = new Set([group.id]);
    for (let cursor = parent; cursor; cursor = byId.get(cursor)?.parent_id ?? null) {
      if (seen.has(cursor)) {
        parent = null;
        break;
      }
      seen.add(cursor);
    }
    const list = children.get(parent) ?? [];
    list.push(group);
    children.set(parent, list);
  }
  const build = (parent: string | null, depth: number): GroupNode[] =>
    (children.get(parent) ?? [])
      .slice()
      .sort(compareGroupNames)
      .map((group) => ({
        id: group.id,
        name: group.name,
        parentId: group.parent_id,
        count: group.count,
        directCount: group.direct_count,
        depth,
        children: build(group.id, depth + 1),
      }));
  return build(null, 0);
}

/** Pre-order list. With `expanded`, children of collapsed nodes are skipped. */
export function flattenGroupTree(nodes: GroupNode[], expanded?: ReadonlySet<string>): GroupNode[] {
  const output: GroupNode[] = [];
  const visit = (list: GroupNode[]) => {
    for (const node of list) {
      output.push(node);
      if (!expanded || expanded.has(node.id)) visit(node.children);
    }
  };
  visit(nodes);
  return output;
}

export function groupPath(groups: WorkbenchGroup[], id: string): string[] {
  const byId = new Map(groups.map((group) => [group.id, group]));
  const path: string[] = [];
  const seen = new Set<string>();
  for (let cursor: string | null = id; cursor && !seen.has(cursor); cursor = byId.get(cursor)?.parent_id ?? null) {
    seen.add(cursor);
    const group = byId.get(cursor);
    if (!group) break;
    path.unshift(group.name);
  }
  return path;
}

export function groupLabel(groups: WorkbenchGroup[], id: string, separator = " › "): string {
  return groupPath(groups, id).join(separator);
}

export function descendantIds(groups: WorkbenchGroup[], id: string): Set<string> {
  const result = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const group of groups) {
      if (group.parent_id && result.has(group.parent_id) && !result.has(group.id)) {
        result.add(group.id);
        grew = true;
      }
    }
  }
  return result;
}

/** Groups to show as chips on a row: the paper's groups minus the one being browsed (and its ancestors). */
export function chipGroups(groups: WorkbenchGroup[], groupIds: string[], browsing: string | null): WorkbenchGroup[] {
  const byId = new Map(groups.map((group) => [group.id, group]));
  const hidden = new Set<string>();
  for (let cursor = browsing; cursor && !hidden.has(cursor); cursor = byId.get(cursor)?.parent_id ?? null) {
    hidden.add(cursor);
  }
  return groupIds
    .filter((id) => !hidden.has(id) && byId.has(id))
    .map((id) => byId.get(id) as WorkbenchGroup)
    .sort(compareGroupNames);
}
