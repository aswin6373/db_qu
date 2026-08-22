import { FormEvent, useState } from "react";
import { CheckCircle2, Database, Loader2, PlugZap, RefreshCw, ShieldCheck } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { SchemaGraph } from "../components/SchemaGraph";
import { apiRequest } from "../lib/api";
import { Connection, DatabaseSchema } from "../types/api";

type Props = {
  token: string;
  connections: Connection[];
  schemas: Record<number, DatabaseSchema>;
  onRefresh: () => void;
};

export function Connections({ token, connections, schemas, onRefresh }: Props) {
  const [form, setForm] = useState({ name: "Local MySQL", host: "localhost", port: 3306, username: "root", password: "", database_name: "querymind_demo", test_live: true });
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setIsSaving(true);
    try {
      await apiRequest("/connections", { method: "POST", body: JSON.stringify(form) }, token);
      setMessage("Connection saved and schema discovery completed.");
      onRefresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Data Sources"
        title="Database Connections"
        description="Register MySQL databases, verify access, and cache schema metadata for safer AI-generated SQL."
        action={<button className="btn-secondary" onClick={onRefresh} title="Refresh" type="button"><RefreshCw size={16} /> Refresh</button>}
      />
      {connections.length === 0 && (
        <section className="panel border-coral/30 p-5">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-coral/10 text-coral">
              <PlugZap size={18} />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-ink">First step for production use</h2>
              <p className="mt-1 text-sm leading-6 text-steel">Add your MySQL host, username, password, and database name. QueryMind will test the connection and discover tables, columns, and keys before AI chat is enabled.</p>
            </div>
          </div>
        </section>
      )}
      <form className="panel grid gap-5 p-5 md:grid-cols-2" onSubmit={submit}>
        <div className="md:col-span-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-navy">
            <Database className="text-forest" size={17} />
            Connection Details
          </div>
          <p className="mt-1 text-sm text-steel">Credentials are encrypted before they are stored in the platform database.</p>
        </div>
        {Object.entries(form).map(([key, value]) =>
          key === "test_live" ? (
            <label className="panel-soft flex items-start gap-3 p-3 text-sm md:col-span-2" key={key}>
              <input className="mt-1 h-4 w-4 accent-forest" checked={Boolean(value)} onChange={(event) => setForm({ ...form, test_live: event.target.checked })} type="checkbox" />
              <span>
                <span className="flex items-center gap-2 font-semibold text-ink"><ShieldCheck size={16} /> Test live MySQL connection before saving</span>
                <span className="mt-1 block text-steel">Recommended. This confirms credentials and loads schema metadata immediately.</span>
              </span>
            </label>
          ) : (
            <label className="label" key={key}>
              {key.replace("_", " ")}
              <input
                className="field mt-1.5 normal-case"
                type={key === "password" ? "password" : key === "port" ? "number" : "text"}
                value={value as string | number}
                onChange={(event) => setForm({ ...form, [key]: key === "port" ? Number(event.target.value) : event.target.value })}
              />
            </label>
          )
        )}
        <button className="btn-primary md:col-span-2" disabled={isSaving} type="submit">
          {isSaving ? <Loader2 className="animate-spin" size={18} /> : <PlugZap size={18} />}
          {isSaving ? "Testing and Discovering" : "Save Connection"}
        </button>
        {message && (
          <p className="flex items-center gap-2 rounded-md border border-line bg-paper px-3 py-2 text-sm text-steel md:col-span-2">
            <CheckCircle2 className="text-forest" size={16} /> {message}
          </p>
        )}
      </form>
      <section className="panel p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">Saved Connections</h2>
          <button className="btn-secondary h-9 w-9 px-0" onClick={onRefresh} title="Refresh" type="button">
            <RefreshCw size={17} />
          </button>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {connections.map((connection) => (
            <div className="rounded-lg border border-line bg-paper p-4" key={connection.id}>
              <div className="flex items-center justify-between gap-3">
                <strong className="text-ink">{connection.name}</strong>
                <span className="status-pill text-forest">connected</span>
              </div>
              <p className="mt-2 break-all text-sm text-steel">{connection.username}@{connection.host}:{connection.port}/{connection.database_name}</p>
            </div>
          ))}
          {connections.length === 0 && <p className="rounded-md border border-dashed border-line bg-paper px-4 py-8 text-center text-sm text-steel md:col-span-2">No connections saved yet.</p>}
        </div>
      </section>
      {connections.map((connection) => (
        <SchemaGraph key={connection.id} schema={schemas[connection.id]} title={`${connection.name} Structure`} />
      ))}
    </section>
  );
}
