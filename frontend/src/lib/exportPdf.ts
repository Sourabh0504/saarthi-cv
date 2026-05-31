/**
 * frontend/src/lib/exportPdf.ts
 * ==============================
 * Generates a premium, client-shareable PDF from the Creative Performance modal.
 *
 * Architecture:
 *   - jsPDF        → draws all text, lines, rectangles as real PDF objects (fully selectable)
 *   - svg2pdf.js   → embeds each Recharts chart SVG as true vector PDF paths (not images)
 *   - Creative image → embedded as a raster image (only raster element in the doc)
 *
 * Output:
 *   - Portrait orientation
 *   - Single page, auto-height (grows with content)
 *   - Selectable text throughout
 *   - Crisp vector charts at any zoom level
 */

import type { Creative } from "@/lib/api";
import type { ComputedMetrics } from "@/lib/metrics";
import { fmtINR, fmtINR0, fmtNum, fmtPct, getYouTubeId } from "@/lib/metrics";

// ── Brand colors (RGB) ────────────────────────────────────────────────────────
const GOLD   = [200, 163, 80]  as const;
const DARK   = [10,  11,  15]  as const;
const HEADER = [18,  18,  24]  as const;
const MUTED  = [120, 122, 140] as const;
const TEAL   = [61,  191, 158] as const;
const WHITE  = [240, 240, 245] as const;
const BORDER = [45,  46,  58]  as const;

// ── Font loader — fetches a TTF from CDN and base64-encodes it ───────────────
// Cache is per-URL; "failed" state is intentionally NOT cached so transient
// network errors don't permanently block subsequent exports in the same session.
const _fontCache: Record<string, string> = {};

async function loadFontB64(url: string): Promise<string | null> {
  if (_fontCache[url]) return _fontCache[url];
  try {
    const r = await fetch(url, { cache: "force-cache" });
    if (!r.ok) throw new Error(`font fetch ${r.status}`);
    const bytes = new Uint8Array(await r.arrayBuffer());
    const chunk = 0x8000;
    let b = "";
    for (let i = 0; i < bytes.length; i += chunk) {
      b += String.fromCharCode(...(bytes.subarray(i, Math.min(i + chunk, bytes.length)) as unknown as number[]));
    }
    _fontCache[url] = btoa(b);
    return _fontCache[url];
  } catch {
    return null;   // don't cache failures — allow retry on next export
  }
}

// ── Load Poppins + Montserrat in parallel ─────────────────────────────────────
const CDN = "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl";
async function loadPdfFonts() {
  const [poppinsR, poppinsB, montserratB] = await Promise.all([
    loadFontB64(`${CDN}/poppins/Poppins-Regular.ttf`),
    loadFontB64(`${CDN}/poppins/Poppins-Bold.ttf`),
    loadFontB64(`${CDN}/montserrat/static/Montserrat-Bold.ttf`),
  ]);
  return { poppinsR, poppinsB, montserratB };
}

// ── Noto Sans — supports ₹ and full Unicode ───────────────────────────────────
// Google restructured their fonts repo; NotoSans-Regular.ttf is now under
// the googlefonts/noto-fonts repo. Try that first, then the legacy path.
async function loadNotoSans(): Promise<string | null> {
  const candidates = [
    "https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@main/hinted/ttf/NotoSans/NotoSans-Regular.ttf",
    `${CDN}/notosans/NotoSans-Regular.ttf`,
  ];
  for (const url of candidates) {
    const r = await loadFontB64(url);
    if (r) return r;
  }
  return null;
}

// ── Layout constants (mm) ─────────────────────────────────────────────────────
const PAGE_W   = 210;   // A4 portrait width
const MARGIN   = 14;
const CONTENT_W = PAGE_W - MARGIN * 2;

// ── Data contract passed from the modal ───────────────────────────────────────
export interface CreativePdfData {
  creative:       Creative;
  totals:         ComputedMetrics;
  avgs:           { ctr: number; cpc: number };
  ctrDelta:       number;
  cpcDelta:       number;
  startDate:      string;
  endDate:        string;
  /** Which metric keys are currently enabled in the modal (mirrors modalMetrics) */
  enabledMetrics?: string[];
  /** Map from chartId → the wrapper div that contains the Recharts <svg> */
  chartEls:       Record<string, HTMLElement | null>;
}

// ── Canvas-based color resolver (handles oklch, var(), lab, display-p3, etc.) ─
// This is the ONLY 100% reliable approach: the browser converts any CSS color
// to sRGB internally when it draws a pixel. We read it back via getImageData().
let _resolverCanvas: HTMLCanvasElement | null = null;
let _resolverCtx: CanvasRenderingContext2D | null = null;
let _resolverDiv: HTMLDivElement | null = null;

function resolveColorToRgb(colorStr: string): string {
  if (!colorStr || colorStr === "none" || colorStr === "transparent") return colorStr;
  // Fast path: already a plain rgb/rgba/hex with no custom props
  if (
    !colorStr.includes("oklch") &&
    !colorStr.includes("oklab") &&
    !colorStr.includes("var(")  &&
    !colorStr.includes("color(") &&
    !colorStr.includes("lab(") &&
    !colorStr.includes("lch(")
  ) return colorStr;

  try {
    // Phase 1: resolve CSS custom properties (var(--x)) via a DOM element so the
    // browser applies the page's CSS cascade and returns the computed value.
    if (!_resolverDiv) {
      _resolverDiv = document.createElement("div");
      _resolverDiv.style.cssText =
        "position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;pointer-events:none;";
      document.body.appendChild(_resolverDiv);
    }
    _resolverDiv.style.color = colorStr;
    const computed = window.getComputedStyle(_resolverDiv).color;
    // If the browser already resolved it to rgb/rgba, we're done.
    if (computed && !computed.includes("oklch") && !computed.includes("color(") &&
        !computed.includes("display-p3")) {
      return computed;
    }

    // Phase 2: Canvas pixel read — handles oklch/lab/display-p3 that getComputedStyle
    // still returns in wide-gamut format. Drawing forces the browser to convert to sRGB.
    if (!_resolverCanvas) {
      _resolverCanvas = document.createElement("canvas");
      _resolverCanvas.width = _resolverCanvas.height = 1;
      _resolverCtx = _resolverCanvas.getContext("2d", { willReadFrequently: true })!;
    }
    const ctx = _resolverCtx!;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = computed || colorStr;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    if (a === 0) return "transparent";
    if (a < 255) return `rgba(${r},${g},${b},${(a / 255).toFixed(3)})`;
    return `rgb(${r},${g},${b})`;
  } catch {
    return colorStr;
  }
}

// resolveStyles removed — replaced by resolveSvgForPdf (string-serialization approach)

// ── Unique SVG ID Namespacing ────────────────────────────────────────────────
/**
 * Prepends a chart-specific namespace to all IDs in the SVG, and updates all
 * references (like url(#id)) to prevent ID collision between multiple charts.
 */
function makeIdsUnique(svg: SVGSVGElement, prefix: string): void {
  const idMap = new Map<string, string>();
  
  // Find all elements with an ID attribute
  const elementsWithId = svg.querySelectorAll("[id]");
  elementsWithId.forEach((el) => {
    const oldId = el.getAttribute("id");
    if (oldId) {
      const newId = `${prefix}-${oldId}`;
      el.setAttribute("id", newId);
      idMap.set(oldId, newId);
    }
  });

  // Find all attributes that reference url(#id) or just #id and update them
  const allElements = svg.querySelectorAll("*");
  allElements.forEach((el) => {
    for (let i = 0; i < el.attributes.length; i++) {
      const attr = el.attributes[i];
      let val = attr.value;
      if (val) {
        let modified = false;
        idMap.forEach((newId, oldId) => {
          // Escape special characters in the oldId for the regex
          const escapedOldId = oldId.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
          // Match #oldId or url(#oldId) with optional single/double quotes or HTML entity quotes (&quot;)
          const regex = new RegExp(`(#|url\\((?:&quot;|['"])?#)${escapedOldId}((?:&quot;|['"])?\\)?)`, 'g');
          if (regex.test(val)) {
            val = val.replace(regex, (match, p1, p2) => `${p1}${newId}${p2}`);
            modified = true;
          }
        });
        if (modified) {
          el.setAttribute(attr.name, val);
        }
      }
    }
  });
}

