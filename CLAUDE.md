# Catan Stats v2 — Live Web App

## 0. Context

v1 lives in `../catan` (a Flask server + Tampermonkey-adjacent bookmarklet + matplotlib
scripts, no live web presence, everything run by hand on Petar's machine, results pushed
to Discord as PNGs). This folder is v2: a small live web app so games are viewable/shareable
without Petar re-running scripts, plus room for new stats.

Used exclusively with a friend group for now. Not public, but the owner is open to that later.

## 1. How v1 actually works (so v2 doesn't lose behavior)

1. **Capture**: `bookmark_game_entry.js` bookmarklet runs on colonist.io. It finds the game
   log's virtual-scroller div, scrolls it to the top then to the bottom to force-render every
   message into the DOM, collects+dedupes the message elements by `data-index`, and POSTs the
   resulting `innerHTML` to `http://localhost:5009/analizeGame`.
2. **Server** (`game_entry_server.py`, Flask): parses that HTML with BeautifulSoup
   (`feedMessage-*` divs → plain text lines, resolving `<img alt="...">` icons to resource
   names), then hands the lines to `game_entry.py`.
3. **`game_entry.py`**: assigns the next game number from `info.txt`, checks the new lines
   aren't a near-duplicate of the last stored game (95% line-overlap heuristic — this exists
   because the bookmarklet has been re-run on the same game by accident), writes the raw lines
   to `gamelogs/N.txt`, calls into `catan2.do()`.
4. **`catan2.py`**: `filter_lines` runs a hand-maintained list of string replacements first
   (strips UI cruft like "Guest"/"icon_helmet", maps `You`/`Seale5074`/etc. to stable player
   names — colonist has renamed accounts and reworded the UI several times over the life of
   this project). Then `process_game` walks the lines once, dispatching to regex handlers
   keyed by substring (`"rolled"`, `"got"`, `"stole"`, `"VP"`, `"gave bank"`, ...) that mutate a
   pile of dicts (dice histogram, per-player resources, points over time, trades, steals, dev
   card count). Then a dozen `plot_*` functions render matplotlib PNGs to `results/N/` and
   `newest_result/`.
5. **Rankings**: `calculate_rankings.py` maintains `rankings.json` (finish position by starting
   seat, running totals) across all games and regenerates a pie chart + heatmap.
6. **Discord**: `upload_to_discord` posts the fixed set of PNGs from `newest_result/` to a
   webhook.
7. **345 games** currently sit in `gamelogs/*.txt` as plain filtered text — this is the closest
   thing to a fixture/regression suite the project has, and v2 should exploit that.
8. `count_cards.py` / `bookmark_count_cards.js` — separate card-counting feature, **out of
   scope for v2 per Petar**, not covered by this doc.

### Why parsing has broken before

- `process_game`'s handlers are substring-triggered regexes over flattened text
  (`"^(?P<player>[\w#]+)\s+rolled.*\s+dice_(?P<dice1>\d)...$"` etc.). Any colonist wording
  change (e.g. `"placed a settlement"` → `"placed a Settlement settlement"`, seen between
  `gamelogs/1.txt` and `gamelogs/344.txt`) silently no-ops (`if m is None: return turn`)
  instead of failing loudly, so breakage shows up as *wrong graphs*, not an error.
- The `replacements` list in `catan2.py` is an ever-growing, order-sensitive patch list mixing
  three unrelated concerns: stripping UI chrome, capitalization normalization, and player
  identity aliasing (account renames). It's fragile to extend and easy to get wrong.
- The bookmarklet's DOM selectors (`feedMessage-O8TLknGe`, `virtualScroller-lSkdkGJi`) are
  hashed CSS-module class names that colonist regenerates on redeploy — they *will* go stale
  again regardless of what we build server-side.
- There is no historical raw/derived split: `gamelogs/*.txt` is already the *filtered* output,
  not the true raw capture, so when a regex bug is found there's no way to know if
  pre-existing games were also mis-parsed without knowing exactly what was thrown away.

## 2. Decisions for v2

### 2.1 Stack

- **Frontend**: static SPA (Vite + React), deployed to **GitHub Pages** via a GitHub Actions
  workflow on push to `main`.
- **Backend**: **Firebase** — Auth, Firestore, Cloud Functions (2nd gen), Blaze plan (already
  enabled, which is also what allows Functions to make outbound HTTP calls, e.g. to Discord).
- **Charts**: move off server-rendered matplotlib PNGs for the web UI — render with a JS
  charting lib (Recharts or Chart.js) client-side, from structured JSON in Firestore. Keeps the
  page interactive (hover/filter/zoom) instead of static images. Matplotlib is kept
  *server-side only*, and only for the images still pushed to Discord.
- **Ingestion**: a **Tampermonkey userscript**, not a browser extension. Hosted as a raw file in
  this repo (public) with `@updateURL`/`@downloadURL` metadata pointing at the raw GitHub URL,
  so Tampermonkey auto-updates it — no extension packaging/store review needed, and it's the
  same "paste a script in, run it on the page" UX the bookmarklet already has, just persistent
  and self-updating.

### 2.2 Why Cloud Functions instead of "just write from the browser to Firestore"

