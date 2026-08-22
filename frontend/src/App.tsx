import { useEffect, useState } from "react";
import { AuthPanel } from "./components/AuthPanel";
import { Shell } from "./components/Shell";
import { apiRequest } from "./lib/api";
import { Chat } from "./pages/Chat";
import { Connections } from "./pages/Connections";
import { Dashboard } from "./pages/Dashboard";
import { History } from "./pages/History";
import { Connection, Dashboard as DashboardType, DatabaseSchema } from "./types/api";

export function App() {
  const [token, setToken] = useState(() => localStorage.getItem("querymind_token") ?? "");
  const [active, setActive] = useState("dashboard");
  const [connections, setConnections] = useState<Connection[]>([]);
  const [dashboard, setDashboard] = useState<DashboardType | null>(null);
  const [schemas, setSchemas] = useState<Record<number, DatabaseSchema>>({});

  useEffect(() => {
    if (!token) return;
    localStorage.setItem("querymind_token", token);
    refreshAll();
  }, [token]);

  async function refreshAll() {
    if (!token) return;
    const [connectionData, dashboardData] = await Promise.all([
      apiRequest<Connection[]>("/connections", {}, token).catch(() => []),
      apiRequest<DashboardType>("/organizations/dashboard", {}, token).catch(() => null)
    ]);
    setConnections(connectionData);
    setDashboard(dashboardData);
    if (connectionData.length === 0) {
      setActive("connections");
      setSchemas({});
      return;
    }
    const schemaEntries = await Promise.all(
      connectionData.map(async (connection) => {
        const schema = await apiRequest<DatabaseSchema>(`/connections/${connection.id}/schema`, {}, token).catch(() => null);
        return [connection.id, schema] as const;
      })
    );
    setSchemas(Object.fromEntries(schemaEntries.filter(([, schema]) => schema !== null)) as Record<number, DatabaseSchema>);
  }

  function logout() {
    localStorage.removeItem("querymind_token");
    setToken("");
  }

  if (!token) {
    return <AuthPanel onToken={setToken} />;
  }

  return (
    <Shell active={active} onActive={setActive} onLogout={logout}>
      {active === "dashboard" && <Dashboard connections={connections} dashboard={dashboard} schemas={schemas} onOpenConnections={() => setActive("connections")} />}
      {active === "connections" && <Connections token={token} connections={connections} schemas={schemas} onRefresh={refreshAll} />}
      {active === "chat" && <Chat token={token} connections={connections} onActivity={refreshAll} onOpenConnections={() => setActive("connections")} />}
      {active === "history" && <History dashboard={dashboard} />}
    </Shell>
  );
}
