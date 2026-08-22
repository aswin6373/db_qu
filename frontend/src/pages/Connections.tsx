import { FormEvent, useState } from "react";
import { Loader2, PlugZap, RefreshCw } from "lucide-react";
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
      <div>
        <h1 className="text-2xl font-semibold">Database Connections</h1>
        <p className="text-sm text-slate-600">Connect a MySQL database and cache its schema for AI query generation.</p>
      </div>
      {connections.length === 0 && (
        <section className="rounded border border-coral/30 bg-white p-4">
          <h2 className="text-lg font-semibold">First step for production use</h2>
          <p className="mt-1 text-sm text-slate-600">Add your MySQL host, username, password, and database name. QueryMind will test the connection and discover tables, columns, and keys before AI chat is enabled.</p>
        </section>
      )}
      <form className="grid gap-4 rounded border border-slate-200 bg-white p-4 md:grid-cols-2" onSubmit={submit}>
        {Object.entries(form).map(([key, value]) =>
          key === "test_live" ? (
            <label className="flex items-center gap-2 text-sm" key={key}>
              <input checked={Boolean(value)} onChange={(event) => setForm({ ...form, test_live: event.target.checked })} type="checkbox" />
              Test live MySQL connection before saving
            </label>
          ) : (
            <label className="block text-sm font-medium" key={key}>
              {key.replace("_", " ")}
              <input
                className="focus-ring mt-1 w-full rounded border border-slate-300 px-3 py-2"
                type={key === "password" ? "password" : key === "port" ? "number" : "text"}
                value={value as string | number}
                onChange={(event) => setForm({ ...form, [key]: key === "port" ? Number(event.target.value) : event.target.value })}
              />
            </label>
          )
        )}
        <button className="focus-ring flex items-center justify-center gap-2 rounded bg-forest px-4 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400 md:col-span-2" disabled={isSaving} type="submit">
          {isSaving ? <Loader2 className="animate-spin" size={18} /> : <PlugZap size={18} />}
          {isSaving ? "Testing and Discovering" : "Save Connection"}
        </button>
        {message && <p className="md:col-span-2 text-sm text-slate-700">{message}</p>}
      </form>
      <section className="rounded border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Saved Connections</h2>
          <button className="rounded p-2 text-slate-600 hover:bg-slate-100" onClick={onRefresh} title="Refresh" type="button">
            <RefreshCw size={17} />
          </button>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {connections.map((connection) => (
            <div className="rounded border border-slate-200 p-3" key={connection.id}>
              <strong>{connection.name}</strong>
              <p className="text-sm text-slate-600">{connection.username}@{connection.host}:{connection.port}/{connection.database_name}</p>
            </div>
          ))}
          {connections.length === 0 && <p className="text-sm text-slate-600">No connections saved yet.</p>}
        </div>
      </section>
      {connections.map((connection) => (
        <SchemaGraph key={connection.id} schema={schemas[connection.id]} title={`${connection.name} Structure`} />
      ))}
    </section>
  );
}
