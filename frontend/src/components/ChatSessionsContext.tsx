import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { apiRequest } from "../lib/api";
import type { ChatSession } from "../types/api";

type ChatSessionsValue = {
  sessions: ChatSession[];
  isLoading: boolean;
  activeId: number | null;
  newChat: () => void;
  openSession: (id: number) => void;
  ensureSession: (connectionId?: number | null) => Promise<number>;
  refresh: () => void;
  renameSession: (session: ChatSession, title: string) => Promise<void>;
  deleteSession: (session: ChatSession) => Promise<void>;
};

const ChatSessionsContext = createContext<ChatSessionsValue | null>(null);

export function ChatSessionsProvider({ token, children }: { token: string; children: ReactNode }) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeId, setActiveId] = useState<number | null>(null);
  const refreshGenerationRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    apiRequest<ChatSession[]>("/chat/sessions", {}, token)
      .then((items) => {
        if (!cancelled) setSessions(items);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const refresh = useCallback(() => {
    // Out-of-order responses must not revert a newer list to an older one.
    const generation = ++refreshGenerationRef.current;
    apiRequest<ChatSession[]>("/chat/sessions", {}, token)
      .then((items) => {
        if (refreshGenerationRef.current === generation) setSessions(items);
      })
      .catch(() => undefined);
  }, [token]);

  const newChat = useCallback(() => {
    setActiveId(null);
  }, []);

  const openSession = useCallback((id: number) => {
    setActiveId(id);
  }, []);

  const ensureSession = useCallback(async (connectionId?: number | null) => {
    if (activeId !== null) return activeId;
    const created = await apiRequest<ChatSession>("/chat/sessions", {
      method: "POST",
      body: JSON.stringify(connectionId ? { connection_id: connectionId } : {})
    }, token);
    setSessions((items) => [created, ...items]);
    setActiveId(created.id);
    return created.id;
  }, [activeId, token]);

  const renameSession = useCallback(async (session: ChatSession, title: string) => {
    const updated = await apiRequest<ChatSession>(`/chat/sessions/${session.id}`, {
      method: "PATCH",
      body: JSON.stringify({ title })
    }, token);
    setSessions((items) => items.map((item) => (item.id === session.id ? { ...item, title: updated.title } : item)));
  }, [token]);

  const deleteSession = useCallback(async (session: ChatSession) => {
    await apiRequest(`/chat/sessions/${session.id}`, { method: "DELETE" }, token);
    setSessions((items) => items.filter((item) => item.id !== session.id));
    setActiveId((current) => (current === session.id ? null : current));
  }, [token]);

  const value = useMemo<ChatSessionsValue>(() => ({
    sessions,
    isLoading,
    activeId,
    newChat,
    openSession,
    ensureSession,
    refresh,
    renameSession,
    deleteSession
  }), [sessions, isLoading, activeId, newChat, openSession, ensureSession, refresh, renameSession, deleteSession]);

  return <ChatSessionsContext.Provider value={value}>{children}</ChatSessionsContext.Provider>;
}

export function useChatSessions() {
  const value = useContext(ChatSessionsContext);
  if (!value) throw new Error("useChatSessions must be used inside ChatSessionsProvider");
  return value;
}
