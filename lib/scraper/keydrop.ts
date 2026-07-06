import type { CaseDefinition } from "@/lib/types";
import type { NormalizeWarning } from "@/lib/scraper/normalize";

export interface ScrapeOk {
  ok: true;
  cases: CaseDefinition[];
  warnings: NormalizeWarning[];
}

export interface ScrapeErr {
  ok: false;
  reason:
    | "cloudflare_blocked"
    | "http_error"
    | "parse_error"
    | "endpoint_unknown"
    | "rate_limited";
  status?: number;
  message: string;
}

export type ScrapeResult = ScrapeOk | ScrapeErr;

/**
 * Live scraping from keydrop is intentionally disabled for the MVP. keydrop is
 * gated by Cloudflare and the project relies on the manual JSON paste
 * fallback (see /sim and /api/scrape route). When real endpoint details are
 * known, implement discovery + fetching here; keep all keydrop fetch calls
 * inside this module.
 */
export async function scrapeKeydrop(): Promise<ScrapeResult> {
  return {
    ok: false,
    reason: "endpoint_unknown",
    message:
      "Live scraping is disabled for the MVP. Use the manual JSON paste fallback instead.",
  };
}