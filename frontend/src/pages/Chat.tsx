import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AlertTriangle, BarChart3, Check, CircleHelp, Clock, Copy, Database, FileDown, Loader2, PlugZap, Search, Send, SquareSlash, Table2, X, XCircle } from "lucide-react";
import { useChatSessions } from "../components/ChatSessionsContext";
import { LogoMark } from "../components/LogoMark";
import { NewChatDialog } from "../components/NewChatDialog";
import { buildChartSpec, QueryChart } from "../components/QueryChart";
import { apiRequest } from "../lib/api";
import { ChatMessage, Connection, QueryResponse } from "../types/api";

type Props = {
  token: string;
  connections: Connection[];
  onActivity: () => void;
  onOpenConnections: () => void;
};

type UiMessage = ChatMessage & { isError?: boolean };

// Typing indicator lives far outside the temp-id range (-1, -2, …) so its key
// can never collide with a real message row.
const TYPING_ID = -999_999;

// Confirm/cancel decisions survive Chat remounts (navigating away mid-review
// must not resurrect a cancelled write prompt). Module scope = SPA lifetime;
// mutations bump a nonce so React re-renders.
const confirmedWrites = new Set<number>();
const dismissedWrites = new Set<number>();

// Mirrors the backend's agent routing (_AGENT_HINT_RE / _WRITE_INTENT_RE in
// query.py). Purely cosmetic: questions the backend hands to the multi-step
// agent get the deeper "agent at work" indicator instead of the plain one.
const AGENT_HINT_RE = new RegExp(
  [
    "\\b(?:why|how come|compare|comparison|versus|trend|over time|growth|drop|dropped|decline|increase|decrease|correlat\\w*|relationship|break\\s?down|insight|biggest|largest|smallest|busiest|rank|ranking|ranked|distribution|outliers?|anomal\\w*|unusual|forecast)\\b",
    "\\bmost\\s+(?:active|popular|common|frequent|valuable|profitable)\\b",
    "\\bper\\s+(?:month|week|day|quarter|year)\\b",
    "\\bby\\s+(?:month|week|quarter|year|category|region|status)\\b",
    "\\bwhich\\s+[\\w ]{0,30}?\\b(?:most|least|best|worst|highest|lowest)\\b",
    "\\btop\\s+\\d+\\b"
  ].join("|"),
  "i"
);
const WRITE_INTENT_RE = /\b(?:insert|update|delete|drop|create|remove|modify|alter|truncate|rename)\b/i;

function parseUtcDate(dateStr: string | null | undefined): number {
  if (!dateStr) return 0;
  // Ensure the string is treated as UTC even if the backend returned without a timezone suffix
  const normalized = dateStr.endsWith("Z") || /[+-]\d{2}:?\d{2}$/.test(dateStr) ? dateStr : `${dateStr}Z`;
  const time = new Date(normalized).getTime();
  return isNaN(time) ? 0 : time;
}

function looksLikeAgentQuestion(question: string): boolean {
  return AGENT_HINT_RE.test(question) && !WRITE_INTENT_RE.test(question);
}

