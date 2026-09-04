import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { DatabaseZap, KeyRound, MousePointer2, Table2 } from "lucide-react";
import { DatabaseSchema, SchemaInsights } from "../types/api";


type Props = {
  schema?: DatabaseSchema | null;
  insights?: SchemaInsights | null;
  title?: string;
  headerAction?: React.ReactNode;
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


const KEY_BADGES: Record<string, { label: string; className: string }> = {
  PRI: { label: "PK", className: "bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/30" },
  UNI: { label: "UQ", className: "bg-violet-500/20 text-violet-300 ring-1 ring-violet-500/30" },
  MUL: { label: "IX", className: "bg-brand-500/10 text-brand-300 ring-1 ring-brand-500/30" }
};
const FK_BADGE = { label: "FK", className: "bg-amber-500/10 text-amber-500 ring-1 ring-amber-500/25" };


export function SchemaConstellation({ schema, insights, title = "Primary schema & database relationships", headerAction }: Props) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [hovered, setHovered] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  // Mirror of zoom for wheel math; kept in sync with every setter below.
  const zoomRef = useRef(1);


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


  /* Wheel zoom: scrolling over the scene zooms in/out — but only while the
     zoom can actually change. At either limit the event is left alone so the
     page keeps scrolling instead of feeling stuck over this card. */
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const onWheel = (event: WheelEvent) => {
      const current = zoomRef.current;
      const next = Math.max(0.6, Math.min(1.6, current - event.deltaY * 0.0012));
      if (next === current) return;
      event.preventDefault();
      zoomRef.current = next;
      setZoom(next);
    };
    frame.addEventListener("wheel", onWheel, { passive: false });
    return () => frame.removeEventListener("wheel", onWheel);
  }, []);


  /* Shrink the whole scene uniformly so every node stays inside the frame
     on narrow viewports (billboards inherit the parent scale). */
  const fitScale = frameSize.width
    ? Math.max(0.55, Math.min(1, Math.min(frameSize.width / 700, frameSize.height / 500)))
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
      ...ring(innerCount, 25, 26, -90),
      ...ring(count - innerCount, 41.5, 42.5, -90 - 180 / (count - innerCount))
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
  const active = pinned ?? hovered;
  const activeSet = active ? neighborsOf(active) : null;


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
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-500/10 text-brand-400">
            <DatabaseZap size={16} />
          </span>
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {headerAction}
          <span className="rounded-full border border-line bg-raise px-2.5 py-1 font-mono text-[11px] font-medium text-ink-soft">
            {tables.length} tables · {edges.length} rel
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-brand-500/40 bg-brand-500/10 px-3 py-1 text-[11px] font-semibold text-brand-300">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-500 opacity-70" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand-500" />
            </span>
            Live schema
          </span>
        </div>
      </div>


      <div
        ref={frameRef}
        className="relative min-h-[420px] flex-1 sm:min-h-[500px]"
        onClick={() => setPinned(null)}
        onDoubleClick={() => { zoomRef.current = 1; setZoom(1); }}
        onMouseLeave={() => { setTilt({ x: 0, y: 0 }); setHovered(null); }}
        onMouseMove={handleMove}
      >
        {/* clipping wrapper only — never put overflow on the 3D chain itself */}
        <div className="absolute inset-0 overflow-hidden rounded-xl border border-line bg-canvas">
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(circle at 24% 26%, rgba(124,194,188,0.20), transparent 44%), radial-gradient(circle at 78% 74%, rgba(47,158,151,0.13), transparent 48%)"
            }}
          />


          {tables.length === 0 ? (
            <div className="grid h-full place-items-center px-6 text-center">
              <p className="max-w-xs text-sm leading-6 text-ink-soft">
                No schema discovered yet. Connect a database and QueryMind will map its tables and relationships here.
              </p>
            </div>
          ) : (
            <>
              {/* 3D stage: perspective -> world(preserve-3d, rotated) -> children.
                  The world is viewport-sized; only the floor texture is oversized
                  so rotated corners stay covered. */}
              <div
                className="absolute inset-0"
                style={{ perspective: `${Math.round(2200 / zoom)}px`, transition: "perspective 200ms ease" }}
              >
                <div
                  className="absolute inset-0 transition-transform duration-150 ease-out will-change-transform"
                  style={{
                    transformStyle: "preserve-3d",
                    transform: `scale(${fitScale * zoom}) rotateX(${rotX - (zoom - 1) * 6}deg) rotateZ(${rotZ}deg)`
                  }}
                >
                  {/* floor */}
                  <div className="floor-grid absolute inset-[-35%] opacity-70" />
                  <div
                    className="pointer-events-none absolute inset-[-35%]"
                    style={{ background: "radial-gradient(circle at 50% 50%, transparent 34%, rgba(13,15,19,0.9) 80%)" }}
                  />


                  {/* hub spokes — every table always has a line back to the
                      central database. The highlighted table's spoke brightens;
                      unrelated spokes fade while something is highlighted. */}
                  <svg className="pointer-events-none absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
                    <defs>
                      <linearGradient id="tube-core" x1="0" x2="1" y1="0" y2="1">
                        <stop offset="0%" stopColor="#8fe8db" />
                        <stop offset="50%" stopColor="#d9fff8" />
                        <stop offset="100%" stopColor="#8fe8db" />
                      </linearGradient>
                    </defs>
                    {tables.map(([name], index) => {
                      const [x, y] = layout[index];
                      const isActive = active === name;
                      const dim = activeSet !== null && !activeSet.has(name);
                      return (
                        <g
                          key={`spoke-${name}`}
                          opacity={dim ? 0.15 : 1}
                          style={{ transition: "opacity 200ms ease" }}
                        >
                          {/* every spoke uses the exact same thin three-layer
                              style — highlighting only changes opacity, it never
                              changes the line itself */}
                          <line stroke="#46c8b8" strokeWidth={1.8} x1={50} x2={x} y1={50} y2={y} opacity={isActive ? 0.4 : 0.14} strokeLinecap="round" />
                          <line stroke="#6fd8ca" strokeWidth={0.9} x1={50} x2={x} y1={50} y2={y} opacity={isActive ? 1 : 0.6} strokeLinecap="round" />
                          <line
                            className="edge-line"
                            stroke="url(#tube-core)"
                            strokeWidth={0.55}
                            x1={50} x2={x} y1={50} y2={y}
                            strokeDasharray="4 6"
                            strokeLinecap="round"
                          />
                        </g>
                      );
                    })}
                  </svg>


                  {/* central database — billboarded, floating above the hub */}
                  <div className="absolute" style={{ left: "50%", top: "50%", transformStyle: "preserve-3d" }}>
                    <div
                      style={{
                        width: DB_W,
                        height: DB_H,
                        marginLeft: -DB_W / 2,
                        marginTop: -DB_H / 2,
                        /* counter-rotate first, then lift — lift now happens
                           in screen space, not along the tilted floor axis */
                        transform: `${billboard} translateY(-${DB_H / 2 + 4}px)`
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
                    const focused = active === tableName;
                    return (
                      <div className="absolute" key={tableName} style={{ left: `${x}%`, top: `${y}%`, transformStyle: "preserve-3d" }}>
                        <button
                          aria-label={`Table ${tableName}`}
                          className="group/node absolute left-0 top-0 block focus:outline-none"
                          onBlur={() => setHovered(null)}
                          onClick={(event) => {
                            event.stopPropagation();
                            setPinned((current) => (current === tableName ? null : tableName));
                          }}
                          onFocus={() => setHovered(tableName)}
                          onMouseEnter={() => setHovered(tableName)}
                          onMouseLeave={() => setHovered(null)}
                          style={{
                            width: NODE_W,
                            height: nodeH,
                            marginLeft: -NODE_W / 2,
                            marginTop: -nodeH / 2,
                            /* counter-rotate first, then lift — lift now
                               happens in screen space, so the card sits
                               directly above its own pedestal every time */
                            transform: `${billboard} translateY(-${nodeH / 2 + 2}px)`,
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
                                background: "linear-gradient(150deg, #101318 0%, #1a1f26 55%, #232932 100%)"
                              }}
                            />
                            <span
                              aria-hidden
                              className="absolute inset-0 rounded-xl"
                              style={{ transform: "translate(-3px, 3.5px)", background: "linear-gradient(150deg, #2a303a 0%, #161a20 100%)" }}
                            />
                            <div
                              className={`relative h-full w-full overflow-hidden rounded-xl border bg-surface px-2.5 pb-1 pt-1.5 transition-all duration-200 group-hover/node:-translate-y-1 group-hover/node:scale-[1.08] group-hover/node:shadow-[0_14px_30px_rgba(23,93,85,0.18),0_0_24px_rgba(47,158,151,0.25)] ${
                                focused ? "-translate-y-1.5 scale-[1.08] border-brand-500/60 shadow-[0_16px_34px_rgba(23,93,85,0.20),0_0_26px_rgba(47,158,151,0.28)]" : "border-line shadow-[0_10px_22px_rgba(23,93,85,0.10)]"
                              }`}
                            >
                              <div className="flex items-center justify-between gap-1 border-b border-line pb-1">
                                <span className="flex min-w-0 items-center gap-1.5">
                                  <span className="grid h-4 w-4 shrink-0 place-items-center rounded bg-brand-500/10 text-brand-400">
                                    <Table2 size={10} />
                                  </span>
                                  <strong className="truncate text-[11px] font-bold text-ink">{tableName}</strong>
                                </span>
                                {pkCount > 0 && <KeyRound className="shrink-0 text-amber-300" size={11} />}
                              </div>
                              <ul className="space-y-0.5 py-1">
                                {table.columns.slice(0, 4).map((column) => {
                                  const key = column.key.toUpperCase();
                                  const badge =
                                    KEY_BADGES[key] ?? (column.name.endsWith("_id") && key !== "PRI" ? FK_BADGE : null);
                                  const dataType = column.type.split("(")[0].toLowerCase();
                                  return (
                                    <li className="flex items-center justify-between gap-1 leading-4" key={column.name}>
                                      <span className="truncate font-mono text-[9px] text-ink-soft sm:text-[9.5px]">{column.name}</span>
                                      <span className="flex shrink-0 items-center gap-1">
                                        {dataType && (
                                          <span className="text-[8px] font-medium uppercase tracking-wide text-ink-faint">{dataType}</span>
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
                                  <li className="pt-0.5 text-center text-[9px] font-semibold text-brand-400 sm:text-[9.5px]">
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
                style={{ background: "radial-gradient(circle at 50% 48%, transparent 55%, rgba(0,0,0,0.35) 100%)" }}
              />
            </>
          )}
        </div>


        {tables.length > 0 && (
          <>
            <span className="absolute bottom-3 left-3 rounded-full border border-brand-500/40 bg-brand-500/10 px-2.5 py-1 text-[11px] font-medium text-brand-300">
              {edges.length} relationship{edges.length === 1 ? "" : "s"}
              {hiddenCount > 0 ? ` · +${hiddenCount} table${hiddenCount === 1 ? "" : "s"} hidden` : ""}
            </span>
            <span className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] font-medium text-ink-soft">
              <MousePointer2 size={11} /> Hover a table · scroll to zoom · double-click to reset
            </span>
          </>
        )}
      </div>
    </section>
  );
}