The userscript runs on colonist.io, an origin you don't control, and it needs to submit data
unauthenticated-ish (no interactive login flow makes sense in a userscript). So: the script
POSTs the scraped log to an HTTPS Cloud Function (`submitGame`) carrying a shared secret in a
header (stored in the userscript itself — fine for a single-operator MVP, since the only person
running the script is the admin). The function verifies the secret, does the parsing (ported
Python parser, see §2.4), and writes to Firestore with the Admin SDK — so Firestore rules for
the raw/derived game collections can stay **fully closed to public reads/writes**, admin-only.
Upgrade path if this ever opens up to other people submitting games: swap the shared secret for
Firebase Auth (anonymous or real accounts) and check `request.auth` in the function instead.

### 2.3 Sharing — answering "copy data or share from the same tables?"

**Don't copy.** Keep `games/*` and any aggregate/derived collections fully private (admin-only
Firestore rules), and resolve share links through a callable Cloud Function instead of exposing
Firestore reads to the public:

- A `shares/{shareId}` doc (random ID = the token in the URL) stores what the link points to:
  `{ type: "game", gameId }` or `{ type: "combined", gameIds: [...] }` or
  `{ type: "combined", filter: {...} }`, plus `createdAt`/optional `expiresAt`/`revoked`.
- The public page at `/shared/:shareId` calls a callable function `resolveShare(shareId)`. The
  function looks up `shares/{shareId}` (Admin SDK — bypasses rules), fetches whatever it points
  to, computes anything that needs computing (e.g. a combined-stats aggregate), and returns
  read-only JSON. No Firestore security rule ever has to grant public access to real game data.
- Revoking a share = delete (or flag `revoked: true` on) the `shares/{shareId}` doc. Nothing
  else to clean up, because nothing was copied.
