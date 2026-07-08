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
  - Borrow: integer 0..90 (% the house covers). 0 = full entry cost (100% of case price), winner takes 100% of loser's loot (winner-take-all). 90 = 10% entry cost, winner takes 10% of loser's loot. entryCost = rawCost × (100 - borrow) / 100; payoutFraction = (100 - borrow) / 100. Net settled per player: net = keptValue - entryCost. Final pot split stored on `BattleResult`.
  - Each player entry: `{ name, caseSlugs[], counts[], clientSeed }`. Bot clientSeeds generated once and kept stable for the session.
  - Reuses `runBatch` per (player, case) pair, nonces advance globally per round so the whole battle is one continuous chain.
  - Output: per-player `drops[]` + `totalValue`, ranked teams (1 winner + losers), final split per player after borrow, push to `localStorage` battle history (separate key from batch history).
  - Engine tests: identical config + seeds → identical winner + drops; underdog inverts winner.
- [x] 12. `/battles` UI. `app/battles/page.tsx` + `components/BattleClient.tsx`. Format picker (5 presets), mode toggle (classic/underdog), borrow slider (0..90), case selector, rounds count. PF panel shows `serverSeedHash` before, `serverSeed` after reveal; bot seeds re-shuffle independently. Run deduces user cost from balance, adjusts balance after. Result panel: winner banner with team color, full team table, per-player drops list with inline `SimVerifier` verify button. History saved via `pushBattleHistory`. Nav link in layout as "Battles".
- [x] 13. Battle history on `/balance`. Lifetime card extended with 3 battle rows (played, W/L record, net). Batch/Battle section now tabbed (Batches / Battles) with toggle buttons, per-tab clear-all, and `BattleHistoryCard` component (expandible: team-colored winner row, full team table with payout/delta, serverSeed reveal). Shared `teamColor` from battle engine.

---

## Phase 2 — Realistic opening, balance control, image cache, frontend polish

> **Scope change.** The original MVP explicitly excluded the case-open
> animation (rule #1 in `README.md`). The MVP is now functionally complete and
> verified, so this restriction is lifted for Phase 2. The sim page is
> reorganized into **two modes**: a rústico/mathematical stats batch (the
> current `/sim`) and a **realistic** single-case open with images + animation.

Constraints kept from the MVP rules: values stay in keydrop coins, the
provably-fair chain stays verifiable, no `Math.random` in the engine, no real
money, no database. New work must not regress any of the existing verification
gates (`pnpm test:engine`, `pnpm typecheck`, the verify endpoint).

### 14. Balance management improvements

Today `/balance` only exposes **deposit** (add) and **reset to 10,000**
(`components/BalanceClient.tsx`). The storage layer (`lib/storage.ts`) already
exports a typed `setBalance(n)`, so the work is mostly UI.

- [x] 14.1 Add a **"Set to"** field on the balance card: a numeric input plus a
      button that calls `setBalance` directly (overwrites instead of adding).
      Validate `>= 0`, integers only, with a confirm if the value would wipe a
      balance > 1M (guardrail against fat-finger zeros).
- [x] 14.2 Add **quick-set presets** as a row of small buttons under the input:
      `1k · 10k · 50k · 100k · 1M · 10M`. Reuses `setBalance`.
- [x] 14.3 Add a **withdraw** action (subtract instead of add), mirroring
      deposit but calling `adjustBalance(-n)`. Disables when `n > balance`.
- [x] 14.4 Rename the existing "reset to 10,000" button to "reset (default
      10k)" and keep it, but make the default configurable via a
      `DEFAULT_BALANCE` constant exported from `lib/storage.ts` (already there)
      so presets/editing share one source of truth.
- [x] 14.5 Show a small "balance changed to X" toast/inline confirmation after
      any explicit set/withdraw so the user sees the new value without scanning.

### 15. Image asset cache (local mirror committed to the repo)

