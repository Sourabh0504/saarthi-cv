// ============================================================
// CampaignPerformance — Apps Script Web App
// ============================================================
// PURPOSE:
//   Serves raw campaign-level daily performance data to the
//   CreativeVisibility backend (/api/campaign-raw-performance).
//
// WHY A SEPARATE SHEET?
//   Creative-level data (Daily_dump) only captures spend on assets
//   (images / videos). Google Ads also runs spend through:
//     - Pull-based inventory (Smart Campaigns, DSA)
//     - Google Maps ads
//     - Search / Display campaigns with no creative attachment
//   These will NEVER appear in Daily_dump. This sheet captures the
//   TRUE campaign/ad group spend picture regardless of creative type.
//
// REQUIRED SHEET TAB:
//   "CampaignPerf" — one row per ad group per day.
//
// COLUMN SCHEMA (exact names, case-insensitive):
//   Date           | YYYY-MM-DD or Google Date serial
//   Campaign       | Campaign name string
//   Campaign_Type  | PMax | Search | DGen | Maps | Display | Shopping
//   Ad_Group       | Ad group / asset group name
//   Network        | Search | Maps | Display | YouTube | Cross-network
//   Location       | City name (e.g. Mumbai, Delhi)
//   Funnel         | TOFU | MOFU
//   Impressions    | Number
//   Clicks         | Number
//   Cost           | Number (in ₹, no currency symbol)
//   Conversions    | Number
//   All_Conv       | Number (fallback for conversions)
//
// CACHING:
//   Two-layer cache (same pattern as doGet.js):
//     Layer 1: Apps Script CacheService (20-min TTL, chunked raw JSON)
//     Layer 2: Python FastAPI TTLCache (30-min TTL)
//   No ScriptProperties — payload is too large.
//
// DEPLOYMENT SETTINGS:
//   Execute as: Me (your Google account)
//   Who has access: Anyone
//
// HOW TO DEPLOY:
//   1. Open the CampaignPerformance Google Spreadsheet.
//   2. Extensions → Apps Script → paste this entire file.
//   3. Deploy → New deployment → Web app.
//   4. Copy the web app URL → paste into backend/.env as CAMPAIGN_PERF_SCRIPT_URL.
//   5. Run healthCheck() from the Apps Script editor to verify.
//
// ENDPOINT:
//   GET  https://script.google.com/macros/s/[YOUR_ID]/exec
//        → returns raw daily rows (no date filter — client aggregates)
//   GET  ?action=invalidate
//        → clears CacheService for this key (called by POST /api/sync)
//
// ============================================================


// ── Constants ───────────────────────────────────────────────────────────────

var SHEET_NAME = "CampaignPerf";
var CACHE_KEY  = "cv_camp_raw";
var CACHE_TTL  = 1200;  // 20 minutes


// ── Entry point ─────────────────────────────────────────────────────────────

