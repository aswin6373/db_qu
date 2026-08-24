import { FormEvent, useEffect, useRef, useState } from "react";
import { Bot, Check, Database, Loader2, PlugZap, Send, Sparkles, User, X } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "./Dashboard";
import { apiRequest } from "../lib/api";
import { Connection, QueryResponse } from "../types/api";

type Props = {
  token: string;
  connections: Connection[];
  onActivity: () => void;
  onOpenConnections: () => void;
};

type Message = { role: "user" | "assistant"; content: string; result?: QueryResponse };

export function Chat({ token, connections, onActivity, onOpenConnections }: Props) {
  const [connectionId, setConnectionId] = useState<number | "">("");
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [confirmingQueryId, setConfirmingQueryId] = useState<number | null>(null);
  const [confirmedQueryIds, setConfirmedQueryIds] = useState<Set<number>>(new Set());
  const [dismissedQueryIds, setDismissedQueryIds] = useState<Set<number>>(new Set());
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!connectionId && connections.length > 0) {
      setConnectionId(connections[0].id);
    }
  }, [connectionId, connections]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, isThinking]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (isThinking || !question.trim() || !connectionId) return;
    setError("");
    setIsThinking(true);
    const nextQuestion = question.trim();
    setQuestion("");
    setMessages((items) => [...items, { role: "user", content: nextQuestion }]);
    try {
      const result = await apiRequest<QueryResponse>("/query/generate", {
        method: "POST",
        body: JSON.stringify({ question: nextQuestion, connection_id: connectionId })
      }, token);
      setMessages((items) => [...items, { role: "assistant", content: result.summary, result }]);
      onActivity();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Query failed";
      setError(message);
      setMessages((items) => [...items, { role: "assistant", content: message }]);
    } finally {
      setIsThinking(false);
    }
  }

  async function confirm(queryId: number) {
    if (confirmedQueryIds.has(queryId) || confirmingQueryId === queryId) return;
    setError("");
    setConfirmingQueryId(queryId);
    try {
      const result = await apiRequest<QueryResponse>(`/query/${queryId}/confirm`, { method: "POST" }, token);
      setConfirmedQueryIds((items) => new Set(items).add(queryId));
      setMessages((items) => items.map((item) => {
        if (item.result?.query_id !== queryId) return item;
        return { ...item, result: { ...item.result!, requires_confirmation: false } };
      }));
      setMessages((items) => [...items, { role: "assistant", content: result.summary, result }]);
      onActivity();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Confirmation failed");
    } finally {
      setConfirmingQueryId(null);
    }
  }

  function cancel(queryId: number) {
    setDismissedQueryIds((items) => new Set(items).add(queryId));
  }

  return (
    <section className="flex min-h-[calc(100vh-8rem)] flex-col gap-5">
      <PageHeader
        eyebrow="AI SQL workspace"
        title="Chat with your database"
        description="Ask in plain English. QueryMind generates SQL, validates it against your schema, and pauses before any write."
      />

      {connections.length === 0 && (
        <section className="card animate-fade-up border-brand-200 bg-gradient-to-br from-brand-50 via-white to-cream p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Connect a database first</h2>
              <p className="mt-1 text-sm text-slate-600">AI chat unlocks after QueryMind discovers your database structure.</p>
            </div>
            <button className="btn-accent shrink-0" onClick={onOpenConnections} type="button">
              <PlugZap size={17} /> Connect database
            </button>
          </div>
        </section>
      )}

      {/* Conversation */}
      <div className="card flex-1 p-4 sm:p-6">
        <div className="space-y-5">
          {messages.map((message, index) =>
            message.role === "user" ? (
              <div className="flex justify-end gap-3" key={index}>
                <div className="max-w-[85%] rounded-2xl rounded-br-md bg-gradient-to-br from-brand-600 to-brand-800 px-4 py-3 text-sm font-medium leading-6 text-white shadow-sm">
                  {message.content}
                </div>
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-800 text-white">
                  <User size={15} />
                </span>
              </div>
            ) : (
              <div className="flex gap-3" key={index}>
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-brand-600 to-brand-800 text-white shadow-sm shadow-brand-600/25">
                  <Bot size={15} />
                </span>
                <div className={`max-w-full min-w-0 flex-1 rounded-2xl rounded-tl-md border px-4 py-3 text-sm leading-6 ${
                  message.result || index === messages.length - 1
                    ? "border-slate-200 bg-white text-slate-700"
                    : "border-rose-200 bg-rose-50 text-rose-700"
                }`}>
                  <p className="whitespace-pre-line">{message.content}</p>
                  {message.result && (
                    <ResultBlock
                      confirmedQueryIds={confirmedQueryIds}
                      confirmingQueryId={confirmingQueryId}
                      dismissedQueryIds={dismissedQueryIds}
                      result={message.result}
                      onCancel={cancel}
                      onConfirm={confirm}
                    />
                  )}
                </div>
              </div>
            )
          )}

          {isThinking && (
            <div className="flex gap-3">
              <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-brand-600 to-brand-800 text-white">
                <Bot size={15} />
              </span>
              <div className="rounded-2xl rounded-tl-md border border-slate-200 bg-white px-4 py-3">
                <p className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  Generating &amp; validating SQL
                  <span className="flex gap-1">
                    <Dot delay="0ms" /><Dot delay="150ms" /><Dot delay="300ms" />
                  </span>
                </p>
              </div>
            </div>
          )}

          {messages.length === 0 && (
            <EmptyState
              icon={<Sparkles size={22} />}
              text={
                connections.length === 0
                  ? "Connect a database to begin."
                  : "Choose a connection and ask your first question — try a filtered list, an insert with exact values, or a safe update you can review first."
              }
            />
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {error && (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700">{error}</p>
      )}

      {/* Composer */}
      <form className="card sticky bottom-4 grid gap-2.5 p-3 shadow-lift sm:grid-cols-[220px_1fr_auto]" onSubmit={submit}>
        <select className="field" disabled={isThinking} value={connectionId} onChange={(event) => setConnectionId(event.target.value ? Number(event.target.value) : "")}>
          {connections.length === 0 && <option value="">No database connected</option>}
          {connections.map((connection) => (
            <option key={connection.id} value={connection.id}>{connection.name}</option>
          ))}
        </select>
        <input
          className="field"
          disabled={isThinking || connections.length === 0}
          placeholder="e.g. Show me all customers from Mumbai"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
        />
        <button className="btn-accent" disabled={isThinking || !question.trim() || !connectionId} type="submit">
          {isThinking ? <Loader2 className="animate-spin" size={17} /> : <Send size={16} />}
          Send
        </button>
      </form>
    </section>
  );
}

function Dot({ delay }: { delay: string }) {
  return <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-brand-500" style={{ animationDelay: delay }} />;
}

function ResultBlock({
  confirmedQueryIds,
  confirmingQueryId,
  dismissedQueryIds,
  result,
  onCancel,
  onConfirm
}: {
  confirmedQueryIds: Set<number>;
  confirmingQueryId: number | null;
  dismissedQueryIds: Set<number>;
  result: QueryResponse;
  onCancel: (id: number) => void;
  onConfirm: (id: number) => void;
}) {
  const isConfirming = confirmingQueryId === result.query_id;
  const isConfirmed = confirmedQueryIds.has(result.query_id) || !result.requires_confirmation;
  const isCancelled = dismissedQueryIds.has(result.query_id);

  return (
    <div className="mt-3 space-y-3">
      <code className="code-block">{result.sql}</code>

      {result.requires_confirmation && !isConfirmed && !isCancelled && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="mr-auto text-xs font-medium leading-5 text-amber-800">
            This query modifies data. Run it only if the SQL above looks right.
          </p>
          <button className="btn-primary h-9 min-w-28" disabled={isConfirming} onClick={() => onConfirm(result.query_id)} type="button">
            {isConfirming ? <Loader2 className="animate-spin" size={15} /> : <Check size={15} />}
            {isConfirming ? "Running" : "Confirm & run"}
          </button>
          <button className="btn-secondary h-9" disabled={isConfirming} onClick={() => onCancel(result.query_id)} type="button">
            <X size={15} /> Cancel
          </button>
        </div>
      )}

      {isCancelled && (
        <span className="status-pill border-rose-200 bg-rose-50 text-rose-700">
          <X size={13} /> Cancelled — nothing was executed
        </span>
      )}

      {isConfirmed && result.query_type !== "SELECT" && (
        <span className="status-pill pill-success"><Check size={13} /> Confirmed</span>
      )}

      {result.rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                {result.columns.map((column) => (
                  <th className="px-3.5 py-2.5 font-semibold" key={column}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row, index) => (
                <tr className="transition-colors hover:bg-brand-50/40" key={index}>
                  {result.columns.map((column) => (
                    <td className="px-3.5 py-2.5 text-slate-700" key={column}>{String(row[column] ?? "")}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
