# Changelog

All notable changes to the **CreativeVisibility** project will be documented in this file

## Rules and Regulations
1. **Document Everything**: All changes must be documented under the current session's `[Unreleased]` heading.
2. **Architecture Sync**: If any change is made to the architecture or tech stack, `architecture.md` MUST be updated instantly to reflect those changes.
3. **Format**: Use `### Added`, `### Changed`, `### Fixed`, `### Removed` to categorize changes.
4. **Links**: Include markdown links to the specific files modified (e.g., `[path/to/file](file:///path/to/file)`).
5. **Preserve History**: Do not alter or delete historical session logs.


## [Unreleased] - 2026-07-04 (Session 9)

### Added
- Cloned the primary repository into `d:\Saarthi-CV`.
- Added Rules and Regulations to the top of [changes.md](file:///d:/Saarthi-CV/changes.md).
- Created [architecture.md](file:///d:/Saarthi-CV/architecture.md) detailing the working architecture and technology stack.
- Added **Campaign Performance** tab (UI scaffolded) — [CampaignPerformance.tsx](file:///d:/Saarthi-CV/frontend/src/components/CampaignPerformance.tsx). NOTE: currently aggregates creative data as placeholder; will be replaced with Pipeline B data.
- Wrote **Apps Script** for the separate CampaignPerf Google Spreadsheet — [campaignPerformanceDoGet.js](file:///d:/Saarthi-CV/backend/apps_script/campaignPerformanceDoGet.js). Serves raw daily ad-group rows, two-layer cache, `setupSheet()` + `healthCheck()` helpers.
- Created **[PROJECT_SPEC.md](file:///d:/Saarthi-CV/PROJECT_SPEC.md)** — comprehensive product spec documenting both data pipelines, Google Sheet schemas, API design, file map, coding conventions, and open TODOs. Required reading for all agents working on this project.
- Added **Campaign Performance** tab to the dashboard: new [CampaignPerformance.tsx](file:///d:/Saarthi-CV/frontend/src/components/CampaignPerformance.tsx) component that aggregates `filteredCreatives[]` client-side into a Campaign → Ad Group drilldown performance table. Includes: sortable columns (Impressions, Clicks, Spend, CTR, CPC, CPM, Conv., CPA), grand total row, spend % share per campaign, expand/collapse all, zero extra API calls.
- Cloned the helper repository `ContentMaster-LB1` into `references/ContentMaster/`.
- Configured a `.agents` directory junction to register user-added agent skills (`analytics`, `brainstorming`, `frontend-design`, `marketing-plan`, `marketing-psychology`, `skill-creator`).

## [Unreleased] - 2026-06-08 (Session 8)

### Changed
- [frontend/src/components/FilterPanel.tsx](file:///d:/CreativeVisibility/frontend/src/components/FilterPanel.tsx): Compact filter bar redesign. Consolidated 5 separate dimension dropdowns (Status, Cities, Funnels, Types, Campaigns) into a single `FiltersPopover` triggered by a `Filter` icon button with label "Filters". Active-count gold-gradient badge appears on trigger when any dimension filter is applied. Inside the popover: 5 `FilterRow` components — label (72px fixed) + inline multi-select dropdown with gold check styling, All/reset option, and search input for Cities/Types/Campaigns rows.
- [frontend/src/components/FilterPanel.tsx](file:///d:/CreativeVisibility/frontend/src/components/FilterPanel.tsx): Renamed `utilityBtn` → `iconBtn`, reduced all icon button height from `h-9` to `h-8`, search bar from `h-9` to `h-8`, PDF CTA from `h-9` to `h-8`.
- [frontend/src/components/FilterPanel.tsx](file:///d:/CreativeVisibility/frontend/src/components/FilterPanel.tsx): Reset button is now conditionally rendered (hidden when `activeCount === 0`) instead of disabled. `dimCount` (dimension-only) drives Filters badge; `activeCount` (includes search) drives Reset visibility.
- [frontend/src/components/FilterPanel.tsx](file:///d:/CreativeVisibility/frontend/src/components/FilterPanel.tsx): Removed `SegmentDropdown` component (replaced by `FiltersPopover` + `FilterRow`). Added `Filter` to lucide imports. `Filters` interface and all Props/handlers unchanged.

## [Unreleased] - 2026-06-08 (Session 7)

### Changed
- [frontend/src/routes/index.tsx](file:///d:/CreativeVisibility/frontend/src/routes/index.tsx): Collapsed palette switcher from 4 inline swatch buttons into a single `Palette` icon button + Popover. Popover shows 4 labelled swatches; active one gets a ring + scale indicator.
- [frontend/src/routes/index.tsx](file:///d:/CreativeVisibility/frontend/src/routes/index.tsx): Collapsed inline threshold controls into a single `SlidersHorizontal` icon button + Popover. Popover contains the enabled toggle, metric selector, min-value input, and min-per-group input. Icon tints gold when filter is active. All state and handlers unchanged.
- [frontend/src/routes/index.tsx](file:///d:/CreativeVisibility/frontend/src/routes/index.tsx): Added `Palette`, `SlidersHorizontal` to lucide-react imports; added `Popover`, `PopoverTrigger`, `PopoverContent` from `@/components/ui/popover`.
- [frontend/src/styles.css](file:///d:/CreativeVisibility/frontend/src/styles.css): Redesigned base as "Sophisticated Obsidian" — background shifted to `oklch(0.13 0.003 260)`, gold tokens softened (chroma 0.15→0.12), `Inter` added as primary `--font-body`.
- [frontend/src/styles.css](file:///d:/CreativeVisibility/frontend/src/styles.css): Added three palette override classes: `.palette-indigo`, `.palette-mint`, `.palette-rose` — each overrides background, card, popover, primary, ring, gold, gold-dim, gradient, and scrollbar tokens.
- [frontend/src/routes/__root.tsx](file:///d:/CreativeVisibility/frontend/src/routes/__root.tsx): Added Inter font preconnect + stylesheet `<link>` tags to root route `head()`.

## [Unreleased] - 2026-06-04 (Session 6)

### Added
- [frontend/src/components/DirectoryTree.tsx](file:///d:/CreativeVisibility/frontend/src/components/DirectoryTree.tsx): Threshold filter system — `FlatItem` union type, `insertNMoreRows()` function (2-case logic: metric threshold + min-per-group), `NMoreCollage` component (landscape filmstrip of 3-4 thumbnails with +N overflow badge). New props: `thresholdEnabled`, `thresholdMetric`, `thresholdValue`, `minVisiblePerGroup`, `expandedNMore`, `onExpandedNMoreChange`.
- [frontend/src/routes/index.tsx](file:///d:/CreativeVisibility/frontend/src/routes/index.tsx): Threshold state (`thresholdEnabled`, `thresholdMetric`, `thresholdValue`, `minVisiblePerGroup`, `expandedNMore`). Inline controls in the Creative Directory tab bar: on/off toggle, metric dropdown (Impr./Spend), threshold number input (default 100), min-per-group number input (default 5). Controls are dimmed/disabled when filter is off.
- [frontend/src/lib/exportPdf.ts](file:///d:/CreativeVisibility/frontend/src/lib/exportPdf.ts): `n-more` variant added to `PdfTableRow` union type. PDF draw loop renders collapsed N-More rows with thumbnail collage (up to 4 images side-by-side, +N overflow), type pills (N Videos / N Images / N Text), and muted summed metrics. PDF mirrors exact dashboard expand/collapse state.

### Changed
- [frontend/src/routes/index.tsx](file:///d:/CreativeVisibility/frontend/src/routes/index.tsx): `buildPdfTableRows()` upgraded — accepts `ThresholdPdfConfig` (enabled, metric, value, minVisible, expandedNMore). Applies same 2-case threshold logic per leaf group; produces `n-more` PDF rows for collapsed groups, individual rows for expanded groups. `handleExportPDF` passes current threshold state to builder.
- [frontend/src/components/DirectoryTree.tsx](file:///d:/CreativeVisibility/frontend/src/components/DirectoryTree.tsx): `flat` useMemo switched from `AggNode[]` to `FlatItem[]`. `estimateSize`, `getItemKey`, and render loop all updated to handle `n-more` and `n-more-header` item types. Group/total metrics are never affected by threshold — data integrity is preserved.

### Behaviour
- Default: filter OFF (100 Impr threshold, min 5 per group, both configurable).
- When enabled: creatives below threshold are hidden per group; top N (min-per-group) are always kept visible regardless of threshold.
- Hidden creatives collapse into a single "N more creatives" row showing a thumbnail collage, type count pills (Videos/Images/Text), and the summed + recalculated metrics of hidden creatives.
- Clicking the row expands inline; the N-more header shows a collapse trigger with no metrics (preventing double-counting).
- Compare mode: compare deltas only appear on individually visible rows; the N-more summary row shows primary-period metrics only.
- PDF export mirrors dashboard state exactly — collapsed groups export as N-more rows, expanded groups export all individual rows.

## [Unreleased] - 2026-06-03 (Session 5)

### Added
- [frontend/src/lib/exportTopPerformersPdf.ts](file:///d:/CreativeVisibility/frontend/src/lib/exportTopPerformersPdf.ts): Created a new landscape A4 multi-page PDF generation module for the Top Performers view. Dynamically scales row height and thumbnail size based on the UI's `rowHeight` pixel slider, and calculates total page height to export a seamless single-page document.
- Added a "Download PDF" button to the Top Performers view (`TopPerformers.tsx`).
- Added clickable external URL links (`pdf.link()`) embedded directly into PDF rows and in dashboard cards.

### Changed
- [frontend/src/components/TopPerformers.tsx](file:///d:/CreativeVisibility/frontend/src/components/TopPerformers.tsx): Enhanced card text layout for details block. Increased font size (`text-[14px]`), font weight (`font-bold`), and styled tags using "shades of white" (`text-white/90`, `text-white/80`, `text-white/70`) for a premium "fat and bold" dark theme look.
- [frontend/src/lib/exportTopPerformersPdf.ts](file:///d:/CreativeVisibility/frontend/src/lib/exportTopPerformersPdf.ts): Details column text perfectly mirrors the bold, shades-of-white dashboard styling, and remains vertically centered regardless of row height scaling.

## [Unreleased] - 2026-06-02 (Session 4)

### Added
- [changes.md](file:///d:/CreativeVisibility/changes.md): Documented today's performance rankings, hover previews, unmuted audio autoplay, aspect ratios, dynamic Shorts support, and row height adjustments.

### Changed
- [frontend/src/components/TopPerformers.tsx](file:///d:/CreativeVisibility/frontend/src/components/TopPerformers.tsx): Fully implemented dynamic `HoverPreview` scaling to support vertical `9:16` aspect ratios (`337.5x600px`) for YouTube Shorts. Added cascading HD thumbnails, 2-second hover autoplay with sound, and an animated gold progress countdown. Implemented aspect-ratio-aware natural-width Image thumbnails (`object-contain`) to eliminate stretch/cropping.
- [frontend/src/components/DirectoryTree.tsx](file:///d:/CreativeVisibility/frontend/src/components/DirectoryTree.tsx): Ported unmuted hover previews to the Creative Directory tree. Implemented the isolated `DirectoryHoverPreview` helper component, which tracks coordinates independently. Added cascading high-quality thumbnails, 2-second autoplay with sound, gold progress countdown, play overlays, and dynamic 9:16 portrait vertical sizing.
- [frontend/src/components/CreativeDetailModal.tsx](file:///d:/CreativeVisibility/frontend/src/components/CreativeDetailModal.tsx): Replaced the static video preview in the detail popup with an interactive `16:9` block featuring a gold Play button overlay. Triggering a direct click embeds an autoplaying YouTube `iframe` that guarantees unmuted audio/music playback inside the modal.
- [frontend/src/routes/index.tsx](file:///d:/CreativeVisibility/frontend/src/routes/index.tsx): Changed the application's default initial state for `rowHeight` from `96px` to `150px` for optimal, high-resolution viewing on first load.

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
