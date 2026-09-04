import { useEffect, useState } from "react";
import { ArrowRight, BarChart3, Check, Database, FileText, Github, MessageCircle, ShieldCheck, Sparkles, UserPlus } from "lucide-react";
import { LogoMark } from "../components/LogoMark";

type Props = {
  onNavigateAuth: (mode: "login" | "register") => void;
};

export function LandingPage({ onNavigateAuth }: Props) {
  return (
    <div className="min-h-screen bg-canvas text-ink">
      {/* Navbar */}
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
          <a className="flex items-center gap-2.5" href="#top">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-500/15">
              <LogoMark className="h-5 w-5" />
            </span>
            <span className="font-display text-[16px] font-semibold tracking-tight text-ink">QueryMind</span>
          </a>

          <nav className="hidden items-center gap-7 text-sm font-medium text-ink-soft md:flex">
            <a className="transition hover:text-ink" href="#features">Why QueryMind</a>
            <a className="transition hover:text-ink" href="#how">How it works</a>
            <a className="transition hover:text-ink" href="#security">Security</a>
          </nav>

          <div className="flex items-center gap-2.5">
            <a
              className="hidden items-center gap-2 rounded-full border border-line px-3.5 py-1.5 text-sm font-medium text-ink transition hover:bg-white/5 sm:inline-flex"
              href="https://github.com/aswin6373/db_qu"
              rel="noreferrer"
              target="_blank"
            >
              <Github size={14} /> Star us
            </a>
            <button
              className="rounded-full px-3.5 py-1.5 text-sm font-medium text-ink-soft transition hover:text-ink"
              onClick={() => onNavigateAuth("login")}
              type="button"
            >
              Sign in
            </button>
            <button
              className="btn-landing-primary !h-9 !px-4 !text-sm"
              onClick={() => onNavigateAuth("register")}
              type="button"
            >
              Get started
            </button>
          </div>
        </div>
      </header>

      <main className="relative overflow-hidden" id="top">
        {/* Hero */}
        <div className="relative mx-auto max-w-3xl px-5 pb-16 pt-20 text-center sm:px-8 sm:pb-24 sm:pt-28">
          <h1 className="font-display text-[2.6rem] font-semibold leading-[1.12] tracking-tight text-ink sm:text-6xl">
            Talk to your database
            <br />
            <span className="inline-grid text-brand-400">
              <TypewriterWord />
            </span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-[17px] leading-7 text-ink-soft">
            Ask in plain English. QueryMind writes validated SQL, checks it against your live schema,
            and pauses before every write — so your team can query production without holding their breath.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <button
              className="btn-landing-primary"
              onClick={() => onNavigateAuth("register")}
              type="button"
            >
              Create workspace <ArrowRight size={15} />
            </button>
            <a className="btn-landing-outline" href="#how">
              See how it works
            </a>
          </div>

          {/* Social proof */}
          <div className="mt-16 border-t border-line pt-8">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-ink-faint">
              Works with the databases you already run
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
              {["MySQL", "PostgreSQL", "MariaDB", "TiDB", "PlanetScale", "Amazon RDS"].map((name) => (
                <span className="text-[15px] font-semibold tracking-tight text-ink-faint transition hover:text-ink-soft" key={name}>
                  {name}
                </span>
              ))}
            </div>
          </div>

          {/* Feature strip */}
          <div className="mt-16 grid gap-3 text-left sm:grid-cols-2 lg:grid-cols-3" id="features">
            <LandingFeature icon={<ShieldCheck size={16} />} title="Validated SQL" text="Every statement parsed and checked against your live schema before it runs." />
            <LandingFeature icon={<MessageCircle size={16} />} title="WhatsApp built in" text="Pair your WhatsApp and ask from your phone — answers and charts come back as images." />
            <LandingFeature icon={<BarChart3 size={16} />} title="AI-chosen charts" text="Ask for a trend or a total — QueryMind picks the right visualization automatically." />
            <LandingFeature icon={<FileText size={16} />} title="PDF reports" text="Export any answer as a polished PDF report your team can share." />
            <LandingFeature icon={<Database size={16} />} title="Encrypted credentials" text="Passwords sealed with Fernet encryption before storage." />
            <LandingFeature icon={<Sparkles size={16} />} title="Confirm-before-write" text="INSERT, UPDATE, DELETE wait for your explicit approval — always." />
          </div>
        </div>

        {/* How it works */}
        <section className="border-t border-line px-5 py-16 sm:px-8 sm:py-20" id="how">
          <div className="mx-auto max-w-5xl">
            <h2 className="text-center font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
              From question to safe query in seconds
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-center text-[15px] text-ink-soft">
              Three steps, zero risk. QueryMind never runs a write without your sign-off.
            </p>
            <div className="mt-10 grid gap-3 md:grid-cols-3">
              {[
                { step: "01", title: "Connect", text: "Add your MySQL or PostgreSQL host and credentials. We test the connection and map your full schema." },
                { step: "02", title: "Ask", text: "Type what you want to know. The AI writes one precise SQL statement for your schema." },
                { step: "03", title: "Review & run", text: "Reads execute instantly. Writes pause for your confirmation — and every change lands in the audit log." }
              ].map((item) => (
                <div className="card-landing p-6" key={item.step}>
                  <span className="font-mono text-xs font-medium text-brand-400">{item.step}</span>
                  <h3 className="mt-2.5 text-[15px] font-semibold text-ink">{item.title}</h3>
                  <p className="mt-1.5 text-[13px] leading-6 text-ink-soft">{item.text}</p>
                </div>
              ))}
            </div>

            {/* Product demo video */}
            <div className="mx-auto mt-14 max-w-3xl">
              <div className="overflow-hidden rounded-2xl border border-line bg-black/40 shadow-lift">
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
        <section className="px-5 py-16 sm:px-8 sm:py-20" id="security">
          <div className="mx-auto max-w-4xl rounded-3xl border border-line bg-side px-6 py-12 text-center sm:px-12">
            <h2 className="font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
              Built for production databases
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-[15px] leading-7 text-ink-soft">
              Schema and admin operations like DROP, ALTER, and TRUNCATE are blocked at the engine level. Credentials
              are encrypted at rest. Every query is logged for your audit trail.
            </p>
            <div className="mx-auto mt-8 flex max-w-2xl flex-wrap items-center justify-center gap-2.5">
              {["SQL injection guarded", "Multi-statement blocked", "DROP & ALTER blocked", "Org-level isolation", "Fernet encryption", "Full audit log", "WhatsApp device pairing"].map((chip) => (
                <span className="rounded-full border border-line bg-white/[0.04] px-4 py-1.5 text-[13px] text-ink-soft" key={chip}>
                  {chip}
                </span>
              ))}
            </div>
            <button
              className="btn-landing-primary mt-9 inline-flex"
              onClick={() => onNavigateAuth("register")}
              type="button"
            >
              Start free <ArrowRight size={15} />
            </button>
          </div>
        </section>

        {/* Talk to your data */}
        <section className="border-t border-line px-5 pb-20 sm:px-8">
          <div className="mx-auto grid max-w-5xl items-center gap-10 pt-16 lg:grid-cols-[0.85fr_1.15fr]">
            <div className="mx-auto w-full max-w-sm">
              <img
                alt="Illustration of a friendly robot asking a database for sales figures — Talk to your data with QueryMind"
                className="h-auto w-full opacity-90"
                loading="lazy"
                src="/talk-to-your-data.png"
              />
            </div>
            <div className="text-center lg:text-left">
              <h2 className="font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
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
                  <li className="flex items-start gap-2.5 text-sm text-ink" key={point}>
                    <Check className="mt-0.5 shrink-0 text-brand-400" size={15} /> {point}
                  </li>
                ))}
              </ul>
              <button
                className="btn-landing-primary mt-8 inline-flex"
                onClick={() => onNavigateAuth("register")}
                type="button"
              >
                Create your workspace <ArrowRight size={15} />
              </button>
            </div>
          </div>
        </section>

        <footer className="border-t border-line px-5 py-8 text-center text-sm text-ink-faint sm:px-8">
          © {new Date().getFullYear()} QueryMind — AI database operations workspace
        </footer>
      </main>
    </div>
  );
}

const TYPEWRITER_WORDS = ["in English.", "safely.", "confidently."];

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
    <span className="inline-grid">
      <span aria-hidden="true" className="invisible col-start-1 row-start-1">
        {TYPEWRITER_WORDS[wordIndex]}
      </span>
      <span
        aria-hidden="true"
        className="col-start-1 row-start-1 justify-self-center whitespace-nowrap lg:justify-self-start"
      >
        {text}
        <span className="ml-0.5 inline-block h-[0.85em] w-[3px] animate-caret bg-brand-400 align-[-0.08em]" />
      </span>
      <span className="sr-only">{TYPEWRITER_WORDS[wordIndex]}</span>
    </span>
  );
}

function LandingFeature({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="card-landing">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-500/10 text-brand-400">{icon}</span>
      <h3 className="mt-3 text-[14px] font-semibold text-ink">{title}</h3>
      <p className="mt-1 text-[13px] leading-5 text-ink-soft">{text}</p>
    </div>
  );
}
