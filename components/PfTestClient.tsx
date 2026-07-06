"use client";

import { useMemo, useState } from "react";
import type { CaseDefinition, Drop } from "@/lib/types";
import { openOnce } from "@/lib/caseEngine";
import {
  computeTicket,
  hashServerSeed,
  randomClientSeed,
  randomServerSeed,
} from "@/lib/provablyFair";

export function PfTestClient({
  cases,
  initialServerSeed,
  initialClientSeed,
}: {
  cases: CaseDefinition[];
  initialServerSeed: string;
  initialClientSeed: string;
}) {
  const [serverSeed, setServerSeed] = useState(initialServerSeed);
  const [clientSeed, setClientSeed] = useState(initialClientSeed);
  const [nonce, setNonce] = useState(0);
  const [caseSlug, setCaseSlug] = useState(cases[0]?.slug ?? "");
  const [drop, setDrop] = useState<Drop | null>(null);
  const [serverSeedRevealed, setServerSeedRevealed] = useState(false);

  const selectedCase = useMemo(
    () => cases.find((c) => c.slug === caseSlug) ?? null,
    [cases, caseSlug],
  );

  const serverSeedHash = useMemo(() => hashServerSeed(serverSeed), [serverSeed]);

  function runOnce(): void {
    if (!selectedCase) return;
    const d = openOnce({
      case: selectedCase,
      serverSeed,
      clientSeed,
      nonce,
    });
    setDrop(d);
    setServerSeedRevealed(true);
    setNonce((n) => n + 1);
  }

  function verify(): boolean {
    if (!drop || !selectedCase) return false;
    const recomputed = computeTicket(serverSeed, drop.clientSeed, drop.nonce);
    return recomputed === drop.ticket;
  }

  function reshuffle(): void {
    setServerSeed(randomServerSeed());
    setServerSeedRevealed(false);
    setNonce(0);
    setDrop(null);
  }

  function newClient(): void {
    setClientSeed(randomClientSeed());
    setDrop(null);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">
          Provably-fair end-to-end test
        </h1>
        <p className="text-sm text-white/60">
          Pick a case, set the seeds, open one box. The full chain is shown;
          the Verify button recomputes the ticket from the revealed server
          seed.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
          <div>
            <label className="block text-xs uppercase tracking-wider text-white/50">
              Case
            </label>
            <select
              value={caseSlug}
              onChange={(e) => setCaseSlug(e.target.value)}
              className="mt-1 w-full rounded bg-[#0b0e14] border border-white/10 px-2 py-1 text-sm"
            >
              {cases.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-white/50">
              Server seed hash (shown before)
            </label>
            <div className="mt-1 break-all rounded bg-[#0b0e14] border border-white/10 px-2 py-1 font-mono text-xs text-amber-400">
              {serverSeedHash}
            </div>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-white/50">
              Server seed (revealed after)
            </label>
            <div className="mt-1 break-all rounded bg-[#0b0e14] border border-white/10 px-2 py-1 font-mono text-xs">
              {serverSeedRevealed ? serverSeed : "[hidden — run to reveal]"}
            </div>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-white/50">
              Client seed
            </label>
            <div className="mt-1 flex gap-2">
              <input
                value={clientSeed}
                onChange={(e) => setClientSeed(e.target.value)}
                className="flex-1 rounded bg-[#0b0e14] border border-white/10 px-2 py-1 font-mono text-xs"
              />
              <button
                onClick={newClient}
                className="rounded border border-white/10 px-3 py-1 text-xs hover:bg-white/5"
              >
                random
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-white/50">
              Nonce
            </label>
            <input
              type="number"
              value={nonce}
              min={0}
              onChange={(e) => setNonce(Math.max(0, Number(e.target.value)))}
              className="mt-1 w-32 rounded bg-[#0b0e14] border border-white/10 px-2 py-1 font-mono text-xs"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <button
              onClick={runOnce}
              disabled={!selectedCase}
              className="rounded bg-amber-500 px-4 py-2 text-sm font-medium text-black disabled:opacity-40"
            >
              Open once
            </button>
            <button
              onClick={reshuffle}
              className="rounded border border-white/10 px-4 py-2 text-sm hover:bg-white/5"
            >
              Reshuffle seed
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
          <div className="text-xs uppercase tracking-wider text-white/50">
            Last drop
          </div>
          {!drop ? (
            <div className="text-sm text-white/40">No drop yet.</div>
          ) : (
            <dl className="space-y-1 text-sm">
              <Row k="skin" v={drop.skin.name} />
              <Row k="rarity" v={drop.skin.rarity} />
              <Row k="wearing" v={drop.wear.wear} />
              <Row k="value" v={`${drop.value} coins`} />
              <Row k="nonce" v={String(drop.nonce)} />
              <Row k="clientSeed" v={drop.clientSeed} mono />
              <Row
                k="serverSeedHash"
                v={drop.serverSeedHash}
                mono
                cls="text-amber-400"
              />
              <Row k="ticket" v={drop.ticket} mono />
            </dl>
          )}
          {drop && (
            <div className="pt-2">
              <button
                onClick={() => alert(verify() ? "MATCH ✓" : "MISMATCH ✗")}
                className="rounded border border-amber-400/40 px-3 py-1 text-xs text-amber-400 hover:bg-amber-400/10"
              >
                Verify (recompute ticket)
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function Row({
  k,
  v,
  mono,
  cls,
}: {
  k: string;
  v: string;
  mono?: boolean;
  cls?: string;
}) {
  return (
    <div className="flex gap-2">
      <dt className="w-32 shrink-0 text-white/50">{k}</dt>
      <dd className={`break-all ${mono ? "font-mono text-xs" : ""} ${cls ?? ""}`}>
        {v}
      </dd>
    </div>
  );
}