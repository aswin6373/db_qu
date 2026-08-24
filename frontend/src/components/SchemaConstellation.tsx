import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { DatabaseZap, KeyRound, MousePointer2, Table2 } from "lucide-react";
import { DatabaseSchema, SchemaInsights } from "../types/api";

type Props = {
  schema?: DatabaseSchema | null;
  insights?: SchemaInsights | null;
  title?: string;
};

/* Safe-zone ring around the scene centre (% of the viewport-sized world).
   The DB cylinder sits at (50,50), so no node goes there. */
const SLOTS: Array<[number, number]> = [
  [38, 18],
  [62, 22],
  [74, 42],
  [66, 68],
  [42, 76],
  [26, 60],
  [24, 34],
  [33, 47]
];

const NODE_W = 150;
const MAX_VISIBLE_COLUMNS = 5;
const DB_W = 86;
const DB_H = 104;

/* Exact card height for its content: 6px top pad + ~22px header + 8px list
   padding + 4px bottom pad + 16px per visible row (columns + optional
   "+n more" line), with a pixel of slack so nothing clips. */
function nodeHeight(columnCount: number): number {
  const rows = Math.min(columnCount, MAX_VISIBLE_COLUMNS) + (columnCount > MAX_VISIBLE_COLUMNS ? 1 : 0);
  return 40 + rows * 16;
}

