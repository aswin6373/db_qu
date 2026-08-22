import { FormEvent, useEffect, useState } from "react";
import { Bot, Check, Database, Loader2, PlugZap, Send, Sparkles, X } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { apiRequest } from "../lib/api";
import { Connection, QueryResponse } from "../types/api";

type Props = {
  token: string;
  connections: Connection[];
  onActivity: () => void;
  onOpenConnections: () => void;
};

export function Chat({ token, connections, onActivity, onOpenConnections }: Props) {
  const [connectionId, setConnectionId] = useState<number | "">("");
  const [question, setQuestion] = useState("Show me all customers");
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string; result?: QueryResponse }>>([]);
  const [error, setError] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [confirmingQueryId, setConfirmingQueryId] = useState<number | null>(null);

  useEffect(() => {
    if (!connectionId && connections.length > 0) {
      setConnectionId(connections[0].id);
    }
  }, [connectionId, connections]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (isThinking || !question.trim() || !connectionId) return;
    setError("");
    setIsThinking(true);
    const nextQuestion = question.trim();
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
      setMessages((items) => [
        ...items,
        { role: "assistant", content: message }
      ]);
    } finally {
      setIsThinking(false);
    }
  }

  async function confirm(queryId: number) {
    setError("");
    setConfirmingQueryId(queryId);
    try {
      const result = await apiRequest<QueryResponse>(`/query/${queryId}/confirm`, { method: "POST" }, token);
      setMessages((items) => [...items, { role: "assistant", content: result.summary, result }]);
      onActivity();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Confirmation failed");
    } finally {
      setConfirmingQueryId(null);
    }
  }

  return (
    <section className="flex min-h-[calc(100vh-4rem)] flex-col gap-5">
      <PageHeader
        eyebrow="AI SQL Workspace"
        title="Chat With Your Database"
        description="Ask natural-language questions against a selected MySQL connection. QueryMind validates SQL and pauses before write operations."
      />
      {connections.length === 0 && (
        <section className="panel border-coral/30 p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-ink">Connect a database first</h2>
              <p className="text-sm text-steel">AI chat is enabled only after QueryMind discovers the database structure.</p>
            </div>
            <button className="btn-accent" onClick={onOpenConnections} type="button">
              <PlugZap size={18} /> Connect Database
            </button>
          </div>
        </section>
      )}
      <div className="panel flex-1 space-y-4 overflow-y-auto p-5">
        {messages.map((message, index) => (
          <div className={`max-w-4xl rounded-lg border p-4 ${message.role === "user" ? "ml-auto border-forest bg-forest text-white" : "border-line bg-paper text-ink"}`} key={index}>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide opacity-80">
              {message.role === "user" ? <Database size={14} /> : <Bot size={14} />}
              {message.role === "user" ? "You" : "QueryMind"}
            </div>
            <p className="leading-6">{message.content}</p>
            {message.result && <ResultBlock confirmingQueryId={confirmingQueryId} result={message.result} onConfirm={confirm} />}
          </div>
        ))}
        {isThinking && (
          <div className="panel-soft flex max-w-4xl items-center gap-3 p-4 text-ink">
            <Loader2 className="animate-spin text-forest" size={18} />
            <div>
              <p className="font-medium">Qwen is thinking...</p>
              <p className="text-sm text-steel">Generating SQL with your local Ollama model.</p>
            </div>
          </div>
        )}
        {messages.length === 0 && (
          <div className="grid min-h-72 place-items-center rounded-lg border border-dashed border-line bg-paper px-4 text-center">
            <div>
              <Sparkles className="mx-auto mb-3 text-forest" size={26} />
              <p className="font-semibold text-ink">{connections.length === 0 ? "Connect a database to begin." : "Choose a connection and ask your first database question."}</p>
              <p className="mt-2 text-sm text-steel">Try asking for a filtered list, an insert with exact values, or a safe update that you can confirm.</p>
            </div>
          </div>
        )}
      </div>
      {error && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <form className="panel grid gap-3 p-3 md:grid-cols-[260px_1fr_auto]" onSubmit={submit}>
        <select className="field" disabled={isThinking} value={connectionId} onChange={(event) => setConnectionId(event.target.value ? Number(event.target.value) : "")}>
          {connections.length === 0 && <option value="">No database connected</option>}
          {connections.map((connection) => <option key={connection.id} value={connection.id}>{connection.name}</option>)}
        </select>
        <input className="field" disabled={isThinking || connections.length === 0} value={question} onChange={(event) => setQuestion(event.target.value)} />
        <button className="btn-accent min-w-28" disabled={isThinking || !question.trim() || !connectionId} type="submit">
          {isThinking ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
          {isThinking ? "Thinking" : "Send"}
        </button>
      </form>
    </section>
  );
}

function ResultBlock({ confirmingQueryId, result, onConfirm }: { confirmingQueryId: number | null; result: QueryResponse; onConfirm: (id: number) => void }) {
  const isConfirming = confirmingQueryId === result.query_id;
  return (
    <div className="mt-3 space-y-3">
      <code className="code-block">{result.sql}</code>
      {result.requires_confirmation && (
        <div className="flex gap-2">
          <button className="btn-primary min-w-28" disabled={isConfirming} onClick={() => onConfirm(result.query_id)} type="button">
            {isConfirming ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />}
            {isConfirming ? "Running" : "Confirm"}
          </button>
          <button className="btn-secondary" disabled={isConfirming} type="button">
            <X size={16} /> Cancel
          </button>
        </div>
      )}
      {result.rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-line bg-white text-ink">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="bg-paper text-xs uppercase tracking-wide text-steel">
              <tr>{result.columns.map((column) => <th className="px-3 py-2" key={column}>{column}</th>)}</tr>
            </thead>
            <tbody>
              {result.rows.map((row, index) => (
                <tr className="border-t border-slate-100" key={index}>
                  {result.columns.map((column) => <td className="px-3 py-2" key={column}>{String(row[column] ?? "")}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
