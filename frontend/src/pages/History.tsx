import { History as HistoryIcon } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { Dashboard } from "../types/api";

export function History({ dashboard }: { dashboard: Dashboard | null }) {
  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Audit Trail"
        title="Chat History"
        description="Review recent natural-language requests, generated SQL, and execution states for this organization."
      />
      <div className="panel p-5">
        <div className="mb-4 flex items-center gap-2">
          <HistoryIcon className="text-forest" size={18} />
          <h2 className="text-lg font-semibold text-ink">Recent Requests</h2>
        </div>
        {(dashboard?.recent_activity ?? []).map((item) => (
          <article className="border-b border-line py-4 first:pt-0 last:border-0" key={item.id}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="font-medium text-ink">{item.question}</p>
              <span className="status-pill w-fit">{item.status}</span>
            </div>
            <code className="code-block mt-3">{item.sql}</code>
          </article>
        ))}
        {dashboard?.recent_activity.length === 0 && <p className="rounded-md border border-dashed border-line bg-paper px-4 py-8 text-center text-sm text-steel">No history yet.</p>}
      </div>
    </section>
  );
}
