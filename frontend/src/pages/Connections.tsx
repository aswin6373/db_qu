import { FormEvent, useState } from "react";
import type { ReactNode } from "react";
import { CheckCircle2, Database, GitBranch, Info, Loader2, Lock, PlugZap, RefreshCw, ShieldCheck, Table2, XCircle } from "lucide-react";
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

export function Connections({ token, connections, insights, schemas, onRefresh }: Props) {
  const [form, setForm] = useState({
    name: "",
    host: "",
    port: 3306,
    username: "",
    password: "",
    database_name: "",
    ssl_mode: "PREFERRED" as SslMode,
    test_live: true
  });
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [workingConnectionId, setWorkingConnectionId] = useState<number | null>(null);
  const [replacing, setReplacing] = useState(false);

  const connection = connections[0];
  const hasConnection = connections.length > 0;
  const schema = connection ? schemas[connection.id] : null;
  const insight = connection ? insights[connection.id] : null;
  const tableCount = Object.keys(schema?.tables ?? {}).length;
  const columnCount = Object.values(schema?.tables ?? {}).reduce((total, table) => total + table.columns.length, 0);
  const relationshipCount = insight?.relationship_count ?? 0;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFeedback(null);
    setIsSaving(true);
    try {
      if (replacing && hasConnection) {
        const oldId = connections[0].id;
        const deleteResponse = await fetch(`${import.meta.env.VITE_API_URL ?? ""}/connections/${oldId}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!deleteResponse.ok && deleteResponse.status !== 404) {
          throw new Error("Could not remove the current database. Please try again.");
        }
      }
      await apiRequest("/connections", { method: "POST", body: JSON.stringify(form) }, token);
      setFeedback({ kind: "success", text: replacing ? "Database replaced and schema discovered." : "Connection saved and schema discovery completed." });
      setForm({ ...form, name: "", host: "", username: "", password: "", database_name: "" });
      setReplacing(false);
      onRefresh();
    } catch (err) {
      setFeedback({ kind: "error", text: err instanceof Error ? err.message : "Connection failed" });
      if (replacing) onRefresh();
    } finally {
      setIsSaving(false);
    }
  }

  async function refreshConnection(connectionId: number) {
    setFeedback(null);
    setWorkingConnectionId(connectionId);
    try {
      await apiRequest(`/connections/${connectionId}/refresh`, { method: "POST" }, token);
      setFeedback({ kind: "success", text: "Schema refreshed from the live database." });
      onRefresh();
    } catch (err) {
      setFeedback({ kind: "error", text: err instanceof Error ? err.message : "Refresh failed" });
    } finally {
      setWorkingConnectionId(null);
    }
  }

  return (
    <section className="space-y-7">
      <PageHeader
        eyebrow="Data sources"
        title="Database connection"
        description="Register your MySQL database, verify access, and cache schema metadata for safer AI-generated SQL."
        action={
          <button className="btn-secondary" onClick={onRefresh} type="button">
            <RefreshCw size={15} /> Refresh
          </button>
        }
      />

      {/* Status row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          caption={connection ? connection.name : "Add a MySQL database to begin"}
          icon={<PlugZap size={17} />}
          label="Status"
          tone={connection ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-400"}
          value={connection ? "Connected" : "Not connected"}
        />
        <StatTile caption="Discovered from the live database" icon={<Table2 size={17} />} label="Tables" value={tableCount} />
        <StatTile caption="Columns indexed for AI grounding" icon={<Database size={17} />} label="Columns" value={columnCount} />
        <StatTile caption="Foreign-key links inferred" icon={<GitBranch size={17} />} label="Relationships" value={relationshipCount} />
      </div>

      {connections.length === 0 && !replacing && (
        <div className="card animate-fade-up border-brand-200 bg-gradient-to-br from-brand-50 via-white to-cream p-6">
          <div className="flex items-start gap-4">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-600 to-brand-800 text-white shadow-lg shadow-brand-600/25">
              <PlugZap size={19} />
            </span>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Connect your database</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Add your MySQL host, username, password, and database name. QueryMind tests the connection and discovers
                tables, columns, and keys before AI chat unlocks.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1.55fr_1fr]">
        {/* Left: current connection or the setup form */}
        <div className="space-y-4">
          {!replacing && hasConnection && (
            <article className="card animate-fade-up overflow-hidden" key={connection.id}>
              <div className="flex flex-col gap-4 border-b border-slate-100 bg-gradient-to-r from-brand-50 via-white to-cream p-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-navy text-teal-soft">
                    <Database size={20} />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <strong className="text-lg font-bold text-slate-900">{connection.name}</strong>
                      <span className="status-pill pill-success"><CheckCircle2 size={13} /> connected</span>
                    </div>
                    <p className="mt-0.5 truncate font-mono text-xs text-slate-500">
                      mysql://{connection.username}@{connection.host}:{connection.port}/{connection.database_name}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button
                    className="btn-secondary"
                    disabled={workingConnectionId === connection.id}
                    onClick={() => refreshConnection(connection.id)}
                    type="button"
                  >
                    {workingConnectionId === connection.id ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />}
                    Refresh schema
                  </button>
                  <button className="btn-secondary" onClick={() => { setReplacing(true); setFeedback(null); }} type="button">
                    <PlugZap size={14} /> Replace database
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
                <span>This workspace supports one database connection at a time. Replacing keeps your query history.</span>
                {connection.ssl_mode && connection.ssl_mode !== "PREFERRED" && (
                  <span className="rounded bg-brand-50 px-1.5 py-0.5 font-medium text-brand-700">
                    SSL {connection.ssl_mode.toLowerCase()}
                  </span>
                )}
              </p>
            </article>
          )}

          {(connections.length === 0 || replacing) && (
            <form className="card p-6 sm:p-7" onSubmit={submit}>
              <div className="mb-6 flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-50 text-brand-700">
                  <Database size={17} />
                </span>
                <div>
                  <h2 className="text-base font-bold tracking-tight text-slate-900">
                    {replacing ? "Connect a new database" : "New connection"}
                  </h2>
                  <p className="text-xs text-slate-500">Credentials are encrypted before they touch the platform database.</p>
                </div>
              </div>

              {replacing && hasConnection && (
                <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  <ShieldCheck size={16} />
                  <p className="leading-6">
                    Saving will permanently replace <strong>{connections[0].name}</strong> as your workspace database. Your
                    query history is kept.{" "}
                    <button className="font-semibold text-amber-900 underline" onClick={() => { setReplacing(false); setFeedback(null); }} type="button">
                      Cancel
                    </button>
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
                      onChange={(event) => setForm({ ...form, name: event.target.value })}
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
                        onChange={(event) => setForm({ ...form, host: event.target.value })}
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
                        onChange={(event) => setForm({ ...form, port: Number(event.target.value) || 3306 })}
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
                        onChange={(event) => setForm({ ...form, username: event.target.value })}
                      />
                    </label>
                    <label className="block">
                      <span className="label">Password</span>
                      <input
                        className="field"
                        placeholder="••••••••"
                        required
                        type="password"
                        value={form.password}
                        onChange={(event) => setForm({ ...form, password: event.target.value })}
                      />
                    </label>
                  </div>
                </section>

                <section className="border-t border-slate-100 pt-5">
                  <h3 className="eyebrow mb-3 text-slate-400">Database & security</h3>
                  <div className="grid gap-x-5 gap-y-4 md:grid-cols-2">
                    <label className="block">
                      <span className="label">Database name</span>
                      <input
                        className="field font-mono"
                        placeholder="my_database"
                        required
                        value={form.database_name}
                        onChange={(event) => setForm({ ...form, database_name: event.target.value })}
                      />
                    </label>
                    <label className="block">
                      <span className="label">Encryption (SSL)</span>
                      <select
                        className="field"
                        value={form.ssl_mode}
                        onChange={(event) => setForm({ ...form, ssl_mode: event.target.value as SslMode })}
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
                    onChange={(event) => setForm({ ...form, test_live: event.target.checked })}
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

              {feedback && <Banner feedback={feedback} />}

              <button className="btn-accent mt-5 w-full sm:w-auto" disabled={isSaving} type="submit">
                {isSaving ? <Loader2 className="animate-spin" size={17} /> : <PlugZap size={16} />}
                {isSaving ? "Testing & discovering…" : replacing ? "Replace database" : "Save connection"}
              </button>
            </form>
          )}
        </div>

        {/* Right: security & discovery pipeline */}
        <section className="card h-fit p-5 sm:p-6">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-50 text-brand-600">
              <ShieldCheck size={15} />
            </span>
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900">Security pipeline</h2>
              <p className="text-[13px] leading-5 text-slate-500">Active on every connection in this workspace.</p>
            </div>
          </div>
          <div className="mt-4 grid gap-2">
            <PipelineRow detail="Credentials are Fernet-encrypted before storage" icon={<Lock size={15} />} label="Encrypted credentials" />
            <PipelineRow detail="Tables, columns, and keys cached on save" icon={<RefreshCw size={15} />} label="Schema auto-discovery" />
            <PipelineRow detail="Every AI statement is parsed & schema-checked" icon={<ShieldCheck size={15} />} label="SQL validation" />
            <PipelineRow detail="INSERT / UPDATE / DELETE wait for your approval" icon={<CheckCircle2 size={15} />} label="Write confirmation" />
          </div>
        </section>
      </div>

      {connections.map((item) => (
        <SchemaGraph
          insights={insights[item.id]}
          key={item.id}
          schema={schemas[item.id]}
          title={`${item.name} structure`}
        />
      ))}
    </section>
  );
}

function StatTile({
  caption,
  icon,
  label,
  tone = "bg-brand-50 text-brand-600",
  value
}: {
  caption?: string;
  icon: ReactNode;
  label: string;
  tone?: string;
  value: number | string;
}) {
  return (
    <div className="card card-hover animate-fade-up p-5">
      <div className="flex items-start justify-between gap-2">
        <span className={`grid h-9 w-9 place-items-center rounded-lg ${tone}`}>{icon}</span>
        <span className="pt-1 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</span>
      </div>
      <strong className="mt-3 block truncate font-mono text-[22px] font-bold leading-none tracking-tight text-slate-900">{value}</strong>
      {caption && <p className="mt-1.5 truncate text-[11px] font-medium text-slate-500">{caption}</p>}
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

function PipelineRow({ icon, label, detail }: { icon: ReactNode; label: string; detail: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 transition hover:border-brand-200 hover:bg-brand-50/40">
      <span className="shrink-0 text-brand-600">{icon}</span>
      <div className="min-w-0">
        <p className="truncate text-[13px] font-semibold text-slate-800">{label}</p>
        <p className="truncate text-[11px] text-slate-500">{detail}</p>
      </div>
      <span className="ml-auto shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-600">on</span>
    </div>
  );
}

function Banner({ feedback }: { feedback: Feedback }) {
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
    <p className={`mt-5 flex items-start gap-2 rounded-xl border px-3.5 py-2.5 text-sm ${styles[feedback.kind]}`}>
      {icons[feedback.kind]} {feedback.text}
    </p>
  );
}
