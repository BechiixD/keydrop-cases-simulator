import type {
  BatchResult,
  CaseDefinition,
  CaseSelection,
  Drop,
  MultiBatchResult,
} from "@/lib/types";
import {
  computeTicket,
  floatFromTicket,
  hashServerSeed,
  pickSkinByFloat,
  pickWearByFloat,
} from "@/lib/provablyFair";

export interface OpenInput {
  case: CaseDefinition;
  serverSeed: string;
  clientSeed: string;
  nonce: number;
  caseSlug?: string;
  joker?: boolean;
}

export function jokerCase(c: CaseDefinition): CaseDefinition {
  const n = c.items.length;
  if (n === 0) return { ...c, items: [], price: 0 };
  const uniform = 1 / n;
  const items = c.items.map((skin) => {
    const total = skin.totalProbability;
    const wears = skin.wears.map((w) => ({
      ...w,
      probability:
        total > 0
          ? (w.probability / total) * uniform
          : skin.wears.length > 0
            ? uniform / skin.wears.length
            : uniform,
    }));
    return { ...skin, wears, totalProbability: uniform };
  });
  const jokerEV = items.reduce(
    (a, s) => a + s.wears.reduce((b, w) => b + w.probability * w.value, 0),
    0,
  );
  const origEV = expectedValue(c);
  let price: number;
  if (origEV <= 0 || c.price <= 0) {
    price = jokerEV;
  } else {
    const origEdge = 1 - origEV / c.price;
    price = jokerEV / (1 - origEdge);
  }
  return { ...c, items, price };
}

export function jokerPrice(c: CaseDefinition): number {
  return jokerCase(c).price;
}

export function jokerEdge(c: CaseDefinition): number {
  const origEV = expectedValue(c);
  if (origEV <= 0 || c.price <= 0) return 0;
  return 1 - origEV / c.price;
}

export function openOnce({
  case: c,
  serverSeed,
  clientSeed,
  nonce,
  caseSlug,
  joker,
}: OpenInput): Drop | null {
  const effective = joker ? jokerCase(c) : c;
  const ticket = computeTicket(serverSeed, clientSeed, nonce);
  const skinFloat = floatFromTicket(ticket, 0);
  const wearFloat = floatFromTicket(ticket, 8);
  const picked = pickSkinByFloat(effective.items, skinFloat);
  if (!picked) return null;
  const wear = pickWearByFloat(picked.skin, wearFloat);
  if (!wear) return null;
  return {
    caseSlug: caseSlug ?? c.slug,
    skin: picked.skin,
    wear,
    value: wear.value,
    nonce,
    clientSeed,
    serverSeedHash: hashServerSeed(serverSeed),
    ticket,
    joker: joker === true,
  };
}

function emptyFreq(): {
  bySkin: Record<string, number>;
  byWear: Record<string, number>;
  byRarity: Record<string, number>;
} {
  return { bySkin: {}, byWear: {}, byRarity: {} };
}

function bump(map: Record<string, number>, key: string, n = 1): void {
  map[key] = (map[key] ?? 0) + n;
}

export function runBatch(
  c: CaseDefinition,
  count: number,
  serverSeed: string,
  clientSeed: string,
  startNonce: number,
  joker?: boolean,
): BatchResult {
  const drops: Drop[] = [];
  const { bySkin, byWear, byRarity } = emptyFreq();
  let totalValue = 0;

  for (let i = 0; i < count; i++) {
    const nonce = startNonce + i;
    const drop = openOnce({
      case: c,
      serverSeed,
      clientSeed,
      nonce,
      joker,
    });
    if (!drop) continue;
    drops.push(drop);
    totalValue += drop.value;
    bump(bySkin, drop.skin.name);
    bump(byWear, drop.wear.wear);
    bump(byRarity, drop.skin.rarity);
  }

  const effective = joker ? jokerCase(c) : c;
  const totalCost = effective.price * count;
  const net = totalValue - totalCost;
  const roi = totalCost > 0 ? net / totalCost : 0;
  const dropValue = (d: Drop) => d.value;
  let best: Drop = drops[0];
  let worst: Drop = drops[0];
  for (const d of drops) {
    if (!best || dropValue(d) > dropValue(best)) best = d;
    if (!worst || dropValue(d) < dropValue(worst)) worst = d;
  }

  return {
    caseSlug: c.slug,
    caseName: joker ? `${c.name} (Joker)` : c.name,
    drops,
    count,
    totalCost,
    totalValue,
    net,
    roi,
    best,
    worst,
    freqBySkin: bySkin,
    freqByWear: byWear,
    freqByRarity: byRarity,
  };
}

export function runMultiBatch(
  selections: CaseSelection[],
  serverSeed: string,
  clientSeed: string,
  startNonce: number,
  joker?: boolean,
): MultiBatchResult {
  let nonce = startNonce;
  const results: BatchResult[] = [];
  let totalCost = 0;
  let totalValue = 0;
  for (const sel of selections) {
    if (sel.count <= 0) continue;
    const res = runBatch(
      sel.case,
      sel.count,
      serverSeed,
      clientSeed,
      nonce,
      joker,
    );
    nonce += sel.count;
    results.push(res);
    totalCost += res.totalCost;
    totalValue += res.totalValue;
  }
  const net = totalValue - totalCost;
  const roi = totalCost > 0 ? net / totalCost : 0;
  return {
    ranAt: Date.now(),
    results,
    totalCost,
    totalValue,
    net,
    roi,
    serverSeed,
    serverSeedHash: hashServerSeed(serverSeed),
    clientSeed,
    startNonce,
  };
}

export function expectedValue(c: CaseDefinition): number {
  return c.items.reduce(
    (a, s) => a + s.wears.reduce((b, w) => b + w.probability * w.value, 0),
    0,
  );
}