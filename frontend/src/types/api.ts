export type Connection = {
  id: number;
  name: string;
  host: string;
  port: number;
  username: string;
  database_name: string;
};

export type DatabaseColumn = {
  name: string;
  type: string;
  key: string;
};

export type DatabaseSchema = {
  tables: Record<string, { columns: DatabaseColumn[] }>;
};

export type QueryResponse = {
  query_id: number;
  sql: string;
  query_type: string;
  requires_confirmation: boolean;
  summary: string;
  columns: string[];
  rows: Record<string, unknown>[];
};

export type Dashboard = {
  organization: { id: number; name: string };
  connection_count: number;
  query_count: number;
  recent_activity: Array<{
    id: number;
    question: string;
    sql: string;
    status: string;
  }>;
};
