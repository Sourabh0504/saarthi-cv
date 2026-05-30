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
// CACHING STRATEGY (three-layer):
//   Layer 1: ScriptProperties persistent cache (survives cold-starts, no TTL)
//     -- First ever call reads the sheet and stores result in ScriptProperties.
//     -- All future cold-starts serve from ScriptProperties instantly (~200ms).
//     -- Invalidated only by POST /api/sync (which calls ?action=invalidate).
//   Layer 2: Apps Script CacheService (20-min TTL, chunked, raw JSON — no gzip)
//     -- Faster than ScriptProperties for hot paths (in-memory).
//     -- Stores raw JSON (no gzip) for speed. Chunks up to 450 KB total.
//   Layer 3: FastAPI TTLCache (30-min TTL in Python)
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
// SCHEDULED CLEANUP: Delete rows with 0 Impr in Daily_dump
// =============================================================
/**
 * Deletes up to BATCH_SIZE rows in Daily_dump where Impr (impressions) is 0.
 * If more remain, schedules itself to run again in 1 minute (self-chaining).
 * Schedule a regular time-driven trigger (e.g., every 8 hours) for new data.
 */
function deleteZeroImprRows() {
  var BATCH_SIZE = 1000;
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Daily_dump");
  if (!sheet) throw new Error("Sheet 'Daily_dump' not found.");
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return; // No data rows
  var header = data[0];
  var imprCol = header.map(function(h) { return String(h).trim().toLowerCase(); }).indexOf("impr");
  if (imprCol === -1) throw new Error("'Impr' column not found in Daily_dump.");
  var rowsToDelete = [];
  var zeroImprCount = 0;
  for (var i = 1; i < data.length; i++) {
    var val = data[i][imprCol];
    if (Number(val) === 0) {
      zeroImprCount++;
      if (rowsToDelete.length < BATCH_SIZE) rowsToDelete.push(i + 1); // +1 for 1-based, +1 for header
    }
  }
  // Delete from bottom to top to avoid shifting
  for (var j = rowsToDelete.length - 1; j >= 0; j--) {
    sheet.deleteRow(rowsToDelete[j]);
  }
  Logger.log("Deleted " + rowsToDelete.length + " zero-impression rows (batch mode)");
  // If more zero-impression rows remain, schedule next batch in 1 minute
  if (zeroImprCount > BATCH_SIZE) {
    ScriptApp.newTrigger('deleteZeroImprRows')
      .timeBased()
      .after(60 * 1000) // 1 minute
      .create();
    Logger.log("Scheduled next batch in 1 minute");
  }
}
// =============================================================

