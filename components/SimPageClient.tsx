"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { CaseDefinition } from "@/lib/types";
import { getServerSeed, getSimMode, setSimMode } from "@/lib/storage";
import { randomClientSeed } from "@/lib/provablyFair";
import { SimClient } from "@/components/SimClient";
import { OpenRealistic } from "@/components/OpenRealistic";

export function SimPageClient({ cases }: { cases: CaseDefinition[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<"stats" | "realistic">("stats");

  useEffect(() => {
    const urlMode = searchParams.get("mode");
    if (urlMode === "stats" || urlMode === "realistic") {
      setMode(urlMode);
      setSimMode(urlMode);
    } else {
      setMode(getSimMode());
    }
  }, [searchParams]);

  const switchTo = useCallback(
    (m: "stats" | "realistic") => {
      setSimMode(m);
      router.push(`/sim?mode=${m}`, { scroll: false });
    },
    [router],
  );

  const initialServerSeed = getServerSeed(
    (() => {
      const arr = new Uint8Array(32);
      crypto.getRandomValues(arr);
      return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
    })(),
  );
  const initialClientSeed = (() => {
    try {
      return (
        window.localStorage.getItem("keydrop-sim:clientSeed") ??
        randomClientSeed()
      );
    } catch {
      return randomClientSeed();
    }
  })();

  return (
    <div className="space-y-6">
      <nav className="flex gap-1 rounded-lg border border-white/10 p-0.5 w-fit">
        <button
          onClick={() => switchTo("stats")}
          className={`rounded px-4 py-1.5 text-sm font-medium transition ${
            mode === "stats"
              ? "bg-amber-400/20 text-amber-400"
              : "text-white/50 hover:text-white/80"
          }`}
        >
          Stats batch
        </button>
        <button
          onClick={() => switchTo("realistic")}
          className={`rounded px-4 py-1.5 text-sm font-medium transition ${
            mode === "realistic"
              ? "bg-amber-400/20 text-amber-400"
              : "text-white/50 hover:text-white/80"
          }`}
        >
          Realistic
        </button>
      </nav>

      {mode === "realistic" ? (
        <OpenRealistic
          cases={cases}
          defaultSlug={searchParams.get("slug") ?? undefined}
        />
      ) : (
        <SimClient
          cases={cases}
          initialServerSeed={initialServerSeed}
          initialClientSeed={initialClientSeed}
        />
      )}
    </div>
  );
}
