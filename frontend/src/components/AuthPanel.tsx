import { FormEvent, useState } from "react";
import { Database, LogIn, UserPlus } from "lucide-react";
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
    <main className="grid min-h-screen place-items-center bg-mist px-4 py-10">
      <section className="w-full max-w-md rounded border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded bg-forest text-white">
            <Database size={20} />
          </span>
          <div>
            <h1 className="text-2xl font-semibold">QueryMind</h1>
            <p className="text-sm text-slate-600">Natural-language access for MySQL data.</p>
          </div>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-2 rounded border border-slate-200 p-1">
          <button
            className={`flex items-center justify-center gap-2 rounded px-3 py-2 text-sm ${mode === "register" ? "bg-forest text-white" : "text-slate-700"}`}
            onClick={() => setMode("register")}
            type="button"
          >
            <UserPlus size={16} /> Register
          </button>
          <button
            className={`flex items-center justify-center gap-2 rounded px-3 py-2 text-sm ${mode === "login" ? "bg-forest text-white" : "text-slate-700"}`}
            onClick={() => setMode("login")}
            type="button"
          >
            <LogIn size={16} /> Login
          </button>
        </div>

        <form className="space-y-4" onSubmit={submit}>
          {mode === "register" && (
            <label className="block text-sm font-medium">
              Organization
              <input className="focus-ring mt-1 w-full rounded border border-slate-300 px-3 py-2" value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} />
            </label>
          )}
          <label className="block text-sm font-medium">
            Email
            <input className="focus-ring mt-1 w-full rounded border border-slate-300 px-3 py-2" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label className="block text-sm font-medium">
            Password
            <input className="focus-ring mt-1 w-full rounded border border-slate-300 px-3 py-2" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          {error && <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <button className="focus-ring flex w-full items-center justify-center gap-2 rounded bg-coral px-4 py-2 font-semibold text-white" type="submit">
            {mode === "register" ? <UserPlus size={18} /> : <LogIn size={18} />}
            {mode === "register" ? "Create Workspace" : "Enter Workspace"}
          </button>
        </form>
      </section>
    </main>
  );
}
