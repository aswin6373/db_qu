import { FormEvent, useState } from "react";
import type { ReactNode } from "react";
import {
  CheckCircle2,
  Database,
  Eye,
  EyeOff,
  GitBranch,
  Info,
  Loader2,
  PlugZap,
  RefreshCw,
  ShieldCheck,
  Table2,
  XCircle
} from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { SchemaGraph } from "../components/SchemaGraph";
import { apiRequest } from "../lib/api";
import { Connection, DatabaseSchema, SslMode, SchemaInsights } from "../types/api";

type Props = {
  token: string;
  connections: Connection[];
  insights: Record<number, SchemaInsights>;
  schemas: Record<number, DatabaseSchema>;
  onRefresh: () => void;
};

type Feedback = { kind: "success" | "error" | "info"; text: string };

type Mode = "view" | "edit";

const EMPTY_FORM = {
  name: "",
  host: "",
  port: 3306,
  username: "",
  password: "",
  database_name: "",
  ssl_mode: "PREFERRED" as SslMode,
  test_live: true
};

export function Connections({ token, connections, insights, schemas, onRefresh }: Props) {
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const connection = connections[0];
  const hasConnection = Boolean(connection);

  // One derived mode drives the whole page: view the active connection or edit a new one.
  const [mode, setMode] = useState<Mode>(hasConnection ? "view" : "edit");
  const effectiveMode: Mode = mode === "view" && !hasConnection ? "edit" : mode;
  const isEditing = effectiveMode === "edit";

  function startEdit() {
    setForm((current) => ({ ...EMPTY_FORM, port: current.port }));
    setFeedback(null);
    setMode("edit");
  }

  function cancelEdit() {
    setFeedback(null);
    setMode(hasConnection ? "view" : "edit");
  }

  function updateField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFeedback(null);
    setIsSaving(true);
    try {
      if (hasConnection) {
        // The backend allows one connection per workspace, so a replace must remove the old row first.
        await apiRequest(`/connections/${connection.id}`, { method: "DELETE" }, token).catch((err) => {
          if (!(err instanceof Error && /404|not found/i.test(err.message))) throw err;
        });
      }
      await apiRequest("/connections", { method: "POST", body: JSON.stringify(form) }, token);
      setForm({ ...EMPTY_FORM });
      setFeedback({
        kind: "success",
        text: hasConnection ? "Database replaced and schema discovered." : "Connection saved and schema discovery completed."
      });
      setMode("view");
      onRefresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Connection failed";
      setFeedback({
        kind: "error",
        text: hasConnection && !/already has a database connection/i.test(message)
          ? `${message} Your previous database was already removed — submit again to finish replacing it.`
          : message
      });
      if (hasConnection) {
        setMode("view");
        onRefresh();
      }
    } finally {
      setIsSaving(false);
    }
  }

  async function refreshConnection(connectionId: number) {
    setFeedback(null);
    setIsRefreshing(true);
    try {
      await apiRequest(`/connections/${connectionId}/refresh`, { method: "POST" }, token);
      setFeedback({ kind: "success", text: "Schema refreshed from the live database." });
      onRefresh();
    } catch (err) {
      setFeedback({ kind: "error", text: err instanceof Error ? err.message : "Refresh failed" });
    } finally {
      setIsRefreshing(false);
    }
  }

  return (
    <section className="space-y-7">
      <PageHeader
        eyebrow="Data sources"
        title="Database connection"
        description="Register your MySQL database, verify access, and cache schema metadata for safer AI-generated SQL."
        action={
          <div className="flex gap-2">
            {hasConnection && isEditing && (
              <button className="btn-secondary" onClick={cancelEdit} type="button">
                Cancel
              </button>
            )}
            {hasConnection && !isEditing && (
              <button className="btn-accent" onClick={startEdit} type="button">
                <PlugZap size={15} /> Replace database
              </button>
            )}
            <button className="btn-secondary" disabled={isRefreshing} onClick={onRefresh} type="button">
              <RefreshCw size={15} /> Refresh
            </button>
          </div>
        }
      />

      {feedback && (
        <Banner
          feedback={feedback}
          onDismiss={() => setFeedback(null)}
        />
      )}

      <StatRow connection={connection} insights={insights} schemas={schemas} />

      {isEditing ? (
        <ConnectionForm
          form={form}
          hasConnection={hasConnection}
          isSaving={isSaving}
          onCancel={cancelEdit}
          onFieldChange={updateField}
          onSubmit={submit}
          previousName={hasConnection ? connection.name : undefined}
        />
      ) : (
        connection && (
          <ConnectionCard
            connection={connection}
            insight={insights[connection.id]}
            isRefreshing={isRefreshing}
            onRefreshSchema={() => refreshConnection(connection.id)}
          />
        )
      )}

      {connection && (
        <SchemaGraph
          insights={insights[connection.id]}
          key={connection.id}
          schema={schemas[connection.id]}
          title={`${connection.name} structure`}
        />
      )}
    </section>
  );
}