function doGet(e) {
  try {
    var params = e.parameter || {};
    var action = params.action ? String(params.action).trim().toLowerCase() : "";

    // ?action=invalidate — clears cache (called from /api/sync)
    if (action === "invalidate") {
      CacheService.getScriptCache().remove(CACHE_KEY + "__n");
      return jsonOut({ status: "ok", message: "Campaign performance cache invalidated." });
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    return handleRawCampaignPerf(ss);

  } catch (err) {
    return jsonOut({ status: "error", message: "Internal error: " + err.message });
  }
}


// ── Core handler ─────────────────────────────────────────────────────────────

/**
 * Read CampaignPerf sheet and return all raw daily rows.
 * The frontend aggregates by date range client-side — no re-fetch needed
 * when users change the date picker.
 *
 * Response shape:
 *   {
 *     status:               "ok",
 *     data_fetched_at:      ISO string,
 *     available_date_range: { min: "YYYY-MM-DD", max: "YYYY-MM-DD" },
 *     dimensions_count:     number,   // unique Campaign+AdGroup combos
 *     daily_rows_count:     number,
 *     dimensions:           { [dim_id]: DimensionObject },
 *     daily_rows:           DailyRow[],
 *     filter_options:       FilterOptions,
 *   }
 */
function handleRawCampaignPerf(ss) {
  var scriptCache = CacheService.getScriptCache();
  var cachedStr   = getCachedPayload(scriptCache, CACHE_KEY);

  if (cachedStr) {
    return ContentService
      .createTextOutput(cachedStr)
      .setMimeType(ContentService.MimeType.JSON);
  }

  var result     = readCampaignPerfSheet(ss);
  var filterOpts = deriveFilterOptions(result.dimensions);

  var payload = {
    status:               "ok",
    data_fetched_at:      new Date().toISOString(),
    available_date_range: result.available_date_range,
    dimensions_count:     Object.keys(result.dimensions).length,
    daily_rows_count:     result.daily_rows.length,
    dimensions:           result.dimensions,
    daily_rows:           result.daily_rows,
    filter_options:       filterOpts,
  };

  var payloadStr = JSON.stringify(payload);
  try { cachePayload(scriptCache, CACHE_KEY, payloadStr, CACHE_TTL); } catch (ce) {}

  return ContentService
    .createTextOutput(payloadStr)
    .setMimeType(ContentService.MimeType.JSON);
}


// ── Sheet reader ──────────────────────────────────────────────────────────────

/**
 * Reads the CampaignPerf sheet and returns:
 *   dimensions   : { [dim_id]: { campaign, campaign_type, ad_group, network, city, funnel } }
 *   daily_rows   : [ { dim_id, date, impressions, clicks, cost, conversions } ]
 *   available_date_range : { min, max }
 *
 * dim_id = Campaign|Campaign_Type|Ad_Group|Network|Location|Funnel
 *   → unique per card in the Campaign Performance view
 */
function readCampaignPerfSheet(ss) {
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    throw new Error(
      "Sheet '" + SHEET_NAME + "' not found. " +
      "Create a tab named '" + SHEET_NAME + "' and add required columns."
    );
  }

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return { dimensions: {}, daily_rows: [], available_date_range: { min: "", max: "" } };
  }

  // ── Read headers ──────────────────────────────────────────────────────────
  var totalCols = sheet.getLastColumn();
  var rawHeaders = sheet.getRange(1, 1, 1, totalCols).getValues()[0];
  var headerIndex = {};
  rawHeaders.forEach(function(h, i) {
    headerIndex[normalizeHeader(String(h))] = i;
  });

  function getCol(names) {
    for (var i = 0; i < names.length; i++) {
      var k = normalizeHeader(names[i]);
      if (headerIndex[k] !== undefined) return headerIndex[k];
    }
    return undefined;
  }

  var COL = {
    Date:          getCol(["Date", "Day"]),
    Campaign:      getCol(["Campaign"]),
    Campaign_Type: getCol(["Campaign_Type", "Campaign Type", "Campaign type", "CampaignType"]),
    Ad_Group:      getCol(["Ad_Group", "Ad Group", "Ad group", "Asset_Group", "Asset Group", "AdGroup"]),
    Network:       getCol(["Network", "Network type", "Network_Type", "Serving Network"]),
    Location:      getCol(["Location", "City", "Region"]),
    Funnel:        getCol(["Funnel", "Stage"]),
    Impressions:   getCol(["Impressions", "Impr", "Impr."]),
    Clicks:        getCol(["Clicks", "Interactions"]),
    Cost:          getCol(["Cost", "Spend", "Cost (INR)"]),
    Conversions:   getCol(["Conversions", "Conv."]),
    All_Conv:      getCol(["All_Conv", "All conv", "All conv.", "All Conversions"]),
  };

  // Validate required columns
  var required = ["Date", "Campaign", "Impressions", "Clicks", "Cost"];
  var missing  = required.filter(function(c) { return COL[c] === undefined; });
  if (missing.length > 0) {
    throw new Error(
      "CampaignPerf sheet missing required columns: " + missing.join(", ") +
      ". Please check the column header names."
    );
  }

  var convCol = COL["Conversions"] !== undefined ? COL["Conversions"] : COL["All_Conv"];

  // Read only the columns we need
  var usedCols = Object.values(COL).filter(function(v) { return v !== undefined; });
  var maxCol   = Math.max.apply(null, usedCols) + 1;
  var data     = sheet.getRange(2, 1, lastRow - 1, maxCol).getValues();

  // ── Process rows ──────────────────────────────────────────────────────────
  var dimensions   = {};
  var dailyBuckets = {};
  var minDay = null, maxDay = null;

  for (var r = 0; r < data.length; r++) {
    var row = data[r];

    // Parse date
    var dayDate = parseDayValue(COL["Date"] !== undefined ? row[COL["Date"]] : null);
    if (!dayDate) continue;
    var dayStr = formatDate(dayDate);

    // Track date range
    if (!minDay || dayStr < minDay) minDay = dayStr;
    if (!maxDay || dayStr > maxDay) maxDay = dayStr;

    // Extract dimension fields
    var campaign     = COL["Campaign"]      !== undefined ? String(row[COL["Campaign"]]      || "").trim() : "";
    var campaignType = COL["Campaign_Type"] !== undefined ? String(row[COL["Campaign_Type"]] || "").trim() : "Unknown";
    var adGroup      = COL["Ad_Group"]      !== undefined ? String(row[COL["Ad_Group"]]      || "").trim() : "";
    var network      = COL["Network"]       !== undefined ? String(row[COL["Network"]]       || "").trim() : "";
    var location     = COL["Location"]      !== undefined ? String(row[COL["Location"]]      || "").trim() : "";
    var funnel       = COL["Funnel"]        !== undefined ? String(row[COL["Funnel"]]        || "").trim() : "";

    if (!campaign) continue;  // skip empty rows

    if (!campaignType) campaignType = "Unknown";
    if (!adGroup)      adGroup      = campaign;
    if (!funnel)       funnel       = "Unknown";
    if (!network)      network      = "Unknown";

    // Composite dim_id — uniquely identifies one Campaign+AdGroup combination
    var dimId = [campaign, campaignType, adGroup, network, location, funnel].join("|");

    // Store dimension (once per dim_id)
    if (!dimensions[dimId]) {
      dimensions[dimId] = {
        campaign:      campaign,
        campaign_type: campaignType,
        ad_group:      adGroup,
        network:       network,
        city:          location,
        funnel:        funnel,
      };
    }

    // Metrics
    var impressions = toNum(COL["Impressions"] !== undefined ? row[COL["Impressions"]] : 0);
    var clicks      = toNum(COL["Clicks"]      !== undefined ? row[COL["Clicks"]]      : 0);
    var cost        = toNum(COL["Cost"]        !== undefined ? row[COL["Cost"]]        : 0);
    var conversions = toNum(convCol            !== undefined ? row[convCol]            : 0);

    // Daily bucket: aggregate if multiple rows exist for same dim+date
    var bucketKey = dimId + "|" + dayStr;
    if (!dailyBuckets[bucketKey]) {
      dailyBuckets[bucketKey] = {
        dim_id:      dimId,
        date:        dayStr,
        impressions: 0,
        clicks:      0,
        cost:        0,
        conversions: 0,
      };
    }
    dailyBuckets[bucketKey].impressions += impressions;
    dailyBuckets[bucketKey].clicks      += clicks;
    dailyBuckets[bucketKey].cost        += cost;
    dailyBuckets[bucketKey].conversions += conversions;
  }

  // Build daily_rows array (skip zero-cost + zero-impression rows — they're noise)
  var daily_rows = [];
  var bucketKeys = Object.keys(dailyBuckets);
  for (var k = 0; k < bucketKeys.length; k++) {
    var b = dailyBuckets[bucketKeys[k]];
    if (b.impressions <= 0 && b.cost <= 0) continue;  // skip empty rows
    daily_rows.push({
      dim_id:      b.dim_id,
      date:        b.date,
      impressions: round2(b.impressions),
      clicks:      round2(b.clicks),
      cost:        round2(b.cost),
      conversions: round2(b.conversions),
    });
  }

  return {
    dimensions:           dimensions,
    daily_rows:           daily_rows,
    available_date_range: { min: minDay || "", max: maxDay || "" },
  };
}