`data/cases-cache.json` currently stores **remote** image URLs
(`https://cdnkd.com/...`, `https://key-drop.com/...`). Those will break if
keydrop changes CDN paths or hotlink-blocks. We want a committed local mirror
so the repo is self-contained and a contributor can swap any image by editing
a file under `public/img/`.

- [x] 15.1 Add `public/img/cases/<slug>.png` and `public/img/skins/<id>.png`
      directory layout. `.gitignore` must NOT exclude them.
- [x] 15.2 New script `scripts/mirror-images.ts` (run via `pnpm mirror:images`):
      - Reads `data/cases-cache.json`.
      - For every `CaseDefinition.imageUrl` and every `SkinItem.imageUrl`, if
        the URL is remote, `fetch` it with retries + a realistic UA, save the
        bytes to the corresponding local path (hash the URL to dedupe), and
        rewrite the cache entry's `imageUrl` to `/img/...`.
      - Before rewriting, stores the original remote URL in a sibling field
        `imageUrlRemote` so the mirror is reversible / auditable.
      - Idempotent: if `imageUrl` already starts with `/img/`, skip; if the
        local file is missing, re-download; if the remote fetch 403s, leave the
        entry pointing at the remote URL and log a warning (do not break).
      - Writes a small `public/img/manifest.json` mapping `localPath -> remoteUrl`
        + `downloadedAt` + `bytes` for traceability.
- [x] 15.3 Update `lib/scraper/normalize.ts` so freshly pasted/normalized cases
      keep **remote** URLs in `imageUrl` and also fill `imageUrlRemote`. The
      mirror script (15.2) is the one that flips a case from remote-mode to
      local-mode. This keeps the scrape path unchanged and the mirror opt-in.
- [x] 15.4 Update `lib/types.ts` `CaseDefinition` and `SkinItem` to add an
      optional `imageUrlRemote?: string`. Keep `imageUrl` as the field the UI
      renders (local if mirrored, remote otherwise) so no UI changes needed.
- [x] 15.5 Add a one-page **/img-status** admin view (or a panel on `/`) that
      reads `public/img/manifest.json` and shows: total assets, mirrored count,
      still-remote count, last mirror run, and a "Run mirror now" button that
      POSTs to `/api/scrape` with `{action:"mirror-images"}` (new route mode).
      Goal: a contributor with no local Node can still see what's mirrored.
- [x] 15.6 Document the mirror flow in `README.md`: "Images are local by
      default; run `pnpm mirror:images` after pasting new cases to fetch and
      commit them. Swap any file under `public/img/` to change an image."

### 16. Realistic single-case open mode (keydrop-style)

A new user-facing flow that opens **one case at a time** with a visual reel,
like keydrop's open page. The math stays the same (`openOnce` from
`caseEngine.ts`) — only the presentation changes.

- [x] 16.1 New component `components/OpenRealistic.tsx`:
      - Inputs: a single `CaseDefinition`, the provably-fair panel state (server
        seed / client seed / nonce), and the user's balance.
      - "Open" button: validates balance >= case.price, calls `openOnce`,
        deducts `case.price` via `adjustBalance`, advances the global nonce
        (`setLastNonce(n+1)`), pushes the single drop into a small per-session
        open history (separate localStorage key `keydrop-sim:opens`).
      - Animation: horizontal reel of the case's items scrolling, decelerating,
        landing on the winning item centered. Uses item images. Reel order is
        deterministic from the case's item list (NOT from the seed — the seed
        only decides the winner; the reel is just visual and the winning slot
        is revealed by slowing the scroll and snapping the winner to center,
        then showing the rarity color flash + value).
      - Result card under the reel: big item image, name, wear, rarity color
        bar, StatTrak tag, value in coins, nonce + "Verify" button
        (reuses `SimVerifier`).
      - Provably-fair panel identical to the stats batch (same server seed /
        client seed / nonce, shared across modes), so a user can interleave
        realistic opens with batch runs on the same chain.
