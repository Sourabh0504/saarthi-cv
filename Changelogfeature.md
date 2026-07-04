# Campaign Change History & Audit Management Module
## Product Design Document — Saarthi Platform

> **Status:** Design specification — no implementation yet.
> **Author role:** Senior Product Designer / UX Architect / Google Apps Script System Designer.
> **Audience:** Engineering team implementing this module; future agents/contributors reading this cold.
> **Principle governing every decision below:** Campaign ID is the permanent primary key. Campaign Name, Client Name, Account Name, Budget, Status, and every other attribute can and will change over time — the audit trail must survive that drift without ever losing, overwriting, or silently correcting a historical record.

---

## Table of Contents

1. [Module Overview](#1-module-overview)
2. [Architecture](#2-architecture)
3. [Database Design](#3-database-design)
4. [Google Sheet Schema](#4-google-sheet-schema)
5. [Data Relationships](#5-data-relationships)
6. [User Flow Diagrams](#6-user-flow-diagrams)
7. [Screen-by-Screen UI Design](#7-screen-by-screen-ui-design)
8. [Component Specifications](#8-component-specifications)
9. [Form Specifications](#9-form-specifications)
10. [Validation Rules](#10-validation-rules)
11. [Business Rules](#11-business-rules)
12. [Error Handling](#12-error-handling)
13. [Edge Cases](#13-edge-cases)
14. [Permissions Matrix](#14-permissions-matrix)
15. [Audit Logic](#15-audit-logic)
16. [Reporting Design](#16-reporting-design)
17. [AI Integration Strategy](#17-ai-integration-strategy)
18. [Future Enhancements](#18-future-enhancements)
19. [Implementation Recommendations](#19-implementation-recommendations)
20. [Best Practices](#20-best-practices)

---

## 1. Module Overview

### 1.1 What this module is

The Change History & Audit Management module is Saarthi's system of record for **every optimization action performed on every campaign, across every client, account, and platform.** It answers three questions an agency is constantly asked and rarely can answer with confidence:

- "What did we actually change, and when?"
- "Who made that change, and why?"
- "Did it work?"

Think of it as **Google Ads Editor's change history + Salesforce's audit log + Jira's issue activity feed**, purpose-built for a marketing agency managing thousands of campaigns across many clients and platforms — not a generic changelog bolted onto campaign data, but a first-class, permanent, append-only ledger.

### 1.2 Why it exists (the problem today)

Agencies optimize campaigns constantly — budgets shift, bids change, keywords get added and pruned, audiences get refined. Today that knowledge lives in Slack threads, tribal memory, or nowhere at all. When a campaign's performance changes, nobody can reliably answer "what changed right before this happened?" This module exists to make that question answerable in seconds, for any campaign, at any point in its history.

### 1.3 Design tenets

1. **Campaign ID is the only permanent key.** Every relationship in this system anchors to Campaign ID. Names, clients, budgets — all mutable, all snapshotted, never trusted as a join key.
2. **Append-only, never overwrite.** A "correction" is a new record referencing the one it corrects, never an edit to the original.
3. **Snapshot everything relevant at the moment of change.** A record must be interpretable in isolation, years later, even if the campaign has been renamed, moved to a different client, or deleted from the master sheet entirely.
4. **Google Sheets is the database, on purpose.** This mirrors the rest of Saarthi's architecture (see `architecture.md`) — a Sheet is transparent, agency staff can eyeball it directly, and Apps Script already fills the "backend" role elsewhere in this project. The design below is written to survive Sheets' real limits (row/cell ceilings, no real transactions, no foreign keys) rather than pretend they don't exist.
5. **Built for thousands of campaigns, not tens.** Every UI and query pattern in this document assumes the History sheet will have tens of thousands of rows within a year and needs to stay fast and legible at that scale.

### 1.4 Module boundary

**In scope:** documenting a change, snapshotting campaign state, storing it immutably, viewing/searching/filtering history, a timeline view, reporting, and a forward-looking hook for AI analysis.

**Out of scope (for this design):** actually *making* the change on the ad platform (Google Ads/Meta Ads API calls) — this module documents that a change was made, it does not execute it. That keeps this module safe to build and ship independently of any platform-write integration, and keeps the audit trail trustworthy even for changes made directly in Google Ads Editor, Meta Ads Manager, or by a client's own team.

---

## 2. Architecture

### 2.1 Components

```
┌─────────────────────────────────────────────────────────────────┐
│                        SAARTHI PLATFORM                          │
│                                                                    │
│  ┌──────────────────────┐        ┌──────────────────────────┐   │
│  │  Campaign Master      │        │  Change History Sheet     │   │
│  │  Sheet (existing)     │───────▶│  (new, this module)       │   │
│  │  Source of truth for  │  read  │  Append-only audit ledger │   │
│  │  current campaign     │  only  │                            │   │
│  │  metadata             │        │                            │   │
│  └──────────────────────┘        └──────────────────────────┘   │
│           ▲                                   │  ▲                │
│           │ read                       write  │  │ read           │
│           │                                   ▼  │                │
│  ┌──────────────────────┐        ┌──────────────────────────┐   │
│  │  Change Documentation │        │  History Viewer            │   │
│  │  Form                 │        │  (table, filters, export)   │   │
│  └──────────────────────┘        └──────────────────────────┘   │
│                                                │                   │
│                                   ┌────────────┴────────────┐     │
│                                   │                          │     │
│                          ┌──────────────────┐    ┌──────────────────┐│
│                          │  Timeline View    │    │  Search & Filter ││
│                          └──────────────────┘    │  Module          ││
│                                                    └──────────────────┘│
│                                                │                   │
│                                   ┌────────────┴────────────┐     │
│                                   │  Reporting Layer         │     │
│                                   └────────────┬────────────┘     │
│                                                │                   │
│                                   ┌────────────┴────────────┐     │
│                                   │  Future AI Analysis Layer│     │
│                                   │  (read-only consumer)    │     │
│                                   └──────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Layer responsibilities

| Layer | Responsibility | Reads | Writes |
|---|---|---|---|
| Campaign Master Sheet | Source of truth for *current* campaign metadata | — | Managed outside this module |
| Change History Sheet | Permanent, append-only audit ledger | This module | This module only |
| Change Documentation Form | Capture a new optimization event | Campaign Master (lookup) | Change History (append) |
| History Viewer | Browse/inspect past changes | Change History | — |
| Search & Filter Module | Narrow the History Viewer's dataset | Change History | — |
| Timeline View | Chronological visualization per campaign/client | Change History | — |
| Reporting Layer | Aggregate views across many changes | Change History | — |
| Future AI Analysis Layer | Pattern detection, recommendations | Change History (read-only) | A separate AI-output sheet/table, never back into Change History |

### 2.3 Why Change History is a *separate* sheet, not new columns on Campaign Master

Campaign Master describes **current state** (one row per campaign, updated in place). Change History describes **events over time** (many rows per campaign, never updated in place). Mixing these into one sheet would force either destructive overwrites of history (unacceptable) or an unbounded number of columns per campaign (unworkable). Separating them is the same normalization principle as separating a "current balance" table from a "transaction ledger" in accounting software — and it is deliberate, not incidental.

### 2.4 Integration with Saarthi's existing multi-tenant model

Saarthi already models `Cluster → Team → Account → Channel` for dashboard access (see `PROJECT_SPEC.md` §2). This module sits one level below **Channel**: a Channel's Apps Script feeds performance data; the Change History Sheet for that same account/channel feeds *why the performance looks the way it does*. Access to this module should be scoped through the same account-level grant a user already holds — no separate grant system needed (see §14, Permissions Matrix).

---

## 3. Database Design

### 3.1 Why Google Sheets, deliberately

This is not a compromise — it's the right tool for this job, for the same reasons the rest of Saarthi uses Sheets as a data layer:
- **Transparency:** account managers and clients can open the sheet directly and see the raw ledger. An audit trail nobody can inspect without a login and a UI is a weaker audit trail.
- **Zero-friction authorship:** Apps Script already reads/writes Sheets throughout this project (`backend/apps_script/*.js`) — this module extends a pattern the team already operates, not a new one.
- **Good-enough scale:** Google Sheets comfortably holds hundreds of thousands of rows for a schema this width. The realistic failure mode (10M-cell ceiling, same limit already documented in `workflow.md` §7.2 Layer 5 for performance data) is years away even at "thousands of campaigns" scale — see §18 for the migration path when it does approach.

### 3.2 What a "database" means here

- **Table = Sheet tab.** Campaign Master is one tab; Change History is another (in its own dedicated Spreadsheet, not a tab bolted onto Campaign Master's spreadsheet — see §3.3).
- **Primary key = Change_ID** for the History sheet (one per row, immutable, generated at write time), **Campaign_ID** for Campaign Master.
- **No foreign key enforcement** exists natively in Sheets — this module enforces referential integrity at the *application layer* (the form + Apps Script), by validating Campaign_ID against Campaign Master before ever writing a row. See §10 (Validation Rules) and §12 (Error Handling).
- **No transactions.** Apps Script's sheet-append operations are effectively atomic per-row for this use case (a single `appendRow` call), which is sufficient — there is no multi-row write in this module's core flow. Bulk operations (see §18) will need explicit handling.

### 3.3 Physical layout recommendation

Put the Change History Sheet in **its own dedicated Google Spreadsheet**, separate from Campaign Master's spreadsheet — mirroring the existing project convention of one dedicated spreadsheet per data domain (Campaign Performance already lives in its own separate spreadsheet from the creative Daily_dump, per `PROJECT_SPEC.md` §3.2). Reasons:
- Independent sharing/permissions — an account manager can be granted access to the History sheet for their accounts without inheriting write access to Campaign Master.
- Independent scaling — History will grow far faster (many rows per campaign per optimization) than Campaign Master (one row per campaign).
- Independent backup/versioning cadence — Sheets' built-in version history becomes a meaningful safety net specifically for the audit ledger.

### 3.4 Scale assumptions driving this design

- Thousands of campaigns, agency-wide.
- Assume 5–20 documented changes per active campaign per month → tens of thousands of rows per year, agency-wide.
- The design must stay fast (filterable, sortable, exportable) at 100,000+ rows without redesign. This rules out "load everything into the UI and filter client-side" as the only strategy — see §8.3 for the pagination/query approach.

---

## 4. Google Sheet Schema

### 4.1 Campaign Master Sheet (existing — source of truth for current state)

This sheet already exists in Saarthi and is **not modified by this module** — it is read-only from this module's perspective. It answers "what is true about this campaign *right now*." Columns (as given):

| Column | Purpose |
|---|---|
| Campaign ID | **Permanent, immutable primary key.** Every other field on this row can change; this cannot. All Change History relationships anchor here, never to Campaign Name. |
| Campaign Name | Human-readable label. Mutable — clients rename campaigns, agencies restructure naming conventions. Never used as a lookup key. |
| Campaign Type | e.g. Search, Shopping, PMax, Display, Video, App, Demand Gen. |
| Client Name | The end client this campaign belongs to. Mutable if account ownership is restructured. |
| Account Name | The ad account (Google Ads/Meta account) the campaign lives under. |
| Campaign Status | Enabled / Paused / Removed / Ended. Current status only — history of status *changes* lives in Change History, not here. |
| Daily Budget | Current budget. Historical budget values live in Change History snapshots, never reconstructed from this field alone. |
| Bidding Strategy | Current strategy (Manual CPC, Target CPA, Target ROAS, Maximize Conversions, etc.). |
| Platform | Google Ads / Meta Ads / (future platforms). |
| Start Date / End Date | Campaign flight dates. |
| *(extensible)* | Any additional metadata the agency tracks — this module's design tolerates new Campaign Master columns without any schema change on its own side, since it only reads whatever columns exist via header-name lookup, not fixed column position (see §4.4). |

**Why it's the source of truth:** it is the only place "current state" is asked and answered. This module never infers current state from the History sheet (the *last* row for a campaign is not guaranteed to be "current" if a change was made directly on the platform without being documented) — Campaign Master is always queried fresh at the moment a new change is being documented (see §4.3, Dynamic Data Fetching).

### 4.2 Change History Sheet (new — the audit ledger)

**Purpose:** one immutable row per documented optimization event, ever. Never edited, never deleted, only appended to.

Full column list, in sheet order, each with rationale:

| # | Column | Data Type | Required? | Rationale |
|---|---|---|---|---|
| 1 | Change_ID | String (e.g. `CH-000001` or UUID) | Required, system-generated | The row's own permanent identity — needed so a specific record can be referenced (e.g. by a correction, by a report, by a future AI citation) independent of its row position, which can shift as rows are added. |
| 2 | Version_Number | Integer | Required, system-generated | Per-*campaign* sequence number (this is the Nth documented change to *this* Campaign_ID). Lets the UI say "Version 12 of Campaign X" the way Google Ads Editor shows change sequence, and lets users jump to "the change right before this one" without a date computation. |
| 3 | Timestamp | ISO 8601 datetime | Required, system-generated | *When the change was documented* (see Timestamp Logic, §4.5) — the backbone of every sort, filter, and timeline view. |
| 4 | Campaign_ID | String | Required, user-selected | The permanent foreign key into Campaign Master. **The single most important column in this schema.** |
| 5 | Campaign_Name | String | Required, auto-fetched | Snapshot at time of change — see §4.3. Preserves what the campaign was *called* at that moment, even if renamed since. |
| 6 | Campaign_Type | String | Required, auto-fetched | Snapshot — needed so filtering/reporting by campaign type reflects what type it was *then*, in case type is ever reclassified. |
| 7 | Client_Name | String | Required, auto-fetched | Snapshot — needed for client-level reporting even if the campaign is later reassigned to a different client. |
| 8 | Account_Name | String | Required, auto-fetched | Snapshot — same rationale as Client_Name. |
| 9 | Campaign_Status | String (Enabled/Paused/Removed/Ended) | Required, auto-fetched | Snapshot of status *at the moment of this change* — critical context (a budget change on a Paused campaign means something different than on an Enabled one). |
| 10 | Daily_Budget | Number (currency) | Required, auto-fetched | Snapshot — this is what makes "show me the budget history of Campaign X" possible by simply reading this column down the filtered rows, without recomputing from deltas. |
| 11 | Bidding_Strategy | String | Required, auto-fetched | Snapshot, same rationale as Daily_Budget. |
| 12 | Platform | String | Required, auto-fetched | Snapshot — relevant once a campaign could theoretically migrate platforms, and useful for platform-scoped reporting regardless. |
| 13 | Start_Date / End_Date | Date | Optional, auto-fetched | Snapshot of flight dates at time of change — useful context for schedule-related changes. |
| 14 | Change_Category | String (enum, see §6) | Required, user-selected | The standardized taxonomy bucket (Budget, Bid Strategy, Keywords, ...) — the primary dimension every report and filter groups by. |
| 15 | Change_Type | String (enum, dependent on Category, see §6) | Required, user-selected | The specific action within the category (e.g. under Budget: "Daily Budget Increased"). Enables reporting one level more granular than Category alone. |
| 16 | Previous_Value | String (freeform, but structured where possible) | Required unless Change_Type is additive-only (see §10) | What it was before. The core of "what changed." |
| 17 | New_Value | String (freeform, but structured where possible) | Required unless Change_Type is removal-only | What it is after. |
| 18 | Reason | Text (long-form) | Required | *Why* the change was made — this is what separates an audit log from a plain changelog. A changelog says what happened; this field says the agency's reasoning, which is what makes the record useful for future decisions. |
| 19 | Expected_Impact | Text (long-form) or structured dropdown + text | Optional but strongly encouraged | The hypothesis at the time of the change (e.g. "Expect CTR to improve 10-15% within 7 days"). This is the field that makes it possible to later ask "were we right?" — the seed of the AI layer's "change impact prediction" capability (§17). |
| 20 | Performed_By | String (user email) | Required, auto-filled from logged-in session | Who made the change — non-negotiable for any audit trail. |
| 21 | Notes | Text (long-form) | Optional | Anything not captured by the structured fields — free space for nuance. |
| 22 | Approval_Status | String (enum: Not Required / Pending / Approved / Rejected) | Required, defaults per Business Rules §11 | Supports agencies where certain change types or budget thresholds require sign-off before (or after) execution. |
| 23 | Approved_By | String (user email) | Conditionally required (see §10) | Who approved/rejected, if applicable. |
| 24 | Approval_Timestamp | ISO 8601 datetime | Conditionally required | When the approval decision was made — itself an immutable fact, never edited even if approval status is later reversed (a reversal is a *new* row, see §11). |
| 25 | Priority | String (enum: Low / Medium / High / Critical) | Required, defaults to Medium | Lets urgent optimizations (e.g. "campaign paused due to overspend") surface above routine tuning in views and reports. |
| 26 | Attachments | URL (Google Drive link) | Optional | Screenshot of the platform UI at time of change, a client email approving the change, etc. — stored as a Drive link, never as an embedded file (Sheets is not a file store). |
| 27 | Source | String (enum: Manual Entry / Bulk Import / Future API Sync) | Required, defaults to "Manual Entry" | Distinguishes human-documented changes from any future automated ingestion (e.g. a direct Google Ads API change feed) — critical so reporting can separate "we know because someone told us" from "we know because a system detected it." |
| 28 | Related_Change_ID | String (FK to another row's Change_ID) | Optional | Links a corrective/follow-up entry to the change it relates to (e.g. "reverted due to CH-004821") — enables a chain of related events without ever mutating the original row. |
| 29 | Device / Browser / IP_Address | String | Optional, auto-captured if available | Standard audit metadata (see §12, Audit Logic) — useful for security/compliance, not for day-to-day optimization review, so kept optional and visually de-emphasized in the UI. |
| 30 | Tags | String (comma-separated or multi-select) | Optional | Freeform labels for ad-hoc grouping the standardized taxonomy doesn't cover (e.g. "Q1-Push", "Client-Requested"). |

### 4.3 Campaign Snapshot — why it's stored, not just referenced

Every row above marked "auto-fetched" is a **snapshot**, not a live reference. This is the single most important data-design decision in this module.

**Why this matters:** if the History sheet only stored `Campaign_ID` and relied on joining to Campaign Master for name/client/budget/etc. at *view* time, then every historical record's displayed context would silently change whenever the campaign's current metadata changed. A campaign renamed from "Diwali Sale" to "Q4 Evergreen" would retroactively rewrite what every past change *appeared* to be about. An audit trail that can silently reinterpret its own past is not an audit trail — it is exactly the kind of thing this document's opening principle (§1.3) forbids.

Snapshotting also means a Change History row remains fully interpretable even if:
- The campaign is later deleted from Campaign Master entirely.
- The client relationship ends and the account is archived.
- The campaign is reassigned to a different account or client.

### 4.4 Dynamic Data Fetching — the lookup mechanism

**Workflow:**
1. User opens the Change Documentation Form and begins typing/selecting in the **Campaign ID** field (a searchable dropdown, see §9).
2. On selection, the form triggers a **read-only lookup** against Campaign Master, matched by exact `Campaign_ID` (never by name).
3. The lookup reads the Campaign Master header row once (cached per session) to map column *names* to column *positions* — this means Campaign Master can gain new columns over time without breaking this module, since the mapping is done by header text, not fixed column index.
4. All auto-fetched fields (§4.2, rows 5–13) populate immediately, are visually marked as **auto-filled and read-only** (see §9.6), and are locked from manual edit — the whole point of a snapshot is that it reflects the master sheet's actual state, not a value a user could accidentally mistype.
5. The snapshot values are held in the form's local state until submission — they are **not** written anywhere until the full form is submitted and validated (§10).

**Error handling for the lookup:**
- **Campaign ID not found in Campaign Master:** the form blocks progress past the Campaign ID field, shows an inline error ("Campaign ID not found in Campaign Master. Check the ID or contact your admin if this campaign should exist."), and does not allow auto-filled fields to populate with stale/blank data.
- **Campaign Master sheet temporarily unreachable (Apps Script timeout, quota, etc.):** the form shows a retry affordance ("Couldn't reach Campaign Master — Retry") rather than allowing the user to proceed with an unconfirmed snapshot. This module never writes a History row without a confirmed, fresh snapshot.
- **Campaign ID found, but a required Campaign Master field is blank** (e.g. Bidding Strategy left empty on the master row): the snapshot stores an explicit `Not Set` value rather than blank, so a later reader can distinguish "this field didn't exist yet" from "this field was fetched and happened to be empty."

### 4.5 Timestamp Logic

- `Timestamp` is **always** the moment the row is written (server-side, via Apps Script's own clock) — never a user-editable "effective date" field. This guarantees the audit trail's own chronology can never be manipulated after the fact.
- If a user needs to document a change that *actually happened* at an earlier real-world moment (e.g. documenting yesterday's emergency budget pause today), that goes in **Notes** as an explicit statement ("Change was made on the platform at approx 3pm on [date]; documented here after the fact") — the system timestamp still records when the *record* was created, and the narrative context lives in the text field. This preserves the immutability guarantee: the timestamp column always means one thing, unconditionally.

### 4.6 Status Handling

`Campaign_Status` in the History row is a **snapshot**, never edited after write. If the same campaign's status changes again later, that is a *new* row with `Change_Category = Campaign Settings`, `Change_Type = Status Changed`, `Previous_Value = Enabled`, `New_Value = Paused` (for example) — the status *transition itself* is data, not metadata.

### 4.7 Budget Snapshot

`Daily_Budget` at the row level is what the budget *was* at the time of that specific change (fetched fresh from Campaign Master at documentation time), **distinct from** `Previous_Value`/`New_Value` when `Change_Category = Budget` (which describe the budget change itself, e.g. Previous_Value = "₹5,000", New_Value = "₹7,500"). This dual representation is intentional: the snapshot column lets you filter "show me all changes made while this campaign's budget was above ₹10,000" regardless of category, while Previous/New Value lets you reconstruct the actual budget change history by filtering to `Change_Category = Budget` alone.

### 4.8 Org_Secrets-style Access Pattern (Apps Script URL)

Consistent with the rest of Saarthi (`backend/org_data/org_secrets.json`), the Change History Sheet's Apps Script Web App URL is a **per-account secret**, not a global constant — each account/client's History Sheet can be a physically separate spreadsheet if the agency wants hard data isolation between clients, or a shared spreadsheet filtered by `Client_Name`/`Account_Name` if not. This is a deployment decision, not a schema decision — the column design above works either way.

---

## 5. Data Relationships

```
Campaign Master Sheet                Change History Sheet
┌─────────────────┐                  ┌──────────────────────┐
│ Campaign_ID (PK) │◀────────────────│ Campaign_ID (FK)      │
│ Campaign_Name    │   1        many │ Change_ID (PK)        │
│ Campaign_Type    │                 │ Version_Number        │
│ Client_Name       │                 │ Timestamp             │
│ Account_Name      │                 │ ...snapshot columns   │
│ Campaign_Status   │                 │ Change_Category       │
│ Daily_Budget      │                 │ Change_Type           │
│ Bidding_Strategy  │                 │ Previous/New Value    │
│ Platform          │                 │ Related_Change_ID (FK │
│ Start/End Date    │                 │   → another row's     │
└─────────────────┘                 │   Change_ID, optional) │
                                      └──────────────────────┘
```

- **Campaign Master → Change History:** one-to-many, via `Campaign_ID`. Read at documentation time only (§4.4) — never re-joined at view time, because the whole point is that History rows are self-contained snapshots (§4.3).
- **Change History → Change History (self-referential):** `Related_Change_ID` allows one row to reference another (e.g. a revert references the change it reverted), forming an optional chain without ever requiring an edit to the referenced row.
- **User → Change History:** `Performed_By` and `Approved_By` reference user identities (email), resolved against Saarthi's existing auth/access model (`backend/org_access.py`) — no separate user table needed for this module.
- **No relationship is ever enforced by deleting or blocking on the Change History side.** If a Campaign_ID is later removed from Campaign Master, its History rows remain exactly as they are — they are historical facts about a campaign that existed, not a live reference that must resolve.

---

## 6. Change Categories & Standardized Change Types

A fixed, agency-wide taxonomy is what makes cross-campaign, cross-client reporting possible (§16). Change_Type dropdown options are **dependent on** the selected Change_Category (a two-level dropdown, see §9.3).

| Category | Standardized Change Types |
|---|---|
| **Budget** | Daily Budget Increased · Daily Budget Decreased · Budget Pacing Method Changed · Shared Budget Assigned · Shared Budget Removed · Campaign Budget Removed/Paused |
| **Bid Strategy** | Strategy Changed (e.g. Manual CPC → Target CPA) · Target CPA Updated · Target ROAS Updated · Max CPC Updated · Bid Adjustment Added · Bid Adjustment Removed |
| **Keywords** | Keyword Added · Keyword Removed · Match Type Changed · Keyword Bid Updated · Keyword Paused · Keyword Enabled |
| **Negative Keywords** | Negative Keyword Added · Negative Keyword Removed · Negative Keyword List Applied · Negative Keyword List Removed |
| **Audience** | Audience Added · Audience Removed · Audience Bid Adjustment Changed · Targeting Setting Changed (Observation ↔ Targeting) |
| **Placements** | Placement Added · Placement Excluded · Placement Bid Adjustment Changed |
| **Geo** | Location Added · Location Excluded · Location Bid Adjustment Changed · Location Targeting Setting Changed (Presence ↔ Interest) |
| **Devices** | Device Bid Adjustment Changed · Device Excluded |
| **Ads** | Ad Created · Ad Paused · Ad Enabled · Ad Removed · Ad Copy Updated |
| **Assets** | Asset Added · Asset Removed · Asset Updated (Sitelinks/Callouts/Images/Structured Snippets) |
| **Extensions** | Extension Added · Extension Removed · Extension Updated |
| **Labels** | Label Applied · Label Removed |
| **Campaign Settings** | Campaign Renamed · Network Setting Changed · Ad Rotation Setting Changed · URL Options Changed · Status Changed (Enabled/Paused/Removed) |
| **Tracking** | Tracking Template Updated · UTM Parameters Updated · Third-Party Tracking Linked |
| **Conversion** | Conversion Action Added · Conversion Action Removed · Conversion Goal Changed · Attribution Model Changed |
| **Schedule** | Ad Schedule Added · Ad Schedule Removed · Dayparting Updated |
| **Creative** | New Creative Uploaded · Creative Replaced · Creative Paused |
| **Feed** | Feed Updated · Feed Rule Added · Feed Item Issue Resolved |
| **Merchant Center** | Product Feed Synced · Product Disapproval Resolved · Merchant Center Account Linked |
| **Performance Max Assets** | Asset Group Created · Asset Group Updated · Audience Signal Updated · Listing Group Updated |
| **App Campaign** | App Asset Updated · App Campaign Goal Changed |
| **Shopping** | Product Group Updated · Priority Changed · Shopping Feed Linked |
| **Video** | Video Ad Added · Video Creative Updated · Skippable Setting Changed |
| **Demand Gen** | Demand Gen Asset Updated · Demand Gen Audience Updated |
| **Custom Changes** | Custom/Uncategorized Change — **mandatory free-text description required** (see §10) since no standardized Change_Type applies |
| **Others** | Catch-all for anything genuinely outside the above — same mandatory free-text requirement as Custom Changes |

**Governance:** this taxonomy is expected to grow. New Change_Types can be added to an existing Category without any schema change (they're dropdown *options*, not columns) — see §18 for how the taxonomy itself should be versioned/reviewed periodically rather than edited ad hoc by any user.

---

## 7. User Flow Diagrams

### 7.1 Primary flow — documenting a change

```
User opens Change Documentation Form
        ↓
User searches/selects Campaign ID
        ↓
System fetches live snapshot from Campaign Master
        ↓
   ┌─────────────┐        ┌──────────────────────────┐
   │ Found?  No   │───────▶│ Show inline error,        │
   └─────────────┘        │ block further input        │
        │ Yes              └──────────────────────────┘
        ↓
Auto-filled fields populate (read-only)
        ↓
User selects Change_Category → Change_Type
        ↓
User enters Previous_Value / New_Value / Reason / (optional fields)
        ↓
User submits
        ↓
Client-side validation (§10)
        ↓
   ┌─────────────┐        ┌──────────────────────────┐
   │ Valid?  No   │───────▶│ Inline field errors shown, │
   └─────────────┘        │ submission blocked          │
        │ Yes              └──────────────────────────┘
        ↓
Confirmation dialog ("Review your change before saving — this cannot be edited later")
        ↓
User confirms
        ↓
System generates Change_ID + Version_Number, appends new row to Change History Sheet
        ↓
History Viewer refreshes (if open elsewhere) / cache invalidated
        ↓
Success message + option to "Document another change" or "View this campaign's history"
```

### 7.2 Secondary flow — reviewing history

```
User opens History Viewer
        ↓
Default view: most recent changes, all campaigns user has access to
        ↓
User applies filters (Campaign / Client / Category / Date range / etc.)
        ↓
Table updates (server-side filtered query, not client-side over the full dataset — see §8.3)
        ↓
User can: expand a row for full detail → switch to Timeline View for that campaign
                                       → export current filtered view (CSV/Excel/PDF)
```

### 7.3 Approval flow (where applicable — see §11 for when approval is required)

```
Change documented, Approval_Status = "Pending"
        ↓
Approver notified (in-app; email notification is a future enhancement, §18)
        ↓
Approver opens the pending record in the History Viewer
        ↓
   ┌─────────────┐        ┌──────────────────────────┐
   │ Approve      │───────▶│ New row's Approval_Status  │
   └─────────────┘        │ set at write time; if the  │
                            │ approver disagrees, they    │
   ┌─────────────┐        │ do NOT edit the original —  │
   │ Reject       │───────▶│ Approval_Status = Rejected, │
   └─────────────┘        │ Approved_By/Timestamp set,   │
                            │ original Previous/New Value │
                            │ untouched (§11)              │
                            └──────────────────────────┘
```

---

## 8. Screen-by-Screen UI Design

### 8.1 Change Documentation Form (primary entry screen)

- **Layout:** single-column, vertically scannable form inside a focused modal or dedicated page (not a dense multi-column form — this is a "fill this out carefully" moment, not a data table).
- **Sections, top to bottom:**
  1. **Campaign Identification** — Campaign ID search field (only interactive field at first; everything below is disabled/hidden until a valid campaign is selected).
  2. **Campaign Snapshot** (read-only, collapsed-by-default card showing the auto-fetched fields — expandable, visually distinct background so it reads as "reference info," not "things you fill in").
  3. **Change Details** — Change_Category → Change_Type (dependent dropdowns) → Previous_Value / New_Value.
  4. **Rationale** — Reason (required), Expected_Impact (optional but prompted), Notes (optional).
  5. **Metadata** — Priority, Attachments, Tags. Performed_By shown but disabled (auto-filled from session).
  6. **Approval** (only shown if the Business Rules in §11 determine this change type/threshold requires approval) — Approval_Status defaults to "Pending," disabled for the submitter (only an Approver role can change this, and only via the History Viewer, not this form).
- **Primary action:** "Save Change Record" button, disabled until required fields are valid.
- **Secondary action:** "Cancel" — discards the in-progress (unsaved) entry with a confirm-discard prompt if any field has been touched.

### 8.2 History Viewer (primary browsing screen)

- **Layout:** dense, information-rich data table — this is the "Jira issue history" register, optimized for scanning many rows quickly, not for showcasing any single row.
- **Default columns shown:** Timestamp, Campaign Name, Client, Change Category, Change Type, Performed By, Priority (badge), Approval Status (badge). Every other column is available via a column picker but hidden by default to keep density manageable.
- **Row interaction:** clicking a row expands it in place (accordion-style) to reveal the full record — Previous/New Value, Reason, Expected Impact, Notes, Attachments — without navigating away from the table's scroll position.
- **Toolbar:** Search & Filter Module (§10 in the user's brief / §9 below), column picker, export menu (CSV/Excel/PDF/Print), "Group by" control (Campaign / Client / Category / Date).
- **Color coding:** Priority badges (Low = neutral gray, Medium = blue, High = amber, Critical = red); Approval Status badges (Not Required = gray, Pending = amber, Approved = green, Rejected = red).

### 8.3 Pagination & performance at scale

Given the "thousands of campaigns" scale target (§3.4), the History Viewer must query the Change History Sheet **server-side filtered and paginated** (via Apps Script, mirroring the existing `?start=&end=` query-param pattern already used for performance data in this project) — never load the entire sheet client-side and filter in the browser. Default page size: 50 rows, with "load more"/infinite-scroll rather than numbered pages, since most usage is "scan recent activity," not "jump to page 40."

### 8.4 Timeline View

- **Layout:** vertical timeline, most recent at top, one entry per documented change for the selected scope (a single campaign, or all campaigns for a client).
- **Entry design:** date on the left rail, a compact card on the right showing Change_Category icon + Change_Type label + one-line summary (auto-composed from Previous_Value → New_Value where both are short/structured; falls back to the first line of Reason if not). Clicking a card expands it inline to the full record, same as the History Viewer's row expansion, so the two views share one detail component (§8.5).
- **Grouping:** entries on the same calendar day cluster under one date heading rather than repeating the date per entry — matches the visual density of the user's own example (`12 Jan → Budget Increased`, `14 Jan → Negative Keywords Added`, etc.).
- **Use case this view optimizes for:** "what happened to this campaign, and in what order, over its whole life" — a fundamentally different reading mode than the History Viewer's table (which optimizes for cross-campaign scanning/filtering).

### 8.5 Shared detail component

Both the History Viewer's expanded row and the Timeline View's expanded card render the **same underlying "Change Detail" component** — one implementation, two entry points. This avoids the two views drifting out of sync as fields are added later.

---

## 9. Component Specifications

### 9.1 Campaign ID Selector
- Type-ahead search, searchable by Campaign ID *or* Campaign Name (name search is a convenience lookup only — the underlying value stored and used for the fetch is always Campaign ID).
- Shows Campaign Name + Client Name in the results list so a user searching "Diwali" can visually confirm they've picked the right campaign before committing.
- Debounced search (300ms) against Campaign Master, not a full client-side load of every campaign — same server-side-query principle as §8.3, since Campaign Master itself may hold thousands of rows.

### 9.2 Campaign Snapshot Card
- Read-only, visually distinct (subtle background tint, no input borders) so it never looks editable.
- Shows all auto-fetched fields (§4.2) in a compact key-value grid.
- Includes a small "Refresh snapshot" affordance — if the user pauses on the form long enough that Campaign Master might have changed underneath them, they can re-fetch before submitting rather than submit a stale snapshot.

### 9.3 Change_Category → Change_Type Dependent Dropdown
- Change_Category is a single-select dropdown of the fixed taxonomy (§6).
- Change_Type is disabled until a Category is chosen, then populates with only that Category's Change_Types.
- Selecting "Custom Changes" or "Others" as the Category reveals a mandatory free-text "Describe this change" field in place of a Change_Type dropdown.

### 9.4 Previous_Value / New_Value Fields
- Rendered as plain text fields by default (since values span currency, strategy names, keyword lists, etc. — too heterogeneous for one structured input type).
- Where the Change_Type is unambiguous about data type (e.g. "Daily Budget Increased"), the field switches to a currency-formatted numeric input automatically, to reduce free-text inconsistency in the most commonly reported category (Budget) — this directly serves the Reporting layer (§16), which needs Budget values to be numerically comparable, not just textually logged.

### 9.5 Priority Selector
- Segmented control (Low / Medium / High / Critical), not a dropdown — it's a single, frequently-set field, and a segmented control makes the current selection glanceable without opening a menu.

### 9.6 Auto-filled / Disabled Field Treatment
- Any field populated automatically (Campaign Snapshot fields, Performed_By, Timestamp, Version_Number) is rendered with a locked-field visual treatment (muted background, a small lock icon) and is never focusable/editable — this is a hard rule, not just a UI convention, since these fields are what make the audit trail trustworthy (§1.3, §4.3).

---

## 9. Form Specifications
*(See §8.1 for layout; this section covers field-by-field mechanics.)*

| Field | Type | Required | Auto-filled | Notes |
|---|---|---|---|---|
| Campaign ID | Searchable select | Yes | No (user-selected) | Triggers the snapshot fetch |
| Campaign Snapshot fields (9) | Read-only display | N/A | Yes | Never editable |
| Change_Category | Select | Yes | No | Drives Change_Type options |
| Change_Type | Select (dependent) | Yes | No | "Custom"/"Others" swap this for free text |
| Previous_Value | Text / currency | Conditionally (see §10) | No | |
| New_Value | Text / currency | Conditionally (see §10) | No | |
| Reason | Long text | Yes | No | Minimum length enforced (§10) |
| Expected_Impact | Long text | No | No | Prompted with placeholder text, not forced |
| Performed_By | Display only | Yes | Yes (session) | Never editable |
| Notes | Long text | No | No | |
| Priority | Segmented control | Yes | Defaults to Medium | |
| Attachments | URL/Drive picker | No | No | Validated as a URL if present |
| Tags | Multi-select/free entry | No | No | |
| Approval fields | Conditional section | Conditional | Partially | Only rendered when Business Rules require it (§11) |

**Buttons:** "Save Change Record" (primary), "Cancel" (secondary, ghost style). No "Save as Draft" — see §11 for why (an undocumented change is simply not yet in the system; there is no partial/draft state in an audit ledger, to avoid ambiguity about whether a "draft" row is a real record).

**Success message:** a toast/banner confirming "Change recorded — Version {N} for {Campaign Name}," with two quick actions: "Document another change" and "View history for this campaign."

**Confirmation dialog:** shown before the final write, summarizing the record about to be created, with explicit copy: "This record cannot be edited or deleted after saving. Review carefully." This is the single most important UX moment in the form — it's the last chance to catch a mistake before it becomes a permanent fact.

---

## 10. Validation Rules

| Field | Rule |
|---|---|
| Campaign ID | Must exist in Campaign Master at submission time (re-validated, not just at selection time, in case of a long idle gap — see Edge Cases §13). |
| Change_Category | Must be one of the fixed taxonomy values (§6) — not freeform, to protect reporting integrity. |
| Change_Type | Must belong to the selected Category, unless Category is Custom Changes/Others. |
| Previous_Value / New_Value | At least one of the two is required for every Change_Type **except** those that are inherently additive (e.g. "Keyword Added" has no meaningful Previous_Value) or removal-only (e.g. "Keyword Removed" has no meaningful New_Value) — the form's required-field logic is Change_Type-aware, not a blanket "both required." |
| Reason | Required, minimum 10 characters — long enough to discourage a meaningless placeholder like "opt" but not so long it becomes a burden for routine changes. |
| Priority | Required, defaults to Medium if untouched. |
| Attachments | If provided, must be a valid URL; recommended (not enforced) to be a Google Drive link for consistency. |
| Approval fields | If the Business Rules (§11) mark this Change_Type/threshold as requiring approval, the record is written with `Approval_Status = Pending` and cannot be marked Approved/Rejected by the same user who authored it (self-approval is blocked at the permission layer, §14). |

---

## 11. Business Rules

1. **Every write is an append. No update, no delete, ever — at the application layer.** (Google Sheets itself technically allows row edits; this module's UI and Apps Script layer simply never expose or perform one. See §15 for how this is enforced in practice.)
2. **A correction to a past record is a new record**, with `Related_Change_ID` pointing at the row being corrected and `Notes` explaining the correction. The original row is never touched.
3. **Approval requirement is determined by Change_Category + a configurable threshold**, not hardcoded per category — e.g. an agency might require approval for any Budget change above a set percentage delta, or for any change to a Critical-priority campaign, regardless of category. This threshold configuration is itself agency-level settings, not per-user, and should live in a small config sheet/table (out of scope for this document's schema, but flagged here as a dependency).
4. **A user cannot approve their own submitted change** — approval requires a second person, enforced at the permission layer (§14).
5. **Version_Number is per-Campaign_ID, not global** — the 1st documented change to any campaign is always Version 1 for that campaign, regardless of how many other changes exist agency-wide.
6. **The Campaign Snapshot is always fetched fresh at submission time**, not reused from an earlier point in the session, to avoid a stale snapshot if the user leaves the form open for a long time while Campaign Master changes underneath them.
7. **Custom Changes / Others require a mandatory description** — the taxonomy is a living but curated list (§6, §18); anything that doesn't fit yet must still be captured with enough detail to potentially be reclassified later, rather than lost in an ambiguous "Other" bucket.

---

## 12. Error Handling

| Scenario | Handling |
|---|---|
| Campaign ID not found in Campaign Master | Inline error at the field, form blocked from proceeding, no auto-filled fields populate. |
| Campaign Master unreachable (Apps Script timeout/quota) | Retry affordance shown; form does not allow submission with an unconfirmed/stale snapshot. |
| Network failure during final submission | The write is treated as **not confirmed** until the Apps Script response is received; the form shows "Couldn't save — check your connection and try again," and does **not** locally fabricate a success state. If the Apps Script append actually succeeded server-side but the response was lost in transit, the next successful read of History for that campaign will show the record — the design accepts this small "did it save?" ambiguity window rather than risk a duplicate row from blind retry logic. |
| Duplicate submission (double-click / accidental resubmit) | The Save button disables immediately on first click, re-enabling only on error; combined with the network-failure handling above, this makes duplicate rows a rare, not systemic, risk. |
| Malformed/unexpected data in a Campaign Master column (e.g. Daily Budget contains text, not a number) | The snapshot stores the raw value as text with a small warning indicator in the Snapshot Card, rather than failing the whole fetch — an audit tool should degrade gracefully, not block someone from documenting an urgent change because of an unrelated data-quality issue elsewhere. |
| Sheet-level quota/rate limit hit (Apps Script) | Same retry-affordance pattern as above; the user is never shown a raw script error message — always a plain-language equivalent. |

---

## 13. Edge Cases

- **Campaign is renamed *while* a change is being documented for it.** The snapshot taken at fetch time is what's stored — this is correct behavior, not a bug, per §4.3.
- **Campaign is deleted from Campaign Master after changes have been documented against it.** History rows remain fully valid and readable (they never re-join to Campaign Master after write) — the History Viewer should still show these rows, clearly, rather than hide them because the "live" campaign no longer resolves.
- **Two people document changes to the same campaign at nearly the same moment.** Because writes are appends (not position-dependent updates), this is inherently safe — both rows are written, each gets its own Change_ID and the next available Version_Number in sequence as Apps Script processes them; no lock is required for this specific operation shape.
- **A change is documented for a date in the past that the agency only just discovered was undocumented** (a "backfill"). Handled per §4.5 — the system Timestamp is still "now," with the real-world timing explained in Notes. The design deliberately does not offer a user-editable timestamp, even for this case, to avoid opening a door to timestamp manipulation.
- **Approval is requested, but the approver never acts.** The record still exists and is fully visible in History with `Approval_Status = Pending` indefinitely — a pending approval is not a blocking state for visibility, only (optionally, per agency policy, out of scope here) a blocking state for whatever downstream action depends on approval.
- **A Change_Type is later deprecated from the taxonomy (§6, §18 governance).** Historical rows referencing it are never rewritten — the taxonomy dropdown simply stops offering it for *new* entries. Reporting must tolerate "orphaned" historical Change_Type values gracefully (group them under their original label, don't error).
- **Bulk documentation need** (e.g. an agency migrating from spreadsheet-based tracking and wanting to backfill hundreds of historical changes at once). Not supported by the single-record form — flagged explicitly in §18 as a future bulk-import tool, kept separate from the core single-entry flow so the primary form stays simple.

---

## 14. Permissions Matrix

| Action | Admin | Manager | Account Manager | Approver | Viewer |
|---|---|---|---|---|---|
| Read (History Viewer, Timeline, Reports) | ✅ | ✅ (scoped to their accounts) | ✅ (scoped to their accounts) | ✅ (scoped to their accounts) | ✅ (scoped to their accounts) |
| Write (document a new change) | ✅ | ✅ | ✅ | ✅ | ❌ |
| Edit an existing record | ❌ | ❌ | ❌ | ❌ | ❌ |
| Delete a record | ❌ | ❌ | ❌ | ❌ | ❌ |
| Approve / Reject a pending change | ✅ | ✅ (if not the submitter) | ❌ | ✅ (if not the submitter) | ❌ |
| Export (CSV/Excel/PDF) | ✅ | ✅ | ✅ (scoped) | ✅ (scoped) | ✅ (scoped, if agency allows) |
| Manage taxonomy (Change Categories/Types) | ✅ | ❌ | ❌ | ❌ | ❌ |
| Configure approval thresholds | ✅ | ❌ | ❌ | ❌ | ❌ |

**No role has Edit or Delete on a written record — this is absolute, not configurable per-role**, because it is the foundational guarantee of the entire module (§1.3, §11). If a genuine correction is needed, every role capable of Write can create a correcting record (§11 rule 2); nothing needs Edit/Delete for that.

**Scoping mechanism:** identical to Saarthi's existing access model — a user's grants (`account_head`/`team_head`/`cluster_head`/`super_admin` in `backend/org_access.py`) determine which accounts' Change History they can see, exactly as those same grants already determine which dashboards they can see. No parallel permission system needed.

---

## 15. Audit Logic

### 15.1 What makes a record trustworthy

Every row captures, at minimum: **Timestamp, Performed_By, Previous_Value, New_Value, Reason, Change_ID (unique), Version_Number (per-campaign sequence)**. Optionally: Device, Browser, IP_Address, Approval chain.

### 15.2 How immutability is actually enforced (not just a policy)

Google Sheets does not have row-level write-protection that distinguishes "append" from "edit" natively. Immutability here is enforced at three layers, in order of strength:
1. **Application layer (primary defense):** the UI never exposes an edit affordance for a written record — there is no "Edit" button anywhere in the History Viewer or Timeline View, by design.
2. **Apps Script layer:** the Web App backing this module only exposes an `appendRow`-style write action; it has no update-by-row or delete-by-row endpoint at all — so even a determined user going around the UI (e.g. crafting a raw request) has no server-side operation available to mutate an existing row.
3. **Sheet-level protection (defense in depth):** the underlying Google Sheet itself should have a protected range covering all rows below the header, restricted to the Apps Script's own service identity — a human editor opening the raw Sheet directly cannot edit or delete existing rows even with sheet access, only view them. New rows appended by the script are, by definition, outside any protected *existing* range at the time they're protected, so this does not block legitimate appends.

### 15.3 Change_ID and Version_Number generation

- **Change_ID:** generated by the Apps Script at write time, using a monotonically-safe scheme (e.g. `CH-` + zero-padded row-independent counter stored in a script property, or a UUID) — never derived from row position, since row position is not a stable identity in a sheet that could theoretically be manually inspected/sorted (even though the UI never does so).
- **Version_Number:** computed as `(count of existing rows for this Campaign_ID) + 1` at write time, inside the same write operation, to avoid a race where two near-simultaneous writes for the same campaign both compute the same next version number.

### 15.4 Source field's role in audit integrity

`Source = Manual Entry` today for every row (this module has no automated write path yet). This field exists now specifically so that **when** an automated source is added later (e.g. a direct Google Ads API "change event" feed), reporting and AI analysis can immediately distinguish machine-detected changes from agency-documented ones, without needing to retrofit the schema at that point.

---

## 16. Reporting Design

All reports below are read-only aggregations over Change History — none require any new write path.

| Report | What it answers | Primary grouping |
|---|---|---|
| Most Changed Campaigns | Which campaigns get optimized most (or least) frequently — surfaces both over-tinkering and neglect | Campaign_ID, count of rows |
| Budget Changes | All budget movements, agency-wide or scoped to a client | Change_Category = Budget, time-ordered |
| Status Changes | Every Enable/Pause/Remove transition | Change_Type within Campaign Settings |
| Optimization Frequency | Changes per campaign per week/month — a health signal (too low = neglect, unusually high = thrashing) | Campaign_ID × time bucket |
| Changes by User | Individual and team activity/workload | Performed_By |
| Changes by Client | Client-level activity, useful for client-facing "here's what we did this month" reporting | Client_Name |
| Weekly / Monthly Reports | Rollup digest of the above, scheduled | Time bucket |
| Audit Reports | Full, unfiltered export for compliance/client review | All columns, all rows in scope |
| Executive Summary | Top-line counts + notable Critical-priority or High-impact changes | Priority, Change_Category |

**Design principle:** every report is a **filtered/grouped view of the same underlying table**, not a separately-maintained rollup sheet — this avoids a second source of truth drifting out of sync with the ledger itself. Where performance matters at scale (§3.4), pre-computed summary caches are an acceptable *optimization*, but the raw Change History rows remain the only authoritative source.

---

## 17. AI Integration Strategy

This module is designed so that a future AI layer is a **pure read-only consumer** of Change History — it never writes back into the audit ledger itself (any AI-generated insight is its own separate output, e.g. a "Recommendations" sheet/table, never a modification to a historical record).

| Future capability | How this schema enables it |
|---|---|
| Root Cause Analysis | Correlate a performance dip/spike (from the existing performance dashboards) against Change History rows in the preceding window for the same Campaign_ID — the Timestamp + Campaign_ID pairing is exactly what's needed to join the two datasets. |
| Optimization Recommendations | Pattern-match "changes that historically preceded a positive Expected_Impact outcome" for similar Change_Type/Category combinations. |
| Pattern Detection / Repeated Mistakes | Detect recurring Change_Type sequences that historically preceded negative outcomes (e.g. "aggressive budget cuts followed by a CPA spike," repeated across multiple campaigns). |
| Successful Optimizations (knowledge base) | Surface historical Reason + Expected_Impact + actual-outcome triples as reusable "playbook" entries, filterable by Change_Category/Campaign_Type/Client industry. |
| Budget / Bid Strategy Recommendation | Use the Daily_Budget/Bidding_Strategy snapshot history as a time series input, alongside Previous/New Value deltas. |
| Campaign Health Timeline | A blended visualization overlaying performance metrics with Change History events on one timeline — a natural extension of the Timeline View (§8.4), which already renders events chronologically. |
| Change Impact Prediction | Directly enabled by the Expected_Impact field (§4.2, row 19) — a prediction model's most valuable training signal is exactly "what did the agency expect, and what actually happened." |
| Historical Similarity Search | Requires embedding Reason/Notes text — feasible without any schema change, since these are already plain long-text fields. |

**Architectural note:** because Change_ID is a stable, permanent identifier (§15.3), any AI-generated insight can cite the exact record(s) it's based on, which is what makes an AI recommendation *auditable itself* — a recommendation that says "because of CH-004821" is trustworthy in a way that "because of a pattern we detected" alone is not.

---

## 18. Future Enhancements

- **Bulk import tool** for backfilling historical changes when an agency migrates from spreadsheet/Slack-based tracking (kept deliberately separate from the core single-record form, §13).
- **Email/Slack notifications** for pending approvals and Critical-priority changes.
- **Configurable approval-threshold settings UI** (currently assumed to live in a small config sheet, §11 rule 3 — worth a dedicated settings screen once thresholds get numerous).
- **Direct platform API change-event ingestion** (Google Ads/Meta Ads native change history APIs), written with `Source = API Sync` — closes the gap where a change was made directly on the platform and never manually documented. This is exactly what the `Source` column (§15.4) was designed in advance to support.
- **Taxonomy governance workflow** — a lightweight review process (Admin-only, §14) for adding new Change_Types to the fixed taxonomy (§6) as agency practices evolve, rather than ad hoc.
- **Sheets → BigQuery migration path** once row counts approach the practical ceiling — same pattern already documented for performance data in `workflow.md` §7.2 Layer 5, reusable here without any change to the logical schema above.
- **Cross-module linking** — a Change History row referencing the specific performance-dashboard date range it was meant to influence, tightening the Root Cause Analysis capability in §17.

---

## 19. Implementation Recommendations

1. **Build the Change History Sheet and its Apps Script Web App first**, independent of the frontend — mirroring this project's existing pattern of a well-defined Apps Script contract (`doGet`-style read + a dedicated append-only write action) before any UI is built against it.
2. **Reuse the existing channel-aware backend pattern** (`backend/apps_script_connector.py`, `backend/org_access.py`) rather than inventing a parallel data-access approach — this module's Apps Script Web App URL(s) should live in `org_data/org_secrets.json` alongside the existing performance-data URLs, scoped per account.
3. **Build the Change Documentation Form before the History Viewer.** Nothing to view without something to write first, and the form's validation/snapshot logic is the foundation the Viewer and Timeline both depend on for data integrity.
4. **Enforce immutability at the Apps Script layer from day one** (§15.2) — do not ship an "append-only by UI convention alone" version and add server-side enforcement later; the trustworthiness of every record written before that point would otherwise be retroactively weaker.
5. **Ship the fixed taxonomy (§6) as configuration, not hardcoded UI options**, so it can be extended (§18) without a frontend deployment.
6. **Defer the AI layer entirely** until there is a meaningful volume of real Change History data to learn from — building it early against sparse/synthetic data risks anchoring the design to the wrong patterns.

---

## 20. Best Practices

- **Never let "fast to document" and "safe to trust" trade off against each other.** Every UX simplification in this design (defaults, auto-fill, segmented controls) is aimed at *reducing friction to document a change accurately*, not at reducing the rigor of what's captured.
- **Snapshot first, ask questions later.** When in doubt about whether a field should be a live reference or a stored snapshot, snapshot it (§4.3) — a slightly larger row is a far smaller cost than a historical record that can silently reinterpret itself.
- **Every report and every AI capability should be explainable by pointing at specific rows.** If a future feature can't cite the Change_IDs behind its output, it's built on the wrong foundation for an audit product.
- **Treat the taxonomy (§6) as a living but curated asset**, not something any individual user edits ad hoc — inconsistent categorization is the single fastest way to make agency-wide reporting worthless.
- **Design every screen assuming thousands of rows are already in the sheet**, not tens — retrofitting pagination/server-side filtering after a UI is built "small" is far more expensive than building it in from the start (§3.4, §8.3).
- **Keep this module read-only with respect to the ad platforms themselves.** It documents that a change happened; it does not make the change. That boundary keeps the audit trail trustworthy even for changes made outside Saarthi entirely, and keeps this module shippable without waiting on any platform-write integration.
