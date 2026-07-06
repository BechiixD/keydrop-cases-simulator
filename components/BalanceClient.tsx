"use client";

import { useEffect, useState } from "react";
import type { MultiBatchResult } from "@/lib/types";
import {
  clearHistory,
  getBalance,
  getHistory,
  resetBalance,
  setBalance as setBalanceStore,
} from "@/lib/storage";

function fmt(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}
function pct(n: number): string {
  return (n * 100).toFixed(2) + "%";
}
function when(ts: number): string {
  return new Date(ts).toLocaleString();
}

export function BalanceClient() {
  const [balance, setBalance] = useState<number>(10000);
  const [history, setHistory] = useState<MultiBatchResult[]>([]);
  const [depositAmt, setDepositAmt] = useState<number>(1000);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setBalance(getBalance());
    setHistory(getHistory());
    setReady(true);
  }, []);

  function doDeposit(): void {
    const next = getBalance() + Math.max(0, Math.floor(depositAmt));
    setBalanceStore(next);
    setBalance(next);
  }
  function doReset(): void {
    resetBalance();
    setBalance(getBalance());
  }
  function doClearHistory(): void {
    if (
      typeof window === "object" &&
      !window.confirm("Clear all batch history? This cannot be undone.")
    ) {
      return;
    }
    clearHistory();
    setHistory([]);
  }

  let totalCost = 0;
  let totalValue = 0;
  let totalOpens = 0;
  for (const h of history) {
    totalCost += h.totalCost;
    totalValue += h.totalValue;
    for (const r of h.results) totalOpens += r.count;
  }
  const roi = totalCost > 0 ? (totalValue - totalCost) / totalCost : 0;

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Balance &amp; history</h1>
        <span className="text-sm text-white/50">fake money · localStorage only</span>
      </header>

      <section className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
          <div className="text-xs uppercase tracking-wider text-white/50">
            Current balance
          </div>
          <div className="text-3xl font-semibold text-amber-400">
            {ready ? fmt(balance) : "…"}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              value={depositAmt}
              onChange={(e) =>
                setDepositAmt(Math.max(0, Math.floor(Number(e.target.value))))
              }
              className="w-32 rounded bg-[#0b0e14] border border-white/10 px-2 py-1 text-sm tabular-nums"
            />
            <button
              onClick={doDeposit}
              className="rounded border border-amber-400/40 px-3 py-1 text-sm text-amber-400 hover:bg-amber-400/10"
            >
              deposit
            </button>
            <button
              onClick={doReset}
              className="rounded border border-white/10 px-3 py-1 text-sm hover:bg-white/5"
            >
              reset to 10,000
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
          <div className="text-xs uppercase tracking-wider text-white/50">
            Lifetime
          </div>
          <dl className="grid grid-cols-2 gap-y-1 text-sm">
            <dt className="text-white/50">Batches run</dt>
            <dd className="text-right tabular-nums">{history.length}</dd>
            <dt className="text-white/50">Total opens</dt>
            <dd className="text-right tabular-nums">{totalOpens}</dd>
            <dt className="text-white/50">Total invested</dt>
            <dd className="text-right tabular-nums">{fmt(totalCost)}</dd>
            <dt className="text-white/50">Total value won</dt>
            <dd className="text-right tabular-nums">{fmt(totalValue)}</dd>
            <dt className="text-white/50">Net</dt>
            <dd
              className={`text-right tabular-nums ${
                totalValue - totalCost >= 0 ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {fmt(totalValue - totalCost)}
            </dd>
            <dt className="text-white/50">ROI</dt>
            <dd
              className={`text-right tabular-nums ${
                roi >= 0 ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {pct(roi)}
            </dd>
          </dl>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-white/60">
            Batch history
          </h2>
          {history.length > 0 && (
            <button
              onClick={doClearHistory}
              className="text-xs text-red-400/80 hover:text-red-300"
            >
              clear all
            </button>
          )}
        </div>
        {!ready ? (
          <div className="text-sm text-white/40">…</div>
        ) : history.length === 0 ? (
          <div className="rounded-lg border border-white/10 bg-white/5 p-6 text-sm text-white/60">
            No batches yet. Visit the{" "}
            <a href="/sim" className="text-amber-400 hover:underline">
              simulator
            </a>{" "}
            and run a batch.
          </div>
        ) : (
          <div className="space-y-3">
            {history.map((h, i) => (
              <BatchHistoryCard key={`${h.ranAt}-${i}`} result={h} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function BatchHistoryCard({ result }: { result: MultiBatchResult }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-xl border border-white/10 bg-white/5">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-white/5"
      >
        <div>
          <div className="text-sm font-medium">{when(result.ranAt)}</div>
          <div className="text-xs text-white/50">
            {result.results.length} case(s) ·{" "}
            {result.results.reduce((a, r) => a + r.count, 0)} opens
          </div>
        </div>
        <div className="text-right text-sm tabular-nums">
          <span className="text-white/70">cost {fmt(result.totalCost)} · </span>
          <span className="text-white/70">value {fmt(result.totalValue)} · </span>
          <span
            className={
              result.roi >= 0 ? "text-emerald-400" : "text-red-400"
            }
          >
            ROI {pct(result.roi)}
          </span>
        </div>
      </button>
      {expanded && (
        <div className="border-t border-white/5 p-3 space-y-2 text-xs">
          <div className="text-white/50">
            serverSeed <code className="text-amber-400 break-all">{result.serverSeed}</code>
            <br />
            clientSeed <code>{result.clientSeed}</code> · startNonce{" "}
            <code>{result.startNonce}</code>
          </div>
          <table className="w-full text-xs">
            <thead className="text-left text-white/40">
              <tr>
                <th className="px-2 py-1">Case</th>
                <th className="px-2 py-1 text-right">Opens</th>
                <th className="px-2 py-1 text-right">Cost</th>
                <th className="px-2 py-1 text-right">Value</th>
                <th className="px-2 py-1 text-right">ROI</th>
              </tr>
            </thead>
            <tbody>
              {result.results.map((r) => (
                <tr key={r.caseSlug} className="border-t border-white/5">
                  <td className="px-2 py-1">{r.caseName}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{r.count}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{fmt(r.totalCost)}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{fmt(r.totalValue)}</td>
                  <td
                    className={`px-2 py-1 text-right tabular-nums ${
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
      )}
    </div>
  );
}