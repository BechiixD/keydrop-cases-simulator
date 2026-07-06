"use client";

import { useEffect, useState } from "react";

interface Manifest {
  downloadedAt: number;
  updated: number;
  skipped: number;
  cases: Record<string, { local: string; remote: string }>;
  skins: Record<string, { local: string; remote: string }>;
}

function fmt(ts: number): string {
  if (!ts) return "never";
  return new Date(ts).toLocaleString();
}

export default function ImgStatusPage() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mirroring, setMirroring] = useState(false);
  const [mirrorResult, setMirrorResult] = useState<string | null>(null);

  useEffect(() => {
    fetch("/img/manifest.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((m) => {
        if (m && m.downloadedAt) setManifest(m as Manifest);
        else setError("No manifest found. Run the mirror first.");
      })
      .catch(() => setError("Failed to load manifest."));
  }, []);

  async function doMirror(): Promise<void> {
    setMirroring(true);
    setMirrorResult(null);
    try {
      const r = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "mirror-images" }),
      });
      const j = (await r.json()) as Record<string, unknown>;
      if (j.ok) {
        setMirrorResult(
          `Done. Total: ${j.total ?? "?"}, Downloaded: ${j.downloaded ?? "?"}, Skipped: ${j.skipped ?? "?"}, Failed: ${j.failed ?? "?"}`,
        );
        setTimeout(() => window.location.reload(), 1500);
      } else {
        setMirrorResult(`Error: ${j.reason ?? "unknown"} — ${j.message ?? ""}`);
      }
    } catch (err) {
      setMirrorResult(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
    setMirroring(false);
  }

  const caseCount = manifest ? Object.keys(manifest.cases).length : 0;
  const skinCount = manifest ? Object.keys(manifest.skins).length : 0;

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <header className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Image status</h1>
        <span className="text-sm text-white/50">public/img/ mirror</span>
      </header>

      {error && !manifest ? (
        <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-sm text-white/60">
          {error}
        </div>
      ) : !manifest ? (
        <div className="text-sm text-white/40">Loading...</div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label="Case images" value={caseCount} />
            <Stat label="Skin images" value={skinCount} />
            <Stat label="Total mirrored" value={caseCount + skinCount} />
            <Stat label="Last run" value={fmt(manifest.downloadedAt)} />
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={doMirror}
              disabled={mirroring}
              className="rounded bg-amber-500 px-4 py-2 text-sm font-semibold text-black disabled:opacity-40"
            >
              {mirroring ? "Running..." : "Run mirror now"}
            </button>
            {mirrorResult && (
              <span className="text-sm text-amber-300">{mirrorResult}</span>
            )}
          </div>

          <section>
            <div className="text-xs uppercase tracking-wider text-white/50 mb-2">Case images</div>
            <div className="overflow-hidden rounded-xl border border-white/10">
              <table className="w-full text-sm">
                <thead className="bg-white/5 text-left text-xs uppercase tracking-wider text-white/50">
                  <tr>
                    <th className="px-3 py-2">Slug</th>
                    <th className="px-3 py-2">Local</th>
                    <th className="px-3 py-2">Remote</th>
                    <th className="px-3 py-2">Preview</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(manifest.cases).map(([slug, info]) => (
                    <tr key={slug} className="border-t border-white/5">
                      <td className="px-3 py-1.5 font-medium">{slug}</td>
                      <td className="px-3 py-1.5 text-xs text-white/60 font-mono break-all">{info.local}</td>
                      <td className="px-3 py-1.5 text-xs text-white/40 font-mono break-all max-w-[200px] truncate">{info.remote}</td>
                      <td className="px-3 py-1.5">
                        <img src={info.local} alt={slug} className="h-10 w-10 object-contain rounded bg-white/5" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <div className="text-xs uppercase tracking-wider text-white/50 mb-2">Skin images ({skinCount})</div>
            <div className="overflow-hidden rounded-xl border border-white/10 max-h-[500px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-white/5 text-left text-xs uppercase tracking-wider text-white/50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2">ID</th>
                    <th className="px-3 py-2">Local</th>
                    <th className="px-3 py-2">Preview</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(manifest.skins).slice(0, 100).map(([id, info]) => (
                    <tr key={id} className="border-t border-white/5">
                      <td className="px-3 py-1.5 font-medium text-xs">{id}</td>
                      <td className="px-3 py-1.5 text-xs text-white/60 font-mono break-all">{info.local}</td>
                      <td className="px-3 py-1.5">
                        <img src={info.local} alt={id} className="h-10 w-10 object-contain rounded bg-white/5" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {skinCount > 100 && (
                <div className="px-3 py-2 text-xs text-white/40">
                  Showing 100 of {skinCount} skins.
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-3">
      <div className="text-xs text-white/50">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums text-amber-400">
        {value}
      </div>
    </div>
  );
}
