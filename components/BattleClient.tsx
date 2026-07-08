"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  BattleConfig,
  BattleFormat,
  BattleMode,
  BattleResult,
  CaseDefinition,
  Drop,
} from "@/lib/types";
import { runBattle, teamColor } from "@/lib/battleEngine";
import {
  hashServerSeed,
  randomClientSeed,
  randomServerSeed,
} from "@/lib/provablyFair";
import { jokerPrice } from "@/lib/caseEngine";
import { addDrops } from "@/lib/inventory";
import {
  adjustBalance,
  getBalance,
  getJokerMode,
  getLastNonce,
  pushBattleHistory,
  setJokerMode,
  setLastNonce,
} from "@/lib/storage";
import { SimVerifier } from "@/components/SimVerifier";
import {
  RARITY_COLORS,
  WEAR_COLORS,
  WEAR_ORDER,
} from "@/lib/ui/colors";

const BOT_NAMES = [
  "ada",
  "blaze",
  "crypt",
  "dust",
  "echo",
  "flux",
  "ghost",
  "halo",
];

function fmt(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}
function pct(n: number): string {
  return (n * 100).toFixed(1) + "%";
}

interface FormatPreset {
  format: BattleFormat;
  label: string;
  numTeams: number;
  teamSize: number;
}

const PRESETS: FormatPreset[] = [
  { format: "1v1", label: "1v1", numTeams: 2, teamSize: 1 },
  { format: "1v1v1", label: "1v1v1", numTeams: 3, teamSize: 1 },
  { format: "1v1v1v1", label: "1v1v1v1", numTeams: 4, teamSize: 1 },
  { format: "2v2", label: "2v2", numTeams: 2, teamSize: 2 },
  { format: "3v3", label: "3v3", numTeams: 2, teamSize: 3 },
];

function bestFit(drops: Drop[], target: number): Drop[] {
  if (drops.length === 0 || target <= 0) return [];
  const n = drops.length;
  if (n > 20) {
    const sorted = [...drops].sort((a, b) => b.value - a.value);
    const sel: Drop[] = [];
    let sum = 0;
    for (const d of sorted) {
      if (sum >= target) break;
      sel.push(d);
      sum += d.value;
    }
    return sel;
  }
  const total = 1 << n;
  let bestMask = 0;
  let bestError = Infinity;
  let bestSum = 0;
  for (let mask = 1; mask < total; mask++) {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) sum += drops[i].value;
    }
    const err = Math.abs(sum - target);
    if (err < bestError || (err === bestError && sum < bestSum)) {
      bestError = err;
      bestMask = mask;
      bestSum = sum;
    }
  }
  const out: Drop[] = [];
  for (let i = 0; i < n; i++) {
    if (bestMask & (1 << i)) out.push(drops[i]);
  }
  return out;
}

