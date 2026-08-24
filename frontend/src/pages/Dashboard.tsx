import { useEffect, useMemo, useState } from "react";
import { Activity, ArrowUpRight, Check, Copy, Database, MessageSquare, ShieldCheck, Sparkles, Table2 } from "lucide-react";
import type { ReactNode } from "react";
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
  const columnCount = Object.values(primarySchema?.tables ?? {}).reduce((total, table) => total + table.columns.length, 0);
  const relationshipCount = primaryInsights?.relationship_count ?? 0;
  const score = primaryInsights?.score ?? 0;

  const activity = dashboard?.recent_activity ?? [];
  const rowsSeries = [...activity].reverse().map((item) => item.rows_returned ?? 0);
  const totalRows = rowsSeries.reduce((total, value) => total + value, 0);
  const avgRows = activity.length > 0 ? Math.round(totalRows / activity.length) : 0;

  // keep relative timestamps fresh
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setTick((n) => n + 1), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const statuses = useMemo(() => Array.from(new Set(activity.map((item) => item.status))), [activity]);
  const visibleActivity = statusFilter === "all" ? activity : activity.filter((item) => item.status === statusFilter);

  const copySql = async (id: number, sql: string) => {
    try {
      await navigator.clipboard.writeText(sql);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId(null), 1600);
    } catch {
      /* clipboard unavailable */
    }
  };

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
        <section className="card animate-fade-up border-brand-200 bg-gradient-to-br from-brand-50 via-white to-cream p-6 sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-md">
              <h2 className="text-lg font-bold text-slate-900">Connect your first database</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                QueryMind needs a live MySQL connection before the console comes alive.
              </p>
            </div>
            <ol className="flex flex-1 flex-wrap gap-3">
              {[
                { step: "01", label: "Connect", detail: "Add MySQL credentials" },
                { step: "02", label: "Discover", detail: "Schema auto-mapped" },
                { step: "03", label: "Ask", detail: "Chat in plain English" }
              ].map((item) => (
                <li className="inset-tile flex min-w-[150px] flex-1 items-center gap-3 px-3.5 py-3" key={item.step}>
                  <span className="font-mono text-xs font-bold text-brand-600">{item.step}</span>
                  <span>
                    <strong className="block text-[13px] font-semibold text-slate-800">{item.label}</strong>
                    <span className="block text-[11px] text-slate-500">{item.detail}</span>
                  </span>
                </li>
              ))}
            </ol>
            <button className="btn-accent shrink-0" onClick={onOpenConnections} type="button">
              <ArrowUpRight size={17} /> Connect database
            </button>
          </div>
        </section>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <KpiCard
          caption={activity.length > 0 ? `${totalRows.toLocaleString()} rows returned` : "No queries yet"}
          footer={rowsSeries.length > 1 ? <Sparkline height={30} values={rowsSeries} /> : undefined}
          icon={<MessageSquare size={17} />}
          label="AI queries"
          value={dashboard?.query_count ?? 0}
        />
        <KpiCard caption={`${columnCount.toLocaleString()} columns indexed`} icon={<Table2 size={17} />} label="Discovered tables" value={tableCount} />
        <KpiCard
          caption={readinessLabel(score)}
          footer={<ReadinessRing score={score} />}
          icon={<Sparkles size={17} />}
          label="AI readiness"
          suffix="/100"
          value={score}
        />
      </div>

      {/* Constellation + pulse */}
      <div className="grid gap-4 xl:grid-cols-[1.55fr_1fr]">
        <SchemaConstellation insights={primaryInsights} schema={primarySchema} title={`${primaryConnection?.name ?? "Workspace"} · schema relationships`} />

        <div className="flex flex-col gap-4">
          <section className="card flex-1 p-5 sm:p-6">
            <SectionTitle icon={<Activity size={15} />} subtitle="Rows returned by your most recent AI queries." title="Query result volume" />
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
              <Sparkline height={90} values={rowsSeries.length ? rowsSeries : [0, 0, 0]} />
              <div className="mt-2 flex justify-between text-[10px] font-medium uppercase tracking-wider text-slate-500">
                <span>oldest</span>
                <span>{totalRows.toLocaleString()} rows total</span>
                <span>latest</span>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <MiniStat label="Tables" value={tableCount} />
              <MiniStat label="Columns" value={columnCount} />
              <MiniStat label="Relationships" value={relationshipCount} />
              <MiniStat label="Avg rows / query" value={avgRows} />
            </div>
          </section>

          <section className="card p-5 sm:p-6">
            <SectionTitle icon={<ShieldCheck size={15} />} subtitle="Active on every query in this workspace." title="Production guardrails" />
            <div className="mt-4 grid gap-2">
              <Guardrail detail="Every statement parsed & schema-checked" label="SQL validation" />
              <Guardrail detail="INSERT / UPDATE / DELETE wait for you" label="Write confirmation" />
              <Guardrail detail="Fernet encryption at rest" label="Encrypted credentials" />
            </div>
          </section>
        </div>
      </div>

      {/* Activity logs */}
      <section className="card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <SectionTitle icon={<Activity size={15} />} subtitle="The five most recent AI-generated queries in this organization." title="Recent activity logs" />
          {statuses.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {["all", ...statuses].map((status) => (
                <button
                  className={`rounded-full border px-3 py-1 text-[11px] font-semibold capitalize transition ${
                    statusFilter === status
                      ? "border-brand-200 bg-brand-50 text-brand-700"
                      : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700"
                  }`}
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  type="button"
                >
                  {status.replace(/_/g, " ")}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="mt-4 divide-y divide-slate-100">
          {visibleActivity.map((item) => (
            <div className="group flex flex-col gap-2 py-3.5 transition first:pt-0 last:pb-0 hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between" key={item.id}>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium text-slate-800">{item.question}</p>
                  {item.created_at && (
                    <span className="shrink-0 font-mono text-[11px] text-slate-400">{timeAgo(item.created_at)}</span>
                  )}
                </div>
                <code className="mt-1 block max-w-xl truncate rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600">
                  {item.sql}
                </code>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {item.rows_returned != null && (
                  <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[11px] font-medium text-slate-500">
                    {item.rows_returned} rows
                  </span>
                )}
                <StatusPill status={item.status} />
                <button
                  aria-label={copiedId === item.id ? "Copied" : "Copy SQL"}
                  className={`grid h-7 w-7 place-items-center rounded-md border transition ${
                    copiedId === item.id
                      ? "border-brand-200 bg-brand-50 text-brand-700"
                      : "border-transparent text-slate-400 opacity-0 hover:border-slate-200 hover:text-slate-600 group-hover:opacity-100"
                  }`}
                  onClick={() => copySql(item.id, item.sql)}
                  title="Copy SQL"
                  type="button"
                >
                  {copiedId === item.id ? <Check size={13} /> : <Copy size={13} />}
                </button>
              </div>
            </div>
          ))}
          {visibleActivity.length === 0 && (
            <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-8 text-center text-sm text-slate-500">
              No query activity yet. Start a conversation in AI Chat.
            </p>
          )}
        </div>
      </section>
    </section>
  );
}

function useCountUp(target: number, duration = 900): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (target === 0) {
      setValue(0);
      return;
    }
    let frame: number;
    const start = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);
  return value;
}