/**
 * Serialize an SVG to a string, replace ALL unresolvable CSS colors (var(--x),
 * oklch, lab, display-p3) with plain rgb() values, then parse it back.
 *
 * Why string-based instead of DOM walking?
 *   • The original SVG structure (clip paths, gradients, transforms) is preserved
 *     exactly — no risk of accidentally hiding structural <defs> children.
 *   • We only touch color strings, nothing else.
 *   • svg2pdf.js gets a clean, standards-compliant SVG with no CSS custom props.
 */
function resolveSvgForPdf(wrapperEl: HTMLElement): SVGSVGElement | null {
  const svg = wrapperEl.querySelector("svg");
  if (!svg) return null;

  // ── Dimensions: attribute value preferred; getBoundingClientRect fallback ──
  const attrW = parseFloat(svg.getAttribute("width")  || "0");
  const attrH = parseFloat(svg.getAttribute("height") || "0");
  const rect  = svg.getBoundingClientRect();
  const w = attrW > 0 ? attrW : (rect.width  > 0 ? rect.width  : wrapperEl.clientWidth  || 800);
  const h = attrH > 0 ? attrH : (rect.height > 0 ? rect.height : wrapperEl.clientHeight || 300);

  // ── Serialize the live SVG to a string ────────────────────────────────────
  let svgStr = new XMLSerializer().serializeToString(svg);

  // ── Find every unresolved color token ────────────────────────────────────
  // Matches: var(--anything), oklch(...), oklab(...), lab(...), lch(...), color(...)
  const colorRe = /(?:var\(--[\w-]+(?:,\s*[^)]+)?\)|oklch\([^)]+\)|oklab\([^)]+\)|lab\([^)]+\)|lch\([^)]+\)|color\([^)]+\))/g;
  const unique  = new Set<string>(svgStr.match(colorRe) ?? []);

  // ── Resolve each token to a plain rgb() value ─────────────────────────────
  const map = new Map<string, string>();
  for (const token of unique) {
    const resolved = resolveColorToRgb(token);
    if (resolved && resolved !== token) map.set(token, resolved);
  }

  // ── Replace every occurrence in the string ────────────────────────────────
  for (const [token, rgb] of map) {
    // Use split/join for literal string replacement (no regex escaping needed)
    svgStr = svgStr.split(token).join(rgb);
  }

  // ── Parse the resolved string back to an SVG element ─────────────────────
  const parsed = new DOMParser().parseFromString(svgStr, "image/svg+xml");
  const out    = parsed.querySelector("svg") as SVGSVGElement | null;
  if (!out) return null;

  out.setAttribute("width",   String(w));
  out.setAttribute("height",  String(h));
  out.setAttribute("viewBox", `0 0 ${w} ${h}`);
  return out;
}

// ── Async image loader ────────────────────────────────────────────────────────
async function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload  = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
    setTimeout(() => resolve(null), 8000); // timeout safety
  });
}

// ── Metric card helper ────────────────────────────────────────────────────────
interface MetricCell {
  label:   string;
  value:   string;
  sub?:    string;
  accent?: boolean;
}

// ── Legend drawing helper ─────────────────────────────────────────────────────
/**
 * Draws chart legends manually at the top-right corner of the chart cards using vector paths.
 */
function drawChartLegend(
  pdf: any,
  rx: number,
  ly: number,
  items: Array<{ label: string; color: readonly [number, number, number]; dashed?: boolean }>
): void {
  let currentX = rx;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7);
  
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    const textW = pdf.getTextWidth(item.label);
    const lineLen = 4;
    const gap = 1.5;
    const itemW = lineLen + gap + textW;
    const itemX = currentX - itemW;
    
    // Draw the legend line indicator
    pdf.setDrawColor(item.color[0], item.color[1], item.color[2]);
    pdf.setLineWidth(1.2);
    if (item.dashed) {
      pdf.setLineDashPattern([1, 1], 0);
    } else {
      pdf.setLineDashPattern([], 0);
    }
    
    const lineY = ly - 2;
    pdf.line(itemX, lineY, itemX + lineLen, lineY);
    
    // Draw the legend label
    pdf.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
    pdf.text(item.label, itemX + lineLen + gap, ly);
    
    // Space between legend items
    currentX = itemX - 5;
  }
  
  // Reset dash pattern
  pdf.setLineDashPattern([], 0);
}

