import { notFound } from "next/navigation";
import type { CaseDefinition } from "@/lib/types";
import { getCase } from "@/lib/scraper/cache";
import { CaseSimCta } from "@/components/CaseSimCta";
import {
  RARITY_BG,
  RARITY_COLORS,
  WEAR_COLORS,
  WEAR_ORDER,
} from "@/lib/ui/colors";

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
  const edge = c.price > 0 ? ((ev - c.price) / c.price) * 100 : 0;
  const costMultiple = c.price > 0 ? (ev / c.price).toFixed(2) : "—";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 text-xs text-white/40">
        <span>Wear legend:</span>
        {WEAR_ORDER.map((w) => (
          <span key={w} className="flex items-center gap-1">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: WEAR_COLORS[w] }}
            />
            <span style={{ color: WEAR_COLORS[w] }}>{w}</span>
          </span>
        ))}
      </div>

      <header className="flex items-start gap-6">
        <div className="w-36 shrink-0 overflow-hidden rounded-xl bg-white/5 p-3">
          {c.imageUrl ? (
            <img
              src={c.imageUrl}
              alt={c.name}
              loading="lazy"
              className="aspect-square w-full object-contain"
            />
          ) : (
            <div className="flex aspect-square w-full items-center justify-center">
              <span className="text-4xl font-bold text-white/20">
                {c.name[0]}
              </span>
            </div>
          )}
        </div>
        <div className="flex flex-1 items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{c.name}</h1>
            <p className="text-sm text-white/60">
              slug <code className="text-white/80">{c.slug}</code> · price{" "}
              <span className="text-amber-400">{c.price.toLocaleString()}</span>{" "}
              coins · {c.items.length} items
            </p>
            <div className="mt-3">
              <CaseSimCta c={c} />
            </div>
          </div>
          <div className="shrink-0 rounded-lg border border-white/10 bg-white/5 p-3 text-right text-sm">
            <div className="text-white/60">Expected value per open</div>
            <div className="text-lg font-semibold text-amber-400">
              {fmt(ev)} coins
            </div>
            <div className="mt-1 text-white/40">
              edge{" "}
              <span
                className={
                  edge >= 0 ? "text-emerald-400" : "text-red-400"
                }
              >
                {edge >= 0 ? "+" : ""}
                {edge.toFixed(2)}%
              </span>
              {costMultiple !== "—" && (
                <span>
                  {" · "}
                  <span className={ev >= c.price ? "text-emerald-400" : "text-red-400"}>
                    {costMultiple}× cost
                  </span>
                </span>
              )}{" "}
              · prob sum{" "}
              {Math.abs(totalProb - 1) > 0.01 ? (
                <span className="text-red-400">drift {fmt(totalProb)}</span>
              ) : (
                <span className="text-emerald-400">ok</span>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="overflow-hidden rounded-xl border border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-left text-xs uppercase tracking-wider text-white/50">
            <tr>
              <th className="w-10 px-2 py-2"></th>
              <th className="px-3 py-2">Skin</th>
              <th className="px-3 py-2">Rarity</th>
              <th className="px-3 py-2">ST</th>
              <th className="px-3 py-2 text-right">Total prob</th>
              {WEAR_ORDER.map((w) => (
                <th key={w} className="px-3 py-2 text-right">
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full align-middle mr-1"
                    style={{ background: WEAR_COLORS[w] }}
                  />
                  {w} <span className="text-white/30">prob / value</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {c.items.map((s) => {
              const color = RARITY_COLORS[s.rarity] ?? "#888";
              return (
                <tr
                  key={s.id}
                  className="border-t border-white/5"
                  style={{ boxShadow: `inset 3px 0 0 ${color}` }}
                >
                  <td className="px-2 py-2">
                    <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded bg-white/5">
                      {s.imageUrl ? (
                        <img
                          src={s.imageUrl}
                          alt={s.name}
                          loading="lazy"
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <span className="text-[10px] font-bold text-white/20">
                          {s.name[0]}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="inline-block h-2 w-2 shrink-0 rounded-full"
                        style={{ background: color }}
                      />
                      <span className="min-w-0 truncate">{s.name}</span>
                    </div>
                    <div className="mt-1 flex h-1.5 w-full max-w-[120px] overflow-hidden rounded-full bg-white/5">
                      {WEAR_ORDER.map((w) => {
                        const tier = s.wears.find((t) => t.wear === w);
                        const pctWidth = tier ? (tier.probability / s.totalProbability) * 100 : 0;
                        if (pctWidth <= 0) return null;
                        return (
                          <div
                            key={w}
                            style={{ width: `${pctWidth}%`, background: WEAR_COLORS[w] }}
                            title={`${w}: ${(tier!.probability * 100).toFixed(4)}%`}
                          />
                        );
                      })}
                    </div>
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