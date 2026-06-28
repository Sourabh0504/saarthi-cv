import type { Creative } from "@/lib/api";
import { MapPin, Layers, Megaphone, FolderTree, Boxes, Sparkles } from "lucide-react";

export type Dim = "city" | "funnel" | "type" | "campaign" | "adgroup" | "creative";

export const DIM_META: Record<Dim, {
  label: string;
  short: string;
  get: (c: Creative) => string;
  icon: React.ComponentType<{ className?: string }>;
}> = {
  city:     { label: "Location",  short: "LOC",  get: c => c.city,          icon: MapPin },
  funnel:   { label: "Funnel",    short: "FNL",  get: c => c.funnel,        icon: Layers },
  type:     { label: "Type",      short: "TYPE", get: c => c.campaign_type, icon: Megaphone },
  campaign: { label: "Campaign",  short: "CAMP", get: c => c.campaign_name, icon: FolderTree },
  adgroup:  { label: "Ad Group",  short: "AG",   get: c => c.ad_group,      icon: Boxes },
  creative: { label: "Creative",  short: "CR",   get: c => c.headline || c.creative_url || c.creative_id, icon: Sparkles },
};

export const ALL_DIMS: Dim[] = ["city", "funnel", "type", "campaign", "adgroup", "creative"];

export const DEFAULT_HIERARCHY: Dim[] = ["city", "funnel", "type", "campaign", "adgroup", "creative"];

export const HIERARCHY_PRESETS: { id: string; label: string; dims: Dim[] }[] = [
  { id: "loc-fnl-type", label: "Location › Funnel › Type", dims: ["city", "funnel", "type", "campaign", "adgroup", "creative"] },
  { id: "fnl-loc-type", label: "Funnel › Location › Type", dims: ["funnel", "city", "type", "campaign", "adgroup", "creative"] },
  { id: "type-fnl-loc", label: "Type › Funnel › Location", dims: ["type", "funnel", "city", "campaign", "adgroup", "creative"] },
  { id: "creative-first", label: "Creative First", dims: ["creative", "city", "funnel", "type", "campaign", "adgroup"] },
];

