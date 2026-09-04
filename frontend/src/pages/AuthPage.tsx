import { FormEvent, useState } from "react";
import { ArrowLeft, Eye, EyeOff, Loader2 } from "lucide-react";
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
          <h1 className="text-center font-display text-[26px] font-semibold tracking-tight text-ink">
            {isRegister ? "Create your workspace" : "Welcome back"}
          </h1>

          <div className="card mt-6 p-6 sm:p-7">
            {/* Mode switch */}
            <div className="mb-5 grid grid-cols-2 gap-1 rounded-lg border border-line bg-white/[0.03] p-1">
              <button
                className={`rounded-md py-1.5 text-[13px] font-medium transition ${
                  isRegister ? "bg-white/10 text-ink" : "text-ink-soft hover:text-ink"
                }`}
                onClick={() => { setMode("register"); setError(""); }}
                type="button"
              >
                Register
              </button>
              <button
                className={`rounded-md py-1.5 text-[13px] font-medium transition ${
                  !isRegister ? "bg-white/10 text-ink" : "text-ink-soft hover:text-ink"
                }`}
                onClick={() => { setMode("login"); setError(""); }}
                type="button"
              >
                Login
              </button>
            </div>

            <form className="space-y-4" onSubmit={submit}>
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

              <button className="btn-primary w-full" disabled={busy} type="submit">
                {busy && <Loader2 className="animate-spin" size={16} />}
                {isRegister ? "Create workspace" : "Enter workspace"}
              </button>
            </form>
          </div>

          <p className="mt-4 text-center text-[13px] text-ink-faint">
            {isRegister ? "Free while in beta — your data stays in your databases." : "Team member? Use the email from your workspace invitation."}
          </p>
        </div>
      </main>
    </div>
  );
}
