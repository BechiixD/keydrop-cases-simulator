import type {
  BattleResult,
  Drop,
  MultiBatchResult,
} from "@/lib/types";

const KEYS = {
  balance: "keydrop-sim:balance",
  history: "keydrop-sim:history",
  battleHistory: "keydrop-sim:battleHistory",
  clientSeed: "keydrop-sim:clientSeed",
  serverSeed: "keydrop-sim:serverSeed",
  lastNonce: "keydrop-sim:lastNonce",
  simMode: "keydrop-sim:simMode",
  jokerMode: "keydrop-sim:jokerMode",
} as const;

export const DEFAULT_BALANCE = 10000;
const MAX_HISTORY = 50;
const MAX_BATTLE_HISTORY = 50;

export function compactDrop(d: Drop): Drop {
  return {
    ...d,
    skin: {
      ...d.skin,
      wears: [],
      totalProbability: 0,
    },
  };
}

function compactBatchDrops(drops: Drop[]): Drop[] {
  return drops.map(compactDrop);
}

function emitBalanceChange(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("keydrop-balance-change"));
}

function safeGet(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch (e) {
    console.warn(
      `[storage] localStorage write failed for key "${key}" ` +
        `(${(value.length / 1024).toFixed(1)} KB):`,
      e instanceof Error ? e.message : e,
    );
    return false;
  }
}

function safeRemove(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* noop */
  }
}

export function getBalance(): number {
  const raw = safeGet(KEYS.balance);
  if (raw == null) return DEFAULT_BALANCE;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : DEFAULT_BALANCE;
}

export function setBalance(n: number): void {
  if (!Number.isFinite(n)) return;
  safeSet(KEYS.balance, String(n));
  emitBalanceChange();
}

export function adjustBalance(delta: number): number {
  const next = Math.max(0, getBalance() + delta);
  setBalance(next);
  return next;
}

export function resetBalance(): number {
  setBalance(DEFAULT_BALANCE);
  return DEFAULT_BALANCE;
}

export function getHistory(): MultiBatchResult[] {
  const raw = safeGet(KEYS.history);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as MultiBatchResult[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function pushHistory(result: MultiBatchResult): MultiBatchResult[] {
  const compact: MultiBatchResult = {
    ...result,
    results: result.results.map((r) => ({
      ...r,
      drops: compactBatchDrops(r.drops),
      best: r.best ? compactDrop(r.best) : r.best,
      worst: r.worst ? compactDrop(r.worst) : r.worst,
    })),
  };
  const next = [compact, ...getHistory()].slice(0, MAX_HISTORY);
  safeSet(KEYS.history, JSON.stringify(next));
  return next;
}

export function clearHistory(): void {
  safeRemove(KEYS.history);
}

export function getBattleHistory(): BattleResult[] {
  const raw = safeGet(KEYS.battleHistory);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as BattleResult[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function pushBattleHistory(result: BattleResult): BattleResult[] {
  const compact: BattleResult = {
    ...result,
    players: result.players.map((p) => ({
      ...p,
      drops: compactBatchDrops(p.drops),
    })),
  };
  const next = [compact, ...getBattleHistory()].slice(0, MAX_BATTLE_HISTORY);
  safeSet(KEYS.battleHistory, JSON.stringify(next));
  return next;
}

export function clearBattleHistory(): void {
  safeRemove(KEYS.battleHistory);
}

export function getClientSeed(fallback: string): string {
  return safeGet(KEYS.clientSeed) ?? fallback;
}

export function setClientSeed(seed: string): void {
  safeSet(KEYS.clientSeed, seed);
}

export function getLastNonce(): number {
  const raw = safeGet(KEYS.lastNonce);
  if (raw == null) return 0;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function setLastNonce(n: number): void {
  if (!Number.isFinite(n) || n < 0) return;
  safeSet(KEYS.lastNonce, String(n));
}

export function getServerSeed(fallback: string): string {
  return safeGet(KEYS.serverSeed) ?? fallback;
}

export function setServerSeed(seed: string): void {
  safeSet(KEYS.serverSeed, seed);
}

export function getSimMode(): "stats" | "realistic" {
  const raw = safeGet(KEYS.simMode);
  return raw === "realistic" ? "realistic" : "stats";
}

export function setSimMode(mode: "stats" | "realistic"): void {
  safeSet(KEYS.simMode, mode);
}

export function getJokerMode(): boolean {
  return safeGet(KEYS.jokerMode) === "1";
}

export function setJokerMode(on: boolean): void {
  safeSet(KEYS.jokerMode, on ? "1" : "0");
}