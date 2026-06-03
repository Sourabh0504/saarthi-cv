/**
 * frontend/src/lib/exportTopPerformersPdf.ts
 * ============================================
 * Generates a premium single-page, auto-height PDF of the Top Performers view.
 *
 * Layout:
 *   • Gold top stripe + dark header bar
 *   • Section header for Image Creatives (gold accent)
 *   • Section header for Video Creatives (teal accent)
 *   • Each creative row: Rank # | Thumbnail | Headline + tags | CPC | Rank metric | Cost | Impr
 *   • Thumbnails embedded (image URLs for static, YouTube thumbnail for video)
 *   • PAGE HEIGHT is computed from the number of rows BEFORE creating the PDF
 *     so the output is always a single page that fits all content exactly.
 *   • Fully vector text (selectable/copyable), raster thumbnails only
 */

import type { Creative } from "@/lib/api";
import type { ComputedMetrics } from "@/lib/metrics";
import { fmtINR, fmtINR0, fmtNum, fmtPct, getYouTubeId } from "@/lib/metrics";

// ── Brand colors ──────────────────────────────────────────────────────────────
const C_GOLD      = [200, 163,  80] as const;
const C_DARK      = [ 10,  11,  15] as const;
const C_HDR       = [ 18,  18,  24] as const;
const C_MUTED     = [120, 122, 140] as const;
const C_WHITE     = [240, 240, 245] as const;
const C_BORDER    = [ 38,  40,  54] as const;
const C_CARD      = [ 16,  17,  22] as const;
const C_GREEN     = [ 52, 211, 153] as const;
const C_DARK_TEXT = [ 15,  12,   5] as const;

const MEDAL_COLORS: Array<readonly [number, number, number]> = [
  [200, 163,  80],  // #1 gold
  [192, 192, 192],  // #2 silver
  [205, 127,  50],  // #3 bronze
];

// ── Font loader ───────────────────────────────────────────────────────────────
const _fontCache: Record<string, string> = {};
async function loadFontB64(url: string): Promise<string | null> {
  if (_fontCache[url]) return _fontCache[url];
  try {
    const r = await fetch(url, { cache: "force-cache" });
    if (!r.ok) throw new Error(`${r.status}`);
    const bytes = new Uint8Array(await r.arrayBuffer());
    const chunk = 0x8000;
    let b = "";
    for (let i = 0; i < bytes.length; i += chunk)
      b += String.fromCharCode(...(bytes.subarray(i, Math.min(i + chunk, bytes.length)) as unknown as number[]));
    _fontCache[url] = btoa(b);
    return _fontCache[url];
  } catch { return null; }
}
async function loadNotoSans(): Promise<string | null> {
  const urls = [
    "https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@main/hinted/ttf/NotoSans/NotoSans-Regular.ttf",
    "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/notosans/NotoSans-Regular.ttf",
  ];
  for (const u of urls) { const r = await loadFontB64(u); if (r) return r; }
  return null;
}

// ── Image loader ─────────────────────────────────────────────────────────────
async function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload  = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
    setTimeout(() => resolve(null), 8000);
  });
}

// ── Public types ─────────────────────────────────────────────────────────────
export interface TopPerformersPdfRow {
  rank:     number;
  creative: Creative;
  metrics:  ComputedMetrics;
}

export interface TopPerformersPdfData {
  imageRows:  TopPerformersPdfRow[];
  videoRows:  TopPerformersPdfRow[];
  rankMetric: "ctr" | "conversions" | "cpc" | "cpa";
  rankLabel:  string;
  dateRange:  string;
  rowHeightPx: number;
}

