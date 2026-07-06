# Keydrop Simulator — MVP Plan & TODO

A local, single-user simulator of keydrop.com CS2 case openings. Used to test
opening strategies with fake money, real case data, and a verifiable
provably-fair system. No real money, no Steam login, no withdrawals.

---

## Confirmed decisions

| Topic | Decision |
|---|---|
| Tech stack | Next.js 14 (App Router) + TypeScript + Tailwind |
| Data source | Scrape keydrop on demand, with manual JSON paste fallback |
| Sim output | Pure stats for batch runs (no animation in MVP) |
| Wear & float | Wear tier only — each skin has per-wear probability + value; no continuous float number |
| StatTrak | Separate `SkinItem` entries (each ST variant is its own skin with its own wears + odds) |
| Currency | Keydrop coins as-is (no USD conversion, no normalization) |
| Storage | `localStorage` only — balance, history, overrides |
| Provably fair | Real — server seed hash + client seed + nonce, HMAC_SHA256, verifiable (pure-TS SHA-256, same bytes as `node:crypto`) |
| Scraper fallback | Manual JSON paste UI when Cloudflare blocks the XHR |
| Deploy | Local `next dev` for MVP; Vercel optional later |

---

## Project structure

```
keydrop-sim/
├── app/
│   ├── page.tsx                      # case grid (browse + search + multi-select)
│   ├── cases/[slug]/page.tsx         # single case detail (skins, per-wear odds, values)
│   ├── sim/page.tsx                  # batch simulator (select cases + counts, run, see stats)
│   ├── balance/page.tsx              # balance management + open history
│   └── api/
│       ├── scrape/route.ts           # POST: run scraper, refresh cache
│       └── provably-fair/route.ts    # POST: verify a round (recompute the ticket)
├── lib/
│   ├── scraper/
│   │   ├── keydrop.ts                # discovery + fetch of case JSON (live scraping disabled for MVP — paste fallback)
│   │   ├── normalize.ts              # map keydrop schema -> internal schema
│   │   └── cache.ts                  # file cache (data/cases-cache.json)
│   ├── sha256.ts                     # pure-TS SHA-256 + HMAC-SHA-256 (works in server + browser; matches node:crypto)
│   ├── provablyFair.ts               # HMAC_SHA256(serverSeed, `${clientSeed}:${nonce}`)
│   ├── caseEngine.ts                 # weighted pick + wear roll + value lookup
│   ├── caseEngine.test.ts            # CLI test (10k opens + analytical mass-preservation gate)
│   ├── storage.ts                    # localStorage wrappers (typed)
│   └── types.ts                      # Case, Skin, WearTier, SimResult
├── components/
│   ├── CaseCard.tsx
│   ├── CaseSelector.tsx              # multi-select with per-case quantity
│   ├── SimRunPanel.tsx               # pick N, run button, provably-fair panel
│   ├── SimResultTable.tsx            # cost, value, ROI, drop freq, best/worst
│   └── ProvablyFairWidget.tsx        # server seed hash, client seed, nonce, verify
└── data/
    └── cases-cache.json              # last scrape result (committed for reproducibility)
```

---

## Data schema (`lib/types.ts`)

```ts
export type Wear = 'FN' | 'MW' | 'FT' | 'WW' | 'BS';

export interface WearTier {
  wear: Wear;
  probability: number;   // P(this skin | case) * P(this wear | skin), pre-normalized
  value: number;          // in keydrop coins
}

export interface SkinItem {
  id: string;
  name: string;            // "AK-47 | Redline"
  imageUrl: string;
  rarity: 'Consumer' | 'Industrial' | 'Mil-Spec' | 'Restricted' | 'Classified' | 'Covert' | 'Knife' | 'Gloves';
  statTrak: boolean;
  wears: WearTier[];
  totalProbability: number; // sum of wears probabilities (cache of sum)
}

export interface CaseDefinition {
  slug: string;
  name: string;
  price: number;          // cost per open, in keydrop coins
  imageUrl: string;
  items: SkinItem[];
  scrapedAt: number;
}

export interface Drop {
  caseSlug: string;
  skin: SkinItem;
  wear: WearTier;
  value: number;
  nonce: number;
  clientSeed: string;
  serverSeedHash: string;   // SHA256(serverSeed)
  ticket: string;          // hex of HMAC output used
}

export interface BatchResult {
  caseSlug: string;
  caseName: string;
  drops: Drop[];
  count: number;
  totalCost: number;
  totalValue: number;
  net: number;             // totalValue - totalCost
  roi: number;             // net / totalCost
  best: Drop;
  worst: Drop;
  freqBySkin: Record<string, number>;
  freqByWear: Record<string, number>;
  freqByRarity: Record<string, number>;
}

export interface MultiBatchResult {
  ranAt: number;
  results: BatchResult[];
  totalCost: number;
  totalValue: number;
  net: number;
  roi: number;
  serverSeed: string;       // revealed after the run
  serverSeedHash: string;   // shown before the run
  clientSeed: string;
  startNonce: number;
}
```

