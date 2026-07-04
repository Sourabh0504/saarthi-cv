/**
 * frontend/src/lib/changeTaxonomy.ts
 * ====================================
 * The standardized Change Category → Change Type taxonomy from
 * Changelogfeature.md §6. Kept as one shared constant so the Change
 * Documentation Form and any future History Viewer/Timeline/Reporting
 * UI all read from the same fixed list — reporting integrity depends on
 * these being consistent, not freeform per submission.
 */

export const CHANGE_TAXONOMY: Record<string, string[]> = {
  "Budget": [
    "Daily Budget Increased", "Daily Budget Decreased", "Budget Pacing Method Changed",
    "Shared Budget Assigned", "Shared Budget Removed", "Campaign Budget Removed/Paused",
  ],
  "Bid Strategy": [
    "Strategy Changed", "Target CPA Updated", "Target ROAS Updated",
    "Max CPC Updated", "Bid Adjustment Added", "Bid Adjustment Removed",
  ],
  "Keywords": [
    "Keyword Added", "Keyword Removed", "Match Type Changed",
    "Keyword Bid Updated", "Keyword Paused", "Keyword Enabled",
  ],
  "Negative Keywords": [
    "Negative Keyword Added", "Negative Keyword Removed",
    "Negative Keyword List Applied", "Negative Keyword List Removed",
  ],
  "Audience": [
    "Audience Added", "Audience Removed", "Audience Bid Adjustment Changed",
    "Targeting Setting Changed (Observation ↔ Targeting)",
  ],
  "Placements": [
    "Placement Added", "Placement Excluded", "Placement Bid Adjustment Changed",
  ],
  "Geo": [
    "Location Added", "Location Excluded", "Location Bid Adjustment Changed",
    "Location Targeting Setting Changed",
  ],
  "Devices": [
    "Device Bid Adjustment Changed", "Device Excluded",
  ],
  "Ads": [
    "Ad Created", "Ad Paused", "Ad Enabled", "Ad Removed", "Ad Copy Updated",
  ],
  "Assets": [
    "Asset Added", "Asset Removed", "Asset Updated",
  ],
  "Extensions": [
    "Extension Added", "Extension Removed", "Extension Updated",
  ],
  "Labels": [
    "Label Applied", "Label Removed",
  ],
  "Campaign Settings": [
    "Campaign Renamed", "Network Setting Changed", "Ad Rotation Setting Changed",
    "URL Options Changed", "Status Changed",
  ],
  "Tracking": [
    "Tracking Template Updated", "UTM Parameters Updated", "Third-Party Tracking Linked",
  ],
  "Conversion": [
    "Conversion Action Added", "Conversion Action Removed",
    "Conversion Goal Changed", "Attribution Model Changed",
  ],
  "Schedule": [
    "Ad Schedule Added", "Ad Schedule Removed", "Dayparting Updated",
  ],
  "Creative": [
    "New Creative Uploaded", "Creative Replaced", "Creative Paused",
  ],
  "Feed": [
    "Feed Updated", "Feed Rule Added", "Feed Item Issue Resolved",
  ],
  "Merchant Center": [
    "Product Feed Synced", "Product Disapproval Resolved", "Merchant Center Account Linked",
  ],
  "Performance Max Assets": [
    "Asset Group Created", "Asset Group Updated",
    "Audience Signal Updated", "Listing Group Updated",
  ],
  "App Campaign": [
    "App Asset Updated", "App Campaign Goal Changed",
  ],
  "Shopping": [
    "Product Group Updated", "Priority Changed", "Shopping Feed Linked",
  ],
  "Video": [
    "Video Ad Added", "Video Creative Updated", "Skippable Setting Changed",
  ],
  "Demand Gen": [
    "Demand Gen Asset Updated", "Demand Gen Audience Updated",
  ],
  "Custom Changes": [],
  "Others": [],
};

export const CHANGE_CATEGORIES = Object.keys(CHANGE_TAXONOMY);

export const PRIORITIES = ["Low", "Medium", "High", "Critical"] as const;
export type Priority = typeof PRIORITIES[number];
