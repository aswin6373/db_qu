import { useEffect, useState } from "react";
import { ArrowRight, BarChart3, Check, Database, FileText, Github, LogIn, MessageCircle, ShieldCheck, Sparkles, UserPlus } from "lucide-react";
import { LogoMark } from "../components/LogoMark";

type Props = {
  onNavigateAuth: (mode: "login" | "register") => void;
};

export function LandingPage({ onNavigateAuth }: Props) {
  return (
    <div className="min-h-screen bg-canvas text-ink">
      {/* Navbar */}
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
          <a className="flex items-center gap-2.5" href="#top">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 ring-1 ring-line">
              <LogoMark className="h-6 w-6" />
            </span>
            <span className="text-lg font-extrabold tracking-tight text-ink">QueryMind</span>
          </a>

          <nav className="hidden items-center gap-8 text-[15px] font-medium text-ink-soft md:flex">
            <a className="transition hover:text-ink" href="#features">Why QueryMind</a>
            <a className="transition hover:text-ink" href="#how">How it works</a>
            <a className="transition hover:text-ink" href="#security">Security</a>
          </nav>

          <div className="flex items-center gap-3">
            <a
              className="hidden items-center gap-2 rounded-xl border border-line-strong bg-surface px-3.5 py-1.5 text-sm font-semibold text-ink shadow-sm transition hover:-translate-y-0.5 hover:shadow sm:inline-flex"
              href="https://github.com/aswin6373/db_qu"
              rel="noreferrer"
              target="_blank"
            >
              <Github size={15} /> Star us
              <span className="rounded-md bg-brand-500/15 px-1.5 py-0.5 text-xs font-bold text-brand-300">beta</span>
            </a>
            <button
              className="inline-flex items-center gap-2 rounded-xl border border-line-strong bg-surface px-3.5 py-1.5 text-sm font-semibold text-ink shadow-sm transition hover:-translate-y-0.5 hover:shadow"
              onClick={() => onNavigateAuth("login")}
              type="button"
            >
              Sign in
            </button>
          </div>
        </div>
      </header>

      <main className="relative overflow-hidden" id="top">
        {/* Dot grid + decorative elements */}
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

        {/* Hero */}
        <div className="relative mx-auto max-w-5xl px-5 pb-16 pt-10 text-center sm:px-8 sm:pb-20 sm:pt-16 lg:pt-20">
          <p className="inline-flex items-center gap-2 rounded-full border border-brand-500-200 bg-brand-500/15 px-3.5 py-1.5 text-[13px] font-semibold text-brand-300">
            <Sparkles size={14} /> Now in public beta
          </p>
          <h1 className="mt-5 text-4xl font-extrabold leading-[1.08] tracking-tight text-ink sm:text-6xl lg:text-7xl">
            The <TypewriterWord /> SQL Agent
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg font-medium text-ink-soft sm:text-xl">
            Natural language <Dot /> Validated SQL <Dot /> Guarded writes <Dot /> WhatsApp <Dot /> AI charts
          </p>
          <p className="mx-auto mt-3 max-w-2xl text-base leading-7 text-ink-soft sm:text-lg">
            Let your team query the company database in plain English — every statement reviewed, every write
            confirmed before it runs.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3.5">
            <button
              className="btn-landing-primary"
              onClick={() => onNavigateAuth("register")}
              type="button"
            >
              Create workspace <ArrowRight size={16} />
            </button>
            <a className="btn-landing-outline" href="#how">
              See how it works
            </a>
          </div>

          {/* Social proof */}
          <div className="mt-12 border-t border-line pt-8">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-faint">
              Works with the databases you already run
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
              {["MySQL", "PostgreSQL", "MariaDB", "TiDB", "PlanetScale", "Amazon RDS"].map((name) => (
                <span className="text-[15px] font-bold tracking-tight text-ink/35 transition hover:text-ink/60" key={name}>
                  {name}
                </span>
              ))}
            </div>
          </div>

          {/* Feature strip */}
          <div className="mt-12 sm:mt-16 grid gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3" id="features">
            <LandingFeature icon={<ShieldCheck size={18} />} title="Validated SQL" text="Every statement parsed and checked against your live schema before it runs." />
            <LandingFeature icon={<MessageCircle size={18} />} title="WhatsApp built in" text="Pair your WhatsApp and ask from your phone — answers and charts come back as images." />
            <LandingFeature icon={<BarChart3 size={18} />} title="AI-chosen charts" text="Ask for a trend or a total — QueryMind picks the right visualization automatically." />
            <LandingFeature icon={<FileText size={18} />} title="PDF reports" text="Export any answer as a polished PDF report your team can share." />
            <LandingFeature icon={<Database size={18} />} title="Encrypted credentials" text="Passwords sealed with Fernet encryption before storage." />
            <LandingFeature icon={<Sparkles size={18} />} title="Confirm-before-write" text="INSERT, UPDATE, DELETE wait for your explicit approval — always." />
          </div>
        </div>

        {/* How it works */}
        <section className="relative border-t border-line bg-surface/60 px-5 py-12 sm:py-16 sm:px-8" id="how">
          <div className="mx-auto max-w-6xl">
            <h2 className="text-center text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
              From question to safe query in seconds
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-center text-[15px] text-ink-soft">
              Three steps, zero risk. QueryMind never runs a write without your sign-off.
            </p>
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {[
                { step: "01", title: "Connect", text: "Add your MySQL or PostgreSQL host and credentials. We test the connection and map your full schema." },
                { step: "02", title: "Ask", text: "Type what you want to know. The AI writes one precise SQL statement for your schema." },
                { step: "03", title: "Review & run", text: "Reads execute instantly. Writes pause for your confirmation — and every change lands in the audit log." }
              ].map((item) => (
                <div className="card-landing p-6" key={item.step}>
                  <span className="font-mono text-sm font-bold text-brand-400">{item.step}</span>
                  <h3 className="mt-2 text-lg font-bold text-ink">{item.title}</h3>
                  <p className="mt-1.5 text-sm leading-6 text-ink-soft">{item.text}</p>
                </div>
              ))}
            </div>

            {/* Product demo video */}
            <div className="mx-auto mt-14 max-w-3xl">
              <p className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-brand-400">See it in action</p>
              <h3 className="mt-2 text-center text-xl font-bold tracking-tight text-ink sm:text-2xl">
                QueryMind running on a real database
              </h3>
              <div className="mt-6 overflow-hidden rounded-2xl border border-line bg-black/40 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.6)]">
                <video
                  className="aspect-video w-full"
                  controls
                  playsInline
                  poster="/demo-poster.jpg"
                  preload="metadata"
                  src="/demo.mp4"
                />
              </div>
              <p className="mt-3 text-center text-xs text-ink-faint">
                A quick walkthrough — connect a database, ask in plain English, run validated SQL.
              </p>
            </div>
          </div>
        </section>

        {/* Security */}
        <section className="relative px-5 py-16 sm:px-8" id="security">
          <div className="mx-auto max-w-6xl rounded-3xl border border-line bg-raise px-6 py-12 text-center sm:px-12">
            <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
              Built for production databases
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-[15px] leading-7 text-ink-soft">
              Schema and admin operations like DROP, ALTER, and TRUNCATE are blocked at the engine level. Credentials
              are encrypted at rest. Every query is logged for your audit trail.
            </p>
            <div className="mx-auto mt-8 flex max-w-2xl flex-wrap items-center justify-center gap-3">
              {["SQL injection guarded", "Multi-statement blocked", "DROP & ALTER blocked", "Org-level isolation", "Fernet encryption", "Full audit log", "WhatsApp device pairing"].map((chip) => (
                <span className="rounded-full border border-white/15 bg-surface/5 px-4 py-2 text-sm font-medium text-ink" key={chip}>
                  {chip}
                </span>
              ))}
            </div>
            <button
              className="btn-landing-primary mt-10 inline-flex"
              onClick={() => onNavigateAuth("register")}
              type="button"
            >
              Start free <ArrowRight size={16} />
            </button>
          </div>
        </section>

        {/* Talk to your data */}
        <section className="relative px-5 pb-20 sm:px-8">
          <div className="mx-auto grid max-w-5xl items-center gap-10 lg:grid-cols-[0.85fr_1.15fr]">
            <div className="mx-auto w-full max-w-sm">
              <img
                alt="Illustration of a friendly robot asking a database for sales figures — Talk to your data with QueryMind"
                className="h-auto w-full"
                loading="lazy"
                src="/talk-to-your-data.png"
              />
            </div>
            <div className="text-center lg:text-left">
              <p className="eyebrow text-brand-400">No dashboards to learn</p>
              <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
                Your database, one conversation away
              </h2>
              <p className="mx-auto mt-4 max-w-md text-[15px] leading-7 text-ink-soft lg:mx-0">
                Ask a question the way you'd ask a colleague. QueryMind writes the SQL, checks it against your schema,
                and brings back answers, charts, and reports — from the web or your WhatsApp.
              </p>
              <ul className="mx-auto mt-6 max-w-md space-y-2.5 text-left lg:mx-0">
                {[
                  "Plain-English questions, production-safe SQL",
                  "Charts and PDF reports generated for you",
                  "Every write confirmed and logged"
                ].map((point) => (
                  <li className="flex items-start gap-2.5 text-sm font-medium text-ink" key={point}>
                    <Check className="mt-0.5 shrink-0 text-brand-400" size={16} /> {point}
                  </li>
                ))}
              </ul>
              <button
                className="btn-landing-primary mt-8 inline-flex"
                onClick={() => onNavigateAuth("register")}
                type="button"
              >
                Create your workspace <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </section>

        <footer className="relative border-t border-line px-5 py-8 text-center text-sm text-ink-faint sm:px-8">
          © {new Date().getFullYear()} QueryMind — AI database operations workspace
        </footer>
      </main>
    </div>
  );
}

function Dot() {
  return <span className="mx-2 inline-block h-1.5 w-1.5 rounded-full bg-brand-500 align-middle" />;
}

function LandingFeature({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="card-landing text-left">
      <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-500/15 text-brand-300">{icon}</span>
      <h3 className="mt-3 text-[15px] font-bold text-ink">{title}</h3>
      <p className="mt-1 text-[13px] leading-5 text-ink-soft">{text}</p>
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
    <span className="inline-grid text-brand-400">
      <span aria-hidden="true" className="invisible col-start-1 row-start-1">
        {TYPEWRITER_WORDS[wordIndex]}
      </span>
      <span
        aria-hidden="true"
        className="col-start-1 row-start-1 justify-self-center whitespace-nowrap lg:justify-self-start"
      >
        {text}
        <span className="ml-0.5 inline-block h-[0.85em] w-[3px] animate-caret bg-brand-500 align-[-0.08em]" />
      </span>
      <span className="sr-only">{TYPEWRITER_WORDS[wordIndex]}</span>
    </span>
  );
}
