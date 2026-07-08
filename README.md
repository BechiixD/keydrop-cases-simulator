# Keydrop Simulator

A local, single-user simulator of [keydrop.com](https://keydrop.com) CS2 case
openings. Used to test opening strategies with **fake money**, **real case
data** scraped from keydrop, and a **verifiable provably-fair system**.

> ⚠️ This project is for personal, non-commercial strategy testing only.
> No real money, no Steam login, no withdrawals. Do not deploy publicly or
> monetize. Scraping keydrop may violate their ToS — use at your own risk.

---

## What it is

Keydrop is a gambling site for CS2 skins. This project clones the **case
opening mechanic** — case prices, skin lists, per-wear probabilities, per-wear
values, StatTrak variants — and lets you:

- Browse cases sourced directly from keydrop (auto-scraped, with a manual
  JSON paste fallback when Cloudflare blocks the scraper).
- Run **batch simulations** of N opens (e.g. "open this case 100 times") and
  see the result as **pure stats** — total cost, total value won, ROI, drop
  frequency by skin / wear / rarity, best and worst drop.
- Manage a **fake balance** and a **history** of past batches.
- Verify every single drop through a real **provably-fair** chain (server
  seed hash + client seed + nonce + HMAC_SHA256), so you can prove the
  outcomes weren't retroactively changed.
- Toggle **Joker mode** on `/sim`: every weapon in a case gets **equal
  odds** (uniform `1/N`), and the open price rises so the case keeps its
  **original house edge** (same % edge as normal mode, just at higher
  stakes). Joker drops carry a `joker` flag so the verify endpoint applies
  the same transformation and the chain stays verifiable.

The goal is to let you answer questions like: *"If I open this case 500 times,
what's my expected return? How often do I hit a Covert? Is this case +EV over
time?"*

---

## What it is not

- ❌ Not a real gambling site — no real money, no deposits, no withdrawals.
- ❌ Not affiliated with keydrop — it's an independent strategy-testing tool.
- ❌ No keydrop account integration, no Steam login, no trade offers.
- ❌ No case-open animation in the stats batch (pure stats only, chosen for
  speed when running hundreds of opens). A realistic single-case open mode
  with animation exists in Phase 2.
- The `/sim` page is organized in two modes: **Stats batch** (multi-case
  batch runs with pure stats) and **Realistic** (single-case open with a reel
  animation). The provably-fair chain (server seed, client seed, nonce) is
  shared across both modes.
- ❌ Not for public deployment or monetization.

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Storage | `localStorage` only (balance, history, overrides) |
| Scraping | `fetch` with retries; manual JSON paste fallback |
| Provably fair | pure-TS SHA-256 + HMAC_SHA256 (`lib/sha256.ts`) — same byte output as `node:crypto`, runs in both server and browser |
| Deploy | Local `next dev` for MVP |

No database. No backend beyond Next.js API routes. Single-user by design.

---

## Quick start

```bash
# from the project root
pnpm install
pnpm dev
# open http://localhost:3000
```

Other scripts:

```bash
pnpm typecheck     # tsc --noEmit
pnpm test:engine   # tsx lib/caseEngine.test.ts  (10k opens + mass-preservation gate)
pnpm mirror:images # downloads remote images → public/img/ for local/offline use
```

### Image assets

The cache stores **remote** image URLs (`https://cdnkd.com/...`). Running
`pnpm mirror:images` downloads them to `public/img/` and rewrites the cache so
`imageUrl` points to the local copy (`/img/cases/<slug>.png`,
`/img/skins/<id>.png`). The original remote URL is preserved in
`imageUrlRemote`.

- The mirror is **idempotent** — re-running only downloads missing assets,
  leaving already-local files untouched.
- After adding new cases via paste, run `pnpm mirror:images` and commit the
  updated `public/img/` files so other contributors get images offline.
- To replace an image, swap the file under `public/img/` and re-commit.
  The mirror won't overwrite it.
- `/img-status` shows a table of all mirrored assets, their local paths,
  remote origins, and image previews. It also has a "Run mirror now" button
  that mirrors server-side via `/api/scrape`.

Then visit:

- `/` — case grid (browse, search, multi-select)
- `/cases/[slug]` — single case detail (skins, per-wear odds, values)
- `/sim` — batch simulator (select cases + counts, run, see stats)
- `/balance` — fake balance management + open history

---

## How the simulator works

1. **Case data** is scraped from keydrop and cached in
   `data/cases-cache.json`. If the scraper is blocked by Cloudflare, you
   can paste the JSON you copied from DevTools into the manual fallback UI.
2. **Provably-fair session** generates a `serverSeed` (64 hex chars). Its
   SHA256 hash (`serverSeedHash`) is displayed **before** you run the batch.
   You can set your own `clientSeed`; the `nonce` starts at the last value
   stored in localStorage (default 0).
3. **Batch run** opens each selected case the requested number of times
   deterministically:
   ```
   ticket   = HMAC_SHA256(serverSeed, `${clientSeed}:${nonce}`)
   float    = parseInt(ticket.slice(0,8),16) / 0xFFFFFFFF   // weighted skin pick
   wearFloat = parseInt(ticket.slice(8,16),16) / 0xFFFFFFFF // weighted wear pick
   ```
4. **Stats** are computed in-browser: total cost, total value, net P/L, ROI,
   drop frequency tables, best/worst drop, rare-drop rate (Covert + Knife +
   Gloves combined).
5. **Verify** any drop with the "Verify" button → it calls
   `/api/provably-fair` with `{serverSeed, clientSeed, nonce, caseSlug,
   joker}` and recomputes the ticket, confirming the displayed drop matches.

---

## Joker mode

A toggle on `/sim` (both Stats batch and Realistic). When ON:

- Every skin in the case gets **equal probability** (`1/N`, where `N` is the
  item count). Per-wear ratios within a skin are preserved, only the skin
  selection is flattened to uniform.
- The open **price is raised so the case keeps its original house edge**:
  `jokerPrice = jokerEV / (1 - origEdge)`, where `origEdge =
  1 - origEV / origPrice`. In other words the joker price is the uniform EV
  scaled by the original `price/EV` ratio. Because rare items
  (Covert/Knife/Gloves) normally have tiny odds, the uniform EV — and thus
  the joker price — is dramatically higher than the listed case price, but
  the % edge the house keeps is the same as in normal mode (keydrop does
  the same — joker mode is not a 0-edge game).
- Each drop is stamped with `joker: true` and stored in history / inventory
  with that flag. The verify endpoint applies the same `jokerCase()`
  transformation before recomputing the ticket, so the provably-fair chain
  stays verifiable end-to-end.
- The toggle persists in `localStorage` (`keydrop-sim:jokerMode`) and is
  shared across both sim modes.

---

## Data model (summary)

See `TODO.md` for the full TypeScript interfaces. Key shapes:

- `CaseDefinition` — slug, name, price (in keydrop coins), items.
- `SkinItem` — id, name, rarity, `statTrak` flag, `wears[]`, `totalProbability`.
  **StatTrak variants are separate `SkinItem` entries**, not a flag on the
  base item — this matches how keydrop lists them.
- `WearTier` — `{ wear: 'FN'|'MW'|'FT'|'WW'|'BS', probability, value }`.
  Probability is `P(this skin | case) * P(this wear | skin)`, pre-normalized.
  Values are kept **as keydrop coins** — no USD conversion, no normalization.
- `Drop` — one opening result (skin, wear, value, nonce, ticket, hashes).
- `BatchResult` / `MultiBatchResult` — aggregates over N opens.

> **Wear granularity:** MVP uses wear tier only (no continuous float number).
  Each skin has per-wear probability and per-wear value, exactly as keydrop
  surfaces them. Continuous float (0–1) simulation is post-MVP.

---

## Project layout

```
keydrop-sim/
├── app/                  # Next.js App Router pages + API routes
│   ├── page.tsx                  # case grid
│   ├── cases/[slug]/page.tsx      # case detail
│   ├── sim/page.tsx               # batch simulator
│   ├── balance/page.tsx           # balance + history
│   ├── img-status/page.tsx        # image mirror status
│   └── api/
│       ├── scrape/route.ts        # refresh cache, manage cases, mirror images
│       └── provably-fair/route.ts # verify a drop
├── lib/
│   ├── scraper/           # keydrop fetch + normalize + cache
│   ├── provablyFair.ts    # HMAC_SHA256 + SHA256
│   ├── caseEngine.ts      # openOnce / runBatch / runMultiBatch
│   ├── mirror.ts          # image download + local-mirror logic
│   ├── storage.ts         # typed localStorage wrappers
│   └── types.ts           # shared TypeScript types
├── components/            # React UI components
├── scripts/
│   └── mirror-images.ts   # CLI wrapper for `lib/mirror.ts`
├── public/
│   └── img/               # mirrored case + skin images (committed)
└── data/
    └── cases-cache.json   # last successful scrape (committed)
```

---

## Status & roadmap

The MVP scope and step-by-step build checklist live in [`TODO.md`](./TODO.md).
Track progress there — checkboxes are updated as each step is verified.

**MVP included (all done):**
- Case grid (browse, search, multi-select)
- Single case detail page (skins, per-wear odds + values)
- Batch simulator with pure-stats output
- Real provably-fair (hash, client seed, nonce, verify endpoint)
- Fake balance + history in localStorage
- Scraper with file cache + manual JSON paste fallback
- Per-wear odds and per-wear values
- StatTrak as separate skin entries

**Post-MVP / Phase 2 (in progress, see TODO.md):**
- Realistic case-open animation (single-case + auto-open N in a row)
- Balance set-to-value + presets + withdraw
- Image assets mirrored locally into `public/img/` for offline/editable use
- `/sim` reorganized into Stats batch & Realistic modes
- Frontend polish pass (shared components, a11y, responsive audit)
- Case battles, upgrader, skin changer, swipe mode
- Steam login, real money, withdrawals
- Continuous float (0–1) simulation
- Image optimization / CDN
- Public deploy / Vercel polish

---

## Rules to follow from now on

These rules apply to every change made to this project. Follow them strictly
so the MVP stays consistent, faithful to keydrop, and verifiable.

### 1. Stay within MVP scope
If a request is clearly post-MVP (animation, battles, real money, Steam
login, withdrawals, etc.), flag it and ask before implementing. Don't sneak
features into the MVP.

### 2. Be faithful to keydrop
- Case prices, skin lists, per-wear odds, per-wear values, and StatTrak
  variants must come **directly from keydrop's data**. Don't invent numbers.
- Keep values in **keydrop coins** — no USD conversion, no normalization.
- StatTrak variants are **separate `SkinItem` entries**, never a flag added
  to an existing skin (matches keydrop's listing).
- Wear granularity is **wear tier only** in the MVP — no continuous float
  number. If you discover keydrop exposes the float, note it in `TODO.md`
  but do not add it without confirmation.

### 3. Provably-fair must always be verifiable
- `serverSeedHash` (SHA256 of `serverSeed`) MUST be shown **before** the run.
- `serverSeed` MUST be revealed **after** the run.
- Every drop MUST carry `{nonce, clientSeed, ticket, serverSeedHash}`.
- The verify endpoint MUST recompute the ticket from
  `{serverSeed, clientSeed, nonce, caseSlug}` and match the displayed drop.
- Never short-circuit the algorithm. Never store `serverSeed` in a place the
  user can read before the run (no leaked hashes in network logs while
  dev-ing — clean that up before committing).

### 4. Determinism
- Given `(serverSeed, clientSeed, nonce, caseSlug)`, the result MUST always be
  the same. No `Math.random` anywhere in `caseEngine.ts` or `provablyFair.ts`.
- `Math.random` is allowed only for: generating `serverSeed`, generating a
  default `clientSeed`, and initial balance setup.

### 5. Storage
- Only `localStorage` for persistence (balance, history, overrides, last
  `nonce`). No database, no cookies, no server sessions.
- Cache files (`data/cases-cache.json`) are server-side only and committed to
  the repo for reproducibility — don't add them to `.gitignore` unless the
  user asks.

### 6. Scraping
- Always go through `lib/scraper/` — never scatter `fetch` calls for keydrop
  inside components or API routes.
- If Cloudflare blocks the scraper, the UI MUST switch to the manual JSON
  paste fallback automatically. The sim must never break because of a
  blocked scrape — it falls back to cached data, and the user can refresh
  via paste.
- Log probability drift > 0.01 per case as a warning in the normalizer.

### 7. Types first
- `lib/types.ts` is the source of truth for all data shapes.
- Don't use `any` or untyped `Record<string, unknown>` in the sim path. The
  scraper's raw response is the only place loose typing is acceptable, and
  only inside `normalize.ts`.

### 8. Build order discipline
- Follow the 8-step build order in `TODO.md`. Don't jump ahead.
- Tick the checkbox in `TODO.md` only after a step is **verified working**
  (e.g. step 4 requires the CLI test to pass and match keydrop odds within
  tolerance — don't tick it on intent alone).

### 9. Verification gates
Step 4 (case engine) and step 5 (sim UI) must pass these checks before
ticking the box:
- 10k opens on one case: drop rates match keydrop's published odds within
  ±0.0001 absolute.
- EV (sum of `probability * value` across all skins/wears) matches the
  empirical mean within ±0.1%.
- Re-running with the same `(serverSeed, clientSeed, nonce)` produces
  **identical** drops.

### 10. No comments unless asked
Code style follows the repo convention. Do not add comments to code unless
explicitly requested. Doc-blocks on exported functions are fine and
encouraged.

### 11. No premature commits
Don't `git commit`, `git push`, or open PRs unless explicitly asked. The user
will review changes and commit themselves.

### 12. Legal reminder
This is a personal strategy-testing tool. Don't deploy it publicly, don't
share the scraped keydrop JSON beyond personal use, don't monetize. If
keydrop sends a takedown or changes their ToS in a way that breaks this tool,
stop and ask before working around it.

---

## Conventions

- **Naming:** `camelCase` for variables/functions, `PascalCase` for types and
  React components, `kebab-case` for file names of route segments.
- **Tailwind:** utility classes inline in JSX; no CSS modules unless
  absolutely necessary. Dark theme like keydrop.
- **Error handling:** descriptive typed errors. Scraper errors return a
  structured `{ ok: false, reason }` so the UI can branch on it.
- **Tests:** a CLI test (`tsx lib/caseEngine.test.ts`) is enough for MVP —
  no full test framework unless the user asks.

---

## License

Personal / unlicensed. Not for redistribution. The simulator is independent
from keydrop and uses no keydrop assets beyond scraped factual case data
(prices, odds, values) for personal strategy testing.