function doGet(e) {
  try {
    var params = e.parameter || {};

    // ── Invalidate persistent cache (called by POST /api/sync) ─────────────
    // ?action=invalidate clears all ScriptProperties cv_* keys, forcing a full
    // sheet read on the next request. CacheService clears itself via TTL.
    var action = params.action ? String(params.action).trim().toLowerCase() : "";
    if (action === "invalidate") {
      invalidateScriptPropertiesCache();
      return ContentService
        .createTextOutput(JSON.stringify({ status: "ok", message: "Persistent cache invalidated." }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // ── Current Structure shortcut ──────────────────────────────────────────
    var tab = params.tab ? String(params.tab).trim().toLowerCase() : "";
    if (tab === "current_structure") {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      return handleCurrentStructure(ss);
    }

    // ── Raw Daily shortcut ─────────────────────────────────────────────────
    // ?tab=raw_daily → returns ALL daily rows for ALL dates (no aggregation).
    // The frontend receives this once and aggregates by date range in-browser.
    // This makes date range changes instant (client-side useMemo) like filters.
    if (tab === "raw_daily") {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      return handleRawDaily(ss);
    }

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

    var statusKey = statusFilter ? statusFilter.toLowerCase() : "all";
    var cacheKey  = (useAutoRange
      ? "cv_auto"
      : "cv_" + startStr.replace(/-/g, "") + "_" + endStr.replace(/-/g, "")) + "_" + statusKey;

    // ----------------------------------------------------------------
    // LAYER 2 CACHE: Apps Script CacheService (20-min TTL, raw JSON)
    // Fast in-memory path. No gzip — raw JSON is faster for small-medium payloads.
    // ----------------------------------------------------------------
    var scriptCache = CacheService.getScriptCache();
    var cachedStr   = getCachedPayload(scriptCache, cacheKey);
    if (cachedStr) {
      return ContentService
        .createTextOutput(cachedStr)
        .setMimeType(ContentService.MimeType.JSON);
    }

    // ----------------------------------------------------------------
    // LAYER 1 CACHE: ScriptProperties (persistent, survives cold-starts)
    // Checked after CacheService miss. Survives server restarts & cold-starts.
    // Invalidated explicitly via ?action=invalidate or POST /api/sync.
    // ----------------------------------------------------------------
    var scriptProps = PropertiesService.getScriptProperties();
    var propCached  = scriptProps.getProperty(cacheKey);
    if (propCached) {
      // Backfill CacheService so next 20 min is served from memory
      try { cachePayload(scriptCache, cacheKey, propCached, 1200); } catch (ce) {}
      return ContentService
        .createTextOutput(propCached)
        .setMimeType(ContentService.MimeType.JSON);
    }

    // ----------------------------------------------------------------
    // CACHE MISS — Read sheet and aggregate
    // ----------------------------------------------------------------
    var startDate = useAutoRange ? null : parseDateStr(startStr);
    var endDate   = useAutoRange ? null : parseDateStr(endStr);

    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // Read + aggregate Daily_dump (selective columns for speed)
    var result = aggregateDailyDump(ss, startDate, endDate, statusFilter);

    // Resolve date range for response (auto range uses sheet min/max)
    var resolvedStart = useAutoRange ? (result.available_date_range.min || "") : startStr;
    var resolvedEnd   = useAutoRange ? (result.available_date_range.max || "") : endStr;

    // Log this run to query_controls (non-fatal)
    logQueryRun(ss, resolvedStart, resolvedEnd);

    // Derive filter options dynamically (never hardcoded)
    var filterOptions = deriveFilterOptions(result.dimensions);

    // Build response payload — include data_fetched_at for freshness display
    var payload = {
      status:               "ok",
      data_fetched_at:      new Date().toISOString(),
      date_range:           { start: resolvedStart, end: resolvedEnd },
      available_date_range: result.available_date_range,
      dimensions_count:     result.dimensions.length,
      dimensions:           result.dimensions,
      performance_count:    result.performance.length,
      performance:          result.performance,
      filter_options:       filterOptions,
    };

    var payloadStr = JSON.stringify(payload);

    // Store in CacheService (20-min TTL) — raw JSON, no compression overhead
    try { cachePayload(scriptCache, cacheKey, payloadStr, 1200); } catch (ce) {}

    // Store in ScriptProperties (persistent) — survives cold-starts
    // ScriptProperties has a 9KB per-property limit; store only if payload fits.
    // For large payloads, we skip ScriptProperties (CacheService is still used).
    try {
      if (payloadStr.length <= 450000) {  // ~450KB safety limit
        scriptProps.setProperty(cacheKey, payloadStr);
      }
    } catch (pe) { /* non-fatal — ScriptProperties quota exceeded */ }

    return ContentService
      .createTextOutput(payloadStr)
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return errorResponse("Internal error: " + err.message);
  }
}


// =============================================================
// CACHE HELPERS (chunked CacheService — raw JSON, no gzip)
// CacheService limit: 100 KB per entry.
// We split into 90 KB chunks and use putAll() for one atomic write.
// No compression: raw JSON is faster for our payload sizes (avoids 2-5s gzip).
// =============================================================

/**
 * Store a raw string in CacheService using chunked writes.
 * Handles payloads up to (n x 90 KB) bytes.
 */
function cachePayload(cache, key, str, ttl) {
  var CHUNK = 90000; // 90 KB per chunk (CacheService limit is 100 KB)
  var n     = Math.ceil(str.length / CHUNK);
  var pairs = {};
  pairs[key + "__n"] = String(n);
  for (var i = 0; i < n; i++) {
    pairs[key + "__" + i] = str.substring(i * CHUNK, (i + 1) * CHUNK);
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
    if (chunk === null) return null; // chunk expired — full cache miss
    chunks.push(chunk);
  }
  return chunks.join(""); // return raw JSON string directly
}

/**
 * Invalidate all ScriptProperties cache entries for CreativeVisibility.
 * Called via ?action=invalidate (triggered by POST /api/sync on the backend).
 */
function invalidateScriptPropertiesCache() {
  var props = PropertiesService.getScriptProperties();
  var keys  = props.getKeys();
  var cvKeys = keys.filter(function(k) { return k.indexOf("cv_") === 0; });
  cvKeys.forEach(function(k) { props.deleteProperty(k); });
  Logger.log("[invalidate] Cleared " + cvKeys.length + " ScriptProperties cache entries.");
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
  if (lastRow < 2) return { dimensions: [], performance: [] };

  // Read ONLY the header row first to find which columns we need.
  // This avoids reading all N columns of data when we only need ~13.
  var totalCols = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, totalCols).getValues()[0]
    .map(function(h) { return String(h).trim(); });

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

  // SPEED OPTIMISATION: Compute the highest column index we actually need,
  // then read ONLY up to that column — not all columns in the sheet.
  // If Daily_dump has 27 columns but we only need up to column 15, we read
  // 44% fewer cells per row. On 10,000-row sheets this is a meaningful speedup.
  var usedCols = Object.values(COL).filter(function(v) { return v !== undefined; });
  var maxColNeeded = Math.max.apply(null, usedCols) + 1; // +1 for 1-based slice

  // Single batch read — only the columns we actually need.
  var data = sheet.getRange(2, 1, lastRow - 1, maxColNeeded).getValues();

  var buckets = {};     // compositeKey -> aggregation bucket
  var minDayStr = null; // min Day seen across ALL visual rows in the sheet
  var maxDayStr = null; // max Day seen across ALL visual rows in the sheet

  for (var r = 0; r < data.length; r++) {
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
// CURRENT STRUCTURE — reads Current_Pmax + Current_Dgen
// =============================================================

/**
 * Handler for ?tab=current_structure.
 * Reads both sheets, builds the creative list, caches it (10 min),
 * and returns a JSON response.
 */
function handleCurrentStructure(ss) {
  var scriptCache = CacheService.getScriptCache();
  var cacheKey    = "cv_current_structure";

  var cachedStr = getCachedPayload(scriptCache, cacheKey);
  if (cachedStr) {
    return ContentService
      .createTextOutput(cachedStr)
      .setMimeType(ContentService.MimeType.JSON);
  }

  var creatives   = readCurrentStructure(ss);
  var filterOpts  = deriveFilterOptions(creatives);

  var payload = {
    status:         "ok",
    count:          creatives.length,
    creatives:      creatives,
    filter_options: filterOpts,
  };

  var payloadStr = JSON.stringify(payload);
  try { cachePayload(scriptCache, cacheKey, payloadStr, 600); } catch (ce) {}

  return ContentService
    .createTextOutput(payloadStr)
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Reads Current_Pmax and Current_Dgen sheets.
 * Expands each row into one Creative object per Video ID found.
 * Returns a unified array of Creative objects (no performance data).
 */
function readCurrentStructure(ss) {
  var creatives = [];

  // ── Current_Pmax ──────────────────────────────────────────────────────────
  var pmaxSheet = ss.getSheetByName("Current_Pmax");
  if (pmaxSheet && pmaxSheet.getLastRow() > 1) {
    var pmaxData    = pmaxSheet.getRange(1, 1, pmaxSheet.getLastRow(), pmaxSheet.getLastColumn()).getValues();
    var pmaxHeaders = pmaxData[0].map(function(h) { return String(h).trim(); });
    var ph = {};
    pmaxHeaders.forEach(function(h, i) { ph[h] = i; });

    for (var r = 1; r < pmaxData.length; r++) {
      var row = pmaxData[r];
      var campaign = String(row[ph["Campaign"]] || "").trim();
      if (!campaign) continue;

      var campaignType  = String(row[ph["Campaign_Type"]]      || "PMax").trim();
      var location      = String(row[ph["Location"]]           || "").trim();
      var funnel        = String(row[ph["Funnel"]]             || "TOFU").trim();
      var assetGroup    = String(row[ph["Asset Group"]]        || "").trim();
      var headline1     = String(row[ph["Headline 1"]]         || "").trim();
      var description1  = String(row[ph["Description 1"]]     || "").trim();
      var statusRaw     = row[ph["Asset Group Status"]] !== undefined
        ? String(row[ph["Asset Group Status"]] || "").trim()
        : String(row[ph["Campaign Status"]]    || "Enabled").trim();

      // Expand Video IDs 1–15 (each non-empty Video ID = 1 creative card)
      for (var v = 1; v <= 15; v++) {
        var vidKey  = "Video ID " + v;
        if (ph[vidKey] === undefined) continue;
        var videoId = String(row[ph[vidKey]] || "").trim();
        if (!videoId) continue;

        var creativeUrl = "https://www.youtube.com/watch?v=" + videoId;
        var creativeId  = "pmax|" + campaign + "|" + location + "|" + assetGroup + "|" + videoId;

        creatives.push({
          creative_id:    creativeId,
          creative_url:   creativeUrl,
          creative_type:  "Video",
          campaign_name:  campaign,
          campaign_type:  campaignType,
          city:           location,
          funnel:         funnel,
          ad_group:       assetGroup,
          headline:       headline1,
          description:    description1,
          age_group:      "",
          category:       "",
          status:         normalizeStatus(statusRaw),
          source_sheet:   "Current_Pmax",
        });
      }
    }
  }

  // ── Current_Dgen ──────────────────────────────────────────────────────────
  var dgenSheet = ss.getSheetByName("Current_Dgen");
  if (dgenSheet && dgenSheet.getLastRow() > 1) {
    var dgenData    = dgenSheet.getRange(1, 1, dgenSheet.getLastRow(), dgenSheet.getLastColumn()).getValues();
    var dgenHeaders = dgenData[0].map(function(h) { return String(h).trim(); });
    var dh = {};
    dgenHeaders.forEach(function(h, i) { dh[h] = i; });

    for (var r = 1; r < dgenData.length; r++) {
      var row = dgenData[r];
      var campaign = String(row[dh["Campaign"]] || "").trim();
      if (!campaign) continue;

      var campaignType  = String(row[dh["Campaign_Type"]]    || "DGen").trim();
      var location      = String(row[dh["Location"]]         || "").trim();
      var funnel        = String(row[dh["Funnel"]]           || "TOFU").trim();
      var adGroup       = String(row[dh["Ad Group"]]         || "").trim();
      var adName        = String(row[dh["Ad Name"]]          || "").trim();
      var headline1     = String(row[dh["Headline 1"]]       || "").trim();
      var description1  = String(row[dh["Description 1"]]   || "").trim();
      // DGen has a dedicated "Status" column for the ad; fall back to Ad Group Status
      var statusRaw     = row[dh["Status"]] !== undefined
        ? String(row[dh["Status"]] || "").trim()
        : String(row[dh["Ad Group Status"]] || "Enabled").trim();

      // Expand Video IDs 1–5 (each non-empty Video ID = 1 creative card)
      for (var v = 1; v <= 5; v++) {
        var vidKey  = "Video ID " + v;
        if (dh[vidKey] === undefined) continue;
        var videoId = String(row[dh[vidKey]] || "").trim();
        if (!videoId) continue;

        var creativeUrl = "https://www.youtube.com/watch?v=" + videoId;
        var creativeId  = "dgen|" + campaign + "|" + location + "|" + (adGroup || adName) + "|" + videoId;

        creatives.push({
          creative_id:    creativeId,
          creative_url:   creativeUrl,
          creative_type:  "Video",
          campaign_name:  campaign,
          campaign_type:  campaignType,
          city:           location,
          funnel:         funnel,
          ad_group:       adGroup || adName,
          headline:       headline1,
          description:    description1,
          age_group:      "",
          category:       "",
          status:         normalizeStatus(statusRaw),
          source_sheet:   "Current_Dgen",
        });
      }
    }
  }

  return creatives;
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


// =============================================================
// RAW DAILY — returns per-creative-per-day rows for client-side aggregation
// =============================================================

/**
 * Handler for ?tab=raw_daily.
 * Returns a normalised payload:
 *   dimensions  : { [creative_id]: { creative_url, creative_type, ... } }
 *   daily_rows  : [ { creative_id, date, impressions, clicks, cost, conversions } ]
 * The frontend aggregates this in-browser so date range changes are instant.
 */
function handleRawDaily(ss) {
  var scriptCache = CacheService.getScriptCache();
  var cacheKey    = "cv_raw_daily";

  var cachedStr = getCachedPayload(scriptCache, cacheKey);
  if (cachedStr) {
    return ContentService
      .createTextOutput(cachedStr)
      .setMimeType(ContentService.MimeType.JSON);
  }

  var result       = aggregateDailyDumpRaw(ss);
  var filterOpts   = deriveFilterOptionsFromMap(result.dimensions);

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
  // Cache in CacheService (20 min). ScriptProperties skipped — payload is large.
  try { cachePayload(scriptCache, cacheKey, payloadStr, 1200); } catch (ce) {}

  return ContentService
    .createTextOutput(payloadStr)
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Read Daily_dump and return:
 *   dimensions : map of creative_id -> dimension fields (deduplicated)
 *   daily_rows : array of { creative_id, date, impressions, clicks, cost, conversions }
 *   available_date_range : { min, max }
 *
 * NO date filtering — returns ALL rows for ALL time so the frontend can
 * aggregate any range without another network call.
 */
function aggregateDailyDumpRaw(ss) {
  var sheet = ss.getSheetByName("Daily_dump");
  if (!sheet) throw new Error("Sheet 'Daily_dump' not found.");

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { dimensions: {}, daily_rows: [], available_date_range: { min: "", max: "" } };

  // Read only the header row first to identify needed columns.
  var totalCols = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, totalCols).getValues()[0]
    .map(function(h) { return String(h).trim(); });

  var headerIndex = {};
  headers.forEach(function(h, i) { headerIndex[normalizeHeader(h)] = i; });
  function getCol(names) {
    for (var i = 0; i < names.length; i++) {
      var k = normalizeHeader(names[i]);
      if (headerIndex[k] !== undefined) return headerIndex[k];
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
    Cost:          getCol(["Cost"]),
    Conversions:   getCol(["Conversions"]),
    All_conv:      getCol(["All_conv", "All conv", "All conv."]),
  };

  // SPEED OPTIMISATION: Read only columns up to the highest index we need.
  var usedCols = Object.values(COL).filter(function(v) { return v !== undefined; });
  var maxColNeeded = Math.max.apply(null, usedCols) + 1;

  // Read data rows only (skip header, indices are 0-based relative to col 1)
  var data = sheet.getRange(2, 1, lastRow - 1, maxColNeeded).getValues();

  var dimensions   = {};    // creative_id -> dimension object
  var dailyBuckets = {};   // creative_id + "|" + date -> daily metrics
  var minDayStr = null;
  var maxDayStr = null;

  var convCol = COL["Conversions"] !== undefined ? COL["Conversions"] : COL["All_conv"];

  for (var r = 0; r < data.length; r++) {
    var row = data[r];

    // Only visual assets (same filter as aggregateDailyDump)
    var assetRaw = String(row[COL["Asset"]] || "").trim();
    if (!assetRaw) continue;
    var assetUrl  = normalizeAssetUrl(assetRaw);
    var assetType = String(row[COL["Asset_type"]] || "").trim().toUpperCase();
    if (!isVisualAsset(assetUrl, assetType)) continue;

    // Parse day
    var dayDate = parseDayValue(row[COL["Day"]]);
    if (!dayDate) continue;
    var dayStr = formatDate(dayDate);

    // Track min/max across ALL rows
    if (!minDayStr || dayStr < minDayStr) minDayStr = dayStr;
    if (!maxDayStr || dayStr > maxDayStr) maxDayStr = dayStr;

    // Build composite key (same as aggregateDailyDump)
    var location     = String(row[COL["Location"]]      || "").trim();
    var funnel       = String(row[COL["Funnel"]]        || "Unknown").trim() || "Unknown";
    var campaignType = String(row[COL["Campaign_Type"]] || "Unknown").trim() || "Unknown";
    var campaign     = String(row[COL["Campaign"]]      || "").trim();
    var adGroup      = COL["Ad_group"] !== undefined
      ? String(row[COL["Ad_group"]] || "").trim() : "";
    if (!adGroup) adGroup = campaign || "Unknown";
    var assetStatus  = normalizeStatus(String(row[COL["Asset_status"]] || "Enabled").trim());
    var assetKey     = assetUrl && assetUrl.startsWith("http") ? assetUrl : assetRaw;
    if (!assetKey) continue;

    var compositeKey = assetKey + "|" + location + "|" + campaignType + "|" + campaign + "|" + adGroup + "|" + funnel;

    // Store dimension (once per creative_id — last-seen status wins)
    if (!dimensions[compositeKey]) {
      dimensions[compositeKey] = {
        creative_url:  assetUrl && assetUrl.startsWith("http") ? assetUrl : "",
        creative_type: detectCreativeType(assetUrl, assetType),
        campaign_name: campaign,
        campaign_type: campaignType,
        city:          location,
        funnel:        funnel,
        ad_group:      adGroup,
        status:        assetStatus,
      };
    }

    // Daily bucket: aggregate same creative+date (handles duplicate rows in export)
    var dayKey = compositeKey + "|" + dayStr;
    if (!dailyBuckets[dayKey]) {
      dailyBuckets[dayKey] = {
        creative_id:  compositeKey,
        date:         dayStr,
        impressions:  0,
        clicks:       0,
        cost:         0,
        conversions:  0,
      };
    }
    dailyBuckets[dayKey].impressions += toNum(row[COL["Impr"]]);
    dailyBuckets[dayKey].clicks      += toNum(row[COL["Clicks"]]);
    dailyBuckets[dayKey].cost        += toNum(row[COL["Cost"]]);
    dailyBuckets[dayKey].conversions += toNum(row[convCol]);
  }

  // Build daily_rows — drop zero-impression days (noise)
  var daily_rows = [];
  var keys = Object.keys(dailyBuckets);
  for (var k = 0; k < keys.length; k++) {
    var b = dailyBuckets[keys[k]];
    if (b.impressions <= 0) continue;
    daily_rows.push({
      creative_id:  b.creative_id,
      date:         b.date,
      impressions:  round2(b.impressions),
      clicks:       round2(b.clicks),
      cost:         round2(b.cost),
      conversions:  round2(b.conversions),
    });
  }

  return {
    dimensions:           dimensions,
    daily_rows:           daily_rows,
    available_date_range: { min: minDayStr || "", max: maxDayStr || "" },
  };
}

/**
 * Derive filter options from a dimensions MAP (creative_id -> dimension).
 * Same result as deriveFilterOptions() but works on the map structure.
 */
function deriveFilterOptionsFromMap(dimensions) {
  var cities = {}, campaign_types = {}, funnels = {}, statuses = {};
  var keys = Object.keys(dimensions);
  for (var i = 0; i < keys.length; i++) {
    var d = dimensions[keys[i]];
    if (d.city)          cities[d.city]                   = 1;
    if (d.campaign_type) campaign_types[d.campaign_type]  = 1;
    if (d.funnel)        funnels[d.funnel]                = 1;
    if (d.status)        statuses[d.status]               = 1;
  }
  return {
    cities:         Object.keys(cities).sort(),
    campaign_types: Object.keys(campaign_types).sort(),
    funnels:        Object.keys(funnels).sort(),
    categories:     [],
    age_groups:     [],
    statuses:       Object.keys(statuses).sort(),
  };
}
