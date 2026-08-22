import { FormEvent, useState } from "react";
import { Database, KeyRound, LogIn, ShieldCheck, UserPlus } from "lucide-react";
import { apiRequest } from "../lib/api";

type Props = {
  onToken: (token: string) => void;
};

export function AuthPanel({ onToken }: Props) {
  const [mode, setMode] = useState<"login" | "register">("register");
  const [email, setEmail] = useState("aswin@example.com");
  const [password, setPassword] = useState("password123");
  const [organizationName, setOrganizationName] = useState("QueryMind Demo");
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const payload =
        mode === "register" ? { email, password, organization_name: organizationName } : { email, password };
      const data = await apiRequest<{ access_token: string }>(`/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      onToken(data.access_token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  return (
    <main className="min-h-screen bg-paper px-4 py-8">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-6xl items-center gap-8 lg:grid-cols-[1fr_420px]">
        <section className="hidden lg:block">
          <div className="mb-8 flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-md bg-forest text-white shadow-sm">
              <Database size={21} />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-forest">QueryMind</p>
              <p className="text-sm text-steel">AI database operations workspace</p>
            </div>
          </div>
          <h1 className="max-w-3xl text-5xl font-semibold leading-tight text-ink">Operate MySQL data through a guarded AI workflow.</h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-steel">Connect a database, inspect its structure, ask in plain English, review generated SQL, and confirm writes before anything changes.</p>
          <div className="mt-8 grid max-w-2xl gap-3 sm:grid-cols-3">
            <Feature icon={<ShieldCheck size={18} />} label="Validated SQL" />
            <Feature icon={<KeyRound size={18} />} label="Encrypted credentials" />
            <Feature icon={<Database size={18} />} label="Schema-aware chat" />
          </div>
        </section>

        <section className="panel w-full p-6">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <span className="grid h-10 w-10 place-items-center rounded-md bg-forest text-white">
              <Database size={20} />
            </span>
            <div>
              <h1 className="text-2xl font-semibold">QueryMind</h1>
              <p className="text-sm text-steel">AI database workspace.</p>
            </div>
          </div>
          <div className="mb-6 hidden items-center gap-3 lg:flex">
            <span className="grid h-10 w-10 place-items-center rounded-md bg-forest text-white">
            <Database size={20} />
          </span>
          <div>
              <h2 className="text-xl font-semibold">{mode === "register" ? "Create workspace" : "Welcome back"}</h2>
              <p className="text-sm text-steel">Secure access to your QueryMind platform.</p>
          </div>
        </div>

          <div className="mb-5 grid grid-cols-2 gap-1 rounded-md border border-line bg-mist p-1">
          <button
              className={`flex items-center justify-center gap-2 rounded px-3 py-2 text-sm font-medium transition ${mode === "register" ? "bg-white text-forest shadow-sm" : "text-steel hover:text-ink"}`}
            onClick={() => setMode("register")}
            type="button"
          >
            <UserPlus size={16} /> Register
          </button>
          <button
              className={`flex items-center justify-center gap-2 rounded px-3 py-2 text-sm font-medium transition ${mode === "login" ? "bg-white text-forest shadow-sm" : "text-steel hover:text-ink"}`}
            onClick={() => setMode("login")}
            type="button"
          >
            <LogIn size={16} /> Login
          </button>
        </div>

        <form className="space-y-4" onSubmit={submit}>
          {mode === "register" && (
              <label className="label">
              Organization
                <input className="field mt-1.5 normal-case" value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} />
            </label>
          )}
            <label className="label">
            Email
              <input className="field mt-1.5 normal-case" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
            <label className="label">
            Password
              <input className="field mt-1.5 normal-case" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
            {error && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <button className="btn-accent w-full" type="submit">
            {mode === "register" ? <UserPlus size={18} /> : <LogIn size={18} />}
            {mode === "register" ? "Create Workspace" : "Enter Workspace"}
          </button>
        </form>
      </section>
      </div>
    </main>
  );
}

function Feature({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="panel-soft flex items-center gap-3 px-4 py-3">
      <span className="grid h-9 w-9 place-items-center rounded-md bg-white text-forest shadow-sm">{icon}</span>
      <span className="text-sm font-semibold text-navy">{label}</span>
    </div>
  );
}
