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
  insert: "bg-emerald-500/10 text-emerald-300 border-emerald-500/25",
  update: "bg-amber-500/10 text-amber-300 border-amber-500/25",
  delete: "bg-rose-500/10 text-rose-300 border-rose-500/25",
};

const STATUS_STYLES: Record<string, { classes: string; label: string; icon: ReactElement }> = {
  executed: {
    classes: "bg-emerald-500/10 text-emerald-300",
    label: "Executed",
    icon: <CheckCircle2 size={12} />,
  },
  pending_confirmation: {
    classes: "bg-amber-500/10 text-amber-300",
    label: "Awaiting confirmation",
    icon: <Clock size={12} />,
  },
  expired: {
    classes: "bg-white/10 text-ink-soft border border-line",
    label: "Expired (auto-cancelled)",
    icon: <Clock size={12} />,
  },
  confirmation_expired: {
    classes: "bg-white/10 text-ink-soft border border-line",
    label: "Expired (auto-cancelled)",
    icon: <Clock size={12} />,
  },
  cancelled: {
    classes: "bg-white/10 text-ink-soft",
    label: "Cancelled",
    icon: <XCircle size={12} />,
  },
  executing: {
    classes: "bg-white/10 text-ink-soft",
    label: "Running",
    icon: <Loader2 size={12} className="animate-spin" />,
  },
  failed: {
    classes: "bg-rose-500/10 text-rose-300",
    label: "Failed",
    icon: <XCircle size={12} />,
  },
};

function statusStyle(status: string) {
  return STATUS_STYLES[status] ?? { classes: "bg-white/10 text-ink-soft", label: status, icon: null };
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
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 lg:py-10">
      <section className="space-y-5">
      <PageHeader
        eyebrow="Audit"
        title="Changes"
      />

      {error && (
        <div
          className="animate-fade-up flex items-start gap-2 rounded-xl border border-rose-500/25 bg-rose-500/10 px-3.5 py-2.5 text-sm text-rose-300"
          role="alert"
        >
          <span className="mt-0.5 shrink-0">{<XCircle size={16} />}</span>
          <p className="leading-6">{error}</p>
        </div>
      )}

      {isLoading ? (
        <div className="card flex items-center gap-3 p-6 text-sm text-ink-soft">
          <Loader2 className="animate-spin text-ink-faint" size={18} /> Loading change history…
        </div>
      ) : entries.length === 0 && !error ? (
        <div className="card animate-fade-up p-10 text-center">
          <span className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-xl bg-white/5 text-ink-faint">
            <FilePenLine size={18} />
          </span>
          <p className="text-sm font-medium text-ink">No data changes yet</p>
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
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-500/15 text-xs font-bold text-brand-300">
                    {initials}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">
                      {entry.user_name}
                      <span className="ml-2 text-xs font-normal text-ink-faint">{timeAgo(entry.created_at)}</span>
                    </p>
                    <p className="truncate text-xs text-ink-soft">"{entry.question}"</p>
                  </div>
                  <div className="ml-auto flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
                        TYPE_STYLES[type] ?? "border-line bg-raise text-ink-soft"
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
                      className="flex items-center gap-1 rounded-md bg-white/10 px-2 py-0.5 font-mono text-[11px] text-ink-soft"
                      key={table}
                    >
                      <Database size={10} /> {table}
                    </span>
                  ))}
                  {entry.connection_name && (
                    <span className="rounded-md bg-brand-500/10 px-2 py-0.5 text-[11px] font-medium text-brand-300">
                      {entry.connection_name}
                    </span>
                  )}
                  {entry.confirmed_by && (
                    <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
                      confirmed by {entry.confirmed_by}
                      {entry.confirmed_at ? ` · ${timeAgo(entry.confirmed_at)}` : ""}
                    </span>
                  )}
                </div>

                <div className="relative mt-3">
                  <pre className="code-block max-h-32 overflow-auto pr-10 text-[11px] leading-5">{entry.sql}</pre>
                  <button
                    aria-label="Copy SQL"
                    className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-md text-ink-faint transition hover:bg-white/10 hover:text-ink-soft"
                    onClick={() => copySql(entry)}
                    type="button"
                  >
                    <Copy size={13} />
                  </button>
                  {copiedId === entry.id && (
                    <span className="absolute right-2 top-9 rounded-md bg-surface/10 px-2 py-0.5 text-[10px] font-medium text-ink ring-1 ring-line">
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
    </div>
  );
}
