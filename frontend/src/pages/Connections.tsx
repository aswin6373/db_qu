import { FormEvent, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  Database,
  Eye,
  EyeOff,
  Info,
  Loader2,
  PlugZap,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  X,
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

type Mode = "view" | "add";

const EMPTY_FORM = {
  name: "",
  host: "",
  port: 3306,
  username: "",
  password: "",
  database_name: "",
  ssl_mode: "PREFERRED" as SslMode,
  test_live: true,
  ssh_host: null as string | null,
  ssh_port: 22,
  ssh_username: null as string | null,
  ssh_password: null as string | null
};

export function Connections({ token, connections, insights, schemas, onRefresh }: Props) {
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [refreshingId, setRefreshingId] = useState<number | null>(null);
  // A workspace can hold many databases; this picks whose schema is shown below the list.
  const [selectedId, setSelectedId] = useState<number | null>(connections[0]?.id ?? null);
  const [mode, setMode] = useState<Mode>("view");

  const isEditing = mode === "add";
  const selectedConnection =
    connections.find((connection) => connection.id === selectedId) ?? connections[0] ?? null;

  function startAdd() {
    setForm({ ...EMPTY_FORM });
    setFeedback(null);
    setMode("add");
  }

  function cancelEdit() {
    setFeedback(null);
    setMode("view");
  }

  function updateField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFeedback(null);
    setIsSaving(true);
    try {
      const created = await apiRequest<Connection>("/connections", { method: "POST", body: JSON.stringify(form) }, token);
      setForm({ ...EMPTY_FORM });
      setMode("view");
      setSelectedId(created.id);
      setFeedback({
        kind: "success",
        text: `${created.name} connected and its schema was discovered.`
      });
      onRefresh();
    } catch (err) {
      setFeedback({
        kind: "error",
        text: err instanceof Error ? err.message : "Connection failed"
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function refreshConnection(connectionId: number) {
    setFeedback(null);
    setRefreshingId(connectionId);
    try {
      await apiRequest(`/connections/${connectionId}/refresh`, { method: "POST" }, token);
      setFeedback({ kind: "success", text: "Schema refreshed from the live database." });
      onRefresh();
    } catch (err) {
      setFeedback({ kind: "error", text: err instanceof Error ? err.message : "Refresh failed" });
    } finally {
      setRefreshingId(null);
    }
  }

  async function deleteConnection(connection: Connection) {
    try {
      await apiRequest(`/connections/${connection.id}`, { method: "DELETE" }, token);
      setFeedback({ kind: "success", text: `${connection.name} was removed. Your query history is kept.` });
      if (selectedId === connection.id) setSelectedId(null);
      onRefresh();
    } catch (err) {
      setFeedback({ kind: "error", text: err instanceof Error ? err.message : "Delete failed" });
      throw err;
    }
  }

  return (
    <section className="space-y-7">
      <PageHeader
        eyebrow="Data sources"
        title="Database connections"
        description={`Connect every MySQL database your workspace uses — production, analytics, staging — and QueryMind caches each schema for safer AI-generated SQL.${connections.length > 0 ? ` Currently ${connections.length} connected.` : ""}`}
      />

      {feedback && (
        <Banner
          feedback={feedback}
          onDismiss={() => setFeedback(null)}
        />
      )}

      {isEditing ? (
        <ConnectionForm
          form={form}
          isSaving={isSaving}
          onCancel={cancelEdit}
          onFieldChange={updateField}
          onSubmit={submit}
        />
      ) : connections.length === 0 ? (
        <EmptyState onAdd={startAdd} />
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-navy-soft">
              {connections.length} database{connections.length === 1 ? "" : "s"} connected
              <span className="ml-2 text-xs text-navy-soft/60">Click a card to view its schema below</span>
            </p>
            <button className="btn-accent !h-10 shrink-0 !px-4 !font-medium" onClick={startAdd} type="button">
              <Plus size={15} /> Add database
            </button>
          </div>
          <div className="space-y-3">
            {connections.map((connection) => (
              <ConnectionCard
                connection={connection}
                isSelected={selectedConnection?.id === connection.id}
                key={connection.id}
                isRefreshing={refreshingId === connection.id}
                onDelete={deleteConnection}
                onSelect={() => setSelectedId(connection.id)}
                onRefreshSchema={() => refreshConnection(connection.id)}
              />
            ))}
          </div>

          {selectedConnection && (
            <SchemaGraph
              insights={insights[selectedConnection.id]}
              key={selectedConnection.id}
              schema={schemas[selectedConnection.id]}
            />
          )}
        </>
      )}
    </section>
  );
}

function ConnectionCard({
  connection,
  isSelected,
  isRefreshing,
  onDelete,
  onSelect,
  onRefreshSchema
}: {
  connection: Connection;
  isSelected: boolean;
  isRefreshing: boolean;
  onDelete: (connection: Connection) => Promise<void>;
  onSelect: () => void;
  onRefreshSchema: () => void;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  async function remove() {
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      await onDelete(connection);
      setConfirmingDelete(false);
    } catch {
      setConfirmingDelete(false);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <article
      className={`card animate-fade-up cursor-pointer overflow-hidden transition ${
        isSelected ? "!border-brand-300 ring-1 ring-brand-200" : "hover:!border-slate-300"
      } ${isDeleting ? "opacity-60" : ""}`}
      onClick={onSelect}
    >
      <div className="flex flex-col gap-4 border-b border-slate-100 bg-gradient-to-r from-brand-50 via-white to-cream p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-navy text-teal-soft">
            <Database size={18} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <strong className="text-base font-bold text-slate-900">{connection.name}</strong>
              {isSelected && (
                <span className="status-pill pill-success">
                  <CheckCircle2 size={13} /> viewing schema
                </span>
              )}
              {connection.ssh_host && (
                <span className="status-pill pill-info">
                  <ShieldCheck size={13} /> ssh
                </span>
              )}
            </div>
            <p className="mt-0.5 truncate font-mono text-xs text-slate-500">
              mysql://{connection.username}@{connection.host}:{connection.port}/{connection.database_name}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2" onClick={(event) => event.stopPropagation()}>
          {confirmingDelete ? (
            <>
              <span className="text-xs font-medium text-rose-600">Delete this database?</span>
              <button
                className="grid h-9 w-9 place-items-center rounded-lg bg-rose-600 text-white transition hover:bg-rose-700 disabled:opacity-60"
                disabled={isDeleting}
                onClick={remove}
                title="Confirm delete"
                type="button"
              >
                {isDeleting ? <Loader2 className="animate-spin" size={14} /> : <CheckCircle2 size={14} />}
              </button>
              <button
                aria-label="Keep connection"
                className="grid h-9 w-9 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                onClick={() => setConfirmingDelete(false)}
                type="button"
              >
                <X size={15} />
              </button>
            </>
          ) : (
            <>
              <button className="btn-secondary !h-9 !px-3 !text-xs" disabled={isRefreshing} onClick={onRefreshSchema} type="button">
                {isRefreshing ? <Loader2 className="animate-spin" size={13} /> : <RefreshCw size={13} />}
                Refresh schema
              </button>
              <button
                aria-label={`Delete ${connection.name}`}
                className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-400 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                onClick={() => setConfirmingDelete(true)}
                title="Delete connection"
                type="button"
              >
                <Trash2 size={14} />
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-3 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
        <DetailField label="Host" value={connection.host} />
        <DetailField label="Port" value={String(connection.port)} />
        <DetailField label="Database" value={connection.database_name} />
        <DetailField label="Username" value={connection.username} />
      </div>
    </article>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="card animate-fade-up flex flex-col items-center px-6 py-14 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 text-white shadow-lg shadow-brand-600/25">
        <PlugZap size={24} />
      </span>
      <h2 className="mt-5 text-lg font-bold tracking-tight text-navy">No databases connected yet</h2>
      <p className="mt-1.5 max-w-md text-sm leading-6 text-navy-soft">
        Connect as many MySQL databases as your workspace needs — AI chat lets you pick one per conversation.
      </p>
      <button className="btn-accent mt-6" onClick={onAdd} type="button">
        <Plus size={16} /> Add your first database
      </button>
    </div>
  );
}

function ConnectionForm({
  form,
  isSaving,
  onCancel,
  onFieldChange,
  onSubmit
}: {
  form: typeof EMPTY_FORM;
  isSaving: boolean;
  onCancel: () => void;
  onFieldChange: <K extends keyof typeof EMPTY_FORM>(key: K, value: (typeof EMPTY_FORM)[K]) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [showSshPassword, setShowSshPassword] = useState(false);
  const [showSshTunnel, setShowSshTunnel] = useState(false);

  function toggleSshTunnel(enabled: boolean) {
    setShowSshTunnel(enabled);
    if (!enabled) {
      // Drop any half-entered tunnel values so they never reach the backend.
      onFieldChange("ssh_host", null);
      onFieldChange("ssh_port", 22);
      onFieldChange("ssh_username", null);
      onFieldChange("ssh_password", null);
      setShowSshPassword(false);
    }
  }

  return (
    <form className="card animate-fade-up overflow-hidden" onSubmit={onSubmit}>
      <div className="flex items-center gap-3 border-b border-slate-100 bg-gradient-to-r from-brand-50 via-white to-cream p-6">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-navy text-teal-soft">
          <Database size={20} />
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-bold tracking-tight text-slate-900">Connect a new database</h2>
          <p className="text-xs text-slate-500">Credentials are encrypted before they touch the platform database.</p>
        </div>
      </div>

      <div className="space-y-6 p-6 sm:p-7">
        <section>
          <h3 className="eyebrow mb-3 text-slate-400">Connection details</h3>
          <div className="grid gap-x-5 gap-y-4 md:grid-cols-2">
            <label className="block md:col-span-2">
              <span className="label">Display name</span>
              <input
                className="field"
                placeholder="Production MySQL"
                required
                value={form.name}
                onChange={(event) => onFieldChange("name", event.target.value)}
              />
            </label>
            <label className="block">
              <span className="label">Host</span>
              <input
                className="field font-mono"
                placeholder={showSshTunnel ? "127.0.0.1 or db.internal" : "mysql.example.com"}
                required
                value={form.host}
                onChange={(event) => onFieldChange("host", event.target.value)}
              />
              {showSshTunnel && (
                <span className="mt-1.5 block text-xs text-slate-400">
                  Database address as seen from the SSH server — use 127.0.0.1 if MySQL runs on the bastion itself.
                </span>
              )}
            </label>
            <label className="block">
              <span className="label">Port</span>
              <input
                className="field"
                max={65535}
                min={1}
                placeholder="3306"
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
              <span className="relative block">
                <select
                  className="field cursor-pointer appearance-none pr-10"
                  value={form.ssl_mode}
                  onChange={(event) => onFieldChange("ssl_mode", event.target.value as SslMode)}
                >
                  <option value="PREFERRED">Auto — use SSL if available</option>
                  <option value="REQUIRED">Required — cloud providers</option>
                  <option value="DISABLED">Disabled — local only</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              </span>
              <span className="mt-1.5 block text-xs text-slate-400">
                Aiven, PlanetScale, RDS, and TiDB usually require SSL.
              </span>
            </label>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-slate-50/70">
          <label
            htmlFor="ssh-tunnel-toggle"
            className="flex cursor-pointer items-start gap-3 px-4 py-3.5 text-sm"
          >
            <input
              checked={showSshTunnel}
              onChange={(event) => toggleSshTunnel(event.target.checked)}
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-brand-600"
              id="ssh-tunnel-toggle"
            />
            <span>
              <span className="flex items-center gap-1.5 font-semibold text-slate-800">
                <ShieldCheck size={15} /> SSH Tunnel
              </span>
              <span className="mt-0.5 block text-xs text-slate-500">
                Connect through a bastion/jump host when your database is not publicly reachable.
              </span>
            </span>
          </label>

          {showSshTunnel && (
            <div className="grid gap-x-5 gap-y-4 border-t border-slate-200 px-4 pb-4 pt-4 md:grid-cols-2">
              <label className="block">
                <span className="label">SSH Host</span>
                <input
                  className="field font-mono"
                  placeholder="bastion.mycompany.com"
                  required={showSshTunnel}
                  value={form.ssh_host ?? ""}
                  onChange={(event) => onFieldChange("ssh_host", event.target.value)}
                />
              </label>
              <label className="block">
                <span className="label">SSH Port</span>
                <input
                  className="field"
                  placeholder="22"
                  type="number"
                  min={1}
                  max={65535}
                  value={form.ssh_port}
                  onChange={(event) => onFieldChange("ssh_port", Number(event.target.value) || 22)}
                />
              </label>
              <label className="block">
                <span className="label">SSH Username</span>
                <input
                  className="field font-mono"
                  placeholder="ec2-user"
                  required={showSshTunnel}
                  value={form.ssh_username ?? ""}
                  onChange={(event) => onFieldChange("ssh_username", event.target.value)}
                />
              </label>
              <label className="block">
                <span className="label">SSH Password / Private Key</span>
                <span className="relative block">
                  {(showSshPassword || (form.ssh_password ?? "").startsWith("-----")) ? (
                    <textarea
                      className="field h-auto min-h-[44px] resize-y py-3 pr-11 font-mono text-[13px] leading-5"
                      placeholder="Paste SSH private key (-----BEGIN...) or password"
                      required={showSshTunnel}
                      rows={1}
                      value={form.ssh_password ?? ""}
                      onChange={(event) => onFieldChange("ssh_password", event.target.value)}
                    />
                  ) : (
                    <input
                      className="field pr-11"
                      placeholder="Password, or paste a private key"
                      required={showSshTunnel}
                      type="password"
                      value={form.ssh_password ?? ""}
                      onChange={(event) => onFieldChange("ssh_password", event.target.value)}
                    />
                  )}
                  <button
                    aria-label={showSshPassword ? "Hide SSH secret" : "Show SSH secret"}
                    className="absolute right-1 top-1 grid h-9 w-9 place-items-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                    onClick={() => setShowSshPassword((visible) => !visible)}
                    tabIndex={-1}
                    type="button"
                  >
                    {showSshPassword || (form.ssh_password ?? "").startsWith("-----") ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </span>
                <span className="mt-1.5 block text-xs text-slate-400">
                  Password stays hidden; a private key (-----BEGIN…) opens a larger box and is detected automatically. Encrypted at rest like your database password.
                </span>
              </label>
            </div>
          )}
        </section>

        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3.5 text-sm transition hover:border-slate-300">
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

      <div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-4 sm:flex-row sm:justify-end">
        <button className="btn-secondary" disabled={isSaving} onClick={onCancel} type="button">
          Cancel
        </button>
        <button className="btn-accent !h-10 w-full sm:w-auto" disabled={isSaving} type="submit">
          {isSaving ? <Loader2 className="animate-spin" size={15} /> : <PlugZap size={15} />}
          {isSaving ? "Testing & discovering…" : "Save connection"}
        </button>
      </div>
    </form>
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
