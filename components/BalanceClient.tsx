"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BattleResult, MultiBatchResult } from "@/lib/types";
import { teamColor } from "@/lib/battleEngine";
import {
  adjustBalance,
  clearBattleHistory,
  clearHistory,
  DEFAULT_BALANCE,
  getBalance,
  getBattleHistory,
  getHistory,
  resetBalance,
  setBalance as setBalanceStore,
} from "@/lib/storage";

const PRESETS = [1000, 10000, 50000, 100000, 1000000, 10000000] as const;

function fmt(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}
function pct(n: number): string {
  return (n * 100).toFixed(2) + "%";
}
function when(ts: number): string {
  return new Date(ts).toLocaleString();
}
function fmtShort(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}k`;
  return String(n);
}

export function BalanceClient() {
  const [balance, setBalance] = useState<number>(10000);
  const [history, setHistory] = useState<MultiBatchResult[]>([]);
  const [battleHistory, setBattleHistory] = useState<BattleResult[]>([]);
  const [depositAmt, setDepositAmt] = useState<number>(1000);
  const [withdrawAmt, setWithdrawAmt] = useState<number>(1000);
  const [setToAmt, setSetToAmt] = useState<number>(10000);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<"batches" | "battles">("batches");
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setBalance(getBalance());
    setHistory(getHistory());
    setBattleHistory(getBattleHistory());
    setReady(true);
  }, []);

  const showToast = useCallback((msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  }, []);

  function doDeposit(): void {
    const next = getBalance() + Math.max(0, Math.floor(depositAmt));
    setBalanceStore(next);
    setBalance(next);
    showToast(`Deposited ${fmt(depositAmt)} — new balance ${fmt(next)}`);
  }
  function doWithdraw(): void {
    const amt = Math.max(0, Math.floor(withdrawAmt));
    if (amt <= 0 || amt > balance) return;
    const next = adjustBalance(-amt);
    setBalance(next);
    showToast(`Withdrew ${fmt(amt)} — new balance ${fmt(next)}`);
  }
  function doSetTo(): void {
    const v = Math.max(0, Math.floor(setToAmt));
    if (balance > 1_000_000 && v < balance / 10) {
      if (
        typeof window === "object" &&
        !window.confirm(
          `Set balance from ${fmt(balance)} to ${fmt(v)}? This is a large drop.`,
        )
      ) {
        return;
      }
    }
    setBalanceStore(v);
    setBalance(v);
    showToast(`Balance set to ${fmt(v)}`);
  }
  function doPreset(n: number): void {
    if (balance > 1_000_000 && n < balance / 10) {
      if (
        typeof window === "object" &&
        !window.confirm(
          `Set balance from ${fmt(balance)} to ${fmt(n)}? This is a large drop.`,
        )
      ) {
        return;
      }
    }
    setBalanceStore(n);
    setBalance(n);
    showToast(`Balance set to ${fmt(n)}`);
  }
  function doReset(): void {
    resetBalance();
    setBalance(getBalance());
    showToast(`Reset to default ${fmt(DEFAULT_BALANCE)}`);
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
  function doClearBattles(): void {
    if (
      typeof window === "object" &&
      !window.confirm("Clear all battle history? This cannot be undone.")
    ) {
      return;
    }
    clearBattleHistory();
    setBattleHistory([]);
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

  let battleWins = 0;
  let battleLosses = 0;
  let battleNet = 0;
  for (const b of battleHistory) {
    const bNet = b.userNet ?? 0;
    if (bNet > 0) battleWins++;
    else if (bNet < 0) battleLosses++;
    battleNet += bNet;
  }

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Balance &amp; history</h1>
        <span className="text-sm text-white/50">fake money · localStorage only</span>
      </header>

      <section className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase tracking-wider text-white/50">
              Current balance
            </div>
            {toast && (
              <div className="animate-pulse rounded bg-amber-400/15 px-2 py-0.5 text-[11px] text-amber-300">
                {toast}
              </div>
            )}
          </div>
          <div className="text-3xl font-semibold text-amber-400">
            {ready ? fmt(balance) : <span className="inline-block h-8 w-32 animate-pulse rounded bg-white/10" />}
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <input
              type="number"
              min={0}
              value={setToAmt}
              onChange={(e) =>
                setSetToAmt(Math.max(0, Math.floor(Number(e.target.value) || 0)))
              }
              className="w-full sm:w-32 rounded bg-[#0b0e14] border border-white/10 px-2 py-2 sm:py-1 text-sm tabular-nums min-h-[44px] sm:min-h-0"
            />
            <button
              onClick={doSetTo}
              className="rounded border border-white/10 px-3 py-2 sm:py-1 text-sm text-white/70 hover:bg-white/5 min-h-[44px] sm:min-h-0"
            >
              set to
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-white/30 mr-1">
              presets
            </span>
            {PRESETS.map((n) => (
              <button
                key={n}
                onClick={() => doPreset(n)}
                className="rounded border border-white/10 px-1.5 py-0.5 text-[11px] text-white/50 hover:bg-amber-400/10 hover:text-amber-400 hover:border-amber-400/30 transition"
              >
                {fmtShort(n)}
              </button>
            ))}
          </div>

          <div className="border-t border-white/5 pt-2 space-y-2">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <input
                type="number"
                min={0}
                value={depositAmt}
                onChange={(e) =>
                  setDepositAmt(Math.max(0, Math.floor(Number(e.target.value) || 0)))
                }
                className="w-full sm:w-32 rounded bg-[#0b0e14] border border-white/10 px-2 py-2 sm:py-1 text-sm tabular-nums min-h-[44px] sm:min-h-0"
              />
              <button
                onClick={doDeposit}
                className="rounded border border-emerald-400/30 px-3 py-2 sm:py-1 text-sm text-emerald-400 hover:bg-emerald-400/10 min-h-[44px] sm:min-h-0"
              >
                deposit (+)
              </button>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <input
                type="number"
                min={0}
                max={balance}
                value={withdrawAmt}
                onChange={(e) =>
                  setWithdrawAmt(Math.max(0, Math.floor(Number(e.target.value) || 0)))
                }
                className="w-full sm:w-32 rounded bg-[#0b0e14] border border-white/10 px-2 py-2 sm:py-1 text-sm tabular-nums min-h-[44px] sm:min-h-0"
              />
              <button
                onClick={doWithdraw}
                disabled={withdrawAmt <= 0 || withdrawAmt > balance}
                className="rounded border border-red-400/30 px-3 py-2 sm:py-1 text-sm text-red-400 hover:bg-red-400/10 disabled:opacity-30 min-h-[44px] sm:min-h-0"
              >
                withdraw (−)
              </button>
            </div>
          </div>

          <div className="border-t border-white/5 pt-2">
            <button
              onClick={doReset}
              className="rounded border border-white/10 px-3 py-1 text-xs text-white/40 hover:bg-white/5"
            >
              reset (default {fmtShort(DEFAULT_BALANCE)})
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
          <div className="text-xs uppercase tracking-wider text-white/50">
            Batch lifetime
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

      <section className="grid gap-3 md:grid-cols-1">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
          <div className="text-xs uppercase tracking-wider text-white/50">
            Battle lifetime
          </div>
          <dl className="grid grid-cols-2 gap-y-1 text-sm">
            <dt className="text-white/50">Battles played</dt>
            <dd className="text-right tabular-nums">{battleHistory.length}</dd>
            <dt className="text-white/50">Record</dt>
            <dd className="text-right tabular-nums">
              <span className="text-emerald-400">{battleWins}W</span>{" "}
              <span className="text-white/30">–</span>{" "}
              <span className="text-red-400">{battleLosses}L</span>
            </dd>
            <dt className="text-white/50">Battle net</dt>
            <dd
              className={`text-right tabular-nums ${
                battleNet >= 0 ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {battleNet >= 0 ? "+" : ""}{fmt(battleNet)}
            </dd>
          </dl>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex gap-1 rounded-lg border border-white/10 p-0.5">
            <button
              onClick={() => setTab("batches")}
              className={`rounded px-3 py-1 text-xs font-medium transition ${
                tab === "batches"
                  ? "bg-amber-400/20 text-amber-400"
                  : "text-white/60 hover:text-white/80"
              }`}
            >
              Batches ({history.length})
            </button>
            <button
              onClick={() => setTab("battles")}
              className={`rounded px-3 py-1 text-xs font-medium transition ${
                tab === "battles"
                  ? "bg-amber-400/20 text-amber-400"
                  : "text-white/60 hover:text-white/80"
              }`}
            >
              Battles ({battleHistory.length})
            </button>
          </div>
          {tab === "batches" && history.length > 0 && (
            <button
              onClick={doClearHistory}
              className="text-xs text-red-400/80 hover:text-red-300"
            >
              clear all
            </button>
          )}
          {tab === "battles" && battleHistory.length > 0 && (
            <button
              onClick={doClearBattles}
              className="text-xs text-red-400/80 hover:text-red-300"
            >
              clear all battles
            </button>
          )}
        </div>
        {!ready ? (
          <div className="space-y-2">
            <div className="h-16 animate-pulse rounded-xl bg-white/5" />
            <div className="h-16 animate-pulse rounded-xl bg-white/5" />
          </div>
        ) : tab === "batches" && history.length === 0 ? (
          <div className="rounded-lg border border-white/10 bg-white/5 p-6 text-sm text-white/60">
            No batches yet. Visit the{" "}
            <a href="/sim" className="text-amber-400 hover:underline">
              simulator
            </a>{" "}
            and run a batch.
          </div>
        ) : tab === "batches" ? (
          <div className="space-y-3">
            {history.map((h, i) => (
              <BatchHistoryCard key={`${h.ranAt}-${i}`} result={h} />
            ))}
          </div>
        ) : tab === "battles" && battleHistory.length === 0 ? (
          <div className="rounded-lg border border-white/10 bg-white/5 p-6 text-sm text-white/60">
            No battles yet. Visit the{" "}
            <a href="/battles" className="text-amber-400 hover:underline">
              battles page
            </a>{" "}
            and run a battle.
          </div>
        ) : (
          <div className="space-y-3">
            {battleHistory.map((b, i) => (
              <BattleHistoryCard key={`${b.ranAt}-${i}`} result={b} />
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

function BattleHistoryCard({ result }: { result: BattleResult }) {
  const [expanded, setExpanded] = useState(false);
  const wTeam = result.winnerTeamIndex;
  const firstWinner = result.teams[wTeam]?.playerNames[0] ?? "";
  const userNet = result.userNet ?? 0;
  const netStr = userNet >= 0 ? "+" : "";
  return (
    <div className="rounded-xl border border-white/10 bg-white/5">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-white/5"
      >
        <div>
          <div className="text-sm font-medium">{when(result.ranAt)}</div>
          <div className="text-xs text-white/50">
            {result.format} · {result.mode} · borrow {result.borrowPercent}%
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm tabular-nums">
          <span
            className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
              userNet >= 0
                ? "bg-emerald-400/15 text-emerald-300"
                : "bg-red-400/15 text-red-300"
            }`}
          >
            {userNet >= 0 ? "WIN" : "LOSS"}
          </span>
          <span
            className={
              userNet >= 0 ? "text-emerald-400" : "text-red-400"
            }
          >
            {netStr}{fmt(userNet)}
          </span>
        </div>
      </button>
      {expanded && (
        <div className="border-t border-white/5 p-3 space-y-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-full" style={{ background: teamColor(wTeam) }} />
            <span className="font-medium" style={{ color: teamColor(wTeam) }}>
              Winner team {wTeam + 1}: {firstWinner}
            </span>
            <span className="text-white/50">
              · {result.teams[wTeam].totalValue.toFixed(2)} total value
            </span>
          </div>
          <table className="w-full text-xs">
            <thead className="text-left text-white/40">
              <tr>
                <th className="px-2 py-1">Team</th>
                <th className="px-2 py-1">Players</th>
                <th className="px-2 py-1 text-right">Value</th>
                <th className="px-2 py-1 text-right">Rank</th>
                <th className="px-2 py-1 text-right">Payout</th>
                <th className="px-2 py-1 text-right">Net</th>
              </tr>
            </thead>
            <tbody>
              {result.teams.map((t) => (
                <tr key={t.index} className="border-t border-white/5">
                  <td className="px-2 py-1">
                    <span className="inline-block h-2 w-2 rounded-full mr-1" style={{ background: teamColor(t.index) }} />
                    {t.index + 1}
                    {t.index === wTeam ? " 👑" : ""}
                  </td>
                  <td className="px-2 py-1 text-white/70">{t.playerNames.join(", ")}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{fmt(t.totalValue)}</td>
                  <td className="px-2 py-1 text-right tabular-nums">#{t.rank}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{fmt(t.payout)}</td>
                  <td className={`px-2 py-1 text-right tabular-nums ${t.net >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {t.net >= 0 ? "+" : ""}{fmt(t.net)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="text-white/50">
            serverSeed{" "}
            <code className="text-amber-400 break-all">{result.serverSeed}</code>
            <br />
            startNonce <code>{result.startNonce}</code>
          </div>
        </div>
      )}
    </div>
  );
}