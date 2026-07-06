import { NextResponse } from "next/server";
import {
  normalizeInput,
  normalizeScrape,
  type NormalizeWarning,
} from "@/lib/scraper/normalize";
import { readCache, writeCache } from "@/lib/scraper/cache";
import { runMirror } from "@/lib/mirror";
import type { CasesCache, CaseDefinition } from "@/lib/types";

interface ScrapeRequest {
  json?: string;
  cases?: unknown;
  mode?: "replace" | "merge" | "remove" | "clear" | "mirror-images";
  slugs?: string[];
}

type Mode = "replace" | "merge" | "remove" | "clear" | "mirror-images";

function parseCases(raw: unknown): CaseDefinition[] {
  if (Array.isArray(raw)) return normalizeScrape(raw);
  return normalizeInput(raw);
}

export async function GET(): Promise<NextResponse> {
  const cache = await readCache();
  return NextResponse.json({
    ok: true,
    count: cache.cases.length,
    scrapedAt: cache.scrapedAt,
    cases: cache.cases.map((c) => ({
      slug: c.slug,
      name: c.name,
      price: c.price,
      items: c.items.length,
    })),
  });
}

export async function POST(req: Request): Promise<NextResponse> {
  let body: ScrapeRequest;
  try {
    body = (await req.json()) as ScrapeRequest;
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid_json" }, { status: 400 });
  }

  const mode: Mode =
    body.mode === "merge" || body.mode === "remove" || body.mode === "clear" || body.mode === "mirror-images"
      ? body.mode
      : "replace";

  if (mode === "mirror-images") {
    try {
      const result = await runMirror();
      return NextResponse.json({ ok: true, ...result });
    } catch (err) {
      return NextResponse.json(
        { ok: false, reason: "mirror_failed", message: err instanceof Error ? err.message : String(err) },
        { status: 500 },
      );
    }
  }
  if (mode === "remove" || mode === "clear") {
    const current = await readCache();
    let nextCases: CaseDefinition[];
    if (mode === "clear") {
      nextCases = [];
    } else {
      const toRemove = new Set(
        Array.isArray(body.slugs) ? body.slugs.filter((s) => typeof s === "string") : [],
      );
      nextCases = current.cases.filter((c) => !toRemove.has(c.slug));
    }
    const next: CasesCache = { cases: nextCases, scrapedAt: Date.now() };
    await writeCache(next);
    return NextResponse.json({
      ok: true,
      mode,
      count: nextCases.length,
      removed: current.cases.length - nextCases.length,
    });
  }

  const warnings: NormalizeWarning[] = [];
  let incoming: CaseDefinition[] = [];

  if (typeof body.json === "string" && body.json.trim().length > 0) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(body.json);
    } catch (e) {
      return NextResponse.json(
        { ok: false, reason: "invalid_json_string", message: e instanceof Error ? e.message : "parse error" },
        { status: 400 },
      );
    }
    if (
      parsed &&
      typeof parsed === "object" &&
      Array.isArray((parsed as { cases?: unknown }).cases)
    ) {
      incoming = parseCases((parsed as { cases: unknown }).cases);
    } else {
      incoming = parseCases(parsed);
    }
  } else if (body.cases !== undefined) {
    incoming = parseCases(body.cases);
  }

  if (incoming.length === 0) {
    return NextResponse.json(
      { ok: false, reason: "no_cases_parsed", warnings },
      { status: 400 },
    );
  }

  for (const c of incoming) {
    const total = c.items.reduce((a, s) => a + s.totalProbability, 0);
    if (Math.abs(total - 1) > 0.01) {
      warnings.push({
        caseSlug: c.slug,
        kind: "probability_drift",
        message: `case ${c.slug}: total probability ${total.toFixed(6)} drifts from 1.0 by ${Math.abs(total - 1).toFixed(6)}`,
      });
    }
  }

  let nextCases: CaseDefinition[];
  if (mode === "merge") {
    const current = await readCache();
    const merged = new Map<string, CaseDefinition>(
      current.cases.map((c) => [c.slug, c]),
    );
    for (const c of incoming) merged.set(c.slug, c);
    nextCases = Array.from(merged.values());
  } else {
    nextCases = incoming;
  }

  const next: CasesCache = { cases: nextCases, scrapedAt: Date.now() };
  await writeCache(next);

  return NextResponse.json({
    ok: true,
    mode,
    count: nextCases.length,
    accepted: incoming.length,
    warnings,
    slugs: incoming.map((c) => c.slug),
  });
}