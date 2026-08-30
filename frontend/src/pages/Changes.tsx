import { useEffect, useState, type ReactElement } from "react";
import { CheckCircle2, Clock, Copy, Database, FilePenLine, Loader2, XCircle } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { apiRequest } from "../lib/api";
import type { ChangeLogEntry } from "../types/api";

type Props = { token: string };

function timeAgo(iso?: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} d ago`;
  return new Date(iso).toLocaleDateString();
}

const TYPE_STYLES: Record<string, string> = {
  insert: "bg-emerald-50 text-emerald-700 border-emerald-200",
  update: "bg-amber-50 text-amber-700 border-amber-200",
  delete: "bg-rose-50 text-rose-700 border-rose-200",
};

const STATUS_STYLES: Record<string, { classes: string; label: string; icon: ReactElement }> = {
  executed: {
    classes: "bg-emerald-50 text-emerald-700",
    label: "Executed",
    icon: <CheckCircle2 size={12} />,
  },
  pending_confirmation: {
    classes: "bg-amber-50 text-amber-700",
    label: "Awaiting confirmation",
    icon: <Clock size={12} />,
  },
  expired: {
    classes: "bg-slate-100 text-slate-500 border border-slate-200",
    label: "Expired (auto-cancelled)",
    icon: <Clock size={12} />,
  },
  confirmation_expired: {
    classes: "bg-slate-100 text-slate-500 border border-slate-200",
    label: "Expired (auto-cancelled)",
    icon: <Clock size={12} />,
  },
  cancelled: {
    classes: "bg-slate-100 text-slate-600",
    label: "Cancelled",
    icon: <XCircle size={12} />,
  },
  executing: {
    classes: "bg-slate-100 text-slate-600",
    label: "Running",
    icon: <Loader2 size={12} className="animate-spin" />,
  },
  failed: {
    classes: "bg-rose-50 text-rose-700",
    label: "Failed",
    icon: <XCircle size={12} />,
  },
};

function statusStyle(status: string) {
  return STATUS_STYLES[status] ?? { classes: "bg-slate-100 text-slate-600", label: status, icon: null };
}

export function Changes({ token }: Props) {
  const [entries, setEntries] = useState<ChangeLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    apiRequest<ChangeLogEntry[]>("/organizations/changes?limit=200", {}, token)
      .then((data) => {
        if (!cancelled) setEntries(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load changes");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function copySql(entry: ChangeLogEntry) {
    try {
      await navigator.clipboard.writeText(entry.sql);
      setCopiedId(entry.id);
      window.setTimeout(() => setCopiedId(null), 1600);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <section className="space-y-7">
      <PageHeader
        eyebrow="Audit"
        title="Changes"
        description="Every data change made through QueryMind — from chat or the web app — with who asked, when, what ran, and which tables were touched. Read-only record; nothing here can be deleted."
      />

      {error && (
        <div
          className="animate-fade-up flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700"
          role="alert"
        >
          <span className="mt-0.5 shrink-0">{<XCircle size={16} />}</span>
          <p className="leading-6">{error}</p>
        </div>
      )}

      {isLoading ? (
        <div className="card flex items-center gap-3 p-6 text-sm text-slate-500">
          <Loader2 className="animate-spin text-slate-400" size={18} /> Loading change history…
        </div>
      ) : entries.length === 0 && !error ? (
        <div className="card animate-fade-up p-8 text-center">
          <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-xl bg-slate-100 text-slate-400">
            <FilePenLine size={20} />
          </span>
          <p className="text-sm font-semibold text-slate-900">No data changes yet</p>
          <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-slate-500">
            When you or your members ask QueryMind to insert, update, or delete data — from the web
            app or WhatsApp — every change is recorded here with who made it and when.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => {
            const type = entry.query_type.toLowerCase();
            const status = statusStyle(entry.status);
            const initials = entry.user_name.slice(0, 1).toUpperCase();
            return (
              <article key={entry.id} className="card animate-fade-up p-5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-navy text-xs font-bold text-teal-soft">
                    {initials}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {entry.user_name}
                      <span className="ml-2 text-xs font-normal text-slate-400">{timeAgo(entry.created_at)}</span>
                    </p>
                    <p className="truncate text-xs text-slate-500">"{entry.question}"</p>
                  </div>
                  <div className="ml-auto flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
                        TYPE_STYLES[type] ?? "border-slate-200 bg-slate-50 text-slate-600"
                      }`}
                    >
                      {type}
                    </span>
                    <span
                      className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${status.classes}`}
                    >
                      {status.icon} {status.label}
                    </span>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {entry.tables.map((table) => (
                    <span
                      className="flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-600"
                      key={table}
                    >
                      <Database size={10} /> {table}
                    </span>
                  ))}
                  {entry.connection_name && (
                    <span className="rounded-md bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700">
                      {entry.connection_name}
                    </span>
                  )}
                  {entry.confirmed_by && (
                    <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                      confirmed by {entry.confirmed_by}
                      {entry.confirmed_at ? ` · ${timeAgo(entry.confirmed_at)}` : ""}
                    </span>
                  )}
                </div>

                <div className="relative mt-3">
                  <pre className="code-block max-h-32 overflow-auto pr-10 text-[11px] leading-5">{entry.sql}</pre>
                  <button
                    aria-label="Copy SQL"
                    className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                    onClick={() => copySql(entry)}
                    type="button"
                  >
                    <Copy size={13} />
                  </button>
                  {copiedId === entry.id && (
                    <span className="absolute right-2 top-9 rounded bg-slate-900 px-2 py-0.5 text-[10px] font-medium text-white">
                      Copied
                    </span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
