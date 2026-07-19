import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { CampaignAgg } from "@/lib/signalRoomData";
import { DataTable, type ColumnDef } from "@/components/signal-room/DataTable";
import { fmtINR0, fmtNum } from "@/lib/metrics";
import { Input } from "@/components/ui/input";

export function CampaignTable({ campaigns }: { campaigns: CampaignAgg[] }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(
    () => campaigns.filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase())),
    [campaigns, q],
  );

  const columns: ColumnDef<CampaignAgg>[] = [
    { key: "name", header: "Campaign", sortable: true, sortValue: (r) => r.name, render: (r) => <span className="font-medium text-sr-foreground">{r.name}</span> },
    { key: "cost", header: "Spend", align: "right", sortable: true, sortValue: (r) => r.cost, render: (r) => fmtINR0(r.cost) },
    { key: "conversions", header: "Conv.", align: "right", sortable: true, sortValue: (r) => r.conversions, render: (r) => fmtNum(r.conversions) },
    { key: "cpa", header: "CPA", align: "right", sortable: true, sortValue: (r) => r.cpa, render: (r) => fmtINR0(r.cpa) },
    { key: "clicks", header: "Clicks", align: "right", sortable: true, sortValue: (r) => r.clicks, render: (r) => fmtNum(r.clicks) },
    { key: "ctr", header: "CTR", align: "right", sortable: true, sortValue: (r) => r.ctr, render: (r) => `${r.ctr}%` },
  ];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sr-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search campaigns..." className="pl-9" />
        </div>
      </div>
      <DataTable columns={columns} data={filtered} rowKey={(r) => r.name} emptyMessage="No campaigns match your search" />
    </div>
  );
}
