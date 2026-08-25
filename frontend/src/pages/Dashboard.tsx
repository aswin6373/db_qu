import { useEffect, useMemo, useState } from "react";
import { Activity, ArrowUpRight, Check, Copy, Database } from "lucide-react";
import type { ReactNode } from "react";
import { PageHeader } from "../components/PageHeader";
import { SchemaConstellation } from "../components/SchemaConstellation";
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

  const activity = dashboard?.recent_activity ?? [];

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

      {/* Schema relationships */}
      <SchemaConstellation insights={primaryInsights} schema={primarySchema} title={`${primaryConnection?.name ?? "Workspace"} · schema relationships`} />

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
