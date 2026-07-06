import { listCases } from "@/lib/scraper/cache";
import { HomeCasesClient } from "@/components/HomeCasesClient";
import { ManageCasesClient } from "@/components/ManageCasesClient";
import { PasteCasesClient } from "@/components/PasteCasesClient";
import type { CaseDefinition } from "@/lib/types";

export default async function HomePage() {
  const cases: CaseDefinition[] = await listCases();
  return (
    <HomeCasesClient cases={cases}>
      <PasteCasesClient />
      <ManageCasesClient cases={cases} />
    </HomeCasesClient>
  );
}