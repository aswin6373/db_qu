import { FormEvent, useState } from "react";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Database, Eye, EyeOff, Loader2, PartyPopper, PlugZap, ShieldCheck, UserRound } from "lucide-react";
import { NumberField } from "./NumberField";
import { LogoMark } from "./LogoMark";
import { apiRequest } from "../lib/api";

type Props = {
  token: string;
  organizationName?: string;
  onComplete: () => void;
};

type Feedback = { kind: "success" | "error"; text: string };

const STEPS = [
  { id: 1, label: "Your details", icon: UserRound },
  { id: 2, label: "Connect database", icon: Database },
  { id: 3, label: "Ready", icon: CheckCircle2 }
];

export function Onboarding({ token, organizationName, onComplete }: Props) {
  const [step, setStep] = useState(1);
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("");
  const [useCase, setUseCase] = useState("");
  const [workspace, setWorkspace] = useState(organizationName ?? "");
  const [form, setForm] = useState({
    name: "",
    db_type: "mysql" as "mysql" | "postgres",
    host: "",
    port: 3306,
    username: "",
    password: "",
    database_name: "",
    ssl_mode: "PREFERRED",
    test_live: true,
    ssh_host: null as string | null,
    ssh_port: 22,
    ssh_username: null as string | null,
    ssh_password: null as string | null
  });
  const defaultPort = form.db_type === "postgres" ? 5432 : 3306;
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [saving, setSaving] = useState(false);
  const [connectedName, setConnectedName] = useState("");
  const [showSshTunnel, setShowSshTunnel] = useState(false);
  const [showSshPassword, setShowSshPassword] = useState(false);

  function toggleSshTunnel(enabled: boolean) {
    setShowSshTunnel(enabled);
    if (!enabled) {
      // Drop any half-entered tunnel values so they never reach the backend.
      setForm((current) => ({ ...current, ssh_host: null, ssh_port: 22, ssh_username: null, ssh_password: null }));
    }
  }

  function saveDetails(event: FormEvent) {
    event.preventDefault();
    try {
      localStorage.setItem(
        "querymind_profile",
        JSON.stringify({ fullName, role, useCase, organizationName: workspace })
      );
    } catch {
      /* storage unavailable — onboarding continues regardless */
    }
    setStep(2);
  }

  async function connectDatabase(event: FormEvent) {
    event.preventDefault();
    setFeedback(null);
    setSaving(true);
    try {
      // Shared client: consistent errors plus the global auth-expired handler.
      await apiRequest<unknown>("/connections", { method: "POST", body: JSON.stringify(form) }, token);
      setConnectedName(form.name);
      setFeedback(null);
      setStep(3);
    } catch (err) {
      setFeedback({ kind: "error", text: err instanceof Error ? err.message : "Connection failed" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="dot-grid min-h-screen bg-canvas px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 ring-1 ring-line">
              <LogoMark className="h-6 w-6" />
            </span>
            <span className="text-lg font-extrabold tracking-tight text-ink">QueryMind</span>
          </div>
          <p className="text-sm font-medium text-ink-soft">
            {step > 2 ? "All set" : `Step ${step} of 2`}
          </p>
        </div>

        {/* Progress */}
        <ol className="mb-8 flex items-center gap-2">
          {STEPS.map((item, index) => {
            const Icon = item.icon;
            const done = step > item.id;
            const current = step === item.id;
            return (
              <li className="flex flex-1 items-center gap-2" key={item.id}>
                <span
                  className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border text-sm font-bold transition ${
                    done
                      ? "border-brand-500 bg-brand-500 text-white"
                      : current
                        ? "border-brand-500 bg-surface text-brand-300 shadow-sm"
                        : "border-line-strong bg-surface text-ink-faint"
                  }`}
                >
                  {done ? <Check size={16} /> : <Icon size={16} />}
                </span>
                <span
                  className={`hidden text-[13px] font-semibold sm:block ${
                    current ? "text-ink" : done ? "text-brand-300" : "text-ink-faint"
                  }`}
                >
                  {item.label}
                </span>
                {index < STEPS.length - 1 && (
                  <span className={`h-px flex-1 ${done ? "bg-brand-500" : "bg-white/10"}`} />
                )}
              </li>
            );
          })}
        </ol>

        {/* Step 1: details */}
        {step === 1 && (
          <form className="card animate-fade-up p-7 sm:p-9" onSubmit={saveDetails}>
            <p className="eyebrow text-brand-400">Welcome aboard</p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-ink">Tell us about your workspace</h1>
            <p className="mt-1.5 text-sm text-ink-soft">This helps us tailor QueryMind to how your team works.</p>

            <div className="mt-6 space-y-4">
              <label className="block">
                <span className="label text-ink-soft">Workspace name</span>
                <input className="field" placeholder="Acme Analytics" required value={workspace} onChange={(event) => setWorkspace(event.target.value)} />
              </label>
              <label className="block">
                <span className="label text-ink-soft">Your name</span>
                <input className="field" placeholder="Aswin Kumar" value={fullName} onChange={(event) => setFullName(event.target.value)} />
              </label>
              <label className="block">
                <span className="label text-ink-soft">Your role</span>
                <select className="field" value={role} onChange={(event) => setRole(event.target.value)}>
                  <option value="">Select a role…</option>
                  <option>Founder / Leadership</option>
                  <option>Data Analyst</option>
                  <option>Backend / Full-stack Engineer</option>
                  <option>DBA / DevOps</option>
                  <option>Product Manager</option>
                  <option>Other</option>
                </select>
              </label>
              <div>
                <span className="label text-ink-soft">What will you use QueryMind for?</span>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {["Explore data", "Build reports", "Manage operations", "Learn SQL"].map((option) => (
                    <button
                      className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                        useCase === option
                          ? "border-brand-500 bg-brand-500/15 text-brand-300"
                          : "border-line-strong bg-surface text-ink-soft hover:border-brand-500/40"
                      }`}
                      key={option}
                      onClick={() => setUseCase(option)}
                      type="button"
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button className="btn-landing-primary mt-7 w-full" type="submit">
              Continue <ArrowRight size={16} />
            </button>
          </form>
        )}

        {/* Step 2: connect database */}
        {step === 2 && (
          <form className="card animate-fade-up p-7 sm:p-9" onSubmit={connectDatabase}>
            <p className="eyebrow text-brand-400">Almost there</p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-ink">Connect your database</h1>
            <p className="mt-1.5 text-sm leading-6 text-ink-soft">
              QueryMind needs a live MySQL or PostgreSQL connection before the workspace unlocks. Your password is
              encrypted before it is stored.
            </p>

            <div className="mt-6 grid gap-x-5 gap-y-4 sm:grid-cols-2">
              <label className="block">
                <span className="label text-ink-soft">Display name</span>
                <input className="field" placeholder="Production database" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
              </label>
              <label className="block">
                <span className="label text-ink-soft">Database type</span>
                <select
                  className="field"
                  value={form.db_type}
                  onChange={(event) => {
                    const db_type = event.target.value as "mysql" | "postgres";
                    setForm({ ...form, db_type, port: db_type === "postgres" ? 5432 : 3306 });
                  }}
                >
                  <option value="mysql">MySQL / MariaDB</option>
                  <option value="postgres">PostgreSQL</option>
                </select>
              </label>
              <label className="block">
                <span className="label text-ink-soft">Host</span>
                <input
                  className="field font-mono"
                  placeholder={showSshTunnel ? "127.0.0.1 or db.internal" : `${form.db_type === "postgres" ? "postgresql" : "mysql"}.example.com`}
                  required
                  value={form.host}
                  onChange={(event) => setForm({ ...form, host: event.target.value })}
                />
                {showSshTunnel && (
                  <span className="mt-1.5 block text-xs text-ink-soft">
                    Database address as seen from the SSH server — use 127.0.0.1 if the database runs on the bastion itself.
                  </span>
                )}
              </label>
              <label className="block">
                <span className="label text-ink-soft">Port</span>
                <NumberField className="field" fallback={defaultPort} max={65535} min={1} onCommit={(port) => setForm({ ...form, port })} value={form.port} />
              </label>
              <label className="block">
                <span className="label text-ink-soft">Username</span>
                <input className="field font-mono" placeholder="querymind_user" required value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} />
              </label>
              <label className="block">
                <span className="label text-ink-soft">Password</span>
                <input className="field" placeholder="••••••••" required type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
              </label>
              <label className="block">
                <span className="label text-ink-soft">Database name</span>
                <input className="field font-mono" placeholder="my_database" required value={form.database_name} onChange={(event) => setForm({ ...form, database_name: event.target.value })} />
              </label>
              <label className="block sm:col-span-2">
                <span className="label text-ink-soft">Encryption (SSL)</span>
                <select className="field" value={form.ssl_mode} onChange={(event) => setForm({ ...form, ssl_mode: event.target.value })}>
                  <option value="PREFERRED">Auto — use SSL if available</option>
                  <option value="REQUIRED">Required — cloud providers</option>
                  <option value="DISABLED">Disabled — local only</option>
                </select>
              </label>

              <div className="rounded-xl border border-line bg-surface/70 sm:col-span-2">
                <label className="flex cursor-pointer items-start gap-3 p-3.5 text-sm" htmlFor="onboarding-ssh-tunnel-toggle">
                  <input checked={showSshTunnel} className="mt-0.5 h-4 w-4 accent-brand-500" id="onboarding-ssh-tunnel-toggle" onChange={(event) => toggleSshTunnel(event.target.checked)} type="checkbox" />
                  <span>
                    <span className="flex items-center gap-1.5 font-semibold text-ink">
                      <ShieldCheck size={15} /> Connect via SSH tunnel
                    </span>
                    <span className="mt-0.5 block text-xs text-ink-soft">
                      For private databases only reachable through a bastion/jump host.
                    </span>
                  </span>
                </label>

                {showSshTunnel && (
                  <div className="grid gap-x-5 gap-y-4 border-t border-line p-3.5 sm:grid-cols-2">
                    <label className="block">
                      <span className="label text-ink-soft">SSH Host</span>
                      <input className="field font-mono" placeholder="bastion.mycompany.com" required={showSshTunnel} value={form.ssh_host ?? ""} onChange={(event) => setForm({ ...form, ssh_host: event.target.value })} />
                    </label>
                    <label className="block">
                      <span className="label text-ink-soft">SSH Port</span>
                      <NumberField className="field" fallback={22} max={65535} min={1} onCommit={(ssh_port) => setForm({ ...form, ssh_port })} value={form.ssh_port} />
                    </label>
                    <label className="block">
                      <span className="label text-ink-soft">SSH Username</span>
                      <input className="field font-mono" placeholder="ec2-user" required={showSshTunnel} value={form.ssh_username ?? ""} onChange={(event) => setForm({ ...form, ssh_username: event.target.value })} />
                    </label>
                    <label className="block">
                      <span className="label text-ink-soft">SSH Password / Private Key</span>
                      <span className="relative block">
                        {(showSshPassword || (form.ssh_password ?? "").startsWith("-----")) ? (
                          <textarea
                            className="field h-auto min-h-[44px] resize-y py-3 pr-11 font-mono text-[13px] leading-5"
                            placeholder="Paste SSH private key (-----BEGIN...) or password"
                            required={showSshTunnel}
                            rows={1}
                            value={form.ssh_password ?? ""}
                            onChange={(event) => setForm({ ...form, ssh_password: event.target.value })}
                          />
                        ) : (
                          <input
                            className="field pr-11"
                            placeholder="Password, or paste a private key"
                            required={showSshTunnel}
                            type="password"
                            value={form.ssh_password ?? ""}
                            onChange={(event) => setForm({ ...form, ssh_password: event.target.value })}
                          />
                        )}
                        <button
                          aria-label={showSshPassword ? "Hide SSH secret" : "Show SSH secret"}
                          className="absolute right-1 top-1 grid h-9 w-9 place-items-center rounded-md text-ink-faint transition hover:bg-white/10 hover:text-ink-soft"
                          onClick={() => setShowSshPassword((visible) => !visible)}
                          type="button"
                        >
                          {showSshPassword || (form.ssh_password ?? "").startsWith("-----") ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </span>
                      <span className="mt-1.5 block text-xs text-ink-soft">
                        Password stays hidden; a private key (-----BEGIN…) opens a larger box and is detected automatically. Encrypted at rest like your database password.
                      </span>
                    </label>
                  </div>
                )}
              </div>

              <label className="panel-soft flex items-start gap-3 p-3.5 text-sm sm:col-span-2">
                <input checked={Boolean(form.test_live)} className="mt-0.5 h-4 w-4 accent-brand-500" onChange={(event) => setForm({ ...form, test_live: event.target.checked })} type="checkbox" />
                <span>
                  <span className="flex items-center gap-1.5 font-semibold text-ink">
                    <ShieldCheck size={15} /> Test live connection before saving
                  </span>
                  <span className="mt-0.5 block text-xs text-ink-soft">Recommended — verifies credentials and loads your schema immediately.</span>
                </span>
              </label>
            </div>

            {feedback && (
              <p className="mt-5 rounded-xl border border-rose-500/25 bg-rose-500/10 px-3.5 py-2.5 text-sm text-rose-300">{feedback.text}</p>
            )}

            <div className="mt-7 flex flex-col gap-2.5 sm:flex-row-reverse">
              <button className="btn-landing-primary flex-1" disabled={saving} type="submit">
                {saving ? <Loader2 className="animate-spin" size={17} /> : <PlugZap size={16} />}
                {saving ? "Testing & connecting…" : "Connect & finish"}
              </button>
              <button className="btn-landing-outline" onClick={() => setStep(1)} type="button">
                <ArrowLeft size={15} /> Back
              </button>
            </div>
          </form>
        )}

        {/* Step 3: done */}
        {step === 3 && (
          <div className="card animate-fade-up p-10 text-center">
            <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-brand-500/15 text-brand-300">
              <PartyPopper size={28} />
            </span>
            <h1 className="mt-5 text-2xl font-extrabold tracking-tight text-ink">You're all set!</h1>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-ink-soft">
              <strong className="text-ink">{connectedName}</strong> is connected and your schema is mapped. Your
              workspace is ready — head in and ask your first question.
            </p>
            <button className="btn-landing-primary mx-auto mt-7" onClick={onComplete} type="button">
              Enter workspace <ArrowRight size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
