import { readFile } from "node:fs/promises";
import path from "node:path";
import type { CaseDefinition, CasesCache, Drop, WearTier } from "@/lib/types";
import { expectedValue, openOnce, runBatch, runMultiBatch } from "@/lib/caseEngine";
import {
  computeTicket,
  floatFromTicket,
  hashServerSeed,
  pickSkinByFloat,
  pickWearByFloat,
  randomServerSeed,
} from "@/lib/provablyFair";

const CACHE = path.join(process.cwd(), "data", "cases-cache.json");

let failures = 0;

function fail(label: string, detail: string): void {
  console.log(`FAIL  ${label} — ${detail}`);
  failures++;
  process.exitCode = 1;
}
function ok(label: string, detail = ""): void {
  console.log(`  ok  ${label}${detail ? " — " + detail : ""}`);
}
function gate(label: string, cond: boolean, detail: string): void {
  if (cond) ok(label, detail);
  else fail(label, detail);
}

async function loadFirstCase(): Promise<CaseDefinition> {
  const raw = await readFile(CACHE, "utf8");
  const cache = JSON.parse(raw) as CasesCache;
  const c = cache.cases[0];
  if (!c) throw new Error("no cases in cache");
  return c;
}

const pct = (n: number) => (n * 100).toFixed(4) + "%";