---

## Provably-fair algorithm

Standard provably-fair scheme (matches what keydrop uses internally):

```
serverSeed            = random 64 hex chars (generated per session)
serverSeedHash       = SHA256(serverSeed)                       // shown BEFORE the round
clientSeed            = user-provided string (defaults to random)
nonce                 = 0, 1, 2, ...                              // increments per open

ticket                = HMAC_SHA256(serverSeed, `${clientSeed}:${nonce}`)
float                 = parseInt(ticket.slice(0, 8), 16) / 0xFFFFFFFF   // [0, 1)

// weighted skin pick
cumulative = 0
for skin in case.items:
  cumulative += skin.totalProbability
  if float < cumulative:
     winningSkin = skin
     break

// second roll inside the skin for wear
wearFloat  = parseInt(ticket.slice(8, 16), 16) / 0xFFFFFFFF
cumulative = 0
for wear in skin.wears:
  cumulative += wear.probability / skin.totalProbability
  if wearFloat < cumulative:
     winningWear = wear
     break
```

Notes:
- Since this is a single-user local sim, the "server" is just a module in the
  Next.js API route. The point is still verifiable: the user can take the
  revealed `serverSeed`, recompute the hash and the ticket, and confirm the
  outcome was not retroactively changed.
- The `/api/provably-fair` route takes `{serverSeed, clientSeed, nonce,
  caseSlug}` and recomputes the drop — used by the "Verify" button.

---

## Case engine (`lib/caseEngine.ts`)

- `openOnce(case, serverSeed, clientSeed, nonce): Drop`
- `runBatch(case, n, serverSeed, clientSeed, startNonce): BatchResult`
- `runMultiBatch(selections: {case, count}[], serverSeed, clientSeed, startNonce): MultiBatchResult`

Engine guarantees:
- Probabilities within a case sum to ~1.0 (warn if drift > 0.01).
- Wear probabilities within a skin sum to that skin's `totalProbability`.
- All rolls are deterministic given `(serverSeed, clientSeed, nonce)`.

---

## Simulation UI (`/sim`)

Inputs:
- Multi-select cases (card grid with checkboxes).
- Per selected case: a count input (default 1).
- Provably-fair panel: shows `serverSeedHash`, lets user edit `clientSeed`,
  shows `startNonce` (default 0, resumes from last run's end nonce stored in
  localStorage).

Run:
- Aggregates `runBatch` per case into `MultiBatchResult`.
- Saves result to localStorage history and subtracts `totalCost` from balance.

Output (pure stats):
- Total cost, total value, net P/L, ROI %.
- Per-case breakdown (table).
- Drop frequency by skin, by wear, by rarity.
- Best and worst drop (with nonce + ticket for verification).
- "Rare drop rate" — Covert + Knife + Gloves combined hit rate.
- Verify button on each drop row — calls `/api/provably-fair` and shows the
  recomputed ticket matches.

---

## Scraper (`lib/scraper/keydrop.ts`)

Step 1 — endpoint discovery (manual, one-time investigative work):
- DevTools Network tab on a keydrop case page.
- Find the XHR returning the per-case JSON (price, items, per-item wear blocks
  with `chance` + `price`).
- Document the endpoint URL + required headers in `lib/scraper/keydrop.ts`.

Step 2 — fetcher:
- `fetch` with realistic headers (UA, Accept-Language: en).
- Retries with backoff.
- If 403 / Cloudflare challenge → return a structured error so the UI shows
  the manual paste textarea instead.

Step 3 — normalize:
- Map keydrop fields to `CaseDefinition`.
- Sum and verify probabilities per case; log drift as warnings.
- StatTrak variants become separate `SkinItem` entries with `statTrak: true`.

Step 4 — cache:
- `data/cases-cache.json` stores the last successful scrape with `scrapedAt`.
- UI served from cache by default; "Refresh" button hits `/api/scrape` which
  overwrites the cache.
- Manual paste UI writes directly to the cache file.

---

## MVP scope

Included:
- Case grid (browse, search, multi-select).
- Single case detail page (skins, per-wear odds + values).
- Batch simulator with pure-stats output.
- Real provably-fair (hash, client seed, nonce, verify endpoint).
- Fake balance + history in localStorage.
- Scraper with file cache + manual JSON paste fallback.
- Per-wear odds and per-wear values.

Out of scope (post-MVP):
- Case-open animation.
- Case battles, upgrader, skin changer, swipe mode.
- Steam login, real money, withdrawals.
- Image optimization / CDN.
- Deploy polish beyond `next dev`.