export function BattleClient({
  cases,
  initialServerSeed,
}: {
  cases: CaseDefinition[];
  initialServerSeed: string;
}) {
  const [serverSeed, setServerSeed] = useState(initialServerSeed);
  const [revealed, setRevealed] = useState(false);
  const [format, setFormat] = useState<BattleFormat>("1v1");
  const [mode, setMode] = useState<BattleMode>("classic");
  const [borrow, setBorrow] = useState(0);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [rounds, setRounds] = useState<Record<string, number>>({});
  const [userClientSeed, setUserClientSeed] = useState(() =>
    randomClientSeed(),
  );
  const [result, setResult] = useState<BattleResult | null>(null);
  const [balance, setBalance] = useState(10000);
  const [balanceBusy, setBalanceBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [botSeeds, setBotSeeds] = useState<string[]>([]);
  const [joker, setJoker] = useState(false);

  const preset = useMemo(
    () => PRESETS.find((p) => p.format === format) ?? PRESETS[0],
    [format],
  );

  useEffect(() => {
    setBalance(getBalance());
    setBalanceBusy(false);
    setJoker(getJokerMode());
    const totalBots = preset.numTeams * preset.teamSize - 1;
    setBotSeeds((prev) => {
      const next = [...prev];
      while (next.length < totalBots) next.push(randomClientSeed());
      next.length = totalBots;
      return next;
    });
  }, [preset]);

  const serverSeedHash = useMemo(
    () => hashServerSeed(serverSeed),
    [serverSeed],
  );

  const selectedCases = useMemo(
    () => cases.filter((c) => selected[c.slug] && (rounds[c.slug] ?? 0) > 0),
    [cases, selected, rounds],
  );

  function priceOf(c: CaseDefinition): number {
    return joker ? jokerPrice(c) : c.price;
  }

  function toggleJoker(next: boolean): void {
    setJoker(next);
    setJokerMode(next);
    setResult(null);
  }

  const userCost = useMemo(() => {
    let total = 0;
    for (const c of selectedCases) {
      total += priceOf(c) * (rounds[c.slug] ?? 0);
    }
    return total * (100 - borrow) / 100;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCases, rounds, borrow, joker]);

  function reshuffle(): void {
    setServerSeed(randomServerSeed());
    setRevealed(false);
    setResult(null);
  }
  function newClientSeed(): void {
    setUserClientSeed(randomClientSeed());
  }
  function newBots(): void {
    setBotSeeds(
      Array.from({ length: preset.numTeams * preset.teamSize - 1 }, () =>
        randomClientSeed(),
      ),
    );
  }

  function toggle(slug: string): void {
    setSelected((s) => ({ ...s, [slug]: !s[slug] }));
  }
  function setRound(slug: string, n: number): void {
    setRounds((r) => ({
      ...r,
      [slug]: Math.max(0, Math.floor(Number.isFinite(n) ? n : 0)),
    }));
  }

  function run(): void {
    setError(null);
    if (selectedCases.length === 0) {
      setError("Select at least one case with rounds > 0.");
      return;
    }
    if (balance < userCost) {
      setError(`Insufficient balance: need ${fmt(userCost)}, have ${fmt(balance)}.`);
      return;
    }
    const newBal = adjustBalance(-userCost);
    setBalance(newBal);
    const totalBots = preset.numTeams * preset.teamSize - 1;
    if (botSeeds.length < totalBots) {
      setError("Bot seeds not initialized.");
      return;
    }
    const players = [];
    let botIdx = 0;
    for (let team = 0; team < preset.numTeams; team++) {
      for (let member = 0; member < preset.teamSize; member++) {
        const isUserSpot = team === 0 && member === 0;
        players.push({
          name: isUserSpot ? "you" : `${BOT_NAMES[botIdx % BOT_NAMES.length]}${botIdx >= BOT_NAMES.length ? botIdx : ""}`,
          isUser: isUserSpot,
          clientSeed: isUserSpot ? userClientSeed : botSeeds[botIdx],
          counts: selectedCases.map((c) => rounds[c.slug] ?? 0),
        });
        if (!isUserSpot) botIdx++;
      }
    }
    const cfg: BattleConfig = {
      format,
      mode,
      borrowPercent: borrow,
      cases: selectedCases,
      roundsPerCase: selectedCases.length,
      players,
      joker,
    };
    const startNonce = getLastNonce();
    const totalOpens = preset.numTeams * preset.teamSize * selectedCases.reduce((s, c) => s + (rounds[c.slug] ?? 0), 0);
    const res = runBattle(cfg, serverSeed, startNonce);
    setLastNonce(startNonce + totalOpens);
    const userPlayer = res.players.find((p) => p.isUser);
    if (userPlayer && userPlayer.teamIndex === res.winnerTeamIndex) {
      const payoutValue = userPlayer.net + userPlayer.entryCost;
      const candidates = userPlayer.drops;
      const selected = bestFit(candidates, payoutValue);
      if (selected.length > 0) {
        addDrops(selected, "battle", `${res.format}:${res.mode}`);
      }
    }
    pushBattleHistory(res);
    setRevealed(true);
    setResult(res);
  }

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Case battles</h1>
        <div className="text-sm text-white/50">
          Balance{" "}
          <span className={balance < userCost && userCost > 0 ? "text-red-400" : "text-amber-400"}>
            {balanceBusy ? "…" : fmt(balance)}
          </span>{" "}
          coins
        </div>
      </header>

      <button
        type="button"
        onClick={() => toggleJoker(!joker)}
        aria-pressed={joker}
        className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition ${
          joker
            ? "border-fuchsia-400/60 bg-fuchsia-400/10"
            : "border-white/10 bg-white/5 hover:bg-white/10"
        }`}
      >
        <div className="flex items-center gap-3">
          <span className="text-xl">🃏</span>
          <div>
            <div className="font-semibold">
              Joker mode{" "}
              <span className={joker ? "text-fuchsia-400" : "text-white/40"}>
                {joker ? "ON" : "OFF"}
              </span>
            </div>
            <div className="text-xs text-white/50">
              All weapons get equal odds. Price rises to keep the case&apos;s
              original house edge.
            </div>
          </div>
        </div>
        <span
          className={`relative h-6 w-11 shrink-0 rounded-full transition ${
            joker ? "bg-fuchsia-400/80" : "bg-white/15"
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
              joker ? "left-[22px]" : "left-0.5"
            }`}
          />
        </span>
      </button>

      <section className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-4">
        <div>
          <div className="text-xs uppercase tracking-wider text-white/50 mb-1">
            Format
          </div>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.format}
                onClick={() => {
                  setFormat(p.format);
                  setResult(null);
                }}
                className={`rounded border px-3 py-1.5 text-sm font-medium ${
                  format === p.format
                    ? "border-amber-400/60 bg-amber-400/10 text-amber-400"
                    : "border-white/10 hover:bg-white/5"
                }`}
              >
                <span className="flex items-center gap-2">
                  <span>{p.label}</span>
                  <span className="flex items-center gap-0.5 text-xs leading-none">
                    <span className="text-amber-400">
                      {"●".repeat(p.teamSize)}
                    </span>
                    <span className="text-white/30">vs</span>
                    <span className="text-white/40">
                      {"○".repeat(p.teamSize)}
                    </span>
                  </span>
                </span>
              </button>
            ))}
          </div>
          <div className="mt-1 text-xs text-white/40">
            {preset.numTeams} teams × {preset.teamSize} = {preset.numTeams * preset.teamSize} players
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <div className="text-xs uppercase tracking-wider text-white/50 mb-1">
              Mode
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setMode("classic")}
                className={`flex-1 rounded border px-3 py-2 text-sm ${
                  mode === "classic" ? "border-emerald-400/60 bg-emerald-400/10 text-emerald-300" : "border-white/10 hover:bg-white/5"
                }`}
              >
                classic — highest value wins
              </button>
              <button
                onClick={() => setMode("underdog")}
                className={`flex-1 rounded border px-3 py-2 text-sm ${
                  mode === "underdog" ? "border-blue-400/60 bg-blue-400/10 text-blue-300" : "border-white/10 hover:bg-white/5"
                }`}
              >
                underdog — lowest value wins
              </button>
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-white/50 mb-1">
              Borrow: <span className="text-amber-400">{borrow}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={90}
              value={borrow}
              onChange={(e) => setBorrow(Number(e.target.value))}
              className="w-full accent-amber-400"
            />
            <div className="text-xs text-white/40">
              winner takes {100 - borrow}% of loser&apos;s loot · entry is {100 - borrow}% of case price
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
        <div className="text-xs uppercase tracking-wider text-white/50 mb-1">
          Select cases &amp; rounds per player
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {cases.map((c) => {
            const isSel = !!selected[c.slug];
            const price = priceOf(c);
            return (
              <label
                key={c.slug}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border p-3 transition ${
                  isSel
                    ? joker
                      ? "border-fuchsia-400/60 bg-fuchsia-400/5"
                      : "border-amber-400/60 bg-amber-400/5"
                    : "border-white/10 bg-white/0 hover:bg-white/5"
                }`}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded bg-white/5">
                  {c.imageUrl ? (
                    <img
                      src={c.imageUrl}
                      alt={c.name}
                      loading="lazy"
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <span className="text-xs font-bold text-white/30">{c.name[0]}</span>
                  )}
                </div>
                <input
                  type="checkbox"
                  checked={isSel}
                  onChange={() => toggle(c.slug)}
                  className="accent-amber-400"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{c.name}</div>
                  <div className="text-xs text-white/50">
                    {joker ? (
                      <>
                        <span className="text-fuchsia-400">
                          {price.toLocaleString(undefined, { maximumFractionDigits: 2 })} coins
                        </span>{" "}
                        <span className="line-through text-white/30">
                          {c.price.toLocaleString()}
                        </span>
                      </>
                    ) : (
                      <>{c.price.toLocaleString()} coins</>
                    )}
                  </div>
                </div>
                <input
                  type="number"
                  min={0}
                  value={rounds[c.slug] ?? 0}
                  onChange={(e) => {
                    setRound(c.slug, Number(e.target.value));
                    if (!selected[c.slug]) toggle(c.slug);
                  }}
                  className="w-20 rounded bg-[#0b0e14] border border-white/10 px-2 py-1 text-sm tabular-nums"
                />
              </label>
            );
          })}
        </div>
        <div className="text-right text-sm">
          Your entry cost:{" "}
          <span className="text-amber-400 font-semibold">{fmt(userCost)}</span>{" "}
          coins
        </div>
      </section>

      <section className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-wider text-white/50">
            Provably-fair
          </div>
          <div className="flex gap-2">
            <button
              onClick={newBots}
              className="rounded border border-white/10 px-2 py-1 text-xs hover:bg-white/5"
            >
              reshuffle bots
            </button>
            <button
              onClick={reshuffle}
              className="rounded border border-white/10 px-2 py-1 text-xs hover:bg-white/5"
            >
              reshuffle server seed
            </button>
          </div>
        </div>
        <div>
          <div className="text-xs text-white/50">Server seed hash (before run)</div>
          <div className="mt-1 break-all rounded bg-[#0b0e14] border border-white/10 px-2 py-1 font-mono text-xs text-amber-400">
            {serverSeedHash}
          </div>
        </div>
        <div>
          <div className="text-xs text-white/50">Server seed (revealed after run)</div>
          <div className="mt-1 break-all rounded bg-[#0b0e14] border border-white/10 px-2 py-1 font-mono text-xs">
            {revealed ? serverSeed : "[hidden — run to reveal]"}
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <div className="text-xs text-white/50">Your client seed</div>
            <div className="mt-1 flex gap-2">
              <input
                value={userClientSeed}
                onChange={(e) => setUserClientSeed(e.target.value)}
                className="flex-1 rounded bg-[#0b0e14] border border-white/10 px-2 py-1 font-mono text-xs"
              />
              <button
                onClick={newClientSeed}
                className="rounded border border-white/10 px-2 py-1 text-xs hover:bg-white/5"
              >
                random
              </button>
            </div>
          </div>
          <div>
            <div className="text-xs text-white/50">Bot client seeds</div>
            <div className="mt-1 rounded bg-[#0b0e14] border border-white/10 px-2 py-1 font-mono text-xs text-white/70 max-h-16 overflow-auto">
              {botSeeds.map((s, i) => (
                <div key={i}>
                  <span className="text-white/40">bot{i + 1}</span> {s}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="sticky bottom-0 z-10 -mx-4 border-t border-white/10 bg-[#0b0e14]/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-sm">
            <span>
              Entry: <span className="font-semibold text-amber-400">{fmt(userCost)}</span>
            </span>
            <span className="text-white/40">·</span>
            <span>
              Balance:{" "}
              <span className={balance < userCost ? "font-semibold text-red-400" : "font-semibold text-emerald-400"}>
                {fmt(balance)}
              </span>
              {balance >= userCost ? " ✅" : " ❌"}
            </span>
          </div>
          <button
            onClick={run}
            disabled={selectedCases.length === 0 || balance < userCost}
            className="rounded bg-amber-500 px-6 py-2 text-sm font-semibold text-black disabled:opacity-40"
          >
            Run battle
          </button>
        </div>
        {error && (
          <div className="mt-2 rounded border border-red-400/40 bg-red-400/10 p-2 text-xs text-red-300">
            {error}
          </div>
        )}
      </div>

      {result && <BattleResultPanel result={result} serverSeed={serverSeed} serverSeedHash={serverSeedHash} />}

      {!result && (
        <div className="text-xs text-white/40 flex gap-1">
          Wear legend:
          {WEAR_ORDER.map((w) => (
            <span key={w} className="flex items-center gap-0.5">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: WEAR_COLORS[w] }} />
              <span style={{ color: WEAR_COLORS[w] }}>{w}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function BattleResultPanel({
  result,
  serverSeed,
}: {
  result: BattleResult;
  serverSeed: string;
  serverSeedHash: string;
}) {
  const [openPlayers, setOpenPlayers] = useState<Record<string, boolean>>({});
  return (
    <section className="space-y-4">
      <div className="rounded-xl border p-4" style={{ borderColor: teamColor(result.winnerTeamIndex) + "55", background: teamColor(result.winnerTeamIndex) + "11" }}>
        <div className="text-xs uppercase tracking-wider text-white/50">
          Result
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span className={`rounded px-2 py-0.5 text-xs font-bold uppercase ${result.userNet >= 0 ? 'bg-emerald-400/20 text-emerald-300' : 'bg-red-400/20 text-red-300'}`}>
            {result.userNet >= 0 ? 'YOU WIN' : 'YOU LOSE'}
          </span>
          <span className="text-sm text-white/70">
            {result.userNet >= 0 ? '+' : ''}{fmt(result.userNet)} coins
          </span>
        </div>
        <div className="mt-1 text-xs text-white/40">
          {result.format} · {result.mode} · borrow {result.borrowPercent}%{result.joker && " · 🃏 joker"} ·{" "}
          {result.teams[result.winnerTeamIndex].playerNames.join(" + ")} took the pot
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-left text-xs uppercase tracking-wider text-white/50">
            <tr>
              <th className="px-3 py-2">Team</th>
              <th className="px-3 py-2">Players</th>
              <th className="px-3 py-2 text-right">Net</th>
            </tr>
          </thead>
          <tbody>
            {result.teams.map((t) => {
              const isWinner = t.index === result.winnerTeamIndex;
              const members = result.players.filter((pr) => pr.teamIndex === t.index);
              return (
                <tr
                  key={t.index}
                  className="border-t border-white/5"
                  style={{ boxShadow: `inset 4px 0 0 ${teamColor(t.index)}` }}
                >
                  <td className="pl-4 px-3 py-2">
                    <span className="inline-block h-2 w-2 rounded-full mr-1" style={{ background: teamColor(t.index) }} />
                    team {t.index + 1}
                    {isWinner && <span className="ml-1">👑</span>}
                    <span className={`ml-2 text-[10px] font-bold uppercase ${isWinner ? 'text-emerald-400' : 'text-red-400'}`}>
                      {isWinner ? 'WIN' : 'LOSS'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-white/70">
                    {members.map((pr, j) => (
                      <span key={pr.name}>
                        {j > 0 && ', '}
                        {pr.name}
                        {pr.isUser && <span className="ml-0.5 text-amber-400 text-xs">(you)</span>}
                      </span>
                    ))}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {members.map((pr, j) => (
                      <div key={pr.name} className={j > 0 ? 'mt-0.5' : ''}>
                        {pr.isUser && <span className="mr-1 text-amber-400 text-xs">you</span>}
                        <span className={pr.net >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                          {pr.net >= 0 ? '+' : ''}{fmt(pr.net)}
                        </span>
                      </div>
                    ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {(() => {
        const userP = result.players.find((pr) => pr.isUser);
        if (!userP) return null;
        const userTeamWon = userP.teamIndex === result.winnerTeamIndex;
        const totalDrops = result.teams.reduce((s, t) => s + t.totalValue, 0);
        const rawShare = result.teamSize > 0 ? totalDrops / result.teamSize : 0;
        const userShare = userTeamWon ? rawShare * ((100 - result.borrowPercent) / 100) : 0;
        return (
          <div className="text-xs text-white/40 space-y-0.5">
            <div>
              Battle total: <span className="text-amber-400">{fmt(totalDrops)}</span> coins
              {" · "}share per winner: <span className="text-amber-400">{fmt(rawShare)}</span>
            </div>
            <div>
              Your entry: <span className="text-amber-400">{fmt(userP.entryCost)}</span>
              {userTeamWon ? (
                <>
                  {" · "}your share:{" "}
                  <span className="text-amber-400">{fmt(userShare)}</span>
                  {result.borrowPercent > 0 && (
                    <span className="text-white/30"> (borrow {result.borrowPercent}% applied)</span>
                  )}
                </>
              ) : null}
              {" · "}net:{" "}
              <span className={userP.net >= 0 ? "text-emerald-400" : "text-red-400"}>
                {userP.net >= 0 ? "+" : ""}{fmt(userP.net)}
              </span>
            </div>
          </div>
        );
      })()}

      <div className="space-y-3">
        <div className="text-xs uppercase tracking-wider text-white/50">
          Per-player drops
        </div>
        {result.players.map((p, i) => {
          const teamColorHex = teamColor(p.teamIndex);
          const topDrop = p.drops.reduce((best, d) => (d.value > best.value ? d : best), p.drops[0]);
          const open = !!openPlayers[p.name];
          return (
            <div key={i} className="rounded-xl border border-white/10 bg-white/5">
              <button
                onClick={() => setOpenPlayers((prev) => ({ ...prev, [p.name]: !prev[p.name] }))}
                className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-white/5"
                style={{ boxShadow: `inset 4px 0 0 ${teamColorHex}` }}
              >
                <div className="flex items-center gap-2 pl-2 text-sm">
                  <span className="text-white/40">team {p.teamIndex + 1} · </span>
                  <span className="font-medium">{p.name}</span>
                  {p.isUser && <span className="ml-1 text-amber-400 text-xs">(you)</span>}
                  {topDrop && (
                    <div
                      className="ml-2 flex h-7 w-7 items-center justify-center overflow-hidden rounded bg-white/5"
                      style={{ boxShadow: `0 0 0 1px ${RARITY_COLORS[topDrop.skin.rarity] ?? "#888"}` }}
                    >
                      <img src={topDrop.skin.imageUrl} alt={topDrop.skin.name} loading="lazy" className="h-full w-full object-contain" />
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3 text-sm tabular-nums">
                  <span>
                    drops <span className="text-amber-400">{fmt(p.totalValue)}</span>
                  </span>
                  <span className={p.net >= 0 ? "text-emerald-400" : "text-red-400"}>
                    {p.net >= 0 ? "+" : ""}{fmt(p.net)}
                  </span>
                  <span className="text-xs text-white/40">
                    {open ? "hide" : `${p.drops.length} drops`}
                  </span>
                </div>
              </button>
              {open && (
                <div className="border-t border-white/5 max-h-72 overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="text-left text-white/40">
                      <tr>
                        <th className="px-2 py-1">Nonce</th>
                        <th className="px-1 py-1"></th>
                        <th className="px-2 py-1">Case</th>
                        <th className="px-2 py-1">Skin</th>
                        <th className="px-2 py-1">Wear</th>
                        <th className="px-2 py-1 text-right">Value</th>
                        <th className="px-2 py-1 text-right">Verify</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.drops.map((d) => (
                        <tr key={`${d.caseSlug}:${d.nonce}`} className="border-t border-white/5">
                          <td className="px-2 py-1 tabular-nums text-white/50">{d.nonce}</td>
                          <td className="px-1 py-1">
                            <div className="flex h-7 w-7 items-center justify-center overflow-hidden rounded bg-white/5">
                              <img src={d.skin.imageUrl} alt={d.skin.name} loading="lazy" className="h-full w-full object-contain" />
                            </div>
                          </td>
                          <td className="px-2 py-1 text-white/50 text-[10px]">{d.caseSlug}</td>
                          <td className="px-2 py-1">
                            <span className="inline-block h-2 w-2 rounded-full align-middle mr-1" style={{ background: RARITY_COLORS[d.skin.rarity] }} />
                            {d.skin.name}
                          </td>
                          <td className="px-2 py-1" style={{ color: WEAR_COLORS[d.wear.wear] }}>{d.wear.wear}</td>
                          <td className="px-2 py-1 text-right tabular-nums">{fmt(d.value)}</td>
                          <td className="px-2 py-1 text-right">
                            <SimVerifier drop={d} serverSeed={serverSeed} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}