import { History as HistoryIcon } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { EmptyState, StatusPill } from "./Dashboard";
import { Dashboard } from "../types/api";

export function History({ dashboard }: { dashboard: Dashboard | null }) {
  const items = dashboard?.recent_activity ?? [];
  return (
    <section className="space-y-7">
      <PageHeader
        eyebrow="Audit trail"
        title="Chat history"
        description="Review recent natural-language requests, generated SQL, and execution states for this organization."
      />
      <div className="card p-6 sm:p-7">
        <div className="mb-5 flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-50 text-brand-600">
            <HistoryIcon size={17} />
          </span>
          <h2 className="text-base font-bold tracking-tight text-slate-900">Recent requests</h2>
          {items.length > 0 && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">{items.length}</span>
          )}
        </div>

        <div className="relative space-y-1 border-l border-slate-200 pl-6">
          {items.map((item) => (
            <article className="relative py-3.5" key={item.id}>
              <span className="absolute -left-[30px] top-5 h-2.5 w-2.5 rounded-full border-2 border-white bg-brand-500 shadow" />
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-medium text-slate-800">{item.question}</p>
                <StatusPill status={item.status} />
              </div>
              <code className="code-block mt-2.5">{item.sql}</code>
            </article>
          ))}
        </div>
        {items.length === 0 && <EmptyState icon={<HistoryIcon size={22} />} text="No history yet. Your questions will appear here after your first query." />}
      </div>
    </section>
  );
}
