"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CaseDefinition, Drop } from "@/lib/types";
import { jokerPrice, openOnce, runBatch } from "@/lib/caseEngine";
import {
  hashServerSeed,
  randomClientSeed,
} from "@/lib/provablyFair";
import {
  adjustBalance,
  getBalance,
  getClientSeed,
  getJokerMode,
  getLastNonce,
  getServerSeed,
  pushHistory,
  setClientSeed,
  setJokerMode,
  setLastNonce,
  setServerSeed,
  compactDrop,
} from "@/lib/storage";
import { SimVerifier } from "@/components/SimVerifier";
import { ProvablyFairPanel, type ProvablyFairState } from "@/components/ProvablyFairPanel";
import { addDrops } from "@/lib/inventory";
import {
  RARITY_COLORS,
  WEAR_COLORS,
} from "@/lib/ui/colors";

const ITEM_W = 100;
const ITEM_GAP = 12;
const ITEM_STEP = ITEM_W + ITEM_GAP;
const REEL_DURATION_MS = 2800;
const REEL_REPEATS = 5;
const OPEN_HISTORY_KEY = "keydrop-sim:opens";

function fmt(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export function OpenRealistic({
  cases,
  defaultSlug,
}: {
  cases: CaseDefinition[];
  defaultSlug?: string;
}) {
  const [serverSeed, setServerSeedState] = useState(() =>
    getServerSeed(
      (() => {
        const arr = new Uint8Array(32);
        crypto.getRandomValues(arr);
        return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
      })(),
    ),
  );
  const [clientSeed, setClientSeedState] = useState(() =>
    getClientSeed(randomClientSeed()),
  );
  const [startNonce, setStartNonce] = useState<number>(() => getLastNonce());
  const [selectedSlug, setSelectedSlug] = useState<string>(
    defaultSlug && cases.some((c) => c.slug === defaultSlug)
      ? defaultSlug
      : (cases[0]?.slug ?? ""),
  );
  const [balance, setBalance] = useState<number>(10000);
  const [balanceBusy, setBalanceBusy] = useState(true);
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState<Drop | null>(null);
  const [reelOffset, setReelOffset] = useState(0);
  const [reelTransition, setReelTransition] = useState(true);
  const [serverSeedRevealed, setServerSeedRevealed] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const [autoCount, setAutoCount] = useState(1);
  const [autoRunning, setAutoRunning] = useState(false);
  const [autoDrops, setAutoDrops] = useState<Drop[]>([]);
  const [autoCurrent, setAutoCurrent] = useState(-1);
  const [openHistory, setOpenHistory] = useState<Drop[]>([]);
  const [itemW, setItemW] = useState(ITEM_W);
  const [joker, setJoker] = useState(false);
  const reelRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const spinTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const caseDef = useMemo(
    () => cases.find((c) => c.slug === selectedSlug) ?? cases[0] ?? null,
    [cases, selectedSlug],
  );

  const openPrice = useMemo(
    () => (caseDef ? (joker ? jokerPrice(caseDef) : caseDef.price) : 0),
    [caseDef, joker],
  );

  function toggleJoker(next: boolean): void {
    setJoker(next);
    setJokerMode(next);
    setWinner(null);
  }

  useEffect(() => {
    setBalance(getBalance());
    setBalanceBusy(false);
    setJoker(getJokerMode());
    const cs = getClientSeed(randomClientSeed());
    setClientSeedState(cs);
    try {
      const raw = window.localStorage.getItem(OPEN_HISTORY_KEY);
      if (raw) setOpenHistory(JSON.parse(raw) as Drop[]);
    } catch {
      /* ignore */
    }
    function onResize() {
      setItemW(window.innerWidth < 640 ? 72 : 100);
    }
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  function saveOpens(drops: Drop[]): void {
    const compacted = drops.map(compactDrop);
    const next = [...compacted, ...openHistory].slice(0, 200);
    setOpenHistory(next);
    try {
      window.localStorage.setItem(OPEN_HISTORY_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  function reshuffle(): void {
    const arr = new Uint8Array(32);
    crypto.getRandomValues(arr);
    const hex = Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
    setServerSeedState(hex);
    setServerSeed(hex);
    setServerSeedRevealed(false);
    setWinner(null);
  }

  const pfState: ProvablyFairState = { serverSeed, clientSeed, startNonce };
  function handlePfChange(next: ProvablyFairState): void {
    setServerSeedState(next.serverSeed);
    setServerSeed(next.serverSeed);
    setClientSeedState(next.clientSeed);
    setClientSeed(next.clientSeed);
    setStartNonce(next.startNonce);
  }

  function containerCenter(): number {
    const el = containerRef.current;
    if (!el) return (window.innerWidth < 640 ? 72 : 100);
    return (el.clientWidth - itemW) / 2;
  }

  function doSingleOpen(): void {
    if (!caseDef) return;
    if (balance < openPrice) return;
    if (spinTimerRef.current) clearTimeout(spinTimerRef.current);
    spinTimerRef.current = null;

    const nonce = getLastNonce();
    const drop = openOnce({
      case: caseDef,
      serverSeed,
      clientSeed,
      nonce,
      joker,
    });
    if (!drop) return;

    setWinner(null);
    setSpinning(true);
    setServerSeedRevealed(true);

    const newBalance = adjustBalance(-openPrice);
    setBalance(newBalance);
    setLastNonce(nonce + 1);
    saveOpens([drop]);
    addDrops([drop], "realistic", caseDef.slug);

    const winnerIdx = caseDef.items.findIndex((s) => s.id === drop.skin.id);
    const idx = winnerIdx >= 0 ? winnerIdx : 0;
    const stripLen = caseDef.items.length;
    const itemStep = itemW + ITEM_GAP;
    const extraScroll = stripLen * itemStep * 3;
    const target = idx * itemStep;
    const endOffset = -(target + extraScroll) + containerCenter();

    setReelTransition(false);
    setReelOffset(0);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setReelTransition(true);
        setReelOffset(endOffset);
      });
    });

    spinTimerRef.current = setTimeout(() => {
      setSpinning(false);
      setWinner(drop);
      spinTimerRef.current = null;
    }, REEL_DURATION_MS + 100);
  }

  function doAutoOpen(): void {
    if (!caseDef || autoRunning) return;
    const count = Math.max(1, Math.min(50, Math.floor(autoCount)));
    if (count <= 0) return;
    const totalCost = openPrice * count;
    if (balance < totalCost) return;
    if (spinTimerRef.current) clearTimeout(spinTimerRef.current);
    if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
    spinTimerRef.current = null;
    autoTimerRef.current = null;

    setAutoRunning(true);
    setAutoDrops([]);
    setAutoCurrent(0);
    setWinner(null);
    setSpinning(true);
    setServerSeedRevealed(true);

    const startN = getLastNonce();
    const batch = runBatch(caseDef, count, serverSeed, clientSeed, startN, joker);

    const newBalance = adjustBalance(-totalCost);
    setBalance(newBalance);
    setLastNonce(startN + count);
    pushHistory({
      ranAt: Date.now(),
      results: [batch],
      totalCost: batch.totalCost,
      totalValue: batch.totalValue,
      net: batch.net,
      roi: batch.roi,
      serverSeed,
      serverSeedHash: hashServerSeed(serverSeed),
      clientSeed,
      startNonce: startN,
    });
    saveOpens(batch.drops);
    addDrops(batch.drops, "realistic", caseDef.slug);

    const stripLen = caseDef.items.length;
    const itemStep = itemW + ITEM_GAP;
    const extraScroll = stripLen * itemStep * 3;

    let i = 0;
    function next(): void {
      if (i >= batch.drops.length) {
        setSpinning(false);
        setAutoCurrent(-1);
        setAutoRunning(false);
        setAutoDrops(batch.drops);
        autoTimerRef.current = null;
        return;
      }
      const drop = batch.drops[i];
      setAutoCurrent(i);
      setWinner(drop);
      const idx = caseDef!.items.findIndex((s) => s.id === drop.skin.id);
      const target = (idx >= 0 ? idx : 0) * itemStep;
      setReelTransition(false);
      setReelOffset(0);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setReelTransition(true);
          setReelOffset(-(target + extraScroll) + containerCenter());
        });
      });
      i++;
      autoTimerRef.current = setTimeout(next, Math.max(400, REEL_DURATION_MS - (count > 10 ? 2000 : 0)));
    }
    autoTimerRef.current = setTimeout(next, 50);
  }

  const items = caseDef?.items ?? [];
  const strip = Array.from({ length: REEL_REPEATS }, () => items).flat();

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold tracking-tight">
          Realistic open
        </h1>
        <div className="text-sm text-white/50">
          Balance{" "}
          <span className={caseDef && balance < openPrice ? "text-red-400" : "text-amber-400"}>
            {balanceBusy ? (
              <span className="inline-block h-5 w-20 animate-pulse rounded bg-white/10 align-middle" />
            ) : (
              fmt(balance)
            )}
          </span>{" "}
          coins
        </div>
      </header>

      <button
        type="button"
        onClick={() => toggleJoker(!joker)}
        disabled={spinning || autoRunning}
        aria-pressed={joker}
        className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition disabled:opacity-50 ${
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

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
          <div className="text-xs uppercase tracking-wider text-white/50">
            Select case
          </div>
          <select
            value={selectedSlug}
            onChange={(e) => setSelectedSlug(e.target.value)}
            disabled={spinning || autoRunning}
            className="w-full rounded bg-[#0b0e14] border border-white/10 px-3 py-2 text-sm"
          >
            {cases.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name} · {(joker ? jokerPrice(c) : c.price).toLocaleString()} coins · {c.items.length} items
              </option>
            ))}
          </select>
          {caseDef && (
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded bg-white/5">
                {caseDef.imageUrl ? (
                  <img src={caseDef.imageUrl} alt={caseDef.name} className="h-full w-full object-contain" />
                ) : (
                  <span className="text-xs font-bold text-white/30">{caseDef.name[0]}</span>
                )}
              </div>
              <div>
                <div className="font-medium">{caseDef.name}</div>
                <div className="text-xs text-white/50">
                  {joker ? (
                    <>
                      <span className="text-fuchsia-400">{openPrice.toLocaleString()} coins</span>{" "}
                      <span className="line-through text-white/30">{caseDef.price.toLocaleString()}</span>
                      {" "}per open
                    </>
                  ) : (
                    <>{caseDef.price.toLocaleString()} coins per open</>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <ProvablyFairPanel
          state={pfState}
          onChange={handlePfChange}
          revealed={serverSeedRevealed}
          disabled={spinning || autoRunning}
        />
      </section>

      <section>
        <div
          ref={containerRef}
          className="relative overflow-hidden rounded-xl border border-white/10 bg-black/30"
          style={{ height: itemW < 90 ? 110 : 140 }}
        >
          <div className="absolute inset-0 pointer-events-none z-10">
            <div className="absolute left-1/2 top-0 bottom-0 w-[2px] -translate-x-px bg-amber-400/40" />
            <div className="absolute left-1/2 top-0 bottom-0 w-[100px] -translate-x-1/2 bg-amber-400/5" />
          </div>
          {items.length > 0 && (
            <div
              ref={reelRef}
              className="absolute top-4 flex items-center"
              style={{
                height: itemW < 90 ? 86 : 108,
                transform: `translateX(${reelOffset}px)`,
                transition: reelTransition
                  ? `transform ${REEL_DURATION_MS}ms cubic-bezier(0.0,0.0,0.15,1.0)`
                  : "none",
                willChange: "transform",
              }}
            >
              {strip.map((s, i) => {
                const isWinner =
                  winner && s.id === winner.skin.id && !spinning;
                return (
                  <div
                    key={`${s.id}-${i}`}
                    className="flex shrink-0 items-center justify-center rounded"
                    style={{
                      width: itemW,
                      marginRight: ITEM_GAP,
                      boxShadow: isWinner
                        ? `0 0 16px ${RARITY_COLORS[s.rarity]}88, 0 0 4px ${RARITY_COLORS[s.rarity]}`
                        : "none",
                      background: isWinner
                        ? `${RARITY_COLORS[s.rarity]}11`
                        : "transparent",
                      transition: "box-shadow 0.3s, background 0.3s",
                    }}
                  >
                    {s.imageUrl ? (
                      <img
                        src={s.imageUrl}
                        alt={s.name}
                        loading="lazy"
                        className="h-20 w-20 sm:h-24 sm:w-24 object-contain"
                        style={{
                          filter: spinning
                            ? "blur(0.5px)"
                            : "blur(0px)",
                          transition: "filter 0.3s",
                        }}
                      />
                    ) : (
                      <span className="text-xs text-white/20 font-bold">
                        {s.name[0]}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {items.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-white/30 text-sm">
              No case loaded
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3 flex flex-col">
          <div className="text-xs uppercase tracking-wider text-white/50">
            Single open
          </div>
          <div className="text-sm text-white/60">
            {caseDef
              ? `Cost: ${openPrice.toLocaleString()} coins`
              : ""}
          </div>
          <button
            onClick={doSingleOpen}
            disabled={
              !caseDef ||
              balance < openPrice
            }
            className="mt-auto rounded bg-amber-500 px-4 py-2 text-sm font-semibold text-black disabled:opacity-40"
          >
            {spinning ? "Open again" : "Open"}
          </button>
          {caseDef && balance < openPrice && (
            <div className="text-xs text-red-400">
              Insufficient balance
            </div>
          )}
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3 md:col-span-2">
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase tracking-wider text-white/50">
              Auto-open (batch)
            </div>
            <label className="flex items-center gap-2 text-xs text-white/50">
              <input
                type="checkbox"
                checked={soundOn}
                onChange={(e) => setSoundOn(e.target.checked)}
                className="accent-amber-400"
              />
              sound
            </label>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-white/40">Count</span>
            <input
              type="range"
              min={1}
              max={50}
              value={autoCount}
              onChange={(e) => setAutoCount(Number(e.target.value))}
              className="flex-1 accent-amber-400"
              disabled={spinning || autoRunning}
            />
            <span className="text-sm font-mono tabular-nums w-8 text-right">
              {autoCount}
            </span>
          </div>
          <div className="text-sm text-white/60">
            {caseDef
              ? `Total cost: ${(openPrice * autoCount).toLocaleString()} coins`
              : ""}
          </div>
          <div className="text-xs text-white/40">
            Saves as a batch to history. Reel shows each item as it opens.
          </div>
          <button
            onClick={doAutoOpen}
            disabled={
              spinning ||
              autoRunning ||
              !caseDef ||
              balance < openPrice * autoCount
            }
            className="rounded border border-amber-400/40 px-4 py-2 text-sm font-semibold text-amber-400 hover:bg-amber-400/10 disabled:opacity-30"
          >
            {autoRunning
              ? `Opening ${autoCurrent + 1}/${autoCount}...`
              : `Open ${autoCount}×`}
          </button>
        </div>
      </section>

      {winner && (
        <section className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
          <div className="text-xs uppercase tracking-wider text-white/50">
            Result
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div
              className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/5"
              style={{
                boxShadow: `0 0 0 2px ${RARITY_COLORS[winner.skin.rarity]}66, 0 0 24px ${RARITY_COLORS[winner.skin.rarity]}33`,
              }}
            >
              {winner.skin.imageUrl ? (
                <img src={winner.skin.imageUrl} alt={winner.skin.name} className="h-full w-full object-contain" />
              ) : (
                <span className="text-xl font-bold text-white/20">{winner.skin.name[0]}</span>
              )}
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-lg font-semibold truncate">
                  {winner.skin.name}
                </span>
                {winner.skin.statTrak && (
                  <span className="rounded bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-400 uppercase">
                    ST
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span
                  className="rounded-full px-2 py-0.5 text-xs font-semibold"
                  style={{
                    background: `${RARITY_COLORS[winner.skin.rarity]}22`,
                    color: RARITY_COLORS[winner.skin.rarity],
                  }}
                >
                  {winner.skin.rarity}
                </span>
                <span
                  className="rounded-full px-2 py-0.5 text-xs font-semibold"
                  style={{
                    background: `${WEAR_COLORS[winner.wear.wear]}22`,
                    color: WEAR_COLORS[winner.wear.wear],
                  }}
                >
                  {winner.wear.wear}
                </span>
                <span className="text-amber-400 font-semibold">
                  {fmt(winner.value)} coins
                </span>
                <span className="text-white/50 text-xs">
                  nonce {winner.nonce}
                </span>
                <SimVerifier drop={winner} serverSeed={serverSeed} />
              </div>
            </div>
          </div>
        </section>
      )}

      {autoDrops.length > 0 && !autoRunning && (
        <section className="space-y-3">
          <div className="text-xs uppercase tracking-wider text-white/50">
            Open history ({autoDrops.length} drops)
          </div>
          <div className="overflow-x-auto rounded-xl border border-white/10 max-h-[400px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-white/5 text-left text-xs uppercase tracking-wider text-white/50 sticky top-0">
                <tr>
                  <th className="w-10 px-2 py-2"></th>
                  <th className="px-2 py-2">Skin</th>
                  <th className="px-2 py-2">Rarity</th>
                  <th className="px-2 py-2">Wear</th>
                  <th className="px-2 py-2 text-right">Value</th>
                  <th className="px-2 py-2 text-right">Nonce</th>
                  <th className="px-2 py-2 text-right">Verify</th>
                </tr>
              </thead>
              <tbody>
                {autoDrops.map((d) => (
                  <tr key={`${d.skin.id}-${d.nonce}`} className="border-t border-white/5">
                    <td className="px-2 py-1.5">
                      <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded bg-white/5">
                        {d.skin.imageUrl ? (
                          <img src={d.skin.imageUrl} alt={d.skin.name} className="h-full w-full object-contain" />
                        ) : (
                          <span className="text-[10px] font-bold text-white/20">{d.skin.name[0]}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-1.5">{d.skin.name}</td>
                    <td className="px-2 py-1.5">
                      <span
                        className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                        style={{
                          background: `${RARITY_COLORS[d.skin.rarity]}22`,
                          color: RARITY_COLORS[d.skin.rarity],
                        }}
                      >
                        {d.skin.rarity}
                      </span>
                    </td>
                    <td className="px-2 py-1.5">
                      <span
                        className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                        style={{
                          background: `${WEAR_COLORS[d.wear.wear]}22`,
                          color: WEAR_COLORS[d.wear.wear],
                        }}
                      >
                        {d.wear.wear}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-amber-400">
                      {fmt(d.value)}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-white/50">
                      {d.nonce}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <SimVerifier drop={d} serverSeed={serverSeed} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
