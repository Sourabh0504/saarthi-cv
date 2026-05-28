// ============================================================
// CreativeVisibility -- Apps Script Web App (v3)
// ============================================================
// SINGLE SOURCE OF TRUTH: Daily_dump
//   Everything -- performance AND metadata -- comes from Daily_dump alone.
//   Current_Pmax and Current_Dgen are NOT referenced here in any way.
//
// SHEETS REQUIRED:
//   Daily_dump     -- Per-asset-per-day data (Google Ads scheduled report)
//   query_controls -- Last-run log (created by setupQueryControls() helper)
//
// HOW CREATIVE_ID WORKS:
//   creative_id = Asset_URL + "|" + Location + "|" + Campaign_Type + "|" + Campaign + "|" + Ad_group + "|" + Funnel
//   composite key -- unique per card in the portal.
//   creative_url  = raw Asset URL -- used for thumbnails and display.
//
// CACHING STRATEGY (two-layer):
//   Layer 1: Apps Script CacheService (20-min TTL, chunked, up to 450 KB)
//     -- First call reads Daily_dump sheet (slow on large sheets).
//     -- Every call within 20 min returns cached JSON without touching the sheet.
//   Layer 2: FastAPI TTLCache (15-min TTL in Python)
//     -- After Apps Script responds, Python caches the result.
//     -- Subsequent portal loads hit only the Python cache (<5ms).
//
// DEPLOYMENT SETTINGS:
//   Execute as: Me (your Google account)
//   Who has access: Anyone
//
// ENDPOINT:
//   https://script.google.com/macros/s/[YOUR_ID]/exec
//   Optional params: ?start=YYYY-MM-DD&end=YYYY-MM-DD (defaults: last 30 days)
// ============================================================


// =============================================================
// MAIN ENTRY POINT
// =============================================================

