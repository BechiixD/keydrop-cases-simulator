import type { SkinItem, Wear, WearTier } from "@/lib/types";
import { hmacSha256Hex, randomHex, sha256Hex } from "@/lib/sha256";

export function sha256HexComputed(input: string): string {
  return sha256Hex(input);
}

export function randomServerSeed(): string {
  return randomHex(32);
}

export function randomClientSeed(): string {
  return randomHex(16);
}

export function hashServerSeed(serverSeed: string): string {
  return sha256Hex(serverSeed);
}

export function computeTicket(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
): string {
  return hmacSha256Hex(serverSeed, `${clientSeed}:${nonce}`);
}

const MAX32 = 0xffffffff;

export function floatFromTicket(ticket: string, sliceStart: number): number {
  const hex = ticket.slice(sliceStart, sliceStart + 8);
  const parsed = parseInt(hex, 16);
  if (!Number.isFinite(parsed)) return 0;
  return parsed / MAX32;
}

export function pickSkinByFloat(
  items: SkinItem[],
  f: number,
): { skin: SkinItem; cumulative: number } | null {
  let cumulative = 0;
  for (const skin of items) {
    cumulative += skin.totalProbability;
    if (f < cumulative) return { skin, cumulative };
  }
  const last = items[items.length - 1];
  return last ? { skin: last, cumulative } : null;
}

export function pickWearByFloat(
  skin: SkinItem,
  f: number,
): WearTier | null {
  if (skin.wears.length === 0) {
    return { wear: "FN", probability: skin.totalProbability, value: 0 };
  }
  if (skin.totalProbability <= 0) return skin.wears[0] ?? null;
  const total = skin.totalProbability;
  let cumulative = 0;
  for (const w of skin.wears) {
    cumulative += w.probability / total;
    if (f < cumulative) return w;
  }
  return skin.wears[skin.wears.length - 1] ?? null;
}

export type { Wear };