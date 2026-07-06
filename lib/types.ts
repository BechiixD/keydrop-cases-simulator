export type Wear = "FN" | "MW" | "FT" | "WW" | "BS";

export type Rarity =
  | "Consumer"
  | "Industrial"
  | "Mil-Spec"
  | "Restricted"
  | "Classified"
  | "Covert"
  | "Knife"
  | "Gloves";

export interface WearTier {
  wear: Wear;
  probability: number;
  value: number;
}

export interface SkinItem {
  id: string;
  name: string;
  imageUrl: string;
  rarity: Rarity;
  statTrak: boolean;
  wears: WearTier[];
  totalProbability: number;
}

export interface CaseDefinition {
  slug: string;
  name: string;
  price: number;
  imageUrl: string;
  items: SkinItem[];
  scrapedAt: number;
}

export interface Drop {
  caseSlug: string;
  skin: SkinItem;
  wear: WearTier;
  value: number;
  nonce: number;
  clientSeed: string;
  serverSeedHash: string;
  ticket: string;
}

export interface BatchResult {
  caseSlug: string;
  caseName: string;
  drops: Drop[];
  count: number;
  totalCost: number;
  totalValue: number;
  net: number;
  roi: number;
  best: Drop;
  worst: Drop;
  freqBySkin: Record<string, number>;
  freqByWear: Record<string, number>;
  freqByRarity: Record<string, number>;
}

export interface MultiBatchResult {
  ranAt: number;
  results: BatchResult[];
  totalCost: number;
  totalValue: number;
  net: number;
  roi: number;
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
  startNonce: number;
}

export interface CaseSelection {
  case: CaseDefinition;
  count: number;
}

export interface CasesCache {
  cases: CaseDefinition[];
  scrapedAt: number;
}