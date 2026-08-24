import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { DatabaseZap, KeyRound, MousePointer2, Table2 } from "lucide-react";
import { DatabaseSchema, SchemaInsights } from "../types/api";

type Props = {
  schema?: DatabaseSchema | null;
  insights?: SchemaInsights | null;
  title?: string;
};

/* Tables are placed on evenly-spaced ring(s) around the central database so the
   layout stays balanced no matter how many tables are discovered. */
const MAX_TABLES = 12;

const NODE_W = 116;

/* Exact card height for its content: header ~26px + list padding + 16px per
   visible row (columns + "+n more" line) with a pixel of slack so nothing clips. */
function nodeHeight(columnCount: number): number {
  const rows = Math.min(columnCount, 4) + (columnCount > 4 ? 1 : 0);
  return 46 + rows * 16;
}

const DB_W = 96;
const DB_H = 114;

/* Pedestal puck under every table card (drawn flat on the floor plane).
   This is a true circle — the world's rotateX/rotateZ + perspective do
   100% of the squashing, so we never hand-draw an ellipse here. */
const PED_D = 96;

const KEY_BADGES: Record<string, { label: string; className: string }> = {
  PRI: { label: "PK", className: "bg-amber-100 text-amber-600 ring-1 ring-amber-200/70" },
  UNI: { label: "UQ", className: "bg-violet-100 text-violet-700 ring-1 ring-violet-200/70" },
  MUL: { label: "IX", className: "bg-brand-50 text-brand-700 ring-1 ring-brand-200/70" }
};
const FK_BADGE = { label: "FK", className: "bg-amber-50 text-amber-500 ring-1 ring-amber-200/60" };

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
    ? Math.max(0.55, Math.min(1, Math.min(frameSize.width / 660, frameSize.height / 470)))
    : 1;

  const allTables = useMemo(() => Object.entries(schema?.tables ?? {}), [schema]);
  const tables = allTables.slice(0, MAX_TABLES);
  const hiddenCount = allTables.length - tables.length;

  /* Radial layout: one evenly-spaced ring for up to 8 tables, then two
     staggered rings so cards never stack on the same spot. */
  const layout = useMemo<Array<[number, number]>>(() => {
    const count = tables.length;
    if (count === 0) return [];
    const ring: (size: number, rx: number, ry: number, startDeg: number) => Array<[number, number]> =
      (size, rx, ry, startDeg) =>
        Array.from({ length: size }, (_, index) => {
          const angle = ((startDeg + (360 / size) * index) * Math.PI) / 180;
          return [50 + rx * Math.cos(angle), 50 + ry * Math.sin(angle)] as [number, number];
        });
    if (count <= 8) return ring(count, 33, 34, -90);
    const innerCount = Math.min(6, Math.ceil(count / 2));
    return [
      ...ring(innerCount, 26, 27, -90),
      ...ring(count - innerCount, 40.5, 41.5, -90 - 180 / (count - innerCount))
    ];
  }, [tables]);

  const slotByName = useMemo(
    () => new Map(tables.map(([name], index) => [name, layout[index]] as const)),
    [tables, layout]
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
    <section className="card flex flex-col overflow-hidden p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-50 text-brand-600">
            <DatabaseZap size={16} />
          </span>
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900">{title}</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-[11px] font-medium text-slate-500">
            {tables.length} tables · {edges.length} rel
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-[11px] font-semibold text-brand-700">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal opacity-70" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-teal" />
            </span>
            Live schema
          </span>
        </div>
      </div>

      <div ref={frameRef} className="relative min-h-[420px] flex-1 sm:min-h-[500px]" onMouseLeave={() => { setTilt({ x: 0, y: 0 }); setHovered(null); }} onMouseMove={handleMove}>
        {/* clipping wrapper only — never put overflow on the 3D chain itself */}
        <div className="absolute inset-0 overflow-hidden rounded-xl border border-slate-200/80 bg-gradient-to-br from-white via-brand-50/40 to-cream/70">
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(circle at 24% 26%, rgba(124,194,188,0.20), transparent 44%), radial-gradient(circle at 78% 74%, rgba(47,158,151,0.13), transparent 48%)"
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
              <div className="absolute inset-0" style={{ perspective: "2200px" }}>
                <div
                  className="absolute inset-0 transition-transform duration-150 ease-out will-change-transform"
                  style={{
                    transformStyle: "preserve-3d",
                    transform: `scale(${fitScale}) rotateX(${rotX}deg) rotateZ(${rotZ}deg)`
                  }}
                >
                  {/* floor */}
                  <div className="floor-grid absolute inset-[-35%] opacity-70" />
                  <div
                    className="pointer-events-none absolute inset-[-35%]"
                    style={{ background: "radial-gradient(circle at 50% 50%, transparent 34%, rgba(255,255,255,0.88) 80%)" }}
                  />

                  {/* glowing fiber tubes on the floor: hub -> every table pedestal */}
                  <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
                    <defs>
                      <linearGradient id="tube-core" x1="0" x2="1" y1="0" y2="1">
                        <stop offset="0%" stopColor="#8fe8db" />
                        <stop offset="50%" stopColor="#d9fff8" />
                        <stop offset="100%" stopColor="#8fe8db" />
                      </linearGradient>
                    </defs>
                    {tables.map(([name], index) => {
                      const [x, y] = layout[index];
                      const dim = activeSet !== null && !activeSet.has(name);
                      const dur = 2.6 + (index % 4) * 0.8;
                      return (
                        <g key={`spoke-${name}`} opacity={dim ? 0.1 : 1}>
                          {/* soft outer glow */}
                          <line stroke="#46c8b8" strokeWidth={3.4} x1={50} x2={x} y1={50} y2={y} opacity={0.16} strokeLinecap="round" />
                          {/* tube body */}
                          <line stroke="#6fd8ca" strokeWidth={1.7} x1={50} x2={x} y1={50} y2={y} opacity={0.75} strokeLinecap="round" />
                          {/* bright energy core, flowing toward the table */}
                          <line
                            className="edge-line"
                            stroke="url(#tube-core)"
                            strokeWidth={0.8}
                            x1={50} x2={x} y1={50} y2={y}
                            strokeDasharray="4 6"
                            strokeLinecap="round"
                          />
                          {/* travelling light pulses */}
                          <circle fill="#46c8b8" r={3.1} opacity={0.28}>
                            <animateMotion dur={`${dur}s`} begin={`${-index * 0.7}s`} path={`M 50 50 L ${x} ${y}`} repeatCount="indefinite" />
                          </circle>
                          <circle fill="#ecfffb" r={1.35}>
                            <animateMotion dur={`${dur}s`} begin={`${-index * 0.7}s`} path={`M 50 50 L ${x} ${y}`} repeatCount="indefinite" />
                          </circle>
                        </g>
                      );
                    })}
                    {/* table <-> table relationships, thinner and quieter */}
                    {edges.map((edge, index) => {
                      const from = slotByName.get(edge.from);
                      const to = slotByName.get(edge.to);
                      if (!from || !to) return null;
                      const path = `M ${from[0]} ${from[1]} L ${to[0]} ${to[1]}`;
                      const dim = activeSet !== null && !(activeSet.has(edge.from) && activeSet.has(edge.to));
                      return (
                        <g key={`${edge.from}-${edge.column}-${edge.to}`} opacity={dim ? 0.12 : 0.8}>
                          <path d={path} fill="none" stroke="#5fbcb3" strokeWidth={1.9} strokeLinecap="round" opacity={0.18} />
                          <path
                            className="edge-line"
                            d={path}
                            fill="none"
                            stroke="#1f7a73"
                            strokeDasharray="2.4 1.6"
                            strokeLinecap="round"
                            strokeWidth={0.7}
                          />
                          <circle fill="#1f7a73" r={0.8}>
                            <animateMotion dur={`${2.8 + (index % 4) * 0.9}s`} path={path} repeatCount="indefinite" />
                          </circle>
                        </g>
                      );
                    })}
                  </svg>

                  {/* central hub pedestal — glowing rounded slab the database sits on */}
                  <div className="absolute" style={{ left: "50%", top: "50%", transformStyle: "preserve-3d" }}>
                    <span className="absolute" style={{ width: 172, height: 124, transform: "translate(-50%, -50%)" }}>
                      <span
                        className="glow-pulse absolute rounded-[30%]"
                        style={{
                          inset: -14,
                          background: "radial-gradient(closest-side, rgba(64,190,176,0.35), rgba(64,190,176,0.12) 62%, transparent)"
                        }}
                      />
                      <span
                        className="absolute inset-0 rounded-[30%]"
                        style={{
                          background: "linear-gradient(145deg, #ffffff 10%, #e3efef 55%, #cfe3e2 100%)",
                          boxShadow:
                            "0 0 0 1.5px rgba(94,200,188,0.6), 0 0 28px rgba(64,180,168,0.45), inset 0 0 26px rgba(94,200,188,0.30)"
                        }}
                      />
                      <span
                        className="absolute rounded-[30%]"
                        style={{
                          inset: 11,
                          border: "1.5px solid rgba(74,196,182,0.7)",
                          boxShadow: "inset 0 0 20px rgba(74,196,182,0.35), 0 0 16px rgba(74,196,182,0.35)"
                        }}
                      />
                    </span>
                  </div>

                  {/* pedestal pucks under each table card (flat on the floor).
                      Drawn as true circles in a square box — the world's
                      rotateX/rotateZ + perspective do all the foreshortening,
                      the same way they already flatten the floor-grid squares. */}
                  {tables.map(([name], index) => {
                    const [x, y] = layout[index];
                    const dim = activeSet !== null && !activeSet.has(name);
                    return (
                      <span
                        key={`ped-${name}`}
                        className="pointer-events-none absolute"
                        style={{
                          left: `${x}%`,
                          top: `${y}%`,
                          width: PED_D,
                          height: PED_D,
                          transform: "translate(-50%, -50%)",
                          opacity: dim ? 0.25 : 1,
                          transition: "opacity 200ms ease"
                        }}
                      >
                        <svg height={PED_D} viewBox="0 0 96 96" width={PED_D}>
                          <defs>
                            <linearGradient id={`ped-side-${index}`} x1="0" x2="0" y1="0" y2="1">
                              <stop offset="0%" stopColor="#c7d5da" />
                              <stop offset="100%" stopColor="#9db0b9" />
                            </linearGradient>
                            <radialGradient id={`ped-top-${index}`} cx="35%" cy="30%" r="75%">
                              <stop offset="0%" stopColor="#fbfdfd" />
                              <stop offset="100%" stopColor="#dbe6ea" />
                            </radialGradient>
                          </defs>
                          {/* rim/thickness: same circle, nudged down a few units
                              in LOCAL (pre-transform) space — after rotateX this
                              reads as a thin cylinder edge, never a hand-warped arc */}
                          <circle cx="48" cy="53" r="38" fill={`url(#ped-side-${index})`} />
                          {/* top face — a true circle, no rx/ry guessing */}
                          <circle cx="48" cy="45" r="38" fill={`url(#ped-top-${index})`} stroke="#b7c9d0" strokeWidth="1.5" />
                          <circle cx="48" cy="45" r="25" fill="rgba(47,158,151,0.10)" />
                        </svg>
                      </span>
                    );
                  })}

                  {/* glowing joints where tubes meet the pedestals */}
                  <svg className="pointer-events-none absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
                    <circle cx={50} cy={50} fill="rgba(94,214,200,0.30)" r={4.6} />
                    <circle cx={50} cy={50} fill="#d9fff8" r={2} />
                    {tables.map(([name], index) => {
                      const [x, y] = layout[index];
                      const dim = activeSet !== null && !activeSet.has(name);
                      return (
                        <g key={`port-${name}`} opacity={dim ? 0.15 : 1}>
                          <circle cx={x} cy={y} fill="rgba(94,214,200,0.28)" r={3.6} />
                          <circle cx={x} cy={y} fill="#d9fff8" r={1.5} />
                        </g>
                      );
                    })}
                  </svg>

                  {/* central database — billboarded, floating just above the hub slab */}
                  <div className="absolute" style={{ left: "50%", top: "50%", transformStyle: "preserve-3d" }}>
                    <div
                      style={{
                        width: DB_W,
                        height: DB_H,
                        marginLeft: -DB_W / 2,
                        marginTop: -DB_H / 2,
                        transform: `translateY(-${DB_H / 2 + 4}px) ${billboard}`
                      }}
                    >
                      <div className="node-float" style={{ animationDuration: "7s" }}>
                        <span
                          className="glow-pulse absolute rounded-full"
                          style={{
                            inset: -18,
                            background: "radial-gradient(closest-side, rgba(64,190,176,0.35), transparent 70%)"
                          }}
                        />
                        <svg
                          className="relative"
                          filter="drop-shadow(0 10px 14px rgba(23,93,85,0.28))"
                          height={DB_H}
                          viewBox="0 0 100 118"
                          width={DB_W}
                        >
                          <defs>
                            <linearGradient id="db-body" x1="0" x2="1" y1="0" y2="0">
                              <stop offset="0%" stopColor="#2b8d81" />
                              <stop offset="42%" stopColor="#5cc4b6" />
                              <stop offset="100%" stopColor="#175d55" />
                            </linearGradient>
                            <linearGradient id="db-top" x1="0" x2="1" y1="0" y2="1">
                              <stop offset="0%" stopColor="#b9ede4" />
                              <stop offset="100%" stopColor="#4fb5a9" />
                            </linearGradient>
                          </defs>
                          {/* three stacked pucks */}
                          <path d="M10 74 v26 a40 13 0 0 0 80 0 v-26" fill="url(#db-body)" stroke="#2f9e97" strokeWidth="1.4" />
                          <path d="M10 48 v26 a40 13 0 0 0 80 0 v-26" fill="url(#db-body)" stroke="#2f9e97" strokeWidth="1.4" />
                          <path d="M10 22 v26 a40 13 0 0 0 80 0 v-26" fill="url(#db-body)" stroke="#2f9e97" strokeWidth="1.4" />
                          {/* seam highlights */}
                          <path d="M10 74 a40 13 0 0 0 80 0" fill="none" stroke="#8fe0d5" strokeWidth="1.3" opacity="0.85" />
                          <path d="M10 48 a40 13 0 0 0 80 0" fill="none" stroke="#8fe0d5" strokeWidth="1.3" opacity="0.85" />
                          {/* glossy top */}
                          <ellipse cx="50" cy="22" fill="url(#db-top)" rx="40" ry="13" stroke="#7fd8cc" strokeWidth="1.4" />
                          <ellipse cx="50" cy="22" fill="none" rx="30" ry="9" stroke="#d9fff8" strokeWidth="1" opacity="0.5" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  {/* table cards — extruded slabs standing on their pedestals,
                      counter-rotated to face the viewer */}
                  {tables.map(([tableName, table], index) => {
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
                            /* screen-space lift first, then counter-rotation */
                            transform: `translateY(-${nodeH / 2 + 2}px) ${billboard}`,
                            opacity: dim ? 0.3 : 1,
                            transition: "opacity 200ms ease"
                          }}
                          type="button"
                        >
                          <div
                            className="node-float relative h-full w-full"
                            style={{ animationDelay: `${(index % 5) * -1.3}s`, animationDuration: `${6 + (index % 3)}s` }}
                          >
                            {/* extruded slab thickness (light from top-right) */}
                            <span
                              aria-hidden
                              className="absolute inset-0 rounded-xl"
                              style={{
                                transform: "translate(-6px, 7px)",
                                background: "linear-gradient(150deg, #b6c5cd 0%, #93a5b0 55%, #7e919d 100%)"
                              }}
                            />
                            <span
                              aria-hidden
                              className="absolute inset-0 rounded-xl"
                              style={{ transform: "translate(-3px, 3.5px)", background: "linear-gradient(150deg, #e6edf2 0%, #b9c8d0 100%)" }}
                            />
                            <div
                              className={`relative h-full w-full overflow-hidden rounded-xl border bg-white px-2.5 pb-1 pt-1.5 transition-all duration-200 group-hover/node:-translate-y-1 group-hover/node:shadow-[0_14px_30px_rgba(23,93,85,0.18),0_0_24px_rgba(47,158,151,0.25)] ${
                                focused ? "border-brand-300 shadow-[0_0_24px_rgba(47,158,151,0.25)]" : "border-slate-200/90 shadow-[0_10px_22px_rgba(23,93,85,0.10)]"
                              }`}
                            >
                              <div className="flex items-center justify-between gap-1 border-b border-slate-100 pb-1">
                                <span className="flex min-w-0 items-center gap-1.5">
                                  <span className="grid h-4 w-4 shrink-0 place-items-center rounded bg-brand-50 text-brand-600">
                                    <Table2 size={10} />
                                  </span>
                                  <strong className="truncate text-[11px] font-bold text-slate-800">{tableName}</strong>
                                </span>
                                {pkCount > 0 && <KeyRound className="shrink-0 text-amber-400" size={11} />}
                              </div>
                              <ul className="space-y-0.5 py-1">
                                {table.columns.slice(0, 4).map((column) => {
                                  const key = column.key.toUpperCase();
                                  const badge =
                                    KEY_BADGES[key] ?? (column.name.endsWith("_id") && key !== "PRI" ? FK_BADGE : null);
                                  const dataType = column.type.split("(")[0].toLowerCase();
                                  return (
                                    <li className="flex items-center justify-between gap-1 leading-4" key={column.name}>
                                      <span className="truncate font-mono text-[9px] text-slate-600 sm:text-[9.5px]">{column.name}</span>
                                      <span className="flex shrink-0 items-center gap-1">
                                        {dataType && (
                                          <span className="text-[8px] font-medium uppercase tracking-wide text-slate-400">{dataType}</span>
                                        )}
                                        {badge && (
                                          <span className={`rounded px-1 text-[7px] font-bold uppercase leading-[12px] ${badge.className}`}>
                                            {badge.label}
                                          </span>
                                        )}
                                      </span>
                                    </li>
                                  );
                                })}
                                {table.columns.length > 4 && (
                                  <li className="pt-0.5 text-center text-[9px] font-semibold text-brand-600 sm:text-[9.5px]">
                                    +{table.columns.length - 4} more
                                  </li>
                                )}
                              </ul>
                            </div>
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
                style={{ background: "radial-gradient(circle at 50% 48%, transparent 55%, rgba(22,50,79,0.06) 100%)" }}
              />
            </>
          )}
        </div>

        {tables.length > 0 && (
          <>
            <span className="absolute bottom-3 left-3 rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 text-[11px] font-medium text-brand-700">
              {edges.length} relationship{edges.length === 1 ? "" : "s"}
              {hiddenCount > 0 ? ` · +${hiddenCount} table${hiddenCount === 1 ? "" : "s"} hidden` : ""}
            </span>
            <span className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-500">
              <MousePointer2 size={11} /> Move cursor to orbit
            </span>
          </>
        )}
      </div>
    </section>
  );
}