function doGet(e) {
  try {
    var params = e.parameter || {};

    // Date range defaults:
    // If start/end not provided, use the sheet's actual min/max dates.
    var startStr = params.start ? String(params.start).trim() : "";
    var endStr   = params.end   ? String(params.end).trim()   : "";
    var useAutoRange = !startStr || !endStr;
    var statusStr = params.status ? String(params.status).trim() : "";
    var statusFilter = statusStr && statusStr.toLowerCase() !== "all"
      ? normalizeStatus(statusStr)
      : "";

    if (!useAutoRange) {
      if (!isValidDateStr(startStr) || !isValidDateStr(endStr)) {
        return errorResponse("Invalid date format. Use YYYY-MM-DD.");
      }
      if (startStr > endStr) {
        return errorResponse("start date must be <= end date.");
      }
    }

    // ----------------------------------------------------------------
    // LAYER 1 CACHE: Apps Script CacheService (fast path)
    // First call: reads the full sheet (slow -- 15-60s on large sheets).
    // Every subsequent call within 20 minutes: instant from cache.
    // Chunked storage handles payloads up to ~450 KB (5 x 90 KB).
    // ----------------------------------------------------------------
    var scriptCache = CacheService.getScriptCache();
    var statusKey = statusFilter ? statusFilter.toLowerCase() : "all";
    var cacheKey  = (useAutoRange
      ? "cv_auto"
      : "cv_" + startStr.replace(/-/g, "") + "_" + endStr.replace(/-/g, "")) + "_" + statusKey;
    var cachedStr   = getCachedPayload(scriptCache, cacheKey);
    if (cachedStr) {
      return ContentService
        .createTextOutput(cachedStr)
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Cache miss -- compute from sheet
    var startDate = useAutoRange ? null : parseDateStr(startStr);
    var endDate   = useAutoRange ? null : parseDateStr(endStr);

    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // Read + aggregate Daily_dump
    var result = aggregateDailyDump(ss, startDate, endDate, statusFilter);

    // Resolve date range for response (auto range uses sheet min/max)
    var resolvedStart = useAutoRange ? (result.available_date_range.min || "") : startStr;
    var resolvedEnd   = useAutoRange ? (result.available_date_range.max || "") : endStr;

    // Log this run to query_controls (non-fatal)
    logQueryRun(ss, resolvedStart, resolvedEnd);

    // Derive filter options dynamically (never hardcoded)
    var filterOptions = deriveFilterOptions(result.dimensions);

    // Build response payload
    var payload = {
      status:               "ok",
      date_range:           { start: resolvedStart, end: resolvedEnd },
      available_date_range: result.available_date_range,
      dimensions_count:     result.dimensions.length,
      dimensions:           result.dimensions,
      performance_count:    result.performance.length,
      performance:          result.performance,
      filter_options:       filterOptions,
    };

    var payloadStr = JSON.stringify(payload);

    // Store in Apps Script cache (20-min TTL)
    // If cachePayload throws (e.g. payload too large), ignore -- not fatal.
    try { cachePayload(scriptCache, cacheKey, payloadStr, 1200); } catch (ce) {}

    return ContentService
      .createTextOutput(payloadStr)
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return errorResponse("Internal error: " + err.message);
  }
}


// =============================================================
// CACHE HELPERS (chunked CacheService)
// CacheService limit: 100 KB per entry.
// We split into 90 KB chunks and use putAll() for one atomic write.
// =============================================================

/**
 * Store a string in CacheService using chunked writes.
 * Handles payloads up to (maxChunks x CHUNK_SIZE) bytes.
 */
function cachePayload(cache, key, str, ttl) {
  var CHUNK = 90000; // 90 KB per chunk
  var compressed = compressToBase64(str);
  var n     = Math.ceil(compressed.length / CHUNK);
  var pairs = {};
  pairs[key + "__n"] = String(n);
  for (var i = 0; i < n; i++) {
    pairs[key + "__" + i] = compressed.substring(i * CHUNK, (i + 1) * CHUNK);
  }
  cache.putAll(pairs, ttl); // atomic write of all chunks
}

/**
 * Retrieve a chunked string from CacheService.
 * Returns null if the key is missing or any chunk has expired.
 */
function getCachedPayload(cache, key) {
  var nStr = cache.get(key + "__n");
  if (!nStr) return null;
  var n      = parseInt(nStr, 10);
  var chunks = [];
  for (var i = 0; i < n; i++) {
    var chunk = cache.get(key + "__" + i);
    if (chunk === null) return null; // chunk expired -- full cache miss
    chunks.push(chunk);
  }
  var joined = chunks.join("");
  try {
    return decompressFromBase64(joined);
  } catch (e) {
    return null;
  }
}


// =============================================================
// CORE: READ + AGGREGATE Daily_dump
// =============================================================

/**
 * Reads Daily_dump, filters IMAGE + VIDEO rows within the date range,
 * and aggregates performance metrics.
 *
 * GROUPING KEY: (Asset_URL + Location + Campaign_Type + Campaign + Ad_group + Funnel)
 *   -- Prevents combining clicks across campaigns or ad groups
 *   -- Same image in different cities = separate cards (city context preserved)
 *
 * Returns: { dimensions: [...], performance: [...] }
 */
function aggregateDailyDump(ss, startDate, endDate, statusFilter) {
  var sheet = ss.getSheetByName("Daily_dump");
  if (!sheet) {
    throw new Error("Sheet 'Daily_dump' not found. Check the tab name (case-sensitive).");
  }

  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2) return { dimensions: [], performance: [] };

  // Read all data in ONE batch call (most efficient -- minimises Sheets API calls)
  var data    = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  var headers = data[0].map(function(h) { return String(h).trim(); });

  // Header normalization: tolerate spaces/underscores/case differences
  var headerIndex = {};
  headers.forEach(function(h, i) { headerIndex[normalizeHeader(h)] = i; });

  function getCol(names) {
    for (var i = 0; i < names.length; i++) {
      var key = normalizeHeader(names[i]);
      if (headerIndex[key] !== undefined) return headerIndex[key];
    }
    return undefined;
  }

  var COL = {
    Day:           getCol(["Day"]),
    Asset:         getCol(["Asset"]),
    Asset_type:    getCol(["Asset_type", "Asset type"]),
    Asset_status:  getCol(["Asset_status", "Asset status"]),
    Campaign:      getCol(["Campaign"]),
    Location:      getCol(["Location"]),
    Funnel:        getCol(["Funnel"]),
    Campaign_Type: getCol(["Campaign_Type", "Campaign Type", "Campaign type"]),
    Ad_group:      getCol(["Ad_group", "Ad group", "Asset_group", "Asset group"]),
    Impr:          getCol(["Impr", "Impressions"]),
    Clicks:        getCol(["Clicks"]),
    Interactions:  getCol(["Interactions"]),
    Cost:          getCol(["Cost"]),
    Conversions:   getCol(["Conversions"]),
    All_conv:      getCol(["All_conv", "All conv", "All conv."]),
  };

  // Verify required columns exist
  var required = [
    "Day", "Asset", "Asset_type", "Asset_status",
    "Campaign", "Location", "Funnel", "Campaign_Type",
    "Impr", "Clicks", "Cost", "Conversions"
  ];
  var missing = required.filter(function(c) { return COL[c] === undefined; });
  if (COL["Conversions"] === undefined && COL["All_conv"] === undefined) {
    missing.push("Conversions or All_conv");
  }
  if (missing.length > 0) {
    throw new Error(
      "Daily_dump missing columns: " + missing.join(", ") +
      ". Ensure the Google Ads report includes a 'Clicks' column."
    );
  }

  var buckets = {};    // compositeKey -> aggregation bucket
  var minDayStr = null; // min Day seen across ALL visual rows in the sheet
  var maxDayStr = null; // max Day seen across ALL visual rows in the sheet

  for (var r = 1; r < data.length; r++) {
    var row = data[r];

    // PRIMARY FILTER: Asset must be a URL → it is a visual creative.
    // We do NOT filter by Asset_type because Google Ads uses many different
    // type names across campaign types:
    //   Search/Display → IMAGE
    //   PMax           → MARKETING_IMAGE, SQUARE_MARKETING_IMAGE, PORTRAIT_MARKETING_IMAGE, YOUTUBE_VIDEO
    //   Video/Dgen     → YOUTUBE_VIDEO, VIDEO
    // Text assets (headlines, descriptions) never have URLs in the Asset column,
    // so the URL check is the correct and complete filter.
    var assetRaw = String(row[COL["Asset"]] || "").trim();
    if (!assetRaw) continue;

    var assetUrl = normalizeAssetUrl(assetRaw);

    // Read Asset_type for type detection and filtering
    var assetType = String(row[COL["Asset_type"]] || "").trim().toUpperCase();

    // Skip non-visual assets (headlines, descriptions, etc.)
    if (!isVisualAsset(assetUrl, assetType)) continue;

    // Track min/max Day across ALL visual rows (regardless of date/status filter)
    // -- this tells the frontend what date range is actually in the sheet
    var dayDate = parseDayValue(row[COL["Day"]]);
    if (!dayDate) continue;
    var dayStr = formatDate(dayDate);
    if (!minDayStr || dayStr < minDayStr) minDayStr = dayStr;
    if (!maxDayStr || dayStr > maxDayStr) maxDayStr = dayStr;

    // Status filter (if provided)
    var assetStatusRaw = String(row[COL["Asset_status"]] || "Enabled").trim();
    var assetStatusNorm = normalizeStatus(assetStatusRaw);
    if (statusFilter && assetStatusNorm !== statusFilter) continue;

    // Date range filter (affects aggregation, not the min/max tracking above)
    if ((startDate && dayDate < startDate) || (endDate && dayDate > endDate)) continue;

    // Extract metadata columns
    var location     = String(row[COL["Location"]]      || "").trim();
    var funnel       = String(row[COL["Funnel"]]        || "").trim();
    var campaignType = String(row[COL["Campaign_Type"]] || "").trim();
    var campaign     = String(row[COL["Campaign"]]      || "").trim();
    var adGroup      = COL["Ad_group"] !== undefined
      ? String(row[COL["Ad_group"]] || "").trim()
      : "";
    var assetStatus  = assetStatusNorm;

    if (!campaignType) campaignType = "Unknown";
    if (!funnel) funnel = "Unknown";
    if (!adGroup) adGroup = campaign || "Unknown";

    // Composite key: same URL + same city + same campaign type = 1 card
    var assetKey = assetUrl && assetUrl.startsWith("http") ? assetUrl : assetRaw;
    if (!assetKey) continue;
    var compositeKey = assetKey + "|" + location + "|" + campaignType + "|" + campaign + "|" + adGroup + "|" + funnel;

    if (!buckets[compositeKey]) {
      buckets[compositeKey] = {
        asset_url:     assetUrl && assetUrl.startsWith("http") ? assetUrl : "",
        asset_type:    assetType,
        location:      location,
        funnel:        funnel,
        campaign_type: campaignType,
        campaign:      campaign,
        ad_group:      adGroup,
        asset_status:  assetStatus,
        impressions:   0,
        interactions:  0,
        cost:          0,
        conversions:   0,
      };
    }

    var convCol = COL["Conversions"] !== undefined ? COL["Conversions"] : COL["All_conv"];

    buckets[compositeKey].impressions  += toNum(row[COL["Impr"]]);
    buckets[compositeKey].interactions += toNum(row[COL["Clicks"]]);
    buckets[compositeKey].cost         += toNum(row[COL["Cost"]]);
    buckets[compositeKey].conversions  += toNum(row[convCol]);
  }

  // Build output arrays -- skip zero-impression buckets entirely
  var dimensions  = [];
  var performance = [];

  var keys = Object.keys(buckets);
  for (var k = 0; k < keys.length; k++) {
    var b = buckets[keys[k]];

    // Drop creatives with 0 impressions -- useless for analysis
    if (b.impressions <= 0) continue;

    var creativeId   = keys[k]; // composite key = unique per card
    var creativeUrl  = b.asset_url;
    var creativeType = detectCreativeType(b.asset_url, b.asset_type);

    dimensions.push({
      creative_id:    creativeId,
      creative_url:   creativeUrl,
      creative_type:  creativeType,
      campaign_name:  b.campaign,
      campaign_type:  b.campaign_type,
      city:           b.location,
      funnel:         b.funnel,
      ad_group:       b.ad_group,
      headline:       "",
      description:    "",
      age_group:      "",
      category:       "",
      status:         normalizeStatus(b.asset_status),
    });

    performance.push({
      creative_id:  creativeId,
      impressions:  round2(b.impressions),
      clicks:       round2(b.interactions),
      cost:         round2(b.cost),
      conversions:  round2(b.conversions),
    });
  }

  return {
    dimensions:           dimensions,
    performance:          performance,
    available_date_range: { min: minDayStr || "", max: maxDayStr || "" },
  };
}