function readinessLabel(score: number): string {
  if (score >= 80) return "Excellent foundation";
  if (score >= 60) return "Solid, minor gaps";
  if (score >= 40) return "Needs attention";
  return "High-risk schema gaps";
}

function KpiCard({
  icon,
  label,
  value,
  suffix,
  caption,
  footer
}: {
  icon: ReactNode;
  label: string;
  value: number | string;
  suffix?: string;
  caption?: string;
  footer?: ReactNode;
}) {
  const isNumber = typeof value === "number";
  const shown = useCountUp(isNumber ? (value as number) : 0);
  return (
    <div className="card card-hover group relative animate-fade-up overflow-hidden p-5">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-teal/70 to-transparent opacity-0 transition duration-300 group-hover:opacity-100" />
      <div className="flex items-start justify-between gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-50 text-brand-600">{icon}</span>
        <span className="pt-1 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</span>
      </div>
      <strong className="mt-3 block font-mono text-[26px] font-bold leading-none tracking-tight text-slate-900 tabular-nums">
        {isNumber ? shown.toLocaleString() : value}
        {suffix && <span className="ml-0.5 text-sm font-semibold text-slate-400">{suffix}</span>}
      </strong>
      {caption && <p className="mt-1.5 truncate text-[11px] font-medium text-slate-500">{caption}</p>}
      {footer && <div className="mt-2">{footer}</div>}
    </div>
  );
}

function ReadinessRing({ score }: { score: number }) {
  const clamped = Math.min(100, Math.max(0, score));
  const radius = 15.9155;
  const circumference = 2 * Math.PI * radius;
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setMounted(true), 120);
    return () => window.clearTimeout(timer);
  }, []);
  const offset = mounted ? circumference - (clamped / 100) * circumference : circumference;
  const stroke = clamped >= 70 ? "#34d399" : clamped >= 40 ? "#fbbf24" : "#fb7185";
  return (
    <svg height="44" viewBox="0 0 40 40" width="44">
      <circle cx="20" cy="20" fill="none" r={radius} stroke="rgba(148,163,184,0.3)" strokeWidth="3.6" />
      <circle
        cx="20"
        cy="20"
        fill="none"
        r={radius}
        stroke={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeWidth="3.6"
        style={{ transform: "rotate(-90deg)", transformOrigin: "50% 50%", transition: "stroke-dashoffset 1s cubic-bezier(0.22,1,0.36,1), stroke 300ms" }}
      />
      <text dominantBaseline="central" fill="#334155" fontSize="11" fontWeight="700" textAnchor="middle" x="20" y="21">
        {clamped}
      </text>
    </svg>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-center">
      <strong className="block font-mono text-lg font-bold tabular-nums text-slate-900">{value.toLocaleString()}</strong>
      <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">{label}</span>
    </div>
  );
}

function SectionTitle({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle?: string }) {
  return (
    <div>
      <div className="flex items-center gap-2.5">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-50 text-brand-600">{icon}</span>
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900">{title}</h2>
      </div>
      {subtitle && <p className="mt-1.5 pl-[42px] text-[13px] leading-5 text-slate-500">{subtitle}</p>}
    </div>
  );
}

function Guardrail({ label, detail }: { label: string; detail: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 transition hover:border-brand-200 hover:bg-brand-50/40">
      <ShieldCheck className="shrink-0 text-brand-600" size={15} />
      <div className="min-w-0">
        <p className="truncate text-[13px] font-semibold text-slate-800">{label}</p>
        <p className="truncate text-[11px] text-slate-500">{detail}</p>
      </div>
      <span className="ml-auto shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-600">on</span>
    </div>
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

export function EmptyState({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-12 text-center">
      <span className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-full bg-white text-slate-300 shadow-sm">{icon}</span>
      <p className="mx-auto max-w-sm text-sm leading-6 text-slate-500">{text}</p>
    </div>
  );
}
