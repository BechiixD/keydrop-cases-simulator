import type { CaseDefinition, Rarity, SkinItem, Wear } from "@/lib/types";

export const RARITY_COLORS: Record<Rarity, string> = {
  Consumer: "#b0c3d9",
  Industrial: "#5e98d9",
  "Mil-Spec": "#4b69ff",
  Restricted: "#8847ff",
  Classified: "#d32ce6",
  Covert: "#eb4b4b",
  Knife: "#e4ae39",
  Gloves: "#e4ae39",
};

export const RARITY_BG: Record<Rarity, string> = {
  Consumer: "rgba(176,195,217,0.12)",
  Industrial: "rgba(94,152,217,0.14)",
  "Mil-Spec": "rgba(75,105,255,0.16)",
  Restricted: "rgba(136,71,255,0.16)",
  Classified: "rgba(211,44,230,0.16)",
  Covert: "rgba(235,75,75,0.16)",
  Knife: "rgba(228,174,57,0.16)",
  Gloves: "rgba(228,174,57,0.16)",
};

export const WEAR_COLORS: Record<Wear, string> = {
  FN: "#5fd6a8",
  MW: "#8ec34a",
  FT: "#d6a14a",
  WW: "#a47847",
  BS: "#c4504a",
};

export const WEAR_ORDER: Wear[] = ["FN", "MW", "FT", "WW", "BS"];

export const RARITY_RANK: Record<Rarity, number> = {
  Consumer: 0,
  Industrial: 1,
  "Mil-Spec": 2,
  Restricted: 3,
  Classified: 4,
  Covert: 5,
  Knife: 6,
  Gloves: 6,
};

export function maxRarityOfCase(c: CaseDefinition): Rarity {
  let best: Rarity = "Consumer";
  let rank = -1;
  for (const it of c.items) {
    const r = RARITY_RANK[it.rarity];
    if (r > rank) {
      rank = r;
      best = it.rarity;
    }
  }
  return best;
}

export function caseRarestSkin(c: CaseDefinition): SkinItem | null {
  let best: SkinItem | null = null;
  let rank = -1;
  for (const it of c.items) {
    const r = RARITY_RANK[it.rarity];
    if (r > rank) {
      rank = r;
      best = it;
    }
  }
  return best;
}

export function rarityColor(r: Rarity): string {
  return RARITY_COLORS[r] ?? "#888";
}