// =============================================================
// FILTER OPTIONS -- derived dynamically, never hardcoded
// =============================================================

function deriveFilterOptions(dimensions) {
  function getUnique(key) {
    var seen = {};
    return dimensions
      .map(function(d) { return d[key]; })
      .filter(function(v) { return v && v !== ""; })
      .filter(function(v) {
        if (seen[v]) return false;
        seen[v] = true;
        return true;
      })
      .sort();
  }

  return {
    cities:         getUnique("city"),
    campaign_types: getUnique("campaign_type"),
    funnels:        getUnique("funnel"),
    categories:     getUnique("category"),
    age_groups:     getUnique("age_group"),
    statuses:       getUnique("status"),
  };
}


// =============================================================
// UTILITIES
// =============================================================

function normalizeHeader(h) {
  return String(h || "")
    .trim()
    .toLowerCase()
    .replace(/[\s\-]+/g, "_");
}

function compressToBase64(str) {
  var bytes = Utilities.newBlob(str).getBytes();
  var gz = Utilities.gzip(bytes);
  return Utilities.base64Encode(gz);
}

function decompressFromBase64(b64) {
  var gz = Utilities.base64Decode(b64);
  var bytes = Utilities.ungzip(gz);
  return Utilities.newBlob(bytes).getDataAsString();
}

