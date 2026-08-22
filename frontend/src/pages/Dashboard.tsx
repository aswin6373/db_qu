import { Activity, Database, MessageSquare, PlugZap, Table2 } from "lucide-react";
import { SchemaGraph } from "../components/SchemaGraph";
import { Connection, Dashboard as DashboardType, DatabaseSchema } from "../types/api";

type Props = {
  connections: Connection[];
  dashboard: DashboardType | null;
  schemas: Record<number, DatabaseSchema>;
  onOpenConnections: () => void;
};

export function Dashboard({ connections, dashboard, schemas, onOpenConnections }: Props) {
  const primaryConnection = connections[0];
  const primarySchema = primaryConnection ? schemas[primaryConnection.id] : null;
  const tableCount = Object.keys(primarySchema?.tables ?? {}).length;

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Workspace Dashboard</h1>
        <p className="text-sm text-slate-600">{dashboard?.organization.name ?? "Loading workspace"} activity and connection status.</p>
      </div>
      {connections.length === 0 && (
        <section className="rounded border border-coral/30 bg-white p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Connect your first database</h2>
              <p className="text-sm text-slate-600">QueryMind needs a live MySQL connection before chat, schema graphs, and production activity can work.</p>
            </div>
            <button className="flex items-center justify-center gap-2 rounded bg-coral px-4 py-2 font-semibold text-white" onClick={onOpenConnections} type="button">
              <PlugZap size={18} /> Connect Database
            </button>
          </div>
        </section>
      )}
      <div className="grid gap-4 md:grid-cols-3">
        <Metric icon={<Database size={20} />} label="Connections" value={dashboard?.connection_count ?? 0} />
        <Metric icon={<MessageSquare size={20} />} label="Queries" value={dashboard?.query_count ?? 0} />
        <Metric icon={<Table2 size={20} />} label="Discovered Tables" value={tableCount} />
      </div>
      {primaryConnection && (
        <SchemaGraph schema={primarySchema} title={`${primaryConnection.name} Structure`} />
      )}
      <section className="rounded border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center gap-2">
          <Activity className="text-forest" size={18} />
          <h2 className="text-lg font-semibold">Recent Activity</h2>
        </div>
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
