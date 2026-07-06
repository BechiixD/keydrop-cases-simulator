import type {
  CaseDefinition,
  SkinItem,
  Wear,
  WearTier,
  Rarity,
} from "@/lib/types";

export type NormalizeWarning = {
  caseSlug: string;
  kind: "probability_drift" | "wear_mismatch" | "missing_field";
  message: string;
};

type Loose = Record<string, unknown>;

const WEARS: Wear[] = ["FN", "MW", "FT", "WW", "BS"];

const RARITY_MAP: Record<string, Rarity> = {
  consumer: "Consumer",
  industrial: "Industrial",
  milspec: "Mil-Spec",
  "mil-spec": "Mil-Spec",
  restricted: "Restricted",
  classified: "Classified",
  covert: "Covert",
  knife: "Knife",
  gloves: "Gloves",
};

/** keydrop `color` field → CS2 rarity. */
const COLOR_RARITY: Record<string, Rarity> = {
  gold: "Knife",
  red: "Covert",
  pink: "Classified",
  violet: "Restricted",
  purple: "Restricted",
  blue: "Mil-Spec",
  "light-blue": "Industrial",
  "lightblue": "Industrial",
  white: "Consumer",
  silver: "Consumer",
  gray: "Consumer",
};

function asNumber(v: unknown): number {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? (n as number) : 0;
}

function mapRarity(v: unknown): Rarity {
  const key = String(v ?? "").toLowerCase().trim();
  return RARITY_MAP[key] ?? "Mil-Spec";
}

function mapWear(v: unknown): Wear | null {
  const s = String(v ?? "").toUpperCase().trim();
  return WEARS.includes(s as Wear) ? (s as Wear) : null;
}

function rarityFromColor(color: unknown, fullTitle: string): Rarity {
  const c = String(color ?? "").toLowerCase().trim();
  if (c === "gold") {
    return /gloves/i.test(fullTitle) ? "Gloves" : "Knife";
  }
  return COLOR_RARITY[c] ?? "Mil-Spec";
}

/**
 * Detect keydrop's real case JSON envelope:
 *   { status: true, data: { title, slug, price, items: [{ fullTitle, color, pfPercent, pf: [{ rarity, price, odds }] }] } }
 * Also accepts the inner `data` object directly, or arrays of either.
 */
function unwrapKeydropEnvelope(input: Loose): Loose | null {
  if (input && typeof input === "object" && "status" in input && "data" in input) {
    const d = (input as { data: unknown }).data;
    if (d && typeof d === "object" && "items" in (d as object)) {
      return d as Loose;
    }
  }
  if (input && typeof input === "object" && "items" in input && "pfUpdatedAt" in input) {
    return input;
  }
  return null;
}

function isKeydropItem(it: Loose): boolean {
  return Array.isArray(it.pf) && typeof it.fullTitle === "string";
}

/**
 * Convert one keydrop-shaped case into our CaseDefinition.
 * Probabilities arrive in percent; we store them as fractions (0..1).
 */
