export type CreativeType = "Image" | "Video" | "Text";
export type Funnel = "TOFU" | "MOFU";
export type Status = "Enabled" | "Paused";

export interface Creative {
  creative_id: string;
  creative_url: string;
  creative_type: CreativeType;
  campaign_name: string;
  funnel: Funnel;
  campaign_type: string;
  ad_group: string;
  city: string;
  age_group: string;
  category: string;
  headline?: string;
  description?: string;
  status: Status;
}

export interface DailyRow {
  date: string;
  creative_id: string;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
}

const jewelryImages = [
  "https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=800&q=80",
  "https://images.unsplash.com/photo-1611591437281-460bfbe1220a?w=800&q=80",
  "https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=800&q=80",
  "https://images.unsplash.com/photo-1602173574767-37ac01994b2a?w=800&q=80",
  "https://images.unsplash.com/photo-1535632787350-4e68ef0ac584?w=800&q=80",
  "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=800&q=80",
  "https://images.unsplash.com/photo-1573408301185-9146fe634ad0?w=800&q=80",
  "https://images.unsplash.com/photo-1617038260897-41a1f14a8ca0?w=800&q=80",
  "https://images.unsplash.com/photo-1599643477877-530eb83abc8e?w=800&q=80",
  "https://images.unsplash.com/photo-1606760227091-3dd870d97f1d?w=800&q=80",
  "https://images.unsplash.com/photo-1588444837495-c6cfeb53f32d?w=800&q=80",
  "https://images.unsplash.com/photo-1620656798932-902a9b6a8b51?w=800&q=80",
];

const ytIds = ["dQw4w9WgXcQ", "ScMzIvxBSi4", "kJQP7kiw5Fk", "3JZ_D3ELwOQ"];

// Hierarchy: City > Funnel > CampaignType > Campaign > AdGroup/AssetGroup > Creative
// Cities: Bangalore, Hyderabad, Noida, NCR
type Seed = {
  city: string;
  funnel: Funnel;
  campaign_type: string;
  campaign: string;
  ad_group: string;
  items: Array<Partial<Creative> & { creative_type: CreativeType; headline?: string; description?: string; status?: Status; asset?: number }>;
};

const seeds: Seed[] = [
  // BANGALORE
  { city: "Bangalore", funnel: "TOFU", campaign_type: "PMax", campaign: "BLR_TOFU_PMax_Bridal", ad_group: "AssetGroup · Bridal Hero",
    items: [
      { creative_type: "Image", asset: 0, headline: "Discover Bridal Brilliance", category: "Bridal", age_group: "25-34" },
      { creative_type: "Image", asset: 1, headline: "The Polki Edit", category: "Bridal", age_group: "25-34" },
      { creative_type: "Video", asset: 0, headline: "From Mehndi to Vidaai", category: "Bridal", age_group: "25-34" },
    ]},
  { city: "Bangalore", funnel: "TOFU", campaign_type: "Video", campaign: "BLR_TOFU_Video_Fashion", ad_group: "AdGroup · Layered Look",
    items: [
      { creative_type: "Video", asset: 1, headline: "Glow This Season", category: "Fashion", age_group: "18-34" },
      { creative_type: "Video", asset: 2, headline: "The Layered Look", category: "Fashion", age_group: "18-34" },
    ]},
  { city: "Bangalore", funnel: "MOFU", campaign_type: "Search", campaign: "BLR_MOFU_Search_Rings", ad_group: "AdGroup · Solitaires",
    items: [
      { creative_type: "Text", headline: "Shop Diamond Rings Online", description: "Certified diamonds. Free shipping & lifetime exchange.", category: "Rings", age_group: "25-44" },
      { creative_type: "Text", headline: "Solitaire Rings — Starting ₹25k", description: "GIA-certified. Try at home. EMI from ₹999/mo.", category: "Rings", age_group: "25-44" },
    ]},
  { city: "Bangalore", funnel: "MOFU", campaign_type: "PMax", campaign: "BLR_MOFU_PMax_Everyday", ad_group: "AssetGroup · Office to Evening",
    items: [
      { creative_type: "Image", asset: 9, headline: "Office to Evening", category: "Everyday", age_group: "25-34", status: "Paused" },
      { creative_type: "Image", asset: 10, headline: "Everyday Gold", category: "Everyday", age_group: "25-34" },
    ]},

  // HYDERABAD
  { city: "Hyderabad", funnel: "TOFU", campaign_type: "PMax", campaign: "HYD_TOFU_PMax_Luxury", ad_group: "AssetGroup · Heirloom",
    items: [
      { creative_type: "Image", asset: 4, headline: "Heirloom Gold", category: "Luxury", age_group: "35-50" },
      { creative_type: "Image", asset: 5, headline: "The Chain Edit", category: "Luxury", age_group: "35-50" },
    ]},
  { city: "Hyderabad", funnel: "MOFU", campaign_type: "PMax", campaign: "HYD_MOFU_PMax_Bridal", ad_group: "AssetGroup · Bridal Lookbook",
    items: [
      { creative_type: "Image", asset: 6, headline: "Bridal Set Lookbook", category: "Bridal", age_group: "25-34" },
      { creative_type: "Image", asset: 7, headline: "Polki Magic", category: "Bridal", age_group: "25-34" },
      { creative_type: "Video", asset: 3, headline: "Wedding Stories", category: "Bridal", age_group: "25-34" },
    ]},
  { city: "Hyderabad", funnel: "MOFU", campaign_type: "Search", campaign: "HYD_MOFU_Search_Necklaces", ad_group: "AdGroup · Gold Necklaces",
    items: [
      { creative_type: "Text", headline: "Gold Necklaces — Free Shipping", description: "Hallmarked 22K gold. EMI from ₹999/month.", category: "Necklaces", age_group: "35-50" },
    ]},

  // NOIDA
  { city: "Noida", funnel: "TOFU", campaign_type: "Display", campaign: "NOIDA_TOFU_Display_Fashion", ad_group: "AdGroup · Trendy Drops",
    items: [
      { creative_type: "Image", asset: 2, headline: "Trendy Drops '26", category: "Fashion", age_group: "18-24" },
      { creative_type: "Image", asset: 3, headline: "Stack It Up", category: "Fashion", age_group: "18-24" },
    ]},
  { city: "Noida", funnel: "MOFU", campaign_type: "Search", campaign: "NOIDA_MOFU_Search_Bridal", ad_group: "AdGroup · Bridal Sets",
    items: [
      { creative_type: "Text", headline: "Bridal Necklace Collections", description: "Crafted by master artisans. Book a virtual try-on.", category: "Bridal", age_group: "25-44" },
      { creative_type: "Text", headline: "Complete Bridal Sets", description: "Necklace + Earrings + Bangles. Up to 15% off making.", category: "Bridal", age_group: "25-44" },
    ]},

  // NCR
  { city: "NCR", funnel: "TOFU", campaign_type: "PMax", campaign: "NCR_TOFU_PMax_Bridal", ad_group: "AssetGroup · Solitaire Stories",
    items: [
      { creative_type: "Image", asset: 8, headline: "Solitaire Stories", category: "Bridal", age_group: "25-34" },
      { creative_type: "Image", asset: 11, headline: "Bridal Edit '26", category: "Bridal", age_group: "25-34", status: "Paused" },
    ]},
  { city: "NCR", funnel: "TOFU", campaign_type: "Video", campaign: "NCR_TOFU_Video_Luxury", ad_group: "AdGroup · Hero Films",
    items: [
      { creative_type: "Video", asset: 0, headline: "Crafted For You", category: "Luxury", age_group: "30-50" },
    ]},
  { city: "NCR", funnel: "MOFU", campaign_type: "Search", campaign: "NCR_MOFU_Search_Rings", ad_group: "AdGroup · Engagement Rings",
    items: [
      { creative_type: "Text", headline: "Engagement Rings — Lifetime Exchange", description: "Certified diamonds. Try 3 at home, free.", category: "Rings", age_group: "25-44" },
    ]},
];