- Guessing a link is infeasible the same way any capability-URL scheme is (random ID, doc `get`
  by exact ID — Firestore rules can allow `get` on `shares/{shareId}` without allowing `list`,
  so the collection can't be enumerated even if you did open direct reads to it later).
- This same mechanism covers the "combined stats across multiple games, shareable by me only
  via a link" requirement — it's just a `shares` doc with `type: "combined"` and no difference
  in plumbing from sharing one game.
- Trade-off worth knowing: this is a *live* resolve, so a shared link always reflects current
  data (e.g. if you fix a mis-parsed game later, the old share link picks that up automatically)
  at the cost of one function invocation per view. If that ever becomes a problem, add a cache
  layer later (e.g. write a denormalized snapshot on share-creation) — not needed at this scale.

### 2.4 Parsing robustness — concrete plan, not just "be careful"

1. **Raw is sacred.** Store the scraped raw text lines for every game, untouched, forever
   (Firestore `games/{id}.rawLines`, or Cloud Storage if it ever gets large — plain text of a
   Catan game log won't). Never mutate raw in place.
2. **Derived is regenerable.** `games/{id}.parsed` (the stats blob the UI reads) is *always*
   produced by re-running the parser over `rawLines`. Tag it with `games/{id}.parserVersion`.
   When the parser changes, bump the version and have an admin action ("reprocess") that
   re-derives `parsed` for any game whose `parserVersion` is stale — this is the fix for "small
   log-format changes broke parsing" turning into permanently-wrong historical graphs.
3. **345 existing gamelogs become a regression test suite for free.** Port the parser, run it
   against every file in `../catan/gamelogs/`, and snapshot-test the output (or at minimum
   diff key numbers — winner, final points, dice totals — against `rankings.json` as ground
   truth). Any future regex change runs against all 345 fixtures before it ships. This is the
   single highest-leverage thing to do about the recurring breakage, and it's essentially free
   because the fixtures already exist.
4. **Fail loud, not silent.** Replace `if m is None: return turn` (silently skipping a line) with
   collecting unmatched/unexpected lines per game and surfacing them (e.g. `games/{id}.warnings`)
   instead of swallowing them. A game with unparsed lines should be visibly flagged in the admin
   UI, not just quietly under-counted.
5. **Sanity-check derived output.** Cheap invariants catch a lot: points totals move only via
   known events, resource-in vs resource-out roughly balances, all 4 players got exactly 2
   starting settlements, winner has 10+ points, etc. Fail the parse (or flag it) rather than
   publish a plausible-looking but wrong chart.
6. **Normalize the identity/wording mess out of the regex layer.** Split the current
   `replacements` list into two concerns and stop growing it ad hoc:
   - *Player identity aliasing* (account renames like `Seale5074` → `Kent#3816`) → a small
     admin-editable mapping table (Firestore `playerAliases`), not a code change + redeploy.
   - *Text/UI normalization* (icon alt-text, capitalization, stray "Settler"/"icon_*" cruft) →
     keep doing this in the HTML→text extraction step, but drive it off the image `alt`
     attributes and DOM structure (as it partly already does) rather than post-hoc string
     `.replace()`, since that's less sensitive to wording and more sensitive to markup, which
     changes less often.
7. **DOM selectors will still go stale** — hashed class names (`feedMessage-O8TLknGe`) are
   controlled by colonist's build, not us. Prefer partial/attribute selectors where possible
   (e.g. match on `data-index` presence, or `[class*="feedMessage"]`) over exact hashed classes,
   and keep the userscript's scrape step small and isolated so a break there is a one-file fix.

### 2.5 Admin model

Single admin (Petar) for now. Firebase Auth (Google sign-in, restricted to
`petar.lazic.fer@gmail.com` via a custom claim `admin: true` set once via the Admin SDK).
Firestore rules: admin has full read/write on everything; nobody else gets any direct Firestore
access — all public access goes through the `resolveShare` function. Admin UI can edit player
aliases, delete/reprocess a game, and trigger a re-parse.

## 3. Data model (Firestore, sketch)

```
games/{gameId}
  rawLines: string[]           # immutable, source of truth
  parserVersion: number
  parsedAt: timestamp
  parsed: {                    # everything catan2.process_game() computes today
    players, playerPoints, winner, dice, diceUntilTurn,
    resourcesPerPlayer, resourcesThroughTurns, trades, steals,
    playerCardCountThroughTurns, ...
  }
  warnings: string[]           # unmatched lines / sanity-check failures
  createdAt, source ("tampermonkey" | "import")

players/{playerId}             # canonical identity
  displayName, aliases: string[]

rankings                       # single doc or recomputed on read; mirrors rankings.json
  by starting seat -> finish position counts, avg points, seen_games

shares/{shareId}
  type: "game" | "combined"
  gameId | gameIds | filter
  createdAt, revoked
```

## 4. Repo layout (this folder)

```
catan-live/
  apps/web/            # Vite + React SPA -> GitHub Pages
  functions/            # Firebase Cloud Functions (submitGame, resolveShare, reprocess, ...)
  packages/parser/     # ported catan2 parsing logic, framework-agnostic, unit-testable
  userscript/           # Tampermonkey script, hosted raw + auto-update metadata
  fixtures/             # symlink/copy of representative gamelogs for parser tests
  firebase.json, firestore.rules, .firebaserc
  CLAUDE.md             # this file
```

Language choice for `functions/` + `packages/parser/`: **TypeScript** (Node). The existing
parser is Python, but Cloud Functions + a browser-based admin UI + a userscript all naturally
live in the JS/TS ecosystem, and porting ~400 lines of regex/dict logic once is cheaper than
running a second runtime forever. Parser gets ported once, then validated against the 345
fixtures as the acceptance test for the port itself.

## 5. Backlog (phased)

### Phase 0 — Scaffolding
- [x] GitHub repo (`petar19/catan-live`, private for now — see open decisions)
- [x] npm workspaces monorepo: `apps/web`, `functions`, `packages/parser`, `userscript`, `fixtures`
- [x] `firestore.rules` (admin-only default-deny) + `firestore.indexes.json` + `firebase.json`
- [x] Vite + React + TS app skeleton, Firebase Auth (Google sign-in) login gate, `/shared/:shareId` route
- [x] GitHub Actions workflow to build + deploy `apps/web` to GitHub Pages
- [x] Create Firebase project — `catan-live`, created 2026-09-14 after a GCP project-creation
      quota increase (free, requested via Google's support form, approved same day). `.firebaserc`
      points at it.
- [x] Admin games list + game detail views wired to Firestore (`apps/web/src/pages/GamesList.tsx`,
      `GameDetail.tsx`) — live queries, gated by `AdminGate`, rules enforce the same boundary
      server-side. Still placeholder rendering (raw JSON) — real charts are still Phase 3.
- [x] `setAdminClaim` bootstrap function written (`functions/src/setAdminClaim.ts`) — one-time
      HTTP endpoint to grant the `admin` custom claim by email, since there's no local
      service-account credential to run a plain Admin SDK script in this environment. Not called
      yet (needs a deploy first).
- [x] Enable Cloud Firestore API + create the `(default)` Firestore database (`nam5`) — took two
      rounds of enabling via console (first attempt didn't stick/propagate for 5+ minutes, second
      one worked within seconds — if this happens again, just re-enable and retry rather than
      assuming it's a long propagation delay).
- [x] Deploy `firestore.rules` (admin-only default-deny) — live now.
- [x] Enable Google Sign-In as an Auth provider — done by Petar via console (no CLI/API path
      found via firebase-tools for this).
- [ ] Upgrade `catan-live` to the Blaze plan (billing account) — needs Petar in the console
      (payment setup isn't something to do on his behalf). Required before Cloud Functions
      (`submitGame`, `resolveShare`, `setAdminClaim`) can deploy. **Decision pending** — Petar
      asked what Cloud Functions are actually for before committing to this; answered (ingestion
      endpoint + share-link resolver, see §2.2/§2.3), no decision yet.

### Phase 1 — Parser port + regression suite
- [x] Port `catan2.process_game` + `filter_lines` to `packages/parser` (TS)
- [x] Copy `gamelogs/*.txt` + `rankings.json` into `fixtures/`
- [x] Regression suite (`packages/parser/test/fixtures.test.ts`), validated against v1's *actual*
      output (ran real `catan2.py` over all 345 fixtures via `fixtures/generate_ground_truth.py`,
      not just eyeballed `rankings.json`) — 348/348 tests passing
- [x] Raw/derived split + `parserVersion` + `warnings[]` (per-line try/catch instead of v1's
      unguarded crashes) + basic sanity checks in the crash-survival test group
- [ ] Full sanity-check invariants as a first-class parser feature (currently only asserted in
      tests, not surfaced as `games/{id}.warnings`-style output beyond parse-error warnings)

**Found while validating:** v1 actually crashes on **91 of 345 games (26%)** — colonist.io
changed the "longest road passed" / "largest army passed" wording at least 4 different ways
over time, v1's regex only ever matched the original wording, and the fallback for an unmatched
line was a `KeyError` crash (the literal word "longest"/"largest" gets treated as a player name).
Fixed in the TS port (`LONGEST_PASSED_RE`/`LARGEST_PASSED_RE` in `processGame.ts` now tolerate
all 4 observed variants) — this is the concrete instance of the fragility problem described in
§2.4, not a hypothetical.

### Phase 2 — Ingestion v2
- [x] `submitGame` Cloud Function (shared-secret auth, parses, content-hash dedupes, writes
      `games/{id}`, optional Discord recap) — written, **not deployed** (blocked on Phase 0)
- [x] Content-hash based dedupe (replaces the 95%-line-overlap heuristic)
- [x] Tampermonkey userscript (`userscript/catan-live.user.js`) — port of
      `bookmark_game_entry.js` plus a client-side port of `processMessages` (HTML→text
      extraction now happens against the live DOM in the browser instead of round-tripping
      serialized HTML to a server for BeautifulSoup). Selectors use `[class*="..."]` instead of
      exact hashed classnames where possible. **Not wired up**: needs a real function URL/secret,
      and needs a public host for `@updateURL` — see open decisions.
- [x] Discord webhook posting from the function (text recap + link; no images yet — open
      question in §6 still stands)
- [ ] One-time migration script: import all 345 existing gamelogs into Firestore

### Phase 2.5 — New, not in the original plan
- Dropped `special.longest`/`special.largest` tracking from the parser output: it existed in
  v1 but was never actually returned from `process_game()` or used anywhere, and was buggy for
  the "passed from X to Y" lines anyway (same root cause as the crash above). Not worth porting
  a dead, broken field forward — simplification, not a missing feature.

### Phase 3 — Admin web UI
- [x] Games list (table: date/winner/players/warnings), per-game detail page with charts
      (Recharts, not matplotlib — see `apps/web/src/components/charts/` and `GameCharts.tsx`).
      Revised once after Petar's first pass of feedback (2026-09-15):
  - **Points/resources over turns**: line charts, tooltip sorted highest-to-lowest
    (`itemSorter`) instead of series order.
  - **Resources per player**: 4 small-multiple bar charts (one per player) instead of one
    grouped chart. Colors are fixed resource-identity colors matching v1's matplotlib palette
    exactly (gold/silver/lawngreen/firebrick/seagreen for grain/ore/wool/brick/lumber — see
    `RESOURCE_COLORS` in `lib/palette.ts`), not the abstract categorical palette used
    elsewhere — deliberate exception, continuity with the old tool mattered more here.
  - **Dice rolls per player**: same small-multiples treatment — a single grouped chart was
    hard to read once a player had zero rolls on some totals.
  - **Dice distribution & timing**: went through four designs before landing. (1) A custom
    SVG heatmap (`DiceHeatmap.tsx`, one row per dice total, opacity-ramped per row's own
    peak) — every row was a fixed height regardless of count, so total frequency wasn't
    readable at all. (2) A stacked bar (height = real count) with ~20 segments colored by
    *time position* (light=early, dark=late) — redundant with stack position, which already
    showed timing bottom-to-top. (3) Same shape but colored by *density* (concentration
    relative to that total's own peak) instead — a real second signal, but Petar still
    couldn't read it clearly with ~20 thin continuous-gradient segments. (4) **What actually
    landed** (2026-09-16): back to v1's original `plot_dice_resource_stats` design almost
    exactly — exactly 4 segments (quarters of the game, by roll count), each a fixed, named,
    distinct color (`QUARTER_COLORS` in `lib/palette.ts`, a darkened yellow→gold→orange→red
    matching v1's `colors = ["yellow", "gold", "orange", "red"]`), stacked bottom (quarter 1)
    to top (quarter 4), with a real 4-item legend. Bar height = total roll count; quarter
    position/color = when within the game. Lesson from the two failed continuous-gradient
    attempts: a handful of discrete, named, legended colors reads far more clearly here than
    any continuous ramp, no matter how the ramp's meaning was tuned — the data has a natural
    small number of categories (quarters), so a categorical encoding fits it better than a
    sequential one, matching the dataviz skill's "pick the form" step better than either
    gradient attempt did. Needed a new parser field either way, `rollSequence: number[]`
    (dice totals in roll order) — required reprocessing all 345 already-migrated games (see
    `reprocessGames` function below).
  - **Trades**: v1-style per-player diverging bar charts (4 small-multiples, one per player,
    5 resource columns, positive = received / negative = given, each split into a bank-trade
    layer and a player-trade layer), colored by resource identity with bank segments a
    darker shade — see the recoloring note further down. Built via a shared, reusable
    `DivergingBarChart` + `ChartLegend`.
    **Real bug found and fixed (2026-09-16), in two rounds.** Round 1: `DivergingBarChart`
    gave all 4 layers (2 positive, 2 negative) the *same* Recharts `stackId` with the
    default stack offset, which accumulates in declaration order regardless of sign — it
    does not auto-detect "these two are negative, stack from zero downward independently."
    Concretely, for Kent#3816/grain in game 345: `p2pReceived=1` (declared first) stacked
    0→1, then `p2bGiven=-3` (declared later) stacked from *1* down to *-2* instead of from 0
    down to -3 — the "given to bank" bar rendered starting above zero and visually
    overpainted the "received" segment, making 1 received-from-players look like it was
    bank-colored. For lumber the same game, `p2pReceived=3` then `p2bGiven=-3` landed
    exactly back on 0, fully hiding the given-to-bank bar. Verified against real parsed data
    (not just inspection) before concluding it was a rendering bug, not a parser bug. First
    fix attempt gave positive/negative layers separate stackIds — that solved the
    mispositioning but introduced a *new* bug: Recharts treats different stackIds as
    separate bar *groups* and lays them out side-by-side, so some players' columns
    rendered as two staggered half-width bars instead of one. Round 2 (correct fix): kept
    one shared `stackId` for all 4 layers, but set `stackOffset="sign"` on the `<BarChart>`
    — this is Recharts' own built-in offset function (`offsetSign` in its `ChartUtils.js`)
    that independently accumulates positive and negative values per category regardless of
    declaration order, which is exactly "diverging stacked bar" and doesn't split the bars
    into separate groups since they still share one stackId.
  - **Steals**: no longer a diverging chart — back to v1's original `plot_steal` design:
    4 small multiples (one per player), 3 *simple, non-diverging* columns (one per opponent),
    height = how many times that player stole from that opponent. Bars colored by the
    *opponent's own seat color* (same palette as the points-over-turns lines) rather than a
    generic "direction" color — meaningful this time (color tells you which opponent) rather
    than an arbitrary reuse that happened to collide with a player's identity color
    elsewhere (see the gainLoss fix above — that collision bug is what originally prompted
    dropping this design, twice).
  - **Trade/steal network diagrams (experimental)**: built alongside (not replacing)
    `TradesChart`/`StealsChart` for comparison, per Petar's request — bank at center, players
    at N/S/E/W, edges as ribbons (segmented by resource for trades, by direction for steals)
    with thickness ∝ volume, opposite-side pairs drawn as stubs running off the canvas edge
    instead of a line through the bank (`lib/networkDiagram.ts`, `NetworkDiagram.tsx`,
    `TradeNetworkDiagram.tsx`, `StealNetworkDiagram.tsx`). Required a real parser addition —
    `tradesBetweenPlayers` (pairwise giver→receiver resource flow) — since the existing
    `trades` field only ever tracked each player's aggregate totals, not who traded with whom;
    faking pairwise edges from aggregate data would've been fabricating relationships that may
    not have happened, so this got a proper `PARSER_VERSION` bump (3) and a
    `reprocessGames` backfill run instead. First-pass simplifications, worth knowing before
    judging it: no directional arrowheads (hover tooltip gives the direction/exact breakdown
    instead); an edge shows *combined* both-directions volume, not two separate lines per
    direction; node-to-direction mapping (which player sits left/right/top/bottom) is just
    `playerOrder` index, not real seating. Trade tooltip polished (2026-09-16): total trade
    count now shown top-right in the header, and the confusing "→" arrows dropped from the
    breakdown table's column headers (plain names read fine). **Steal network diagram
    hidden (2026-09-16)** — Petar didn't like it as shipped. Only the JSX render call was
    removed from `GameCharts.tsx`; `StealNetworkDiagram.tsx` and `buildStealDiagram` in
    `lib/networkDiagram.ts` still exist if it's worth revisiting later. The trade network
    diagram stays — Petar liked that one.
  - **Resources per player, by dice roll** (new, 2026-09-16): the one v1 plot
    (`plot_resources_per_players_per_dices`) that was never ported in the first pass — 4
    small multiples, 11 columns (dice totals 2-12), each stacked by resource color, showing
    which specific rolls actually paid off for that player. `ResourcesPerPlayerPerDiceChart.tsx`,
    reading the already-computed `resourcesPerPlayerPerDice` parser field (no parser change
    needed, that field already existed and just had no chart yet).
  - Still not ported from v1: the per-quarter dice breakdown (superseded by the heatmap) and
    the card-count charts v1 itself had commented out/disabled — the underlying data has
    known-quirky computation (see processGame.ts's handle_count port) and v1 never shipped
    these either.
- [x] Combined/career stats page (`/stats`): career stats table (games/wins/win rate/avg
      finish/avg points), sorted by games played, plus the seat-based
      starting-position-vs-finish table (v1's rankings.json / pie+heatmap equivalent, as a
      table rather than a pie — clearer for this data per the dataviz form heuristic).
      Computed client-side from all games on each load; no precomputed/cached aggregate yet
      (fine at 345 games, revisit if that ever gets slow). Originally had a "win rate by
      player" bar chart above the table too — Petar had it removed (2026-09-16): with a lot
      of one-off/guest players who only appear in a single game, a win-rate ranking puts a
      100%-in-1-game player above someone with a real sample size, which is misleading as a
      leaderboard. The table itself still shows win rate as a column, just not sorted or
      charted by it — sorted by games played instead, so the top of the list is who has the
      most reliable numbers.
- [ ] Player alias management UI — not built. Aliasing still lives entirely in the parser's
      hardcoded `replacements` list (packages/parser/src/filterLines.ts), not admin-editable
      yet, per the original fragility-reduction plan in §2.4.6.
- [x] Reprocess action — built as a function, not an admin UI button yet:
      `functions/src/reprocessGames.ts` (secret-gated HTTP endpoint) re-derives `parsed` from
      each game's stored `rawLines` and bumps `parserVersion`, skipping games already at the
      current version. Used for real to backfill `rollSequence` onto all 345 games after
      adding it to the parser. An admin-UI "reprocess" button would just call this same
      endpoint — worth adding once there's a second reason to.

### Phase 4 — Sharing
- [x] `shares` collection + `resolveShare` callable function (returns `parsed` + `playedAt`
      only, never `rawLines`)
- [x] Public `/shared/:shareId` route — renders the same `GameCharts` component the admin
      view uses, no auth, no nav chrome
- [x] "Create share link" button on the game detail page (`ShareButton.tsx`) — writes
      `shares/{randomUUID}`, admin-only per firestore.rules
- [ ] "Share this combined view" (multi-game share) — `resolveShare` already supports
      `type: "combined"` server-side, but there's no admin UI action to create one yet (only
      single-game sharing has a button)
- [ ] **Known gap**: deep links like `/shared/:shareId` will 404 on GitHub Pages without the
      standard SPA-fallback trick (a `404.html` that redirects to `index.html` preserving the
      path) — not implemented yet since GH Pages vs. Firebase Hosting is still an open
      decision (§6). Needed before sharing actually works once deployed, whichever hosting
      is chosen (Firebase Hosting handles this via `firebase.json` rewrites instead).

### Phase 5 — New stats/features (ideas to refine with Petar, not committed yet)
- [ ] Win rate / avg finish by player (career, not just per-seat like today's rankings.json)
- [ ] Head-to-head records
- [ ] Trade network (who trades with whom, net resource flow)
- [ ] Building timing (avg turn of first city/settlement/road milestones)
- [ ] Longest/current streaks
- [ ] Dev card usage over time (port of the currently-standalone `analyzer.py`)
- [ ] Note: "expected vs actual resource luck" needs board layout (tile/number placement),
      which nothing currently captures — would need a new capture step if wanted

### Phase 6 — Later / explicitly deferred
- [ ] Opening this up beyond the friend group (multi-user auth, per-user data scoping)
- [ ] Card counter feature (`count_cards.py`) — out of scope until Petar asks for it

## 6. Open questions

### Blocking (need Petar before Phase 0 can finish)

- **Blaze plan**: `catan-live` is still on Spark. Needs Petar to upgrade via console (billing
  account attachment — not something to do on his behalf) before any Cloud Function can deploy.
  Asked what Functions are actually for before deciding; answered inline (§2.2 ingestion,
  §2.3 sharing) — no decision yet.
- **Repo visibility vs. GitHub Pages**: the repo was created **private** by default (reversible,
  matches "not against open in the future maybe" from the original ask). But GitHub Pages on a
  private repo requires GitHub Pro/Team/Enterprise — Petar's account shows no paid plan, so
  GitHub Pages won't actually serve `apps/web` while the repo stays private. Options: (a) make
  `catan-live` public, (b) use Firebase Hosting instead of GitHub Pages (works fine on a private
  repo, deploys via `firebase deploy` rather than GitHub's Pages feature — but that's a scope
  change from what was asked for), (c) upgrade to GitHub Pro. Needs a decision.
- **Userscript auto-update host**: `@updateURL`/`@downloadURL` in `catan-live.user.js` currently
  point at this repo's raw GitHub URL, which won't work unauthenticated while the repo is
  private (same root cause as above — likely resolved together). The alternative discussed is
  publishing just that one file as a public Gist and keeping the rest of the repo private, but
  publishing anything publicly needs an explicit yes first, not something to do unprompted.

### Resolved

- **GCP project quota** — fixed 2026-09-14 via Google's free quota-increase support form
  (approved same day). `catan-live` project created; Firestore database provisioned and rules
  deployed; Google Sign-In enabled.

### Non-blocking (resurface at the relevant phase)

- Single shared-secret for `submitGame` acceptable long-term, or move to real Auth once more
  than one person might submit games?
- Any appetite for capturing board layout (tile resources/numbers, robber position over time)
  to unlock "luck" stats? Would mean extending the userscript's scrape, not just the parser.
- Keep generating Discord images (needs a render step somewhere — function-side matplotlib or
  headless chart rendering) or switch Discord posts to text recap + link only? Current
  `submitGame` sends text-only recaps; images not implemented.
- **Trade/steal network diagram** — Petar sketched an idea for trades: bank in the center,
  players at N/S/E/W, arrows between every pair (including opposite-side players via
  off-screen wraparound) with thickness proportional to trade volume, color-coded by
  resource. Built the diverging stacked-bar version first (2026-09-15, concretely specified,
  low-risk), then built the network diagram too (2026-09-16) alongside it for comparison —
  see the Phase 3 entry below for what shipped and what's simplified in this first pass.

## 7. Progress log

- 2026-08-18: Repo scaffolded (`catan-live/`), v1 reviewed end-to-end, architecture + sharing
  model decided, this doc written. No code written yet.
- 2026-08-18 (later): Firebase project creation blocked on GCP quota (see §6). Built and pushed,
  independent of that blocker: full parser port to TypeScript with a 348-test regression suite
  validated against v1's actual output on all 345 real game logs (found and fixed a real bug
  affecting 26% of historical games along the way — see Phase 1 notes above); Firestore rules;
  `submitGame`/`resolveShare` Cloud Functions (written, undeployed); Tampermonkey userscript
  (written, unwired — needs a deployed function URL and a hosting decision); Vite/React web app
  skeleton with Firebase Auth gating and a GitHub Actions Pages-deploy workflow. Three open
  decisions recorded in §6 need Petar before Phase 0 can actually finish.
- 2026-09-14: GCP project quota increase came through (free, same-day). `catan-live` Firebase
  project created; `.firebaserc` points at it. Firestore API enabled, `(default)` database
  created, `firestore.rules` deployed. Google Sign-In enabled as an Auth provider. Added
  `setAdminClaim` bootstrap function and `fixtures/migrate_to_firestore.mjs` (posts all 345
  gamelogs through the deployed `submitGame` function rather than writing to Firestore
  directly). Wired Firestore into the web app: live `GamesList`/`GameDetail` views behind
  `AdminGate` (still placeholder/raw-JSON rendering — real charts are Phase 3). Remaining
  blocker: Blaze plan upgrade, pending Petar's decision (asked what Functions are for; answered,
  no decision yet). Repo-visibility/GitHub-Pages and userscript-hosting decisions also still open.
- 2026-09-14 (later): Blaze approved. Deployed all three functions — hit and fixed two real
  bugs along the way: (1) Firebase's build server packages `functions/` in isolation and can't
  resolve workspace-local npm packages, fixed by bundling `@catan-live/parser` in with esbuild
  instead of depending on it at the npm level; (2) Cloud Functions v2 now defaults every
  function to private/authenticated-only invocation, so all three needed explicit
  `invoker: "public"` (correct here — each has its own real gate: shared secret for
  submitGame, unguessable share token for resolveShare). Replaced the custom-claim admin
  bootstrap with an `admins/{email}` Firestore collection instead (Petar's suggestion, matches
  a pattern he already uses on another project) — simpler, no privileged bootstrap function
  needed at all, first admin just created by hand via the Firebase Console. Migrated all 345
  gamelogs into Firestore for real (hit and fixed a genuine Firestore constraint along the
  way: `diceUntilTurn` was `number[][]`, which Firestore rejects — arrays can't nest directly
  inside arrays — changed to an array of `{diceTotal: count}` maps). Backfilled `playedAt` on
  every migrated game from its original gamelog file's mtime (the actual play date), separate
  from `createdAt` (ingestion time). Built out the real admin UI: charts (Recharts, palette
  validated via the dataviz skill), games list, game detail, combined/career stats page,
  share-link creation — replacing the raw-JSON placeholders. Full detail in the Phase 3/4
  checklists above, including what was deliberately simplified or skipped from v1's plot set.
- 2026-09-15: First round of chart feedback from Petar, all addressed — see the Phase 3
  checklist above for the full rundown (tooltip sorting, per-player small multiples for
  resources/dice-rolls, the new dice-timing heatmap, diverging bar charts for trades/steals,
  v1-matching resource colors). Added `rollSequence` to the parser and built a real
  `reprocessGames` endpoint to backfill it onto already-migrated games — this is reusable
  infrastructure now, not a one-off. Not yet tested by Petar in a real browser session (only
  build/typecheck/parser-test verified on this end) — next step is his pass.
- 2026-09-16: Built the trade/steal network diagrams Petar asked to compare against the bar
  charts (not replace) — see the Phase 3 entry above for the full design and known
  simplifications. Required adding `tradesBetweenPlayers` to the parser (pairwise trade
  data didn't exist before — verified the new field sums back to the existing aggregate
  totals on a real fixture before trusting it), bumping `PARSER_VERSION` to 3, and
  reprocessing all 345 games again via the now-reusable `reprocessGames` endpoint. Hit a
  stale-Vite-dependency-cache issue after the parser rebuild (`@catan-live/parser` is a
  workspace-linked package; Vite's dev-server dependency pre-bundle didn't notice the
  change) — fixed by clearing `apps/web/node_modules/.vite` and restarting the dev server
  with `--force`. Worth remembering if a future parser change seems to not take effect in
  the browser despite a clean rebuild. Also learned `read_console_messages` accumulates
  history for a tab's whole lifetime, including from before a dev-server restart — a stale
  error from an old tab looks identical to a live one; always check in a fresh tab before
  concluding something's actually broken.
- 2026-09-16 (later): Petar's feedback on the dice-timing heatmap — couldn't tell how many
  times each total rolled, since every row was a fixed height. Replaced it with
  `DiceRollTimingChart.tsx`, a stacked bar chart (height = actual count, internal stacking =
  time-window shading) — see the Phase 3 entry above. No parser/data changes needed this
  time, just a frontend rework of the existing `rollSequence` field.
- 2026-09-16 (even later): Petar caught that the shading in `DiceRollTimingChart` didn't
  actually mean anything — it just recolored by time position, which the stack's bottom-to-
  top order already showed. Fixed by switching the color channel to density (how
  concentrated a total's rolls were in that window, relative to its own peak) instead —
  see the updated Phase 3 entry above. Good reminder: when a chart has redundant encodings
  (two channels saying the same thing), a reader will notice something's off even if they
  can't immediately articulate which channel is the problem — worth double-checking each
  encoding actually carries distinct information before shipping, not just after feedback.
- 2026-09-16 (yet later): Three more fixes from Petar's testing pass:
  - **Steals color bug**: `StealsChart`/`StealNetworkDiagram` colored the two steal
    directions using `seatColors[2]`/`seatColors[3]` — the *same* palette used for player
    identity everywhere else on the site. When a player (often Myrna8511, since that's
    always Petar's own seat) happened to land on that palette slot in a given game, the
    steals chart's direction color would coincidentally match that player's identity color
    elsewhere, reading as if the player were deliberately highlighted. Fixed by adding a
    dedicated `gainLoss` color pair (green/red) to `lib/palette.ts`, semantically tied to
    "gained/lost" rather than borrowed from an unrelated identity dimension — same root-
    cause class of bug as the earlier dice-timing redundant-encoding issue (reusing a
    channel for something it doesn't actually mean).
  - **Network diagram tooltip**: native SVG `<title>` tooltips have a real ~1s hover delay
    and can't show a table — replaced with a custom instant tooltip (mouse-tracked div,
    `.chart-tooltip`/`.tooltip-table` in index.css) in `NetworkDiagram.tsx`. Also added a
    real per-resource, per-direction breakdown (`lib/networkDiagram.ts`'s new `BreakdownRow`
    type: `{label, aValue, aColor, bValue, bColor}`) — Petar wanted to see e.g. "3 ore A->B,
    1 ore B->A" on hover for trades, not just a combined total, which the old single
    `tooltip: string` field on each edge couldn't represent.
  - **Trades chart recoloring**: switched from generic "with players"/"with bank" colors
    (blue/orange) to resource-identity colors — same palette as `ResourcesPerPlayerChart` —
    with bank-trade segments rendered as a darkened shade of the same resource color,
    stacked on the same per-resource column. Required extending `DivergingBarChart` with a
    `colorFor` per-category override (Cell-based, like the dice chart's per-cell coloring)
    since a flat `color` per layer couldn't vary by resource. Added `darkenHex()` to
    `lib/palette.ts` for the shade computation.
- 2026-09-16 (still later): the density-gradient dice-timing chart still didn't land for
  Petar — gave up on continuous-gradient encodings for this chart entirely (two attempts,
  neither read clearly) and went back to v1's original 4-fixed-color-quarters design. See
  the updated Phase 3 entry above. Takeaway worth remembering for future charts: this data
  (roll timing) has a natural small number of categories — quarters of the game — and kept
  fighting every continuous encoding I tried; recognizing "this should just be a categorical
  encoding, not a sequential one" earlier would have saved two iterations.
- 2026-09-16 (latest): Petar liked the network diagram overall and gave three more fixes:
  tooltip header now shows the total trade count top-right, and dropped the confusing "→"
  arrows from the breakdown table's column headers (plain player names read fine on their
  own). Bigger finding: the *regular* trades chart had a genuine rendering bug, not a display
  nitpick — traced it to a shared Recharts `stackId` across positive and negative layers
  (see the Phase 3 entry above for the full mechanism and a concrete before/after trace
  against real data). Also rebuilt the steals chart per Petar's request to drop the
  diverging design entirely and go back to v1's simple per-opponent columns. Good process
  note: when a user reports "the numbers don't match what I see," check the actual parsed
  data first (ran the parser locally against the real fixture and printed Kent#3816's trade
  arrays) before touching any rendering code — confirmed the bug was 100% in the chart, not
  the parser, which narrowed the fix immediately instead of guessing.
- 2026-09-16 (later still): dropped the win-rate bar chart from `/stats` per Petar — with
  lots of one-off players who've only played a single game, win rate isn't a fair ranking
  signal (a 1-for-1 guest outranks someone with a real sample size). Career stats table now
  sorts by games played instead; win rate is still a column, just not the sort key or a
  chart anymore.
- 2026-09-16 (final round today): fixed the trades stacking bug *for real* this time (the
  separate-stackId fix from the previous entry turned out to have its own bug — see the
  updated Phase 3 entry above for the full two-round story and the actual correct
  mechanism, `stackOffset="sign"`). Added the one missing v1 chart
  (`ResourcesPerPlayerPerDiceChart`). Hid the steal network diagram per feedback (kept the
  code, just stopped rendering it). Polished the trade network diagram's tooltip further
  (total count, dropped arrows). Lesson for next time a Recharts stacking issue comes up:
  check `stackOffset` first — it's very likely the right lever, and reaching for multiple
  stackIds is very likely the wrong one (that's a *grouping* mechanism, not a stacking-
  direction one).
- 2026-09-17: another Recharts stacking gotcha, this time in `DiceRollTimingChart` — the
  total-count label (attached via `LabelList` to the last quarter's `Bar`) went missing for
  any dice total whose 4th quarter had zero rolls. Cause: a stacked segment with value 0
  doesn't get rendered at all by Recharts, and a `LabelList` attached to that segment has
  nothing to anchor to, so it silently doesn't render either — this only affects some
  columns because it depends on that specific total's quarter-4 count, not something visibly
  wrong with the chart's structure. Fixed with a small trick: stack one extra, always-
  nonzero "anchor" bar (`labelAnchor: 0.0001`, transparent, too small to affect visible bar
  height) on top of the real segments, and attach the `LabelList` to that instead — it always
  has a nonzero value to render against, so the label always shows regardless of which real
  quarters happen to be zero for a given total.
