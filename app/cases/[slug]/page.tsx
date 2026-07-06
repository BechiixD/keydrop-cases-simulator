import { notFound } from "next/navigation";
import type { CaseDefinition, Wear } from "@/lib/types";
import { getCase } from "@/lib/scraper/cache";
import { RARITY_COLORS, RARITY_BG, WEAR_COLORS, WEAR_ORDER } from "@/lib/ui/colors";

function fmt(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

function pct(n: number): string {
  return (n * 100).toFixed(4) + "%";
}

export default async function CaseDetailPage({
  params,
}: {
  params: { slug: string };
}) {
  const c: CaseDefinition | null = await getCase(params.slug);
  if (!c) notFound();

  const totalProb = c.items.reduce((a, s) => a + s.totalProbability, 0);
  const ev = c.items.reduce(
    (a, s) => a + s.wears.reduce((b, w) => b + w.probability * w.value, 0),
    0,
  );

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{c.name}</h1>
          <p className="text-sm text-white/60">
            slug <code className="text-white/80">{c.slug}</code> · price{" "}
            <span className="text-amber-400">{c.price.toLocaleString()}</span>{" "}
            coins · {c.items.length} items
          </p>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-right text-sm">
          <div className="text-white/60">Expected value per open</div>
          <div className="text-lg font-semibold text-amber-400">
            {fmt(ev)} coins
          </div>
          <div className="mt-1 text-white/40">
            total prob sum {fmt(totalProb)} ·{" "}
            {Math.abs(totalProb - 1) > 0.01 ? (
              <span className="text-red-400">drift!</span>
            ) : (
              <span className="text-emerald-400">ok</span>
            )}
          </div>
        </div>
      </header>

      <div className="overflow-hidden rounded-xl border border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-left text-xs uppercase tracking-wider text-white/50">
            <tr>
              <th className="px-3 py-2">Skin</th>
              <th className="px-3 py-2">Rarity</th>
              <th className="px-3 py-2">ST</th>
              <th className="px-3 py-2 text-right">Total prob</th>
              {WEAR_ORDER.map((w) => (
                <th key={w} className="px-3 py-2 text-right">
                  {w} <span className="text-white/30">prob / value</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {c.items.map((s) => {
              const color = RARITY_COLORS[s.rarity] ?? "#888";
              return (
                <tr key={s.id} className="border-t border-white/5">
                  <td className="px-3 py-2">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ background: color }}
                    />{" "}
                    {s.name}
                  </td>
                  <td className="px-3 py-2" style={{ color }}>
                    {s.rarity}
                  </td>
                  <td className="px-3 py-2 text-white/50">
                    {s.statTrak ? "ST" : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {pct(s.totalProbability)}
                  </td>
                  {WEAR_ORDER.map((w) => {
                    const tier = s.wears.find((x) => x.wear === w);
                    return (
                      <td
                        key={w}
                        className="px-3 py-2 text-right tabular-nums text-white/70"
                      >
                        {tier && tier.probability > 0 ? (
                          <>
                            {pct(tier.probability)}
                            <div className="text-xs text-white/40">
                              {tier.value.toLocaleString()} c
                            </div>
                          </>
                        ) : (
                          <span className="text-white/20">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}