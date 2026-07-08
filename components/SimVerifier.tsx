"use client";

import { useState } from "react";
import type { Drop } from "@/lib/types";

interface VerifyResponse {
  ok: boolean;
  match?: boolean;
  ticket?: string;
  skin?: { name: string; rarity: string };
  wear?: string;
  value?: number;
  reason?: string;
  checks?: {
    hashMatches: boolean;
    ticketMatches: boolean;
    skinMatches: boolean;
    wearMatches: boolean;
  };
}

export function SimVerifier({
  drop,
  serverSeed,
}: {
  drop: Drop;
  serverSeed: string;
}) {
  const [state, setState] = useState<
    | { status: "idle" }
    | { status: "loading" }
    | { status: "done"; res: VerifyResponse }
    | { status: "error"; message: string }
  >({ status: "idle" });

  async function verify(): Promise<void> {
    setState({ status: "loading" });
    try {
      const res = await fetch("/api/provably-fair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serverSeed,
          clientSeed: drop.clientSeed,
          nonce: drop.nonce,
          caseSlug: drop.caseSlug,
          serverSeedHash: drop.serverSeedHash,
          expectedTicket: drop.ticket,
          expectedSkinName: drop.skin.name,
          expectedWear: drop.wear.wear,
          joker: drop.joker === true,
        }),
      });
      const json = (await res.json()) as VerifyResponse;
      setState({ status: "done", res: json });
    } catch (e) {
      setState({
        status: "error",
        message: e instanceof Error ? e.message : "network error",
      });
    }
  }

  if (state.status === "idle") {
    return (
      <button
        onClick={verify}
        className="rounded border border-amber-400/40 px-2 py-0.5 text-xs text-amber-400 hover:bg-amber-400/10"
      >
        verify
      </button>
    );
  }
  if (state.status === "loading") {
    return <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-white/20" />;
  }
  if (state.status === "error") {
    return <span className="text-xs text-red-400">err</span>;
  }
  const r = state.res;
  if (!r.ok || !r.match) {
    return (
      <span className="text-xs text-red-400" title={r.reason ?? "mismatch"}>
        ✗
      </span>
    );
  }
  return (
    <span
      className="text-xs text-emerald-400"
      title={
        r.checks
          ? `hash:${r.checks.hashMatches} ticket:${r.checks.ticketMatches} skin:${r.checks.skinMatches} wear:${r.checks.wearMatches}`
          : "match"
      }
    >
      ✓
    </span>
  );
}