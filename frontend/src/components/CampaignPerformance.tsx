/**
 * CampaignPerformance.tsx
 * ========================
 * Campaign → Ad Group drilldown performance table.
 * Data source: filteredCreatives[] — pure client-side rollup, no extra API calls.
 */

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, FolderTree, Boxes, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { computeMetrics, fmtINR, fmtINR0, fmtNum, fmtPct } from "@/lib/metrics";
import type { Creative } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AdGroupRow {
  adGroup:     string;
  impressions: number;
  clicks:      number;
  cost:        number;
  conversions: number;
  ctr:         number;
  cpc:         number;
  cpm:         number;
  cpa:         number;
  creativeCount: number;
}

interface CampaignRow {
  campaign:     string;
  campaignType: string;
  impressions:  number;
  clicks:       number;
  cost:         number;
  conversions:  number;
  ctr:          number;
  cpc:          number;
  cpm:          number;
  cpa:          number;
  adGroups:     AdGroupRow[];
  creativeCount: number;
}

// ── Data builder ──────────────────────────────────────────────────────────────

function buildCampaignRows(creatives: Creative[]): CampaignRow[] {
  const campMap  = new Map<string, Map<string, { imp: number; clk: number; cost: number; conv: number; count: number }>>();
  const typeMap  = new Map<string, string>();

  for (const c of creatives) {
    const camp = c.campaign_name || "Unknown Campaign";
    const ag   = c.ad_group      || "Unknown Ad Group";
    typeMap.set(camp, c.campaign_type || "");

    if (!campMap.has(camp)) campMap.set(camp, new Map());
    const agMap = campMap.get(camp)!;
    if (!agMap.has(ag)) agMap.set(ag, { imp: 0, clk: 0, cost: 0, conv: 0, count: 0 });

    const b = agMap.get(ag)!;
    b.imp   += c.impressions  ?? 0;
    b.clk   += c.clicks       ?? 0;
    b.cost  += c.cost         ?? 0;
    b.conv  += c.conversions  ?? 0;
    b.count += 1;
  }

  const rows: CampaignRow[] = [];
  for (const [camp, agMap] of campMap) {
    const adGroups: AdGroupRow[] = [];
    let ti = 0, tc = 0, ts = 0, tv = 0, tn = 0;

    for (const [ag, b] of agMap) {
      const m = computeMetrics({ impressions: b.imp, clicks: b.clk, cost: b.cost, conversions: b.conv });
      adGroups.push({ adGroup: ag, impressions: b.imp, clicks: b.clk, cost: b.cost, conversions: b.conv, ...m, creativeCount: b.count });
      ti += b.imp; tc += b.clk; ts += b.cost; tv += b.conv; tn += b.count;
    }
    adGroups.sort((a, b) => b.cost - a.cost);

    const cm = computeMetrics({ impressions: ti, clicks: tc, cost: ts, conversions: tv });
    rows.push({ campaign: camp, campaignType: typeMap.get(camp) || "", impressions: ti, clicks: tc, cost: ts, conversions: tv, ...cm, adGroups, creativeCount: tn });
  }

  rows.sort((a, b) => b.cost - a.cost);
  return rows;
}

// ── Column definitions ────────────────────────────────────────────────────────

type RowLike = { impressions: number; clicks: number; cost: number; conversions: number; ctr: number; cpc: number; cpm: number; cpa: number };

const COLS: { key: keyof RowLike; label: string; accent?: boolean; fmt: (r: RowLike) => string }[] = [
  { key: "impressions", label: "Impressions", fmt: r => fmtNum(r.impressions) },
  { key: "clicks",      label: "Clicks",      fmt: r => fmtNum(r.clicks) },
  { key: "cost",        label: "Spend",       fmt: r => fmtINR0(r.cost),    accent: true },
  { key: "ctr",         label: "CTR",         fmt: r => fmtPct(r.ctr) },
  { key: "cpc",         label: "CPC",         fmt: r => fmtINR(r.cpc) },
  { key: "cpm",         label: "CPM",         fmt: r => fmtINR(r.cpm) },
  { key: "conversions", label: "Conv.",        fmt: r => r.conversions.toFixed(2) },
  { key: "cpa",         label: "CPA",         fmt: r => r.cpa > 0 ? fmtINR(r.cpa) : "—" },
];

type SortKey = typeof COLS[number]["key"];

// ── Component ─────────────────────────────────────────────────────────────────

interface Props { creatives: Creative[] }