async function main(): Promise<void> {
  const c = await loadFirstCase();
  console.log(`\n[1] case: ${c.name} (price ${c.price}, ${c.items.length} items)`);

  const sum = c.items.reduce((a, s) => a + s.totalProbability, 0);
  gate(
    "case probability sum ~ 1.0 (drift < 0.01)",
    Math.abs(sum - 1) < 0.01,
    `sum=${sum.toFixed(9)} drift=${Math.abs(sum - 1).toFixed(9)}`,
  );

  let worstWearDrift = 0;
  for (const s of c.items) {
    const wsum = s.wears.reduce((a, w) => a + w.probability, 0);
    const d = Math.abs(wsum - s.totalProbability);
    if (d > worstWearDrift) worstWearDrift = d;
  }
  gate(
    "every skin: wear sum == totalProbability (fp eps 1e-7)",
    worstWearDrift <= 1e-7,
    `worst wear drift=${worstWearDrift.toExponential(3)}`,
  );

  const serverSeed = randomServerSeed();
  const clientSeed = "test-client-seed";
  const startNonce = 0;
  const N = 10000;

  console.log(`\n[2] determinism & basic batch invariants`);
  const batch = runBatch(c, N, serverSeed, clientSeed, startNonce);
  gate("batch count == N", batch.count === N, `count=${batch.count}`);
  gate("drops length == N", batch.drops.length === N, `len=${batch.drops.length}`);
  gate("totalCost == price * N", batch.totalCost === c.price * N, `cost=${batch.totalCost}`);
  gate(
    "first drop carries serverSeedHash",
    Boolean(batch.drops[0]?.serverSeedHash),
    batch.drops[0]?.serverSeedHash.slice(0, 16) + "...",
  );

  console.log(`\n[3] HARD GATE — analytical mass-preservation (the ±0.0001 guarantee)`);
  const K = 1_000_000;
  const skinCounts = new Map<string, number>();
  const wearCounts = new Map<string, number>();
  const wearValueSum: number[] = new Array(c.items.length).fill(0);
  for (let i = 0; i < K; i++) {
    const f = (i + 0.5) / K;
    const picked = pickSkinByFloat(c.items, f);
    if (!picked) continue;
    const idx = c.items.indexOf(picked.skin);
    skinCounts.set(picked.skin.id, (skinCounts.get(picked.skin.id) ?? 0) + 1);
    const wf = ((i * 2654435761) % K + 0.5) / K;
    const w = pickWearByFloat(picked.skin, wf) as WearTier | null;
    if (w) {
      const key = picked.skin.id + ":" + w.wear;
      wearCounts.set(key, (wearCounts.get(key) ?? 0) + 1);
      wearValueSum[idx] += w.value;
    }
  }
  let maxSkinAbs = 0;
  let maxSkinRel = 0;
  let worstSkin = "";
  for (const s of c.items) {
    const obs = (skinCounts.get(s.id) ?? 0) / K;
    const dec = s.totalProbability;
    const abs = Math.abs(obs - dec);
    if (abs > maxSkinAbs) {
      maxSkinAbs = abs;
      maxSkinRel = abs / Math.max(dec, 1e-12);
      worstSkin = s.name;
    }
  }
  console.log(`  uniform sweep K=${K.toLocaleString()} draws`);
  console.log(`  max skin abs delta = ${maxSkinAbs.toExponential(3)} (rel ${maxSkinRel.toExponential(3)}) @ ${worstSkin}`);
  gate(
    "skin selection drop rates match declared within ±0.0001 absolute",
    maxSkinAbs < 0.0001,
    `maxAbs=${maxSkinAbs.toExponential(3)}`,
  );

  let maxWearAbs = 0;
  let worstWearKey = "";
  for (const s of c.items) {
    for (const w of s.wears) {
      const key = s.id + ":" + w.wear;
      const obs = (wearCounts.get(key) ?? 0) / K;
      const dec = w.probability;
      const abs = Math.abs(obs - dec);
      if (abs > maxWearAbs) {
        maxWearAbs = abs;
        worstWearKey = `${s.name}/${w.wear}`;
      }
    }
  }
  console.log(`  max wear abs delta = ${maxWearAbs.toExponential(3)} @ ${worstWearKey}`);
  gate(
    "wear selection rates match declared within ±0.0001 absolute",
    maxWearAbs < 0.0001,
    `maxAbs=${maxWearAbs.toExponential(3)}`,
  );

  const evSweep = c.items.reduce((a, s, i) => a + wearValueSum[i], 0) / K;
  const toggleEv = 0;
  const evDeclared = c.items.reduce(
    (a, s) => a + s.wears.reduce((b, w) => b + w.probability * w.value, 0),
    0,
  );
  void toggleEv;
  const evRel = Math.abs(evSweep - evDeclared) / Math.max(evDeclared, 1);
  console.log(`  sweep EV = ${evSweep.toFixed(6)} · declared EV = ${evDeclared.toFixed(6)}`);
  gate(
    "analytical EV matches sum(prob*value) within ±0.1% relative",
    evRel < 0.001,
    `relErr=${evRel.toExponential(3)}`,
  );

  console.log(`\n[4] STATISTICAL SANITY — ${N} HMAC opens (informational, not gated)`);
  const mean = batch.totalValue / N;
  const ev = expectedValue(c);
  let sqSum = 0;
  for (const d of batch.drops) sqSum += (d.value - mean) ** 2;
  const empStd = Math.sqrt(sqSum / N);
  const se = empStd / Math.sqrt(N);
  const z = se > 0 ? Math.abs(mean - ev) / se : 0;
  console.log(`  declared EV = ${ev.toFixed(4)} · empirical mean = ${mean.toFixed(4)}`);
  console.log(`  empirical per-open std = ${empStd.toFixed(2)} · SE(N=${N}) = ${se.toFixed(4)}`);
  console.log(`  |mean - EV| / SE = ${z.toFixed(2)} sigma (expect < 4 for healthy uniform RNG)`);

  console.log(`\n[5] determinism: repeat run with identical inputs is byte-identical`);
  const a = runBatch(c, 1000, serverSeed, clientSeed, 7);
  const b = runBatch(c, 1000, serverSeed, clientSeed, 7);
  let identical = a.drops.length === b.drops.length;
  if (identical) {
    for (let i = 0; i < a.drops.length; i++) {
      const da: Drop = a.drops[i];
      const db: Drop = b.drops[i];
      if (
        da.skin.id !== db.skin.id ||
        da.wear.wear !== db.wear.wear ||
        da.value !== db.value ||
        da.nonce !== db.nonce ||
        da.ticket !== db.ticket
      ) {
        identical = false;
        break;
      }
    }
  }
  gate(
    "repeat run byte-identical",
    identical,
    identical ? "1000 drops identical" : "mismatch!",
  );

  console.log(`\n[6] ticket recomputation matches HMAC for arbitrary nonces`);
  for (const nonce of [0, 1, 42, 999]) {
    const drop = openOnce({ case: c, serverSeed, clientSeed, nonce });
    if (!drop) continue;
    const recomputed = computeTicket(serverSeed, clientSeed, nonce);
    gate(
      `nonce ${nonce} ticket matches`,
      drop.ticket === recomputed && drop.serverSeedHash === hashServerSeed(serverSeed),
      drop.ticket.slice(0, 12) + "...",
    );
  }

  console.log(`\n[7] multi-batch nonce continuity`);
  const mb = runMultiBatch(
    [{ case: c, count: 500 }, { case: c, count: 500 }],
    serverSeed,
    clientSeed,
    0,
  );
  const first = mb.results[0]?.drops.map((d) => d.nonce) ?? [];
  const second = mb.results[1]?.drops.map((d) => d.nonce) ?? [];
  gate(
    "first batch nonces 0..499",
    first[0] === 0 && first[first.length - 1] === 499,
    `range ${first[0]}..${first[first.length - 1]}`,
  );
  gate(
    "second batch nonces 500..999",
    second[0] === 500 && second[second.length - 1] === 999,
    `range ${second[0]}..${second[second.length - 1]}`,
  );

  console.log(`\n[8] float slicing matches ticket prefix`);
  const sampleTicket = computeTicket(serverSeed, clientSeed, 1234);
  const f1 = parseInt(sampleTicket.slice(0, 8), 16) / 0xffffffff;
  const f2 = parseInt(sampleTicket.slice(8, 16), 16) / 0xffffffff;
  gate(
    "skin float from prefix",
    Math.abs(f1 - floatFromTicket(sampleTicket, 0)) < 1e-12,
    `f1=${f1.toFixed(6)}`,
  );
  gate(
    "wear float from prefix",
    Math.abs(f2 - floatFromTicket(sampleTicket, 8)) < 1e-12,
    `f2=${f2.toFixed(6)}`,
  );

  console.log(
    `\nbest drop: ${batch.best?.skin.name} (${batch.best?.wear.wear}) = ${batch.best?.value} coins @ nonce ${batch.best?.nonce}`,
  );
  console.log(
    `worst drop: ${batch.worst?.skin.name} (${batch.worst?.wear.wear}) = ${batch.worst?.value} coins @ nonce ${batch.worst?.nonce}`,
  );

  console.log(`\ndone — ${failures} failure(s).`);
  if (process.exitCode) process.exit(process.exitCode);
}

void main();