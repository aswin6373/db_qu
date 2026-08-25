import { FormEvent, useEffect, useState } from "react";
import { CheckCircle2, Eye, EyeOff, Loader2, Trash2, UserPlus, X, XCircle } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { apiRequest } from "../lib/api";
import { Member } from "../types/api";

type Props = {
  token: string;
  currentUserId: number;
};

type Feedback = { kind: "success" | "error"; text: string };

const EMPTY_FORM = { email: "", password: "" };

export function Members({ token, currentUserId }: Props) {
  const [members, setMembers] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [showPassword, setShowPassword] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    apiRequest<Member[]>("/organizations/members", {}, token)
      .then((items) => {
        if (!cancelled) setMembers(items);
      })
      .catch((err) => {
        if (!cancelled) setFeedback({ kind: "error", text: err instanceof Error ? err.message : "Could not load members" });
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function addMember(event: FormEvent) {
    event.preventDefault();
    if (isAdding) return;
    if (form.password.length < 8) {
      setFeedback({ kind: "error", text: "Password must be at least 8 characters." });
      return;
    }
    setFeedback(null);
    setIsAdding(true);
    try {
      const created = await apiRequest<Member>("/organizations/members", {
        method: "POST",
        body: JSON.stringify(form)
      }, token);
      setMembers((items) => [...items, created]);
      setForm({ ...EMPTY_FORM });
      setShowPassword(false);
      setFeedback({ kind: "success", text: `${created.email} can now sign in with the email and password you set.` });
    } catch (err) {
      setFeedback({ kind: "error", text: err instanceof Error ? err.message : "Could not add the member" });
    } finally {
      setIsAdding(false);
    }
  }

  async function removeMember(member: Member) {
    if (isRemoving) return;
    setIsRemoving(true);
    try {
      await apiRequest(`/organizations/members/${member.id}`, { method: "DELETE" }, token);
      setMembers((items) => items.filter((item) => item.id !== member.id));
      setFeedback({ kind: "success", text: `${member.email} was removed from the workspace.` });
      setRemovingId(null);
    } catch (err) {
      setFeedback({ kind: "error", text: err instanceof Error ? err.message : "Could not remove the member" });
      setRemovingId(null);
    } finally {
      setIsRemoving(false);
    }
  }

  return (
    <section className="space-y-7">
      <PageHeader
        eyebrow="Team"
        title="Members"
        description="Add colleagues to your workspace. They sign in with the email and password you set here, and can chat with the connected databases."
      />
      {feedback && <FeedbackBanner feedback={feedback} onDismiss={() => setFeedback(null)} />}
      <AddMemberCard form={form} isAdding={isAdding} showPassword={showPassword} onShowPassword={setShowPassword} onFieldChange={(key, value) => setForm((current) => ({ ...current, [key]: value }))} onSubmit={addMember} />
      <MemberList
        currentUserId={currentUserId}
        isLoading={isLoading}
        isRemoving={isRemoving}
        members={members}
        removingId={removingId}
        onRemove={removeMember}
        onRemoveRequest={setRemovingId}
      />
    </section>
  );
}

function FeedbackBanner({ feedback, onDismiss }: { feedback: Feedback; onDismiss: () => void }) {
  const styles = feedback.kind === "success"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : "border-rose-200 bg-rose-50 text-rose-700";
  const icon = feedback.kind === "success" ? <CheckCircle2 size={16} /> : <XCircle size={16} />;
  return (
    <div
      className={`animate-fade-up flex items-start gap-2 rounded-xl border px-3.5 py-2.5 text-sm ${styles}`}
      role={feedback.kind === "error" ? "alert" : "status"}
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <p className="leading-6">{feedback.text}</p>
      <button
        aria-label="Dismiss message"
        className="ml-auto shrink-0 rounded p-0.5 opacity-60 transition hover:opacity-100"
        onClick={onDismiss}
        type="button"
      >
        <X size={15} />
      </button>
    </div>
  );
}

function AddMemberCard({
  form,
  isAdding,
  showPassword,
  onShowPassword,
  onFieldChange,
  onSubmit
}: {
  form: typeof EMPTY_FORM;
  isAdding: boolean;
  showPassword: boolean;
  onShowPassword: (visible: boolean) => void;
  onFieldChange: <K extends keyof typeof EMPTY_FORM>(key: K, value: (typeof EMPTY_FORM)[K]) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <form className="card animate-fade-up overflow-hidden" onSubmit={onSubmit}>
      <div className="flex items-center gap-3 border-b border-slate-100 bg-gradient-to-r from-brand-50 via-white to-cream p-6">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-navy text-teal-soft">
          <UserPlus size={20} />
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-bold tracking-tight text-slate-900">Add a member</h2>
          <p className="text-xs text-slate-500">You choose their password — share it with them securely.</p>
        </div>
      </div>

      <div className="grid gap-x-5 gap-y-4 p-6 sm:grid-cols-2">
        <label className="block">
          <span className="label">Email</span>
          <input
            autoComplete="off"
            className="field"
            placeholder="colleague@company.com"
            required
            type="email"
            value={form.email}
            onChange={(event) => onFieldChange("email", event.target.value)}
          />
        </label>
        <label className="block">
          <span className="label">Password</span>
          <span className="relative block">
            <input
              autoComplete="new-password"
              className="field pr-11"
              minLength={8}
              placeholder="At least 8 characters"
              required
              type={showPassword ? "text" : "password"}
              value={form.password}
              onChange={(event) => onFieldChange("password", event.target.value)}
            />
            <button
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-1 top-1 grid h-9 w-9 place-items-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              onClick={() => onShowPassword(!showPassword)}
              tabIndex={-1}
              type="button"
            >
              {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </span>
        </label>
      </div>

      <div className="flex justify-end border-t border-slate-100 bg-slate-50/60 px-6 py-4">
        <button className="btn-accent !h-10 w-full sm:w-auto" disabled={isAdding} type="submit">
          {isAdding ? <Loader2 className="animate-spin" size={15} /> : <UserPlus size={15} />}
          {isAdding ? "Adding…" : "Add member"}
        </button>
      </div>
    </form>
  );
}

function MemberList({
  currentUserId,
  isLoading,
  isRemoving,
  members,
  removingId,
  onRemove,
  onRemoveRequest
}: {
  currentUserId: number;
  isLoading: boolean;
  isRemoving: boolean;
  members: Member[];
  removingId: number | null;
  onRemove: (member: Member) => void;
  onRemoveRequest: (id: number | null) => void;
}) {
  return (
    <div className="card animate-fade-up overflow-hidden">
      <div className="border-b border-slate-100 px-6 py-5">
        <h2 className="text-lg font-bold tracking-tight text-slate-900">Workspace members</h2>
        <p className="text-xs text-slate-500">
          {members.length} user{members.length === 1 ? "" : "s"} · members can chat and explore data, but only you manage databases and the team.
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12 text-slate-400">
          <Loader2 className="animate-spin" size={20} />
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {members.map((member) => {
            const isSelf = member.id === currentUserId;
            const isConfirming = removingId === member.id;
            return (
              <li className="flex items-center gap-3 px-6 py-3.5" key={member.id}>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-bold uppercase text-brand-700">
                  {member.email.slice(0, 2)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-800">{member.email}</span>
                  <span className="block text-[11px] text-slate-400">
                    {member.role === "admin" ? "Admin" : "Member"}
                    {isSelf ? " · you" : ""}
                  </span>
                </span>
                {member.role === "admin" ? (
                  <span className="status-pill pill-info shrink-0">
                    admin
                  </span>
                ) : isConfirming ? (
                  <span className="flex shrink-0 items-center gap-1.5">
                    <span className="text-xs font-medium text-rose-600">Remove?</span>
                    <button
                      className="grid h-8 w-8 place-items-center rounded-md bg-rose-600 text-white transition hover:bg-rose-700"
                      disabled={isRemoving}
                      onClick={() => onRemove(member)}
                      title="Confirm remove"
                      type="button"
                    >
                      {isRemoving ? <Loader2 className="animate-spin" size={13} /> : <CheckCircle2 size={13} />}
                    </button>
                    <button
                      aria-label="Keep member"
                      className="grid h-8 w-8 place-items-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                      onClick={() => onRemoveRequest(null)}
                      type="button"
                    >
                      <X size={14} />
                    </button>
                  </span>
                ) : (
                  <button
                    aria-label={`Remove ${member.email}`}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-slate-200 text-slate-400 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                    onClick={() => onRemoveRequest(member.id)}
                    title="Remove member"
                    type="button"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
