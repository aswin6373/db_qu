import { DatabaseZap, KeyRound, Table2 } from "lucide-react";
import { DatabaseSchema, SchemaInsights } from "../types/api";

type Props = {
  schema?: DatabaseSchema | null;
  insights?: SchemaInsights | null;
  title?: string;
};

const SLOTS: Array<[number, number]> = [
  [13, 20],
  [40, 8],
  [72, 14],
  [89, 46],
  [74, 82],
  [42, 90],
  [10, 68],
  [24, 44]
];

export function SchemaConstellation({ schema, insights, title = "Primary schema & database relationships" }: Props) {
  const allTables = Object.entries(schema?.tables ?? {});
  const tables = allTables.slice(0, 8);
  const hiddenCount = allTables.length - tables.length;
  const slotByName = new Map<string, [number, number]>();
  tables.forEach(([name], index) => slotByName.set(name, SLOTS[index % SLOTS.length]));
  const edges = (insights?.edges ?? []).filter(
    (edge) => slotByName.has(edge.from) && slotByName.has(edge.to) && edge.from !== edge.to
  );

  return (
    <section className="card-dark flex flex-col overflow-hidden p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-teal/15 text-teal-soft">
            <DatabaseZap size={16} />
          </span>
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200">{title}</h2>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-teal/30 bg-teal/10 px-3 py-1 text-[11px] font-semibold text-teal-soft">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal opacity-70" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-teal" />
          </span>
          Live schema
        </span>
      </div>

      <div className="relative min-h-[380px] flex-1 overflow-hidden rounded-xl border border-white/5 bg-[#091420] sm:min-h-[440px]">
        {/* glow backdrop */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-56 w-56 -translate-x-1/2 -translate-y-1/2 rounded-full bg-teal/10 blur-3xl" />

        {tables.length === 0 ? (
          <div className="grid h-full place-items-center px-6 text-center">
            <p className="max-w-xs text-sm leading-6 text-slate-500">
              No schema discovered yet. Connect a database and QueryMind will map its tables and relationships here.
            </p>
          </div>
        ) : (
          <>
            {/* relationship lines */}
            <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
              {tables.map(([name], index) => {
                const [x, y] = SLOTS[index % SLOTS.length];
                return (
                  <line
                    key={`spoke-${name}`}
                    opacity={0.35}
                    stroke="#2f9e97"
                    strokeWidth={0.3}
                    x1={48}
                    x2={x}
                    y1={52}
                    y2={y}
                  />
                );
              })}
              {edges.map((edge) => {
                const from = slotByName.get(edge.from);
                const to = slotByName.get(edge.to);
                if (!from || !to) return null;
                return (
                  <line
                    key={`${edge.from}-${edge.column}-${edge.to}`}
                    opacity={0.8}
                    stroke="#7cc2bc"
                    strokeDasharray="1.4 1"
                    strokeWidth={0.45}
                    x1={from[0]}
                    x2={to[0]}
                    y1={from[1]}
                    y2={to[1]}
                  />
                );
              })}
            </svg>

            {/* central database cylinder */}
            <div className="absolute left-[48%] top-1/2 -translate-x-1/2 -translate-y-1/2">
              <svg filter="drop-shadow(0 0 18px rgba(47,158,151,0.55))" height="110" viewBox="0 0 100 120" width="92">
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
                <path d="M10 55 a40 14 0 0 0 80 0" fill="none" stroke="#7cc2bc" opacity="0.7" strokeWidth="1.4" />
                <path d="M10 75 a40 14 0 0 0 80 0" fill="none" stroke="#7cc2bc" opacity="0.45" strokeWidth="1.4" />
              </svg>
            </div>

            {/* table nodes */}
            {tables.map(([tableName, table]) => {
              const [x, y] = slotByName.get(tableName)!;
              const pkCount = table.columns.filter((column) => column.key === "PRI").length;
              return (
                <div
                  className="absolute w-24 sm:w-32"
                  key={tableName}
                  style={{
                    left: `${x}%`,
                    top: `${y}%`,
                    transform: "translate(-50%, -50%) perspective(900px) rotateX(26deg) rotateZ(-8deg)"
                  }}
                >
                  <div className="rounded-lg border border-teal/30 bg-[#0e2233]/95 shadow-[0_0_20px_rgba(47,158,151,0.18)] backdrop-blur">
                    <div className="flex items-center justify-between gap-1 border-b border-teal/20 px-2 py-1.5">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <Table2 className="shrink-0 text-teal-soft" size={11} />
                        <strong className="truncate font-mono text-[10px] font-semibold text-slate-100 sm:text-[11px]">
                          {tableName}
                        </strong>
                      </span>
                      {pkCount > 0 && <KeyRound className="shrink-0 text-amber-300" size={10} />}
                    </div>
                    <ul className="space-y-0.5 px-2 py-1.5">
                      {table.columns.slice(0, 3).map((column) => (
                        <li className="truncate font-mono text-[9px] leading-4 text-slate-400 sm:text-[10px]" key={column.name}>
                          {column.name}
                        </li>
                      ))}
                      {table.columns.length > 3 && (
                        <li className="text-[9px] text-teal-soft/70 sm:text-[10px]">+{table.columns.length - 3} more</li>
                      )}
                    </ul>
                  </div>
                </div>
              );
            })}

            {hiddenCount > 0 && (
              <span className="absolute bottom-3 right-3 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-slate-400">
                +{hiddenCount} more table{hiddenCount > 1 ? "s" : ""}
              </span>
            )}
            {edges.length > 0 && (
              <span className="absolute bottom-3 left-3 rounded-full border border-teal/25 bg-teal/10 px-2.5 py-1 text-[11px] font-medium text-teal-soft">
                {edges.length} relationship{edges.length > 1 ? "s" : ""}
              </span>
            )}
          </>
        )}
      </div>
    </section>
  );
}
