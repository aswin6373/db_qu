import { FormEvent, useState } from "react";
import { ArrowLeft, Check, Eye, EyeOff, Loader2 } from "lucide-react";
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
  const [showPassword, setShowPassword] = useState(false);

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

  const isRegister = mode === "register";

  return (
    <div className="grid min-h-screen bg-canvas text-ink lg:grid-cols-[1.05fr_1fr]">
      {/* Brand pane */}
      <aside
        className="relative hidden flex-col justify-between border-r border-line bg-side p-10 lg:flex"
        style={{ background: "radial-gradient(720px circle at 18% 12%, rgba(47,158,151,0.10), transparent 55%)" }}
      >
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-500/15">
            <LogoMark className="h-5 w-5" />
          </span>
          <span className="font-display text-[16px] font-semibold tracking-tight text-ink">QueryMind</span>
        </div>

        <div className="max-w-md">
          <h2 className="font-display text-4xl font-semibold leading-[1.15] tracking-tight text-ink">
            Talk to your data
            <br />
            like a colleague.
          </h2>
          <p className="mt-4 text-[15px] leading-7 text-ink-soft">
            Ask in plain English. QueryMind writes validated SQL against your live schema and
            pauses before every write.
          </p>
          <ul className="mt-8 space-y-3">
            {[
              "Validated, schema-aware SQL on every question",
              "Guarded writes with a complete audit log",
              "WhatsApp, charts, and PDF reports built in"
            ].map((point) => (
              <li className="flex items-center gap-2.5 text-sm text-ink" key={point}>
                <Check className="shrink-0 text-brand-400" size={15} /> {point}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-ink-faint">© {new Date().getFullYear()} QueryMind</p>
      </aside>

      {/* Form pane */}
      <main className="relative flex flex-col px-5 py-6 sm:px-10">
        <div className="flex items-center justify-between lg:justify-end">
          <span className="flex items-center gap-2.5 lg:hidden">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-500/15">
              <LogoMark className="h-5 w-5" />
            </span>
            <span className="font-display text-[15px] font-semibold tracking-tight text-ink">QueryMind</span>
          </span>
          <button
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-ink-soft transition hover:bg-white/5 hover:text-ink"
            onClick={onBack}
            type="button"
          >
            <ArrowLeft size={14} /> Back to website
          </button>
        </div>

        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          {/* Mode switch */}
          <div className="grid grid-cols-2 gap-1 rounded-lg border border-line bg-white/[0.03] p-1">
            <button
              className={`rounded-md py-2 text-[13px] font-medium transition ${
                isRegister ? "bg-white/10 text-ink" : "text-ink-soft hover:text-ink"
              }`}
              onClick={() => { setMode("register"); setError(""); }}
              type="button"
            >
              Register
            </button>
            <button
              className={`rounded-md py-2 text-[13px] font-medium transition ${
                !isRegister ? "bg-white/10 text-ink" : "text-ink-soft hover:text-ink"
              }`}
              onClick={() => { setMode("login"); setError(""); }}
              type="button"
            >
              Login
            </button>
          </div>

          <h1 className="mt-8 font-display text-[26px] font-semibold tracking-tight text-ink">
            {isRegister ? "Create your workspace" : "Welcome back"}
          </h1>
          <p className="mt-1.5 text-sm text-ink-soft">
            {isRegister ? "One workspace per team. Credentials stay encrypted." : "Sign in to your workspace."}
          </p>

          <form className="mt-7 space-y-4" onSubmit={submit}>
            {isRegister && (
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
            )}

            <label className="block">
              <span className="label">Email</span>
              <input
                autoComplete="email"
                autoFocus={!isRegister}
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
              <span className="relative block">
                <input
                  aria-describedby={error ? "auth-error" : undefined}
                  aria-invalid={Boolean(error) || undefined}
                  autoComplete={isRegister ? "new-password" : "current-password"}
                  className="field pr-11"
                  minLength={isRegister ? 8 : undefined}
                  placeholder={isRegister ? "Minimum 8 characters" : "Your password"}
                  required
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
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

            {error && (
              <p className="rounded-lg border border-rose-500/25 bg-rose-500/10 px-3.5 py-2.5 text-sm text-rose-300" id="auth-error" role="alert">
                {error}
              </p>
            )}

            <button className="btn-primary !mt-6 w-full" disabled={busy} type="submit">
              {busy && <Loader2 className="animate-spin" size={16} />}
              {isRegister ? "Create workspace" : "Enter workspace"}
            </button>
          </form>

          <p className="mt-6 text-center text-[13px] text-ink-faint">
            {isRegister
              ? "Free while in beta — your data stays in your databases."
              : "Team member? Use the email from your workspace invitation."}
          </p>
        </div>
      </main>
    </div>
  );
}