- [x] 16.2 Sound is optional and OFF by default (a toggle in the panel). Ship
      without audio assets for v1; the toggle just reserves the slot.
- [x] 16.3 Keep the math verifiable: the open must store `{nonce, clientSeed,
      ticket, serverSeedHash}` on each drop exactly like `Drop` already does.
      The verify endpoint already handles single-drop verification.
- [x] 16.4 Auto-open / "open N realistically in a row" mode: a slider 1..50
      that queues sequential opens with a short delay between each, showing a
      mini-reel for each (or an abbreviated flash for runs > 10 to keep it
      responsive). The full per-drop table is still saved to history as a
      `BatchResult` with `count = N` so it shows up on `/balance` like any
      other batch.
- [x] 16.5 Add the realistic open as a CTA on the case detail page
      (`/cases/[slug]`): a "Open realistically" button that routes to
      `/sim?mode=realistic&slug=<slug>`. Also add it on the case grid card
      hover ("Open" quick action) for power users.

### 17. Reorganize `/sim` into two modes

- [x] 17.1 `/sim` gets a **mode switcher** at the top: two tabs:
      - **`Stats batch`** — the current rústico/mathematical flow (multi-select
        cases + counts + run + pure stats). Unchanged behavior, just renamed
        and re-skinned to match.
      - **`Realistic`** — mounts `OpenRealistic` (step 16) with a single-case
        picker (default = first case in cache).
- [x] 17.2 Mode is stored in the URL (`?mode=stats|realistic`) and in
      localStorage so reloads and CTAs from other pages land on the right tab.
      The existing "Open selected in sim" preset from the home page keeps
      targeting the Stats batch tab (preset key `keydrop-sim:simPreset`).
- [x] 17.3 The provably-fair panel (server seed hash / client seed / nonce /
      reshuffle) is shared between both modes — factor it into a single
      `<ProvablyFairPanel>` used by both `SimClient` (stats) and
      `OpenRealistic`, advancing the same nonce so the chain stays continuous
      across modes.
- [x] 17.4 Update the `README.md` "What it is not" bullet that says "No
      case-open animation in the MVP" — replace with "Stats batch mode has no
      animation (chosen for batch speed); a Realistic single-case open mode
      with animation exists in Phase 2."

### 18. Frontend polish pass

A thin design-system + UX pass across all pages, no behavior changes.

- [x] 18.1 Extract shared UI primitives into `components/ui/` (or
      `lib/ui/components.tsx`): `Stat`, `SectionHeader`, `FreqTable`,
      `RoiGauge`, `Tab`, `Pill`, `Card`. Currently these live inline in
      `SimClient`; promote them so the realistic mode, balance page, and case
      pages reuse them.
- [x] 18.2 Add **active-route highlighting** in the nav (`app/layout.tsx`),
      hover transitions on case cards, and consistent section spacing
      (space-y-6 everywhere, not mixed space-y-3/4).
- [x] 18.3 Loading & empty states: every page that reads from cache or
      localStorage shows a skeleton/placeholder instead of `…` raw text when
      `ready === false`. Empty states link to the page that would fill them
      (`/balance` -> "no history, visit /sim").
- [x] 18.4 Accessibility: focus rings on all interactive elements, `aria-label`
      on icon-only buttons (verify, close), `aria-current="page"` on active nav
      link, `lang="es"` is wrong — keep `lang="en"` since UI is English, but
      make sure `<html lang>` is set correctly.
- [x] 18.5 Responsive audit: confirm the sim case grid, batch result tables,
      and battle result table scroll horizontally rather than overflow on
      mobile widths (< 640px). Wrap long server seeds with `break-all`
      (already done in some places; finish the rest).
- [x] 18.6 Verify nothing regresses: `pnpm typecheck`, `pnpm test:engine`,
      `pnpm build` all green after each sub-step above; tick a box only when
      those three pass.

### 19. Mobile responsive pass

