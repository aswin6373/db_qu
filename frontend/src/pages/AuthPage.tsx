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
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      {/* Header */}
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 w-full max-w-md items-center justify-between px-5 sm:max-w-lg">
          <button
            className="flex items-center gap-2.5 transition hover:opacity-90"
            onClick={onBack}
            type="button"
          >
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-500/15">
              <LogoMark className="h-5 w-5" />
            </span>
            <span className="font-display text-[15px] font-semibold tracking-tight text-ink">QueryMind</span>
          </button>

          <button
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-ink-soft transition hover:bg-white/5 hover:text-ink"
            onClick={onBack}
            type="button"
          >
            <ArrowLeft size={14} /> Back
          </button>
        </div>
      </header>

      {/* Centered card */}
      <main className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-md animate-fade-up">
          <div className="mb-7 text-center">
            <h1 className="font-display text-[26px] font-semibold tracking-tight text-ink">
              {mode === "register" ? "Create your workspace" : "Welcome back"}
            </h1>
            <p className="mt-1.5 text-sm leading-6 text-ink-soft">
              {mode === "register"
                ? "One workspace per team. Credentials stay encrypted."
                : "Enter your workspace email and password."}
            </p>
          </div>

          <div className="card p-6 sm:p-7">
            <div className="mb-5 grid grid-cols-2 gap-1 rounded-lg border border-line bg-white/[0.03] p-1">
              <TabButton active={mode === "register"} icon={<UserPlus size={14} />} label="Register" onClick={() => { setMode("register"); setError(""); }} />
              <TabButton active={mode === "login"} icon={<LogIn size={14} />} label="Login" onClick={() => { setMode("login"); setError(""); }} />
            </div>

            <form className="space-y-4" onSubmit={submit}>
              {mode === "register" ? (
                <label className="block">
                  <span className="label">Organization name</span>
                  <input
                    autoFocus
                    className="field"
                    placeholder="Acme Analytics"
                    minLength={2}
                    required
                    value={organizationName}
                    onChange={(event) => setOrganizationName(event.target.value)}
                  />
                </label>
              ) : null}

              <label className="block">
                <span className="label">Email</span>
                <input
                  autoComplete="email"
                  autoFocus={mode === "login"}
                  className="field"
                  placeholder="you@company.com"
                  required
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>

              <label className="block">
                <span className="label">Password</span>
                <input
                  aria-describedby={error ? "auth-error" : undefined}
                  aria-invalid={Boolean(error) || undefined}
                  autoComplete={mode === "register" ? "new-password" : "current-password"}
                  className="field"
                  minLength={mode === "register" ? 8 : undefined}
                  placeholder={mode === "register" ? "Minimum 8 characters" : "Your password"}
                  required
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>

              {mode === "login" && (
                <div className="flex items-start gap-2.5 rounded-lg border border-line bg-white/[0.03] p-3 text-xs leading-5 text-ink-soft">
                  <ShieldCheck className="mt-0.5 shrink-0 text-brand-400" size={14} />
                  <span>Team member? Use the email where you received your workspace invitation.</span>
                </div>
              )}

              {error && (
                <p className="rounded-lg border border-rose-500/25 bg-rose-500/10 px-3.5 py-2.5 text-sm text-rose-300" id="auth-error" role="alert">
                  {error}
                </p>
              )}

              <button className="btn-primary w-full !h-10 !mt-1" disabled={busy} type="submit">
                {busy ? <Loader2 className="animate-spin" size={16} /> : mode === "register" ? <UserPlus size={16} /> : <LogIn size={16} />}
                {mode === "register" ? "Create workspace" : "Enter workspace"}
              </button>
            </form>
          </div>

          <p className="mt-5 text-center text-xs leading-5 text-ink-faint">
            Free while in beta · No credit card required · Your data stays in your databases
          </p>
        </div>
      </main>
    </div>
  );
}

function TabButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      className={`flex items-center justify-center gap-1.5 rounded-md py-1.5 text-[13px] font-medium transition ${
        active ? "bg-white/10 text-ink" : "text-ink-soft hover:text-ink"
      }`}
      onClick={onClick}
      type="button"
    >
      {icon} {label}
    </button>
  );
}