function normalizeAssetUrl(raw) {
  var s = String(raw || "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  if (/^www\./i.test(s)) return "https://" + s;
  if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(s)) return "https://" + s;
  return s;
}

function isVisualAsset(assetUrl, assetType) {
  if (assetUrl && /^https?:\/\//i.test(assetUrl)) return true;
  var t = String(assetType || "").toUpperCase();
  if (!t) return false;
  var nonVisual = [
    "HEADLINE", "DESCRIPTION", "TEXT", "BUSINESS_NAME", "CALL_TO_ACTION",
    "PROMOTION", "PRICE", "SITELINK", "CALL", "PHONE_NUMBER"
  ];
  for (var i = 0; i < nonVisual.length; i++) {
    if (t.indexOf(nonVisual[i]) !== -1) return false;
  }
  if (t.indexOf("IMAGE") !== -1) return true;
  if (t.indexOf("VIDEO") !== -1) return true;
  if (t.indexOf("LOGO") !== -1) return true;
  if (t.indexOf("ANIMATION") !== -1) return true;
  if (t.indexOf("MEDIA") !== -1) return true;
  if (t.indexOf("HTML5") !== -1) return true;
  return false;
}

function detectCreativeType(url, assetTypeStr) {
  var t = String(assetTypeStr || "").toUpperCase();
  if (t.indexOf("VIDEO") !== -1) return "Video";
  if (t.indexOf("IMAGE") !== -1 || t.indexOf("LOGO") !== -1) return "Image";
  if (url && (url.indexOf("youtube.com") !== -1 || url.indexOf("youtu.be") !== -1)) return "Video";
  if (url && /^https?:\/\//i.test(url)) return "Image";
  return "Text";
}

function normalizeStatus(raw) {
  var s = String(raw || "").trim().toLowerCase();
  if (s === "enabled" || s === "active" || s === "") return "Enabled";
  if (s === "paused" || s === "removed") return "Paused";
  return raw || "Enabled";
}

/**
 * Parse the "Day" column value into a JavaScript Date.
 * Handles: Date objects, YYYY-MM-DD, MM/DD/YYYY, DD-MM-YYYY.
 */
function parseDayValue(val) {
  if (!val) return null;
  if (val instanceof Date) {
    var d = new Date(val.getTime());
    d.setHours(0, 0, 0, 0);
    return d;
  }
  var s = String(val).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return parseDateStr(s);
  var mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) return new Date(parseInt(mdy[3]), parseInt(mdy[1]) - 1, parseInt(mdy[2]));
  var dmy = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dmy) return new Date(parseInt(dmy[3]), parseInt(dmy[2]) - 1, parseInt(dmy[1]));
  return null;
}

