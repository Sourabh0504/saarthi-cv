import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "./StateViews";

export interface ColumnDef<T> {
  key: string;
  header: string;
  align?: "left" | "right";
  sortable?: boolean;
  sortValue?: (row: T) => number | string;
  render: (row: T) => React.ReactNode;
}

export function DataTable<T>({
  columns,
  data,
  rowKey,
  emptyMessage = "No data",
}: {
  columns: ColumnDef<T>[];
  data: T[];
  rowKey: (row: T) => string;
  emptyMessage?: string;
}) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sorted = useMemo(() => {
    if (!sortKey) return data;
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.sortValue) return data;
    const copy = [...data];
    copy.sort((a, b) => {
      const av = col.sortValue!(a);
      const bv = col.sortValue!(b);
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [data, sortKey, sortDir, columns]);

  if (data.length === 0) return <EmptyState title={emptyMessage} />;

  return (
    <div className="overflow-x-auto rounded-2xl border border-sr-border bg-sr-card/60 backdrop-blur-2xl shadow-[var(--sr-shadow-sm)]">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-sr-border text-xs font-semibold text-sr-muted-foreground">
            {columns.map((c) => {
              const toggleSort = () => {
                if (sortKey === c.key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
                else {
                  setSortKey(c.key);
                  setSortDir("desc");
                }
              };
              return (
                <th key={c.key} scope="col" className={cn("px-4 py-3", c.align === "right" ? "text-right" : "text-left")}>
                  {c.sortable ? (
                    <button
                      type="button"
                      onClick={toggleSort}
                      className={cn(
                        "group inline-flex items-center gap-1 rounded transition-colors hover:text-sr-foreground",
                        c.align === "right" && "flex-row-reverse",
                      )}
                    >
                      {c.header}
                      {sortKey === c.key ? (
                        sortDir === "asc" ? <ArrowUp className="h-3 w-3 text-sr-primary" /> : <ArrowDown className="h-3 w-3 text-sr-primary" />
                      ) : (
                        <ArrowDown className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-30" />
                      )}
                    </button>
                  ) : (
                    <span className="inline-flex items-center gap-1">{c.header}</span>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={rowKey(row)} className="border-b border-sr-border/60 transition-colors last:border-0 hover:bg-sr-muted/30">
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cn("px-4 py-3", c.align === "right" ? "text-right font-sr-num tabular-nums" : "text-left")}
                >
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
