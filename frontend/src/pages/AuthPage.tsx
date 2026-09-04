import { FormEvent, useState } from "react";
import { ArrowLeft, ArrowRight, BarChart3, Clock, Database, Eye, EyeOff, Loader2, Lock, Mail, MessageSquare, ShieldCheck, Sparkles, Table2, Zap } from "lucide-react";
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
    <div className="grid min-h-screen bg-canvas text-ink lg:grid-cols-[56fr_44fr] lg:overflow-hidden lg:h-screen">
      {/* ============ LEFT — brand + product story ============ */}
      <aside
        className="relative hidden flex-col overflow-y-auto no-scrollbar border-r border-line bg-side lg:flex"
        style={{ background: "radial-gradient(900px circle at 55% 42%, rgba(47,158,151,0.07), transparent 60%)" }}
      >
        {/* faint network dots + lines */}
        <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 900 1000" preserveAspectRatio="xMidYMid slice">
          <g stroke="rgba(47,158,151,0.10)" strokeWidth="1">
            <line x1="120" y1="180" x2="420" y2="90" />
            <line x1="420" y1="90" x2="760" y2="220" />
            <line x1="120" y1="180" x2="300" y2="480" />
            <line x1="760" y1="220" x2="640" y2="520" />
            <line x1="300" y1="480" x2="640" y2="520" />
            <line x1="640" y1="520" x2="820" y2="760" />
          </g>
          <g fill="rgba(47,158,151,0.35)">
            <circle cx="120" cy="180" r="2.5" />
            <circle cx="420" cy="90" r="2" />
            <circle cx="760" cy="220" r="2.5" />
            <circle cx="300" cy="480" r="2" />
            <circle cx="640" cy="520" r="2.5" />
            <circle cx="820" cy="760" r="2" />
          </g>
        </svg>

        <div className="relative flex min-h-full flex-col gap-6 p-8 xl:gap-7 xl:p-10">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-500/15 ring-1 ring-brand-500/25">
                <LogoMark className="h-6 w-6" />
              </span>
              <span className="text-lg font-bold tracking-tight text-ink">
                Query<span className="text-brand-400">Mind</span>
              </span>
            </div>
            <p className="mt-1.5 pl-[52px] text-[13px] text-ink-faint">AI-powered database intelligence</p>
          </div>

          {/* Hero */}
          <div className="max-w-xl">
            <h1 className="text-[40px] font-bold leading-[1.12] tracking-tight text-ink xl:text-[52px]">
              Talk to your data
              <br />
              like a <span className="text-brand-400">colleague.</span>
            </h1>
            <p className="mt-3 max-w-lg text-[16px] leading-7 text-ink-soft xl:text-[17px]">
              Ask questions in plain English. QueryMind understands your schema, generates validated
              SQL, and gives you answers in seconds.
            </p>
          </div>

          {/* Feature rows */}
          <ul className="max-w-xl space-y-3.5">
            {[
              { icon: <Database size={16} />, title: "Schema-aware SQL", text: "Understands your schema and relationships" },
              { icon: <ShieldCheck size={16} />, title: "Safe & validated queries", text: "Every query is validated before execution" },
              { icon: <BarChart3 size={16} />, title: "Charts & reports built in", text: "Visualize and export in one click" }
            ].map((feature) => (
              <li className="flex items-center gap-3.5" key={feature.title}>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line bg-white/[0.04] text-brand-400">
                  {feature.icon}
                </span>
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-ink">{feature.title}</p>
                  <p className="text-[13px] text-ink-faint">{feature.text}</p>
                </div>
              </li>
            ))}
          </ul>

          {/* Workflow demo panel */}
          <div className="hidden max-w-2xl rounded-2xl border border-line bg-white/[0.02] p-3.5 shadow-[0_0_40px_rgba(47,158,151,0.05)] xl:block">
            <div className="flex items-stretch gap-3">
              <WorkflowColumn icon={<MessageSquare size={12} />} label="You ask in plain English">
                <div className="rounded-lg border border-line bg-white/[0.04] p-2.5 text-[12px] leading-5 text-ink">
                  Show me the 10 most recent orders.
                </div>
              </WorkflowColumn>
              <WorkflowArrow />
              <WorkflowColumn icon={<Sparkles size={12} />} label="QueryMind generates SQL">
                <div className="rounded-lg border border-line bg-black p-2.5 font-mono text-[10.5px] leading-5">
                  <code>
                    <span className="text-[#8fd0c9]">SELECT</span> <span className="text-ink">*</span>
                    <br />
                    <span className="text-[#8fd0c9]">FROM</span> <span className="text-ink">orders</span>
                    <br />
                    <span className="text-[#8fd0c9]">ORDER BY</span> <span className="text-ink">order_date</span>{" "}
                    <span className="text-[#8fd0c9]">DESC</span>
                    <br />
                    <span className="text-[#8fd0c9]">LIMIT</span> <span className="text-ink">10</span>;
                  </code>
                </div>
              </WorkflowColumn>
              <WorkflowArrow />
              <WorkflowColumn icon={<Table2 size={12} />} label="You get answers">
                <div className="overflow-hidden rounded-lg border border-line bg-black">
                  <table className="w-full font-mono text-[9.5px]">
                    <thead>
                      <tr className="border-b border-line text-ink-faint">
                        <th className="px-1.5 py-1 text-left font-medium">order_id</th>
                        <th className="px-1.5 py-1 text-left font-medium">cust</th>
                        <th className="px-1.5 py-1 text-left font-medium">date</th>
                        <th className="px-1.5 py-1 text-left font-medium">status</th>
                      </tr>
                    </thead>
                    <tbody className="text-ink-soft">
                      {[
                        ["10432", "203", "05-21", "Shipped"],
                        ["10431", "158", "05-21", "Delivered"],
                        ["10430", "287", "05-20", "Shipped"]
                      ].map((row) => (
                        <tr className="border-b border-line/60 last:border-0" key={row[0]}>
                          {row.map((cell, index) => (
                            <td className="px-1.5 py-1" key={index}>{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="border-t border-line px-1.5 py-1 text-[9.5px] text-ink-faint">… and 7 more rows</p>
                </div>
              </WorkflowColumn>
            </div>
          </div>

          {/* Metrics */}
          <div className="hidden max-w-2xl grid-cols-4 divide-x divide-line rounded-2xl border border-line bg-white/[0.02] sm:grid">
            {[
              { icon: <Zap size={13} />, value: "10K+", label: "Queries processed" },
              { icon: <Sparkles size={13} />, value: "99.9%", label: "Query accuracy" },
              { icon: <Clock size={13} />, value: "24/7", label: "AI assistance" },
              { icon: <ShieldCheck size={13} />, value: "Enterprise", label: "Security & audit" }
            ].map((metric) => (
              <div className="flex flex-col items-center gap-1 px-2 py-3 text-center" key={metric.label}>
                <span className="grid h-7 w-7 place-items-center rounded-full border border-line bg-white/[0.04] text-brand-400">
                  {metric.icon}
                </span>
                <strong className="text-[15px] font-bold text-ink">{metric.value}</strong>
                <span className="text-[11px] text-ink-faint">{metric.label}</span>
              </div>
            ))}
          </div>

          <p className="pt-2 mt-auto text-xs text-ink-faint">© {new Date().getFullYear()} QueryMind. All rights reserved.</p>
        </div>
      </aside>

      {/* ============ RIGHT — auth card ============ */}
      <main className="relative flex flex-col overflow-y-auto no-scrollbar px-5 py-6 sm:px-10">
        <div className="relative z-10 flex items-center justify-between">
          <span className="flex items-center gap-2.5 lg:hidden">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-500/15">
              <LogoMark className="h-5 w-5" />
            </span>
            <span className="font-display text-[15px] font-semibold tracking-tight text-ink">
              Query<span className="text-brand-400">Mind</span>
            </span>
          </span>
          <button
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] text-ink-soft transition hover:text-ink"
            onClick={onBack}
            type="button"
          >
            <ArrowLeft size={14} /> Back to website
          </button>
        </div>

        <div className="relative z-10 mx-auto flex w-full max-w-[470px] flex-1 flex-col justify-center py-8">
          <div className="rounded-2xl border border-line bg-raise/80 p-6 shadow-[0_0_60px_rgba(47,158,151,0.06)] backdrop-blur sm:p-8">
            {/* Mode switch */}
            <div className="grid grid-cols-2 gap-1 rounded-lg border border-line bg-black/40 p-1">
              <button
                className={`rounded-md py-2 text-[13px] font-medium transition ${
                  isRegister
                    ? "bg-brand-500/15 text-ink ring-1 ring-brand-500/30"
                    : "text-ink-soft hover:text-ink"
                }`}
                onClick={() => { setMode("register"); setError(""); }}
                type="button"
              >
                Register
              </button>
              <button
                className={`rounded-md py-2 text-[13px] font-medium transition ${
                  !isRegister
                    ? "bg-brand-500/15 text-ink ring-1 ring-brand-500/30"
                    : "text-ink-soft hover:text-ink"
                }`}
                onClick={() => { setMode("login"); setError(""); }}
                type="button"
              >
                Login
              </button>
            </div>

            <h1 className="mt-7 text-[26px] font-bold tracking-tight text-ink">
              {isRegister ? "Create your workspace" : "Welcome back"}
            </h1>
            <p className="mt-1 text-sm text-ink-soft">
              {isRegister ? "One workspace per team. Credentials stay encrypted." : "Sign in to your workspace."}
            </p>
            <span className="mt-4 block h-px w-12 bg-brand-500/50" />

            <form className="mt-6 space-y-4" onSubmit={submit}>
              {isRegister && (
                <label className="block">
                  <span className="label">Organization name</span>
                  <span className="relative block">
                    <BuildingIcon />
                    <input
                      autoFocus
                      className="field pl-10"
                      placeholder="Acme Analytics"
                      minLength={2}
                      required
                      value={organizationName}
                      onChange={(event) => setOrganizationName(event.target.value)}
                    />
                  </span>
                </label>
              )}

              <label className="block">
                <span className="label">Email</span>
                <span className="relative block">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" size={15} />
                  <input
                    autoComplete="email"
                    autoFocus={!isRegister}
                    className="field pl-10"
                    placeholder="you@company.com"
                    required
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </span>
              </label>

              <label className="block">
                <span className="label">Password</span>
                <span className="relative block">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" size={15} />
                  <input
                    aria-describedby={error ? "auth-error" : undefined}
                    aria-invalid={Boolean(error) || undefined}
                    autoComplete={isRegister ? "new-password" : "current-password"}
                    className="field pl-10 pr-11"
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

              <button
                className="focus-ring inline-flex h-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-brand-500 text-[15px] font-semibold text-white shadow-[0_0_24px_rgba(47,158,151,0.25)] transition hover:bg-brand-400 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-ink-faint disabled:shadow-none"
                disabled={busy}
                type="submit"
              >
                {busy ? <Loader2 className="animate-spin" size={16} /> : null}
                {isRegister ? "Create workspace" : "Enter workspace"}
                {!busy && <ArrowRight size={15} />}
              </button>
            </form>

            <p className="mt-6 text-center text-[13px] leading-5 text-ink-faint">
              {isRegister
                ? <>Free while in beta — your data stays in <span className="text-brand-400">your databases</span>.</>
                : <>Team member? Use the email from your <span className="text-brand-400">workspace invitation</span>.</>}
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

function WorkflowColumn({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-ink-faint">
        <span className="text-brand-400">{icon}</span> {label}
      </p>
      {children}
    </div>
  );
}

function WorkflowArrow() {
  return (
    <div className="flex shrink-0 items-center justify-center self-center pt-5 text-brand-400/60">
      <ArrowRight size={14} />
    </div>
  );
}

function BuildingIcon() {
  return (
    <svg className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" fill="none" height="15" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="15">
      <rect height="18" rx="2" width="16" x="4" y="2" />
      <path d="M9 22v-4h6v4" />
      <path d="M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01" />
    </svg>
  );
}
