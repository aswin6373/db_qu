import { useState } from "react";
import { Database, Loader2, X } from "lucide-react";
import { useChatSessions } from "./ChatSessionsContext";
import { useDialog } from "../lib/useDialog";
import type { Connection } from "../types/api";

type Props = {
  connections: Connection[];
  onClose: () => void;
  onSuccess?: () => void;
};

export function NewChatDialog({ connections, onClose, onSuccess }: Props) {
  const { ensureSession, openSession } = useChatSessions();
  const [creatingId, setCreatingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useDialog(onClose);

  async function pick(connection: Connection) {
    if (creatingId !== null) return;
    setCreatingId(connection.id);
    setError(null);
    try {
      const id = await ensureSession(connection.id);
      openSession(id);
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the chat");
      setCreatingId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label="Choose a database for the new chat" ref={dialogRef}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="card animate-fade-up relative w-full max-w-md overflow-hidden p-0">
        <div className="flex items-start justify-between gap-3 border-b border-line bg-gradient-to-r from-brand-500/10 via-transparent to-transparent px-6 py-5">
          <div>
            <p className="eyebrow text-brand-400">New chat</p>
            <h2 className="mt-0.5 text-lg font-bold tracking-tight text-ink">Which database will you ask?</h2>
            <p className="mt-1 text-xs leading-5 text-ink-soft">
              This chat will be permanently linked to the database you pick — start a new chat to use another one.
            </p>
          </div>
          <button aria-label="Close" className="rounded-lg p-1.5 text-ink-faint transition hover:bg-white/10 hover:text-ink-soft" onClick={onClose} type="button">
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[320px] space-y-1.5 overflow-y-auto p-4">
          {connections.map((connection) => {
            const isCreating = creatingId === connection.id;
            return (
              <button
                className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition ${
                  isCreating
                    ? "border-brand-500 bg-brand-500/15"
                    : "border-line bg-surface hover:border-brand-500/50 hover:bg-brand-500/10"
                } disabled:cursor-wait`}
                disabled={creatingId !== null}
                key={connection.id}
                onClick={() => pick(connection)}
                type="button"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-500/15 text-brand-300">
                  {isCreating ? <Loader2 className="animate-spin" size={16} /> : <Database size={16} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">{connection.name}</span>
                  <span className="block truncate font-mono text-[11px] text-ink-soft">
                    {connection.database_name} · {connection.host}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {error && (
          <p className="mx-6 mb-4 rounded-xl border border-rose-500/25 bg-rose-500/10 px-3.5 py-2.5 text-sm text-rose-300">{error}</p>
        )}
      </div>
    </div>
  );
}
