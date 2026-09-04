import { useEffect, useMemo, useState } from "react";
import { Activity, ArrowUpRight, Check, Copy, Database, MessageSquare, Sparkles, Table2 } from "lucide-react";
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
  const [selectedConnectionId, setSelectedConnectionId] = useState<number | null>(() => connections[0]?.id ?? null);

  const activeConnection = useMemo(() => {
    return connections.find((c) => c.id === selectedConnectionId) ?? connections[0] ?? null;
  }, [connections, selectedConnectionId]);

  const activeSchema = activeConnection ? schemas[activeConnection.id] : null;
  const activeInsights = activeConnection ? insights[activeConnection.id] : null;
  const tableCount = Object.keys(activeSchema?.tables ?? {}).length;
  const columnCount = Object.values(activeSchema?.tables ?? {}).reduce((total, table) => total + table.columns.length, 0);
  const score = activeInsights?.score ?? 0;

  const activity = dashboard?.recent_activity ?? [];
  const rowsSeries = [...activity].reverse().map((item) => item.rows_returned ?? 0);
  const totalRows = rowsSeries.reduce((total, value) => total + value, 0);

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
    <div className="dot-grid mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <section className="space-y-7">
        <PageHeader
          eyebrow={dashboard?.organization.name ?? "Workspace"}
          title="Dashboard"
          description="Live schema relationships, AI query traffic, and guarded operations across this workspace."
          action={
            connections.length > 0 ? (
              <button className="btn-secondary" onClick={onOpenConnections} type="button">
                <Database size={15} /> Manage connections
              </button>
            ) : null
          }
        />

        {connections.length === 0 && (
          <section className="card animate-fade-up p-6 sm:p-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-md">
                <h2 className="font-display text-lg font-semibold text-ink">Connect your first database</h2>
                <p className="mt-1 text-sm leading-6 text-ink-soft">
                  QueryMind needs a live MySQL or PostgreSQL connection before the console comes alive.
                </p>
              </div>
              <ol className="flex flex-1 flex-wrap gap-3">
                {[
                  { step: "01", label: "Connect", detail: "Add database credentials" },
                  { step: "02", label: "Discover", detail: "Schema auto-mapped" },
                  { step: "03", label: "Ask", detail: "Chat in plain English" }
                ].map((item) => (
                  <li className="inset-tile flex min-w-[150px] flex-1 items-center gap-3 px-3.5 py-3" key={item.step}>
                    <span className="font-mono text-xs font-medium text-brand-400">{item.step}</span>
                    <span>
                      <strong className="block text-[13px] font-medium text-ink">{item.label}</strong>
                      <span className="block text-[11px] text-ink-faint">{item.detail}</span>
                    </span>
                  </li>
                ))}
              </ol>
              <button className="btn-primary shrink-0" onClick={onOpenConnections} type="button">
                <ArrowUpRight size={17} /> Connect database
              </button>
            </div>
          </section>
        )}

        {/* KPI row */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <KpiCard
            caption={activity.length > 0 ? `${totalRows.toLocaleString()} rows returned` : "No queries yet"}
            footer={rowsSeries.length > 1 ? <Sparkline height={30} values={rowsSeries} /> : undefined}
            icon={<MessageSquare size={16} />}
            label="AI queries"
            value={dashboard?.query_count ?? 0}
          />
          <KpiCard
            caption={activeConnection ? `${activeConnection.name} · ${columnCount.toLocaleString()} cols` : `${columnCount.toLocaleString()} columns indexed`}
            icon={<Table2 size={16} />}
            label="Discovered tables"
            value={tableCount}
          />
          <KpiCard
            caption={readinessLabel(score)}
            footer={<ReadinessRing score={score} />}
            icon={<Sparkles size={16} />}
            label="AI readiness"
            suffix="/100"
            value={score}
          />
        </div>

        {/* Schema relationships */}
        <SchemaConstellation
          headerAction={
            connections.length > 1 ? (
              <div className="flex items-center gap-1.5">
                <label className="sr-only" htmlFor="db-schema-select">
                  Select database
                </label>
                <select
                  id="db-schema-select"
                  className="cursor-pointer rounded-full border border-line bg-raise px-3 py-1 text-[11px] font-medium text-ink transition hover:border-line-strong focus:outline-none focus:ring-1 focus:ring-brand-500/40"
                  onChange={(e) => setSelectedConnectionId(Number(e.target.value))}
                  value={activeConnection?.id ?? ""}
                >
                  {connections.map((conn) => (
                    <option key={conn.id} value={conn.id}>
                      {conn.name} ({conn.db_type})
                    </option>
                  ))}
                </select>
              </div>
            ) : undefined
          }
          insights={activeInsights}
          schema={activeSchema}
          title={`${activeConnection?.name ?? "Database"} · schema relationships`}
        />

        {/* Activity logs */}
        <section className="card p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <SectionTitle icon={<Activity size={15} />} subtitle="The five most recent AI-generated queries in this organization." title="Recent activity" />
            {statuses.length > 1 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {["all", ...statuses].map((status) => (
                  <button
                    className={`rounded-full border px-3 py-1 text-[11px] font-medium capitalize transition ${
                      statusFilter === status
                        ? "border-line-strong bg-white/10 text-ink"
                        : "border-line text-ink-soft hover:border-line-strong hover:text-ink"
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
          <div className="mt-3 divide-y divide-line">
            {visibleActivity.map((item) => (
              <div className="group flex flex-col gap-2 py-3 transition first:pt-1 last:pb-0 hover:bg-white/[0.02] sm:flex-row sm:items-center sm:justify-between" key={item.id}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-ink">{item.question}</p>
                    {item.created_at && (
                      <span className="shrink-0 font-mono text-[11px] text-ink-faint">{timeAgo(item.created_at)}</span>
                    )}
                  </div>
                  <code className="mt-1 block max-w-xl truncate rounded bg-white/5 px-1.5 py-0.5 font-mono text-xs text-ink-soft">
                    {item.sql}
                  </code>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {item.rows_returned != null && (
                    <span className="rounded-md border border-line px-2 py-0.5 font-mono text-[11px] text-ink-faint">
                      {item.rows_returned} rows
                    </span>
                  )}
                  <StatusPill status={item.status} />
                  <button
                    aria-label={copiedId === item.id ? "Copied" : "Copy SQL"}
                    className={`reveal-touch grid h-8 w-8 place-items-center rounded-md transition ${
                      copiedId === item.id
                        ? "text-emerald-400"
                        : "text-ink-faint hover:bg-white/5 hover:text-ink group-hover:opacity-100"
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
              <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-ink-faint">
                No query activity yet. Start a conversation in AI Chat.
              </p>
            )}
          </div>
        </section>
      </section>
    </div>
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
      <div className="flex items-start justify-between gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-500/10 text-brand-400">{icon}</span>
        <span className="pt-1 text-right text-[10px] font-medium uppercase tracking-wider text-ink-faint">{label}</span>
      </div>
      <strong className="mt-3 block font-mono text-[26px] font-semibold leading-none tracking-tight text-ink tabular-nums">
        {isNumber ? shown.toLocaleString() : value}
        {suffix && <span className="ml-0.5 text-sm font-medium text-ink-faint">{suffix}</span>}
      </strong>
      {caption && <p className="mt-1.5 truncate text-[11px] text-ink-faint">{caption}</p>}
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
      <circle cx="20" cy="20" fill="none" r={radius} stroke="rgba(255,255,255,0.1)" strokeWidth="3.6" />
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
      <text dominantBaseline="central" fill="#ececee" fontSize="11" fontWeight="600" textAnchor="middle" x="20" y="21">
        {clamped}
      </text>
    </svg>
  );
}

function SectionTitle({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle?: string }) {
  return (
    <div>
      <div className="flex items-center gap-2.5">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-500/10 text-brand-400">{icon}</span>
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
      </div>
      {subtitle && <p className="mt-1 pl-[42px] text-[13px] leading-5 text-ink-faint">{subtitle}</p>}
    </div>
  );
}

function timeAgo(iso: string): string {
  const normalized = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`;
  const seconds = Math.floor((Date.now() - new Date(normalized).getTime()) / 1000);
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
    executing: "pill-info",
    confirmation_expired: "pill-warn",
    failed: "bg-rose-500/10 text-rose-300 border-rose-500/25"
  };
  const label = status.replace(/_/g, " ");
  return <span className={`status-pill shrink-0 capitalize ${map[status] ?? ""}`}>{label}</span>;
}
