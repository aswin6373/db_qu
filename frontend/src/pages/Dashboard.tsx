import { Activity, ArrowUpRight, Database, MessageSquare, ShieldCheck, Sparkles, Table2 } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { SchemaConstellation } from "../components/SchemaConstellation";
import { Sparkline } from "../components/Sparkline";
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
  const activity = dashboard?.recent_activity ?? [];
  const rowsSeries = [...activity].reverse().map((item) => item.rows_returned ?? 0);

  return (
    <section className="space-y-7">
      <PageHeader
        eyebrow={dashboard?.organization.name ?? "Workspace"}
        title="Operational Dashboard"
        description="Track activity from this production console — live schema relationships, AI query traffic, and guarded operations."
        action={
          connections.length > 0 ? (
            <button className="btn-secondary" onClick={onOpenConnections} type="button">
              <Database size={15} /> Manage connections
            </button>
          ) : null
        }
      />

      {connections.length === 0 && (
        <section className="card animate-fade-up border-brand-200 bg-gradient-to-br from-brand-50 via-white to-cream p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Connect your first database</h2>
              <p className="mt-1 text-sm text-slate-600">
                QueryMind needs a live MySQL connection before the console comes alive.
              </p>
            </div>
            <button className="btn-accent shrink-0" onClick={onOpenConnections} type="button">
              <ArrowUpRight size={17} /> Connect database
            </button>
          </div>
        </section>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard icon={<Database size={17} />} label="Connections" value={dashboard?.connection_count ?? 0} />
        <KpiCard
          icon={<MessageSquare size={17} />}
          label="AI queries"
          value={dashboard?.query_count ?? 0}
          footer={rowsSeries.length > 1 ? <Sparkline height={30} values={rowsSeries} /> : undefined}
        />
        <KpiCard icon={<Table2 size={17} />} label="Discovered tables" value={tableCount} />
        <KpiCard
          icon={<Sparkles size={17} />}
          label="AI readiness"
          value={`${score}`}
          suffix="/100"
          footer={<ReadinessRing score={score} />}
        />
      </div>

      {/* Constellation + pulse */}
      <div className="grid gap-4 xl:grid-cols-[1.55fr_1fr]">
        <SchemaConstellation insights={primaryInsights} schema={primarySchema} title={`${primaryConnection?.name ?? "Workspace"} · schema relationships`} />

        <div className="flex flex-col gap-4">
          <section className="card-dark flex-1 p-5 sm:p-6">
            <SectionTitle icon={<Activity size={15} />} title="Query result volume" subtitle="Rows returned by your most recent AI queries." />
            <div className="mt-4 rounded-xl border border-white/5 bg-[#091420] p-3">
              <Sparkline height={90} values={rowsSeries.length ? rowsSeries : [0, 0, 0]} />
              <div className="mt-2 flex justify-between text-[10px] font-medium uppercase tracking-wider text-slate-500">
                <span>oldest</span>
                <span>{rowsSeries.reduce((total, value) => total + value, 0)} rows total</span>
                <span>latest</span>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <MiniStat label="Queries" value={dashboard?.query_count ?? 0} />
              <MiniStat label="Tables" value={tableCount} />
              <MiniStat label="Columns" value={Object.values(primarySchema?.tables ?? {}).reduce((total, table) => total + table.columns.length, 0)} />
            </div>
          </section>

          <section className="card-dark p-5 sm:p-6">
            <SectionTitle icon={<ShieldCheck size={15} />} title="Production guardrails" subtitle="Active on every query in this workspace." />
            <div className="mt-4 grid gap-2">
              <Guardrail label="SQL validation" detail="Every statement parsed & schema-checked" />
              <Guardrail label="Write confirmation" detail="INSERT / UPDATE / DELETE wait for you" />
              <Guardrail label="Encrypted credentials" detail="Fernet encryption at rest" />
            </div>
          </section>
        </div>
      </div>

      {/* Activity logs */}
      <section className="card-dark p-5 sm:p-6">
        <SectionTitle icon={<Activity size={15} />} title="Recent activity logs" subtitle="The five most recent AI-generated queries in this organization." />
        <div className="mt-4 divide-y divide-white/5">
          {activity.map((item) => (
            <div className="flex flex-col gap-2 py-3.5 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between" key={item.id}>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium text-slate-200">{item.question}</p>
                  {item.created_at && (
                    <span className="shrink-0 text-[11px] text-slate-500">{timeAgo(item.created_at)}</span>
                  )}
                </div>
                <code className="mt-1 block truncate font-mono text-xs text-slate-500">{item.sql}</code>
              </div>
              <DarkStatusPill status={item.status} />
            </div>
          ))}
          {activity.length === 0 && (
            <p className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-slate-500">
              No query activity yet. Start a conversation in AI Chat.
            </p>
          )}
        </div>
      </section>
    </section>
  );
}

function KpiCard({
  icon,
  label,
  value,
  suffix,
  footer
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  suffix?: string;
  footer?: React.ReactNode;
}) {
  return (
    <div className="card-dark animate-fade-up p-5">
      <div className="flex items-center justify-between">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-teal/15 text-teal-soft">{icon}</span>
        <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500">{label}</span>
      </div>
      <strong className="mt-3 block text-3xl font-bold tracking-tight text-white">
        {value}
        {suffix && <span className="text-base font-semibold text-slate-500">{suffix}</span>}
      </strong>
      {footer && <div className="mt-2">{footer}</div>}
    </div>
  );
}

function ReadinessRing({ score }: { score: number }) {
  const radius = 15;
  const circumference = 2 * Math.PI * radius;
  const filled = (Math.min(100, Math.max(0, score)) / 100) * circumference;
  return (
    <svg height="40" viewBox="0 0 40 40" width="40">
      <circle cx="20" cy="20" fill="none" r={radius} stroke="rgba(148,163,184,0.2)" strokeWidth="4" />
      <circle
        cx="20"
        cy="20"
        fill="none"
        r={radius}
        stroke="#2f9e97"
        strokeLinecap="round"
        strokeDasharray={`${filled} ${circumference}`}
        strokeWidth="4"
        transform="rotate(-90 20 20)"
      />
      <text fill="#e2e8f0" fontSize="10" fontWeight="700" textAnchor="middle" x="20" y="24">
        {score}
      </text>
    </svg>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2.5 text-center">
      <strong className="block text-lg font-bold text-white">{value}</strong>
      <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{label}</span>
    </div>
  );
}

function SectionTitle({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div>
      <div className="flex items-center gap-2.5">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-teal/15 text-teal-soft">{icon}</span>
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200">{title}</h2>
      </div>
      {subtitle && <p className="mt-1.5 pl-[42px] text-[13px] leading-5 text-slate-500">{subtitle}</p>}
    </div>
  );
}

function Guardrail({ label, detail }: { label: string; detail: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.03] px-3.5 py-2.5">
      <ShieldCheck className="shrink-0 text-teal-soft" size={15} />
      <div className="min-w-0">
        <p className="truncate text-[13px] font-semibold text-slate-200">{label}</p>
        <p className="truncate text-[11px] text-slate-500">{detail}</p>
      </div>
      <span className="ml-auto shrink-0 rounded-full bg-teal/15 px-2 py-0.5 text-[10px] font-bold uppercase text-teal-soft">
        on
      </span>
    </div>
  );
}

function DarkStatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    executed: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
    pending_confirmation: "border-amber-400/30 bg-amber-400/10 text-amber-300",
    failed: "border-rose-400/30 bg-rose-400/10 text-rose-300"
  };
  return (
    <span
      className={`inline-flex w-fit shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold capitalize ${
        map[status] ?? "border-white/10 bg-white/5 text-slate-400"
      }`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
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
