import { ArrowRight, DatabaseZap, GitBranch, KeyRound, Table2 } from "lucide-react";
import { DatabaseSchema, SchemaInsights } from "../types/api";

type Props = {
  schema?: DatabaseSchema | null;
  insights?: SchemaInsights | null;
  title?: string;
};

export function SchemaGraph({ schema, insights, title = "Database structure" }: Props) {
  const tables = Object.entries(schema?.tables ?? {});
  const tableCount = tables.length;
  const columnCount = tables.reduce((total, [, table]) => total + table.columns.length, 0);
  const keyCount = tables.reduce((total, [, table]) => total + table.columns.filter((column) => column.key).length, 0);
  const score = insights?.score ?? (tableCount > 0 ? 70 : 0);

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
          <div className="panel-soft p-4">
            <div className="mb-3.5 flex items-center gap-2">
              <GitBranch className="text-brand-600" size={16} />
              <h3 className="text-sm font-bold text-slate-900">Relationship map</h3>
            </div>
            {insights?.edges.length ? (
              <div className="grid gap-2 md:grid-cols-2">
                {insights.edges.map((edge) => (
                  <div
                    className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
                    key={`${edge.from}-${edge.column}-${edge.to}`}
                  >
                    <span className="truncate font-semibold text-slate-800">{edge.from}</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 font-mono text-[11px] font-medium text-brand-700">
                      {edge.column} <ArrowRight size={11} />
                    </span>
                    <span className="truncate text-right font-semibold text-brand-700">{edge.to}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-lg border border-dashed border-slate-200 bg-white px-4 py-7 text-center text-xs leading-5 text-slate-400">
                No relationships inferred yet. Columns ending in <code className="font-mono">_id</code> help QueryMind
                understand joins.
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
