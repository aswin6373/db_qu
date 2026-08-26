import { FormEvent, useEffect, useState } from "react";
import { ArrowRight, Database, Github, Loader2, LogIn, ShieldCheck, Sparkles, UserPlus } from "lucide-react";
import { apiRequest } from "../lib/api";
import { LogoMark } from "./LogoMark";

type Props = {
  onToken: (token: string, options?: { onboard?: boolean; organizationName?: string }) => void;
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
    <div className="min-h-screen bg-cream text-navy">
      {/* Navbar */}
      <header className="sticky top-0 z-30 border-b border-navy/5 bg-cream/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
          <a className="flex items-center gap-2.5" href="#top">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-navy shadow-card">
              <LogoMark className="h-6 w-6" />
            </span>
            <span className="text-lg font-extrabold tracking-tight text-navy">QueryMind</span>
          </a>
          <nav className="hidden items-center gap-8 text-[15px] font-medium text-navy-soft md:flex">
            <a className="transition hover:text-navy" href="#features">Why QueryMind</a>
            <a className="transition hover:text-navy" href="#how">How it works</a>
            <a className="transition hover:text-navy" href="#security">Security</a>
          </nav>
          <a
            className="hidden items-center gap-2 rounded-xl border border-navy/15 bg-white px-4 py-2 text-sm font-semibold text-navy shadow-sm transition hover:-translate-y-0.5 hover:shadow sm:inline-flex"
            href="#get-started"
          >
            <Github size={16} /> Star us
            <span className="rounded-md bg-teal-soft px-1.5 py-0.5 text-xs font-bold text-teal-dark">beta</span>
          </a>
        </div>
      </header>

      <main className="relative overflow-hidden" id="top">
        {/* Dot grid + glows */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: "radial-gradient(circle, rgba(22,50,79,0.10) 1px, transparent 1px)",
            backgroundSize: "26px 26px"
          }}
        />
        <div className="pointer-events-none absolute -left-32 top-24 h-80 w-80 rounded-[3rem] border border-rose-200/70 bg-white/40 backdrop-blur-sm" style={{ transform: "rotate(12deg)" }} />
        <div className="pointer-events-none absolute -right-24 top-40 h-72 w-72 animate-float-slow rounded-[3rem] border border-teal-200/70 bg-white/40 backdrop-blur-sm" style={{ transform: "rotate(-10deg)" }} />
        <div className="pointer-events-none absolute -left-16 bottom-10 h-64 w-64 animate-float rounded-[2.5rem] border border-amber-200/70 bg-white/30 backdrop-blur-sm" style={{ transform: "rotate(8deg)" }} />

        <div className="relative mx-auto grid max-w-7xl gap-12 px-5 pb-20 pt-14 sm:px-8 lg:grid-cols-[1.15fr_0.85fr] lg:gap-8 lg:pt-20" id="get-started">
          {/* Hero */}
          <section className="animate-fade-up text-center lg:pt-8 lg:text-left">
            <p className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-soft px-3.5 py-1.5 text-[13px] font-semibold text-teal-dark">
              <Sparkles size={14} /> Now in public beta
            </p>
            <h1 className="mt-6 text-[2.7rem] font-extrabold leading-[1.08] tracking-tight text-navy sm:text-6xl xl:text-[4.4rem]">
              The <TypewriterWord /> SQL Agent
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-lg font-medium text-navy-soft lg:mx-0">
              Natural language <Dot /> Validated SQL <Dot /> Guarded writes <Dot /> Schema-aware
            </p>
            <p className="mx-auto mt-3 max-w-xl text-[15px] leading-7 text-navy-soft/80 lg:mx-0">
              Let your team query the company database in plain English — every statement reviewed, every write
              confirmed before it runs.
            </p>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
              <a className="btn-landing-primary" href="#auth-card">
                Create workspace <ArrowRight size={16} />
              </a>
              <a className="btn-landing-outline" href="#how">
                See how it works
              </a>
            </div>

            {/* Social proof */}
            <div className="mt-12">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-navy-soft/50">
                Works with the databases you already run
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 lg:justify-start">
                {["MySQL", "PostgreSQL", "MariaDB", "TiDB", "PlanetScale", "Amazon RDS"].map((name) => (
                  <span className="text-[15px] font-bold tracking-tight text-navy/35 transition hover:text-navy/60" key={name}>
                    {name}
                  </span>
                ))}
              </div>
            </div>

            {/* Feature strip */}
            <div className="mt-12 grid gap-3 sm:grid-cols-3" id="features">
              <LandingFeature icon={<ShieldCheck size={17} />} title="Validated SQL" text="Every statement parsed and checked against your live schema." />
              <LandingFeature icon={<Database size={17} />} title="Encrypted credentials" text="Passwords sealed with Fernet encryption before storage." />
              <LandingFeature icon={<Sparkles size={17} />} title="Confirm-before-write" text="INSERT, UPDATE, DELETE wait for your explicit approval." />
            </div>
          </section>

          {/* Auth card */}
          <section id="auth-card" className="scroll-mt-24">
            <div className="mx-auto w-full max-w-md animate-fade-up rounded-2xl border border-navy/10 bg-white p-7 shadow-[0_24px_60px_-20px_rgba(22,50,79,0.25)] sm:p-8">
              <p className="eyebrow text-teal">{mode === "register" ? "Get started" : "Welcome back"}</p>
              <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-navy">
                {mode === "register" ? "Create your workspace" : "Sign in to QueryMind"}
              </h2>
              <p className="mt-1.5 text-sm leading-6 text-navy-soft/80">
                {mode === "register"
                  ? "One workspace per team. Credentials stay encrypted."
                  : "Secure access to your QueryMind platform."}
              </p>

              <div className="mt-6 grid grid-cols-2 gap-1 rounded-xl border border-navy/10 bg-cream p-1">
                <TabButton active={mode === "register"} icon={<UserPlus size={15} />} label="Register" onClick={() => setMode("register")} />
                <TabButton active={mode === "login"} icon={<LogIn size={15} />} label="Login" onClick={() => setMode("login")} />
              </div>

              <form className="mt-6 space-y-4" onSubmit={submit}>
                {mode === "register" && (
                  <label className="block">
                    <span className="label text-navy-soft">Organization</span>
                    <input
                      className="field border-navy/15 focus-visible:ring-teal/30"
                      placeholder="Acme Analytics"
                      minLength={2}
                      required
                      value={organizationName}
                      onChange={(event) => setOrganizationName(event.target.value)}
                    />
                  </label>
                )}
                <label className="block">
                  <span className="label text-navy-soft">Email</span>
                  <input
                    autoComplete="email"
                    className="field border-navy/15 focus-visible:ring-teal/30"
                    placeholder="you@company.com"
                    required
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="label text-navy-soft">Password</span>
                  <input
                    aria-describedby={error ? "auth-error" : undefined}
                    aria-invalid={Boolean(error) || undefined}
                    autoComplete={mode === "register" ? "new-password" : "current-password"}
                    className="field border-navy/15 focus-visible:ring-teal/30"
                    minLength={mode === "register" ? 8 : undefined}
                    placeholder={mode === "register" ? "Minimum 8 characters" : "Your password"}
                    required
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </label>
                {error && (
                  <p className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700" id="auth-error" role="alert">{error}</p>
                )}
                <button className="btn-landing-primary w-full" disabled={busy} type="submit">
                  {busy ? <Loader2 className="animate-spin" size={17} /> : mode === "register" ? <UserPlus size={17} /> : <LogIn size={17} />}
                  {mode === "register" ? "Create workspace" : "Enter workspace"}
                </button>
              </form>

              <p className="mt-5 border-t border-navy/5 pt-4 text-center text-xs leading-5 text-navy-soft/60">
                Free while in beta · No credit card required · Your data stays in your databases
              </p>
            </div>
          </section>
        </div>

        {/* How it works */}
        <section className="relative border-t border-navy/5 bg-white/50 px-5 py-16 backdrop-blur-sm sm:px-8" id="how">
          <div className="mx-auto max-w-6xl">
            <h2 className="text-center text-3xl font-extrabold tracking-tight text-navy sm:text-4xl">
              From question to safe query in seconds
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-center text-[15px] text-navy-soft">
              Three steps, zero risk. QueryMind never runs a write without your sign-off.
            </p>
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {[
                { step: "01", title: "Connect", text: "Add your MySQL or PostgreSQL host and credentials. We test the connection and map your full schema." },
                { step: "02", title: "Ask", text: "Type what you want to know. The AI writes one precise SQL statement for your schema." },
                { step: "03", title: "Review & run", text: "Reads execute instantly. Writes pause for your confirmation — always." }
              ].map((item) => (
                <div className="card-landing p-6" key={item.step}>
                  <span className="font-mono text-sm font-bold text-teal">{item.step}</span>
                  <h3 className="mt-2 text-lg font-bold text-navy">{item.title}</h3>
                  <p className="mt-1.5 text-sm leading-6 text-navy-soft">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Security */}
        <section className="relative px-5 py-16 sm:px-8" id="security">
          <div className="mx-auto max-w-6xl rounded-3xl border border-navy/10 bg-navy px-6 py-12 text-center sm:px-12">
            <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
              Built for production databases
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-[15px] leading-7 text-slate-300">
              Schema and admin operations like DROP, ALTER, and TRUNCATE are blocked at the engine level. Credentials
              are encrypted at rest. Every query is logged for your audit trail.
            </p>
            <div className="mx-auto mt-8 flex max-w-2xl flex-wrap items-center justify-center gap-3">
              {["SQL injection guarded", "Multi-statement blocked", "Org-level isolation", "Fernet encryption", "Full audit log"].map((chip) => (
                <span className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-slate-200" key={chip}>
                  {chip}
                </span>
              ))}
            </div>
            <a className="btn-landing-primary mt-10 inline-flex" href="#get-started">
              Start free <ArrowRight size={16} />
            </a>
          </div>
        </section>

        <footer className="relative border-t border-navy/5 px-5 py-8 text-center text-sm text-navy-soft/60 sm:px-8">
          © {new Date().getFullYear()} QueryMind — AI database operations workspace
        </footer>
      </main>
    </div>
  );
}