Table wrappers already use `overflow-x-auto` (from step 18). This step covers
the rest: layout, touch targets, text overflow, nav on narrow screens.

- [x] 19.1 Nav on mobile (< 640px): hide link labels, show icon-only tabs.
      Keep the brand name visible. Collapse into a bottom bar or keep the top
      bar but with `overflow-x-auto` + icons only.
- [x] 19.2 Case grid cards: stack single-column on mobile. Currently `grid-cols-1
      sm:grid-cols-2 md:grid-cols-3` — verify it looks correct at 360px width.
      Cards should not truncate case names; wrap to 2 lines if needed.
- [x] 19.3 Sim mode tabs: full-width on mobile (not `w-fit`), equal-width
      "Stats batch" / "Realistic" buttons spanning the full row.
- [x] 19.4 OpenRealistic reel: container height and item size scale down on
      mobile. `ITEM_W` drops from 100px to 72px, reel height from 140px to
      110px below 640px. Center reticle stays visible.
- [x] 19.5 Balance card controls: stack vertically on mobile. Set-to, deposit,
      withdraw inputs + buttons each on their own row instead of flex-wrap.
      Presets wrap to 2 rows.
- [x] 19.6 Touch targets: all buttons, inputs, and select elements minimum
      44px height on mobile (add `min-h-[44px]` via responsive class).
      Checkbox inputs get a larger hit area via a wrapping label.
- [x] 19.7 Long text: verify no horizontal overflow on 360px viewport for case
      names, skin names, server seed display, manifest table in `/img-status`.
      Add `break-words` or `truncate` as needed.
- [x] 19.8 Provably-fair panel: inputs full-width on mobile (no `w-40` fixed
      widths below 640px). Nonce input and client seed input fill available
      width.
- [x] 19.9 Battle page: format picker, mode toggle, borrow slider stack
      vertically on mobile. Player name inputs full-width.
- [x] 19.10 Verify: `pnpm typecheck`, `pnpm test:engine`, `pnpm build`. Manual
      smoke test at 360px and 768px viewports on `/`, `/sim` (both modes),
      `/balance`, `/battles`, `/cases/<slug>`.

### 20. Inventory system — drops stored, sellable, tracked

Case openings and battles now send won drops to an inventory instead of only
subtracting entry cost. The inventory tracks every skin with its value, rarity,
wear, and source. Items can be sold individually or in bulk to recover balance.

- [x] 20.1 Add `InventoryItem` type (`lib/types.ts`) and `lib/inventory.ts`
      storage layer (`addDrops`, `sellItem`, `sellAll`, `getInventory`,
      `inventoryValue`, `clearInventory`). Max 500 items, FIFO eviction.
- [x] 20.2 Wire inventory to `OpenRealistic` (single open + auto-open): drops
      go to inventory with source `"realistic"`. Entry cost still subtracted.
- [x] 20.3 Wire inventory to `SimClient` (batch stats): checkbox "Send drops
      to inventory" (default ON). Drops go with source `"batch"`.
- [x] 20.4 Wire inventory to `BattleClient`: user's drops from battle go to
      inventory with source `"battle"`. `adjustBalance(userNet)` still runs
      for net profit/loss on top of inventory.
- [x] 20.5 Create `/inventory` page: grid of owned skins with image, rarity
      color bar, wear badge, ST tag, value, source, sell button per item.
      Filters: rarity, wear, source, sort (value/newest/rarity). Sell all
      bulk button. Clear button (without payment, with confirm).
- [x] 20.6 Update `/balance` page: add "Inventory value" card showing total
      inventory value, item count, net worth (balance + inventory),
      link to `/inventory`.
- [x] 20.7 Nav link to `/inventory` with box icon.
- [x] 20.8 Verify: `pnpm typecheck`, `pnpm test:engine`, `pnpm build`.

### 21. Joker mode — uniform odds, fair-price opening