export function CampaignPerformance({ creatives }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sortKey,  setSortKey]  = useState<SortKey>("cost");
  const [sortAsc,  setSortAsc]  = useState(false);

  const toggle = (key: string) =>
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const handleSort = (k: SortKey) => {
    if (sortKey === k) setSortAsc(a => !a);
    else { setSortKey(k); setSortAsc(false); }
  };

  const rows   = useMemo(() => buildCampaignRows(creatives), [creatives]);
  const sorted = useMemo(() => [...rows].sort((a, b) => sortAsc ? (a[sortKey] as number) - (b[sortKey] as number) : (b[sortKey] as number) - (a[sortKey] as number)), [rows, sortKey, sortAsc]);

  const totals = useMemo(() => {
    const t = rows.reduce((acc, r) => ({ impressions: acc.impressions + r.impressions, clicks: acc.clicks + r.clicks, cost: acc.cost + r.cost, conversions: acc.conversions + r.conversions }), { impressions: 0, clicks: 0, cost: 0, conversions: 0 });
    return { ...t, ...computeMetrics(t) };
  }, [rows]);

  if (creatives.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
        <FolderTree className="w-10 h-10 opacity-20" />
        <p className="text-sm">No campaign data for the selected filters and date range.</p>
      </div>
    );
  }

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <Minus className="w-3 h-3 opacity-20" />;
    return <ChevronDown className={cn("w-3 h-3 text-gold transition-transform", sortAsc && "rotate-180")} />;
  };

  return (
    <div className="glass rounded-2xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-white/[0.06]">
              <th className="px-4 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider w-[340px] sticky left-0 bg-background/80 backdrop-blur z-10">
                Campaign / Ad Group
              </th>
              <th className="px-3 py-3 text-center text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Creatives
              </th>
              {COLS.map(col => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className={cn(
                    "px-3 py-3 text-right text-[11px] font-semibold uppercase tracking-wider cursor-pointer select-none",
                    col.key === sortKey ? "text-gold" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span className="inline-flex items-center gap-1 justify-end">
                    {col.label} <SortIcon k={col.key} />
                  </span>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {/* Grand totals */}
            <tr className="border-b border-white/[0.06] bg-gold/[0.04]">
              <td className="px-4 py-2.5 sticky left-0 bg-[#12100a]/80 backdrop-blur z-10">
                <span className="text-[11px] font-bold uppercase tracking-widest text-gold/70">Grand Total</span>
              </td>
              <td className="px-3 py-2.5 text-center text-[11px] text-muted-foreground tabular-nums">{creatives.length}</td>
              {COLS.map(col => (
                <td key={col.key} className={cn("px-3 py-0 text-right tabular-nums font-mono text-[12px] whitespace-nowrap", col.accent ? "text-gold font-semibold" : "text-foreground/80")}>
                  {col.fmt(totals)}
                </td>
              ))}
            </tr>

            {/* Campaign rows */}
            {sorted.map(camp => {
              const isOpen   = expanded.has(camp.campaign);
              const campPct  = totals.cost > 0 ? (camp.cost / totals.cost) * 100 : 0;

              return [
                <tr
                  key={`camp-${camp.campaign}`}
                  className="border-b border-white/[0.04] hover:bg-white/[0.025] cursor-pointer transition-colors"
                  onClick={() => toggle(camp.campaign)}
                >
                  <td className="px-4 py-3 sticky left-0 bg-background/60 backdrop-blur z-10">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={cn(
                        "shrink-0 w-5 h-5 flex items-center justify-center rounded-md transition-colors",
                        isOpen ? "bg-gold/20 text-gold" : "bg-white/[0.05] text-muted-foreground"
                      )}>
                        {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      </span>
                      <FolderTree className="w-3.5 h-3.5 text-gold/60 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-[13px] truncate leading-tight">{camp.campaign}</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                          {camp.campaignType && (
                            <span className="px-1.5 py-0.5 rounded bg-white/[0.05] border border-white/10">{camp.campaignType}</span>
                          )}
                          <span>{camp.adGroups.length} ad group{camp.adGroups.length !== 1 ? "s" : ""}</span>
                          <span className="text-gold/60 font-medium">{campPct.toFixed(1)}% of spend</span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-center text-[12px] tabular-nums text-muted-foreground">{camp.creativeCount}</td>
                  {COLS.map(col => (
                    <td key={col.key} className={cn("px-3 py-0 text-right tabular-nums font-mono text-[12px] whitespace-nowrap", col.accent ? "text-gold font-semibold" : "text-foreground/80")}>
                      {col.fmt(camp)}
                    </td>
                  ))}
                </tr>,

                ...(isOpen ? camp.adGroups.map(ag => (
                  <tr key={`ag-${camp.campaign}-${ag.adGroup}`} className="border-b border-white/[0.025] bg-white/[0.015] hover:bg-white/[0.03] transition-colors">
                    <td className="pl-14 pr-4 py-2 sticky left-0 bg-background/50 backdrop-blur z-10">
                      <div className="flex items-center gap-2 min-w-0">
                        <Boxes className="w-3 h-3 text-muted-foreground/50 shrink-0" />
                        <span className="text-[12px] text-foreground/75 truncate">{ag.adGroup}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-center text-[11px] tabular-nums text-muted-foreground/60">{ag.creativeCount}</td>
                    {COLS.map(col => (
                      <td key={col.key} className={cn("px-3 py-0 text-right tabular-nums font-mono text-[11px] whitespace-nowrap", col.accent ? "text-gold font-medium" : "text-foreground/65")}>
                        {col.fmt(ag)}
                      </td>
                    ))}
                  </tr>
                )) : []),
              ];
            })}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="px-4 py-2.5 border-t border-white/[0.04] flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">
          {sorted.length} campaign{sorted.length !== 1 ? "s" : ""} · Click row to expand ad groups
        </p>
        <button
          type="button"
          className="text-[11px] text-muted-foreground hover:text-gold transition-colors cursor-pointer"
          onClick={() => setExpanded(expanded.size === rows.length ? new Set() : new Set(rows.map(r => r.campaign)))}
        >
          {expanded.size === rows.length ? "Collapse all" : "Expand all"}
        </button>
      </div>
    </div>
  );
}
