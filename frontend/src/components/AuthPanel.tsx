import { FormEvent, useState } from "react";
import { ArrowRight, Database, KeyRound, Loader2, LogIn, ShieldCheck, Sparkles, Table2, UserPlus } from "lucide-react";
import { apiRequest } from "../lib/api";

type Props = {
  onToken: (token: string) => void;
};

export function AuthPanel({ onToken }: Props) {
  const [mode, setMode] = useState<"login" | "register">("register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setError("");
    setBusy(true);
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
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen bg-slate-950 lg:grid-cols-[1.1fr_1fr]">
      {/* Story panel */}
      <section className="relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-14">
        <div className="pointer-events-none absolute -left-40 -top-40 h-96 w-96 rounded-full bg-brand-600/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 -right-24 h-96 w-96 rounded-full bg-violet-600/20 blur-3xl" />
        <div className="relative">
          <Logo mark="lg" />
          <h1 className="mt-16 max-w-xl text-[2.6rem] font-bold leading-[1.15] tracking-tight text-white">
            Operate your MySQL data through a guarded AI workflow.
          </h1>
          <p className="mt-5 max-w-lg text-[15px] leading-7 text-slate-400">
            Connect a database, inspect its structure, ask in plain English, review the generated SQL — and confirm
            every write before anything changes.
          </p>
          <div className="mt-10 grid max-w-lg gap-3 sm:grid-cols-3">
            <Feature icon={<ShieldCheck size={17} />} label="Validated SQL" />
            <Feature icon={<KeyRound size={17} />} label="Encrypted credentials" />
            <Feature icon={<Table2 size={17} />} label="Schema-aware chat" />
          </div>
        </div>
        <div className="relative flex items-center gap-8 text-slate-500">
          <Stat value="100%" label="SQL validated before execution" />
          <Divider />
          <Stat value="0" label="Writes run without confirmation" />
          <Divider />
          <Stat value="AES" label="Credentials encrypted at rest" />
        </div>
      </section>

      {/* Form card */}
      <section className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-md animate-fade-up rounded-2xl border border-slate-200 bg-white p-7 shadow-lift sm:p-9">
          <div className="mb-7 lg:hidden">
            <Logo mark="sm" dark />
          </div>
          <p className="eyebrow text-brand-600">{mode === "register" ? "Get started" : "Welcome back"}</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            {mode === "register" ? "Create your workspace" : "Sign in to QueryMind"}
          </h2>
          <p className="mt-1.5 text-sm text-slate-500">
            {mode === "register"
              ? "One workspace per team. Your credentials stay encrypted."
              : "Secure access to your QueryMind platform."}
          </p>

          <div className="mt-6 grid grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
            <TabButton active={mode === "register"} icon={<UserPlus size={15} />} label="Register" onClick={() => setMode("register")} />
            <TabButton active={mode === "login"} icon={<LogIn size={15} />} label="Login" onClick={() => setMode("login")} />
          </div>

          <form className="mt-6 space-y-4" onSubmit={submit}>
            {mode === "register" && (
              <label className="block">
                <span className="label">Organization</span>
                <input
                  className="field"
                  placeholder="Acme Analytics"
                  required
                  minLength={2}
                  value={organizationName}
                  onChange={(event) => setOrganizationName(event.target.value)}
                />
              </label>
            )}
            <label className="block">
              <span className="label">Email</span>
              <input
                className="field"
                placeholder="you@company.com"
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label className="block">
              <span className="label">Password</span>
              <input
                className="field"
                placeholder={mode === "register" ? "Minimum 8 characters" : "Your password"}
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            {error && <ErrorBanner message={error} />}
            <button className="btn-accent w-full" disabled={busy} type="submit">
              {busy ? <Loader2 className="animate-spin" size={18} /> : mode === "register" ? <UserPlus size={18} /> : <LogIn size={18} />}
              {mode === "register" ? "Create workspace" : "Enter workspace"}
              {!busy && <ArrowRight size={16} />}
            </button>
          </form>

          <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-slate-400">
            <Sparkles size={13} /> Free while in beta · No credit card required
          </p>
        </div>
      </section>
    </main>
  );
}

function Logo({ mark = "lg", dark = false }: { mark?: "lg" | "sm"; dark?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={`grid place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-violet-600 text-white shadow-lg shadow-brand-600/30 ${
          mark === "lg" ? "h-11 w-11" : "h-9 w-9"
        }`}
      >
        <Database size={mark === "lg" ? 21 : 17} />
      </span>
      <div>
        <strong className={`block font-bold tracking-tight ${dark ? "text-slate-900" : "text-white"} ${mark === "lg" ? "text-lg" : "text-base"}`}>
          QueryMind
        </strong>
        <p className={`text-xs ${dark ? "text-slate-500" : "text-slate-400"}`}>AI database workspace</p>
      </div>
    </div>
  );
}

function Feature({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/5 px-3.5 py-3 backdrop-blur">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-500/20 text-brand-300">{icon}</span>
      <span className="text-[13px] font-semibold leading-tight text-slate-200">{label}</span>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="text-xl font-bold text-white">{value}</p>
      <p className="mt-0.5 max-w-[140px] text-xs leading-4">{label}</p>
    </div>
  );
}

function Divider() {
  return <span className="h-9 w-px bg-white/10" />;
}

function TabButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      className={`flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition ${
        active ? "bg-white text-brand-700 shadow-sm" : "text-slate-500 hover:text-slate-800"
      }`}
      onClick={onClick}
      type="button"
    >
      {icon} {label}
    </button>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <p className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
      {message}
    </p>
  );
}
