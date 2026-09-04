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
import { NumberField } from "../components/NumberField";
import { SchemaGraph } from "../components/SchemaGraph";
import { apiRequest } from "../lib/api";
import { Connection, DatabaseSchema, DbType, SslMode, SchemaInsights } from "../types/api";

type Props = {
  token: string;
  connections: Connection[];
  insights: Record<number, SchemaInsights>;
  schemas: Record<number, DatabaseSchema>;
  onRefresh: () => void;
  isAdmin: boolean;
};

type Feedback = { kind: "success" | "error" | "info"; text: string };

type Mode = "view" | "add";

const DEFAULT_PORTS: Record<DbType, number> = { mysql: 3306, postgres: 5432 };
const URI_SCHEMES: Record<DbType, string> = { mysql: "mysql", postgres: "postgresql" };

const EMPTY_FORM = {
  name: "",
  db_type: "mysql" as DbType,
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

export function Connections({ token, connections, insights, schemas, onRefresh, isAdmin }: Props) {
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
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 lg:py-10">
      <section className="space-y-5">
        <PageHeader
          eyebrow="Data sources"
          title="Connections"
          action={
            isAdmin ? (
              <button className="btn-primary !h-9 shrink-0 !px-3.5" onClick={startAdd} type="button">
                <Plus size={15} /> Add database
              </button>
            ) : undefined
          }
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
          <EmptyState isAdmin={isAdmin} onAdd={startAdd} />
        ) : (
          <>
            <div className="space-y-3">
              {connections.map((connection) => (
                <ConnectionCard
                  connection={connection}
                  isAdmin={isAdmin}
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
    </div>
  );
}

function ConnectionCard({
  connection,
  isAdmin,
  isSelected,
  isRefreshing,
  onDelete,
  onSelect,
  onRefreshSchema
}: {
  connection: Connection;
  isAdmin: boolean;
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
      className={`card animate-fade-up cursor-pointer transition ${
        isSelected ? "!border-brand-500/50 ring-1 ring-brand-500/25" : "hover:!border-line-strong"
      } ${isDeleting ? "opacity-60" : ""}`}
      onClick={onSelect}
    >
      <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:p-5">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-500/10 text-brand-400">
            <Database size={18} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <strong className="text-[15px] font-semibold text-ink">{connection.name}</strong>
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
            <p className="mt-0.5 truncate font-mono text-xs text-ink-faint">
              {URI_SCHEMES[(connection.db_type as DbType) ?? "mysql"] ?? "mysql"}://{connection.username}@{connection.host}:{connection.port}/{connection.database_name}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2" onClick={(event) => event.stopPropagation()}>
          {confirmingDelete ? (
            <>
              <span className="text-xs font-medium text-rose-300">Delete this database?</span>
              <button
                className="grid h-9 w-9 place-items-center rounded-lg bg-rose-500 text-white transition hover:bg-rose-400 disabled:opacity-60"
                disabled={isDeleting}
                onClick={remove}
                title="Confirm delete"
                type="button"
              >
                {isDeleting ? <Loader2 className="animate-spin" size={14} /> : <CheckCircle2 size={14} />}
              </button>
              <button
                aria-label="Keep connection"
                className="grid h-9 w-9 place-items-center rounded-lg text-ink-faint transition hover:bg-white/10 hover:text-ink"
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
              {isAdmin && (
                <button
                  aria-label={`Delete ${connection.name}`}
                  className="grid h-9 w-9 place-items-center rounded-lg border border-line text-ink-faint transition hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-300"
                  onClick={() => setConfirmingDelete(true)}
                  title="Delete connection"
                  type="button"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 p-4 sm:gap-3 sm:p-5 lg:grid-cols-4">
        <DetailField label="Host" value={connection.host} />
        <DetailField label="Port" value={String(connection.port)} />
        <DetailField label="Database" value={connection.database_name} />
        <DetailField label="Username" value={connection.username} />
      </div>
    </article>
  );
}

function EmptyState({ isAdmin, onAdd }: { isAdmin: boolean; onAdd: () => void }) {
  return (
    <div className="card animate-fade-up flex flex-col items-center px-6 py-14 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-500/10 text-brand-400">
        <Database size={24} />
      </span>
      <h2 className="mt-5 font-display text-lg font-semibold tracking-tight text-ink">No databases connected yet</h2>
      <p className="mt-1.5 text-sm text-ink-soft">
        {isAdmin ? "Add your first MySQL or PostgreSQL database." : "Ask your workspace admin to connect a database."}
      </p>
      {isAdmin && (
        <button className="btn-primary mt-6" onClick={onAdd} type="button">
          <Plus size={16} /> Add your first database
        </button>
      )}
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
      <div className="space-y-6 p-4 sm:p-6">
        <section>
          <h3 className="eyebrow mb-3 text-ink-faint">Connection details</h3>
          <div className="grid gap-x-5 gap-y-4 md:grid-cols-2">
            <label className="block md:col-span-2">
              <span className="label">Display name</span>
              <input
                className="field"
                placeholder="Production database"
                required
                value={form.name}
                onChange={(event) => onFieldChange("name", event.target.value)}
              />
            </label>
            <label className="block">
              <span className="label">Database type</span>
              <select
                className="field cursor-pointer appearance-none pr-10"
                value={form.db_type}
                onChange={(event) => {
                  const db_type = event.target.value as DbType;
                  onFieldChange("db_type", db_type);
                  onFieldChange("port", DEFAULT_PORTS[db_type]);
                }}
              >
                <option value="mysql">MySQL / MariaDB</option>
                <option value="postgres">PostgreSQL</option>
              </select>
            </label>
            <label className="block">
              <span className="label">Host</span>
              <input
                className="field font-mono"
                placeholder={showSshTunnel ? "127.0.0.1 or db.internal" : `${URI_SCHEMES[form.db_type]}.example.com`}
                required
                value={form.host}
                onChange={(event) => onFieldChange("host", event.target.value)}
              />
            </label>
            <label className="block">
              <span className="label">Port</span>
              <NumberField
                className="field"
                fallback={DEFAULT_PORTS[form.db_type]}
                max={65535}
                min={1}
                onCommit={(port) => onFieldChange("port", port)}
                value={form.port}
              />
            </label>
          </div>
        </section>

        <section className="border-t border-line pt-5">
          <h3 className="eyebrow mb-3 text-ink-faint">Credentials</h3>
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
                  autoComplete="new-password"
                  className="field pr-11"
                  placeholder="••••••••"
                  required
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={(event) => onFieldChange("password", event.target.value)}
                />
                <button
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-1 top-1 grid h-8 w-8 place-items-center rounded-md text-ink-faint transition hover:bg-white/10 hover:text-ink"
                  onClick={() => setShowPassword((visible) => !visible)}
                  type="button"
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </span>
            </label>
          </div>
        </section>

        <section className="border-t border-line pt-5">
          <h3 className="eyebrow mb-3 text-ink-faint">Database &amp; security</h3>
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
                <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-faint" size={16} />
              </span>
            </label>
          </div>
        </section>

        <section className="rounded-xl border border-line bg-white/[0.02]">
          <label
            htmlFor="ssh-tunnel-toggle"
            className="flex cursor-pointer items-start gap-3 px-4 py-3.5 text-sm"
          >
            <input
              checked={showSshTunnel}
              onChange={(event) => toggleSshTunnel(event.target.checked)}
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-brand-500"
              id="ssh-tunnel-toggle"
            />
            <span>
              <span className="flex items-center gap-1.5 font-medium text-ink">
                <ShieldCheck size={15} /> SSH Tunnel
              </span>
            </span>
          </label>

          {showSshTunnel && (
            <div className="grid gap-x-5 gap-y-4 border-t border-line px-4 pb-4 pt-4 md:grid-cols-2">
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
                <NumberField
                  className="field"
                  fallback={22}
                  max={65535}
                  min={1}
                  onCommit={(ssh_port) => onFieldChange("ssh_port", ssh_port)}
                  value={form.ssh_port}
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
                    className="absolute right-1 top-1 grid h-8 w-8 place-items-center rounded-md text-ink-faint transition hover:bg-white/10 hover:text-ink"
                    onClick={() => setShowSshPassword((visible) => !visible)}
                      type="button"
                  >
                    {showSshPassword || (form.ssh_password ?? "").startsWith("-----") ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </span>
              </label>
            </div>
          )}
        </section>

        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-white/[0.02] px-4 py-3.5 text-sm transition hover:border-line-strong">
          <input
            checked={Boolean(form.test_live)}
            className="mt-0.5 h-4 w-4 accent-brand-500"
            onChange={(event) => onFieldChange("test_live", event.target.checked)}
            type="checkbox"
          />
          <span className="flex items-center gap-1.5 font-medium text-ink">
            <ShieldCheck size={15} /> Test live connection before saving
          </span>
        </label>
      </div>

      <div className="flex flex-col-reverse gap-2 border-t border-line px-4 py-4 sm:flex-row sm:justify-end sm:px-6">
        <button className="btn-secondary" disabled={isSaving} onClick={onCancel} type="button">
          Cancel
        </button>
        <button className="btn-primary w-full sm:w-auto" disabled={isSaving} type="submit">
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
      <p className="text-[10px] font-medium uppercase tracking-wider text-ink-faint">{label}</p>
      <p className="mt-0.5 truncate font-mono text-[13px] text-ink">{value}</p>
    </div>
  );
}

function Banner({ feedback, onDismiss }: { feedback: Feedback; onDismiss: () => void }) {
  const styles = {
    success: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300",
    error: "border-rose-500/25 bg-rose-500/10 text-rose-300",
    info: "border-brand-500/25 bg-brand-500/10 text-brand-300"
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
