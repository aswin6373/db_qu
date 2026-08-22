import { FormEvent, useState } from "react";
import { Check, Send, X } from "lucide-react";
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

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessages((items) => [...items, { role: "user", content: question }]);
    try {
      const result = await apiRequest<QueryResponse>("/query/generate", {
        method: "POST",
        body: JSON.stringify({ question, connection_id: connectionId || null })
      }, token);
      setMessages((items) => [...items, { role: "assistant", content: result.summary, result }]);
      onActivity();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Query failed");
    }
  }

  async function confirm(queryId: number) {
    const result = await apiRequest<QueryResponse>(`/query/${queryId}/confirm`, { method: "POST" }, token);
    setMessages((items) => [...items, { role: "assistant", content: result.summary, result }]);
    onActivity();
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
            {message.result && <ResultBlock result={message.result} onConfirm={confirm} />}
          </div>
        ))}
        {messages.length === 0 && <p className="text-sm text-slate-600">Your first demo query will use a sample customers schema if no connection is selected.</p>}
      </div>
      {error && <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <form className="grid gap-3 rounded border border-slate-200 bg-white p-3 md:grid-cols-[220px_1fr_auto]" onSubmit={submit}>
        <select className="focus-ring rounded border border-slate-300 px-3 py-2" value={connectionId} onChange={(event) => setConnectionId(event.target.value ? Number(event.target.value) : "")}>
          <option value="">Demo schema</option>
          {connections.map((connection) => <option key={connection.id} value={connection.id}>{connection.name}</option>)}
        </select>
        <input className="focus-ring rounded border border-slate-300 px-3 py-2" value={question} onChange={(event) => setQuestion(event.target.value)} />
        <button className="focus-ring flex items-center justify-center gap-2 rounded bg-coral px-4 py-2 font-semibold text-white" type="submit">
          <Send size={18} /> Send
        </button>
      </form>
    </section>
  );
}

function ResultBlock({ result, onConfirm }: { result: QueryResponse; onConfirm: (id: number) => void }) {
  return (
    <div className="mt-3 space-y-3">
      <code className="block overflow-x-auto rounded bg-slate-950 px-3 py-2 text-sm text-slate-100">{result.sql}</code>
      {result.requires_confirmation && (
        <div className="flex gap-2">
          <button className="flex items-center gap-2 rounded bg-forest px-3 py-2 text-sm font-semibold text-white" onClick={() => onConfirm(result.query_id)} type="button">
            <Check size={16} /> Confirm
          </button>
          <button className="flex items-center gap-2 rounded border border-slate-300 px-3 py-2 text-sm" type="button">
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