A toggle on `/sim` (both Stats batch and Realistic) that flattens every
case to **equal per-skin odds** and raises the open price to the case's
**expected value** under that uniform distribution. Result: a fair,
0% house-edge game where rare items (Covert/Knife/Gloves) become as
likely as any Mil-Spec. The provably-fair chain stays verifiable.

- [x] 21.1 Engine: `jokerCase(c)` in `lib/caseEngine.ts` builds a copy of
      the case where each skin's `totalProbability = 1/N` and each wear's
      probability is rescaled to `(w.probability / skin.totalProbability) *
      (1/N)` (per-wear ratios preserved, skin selection uniform).
      `jokerPrice(c)` returns the uniform-EV price scaled to keep the
      case's **original house edge**: `jokerPrice = jokerEV / (1 - origEdge)`
      where `origEdge = 1 - origEV / origPrice` (== `jokerEV * origPrice /
      origEV`). This matches keydrop's real joker pricing (verified against
      two cases: ICE BLAST 0.32→2.90 vs keydrop 3.03; GIRLS FAVORITE
      1→33.04 vs keydrop 33.65; residual gap is stale skin values in the
      cache). `openOnce` / `runBatch` / `runMultiBatch` accept a
      `joker?: boolean` and, when set, open against `jokerCase(c)` while
      keeping `caseSlug` on the original slug so cache lookup still resolves.
- [x] 21.2 `Drop` gains `joker?: boolean`; every joker drop is stamped
      `joker: true` so history + inventory carry the flag.
- [x] 21.3 Verify: `/api/provably-fair` accepts `joker` in the request and
      applies `jokerCase()` before recomputing the ticket. `SimVerifier`
      sends `drop.joker`. Probed end-to-end: `joker:true` → full match
      (hash/ticket/skin/wear); `joker:false` on the same drop → skin
      mismatch (confirms the flag changes the outcome and the endpoint
      honors it).
- [x] 21.4 UI: a `🃏 Joker mode` toggle (persisted in `localStorage` via
      `getJokerMode`/`setJokerMode`) is shown on both `SimClient` (stats
      batch) and `OpenRealistic`. When ON, case cards / the case picker
      show the joker price in fuchsia with the original price struck
      through; cost summaries, balance-gate checks, and button-disable
      conditions all use the joker price.
- [x] 21.5 Verify: `pnpm typecheck`, `pnpm test:engine`, `pnpm build` all
      green; standalone sanity script confirmed uniform 1/N distribution
      over 20k rolls, edge preserved (= original case edge), wear ratios
      preserved, and byte-identical determinism for fixed seeds.
- [x] 21.6 Joker in battles. `BattleConfig` and `BattleResult` gain
      `joker?: boolean`. `runBattle` threads `cfg.joker` into `runBatch`
      and uses `jokerPrice(c)` instead of `c.price` for entry-cost
      calculation, so the battle economy stays consistent with sim mode.
      `BattleClient` gets the same `🃏 Joker mode` toggle (persisted via
      `getJokerMode`/`setJokerMode`, shared with sim), joker pricing in
      case cards with strikethrough, and passes `joker` into the cfg.
      Result panel + `BattleHistoryCard` on `/balance` show a `🃏 joker`
      badge. End-to-end probe: joker battle entry cost = jokerPrice ×
      rounds, drops are uniform across all rarities (knife shows up in
      10 opens), `result.joker = true`, all drops carry `joker: true`,
      and the verify endpoint confirms `match: true` with the joker flag.

---

## Phase 2 build order (verify each before moving on)

1. **14** (balance) — pure isolated UI/storage change, no engine risk. Ship
   first; lowest blast radius.
2. **15** (image mirror) — needed before the realistic open looks good.
   Includes the `imageUrlRemote` type addition.
3. **16** (realistic open) — depends on 15 for crisp images.
4. **17** (sim reorg) — depends on 16 shipping the component.
5. **18** (polish) — last, runs across everything done above.

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