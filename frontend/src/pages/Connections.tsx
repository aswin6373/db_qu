import { FormEvent, useState } from "react";
import { CheckCircle2, Database, Info, Loader2, PlugZap, RefreshCw, ShieldCheck, Trash2, XCircle } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "./Dashboard";
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

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFeedback(null);
    setIsSaving(true);
    try {
      await apiRequest("/connections", { method: "POST", body: JSON.stringify(form) }, token);
      setFeedback({ kind: "success", text: "Connection saved and schema discovery completed." });
      setForm({ ...form, name: "", host: "", username: "", password: "", database_name: "" });
      onRefresh();
    } catch (err) {
      setFeedback({ kind: "error", text: err instanceof Error ? err.message : "Connection failed" });
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

  async function deleteConnection(connectionId: number) {
    const target = connections.find((connection) => connection.id === connectionId);
    const label = target ? `"${target.name}"` : "this connection";
    if (!window.confirm(`Delete connection ${label}? Saved queries will be kept, but the database credentials will be removed.`)) {
      return;
    }
    setFeedback(null);
    setWorkingConnectionId(connectionId);
    try {
      await apiRequest(`/connections/${connectionId}`, { method: "DELETE" }, token);
      setFeedback({ kind: "info", text: "Connection removed. Query history was kept." });
      onRefresh();
    } catch (err) {
      setFeedback({ kind: "error", text: err instanceof Error ? err.message : "Delete failed" });
    } finally {
      setWorkingConnectionId(null);
    }
  }

  return (
    <section className="space-y-7">
      <PageHeader
        eyebrow="Data sources"
        title="Database connections"
        description="Register MySQL databases, verify access, and cache schema metadata for safer AI-generated SQL."
        action={
          <button className="btn-secondary" onClick={onRefresh} type="button">
            <RefreshCw size={15} /> Refresh all
          </button>
        }
      />

      {connections.length === 0 && (
        <div className="card animate-fade-up border-brand-200 bg-gradient-to-br from-brand-50 via-white to-cream p-6">
          <div className="flex items-start gap-4">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-600 to-brand-800 text-white shadow-lg shadow-brand-600/25">
              <PlugZap size={19} />
            </span>
            <div>
              <h2 className="text-lg font-bold text-slate-900">First step for production use</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Add your MySQL host, username, password, and database name. QueryMind tests the connection and discovers
                tables, columns, and keys before AI chat unlocks.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Add connection */}
      <form className="card p-6 sm:p-7" onSubmit={submit}>
        <div className="mb-6 flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-50 text-brand-600">
            <Database size={17} />
          </span>
          <div>
            <h2 className="text-base font-bold tracking-tight text-slate-900">New connection</h2>
            <p className="text-xs text-slate-500">Credentials are encrypted before they touch the platform database.</p>
          </div>
        </div>

        <div className="grid gap-x-5 gap-y-4 md:grid-cols-2">
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

          <label className="panel-soft col-span-full flex items-start gap-3 p-3.5 text-sm md:col-span-2">
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
          {isSaving ? "Testing & discovering…" : "Save connection"}
        </button>
      </form>

      {/* Saved connections */}
      <section>
        <h2 className="mb-4 text-base font-bold tracking-tight text-slate-900">
          Saved connections{" "}
          <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
            {connections.length}
          </span>
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          {connections.map((connection) => (
            <article className="card card-hover p-5" key={connection.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-900 text-white">
                    <Database size={17} />
                  </span>
                  <strong className="text-[15px] font-semibold text-slate-900">{connection.name}</strong>
                </div>
                <span className="status-pill pill-success"><CheckCircle2 size={13} /> connected</span>
              </div>
              <p className="mt-3 break-all rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs leading-5 text-slate-500">
                {connection.username}@{connection.host}:{connection.port}/{connection.database_name}
                {connection.ssl_mode && connection.ssl_mode !== "PREFERRED" && (
                  <span className="ml-2 rounded bg-brand-50 px-1.5 py-0.5 font-sans font-medium text-brand-700">
                    SSL {connection.ssl_mode.toLowerCase()}
                  </span>
                )}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  className="btn-secondary h-9"
                  disabled={workingConnectionId === connection.id}
                  onClick={() => refreshConnection(connection.id)}
                  type="button"
                >
                  {workingConnectionId === connection.id ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />}
                  Refresh schema
                </button>
                <button
                  className="btn-secondary h-9 border-transparent text-rose-600 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                  disabled={workingConnectionId === connection.id}
                  onClick={() => deleteConnection(connection.id)}
                  type="button"
                >
                  <Trash2 size={14} /> Delete
                </button>
              </div>
            </article>
          ))}
        </div>
        {connections.length === 0 && <EmptyState icon={<Database size={22} />} text="No connections saved yet." />}
      </section>

      {connections.map((connection) => (
        <SchemaGraph
          insights={insights[connection.id]}
          key={connection.id}
          schema={schemas[connection.id]}
          title={`${connection.name} structure`}
        />
      ))}
    </section>
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
