import { useState } from "react";
import { ArrowRight, KeyRound, Link2, Table2 } from "lucide-react";
import { DatabaseColumn, DatabaseSchema, SchemaInsights } from "../types/api";

type Props = {
  schema?: DatabaseSchema | null;
  insights?: SchemaInsights | null;
};

type Rect = { x: number; y: number; w: number; h: number };
type Point = { x: number; y: number };

const NODE_W = 236;
const CELL_W = 284;
const HEADER_H = 38;
const ROW_H = 26;

export function SchemaGraph({ schema, insights }: Props) {
  const [hoveredTable, setHoveredTable] = useState<string | null>(null);
  const [pinnedTable, setPinnedTable] = useState<string | null>(null);
  const tables = Object.entries(schema?.tables ?? {});
  const edges = insights?.edges ?? [];

  const layout = buildLayout(tables, edges);

  const activeTable = pinnedTable ?? hoveredTable;
  const relatedEdges = activeTable
    ? edges.filter((edge) => edge.from === activeTable || edge.to === activeTable)
    : [];
  const relatedTables = new Set<string>(activeTable ? [activeTable] : []);
  for (const edge of relatedEdges) {
    relatedTables.add(edge.from);
    relatedTables.add(edge.to);
  }
  const relatedEdgeKeys = new Set(relatedEdges.map((edge) => `${edge.from}-${edge.column}-${edge.to}`));

  function togglePinned(name: string) {
    setPinnedTable((current) => (current === name ? null : name));
  }

  return (
    <section className="card p-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-500/10 text-brand-400">
            <Link2 size={16} />
          </span>
          <h2 className="font-display text-base font-semibold tracking-tight text-ink">Entity relationships</h2>
        </div>
        <span className="text-[11px] font-medium text-ink-faint">
          {edges.length} link{edges.length === 1 ? "" : "s"} · hover or click a table to trace its relationships
        </span>
      </div>

      {tables.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-white/[0.03] px-6 py-10 text-center text-sm text-ink-soft">
          No schema discovered yet. Save a live database connection to load tables and columns.
        </div>
      ) : (
        <div className="panel-soft overflow-x-auto p-4">
          <div
            className="relative mx-auto"
            onClick={() => setPinnedTable(null)}
            style={{ height: layout.height, minWidth: layout.width, width: layout.width }}
          >
            <svg className="absolute left-0 top-0 overflow-visible" height={layout.height} width={layout.width}>
              {layout.links.map((link) => {
                const key = `${link.edge.from}-${link.edge.column}-${link.edge.to}`;
                const isRelated = !activeTable || relatedEdgeKeys.has(key);
                return (
                  <g key={key} className={isRelated ? undefined : "opacity-20"}>
                    <path
                      d={link.path}
                      fill="none"
                      strokeWidth={activeTable && isRelated ? 2.5 : 1.5}
                      className={activeTable && isRelated ? "stroke-brand-400" : "stroke-white/20"}
                    />
                    <circle cx={link.from.x} cy={link.from.y} r={3.5} className={activeTable && isRelated ? "fill-brand-400" : "fill-brand-400"} />
                    <circle cx={link.to.x} cy={link.to.y} r={3.5} className={activeTable && isRelated ? "fill-brand-400" : "fill-brand-400"} />
                  </g>
                );
              })}
            </svg>
            {layout.nodes.map((node) => {
              const isSelected = node.name === activeTable;
              const isRelated = !activeTable || relatedTables.has(node.name);
              return (
                <article
                  className={`absolute cursor-pointer rounded-xl border bg-surface transition hover:shadow-md ${
                    isSelected
                      ? "z-10 border-brand-400 shadow-lg ring-2 ring-brand-500/25"
                      : node.degree > 0 && isRelated
                        ? "border-brand-500/40 ring-1 ring-brand-500/15"
                        : "border-line"
                  } ${isRelated ? "" : "opacity-30"}`}
                  key={node.name}
                  onClick={(event) => {
                    event.stopPropagation();
                    togglePinned(node.name);
                  }}
                  onMouseEnter={() => setHoveredTable(node.name)}
                  onMouseLeave={() => setHoveredTable(null)}
                  style={{ left: node.rect.x, top: node.rect.y, width: node.rect.w, height: node.rect.h }}
                >
                <header
                  className="flex items-center justify-between gap-2 rounded-t-xl border-b border-line bg-gradient-to-r from-brand-500/10 to-transparent px-3"
                  style={{ height: HEADER_H }}
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <Table2 className="shrink-0 text-brand-400" size={13} />
                    <strong className="truncate font-mono text-[12px] text-ink" title={node.name}>{node.name}</strong>
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    {node.degree > 0 && (
                      <span className="rounded-full bg-brand-500/20 px-1.5 py-0.5 text-[10px] font-bold text-brand-300">
                        {node.degree} link{node.degree === 1 ? "" : "s"}
                      </span>
                    )}
                    <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-ink-soft">
                      {node.columns.length} col{node.columns.length === 1 ? "" : "s"}
                    </span>
                  </span>
                </header>
                <ul>
                  {node.columns.map((column) => (
                    <li
                      className="flex items-center justify-between gap-2 px-3"
                      key={column.name}
                      style={{ height: ROW_H }}
                    >
                      <span className="truncate font-mono text-[11px] text-ink-soft" title={column.name}>{column.name}</span>
                      <span className="flex shrink-0 items-center gap-1">
                        <span className="rounded bg-white/10 px-1 py-0.5 font-mono text-[9px] text-ink-soft">{column.type}</span>
                        {node.foreignKeyColumns.has(column.name) && (
                          <span className="inline-flex items-center gap-0.5 rounded bg-brand-500/10 px-1 py-0.5 text-[9px] font-bold text-brand-400">
                            <ArrowRight size={8} /> FK
                          </span>
                        )}
                        {column.key === "PRI" && (
                          <span className="inline-flex items-center gap-0.5 rounded bg-amber-500/10 px-1 py-0.5 text-[9px] font-bold text-amber-300">
                            <KeyRound size={8} /> PK
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </article>
              );
            })}
            {layout.links.map((link) => {
              const mid = bezierMidpoint(link.from, link.to);
              const key = `${link.edge.from}-${link.edge.column}-${link.edge.to}`;
              const isRelated = !activeTable || relatedEdgeKeys.has(key);
              return (
                <span
                  className={`absolute z-10 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border bg-surface px-1.5 py-0.5 font-mono text-[9px] font-medium shadow-sm ${
                    activeTable && isRelated ? "border-brand-500/60 text-brand-300" : "border-line text-ink-soft"
                  } ${isRelated ? "" : "opacity-20"}`}
                  key={`label-${key}`}
                  style={{ left: mid.x, top: mid.y }}
                >
                  {link.edge.column}
                </span>
              );
            })}
          </div>
          {edges.length === 0 && (
            <p className="mt-3 rounded-lg border border-dashed border-line bg-surface px-4 py-6 text-center text-xs leading-5 text-ink-faint">
              No relationships inferred yet. Columns ending in <code className="font-mono">_id</code> create the links
              between tables.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function buildLayout(
  tables: [string, { columns: DatabaseColumn[] }][],
  edges: Array<{ from: string; to: string; column: string }>
) {
  if (tables.length === 0) return { nodes: [] as LayoutNode[], links: [] as LayoutLink[], width: 0, height: 0 };

  const tableMap = new Map(tables);
  const degree = new Map<string, number>();
  for (const edge of edges) {
    degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1);
    degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1);
  }

  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    adjacency.set(edge.from, [...(adjacency.get(edge.from) ?? []), edge.to]);
    adjacency.set(edge.to, [...(adjacency.get(edge.to) ?? []), edge.from]);
  }

  const ordered: string[] = [];
  const visited = new Set<string>();
  const queue = [...tableMap.keys()].filter((name) => (degree.get(name) ?? 0) > 0);
  while (queue.length > 0) {
    const name = queue.shift()!;
    if (visited.has(name)) continue;
    visited.add(name);
    ordered.push(name);
    for (const neighbor of adjacency.get(name) ?? []) {
      if (!visited.has(neighbor)) queue.push(neighbor);
    }
  }
  for (const name of tableMap.keys()) {
    if (!visited.has(name)) ordered.push(name);
  }

  const cols = Math.min(3, Math.ceil(Math.sqrt(ordered.length)));
  const positions = new Map<string, Rect>();
  const rowNodes: string[][] = [];
  for (let index = 0; index < ordered.length; index += cols) {
    rowNodes.push(ordered.slice(index, index + cols));
  }

  let maxWidth = 0;
  let cursorY = 12;
  for (const row of rowNodes) {
    let rowHeight = 0;
    row.forEach((name, colIndex) => {
      const height = HEADER_H + tableMap.get(name)!.columns.length * ROW_H + 6;
      positions.set(name, {
        x: colIndex * CELL_W + (CELL_W - NODE_W) / 2,
        y: cursorY,
        w: NODE_W,
        h: height
      });
      rowHeight = Math.max(rowHeight, height);
    });
    cursorY += rowHeight + 30;
    maxWidth = Math.max(maxWidth, row.length * CELL_W);
  }

  const fkColumns = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (!fkColumns.has(edge.from)) fkColumns.set(edge.from, new Set());
    fkColumns.get(edge.from)!.add(edge.column);
  }

  const nodes: LayoutNode[] = ordered.map((name) => ({
    name,
    rect: positions.get(name)!,
    degree: degree.get(name) ?? 0,
    columns: tableMap.get(name)!.columns,
    foreignKeyColumns: fkColumns.get(name) ?? new Set<string>()
  }));

  const nodeByName = new Map(nodes.map((node) => [node.name, node]));
  const links: LayoutLink[] = [];
  for (const edge of edges) {
    const sourceNode = nodeByName.get(edge.from);
    const targetNode = nodeByName.get(edge.to);
    if (!sourceNode || !targetNode) continue;
    const from = anchor(sourceNode, targetNode, edge.column);
    const to = anchor(targetNode, sourceNode, primaryKeyOf(targetNode));
    links.push(buildLink(edge, from, to));
  }

  return { nodes, links, width: maxWidth, height: cursorY };
}

type LayoutNode = {
  name: string;
  rect: Rect;
  degree: number;
  columns: DatabaseColumn[];
  foreignKeyColumns: Set<string>;
};

type LayoutLink = {
  edge: { from: string; to: string; column: string };
  from: Point;
  to: Point;
  path: string;
};

function primaryKeyOf(node: LayoutNode): string {
  const primary = node.columns.find((column) => column.key === "PRI");
  return primary?.name ?? node.columns[0]?.name ?? "";
}

function rowY(node: LayoutNode, columnName: string, fallback: "top" | "bottom"): number {
  const index = node.columns.findIndex((column) => column.name === columnName);
  if (index >= 0) return node.rect.y + HEADER_H + index * ROW_H + ROW_H / 2;
  return fallback === "top" ? node.rect.y + HEADER_H / 2 : node.rect.y + node.rect.h - 3;
}

function anchor(node: LayoutNode, toward: LayoutNode, columnName: string): Point {
  const y = rowY(node, columnName, "top");
  const centerX = node.rect.x + node.rect.w / 2;
  const towardCenterX = toward.rect.x + toward.rect.w / 2;
  if (Math.abs(towardCenterX - centerX) >= 60) {
    return towardCenterX > centerX ? { x: node.rect.x + node.rect.w, y } : { x: node.rect.x, y };
  }
  const towardCenterY = toward.rect.y + toward.rect.h / 2;
  const centerY = node.rect.y + node.rect.h / 2;
  return towardCenterY > centerY ? { x: centerX, y: node.rect.y + node.rect.h } : { x: centerX, y: node.rect.y };
}

function buildLink(edge: { from: string; to: string; column: string }, from: Point, to: Point): LayoutLink {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  let path: string;
  if (Math.abs(dx) >= 60) {
    const bend = Math.max(40, Math.min(120, Math.abs(dx) * 0.5)) * Math.sign(dx);
    path = `M ${from.x} ${from.y} C ${from.x + bend} ${from.y}, ${to.x - bend} ${to.y}, ${to.x} ${to.y}`;
  } else {
    const bend = Math.max(30, Math.min(90, Math.abs(dy) * 0.5)) * Math.sign(dy || 1);
    path = `M ${from.x} ${from.y} C ${from.x} ${from.y + bend}, ${to.x} ${to.y - bend}, ${to.x} ${to.y}`;
  }
  return { edge, from, to, path };
}

function bezierMidpoint(from: Point, to: Point): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  let c1: Point;
  let c2: Point;
  if (Math.abs(dx) >= 60) {
    const bend = Math.max(40, Math.min(120, Math.abs(dx) * 0.5)) * Math.sign(dx);
    c1 = { x: from.x + bend, y: from.y };
    c2 = { x: to.x - bend, y: to.y };
  } else {
    const bend = Math.max(30, Math.min(90, Math.abs(dy) * 0.5)) * Math.sign(dy || 1);
    c1 = { x: from.x, y: from.y + bend };
    c2 = { x: to.x, y: to.y - bend };
  }
  return {
    x: (from.x + 3 * c1.x + 3 * c2.x + to.x) / 8,
    y: (from.y + 3 * c1.y + 3 * c2.y + to.y) / 8
  };
}
