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
// Each font is cached in module scope after first load.
type FontCache = string | null | "failed";
const _fontCache: Record<string, FontCache> = {};

async function loadFontB64(url: string): Promise<string | null> {
  if (_fontCache[url] === "failed") return null;
  if (_fontCache[url])              return _fontCache[url] as string;
  try {
    const r = await fetch(url, { cache: "force-cache" });
    if (!r.ok) throw new Error("font fetch failed");
    const bytes = new Uint8Array(await r.arrayBuffer());
    const chunk = 0x8000;
    let b = "";
    for (let i = 0; i < bytes.length; i += chunk) {
      b += String.fromCharCode(...(bytes.subarray(i, Math.min(i + chunk, bytes.length)) as unknown as number[]));
    }
    _fontCache[url] = btoa(b);
    return _fontCache[url] as string;
  } catch {
    _fontCache[url] = "failed";
    return null;
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
async function loadNotoSans(): Promise<string | null> {
  return loadFontB64(`${CDN}/notosans/NotoSans-Regular.ttf`);
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
    { key: "cost",        label: "Spend",       value: fmtINR0(totals.cost), accent: true },
    { key: "ctr",         label: "CTR",         value: fmtPct(totals.ctr),                         sub: ctrDeltaStr },
    { key: "cpc",         label: "CPC",         value: fmtINR(totals.cpc),    sub: cpcDeltaStr },
    { key: "cpm",         label: "CPM",         value: fmtINR(totals.cpm) },
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
  const dr = `${startFmt}  →  ${endFmt}`;
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
// Dashboard Performance Report PDF
// Draws the full creative performance table using jsPDF (no screenshots).
// Every element is a real PDF object — selectable text, vector borders, crisp
// metric tiles.  Architecture matches exportCreativePdf above.
// ─────────────────────────────────────────────────────────────────────────────

export interface DashboardPdfData {
  rows:          Array<{ creative: Creative; metrics: ComputedMetrics }>;
  totals:        ComputedMetrics;
  enabledColumns: string[];   // ordered list of column keys to render
  context: {
    dateRange:      string;
    modeLabel:      string;
    selectionLabel: string;
    selectedCount:  number;
    totalCount:     number;
    filterBits:     string[];   // pre-built ["Status: All", "City: Mumbai", …]
    columnsLabel:   string;
  };
  rowHeightPx: number;   // dashboard density setting in px
  theme:       "light" | "dark";
}

export async function exportDashboardPdf(data: DashboardPdfData): Promise<void> {
  const { jsPDF } = await import("jspdf");
  await import("svg2pdf.js");

  const { rows, totals, enabledColumns, context, rowHeightPx, theme } = data;

  // ── Brand colors — both themes ─────────────────────────────────────────────
  const GOLD   = [200, 163, 80]  as const;
  const GOLD_D = [100,  80, 30]  as const;   // dimmed gold for accent borders

  // surface colors flip per theme
  const PAGE_BG  = theme === "light" ? [255, 255, 255] as const : [10,  11,  15]  as const;
  const HEADER   = theme === "light" ? [248, 246, 240] as const : [18,  18,  24]  as const;
  const MUTED    = theme === "light" ? [130, 130, 148] as const : [120, 122, 140] as const;
  const TEXT     = theme === "light" ? [20,  20,  38]  as const : [240, 240, 245] as const;
  const BORDER   = theme === "light" ? [210, 212, 225] as const : [45,  46,  58]  as const;
  const TILE_BG  = theme === "light" ? [238, 238, 248] as const : [26,  26,  40]  as const;
  const ROW_BG   = theme === "light" ? [248, 248, 252] as const : [15,  15,  20]  as const;
  const COST_BG  = theme === "light" ? [253, 248, 236] as const : [28,  22,   8]  as const;

  const STATUS_ON  = [52,  211, 153] as const;
  const STATUS_OFF = [248, 113, 113] as const;
  const TEAL       = [61,  191, 158] as const;

  // ── Date formatter ─────────────────────────────────────────────────────────
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const fmtDate = (iso: string) => {
    const [y, m, d] = iso.split("-");
    return `${+d}-${MONTHS[+m - 1]}-${y}`;
  };
  const [startIso, endIso] = context.dateRange.includes(" to ")
    ? context.dateRange.split(" to ")
    : [context.dateRange, context.dateRange];
  const startFmt = fmtDate(startIso);
  const endFmt   = fmtDate(endIso);

  // ── Load fonts in parallel with images ────────────────────────────────────
  const fontsPromise = loadPdfFonts();

  // ── Load all creative images in parallel (JPEG thumbs for both image & video) ──
  const imgMap = new Map<string, HTMLImageElement | null>();
  await Promise.allSettled(
    rows.map(async ({ creative }) => {
      const ytId = creative.creative_type === "Video" ? getYouTubeId(creative.creative_url) : null;
      const src  = creative.creative_type === "Image" ? creative.creative_url
                 : ytId                               ? `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`
                 : null;
      if (src) {
        const img = await loadImage(src);
        imgMap.set(creative.creative_id, img);
      }
    }),
  );

  const fonts = await fontsPromise;

  // ── Page / layout constants (mm) ──────────────────────────────────────────
  const PW       = 210;
  const MARGIN   = 14;
  const CW       = PW - MARGIN * 2;   // 182

  const STRIPE_H  = 2.5;
  const HEADER_H  = 26;
  const SGAP      = 5;    // generic section gap
  const CONTEXT_H = 20;   // filter + columns meta strip
  const DIVIDER   = 2;

  // KPI summary strip
  const KPI_COLS   = Math.max(1, Math.min(enabledColumns.length, 6));
  const KPI_CELL_W = (CW - (KPI_COLS - 1) * 3) / KPI_COLS;
  const KPI_CELL_H = 18;
  const KPI_H      = 7 + KPI_CELL_H + 3;   // label + tiles + gap

  // Per-creative row
  const thumbH_mm = Math.max(12, Math.min(rowHeightPx * 0.18, 65));
  const thumbW_mm = Math.min(thumbH_mm * 2.5, 55);
  const INFO_W    = 62;
  const METRIC_W  = CW - thumbW_mm - 4 - INFO_W - 4;
  const MCOLS     = 3;
  const MCELL_W   = (METRIC_W - (MCOLS - 1) * 2) / MCOLS;
  const MCELL_H   = 12;
  const mRows     = Math.max(1, Math.ceil(enabledColumns.length / MCOLS));
  const METRIC_H  = mRows * (MCELL_H + 2) - 2;
  const ROW_INNER = Math.max(thumbH_mm, METRIC_H + 7);
  const ROW_H     = ROW_INNER + 8;   // 4mm top + 4mm bottom pad
  const ROW_GAP   = 2.5;

  const SECTION_LABEL_H = 9;
  const FOOTER_H        = 14;

  const creativesSectionH =
    SECTION_LABEL_H +
    rows.length * (ROW_H + ROW_GAP) - ROW_GAP;

  const PAGE_H =
    STRIPE_H + HEADER_H + SGAP + CONTEXT_H + SGAP +
    KPI_H + SGAP + DIVIDER +
    creativesSectionH +
    SGAP + FOOTER_H + SGAP;

  // ── Create PDF ─────────────────────────────────────────────────────────────
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: [PW, PAGE_H],
  });

  // ── Register fonts ────────────────────────────────────────────────────────
  const FONT_BODY = fonts.poppinsR    ? "poppins"     : "helvetica";
  const FONT_DISP = fonts.montserratB ? "montserrat"  : "helvetica";
  if (fonts.poppinsR) {
    pdf.addFileToVFS("Poppins-Regular.ttf",  fonts.poppinsR);
    pdf.addFont("Poppins-Regular.ttf",  "poppins",     "normal");
  }
  if (fonts.poppinsB) {
    pdf.addFileToVFS("Poppins-Bold.ttf",     fonts.poppinsB);
    pdf.addFont("Poppins-Bold.ttf",     "poppins",     "bold");
  }
  if (fonts.montserratB) {
    pdf.addFileToVFS("Montserrat-Bold.ttf",  fonts.montserratB);
    pdf.addFont("Montserrat-Bold.ttf",  "montserrat",  "bold");
  }

  // ── Drawing helpers ────────────────────────────────────────────────────────
  const fillRect = (x: number, y: number, w: number, h: number, c: readonly [number,number,number]) => {
    pdf.setFillColor(c[0], c[1], c[2]);
    pdf.rect(x, y, w, h, "F");
  };
  const strokeRect = (x: number, y: number, w: number, h: number, c: readonly [number,number,number], lw = 0.2) => {
    pdf.setDrawColor(c[0], c[1], c[2]);
    pdf.setLineWidth(lw);
    pdf.rect(x, y, w, h, "S");
  };
  const roundedFill = (x: number, y: number, w: number, h: number,
    fill: readonly [number,number,number], stroke: readonly [number,number,number], lw = 0.2) => {
    pdf.setFillColor(fill[0], fill[1], fill[2]);
    pdf.setDrawColor(stroke[0], stroke[1], stroke[2]);
    pdf.setLineWidth(lw);
    pdf.roundedRect(x, y, w, h, 2, 2, "FD");
  };
  const hline = (hy: number, c: readonly [number,number,number] = BORDER, lw = 0.25) => {
    pdf.setDrawColor(c[0], c[1], c[2]);
    pdf.setLineWidth(lw);
    pdf.line(MARGIN, hy, PW - MARGIN, hy);
  };
  const txt = (
    s: string, x: number, ty: number, size: number,
    c: readonly [number,number,number],
    style: "normal"|"bold" = "normal",
    font: string = FONT_BODY,
    align: "left"|"right"|"center" = "left",
  ) => {
    pdf.setFont(font, style);
    pdf.setFontSize(size);
    pdf.setTextColor(c[0], c[1], c[2]);
    pdf.text(s, x, ty, { align });
  };

  // ── Metric value formatter (same as UI) ───────────────────────────────────
  const metricVal = (key: string, m: ComputedMetrics): string => {
    switch (key) {
      case "impressions": return fmtNum(m.impressions);
      case "clicks":      return fmtNum(m.clicks);
      case "cost":        return fmtINR0(m.cost);
      case "conversions": return m.conversions.toFixed(1);
      case "ctr":         return fmtPct(m.ctr);
      case "cpc":         return fmtINR(m.cpc);
      case "cpm":         return fmtINR(m.cpm);
      case "cr":          return fmtPct(m.cr);
      case "cpa":         return fmtINR(m.cpa);
      default:            return "—";
    }
  };

  const COL_LABELS: Record<string,string> = {
    impressions:"Impressions", clicks:"Clicks",  cost:"Spend",
    conversions:"Conversions", ctr:"CTR",        cpc:"CPC",
    cpm:"CPM",                 cr:"CR",           cpa:"CPA", share_pct:"% Share",
  };

  // ── Draw ──────────────────────────────────────────────────────────────────
  fillRect(0, 0, PW, PAGE_H, PAGE_BG);

  let y = 0;

  // 1. Gold top stripe
  fillRect(0, 0, PW, STRIPE_H, GOLD);
  y += STRIPE_H;

  // 2. Header block
  fillRect(0, y, PW, HEADER_H, HEADER);
  const hY = y + 9;
  txt("CreativeVisibility",                        MARGIN,       hY,     13, GOLD,  "bold",   FONT_DISP);
  txt("Luxury Jewelry · Campaign Performance Portal", MARGIN,    hY + 5.5, 7.5, MUTED, "normal", FONT_BODY);
  const dr = `${startFmt}  →  ${endFmt}`;
  txt(dr,                                          PW - MARGIN,  hY,     8,  GOLD,  "bold",   FONT_BODY, "right");
  const ts = new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  txt(`Generated: ${ts}`,                          PW - MARGIN,  hY + 5.5, 6.5, MUTED, "normal", FONT_BODY, "right");
  y += HEADER_H;
  hline(y, GOLD, 0.4);
  y += SGAP;

  // 3. Context meta strip
  txt("PERFORMANCE REPORT",      MARGIN, y + 5, 7.5, GOLD, "bold", FONT_BODY);
  const statusLabel = context.filterBits.join("  |  ");
  txt(statusLabel,               MARGIN, y + 11, 6.5, MUTED, "normal", FONT_BODY);
  const colsStr = context.columnsLabel || "None";
  txt(`Columns: ${colsStr}`,     MARGIN, y + 17, 6.5, MUTED, "normal", FONT_BODY);
  // Right-side: selection info
  txt(`${context.selectionLabel}  ·  ${context.selectedCount} / ${context.totalCount} creatives`,
    PW - MARGIN, y + 5, 7, TEXT, "bold", FONT_BODY, "right");
  y += CONTEXT_H;
  y += SGAP;

  // 4. KPI summary tiles
  txt("GRAND TOTALS", MARGIN, y + 5, 7, GOLD, "bold", FONT_BODY);
  y += 7;
  for (let i = 0; i < KPI_COLS; i++) {
    const key = enabledColumns[i];
    if (!key) break;
    const cx = MARGIN + i * (KPI_CELL_W + 3);
    const isCost = key === "cost";
    roundedFill(cx, y, KPI_CELL_W, KPI_CELL_H, isCost ? COST_BG : TILE_BG, isCost ? GOLD_D : BORDER, isCost ? 0.4 : 0.2);
    // label
    txt((COL_LABELS[key] ?? key).toUpperCase(),
      cx + KPI_CELL_W / 2, y + 4, 5, MUTED, "normal", FONT_BODY, "center");
    // value
    const val = metricVal(key, totals);
    const valSize = val.length > 9 ? 8 : 9.5;
    txt(val, cx + KPI_CELL_W / 2, y + 13, valSize, isCost ? GOLD : TEXT, "bold", FONT_BODY, "center");
  }
  y += KPI_CELL_H + 3;
  y += SGAP;
  hline(y, BORDER);
  y += DIVIDER;
  y += SGAP;

  // 5. Creatives section label
  txt("CREATIVES", MARGIN, y + 5, 7.5, GOLD, "bold", FONT_BODY);
  txt(`${rows.length} ${rows.length === 1 ? "creative" : "creatives"}`, PW - MARGIN, y + 5, 7, MUTED, "normal", FONT_BODY, "right");
  y += SECTION_LABEL_H;

  // 6. Per-creative rows
  const col1X = MARGIN;
  const col2X = MARGIN + thumbW_mm + 4;
  const col3X = col2X + INFO_W + 4;

  for (const { creative, metrics } of rows) {
    // Row card background
    roundedFill(MARGIN, y, CW, ROW_H, ROW_BG, BORDER, 0.18);

    const rowInnerY = y + 4;

    // ── Thumbnail card ──────────────────────────────────────────────────────
    roundedFill(col1X, rowInnerY, thumbW_mm, thumbH_mm, TILE_BG, BORDER, 0.18);

    const img = imgMap.get(creative.creative_id);
    if (img) {
      const canvas = document.createElement("canvas");
      const MAX_W  = 900;
      const scale  = Math.min(1, MAX_W / img.naturalWidth);
      canvas.width  = img.naturalWidth  * scale;
      canvas.height = img.naturalHeight * scale;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.88);
      const imgAspect = canvas.width / canvas.height;
      const maxW = thumbW_mm - 1.5;
      const maxH = thumbH_mm - 1.5;
      let iw = maxW, ih = maxW / imgAspect;
      if (ih > maxH) { ih = maxH; iw = maxH * imgAspect; }
      pdf.addImage(
        dataUrl, "JPEG",
        col1X + (thumbW_mm - iw) / 2,
        rowInnerY + (thumbH_mm - ih) / 2,
        iw, ih,
      );
    } else if (creative.creative_type === "Text") {
      txt("AD", col1X + 3, rowInnerY + 5, 5.5, MUTED, "bold", FONT_BODY);
      if (creative.headline) {
        pdf.setFont(FONT_BODY, "bold"); pdf.setFontSize(8);
        pdf.setTextColor(GOLD[0], GOLD[1], GOLD[2]);
        const lines = pdf.splitTextToSize(creative.headline, thumbW_mm - 6) as string[];
        pdf.text(lines.slice(0, 3), col1X + 3, rowInnerY + 11);
      }
    }

    // ── Info block ──────────────────────────────────────────────────────────
    const midY = rowInnerY + ROW_INNER * 0.5;

    // Creative headline or ID
    const title = creative.headline ?? creative.creative_id;
    pdf.setFont(FONT_BODY, "bold"); pdf.setFontSize(8);
    pdf.setTextColor(TEXT[0], TEXT[1], TEXT[2]);
    const titleLines = pdf.splitTextToSize(title, INFO_W - 2) as string[];
    pdf.text(titleLines.slice(0, 2), col2X, rowInnerY + 5.5);

    // Campaign name (muted, smaller)
    if (creative.campaign_name) {
      pdf.setFont(FONT_BODY, "normal"); pdf.setFontSize(6.5);
      pdf.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
      const campLines = pdf.splitTextToSize(creative.campaign_name, INFO_W - 2) as string[];
      pdf.text(campLines.slice(0, 2), col2X, rowInnerY + 11);
    }

    // Tag pills: City · Funnel · Type
    let tagX = col2X;
    const tagY  = rowInnerY + ROW_INNER - 5;
    const tags: Array<{ label: string; gold: boolean }> = [
      { label: creative.city,          gold: false },
      { label: creative.funnel,        gold: true  },
      { label: creative.campaign_type, gold: false },
    ].filter(t => t.label);

    pdf.setFontSize(6);
    for (const tag of tags) {
      if (tagX - col2X > INFO_W - 12) break;
      const tw = pdf.getTextWidth(tag.label) + 4;
      pdf.setFillColor(TILE_BG[0], TILE_BG[1], TILE_BG[2]);
      pdf.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
      pdf.setLineWidth(0.18);
      pdf.roundedRect(tagX, tagY - 3, tw, 4.5, 0.8, 0.8, "FD");
      pdf.setTextColor(tag.gold ? GOLD[0] : MUTED[0], tag.gold ? GOLD[1] : MUTED[1], tag.gold ? GOLD[2] : MUTED[2]);
      pdf.text(tag.label, tagX + 2, tagY + 0.2);
      tagX += tw + 2;
    }
    // Status badge (right side of info column)
    const statusColor = creative.status === "Enabled" ? STATUS_ON : STATUS_OFF;
    const statusLabel2 = creative.status.toUpperCase();
    pdf.setFontSize(5.5);
    const sw = pdf.getTextWidth(statusLabel2) + 4;
    const statusX = col2X + INFO_W - sw;
    pdf.setFillColor(statusColor[0] * 0.15, statusColor[1] * 0.15, statusColor[2] * 0.15);
    pdf.setDrawColor(statusColor[0], statusColor[1], statusColor[2]);
    pdf.setLineWidth(0.2);
    pdf.roundedRect(statusX, rowInnerY + 2, sw, 4.5, 0.8, 0.8, "FD");
    pdf.setTextColor(statusColor[0], statusColor[1], statusColor[2]);
    pdf.text(statusLabel2, statusX + 2, rowInnerY + 5.5);

    // ── Metric tiles grid ───────────────────────────────────────────────────
    // Label row "METRICS" above grid
    txt("METRICS", col3X, rowInnerY + 4, 5.5, MUTED, "normal", FONT_BODY);

    for (let i = 0; i < enabledColumns.length; i++) {
      const key  = enabledColumns[i];
      const col  = i % MCOLS;
      const row  = Math.floor(i / MCOLS);
      const cx   = col3X + col * (MCELL_W + 2);
      const cy   = rowInnerY + 6 + row * (MCELL_H + 2);
      const isCost = key === "cost";

      roundedFill(cx, cy, MCELL_W, MCELL_H, isCost ? COST_BG : TILE_BG, isCost ? GOLD_D : BORDER, isCost ? 0.35 : 0.18);

      const midX = cx + MCELL_W / 2;
      txt((COL_LABELS[key] ?? key).toUpperCase(), midX, cy + 3.5, 4.5, MUTED, "normal", FONT_BODY, "center");
      const val = metricVal(key, metrics);
      const vSize = val.length > 9 ? 7 : 8;
      txt(val, midX, cy + 9.5, vSize, isCost ? GOLD : TEXT, "bold", FONT_BODY, "center");
    }

    y += ROW_H + ROW_GAP;
  }

  // 7. Footer
  y += SGAP;
  hline(y, GOLD, 0.35);
  y += 5;
  txt(
    "CreativeVisibility  ·  Confidential  ·  Not for external distribution without authorisation",
    PW / 2, y, 6, MUTED, "normal", FONT_BODY, "center",
  );
  txt("© 2026 CreativeVisibility. All rights reserved.", PW / 2, y + 4, 5.5, MUTED, "normal", FONT_BODY, "center");

  // ── Save ──────────────────────────────────────────────────────────────────
  const safeRange = `${startFmt}_to_${endFmt}`;
  pdf.save(`CreativeVisibility_Report_${safeRange}.pdf`);
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
