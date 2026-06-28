import type { Creative } from "@/lib/api";
import { MapPin, Layers, Megaphone, FolderTree, Boxes } from "lucide-react";

export type Dim = "city" | "funnel" | "type" | "campaign" | "adgroup";

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
};

export const ALL_DIMS: Dim[] = ["city", "funnel", "type", "campaign", "adgroup"];

export const DEFAULT_HIERARCHY: Dim[] = ["city", "funnel", "type", "campaign", "adgroup"];

export const HIERARCHY_PRESETS: { id: string; label: string; dims: Dim[] }[] = [
  { id: "loc-fnl-type", label: "Location › Funnel › Type", dims: ["city", "funnel", "type", "campaign", "adgroup"] },
  { id: "fnl-loc-type", label: "Funnel › Location › Type", dims: ["funnel", "city", "type", "campaign", "adgroup"] },
  { id: "type-fnl-loc", label: "Type › Funnel › Location", dims: ["type", "funnel", "city", "campaign", "adgroup"] },
];