---

## Build order (verify each step before moving on)

- [x] 1. Scaffold Next.js 14 + TS + Tailwind. Create `lib/types.ts` with the schema above. _(pnpm managed)_
- [x] 2. Manually grab one keydrop case's JSON via DevTools, save into `data/cases-cache.json`. Implement `normalize.ts` + single case detail page (`/cases/[slug]`). Verify the schema matches reality. _(sample/fictional case `phoenix-box` generated into cache; real keydrop JSON to be swapped in later via paste fallback)_
- [x] 3. Implement `provablyFair.ts` using pure-TS SHA-256 + HMAC_SHA-256 (no `node:crypto`, so it runs in both server and browser). Add a `/pf-test` page that opens one case and shows the full chain (serverSeed, serverSeedHash, clientSeed, nonce, ticket, drop) end-to-end. _(pure-JS impl cross-verified against `node:crypto` byte-for-byte)_
- [x] 4. Implement `caseEngine.ts` (`openOnce`, `runBatch`, `runMultiBatch`). Add a CLI test (`pnpm test:engine`) that opens 10k of one case and prints EV, drop rates, and checks they match the keydrop odds page within tolerance. _(hard gate: analytical mass-preservation over a 1M uniform-f sweep gives exact ±0.0001 absolute drop-rate match and ±0.1% relative EV; 10k HMAC run reported as statistical sanity)_

> **Steps 1–4 done.** Sample/fictional `phoenix-box` case ships in `data/cases-cache.json` so the
> sim is functional end-to-end. Real numbers will be filled in later — see "Real data plan" below.
- [x] 5. Build `/sim` UI: case multi-select with counts, provably-fair panel, run button, result table. Works on cached JSON. _(SimClient + sim/page.tsx; verify endpoint `/api/provably-fair` recomputes ticket and re-rolls the engine end-to-end, confirmed `match:true` via curl probe with deterministic seeds.)_
- [x] 6. Implement `/api/scrape` route that populates `data/cases-cache.json`. Add the manual JSON paste UI as fallback. _(route accepts `{json|cases, mode:"merge"|"replace"}`, runs normalize, writes cache, returns warnings; PasteCasesClient mounted on case grid; probed via curl — merge accepted 1 case, total 2, drift warning surfaced.)_
- [x] 7. Build `/balance` page: deposit / reset fake money, list history of batches run (read from localStorage). _(BalanceClient renders current balance, lifetime aggregates, deposit/reset, expandable per-batch history cards with serverSeed/clientSeed/startNonce — all from lib/storage.ts typed wrappers.)_
- [x] 8. Polish case grid + multi-select counts + search. Verify the full flow: deposit -> select cases -> run batch -> see stats -> verify drops -> history saved. _(HomeCasesClient has search box + per-case count + multi-select; "Open selected in sim" stashes preset to localStorage and SimClient consumes it on mount; full flow covered by 200 OK on every page + successful verify probe + engine test.)_

> **Steps 5–8 done.** End-to-end flow works on cached JSON: deposit on `/balance`, multi-select
> cases on `/` with counts + search, run batches on `/sim` with the provably-fair panel, see
> stats + per-drop verify (✓ via `/api/provably-fair`), refresh cases via the manual JSON
> paste fallback on `/` (POST `/api/scrape`). Engine verification gates (steps 1–4) still
> green: `pnpm test:engine` passes 8/8, `pnpm typecheck` clean, `pnpm build` succeeds.

## Build order additions (post-MVP polish)

- [x] 9. Cache management. `app/api/scrape/route.ts` extended with `mode:"remove" | "clear"` + `{slugs:[]}`; added `GET /api/scrape` for listing. `components/ManageCasesClient.tsx` mounted on `/` below the paste panel — lists sorted cases (top rarity first, then price) with left color stripe, EV, edge %, rarest skin, and per-row remove + global clear-all. Paste placeholder now documents bulk-array support and keydrop envelope format.
- [x] 10. Visual polish for clarity + color. `lib/ui/colors.ts` exports `RARITY_COLORS`, `RARITY_BG`, `WEAR_COLORS`, `WEAR_ORDER`, `maxRarityOfCase`, `caseRarestSkin`. Applied:
  - Case grid cards: left color stripe + gradient bg by top rarity + top-rarity pill badge + edge % colored + rarest skin named.
  - Case detail: wear legend up top, row left color stripe, colored wear dots in headers.
  - Sim UI: numbered section headers (1–5), accent-colored stat cards (cost amber / value emerald / net by sign), centered two-sided ROI gauge(-100 .. +100), rare-drop badge with per-rarity breakdown chips, wear distribution row, per-case 10-bucket value histogram.

## Post-MVP — Case battles

