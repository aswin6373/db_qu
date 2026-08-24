import { FormEvent, useState } from "react";
import { CheckCircle2, Database, Info, Loader2, PlugZap, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
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
  const [replacing, setReplacing] = useState(false);

  const hasConnection = connections.length > 0;

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
        title="Database connections"
        description="Register MySQL databases, verify access, and cache schema metadata for safer AI-generated SQL."
        action={
          <button className="btn-secondary" onClick={onRefresh} type="button">
            <RefreshCw size={15} /> Refresh all
          </button>
        }
      />

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

      {/* Your single database */}
      {!replacing && hasConnection && (
        <section>
          <h2 className="mb-4 text-base font-bold tracking-tight text-slate-900">Your database</h2>
          {connections.map((connection) => (
            <article className="card animate-fade-up overflow-hidden" key={connection.id}>
              <div className="flex flex-col gap-4 bg-gradient-to-r from-brand-50 via-white to-cream p-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-navy text-teal-soft">
                    <Database size={20} />
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2.5">
                      <strong className="text-lg font-bold text-slate-900">{connection.name}</strong>
                      <span className="status-pill pill-success"><CheckCircle2 size={13} /> connected</span>
                    </div>
                    <p className="mt-0.5 truncate font-mono text-xs text-slate-500">
                      {connection.username}@{connection.host}:{connection.port}/{connection.database_name}
                      {connection.ssl_mode && connection.ssl_mode !== "PREFERRED" && (
                        <span className="ml-2 rounded bg-brand-50 px-1.5 py-0.5 font-sans font-medium text-brand-700">
                          SSL {connection.ssl_mode.toLowerCase()}
                        </span>
                      )}
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
              <p className="border-t border-slate-100 px-6 py-3 text-xs text-slate-400">
                Your workspace supports one database connection at a time. Replacing keeps your query history.
              </p>
            </article>
          ))}
        </section>
      )}

      {/* Add / replace form */}
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
          {isSaving ? "Testing & discovering…" : replacing ? "Replace database" : "Save connection"}
        </button>
      </form>
      )}

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
