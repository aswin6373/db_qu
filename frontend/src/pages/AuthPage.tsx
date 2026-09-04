import { FormEvent, useState } from "react";
import { ArrowLeft, Loader2, LogIn, ShieldCheck, UserPlus } from "lucide-react";
import { apiRequest } from "../lib/api";
import { LogoMark } from "../components/LogoMark";

type Props = {
  initialMode?: "login" | "register";
  onBack: () => void;
  onToken: (token: string, options?: { onboard?: boolean; organizationName?: string }) => void;
};

export function AuthPage({ initialMode = "register", onBack, onToken }: Props) {
  const [mode, setMode] = useState<"login" | "register">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    // The 8-character rule is a registration policy — legacy accounts with
    // shorter passwords must still be able to sign in.
    if (mode === "register" && password.length < 8) {
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
      onToken(data.access_token, mode === "register" ? { onboard: true, organizationName } : undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative min-h-screen bg-canvas text-ink flex flex-col justify-between">
      {/* Background decorations */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
          backgroundSize: "26px 26px"
        }}
      />
      <div className="pointer-events-none absolute -left-32 top-24 hidden h-80 w-80 rounded-[3rem] border border-white/10 bg-surface/[0.04] sm:block" style={{ transform: "rotate(12deg)" }} />
      <div className="pointer-events-none absolute -right-24 top-40 hidden h-72 w-72 animate-float-slow rounded-[3rem] border border-brand-500/20 bg-brand-500/[0.05] sm:block" style={{ transform: "rotate(-10deg)" }} />
      <div className="pointer-events-none absolute -left-16 bottom-10 hidden h-64 w-64 animate-float rounded-[2.5rem] border border-white/10 bg-surface/[0.03] sm:block" style={{ transform: "rotate(8deg)" }} />

      {/* Top Header */}
      <header className="relative z-10 border-b border-line bg-canvas/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
          <button
            className="flex items-center gap-2.5 transition hover:opacity-90"
            onClick={onBack}
            type="button"
          >
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 ring-1 ring-line">
              <LogoMark className="h-6 w-6" />
            </span>
            <span className="text-lg font-extrabold tracking-tight text-ink">QueryMind</span>
          </button>

          <button
            className="flex items-center gap-2 rounded-xl border border-line-strong bg-surface px-3.5 py-1.5 text-xs sm:text-sm font-semibold text-ink shadow-sm transition hover:-translate-y-0.5 hover:shadow"
            onClick={onBack}
            type="button"
          >
            <ArrowLeft size={15} /> Back to website
          </button>
        </div>
      </header>

      {/* Centered Auth Box */}
      <main className="relative z-10 flex flex-1 items-center justify-center px-4 py-8 sm:px-6">
        <div className="w-full max-w-md animate-fade-up rounded-2xl border border-line bg-surface p-6 sm:p-8 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.55)]">
          <div className="text-center sm:text-left">
            <p className="eyebrow text-brand-400">{mode === "register" ? "Get started" : "Welcome back"}</p>
            <h1 className="mt-1 text-2xl sm:text-3xl font-extrabold tracking-tight text-ink">
              {mode === "register" ? "Create your workspace" : "Sign in to QueryMind"}
            </h1>
            <p className="mt-1.5 text-sm leading-6 text-ink-soft">
              {mode === "register"
                ? "One workspace per team. Credentials stay encrypted."
                : "Enter your workspace email and password."}
            </p>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-1 rounded-xl border border-line bg-canvas p-1">
            <TabButton active={mode === "register"} icon={<UserPlus size={15} />} label="Register" onClick={() => { setMode("register"); setError(""); }} />
            <TabButton active={mode === "login"} icon={<LogIn size={15} />} label="Login" onClick={() => { setMode("login"); setError(""); }} />
          </div>

          <form className="mt-6 space-y-4" onSubmit={submit}>
            {mode === "register" ? (
              <label className="block">
                <span className="label text-ink-soft">Organization Name</span>
                <input
                  autoFocus
                  className="field border-line-strong focus-visible:ring-brand-400/30"
                  placeholder="Acme Analytics"
                  minLength={2}
                  required
                  value={organizationName}
                  onChange={(event) => setOrganizationName(event.target.value)}
                />
              </label>
            ) : null}

            <label className="block">
              <span className="label text-ink-soft">Email</span>
              <input
                autoComplete="email"
                autoFocus={mode === "login"}
                className="field border-line-strong focus-visible:ring-brand-400/30"
                placeholder="you@company.com"
                required
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>

            <label className="block">
              <span className="label text-ink-soft">Password</span>
              <input
                aria-describedby={error ? "auth-error" : undefined}
                aria-invalid={Boolean(error) || undefined}
                autoComplete={mode === "register" ? "new-password" : "current-password"}
                className="field border-line-strong focus-visible:ring-brand-400/30"
                minLength={mode === "register" ? 8 : undefined}
                placeholder={mode === "register" ? "Minimum 8 characters" : "Your password"}
                required
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>

            {mode === "login" && (
              <div className="flex items-start gap-2.5 rounded-xl border border-line bg-canvas/70 p-3 text-xs leading-5 text-ink-soft">
                <ShieldCheck className="mt-0.5 shrink-0 text-brand-400" size={15} />
                <span>Team member? Use the email where you received your workspace invitation.</span>
              </div>
            )}

            {error && (
              <p className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-3.5 py-2.5 text-sm text-rose-300" id="auth-error" role="alert">{error}</p>
            )}

            <button className="btn-landing-primary w-full !h-11 !mt-5" disabled={busy} type="submit">
              {busy ? <Loader2 className="animate-spin" size={17} /> : mode === "register" ? <UserPlus size={17} /> : <LogIn size={17} />}
              {mode === "register" ? "Create workspace" : "Enter workspace"}
            </button>
          </form>

          <p className="mt-6 border-t border-line pt-4 text-center text-xs leading-5 text-ink-faint">
            Free while in beta · No credit card required · Your data stays in your databases
          </p>
        </div>
      </main>

      <footer className="relative z-10 border-t border-line px-5 py-6 text-center text-xs text-ink-faint">
        © {new Date().getFullYear()} QueryMind — AI database operations workspace
      </footer>
    </div>
  );
}

function TabButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      className={`flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold transition ${
        active ? "bg-white/10 text-ink shadow-sm" : "text-ink-soft hover:text-ink"
      }`}
      onClick={onClick}
      type="button"
    >
      {icon} {label}
    </button>
  );
}
