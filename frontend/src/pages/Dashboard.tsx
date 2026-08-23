import { Activity, Database, Gauge, MessageSquare, PlugZap, ShieldCheck, Table2 } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { SchemaGraph } from "../components/SchemaGraph";
import { Connection, Dashboard as DashboardType, DatabaseSchema, SchemaInsights } from "../types/api";

type Props = {
  connections: Connection[];
  dashboard: DashboardType | null;
  insights: Record<number, SchemaInsights>;
  schemas: Record<number, DatabaseSchema>;
  onOpenConnections: () => void;
};

export function Dashboard({ connections, dashboard, insights, schemas, onOpenConnections }: Props) {
  const primaryConnection = connections[0];
  const primarySchema = primaryConnection ? schemas[primaryConnection.id] : null;
  const primaryInsights = primaryConnection ? insights[primaryConnection.id] : null;
  const tableCount = Object.keys(primarySchema?.tables ?? {}).length;

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow={dashboard?.organization.name ?? "Workspace"}
        title="Operational Dashboard"
        description="Monitor connected databases, discovered schema, and recent AI-generated SQL activity from one production console."
        action={connections.length > 0 ? <button className="btn-secondary" onClick={onOpenConnections} type="button"><PlugZap size={16} /> Manage Connections</button> : null}
      />
      {connections.length === 0 && (
        <section className="panel border-coral/30 p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Connect your first database</h2>
              <p className="text-sm text-steel">QueryMind needs a live MySQL connection before chat, schema graphs, and production activity can work.</p>
            </div>
            <button className="btn-accent" onClick={onOpenConnections} type="button">
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
        <section className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="panel p-5">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-md bg-mist text-forest">
              <Gauge size={20} />
            </div>
            <p className="text-sm font-medium text-steel">AI Readiness</p>
            <strong className="mt-1 block text-4xl font-semibold text-ink">{primaryInsights?.score ?? 0}/100</strong>
            <p className="mt-2 text-sm leading-6 text-steel">{primaryInsights?.summary ?? "Schema analysis is loading."}</p>
          </div>
          <div className="panel p-5">
            <div className="mb-3 flex items-center gap-2">
              <ShieldCheck className="text-forest" size={18} />
              <h2 className="text-lg font-semibold text-ink">Production Guardrails</h2>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <Guardrail label="SQL validation" status="active" />
              <Guardrail label="Write confirmation" status="active" />
              <Guardrail label="Credential encryption" status="active" />
            </div>
          </div>
        </section>
      )}
      {primaryConnection && (
        <SchemaGraph insights={primaryInsights} schema={primarySchema} title={`${primaryConnection.name} Structure`} />
      )}
      <section className="panel p-5">
        <div className="mb-3 flex items-center gap-2">
          <Activity className="text-forest" size={18} />
          <h2 className="text-lg font-semibold text-ink">Recent Activity</h2>
        </div>
        <div className="space-y-3">
          {(dashboard?.recent_activity ?? []).map((item) => (
            <div className="border-b border-slate-100 pb-3 last:border-0" key={item.id}>
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <p className="font-medium">{item.question}</p>
                <span className="status-pill w-fit">{item.status}</span>
              </div>
              <code className="code-block mt-2">{item.sql}</code>
            </div>
          ))}
          {dashboard?.recent_activity.length === 0 && <p className="rounded-md border border-dashed border-line bg-paper px-4 py-8 text-center text-sm text-steel">No query activity yet.</p>}
        </div>
      </section>
    </section>
  );
}

function Guardrail({ label, status }: { label: string; status: string }) {
  return (
    <div className="rounded-md border border-line bg-paper p-3">
      <p className="text-sm font-semibold text-ink">{label}</p>
      <span className="status-pill mt-2 inline-flex text-forest">{status}</span>
    </div>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="panel p-5">
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-md bg-mist text-forest">{icon}</div>
      <p className="text-sm font-medium text-steel">{label}</p>
      <strong className="mt-1 block text-3xl font-semibold text-ink">{value}</strong>
    </div>
  );
}