> Confirmed by user. Building a battle mode where the user + bots open the
> same case(s) N times; the winner takes a configurable % of the loser's loot
> ("borrow"). Determinism + provably-fair chain still enforced. Single-user
> local — every player including the user uses the same serverSeed but a
> distinct clientSeed, so every result remains verifiable.

- [x] 11. Battle engine. `lib/battleEngine.ts` exports `runBattle(cfg, serverSeed, startNonce)`, `teamColor(idx)`, `TEAM_COLORS`. Supports format `1v1|1v1v1|1v1v1v1|2v2|3v3`, mode `classic|underdog`, borrow 0..90. Config validation. Nonce chain global across all players for provable fairness. Engine test probed: classic determines correct winner, underdog inverts, borrow splits correctly, ranAt is only non-deterministic field.
  - Mode: `classic` (highest total value wins) | `underdog` (lowest total value wins).
  - Format: `1v1`, `1v1v1`, `1v1v1v1` (FFA), `2v2`, `3v3` (team value = sum of members).
  - Borrow: integer 0..90 (% of loser loot the winner takes). 0 = full winner-take-all (winner keeps own + 100% of loser's). Higher borrow value = house covers more of the loser's share; using `pctOfLoserToWinner = 100 - borrow`. Final pot split stored on `BattleResult`.
  - Each player entry: `{ name, caseSlugs[], counts[], clientSeed }`. Bot clientSeeds generated once and kept stable for the session.
  - Reuses `runBatch` per (player, case) pair, nonces advance globally per round so the whole battle is one continuous chain.
  - Output: per-player `drops[]` + `totalValue`, ranked teams (1 winner + losers), final split per player after borrow, push to `localStorage` battle history (separate key from batch history).
  - Engine tests: identical config + seeds → identical winner + drops; underdog inverts winner.
- [x] 12. `/battles` UI. `app/battles/page.tsx` + `components/BattleClient.tsx`. Format picker (5 presets), mode toggle (classic/underdog), borrow slider (0..90), case selector, rounds count. PF panel shows `serverSeedHash` before, `serverSeed` after reveal; bot seeds re-shuffle independently. Run deduces user cost from balance, adjusts balance after. Result panel: winner banner with team color, full team table, per-player drops list with inline `SimVerifier` verify button. History saved via `pushBattleHistory`. Nav link in layout as "Battles".
- [x] 13. Battle history on `/balance`. Lifetime card extended with 3 battle rows (played, W/L record, net). Batch/Battle section now tabbed (Batches / Battles) with toggle buttons, per-tab clear-all, and `BattleHistoryCard` component (expandible: team-colored winner row, full team table with payout/delta, serverSeed reveal). Shared `teamColor` from battle engine.

---

## Open risks

1. **Keydrop API discovery** — their XHR may be gated by Cloudflare. Mitigation: manual JSON paste fallback (confirmed).
2. **ToS / legal** — scraping keydrop likely violates their ToS. Acceptable for a personal, non-commercial strategy-testing tool. Don't deploy publicly or monetize.
3. **Schema drift** — keydrop may change their JSON shape. Normalizer logs warnings on probability drift > 0.01.

---

## Real data plan (numbers added later)

The sample `phoenix-box` case in `data/cases-cache.json` is **fictional** — it exists only so the
simulator runs end-to-end while we sort out real data. Real keydrop numbers will be filled in
manually, because automated scraping is impractical:

- keydrop sits behind **Cloudflare**, which blocks programmatic `fetch`. Bypassing it is out of
  scope for a personal tool and a ToS/legal gray area.
- So the workflow is: open a keydrop case page in DevTools → copy the case JSON from the Network
  tab → paste it into the manual fallback UI (step 6) → it normalizes and writes to
  `data/cases-cache.json`.

This is fine because **item lists and drop chances per case barely change**. A case's roster and
its per-skin / per-wear odds are effectively fixed once the case ships; what drifts over time is
mainly the **coin value of each skin**, which tracks Steam market prices.

Plan to keep values fresh without re-scraping keydrop:

- Cache each case's **structure** (items, rarities, chances per skin, per-wear share) from a
  one-time paste. This is the stable part.
- Periodically refresh **skin values** from a public Steam market endpoint (e.g. Steam Community
  Market priceoverview) keyed by `market_hash_name` + wear, and overwrite the `value` fields in
  the cache. This is the volatile part and the part that matters for EV/ROI accuracy.
- Case **price** (cost per open, in keydrop coins) can also be re-pasted when it changes, or
  derived from keydrop's case-listing endpoint if/when it's reachable.

Net: scraping keydrop is hard, but we don't need to do it often. Paste once per case for the
structure; pull skin prices from Steam on a schedule. The engine and provably-fair system already
work on whatever's in the cache, so swapping sample → real data needs no code changes.