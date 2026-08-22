import { Dashboard } from "../types/api";

export function History({ dashboard }: { dashboard: Dashboard | null }) {
  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Chat History</h1>
        <p className="text-sm text-slate-600">Recent questions and generated SQL for this organization.</p>
      </div>
      <div className="rounded border border-slate-200 bg-white p-4">
        {(dashboard?.recent_activity ?? []).map((item) => (
          <article className="border-b border-slate-100 py-3 first:pt-0 last:border-0" key={item.id}>
            <p className="font-medium">{item.question}</p>
            <p className="text-sm text-slate-600">Status: {item.status}</p>
            <code className="mt-2 block overflow-x-auto rounded bg-slate-950 px-3 py-2 text-sm text-slate-100">{item.sql}</code>
          </article>
        ))}
        {dashboard?.recent_activity.length === 0 && <p className="text-sm text-slate-600">No history yet.</p>}
      </div>
    </section>
  );
}
