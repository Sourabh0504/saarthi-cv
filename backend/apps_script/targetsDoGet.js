// ============================================================
// Saarthi -- Account Targets Apps Script Web App (v1)
// ============================================================
// SHEET REQUIRED: "Targets" tab, header row (exact, case-sensitive):
//   Account_ID | Month | Target_Leads | Target_Spend
//
//   Month format: "YYYY-MM" (e.g. "2026-07"). One row per account per month.
//   Hand-edited by whoever owns account targets -- this script is read-only
//   on purpose; there is no write/append action here.
//
// DEPLOYMENT SETTINGS:
//   Execute as: Me (your Google account)
//   Who has access: Anyone
//
// ENDPOINT:
//   GET ?account_id=acc_aukera&month=2026-07  → that account's target for that month, or not_found
// ============================================================

var SHEET_NAME = "Targets";
var HEADER = ["Account_ID", "Month", "Target_Leads", "Target_Spend"];

function _sheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error("Sheet '" + SHEET_NAME + "' not found.");
  return sheet;
}

function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ── One-time setup helper — run this manually from the Apps Script editor ──
function setupTargetsSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADER);
    sheet.setFrozenRows(1);
  }
  Logger.log("Targets sheet ready. Add one row per account per month.");
}

function doGet(e) {
  try {
    var params = e.parameter || {};
    var accountId = params.account_id ? String(params.account_id).trim() : "";
    var month = params.month ? String(params.month).trim() : "";
    if (!accountId || !month) {
      return _json({ status: "error", message: "account_id and month (YYYY-MM) are both required." });
    }

    var sheet = _sheet();
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return _json({ status: "ok", found: false });

    var header = data[0];
    var colIndex = {};
    for (var h = 0; h < header.length; h++) colIndex[String(header[h]).trim()] = h;

    var accCol = colIndex["Account_ID"];
    var monthCol = colIndex["Month"];
    var leadsCol = colIndex["Target_Leads"];
    var spendCol = colIndex["Target_Spend"];

    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      if (String(row[accCol]).trim() === accountId && String(row[monthCol]).trim() === month) {
        return _json({
          status: "ok",
          found: true,
          account_id: accountId,
          month: month,
          target_leads: Number(row[leadsCol]) || 0,
          target_spend: Number(row[spendCol]) || 0,
        });
      }
    }

    return _json({ status: "ok", found: false });
  } catch (err) {
    return _json({ status: "error", message: String(err) });
  }
}
