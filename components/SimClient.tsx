"use client";

import { useEffect, useMemo, useState } from "react";
import type { BatchResult, CaseDefinition, MultiBatchResult } from "@/lib/types";
import { runMultiBatch } from "@/lib/caseEngine";
import {
  hashServerSeed,
  randomClientSeed,
  randomServerSeed,
} from "@/lib/provablyFair";
import {
  adjustBalance,
  getBalance,
  getClientSeed,
  getLastNonce,
  pushHistory,
  setClientSeed,
  setLastNonce,
} from "@/lib/storage";
import { SimVerifier } from "@/components/SimVerifier";

const RARITY_COLORS: Record<string, string> = {
  Consumer: "#b0c3d9",
  Industrial: "#5e98d9",
  "Mil-Spec": "#4b69ff",
  Restricted: "#8847ff",
  Classified: "#d32ce6",
  Covert: "#eb4b4b",
  Knife: "#e4ae39",
  Gloves: "#e4ae39",
};

const RARE_RARITIES = new Set(["Covert", "Knife", "Gloves"]);

const SIM_PRESET_KEY = "keydrop-sim:simPreset";

function fmt(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}
function pct(n: number): string {
  return (n * 100).toFixed(2) + "%";
}

export function SimClient({
  cases,
  initialServerSeed,
  initialClientSeed,
}: {
  cases: CaseDefinition[];
  initialServerSeed: string;
  initialClientSeed: string;
}) {
  const [serverSeed, setServerSeed] = useState(initialServerSeed);
  const [serverSeedRevealed, setServerSeedRevealed] = useState(false);
  const [clientSeed, setClientSeedState] = useState(() =>
    getClientSeed(initialClientSeed),
  );
  const [startNonce, setStartNonce] = useState<number>(() => getLastNonce());
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [result, setResult] = useState<MultiBatchResult | null>(null);
  const [balance, setBalance] = useState<number>(10000);
  const [balanceBusy, setBalanceBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [runStarted, setRunStarted] = useState(false);

  useEffect(() => {
    setBalance(getBalance());
    setBalanceBusy(false);
    const cs = getClientSeed(initialClientSeed);
    setClientSeedState(cs);
    try {
      const presetRaw = window.localStorage.getItem(SIM_PRESET_KEY);
      if (presetRaw) {
        const preset = JSON.parse(presetRaw) as {
          counts?: Record<string, number>;
        };
        if (preset.counts && typeof preset.counts === "object") {
          setCounts((prev) => ({ ...prev, ...preset.counts }));
          const sel: Record<string, boolean> = { ...selected };
          for (const [slug, n] of Object.entries(preset.counts)) {
            if ((n as number) > 0 && cases.some((c) => c.slug === slug)) {
              sel[slug] = true;
            }
          }
          setSelected(sel);
        }
        window.localStorage.removeItem(SIM_PRESET_KEY);
      }
    } catch {
      /* noop */
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const serverSeedHash = useMemo(
    () => hashServerSeed(serverSeed),
    [serverSeed],
  );

  const totalCost = useMemo(() => {
    let cost = 0;
    for (const c of cases) {
      if (selected[c.slug]) {
        const n = Math.max(0, counts[c.slug] ?? 0);
        cost += c.price * n;
      }
    }
    return cost;
  }, [cases, selected, counts]);

  const totalOpens = useMemo(() => {
    let n = 0;
    for (const c of cases) {
      if (selected[c.slug]) n += Math.max(0, counts[c.slug] ?? 0);
    }
    return n;
  }, [cases, selected, counts]);

  function toggle(slug: string): void {
    setSelected((s) => ({ ...s, [slug]: !s[slug] }));
  }

  function setCount(slug: string, n: number): void {
    setCounts((c) => ({
      ...c,
      [slug]: Math.max(0, Math.floor(Number.isFinite(n) ? n : 0)),
    }));
  }

  function reshuffle(): void {
    setServerSeed(randomServerSeed());
    setServerSeedRevealed(false);
    setResult(null);
  }

  function newClient(): void {
    const cs = randomClientSeed();
    setClientSeedState(cs);
    setClientSeed(cs);
  }

  function editClient(v: string): void {
    setClientSeedState(v);
    setClientSeed(v);
  }

  function run(): void {
    setError(null);
    if (!cases.length) {
      setError("No cases available.");
      return;
    }
    if (totalOpens <= 0) {
      setError("Select at least one case with a count > 0.");
      return;
    }
    if (balance < totalCost) {
      setError(
        `Insufficient balance: need ${fmt(totalCost)} coins, have ${fmt(balance)}.`,
      );
      return;
    }
    setRunStarted(true);
    const selections = cases
      .filter((c) => selected[c.slug] && (counts[c.slug] ?? 0) > 0)
      .map((c) => ({ case: c, count: Math.max(0, counts[c.slug] ?? 0) }));
    const res = runMultiBatch(
      selections,
      serverSeed,
      clientSeed,
      startNonce,
    );
    const newBalance = adjustBalance(-res.totalCost);
    setBalance(newBalance);
    setLastNonce(startNonce + res.results.reduce((a, r) => a + r.count, 0));
    pushHistory(res);
    setServerSeedRevealed(true);
    setResult(res);
    setRunStarted(false);
  }

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold tracking-tight">
          Batch simulator
        </h1>
        <div className="text-sm text-white/50">
          Balance{" "}
          <span className={balance < totalCost && totalCost > 0 ? "text-red-400" : "text-amber-400"}>
            {balanceBusy ? "…" : fmt(balance)}
          </span>{" "}
          coins
        </div>
      </header>

      <section className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {cases.map((c) => {
            const isSel = !!selected[c.slug];
            return (
              <label
                key={c.slug}
                className={`cursor-pointer rounded-lg border p-3 transition ${
                  isSel
                    ? "border-amber-400/60 bg-amber-400/5"
                    : "border-white/10 bg-white/0 hover:bg-white/5"
                }`}
              >
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={isSel}
                    onChange={() => toggle(c.slug)}
                    className="mt-1 accent-amber-400"
                  />
                  <div className="flex-1">
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-white/50">
                      {c.price.toLocaleString()} coins · {c.items.length} items
                    </div>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs text-white/40">count</span>
                  <input
                    type="number"
                    min={0}
                    value={counts[c.slug] ?? 0}
                    onChange={(e) => setCount(c.slug, Number(e.target.value))}
                    onFocus={() => {
                      if (!selected[c.slug]) toggle(c.slug);
                    }}
                    className="w-28 rounded bg-[#0b0e14] border border-white/10 px-2 py-1 text-sm tabular-nums"
                  />
                </div>
              </label>
            );
          })}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <ProvablyFairPanel
          serverSeedHash={serverSeedHash}
          serverSeed={serverSeed}
          revealed={serverSeedRevealed}
          clientSeed={clientSeed}
          onClientSeedChange={editClient}
          onNewClient={newClient}
          startNonce={startNonce}
          onStartNonceChange={setStartNonce}
          onReshuffle={reshuffle}
        />
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
          <div className="text-xs uppercase tracking-wider text-white/50">
            Run summary
          </div>
          <dl className="grid grid-cols-2 gap-y-1 text-sm">
            <dt className="text-white/50">Total opens</dt>
            <dd className="text-right tabular-nums">{totalOpens}</dd>
            <dt className="text-white/50">Total cost</dt>
            <dd className="text-right tabular-nums text-amber-400">
              {fmt(totalCost)}
            </dd>
            <dt className="text-white/50">Balance after</dt>
            <dd className="text-right tabular-nums">
              {balanceBusy ? "…" : fmt(Math.max(0, balance - totalCost))}
            </dd>
          </dl>
          <button
            onClick={run}
            disabled={runStarted || totalOpens <= 0 || balance < totalCost}
            className="w-full rounded bg-amber-500 px-4 py-2 text-sm font-semibold text-black disabled:opacity-40"
          >
            Run batch
          </button>
          {error && (
            <div className="rounded border border-red-400/40 bg-red-400/10 p-2 text-xs text-red-300">
              {error}
            </div>
          )}
        </div>
      </section>

      {result && <SimResults result={result} />}
    </div>
  );
}

function ProvablyFairPanel({
  serverSeedHash,
  serverSeed,
  revealed,
  clientSeed,
  onClientSeedChange,
  onNewClient,
  startNonce,
  onStartNonceChange,
  onReshuffle,
}: {
  serverSeedHash: string;
  serverSeed: string;
  revealed: boolean;
  clientSeed: string;
  onClientSeedChange: (v: string) => void;
  onNewClient: () => void;
  startNonce: number;
  onStartNonceChange: (n: number) => void;
  onReshuffle: () => void;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wider text-white/50">
          Provably-fair
        </div>
        <button
          onClick={onReshuffle}
          className="rounded border border-white/10 px-2 py-1 text-xs hover:bg-white/5"
        >
          reshuffle server seed
        </button>
      </div>
      <div>
        <label className="block text-xs uppercase tracking-wider text-white/50">
          Server seed hash (shown before run)
        </label>
        <div className="mt-1 break-all rounded bg-[#0b0e14] border border-white/10 px-2 py-1 font-mono text-xs text-amber-400">
          {serverSeedHash}
        </div>
      </div>
      <div>
        <label className="block text-xs uppercase tracking-wider text-white/50">
          Server seed (revealed after run)
        </label>
        <div className="mt-1 break-all rounded bg-[#0b0e14] border border-white/10 px-2 py-1 font-mono text-xs">
          {revealed ? serverSeed : "[hidden — run to reveal]"}
        </div>
      </div>
      <div>
        <label className="block text-xs uppercase tracking-wider text-white/50">
          Client seed
        </label>
        <div className="mt-1 flex gap-2">
          <input
            value={clientSeed}
            onChange={(e) => onClientSeedChange(e.target.value)}
            className="flex-1 rounded bg-[#0b0e14] border border-white/10 px-2 py-1 font-mono text-xs"
          />
          <button
            onClick={onNewClient}
            className="rounded border border-white/10 px-2 py-1 text-xs hover:bg-white/5"
          >
            random
          </button>
        </div>
      </div>
      <div>
        <label className="block text-xs uppercase tracking-wider text-white/50">
          Start nonce (resumes from last run)
        </label>
        <input
          type="number"
          min={0}
          value={startNonce}
          onChange={(e) =>
            onStartNonceChange(Math.max(0, Number(e.target.value)))
          }
          className="mt-1 w-40 rounded bg-[#0b0e14] border border-white/10 px-2 py-1 font-mono text-xs"
        />
      </div>
    </div>
  );
}

function rareDropRate(result: MultiBatchResult): number {
  let rareDrops = 0;
  let total = 0;
  for (const r of result.results) {
    total += r.count;
    for (const [rarity, n] of Object.entries(r.freqByRarity)) {
      if (RARE_RARITIES.has(rarity)) rareDrops += n;
    }
  }
  return total > 0 ? rareDrops / total : 0;
}

function SimResults({ result }: { result: MultiBatchResult }) {
  const perCase = result.results;
  const bySkin: Record<string, number> = {};
  const byWear: Record<string, number> = {};
  const byRarity: Record<string, number> = {};
  let total = 0;
  for (const r of perCase) {
    total += r.count;
    for (const [k, v] of Object.entries(r.freqBySkin)) bySkin[k] = (bySkin[k] ?? 0) + v;
    for (const [k, v] of Object.entries(r.freqByWear)) byWear[k] = (byWear[k] ?? 0) + v;
    for (const [k, v] of Object.entries(r.freqByRarity)) byRarity[k] = (byRarity[k] ?? 0) + v;
  }

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total cost" value={fmt(result.totalCost)} />
        <Stat label="Total value" value={fmt(result.totalValue)} />
        <Stat
          label="Net P/L"
          value={fmt(result.net)}
          cls={result.net >= 0 ? "text-emerald-400" : "text-red-400"}
        />
        <Stat
          label="ROI"
          value={pct(result.roi)}
          cls={result.roi >= 0 ? "text-emerald-400" : "text-red-400"}
        />
      </div>

      <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm">
        Rare drop rate (Covert + Knife + Gloves):{" "}
        <span className="text-amber-400">{pct(rareDropRate(result))}</span>{" "}
        across {total} opens
      </div>

      <div className="overflow-hidden rounded-xl border border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-left text-xs uppercase tracking-wider text-white/50">
            <tr>
              <th className="px-3 py-2">Case</th>
              <th className="px-3 py-2 text-right">Opens</th>
              <th className="px-3 py-2 text-right">Cost</th>
              <th className="px-3 py-2 text-right">Value</th>
              <th className="px-3 py-2 text-right">ROI</th>
            </tr>
          </thead>
          <tbody>
            {perCase.map((r) => (
              <tr key={r.caseSlug} className="border-t border-white/5">
                <td className="px-3 py-2">{r.caseName}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.count}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(r.totalCost)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(r.totalValue)}</td>
                <td
                  className={`px-3 py-2 text-right tabular-nums ${
                    r.roi >= 0 ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  {pct(r.roi)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <FreqTable title="Drop frequency by rarity" data={byRarity} total={total} colorByKey={RARITY_COLORS} />
        <FreqTable title="Drop frequency by wear" data={byWear} total={total} />
        <FreqTable title="Drop frequency by skin" data={bySkin} total={total} dense />
      </div>

      <PerCaseDrops results={perCase} serverSeed={result.serverSeed} />
    </section>
  );
}

function Stat({
  label,
  value,
  cls,
}: {
  label: string;
  value: string;
  cls?: string;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-3">
      <div className="text-xs text-white/50">{label}</div>
      <div className={`mt-1 text-lg font-semibold tabular-nums ${cls ?? ""}`}>
        {value}
      </div>
    </div>
  );
}

function FreqTable({
  title,
  data,
  total,
  colorByKey,
  dense,
}: {
  title: string;
  data: Record<string, number>;
  total: number;
  colorByKey?: Record<string, string>;
  dense?: boolean;
}) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  return (
    <div className="overflow-hidden rounded-xl border border-white/10">
      <div className="bg-white/5 px-3 py-2 text-xs uppercase tracking-wider text-white/50">
        {title}
      </div>
      <table className="w-full text-sm">
        <tbody>
          {entries.map(([k, v]) => (
            <tr key={k} className="border-t border-white/5">
              <td className={`px-3 py-1.5 ${dense ? "" : ""}`}>
                {colorByKey ? (
                  <span
                    className="inline-block h-2 w-2 rounded-full align-middle mr-2"
                    style={{ background: colorByKey[k] ?? "#888" }}
                  />
                ) : null}
                <span className="align-middle">{k}</span>
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums">{v}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-white/50">
                {total > 0 ? pct(v / total) : "0%"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PerCaseDrops({ results, serverSeed }: { results: BatchResult[]; serverSeed: string }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      <div className="text-xs uppercase tracking-wider text-white/50">
        Per-case best &amp; worst drops
      </div>
      {results.map((r) => {
        const open = expanded === r.caseSlug;
        if (!r.drops.length) return null;
        return (
          <div
            key={r.caseSlug}
            className="rounded-xl border border-white/10 bg-white/5"
          >
            <button
              onClick={() => setExpanded(open ? null : r.caseSlug)}
              className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-white/5"
            >
              <span className="font-medium">{r.caseName}</span>
              <span className="text-xs text-white/50">
                {open ? "hide drops" : `show ${r.drops.length} drops`}
              </span>
            </button>
            <div className="border-t border-white/5 p-3 space-y-2">
              <DropDrop label="Best" drop={r.best} />
              <DropDrop label="Worst" drop={r.worst} />
              {open && (
                <div className="mt-2 max-h-96 overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="text-left text-white/40">
                      <tr>
                        <th className="px-2 py-1">Nonce</th>
                        <th className="px-2 py-1">Skin</th>
                        <th className="px-2 py-1">Wear</th>
                        <th className="px-2 py-1 text-right">Value</th>
                        <th className="px-2 py-1 text-right">Verify</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.drops.map((d) => (
                        <DropRow key={`${d.caseSlug}:${d.nonce}`} drop={d} serverSeed={serverSeed} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DropDrop({ label, drop }: { label: string; drop: import("@/lib/types").Drop }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <div>
        <span className="text-xs uppercase text-white/40 mr-2">{label}</span>
        <span
          className="inline-block h-2 w-2 rounded-full align-middle mr-1"
          style={{ background: RARITY_COLORS[drop.skin.rarity] ?? "#888" }}
        />
        <span className="align-middle">{drop.skin.name}</span>{" "}
        <span className="text-white/40">· {drop.wear.wear} ·</span>{" "}
        <span className="text-amber-400">{fmt(drop.value)}</span>
      </div>
      <span className="text-xs text-white/40">nonce {drop.nonce}</span>
    </div>
  );
}

function DropRow({ drop, serverSeed }: { drop: import("@/lib/types").Drop; serverSeed: string }) {
  return (
    <tr className="border-t border-white/5">
      <td className="px-2 py-1 tabular-nums text-white/50">{drop.nonce}</td>
      <td className="px-2 py-1">{drop.skin.name}</td>
      <td className="px-2 py-1">{drop.wear.wear}</td>
      <td className="px-2 py-1 text-right tabular-nums">{fmt(drop.value)}</td>
      <td className="px-2 py-1 text-right">
        <SimVerifier drop={drop} serverSeed={serverSeed} />
      </td>
    </tr>
  );
}