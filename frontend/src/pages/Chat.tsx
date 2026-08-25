import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { BarChart3, Bot, Check, CircleHelp, Copy, FileDown, Loader2, PlugZap, Send, Sparkles, Table2, User, X } from "lucide-react";
import { useChatSessions } from "../components/ChatSessionsContext";
import { buildChartSpec, QueryChart } from "../components/QueryChart";
import { apiRequest } from "../lib/api";
import { downloadQueryReport } from "../lib/reportPdf";
import { ChatMessage, Connection, QueryResponse } from "../types/api";

type Props = {
  token: string;
  connections: Connection[];
  onActivity: () => void;
  onOpenConnections: () => void;
};

type UiMessage = ChatMessage & { isError?: boolean };

const SUGGESTIONS = [
  "Show the 10 most recent rows from my biggest table",
  "Count how many rows each table has",
  "Insert a new record with today's date",
  "Which columns look like they need an index?"
];

export function Chat({ token, connections, onActivity, onOpenConnections }: Props) {
  const { sessions, activeId, ensureSession, refresh } = useChatSessions();
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [question, setQuestion] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [connectionId, setConnectionId] = useState<number | "">("");
  const [confirmingQueryId, setConfirmingQueryId] = useState<number | null>(null);
  const [confirmedQueryIds, setConfirmedQueryIds] = useState<Set<number>>(new Set());
  const [dismissedQueryIds, setDismissedQueryIds] = useState<Set<number>>(new Set());

  const tempIdRef = useRef(-1);
  const loadedSessionRef = useRef<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const activeSession = sessions.find((session) => session.id === activeId) ?? null;
  const hasConnection = connections.length > 0;

  useEffect(() => {
    if (!connectionId && connections.length > 0) {
      setConnectionId(connections[0].id);
    }
  }, [connectionId, connections]);

  useEffect(() => {
    if (isSending) return;
    if (activeId === null) {
      loadedSessionRef.current = null;
      setMessages([]);
      setConfirmedQueryIds(new Set());
      setDismissedQueryIds(new Set());
      return;
    }
    if (loadedSessionRef.current === activeId) return;
    let cancelled = false;
    loadedSessionRef.current = activeId;
    setMessages([]);
    setConfirmedQueryIds(new Set());
    setDismissedQueryIds(new Set());
    setMessagesLoading(true);
    apiRequest<ChatMessage[]>(`/chat/sessions/${activeId}`, {}, token)
      .then((history) => {
        if (!cancelled) setMessages(history);
      })
      .catch(() => {
        if (!cancelled) setMessages([{ id: -1, role: "assistant", content: "Could not load this conversation.", isError: true }]);
      })
      .finally(() => {
        if (!cancelled) setMessagesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeId, isSending, token]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, isSending]);

  function autoResize(element: HTMLTextAreaElement) {
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 190)}px`;
  }

  async function send() {
    const nextQuestion = question.trim();
    if (isSending || !nextQuestion || !connectionId) return;
    setQuestion("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setMessages((items) => [...items, { id: tempIdRef.current--, role: "user", content: nextQuestion }]);
    setIsSending(true);
    try {
      const sessionId = await ensureSession();
      loadedSessionRef.current = sessionId;
      const result = await apiRequest<QueryResponse>("/query/generate", {
        method: "POST",
        body: JSON.stringify({ question: nextQuestion, connection_id: connectionId, session_id: sessionId })
      }, token);
      setMessages((items) => [...items, { id: tempIdRef.current--, role: "assistant", content: result.summary, result }]);
      refresh();
      onActivity();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Query failed";
      setMessages((items) => [...items, { id: tempIdRef.current--, role: "assistant", content: message, isError: true }]);
    } finally {
      setIsSending(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void send();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  }

  async function confirmWrite(queryId: number) {
    if (confirmedQueryIds.has(queryId) || confirmingQueryId === queryId) return;
    setConfirmingQueryId(queryId);
    try {
      const result = await apiRequest<QueryResponse>(`/query/${queryId}/confirm`, { method: "POST" }, token);
      setConfirmedQueryIds((items) => new Set(items).add(queryId));
      setMessages((items) => items.map((item) => (
        item.result?.query_id === queryId ? { ...item, result: { ...item.result!, requires_confirmation: false } } : item
      )));
      setMessages((items) => [...items, { id: tempIdRef.current--, role: "assistant", content: result.summary, result }]);
      refresh();
      onActivity();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Confirmation failed";
      setMessages((items) => [...items, { id: tempIdRef.current--, role: "assistant", content: message, isError: true }]);
    } finally {
      setConfirmingQueryId(null);
    }
  }

  function cancelWrite(queryId: number) {
    setDismissedQueryIds((items) => new Set(items).add(queryId));
  }

  return (
    <section className="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-white">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-100 px-4 sm:px-6">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">{activeSession?.title ?? "New chat"}</p>
          {activeSession && (
            <p className="text-[11px] text-slate-400">
              {activeSession.message_count} message{activeSession.message_count === 1 ? "" : "s"}
            </p>
          )}
        </div>
      </header>

      {/* Messages */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 sm:px-6">
          {messagesLoading ? (
            <div className="flex items-center justify-center py-16 text-slate-400">
              <Loader2 className="animate-spin" size={22} />
            </div>
          ) : (
            <>
              {messages.map((message) => (
                <MessageRow key={message.id} message={message}>
                  {message.result && !message.result.needs_clarification && (
                    <ResultBlock
                      confirmingQueryId={confirmingQueryId}
                      connectionName={connections.find((connection) => connection.id === connectionId)?.name}
                      dismissedQueryIds={dismissedQueryIds}
                      isConfirmed={confirmedQueryIds.has(message.result.query_id) || !message.result.requires_confirmation}
                      onCancel={cancelWrite}
                      onConfirm={confirmWrite}
                      result={message.result}
                    />
                  )}
                </MessageRow>
              ))}

              {isSending && (
                <MessageRow message={{ id: -2, role: "assistant", content: "" }}>
                  <p className="flex items-center gap-2 text-sm font-medium text-slate-500">
                    Generating &amp; validating SQL
                    <span className="flex gap-1">
                      <Dot delay="0ms" /><Dot delay="150ms" /><Dot delay="300ms" />
                    </span>
                  </p>
                </MessageRow>
              )}

              {messages.length === 0 && !isSending && (
                <EmptyConversation
                  hasConnection={hasConnection}
                  onOpenConnections={onOpenConnections}
                  onPick={(suggestion) => {
                    setQuestion(suggestion);
                    textareaRef.current?.focus();
                  }}
                />
              )}
            </>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Composer */}
      <form className="shrink-0 px-4 pb-4 sm:px-6" onSubmit={submit}>
        <div className="mx-auto w-full max-w-3xl">
          {!hasConnection && (
            <button className="mb-2 flex w-full items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-800 transition hover:bg-amber-100" onClick={onOpenConnections} type="button">
              <PlugZap size={15} /> Connect a database to start asking questions
            </button>
          )}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-lift focus-within:border-brand-300">
            <textarea
              className="max-h-[190px] w-full resize-none bg-transparent px-4 pt-3.5 text-sm leading-6 text-slate-900 outline-none placeholder:text-slate-400"
              disabled={isSending || !hasConnection}
              onChange={(event) => {
                setQuestion(event.target.value);
                autoResize(event.target);
              }}
              onKeyDown={onKeyDown}
              placeholder={hasConnection ? "Ask your database anything…" : "Connect a database first"}
              ref={textareaRef}
              rows={1}
              value={question}
            />
            <div className="flex items-center gap-2 border-t border-slate-100 px-3 py-2">
              <select
                aria-label="Database connection"
                className="field h-8 max-w-44 text-xs sm:hidden"
                disabled={isSending}
                value={connectionId}
                onChange={(event) => setConnectionId(event.target.value ? Number(event.target.value) : "")}
              >
                {connections.length === 0 && <option value="">No database</option>}
                {connections.map((connection) => (
                  <option key={connection.id} value={connection.id}>{connection.name}</option>
                ))}
              </select>
              <span className="ml-1 hidden text-[11px] text-slate-400 sm:block">
                Enter to send · Shift+Enter for a new line
              </span>
              <button
                className="btn-accent ml-auto h-9 w-9 !px-0"
                disabled={isSending || !question.trim() || !connectionId}
                title="Send"
                type="submit"
              >
                {isSending ? <Loader2 className="animate-spin" size={16} /> : <Send size={15} />}
              </button>
            </div>
          </div>
        </div>
      </form>
    </section>
  );
}

function MessageRow({ message, children }: { message: UiMessage; children?: ReactNode }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end gap-3">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-gradient-to-br from-brand-600 to-brand-800 px-4 py-3 text-sm font-medium leading-6 text-white shadow-sm">
          {message.content}
        </div>
        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-800 text-white">
          <User size={15} />
        </span>
      </div>
    );
  }

  const isError = message.isError;
  const isClarifying = Boolean(message.result?.needs_clarification);

  return (
    <div className="flex gap-3">
      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-brand-600 to-brand-800 text-white shadow-sm shadow-brand-600/25">
        <Bot size={15} />
      </span>
      <div
        className={`min-w-0 flex-1 rounded-2xl rounded-tl-md border px-4 py-3 text-sm leading-6 ${
          isError
            ? "border-rose-200 bg-rose-50 text-rose-700"
            : isClarifying
              ? "border-sky-200 bg-sky-50 text-sky-900"
              : "border-slate-200 bg-white text-slate-700"
        } ${message.content || children ? "" : "hidden"}`}
      >
        {isClarifying && (
          <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-sky-600">
            <CircleHelp size={13} /> Quick question
          </p>
        )}
        {message.content && <p className="whitespace-pre-line">{message.content}</p>}
        {children}
      </div>
    </div>
  );
}

function Dot({ delay }: { delay: string }) {
  return <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-brand-500" style={{ animationDelay: delay }} />;
}

function EmptyConversation({
  hasConnection,
  onOpenConnections,
  onPick
}: {
  hasConnection: boolean;
  onOpenConnections: () => void;
  onPick: (suggestion: string) => void;
}) {
  return (
    <div className="flex flex-col items-center py-14 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 text-white shadow-lg shadow-brand-600/25">
        <Sparkles size={24} />
      </span>
      <h2 className="mt-5 text-xl font-bold tracking-tight text-slate-900">
        {hasConnection ? "What do you want to know?" : "Connect a database to begin"}
      </h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
        {hasConnection
          ? "Ask in plain English. QueryMind generates SQL, validates it against your schema, and pauses before any write."
          : "AI chat unlocks after QueryMind discovers your database structure."}
      </p>
      {!hasConnection && (
        <button className="btn-accent mt-5" onClick={onOpenConnections} type="button">
          <PlugZap size={16} /> Connect database
        </button>
      )}
      {hasConnection && (
        <div className="mt-7 grid w-full max-w-xl gap-2 sm:grid-cols-2">
          {SUGGESTIONS.map((suggestion) => (
            <button
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-[13px] leading-5 text-slate-600 transition hover:border-brand-300 hover:bg-brand-50/50 hover:text-slate-900"
              key={suggestion}
              onClick={() => onPick(suggestion)}
              type="button"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ResultBlock({
  confirmingQueryId,
  connectionName,
  dismissedQueryIds,
  isConfirmed,
  onConfirm,
  onCancel,
  result
}: {
  confirmingQueryId: number | null;
  connectionName?: string;
  dismissedQueryIds: Set<number>;
  isConfirmed: boolean;
  result: QueryResponse;
  onCancel: (id: number) => void;
  onConfirm: (id: number) => void;
}) {
  const isConfirming = confirmingQueryId === result.query_id;
  const isCancelled = dismissedQueryIds.has(result.query_id);
  const chartSpec = useMemo(() => buildChartSpec(result.columns, result.rows), [result.columns, result.rows]);
  const [view, setView] = useState<"chart" | "table">("table");
  const [copied, setCopied] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);

  async function copySql() {
    try {
      await navigator.clipboard.writeText(result.sql);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  }

  async function exportPdf() {
    if (isExporting) return;
    setIsExporting(true);
    try {
      await downloadQueryReport({
        chartSvg: chartRef.current?.querySelector("svg") ?? null,
        columns: result.columns,
        connectionName,
        rows: result.rows,
        sql: result.sql,
        summary: result.summary
      });
    } finally {
      setIsExporting(false);
    }
  }

  const downloadButton = (
    <button
      aria-label="Download PDF report"
      className="grid h-7 w-7 place-items-center rounded-md border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-brand-300 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
      disabled={isExporting}
      onClick={exportPdf}
      title="Download PDF report"
      type="button"
    >
      {isExporting ? <Loader2 className="animate-spin" size={13} /> : <FileDown size={13} />}
    </button>
  );

  return (
    <div className="mt-3 space-y-3">
      <div className="flex justify-end">{downloadButton}</div>
      <div className="group/sql relative">
        <code className="code-block pr-12">{result.sql}</code>
        <button
          aria-label={copied ? "Copied" : "Copy SQL"}
          className="absolute right-2.5 top-2 grid h-7 w-7 place-items-center rounded-md bg-white/10 text-teal-soft opacity-100 transition hover:bg-white/20 sm:opacity-0 sm:group-focus-within/sql:opacity-100 sm:group-hover/sql:opacity-100"
          onClick={copySql}
          title="Copy SQL"
          type="button"
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
        </button>
      </div>

      {result.requires_confirmation && !isConfirmed && !isCancelled && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="min-w-0 flex-1 text-xs font-medium leading-5 text-amber-800">
            This query modifies data. Run it only if the SQL above looks right.
          </p>
          <span className="flex shrink-0 items-center gap-2">
            <button className="btn-primary h-9 min-w-28" disabled={isConfirming} onClick={() => onConfirm(result.query_id)} type="button">
              {isConfirming ? <Loader2 className="animate-spin" size={15} /> : <Check size={15} />}
              {isConfirming ? "Running" : "Confirm & run"}
            </button>
            <button className="btn-secondary h-9" disabled={isConfirming} onClick={() => onCancel(result.query_id)} type="button">
              <X size={15} /> Cancel
            </button>
          </span>
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

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          {result.rows.length} row{result.rows.length === 1 ? "" : "s"}
        </span>
        <div className="flex items-center gap-1">
          {chartSpec && (
            <div className="flex gap-0.5 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
              {(["table", "chart"] as const).map((option) => (
                <button
                  className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                    view === option ? "bg-white text-brand-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
                  }`}
                  key={option}
                  onClick={() => setView(option)}
                  type="button"
                >
                  {option === "chart" ? <BarChart3 size={12} /> : <Table2 size={12} />}
                  {option === "chart" ? "Chart" : "Table"}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {chartSpec && (
        <div className={view === "chart" ? "" : "hidden"} ref={chartRef}>
          <QueryChart spec={chartSpec} totalRows={result.rows.length} />
        </div>
      )}

      {result.rows.length > 0 && (view === "table" || !chartSpec) && (
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
