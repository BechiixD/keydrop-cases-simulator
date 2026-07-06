"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { CaseDefinition } from "@/lib/types";
import {
  caseRarestSkin,
  maxRarityOfCase,
  RARITY_BG,
  RARITY_COLORS,
  RARITY_RANK,
} from "@/lib/ui/colors";

const SIM_PRESET_KEY = "keydrop-sim:simPreset";

type SortKey = "rarity" | "price-asc" | "price-desc" | "edge" | "name";

function ev(c: CaseDefinition): number {
  return c.items.reduce(
    (a, s) => a + s.wears.reduce((b, w) => b + w.probability * w.value, 0),
    0,
  );
}
function edgePct(c: CaseDefinition): number {
  return c.price > 0 ? ((ev(c) - c.price) / c.price) * 100 : 0;
}

function sortCases(arr: CaseDefinition[], key: SortKey): CaseDefinition[] {
  return [...arr].sort((a, b) => {
    switch (key) {
      case "rarity":
        return (
          RARITY_RANK[maxRarityOfCase(b)] - RARITY_RANK[maxRarityOfCase(a)] ||
          b.price - a.price
        );
      case "price-asc":
        return a.price - b.price;
      case "price-desc":
        return b.price - a.price;
      case "edge":
        return edgePct(b) - edgePct(a);
      case "name":
        return a.name.localeCompare(b.name);
      default:
        return 0;
    }
  });
}

export function HomeCasesClient({
  cases,
  children,
}: {
  cases: CaseDefinition[];
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [sortBy, setSortBy] = useState<SortKey>("rarity");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sortCases(
      !q
        ? cases
        : cases.filter((c) => {
            const itemNames = c.items.map((i) => i.name.toLowerCase());
            return (
              c.name.toLowerCase().includes(q) ||
              c.slug.includes(q) ||
              itemNames.some((n) => n.includes(q))
            );
          }),
      sortBy,
    );
  }, [cases, query, sortBy]);

  const totalSelected = useMemo(
    () =>
      Object.entries(selected)
        .filter(([slug, on]) => on && (counts[slug] ?? 0) > 0)
        .reduce((acc, [slug]) => acc + (counts[slug] ?? 0), 0),
    [selected, counts],
  );

  function toggle(slug: string): void {
    setSelected((s) => ({ ...s, [slug]: !s[slug] }));
  }
  function setCount(slug: string, n: number): void {
    setCounts((c) => ({
      ...c,
      [slug]: Math.max(0, Math.floor(Number.isFinite(n) ? n : 0)),
    }));
  }
  function selectAllVisible(): void {
    const all: Record<string, boolean> = {};
    for (const c of filtered) all[c.slug] = true;
    setSelected(all);
  }
  function clearSelection(): void {
    setSelected({});
  }

  function sendToSim(): void {
    if (totalSelected <= 0) return;
    try {
      window.localStorage.setItem(
        SIM_PRESET_KEY,
        JSON.stringify({ counts }),
      );
    } catch {
      /* ignore */
    }
    router.push("/sim");
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Cases</h1>
        <div className="flex items-center gap-2">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
            className="rounded border border-white/10 bg-[#0b0e14] px-2 py-1 text-sm"
          >
            <option value="rarity">Rarity</option>
            <option value="name">Name A–Z</option>
            <option value="price-asc">Price ↑</option>
            <option value="price-desc">Price ↓</option>
            <option value="edge">Edge %</option>
          </select>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="search case or skin…"
            className="w-44 rounded border border-white/10 bg-[#0b0e14] px-3 py-1 text-sm"
          />
          <button
            onClick={sendToSim}
            disabled={totalSelected <= 0}
            className="rounded bg-amber-500 px-3 py-1 text-sm font-semibold text-black disabled:opacity-40"
          >
            Open {totalSelected > 0 ? `${totalSelected} in sim` : "selected"}
          </button>
        </div>
      </header>
      <div className="flex items-center gap-3 text-xs">
        <span className="text-white/40">
          {filtered.length} match{filtered.length === 1 ? "" : "es"}
          {query ? ` for "${query}"` : ""}
        </span>
        {filtered.length > 0 && (
          <>
            <button
              onClick={selectAllVisible}
              className="text-amber-400/70 hover:text-amber-300"
            >
              select all
            </button>
            <span className="text-white/20">·</span>
            <button
              onClick={clearSelection}
              className="text-white/40 hover:text-white/70"
            >
              clear
            </button>
          </>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-white/10 bg-white/5 p-6 text-sm text-white/60">
          {cases.length === 0
            ? "No cases loaded. Expand the panel below to paste case data."
            : `No cases match${query ? ` "${query}"` : ""}.`}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
          {filtered.map((c) => {
            const isSel = !!selected[c.slug];
            const mr = maxRarityOfCase(c);
            const rarest = caseRarestSkin(c);
            const edge = edgePct(c);
            const edgeColor = edge >= 0 ? "text-emerald-400" : "text-red-400";
            return (
              <div
                key={c.slug}
                className="relative flex overflow-hidden rounded-xl border border-white/10 transition"
                style={{
                  borderLeft: `4px solid ${RARITY_COLORS[mr]}`,
                  background: `linear-gradient(180deg, ${RARITY_BG[mr] ?? ""} 0%, rgba(255,255,255,0.04) 70%)`,
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.boxShadow = `0 0 0 1px ${RARITY_COLORS[mr]}55`)
                }
                onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "none")}
              >
                <div className="flex w-20 shrink-0 items-center justify-center self-stretch overflow-hidden bg-white/5">
                  {c.imageUrl ? (
                    <img
                      src={c.imageUrl}
                      alt={c.name}
                      loading="lazy"
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <span
                      className="text-lg font-bold"
                      style={{ color: RARITY_COLORS[mr] }}
                    >
                      {c.name[0]}
                    </span>
                  )}
                </div>
                <div className="flex flex-1 flex-col p-3">
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={isSel}
                      onChange={() => toggle(c.slug)}
                      className="mt-1 accent-amber-400"
                    />
                    <Link
                      href={`/cases/${c.slug}`}
                      className="flex-1 hover:text-amber-400"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <div className="text-lg font-semibold leading-tight">
                          {c.name}
                        </div>
                        <span
                          className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                          style={{
                            backgroundColor: RARITY_BG[mr],
                            color: RARITY_COLORS[mr],
                          }}
                        >
                          {mr}
                        </span>
                      </div>
                      <div className="mt-2 text-sm text-amber-400">
                        {c.price.toLocaleString()} coins / open
                      </div>
                      <div className="mt-1 text-xs text-white/50">
                        EV{" "}
                        <span className="text-white/80">
                          {ev(c).toFixed(2)}
                        </span>{" "}
                        · edge{" "}
                        <span className={edgeColor}>
                          {edge >= 0 ? "+" : ""}
                          {edge.toFixed(2)}%
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-white/50">
                        {c.items.length} items · rarest{" "}
                        <span style={{ color: RARITY_COLORS[mr] }}>
                          {rarest ? rarest.name : "—"}
                        </span>
                      </div>
                    </Link>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <span className="text-xs text-white/40">opens</span>
                    <input
                      type="number"
                      min={0}
                      value={counts[c.slug] ?? 0}
                      onChange={(e) =>
                        setCount(c.slug, Number(e.target.value))
                      }
                      onFocus={() => {
                        if (!selected[c.slug]) toggle(c.slug);
                      }}
                      className={`w-24 rounded bg-[#0b0e14] border px-2 py-1 text-sm tabular-nums ${
                        isSel ? "border-amber-400/60" : "border-white/10"
                      }`}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {children}
    </div>
  );
}
