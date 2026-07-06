"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import type { CaseDefinition } from "@/lib/types";
import {
  caseRarestSkin,
  maxRarityOfCase,
  RARITY_BG,
  RARITY_COLORS,
} from "@/lib/ui/colors";

const RANK: Record<string, number> = {
  Consumer: 0,
  Industrial: 1,
  "Mil-Spec": 2,
  Restricted: 3,
  Classified: 4,
  Covert: 5,
  Knife: 6,
  Gloves: 6,
};

function ev(c: CaseDefinition): number {
  return c.items.reduce(
    (a, s) => a + s.wears.reduce((b, w) => b + w.probability * w.value, 0),
    0,
  );
}
function fmt(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export function ManageCasesClient({
  cases,
}: {
  cases: CaseDefinition[];
}) {
  const router = useRouter();

  const sorted = useMemo(
    () =>
      [...cases].sort((a, b) => {
        const diff = RANK[maxRarityOfCase(a)] - RANK[maxRarityOfCase(b)];
        if (diff !== 0) return diff;
        return b.price - a.price;
      }),
    [cases],
  );

  async function remove(slug: string): Promise<void> {
    if (
      typeof window === "object" &&
      !window.confirm(`Remove case "${slug}" from cache?`)
    ) {
      return;
    }
    await fetch("/api/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "remove", slugs: [slug] }),
    });
    router.refresh();
  }
  async function clearAll(): Promise<void> {
    if (!cases.length) return;
    if (
      typeof window === "object" &&
      !window.confirm("Clear ALL cached cases? This cannot be undone.")
    ) {
      return;
    }
    await fetch("/api/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "clear" }),
    });
    router.refresh();
  }

  return (
    <section className="rounded-xl border border-white/10 bg-white/5">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
        <div className="text-xs uppercase tracking-wider text-white/50">
          Cache management · {cases.length} case{cases.length === 1 ? "" : "s"} loaded
        </div>
        <button
          onClick={clearAll}
          disabled={!cases.length}
          className="rounded border border-red-400/40 px-2 py-1 text-xs text-red-300 hover:bg-red-400/10 disabled:opacity-40"
        >
          clear all
        </button>
      </div>
      <ul className="divide-y divide-white/5">
        {sorted.map((c) => {
          const mr = maxRarityOfCase(c);
          const rarest = caseRarestSkin(c);
          const edge =
            c.price > 0
              ? (((ev(c) - c.price) / c.price) * 100).toFixed(2) + "%"
              : "—";
          return (
            <li
              key={c.slug}
              className="flex items-center gap-3 px-4 py-2"
              style={{ borderLeft: `4px solid ${RARITY_COLORS[mr]}` }}
            >
              <div
                className="hidden h-10 w-10 shrink-0 rounded sm:block"
                style={{
                  backgroundImage: c.imageUrl ? `url(${c.imageUrl})` : "none",
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                  backgroundColor: RARITY_BG[mr] ?? RARITY_BG["Mil-Spec"],
                }}
              />
              <div className="flex-1 min-w-0">
                <div className="truncate text-sm font-medium">{c.name}</div>
                <div className="text-xs text-white/50">
                  <code className="text-white/70">{c.slug}</code> · {c.items.length} items ·{" "}
                  <span style={{ color: RARITY_COLORS[mr] }}>{mr}</span>
                  {rarest ? ` top: ${rarest.name}` : ""} · EV{" "}
                  <span className="text-amber-300">{fmt(ev(c))}</span> · edge{" "}
                  <span
                    className={
                      parseFloat(edge) >= 0 ? "text-emerald-400" : "text-red-400"
                    }
                  >
                    {edge}
                  </span>
                </div>
              </div>
              <button
                onClick={() => remove(c.slug)}
                className="rounded border border-white/10 px-2 py-1 text-xs text-white/70 hover:bg-red-400/10 hover:text-red-300"
              >
                remove
              </button>
            </li>
          );
        })}
        {!cases.length && (
          <li className="px-4 py-3 text-sm text-white/40">
            Empty cache. Paste case JSON above to populate it.
          </li>
        )}
      </ul>
    </section>
  );
}