function StatRow({
  connection,
  insights,
  schemas
}: {
  connection?: Connection;
  insights: Record<number, SchemaInsights>;
  schemas: Record<number, DatabaseSchema>;
}) {
  const schema = connection ? schemas[connection.id] : null;
  const insight = connection ? insights[connection.id] : null;
  const tableCount = Object.keys(schema?.tables ?? {}).length;
  const columnCount = Object.values(schema?.tables ?? {}).reduce((total, table) => total + table.columns.length, 0);
  const relationshipCount = insight?.relationship_count ?? 0;

  const stats = [
    {
      caption: connection ? connection.name : "Add a MySQL database to begin",
      icon: <PlugZap size={17} />,
      label: "Status",
      tone: connection ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-400",
      value: connection ? "Connected" : "Not connected"
    },
    {
      caption: "Discovered from the live database",
      icon: <Table2 size={17} />,
      label: "Tables",
      tone: undefined,
      value: tableCount
    },
    {
      caption: "Columns indexed for AI grounding",
      icon: <Database size={17} />,
      label: "Columns",
      tone: undefined,
      value: columnCount
    },
    {
      caption: "Foreign-key links inferred",
      icon: <GitBranch size={17} />,
      label: "Relationships",
      tone: undefined,
      value: relationshipCount
    }
  ];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {stats.map((stat) => (
        <StatTile key={stat.label} {...stat} />
      ))}
    </div>
  );
}

function ConnectionCard({
  connection,
  insight,
  isRefreshing,
  onRefreshSchema
}: {
  connection: Connection;
  insight?: SchemaInsights;
  isRefreshing: boolean;
  onRefreshSchema: () => void;
}) {
  return (
    <article className="card animate-fade-up overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-slate-100 bg-gradient-to-r from-brand-50 via-white to-cream p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-navy text-teal-soft">
            <Database size={20} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <strong className="text-lg font-bold text-slate-900">{connection.name}</strong>
              <span className="status-pill pill-success">
                <CheckCircle2 size={13} /> connected
              </span>
              {insight && (
                <span className={`status-pill ${insight.score >= 70 ? "pill-info" : "pill-warn"}`}>
                  {insight.score}/100 readiness
                </span>
              )}
            </div>
            <p className="mt-0.5 truncate font-mono text-xs text-slate-500">
              mysql://{connection.username}@{connection.host}:{connection.port}/{connection.database_name}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button className="btn-secondary" disabled={isRefreshing} onClick={onRefreshSchema} type="button">
            {isRefreshing ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />}
            Refresh schema
          </button>
        </div>
      </div>

      <div className="grid gap-3 px-6 py-5 sm:grid-cols-2 lg:grid-cols-4">
        <DetailField label="Host" value={connection.host} />
        <DetailField label="Port" value={String(connection.port)} />
        <DetailField label="Database" value={connection.database_name} />
        <DetailField label="Username" value={connection.username} />
      </div>

      <p className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-6 py-3 text-xs text-slate-400">
        <Info size={13} />
        <span>One database per workspace. Replacing keeps your query history.</span>
        {connection.ssl_mode && connection.ssl_mode !== "PREFERRED" && (
          <span className="rounded bg-brand-50 px-1.5 py-0.5 font-medium text-brand-700">
            SSL {connection.ssl_mode.toLowerCase()}
          </span>
        )}
      </p>
    </article>
  );
}

