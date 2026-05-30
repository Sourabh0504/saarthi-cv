/**
 * frontend/src/lib/exportPdf.ts
 * ==============================
 * Generates a downloadable PDF from the `.print-area` element.
 * Uses dom-to-image-more (native SVG foreignObject rendering) to capture the DOM,
 * and jsPDF to assemble A4 pages. This correctly handles modern CSS like oklch().
 */

export interface ExportPdfOptions {
  theme: "light" | "dark";
  dateRange?: string;
  filename?: string;
  selector?: string;
  metaLines?: string[];
}

export async function exportPdf({
  theme,
  dateRange = "",
  filename = "CreativeVisibility_Report",
  selector = ".print-area",
  metaLines = [],
}: ExportPdfOptions): Promise<void> {
  const [{ default: jsPDF }, { default: domToImage }] = await Promise.all([
    import("jspdf"),
    import("dom-to-image-more"),
  ]);

  const el = document.querySelector<HTMLElement>(selector);
  if (!el) {
    throw new Error(`No element found for selector "${selector}"`);
  }

  // Temporarily force background and color for the capture
  const prevBg    = el.style.background;
  const prevColor = el.style.color;
  el.style.background = theme === "light" ? "#ffffff" : "#0a0b0f";
  el.style.color      = theme === "light" ? "#111111" : "#f0f0f5";

  // Allow browser to apply styles
  await new Promise(r => requestAnimationFrame(r));

  // Capture the element as a high-res JPEG data URL
  // dom-to-image-more uses SVG foreignObject, which bypasses the need for custom CSS parsing.
  // It natively supports oklch, gradients, etc.
  // We double the resolution for retina quality.
  const scale = 2;
  const dataUrl = await domToImage.toJpeg(el, {
    quality: 0.95,
    bgcolor: theme === "light" ? "#ffffff" : "#0a0b0f",
    width: el.scrollWidth * scale,
    height: el.scrollHeight * scale,
    style: {
      transform: `scale(${scale})`,
      transformOrigin: 'top left',
      width: `${el.scrollWidth}px`,
      height: `${el.scrollHeight}px`
    }
  });

  // Restore original styles
  el.style.background = prevBg;
  el.style.color      = prevColor;

  // ── Create image object to get dimensions ─────────────────────────────────
  const img = new Image();
  img.src = dataUrl;
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
  });

  // ── Assemble PDF ──────────────────────────────────────────────────────────
  const PDF_MARGIN = 14;
  const META_LINE_H = 4;
  const HEADER_H   = 22 + (metaLines.length ? metaLines.length * META_LINE_H + 2 : 0);
  const PAGE_W     = 297; // A4 landscape width (mm)
  const PAGE_H     = 210; // A4 landscape height (mm)
  const CONTENT_W  = PAGE_W - PDF_MARGIN * 2;
  const CONTENT_H  = PAGE_H - PDF_MARGIN - HEADER_H;

  const GOLD_R = 200, GOLD_G = 163, GOLD_B = 80;
  const bg   = theme === "dark" ? { r: 10,  g: 11,  b: 15  } : { r: 255, g: 255, b: 255 };
  const text = theme === "dark" ? { r: 240, g: 240, b: 245 } : { r: 30,  g: 30,  b: 40  };

  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  const imgW      = img.width;
  const imgH      = img.height;
  const mmPerPx   = CONTENT_W / imgW; // mm per pixel of the *scaled* image
  const totalH_mm = imgH * mmPerPx;
  const pageCount = Math.ceil(totalH_mm / CONTENT_H);

  for (let p = 0; p < pageCount; p++) {
    if (p > 0) pdf.addPage("a4", "landscape");

    // Page background
    pdf.setFillColor(bg.r, bg.g, bg.b);
    pdf.rect(0, 0, PAGE_W, PAGE_H, "F");

    // Gold top stripe
    pdf.setFillColor(GOLD_R, GOLD_G, GOLD_B);
    pdf.rect(0, 0, PAGE_W, 1.5, "F");

    // Header strip
    const hBg = theme === "dark" ? { r: 18, g: 18, b: 24 } : { r: 248, g: 246, b: 240 };
    pdf.setFillColor(hBg.r, hBg.g, hBg.b);
    pdf.rect(0, 1.5, PAGE_W, HEADER_H - 1.5, "F");

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(13);
    pdf.setTextColor(GOLD_R, GOLD_G, GOLD_B);
    pdf.text("CreativeVisibility", PDF_MARGIN, 13);

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(text.r, text.g, text.b);
    pdf.text("Luxury Jewelry · Campaign Performance Portal", PDF_MARGIN, 19);

    if (metaLines.length) {
      pdf.setFontSize(7);
      pdf.setTextColor(text.r, text.g, text.b);
      const metaY = 23;
      metaLines.forEach((line, i) => {
        pdf.text(line, PDF_MARGIN, metaY + i * META_LINE_H);
      });
    }

    if (dateRange) {
      pdf.setFontSize(8);
      pdf.setTextColor(GOLD_R, GOLD_G, GOLD_B);
      const drW = pdf.getTextWidth(dateRange);
      pdf.text(dateRange, PAGE_W - PDF_MARGIN - drW, 13);
    }

    const pageLabel = `Page ${p + 1} of ${pageCount}`;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    pdf.setTextColor(text.r, text.g, text.b);
    pdf.text(pageLabel, PAGE_W - PDF_MARGIN - pdf.getTextWidth(pageLabel), 19);

    pdf.setDrawColor(GOLD_R, GOLD_G, GOLD_B);
    pdf.setLineWidth(0.3);
    pdf.line(PDF_MARGIN, HEADER_H, PAGE_W - PDF_MARGIN, HEADER_H);

    // Slice canvas for this page
    // We create an offscreen canvas to slice the main image.
    const sliceY_px = (p * CONTENT_H) / mmPerPx;
    const sliceH_px = Math.min(CONTENT_H / mmPerPx, imgH - sliceY_px);
    
    if (sliceH_px <= 0) break;

    const sliceCanvas = document.createElement("canvas");
    sliceCanvas.width = imgW;
    sliceCanvas.height = sliceH_px;
    const ctx = sliceCanvas.getContext("2d")!;
    // Draw the relevant vertical slice of the original image
    ctx.drawImage(img, 0, sliceY_px, imgW, sliceH_px, 0, 0, imgW, sliceH_px);

    const sliceDataUrl = sliceCanvas.toDataURL("image/jpeg", 0.92);
    const sliceH_mm = sliceH_px * mmPerPx;

    pdf.addImage(sliceDataUrl, "JPEG", PDF_MARGIN, HEADER_H + 2, CONTENT_W, sliceH_mm);
  }

  // Footer on last page
  const ts = new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  pdf.setFont("helvetica", "italic");
  pdf.setFontSize(7);
  pdf.setTextColor(120, 120, 130);
  pdf.text(`Generated by CreativeVisibility on ${ts}`, PDF_MARGIN, PAGE_H - 5);

  pdf.save(`${filename}.pdf`);
}
