"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const SAMPLE_HINT = `[
  {"status":true,"data":{"title":"...","slug":"...","price":1,"items":[
    {"fullTitle":"AK-47 | Redline","color":"violet","pfPercent":1.23,
     "pf":[{"rarity":"FT","price":220,"odds":1.23}]}
  ]}}
]
// keydrop's full envelope works as-is.
// Bulk: paste an array of envelopes, or { "cases": [ ... ] }.
// Or a single case without the {status,data} wrapper.`;

interface ScrapeResponse {
  ok: boolean;
  count?: number;
  accepted?: number;
  warnings?: { message: string }[];
  reason?: string;
  message?: string;
}

export function PasteCasesClient() {
  const router = useRouter();
  const [json, setJson] = useState("");

  const [loading, setLoading] = useState(false);
  const [resp, setResp] = useState<ScrapeResponse | null>(null);

  async function submit(): Promise<void> {
    if (!json.trim()) return;
    setLoading(true);
    setResp(null);
    try {
      const r = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ json, mode: "merge" }),
      });
      const data = (await r.json()) as ScrapeResponse;
      setResp(data);
      if (data.ok) {
        setJson("");
        router.refresh();
      }
    } catch (e) {
      setResp({
        ok: false,
        reason: "network",
        message: e instanceof Error ? e.message : "network error",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <details className="rounded-xl border border-white/10 bg-white/5">
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
        Manual JSON paste fallback (keydrop → DevTools → Network → copy case JSON)
      </summary>
      <div className="space-y-3 border-t border-white/10 p-4">
        <p className="text-xs text-white/50">
          Paste a case JSON array (or a single case object, or
          <code> {`{ "cases": [...] }`} </code>). The normalizer maps
          <code> chance </code>/<code> probability </code>per skin, and
          <code> price </code>/<code> value </code>per wear. StatTrak variants
          should be separate entries. Live scraping from keydrop is disabled
          (Cloudflare) — this is the supported path for getting real numbers in.
        </p>

        <textarea
          value={json}
          onChange={(e) => setJson(e.target.value)}
          placeholder={SAMPLE_HINT}
          rows={10}
          className="w-full rounded border border-white/10 bg-[#0b0e14] px-3 py-2 font-mono text-xs"
        />
        <div className="flex items-center gap-3">
          <button
            onClick={submit}
            disabled={loading || !json.trim()}
            className="rounded bg-amber-500 px-4 py-2 text-sm font-semibold text-black disabled:opacity-40"
          >
            {loading ? "Loading…" : "Load cases into cache"}
          </button>
          {resp && (
            <span
              className={
                resp.ok
                  ? "text-xs text-emerald-400"
                  : "text-xs text-red-400"
              }
            >
              {resp.ok
                ? `OK — ${resp.count} cases in cache (${resp.accepted} upserted)`
                : `error: ${resp.reason}${resp.message ? ` — ${resp.message}` : ""}`}
            </span>
          )}
        </div>
        {resp?.warnings && resp.warnings.length > 0 && (
          <ul className="space-y-1 text-xs text-amber-400/80">
            {resp.warnings.map((w, i) => (
              <li key={i}>⚠ {w.message}</li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}