// ── Main export function ──────────────────────────────────────────────────────
export async function exportTopPerformersPdf(data: TopPerformersPdfData): Promise<void> {
  const { jsPDF } = await import("jspdf");

  // ── Fonts ─────────────────────────────────────────────────────────────────
  const notoB64 = await loadNotoSans();
  const safe = notoB64
    ? (s: string) => s
    : (s: string) => s.replace(/₹/g, "Rs.").replace(/[^\u0000-\u00ff]/g, "");

  // ── Layout constants (mm) ─────────────────────────────────────────────────
  const PW  = 297;            // landscape A4 width (stays fixed)
  const MH  = 12;             // horizontal margin
  const MV  = 10;             // vertical margin after header
  const CW  = PW - MH * 2;   // content width = 273 mm

  const STRIPE_H        = 2.5;
  const HEADER_H        = 20;
  const SECTION_TITLE_H = 12;
  const COL_HDR_H       = 9;
  
  // Base row height derived from the UI slider (px to mm conversion: 1px = ~0.265mm)
  const ROW_H           = Math.max(22, data.rowHeightPx * 0.265);
  const ROW_GAP         = 1.5;
  const SECTION_GAP     = 5;
  const FOOTER_H        = 14;

  const THUMB_H    = ROW_H - 4;
  const THUMB_W    = Math.min(60, THUMB_H * (5/3)); // maintain 5:3 ratio, cap at 60mm
  const RANK_W     = 10;

  const INFO_W     = 88;
  const METRIC_W   = 26;
  const METRIC_GAP = 3;

  // ── Compute total page height UPFRONT ────────────────────────────────────
  const sectionH = (rows: TopPerformersPdfRow[]) =>
    rows.length === 0
      ? 0
      : SECTION_TITLE_H + COL_HDR_H + rows.length * (ROW_H + ROW_GAP) + SECTION_GAP;

  const PAGE_H =
    STRIPE_H +
    HEADER_H +
    MV +
    sectionH(data.imageRows) +
    sectionH(data.videoRows) +
    FOOTER_H;

  // ── Create PDF with exact auto-height ─────────────────────────────────────
  // jsPDF accepts custom [width, height] in "portrait" — we just supply
  // landscape proportions (width > height is fine; the unit is "mm").
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: [PW, PAGE_H] });
  const FONT = notoB64 ? "NotoSans" : "helvetica";
  if (notoB64) {
    pdf.addFileToVFS("NotoSans-Regular.ttf", notoB64);
    pdf.addFont("NotoSans-Regular.ttf", "NotoSans", "normal");
    pdf.addFont("NotoSans-Regular.ttf", "NotoSans", "bold");
  }

  // ── Drawing helpers ───────────────────────────────────────────────────────
  const txt = (
    s: string, x: number, y: number, size: number,
    color: readonly [number, number, number],
    style: "normal" | "bold" | "italic" = "normal",
    align: "left" | "center" | "right" = "left",
  ) => {
    pdf.setFont(FONT, style); pdf.setFontSize(size);
    pdf.setTextColor(color[0], color[1], color[2]);
    pdf.text(s, x, y, { align });
  };

  const fillR = (x: number, y: number, w: number, h: number, c: readonly [number, number, number]) => {
    pdf.setFillColor(c[0], c[1], c[2]); pdf.rect(x, y, w, h, "F");
  };

  const hline = (y: number, c: readonly [number, number, number] = C_BORDER, lw = 0.25) => {
    pdf.setDrawColor(c[0], c[1], c[2]); pdf.setLineWidth(lw);
    pdf.line(MH, y, PW - MH, y);
  };

  const fmtRankMetric = (m: ComputedMetrics): string => {
    switch (data.rankMetric) {
      case "ctr":         return safe(fmtPct(m.ctr));
      case "cpc":         return safe(fmtINR(m.cpc));
      case "cpa":         return safe(fmtINR(m.cpa));
      case "conversions": return m.conversions.toFixed(1);
    }
  };

  // ── Pre-load all thumbnails in parallel ───────────────────────────────────
  const allRows = [...data.imageRows, ...data.videoRows];
  const thumbMap = new Map<string, HTMLImageElement | null>();
  await Promise.all(allRows.map(async (r) => {
    const ytId = r.creative.creative_type === "Video" ? getYouTubeId(r.creative.creative_url) : null;
    let src: string | null = null;
    if (r.creative.creative_type === "Image" && r.creative.creative_url) src = r.creative.creative_url;
    if (ytId) src = `https://i.ytimg.com/vi/${ytId}/mqdefault.jpg`;
    thumbMap.set(r.creative.creative_id, src ? await loadImage(src) : null);
  }));

  // ── Column header x-positions ─────────────────────────────────────────────
  const metricBaseX = MH + RANK_W + 2 + THUMB_W + 3 + INFO_W + 5;
  const colDefs = [
    { label: "#",            x: MH,                                               w: RANK_W   },
    { label: "Creative",     x: MH + RANK_W + 2,                                  w: THUMB_W  },
    { label: "Details",      x: MH + RANK_W + 2 + THUMB_W + 3,                   w: INFO_W   },
    { label: "CPC",          x: metricBaseX,                                      w: METRIC_W },
    { label: data.rankLabel, x: metricBaseX + (METRIC_W + METRIC_GAP),            w: METRIC_W },
    { label: "Cost",         x: metricBaseX + (METRIC_W + METRIC_GAP) * 2,        w: METRIC_W },
    { label: "Impr",         x: metricBaseX + (METRIC_W + METRIC_GAP) * 3,        w: METRIC_W },
  ];

  // ── Render cursor ─────────────────────────────────────────────────────────
  let y = 0;

  // ── 1. Page background ────────────────────────────────────────────────────
  fillR(0, 0, PW, PAGE_H, C_DARK);

  // ── 2. Gold stripe ────────────────────────────────────────────────────────
  fillR(0, 0, PW, STRIPE_H, C_GOLD);

  // ── 3. Header bar ─────────────────────────────────────────────────────────
  fillR(0, STRIPE_H, PW, HEADER_H, C_HDR);
  txt("CreativeVisibility",          MH,        STRIPE_H + 9,  13, C_GOLD, "bold");
  txt("Top Performers Report",        MH,        STRIPE_H + 15.5, 7.5, C_MUTED);
  txt(`Ranked by ${data.rankLabel}  ·  ${data.dateRange}`, PW - MH, STRIPE_H + 9,  8, C_GOLD, "bold", "right");
  const ts = new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  txt(`Generated: ${ts}`,            PW - MH,  STRIPE_H + 15.5, 7, C_MUTED, "normal", "right");

  // Gold separator under header
  pdf.setDrawColor(C_GOLD[0], C_GOLD[1], C_GOLD[2]);
  pdf.setLineWidth(0.4);
  pdf.line(0, STRIPE_H + HEADER_H, PW, STRIPE_H + HEADER_H);

  y = STRIPE_H + HEADER_H + MV;

  // ── Draw section ──────────────────────────────────────────────────────────
  const drawSection = async (
    title: string,
    rows: TopPerformersPdfRow[],
    accent: readonly [number, number, number],
  ) => {
    if (rows.length === 0) return;

    // Section title bar
    fillR(MH, y, CW, SECTION_TITLE_H, accent);
    txt(title, MH + 6, y + 8.5, 9, C_DARK_TEXT, "bold");
    txt(`${rows.length} creative${rows.length !== 1 ? "s" : ""}`,
      PW - MH, y + 8.5, 8, C_DARK_TEXT, "bold", "right");
    y += SECTION_TITLE_H;

    // Column header row — bold, high-contrast
    const COL_HDR_BG: readonly [number, number, number] = [48, 50, 68];
    fillR(MH, y, CW, COL_HDR_H, COL_HDR_BG);
    // Left border accent line
    fillR(MH, y, 2, COL_HDR_H, accent);
    for (const col of colDefs) {
      txt(col.label.toUpperCase(), col.x + col.w / 2, y + 6.2, 7.5, C_WHITE, "bold", "center");
    }
    y += COL_HDR_H;

    // Creative rows
    for (let i = 0; i < rows.length; i++) {
      const { creative, metrics, rank: rankNum } = rows[i];
      const rowY = y;
      const rowBg: readonly [number, number, number] = i % 2 === 1 ? C_CARD : C_HDR;

      // Row background card
      pdf.setFillColor(rowBg[0], rowBg[1], rowBg[2]);
      pdf.setDrawColor(C_BORDER[0], C_BORDER[1], C_BORDER[2]);
      pdf.setLineWidth(0.2);
      pdf.roundedRect(MH, rowY, CW, ROW_H, 1.5, 1.5, "FD");

      // Rank
      const rankColor = rankNum <= 3 ? MEDAL_COLORS[rankNum - 1] : C_MUTED;
      txt(`#${rankNum}`, MH + RANK_W / 2, rowY + ROW_H / 2 + 2,
        rankNum <= 3 ? 10 : 8.5, rankColor, "bold", "center");

      // Thumbnail frame
      const thumbX = MH + RANK_W + 2;
      const thumbY = rowY + 2;
      pdf.setFillColor(C_HDR[0], C_HDR[1], C_HDR[2]);
      pdf.setDrawColor(C_BORDER[0], C_BORDER[1], C_BORDER[2]);
      pdf.setLineWidth(0.15);
      pdf.roundedRect(thumbX, thumbY, THUMB_W, THUMB_H, 1.5, 1.5, "FD");

      // Thumbnail image
      const thumb = thumbMap.get(creative.creative_id) ?? null;
      if (thumb) {
        const canvas = document.createElement("canvas");
        canvas.width = thumb.naturalWidth; canvas.height = thumb.naturalHeight;
        canvas.getContext("2d")!.drawImage(thumb, 0, 0);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
        const aspect = thumb.naturalWidth / thumb.naturalHeight;
        const maxW = THUMB_W - 2, maxH = THUMB_H - 2;
        let iw = maxW, ih = maxW / aspect;
        if (ih > maxH) { ih = maxH; iw = maxH * aspect; }
        try {
          pdf.addImage(dataUrl, "JPEG",
            thumbX + 1 + (maxW - iw) / 2,
            thumbY + 1 + (maxH - ih) / 2,
            iw, ih);
        } catch { /* skip if image fails */ }
      } else {
        txt("—", thumbX + THUMB_W / 2, thumbY + THUMB_H / 2 + 1.5, 8, C_MUTED, "normal", "center");
      }

      // Details
      const infoX = thumbX + THUMB_W + 3;
      // Vertically center text block in the row (adjusted for larger text)
      const blockH = creative.campaign_type ? 18 : 13; 
      const infoY = rowY + (ROW_H - blockH) / 2 + 3.5;

      // Headline
      pdf.setFont(FONT, "bold"); pdf.setFontSize(9);
      pdf.setTextColor(C_WHITE[0], C_WHITE[1], C_WHITE[2]);
      const headLines = (pdf.splitTextToSize(creative.headline || "—", INFO_W) as string[]).slice(0, 1);
      pdf.text(headLines, infoX, infoY);

      let currentY = infoY + 6;

      // Creative URL — clickable blue link
      if (creative.creative_url) {
        const maxUrlChars = 55;
        const urlDisplay = creative.creative_url.length > maxUrlChars
          ? creative.creative_url.slice(0, maxUrlChars) + "…"
          : creative.creative_url;
        pdf.setFont(FONT, "bold"); pdf.setFontSize(7);
        pdf.setTextColor(96, 165, 250); // blue-400
        pdf.text(urlDisplay, infoX, currentY);
        // Embed real hyperlink on the URL text
        const urlW = Math.min(pdf.getTextWidth(urlDisplay), INFO_W);
        pdf.link(infoX, currentY - 3, urlW, 4.5, { url: creative.creative_url });
        currentY += 5.5;
      }

      // City · Category · Funnel (Color coded)
      let currentX = infoX;
      pdf.setFont(FONT, "bold"); pdf.setFontSize(7.5);
      
      const drawTag = (text: string, color: readonly [number, number, number], addSeparator: boolean) => {
        if (!text) return;
        pdf.setTextColor(color[0], color[1], color[2]);
        pdf.text(safe(text), currentX, currentY);
        currentX += pdf.getTextWidth(safe(text)) + 1.5;
        
        if (addSeparator) {
          pdf.setTextColor(C_MUTED[0], C_MUTED[1], C_MUTED[2]);
          pdf.text("·", currentX, currentY);
          currentX += pdf.getTextWidth("·") + 1.5;
        }
      };

      const hasCity = !!creative.city;
      const hasCat = !!creative.category;
      const hasFun = !!creative.funnel;

      // Shades of white: ~230 for tags, ~190 for campaign type
      drawTag(creative.city || "", [230, 230, 240], hasCity && (hasCat || hasFun));
      drawTag(creative.category || "", [215, 215, 225], hasCat && hasFun);
      drawTag(creative.funnel || "", [230, 230, 240], false);
      
      currentY += 5.5;

      // Campaign type
      if (creative.campaign_type) {
        pdf.setFont(FONT, "bold"); pdf.setFontSize(7.5);
        pdf.setTextColor(180, 180, 190);
        pdf.text(safe(creative.campaign_type), infoX, currentY);
      }


      // Metric columns
      const metricCols = [
        { val: safe(fmtINR(metrics.cpc)),  isMain: data.rankMetric === "cpc"  },
        { val: fmtRankMetric(metrics),      isMain: true                       },
        { val: safe(fmtINR0(metrics.cost)), isMain: false                      },
        { val: fmtNum(metrics.impressions), isMain: false                      },
      ];
      // If ranking by CPC, mute the duplicate first column
      if (data.rankMetric === "cpc") { metricCols[0].val = "—"; metricCols[0].isMain = false; }

      for (let mi = 0; mi < metricCols.length; mi++) {
        const mx = metricBaseX + mi * (METRIC_W + METRIC_GAP) + METRIC_W / 2;
        const my = rowY + ROW_H / 2 + 2.5;
        const { val, isMain } = metricCols[mi];
        txt(val, mx, my, val.length > 9 ? 7.5 : 9,
          isMain ? C_GOLD : C_WHITE, "bold", "center");
      }

      y += ROW_H + ROW_GAP;
    }

    y += SECTION_GAP;
  };

  // ── 4. Render sections ────────────────────────────────────────────────────
  await drawSection("TOP IMAGE CREATIVES", data.imageRows, C_GOLD);
  await drawSection("TOP VIDEO CREATIVES", data.videoRows, C_GREEN);

  // ── 5. Footer ─────────────────────────────────────────────────────────────
  hline(y + 2, C_BORDER);
  txt(
    "CreativeVisibility  ·  Confidential  ·  Not for external distribution without authorisation",
    PW / 2, y + 7, 6.5, C_MUTED, "italic", "center",
  );
  txt("© 2026 CreativeVisibility. All rights reserved.", PW / 2, y + 11.5, 6, C_MUTED, "italic", "center");

  // ── 6. Save ───────────────────────────────────────────────────────────────
  const safeDateRange = data.dateRange.replace(/[^a-z0-9]/gi, "_").slice(0, 40);
  pdf.save(`TopPerformers_${data.rankLabel}_${safeDateRange}.pdf`);
}