// ── Main export function ──────────────────────────────────────────────────────
export async function exportCreativePdf(data: CreativePdfData): Promise<void> {
  const { jsPDF } = await import("jspdf");
  await import("svg2pdf.js");

  // Load Unicode font (enables native ₹ rendering)
  const notoB64 = await loadNotoSans();

  // When NotoSans is unavailable fall back to ASCII-safe representations so the
  // PDF is always readable — ₹ → "Rs.", → → "-", and any remaining non-Latin
  // chars are stripped. Applied only to display strings, not metadata.
  const safe = notoB64
    ? (s: string) => s
    : (s: string) => s
        .replace(/₹/g, "Rs.")
        .replace(/→/g, "-")
        .replace(/[^ -ÿ]/g, "");

  const { creative, totals, avgs, ctrDelta, cpcDelta, startDate, endDate, chartEls } = data;

  // ── Date formatter: YYYY-MM-DD → DD-MMM-YYYY (e.g. 30-May-2026) ──────────
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const fmtDate = (iso: string): string => {
    const [y, m, d] = iso.split("-");
    return `${d}-${MONTHS[+m - 1]}-${y}`;
  };
  const startFmt = fmtDate(startDate);
  const endFmt   = fmtDate(endDate);

  // ── 1. Resolve + load creative image ───────────────────────────────────────
  const ytId = creative.creative_type === "Video" ? getYouTubeId(creative.creative_url) : null;
  let imgSrc: string | null = null;
  if (creative.creative_type === "Image") imgSrc = creative.creative_url;
  if (creative.creative_type === "Video" && ytId) imgSrc = `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`;

  const loadedImg = imgSrc ? await loadImage(imgSrc) : null;

  // ── 2. Clone + resolve all chart SVGs ──────────────────────────────────────
  const CHART_ORDER: Array<{ id: string; title: string }> = [
    { id: "ctr",         title: "CTR VS. DATASET AVG"    },
    { id: "cpc",         title: "CPC VS. DATASET AVG"    },
    { id: "spend",       title: "SPEND (Rs.)"            },
    { id: "impr-clicks", title: "IMPRESSIONS & CLICKS"   },
  ];

  const resolvedCharts: Array<{ id: string; title: string; svg: SVGSVGElement; aspect: number }> = [];
  for (const { id, title } of CHART_ORDER) {
    const el = chartEls[id];
    if (!el) continue;
    // String-serialization approach: resolves all CSS vars + oklch colors
    const svg = resolveSvgForPdf(el);
    if (!svg) continue;

    // Namespace all IDs so multiple charts don't share clip-path IDs
    makeIdsUnique(svg, `chart-${id}`);

    const w = parseFloat(svg.getAttribute("width")  || "1");
    const h = parseFloat(svg.getAttribute("height") || "1");
    resolvedCharts.push({ id, title, svg, aspect: h / w });
  }

  // ── 3. Build metrics cells (filtered to match modal visibility) ───────────────
  const ctrDeltaStr = `${ctrDelta > 0 ? "+" : ""}${ctrDelta.toFixed(1)}%  vs avg`;
  const cpcDeltaStr = `${cpcDelta > 0 ? "+" : ""}${cpcDelta.toFixed(1)}%  vs avg`;

  const ALL_METRIC_CELLS: Array<MetricCell & { key: string }> = [
    { key: "impressions", label: "Impressions", value: fmtNum(totals.impressions) },
    { key: "clicks",      label: "Clicks",      value: fmtNum(totals.clicks) },
    { key: "cost",        label: "Spend",       value: safe(fmtINR0(totals.cost)), accent: true },
    { key: "ctr",         label: "CTR",         value: fmtPct(totals.ctr),                         sub: ctrDeltaStr },
    { key: "cpc",         label: "CPC",         value: safe(fmtINR(totals.cpc)),    sub: cpcDeltaStr },
    { key: "cpm",         label: "CPM",         value: safe(fmtINR(totals.cpm)) },
    { key: "conversions", label: "Conversions", value: totals.conversions.toFixed(1) },
    { key: "cr",          label: "Conv. Rate",  value: fmtPct(totals.cr) },
  ];

  const cells = data.enabledMetrics
    ? ALL_METRIC_CELLS.filter(c => data.enabledMetrics!.includes(c.key))
    : ALL_METRIC_CELLS;

  // Mimic the modal grid: ≤6 → 3-col, else 4-col
  const GRID_COLS  = cells.length <= 6 ? 3 : 4;
  const CELL_H     = 15;   // compact — was 22
  const metricRows = Math.ceil(cells.length / GRID_COLS);

  // ── 4. Compute layout heights ───────────────────────────────────────────────
  const STRIPE_H    = 2.5;
  const HEADER_H    = 26;
  const SECTION_GAP = 5;
  const WATERMARK_H = 10;
  const FUNNEL_H    = 18;  // 3-row funnel path (Location/Funnel/Type · Campaign · AdGroup)
  const TITLE_H     = 14;
  const URL_H       = 6;   // raw URL line below title
  const TAGS_H      = 6;

  // Two-column height: 7mm label row + metric rows + image card (52mm) — take the taller
  const metricsGridH = metricRows * (CELL_H + 2) - 2; // rows of cells
  const TWO_COL_H    = 7 + Math.max(52, metricsGridH) + 4; // 7 label + content + bottom pad

  const CARD_H   = 58;
  const FOOTER_H = 12;

  const chartsH = resolvedCharts.length * (CARD_H + SECTION_GAP);

  const PAGE_H =
    STRIPE_H +
    HEADER_H +
    SECTION_GAP +
    WATERMARK_H +
    FUNNEL_H +
    TITLE_H +
    URL_H +
    TAGS_H +
    SECTION_GAP +
    TWO_COL_H +
    SECTION_GAP +
    chartsH +
    FOOTER_H +
    SECTION_GAP;

  // ── 4. Create PDF ──────────────────────────────────────────────────────────
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: [PAGE_W, PAGE_H],
  });

  // Register Unicode font if loaded
  const FONT = notoB64 ? "NotoSans" : "helvetica";
  if (notoB64) {
    pdf.addFileToVFS("NotoSans-Regular.ttf", notoB64);
    pdf.addFont("NotoSans-Regular.ttf", "NotoSans", "normal");
    // jsPDF only supports one weight per name — use same file for bold
    pdf.addFont("NotoSans-Regular.ttf", "NotoSans", "bold");
  }

  // Fill page background with brand dark color
  pdf.setFillColor(DARK[0], DARK[1], DARK[2]);
  pdf.rect(0, 0, PAGE_W, PAGE_H, "F");

  let y = 0;

  // ── Helpers ────────────────────────────────────────────────────────────────
  const text = (
    str: string,
    x: number,
    ty: number,
    size: number,
    color: readonly [number, number, number],
    style: "normal" | "bold" | "italic" = "normal",
    align: "left" | "right" | "center" = "left",
  ) => {
    pdf.setFont(FONT, style);
    pdf.setFontSize(size);
    pdf.setTextColor(color[0], color[1], color[2]);
    pdf.text(str, x, ty, { align });
  };

  const fillRect = (
    rx: number, ry: number, rw: number, rh: number,
    color: readonly [number, number, number],
  ) => {
    pdf.setFillColor(color[0], color[1], color[2]);
    pdf.rect(rx, ry, rw, rh, "F");
  };

  const strokeRect = (
    rx: number, ry: number, rw: number, rh: number,
    color: readonly [number, number, number],
    lw = 0.25,
  ) => {
    pdf.setDrawColor(color[0], color[1], color[2]);
    pdf.setLineWidth(lw);
    pdf.rect(rx, ry, rw, rh, "S");
  };

  const hline = (hy: number, color: readonly [number, number, number] = BORDER, lw = 0.3) => {
    pdf.setDrawColor(color[0], color[1], color[2]);
    pdf.setLineWidth(lw);
    pdf.line(MARGIN, hy, PAGE_W - MARGIN, hy);
  };

  // ── 5. Gold top stripe ─────────────────────────────────────────────────────
  fillRect(0, 0, PAGE_W, STRIPE_H, GOLD);
  y += STRIPE_H;

  // ── 6. Header block ────────────────────────────────────────────────────────
  fillRect(0, y, PAGE_W, HEADER_H, HEADER);

  const logoY = y + 9;
  text("CreativeVisibility", MARGIN, logoY, 15, GOLD, "bold");
  text("Luxury Jewelry · Campaign Performance Portal", MARGIN, logoY + 6, 8, MUTED);

  // Date range (right-aligned)
  const dr = safe(`${startFmt}  →  ${endFmt}`);
  text(dr, PAGE_W - MARGIN, logoY, 8, GOLD, "bold", "right");

  // Timestamp
  const ts = new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  text(`Generated: ${ts}`, PAGE_W - MARGIN, logoY + 6, 7, MUTED, "normal", "right");

  // Bottom border of header
  y += HEADER_H;
  hline(y, GOLD, 0.4);
  y += SECTION_GAP;

  // ── 7. Watermark / section label ───────────────────────────────────────────
  text("CREATIVE PERFORMANCE REPORT", MARGIN, y + 5, 7.5, GOLD, "bold");
  const status      = creative.status ?? "Enabled";
  const statusColor = status === "Enabled" ? [52, 211, 153] as const : [248, 113, 113] as const;
  pdf.setFont(FONT, "bold"); pdf.setFontSize(7.5);
  pdf.setTextColor(statusColor[0], statusColor[1], statusColor[2]);
  pdf.text(status.toUpperCase(), PAGE_W - MARGIN, y + 5, { align: "right" });
  y += WATERMARK_H;

  // ── 7b. Funnel path — 3 rows ───────────────────────────────────────────────
  // Row 1: Location: [city]  >  Funnel: [funnel]  >  Type: [campaign_type]
  const funnelColor: readonly [number, number, number] =
    creative.funnel === "MOFU" ? GOLD : [52, 211, 153];

  pdf.setFont(FONT, "normal"); pdf.setFontSize(6.5);
  let fx = MARGIN;
  const fRow1Y = y + 5;

  const row1Segments: Array<{ label: string; value: string; valueColor: readonly [number, number, number] }> = [
    { label: "Location:", value: ` ${creative.city}`,          valueColor: WHITE },
    { label: "  >  Funnel:", value: ` ${creative.funnel}`,     valueColor: funnelColor },
    { label: "  >  Type:",   value: ` ${creative.campaign_type}`, valueColor: WHITE },
  ];
  for (const seg of row1Segments) {
    pdf.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
    pdf.text(seg.label, fx, fRow1Y);
    fx += pdf.getTextWidth(seg.label);
    pdf.setTextColor(seg.valueColor[0], seg.valueColor[1], seg.valueColor[2]);
    pdf.setFont(FONT, "bold");
    pdf.text(seg.value, fx, fRow1Y);
    fx += pdf.getTextWidth(seg.value);
    pdf.setFont(FONT, "normal");
  }

  // Row 2: Campaign: [name]
  const fRow2Y = fRow1Y + 6;
  pdf.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
  pdf.setFont(FONT, "normal"); pdf.setFontSize(6.5);
  pdf.text("Campaign:", MARGIN, fRow2Y);
  pdf.setTextColor(WHITE[0], WHITE[1], WHITE[2]);
  pdf.setFont(FONT, "bold");
  const campStr = creative.campaign_name ?? "--";
  pdf.text(campStr, MARGIN + pdf.getTextWidth("Campaign: "), fRow2Y);

  // Row 3: Ad Group: [name]
  const fRow3Y = fRow2Y + 6;
  pdf.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
  pdf.setFont(FONT, "normal"); pdf.setFontSize(6.5);
  pdf.text("Ad Group:", MARGIN, fRow3Y);
  pdf.setTextColor(WHITE[0], WHITE[1], WHITE[2]);
  pdf.setFont(FONT, "bold");
  pdf.text(creative.ad_group || "--", MARGIN + pdf.getTextWidth("Ad Group: "), fRow3Y);

  y += FUNNEL_H;

  // ── 8. Creative title (clickable PDF link) ─────────────────────────────────
  const adTitle = creative.headline
    ?? (creative.creative_type === "Text" ? "Text Ad"
      : [creative.creative_type, creative.city, creative.category, creative.ad_group].filter(Boolean).join(" · "));

  pdf.setFont(FONT, "bold"); pdf.setFontSize(14);
  const titleLines = pdf.splitTextToSize(adTitle, CONTENT_W - 10) as string[];
  pdf.setTextColor(WHITE[0], WHITE[1], WHITE[2]);
  pdf.text(titleLines, MARGIN, y + 6);
  // Embed clickable URL on the title text
  if (creative.creative_url) {
    pdf.link(MARGIN, y, CONTENT_W - 10, 10, { url: creative.creative_url });
  }
  y += TITLE_H;

  // ── 8b. Raw URL line ───────────────────────────────────────────────────────
  if (creative.creative_url) {
    const urlDisplay = creative.creative_url.length > 85
      ? creative.creative_url.slice(0, 82) + "…"
      : creative.creative_url;
    pdf.setFontSize(6);

    // "Link:" label in muted white
    pdf.setFont(FONT, "bold");
    pdf.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
    pdf.text("Link:", MARGIN, y);
    const linkLabelW = pdf.getTextWidth("Link: ");

    // URL in blue, clickable
    pdf.setFont(FONT, "normal");
    pdf.setTextColor(100, 140, 200);
    pdf.text(urlDisplay, MARGIN + linkLabelW, y);
    pdf.link(MARGIN + linkLabelW, y - 3, pdf.getTextWidth(urlDisplay), 4, { url: creative.creative_url });
  }
  y += URL_H;

  // ── 9. Tag pills (Type + Funnel only — path already shows city/campaign) ───
  const tags: Array<{ label: string; color: readonly [number, number, number] }> = [
    { label: creative.creative_type, color: MUTED },
    { label: creative.funnel,        color: GOLD  },
    ...(creative.category ? [{ label: creative.category, color: MUTED } as const] : []),
  ];

  let tagX = MARGIN;
  const tagY = y + 1;
  pdf.setFontSize(7);
  for (const tag of tags) {
    if (!tag.label) continue;
    const tw = pdf.getTextWidth(tag.label) + 4;
    pdf.setFillColor(HEADER[0], HEADER[1], HEADER[2]);
    pdf.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
    pdf.setLineWidth(0.2);
    pdf.roundedRect(tagX, tagY - 3, tw, 5, 1, 1, "FD");
    text(tag.label, tagX + 2, tagY + 0.5, 7, tag.color, "normal");
    tagX += tw + 2;
  }

  y += TAGS_H;
  y += SECTION_GAP;
  hline(y, BORDER);
  y += 4;

  // ── 10. Two-Column Preview & Metrics Layout ────────────────────────────────
  // Creative column is 43% of content width — mirrors the modal proportions
  const col1W = Math.round(CONTENT_W * 0.43); // ~78mm
  const gap   = 6;
  const col2W = CONTENT_W - col1W - gap;
  const col1X = MARGIN;
  const col2X = MARGIN + col1W + gap;
  const imgCardH = TWO_COL_H - 7 - 4; // full height minus label row and bottom pad

  // 10a. Column labels with filling horizontal lines
  text("CREATIVE", col1X, y + 4.5, 7.5, GOLD, "bold");
  pdf.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
  pdf.setLineWidth(0.3);
  const label1W = pdf.getTextWidth("CREATIVE");
  pdf.line(col1X + label1W + 2, y + 3.5, col1X + col1W, y + 3.5);

  text("METRICS OVERVIEW", col2X, y + 4.5, 7.5, GOLD, "bold");
  const label2W = pdf.getTextWidth("METRICS OVERVIEW");
  pdf.line(col2X + label2W + 2, y + 3.5, col2X + col2W, y + 3.5);

  const gridY = y + 7;

  // 10b. Left Column: Creative rounded card (HEADER background, no image border)
  pdf.setFillColor(HEADER[0], HEADER[1], HEADER[2]);
  pdf.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
  pdf.setLineWidth(0.25);
  pdf.roundedRect(col1X, gridY, col1W, imgCardH, 3, 3, "FD");

  if (loadedImg) {
    const canvas = document.createElement("canvas");
    const MAX_W  = 1200;
    const scale  = Math.min(1, MAX_W / loadedImg.naturalWidth);
    canvas.width  = loadedImg.naturalWidth  * scale;
    canvas.height = loadedImg.naturalHeight * scale;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(loadedImg, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);

    const pad = 2.5;
    const maxW = col1W - pad * 2;
    const maxH = imgCardH - pad * 2;
    const imgAspect = canvas.width / canvas.height;
    let iw = maxW;
    let ih = maxW / imgAspect;
    if (ih > maxH) { ih = maxH; iw = maxH * imgAspect; }
    pdf.addImage(dataUrl, "JPEG", col1X + pad + (maxW - iw) / 2, gridY + pad + (maxH - ih) / 2, iw, ih);

  } else if (creative.creative_type === "Text") {
    text("AD", col1X + 4, gridY + 6, 6.5, MUTED, "bold");
    if (creative.headline) {
      pdf.setFont(FONT, "bold"); pdf.setFontSize(9);
      pdf.setTextColor(GOLD[0], GOLD[1], GOLD[2]);
      pdf.text(pdf.splitTextToSize(creative.headline, col1W - 8) as string[], col1X + 4, gridY + 14);
    }
    if (creative.description) {
      pdf.setFont(FONT, "normal"); pdf.setFontSize(7.5);
      pdf.setTextColor(WHITE[0], WHITE[1], WHITE[2]);
      pdf.text((pdf.splitTextToSize(creative.description, col1W - 8) as string[]).slice(0, 5), col1X + 4, gridY + 28);
    }
  } else {
    text("No preview available", col1X + col1W / 2, gridY + imgCardH / 2, 7.5, MUTED, "italic", "center");
  }

  // 10c. Right Column: Metrics grid (3-col for ≤6 metrics, 4-col for 8)
  const CELL_W = (col2W - (GRID_COLS - 1) * 2) / GRID_COLS;

  for (let i = 0; i < cells.length; i++) {
    const col  = i % GRID_COLS;
    const row  = Math.floor(i / GRID_COLS);
    const cx   = col2X + col * (CELL_W + 2);
    const cy   = gridY + row * (CELL_H + 2);
    const cell = cells[i];

    // ── Card background & border ─────────────────────────────────────────────
    const bg: readonly [number, number, number]        = cell.accent ? [28, 22, 8]    : [20, 21, 28];
    const borderCol: readonly [number, number, number] = cell.accent ? [160, 115, 30] : [38, 40, 54];

    pdf.setFillColor(bg[0], bg[1], bg[2]);
    pdf.setDrawColor(borderCol[0], borderCol[1], borderCol[2]);
    pdf.setLineWidth(cell.accent ? 0.45 : 0.2);
    pdf.roundedRect(cx, cy, CELL_W, CELL_H, 2, 2, "FD");

    // ── Centered text layout ──────────────────────────────────────────────────
    const midX = cx + CELL_W / 2;

    // Label — centered top, 5pt, MUTED uppercase
    text(cell.label.toUpperCase(), midX, cy + 3.8, 5, MUTED, "normal", "center");

    // Value — centered, large bold
    const valColor: readonly [number, number, number] = cell.accent ? GOLD : WHITE;
    const valSize = cell.value.length > 8 ? 9 : 10.5;
    text(cell.value, midX, cy + (cell.sub ? 9.2 : 10), valSize, valColor, "bold", "center");

    // Delta — centered bottom, colored
    if (cell.sub) {
      const positive = cell.sub.startsWith("+");
      const negative = cell.sub.startsWith("-") && !cell.label.includes("CPC");
      const subColor: readonly [number, number, number] =
        positive ? [52, 211, 153] : negative ? [248, 113, 113] : MUTED;
      text(cell.sub, midX, cy + 13.5, 5, subColor, "normal", "center");
    }
  }

  y += TWO_COL_H;
  y += SECTION_GAP;
  hline(y, BORDER);
  y += 4;

  // ── 11. Chart Cards via svg2pdf.js ─────────────────────────────────────────
  const CHART_PAD = 4;
  const INNER_CHART_W = CONTENT_W - CHART_PAD * 2; // 182 - 8 = 174mm
  const INNER_CHART_H = 44;

  for (const { id, title, svg, aspect } of resolvedCharts) {
    // Card background and border
    pdf.setFillColor(HEADER[0], HEADER[1], HEADER[2]);
    pdf.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
    pdf.setLineWidth(0.25);
    pdf.roundedRect(MARGIN, y, CONTENT_W, CARD_H, 3, 3, "FD");

    // Card title
    text(title, MARGIN + CHART_PAD, y + 6.5, 7.5, GOLD, "bold");

    // Render legends inside card header
    if (id === "ctr" || id === "cpc") {
      drawChartLegend(pdf, MARGIN + CONTENT_W - CHART_PAD, y + 6.5, [
        { label: "This creative", color: GOLD },
        { label: "Dataset avg",   color: TEAL, dashed: true },
      ]);
    } else if (id === "impr-clicks") {
      drawChartLegend(pdf, MARGIN + CONTENT_W - CHART_PAD, y + 6.5, [
        { label: "Impressions", color: GOLD },
        { label: "Clicks",      color: TEAL },
      ]);
    }

    // Measure and render SVG vectors inside the card
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;left:-9999px;top:-9999px;width:800px;height:600px;pointer-events:none;";
    host.appendChild(svg);
    document.body.appendChild(host);

    try {
      const svgH = Math.min(INNER_CHART_H, INNER_CHART_W * aspect);
      const svgOffset = (INNER_CHART_H - svgH) / 2; // vertical centering
      
      await (pdf as unknown as { svg: (el: SVGSVGElement, opts: { x: number; y: number; width: number; height: number }) => Promise<void> })
        .svg(svg, { x: MARGIN + CHART_PAD, y: y + 10 + svgOffset, width: INNER_CHART_W, height: svgH });
    } finally {
      document.body.removeChild(host);
    }

    y += CARD_H + SECTION_GAP;
  }

  // ── 12. Footer ────────────────────────────────────────────────────────────
  y += SECTION_GAP;
  hline(y, GOLD, 0.4);
  y += 5;
  text("CreativeVisibility  ·  Confidential  ·  Not for external distribution without authorisation",
    PAGE_W / 2, y, 6.5, MUTED, "italic", "center");
  text("© 2026 CreativeVisibility. All rights reserved.", PAGE_W / 2, y + 4.5, 6, MUTED, "italic", "center");

  // ── 13. Save ───────────────────────────────────────────────────────────────
  const safeName = adTitle.replace(/[^a-z0-9]/gi, "_").slice(0, 60);
  pdf.save(`CreativeReport_${safeName}_${startFmt}_to_${endFmt}.pdf`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard Performance Report PDF  (landscape A4, table layout)
//
// Mirrors the DirectoryTree exactly:
//   • Landscape A4 — more room for metric columns
//   • Multi-page — column headers repeat on every page
//   • Group rows — one per hierarchy level (city → funnel → type → campaign → adgroup)
//     indented 4 mm per level, depth-coded background
//   • Creative rows — thumbnail inline + name/tags + right-aligned metric values
//   • NO card containers — pure rows and columns, same as the dashboard
// ─────────────────────────────────────────────────────────────────────────────



// ── Row types for the dashboard table PDF ─────────────────────────────────────
export type PdfTableRow =
  | { kind: "total";    count: number;  metrics: ComputedMetrics }
  | { kind: "group";    label: string;  dimLabel: string; depth: number; count: number; metrics: ComputedMetrics }
  | { kind: "creative"; creative: Creative; metrics: ComputedMetrics; depth: number };

export interface DashboardPdfData {
  tableRows:       PdfTableRow[];
  enabledColumns:  string[];
  hierarchyLabels: string[];   // e.g. ["Location","Funnel","Type","Campaign","Ad Group"]
  context: {
    dateRange:      string;
    selectionLabel: string;
    selectedCount:  number;
    totalCount:     number;
    filterBits:     string[];
    columnsLabel:   string;
  };
  rowHeightPx: number;
  theme:       "light" | "dark";
}


export async function exportDashboardPdf(data: DashboardPdfData): Promise<void> {
  const { jsPDF } = await import("jspdf");

  const { tableRows, enabledColumns, hierarchyLabels, context, rowHeightPx, theme } = data;

  // ── Load fonts ─────────────────────────────────────────────────────────────
  // Poppins + Montserrat don't include ₹ — also try NotoSans as a unicode fallback.
  // If all fail, use ASCII fallbacks via safe().
  const [fonts, notoB64Dash] = await Promise.all([loadPdfFonts(), loadNotoSans()]);
  const hasCurrency = !!notoB64Dash;
  const safe = hasCurrency
    ? (s: string) => s
    : (s: string) => s.replace(/₹/g, "Rs.").replace(/→/g, "-").replace(/[^ -ÿ]/g, "");

  // ── Colors ─────────────────────────────────────────────────────────────────
  const GOLD   = [200, 163, 80]  as const;
  const BG     = theme === "light" ? [255, 255, 255] as const : [10,  11,  15]  as const;
  const HDR    = theme === "light" ? [248, 246, 240] as const : [18,  18,  24]  as const;
  const TEXT   = theme === "light" ? [20,  20,  38]  as const : [240, 240, 245] as const;
  const MUTED  = theme === "light" ? [120, 120, 140] as const : [120, 122, 140] as const;
  const BDR    = theme === "light" ? [210, 212, 225] as const : [40,  42,  56]  as const;
  const TOT_BG = theme === "light" ? [255, 252, 236] as const : [28,  22,  8]   as const;
  const TOT_BD = theme === "light" ? [200, 155, 60]  as const : [120, 95,  38]  as const;
  const CR_BG  = theme === "light" ? [255, 255, 255] as const : [12,  12,  17]  as const;

  const GBG: Array<readonly [number, number, number]> = theme === "light"
    ? [[225,225,245],[232,232,248],[238,238,251],[243,243,253],[247,247,255]]
    : [[22,21,30],[17,17,23],[14,14,19],[12,12,16],[11,11,14]];

  const DCLR: Array<readonly [number, number, number]> = [
    [200, 163,  80],
    [ 61, 191, 158],
    [120, 140, 240],
    [200, 100, 100],
    [160, 120, 200],
  ];

  // ── Page layout — auto-height, 297mm wide ─────────────────────────────────
  const PW = 297;
  const MH = 11, MV = 10;
  const CW = PW - MH * 2;   // 275 mm

  const N        = Math.max(1, enabledColumns.length);
  const MCOL_W   = Math.max(20, Math.min(28, (CW * 0.46) / N));
  const MCOL_GAP = 2;
  const MCW      = N * MCOL_W + (N - 1) * MCOL_GAP;
  const LABEL_W  = CW - MCW;

  const INDENT     = 5;
  // 1 CSS px at 96 dpi = 0.265 mm; use 90% of that so rows are slightly tighter than screen
  const PX_TO_MM   = 0.265;
  const effectiveH = Math.max(48, rowHeightPx || 96);
  const tH         = Math.max(20, Math.min(Math.round(effectiveH * PX_TO_MM * 0.90), 28));
  const CREATIVE_H = tH + 8;   // 4 mm padding top + 4 mm bottom
  const GROUP_H    = 11;
  const TOTAL_H    = 14;
  const COL_H      = 10;
  const FHD_H      = 32;
  const FOOTER_H   = 12;
  const STRIPE_H   = 2.5;
  const SUBSTRIPE_H = 1.2;
  // y where content rows begin
  const START_Y    = STRIPE_H + SUBSTRIPE_H + FHD_H + COL_H + 3;

  // ── Compute total page height from row content ─────────────────────────────
  const contentH = tableRows.reduce((sum, row) =>
    sum + (row.kind === "total" ? TOTAL_H : row.kind === "group" ? GROUP_H : CREATIVE_H), 0);
  const PAGE_H = START_Y + contentH + FOOTER_H + MV;

  // Thumbnails intentionally omitted — client-shareable reports render as
  // pure typography + metrics, matching the dashboard's structural rhythm.

  // ── Create single-page PDF with computed height ────────────────────────────
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: [PW, PAGE_H] });

  const FONT  = fonts.poppinsR    ? "poppins"    : (notoB64Dash ? "notosans" : "helvetica");
  const FONTD = fonts.montserratB ? "montserrat" : (notoB64Dash ? "notosans" : "helvetica");
  if (fonts.poppinsR)    { pdf.addFileToVFS("Pp-R.ttf", fonts.poppinsR);    pdf.addFont("Pp-R.ttf", "poppins",    "normal"); }
  if (fonts.poppinsB)    { pdf.addFileToVFS("Pp-B.ttf", fonts.poppinsB);    pdf.addFont("Pp-B.ttf", "poppins",    "bold");   }
  if (fonts.montserratB) { pdf.addFileToVFS("Mt-B.ttf", fonts.montserratB); pdf.addFont("Mt-B.ttf", "montserrat", "bold");   }
  // Register NotoSans as secondary font to handle ₹ and other Unicode glyphs
  if (notoB64Dash) { pdf.addFileToVFS("Ns-R.ttf", notoB64Dash); pdf.addFont("Ns-R.ttf", "notosans", "normal"); pdf.addFont("Ns-R.ttf", "notosans", "bold"); }

  // ── Drawing helpers ────────────────────────────────────────────────────────
  const fR = (x:number,y:number,w:number,h:number,c:readonly[number,number,number]) => {
    pdf.setFillColor(c[0],c[1],c[2]); pdf.rect(x,y,w,h,"F");
  };
  const ln = (x1:number,y1:number,x2:number,y2:number,c:readonly[number,number,number],lw=0.2) => {
    pdf.setDrawColor(c[0],c[1],c[2]); pdf.setLineWidth(lw); pdf.line(x1,y1,x2,y2);
  };
  const tx = (
    s: string, x: number, ty: number, sz: number,
    c: readonly[number,number,number],
    bold = false, al: "left"|"right"|"center" = "left", disp = false,
  ) => {
    pdf.setFont(disp ? FONTD : FONT, bold ? "bold" : "normal");
    pdf.setFontSize(sz); pdf.setTextColor(c[0],c[1],c[2]);
    pdf.text(s, x, ty, { align: al });
  };

  // right-aligned metric values
  const drawMetrics = (m: ComputedMetrics, ry: number, rh: number, bold: boolean, total: boolean) => {
    for (let i = 0; i < enabledColumns.length; i++) {
      const key = enabledColumns[i];
      const rx  = MH + LABEL_W + i*(MCOL_W+MCOL_GAP) + MCOL_W;
      const ty  = ry + rh/2 + 2.5;
      let val: string;
      switch (key) {
        case "impressions": val = fmtNum(m.impressions);       break;
        case "clicks":      val = fmtNum(m.clicks);            break;
        case "cost":        val = safe(fmtINR0(m.cost));       break;
        case "conversions": val = m.conversions.toFixed(1);    break;
        case "ctr":         val = fmtPct(m.ctr);               break;
        case "cpc":         val = safe(fmtINR(m.cpc));         break;
        case "cpm":         val = safe(fmtINR(m.cpm));         break;
        case "cr":          val = fmtPct(m.cr);                break;
        case "cpa":         val = safe(fmtINR(m.cpa));         break;
        default:            val = "—";
      }
      const col: readonly[number,number,number] = key === "cost" ? GOLD : TEXT;
      tx(val, rx, ty, total ? 7.5 : 7, col, bold || total, "right");
    }
  };

  // vertical column separators
  const drawVSep = (y: number, h: number) => {
    pdf.setDrawColor(BDR[0],BDR[1],BDR[2]); pdf.setLineWidth(0.15);
    for (let i = 0; i < enabledColumns.length; i++) {
      const x = MH + LABEL_W + i*(MCOL_W+MCOL_GAP) - 0.75;
      pdf.line(x, y, x, y+h);
    }
  };

  const COL_ABBR: Record<string,string> = {
    impressions:"IMPR.",clicks:"CLICKS",cost:"SPEND",conversions:"CONV.",
    ctr:"CTR",cpc:"CPC",cpm:"CPM",cr:"CR",cpa:"CPA",share_pct:"%SHR",
  };

  // column-header bar
  const drawColHdr = (y: number) => {
    fR(MH, y, CW, COL_H, HDR);
    // Subtle top border on the column header
    ln(MH, y, MH+CW, y, BDR, 0.15);
    ln(MH, y+COL_H, MH+CW, y+COL_H, GOLD, 0.3);
    tx([...hierarchyLabels, "Creative"].join("  ›  "), MH+4, y+6, 6, MUTED);
    for (let i = 0; i < enabledColumns.length; i++) {
      const key = enabledColumns[i];
      tx(COL_ABBR[key]??key, MH+LABEL_W+i*(MCOL_W+MCOL_GAP)+MCOL_W, y+6, 6, GOLD, true, "right");
    }
    drawVSep(y, COL_H);
  };

  // brand header (top of document)
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const fd = (iso:string) => { const [yr,m,d]=iso.split("-"); return `${+d}-${MONTHS[+m-1]}-${yr}`; };
  const [si, ei] = context.dateRange.includes(" to ")
    ? context.dateRange.split(" to ")
    : [context.dateRange, context.dateRange];

  const drawHeader = () => {
    fR(0, 0, PW, STRIPE_H, GOLD);
    fR(0, STRIPE_H, PW, FHD_H, HDR);
    ln(0, STRIPE_H+FHD_H, PW, STRIPE_H+FHD_H, GOLD, 0.45);
    tx("CreativeVisibility",                           MH,    STRIPE_H+9.5, 14, GOLD, true, "left", true);
    tx("Luxury Jewelry · Campaign Performance Portal", MH,    STRIPE_H+15.5, 7, MUTED);
    tx(safe(`${fd(si)}  →  ${fd(ei)}`),               PW-MH, STRIPE_H+9.5, 8.5, GOLD, true, "right");
    const ts = new Date().toLocaleString("en-IN",{dateStyle:"medium",timeStyle:"short"});
    tx(`Generated: ${ts}`,                            PW-MH, STRIPE_H+15.5, 6.5, MUTED, false, "right");
    // Filter summary — left; selection scope — right
    const filterStr = context.filterBits.length ? context.filterBits.join("  ·  ") : "All filters";
    tx(filterStr,                                      MH,    STRIPE_H+21.5, 5.5, MUTED);
    tx(context.selectionLabel,                         PW-MH, STRIPE_H+21.5, 6, GOLD, true, "right");
  };

  // footer (bottom of document — single occurrence)
  const drawFooter = () => {
    const fy = PAGE_H - MV - FOOTER_H + 5;
    ln(MH, PAGE_H-MV-FOOTER_H, MH+CW, PAGE_H-MV-FOOTER_H, BDR, 0.2);
    tx("CreativeVisibility  ·  Confidential",     MH,    fy, 5.5, MUTED);
    tx(safe(`${context.selectedCount} creatives  ·  ${fd(si)} → ${fd(ei)}`), PW-MH, fy, 5.5, MUTED, false, "right");
    tx("© 2026 CreativeVisibility. All rights reserved.", PW/2, fy, 5.5, MUTED, false, "center");
  };

  // ── Draw document ──────────────────────────────────────────────────────────
  fR(0, 0, PW, PAGE_H, BG);   // page background
  drawHeader();
  drawColHdr(STRIPE_H + FHD_H);
  let y = START_Y;

  for (const row of tableRows) {

    // TOTAL row
    if (row.kind === "total") {
      fR(MH, y, CW, TOTAL_H, TOT_BG);
      ln(MH, y,         MH+CW, y,         TOT_BD, 0.35);
      ln(MH, y+TOTAL_H, MH+CW, y+TOTAL_H, TOT_BD, 0.35);
      fR(MH, y, 3.5, TOTAL_H, GOLD);
      tx("TOTAL", MH+6.5, y+TOTAL_H/2+2.8, 8.5, GOLD, true, "left", true);
      // Measure TOTAL text width at the same font/size used to draw it
      pdf.setFont(FONTD, "bold"); pdf.setFontSize(8.5);
      const totalTextW = pdf.getTextWidth("TOTAL");
      pdf.setFontSize(6);
      const bLabel = `${row.count} creatives`;
      const bw  = pdf.getTextWidth(bLabel) + 6;
      const bx  = MH + 6.5 + totalTextW + 4;
      const BAD: readonly[number,number,number] = theme==="dark" ? [55,44,16] : [252,244,200];
      pdf.setFillColor(BAD[0],BAD[1],BAD[2]);
      pdf.setDrawColor(TOT_BD[0],TOT_BD[1],TOT_BD[2]);
      pdf.setLineWidth(0.25);
      pdf.roundedRect(bx, y+TOTAL_H/2-2.8, bw, 5.5, 1.2, 1.2, "FD");
      tx(bLabel, bx+3, y+TOTAL_H/2+1.5, 6, GOLD);
      drawMetrics(row.metrics, y, TOTAL_H, true, true);
      drawVSep(y, TOTAL_H);
      y += TOTAL_H;

    // Group row
    } else if (row.kind === "group") {
      const d = Math.min(row.depth, GBG.length-1);
      fR(MH, y, CW, GROUP_H, GBG[d]);
      // Only depth-0 gets the prominent gold left bar; deeper rows get a thin neutral line
      if (row.depth === 0) {
        fR(MH, y, 3, GROUP_H, GOLD);
      } else {
        fR(MH, y, 1, GROUP_H, BDR);
      }
      ln(MH, y+GROUP_H, MH+CW, y+GROUP_H, BDR, 0.18);

      const ix = MH + 4 + row.depth * INDENT;
      const my = y + GROUP_H/2 + 2;
      const arrowCol: readonly[number,number,number] = row.depth === 0 ? GOLD : MUTED;
      tx("▸", ix, my, 6, arrowCol);
      const lsz = row.depth === 0 ? 8.5 : row.depth === 1 ? 7.5 : 7;
      const lbd = row.depth <= 1;
      tx(row.label, ix+5.5, my, lsz, TEXT, lbd);

      // Measure label width at same font/size used to draw it
      pdf.setFont(FONT, lbd ? "bold" : "normal"); pdf.setFontSize(lsz);
      const labelTextW = pdf.getTextWidth(row.label);
      pdf.setFontSize(6);
      const cBx = ix + 5.5 + labelTextW + 3.5;
      if (cBx + 16 < MH + LABEL_W) {
        const CBD: readonly[number,number,number] = theme==="dark" ? [30,30,42] as const : [218,218,235] as const;
        pdf.setFillColor(CBD[0],CBD[1],CBD[2]);
        pdf.setDrawColor(BDR[0],BDR[1],BDR[2]);
        pdf.setLineWidth(0.15);
        const cBw = pdf.getTextWidth(String(row.count)) + 5;
        pdf.roundedRect(cBx, y+GROUP_H/2-2.5, cBw, 5, 1, 1, "FD");
        tx(String(row.count), cBx+2.5, y+GROUP_H/2+1.2, 6, MUTED);
      }
      drawMetrics(row.metrics, y, GROUP_H, lbd, false);
      drawVSep(y, GROUP_H);
      y += GROUP_H;

    // Creative row (no thumbnail — pure typography, matches dashboard rhythm)
    } else {
      fR(MH, y, CW, CREATIVE_H, CR_BG);
      ln(MH, y+CREATIVE_H, MH+CW, y+CREATIVE_H, BDR, 0.12);
      drawVSep(y, CREATIVE_H);

      const { creative, metrics, depth } = row;
      const ix = MH + 4 + depth * INDENT;

      // Subtle leading accent so creative rows read as leaves of the tree
      fR(ix - 2, y + 3, 0.6, CREATIVE_H - 6, BDR);

      const textX = ix + 2;
      const textW = LABEL_W - (textX - MH) - 4;

      // Primary label — creative URL first (matches dashboard), then headline fallback
      const primary = creative.creative_url
        ? creative.creative_url.replace(/^https?:\/\//, "")
        : (creative.headline || creative.creative_id);
      pdf.setFont(FONT, "bold"); pdf.setFontSize(7.2);
      const nameLines = (pdf.splitTextToSize(primary, textW) as string[]).slice(0, 2);
      const approxBlockH = nameLines.length * 3.2 + 7.5;
      const nameTopY = y + Math.max(4, (CREATIVE_H - approxBlockH) / 2 + 3.2);
      pdf.setTextColor(TEXT[0], TEXT[1], TEXT[2]);
      pdf.text(nameLines, textX, nameTopY);

      // Tags row below label
      const tags = [creative.creative_type, creative.city, creative.funnel, creative.category]
        .filter(Boolean).slice(0, 4);
      let tagX = textX;
      const tagY = nameTopY + nameLines.length * 3.2 + 1.8;
      pdf.setFontSize(5.5);
      for (const t of tags) {
        if (!t || tagX - textX > textW - 14) break;
        const tw = pdf.getTextWidth(t) + 4;
        const isGold = t === creative.funnel;
        const tagBg: readonly[number,number,number]  = isGold
          ? (theme==="dark" ? [40,30,8] as const  : [255,248,215] as const)
          : (theme==="dark" ? [22,22,30] as const : [235,235,248] as const);
        const tagBd: readonly[number,number,number]  = isGold
          ? (theme==="dark" ? [100,70,20] as const : [200,160,60] as const)
          : BDR;
        pdf.setFillColor(tagBg[0],tagBg[1],tagBg[2]);
        pdf.setDrawColor(tagBd[0],tagBd[1],tagBd[2]); pdf.setLineWidth(0.15);
        pdf.roundedRect(tagX, tagY-2.5, tw, 4.5, 0.9, 0.9, "FD");
        tx(t, tagX+2, tagY+0.7, 5.5, isGold ? GOLD : MUTED);
        tagX += tw + 2;
      }

      drawMetrics(metrics, y, CREATIVE_H, false, false);
      y += CREATIVE_H;
    }
  }

  drawFooter();
  pdf.save(`CreativeVisibility_Report_${si}_to_${ei}.pdf`);
}