// ── Filter options ────────────────────────────────────────────────────────────

function deriveFilterOptions(dimensions) {
  var campaigns      = {}, types = {}, adGroups = {}, networks = {}, cities = {}, funnels = {};
  var keys = Object.keys(dimensions);
  for (var i = 0; i < keys.length; i++) {
    var d = dimensions[keys[i]];
    if (d.campaign)      campaigns[d.campaign]         = 1;
    if (d.campaign_type) types[d.campaign_type]        = 1;
    if (d.ad_group)      adGroups[d.ad_group]          = 1;
    if (d.network)       networks[d.network]           = 1;
    if (d.city)          cities[d.city]                = 1;
    if (d.funnel)        funnels[d.funnel]             = 1;
  }
  return {
    campaigns:      Object.keys(campaigns).sort(),
    campaign_types: Object.keys(types).sort(),
    ad_groups:      Object.keys(adGroups).sort(),
    networks:       Object.keys(networks).sort(),
    cities:         Object.keys(cities).sort(),
    funnels:        Object.keys(funnels).sort(),
  };
}


// ── Cache helpers (chunked CacheService — identical to doGet.js) ──────────────

function cachePayload(cache, key, str, ttl) {
  var CHUNK = 90000;
  var n     = Math.ceil(str.length / CHUNK);
  var pairs = {};
  pairs[key + "__n"] = String(n);
  for (var i = 0; i < n; i++) {
    pairs[key + "__" + i] = str.substring(i * CHUNK, (i + 1) * CHUNK);
  }
  cache.putAll(pairs, ttl);
}