function Dot() {
  return <span className="mx-2 inline-block h-1.5 w-1.5 rounded-full bg-teal align-middle" />;
}

function TabButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      className={`flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold transition ${
        active ? "bg-navy text-white shadow-sm" : "text-navy-soft hover:text-navy"
      }`}
      onClick={onClick}
      type="button"
    >
      {icon} {label}
    </button>
  );
}

function LandingFeature({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="card-landing text-left">
      <span className="grid h-9 w-9 place-items-center rounded-lg bg-teal-soft text-teal-dark">{icon}</span>
      <h3 className="mt-3 text-[15px] font-bold text-navy">{title}</h3>
      <p className="mt-1 text-[13px] leading-5 text-navy-soft">{text}</p>
    </div>
  );
}

const TYPEWRITER_WORDS = ["smartest", "safest", "fastest", "easiest"];

function TypewriterWord() {
  const [wordIndex, setWordIndex] = useState(0);
  const [text, setText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const word = TYPEWRITER_WORDS[wordIndex % TYPEWRITER_WORDS.length];
    let delay: number;
    if (isDeleting) {
      if (text.length === 0) {
        setWordIndex((index) => (index + 1) % TYPEWRITER_WORDS.length);
        setIsDeleting(false);
        return;
      }
      delay = 45;
    } else if (text.length === word.length) {
      delay = 1900;
    } else {
      delay = 90;
    }
    const timeout = window.setTimeout(() => {
      setText(isDeleting ? word.slice(0, text.length - 1) : word.slice(0, text.length + 1));
      if (text.length === word.length) setIsDeleting(true);
    }, delay);
    return () => window.clearTimeout(timeout);
  }, [text, isDeleting, wordIndex]);

  return (
    <span className="relative inline-block text-teal">
      {text}
      <span className="ml-0.5 inline-block h-[0.85em] w-[3px] animate-caret bg-teal align-[-0.08em]" />
    </span>
  );
}
