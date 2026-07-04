// ============================================================
// Saarthi -- Change History Apps Script Web App (v1, account-scoped)
// ============================================================
// SHEET REQUIRED: "Change_History" tab, header row (exact, case-sensitive):
//   Change_ID | Timestamp | Account_ID | Account_Name | Change_Category |
//   Change_Type | Previous_Value | New_Value | Reason | Expected_Impact |
//   Performed_By | Notes | Priority | Approval_Status
//
// This is a deliberately simplified v1 of the Change History design in
// Changelogfeature.md: scoped to ACCOUNT_ID, not CAMPAIGN_ID, because
// Saarthi has no Campaign Master data source yet. Upgrading to per-campaign
// granularity later means adding Campaign_ID/Campaign_Name columns and a
// campaign lookup -- it does not require re-architecting this sheet.
//
// IMMUTABILITY: this script only ever APPENDS rows (doPost) or READS rows
// (doGet). There is no update-by-row or delete-by-row action exposed here,
// on purpose -- see Changelogfeature.md §15.2. If a correction is needed,
// append a new row referencing the one it corrects in Notes.
//
// DEPLOYMENT SETTINGS:
//   Execute as: Me (your Google account)
//   Who has access: Anyone
//
// ENDPOINTS:
//   GET  ?account_id=acc_aukera&limit=20   → most recent N changes for that account
//   POST { account_id, account_name, change_category, change_type,
//          previous_value, new_value, reason, expected_impact,
//          performed_by, notes, priority }  → appends one immutable row
// ============================================================

var SHEET_NAME = "Change_History";
var HEADER = [
  "Change_ID", "Timestamp", "Account_ID", "Account_Name", "Change_Category",
  "Change_Type", "Previous_Value", "New_Value", "Reason", "Expected_Impact",
  "Performed_By", "Notes", "Priority", "Approval_Status",
];

function _sheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error("Sheet '" + SHEET_NAME + "' not found.");
  return sheet;
}

function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function _error(message) {
  return _json({ status: "error", message: message });
}

// ── One-time setup helper — run this manually from the Apps Script editor ──
function setupChangeHistorySheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADER);
    sheet.setFrozenRows(1);
  }
  Logger.log("Change_History sheet ready.");
}

// ── GET: list recent changes for one account ────────────────────────────
function doGet(e) {
  try {
    var params = e.parameter || {};
    var accountId = params.account_id ? String(params.account_id).trim() : "";
    if (!accountId) return _error("account_id is required.");

    var limit = params.limit ? parseInt(params.limit, 10) : 50;
    if (isNaN(limit) || limit <= 0) limit = 50;

    var sheet = _sheet();
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return _json({ status: "ok", changes: [] });

    var header = data[0];
    var colIndex = {};
    for (var h = 0; h < header.length; h++) colIndex[String(header[h]).trim()] = h;

    var accountIdCol = colIndex["Account_ID"];
    if (accountIdCol === undefined) return _error("Header row missing 'Account_ID' column.");

    var rows = [];
    for (var i = data.length - 1; i >= 1 && rows.length < limit; i--) {
      var row = data[i];
      if (String(row[accountIdCol]).trim() !== accountId) continue;
      var record = {};
      for (var col in colIndex) {
        var val = row[colIndex[col]];
        record[col.toLowerCase()] = (val instanceof Date) ? val.toISOString() : val;
      }
      rows.push(record);
    }

    return _json({ status: "ok", changes: rows });
  } catch (err) {
    return _error(String(err));
  }
}

// ── POST: append one immutable change record ────────────────────────────
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents || "{}");

    var required = ["account_id", "account_name", "change_category", "change_type", "reason", "performed_by"];
    for (var r = 0; r < required.length; r++) {
      if (!body[required[r]]) return _error("Missing required field: " + required[r]);
    }

    var sheet = _sheet();
    if (sheet.getLastRow() === 0) sheet.appendRow(HEADER); // self-heal if setup was skipped

    var changeId = "CH-" + Utilities.getUuid().split("-")[0].toUpperCase();
    var timestamp = new Date().toISOString();

    sheet.appendRow([
      changeId,
      timestamp,
      body.account_id,
      body.account_name,
      body.change_category,
      body.change_type,
      body.previous_value || "",
      body.new_value || "",
      body.reason,
      body.expected_impact || "",
      body.performed_by,
      body.notes || "",
      body.priority || "Medium",
      body.approval_status || "Not Required",
    ]);

    return _json({
      status: "ok",
      change_id: changeId,
      timestamp: timestamp,
    });
  } catch (err) {
    return _error(String(err));
  }
}
