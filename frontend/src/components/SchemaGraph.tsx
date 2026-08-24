import { ArrowRight, DatabaseZap, KeyRound, Link2, Table2 } from "lucide-react";
import { DatabaseSchema, SchemaInsights } from "../types/api";

type Props = {
  schema?: DatabaseSchema | null;
  insights?: SchemaInsights | null;
  title?: string;
};

type Rect = { x: number; y: number; w: number; h: number };
type Point = { x: number; y: number };

const NODE_W = 208;
const CELL_W = 256;
const CELL_H = 64;
const HEADER_H = 38;
const ROW_H = 25;
const MAX_COLUMN_ROWS = 6;

export function SchemaGraph({ schema, insights, title = "Database structure" }: Props) {
  const tables = Object.entries(schema?.tables ?? {});
  const tableCount = tables.length;
  const columnCount = tables.reduce((total, [, table]) => total + table.columns.length, 0);
  const keyCount = tables.reduce((total, [, table]) => total + table.columns.filter((column) => column.key).length, 0);
  const score = insights?.score ?? (tableCount > 0 ? 70 : 0);
  const edges = insights?.edges ?? [];

  const layout = buildLayout(tables, edges);

  return (
    <section className="card p-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-50 text-brand-600">
              <DatabaseZap size={16} />
            </span>
            <h2 className="text-base font-bold tracking-tight text-slate-900">{title}</h2>
          </div>
          <p className="mt-1 pl-[42px] text-sm text-slate-500">
            {insights?.summary ?? `${tableCount} tables · ${columnCount} columns · ${keyCount} key columns`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className={`status-pill ${score >= 70 ? "pill-success" : score >= 40 ? "pill-warn" : ""}`}>
            {score}/100 readiness
          </span>
          <span className="status-pill">PK primary</span>
          <span className="status-pill">MUL indexed</span>
        </div>
      </div>

      {tables.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-10 text-center text-sm text-slate-500">
          No schema discovered yet. Save a live MySQL connection to load tables and columns.
        </div>
      ) : (
        <div className="space-y-5">
          {/* ER diagram */}
          <div className="panel-soft overflow-x-auto p-4">
            <div className="mb-3 flex items-center gap-2">
              <Link2 className="text-brand-600" size={16} />
              <h3 className="text-sm font-bold text-slate-900">Entity relationships</h3>
              <span className="ml-auto text-[11px] font-medium text-slate-400">
                {edges.length} link{edges.length === 1 ? "" : "s"} · lines join foreign keys to their tables
              </span>
            </div>
            {layout.nodes.length > 0 && (
              <div className="relative mx-auto" style={{ height: layout.height, minWidth: layout.width }}>
                <svg
                  className="absolute left-0 top-0"
                  height={layout.height}
                  width={layout.width}
                >
                  {layout.links.map((link) => {
                    const path = linkPath(link.from, link.to);
                    return (
                      <g key={`${link.edge.from}-${link.edge.column}-${link.edge.to}`}>
                        <path d={path} fill="none" stroke="rgb(148 163 184 / 0.55)" strokeWidth={1.5} />
                        <circle cx={link.from.x} cy={link.from.y} r={3} className="fill-brand-500" />
                        <circle cx={link.to.x} cy={link.to.y} r={3} className="fill-brand-500" />
                      </g>
                    );
                  })}
                </svg>
                {layout.nodes.map((node) => (
                  <article
                    className={`absolute rounded-xl border bg-white shadow-sm transition hover:shadow-md ${
                      node.degree > 0 ? "border-brand-200 ring-1 ring-brand-100" : "border-slate-200"
                    }`}
                    key={node.name}
                    style={{ left: node.rect.x, top: node.rect.y, width: node.rect.w, height: node.rect.h }}
                  >
                    <header className="flex items-center justify-between gap-2 rounded-t-xl border-b border-slate-100 bg-gradient-to-r from-brand-50/80 to-white px-3"
                      style={{ height: HEADER_H }}
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        <Table2 className="shrink-0 text-brand-600" size={13} />
                        <strong className="truncate font-mono text-[12px] text-slate-800" title={node.name}>{node.name}</strong>
                      </span>
                      {node.degree > 0 && (
                        <span className="shrink-0 rounded-full bg-brand-100 px-1.5 py-0.5 text-[10px] font-bold text-brand-700">
                          {node.degree} link{node.degree === 1 ? "" : "s"}
                        </span>
                      )}
                    </header>
                    <ul className="px-2 py-1.5">
                      {node.visibleColumns.map((column) => {
                        const isForeignKey = node.foreignKeyColumns.has(column.name);
                        return (
                          <li className="flex items-center justify-between gap-2 px-1" key={column.name} style={{ height: ROW_H - 1 }}>
                            <span className="truncate font-mono text-[11px] text-slate-600" title={column.name}>{column.name}</span>
                            <span className="flex shrink-0 items-center gap-1">
                              {isForeignKey && (
                                <span className="inline-flex items-center gap-0.5 rounded bg-brand-50 px-1 py-0.5 text-[9px] font-bold text-brand-600">
                                  <ArrowRight size={8} /> FK
                                </span>
                              )}
                              {column.key === "PRI" && (
                                <span className="inline-flex items-center gap-0.5 rounded bg-amber-50 px-1 py-0.5 text-[9px] font-bold text-amber-600">
                                  <KeyRound size={8} /> PK
                                </span>
                              )}
                            </span>
                          </li>
                        );
                      })}
                      {node.hiddenColumnCount > 0 && (
                        <li className="px-1 pt-0.5 text-[10px] font-medium text-slate-400">
                          +{node.hiddenColumnCount} more column{node.hiddenColumnCount === 1 ? "" : "s"}
                        </li>
                      )}
                    </ul>
                  </article>
                ))}
                {layout.links.map((link) => {
                  const mid = pathMidpoint(link.from, link.to);
                  return (
                    <span
                      className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[9px] font-medium text-slate-500 shadow-sm"
                      key={`label-${link.edge.from}-${link.edge.column}-${link.edge.to}`}
                      style={{ left: mid.x, top: mid.y }}
                    >
                      {link.edge.column}
                    </span>
                  );
                })}
              </div>
            )}
            {edges.length === 0 && (
              <p className="rounded-lg border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-xs leading-5 text-slate-400">
                No relationships inferred yet. Columns ending in <code className="font-mono">_id</code> create the links
                between tables.
              </p>
            )}
          </div>

          {/* Table cards */}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {tables.map(([tableName, table]) => (
              <article className="card card-hover overflow-hidden" key={tableName}>
                <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-4 py-2.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <Table2 className="shrink-0 text-brand-600" size={15} />
                    <strong className="truncate font-mono text-[13px] text-slate-800">{tableName}</strong>
                  </div>
                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                    {table.columns.length} cols
                  </span>
                </div>
                <div className="max-h-64 overflow-auto p-2">
                  {table.columns.map((column) => (
                    <div
                      className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors hover:bg-brand-50/50"
                      key={`${tableName}-${column.name}`}
                    >
                      <span className="truncate font-medium text-slate-700">
                        {column.name}
                        {column.nullable === false && <span className="ml-1 text-[10px] text-slate-300">*</span>}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-500">{column.type}</span>
                        {column.key && (
                          <span className="inline-flex items-center gap-0.5 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-600">
                            <KeyRound size={10} /> {column.key}
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function buildLayout(
  tables: [string, { columns: Array<{ name: string; key: string }> }][],
  edges: Array<{ from: string; to: string; column: string }>
) {
  if (tables.length === 0) return { nodes: [], links: [], width: 0, height: 0 };

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
  const heights = new Map<string, number>();

  let maxWidth = 0;
  let cursorY = 12;
  const rowNodes: string[][] = [];
  for (let index = 0; index < ordered.length; index += cols) {
    rowNodes.push(ordered.slice(index, index + cols));
  }

  for (const row of rowNodes) {
    let rowHeight = 0;
    for (const name of row) {
      const columnCount = tableMap.get(name)!.columns.length;
      const visible = Math.min(columnCount, MAX_COLUMN_ROWS);
      const hidden = columnCount - visible;
      const height = HEADER_H + 6 + visible * ROW_H + (hidden > 0 ? 20 : 4);
      heights.set(name, height);
      rowHeight = Math.max(rowHeight, height);
    }
    row.forEach((name, colIndex) => {
      positions.set(name, {
        x: colIndex * CELL_W + (CELL_W - NODE_W) / 2,
        y: cursorY,
        w: NODE_W,
        h: heights.get(name)!
      });
    });
    cursorY += rowHeight + 26;
    maxWidth = Math.max(maxWidth, row.length * CELL_W);
  }

  const fkColumns = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (!fkColumns.has(edge.from)) fkColumns.set(edge.from, new Set());
    fkColumns.get(edge.from)!.add(edge.column);
  }

  const nodes = ordered.map((name) => {
    const columns = tableMap.get(name)!.columns;
    const visibleColumns = columns.slice(0, MAX_COLUMN_ROWS);
    return {
      name,
      rect: positions.get(name)!,
      degree: degree.get(name) ?? 0,
      visibleColumns,
      hiddenColumnCount: columns.length - visibleColumns.length,
      foreignKeyColumns: fkColumns.get(name) ?? new Set<string>()
    };
  });

  const links = edges
    .map((edge) => {
      const from = positions.get(edge.from);
      const to = positions.get(edge.to);
      if (!from || !to) return null;
      return { edge, from: anchorPoint(from, to), to: anchorPoint(to, from) };
    })
    .filter((link): link is NonNullable<typeof link> => link !== null);

  return { nodes, links, width: maxWidth, height: cursorY };
}

function anchorPoint(node: Rect, toward: Rect): Point {
  const centerX = node.x + node.w / 2;
  const centerY = node.y + node.h / 2;
  const targetX = toward.x + toward.w / 2;
  const targetY = toward.y + toward.h / 2;
  if (Math.abs(targetX - centerX) > Math.abs(targetY - centerY)) {
    return targetX > centerX ? { x: node.x + node.w, y: centerY } : { x: node.x, y: centerY };
  }
  return targetY > centerY ? { x: centerX, y: node.y + node.h } : { x: centerX, y: node.y };
}

function linkPath(from: Point, to: Point): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const control1 = { x: from.x + dx * 0.4, y: from.y + dy * 0.1 };
  const control2 = { x: from.x + dx * 0.6, y: to.y - dy * 0.1 };
  return `M ${from.x} ${from.y} C ${control1.x} ${control1.y}, ${control2.x} ${control2.y}, ${to.x} ${to.y}`;
}

function pathMidpoint(from: Point, to: Point): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const control1 = { x: from.x + dx * 0.4, y: from.y + dy * 0.1 };
  const control2 = { x: from.x + dx * 0.6, y: to.y - dy * 0.1 };
  return {
    x: (from.x + 3 * control1.x + 3 * control2.x + to.x) / 8,
    y: (from.y + 3 * control1.y + 3 * control2.y + to.y) / 8
  };
}