function normalizeKeydropCase(
  rawCase: Loose,
  warnings: NormalizeWarning[],
): CaseDefinition {
  const slug =
    String(rawCase.slug ?? rawCase.id ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-") || "unknown-case";
  const name = String(rawCase.title ?? rawCase.name ?? slug);
  const price = asNumber(rawCase.price);
  const imageUrl = String(rawCase.coverImg ?? rawCase.imageUrl ?? rawCase.image ?? "");
  const rawItems = (Array.isArray(rawCase.items) ? rawCase.items : []) as Loose[];

  const items: SkinItem[] = rawItems.map((it) => {
    const fullTitle = String(it.fullTitle ?? it.title ?? "Unknown skin");
    const statTrak = /stattrak/i.test(fullTitle) || Boolean(it.statTrak ?? it.isStatTrak);
    const cleanTitle = fullTitle.replace(/^StatTrak[\u2122\u2122]? ?/i, "").replace(/\s+/g, " ").trim();
    const idBase = String(it.id ?? it.productID ?? cleanTitle)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-");
    const id = idBase + (statTrak ? "-st" : "");
    const rarity = rarityFromColor(it.color, fullTitle);
    const totalProbability = asNumber(it.pfPercent) / 100;
    const pfTiers = (Array.isArray(it.pf) ? it.pf : []) as Loose[];
    const wears: WearTier[] = pfTiers
      .map((w): WearTier | null => {
        const wear = mapWear(w.rarity);
        if (!wear) return null;
        return {
          wear,
          probability: asNumber(w.odds) / 100,
          value: Math.max(0, asNumber(w.price)),
        };
      })
      .filter((x): x is WearTier => x !== null);

    const wearProbSum = wears.reduce((a, w) => a + w.probability, 0);
    if (Math.abs(wearProbSum - totalProbability) > 0.0001) {
      warnings.push({
        caseSlug: slug,
        kind: "wear_mismatch",
        message: `skin ${cleanTitle}: sum(pf.odds)=${wearProbSum.toFixed(
          6,
        )} != pfPercent=${totalProbability.toFixed(6)}`,
      });
    }

    return {
      id,
      name: statTrak ? `StatTrak\u2122 ${cleanTitle}` : cleanTitle,
      imageUrl: String(it.icon ?? it.imageUrl ?? it.image ?? ""),
      rarity,
      statTrak,
      wears,
      totalProbability,
    };
  });

  const totalProb = items.reduce((a, s) => a + s.totalProbability, 0);
  if (Math.abs(totalProb - 1) > 0.01) {
    warnings.push({
      caseSlug: slug,
      kind: "probability_drift",
      message: `case ${slug}: total probability ${totalProb.toFixed(
        6,
      )} drifts from 1.0 by ${Math.abs(totalProb - 1).toFixed(6)}`,
    });
  }

  return {
    slug,
    name,
    price,
    imageUrl,
    scrapedAt: typeof rawCase.scrapedAt === "number" ? rawCase.scrapedAt : Date.now(),
    items,
  };
}

/** Legacy / generic shape (used for the fictional phoenix-box and any ad-hoc paste). */
function normalizeWears(
  rawWears: unknown,
  skinTotal: number,
): WearTier[] {
  const arr = Array.isArray(rawWears) ? (rawWears as Loose[]) : [];
  const tiers: WearTier[] = [];
  for (const entry of arr) {
    const wear = mapWear(entry.wear);
    if (!wear) continue;
    const value = Math.max(0, asNumber(entry.price ?? entry.value));
    tiers.push({ wear, probability: 0, value });
  }
  if (tiers.length === 0) {
    for (const wear of WEARS) {
      tiers.push({ wear, probability: 0, value: 0 });
    }
    return tiers;
  }
  let wearShareSum = 0;
  const explicitWearShares = arr
    .map((entry): number => asNumber(entry.chance ?? entry.probability))
    .filter((n) => n > 0);
  if (explicitWearShares.length === tiers.length) {
    const totalShare = explicitWearShares.reduce((a, b) => a + b, 0);
    for (let i = 0; i < tiers.length; i++) {
      const share = totalShare > 0 ? explicitWearShares[i] / totalShare : 0;
      tiers[i].probability = skinTotal * share;
      wearShareSum += share;
    }
  } else {
    const even = 1 / tiers.length;
    for (const t of tiers) {
      t.probability = skinTotal * even;
      wearShareSum += even;
    }
  }
  void wearShareSum;
  return tiers;
}

function normalizeSkinGeneric(raw: Loose): SkinItem {
  const statTrak = Boolean(raw.statTrak ?? raw.stattrak ?? raw.is_stattrak);
  const name = String(raw.name ?? raw.short_name ?? "Unknown skin");
  const baseId = String(raw.id ?? raw.slug ?? name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
  const id = baseId + (statTrak ? "-st" : "");
  const totalProbability = asNumber(raw.chance ?? raw.probability);
  const wears = normalizeWears(raw.wears ?? raw.wear_tiers, totalProbability);
  return {
    id,
    name: (statTrak ? "StatTrak\u2122 " : "") + name,
    imageUrl: String(raw.imageUrl ?? raw.image ?? ""),
    rarity: mapRarity(raw.rarity ?? raw.tier),
    statTrak,
    wears,
    totalProbability,
  };
}

function normalizeCaseGeneric(
  raw: Loose,
  warnings: NormalizeWarning[],
): CaseDefinition {
  const slug =
    String(raw.slug ?? raw.id ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-") || "unknown-case";
  const rawItems = (Array.isArray(raw.items ?? raw.skins)
    ? (raw.items ?? raw.skins)
    : []) as Loose[];
  const items = rawItems.map((it) => normalizeSkinGeneric(it));
  const totalProb = items.reduce((a, s) => a + s.totalProbability, 0);
  if (Math.abs(totalProb - 1) > 0.01) {
    warnings.push({
      caseSlug: slug,
      kind: "probability_drift",
      message: `case ${slug}: total probability ${totalProb.toFixed(
        6,
      )} drifts from 1.0 by ${Math.abs(totalProb - 1).toFixed(6)}`,
    });
  }
  return {
    slug,
    name: String(raw.name ?? raw.title ?? slug),
    price: asNumber(raw.price ?? raw.cost),
    imageUrl: String(raw.imageUrl ?? raw.image ?? ""),
    scrapedAt: typeof raw.scrapedAt === "number" ? raw.scrapedAt : Date.now(),
    items,
  };
}

export function normalizeCase(
  raw: Loose,
  warnings: NormalizeWarning[] = [],
): CaseDefinition {
  if (Array.isArray(raw.items) && raw.items.length > 0 && isKeydropItem(raw.items[0] as Loose)) {
    return normalizeKeydropCase(raw, warnings);
  }
  return normalizeCaseGeneric(raw, warnings);
}

export function normalizeScrape(
  rawCases: unknown,
  warnings: NormalizeWarning[] = [],
): CaseDefinition[] {
  const arr = (Array.isArray(rawCases) ? rawCases : []) as Loose[];
  const out: CaseDefinition[] = [];
  for (const entry of arr) {
    const unwrapped = unwrapKeydropEnvelope(entry) ?? entry;
    out.push(normalizeCase(unwrapped, warnings));
  }
  return out;
}

/** Accept either an array, a single case object, or a keydrop envelope, possibly wrapped. */
export function normalizeInput(
  input: unknown,
  warnings: NormalizeWarning[] = [],
): CaseDefinition[] {
  if (input == null) return [];
  if (Array.isArray(input)) {
    return normalizeScrape(input, warnings);
  }
  if (typeof input === "object") {
    const env = unwrapKeydropEnvelope(input as Loose);
    if (env) {
      const list = (env as { items?: unknown }).items;
      if (Array.isArray(list) && list.length > 0 && isKeydropItem((list as Loose[])[0])) {
        return [normalizeKeydropCase(env, warnings)];
      }
    }
    if ((input as { cases?: unknown }).cases && Array.isArray((input as { cases: unknown[] }).cases)) {
      return normalizeScrape((input as { cases: unknown[] }).cases, warnings);
    }
    return [normalizeCase(input as Loose, warnings)];
  }
  return [];
}