export const creatives: Creative[] = seeds.flatMap((s, si) =>
  s.items.map((it, ii) => {
    const id = `cr_${String(si + 1).padStart(2, "0")}_${ii + 1}`;
    let url = "";
    if (it.creative_type === "Image") url = jewelryImages[(it.asset ?? 0) % jewelryImages.length];
    else if (it.creative_type === "Video") url = `https://www.youtube.com/watch?v=${ytIds[(it.asset ?? 0) % ytIds.length]}`;
    else url = "https://www.example.com/";
    return {
      creative_id: id,
      creative_url: url,
      creative_type: it.creative_type,
      campaign_name: s.campaign,
      funnel: s.funnel,
      campaign_type: s.campaign_type,
      ad_group: s.ad_group,
      city: s.city,
      age_group: it.age_group ?? "25-34",
      category: it.category ?? "General",
      headline: it.headline,
      description: it.description,
      status: it.status ?? "Enabled",
    };
  })
);

function seedRandom(seed: number) {
  let s = seed;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

function generateDaily(): DailyRow[] {
  const rows: DailyRow[] = [];
  const today = new Date();
  for (let i = 0; i < creatives.length; i++) {
    const c = creatives[i];
    const rand = seedRandom(i * 137 + 7);
    const baseImpr = c.creative_type === "Text" ? 1200 : c.creative_type === "Video" ? 18000 : 8000;
    const baseCtr = c.creative_type === "Text" ? 0.08 : c.creative_type === "Video" ? 0.012 : 0.018;
    const baseCpc = c.funnel === "MOFU" ? 80 : 35;
    const convRate = c.funnel === "MOFU" ? 0.035 : 0.008;
    for (let d = 29; d >= 0; d--) {
      const date = new Date(today);
      date.setDate(today.getDate() - d);
      const day = date.toISOString().slice(0, 10);
      if (c.status === "Paused" && d < 10) continue;
      const noise = 0.6 + rand() * 0.9;
      const impressions = Math.round(baseImpr * noise);
      const clicks = Math.round(impressions * baseCtr * (0.7 + rand() * 0.7));
      const cost = +(clicks * baseCpc * (0.8 + rand() * 0.5)).toFixed(2);
      const conversions = +(clicks * convRate * (0.5 + rand() * 1.2)).toFixed(2);
      rows.push({ date: day, creative_id: c.creative_id, impressions, clicks, cost, conversions });
    }
  }
  return rows;
}

export const dailyPerformance: DailyRow[] = generateDaily();

export const cities = ["Bangalore", "Hyderabad", "Noida", "NCR"];
export const campaignTypes = Array.from(new Set(creatives.map(c => c.campaign_type))).sort();