function ConnectionForm({
  form,
  hasConnection,
  isSaving,
  onCancel,
  onFieldChange,
  onSubmit,
  previousName
}: {
  form: typeof EMPTY_FORM;
  hasConnection: boolean;
  isSaving: boolean;
  onCancel: () => void;
  onFieldChange: <K extends keyof typeof EMPTY_FORM>(key: K, value: (typeof EMPTY_FORM)[K]) => void;
  onSubmit: (event: FormEvent) => void;
  previousName?: string;
}) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form className="card animate-fade-up p-6 sm:p-7" onSubmit={onSubmit}>
      <div className="mb-6 flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-50 text-brand-700">
          <Database size={17} />
        </span>
        <div>
          <h2 className="text-base font-bold tracking-tight text-slate-900">
            {hasConnection ? "Connect a new database" : "New connection"}
          </h2>
          <p className="text-xs text-slate-500">Credentials are encrypted before they touch the platform database.</p>
        </div>
      </div>

      {hasConnection && previousName && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <ShieldCheck size={16} />
          <p className="leading-6">
            Saving will permanently replace <strong>{previousName}</strong> as your workspace database. Your query history is kept.
          </p>
        </div>
      )}

      <div className="space-y-5">
        <section>
          <h3 className="eyebrow mb-3 text-slate-400">Identity</h3>
          <label className="block">
            <span className="label">Display name</span>
            <input
              className="field"
              placeholder="Production MySQL"
              required
              value={form.name}
              onChange={(event) => onFieldChange("name", event.target.value)}
            />
          </label>
        </section>

        <section className="border-t border-slate-100 pt-5">
          <h3 className="eyebrow mb-3 text-slate-400">Server</h3>
          <div className="grid gap-x-5 gap-y-4 md:grid-cols-[2fr_1fr]">
            <label className="block">
              <span className="label">Host</span>
              <input
                className="field font-mono"
                placeholder="mysql.example.com"
                required
                value={form.host}
                onChange={(event) => onFieldChange("host", event.target.value)}
              />
            </label>
            <label className="block">
              <span className="label">Port</span>
              <input
                className="field"
                max={65535}
                min={1}
                type="number"
                value={form.port}
                onChange={(event) => onFieldChange("port", Number(event.target.value) || 3306)}
              />
            </label>
          </div>
        </section>

        <section className="border-t border-slate-100 pt-5">
          <h3 className="eyebrow mb-3 text-slate-400">Credentials</h3>
          <div className="grid gap-x-5 gap-y-4 md:grid-cols-2">
            <label className="block">
              <span className="label">Username</span>
              <input
                className="field font-mono"
                placeholder="querymind_user"
                required
                value={form.username}
                onChange={(event) => onFieldChange("username", event.target.value)}
              />
            </label>
            <label className="block">
              <span className="label">Password</span>
              <span className="relative block">
                <input
                  className="field pr-11"
                  placeholder="••••••••"
                  required
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={(event) => onFieldChange("password", event.target.value)}
                />
                <button
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-1 top-1 grid h-9 w-9 place-items-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                  onClick={() => setShowPassword((visible) => !visible)}
                  tabIndex={-1}
                  type="button"
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </span>
            </label>
          </div>
        </section>

        <section className="border-t border-slate-100 pt-5">
          <h3 className="eyebrow mb-3 text-slate-400">Database &amp; security</h3>
          <div className="grid gap-x-5 gap-y-4 md:grid-cols-2">
            <label className="block">
              <span className="label">Database name</span>
              <input
                className="field font-mono"
                placeholder="my_database"
                required
                value={form.database_name}
                onChange={(event) => onFieldChange("database_name", event.target.value)}
              />
            </label>
            <label className="block">
              <span className="label">Encryption (SSL)</span>
              <select
                className="field"
                value={form.ssl_mode}
                onChange={(event) => onFieldChange("ssl_mode", event.target.value as SslMode)}
              >
                <option value="PREFERRED">Auto — use SSL if available</option>
                <option value="REQUIRED">Required — cloud providers</option>
                <option value="DISABLED">Disabled — local only</option>
              </select>
              <span className="mt-1.5 block text-xs text-slate-400">
                Aiven, PlanetScale, RDS, and TiDB usually require SSL.
              </span>
            </label>
          </div>
        </section>

        <label className="panel-soft flex items-start gap-3 p-3.5 text-sm">
          <input
            checked={Boolean(form.test_live)}
            className="mt-0.5 h-4 w-4 accent-brand-600"
            onChange={(event) => onFieldChange("test_live", event.target.checked)}
            type="checkbox"
          />
          <span>
            <span className="flex items-center gap-1.5 font-semibold text-slate-800">
              <ShieldCheck size={15} /> Test live connection before saving
            </span>
            <span className="mt-0.5 block text-xs text-slate-500">
              Recommended — verifies credentials and loads schema metadata immediately.
            </span>
          </span>
        </label>
      </div>

      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {hasConnection && (
          <button className="btn-secondary" disabled={isSaving} onClick={onCancel} type="button">
            Cancel
          </button>
        )}
        <button className="btn-accent w-full sm:w-auto" disabled={isSaving} type="submit">
          {isSaving ? <Loader2 className="animate-spin" size={17} /> : <PlugZap size={16} />}
          {isSaving ? "Testing & discovering…" : hasConnection ? "Replace database" : "Save connection"}
        </button>
      </div>
    </form>
  );
}

