import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useReference } from "@/lib/api";
import { useCert } from "@/lib/cert-context";

export function ReferencePage() {
  const cert = useCert();
  const { data, isPending } = useReference(cert.id);
  const [query, setQuery] = useState("");

  const groups = useMemo(() => {
    const all = data?.groups ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all
      .map((g) => {
        const titleHit =
          g.title.toLowerCase().includes(q) || g.description?.toLowerCase().includes(q);
        const rows = titleHit
          ? g.rows
          : g.rows.filter((row) => row.some((cell) => cell.toLowerCase().includes(q)));
        return { ...g, rows };
      })
      .filter((g) => g.rows.length > 0);
  }, [data, query]);

  if (isPending || !data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="size-8" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reference</h1>
          <p className="text-sm text-muted-foreground">
            Quick lookup tables for {cert.name}.
          </p>
        </div>
        <Input
          placeholder="Search ports, cables, standards…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full sm:w-72"
        />
      </div>

      {groups.length === 0 && (
        <p className="py-12 text-center text-sm text-muted-foreground">
          Nothing matches “{query}”.
        </p>
      )}

      {groups.map((group) => (
        <Card key={group.id}>
          <CardHeader>
            <CardTitle>{group.title}</CardTitle>
            {group.description && <CardDescription>{group.description}</CardDescription>}
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    {group.columns.map((col) => (
                      <th key={col} className="whitespace-nowrap py-2 pr-6 font-medium text-muted-foreground">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {group.rows.map((row, i) => (
                    <tr key={i} className="border-b border-border/60 last:border-0">
                      {row.map((cell, j) => (
                        <td key={j} className="py-2 pr-6 align-top">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
