"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CaseDefinition } from "@/lib/types";

export function CaseSimCta({ c }: { c: CaseDefinition }) {
  const router = useRouter();
  const [count, setCount] = useState(1);

  function send() {
    try {
      window.localStorage.setItem(
        "keydrop-sim:simPreset",
        JSON.stringify({ counts: { [c.slug]: count } }),
      );
    } catch {
      /* ignore */
    }
    router.push("/sim");
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-white/40">Open</span>
      <input
        type="number"
        min={1}
        value={count}
        onChange={(e) => setCount(Math.max(1, Number(e.target.value)))}
        className="w-20 rounded border border-white/10 bg-[#0b0e14] px-2 py-1 text-sm tabular-nums"
      />
      <button
        onClick={send}
        className="rounded bg-amber-500 px-3 py-1 text-sm font-semibold text-black"
      >
        Open in sim
      </button>
    </div>
  );
}
