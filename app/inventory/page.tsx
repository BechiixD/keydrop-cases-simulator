"use client";

import { useEffect, useMemo, useState } from "react";
import type { InventoryItem } from "@/lib/types";
import {
  addDrops,
  clearInventory,
  getInventory,
  inventoryValue,
  sellAll,
  sellItem,
} from "@/lib/inventory";
import { adjustBalance, getBalance } from "@/lib/storage";
import {
  RARITY_COLORS,
  WEAR_COLORS,
} from "@/lib/ui/colors";

function fmt(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

type SortKey = "value-desc" | "value-asc" | "newest" | "oldest" | "rarity";
type FilterRarity = string | "all";
type FilterWear = string | "all";
type FilterSource = string | "all";

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [balance, setBalance] = useState(0);
  const [ready, setReady] = useState(false);
  const [sort, setSort] = useState<SortKey>("newest");
  const [rarity, setRarity] = useState<FilterRarity>("all");
  const [wear, setWear] = useState<FilterWear>("all");
  const [source, setSource] = useState<FilterSource>("all");

  useEffect(() => {
    function reload(): void {
      setItems(getInventory());
      setBalance(getBalance());
    }
    reload();
    setReady(true);
    window.addEventListener("storage", reload);
    window.addEventListener("keydrop-balance-change", reload);
    return () => {
      window.removeEventListener("storage", reload);
      window.removeEventListener("keydrop-balance-change", reload);
    };
  }, []);

  function refresh(): void {
    setItems(getInventory());
    setBalance(getBalance());
  }

  function doSell(uid: string): void {
    const { sold, value } = sellItem(uid);
    if (sold && value > 0) {
      adjustBalance(value);
    }
    refresh();
  }

  function doSellAll(): void {
    if (
      typeof window === "object" &&
      !window.confirm(
        `Sell all ${items.length} items for ${fmt(inventoryValue())} coins?`,
      )
    ) {
      return;
    }
    const { totalValue } = sellAll();
    if (totalValue > 0) adjustBalance(totalValue);
    refresh();
  }

  function doClear(): void {
    if (
      typeof window === "object" &&
      !window.confirm("Clear entire inventory? Items will be lost without payment.")
    ) {
      return;
    }
    clearInventory();
    refresh();
  }

  const itemsWithIndex = useMemo(
    () => items.map((it, idx) => ({ it, idx })),
    [items],
  );

  const filtered = useMemo(() => {
    return itemsWithIndex
      .filter(({ it }) => {
        if (rarity !== "all" && it.drop.skin.rarity !== rarity) return false;
        if (wear !== "all" && it.drop.wear.wear !== wear) return false;
        if (source !== "all" && it.source !== source) return false;
        return true;
      })
      .sort((a, b) => {
        switch (sort) {
          case "value-desc":
            return b.it.drop.value - a.it.drop.value;
          case "value-asc":
            return a.it.drop.value - b.it.drop.value;
          case "newest":
            return b.it.acquiredAt - a.it.acquiredAt;
          case "oldest":
            return a.it.acquiredAt - b.it.acquiredAt;
          case "rarity": {
            const order = [
              "Knife",
              "Gloves",
              "Covert",
              "Classified",
              "Restricted",
              "Mil-Spec",
              "Industrial",
              "Consumer",
            ];
            return (
              order.indexOf(a.it.drop.skin.rarity) -
              order.indexOf(b.it.drop.skin.rarity)
            );
          }
          default:
            return 0;
        }
      });
  }, [itemsWithIndex, sort, rarity, wear, source]);

  const totalVal = useMemo(
    () => filtered.reduce((a, { it }) => a + it.drop.value, 0),
    [filtered],
  );

  const allRarities = useMemo(() => {
    const set = new Set(items.map((i) => i.drop.skin.rarity));
    return Array.from(set).sort((a, b) => {
      const o = ["Knife","Gloves","Covert","Classified","Restricted","Mil-Spec","Industrial","Consumer"];
      return o.indexOf(a) - o.indexOf(b);
    });
  }, [items]);

  const allWears = useMemo(() => {
    return ["FN", "MW", "FT", "WW", "BS"].filter((w) =>
      items.some((i) => i.drop.wear.wear === w),
    );
  }, [items]);

  const allSources = useMemo(() => {
    const set = new Set(items.map((i) => i.source));
    return Array.from(set);
  }, [items]);

  if (!ready) {
    return (
      <div className="space-y-3">
        <div className="h-8 w-48 animate-pulse rounded bg-white/5" />
        <div className="h-64 animate-pulse rounded-xl bg-white/5" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight">Inventory</h1>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-white/50">
            Balance <span className="text-amber-400">{fmt(balance)}</span>
          </span>
          <span className="text-white/30">·</span>
          <span className="text-white/50">
            Inventory{" "}
            <span className="text-emerald-400">{fmt(totalVal)}</span>
          </span>
          <span className="text-white/30">·</span>
          <span className="text-white/50">
            {items.length} item{items.length !== 1 ? "s" : ""}
          </span>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="rounded border border-white/10 bg-[#0b0e14] px-2 py-1.5 text-xs min-h-[44px] sm:min-h-0"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="value-desc">Value ↓</option>
          <option value="value-asc">Value ↑</option>
          <option value="rarity">Rarity</option>
        </select>
        <select
          value={rarity}
          onChange={(e) => setRarity(e.target.value)}
          className="rounded border border-white/10 bg-[#0b0e14] px-2 py-1.5 text-xs min-h-[44px] sm:min-h-0"
        >
          <option value="all">All rarities</option>
          {allRarities.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <select
          value={wear}
          onChange={(e) => setWear(e.target.value)}
          className="rounded border border-white/10 bg-[#0b0e14] px-2 py-1.5 text-xs min-h-[44px] sm:min-h-0"
        >
          <option value="all">All wears</option>
          {allWears.map((w) => (
            <option key={w} value={w}>{w}</option>
          ))}
        </select>
        <select
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className="rounded border border-white/10 bg-[#0b0e14] px-2 py-1.5 text-xs min-h-[44px] sm:min-h-0"
        >
          <option value="all">All sources</option>
          {allSources.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-2">
          {items.length > 0 && (
            <>
              <button
                onClick={doSellAll}
                className="rounded bg-amber-500 px-3 py-1.5 text-xs font-semibold text-black hover:bg-amber-400 min-h-[44px] sm:min-h-0"
              >
                Sell all ({fmt(totalVal)})
              </button>
              <button
                onClick={doClear}
                className="rounded border border-red-400/30 px-3 py-1.5 text-xs text-red-400 hover:bg-red-400/10 min-h-[44px] sm:min-h-0"
              >
                Clear
              </button>
            </>
          )}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center text-sm text-white/50 space-y-2">
          <div>Inventory is empty.</div>
          <div>
            Open cases in{" "}
            <a href="/sim" className="text-amber-400 hover:underline">
              Simulator
            </a>{" "}
            or fight in{" "}
            <a href="/battles" className="text-amber-400 hover:underline">
              Battles
            </a>{" "}
            to collect skins.
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-sm text-white/60">
          No items match the current filters.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
          {filtered.map(({ it, idx: origIdx }) => {
            const d = it.drop;
            const color = RARITY_COLORS[d.skin.rarity] ?? "#888";
            return (
              <div
                key={it.uid}
                className="rounded-xl border border-white/10 bg-white/5 overflow-hidden"
                style={{ boxShadow: `inset 4px 0 0 ${color}` }}
              >
                <div className="flex items-start gap-3 p-3">
                  <div
                    className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/5"
                    style={{ boxShadow: `0 0 0 1px ${color}44, 0 0 12px ${color}22` }}
                  >
                    {d.skin.imageUrl ? (
                      <img src={d.skin.imageUrl} alt={d.skin.name} className="h-full w-full object-contain" />
                    ) : (
                      <span className="text-lg font-bold text-white/20">{d.skin.name[0]}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="text-sm font-medium leading-tight break-words">
                      {d.skin.name}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                        style={{ background: `${color}22`, color }}
                      >
                        {d.skin.rarity}
                      </span>
                      {d.skin.statTrak && (
                        <span className="rounded-full bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-400">
                          ST
                        </span>
                      )}
                      <span
                        className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                        style={{
                          background: `${WEAR_COLORS[d.wear.wear]}22`,
                          color: WEAR_COLORS[d.wear.wear],
                        }}
                      >
                        {d.wear.wear}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-amber-400">
                        {fmt(d.value)} coins
                      </span>
                      <button
                        onClick={() => doSell(it.uid)}
                        className="rounded bg-emerald-500/20 px-2 py-0.5 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/30 min-h-[44px] sm:min-h-0"
                      >
                        Sell
                      </button>
                    </div>
                    <div className="text-[10px] text-white/30">
                      {it.source} · {new Date(it.acquiredAt).toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
