import { DatabaseZap, KeyRound, Table2 } from "lucide-react";
import { DatabaseSchema } from "../types/api";

type Props = {
  schema?: DatabaseSchema | null;
  title?: string;
};

export function SchemaGraph({ schema, title = "Database Structure" }: Props) {
  const tables = Object.entries(schema?.tables ?? {});
  const tableCount = tables.length;
  const columnCount = tables.reduce((total, [, table]) => total + table.columns.length, 0);
  const keyCount = tables.reduce((total, [, table]) => total + table.columns.filter((column) => column.key).length, 0);

  return (
    <section className="panel p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <DatabaseZap className="text-forest" size={18} />
            <h2 className="text-lg font-semibold text-ink">{title}</h2>
          </div>
          <p className="mt-1 text-sm text-steel">{tableCount} tables, {columnCount} columns, {keyCount} key columns</p>
        </div>
        <div className="flex gap-2 text-xs text-steel">
          <span className="status-pill">PK primary</span>
          <span className="status-pill">MUL indexed</span>
        </div>
      </div>

      {tables.length === 0 ? (
        <p className="rounded-md border border-dashed border-line bg-paper px-4 py-8 text-center text-sm text-steel">No schema discovered yet. Save a live MySQL connection to load tables and columns.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {tables.map(([tableName, table]) => (
            <article className="overflow-hidden rounded-lg border border-line bg-paper" key={tableName}>
              <div className="flex items-center justify-between border-b border-line bg-white px-3 py-2.5">
                <div className="flex min-w-0 items-center gap-2">
                <Table2 className="text-forest" size={17} />
                <strong className="truncate">{tableName}</strong>
                </div>
                <span className="text-xs font-medium text-steel">{table.columns.length} cols</span>
              </div>
              <div className="max-h-64 overflow-auto p-2">
                {table.columns.map((column) => (
                  <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-white" key={`${tableName}-${column.name}`}>
                    <span className="truncate font-medium">{column.name}</span>
                    <span className="rounded bg-mist px-2 py-0.5 text-xs font-medium text-steel">{column.type}</span>
                    <span className="h-5 min-w-8 text-right text-xs font-semibold text-amber">
                      {column.key ? (
                        <span className="inline-flex items-center gap-1">
                          <KeyRound size={12} /> {column.key}
                        </span>
                      ) : null}
                    </span>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
