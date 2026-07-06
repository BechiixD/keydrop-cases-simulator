import type { Drop, InventoryItem } from "@/lib/types";

const INV_KEY = "keydrop-sim:inventory";
const MAX_ITEMS = 500;

let uidCounter = Date.now();

function nextUid(): string {
  return String(uidCounter++);
}

function safeGet(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export function getInventory(): InventoryItem[] {
  const raw = safeGet(INV_KEY);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as InventoryItem[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function addDrops(
  drops: Drop[],
  source: InventoryItem["source"],
  sourceId: string,
): InventoryItem[] {
  const now = Date.now();
  const items: InventoryItem[] = drops.map((d) => ({
    uid: nextUid(),
    drop: d,
    acquiredAt: now,
    source,
    sourceId,
  }));
  const next = [...items, ...getInventory()].slice(0, MAX_ITEMS);
  safeSet(INV_KEY, JSON.stringify(next));
  return next;
}

export function sellItem(uid: string): { sold: InventoryItem | null; value: number } {
  const inv = getInventory();
  const idx = inv.findIndex((i) => i.uid === uid);
  if (idx < 0) return { sold: null, value: 0 };
  const sold = inv[idx];
  inv.splice(idx, 1);
  safeSet(INV_KEY, JSON.stringify(inv));
  return { sold, value: sold.drop.value };
}

export function sellAll(): { count: number; totalValue: number } {
  const inv = getInventory();
  const totalValue = inv.reduce((a, i) => a + i.drop.value, 0);
  safeSet(INV_KEY, JSON.stringify([]));
  return { count: inv.length, totalValue };
}

export function inventoryValue(): number {
  return getInventory().reduce((a, i) => a + i.drop.value, 0);
}

export function clearInventory(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(INV_KEY);
  } catch {
    /* ignore */
  }
}
