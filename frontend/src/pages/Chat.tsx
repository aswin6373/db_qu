import { FormEvent, useState } from "react";
import { Check, Loader2, Send, X } from "lucide-react";
import { apiRequest } from "../lib/api";
import { Connection, QueryResponse } from "../types/api";

type Props = {
  token: string;
  connections: Connection[];
  onActivity: () => void;
};

export function Chat({ token, connections, onActivity }: Props) {
  const [connectionId, setConnectionId] = useState<number | "">("");
  const [question, setQuestion] = useState("Show me all customers");
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string; result?: QueryResponse }>>([]);
  const [error, setError] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [confirmingQueryId, setConfirmingQueryId] = useState<number | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (isThinking || !question.trim()) return;
    setError("");
    setIsThinking(true);
    const nextQuestion = question.trim();
    setMessages((items) => [...items, { role: "user", content: nextQuestion }]);
    try {
      const result = await apiRequest<QueryResponse>("/query/generate", {
        method: "POST",
        body: JSON.stringify({ question: nextQuestion, connection_id: connectionId || null })
      }, token);
      setMessages((items) => [...items, { role: "assistant", content: result.summary, result }]);
      onActivity();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Query failed");
      setMessages((items) => [
        ...items,
        { role: "assistant", content: "I could not finish that request. Please check Ollama/backend status and try again." }
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
    <section className="flex min-h-[calc(100vh-3rem)] flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">AI Chat</h1>
        <p className="text-sm text-slate-600">Ask in plain English. Write queries wait for confirmation.</p>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto rounded border border-slate-200 bg-white p-4">
        {messages.map((message, index) => (
          <div className={`max-w-3xl rounded p-3 ${message.role === "user" ? "ml-auto bg-forest text-white" : "bg-mist text-ink"}`} key={index}>
            <p>{message.content}</p>
            {message.result && <ResultBlock confirmingQueryId={confirmingQueryId} result={message.result} onConfirm={confirm} />}
          </div>
        ))}
        {isThinking && (
          <div className="flex max-w-3xl items-center gap-3 rounded bg-mist p-3 text-ink">
            <Loader2 className="animate-spin text-forest" size={18} />
            <div>
              <p className="font-medium">Qwen is thinking...</p>
              <p className="text-sm text-slate-600">Generating SQL with your local Ollama model.</p>
            </div>
          </div>
        )}
        {messages.length === 0 && <p className="text-sm text-slate-600">Your first demo query will use a sample customers schema if no connection is selected.</p>}
      </div>
      {error && <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <form className="grid gap-3 rounded border border-slate-200 bg-white p-3 md:grid-cols-[220px_1fr_auto]" onSubmit={submit}>
        <select className="focus-ring rounded border border-slate-300 px-3 py-2 disabled:bg-slate-100" disabled={isThinking} value={connectionId} onChange={(event) => setConnectionId(event.target.value ? Number(event.target.value) : "")}>
          <option value="">Demo schema</option>
          {connections.map((connection) => <option key={connection.id} value={connection.id}>{connection.name}</option>)}
        </select>
        <input className="focus-ring rounded border border-slate-300 px-3 py-2 disabled:bg-slate-100" disabled={isThinking} value={question} onChange={(event) => setQuestion(event.target.value)} />
        <button className="focus-ring flex min-w-28 items-center justify-center gap-2 rounded bg-coral px-4 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400" disabled={isThinking || !question.trim()} type="submit">
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
      <code className="block overflow-x-auto rounded bg-slate-950 px-3 py-2 text-sm text-slate-100">{result.sql}</code>
      {result.requires_confirmation && (
        <div className="flex gap-2">
          <button className="flex min-w-28 items-center justify-center gap-2 rounded bg-forest px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400" disabled={isConfirming} onClick={() => onConfirm(result.query_id)} type="button">
            {isConfirming ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />}
            {isConfirming ? "Running" : "Confirm"}
          </button>
          <button className="flex items-center gap-2 rounded border border-slate-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100" disabled={isConfirming} type="button">
            <X size={16} /> Cancel
          </button>
        </div>
      )}
      {result.rows.length > 0 && (
        <div className="overflow-x-auto rounded border border-slate-200 bg-white text-ink">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="bg-slate-100">
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
