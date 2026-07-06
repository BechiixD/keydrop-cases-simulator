import Link from "next/link";
import { listCases } from "@/lib/scraper/cache";
import { randomClientSeed, randomServerSeed } from "@/lib/provablyFair";
import { SimClient } from "@/components/SimClient";
import type { CaseDefinition } from "@/lib/types";

export default async function SimPage() {
  const cases: CaseDefinition[] = await listCases();
  if (cases.length === 0) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/5 p-6 text-sm text-white/60">
        No cases cached. Visit the{" "}
        <Link href="/" className="text-amber-400 hover:underline">case grid</Link>{" "}
        and use the manual JSON paste fallback, or drop JSON into{" "}
        <code>data/cases-cache.json</code>.
      </div>
    );
  }
  const initialServerSeed = randomServerSeed();
  const initialClientSeed = randomClientSeed();
  return (
    <SimClient
      cases={cases}
      initialServerSeed={initialServerSeed}
      initialClientSeed={initialClientSeed}
    />
  );
}