export function Chat({ token, connections, onActivity, onOpenConnections }: Props) {
  const { sessions, activeId, ensureSession, refresh } = useChatSessions();
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [question, setQuestion] = useState("");
  const [isSending, setIsSending] = useState(false);
  // True while a question the backend routes to the multi-step agent is in flight.
  const [isAgentWorking, setIsAgentWorking] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmingQueryId, setConfirmingQueryId] = useState<number | null>(null);
  // Nonce bumped whenever the module-level decision sets change.
  const [decisionNonce, setDecisionNonce] = useState(0);

  const tempIdRef = useRef(-1);
  const loadedSessionRef = useRef<number | null>(null);
  const activeIdRef = useRef<number | null>(activeId);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const activeSession = sessions.find((session) => session.id === activeId) ?? null;
  const hasConnection = connections.length > 0;

  // A chat is permanently linked to the database chosen when it was created.
  // (Legacy chats without a binding fall back to the first connection on their first message.)
  const selectedConnectionId =
    activeSession?.connection_id && connections.some((connection) => connection.id === activeSession.connection_id)
      ? activeSession.connection_id
      : connections[0]?.id || "";
  const selectedConnectionName =
    connections.find((connection) => connection.id === Number(selectedConnectionId))?.name ?? "";

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  // NOTE: deliberately NOT gated on isSending. Skipping the reload while a
  // question is in flight used to let the answer land inside whichever
  // transcript was on screen — the wrong conversation.
  useEffect(() => {
    if (activeId === null) {
      loadedSessionRef.current = null;
      setMessages([]);
      return;
    }
    if (loadedSessionRef.current === activeId) return;
    let cancelled = false;
    loadedSessionRef.current = activeId;
    setMessages([]);
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
  }, [activeId, token]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, isSending]);

  function autoResize(element: HTMLTextAreaElement) {
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 190)}px`;
  }

  async function send() {
    const nextQuestion = question.trim();
    if (isSending || !nextQuestion || !selectedConnectionId) return;
    setQuestion("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setMessages((items) => [...items, { id: tempIdRef.current--, role: "user", content: nextQuestion }]);
    setIsAgentWorking(looksLikeAgentQuestion(nextQuestion));
    setIsSending(true);
    try {
      const sessionId = await ensureSession(Number(selectedConnectionId));
      loadedSessionRef.current = sessionId;
      // Just above the backend's hard ceiling (~45s budget + LLM overshoot,
      // killed by Vercel at 60s): the spinner always resolves into an answer
      // or a clear error instead of outliving the request.
      const result = await apiRequest<QueryResponse>("/query/generate", {
        method: "POST",
        body: JSON.stringify({ question: nextQuestion, connection_id: Number(selectedConnectionId), session_id: sessionId })
      }, token, 62_000);
      // The user may have switched sessions while the request was in flight.
      // Only paint the answer into the transcript it belongs to.
      if (activeIdRef.current !== sessionId || loadedSessionRef.current !== sessionId) {
        refresh();
        onActivity();
        return;
      }
      const assistantMessage: UiMessage = { id: tempIdRef.current--, role: "assistant", content: result.summary };
      // Schema answers and clarifying questions are plain text — no result block.
      if (!result.needs_clarification && !result.meta_answer) {
        assistantMessage.result = result;
      }
      setMessages((items) => [...items, assistantMessage]);
      refresh();
      onActivity();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Query failed";
      setMessages((items) => [...items, { id: tempIdRef.current--, role: "assistant", content: message, isError: true }]);
    } finally {
      setIsSending(false);
      setIsAgentWorking(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void send();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    // IME composition (Japanese/Chinese/…): Enter commits the candidate text,
    // it must not send a half-composed question.
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  }

  async function confirmWrite(queryId: number) {
    if (confirmedWrites.has(queryId) || confirmingQueryId === queryId) return;
    setConfirmingQueryId(queryId);
    try {
      const result = await apiRequest<QueryResponse>(`/query/${queryId}/confirm`, { method: "POST" }, token);
      confirmedWrites.add(queryId);
      setDecisionNonce((nonce) => nonce + 1);
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

  async function cancelWrite(queryId: number) {
    dismissedWrites.add(queryId);
    setDecisionNonce((nonce) => nonce + 1);
    try {
      await apiRequest<QueryResponse>(`/query/${queryId}/cancel`, { method: "POST" }, token);
      onActivity();
    } catch {
      // already recorded in local UI state
    }
  }

  const showComposer = hasConnection && Boolean(activeSession);

  return (
    <section className="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-transparent">
      {/* Slim static header — the linked database sits here instead of floating over messages */}
      <header className="flex h-12 shrink-0 items-center justify-end border-b border-line px-4 sm:px-6">
        {activeSession && hasConnection && (
          <span
            className="flex items-center gap-1.5 rounded-full border border-line bg-raise px-3 py-1 text-[11px] font-medium text-ink-soft"
            title="This chat is linked to this database"
          >
            <Database size={12} className="shrink-0 text-brand-400" />
            <span className="max-w-40 truncate text-ink">{selectedConnectionName || "No database"}</span>
          </span>
        )}
      </header>

      {/* Messages */}
      {messages.length === 0 && !isSending && !messagesLoading ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-4 text-center">
          <EmptyConversation
            hasConnection={hasConnection}
            needsDatabase={!activeSession}
            onOpenConnections={onOpenConnections}
            onPickDatabase={() => setPickerOpen(true)}
          />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
            {messagesLoading ? (
              <div className="flex items-center justify-center py-16 text-ink-faint">
                <Loader2 className="animate-spin" size={22} />
              </div>
            ) : (
              <>
                {messages.map((message) => (
                  <MessageRow key={message.id} message={message}>
                    {message.result && !message.result.needs_clarification && (message.result.sql || message.result.rows.length > 0 || (message.result.steps && message.result.steps.length > 0) ? (
                      <ResultBlock
                        confirmingQueryId={confirmingQueryId}
                        connectionName={connections.find((connection) => connection.id === Number(selectedConnectionId))?.name}
                        dismissedQueryIds={dismissedWrites}
                        decisionNonce={decisionNonce}
                        isConfirmed={confirmedWrites.has(message.result.query_id) || message.result.is_confirmed === true || !message.result.requires_confirmation}
                        onCancel={cancelWrite}
                        onConfirm={confirmWrite}
                        result={message.result}
                      />
                    ) : null)}
                  </MessageRow>
                ))}

                {isSending && (
                  <MessageRow message={{ id: TYPING_ID, role: "assistant", content: "" }}>
                    {isAgentWorking ? (
                      <div className="space-y-1">
                        <p className="flex items-center gap-2 text-sm font-medium text-ink-soft">
                          Agent is analyzing your database
                          <span className="flex gap-1">
                            <Dot delay="0ms" /><Dot delay="150ms" /><Dot delay="300ms" />
                          </span>
                        </p>
                        <p className="text-xs text-ink-faint">Running queries step by step to build your answer…</p>
                      </div>
                    ) : (
                      <p className="flex items-center gap-2 text-sm font-medium text-ink-soft">
                        Working through your question
                        <span className="flex gap-1">
                          <Dot delay="0ms" /><Dot delay="150ms" /><Dot delay="300ms" />
                        </span>
                      </p>
                    )}
                  </MessageRow>
                )}
              </>
            )}
            <div ref={bottomRef} className="h-6" />
          </div>
        </div>
      )}

      {/* Composer — only when a chat with a database is actually open */}
      {showComposer && (
        <form className="shrink-0 px-4 pb-3 pt-1 sm:px-6" onSubmit={submit}>
          <div className="mx-auto w-full max-w-3xl">
            <div className="rounded-[26px] border border-line-strong bg-raise shadow-composer transition focus-within:border-white/25">
              <textarea
                aria-label="Ask your database a question"
                className="max-h-[190px] w-full resize-none bg-transparent px-5 pb-1 pt-4 text-[15px] leading-6 text-ink outline-none placeholder:text-ink-faint"
                disabled={isSending}
                onChange={(event) => {
                  setQuestion(event.target.value);
                  autoResize(event.target);
                }}
                onKeyDown={onKeyDown}
                placeholder="Ask anything about your data…"
                ref={textareaRef}
                rows={1}
                value={question}
              />
              <div className="flex items-center gap-2 px-3 pb-2.5 pt-1">
                <span className="ml-2 flex min-w-0 items-center gap-1.5 text-[11px] text-ink-faint">
                  <Database size={12} className="shrink-0 text-brand-400" />
                  <span className="truncate">{selectedConnectionName || "No database selected"}</span>
                  <span className="hidden sm:inline">· Shift+Enter for a new line</span>
                </span>
                <button
                  aria-label="Send"
                  className="ml-auto grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-500 text-white transition enabled:hover:bg-brand-400 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-ink-faint"
                  disabled={isSending || !question.trim() || !selectedConnectionId}
                  type="submit"
                >
                  {isSending ? <Loader2 className="animate-spin" size={15} /> : <Send size={15} />}
                </button>
              </div>
            </div>
          </div>
        </form>
      )}
    </section>
  );
}

function MessageRow({ message, children }: { message: UiMessage; children?: ReactNode }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end py-2.5">
        <div className="max-w-[85%] rounded-[20px] bg-sand px-4 py-2.5 text-[15px] leading-6 text-ink sm:max-w-[75%]">
          <p className="whitespace-pre-line">{message.content}</p>
        </div>
      </div>
    );
  }

  const isError = message.isError;
  const isClarifying = Boolean(message.result?.needs_clarification);

  return (
    <div className="flex justify-start py-2.5">
      <div
        className={`w-full text-[15px] leading-7 ${
          isError
            ? "rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-rose-200"
            : isClarifying
              ? "rounded-xl border border-sky-500/25 bg-sky-500/10 px-4 py-3 text-sky-200"
              : "text-ink"
        } ${message.content || children ? "" : "hidden"}`}
      >
        {isClarifying && (
          <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-sky-300">
            <CircleHelp size={13} /> Quick question
          </p>
        )}
        {message.content && <p className={`whitespace-pre-line ${children ? "mb-2" : ""}`}>{message.content}</p>}
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
  needsDatabase,
  onOpenConnections,
  onPickDatabase
}: {
  hasConnection: boolean;
  needsDatabase: boolean;
  onOpenConnections: () => void;
  onPickDatabase: () => void;
}) {
  return (
    <div className="flex flex-col items-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-500/15">
        <LogoMark className="h-9 w-9" />
      </span>
      <h1 className="mt-5 font-display text-[26px] font-semibold tracking-tight text-ink">
        {hasConnection ? (needsDatabase ? "Pick a database for this chat" : "What should we look at?") : "Connect a database to begin"}
      </h1>
      <p className="mt-2 max-w-md text-sm leading-6 text-ink-soft">
        {hasConnection
          ? needsDatabase
            ? "Every chat is linked to one database. Choose which one this conversation should use — it stays fixed afterwards."
            : "Ask in plain English. QueryMind writes the SQL, checks it against your schema, and pauses before touching any data."
          : "AI chat unlocks after QueryMind discovers your database structure."}
      </p>
      {!hasConnection && (
        <button className="btn-primary mt-6" onClick={onOpenConnections} type="button">
          <PlugZap size={16} /> Connect database
        </button>
      )}
      {hasConnection && needsDatabase && (
        <button className="btn-primary mt-6" onClick={onPickDatabase} type="button">
          <Database size={16} /> Choose a database
        </button>
      )}
    </div>
  );
}

function ResultBlock({
  confirmingQueryId,
  connectionName,
  dismissedQueryIds,
  decisionNonce,
  isConfirmed,
  onConfirm,
  onCancel,
  result
}: {
  confirmingQueryId: number | null;
  connectionName?: string;
  dismissedQueryIds: Set<number>;
  decisionNonce: number;
  isConfirmed: boolean;
  result: QueryResponse;
  onCancel: (id: number) => void;
  onConfirm: (id: number) => void;
}) {
  void decisionNonce; // decision sets are mutated in place — nonce drives the re-render
  const isConfirming = confirmingQueryId === result.query_id;
  const isCancelled = dismissedQueryIds.has(result.query_id) || result.is_cancelled === true;
  const chartSpec = useMemo(() => buildChartSpec(result.columns, result.rows), [result.columns, result.rows]);
  // The AI decides whether a result opens as a chart or a table ("text" and
  // unparseable shapes fall back to the table). The user can still toggle.
  const [view, setView] = useState<"chart" | "table">(
    result.visualization === "chart" && chartSpec ? "chart" : "table"
  );
  const [copied, setCopied] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);

  const [isTimedOut, setIsTimedOut] = useState(() => {
    if (!result.expires_at) return false;
    const expiryTime = parseUtcDate(result.expires_at);
    return expiryTime > 0 && expiryTime <= Date.now();
  });

  useEffect(() => {
    if (!result.expires_at || isConfirmed || isCancelled) return;
    const expiryTime = parseUtcDate(result.expires_at);
    if (expiryTime <= 0) return;
    const remaining = expiryTime - Date.now();
    if (remaining <= 0) {
      setIsTimedOut(true);
      return;
    }
    const timer = window.setTimeout(() => {
      setIsTimedOut(true);
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [result.expires_at, isConfirmed, isCancelled]);

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
    setExportError(null);
    try {
      // Lazy-loaded: keeps jsPDF and its canvas dependencies out of the
      // initial bundle; they are only fetched when a report is exported.
      const { downloadQueryReport } = await import("../lib/reportPdf");
      await downloadQueryReport({
        chartSvg: chartRef.current?.querySelector("svg") ?? null,
        columns: result.columns,
        connectionName,
        rows: result.rows,
        sql: result.sql,
        summary: result.summary
      });
    } catch {
      setExportError("Could not generate the PDF. Check your connection and try again.");
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="mt-2 space-y-3 pb-1">
      {/* SQL + actions live in one quiet rail under the answer */}
      <div className="overflow-hidden rounded-xl border border-line bg-[#0b0c0e]">
        <div className="flex items-center justify-between border-b border-line px-3 py-1.5">
          <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-ink-faint">
            SQL
            {result.query_type && <span className="rounded bg-white/5 px-1.5 py-0.5 normal-case tracking-normal text-ink-faint">{result.query_type}</span>}
          </span>
          <span className="flex items-center gap-0.5">
            <button
              aria-label="Download PDF report"
              className="grid h-7 w-7 place-items-center rounded-md text-ink-faint transition hover:bg-white/5 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isExporting}
              onClick={exportPdf}
              title="Download PDF report"
              type="button"
            >
              {isExporting ? <Loader2 className="animate-spin" size={13} /> : <FileDown size={13} />}
            </button>
            <button
              aria-label={copied ? "Copied" : "Copy SQL"}
              className="grid h-7 w-7 place-items-center rounded-md text-ink-faint transition hover:bg-white/5 hover:text-ink"
              onClick={copySql}
              title="Copy SQL"
              type="button"
            >
              {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
            </button>
          </span>
        </div>
        <code className="block overflow-x-auto px-4 py-3 font-mono text-[13px] leading-6 text-[#a7ded7]">{result.sql}</code>
      </div>

      {result.steps && result.steps.length > 0 && (
        <div className="rounded-xl border border-line bg-white/[0.03] p-3">
          <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
            <Search size={12} /> How I got this answer
          </p>
          {result.steps.map((step, index) => (
            <div className="flex items-start gap-2 py-0.5" key={index}>
              <span className="mt-0.5 shrink-0">
                {step.error ? (
                  <XCircle className="text-rose-400" size={13} />
                ) : step.tool === "run_sql" ? (
                  <SquareSlash className="text-brand-400" size={13} />
                ) : (
                  <Search className="text-ink-faint" size={13} />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className={`truncate text-xs font-medium ${step.error ? "text-rose-300" : "text-ink-soft"}`}>{step.label}</p>
                {step.sql ? (
                  <code className="block truncate font-mono text-[10px] text-ink-faint">{step.sql}</code>
                ) : step.detail ? (
                  <p className="truncate text-[10px] text-ink-faint">{step.detail}</p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      {result.conflict_warning?.has_conflict && (
        <div className="flex items-start gap-2.5 rounded-xl border border-rose-500/25 bg-rose-500/10 p-3 text-xs">
          <AlertTriangle className="mt-0.5 shrink-0 text-rose-300" size={16} />
          <div>
            <p className="font-semibold text-rose-200">Duplicate key conflict detected</p>
            <p className="mt-0.5 text-rose-300">{result.conflict_warning.message}</p>
          </div>
        </div>
      )}

      {result.requires_confirmation && !isConfirmed && !isCancelled && !isTimedOut && (
        <div className={`flex flex-wrap items-center gap-3 rounded-xl border p-3 ${
          result.conflict_warning?.has_conflict ? "border-rose-500/25 bg-rose-500/10" : "border-amber-500/25 bg-amber-500/10"
        }`}>
          <p className={`min-w-0 flex-1 text-xs font-medium leading-5 ${
            result.conflict_warning?.has_conflict ? "text-rose-200" : "text-amber-200"
          }`}>
            {result.conflict_warning?.has_conflict
              ? "Cannot run: a duplicate key conflict was found. Modify the value or table data first."
              : "This query modifies data. Run it only if the SQL above looks right."}
          </p>
          <span className="flex w-full shrink-0 items-center justify-end gap-2 sm:w-auto">
            <button
              className="btn-primary h-9 min-w-28"
              disabled={isConfirming || Boolean(result.conflict_warning?.has_conflict)}
              onClick={() => onConfirm(result.query_id)}
              type="button"
            >
              {isConfirming ? <Loader2 className="animate-spin" size={15} /> : <Check size={15} />}
              {isConfirming ? "Running" : "Confirm & run"}
            </button>
            <button className="btn-secondary h-9" disabled={isConfirming} onClick={() => onCancel(result.query_id)} type="button">
              <X size={15} /> Cancel
            </button>
          </span>
        </div>
      )}

      {result.requires_confirmation && !isConfirmed && !isCancelled && isTimedOut && (
        <div className="flex items-center gap-2 rounded-xl border border-line bg-white/5 p-3 text-xs font-medium text-ink-soft">
          <Clock className="text-ink-faint" size={15} />
          <span>Confirmation request expired after 15 minutes and was automatically cancelled.</span>
        </div>
      )}

      {isCancelled && (
        <span className="status-pill border-rose-500/25 bg-rose-500/10 text-rose-300">
          <X size={13} /> Cancelled — nothing was executed
        </span>
      )}

      {exportError && (
        <p className="rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-300" role="alert">{exportError}</p>
      )}

      {isConfirmed && result.query_type !== "SELECT" && (
        <span className="status-pill pill-success"><Check size={13} /> Confirmed</span>
      )}

      {result.rows.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-line">
          <div className="flex items-center justify-between border-b border-line bg-white/[0.03] px-3 py-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
              {result.rows.length} row{result.rows.length === 1 ? "" : "s"}
            </span>
            {chartSpec && (
              <div className="flex gap-0.5 rounded-lg border border-line bg-canvas p-0.5">
                {(["table", "chart"] as const).map((option) => (
                  <button
                    className={`flex items-center gap-1 rounded-md px-2.5 py-0.5 text-[11px] font-medium transition ${
                      view === option ? "bg-raise text-ink" : "text-ink-soft hover:text-ink"
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

          {chartSpec && (
            <div className={view === "chart" ? "p-2" : "hidden"} ref={chartRef}>
              <QueryChart spec={chartSpec} totalRows={result.rows.length} />
            </div>
          )}

          {(view === "table" || !chartSpec) && (
            <div className="overflow-x-auto bg-canvas/60">
              <table className="w-full min-w-[520px] text-left text-[13px]">
                <thead>
                  <tr className="border-b border-line text-[11px] uppercase tracking-wider text-ink-faint">
                    {result.columns.map((column, columnIndex) => (
                      <th className="px-3.5 py-2 font-medium" key={`${column}-${columnIndex}`}>{column}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {result.rows.map((row, index) => (
                    <tr className="transition-colors hover:bg-white/[0.03]" key={index}>
                      {result.columns.map((column, columnIndex) => {
                        const val = row[column];
                        const isNull = val === null || val === undefined || val === "";
                        return (
                          <td className="px-3.5 py-2 text-ink" key={`${column}-${columnIndex}`}>
                            {isNull ? (
                              <span className="select-none font-mono text-xs italic text-ink-faint">—</span>
                            ) : (
                              String(val)
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