function getCachedPayload(cache, key) {
  var nStr = cache.get(key + "__n");
  if (!nStr) return null;
  var n = parseInt(nStr, 10);
  var chunks = [];
  for (var i = 0; i < n; i++) {
    var chunk = cache.get(key + "__" + i);
    if (chunk === null) return null;
    chunks.push(chunk);
  }
  return chunks.join("");
}


// ── Date / number utilities (mirrors doGet.js) ────────────────────────────────

function parseDayValue(val) {
  if (!val) return null;
  if (val instanceof Date) {
    var d = new Date(val.getTime());
    d.setHours(0, 0, 0, 0);
    return d;
  }
  var s = String(val).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    var p = s.split("-");
    return new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2]));
  }
  var mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) return new Date(parseInt(mdy[3]), parseInt(mdy[1]) - 1, parseInt(mdy[2]));
  return null;
}

function formatDate(d) {
  var y   = d.getFullYear();
  var m   = String(d.getMonth() + 1).padStart(2, "0");
  var day = String(d.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + day;
}

function normalizeHeader(h) {
  return String(h || "").trim().toLowerCase().replace(/[\s\-]+/g, "_");
}

function toNum(val) {
  if (val === null || val === undefined || val === "") return 0;
  if (typeof val === "number") return val;
  var n = parseFloat(String(val).replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}


// ── Health check ──────────────────────────────────────────────────────────────
// Run from Apps Script editor to verify the sheet is wired correctly.

function healthCheck() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  Logger.log("=== CampaignPerformance Health Check ===");
  if (!sheet) {
    Logger.log("FAIL: Sheet '" + SHEET_NAME + "' not found!");
    return;
  }
  Logger.log("OK  Sheet found: " + sheet.getLastRow() + " rows, " + sheet.getLastColumn() + " columns");

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    .map(function(h) { return String(h).trim(); });
  Logger.log("OK  Headers: " + headers.join(", "));

  var requiredHeaders = ["Date", "Campaign", "Impressions", "Clicks", "Cost"];
  var missing = requiredHeaders.filter(function(c) {
    return headers.map(function(h) { return h.toLowerCase(); }).indexOf(c.toLowerCase()) === -1;
  });
  if (missing.length > 0) {
    Logger.log("FAIL: Missing required columns: " + missing.join(", "));
  } else {
    Logger.log("OK  All required columns present");
  }

  try {
    var result = readCampaignPerfSheet(ss);
    Logger.log("OK  Dimensions (unique campaign+adgroup combos): " + Object.keys(result.dimensions).length);
    Logger.log("OK  Daily rows: " + result.daily_rows.length);
    Logger.log("OK  Date range: " + result.available_date_range.min + " to " + result.available_date_range.max);
    if (result.daily_rows.length > 0) {
      Logger.log("OK  Sample row: " + JSON.stringify(result.daily_rows[0]));
    }
  } catch (err) {
    Logger.log("FAIL: " + err.message);
  }
  Logger.log("=== Health check complete ===");
}


// ── Sample data helper ────────────────────────────────────────────────────────
// Run this once from the Apps Script editor to create the CampaignPerf sheet
// with the correct headers and one sample row. Delete sample data afterwards.

function setupSheet() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    Logger.log("Created sheet: " + SHEET_NAME);
  } else {
    Logger.log("Sheet already exists: " + SHEET_NAME);
  }

  var headers = [
    "Date", "Campaign", "Campaign_Type", "Ad_Group",
    "Network", "Location", "Funnel",
    "Impressions", "Clicks", "Cost", "Conversions", "All_Conv"
  ];

  // Only write headers if the sheet is empty
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#E8F0FE");

    // Sample row
    sheet.getRange(2, 1, 1, headers.length).setValues([[
      "2026-06-20",
      "Aukera - PMax - Mumbai",
      "PMax",
      "Mumbai - TOFU - Rings",
      "Search",
      "Mumbai",
      "TOFU",
      12400, 340, 4520.50, 12.0, 18.0
    ]]);
    Logger.log("Headers and sample row written. Delete the sample row before going live.");
  } else {
    Logger.log("Sheet has data — headers not overwritten. Existing rows: " + sheet.getLastRow());
  }

  SpreadsheetApp.getUi().alert(
    "Setup complete!\n\n" +
    "1. Add your real data rows.\n" +
    "2. Run healthCheck() to verify.\n" +
    "3. Deploy as Web App and copy the URL to backend/.env as CAMPAIGN_PERF_SCRIPT_URL."
  );
}
