import { useMemo, useRef, useState } from "react";
import { DatabaseZap, KeyRound, MousePointer2, Table2 } from "lucide-react";
import { DatabaseSchema, SchemaInsights } from "../types/api";

type Props = {
  schema?: DatabaseSchema | null;
  insights?: SchemaInsights | null;
  title?: string;
};

const SLOTS: Array<[number, number]> = [
  [18, 24],
  [47, 12],
  [79, 21],
  [85, 55],
  [70, 84],
  [37, 88],
  [12, 71],
  [26, 45]
];

export function SchemaConstellation({ schema, insights, title = "Primary schema & database relationships" }: Props) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [hovered, setHovered] = useState<string | null>(null);

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

  const rotX = 54 - tilt.y * 7;
  const rotZ = -40 + tilt.x * 10;
  const billboard = `translate(-50%, -50%) rotateZ(${-rotZ}deg) rotateX(${-rotX}deg)`;

  const handleMove = (event: React.MouseEvent<HTMLDivElement>) => {
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

      <div
        ref={frameRef}
        className="scene-viewport relative min-h-[420px] flex-1 overflow-hidden rounded-xl border border-white/5 bg-[#071120] sm:min-h-[480px]"
        onMouseLeave={() => {
          setTilt({ x: 0, y: 0 });
          setHovered(null);
        }}
        onMouseMove={handleMove}
      >
        {/* ambient glow */}
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
            {/* 3D world */}
            <div className="absolute inset-0">
              <div
                className="absolute inset-[-14%] transition-transform duration-300 ease-out will-change-transform"
                style={{ transformStyle: "preserve-3d", transform: `rotateX(${rotX}deg) rotateZ(${rotZ}deg)` }}
              >
                {/* floor */}
                <div className="floor-grid absolute inset-0 opacity-80" />
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{ background: "radial-gradient(circle at 50% 50%, transparent 32%, rgba(7,17,32,0.94) 82%)" }}
                />

                {/* relationship lines & particles (flat on the floor) */}
                <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
                  {tables.map(([name], index) => {
                    const [x, y] = SLOTS[index % SLOTS.length];
                    const dim = activeSet !== null && !activeSet.has(name);
                    return (
                      <line
                        key={`spoke-${name}`}
                        opacity={dim ? 0.06 : 0.25}
                        stroke="#2f9e97"
                        strokeWidth={0.22}
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
                      <g key={`${edge.from}-${edge.column}-${edge.to}`} opacity={dim ? 0.14 : 1}>
                        <path
                          className="edge-line"
                          d={path}
                          fill="none"
                          stroke="#7cc2bc"
                          strokeDasharray="1.6 1.4"
                          strokeLinecap="round"
                          strokeWidth={0.42}
                        />
                        <circle fill="#a7dcd7" r={0.55}>
                          <animateMotion dur={`${2.8 + (index % 4) * 0.9}s`} path={path} repeatCount="indefinite" />
                        </circle>
                      </g>
                    );
                  })}
                </svg>

                {/* glow pads under nodes */}
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
                        opacity: dim ? 0.15 : 0.55,
                        background: "radial-gradient(closest-side, rgba(47,158,151,0.4), transparent)"
                      }}
                    />
                  );
                })}

                {/* central database */}
                <div className="absolute" style={{ left: "50%", top: "50%", transformStyle: "preserve-3d" }}>
                  <div style={{ transform: billboard }} className="node-float">
                    <svg filter="drop-shadow(0 0 22px rgba(47,158,151,0.6))" height="104" viewBox="0 0 100 120" width="87">
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

                {/* table nodes (billboarded: stand upright facing the viewer) */}
                {tables.map(([tableName, table]) => {
                  const [x, y] = slotByName.get(tableName)!;
                  const pkCount = table.columns.filter((column) => column.key === "PRI").length;
                  const dim = activeSet !== null && !activeSet.has(tableName);
                  const focused = hovered === tableName;
                  return (
                    <div
                      className="absolute"
                      key={tableName}
                      style={{ left: `${x}%`, top: `${y}%`, transformStyle: "preserve-3d" }}
                    >
                      <button
                        aria-label={`Table ${tableName}`}
                        className="group/node block w-24 text-left focus:outline-none sm:w-28"
                        onBlur={() => setHovered(null)}
                        onFocus={() => setHovered(tableName)}
                        onMouseEnter={() => setHovered(tableName)}
                        onMouseLeave={() => setHovered(null)}
                        style={{ transform: billboard, opacity: dim ? 0.35 : 1, transition: "opacity 200ms ease" }}
                        type="button"
                      >
                        <div
                          className={`rounded-lg border px-2 pb-1 pt-1.5 backdrop-blur-sm transition-all duration-200 group-hover/node:-translate-y-1 group-hover/node:shadow-[0_0_24px_rgba(47,158,151,0.35)] ${
                            focused ? "border-teal/60 bg-[#0e2537]/95" : "border-white/10 bg-[#0c1c2e]/90"
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
                          <ul className="space-y-0.5 py-1">
                            {table.columns.slice(0, 3).map((column) => (
                              <li className="truncate font-mono text-[9px] leading-4 text-slate-400 sm:text-[10px]" key={column.name}>
                                {column.name}
                              </li>
                            ))}
                            {table.columns.length > 3 && (
                              <li className="text-[9px] font-medium text-teal-soft/70 sm:text-[10px]">
                                +{table.columns.length - 3} more
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

            {/* screen-space vignette */}
            <div
              className="pointer-events-none absolute inset-0 rounded-xl"
              style={{ background: "radial-gradient(circle at 50% 48%, transparent 58%, rgba(7,17,32,0.55) 100%)" }}
            />

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