function StatTile({ caption, icon, label, tone, value }: { caption: string; icon: ReactNode; label: string; tone?: string; value: number | string }) {
  return (
    <div className="card card-hover animate-fade-up p-5">
      <div className="flex items-start justify-between gap-2">
        <span className={`grid h-9 w-9 place-items-center rounded-lg ${tone ?? "bg-brand-50 text-brand-600"}`}>{icon}</span>
        <span className="pt-1 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</span>
      </div>
      <strong className="mt-3 block truncate text-[22px] font-bold leading-none tracking-tight text-slate-900">{value}</strong>
      <p className="mt-1.5 truncate text-[11px] font-medium text-slate-500">{caption}</p>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="inset-tile px-3.5 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-0.5 truncate font-mono text-[13px] text-slate-800">{value}</p>
    </div>
  );
}

function Banner({ feedback, onDismiss }: { feedback: Feedback; onDismiss: () => void }) {
  const styles = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
    error: "border-rose-200 bg-rose-50 text-rose-700",
    info: "border-brand-200 bg-brand-50 text-brand-700"
  };
  const icons = {
    success: <CheckCircle2 size={16} />,
    error: <XCircle size={16} />,
    info: <Info size={16} />
  };
  return (
    <div
      className={`animate-fade-up flex items-start gap-2 rounded-xl border px-3.5 py-2.5 text-sm ${styles[feedback.kind]}`}
      role={feedback.kind === "error" ? "alert" : "status"}
    >
      <span className="mt-0.5 shrink-0">{icons[feedback.kind]}</span>
      <p className="leading-6">{feedback.text}</p>
      <button
        aria-label="Dismiss message"
        className="ml-auto shrink-0 rounded p-0.5 opacity-60 transition hover:opacity-100"
        onClick={onDismiss}
        type="button"
      >
        <XCircle size={15} />
      </button>
    </div>
  );
}
