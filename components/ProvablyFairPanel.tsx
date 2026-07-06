"use client";

import { useState } from "react";
import { hashServerSeed, randomClientSeed } from "@/lib/provablyFair";
import {
  getClientSeed,
  getLastNonce,
  getServerSeed,
  setClientSeed,
  setServerSeed,
} from "@/lib/storage";

export interface ProvablyFairState {
  serverSeed: string;
  clientSeed: string;
  startNonce: number;
}

export function ProvablyFairPanel({
  state,
  onChange,
  revealed,
  allowReshuffle,
  disabled,
}: {
  state: ProvablyFairState;
  onChange: (next: ProvablyFairState) => void;
  revealed: boolean;
  allowReshuffle?: boolean;
  disabled?: boolean;
}) {
  const serverSeedHash = hashServerSeed(state.serverSeed);

  function reshuffle(): void {
    const newSeed = randomClientSeed(); // reusing as random hex gen
    const arr = new Uint8Array(32);
    crypto.getRandomValues(arr);
    const hex = Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
    onChange({ ...state, serverSeed: hex });
    setServerSeed(hex);
  }

  function newClient(): void {
    const cs = randomClientSeed();
    onChange({ ...state, clientSeed: cs });
    setClientSeed(cs);
  }

  function editClient(v: string): void {
    onChange({ ...state, clientSeed: v });
    setClientSeed(v);
  }

  function editNonce(n: number): void {
    onChange({ ...state, startNonce: Math.max(0, n) });
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wider text-white/50">
          Provably-fair
        </div>
        {allowReshuffle !== false && (
          <button
            onClick={reshuffle}
            disabled={disabled}
            className="rounded border border-white/10 px-2 py-1 text-xs hover:bg-white/5 disabled:opacity-30"
          >
            reshuffle server seed
          </button>
        )}
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
          {revealed ? state.serverSeed : "[hidden — run to reveal]"}
        </div>
      </div>
      <div>
        <label className="block text-xs uppercase tracking-wider text-white/50">
          Client seed
        </label>
        <div className="mt-1 flex flex-col sm:flex-row gap-2">
          <input
            value={state.clientSeed}
            onChange={(e) => editClient(e.target.value)}
            className="flex-1 rounded bg-[#0b0e14] border border-white/10 px-2 py-2 sm:py-1 font-mono text-xs min-h-[44px] sm:min-h-0"
          />
          <button
            onClick={newClient}
            className="rounded border border-white/10 px-2 py-2 sm:py-1 text-xs hover:bg-white/5 min-h-[44px] sm:min-h-0"
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
          value={state.startNonce}
          onChange={(e) => editNonce(Number(e.target.value))}
          className="mt-1 w-full sm:w-40 rounded bg-[#0b0e14] border border-white/10 px-2 py-2 sm:py-1 font-mono text-xs min-h-[44px] sm:min-h-0"
        />
      </div>
    </div>
  );
}
