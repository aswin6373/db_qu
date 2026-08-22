import { Activity, Database, MessageSquare } from "lucide-react";
import { Dashboard as DashboardType } from "../types/api";

export function Dashboard({ dashboard }: { dashboard: DashboardType | null }) {
  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Workspace Dashboard</h1>
        <p className="text-sm text-slate-600">{dashboard?.organization.name ?? "Loading workspace"} activity and connection status.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Metric icon={<Database size={20} />} label="Connections" value={dashboard?.connection_count ?? 0} />
        <Metric icon={<MessageSquare size={20} />} label="Queries" value={dashboard?.query_count ?? 0} />
        <Metric icon={<Activity size={20} />} label="Recent Items" value={dashboard?.recent_activity.length ?? 0} />
      </div>
      <section className="rounded border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold">Recent Activity</h2>
        <div className="space-y-3">
          {(dashboard?.recent_activity ?? []).map((item) => (
            <div className="border-b border-slate-100 pb-3 last:border-0" key={item.id}>
              <p className="font-medium">{item.question}</p>
              <code className="mt-1 block overflow-x-auto rounded bg-slate-950 px-3 py-2 text-sm text-slate-100">{item.sql}</code>
            </div>
          ))}
          {dashboard?.recent_activity.length === 0 && <p className="text-sm text-slate-600">No query activity yet.</p>}
        </div>
      </section>
    </section>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded border border-slate-200 bg-white p-4">
      <div className="mb-3 text-forest">{icon}</div>
      <p className="text-sm text-slate-600">{label}</p>
      <strong className="text-3xl">{value}</strong>
    </div>
  );
}
