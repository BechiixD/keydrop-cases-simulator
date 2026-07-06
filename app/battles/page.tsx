import { listCases } from "@/lib/scraper/cache";
import { randomServerSeed } from "@/lib/provablyFair";
import { BattleClient } from "@/components/BattleClient";
import Link from "next/link";

export default async function BattlesPage() {
  const cases = await listCases();
  if (cases.length === 0) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/5 p-6 text-sm text-white/60">
        No cases cached. Visit the{" "}
        <Link href="/" className="text-amber-400 hover:underline">case grid</Link>{" "}
        and load cases first.
      </div>
    );
  }
  return <BattleClient cases={cases} initialServerSeed={randomServerSeed()} />;
}