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
  imageUrlRemote?: string;
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
  imageUrlRemote?: string;
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

export type BattleMode = "classic" | "underdog";

export type BattleFormat =
  | "1v1"
  | "1v1v1"
  | "1v1v1v1"
  | "2v2"
  | "3v3";

export interface BattlePlayerConfig {
  name: string;
  isUser: boolean;
  clientSeed: string;
  counts: number[];
}

export interface BattleConfig {
  format: BattleFormat;
  mode: BattleMode;
  borrowPercent: number;
  cases: CaseDefinition[];
  players: BattlePlayerConfig[];
  roundsPerCase: number;
}

export interface BattlePlayerResult {
  name: string;
  isUser: boolean;
  clientSeed: string;
  teamIndex: number;
  drops: Drop[];
  totalValue: number;
  startNonce: number;
  nonceCount: number;
  entryCost: number;
  net: number;
}

export interface BattleTeamResult {
  index: number;
  playerNames: string[];
  totalValue: number;
  rank: number;
  payout: number;
  delta: number;
  entryCost: number;
  net: number;
}

export interface BattleResult {
  ranAt: number;
  format: BattleFormat;
  mode: BattleMode;
  borrowPercent: number;
  serverSeed: string;
  serverSeedHash: string;
  startNonce: number;
  teamSize: number;
  numTeams: number;
  players: BattlePlayerResult[];
  teams: BattleTeamResult[];
  winnerTeamIndex: number;
  userNet: number;
}

export interface InventoryItem {
  uid: string;
  drop: Drop;
  acquiredAt: number;
  source: "batch" | "realistic" | "battle";
  sourceId: string;
}