// ─────────────────────────────────────────────────────────────────────────────
// Legacy dashboard-level PDF export (whole .print-area snapshot via dom-to-image)
// Kept for reference — no longer called by ExportModal.
// ─────────────────────────────────────────────────────────────────────────────

export interface ExportPdfOptions {
  theme: "light" | "dark";
  dateRange?: string;
  filename?: string;
  element?: HTMLElement | null;
  selector?: string;
  metaLines?: string[];
}

export async function exportPdf({
  theme,
  dateRange = "",
  filename = "CreativeVisibility_Report",
  element,
  selector = ".print-area",
  metaLines = [],
}: ExportPdfOptions): Promise<void> {
  const [{ default: jsPDF }, { default: domToImage }] = await Promise.all([
    import("jspdf"),
    // @ts-ignore
    import("dom-to-image-more"),
  ]);

  const el: HTMLElement | null = element ?? document.querySelector<HTMLElement>(selector);
  if (!el) throw new Error(`No element found for selector "${selector}"`);

  const prevBg    = el.style.background;
  const prevColor = el.style.color;
  el.style.background = theme === "light" ? "#ffffff" : "#0a0b0f";
  el.style.color      = theme === "light" ? "#111111" : "#f0f0f5";
  await new Promise(r => requestAnimationFrame(r));

  const scale = 2;
  const dataUrl = await domToImage.toJpeg(el, {
    quality: 0.95,
    bgcolor: theme === "light" ? "#ffffff" : "#0a0b0f",
    width:  el.scrollWidth  * scale,
    height: el.scrollHeight * scale,
    style: {
      transform: `scale(${scale})`,
      transformOrigin: "top left",
      width:  `${el.scrollWidth}px`,
      height: `${el.scrollHeight}px`,
    },
  });

  el.style.background = prevBg;
  el.style.color      = prevColor;

  const img = new Image();
  img.src = dataUrl;
  await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; });

  const PDF_MARGIN  = 14;
  const META_LINE_H = 4;
  const HEADER_H    = 22 + (metaLines.length ? metaLines.length * META_LINE_H + 2 : 0);
  const PW          = 297;
  const PH          = 210;
  const CONTENT_W   = PW - PDF_MARGIN * 2;
  const CONTENT_H   = PH - PDF_MARGIN - HEADER_H;
  const GR = 200, GG = 163, GB = 80;
  const bg   = theme === "dark" ? { r: 10,  g: 11,  b: 15  } : { r: 255, g: 255, b: 255 };
  const tx   = theme === "dark" ? { r: 240, g: 240, b: 245 } : { r: 30,  g: 30,  b: 40  };

  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const imgW = img.width, imgH = img.height;
  const mmPerPx   = CONTENT_W / imgW;
  const totalH_mm = imgH * mmPerPx;
  const pageCount = Math.ceil(totalH_mm / CONTENT_H);

  for (let p = 0; p < pageCount; p++) {
    if (p > 0) pdf.addPage("a4", "landscape");
    pdf.setFillColor(bg.r, bg.g, bg.b); pdf.rect(0, 0, PW, PH, "F");
    pdf.setFillColor(GR, GG, GB);       pdf.rect(0, 0, PW, 1.5, "F");
    const hBg = theme === "dark" ? { r: 18, g: 18, b: 24 } : { r: 248, g: 246, b: 240 };
    pdf.setFillColor(hBg.r, hBg.g, hBg.b); pdf.rect(0, 1.5, PW, HEADER_H - 1.5, "F");
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(13); pdf.setTextColor(GR, GG, GB);
    pdf.text("CreativeVisibility", PDF_MARGIN, 13);
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(8); pdf.setTextColor(tx.r, tx.g, tx.b);
    pdf.text("Luxury Jewelry · Campaign Performance Portal", PDF_MARGIN, 19);
    if (metaLines.length) { pdf.setFontSize(7); metaLines.forEach((l, i) => pdf.text(l, PDF_MARGIN, 23 + i * META_LINE_H)); }
    if (dateRange) {
      pdf.setFontSize(8); pdf.setTextColor(GR, GG, GB);
      pdf.text(dateRange, PW - PDF_MARGIN - pdf.getTextWidth(dateRange), 13);
    }
    const pl = `Page ${p + 1} of ${pageCount}`;
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(7); pdf.setTextColor(tx.r, tx.g, tx.b);
    pdf.text(pl, PW - PDF_MARGIN - pdf.getTextWidth(pl), 19);
    pdf.setDrawColor(GR, GG, GB); pdf.setLineWidth(0.3);
    pdf.line(PDF_MARGIN, HEADER_H, PW - PDF_MARGIN, HEADER_H);

    const sliceY_px = (p * CONTENT_H) / mmPerPx;
    const sliceH_px = Math.min(CONTENT_H / mmPerPx, imgH - sliceY_px);
    if (sliceH_px <= 0) break;
    const sliceCanvas = document.createElement("canvas");
    sliceCanvas.width = imgW; sliceCanvas.height = sliceH_px;
    const ctx = sliceCanvas.getContext("2d")!;
    ctx.drawImage(img, 0, sliceY_px, imgW, sliceH_px, 0, 0, imgW, sliceH_px);
    pdf.addImage(sliceCanvas.toDataURL("image/jpeg", 0.92), "JPEG", PDF_MARGIN, HEADER_H + 2, CONTENT_W, sliceH_px * mmPerPx);
  }

  const ts = new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  pdf.setFont("helvetica", "italic"); pdf.setFontSize(7); pdf.setTextColor(120, 120, 130);
  pdf.text(`Generated by CreativeVisibility on ${ts}`, PDF_MARGIN, PH - 5);
  pdf.save(`${filename}.pdf`);
}
