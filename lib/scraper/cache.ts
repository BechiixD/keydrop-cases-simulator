import { promises as fs } from "node:fs";
import path from "node:path";
import type { CasesCache, CaseDefinition } from "@/lib/types";

const CACHE_PATH = path.join(process.cwd(), "data", "cases-cache.json");

const EMPTY_CACHE: CasesCache = { cases: [], scrapedAt: 0 };

export async function readCache(): Promise<CasesCache> {
  try {
    const raw = await fs.readFile(CACHE_PATH, "utf8");
    const parsed = JSON.parse(raw) as CasesCache;
    if (!parsed || !Array.isArray(parsed.cases)) return EMPTY_CACHE;
    return parsed;
  } catch {
    return EMPTY_CACHE;
  }
}

export async function writeCache(cache: CasesCache): Promise<void> {
  await fs.mkdir(path.dirname(CACHE_PATH), { recursive: true });
  await fs.writeFile(CACHE_PATH, JSON.stringify(cache, null, 2) + "\n", "utf8");
}

export async function listCases(): Promise<CaseDefinition[]> {
  const cache = await readCache();
  return cache.cases;
}

export async function getCase(slug: string): Promise<CaseDefinition | null> {
  const cache = await readCache();
  return cache.cases.find((c) => c.slug === slug) ?? null;
}