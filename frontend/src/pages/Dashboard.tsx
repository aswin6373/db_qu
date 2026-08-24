import { Activity, ArrowUpRight, Database, MessageSquare, ShieldCheck, Sparkles, Table2 } from "lucide-react";
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
  const score = primaryInsights?.score ?? 0;

  return (
    <section className="space-y-7">
      <PageHeader
        eyebrow={dashboard?.organization.name ?? "Workspace"}
        title="Operational Dashboard"
        description="Monitor connected databases, discovered schema, and recent AI-generated SQL activity from one production console."
        action={
          connections.length > 0 ? (
            <button className="btn-secondary" onClick={onOpenConnections} type="button">
              <Database size={15} /> Manage connections
            </button>
          ) : null
        }
      />

      {connections.length === 0 && (
        <section className="card animate-fade-up overflow-hidden border-brand-200 bg-gradient-to-br from-brand-50 via-white to-violet-50 p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Connect your first database</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                QueryMind needs a live MySQL connection before chat, schema graphs, and activity tracking come alive.
              </p>
            </div>
            <button className="btn-accent shrink-0" onClick={onOpenConnections} type="button">
              <ArrowUpRight size={17} /> Connect database
            </button>
          </div>
        </section>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Metric icon={<Database size={18} />} label="Connections" value={dashboard?.connection_count ?? 0} tone="brand" />
        <Metric icon={<MessageSquare size={18} />} label="AI queries" value={dashboard?.query_count ?? 0} tone="violet" />
        <Metric icon={<Table2 size={18} />} label="Discovered tables" value={tableCount} tone="emerald" />
        <ScoreCard score={score} />
      </div>

      {primaryConnection && (
        <section className="grid gap-4 xl:grid-cols-[1.15fr_1fr]">
          <div className="card p-6">
            <SectionTitle icon={<Sparkles size={16} />} title="AI readiness" subtitle={primaryInsights?.summary ?? "Schema analysis is loading."} />
            <div className="mt-5 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-brand-500 to-violet-500 transition-all duration-700"
                style={{ width: `${Math.min(100, Math.max(4, score))}%` }}
              />
            </div>
            <div className="mt-2 flex justify-between text-xs font-medium text-slate-400">
              <span>Readiness score</span>
              <span>{score}/100</span>
            </div>
          </div>
          <div className="card p-6">
            <SectionTitle icon={<ShieldCheck size={16} />} title="Production guardrails" subtitle="Every query passes through three safety layers." />
            <div className="mt-5 grid gap-2.5 sm:grid-cols-3">
              <Guardrail label="SQL validation" />
              <Guardrail label="Write confirmation" />
              <Guardrail label="Encrypted credentials" />
            </div>
          </div>
        </section>
      )}

      {primaryConnection && (
        <SchemaGraph insights={primaryInsights} schema={primarySchema} title={`${primaryConnection.name} structure`} />
      )}

      <section className="card p-6">
        <SectionTitle icon={<Activity size={16} />} title="Recent activity" subtitle="The five most recent AI-generated queries in this workspace." />
        <div className="mt-4 divide-y divide-slate-100">
          {(dashboard?.recent_activity ?? []).map((item) => (
            <div className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between" key={item.id}>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-800">{item.question}</p>
                <code className="mt-1 block truncate font-mono text-xs text-slate-400">{item.sql}</code>
              </div>
              <StatusPill status={item.status} />
            </div>
          ))}
          {dashboard?.recent_activity.length === 0 && <EmptyState icon={<Activity size={22} />} text="No query activity yet. Start a conversation in AI Chat." />}
        </div>
      </section>
    </section>
  );
}

function Metric({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: "brand" | "violet" | "emerald" }) {
  const tones = {
    brand: "bg-brand-50 text-brand-600",
    violet: "bg-violet-50 text-violet-600",
    emerald: "bg-emerald-50 text-emerald-600"
  };
  return (
    <div className="card card-hover animate-fade-up p-5">
      <div className={`mb-4 grid h-10 w-10 place-items-center rounded-xl ${tones[tone]}`}>{icon}</div>
      <p className="text-[13px] font-medium text-slate-500">{label}</p>
      <strong className="mt-0.5 block text-3xl font-bold tracking-tight text-slate-900">{value}</strong>
    </div>
  );
}

function ScoreCard({ score }: { score: number }) {
  return (
    <div className="card card-hover animate-fade-up p-5">
      <div className="mb-4 grid h-10 w-10 place-items-center rounded-xl bg-amber-50 text-amber-600">
        <Sparkles size={18} />
      </div>
      <p className="text-[13px] font-medium text-slate-500">AI readiness</p>
      <strong className="mt-0.5 block text-3xl font-bold tracking-tight text-slate-900">
        {score}
        <span className="text-base font-semibold text-slate-400">/100</span>
      </strong>
    </div>
  );
}

function SectionTitle({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-50 text-brand-600">{icon}</span>
        <h2 className="text-base font-bold tracking-tight text-slate-900">{title}</h2>
      </div>
      {subtitle && <p className="mt-1.5 pl-10 text-sm leading-5 text-slate-500">{subtitle}</p>}
    </div>
  );
}

function Guardrail({ label }: { label: string }) {
  return (
    <div className="inset-tile flex items-center gap-2.5 px-3 py-3">
      <ShieldCheck className="shrink-0 text-emerald-500" size={15} />
      <span className="text-[13px] font-medium leading-tight text-slate-700">{label}</span>
    </div>
  );
}

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    executed: "pill-success",
    pending_confirmation: "pill-warn",
    failed: "bg-rose-50 text-rose-700 border-rose-200"
  };
  const label = status.replace(/_/g, " ");
  return <span className={`status-pill shrink-0 capitalize ${map[status] ?? ""}`}>{label}</span>;
}

export function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-12 text-center">
      <span className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-full bg-white text-slate-300 shadow-sm">{icon}</span>
      <p className="mx-auto max-w-sm text-sm leading-6 text-slate-500">{text}</p>
    </div>
  );
}
