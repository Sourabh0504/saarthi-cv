# Changelog

All notable changes to the **CreativeVisibility** project will be documented in this file.

## [Unreleased] - 2026-05-28

### Added
- [workflow.md](file:///d:/CreativeVisibility/workflow.md): Initial workflow definition and project discussion tracking.
- [changes.md](file:///d:/CreativeVisibility/changes.md): This file, tracking all changes made to the codebase.
- `agents/` folder: Created a dedicated folder for project subagents and configuration.
- [agents/README.md](file:///d:/CreativeVisibility/agents/README.md): Created placeholder description for the agents folder.
- [agents/ads_agent.md](file:///d:/CreativeVisibility/agents/ads_agent.md): Profile and specification for the newly defined Google Ads expert subagent (created by Sourabh Chaudhari).


### Changed
- [workflow.md](file:///d:/CreativeVisibility/workflow.md): Completely restructured into a 17-section, indexed master specification — covering executive summary, problem statement, campaign hierarchy, full technology stack, directory map, data architecture (SQLite schema + SQL queries), Google Sheets schema, FastAPI routes, React component tree, CSS design tokens, all feature specs, performance formulas, export engine (PDF/CSV), 10 edge case guardrails, 7-phase QA checklist, subagent reference, and a complete decision history log.
- [agents/ads_agent.md](file:///d:/CreativeVisibility/agents/ads_agent.md): Expanded into an encyclopedic 13-section Google Ads reference covering all campaign types, bidding strategies, audience signals, asset specs, formulas, benchmarks, and 10 operational mandates.

## [Unreleased] - 2026-05-30 (Session 3)

### Changed (complete rethink — table layout)
- [frontend/src/lib/exportPdf.ts](file:///d:/CreativeVisibility/frontend/src/lib/exportPdf.ts): `exportDashboardPdf` completely rewritten. Now outputs landscape A4 multi-page PDF that exactly mirrors the DirectoryTree table: hierarchy group rows (depth-coded backgrounds + colored left-border accent per level) indented 4mm per level, creative rows with inline thumbnails, right-aligned metric columns, TOTAL row with gold accent, column headers repeated on every page, "Page N of M" footer. No card containers.
- [frontend/src/components/ExportModal.tsx](file:///d:/CreativeVisibility/frontend/src/components/ExportModal.tsx): PDF preview pane rebuilt as a table mockup (column headers, TOTAL row, group rows, creative rows with thumbnails) matching the new PDF structure. Accepts `hierarchy: Dim[]` prop for building the mini preview tree. Removed old card-container preview.
- [frontend/src/routes/index.tsx](file:///d:/CreativeVisibility/frontend/src/routes/index.tsx): Added `buildPdfTableRows()` — recursively groups `visibleRows` by current hierarchy (sorted by cost desc), produces flat `PdfTableRow[]` array with proper depth levels. `handleExportPDF` now passes `tableRows` + `hierarchyLabels` to `exportDashboardPdf`. `ExportModal` receives `hierarchy` prop.

### Added
- [frontend/src/lib/exportPdf.ts](file:///d:/CreativeVisibility/frontend/src/lib/exportPdf.ts): `PdfTableRow` type (total | group | creative) exported for use in index.tsx.

## [Unreleased] - 2026-05-30 (Session 2)

### Added
- [frontend/src/lib/exportPdf.ts](file:///d:/CreativeVisibility/frontend/src/lib/exportPdf.ts): New `exportDashboardPdf()` function — full component-based jsPDF dashboard performance report. Draws header, context strip, grand-total KPI tiles, and per-creative rows (thumbnail + info + metric tiles) entirely as real PDF objects (no screenshots). Supports both dark and light themes, auto-height portrait A4, adjustable density (thumbnail height).
- [frontend/src/lib/exportPdf.ts](file:///d:/CreativeVisibility/frontend/src/lib/exportPdf.ts): `loadNotoSans()` — defines the previously missing font loader called by `exportCreativePdf`.
- [frontend/src/components/ExportModal.tsx](file:///d:/CreativeVisibility/frontend/src/components/ExportModal.tsx): Complete redesign. Now a 5-zone glassmorphic dialog: header, view snapshot card, scope+density settings (visual card pickers), live HTML PDF preview pane with inline dark/light toggle, and download CTA buttons. Hovering a download button switches the preview theme live.

### Changed
- [frontend/src/components/ExportModal.tsx](file:///d:/CreativeVisibility/frontend/src/components/ExportModal.tsx): Removed `hierarchyOptions` / `canScopeAll` props. Added `visibleRows` and `totals` props for the live preview.
- [frontend/src/routes/index.tsx](file:///d:/CreativeVisibility/frontend/src/routes/index.tsx): `handleExportPDF` rewritten — no longer pre-manipulates DOM state. Passes `visibleRows`/`totals` directly to `exportDashboardPdf`. All scope logic computed inline.
- [frontend/src/routes/index.tsx](file:///d:/CreativeVisibility/frontend/src/routes/index.tsx): `exportContext` gains `columnKeys` field. Removed `hierarchyLabel`/`sortLabel`/`rankMetric` from exportContext (not needed by new modal).
- Removed `hierarchyOptions` useMemo and `HIERARCHY_PRESETS` import from index.tsx.

## [Unreleased] - 2026-05-30

### Added
- [frontend/src/lib/exportPdf.ts](file:///d:/CreativeVisibility/frontend/src/lib/exportPdf.ts): Completely rewrote the creative-specific performance report PDF exporter with dynamic height portrait formatting, selectable text, and high-fidelity Recharts vector SVG paths.
- Added native OKLCH to sRGB color resolution and structural defs display-hiding bypass to fix empty vector charts in PDFs.
- Programmed native jsPDF vector legend drawings inside the PDF card headers.

### Changed
- [workflow.md](file:///d:/CreativeVisibility/workflow.md): Added Section 13.4 to document the Creative-Specific Portrait Report specification, technical workflow, and solved blockers.
- Updated Table of Contents and changelog metadata.
