import { FormEvent, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Bot,
  Check,
  Database,
  Loader2,
  MessageSquarePlus,
  PanelLeft,
  Pencil,
  PlugZap,
  Send,
  Sparkles,
  Trash2,
  User,
  X
} from "lucide-react";
import { apiRequest } from "../lib/api";
import { ChatMessage, ChatSession, Connection, QueryResponse } from "../types/api";

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
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [question, setQuestion] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [connectionId, setConnectionId] = useState<number | "">("");
  const [confirmingQueryId, setConfirmingQueryId] = useState<number | null>(null);
  const [confirmedQueryIds, setConfirmedQueryIds] = useState<Set<number>>(new Set());
  const [dismissedQueryIds, setDismissedQueryIds] = useState<Set<number>>(new Set());
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const tempIdRef = useRef(-1);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const activeSession = sessions.find((session) => session.id === activeId) ?? null;
  const hasConnection = connections.length > 0;

  useEffect(() => {
    if (!connectionId && connections.length > 0) {
      setConnectionId(connections[0].id);
    }
  }, [connectionId, connections]);

  useEffect(() => {
    let cancelled = false;
    setSessionsLoading(true);
    apiRequest<ChatSession[]>("/chat/sessions", {}, token)
      .then((items) => {
        if (!cancelled) setSessions(items);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setSessionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, isSending]);

  useEffect(() => {
    if (renamingId !== null) renameInputRef.current?.select();
  }, [renamingId]);

  function loadSessions() {
    apiRequest<ChatSession[]>("/chat/sessions", {}, token)
      .then((items) => setSessions(items))
      .catch(() => undefined);
  }

  function newChat() {
    setActiveId(null);
    setMessages([]);
    setConfirmedQueryIds(new Set());
    setDismissedQueryIds(new Set());
    setDrawerOpen(false);
  }

  async function openSession(id: number) {
    if (isSending || id === activeId) {
      setDrawerOpen(false);
      return;
    }
    setActiveId(id);
    setMessages([]);
    setConfirmedQueryIds(new Set());
    setDismissedQueryIds(new Set());
    setMessagesLoading(true);
    setDrawerOpen(false);
    try {
      const history = await apiRequest<ChatMessage[]>(`/chat/sessions/${id}`, {}, token);
      setMessages(history);
    } catch {
      setMessages([{ id: -1, role: "assistant", content: "Could not load this conversation.", isError: true }]);
    } finally {
      setMessagesLoading(false);
    }
  }

  async function ensureSession(): Promise<number> {
    if (activeId !== null) return activeId;
    const created = await apiRequest<ChatSession>("/chat/sessions", { method: "POST", body: JSON.stringify({}) }, token);
    setSessions((items) => [created, ...items]);
    setActiveId(created.id);
    return created.id;
  }

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
      const result = await apiRequest<QueryResponse>("/query/generate", {
        method: "POST",
        body: JSON.stringify({ question: nextQuestion, connection_id: connectionId, session_id: sessionId })
      }, token);
      setMessages((items) => [...items, { id: tempIdRef.current--, role: "assistant", content: result.summary, result }]);
      loadSessions();
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

  async function saveRename(session: ChatSession) {
    const title = renameDraft.trim();
    setRenamingId(null);
    if (!title || title === session.title) return;
    try {
      const updated = await apiRequest<ChatSession>(`/chat/sessions/${session.id}`, {
        method: "PATCH",
        body: JSON.stringify({ title })
      }, token);
      setSessions((items) => items.map((item) => (item.id === session.id ? { ...item, title: updated.title } : item)));
    } catch {
      loadSessions();
    }
  }

  async function removeSession(session: ChatSession) {
    setDeletingId(null);
    try {
      await apiRequest(`/chat/sessions/${session.id}`, { method: "DELETE" }, token);
      setSessions((items) => items.filter((item) => item.id !== session.id));
      if (session.id === activeId) newChat();
    } catch {
      loadSessions();
    }
  }

  const sessionsPanel = (
    <SessionsPanel
      activeId={activeId}
      deletingId={deletingId}
      isLoading={sessionsLoading}
      renamingId={renamingId}
      renameDraft={renameDraft}
      renameInputRef={renameInputRef}
      sessions={sessions}
      onCancelDelete={() => setDeletingId(null)}
      onCancelRename={() => setRenamingId(null)}
      onChangeRenameDraft={setRenameDraft}
      onDelete={(session) => setDeletingId(session.id)}
      onNewChat={newChat}
      onRename={(session) => {
        setRenamingId(session.id);
        setRenameDraft(session.title);
      }}
      onSaveRename={saveRename}
      onSelect={openSession}
      onConfirmDelete={removeSession}
    />
  );

  return (
    <section className="relative flex h-full overflow-hidden bg-white">
      {/* Sessions sidebar — static on desktop */}
      <aside className="hidden w-72 shrink-0 border-r border-slate-200/80 bg-slate-50/70 lg:flex lg:flex-col">
        {sessionsPanel}
      </aside>

      {/* Sessions sidebar — drawer on mobile */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-navy/50 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-80 max-w-[85vw] flex-col border-r border-slate-200 bg-white shadow-lift">
            {sessionsPanel}
          </aside>
        </div>
      )}

      {/* Conversation column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-100 px-4 sm:px-6">
          <button
            aria-label="Open chats"
            className="btn-ghost -ml-2 lg:hidden"
            onClick={() => setDrawerOpen(true)}
            type="button"
          >
            <PanelLeft size={18} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">
              {activeSession?.title ?? "New chat"}
            </p>
            {activeSession && (
              <p className="text-[11px] text-slate-400">
                {activeSession.message_count} message{activeSession.message_count === 1 ? "" : "s"}
              </p>
            )}
          </div>
          <select
            aria-label="Database connection"
            className="field h-9 hidden max-w-52 text-xs sm:block"
            disabled={isSending}
            value={connectionId}
            onChange={(event) => setConnectionId(event.target.value ? Number(event.target.value) : "")}
          >
            {connections.length === 0 && <option value="">No database connected</option>}
            {connections.map((connection) => (
              <option key={connection.id} value={connection.id}>{connection.name}</option>
            ))}
          </select>
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
                    {message.result && (
                      <ResultBlock
                        confirmingQueryId={confirmingQueryId}
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
      </div>
    </section>
  );
}

function SessionsPanel({
  activeId,
  deletingId,
  isLoading,
  renameDraft,
  renamingId,
  renameInputRef,
  sessions,
  onCancelDelete,
  onCancelRename,
  onChangeRenameDraft,
  onConfirmDelete,
  onDelete,
  onNewChat,
  onRename,
  onSaveRename,
  onSelect
}: {
  activeId: number | null;
  deletingId: number | null;
  isLoading: boolean;
  renameDraft: string;
  renamingId: number | null;
  renameInputRef: React.RefObject<HTMLInputElement | null>;
  sessions: ChatSession[];
  onCancelDelete: () => void;
  onCancelRename: () => void;
  onChangeRenameDraft: (value: string) => void;
  onConfirmDelete: (session: ChatSession) => void;
  onDelete: (session: ChatSession) => void;
  onNewChat: () => void;
  onRename: (session: ChatSession) => void;
  onSaveRename: (session: ChatSession) => void;
  onSelect: (id: number) => void;
}) {
  return (
    <>
      <div className="space-y-3 p-3">
        <button className="btn-accent w-full" onClick={onNewChat} type="button">
          <MessageSquarePlus size={16} /> New chat
        </button>
      </div>
      <p className="eyebrow px-4 pb-1.5 pt-1 text-slate-400">Chats</p>
      <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
        {isLoading ? (
          <div className="flex justify-center py-8 text-slate-300">
            <Loader2 className="animate-spin" size={18} />
          </div>
        ) : sessions.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs leading-5 text-slate-400">
            No chats yet. Start a conversation and it will appear here.
          </p>
        ) : (
          sessions.map((session) => {
            const isActive = session.id === activeId;
            const isRenaming = renamingId === session.id;
            const isDeleting = deletingId === session.id;

            if (isRenaming) {
              return (
                <div className="px-1 py-0.5" key={session.id}>
                  <input
                    autoFocus
                    className="field h-9 text-sm"
                    onBlur={() => onSaveRename(session)}
                    onChange={(event) => onChangeRenameDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") onSaveRename(session);
                      if (event.key === "Escape") onCancelRename();
                    }}
                    ref={renameInputRef}
                    value={renameDraft}
                  />
                </div>
              );
            }

            return (
              <div
                className={`group relative flex items-center rounded-lg transition ${
                  isActive ? "bg-brand-100/70 text-brand-900" : "text-slate-600 hover:bg-slate-200/50"
                } ${isDeleting ? "bg-rose-50 text-rose-700" : ""}`}
                key={session.id}
              >
                <button
                  className="min-w-0 flex-1 truncate px-3 py-2.5 text-left text-sm"
                  onClick={() => onSelect(session.id)}
                  title={session.title}
                  type="button"
                >
                  {session.title}
                </button>
                {isDeleting ? (
                  <span className="flex items-center gap-1 pr-2">
                    <button
                      aria-label="Confirm delete"
                      className="grid h-7 w-7 place-items-center rounded-md bg-rose-600 text-white transition hover:bg-rose-700"
                      onClick={() => onConfirmDelete(session)}
                      type="button"
                    >
                      <Check size={13} />
                    </button>
                    <button
                      aria-label="Keep chat"
                      className="grid h-7 w-7 place-items-center rounded-md text-slate-500 transition hover:bg-slate-200"
                      onClick={onCancelDelete}
                      type="button"
                    >
                      <X size={13} />
                    </button>
                  </span>
                ) : (
                  <span className="flex items-center gap-0.5 pr-1.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                    <button
                      aria-label={`Rename ${session.title}`}
                      className="grid h-7 w-7 place-items-center rounded-md text-slate-400 transition hover:bg-white hover:text-slate-700"
                      onClick={() => onRename(session)}
                      type="button"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      aria-label={`Delete ${session.title}`}
                      className="grid h-7 w-7 place-items-center rounded-md text-slate-400 transition hover:bg-white hover:text-rose-600"
                      onClick={() => onDelete(session)}
                      type="button"
                    >
                      <Trash2 size={13} />
                    </button>
                  </span>
                )}
              </div>
            );
          })
        )}
      </nav>
      <p className="border-t border-slate-200/80 px-4 py-3 text-[11px] leading-4 text-slate-400">
        Chats are saved per workspace. Rename or delete them anytime.
      </p>
    </>
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

  return (
    <div className="flex gap-3">
      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-brand-600 to-brand-800 text-white shadow-sm shadow-brand-600/25">
        <Bot size={15} />
      </span>
      <div
        className={`min-w-0 flex-1 rounded-2xl rounded-tl-md border px-4 py-3 text-sm leading-6 ${
          isError ? "border-rose-200 bg-rose-50 text-rose-700" : "border-slate-200 bg-white text-slate-700"
        } ${message.content || children ? "" : "hidden"}`}
      >
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
  dismissedQueryIds,
  isConfirmed,
  onConfirm,
  onCancel,
  result
}: {
  confirmingQueryId: number | null;
  dismissedQueryIds: Set<number>;
  isConfirmed: boolean;
  result: QueryResponse;
  onCancel: (id: number) => void;
  onConfirm: (id: number) => void;
}) {
  const isConfirming = confirmingQueryId === result.query_id;
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