function parseDateStr(s) {
  var p = s.split("-");
  return new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2]));
}

function formatDate(d) {
  var y   = d.getFullYear();
  var m   = String(d.getMonth() + 1).padStart(2, "0");
  var day = String(d.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + day;
}

function isValidDateStr(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
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

function logQueryRun(ss, startStr, endStr) {
  try {
    var ctrl = ss.getSheetByName("query_controls");
    if (!ctrl) return;
    ctrl.getRange("B2").setValue(startStr);
    ctrl.getRange("C2").setValue(endStr);
    ctrl.getRange("D2").setValue(new Date().toISOString());
  } catch (e) { /* non-fatal */ }
}

function errorResponse(msg) {
  return ContentService
    .createTextOutput(JSON.stringify({ status: "error", message: msg }))
    .setMimeType(ContentService.MimeType.JSON);
}


// =============================================================
// ONE-TIME SETUP HELPERS
// =============================================================

function setupQueryControls() {
  var ss   = SpreadsheetApp.getActiveSpreadsheet();
  var ctrl = ss.getSheetByName("query_controls");
  if (!ctrl) ctrl = ss.insertSheet("query_controls");
  ctrl.clearContents();
  ctrl.getRange("A1:D1").setValues([["label", "last_start", "last_end", "last_run_at"]]);
  ctrl.getRange("A2:D2").setValues([["last_query", "", "", "never"]]);
  ctrl.getRange("A1:D1").setFontWeight("bold").setBackground("#E8F0FE");
  SpreadsheetApp.getUi().alert("query_controls tab created! Run healthCheck() next.");
}

function healthCheck() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Logger.log("=== CreativeVisibility Health Check ===");
  ["Daily_dump", "query_controls"].forEach(function(name) {
    var sheet = ss.getSheetByName(name);
    Logger.log(sheet ? "OK " + name + ": " + sheet.getLastRow() + " rows" : "MISSING " + name);
  });
  var dumpSheet = ss.getSheetByName("Daily_dump");
  if (dumpSheet && dumpSheet.getLastRow() > 1) {
    var headers  = dumpSheet.getRange(1, 1, 1, dumpSheet.getLastColumn()).getValues()[0];
    var found    = headers.map(function(h) { return String(h).trim(); });
    var required = ["Day","Asset","Asset_type","Asset_status","Campaign","Location",
                    "Funnel","Campaign_Type","Ad_group","Impr","Interactions","Cost","Conversions"];
    var missing  = required.filter(function(c) { return found.indexOf(c) === -1; });
    Logger.log(missing.length === 0
      ? "OK All required columns present"
      : "MISSING columns: " + missing.join(", "));
    var typeCount = {};
    dumpSheet.getRange(2, found.indexOf("Asset_type") + 1, dumpSheet.getLastRow() - 1, 1)
      .getValues().forEach(function(r) {
        var t = String(r[0] || "").trim().toUpperCase() || "(blank)";
        typeCount[t] = (typeCount[t] || 0) + 1;
      });
    Logger.log("Asset_type counts: " + JSON.stringify(typeCount));
  }
  Logger.log("=== Health check complete ===");
}

function runTestFetch() {
  var today   = new Date();
  var minus30 = new Date(today);
  minus30.setDate(today.getDate() - 29);
  minus30.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  Logger.log("=== runTestFetch ===");
  Logger.log("Range: " + formatDate(minus30) + " to " + formatDate(today));
  try {
    var ss     = SpreadsheetApp.getActiveSpreadsheet();
    var result = aggregateDailyDump(ss, minus30, today);
    var fo     = deriveFilterOptions(result.dimensions);
    Logger.log("Creatives (IMAGE+VIDEO, >0 impr): " + result.dimensions.length);
    Logger.log("Cities: " + fo.cities.join(", "));
    Logger.log("Campaign types: " + fo.campaign_types.join(", "));
    Logger.log("Funnels: " + fo.funnels.join(", "));
    if (result.dimensions.length > 0) {
      Logger.log("Sample: " + JSON.stringify(result.dimensions[0]));
    }
  } catch (err) {
    Logger.log("ERROR: " + err.message);
  }
  Logger.log("=== Done ===");
}