export function SchemaConstellation({ schema, insights, title = "Primary schema & database relationships" }: Props) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [hovered, setHovered] = useState<string | null>(null);
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setFrameSize({ width, height });
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  /* Shrink the whole scene uniformly so every node stays inside the frame
     on narrow viewports (billboards inherit the parent scale). */
  const fitScale = frameSize.width
    ? Math.max(0.55, Math.min(1, Math.min(frameSize.width / 620, frameSize.height / 440)))
    : 1;

  const allTables = useMemo(() => Object.entries(schema?.tables ?? {}), [schema]);
  const tables = allTables.slice(0, 8);
  const hiddenCount = allTables.length - tables.length;

  const slotByName = useMemo(
    () => new Map(tables.map(([name], index) => [name, SLOTS[index % SLOTS.length]] as const)),
    [tables]
  );
  const edges = useMemo(
    () =>
      (insights?.edges ?? []).filter(
        (edge) => slotByName.has(edge.from) && slotByName.has(edge.to) && edge.from !== edge.to
      ),
    [insights, slotByName]
  );

  const neighborsOf = (name: string) => {
    const set = new Set<string>([name]);
    edges.forEach((edge) => {
      if (edge.from === name) set.add(edge.to);
      if (edge.to === name) set.add(edge.from);
    });
    return set;
  };
  const activeSet = hovered ? neighborsOf(hovered) : null;

  /* Isometric base + cursor parallax. Billboard = exact inverse of the world
     rotation so upright cards always face the viewer. */
  const rotX = 54 - tilt.y * 7;
  const rotZ = -40 + tilt.x * 10;
  const billboard = `rotateZ(${-rotZ}deg) rotateX(${-rotX}deg)`;

  const handleMove = (event: MouseEvent<HTMLDivElement>) => {
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTilt({
      x: Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width) * 2 - 1)),
      y: Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height) * 2 - 1))
    });
  };

  return (
    <section className="card-dark flex flex-col overflow-hidden p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-teal/15 text-teal-soft">
            <DatabaseZap size={16} />
          </span>
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200">{title}</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-[11px] font-medium text-slate-400">
            {tables.length} tables · {edges.length} rel
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-teal/30 bg-teal/10 px-3 py-1 text-[11px] font-semibold text-teal-soft">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal opacity-70" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-teal" />
            </span>
            Live schema
          </span>
        </div>
      </div>

      <div ref={frameRef} className="relative min-h-[420px] flex-1 sm:min-h-[480px]" onMouseLeave={() => { setTilt({ x: 0, y: 0 }); setHovered(null); }} onMouseMove={handleMove}>
        {/* clipping wrapper only — never put overflow on the 3D chain itself */}
        <div className="absolute inset-0 overflow-hidden rounded-xl border border-white/5 bg-[#071120]">
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(circle at 22% 28%, rgba(124,194,188,0.12), transparent 42%), radial-gradient(circle at 78% 72%, rgba(47,158,151,0.09), transparent 46%)"
            }}
          />

          {tables.length === 0 ? (
            <div className="grid h-full place-items-center px-6 text-center">
              <p className="max-w-xs text-sm leading-6 text-slate-500">
                No schema discovered yet. Connect a database and QueryMind will map its tables and relationships here.
              </p>
            </div>
          ) : (
            <>
              {/* 3D stage: perspective -> world(preserve-3d, rotated) -> children.
                  The world is viewport-sized; only the floor texture is oversized
                  so rotated corners stay covered. */}
              <div className="absolute inset-0" style={{ perspective: "1400px" }}>
                <div
                  className="absolute inset-0 transition-transform duration-150 ease-out will-change-transform"
                  style={{
                    transformStyle: "preserve-3d",
                    transform: `scale(${fitScale}) rotateX(${rotX}deg) rotateZ(${rotZ}deg)`
                  }}
                >
                  {/* floor */}
                  <div className="floor-grid absolute inset-[-35%] opacity-80" />
                  <div
                    className="pointer-events-none absolute inset-[-35%]"
                    style={{ background: "radial-gradient(circle at 50% 50%, transparent 30%, rgba(7,17,32,0.96) 74%)" }}
                  />

                  {/* relationship lines & particles, flat on the floor plane */}
                  <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
                    {tables.map(([name], index) => {
                      const [x, y] = SLOTS[index % SLOTS.length];
                      const dim = activeSet !== null && !activeSet.has(name);
                      return (
                        <line
                          key={`spoke-${name}`}
                          opacity={dim ? 0.05 : 0.22}
                          stroke="#2f9e97"
                          strokeWidth={0.18}
                          x1={50}
                          x2={x}
                          y1={50}
                          y2={y}
                        />
                      );
                    })}
                    {edges.map((edge, index) => {
                      const from = slotByName.get(edge.from);
                      const to = slotByName.get(edge.to);
                      if (!from || !to) return null;
                      const path = `M ${from[0]} ${from[1]} L ${to[0]} ${to[1]}`;
                      const dim = activeSet !== null && !(activeSet.has(edge.from) && activeSet.has(edge.to));
                      return (
                        <g key={`${edge.from}-${edge.column}-${edge.to}`} opacity={dim ? 0.12 : 1}>
                          <path
                            className="edge-line"
                            d={path}
                            fill="none"
                            stroke="#7cc2bc"
                            strokeDasharray="1.6 1.4"
                            strokeLinecap="round"
                            strokeWidth={0.4}
                          />
                          <circle fill="#a7dcd7" r={0.55}>
                            <animateMotion dur={`${2.8 + (index % 4) * 0.9}s`} path={path} repeatCount="indefinite" />
                          </circle>
                        </g>
                      );
                    })}
                  </svg>

                  {/* glow pads under each table, drawn on the floor */}
                  {tables.map(([name], index) => {
                    const [x, y] = SLOTS[index % SLOTS.length];
                    const dim = activeSet !== null && !activeSet.has(name);
                    return (
                      <span
                        key={`pad-${name}`}
                        className="pointer-events-none absolute h-6 w-20 rounded-full"
                        style={{
                          left: `${x}%`,
                          top: `${y}%`,
                          transform: "translate(-50%, -50%)",
                          opacity: dim ? 0.12 : 0.5,
                          background: "radial-gradient(closest-side, rgba(47,158,151,0.45), transparent)"
                        }}
                      />
                    );
                  })}

                  {/* central database — billboarded, float animation on a nested
                      node so it never clobbers the counter-rotation */}
                  <div className="absolute" style={{ left: "50%", top: "50%", transformStyle: "preserve-3d" }}>
                    <div style={{ width: DB_W, height: DB_H, marginLeft: -DB_W / 2, marginTop: -DB_H / 2, transform: billboard }}>
                      <div className="node-float">
                        <svg filter="drop-shadow(0 0 22px rgba(47,158,151,0.6))" height={DB_H} viewBox="0 0 100 120" width={DB_W}>
                          <defs>
                            <linearGradient id="db-body" x1="0" x2="1" y1="0" y2="0">
                              <stop offset="0%" stopColor="#12303c" />
                              <stop offset="45%" stopColor="#1d5f63" />
                              <stop offset="100%" stopColor="#0e2733" />
                            </linearGradient>
                            <linearGradient id="db-top" x1="0" x2="1" y1="0" y2="1">
                              <stop offset="0%" stopColor="#3aa9a1" />
                              <stop offset="100%" stopColor="#1f7a74" />
                            </linearGradient>
                          </defs>
                          <path d="M10 25 v70 a40 14 0 0 0 80 0 v-70" fill="url(#db-body)" stroke="#2f9e97" strokeWidth="1.5" />
                          <ellipse cx="50" cy="25" fill="url(#db-top)" rx="40" ry="14" stroke="#7cc2bc" strokeWidth="1.5" />
                          <path d="M10 55 a40 14 0 0 0 80 0" fill="none" opacity="0.7" stroke="#7cc2bc" strokeWidth="1.4" />
                          <path d="M10 75 a40 14 0 0 0 80 0" fill="none" opacity="0.45" stroke="#7cc2bc" strokeWidth="1.4" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  {/* table cards — margin-centered on their anchor, then
                      counter-rotated to stand upright facing the viewer */}
                  {tables.map(([tableName, table]) => {
                    const [x, y] = slotByName.get(tableName)!;
                    const nodeH = nodeHeight(table.columns.length);
                    const pkCount = table.columns.filter((column) => column.key === "PRI").length;
                    const dim = activeSet !== null && !activeSet.has(tableName);
                    const focused = hovered === tableName;
                    return (
                      <div className="absolute" key={tableName} style={{ left: `${x}%`, top: `${y}%`, transformStyle: "preserve-3d" }}>
                        <button
                          aria-label={`Table ${tableName}`}
                          className="group/node absolute left-0 top-0 block focus:outline-none"
                          onBlur={() => setHovered(null)}
                          onFocus={() => setHovered(tableName)}
                          onMouseEnter={() => setHovered(tableName)}
                          onMouseLeave={() => setHovered(null)}
                          style={{
                            width: NODE_W,
                            height: nodeH,
                            marginLeft: -NODE_W / 2,
                            marginTop: -nodeH / 2,
                            transform: billboard,
                            opacity: dim ? 0.3 : 1,
                            transition: "opacity 200ms ease"
                          }}
                          type="button"
                        >
                          <div
                            className={`h-full w-full overflow-hidden rounded-lg border px-2 pb-1 pt-1.5 transition-all duration-200 group-hover/node:-translate-y-1 group-hover/node:shadow-[0_0_24px_rgba(47,158,151,0.35)] ${
                              focused ? "border-teal/60 bg-[#0e2537]" : "border-white/10 bg-[#0c1c2e]"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1 border-b border-white/5 pb-1">
                              <span className="flex min-w-0 items-center gap-1.5">
                                <Table2 className="shrink-0 text-teal-soft" size={11} />
                                <strong className="truncate font-mono text-[10px] font-semibold text-slate-100 sm:text-[11px]">
                                  {tableName}
                                </strong>
                              </span>
                              {pkCount > 0 && <KeyRound className="shrink-0 text-amber-300" size={10} />}
                            </div>
                            <ul className="py-1">
                              {table.columns.slice(0, MAX_VISIBLE_COLUMNS).map((column) => (
                                <li className="flex items-center justify-between gap-1.5 leading-4" key={column.name}>
                                  <span
                                    className={`min-w-0 truncate font-mono text-[9px] sm:text-[10px] ${
                                      column.key === "PRI" ? "font-semibold text-amber-300" : "text-slate-300"
                                    }`}
                                  >
                                    {column.name}
                                  </span>
                                  <span className="flex shrink-0 items-center gap-1">
                                    {column.key === "PRI" && (
                                      <span className="rounded-sm bg-amber-300/15 px-1 font-mono text-[7px] font-bold uppercase text-amber-300">
                                        pk
                                      </span>
                                    )}
                                    <span className="max-w-[56px] truncate font-mono text-[8px] uppercase text-slate-500">{column.type}</span>
                                  </span>
                                </li>
                              ))}
                              {table.columns.length > MAX_VISIBLE_COLUMNS && (
                                <li className="text-[9px] font-medium leading-4 text-teal-soft/70 sm:text-[10px]">
                                  +{table.columns.length - MAX_VISIBLE_COLUMNS} more columns
                                </li>
                              )}
                            </ul>
                          </div>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* screen-space vignette over the scene */}
              <div
                className="pointer-events-none absolute inset-0 rounded-xl"
                style={{ background: "radial-gradient(circle at 50% 48%, transparent 55%, rgba(7,17,32,0.6) 100%)" }}
              />
            </>
          )}
        </div>

        {tables.length > 0 && (
          <>
            <span className="absolute bottom-3 left-3 rounded-full border border-teal/25 bg-teal/10 px-2.5 py-1 text-[11px] font-medium text-teal-soft">
              {edges.length} relationship{edges.length === 1 ? "" : "s"}
              {hiddenCount > 0 ? ` · +${hiddenCount} table${hiddenCount === 1 ? "" : "s"} hidden` : ""}
            </span>
            <span className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-slate-400">
              <MousePointer2 size={11} /> Move cursor to orbit
            </span>
          </>
        )}
      </div>
    </section>
  );
}
