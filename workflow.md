# CreativeVisibility Portal — Master Specification & Technical Workflow

> **Document Type:** Single Source of Truth (SSOT)
> **Author:** Sourabh Chaudhari
> **Project:** CreativeVisibility Portal
> **Last Updated:** 2026-05-30
> **Zero Tolerance Policy:** This is a high-budget project managing lakhs of rupees monthly in Google Ads spend. Any deviation from this specification without explicit written approval is unacceptable. AI agents working on this project must read this document in full before writing a single line of code.

---

## TABLE OF CONTENTS

| # | Section | Summary |
|---|---|---|
| 1 | [Executive Summary](#1-executive-summary) | Project overview, business value, stakeholders |
| 2 | [Problem Statement](#2-problem-statement) | Manual process pain points vs. portal automation |
| 3 | [Campaign Hierarchy](#3-campaign-hierarchy) | TOFU/MOFU funnel structure, city campaigns, creative layers |
| 4 | [Creative Structure](#4-creative-structure) | How creatives are organized under each campaign, type, and targeting |
| 5 | [Creative Spend Structure](#5-creative-spend-structure) | How ad spend flows from account level down to individual creative level |
| 6 | [Technology Stack](#6-technology-stack) | Apps Script Web App, FastAPI, React TanStack, caching |
| 7 | [Performance & Speed Optimization](#7-performance--speed-optimization) | Why it could hang, 5-layer speed strategy, benchmarks |
| 8 | [Directory & File Map](#8-directory--file-map) | Complete repository structure with file descriptions |
| 9 | [Data Architecture & Scaling](#9-data-architecture--scaling) | Dimension vs. Fact split, BigQuery future path |
| 10 | [Google Sheets Schema](#10-google-sheets-schema) | Strict column definitions and data types |
| 11 | [Backend Architecture](#11-backend-architecture) | FastAPI routes, Apps Script connector, cache, calculator |
| 12 | [Frontend Architecture](#12-frontend-architecture) | React components, state management, routing |
| 13 | [UI/UX Design System](#13-uiux-design-system) | Tokens, themes, typography, glassmorphism, animations |
| 14 | [Feature Specifications](#14-feature-specifications) | All functional features detailed end-to-end |
| 15 | [Performance Mathematics](#15-performance-mathematics) | Formulas, zero-guard rules, benchmarks |
| 16 | [Export Engine](#16-export-engine) | PDF export (light/dark), Excel/CSV download |
| 17 | [Edge Cases & Guardrails](#17-edge-cases--guardrails) | All failure scenarios and their handling |
| 18 | [Testing & QA Checklist](#18-testing--qa-checklist) | Manual and automated verification procedures |
| 19 | [Subagents & AI Assistants](#19-subagents--ai-assistants) | Ads Agent definition, capabilities, reference |
| 20 | [Discussion & Decision Log](#20-discussion--decision-log) | Chronological log of all project decisions |

---

## 1. Executive Summary

### 1.1 Project Overview
The **CreativeVisibility Portal** is a premium, interactive web platform purpose-built for a luxury jewelry brand's performance marketing team. It integrates a **React (Vite) frontend** with a **Python FastAPI backend** to pull campaign metadata and creative assets from a **Google Sheet** and raw daily performance metrics from a **SQLite database** (fed via CSV bulk uploads from Google Ads). The portal transforms raw data into a real-time, visual creative directory with instant performance calculations.

### 1.2 Stakeholders
| Role | Description |
|---|---|
| **Performance Marketer** | Sourabh Chaudhari — creates, manages, and reports on Google Ads campaigns. Primary user of the admin side. |
| **Jewelry Brand Client** | End client who funds the campaigns. Receives visual creative performance reports. Consumer of the client-facing view. |
| **Media Buying Team** | Sourabh's team — inputs data into the Google Sheet and uploads CSV dumps. |

### 1.3 Business Value
- **Client Niche:** Luxury Jewelry Brand (high AOV products — rings, necklaces, bridal sets, diamonds).
- **Financial Scale:** Monthly Google Ads spend in **lakhs of rupees**, managed across multiple cities and campaign types.
- **Core Outcome:** Eliminate 100% of manual screenshot-and-slide reporting. Replace it with a real-time portal that the client can view at any time, filter by date range, city, or funnel stage, and always see exactly which creatives are live and how they are performing.

### 1.4 Portal Modes
| Mode | Audience | Purpose |
|---|---|---|
| **Client View** | Jewelry brand client | Clean visual directory of live creatives, light or dark theme |
| **Performance View** | Media buying team | Full KPI metrics with date range filtering and top performers |
| **Export Mode** | Both | Generate PDF reports or download calculated Excel sheets |

---

## 2. Problem Statement

### 2.1 Current Manual Workflow (Broken)
```
[Export CSV from Google Ads]
          │
          ▼
[Open every Creative URL link manually in browser]
          │
          ▼
[Take screenshot / download image of each creative]
          │
          ▼
[Paste images into Google Slides / PowerPoint one by one]
          │
          ▼
[Build pivot tables in Excel to calculate CTR, CPC, CPA, CPM, CR]
          │
          ▼
[Format slides, add metrics, add YouTube video links manually]
          │
          ▼
[Share static PDF with client — already outdated by the time it's sent]
```

### 2.2 Pain Points (Detailed)
| # | Pain Point | Impact |
|---|---|---|
| 1 | **Creative URL-only reports** | Team must manually open every asset link to view the image or video. No visual in the report. |
| 2 | **YouTube link isolation** | Video creatives are just text links. Client cannot preview videos inside the report. |
| 3 | **Manual pivot calculations** | A single formula error in an Excel pivot on a high-budget account produces a misleading CPA or ROAS. This can cost the client lakhs of rupees due to wrong decisions. |
| 4 | **Static slide decks** | Every campaign change (paused creatives, new cities, A/B creative swaps) makes the slide deck obsolete the next day. |
| 5 | **No Top Performer identification** | Team cannot quickly tell which static image or video is performing best across cities without complex filtering. |
| 6 | **No date range flexibility** | Clients ask "show me just last week" or "compare May vs April" — impossible without rebuilding the sheet manually. |

### 2.3 Portal Automated Workflow (Fixed)
```
[Google Sheet updated with campaign metadata]
          │
          ▼
[CSV dump uploaded from Google Ads to portal Upload Zone]
          │
          ▼
[FastAPI: Pandas parses CSV in chunks → UPSERT into indexed SQLite DB]
          │
          ▼
[React frontend fetches data → renders instant visual creative cards]
          │
          ▼
[User applies filters: Date Range, Status, City, Funnel, KPI Columns]
          │
          ▼
[All metrics recalculate instantly (CTR, CPC, CPA, CPM, CR)]
          │
          ▼
[User selects campaigns/creatives → Exports PDF (light/dark) or Excel CSV]
```

---

## 3. Campaign Hierarchy

The portal must strictly represent and navigate the following hierarchy. This is the foundational structure that every component, API endpoint, database table, and UI interaction is organized around.

### 3.1 Hierarchy Diagram
```
Google Ads Account (Jewelry Brand)
│
├── TOFU (Top of the Funnel — Awareness)
│   ├── Performance Max (PMax)
│   │   ├── Mumbai
│   │   │   ├── Target: Bridal | Age: 25–34
│   │   │   │   ├── Creative: [Image] Bridal ring lifestyle shot
│   │   │   │   └── Creative: [Video] YouTube: "Discover Your Dream Ring"
│   │   │   └── Target: Everyday | Age: 18–24
│   │   │       └── Creative: [Image] Everyday gold necklace
│   │   └── Delhi
│   │       └── Target: Bridal | Age: 25–34
│   │           └── Creative: [Image] Diamond solitaire close-up
│   ├── Video (YouTube)
│   │   └── Bangalore
│   │       └── Target: Fashion | Age: 18–34
│   │           └── Creative: [Video] YouTube: "Glow This Season"
│   └── Display
│       └── Chennai
│           └── Target: Luxury | Age: 35–50
│               └── Creative: [Image] Gold chain product shot
│
└── MOFU (Middle of the Funnel — Consideration)
    ├── Search (RSA)
    │   ├── Mumbai
    │   │   └── Target: Rings | Age: 25–44
    │   │       └── Creative: [Text] Headline: "Shop Diamond Rings Online"
    │   └── Delhi
    │       └── Target: Necklaces | Age: 35–50
    │           └── Creative: [Text] Headline: "Gold Necklaces — Free Shipping"
    └── Performance Max (PMax)
        └── Hyderabad
            └── Target: Bridal | Age: 25–34
                └── Creative: [Image] Bridal jewellery set
```

### 3.2 Campaign Naming Convention (MANDATORY)
Every campaign, ad group, and asset group must follow this convention precisely:
```
[Funnel]_[CampaignType]_[City]_[Category]_[AgeGroup]

Valid Examples:
TOFU_PMax_Mumbai_Bridal_2534
MOFU_Search_Delhi_Rings_3550
TOFU_Video_Bangalore_Fashion_1834
MOFU_PMax_Hyderabad_Bridal_2534
TOFU_Display_Chennai_Luxury_3550
```

### 3.3 Funnel Definitions
| Funnel | Objective | Campaign Types Used | Primary KPI |
|---|---|---|---|
| **TOFU** | Brand awareness — new audiences who don't know the brand | PMax, Video, Display, Demand Gen | Impressions, VTR, CPM, Reach |
| **MOFU** | Consideration — re-engage warm, intent-showing audiences | Search (RSA), PMax, Remarketing Display | CTR, Clicks, CPC, Conversions, CPA |

---

## 4. Creative Structure

The creative structure mirrors the campaign hierarchy exactly. Every campaign contains asset groups or ad groups, which contain targeting combinations, which contain individual creative assets. The portal must render this creative structure as a navigable, visual directory.

### 4.1 Creative Hierarchy Diagram
```
Google Ads Account (Jewelry Brand)
│
├── TOFU (Top of the Funnel — Awareness)
│   │
│   ├── Campaign Type: Performance Max (PMax)
│   │   │
│   │   ├── City: Mumbai
│   │   │   └── Asset Group: Bridal_Mumbai_2534
│   │   │       ├── Target: Category = Bridal | Age Group = 25–34
│   │   │       ├── 🖼️  Creative [Image]  → ID: PMax_Mum_Bridal_Img01
│   │   │       │         URL: https://ads.google.com/asset/bridal-ring-lifestyle.jpg
│   │   │       │         Status: Enabled
│   │   │       │         Metrics: Impressions | Clicks | Cost | Conversions
│   │   │       │
│   │   │       ├── 🎬  Creative [Video]  → ID: PMax_Mum_Bridal_Vid01
│   │   │       │         URL: https://youtube.com/watch?v=abc123
│   │   │       │         Title: "Discover Your Dream Bridal Ring"
│   │   │       │         Status: Enabled
│   │   │       │         Metrics: Impressions | Views | Cost | Conversions
│   │   │       │
│   │   │       └── 🖼️  Creative [Image]  → ID: PMax_Mum_Everyday_Img02
│   │   │                 URL: https://ads.google.com/asset/everyday-necklace.jpg
│   │   │                 Status: Paused
│   │   │                 Metrics: Impressions | Clicks | Cost | Conversions
│   │   │
│   │   └── City: Delhi
│   │       └── Asset Group: Bridal_Delhi_2534
│   │           ├── Target: Category = Bridal | Age Group = 25–34
│   │           └── 🖼️  Creative [Image]  → ID: PMax_Del_Bridal_Img01
│   │                     URL: https://ads.google.com/asset/diamond-solitaire.jpg
│   │                     Status: Enabled
│   │
│   ├── Campaign Type: Video (YouTube)
│   │   └── City: Bangalore
│   │       └── Ad Group: Fashion_Blr_1834
│   │           ├── Target: Category = Fashion | Age Group = 18–34
│   │           └── 🎬  Creative [Video]  → ID: Vid_Blr_Fashion_Vid01
│   │                     URL: https://youtube.com/watch?v=xyz789
│   │                     Title: "Glow This Season — Jewelry by [Brand]"
│   │                     Status: Enabled
│   │
│   └── Campaign Type: Display
│       └── City: Chennai
│           └── Ad Group: Luxury_Che_3550
│               ├── Target: Category = Luxury | Age Group = 35–50
│               └── 🖼️  Creative [Image]  → ID: Disp_Che_Luxury_Img01
│                         URL: https://ads.google.com/asset/gold-chain.jpg
│                         Status: Enabled
│
└── MOFU (Middle of the Funnel — Consideration)
    │
    ├── Campaign Type: Search (RSA)
    │   │
    │   ├── City: Mumbai
    │   │   └── Ad Group: Rings_Mum_2544
    │   │       ├── Target: Category = Rings | Age Group = 25–44
    │   │       └── 📝  Creative [Text]   → ID: Src_Mum_Rings_Txt01
    │   │                 Headline: "Shop Diamond Rings Online"
    │   │                 Description: "Explore India's finest diamond rings. Free shipping."
    │   │                 Final URL: https://www.brand.com/rings
    │   │                 Status: Enabled
    │   │
    │   └── City: Delhi
    │       └── Ad Group: Necklaces_Del_3550
    │           ├── Target: Category = Necklaces | Age Group = 35–50
    │           └── 📝  Creative [Text]   → ID: Src_Del_Necklace_Txt01
    │                     Headline: "Gold Necklaces — Free Shipping"
    │                     Description: "Premium gold necklaces for every occasion. Shop now."
    │                     Final URL: https://www.brand.com/necklaces
    │                     Status: Enabled
    │
    └── Campaign Type: Performance Max (PMax)
        └── City: Hyderabad
            └── Asset Group: Bridal_Hyd_2534
                ├── Target: Category = Bridal | Age Group = 25–34
                └── 🖼️  Creative [Image]  → ID: PMax_Hyd_Bridal_Img01
                          URL: https://ads.google.com/asset/bridal-set.jpg
                          Status: Enabled
```

### 4.2 Creative Types — Definitions
| Creative Type | Symbol | Description | Portal Rendering | Verification |
|---|---|---|---|---|
| **Image (Static)** | 🖼️ | A still image asset (JPG/PNG) hosted on Google Ads servers | Renders as a visual `<img>` card using the Creative URL directly | Raw URL shown below card as a clickable link |
| **Video** | 🎬 | A YouTube-hosted video ad (any format: skippable, non-skippable, bumper, in-feed) | Renders as an embedded `<iframe>` YouTube player | Video title as bold hyperlink + raw YouTube URL shown below |
| **Text (Ad Copy)** | 📝 | A Responsive Search Ad (RSA) consisting of headlines and descriptions | Renders as a Google Search result mockup (blue headline, green URL, black description) | Final URL shown as a clickable verification link |

### 4.3 Creative ID Naming Convention (MANDATORY)
Every creative asset must have a unique ID that encodes its context. This ID links the Dimension Store (Google Sheet) to the Fact Store (SQLite).
```
[CampaignType]_[CityCode]_[Category]_[Type][Sequence]

Where:
  CampaignType → PMax | Vid | Src | Disp | DGen
  CityCode     → Mum (Mumbai) | Del (Delhi) | Blr (Bangalore) | Che (Chennai) | Hyd (Hyderabad)
  Category     → Bridal | Rings | Necklaces | Everyday | Luxury | Fashion | Diamonds | Gold
  Type         → Img (Image) | Vid (Video) | Txt (Text)
  Sequence     → 01, 02, 03 ...

Valid Examples:
  PMax_Mum_Bridal_Img01     → PMax / Mumbai / Bridal / Image / First asset
  Vid_Blr_Fashion_Vid01     → Video / Bangalore / Fashion / Video / First asset
  Src_Del_Necklace_Txt01    → Search / Delhi / Necklaces / Text / First ad
  Disp_Che_Luxury_Img01     → Display / Chennai / Luxury / Image / First asset
  PMax_Hyd_Bridal_Img01     → PMax / Hyderabad / Bridal / Image / First asset
```

### 4.4 Creative Attributes per Type

#### Image Creative Attributes
| Attribute | Required | Description | Example |
|---|---|---|---|
| `creative_id` | ✅ | Unique ID following naming convention | `PMax_Mum_Bridal_Img01` |
| `creative_url` | ✅ | Direct HTTPS link to the image asset | `https://ads.google.com/asset/bridal-ring.jpg` |
| `creative_type` | ✅ | Always `Image` | `Image` |
| `funnel` | ✅ | `TOFU` or `MOFU` | `TOFU` |
| `campaign_type` | ✅ | `PMax`, `Display`, etc. | `PMax` |
| `campaign_name` | ✅ | Full campaign name | `TOFU_PMax_Mumbai_Bridal_2534` |
| `city` | ✅ | Target city | `Mumbai` |
| `age_group` | ✅ | Demographic target | `25-34` |
| `category` | ✅ | Jewelry product category | `Bridal` |
| `status` | ✅ | `Enabled` or `Paused` | `Enabled` |
| `headline` | ❌ | Not applicable | — |
| `description` | ❌ | Not applicable | — |

#### Video Creative Attributes
| Attribute | Required | Description | Example |
|---|---|---|---|
| `creative_id` | ✅ | Unique ID following naming convention | `Vid_Blr_Fashion_Vid01` |
| `creative_url` | ✅ | Full YouTube URL | `https://youtube.com/watch?v=xyz789` |
| `creative_type` | ✅ | Always `Video` | `Video` |
| `funnel` | ✅ | `TOFU` or `MOFU` | `TOFU` |
| `campaign_type` | ✅ | `Video`, `PMax`, etc. | `Video` |
| `campaign_name` | ✅ | Full campaign name | `TOFU_Video_Bangalore_Fashion_1834` |
| `city` | ✅ | Target city | `Bangalore` |
| `age_group` | ✅ | Demographic target | `18-34` |
| `category` | ✅ | Jewelry product category | `Fashion` |
| `status` | ✅ | `Enabled` or `Paused` | `Enabled` |
| `headline` | Recommended | Video title (for display in portal) | `Glow This Season` |
| `description` | ❌ | Not applicable | — |

#### Text Creative Attributes (Search RSA)
| Attribute | Required | Description | Example |
|---|---|---|---|
| `creative_id` | ✅ | Unique ID following naming convention | `Src_Mum_Rings_Txt01` |
| `creative_url` | ✅ | Final URL (landing page) | `https://www.brand.com/rings` |
| `creative_type` | ✅ | Always `Text` | `Text` |
| `funnel` | ✅ | `TOFU` or `MOFU` | `MOFU` |
| `campaign_type` | ✅ | Always `Search` | `Search` |
| `campaign_name` | ✅ | Full campaign name | `MOFU_Search_Mumbai_Rings_2544` |
| `city` | ✅ | Target city | `Mumbai` |
| `age_group` | ✅ | Demographic target | `25-44` |
| `category` | ✅ | Jewelry product category | `Rings` |
| `status` | ✅ | `Enabled` or `Paused` | `Enabled` |
| `headline` | ✅ | Primary ad headline (max 30 chars) | `Shop Diamond Rings Online` |
| `description` | ✅ | Ad description (max 90 chars) | `Explore India's finest diamond rings. Free shipping.` |

---

## 5. Creative Spend Structure

Just as the Campaign Hierarchy defines how Google Ads campaigns are organized, the Creative Spend Structure defines how ad spend is **attributed, tracked, and aggregated** from the total account level all the way down to each individual creative asset. This is the financial backbone of the portal's reporting engine.

### 5.1 Spend Flow Diagram
```
┌─────────────────────────────────────────────────────────────────┐
│                   TOTAL ACCOUNT SPEND                           │
│         e.g. ₹10,00,000 / month across all campaigns           │
└─────────────────┬───────────────────────────────────────────────┘
                  │
       ┌──────────┴──────────┐
       ▼                     ▼
┌──────────────┐      ┌──────────────┐
│  TOFU SPEND  │      │  MOFU SPEND  │
│  ₹6,00,000   │      │  ₹4,00,000   │
│  (Awareness) │      │ (Conversion) │
└──────┬───────┘      └──────┬───────┘
       │                     │
  ┌────┴─────┐          ┌────┴──────┐
  │ Campaign │          │ Campaign  │
  │  Type    │          │  Type     │
  │  Spend   │          │  Spend    │
  └────┬─────┘          └────┬──────┘
       │                     │
  ┌────┴──────┐         ┌────┴──────┐
  │  City     │         │  City     │
  │  Spend    │         │  Spend    │
  └────┬──────┘         └────┬──────┘
       │                     │
  ┌────┴──────┐         ┌────┴──────┐
  │  Asset    │         │  Ad Group │
  │  Group    │         │  Spend    │
  │  Spend    │         │           │
  └────┬──────┘         └────┬──────┘
       │                     │
  ┌────┴──────┐         ┌────┴──────┐
  │ Creative  │         │ Creative  │
  │  Spend    │         │  Spend    │
  │(Image/Vid)│         │  (Text)   │
  └───────────┘         └───────────┘
```

### 5.2 Spend Aggregation Levels
Each level aggregates spend from all the levels below it. The portal must be able to display spend totals at each level and drill down to the creative level.

| Level | Aggregation Scope | Example |
|---|---|---|
| **Account Total** | Sum of all campaigns | ₹10,00,000 / month |
| **Funnel Level** | TOFU total spend / MOFU total spend | TOFU: ₹6,00,000 / MOFU: ₹4,00,000 |
| **Campaign Type Level** | PMax total / Search total / Video total / Display total | PMax: ₹3,50,000 / Search: ₹2,00,000 / Video: ₹2,50,000 |
| **City Level** | All spend in a specific city across all campaign types | Mumbai: ₹4,00,000 / Delhi: ₹3,00,000 / Bangalore: ₹1,50,000 |
| **Asset Group / Ad Group Level** | Spend within a specific asset group or ad group | Bridal_Mumbai_2534: ₹1,20,000 |
| **Creative Level** | Spend attributed to a single image, video, or text ad | PMax_Mum_Bridal_Img01: ₹45,000 |

### 5.3 Creative-Level Spend Detail
This is the most granular level. Every individual creative asset has its own row in the `daily_performance` table tracking:

```
Creative: PMax_Mum_Bridal_Img01
│
├── Date: 2026-05-01
│   ├── Impressions: 12,500
│   ├── Clicks:      375
│   ├── Cost (₹):   3,200.00
│   └── Conversions: 8
│
├── Date: 2026-05-02
│   ├── Impressions: 14,200
│   ├── Clicks:      426
│   ├── Cost (₹):   3,650.00
│   └── Conversions: 11
│
│   ... (one row per day for the entire campaign lifespan)
│
└── Aggregated for Date Range: 2026-05-01 to 2026-05-31
    ├── Total Impressions: 3,80,000
    ├── Total Clicks:      11,400
    ├── Total Cost (₹):   97,200.00
    ├── Total Conversions: 243
    ├── CTR:   3.00%
    ├── CPC:   ₹8.53
    ├── CPM:   ₹255.79
    ├── CR:    2.13%
    └── CPA:   ₹400.00
```

### 5.4 Spend Aggregation SQL Logic
The FastAPI backend executes the following aggregation pattern for each level:

#### Creative-Level (Most Granular)
```sql
SELECT
    c.creative_id,
    c.creative_url,
    c.creative_type,
    c.funnel,
    c.campaign_type,
    c.campaign_name,
    c.city,
    c.age_group,
    c.category,
    c.status,
    c.headline,
    c.description,
    SUM(dp.impressions)  AS total_impressions,
    SUM(dp.clicks)       AS total_clicks,
    SUM(dp.cost)         AS total_cost,
    SUM(dp.conversions)  AS total_conversions
FROM daily_performance dp
JOIN creatives c ON dp.creative_id = c.creative_id
WHERE dp.date BETWEEN :start_date AND :end_date
GROUP BY dp.creative_id;
```

#### City-Level Rollup
```sql
SELECT
    c.city,
    c.funnel,
    SUM(dp.impressions)  AS total_impressions,
    SUM(dp.clicks)       AS total_clicks,
    SUM(dp.cost)         AS total_cost,
    SUM(dp.conversions)  AS total_conversions
FROM daily_performance dp
JOIN creatives c ON dp.creative_id = c.creative_id
WHERE dp.date BETWEEN :start_date AND :end_date
GROUP BY c.city, c.funnel
ORDER BY total_cost DESC;
```

#### Funnel-Level Rollup
```sql
SELECT
    c.funnel,
    SUM(dp.cost)         AS total_spend,
    SUM(dp.impressions)  AS total_impressions,
    SUM(dp.clicks)       AS total_clicks,
    SUM(dp.conversions)  AS total_conversions
FROM daily_performance dp
JOIN creatives c ON dp.creative_id = c.creative_id
WHERE dp.date BETWEEN :start_date AND :end_date
GROUP BY c.funnel;
```

### 5.5 Creative Spend Rules & Guardrails
| Rule | Description |
|---|---||
| **Daily Row Uniqueness** | Each `(date, creative_id)` combination can have only one row in `daily_performance`. A UNIQUE constraint enforces this — preventing spend doubling on re-uploads. |
| **No Negative Spend** | The importer validates that Cost is always `≥ 0`. Negative values are rejected with an error log. |
| **Blank Cost = Zero** | If a Google Ads export contains a blank cost cell, Pandas fills it with `0.0`. Never left as `NULL`. |
| **Spend Attribution** | Spend is attributed to the `creative_id` as reported by Google Ads. No manual reallocation is performed by the portal. |
| **Currency** | All cost figures are stored and displayed in **Indian Rupees (₹)**. Currency symbols from Google Ads exports are stripped during import. |
| **Rounding** | Cost stored as `REAL` (floating point) in SQLite. Displayed as `₹X,XX,XXX.XX` format in the UI (Indian comma formatting). |

### 5.6 Portal Spend Display Modes
| View | What Is Shown | Spend Scope |
|---|---|---|
| **Account Summary Cards** | 4 summary tiles: Total Spend, Total Impressions, Total Clicks, Total Conversions | Entire filtered date range across all selected campaigns |
| **Funnel Summary Row** | Spend breakdown: TOFU spend vs. MOFU spend | Filtered date range |
| **Campaign Tree Nodes** | Each node in the sidebar shows its aggregated spend | Based on current date range & status filters |
| **Creative Cards** | Each card shows Spend + Impressions + Clicks + Conversions + CTR + CPC + CPA | Based on current date range & status filters |
| **Top Performers Tab** | Ranked by CTR / Conversions / CPC / CPA with spend shown | Based on current date range & city filter |
| **Export PDF** | Spend shown on each selected creative card in the PDF | Snapshot of current filter state |
| **Export CSV** | Full row per creative with all metrics and calculated KPIs | Based on current date range & filters |

---

## 6. Technology Stack

> [!IMPORTANT]
> **Architecture Decision (2026-05-28):** No CSV upload mechanism. All data flows automatically from Google Ads → Google Sheets (via scheduled reports) → Apps Script Web App → FastAPI → React frontend. This is a fully real-time, zero-manual-upload pipeline.

### 6.1 Complete Architecture Diagram
```
┌────────────────────────────────────────────────────────────────┐
│                       GOOGLE ADS                               │
│   Scheduled Report: Auto-exports daily performance to Sheet    │
│   Runs every night at midnight (set once, runs forever)        │
└──────────────────────────┬─────────────────────────────────────┘
                           │  Scheduled Report → Google Sheet
                           │  (Automatic, no human action needed)
                           ▼
┌────────────────────────────────────────────────────────────────┐
│                      GOOGLE SHEET                              │
│   Tab 1 — creative_dimensions:                                 │
│     Creative metadata (ID, URL, City, Funnel, Type, Status)    │
│     Managed manually by marketing team                         │
│                                                                │
│   Tab 2 — daily_performance (auto-populated):                  │
│     Date, Creative ID, Impressions, Clicks, Cost, Conversions  │
│     Auto-written by Google Ads scheduled report nightly        │
└──────────────────────────┬─────────────────────────────────────┘
                           │  Apps Script Web App (doGet)
                           │  Deployed as JSON API endpoint
                           │  No credentials required
                           ▼
┌────────────────────────────────────────────────────────────────┐
│              APPS SCRIPT (inside the Google Sheet)             │
│   function doGet(e):                                           │
│     ├── Reads both Sheet tabs                                  │
│     ├── Accepts query params: ?tab=dimensions|performance      │
│     ├── Accepts filters: ?start=YYYY-MM-DD&end=YYYY-MM-DD      │
│     └── Returns structured JSON response                       │
│   Deployed as: Web App (run as owner, anyone with link)        │
└──────────────────────────┬─────────────────────────────────────┘
                           │  HTTPS GET request
                           │  FastAPI calls Web App URL
                           ▼
┌────────────────────────────────────────────────────────────────┐
│                   PYTHON FASTAPI BACKEND                       │
│   ├── apps_script_connector.py: Calls Apps Script URL          │
│   ├── Cache Layer: 10–15 min TTL (respects Apps Script quota)  │
│   ├── calculator.py: CTR, CPC, CPA, CPM, CR computations       │
│   ├── REST API Endpoints: Serves aggregated JSON to frontend   │
│   └── /api/sync: Force-refreshes cache on demand              │
└──────────────────────────┬─────────────────────────────────────┘
                           │  REST JSON API
                           ▼
┌────────────────────────────────────────────────────────────────┐
│                REACT (TanStack Start) FRONTEND                 │
│   ├── GroupingSidebar: Dynamic campaign tree (drag-reorderable)│
│   ├── FilterPanel: Date range, status, city, funnel, search    │
│   ├── DirectoryTree: Creative cards (Image/Video/Text)         │
│   ├── TopPerformers: Ranked by CTR/Conv/CPC/CPA               │
│   ├── CreativeDetailModal: Full-screen creative deep-dive      │
│   ├── SavedViewsMenu: Save/load filter+hierarchy combinations  │
│   ├── ThemeToggle: Dark / Light mode (localStorage persist)    │
│   └── ExportEngine: PDF (window.print) + CSV (Blob download)  │
└────────────────────────────────────────────────────────────────┘
```

### 6.2 Data Flow — Step by Step
| Step | What Happens | Who/What Does It | Frequency |
|---|---|---|---|
| 1 | Google Ads scheduled report runs | Google Ads platform (automated) | Every night at 12:00 AM |
| 2 | Report writes rows to `daily_performance` Sheet tab | Google Ads → Google Sheets (native integration) | Daily |
| 3 | FastAPI calls Apps Script Web App URL | `apps_script_connector.py` | On each frontend API request (cached 10–15 min) |
| 4 | Apps Script reads both Sheet tabs and returns JSON | Apps Script `doGet()` function | Per FastAPI request |
| 5 | FastAPI caches, computes metrics, serves to frontend | `calculator.py` + cache layer | Per React API call |
| 6 | React renders creatives, KPIs, filters, and exports | TanStack Start frontend | Real-time on every filter change |

### 6.3 Full Stack Reference
| Layer | Technology | Version | Purpose |
|---|---|---|---|
| **Frontend Framework** | React + TanStack Start | 18+ | UI rendering, SSR-ready routing, state management |
| **Frontend Build Tool** | Vite 7 | Latest | Dev server, HMR, production build |
| **Frontend Styling** | Tailwind CSS + shadcn/ui | — | Component library (from Lovable build) |
| **Frontend Fonts** | Google Fonts: Inter, Montserrat | — | Premium heading and body typography |
| **Frontend Router** | TanStack Router | Latest | File-based routing with type safety |
| **Backend Framework** | FastAPI (Python) | Latest | Async REST API server |
| **Backend Server** | Uvicorn (ASGI) | Latest | Production-ready ASGI server |
| **Data Connector** | Apps Script Web App (HTTPS GET) | — | No credentials needed — deployed from inside the Sheet |
| **Cache Layer** | Python `cachetools.TTLCache` | — | 10–15 min TTL, prevents Apps Script quota abuse |
| **Performance Math** | `calculator.py` (Python) | — | CTR, CPC, CPM, CR, CPA with zero-guard protection |
| **Data Source 1** | Google Sheet Tab: `creative_dimensions` | — | Creative metadata managed by marketing team |
| **Data Source 2** | Google Sheet Tab: `daily_performance` | — | Auto-populated nightly by Google Ads scheduled report |
| **Auth (Future Phase)** | OAuth2 + JWT | — | Not active in Phase 1 — scaffold only |

### 6.4 Google Ads Scheduled Report Setup (One-Time Configuration)
This is the key that makes the entire pipeline automatic with zero manual data entry:

```
In Google Ads:
1. Reports → Predefined reports → Extensions → Ad performance
   OR: Reports → Custom → Create a scheduled report

2. Select columns:
   Date | Ad name (= Creative ID) | Campaign | Impressions | Clicks | Cost | Conversions

3. Schedule:
   Frequency: Daily
   Time: 12:30 AM IST
   Delivery: Google Sheets
   Sheet: [Your Google Sheet — Tab: daily_performance]

4. Click Save
```
**Result:** Every morning at 12:30 AM, Google Ads automatically appends the previous day's rows to the `daily_performance` Sheet tab. The portal reads this tab in real-time via the Apps Script Web App. Zero human action needed after initial setup.

### 6.5 Apps Script Web App — Design Specification
The Apps Script lives inside the Google Sheet and exposes a single JSON API endpoint:

```javascript
// Endpoint: https://script.google.com/macros/s/[DEPLOYMENT_ID]/exec
// Query params:
//   ?tab=dimensions             → returns creative_dimensions tab
//   ?tab=performance            → returns daily_performance tab  
//   ?tab=performance&start=YYYY-MM-DD&end=YYYY-MM-DD  → filtered by date

function doGet(e) {
  const tab = e.parameter.tab || 'dimensions';
  const start = e.parameter.start || null;
  const end = e.parameter.end || null;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(
    tab === 'dimensions' ? 'creative_dimensions' : 'daily_performance'
  );

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  let rows = data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  });

  // Date filtering for performance tab
  if (tab === 'performance' && start && end) {
    rows = rows.filter(r => r.date >= start && r.date <= end);
  }

  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok', count: rows.length, data: rows }))
    .setMimeType(ContentService.MimeType.JSON);
}
```

**Deployment settings:**
- Execute as: **Me** (Sourabh Chaudhari)
- Who has access: **Anyone** (or Anyone with the link)
- This means: No OAuth login needed. FastAPI calls the URL directly.
- The URL is treated as a secret — stored in backend `.env` file, never committed to Git.

### 6.6 Node Version Note
The Lovable frontend requires **Node.js ≥ 20.19.0** (current machine has v20.16.0). Upgrade Node.js to the latest LTS (v22.x) before running the dev server in production mode. Dev server will run with warnings on v20.16.0.

---

## 7. Performance & Speed Optimization

> [!IMPORTANT]
> **This section is non-negotiable.** The portal manages lakhs of rupees in monthly spend across potentially millions of rows of daily performance data spanning 1–2 years. Any architectural shortcut here will cause the portal to hang, crash, or produce incorrect results. Every layer below must be implemented exactly as specified.

### 7.1 Where Slowness Actually Comes From

There are exactly three places in this architecture where the system can hang. Understanding each is essential before writing a single line of backend code.

#### Bottleneck 1 — Google Sheet → Apps Script (MOST CRITICAL)
Apps Script reads the sheet using `getDataRange().getValues()`. This loads **every cell** of the sheet into memory before returning it. As the `daily_performance` tab grows over months and years, this operation becomes catastrophically slow:

| Rows in Sheet | Apps Script Read Time | Risk Level |
|---|---|---|
| 10,000 rows | ~1–2 seconds | ✅ Safe |
| 50,000 rows | ~5–8 seconds | ⚠️ Slow |
| 2,00,000 rows | ~25–40 seconds | ❌ Painful |
| 5,00,000+ rows | 60+ seconds | ❌ Apps Script 6-min kill limit hit — **crash** |
| 10,00,000+ rows (1–2 years) | Never completes | ❌ Complete failure |

> **Root Cause:** Returning raw daily rows instead of pre-aggregated summaries. This single mistake is the difference between a 200ms response and a 60-second timeout.

#### Bottleneck 2 — Sending Raw Rows to React Frontend
If the FastAPI backend forwards millions of raw rows as a JSON response to the browser:
- A 5,00,000-row JSON payload = **~80–150 MB** of data
- Browser download time: 30–60 seconds on a 20 Mbps connection
- React `useMemo()` filtering 5,00,000 objects in JavaScript = **browser freeze for 5–10 seconds**
- User sees a white screen and assumes the app is broken

> **Root Cause:** Never send raw rows to the frontend. Always send pre-computed aggregated results.

#### Bottleneck 3 — Python FastAPI Recalculating on Every Request
Without caching, every new user request triggers a fresh Apps Script call, even if the same date range was queried 30 seconds ago:
- 10 team members opening the portal simultaneously = 10 parallel Apps Script calls
- Apps Script quota: ~30 calls/minute per account
- Result: Rate limit errors and failed responses

> **Root Cause:** No caching layer between FastAPI and Apps Script.

---

### 7.2 The 5-Layer Speed Strategy

All five layers must be implemented. They work together to keep the portal feeling instant at any data scale.

---

#### ⚡ Layer 1 — Aggregate IN Google Sheets, Not in Python (Most Impactful)

Instead of reading raw daily rows, Apps Script reads from a **pre-computed summary tab** that Google Sheets maintains automatically using the `QUERY()` function.

**How it works:**
```
daily_performance tab (5,00,000 raw rows)
        │
        │  Google Sheets QUERY formula (runs in Google's engine, very fast)
        ▼
summary_by_creative tab (~150 rows — one per creative_id)
        │
        │  Apps Script reads ONLY this tab
        ▼
FastAPI receives 150 rows, not 5,00,000
```

**Google Sheet formula in `summary_by_creative` tab (cell A1):**
```
=QUERY(daily_performance!A:F,
  "SELECT B, SUM(C), SUM(D), SUM(E), SUM(F)
   WHERE A >= date '"&TEXT(A1,"YYYY-MM-DD")&"' AND A <= date '"&TEXT(B1,"YYYY-MM-DD")&"'
   GROUP BY B
   LABEL SUM(C) 'impressions', SUM(D) 'clicks', SUM(E) 'cost', SUM(F) 'conversions'", 1)
```

**Result:** Apps Script response time drops from **40 seconds → under 1 second** because it reads ~150 rows instead of 5,00,000.

---

#### ⚡ Layer 2 — Date-Range Filtering Happens Inside Apps Script

Apps Script accepts `?start=YYYY-MM-DD&end=YYYY-MM-DD` query parameters and passes them into the Sheets QUERY. This means Google's engine handles the date filter, not Python:

```javascript
function doGet(e) {
  const start = e.parameter.start || getDefaultStart(); // 30 days ago
  const end   = e.parameter.end   || getDefaultEnd();   // today

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Read pre-aggregated summary (not raw rows)
  const summarySheet = ss.getSheetByName('summary_by_creative');

  // Write the date range into trigger cells so QUERY formula recalculates
  const controlSheet = ss.getSheetByName('query_controls');
  controlSheet.getRange('A2').setValue(start);
  controlSheet.getRange('B2').setValue(end);

  // Small pause for Sheets to recalculate (usually instant)
  SpreadsheetApp.flush();

  // Read the now-updated summary (~150 rows)
  const data = summarySheet.getDataRange().getValues();
  const headers = data[0];
  const rows = data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[String(h)] = row[i]);
    return obj;
  });

  // Also fetch dimension metadata (creative_dimensions tab)
  const dimSheet = ss.getSheetByName('creative_dimensions');
  const dimData  = dimSheet.getDataRange().getValues();
  const dimHeaders = dimData[0];
  const dimensions = dimData.slice(1).map(row => {
    const obj = {};
    dimHeaders.forEach((h, i) => obj[String(h)] = row[i]);
    return obj;
  });

  return ContentService
    .createTextOutput(JSON.stringify({
      status: 'ok',
      date_range: { start, end },
      performance_count: rows.length,
      performance: rows,
      dimensions_count: dimensions.length,
      dimensions: dimensions
    }))
    .setMimeType(ContentService.MimeType.JSON);
}
```

---

#### ⚡ Layer 3 — FastAPI TTL Cache (15 Minutes Per Date Range)

Every unique `(start_date, end_date)` combination is cached for 15 minutes. If 20 team members all open the portal with the same default 30-day range, Apps Script is called **only once**. The other 19 requests are served from memory in under 5ms.

```python
# backend/cache.py
from cachetools import TTLCache
import time

# Max 50 different date range combinations cached simultaneously
# Each cached for 15 minutes (900 seconds)
cache = TTLCache(maxsize=50, ttl=900)

def get_cached(key: str):
    return cache.get(key)

def set_cached(key: str, value):
    cache[key] = value

def invalidate_all():
    cache.clear()
```

```python
# backend/apps_script_connector.py
import httpx
from .cache import get_cached, set_cached
from .config import APPS_SCRIPT_URL

async def fetch_data(start: str, end: str) -> dict:
    cache_key = f"{start}_{end}"

    # Serve from cache if available (< 5ms)
    cached = get_cached(cache_key)
    if cached:
        return {**cached, "served_from_cache": True}

    # Call Apps Script Web App
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            APPS_SCRIPT_URL,
            params={"start": start, "end": end},
            follow_redirects=True  # Apps Script URLs redirect once
        )
        resp.raise_for_status()
        data = resp.json()

    set_cached(cache_key, data)
    return {**data, "served_from_cache": False}
```

**Cache behaviour:**
| Scenario | Response Time |
|---|---|
| First request for a date range | ~800ms–1.5s (Apps Script cold call) |
| Any subsequent request, same date range | **< 5ms** (memory cache hit) |
| After 15 minutes (cache expires) | ~800ms–1.5s (Apps Script refreshed) |
| Force sync via `/api/sync` | Cache cleared, next request fetches fresh |

---

#### ⚡ Layer 4 — Cache Pre-Warm on Server Startup

When FastAPI starts (or restarts), it immediately pre-fetches the last 30 days of data. This means the **very first user** who opens the portal sees instant data, not a cold-start delay:

```python
# backend/main.py
from contextlib import asynccontextmanager
from datetime import date, timedelta
from .apps_script_connector import fetch_data

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Pre-warm cache on startup
    today = date.today()
    start = (today - timedelta(days=29)).isoformat()
    end   = today.isoformat()
    try:
        await fetch_data(start, end)
        print(f"[Startup] Cache pre-warmed for {start} → {end}")
    except Exception as e:
        print(f"[Startup] Pre-warm failed (non-fatal): {e}")
    yield  # App runs here

app = FastAPI(lifespan=lifespan)
```

---

#### ⚡ Layer 5 — BigQuery Migration Path (Future Phase, When Scale Demands)

Google Sheets has a **10 million cell limit**. For the current schema (6 columns in `daily_performance`), this is hit at approximately **1.6 million rows** — reachable after 2 years of tracking 200+ creatives.

When that limit approaches, the data pipeline switches to **Google BigQuery** — Google's native columnar analytics database:

```
Current (Phase 1):                Future (Phase 2, when needed):
Google Ads                        Google Ads
    ↓ Scheduled Report                ↓ BigQuery Data Transfer (native, free)
Google Sheet                      BigQuery Dataset
    ↓ Apps Script Web App             ↓ Python bigquery-client
FastAPI + Cache                   FastAPI + Cache
    ↓                                 ↓
React Frontend                    React Frontend (unchanged)
```

**BigQuery performance at scale:**
| Row Count | Query Time |
|---|---|
| 1 million rows | < 300ms |
| 10 million rows | < 500ms |
| 100 million rows | < 2 seconds |
| 1 billion rows | < 10 seconds |

**BigQuery is free** up to 1TB of data processed per month (this project will use < 1GB/month).

The switch requires:
1. Enable Google Ads → BigQuery native data transfer (one-time setup)
2. Change `apps_script_connector.py` → `bigquery_connector.py`
3. Zero frontend changes

---

### 7.3 Speed Benchmark — Before vs. After

| Scenario | Without Optimization | With All 5 Layers |
|---|---|---|
| First load, 30-day range, 150 creatives | 8–40 seconds | **< 1.5 seconds** |
| Same date range, 2nd+ user within 15 min | 8–40 seconds | **< 5 milliseconds** |
| Date range change (new query) | 8–40 seconds | **< 1.5 seconds** |
| 5,00,000 raw rows sent to React | ❌ Browser freeze | **Never happens** (aggregated first) |
| 10 users opening portal simultaneously | ❌ Rate limit crash | **< 5ms each** (cache hit) |
| 1.6M+ rows (2 years data) | ❌ Sheets limit hit | **< 500ms** (BigQuery path) |

### 7.4 Implementation Checklist
- [ ] Create `summary_by_creative` tab in Google Sheet with QUERY formula
- [ ] Create `query_controls` tab with start/end date trigger cells
- [ ] Apps Script `doGet()` reads summary tab, not raw rows
- [ ] Apps Script accepts `?start=&end=` params and updates control cells
- [ ] `cache.py` — TTLCache with 15-min TTL, maxsize 50
- [ ] `apps_script_connector.py` — async httpx call with cache check
- [ ] FastAPI `lifespan` pre-warms last 30 days on startup
- [ ] `/api/sync` endpoint clears cache for on-demand refresh
- [ ] BigQuery connector scaffolded but dormant (flag-switched off)

---

## 8. Directory & File Map

Every file in the repository is intentional and described below. No file should be created outside this structure without updating this document and `changes.md`.

```
CreativeVisibility/
│
├── changes.md                          ← Changelog: all Added/Changed/Deleted files
├── workflow.md                         ← THIS FILE: master specification (read before coding)
│
├── agents/                             ← AI agent profiles and definitions
│   ├── README.md                       ← Overview of the agents directory
│   └── ads_agent.md                    ← Exhaustive Google Ads knowledge agent (by Sourabh Chaudhari)
│
├── backend/                            ← Python FastAPI server
│   ├── main.py                         ← API entry point: routes, startup, middleware
│   ├── sheets_connector.py             ← Google Sheets API auth + fetch + cache layer
│   ├── db.py                           ← SQLite connection, table creation, UPSERT logic
│   ├── importer.py                     ← Pandas CSV chunk reader + bulk DB import engine
│   ├── calculator.py                   ← Performance metric computation functions (CTR/CPC/CPA/etc.)
│   ├── requirements.txt                ← Python dependencies (fastapi, uvicorn, gspread, pandas, etc.)
│   └── credentials.json               ← [GIT-IGNORED] Google Service Account key
│
└── frontend/                           ← React (Vite) application
    ├── package.json                    ← npm dependencies + Vite scripts
    ├── vite.config.js                  ← Vite server config (port, proxy to FastAPI)
    ├── index.html                      ← HTML shell with Google Font <link> tags
    └── src/
        ├── main.jsx                    ← ReactDOM.render entry point
        ├── App.jsx                     ← Root layout: sidebar + filter panel + main content area
        ├── index.css                   ← Global CSS: design tokens, theme variables, print styles
        ├── api/
        │   └── client.js               ← Axios/Fetch wrapper for all FastAPI calls
        ├── data/
        │   └── mockData.js             ← Hardcoded 30-day jewelry campaign demo seed (no upload needed)
        ├── hooks/
        │   ├── useFilters.js           ← Custom React hook for date/status/search filter state
        │   └── useTheme.js             ← Custom React hook for dark/light theme persistence
        └── components/
            ├── CampaignTree.jsx        ← Sidebar checklist tree (TOFU/MOFU → Type → City → Creative)
            ├── FilterPanel.jsx         ← Date picker, status dropdown, search bar, column toggle, export buttons
            ├── CreativeGrid.jsx        ← Card grid: image preview, YouTube iframe, text ad mockup
            ├── CreativeCard.jsx        ← Individual creative card with checkbox, metrics, verify link
            ├── TopPerformers.jsx       ← Ranked top-3/5 static vs video side-by-side by selected KPI
            ├── ThemeToggle.jsx         ← Dark/Light toggle button with animated transition
            ├── ExportModal.jsx         ← PDF theme picker modal (light/dark choice before print)
            └── UploadZone.jsx          ← Drag-and-drop CSV uploader component
```

---

## 6. Data Architecture & Scaling

### 6.1 The Problem with Scale
One creative asset tracked daily over 2 years:
```
1 creative × 365 days × 2 years = 730 rows
```
With 50 active creatives across 5 cities and 2 funnels:
```
50 creatives × 5 cities × 365 days × 2 years = 182,500 rows
```
With 200 creatives, multiple campaign types, ad groups, and age groups:
```
200 creatives × 10 campaign variations × 365 days × 2 years ≈ 1,460,000 rows
```

**A Google Sheet cannot handle 1.4 million rows efficiently.** Direct Sheets queries at this scale would time out and breach API quotas. This is why we use a **Decoupled Hybrid Architecture**.

### 6.2 Dimension vs. Fact Split
| Store | Location | Contents | Row Count | Managed By |
|---|---|---|---|---|
| **Dimension Store** | Google Sheet | Creative ID, Creative URL, Campaign Name, Funnel, City, Category, Age Group, Creative Type, Status, Headline, Description | Thousands | Marketing team (manually) |
| **Fact Store** | SQLite DB (`backend/campaigns.db`) | Date, Creative ID, Impressions, Clicks, Cost, Conversions | Millions | Automated via CSV bulk upload |

### 6.3 SQLite Database Schema
```sql
-- Dimension table (synced from Google Sheet)
CREATE TABLE IF NOT EXISTS creatives (
    creative_id     TEXT PRIMARY KEY,
    creative_url    TEXT NOT NULL,
    creative_type   TEXT CHECK(creative_type IN ('Image', 'Video', 'Text')),
    campaign_name   TEXT,
    funnel          TEXT CHECK(funnel IN ('TOFU', 'MOFU')),
    campaign_type   TEXT,
    city            TEXT,
    age_group       TEXT,
    category        TEXT,
    headline        TEXT,
    description     TEXT,
    status          TEXT CHECK(status IN ('Enabled', 'Paused')) DEFAULT 'Enabled'
);

-- Fact table (populated from Google Ads CSV dump)
CREATE TABLE IF NOT EXISTS daily_performance (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    date            TEXT NOT NULL,         -- Format: YYYY-MM-DD
    creative_id     TEXT NOT NULL,
    impressions     INTEGER DEFAULT 0,
    clicks          INTEGER DEFAULT 0,
    cost            REAL DEFAULT 0.0,
    conversions     REAL DEFAULT 0.0,
    FOREIGN KEY (creative_id) REFERENCES creatives(creative_id),
    UNIQUE(date, creative_id)              -- Prevents duplicate daily entries
);

-- Indexes for query performance on date range filters
CREATE INDEX IF NOT EXISTS idx_date ON daily_performance(date);
CREATE INDEX IF NOT EXISTS idx_creative ON daily_performance(creative_id);
CREATE INDEX IF NOT EXISTS idx_date_creative ON daily_performance(date, creative_id);
```

### 6.4 High-Performance Query Pipeline
When a user selects a date range in the UI, the following executes in under 50ms even with millions of rows:
```sql
SELECT
    dp.creative_id,
    SUM(dp.impressions)  AS total_impressions,
    SUM(dp.clicks)       AS total_clicks,
    SUM(dp.cost)         AS total_cost,
    SUM(dp.conversions)  AS total_conversions,
    c.creative_url,
    c.creative_type,
    c.campaign_name,
    c.funnel,
    c.city,
    c.category,
    c.age_group,
    c.status,
    c.headline,
    c.description
FROM daily_performance dp
JOIN creatives c ON dp.creative_id = c.creative_id
WHERE dp.date BETWEEN :start_date AND :end_date
  AND (:status IS NULL OR c.status = :status)
  AND (:city IS NULL OR c.city = :city)
  AND (:funnel IS NULL OR c.funnel = :funnel)
GROUP BY dp.creative_id
ORDER BY total_impressions DESC;
```

### 6.5 Incremental CSV Upload Flow
```
[Marketing Team exports CSV from Google Ads]
          │
          ▼
[Drag & drops CSV into portal Upload Zone]
          │
          ▼
[React frontend: POST /api/upload with multipart/form-data]
          │
          ▼
[FastAPI: importer.py reads CSV in 10,000-row Pandas chunks]
          │
          ▼
[For each chunk: UPSERT into daily_performance table]
  INSERT OR REPLACE INTO daily_performance
  (date, creative_id, impressions, clicks, cost, conversions) VALUES (...)
          │
          ▼
[Cache invalidated → Dimension sync from Google Sheet triggered]
          │
          ▼
[Upload complete notification returned to frontend]
```

---

## 7. Google Sheets Schema

The Google Sheet is the **Dimension Store** — it maps creative IDs to all metadata. The team updates this sheet whenever a new creative is added, paused, or restructured in Google Ads.

### 7.1 Sheet: `creative_dimensions` (Tab Name)
| Column | Data Type | Format / Values | Required | Description | Example |
|---|---|---|---|---|---|
| **creative_id** | String | Unique alphanumeric slug | ✅ Yes | Unique identifier per creative asset | `PMax_Mumbai_Bridal_Img01` |
| **creative_url** | String | Valid HTTPS URL | ✅ Yes | Direct image URL or YouTube video URL | `https://youtube.com/watch?v=abc123` |
| **creative_type** | String | `Image` \| `Video` \| `Text` | ✅ Yes | Format classification | `Image` |
| **campaign_name** | String | No spaces (underscore-separated) | ✅ Yes | Matches Google Ads campaign naming convention | `TOFU_PMax_Mumbai_Bridal_2534` |
| **funnel** | String | `TOFU` \| `MOFU` | ✅ Yes | Campaign funnel stage | `TOFU` |
| **campaign_type** | String | `Search` \| `PMax` \| `Video` \| `Display` \| `DemandGen` | ✅ Yes | Google Ads campaign network type | `PMax` |
| **city** | String | Title Case | ✅ Yes | Target metropolitan city | `Mumbai` |
| **age_group** | String | `18-24` \| `25-34` \| `35-44` \| `45+` | ✅ Yes | Demographic targeting bracket | `25-34` |
| **category** | String | `Bridal` \| `Rings` \| `Necklaces` \| `Everyday` \| `Diamonds` \| `Gold` | ✅ Yes | Jewelry product category | `Bridal` |
| **headline** | String | Max 30 characters | Conditional | Required only if creative_type = `Text` | `Shop Diamond Rings Online` |
| **description** | String | Max 90 characters | Conditional | Required only if creative_type = `Text` | `Explore our bridal diamond collection. Free shipping.` |
| **status** | String | `Enabled` \| `Paused` | ✅ Yes | Current campaign status in Google Ads | `Enabled` |

### 7.2 Google Ads CSV Dump Format (Fact Store Input)
The raw export from Google Ads must contain these columns. The importer will map and clean them:
| Google Ads Column | Mapped To | Notes |
|---|---|---|
| Date | `date` | Standardized to `YYYY-MM-DD` |
| Ad name / Asset ID | `creative_id` | Must match the sheet's `creative_id` |
| Impressions | `impressions` | Numeric, cleaned |
| Clicks | `clicks` | Numeric, cleaned |
| Cost | `cost` | Float, remove currency symbols |
| Conversions | `conversions` | Float |

---

## 8. Backend Architecture

### 8.1 FastAPI API Routes
| Method | Route | Description | Response |
|---|---|---|---|
| `GET` | `/api/campaigns` | Fetch the full campaign dimension tree from cache/Sheets | JSON hierarchy |
| `GET` | `/api/performance` | Fetch aggregated performance data for date range + filters | JSON array of creative metrics |
| `POST` | `/api/upload` | Accept CSV file upload, run Pandas UPSERT into SQLite | `{status: success, rows_imported: N}` |
| `GET` | `/api/top-performers` | Fetch sorted top-N creatives by metric, city, creative type | JSON array |
| `POST` | `/api/sync-sheet` | Force refresh Google Sheets dimension data + clear cache | `{status: synced}` |
| `GET` | `/api/template` | Return a downloadable blank CSV template for the team | CSV file download |
| `GET` | `/api/export-csv` | Return calculated aggregated performance as downloadable CSV | CSV file download |
| `GET` | `/health` | Liveness check for server monitoring | `{status: ok}` |

### 8.2 Caching Layer
- **Technology:** Python `cachetools.TTLCache` or FastAPI `@lru_cache` with TTL parameter.
- **Cache Key:** `"sheet_dimensions"` — stores the parsed Google Sheets JSON.
- **TTL:** 10–15 minutes (configurable via environment variable `CACHE_TTL_MINUTES`).
- **Invalidation Trigger:** Every successful CSV upload via `/api/upload` clears the cache immediately.
- **Rate Limit Protection:** Google Sheets API allows 100 requests per 100 seconds. The cache ensures the backend never breaches this even under heavy dashboard usage.

### 8.3 Environment Variables (`.env` — GIT-IGNORED)
```
GOOGLE_SHEET_ID=<spreadsheet_id_from_url>
GOOGLE_CREDENTIALS_PATH=./credentials.json
DATABASE_PATH=./campaigns.db
CACHE_TTL_MINUTES=15
ALLOWED_ORIGINS=http://localhost:5173,https://creativevisiblity.yourdomain.com
```

---

## 9. Frontend Architecture

> [!IMPORTANT]
> **This section reflects the ACTUAL Lovable-built frontend** cloned from `https://github.com/Sourabh0504/creativevisibility` into `d:\CreativeVisibility\frontend\`. All component names, file paths, state shapes, and features are taken directly from the real source code — not from the original plan. Any AI working on this project must read the actual files before making changes.

### 9.1 Tech Stack (Actual)
| Item | Technology | Notes |
|---|---|---|
| Framework | React 18 + TanStack Start | SSR-ready, file-based routing via TanStack Router |
| Build Tool | Vite 7 | Dev server + HMR |
| Styling | Tailwind CSS + shadcn/ui | Full component library — Button, Dialog, Popover, Tabs, Sonner toast |
| Charts | Recharts | LineChart, ResponsiveContainer, ReferenceLine |
| Virtualization | `@tanstack/react-virtual` | `useVirtualizer` in `DirectoryTree.tsx` for handling thousands of rows without lag |
| Routing | `@tanstack/react-router` | File-based routes; single page at `/` |
| Icons | Lucide React | Consistent icon set throughout |
| Toast Notifications | Sonner | Success/error toasts for export, view save, share, sync |

### 9.2 File Structure (Actual)
```
frontend/
├── src/
│   ├── routes/
│   │   ├── __root.tsx              ← Root layout (head meta, font links, theme class)
│   │   └── index.tsx               ← Main portal page — ALL primary state lives here
│   │
│   ├── components/
│   │   ├── GroupingSidebar.tsx     ← Left sidebar: mode switch, hierarchy presets, group drill-down
│   │   ├── DirectoryTree.tsx       ← Virtualized creative directory (tree + metric columns)
│   │   ├── CreativeCard.tsx        ← Individual creative card (used inside DirectoryTree)
│   │   ├── CreativeDetailModal.tsx ← Full-screen modal with charts, back/forward history, breadcrumbs
│   │   ├── FilterPanel.tsx         ← Date range, status, city, funnel, search, column toggle, exports
│   │   ├── TopPerformers.tsx       ← Side-by-side Image vs Video top-5 ranked cards
│   │   ├── SavedViewsMenu.tsx      ← Save/load/share/export/import named view snapshots
│   │   ├── ExportModal.tsx         ← PDF theme picker (light/dark) shown before window.print()
│   │   ├── CampaignTree.tsx        ← Campaign tree (alternate sidebar view)
│   │   └── ui/                     ← shadcn/ui components (button, dialog, popover, tabs, sonner)
│   │
│   ├── data/
│   │   └── mockData.ts             ← TEMPORARY: Seed data for 4 cities × multiple campaigns
│   │                                  REPLACE WITH: API calls to FastAPI backend
│   │
│   ├── lib/
│   │   ├── metrics.ts              ← computeMetrics(), fmtINR(), fmtNum(), fmtPct(), getYouTubeId()
│   │   ├── hierarchy.ts            ← DIM_META, ALL_DIMS, DEFAULT_HIERARCHY, HIERARCHY_PRESETS
│   │   ├── savedViews.ts           ← loadViews(), saveView(), deleteView(), buildShareUrl(), readSharedViewFromHash()
│   │   └── utils.ts                ← cn() (Tailwind class merge)
│   │
│   ├── hooks/
│   │   └── use-mobile.tsx          ← useIsMobile() hook
│   │
│   ├── styles.css                  ← Global CSS: aurora background, glass, gold gradient, print rules
│   ├── router.tsx                  ← TanStack router configuration
│   └── server.ts / start.ts        ← TanStack Start SSR entry points
```

### 9.3 Primary State — `index.tsx` (Portal Component)
All dashboard state lives in the single `Portal` component in `routes/index.tsx`:

| State Variable | Type | Default | Purpose |
|---|---|---|---|
| `filters` | `Filters` object | Last 30 days, All status/city/funnel, empty search | Controls all filtering for both creative list and metrics |
| `selected` | `Set<string>` | All creative IDs | Which creative_ids are active in the current sidebar group |
| `activeKey` | `string` | `"ALL"` | Currently active sidebar group key (e.g. `"Bangalore"` or `"Bangalore::TOFU"`) |
| `hierarchy` | `Dim[]` | `DEFAULT_HIERARCHY` | Ordered list of grouping dimensions (drag-reorderable) |
| `sidebarOpen` | `boolean` | `true` | Whether the left sidebar is visible |
| `columns` | `Record<string, boolean>` | impressions, clicks, cost, ctr, cpc, cpa visible | Which metric columns show in the directory tree |
| `theme` | `"dark" \| "light"` | `"dark"` | Persisted to `localStorage` as `cv-theme` |
| `exportOpen` | `boolean` | `false` | Controls the ExportModal (PDF theme picker) |
| `rankMetric` | `"ctr" \| "conversions" \| "cpc" \| "cpa"` | `"ctr"` | Active ranking dimension for Top Performers tab |
| `mode` | `SidebarMode` | `"report"` | `"report"` = performance view / `"structure"` = hierarchy-only view |
| `rowHeight` | `number` | `96` | Creative thumbnail height in pixels (slider-controlled, 40–1500px) |
| `detailHistory` | `string[]` | `[]` | Stack of creative_ids for back/forward navigation in detail modal |
| `detailCursor` | `number` | `-1` | Current position in `detailHistory` |

### 9.4 Derived State (useMemo — No Extra API Calls)
| Derived Value | Computed From | Purpose |
|---|---|---|
| `filteredCreatives` | `creatives` + `filters` | Dimension-level filter (status, city, funnel, search text) |
| `aggregated` | `dailyPerformance` + `filters.startDate/endDate` | Per-creative summed metrics for the selected date range |
| `visibleRows` | `filteredCreatives` + `selected` + `aggregated` | Final list rendered in DirectoryTree |
| `totals` | `visibleRows` | Grand total for the 6 KPI summary tiles in the header strip |
| `creativeById` | `creatives` | `Map<creative_id, Creative>` for O(1) lookup in detail modal |

### 9.5 Component Deep-Dives

#### `GroupingSidebar.tsx` — Left Panel
The most powerful piece of the UI. Controls both the *mode* and the *grouping hierarchy*:

- **Mode switcher:** Two premium glassmorphism tabs:
  - `Creative Report` — shows the full performance directory with metric columns
  - `Creative Structure` — shows the hierarchy without any numbers (pure structural view)
- **Hierarchy Presets:** Pre-built grouping combinations (e.g. City → Funnel → Campaign Type) shown as clickable pills
- **Custom Hierarchy Editor:** Expandable panel showing all active dimensions with ↑↓ reorder buttons and Eye/EyeOff toggle to add/remove dimensions
- **Group List:** Collapsible two-level group navigation (primary + secondary dimension). Click any group to filter the main view to only that group's creatives
- **"All Creatives" shortcut:** Resets selection to all creatives instantly

```
Hierarchy dimensions available (Dim type):
  "funnel"        → TOFU / MOFU
  "campaign_type" → PMax / Search / Video / Display
  "city"          → Bangalore / Hyderabad / Noida / NCR
  "campaign_name" → Full campaign name
  "ad_group"      → Asset group or ad group name
  "category"      → Bridal / Rings / Necklaces / Fashion / etc.
  "age_group"     → 25-34 / 18-34 / etc.
  "status"        → Enabled / Paused
```

#### `DirectoryTree.tsx` — Main Content Area
The centrepiece rendering component. Features that go far beyond a basic table:

- **Tree structure:** Recursive aggregation from the active hierarchy into `AggNode` tree — every parent node shows summed metrics of all its children
- **Virtualized rendering:** Uses `@tanstack/react-virtual` `useVirtualizer` — only renders rows currently on screen. Works perfectly with 10,000+ rows in the tree
- **Variable row heights:** Creative rows use `creativeRowHeight` (controlled by slider). Group header rows are always 44px. Virtualizer accounts for this with `estimateSize()`
- **Auto-expand on hierarchy change:** When the user changes the grouping dimensions, the top two levels auto-expand via `useEffect`
- **TOTAL strip:** A gold-accented row at the top showing aggregated totals for all visible creatives
- **Hover Preview:** On hovering over any creative thumbnail, a 480×480px floating preview appears showing:
  - Image creatives: full-res image
  - Video creatives: YouTube `maxresdefault.jpg` thumbnail
  - Text creatives: Google Search result mockup (white bg, blue headline, black description)
- **Column rendering:** Each metric column renders using `COL_DEFS` — impressions, clicks, spend, conversions, CTR, CPC, CPM, CR, CPA
- **Sort order:** Groups sorted by `total_cost` descending — highest-spend groups appear first
- **Click behaviour:** Clicking a group node toggles expand/collapse; clicking a creative leaf opens `CreativeDetailModal`

#### `CreativeDetailModal.tsx` — Deep-Dive Full-Screen Modal
The most technically complex component. Opens when you click any creative in the directory:

- **Back/Forward History Navigation:** Full browser-style history stack (`detailHistory[]` + `detailCursor`). Navigate between previously viewed creatives with ← Back / Forward → buttons or `Backspace` / `Alt+←` / `Alt+→` keyboard shortcuts
- **Prev/Next within current filter:** ← → arrow keys cycle through all currently visible creatives in order
- **Breadcrumb navigation:** Shows the full hierarchy path of the current creative. Clicking any breadcrumb level cycles through sibling creatives that share that dimension value (e.g., clicking "Bangalore" cycles all Bangalore creatives)
- **Position indicator:** Shows `3 / 24` — current creative position within visible set
- **KPI Summary Grid:** 8 metric tiles — Impressions, Clicks, Spend, Conversions, CTR (with delta vs. dataset avg), CPC, CR, CPA (with delta vs. dataset avg)
- **Delta vs. Dataset Average:** CTR and CPA tiles show `+X%` / `-X%` comparison vs. the average of all other currently visible creatives for the same date range. Green = better than average, Red = worse
- **4 Recharts Line Charts:**
  1. CTR vs. dataset average (daily) — this creative's CTR (gold line) vs. benchmark avg (dashed teal line)
  2. CPA vs. dataset average (daily)
  3. Daily spend (₹)
  4. Daily impressions (left axis) + clicks (right axis, dual Y-axis)
- **Keyboard shortcut awareness:** Keyboard nav is disabled if focus is inside an input/textarea

#### `TopPerformers.tsx` — Rankings Tab
- **Two-column layout:** Top Image Creatives | Top Video Creatives side by side
- **Top 5** ranked by selected metric (CTR / Conversions / CPC / CPA)
- **Medal system:** 🏆 Gold (1st), 🥈 Silver (2nd), 🥉 Bronze (3rd), then ranked icons for 4th and 5th
- **CPC/CPA ascending sort:** For cost metrics, lower = better — correctly sorted ascending with zero-values excluded
- **Creative thumbnail:** Image preview or YouTube thumbnail shown for each ranked item
- **City + Category + Funnel tag** shown below each creative title

#### `FilterPanel.tsx` — Sticky Filter Bar
- **Date Range:** Two `<input type="date">` fields (start + end), styled with dark color-scheme
- **Status dropdown:** All / Enabled / Paused
- **City dropdown:** Dynamically populated from data
- **Funnel dropdown:** All / TOFU / MOFU
- **Full-text search:** Searches across `campaign_name`, `city`, `category`, `headline`, `description` simultaneously
- **Column visibility popover:** Checkbox list for each metric column — controls what shows in DirectoryTree
- **Export CSV button:** Generates and downloads a CSV with all current visible rows + calculated KPIs
- **Export PDF button:** Opens `ExportModal` for light/dark theme selection, then calls `window.print()`
- **Right slot:** Accepts `SavedViewsMenu` as a child — composable design

#### `SavedViewsMenu.tsx` — View Persistence System
A powerful view management system far beyond the original spec:

- **Save current view:** Named snapshots that save the complete state: `{filters, hierarchy, columns, activeKey, selectedIds}`
- **Load saved view:** Instantly restores all state from a saved snapshot
- **Share via URL:** Encodes the entire view state into a URL hash using `buildShareUrl()`. Paste the URL to any teammate — they get your exact filter + hierarchy combination
- **Load from URL hash:** On page load, `readSharedViewFromHash()` checks if a shared view is encoded in the URL and auto-applies it with a toast notification
- **Export views as JSON:** Download all saved views as a `.json` file for backup
- **Import views from JSON:** Upload a `.json` file to restore views on a new machine
- **Delete individual views**
- **Persistent storage:** All views stored in `localStorage` under `cv-saved-views`

### 9.6 Metrics Library — `lib/metrics.ts`
All performance calculations happen here. Every function uses zero-guard division:

```typescript
export function computeMetrics({ impressions, clicks, cost, conversions }) {
  const safeDiv = (a, b) => (b === 0 || b == null ? 0 : a / b);
  return {
    impressions,
    clicks,
    cost,
    conversions,
    ctr: +safeDiv(clicks, impressions * 0.01).toFixed(2),   // %
    cpc: +safeDiv(cost, clicks).toFixed(2),                  // ₹
    cpm: +safeDiv(cost, impressions / 1000).toFixed(2),      // ₹
    cr:  +safeDiv(conversions, clicks * 0.01).toFixed(2),    // %
    cpa: +safeDiv(cost, conversions).toFixed(2),             // ₹
  };
}

// Indian number formatting (e.g. 1,23,456)
export const fmtINR = (v: number) =>
  "₹" + v.toLocaleString("en-IN", { maximumFractionDigits: 0 });

// Compact number formatting (e.g. 1.2L, 45K)
export const fmtNum = (v: number) => { ... }

// Percentage with 2 decimal places
export const fmtPct = (v: number) => v.toFixed(2) + "%";

// Extract YouTube video ID from any YouTube URL format
export const getYouTubeId = (url: string) =>
  url.match(/(?:youtu\.be\/|v=|embed\/)([\w-]{11})/)?.[1] ?? null;
```

### 9.7 Hierarchy System — `lib/hierarchy.ts`
Defines the dimensions that can be used for grouping/drilling:

```typescript
export type Dim = "funnel" | "campaign_type" | "city" | "campaign_name" | "ad_group" | "category" | "age_group" | "status";

export const DIM_META: Record<Dim, { label: string; icon: LucideIcon; get: (c: Creative) => string }> = {
  funnel:        { label: "Funnel",         icon: GitFork,    get: c => c.funnel },
  campaign_type: { label: "Campaign Type",  icon: Megaphone,  get: c => c.campaign_type },
  city:          { label: "City",           icon: MapPin,     get: c => c.city },
  campaign_name: { label: "Campaign",       icon: BarChart3,  get: c => c.campaign_name },
  ad_group:      { label: "Ad Group",       icon: Layers,     get: c => c.ad_group },
  category:      { label: "Category",       icon: Tag,        get: c => c.category },
  age_group:     { label: "Age Group",      icon: Users,      get: c => c.age_group },
  status:        { label: "Status",         icon: CircleDot,  get: c => c.status },
};

// Pre-built hierarchy layouts shown as one-click presets in the sidebar
export const HIERARCHY_PRESETS = [
  { id: "city-funnel",    label: "City › Funnel",           dims: ["city", "funnel"] },
  { id: "funnel-city",    label: "Funnel › City",           dims: ["funnel", "city"] },
  { id: "campaign-type",  label: "Campaign Type › City",    dims: ["campaign_type", "city"] },
  { id: "category",       label: "Category › City",         dims: ["category", "city"] },
  { id: "full",           label: "Full Drill-down",         dims: ["city", "funnel", "campaign_type", "campaign_name", "ad_group"] },
];
```

### 9.8 Current Data Source (TO BE REPLACED)
The frontend currently uses `src/data/mockData.ts` which generates synthetic data for 4 cities (Bangalore, Hyderabad, Noida, NCR) with realistic jewelry campaign structures and 30 days of seeded random daily performance data.

**When connecting to the FastAPI backend, `mockData.ts` must be replaced with:**
```typescript
// src/lib/api.ts — TO BE CREATED
const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export async function fetchCreatives(): Promise<Creative[]> {
  const res = await fetch(`${BASE}/api/dimensions`);
  return res.json();
}

export async function fetchPerformance(start: string, end: string): Promise<AggregatedRow[]> {
  const res = await fetch(`${BASE}/api/performance?start=${start}&end=${end}`);
  return res.json();
}
```

**In `index.tsx`, replace:**
```typescript
// REMOVE:
import { creatives, dailyPerformance, cities } from "@/data/mockData";

// ADD:
const [creatives, setCreatives] = useState<Creative[]>([]);
const [aggregated, setAggregated] = useState<Map<string, ComputedMetrics>>(new Map());

useEffect(() => {
  fetchCreatives().then(setCreatives);
}, []);

useEffect(() => {
  fetchPerformance(filters.startDate, filters.endDate).then(rows => {
    const map = new Map<string, ComputedMetrics>();
    rows.forEach(r => map.set(r.creative_id, computeMetrics(r)));
    setAggregated(map);
  });
}, [filters.startDate, filters.endDate]);
```

### 9.9 PDF Export Behaviour
- `ExportModal` opens first to let user pick light or dark theme for the export
- Sets `data-print-theme` attribute on `#print-root` div
- Calls `window.print()` after 100ms delay
- `styles.css` has `@media print` rules that:
  - Hide all `.no-print` elements (header, sidebar, filter panel, controls)
  - Show only `.print-area` (the creative directory grid)
  - Force the selected theme's colours
  - Keep image URLs as clickable verification links in the PDF

**Context-Aware Export (implemented 2026-05-30):**
When the user clicks "Export PDF", the modal automatically inherits the complete current dashboard state — it does not open blank. The modal pre-fills with:
- Active date range
- Active filters (status, city, funnel, search)
- Selected funnel and campaign/ad group selection
- Active hierarchy level and grouping
- Current metric column selection and sorting

The user immediately sees a report context that reflects exactly what they were analysing. They can optionally adjust export-specific settings (hierarchy depth, density, branding, number of creatives, summary vs. detail mode) before confirming. Filters are never reset on modal open. See Section 13.3 for the full specification.

### 9.10 Row Height Slider
A unique feature not in the original spec — the `RowHeightControl` component:
- Slider range: 40px to 1500px
- Preset buttons: 64 / 96 / 160 / 240 / 400px
- Controls the creative thumbnail size in `DirectoryTree`
- At 1500px, each creative image fills nearly the full screen — useful for presenting to clients
- The `useVirtualizer` correctly handles variable heights between the group header rows (44px) and creative rows (`rowHeight + 16px`)

---

## 10. UI/UX Design System

### 10.1 Design Philosophy
The portal serves a **luxury jewelry brand**. Every pixel must communicate premium quality. The UI must feel as refined as the client's products — no generic default browser styles, no plain colors, no unpolished layouts.

### 10.2 CSS Design Tokens
```css
:root {
  /* Backgrounds */
  --bg-primary:        #0a0c10;
  --bg-secondary:      rgba(18, 21, 28, 0.75);
  --bg-card:           rgba(20, 24, 33, 0.8);

  /* Text */
  --text-primary:      #f3f4f6;
  --text-secondary:    #9ca3af;
  --text-muted:        #6b7280;

  /* Accents */
  --accent-gold:       #d4af37;
  --accent-gold-dim:   #b59410;
  --accent-emerald:    #0d9488;

  /* Borders */
  --border-color:      rgba(255, 255, 255, 0.08);
  --border-active:     rgba(212, 175, 55, 0.4);

  /* Shadows */
  --shadow-card:       0 4px 20px rgba(0, 0, 0, 0.4);
  --shadow-gold-hover: 0 8px 30px rgba(212, 175, 55, 0.15);

  /* Typography */
  --font-headings:     'Montserrat', sans-serif;
  --font-body:         'Inter', sans-serif;

  /* Radius */
  --radius-sm:         6px;
  --radius-md:         12px;
  --radius-lg:         20px;

  /* Transitions */
  --transition-fast:   0.2s ease;
  --transition-base:   0.3s ease;
}

[data-theme="light"] {
  --bg-primary:        #ffffff;
  --bg-secondary:      #f8f9fa;
  --bg-card:           #ffffff;
  --text-primary:      #111827;
  --text-secondary:    #4b5563;
  --text-muted:        #9ca3af;
  --border-color:      #e5e7eb;
  --shadow-card:       0 4px 20px rgba(0, 0, 0, 0.08);
}
```

### 10.3 Premium UI Elements
| Element | Implementation |
|---|---|
| **Glassmorphism cards** | `backdrop-filter: blur(12px)` + `background: var(--bg-card)` |
| **Gold hover glow** | `box-shadow: var(--shadow-gold-hover)` on `:hover` |
| **Smooth tab switch** | `transition: var(--transition-base)` with `opacity` and `transform` |
| **Checkbox animation** | CSS `transform: scale(1.1)` on `:checked` with custom styled indicator |
| **Theme toggle** | Animated icon swap (sun ↔ moon) with `transition` on background |
| **Badge medals** | Gold (🥇), Silver (🥈), Bronze (🥉) rank badges on top performer cards |

### 10.4 Typography
| Usage | Font | Weight | Size |
|---|---|---|---|
| Page title / brand | Montserrat | 700 | 28–32px |
| Section headings | Montserrat | 600 | 18–22px |
| Card labels | Montserrat | 500 | 14px |
| Metric numbers | Inter | 700 | 20–24px |
| Body / descriptions | Inter | 400 | 14–16px |
| Helper / muted text | Inter | 400 | 12px |

---

## 11. Feature Specifications

### 11.1 CSV Upload & Data Ingestion
- **Upload Zone:** Drag-and-drop area accepting `.csv` files only.
- **Demo Mode Button:** Clicking "Load Demo Data" seeds the frontend with 30-day mock jewelry campaign data from `mockData.js` — no upload needed for client demos.
- **Download Template Button:** Downloads a blank CSV with the correct column headers for the team to fill.
- **Progress Feedback:** Show row count as import proceeds. Show success/error toast on completion.

### 11.2 Campaign Tree (Sidebar)
- Renders the full hierarchy: **Funnel → Campaign Type → City → Individual Creatives**.
- Every node has a tri-state checkbox: **checked**, **unchecked**, or **indeterminate** (partial child selection).
- **Cascade Rules:**
  - Checking a parent automatically checks all children.
  - Unchecking any child sets the parent to indeterminate.
  - Unchecking all children of a parent unchecks the parent fully.
- **Collapse/Expand:** All nodes are collapsible. State persists during the session.

### 11.3 Filter Panel
| Filter | Type | Behavior |
|---|---|---|
| **Date Range** | Two date inputs (Start, End) | Triggers `/api/performance?start=&end=` API call |
| **Status** | Dropdown: All / Enabled / Paused | Filters creatives by Status column |
| **City** | Dropdown: All / City list | Filters campaign tree and grid to selected city |
| **Funnel** | Dropdown: All / TOFU / MOFU | Restricts to selected funnel |
| **Search** | Text input | Real-time filter across campaign names, cities, categories, headlines |
| **Column Visibility** | Multi-select toggle | Show/hide: CTR, CPC, CPM, CR, CPA, Impressions, Clicks, Cost, Conversions |

### 11.4 Creative Grid
- **Image Cards:** Display the image by loading the Creative URL directly in an `<img>` tag. Show creative name, campaign, city, and selected KPI metrics below. Show raw Creative URL as a clickable verification link at the bottom.
- **Video Cards:** Extract YouTube Video ID from URL using regex. Render `<iframe>` YouTube embed player. Display video title (pulled from YouTube oEmbed API or stored in Sheet) as a bold hyperlink below the player. Show raw YouTube URL as a verification link.
- **Text Ad Cards:** Render a Google Search Result mockup showing the green domain URL, blue headline links, and black description text — visually matching what users see on Google.com.

### 11.5 Top Performers Tab
**Algorithm:**
1. Filter `filteredData` by selected City (or "All") and date range.
2. Group rows by `creative_id`.
3. Sum all raw metrics per creative.
4. Calculate KPIs (CTR, CPC, CPA, CPM, CR) per creative.
5. Split into `imageCreatives[]` and `videoCreatives[]`.
6. Sort each array by the user's chosen ranking metric (dropdown: CTR, Conversions, CPC, CPA).
7. Render top 3–5 from each array side by side with rank badges.

**Ranking Metrics:**
| Metric | Sort Direction | Interpretation |
|---|---|---|
| CTR | Descending | Highest engagement rate |
| Conversions | Descending | Most actual purchases/leads |
| CPC | Ascending | Most efficient cost per click |
| CPA | Ascending | Most efficient cost per conversion |

### 11.6 Theme Toggle
- Button fixed in the top navigation bar.
- On click: toggles `data-theme="dark"` / `data-theme="light"` on `<html>` element.
- CSS custom properties cascade automatically to all child components.
- Theme preference stored in `localStorage` and applied on page load.

---

## 12. Performance Mathematics

All formulas execute with zero-guard protection. Any empty, blank, or null metric cell is treated as `0` before calculation. This is non-negotiable on a high-budget client account.

### 12.1 Formulas
| Metric | Formula | Zero Guard | Unit |
|---|---|---|---|
| **CTR** | `(Clicks / Impressions) × 100` | If Impressions = 0 → return `0.00` | % |
| **CPC** | `Cost / Clicks` | If Clicks = 0 → return `0.00` | ₹ |
| **CPM** | `(Cost / Impressions) × 1000` | If Impressions = 0 → return `0.00` | ₹ |
| **CR** | `(Conversions / Clicks) × 100` | If Clicks = 0 → return `0.00` | % |
| **CPA** | `Cost / Conversions` | If Conversions = 0 → return `0.00` | ₹ |
| **ROAS** | `Revenue / Cost` | If Cost = 0 → return `0.00` | × |
| **VTR** | `(Views / Impressions) × 100` | If Impressions = 0 → return `0.00` | % |

### 12.2 Safe Calculation Template (JavaScript)
```javascript
const safeDiv = (numerator, denominator) =>
  denominator === 0 || !denominator ? 0 : numerator / denominator;

const calcMetrics = (row) => ({
  ctr:  +(safeDiv(row.clicks, row.impressions) * 100).toFixed(2),
  cpc:  +safeDiv(row.cost, row.clicks).toFixed(2),
  cpm:  +(safeDiv(row.cost, row.impressions) * 1000).toFixed(2),
  cr:   +(safeDiv(row.conversions, row.clicks) * 100).toFixed(2),
  cpa:  +safeDiv(row.cost, row.conversions).toFixed(2),
});
```

### 12.3 India Jewelry Benchmarks
| Metric | TOFU (Awareness) | MOFU (Consideration) |
|---|---|---|
| CTR (Search) | 3–5% | 6–12% |
| CTR (Display) | 0.05–0.2% | 0.3–0.8% |
| VTR (YouTube) | 25–40% | 35–55% |
| CPC (Search) | ₹20–₹80 | ₹50–₹150 |
| CPM (Display) | ₹30–₹80 | ₹50–₹120 |
| CPA (Jewelry) | ₹500–₹2,000 | ₹250–₹800 |

---

## 13. Export Engine

### 13.1 PDF Export (Print-to-PDF via Browser)

**Why `window.print()` and not a PDF library?**
Using browser print preserves all hyperlinks as active and clickable in the saved PDF. PDF conversion libraries (like html2canvas or Puppeteer) render the DOM as a static image and destroy link interactivity. Our approach keeps every verification URL and YouTube title link fully clickable in the downloaded PDF.

**Export Flow:**
1. User clicks "Export to PDF" button.
2. `ExportModal.jsx` opens with two choices: **Plain White** or **Dark Theme**.
3. On selection, React sets `data-print-theme="light"` or `"dark"` on the print wrapper container.
4. `window.print()` is called.
5. The `@media print` CSS stylesheet activates, hiding sidebar, filters, upload zone, and buttons.
6. The selected creatives render in the clean, paginated grid layout.

**Print CSS Specification:**
```css
@media print {
  /* Hide all UI chrome */
  .sidebar, .filter-panel, .upload-zone,
  button, .theme-toggle, .tab-nav,
  .card-checkbox, .export-modal { display: none !important; }

  /* Full-width content area */
  .main-content { width: 100% !important; margin: 0 !important; }

  /* Light theme overrides */
  [data-print-theme="light"] {
    background: #ffffff !important;
    color: #111827 !important;
  }

  /* Dark theme overrides */
  [data-print-theme="dark"] {
    background: #0a0c10 !important;
    color: #f3f4f6 !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* Page breaks between city campaign groups */
  .city-campaign-group { page-break-after: always; }

  /* Keep verification links visible and underlined */
  .verify-link {
    display: block !important;
    text-decoration: underline !important;
    color: #1a0dab !important;
    font-size: 11px !important;
  }
}
```

### 13.2 Excel-Compatible CSV Export
- Triggered by the "Export to Excel" button in the Filter Panel.
- Calls `GET /api/export-csv` with the current active filters as query params.
- FastAPI runs the SQL query with the active filters, computes all metrics server-side, and streams back a CSV.
- Browser triggers a download using the `Content-Disposition: attachment` response header.
- The CSV contains: `Creative ID, Creative URL, Campaign, City, Funnel, Category, Age Group, Status, Impressions, Clicks, Cost, Conversions, CTR (%), CPC (₹), CPM (₹), CR (%), CPA (₹)`.

---

### 13.3 Context-Aware Export — Dashboard State Inheritance

> **Status:** Implemented 2026-05-30 by Sourabh Chaudhari.

#### Philosophy
The export flow must feel seamless and context-aware. The client should never feel like they are creating a report from scratch. The experience should be:

> "Take my current analysis and turn it into a polished professional report."

#### What "Current Dashboard State" Means
When the user opens the Export PDF modal, the following active dashboard context is **automatically inherited**:

| Dashboard State | What Is Captured |
|---|---|
| **Date range** | Active `startDate` and `endDate` from the filter panel |
| **Status filter** | All / Enabled / Paused — current selection |
| **City filter** | Currently selected city (or All) |
| **Funnel filter** | TOFU / MOFU / All — current selection |
| **Campaign / ad group selection** | Which nodes in the GroupingSidebar are currently selected (`selected` Set) |
| **Platform / source** | Currently active campaign type filter (if applicable) |
| **Search / text filter** | Any active search query |
| **Active sorting** | Current sort metric and direction applied to DirectoryTree |
| **Metric column selection** | Which KPI columns are currently visible (`columns` state) |
| **Hierarchy / grouping** | Active `hierarchy` dimension order and `activeKey` group |

The export system uses the **exact same `filteredCreatives` + `aggregated` dataset** currently active on screen — not a re-query or a reset.

#### Important UX Clarification
This does **not** mean exporting only the visible viewport or screen area.

It means: export the report using the currently applied dashboard context and selections as the data source. If the user is viewing a filtered, sorted, grouped subset of creatives, the PDF is generated from that exact subset.

**Example:** If the user has:
- Selected "Last 30 Days"
- Filtered to Mumbai campaigns only
- Opened only the TOFU funnel
- Chosen Meta / Performance Max campaign type
- Sorted by highest spend

Then the PDF automatically generates using exactly that dashboard state — the user does not touch any filter inside the modal.

#### Export Modal Behaviour on Open
When the modal opens:
1. **Pre-load current state** — all active filters and selections are read from `index.tsx` state and passed as props to `ExportModal`
2. **Show active date range** — displayed as a read-only summary at the top of the modal
3. **Show active hierarchy level** — e.g. "City → Funnel → Campaign Type"
4. **Show active filter summary** — e.g. "Mumbai · Enabled · TOFU · Last 30 Days"
5. **Reflect analytical context automatically** — the user immediately understands the report is already prepared for their current analysis

#### Smart Default Behaviour
- Modal opens with current dashboard state as the default — never a blank/reset state
- No filters are ever reset on modal open
- User workflow continuity is preserved throughout

#### Optional Adjustments Inside the Modal
After inheriting the dashboard state, the user **may optionally** modify export-specific settings. These layer on top of the current context — they do not replace it:

| Adjustable Setting | Options |
|---|---|
| Export hierarchy level | Which grouping depth to include in the report |
| Included sections | Top Performers, Creative Grid, Summary Tiles, Charts |
| Report density | Compact / Standard / Detailed |
| Branding | Include / hide logo and brand header |
| Layout type | Grid / List / Presentation |
| Number of creatives shown | Top 5 / 10 / 20 / All |
| Report mode | Summary (aggregated totals only) vs. Detailed (individual creative rows) |
| PDF theme | Plain White / Dark Theme |

#### Frontend Implementation Notes
`ExportModal` receives the full current state as props from `index.tsx`:

```typescript
// ExportModal receives these props from the parent Portal component
interface ExportModalProps {
  open: boolean;
  onClose: () => void;
  // Dashboard state passed in — never derived fresh inside the modal
  filters: Filters;            // active date range, status, city, funnel, search
  selected: Set<string>;       // which creative IDs are currently selected
  hierarchy: Dim[];            // active grouping dimension order
  activeKey: string;           // currently active sidebar group key
  columns: Record<string, boolean>; // visible metric columns
  visibleRows: CreativeRow[];  // the exact dataset currently on screen
  totals: ComputedMetrics;     // grand totals for the visible set
}
```

The modal must **never** call its own fresh API fetch or compute its own filter state. It operates exclusively on the props passed from the parent. This is the single source of truth for what gets exported.

---

## 14. Edge Cases & Guardrails

Every edge case below MUST be handled. These are not optional — they are non-negotiable stability requirements for a high-budget client account.

| # | Scenario | Handling |
|---|---|---|
| 1 | **Division by zero** | `safeDiv()` utility returns `0` whenever denominator is `0`, `null`, or `undefined`. No `NaN` or `Infinity` may appear in any UI element. |
| 2 | **Blank/null metric cells in CSV** | Pandas `fillna(0)` applied to all numeric columns during CSV import. |
| 3 | **Broken image URL** | `<img onError>` swaps source to a local placeholder SVG reading "Asset Preview Unavailable". Never shows a broken image icon. |
| 4 | **Invalid YouTube URL** | Regex tests: `youtu.be/`, `youtube.com/watch?v=`, `youtube.com/embed/`. If none match, renders a plain linked card without iframe (no broken embed). |
| 5 | **Date range returns empty data** | UI renders an elegant empty state card: "No creatives found for the selected date range and filters." Never shows blank white space or broken tables. |
| 6 | **Google Sheets API rate limit exceeded** | FastAPI serves cached dimension data. If cache is also expired, a clear error message is returned: "Sheet sync temporarily unavailable. Retry in 1 minute." |
| 7 | **Duplicate CSV rows on re-upload** | SQLite `UNIQUE(date, creative_id)` constraint + `INSERT OR REPLACE` prevents duplicate accumulation. |
| 8 | **CSV column mismatch** | Importer validates required columns on parse. Returns error listing which columns are missing before inserting any rows. |
| 9 | **Campaign tree renders with no data** | Show "No campaigns loaded. Upload a CSV or load demo data." prompt in the sidebar. |
| 10 | **Print/PDF with dark background not rendering color** | CSS `print-color-adjust: exact` and `-webkit-print-color-adjust: exact` are set for dark print theme. |

---

## 15. Testing & QA Checklist

### Phase 1: Data Ingestion
- [ ] Upload a valid CSV file. Verify "X rows imported" toast appears with the correct count.
- [ ] Upload a CSV with missing required columns. Verify a clear error message names the missing columns.
- [ ] Upload the same CSV twice. Verify row count does not double — UPSERT is working.
- [ ] Upload a CSV with blank metric cells (e.g. empty Clicks column). Verify they are stored as `0`.

### Phase 2: Dimension Sync (Google Sheets)
- [ ] Add a new creative row to the Google Sheet. Click "Sync Sheet". Verify it appears in the sidebar tree.
- [ ] Pause a creative in the Sheet. Reload dashboard. Verify Status filter "Enabled Only" hides it.

### Phase 3: Filters & Dynamic Calculations
- [ ] Select a 7-day date range. Verify all metric cards update instantly.
- [ ] Select a date range with no data. Verify the elegant empty state message appears.
- [ ] Set Status to "Enabled". Confirm no "Paused" creatives are visible anywhere.
- [ ] Run calculations manually on 3 rows from the CSV and verify CTR, CPC, CPA match the UI exactly.
- [ ] Set Impressions = 0 in a test row. Verify CTR and CPM display as `0.00` (not NaN or Infinity).

### Phase 4: Campaign Tree (Checkboxes)
- [ ] Check the top-level "All Funnels" checkbox. Confirm every node in the tree is checked.
- [ ] Uncheck a single city (e.g. Delhi under MOFU Search). Confirm MOFU Search shows as indeterminate.
- [ ] Uncheck a creative card in the grid. Confirm it does not appear in the PDF export preview.

### Phase 5: Top Performers Tab
- [ ] Switch to Top Performers tab. Confirm image and video rankings render side by side.
- [ ] Select City = Mumbai, Metric = CTR. Confirm the #1 card is the Mumbai creative with the highest CTR.
- [ ] Change the date range. Confirm top performer rankings update accordingly.

### Phase 6: Exports
- [ ] Click "Export to PDF" → Select "Plain White". Open print preview. Confirm white background, dark text.
- [ ] Click "Export to PDF" → Select "Dark Theme". Confirm dark background, light text, gold accents visible.
- [ ] In the exported PDF, click a verification URL. Confirm it opens the correct asset page.
- [ ] In the exported PDF, click a YouTube video title. Confirm it opens the correct YouTube URL.
- [ ] Click "Export to Excel". Open the downloaded CSV in Excel/Google Sheets. Verify metrics match UI.

### Phase 7: Theme Toggle
- [ ] Click the theme toggle. Confirm all colors transition smoothly to the alternate theme.
- [ ] Refresh the page. Confirm the selected theme persists (localStorage working).

---

## 16. Subagents & AI Assistants

### 16.1 Ads Agent
| Field | Value |
|---|---|
| **Agent ID** | `ads_agent` |
| **Author** | Sourabh Chaudhari |
| **Profile File** | [agents/ads_agent.md](file:///d:/CreativeVisibility/agents/ads_agent.md) |
| **Domain** | Google Ads — all campaign types, settings, bidding, creative specs, audiences, conversion tracking |

**Core Capabilities:**
- Deep expertise in Search (RSA/DSA), PMax, Video (YouTube), Display, and Demand Gen campaigns.
- Knows every setting on every campaign-level, ad group-level, and asset-level screen in Google Ads.
- Can generate Google Ads Editor-compatible bulk upload CSV structures.
- Performs precise performance math (CTR, CPC, CPA, CPM, CR, ROAS, VTR) with zero-guard rules.
- Maintains the campaign naming convention: `[Funnel]_[Type]_[City]_[Category]_[AgeGroup]`.
- Applies standard negative keyword strategy and brand vs. non-brand campaign separation rules.
- Knows all asset specifications for PMax (image ratios, video durations, headline lengths).
- Identifies and resolves common Google Ads issues (disapprovals, policy flags, learning phase issues).

> See full encyclopedic reference in [agents/ads_agent.md](file:///d:/CreativeVisibility/agents/ads_agent.md)

---

## 17. Discussion & Decision Log

### 2026-05-28 — Project Initialization
> **Context:** Sourabh Chaudhari started the CreativeVisibility project.
> **Decisions:** Created `changes.md`, `workflow.md`, and `agents/` directory structure.

### 2026-05-28 — Business Context & Problem Statement
> **Context:** Identified that the jewelry brand client has no visibility into which creatives are live in which campaigns. Manual reporting via screenshots, slides, and Excel pivots is slow and error-prone.
> **Decisions:** Portal will solve visual asset disconnect, YouTube isolation, pivot math, and export friction.

### 2026-05-28 — Campaign Hierarchy Established
> **Context:** Campaigns are structured as Funnel (TOFU/MOFU) → Campaign Type → City → Target (Age + Category) → Creatives (Image/Video/Text).
> **Decisions:** The entire UI, API, and database design is organized around this hierarchy.

### 2026-05-28 — Feature Scope Defined
> **Context:** Discussed PDF export (with clickable links and light/dark themes), Google Ads Editor-style checkbox selection, date range filtering, status filters, column visibility toggles, Excel CSV export.
> **Decisions:** All features scoped into Phase 1.

### 2026-05-28 — Top Performers Section Added
> **Context:** Client wants to know which specific image or video is performing best in any city for any date range.
> **Decisions:** Added a dedicated "Top Performers" tab bifurcated by Static vs. Video, sortable by CTR / Conversions / CPC / CPA, filterable by City and date range.

### 2026-05-28 — Tech Stack Finalized
> **Context:** React + Vite for frontend. Python FastAPI for backend. Google Sheets as the dimension store. SQLite + Pandas for the high-volume fact store.
> **Decisions:** Decoupled hybrid architecture to handle millions of rows without degrading performance.

### 2026-05-28 — Scaling Architecture Specified
> **Context:** Campaign data can span 1–2 years with millions of daily rows. Google Sheets cannot handle this volume directly.
> **Decisions:** Dimension vs. Fact split. SQLite indexed on `(date, creative_id)`. Queries run in <50ms on millions of rows. Pandas chunked UPSERT for bulk import.

### 2026-05-28 — Ads Agent Created
> **Context:** Sourabh Chaudhari requested a specialized AI subagent with exhaustive Google Ads knowledge to support operations, copy generation, and validations.
> **Decisions:** Defined `ads_agent` with 13-section encyclopedic profile. Author declared as Sourabh Chaudhari inside the system prompt and profile file.

### 2026-05-30 — Export PDF: Context-Aware Dashboard State Inheritance
> **Context:** The original Export PDF flow opened a blank modal where users picked a theme and clicked print. This created friction — the user felt like they were starting a report from scratch rather than exporting their current analysis.
> **Problem:** Export modal had no awareness of what the user was currently analysing. Filters, date range, hierarchy, and selection had to be mentally re-applied by the user.
> **Decision:** `ExportModal` now receives the complete current dashboard state as props (`filters`, `selected`, `hierarchy`, `activeKey`, `columns`, `visibleRows`, `totals`) from the parent `Portal` component in `index.tsx`. The modal pre-fills and displays the active context on open. Users see their current date range, active filters, and hierarchy reflected immediately.
> **Philosophy:** The export experience should feel like "take my current analysis and turn it into a polished professional report" — not "create a new report from scratch."
> **Key constraint:** The modal must never re-fetch data or compute its own filter state. It operates exclusively on the props passed from the parent. `visibleRows` is the exact same dataset currently on screen.
> **Optional adjustments preserved:** Users can still modify export-specific settings (hierarchy depth, included sections, density, branding, layout type, number of creatives, summary vs. detail mode, PDF theme) — but these layer on top of the inherited dashboard context, they do not replace it.
> **Documented in:** Section 9.9 and Section 13.3 of this document.
