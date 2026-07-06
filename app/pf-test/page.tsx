import { listCases } from "@/lib/scraper/cache";
import { randomServerSeed, randomClientSeed } from "@/lib/provablyFair";
import { PfTestClient } from "@/components/PfTestClient";
import type { CaseDefinition } from "@/lib/types";

export default async function PfTestPage() {
  const cases: CaseDefinition[] = await listCases();
  const initialServerSeed = randomServerSeed();
  const initialClientSeed = randomClientSeed();
  return (
    <PfTestClient
      cases={cases}
      initialServerSeed={initialServerSeed}
      initialClientSeed={initialClientSeed}
    />
  );
}