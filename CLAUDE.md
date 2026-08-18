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
- [ ] Create Firebase project (Blaze), enable Auth/Firestore/Functions/Hosting
- [ ] `firebase init` in this folder; set up `firestore.rules` (admin-only default-deny)
- [ ] Set up admin user + custom claim script
- [ ] GitHub repo + Actions workflow: build `apps/web` → deploy to GitHub Pages
- [ ] Vite + React app skeleton, Firebase SDK wired up, login gate

### Phase 1 — Parser port + regression suite
- [ ] Port `catan2.process_game` + `filter_lines` to `packages/parser` (TS)
- [ ] Copy `gamelogs/*.txt` into `fixtures/`
- [ ] Snapshot/assertion tests: parser output vs known-good numbers per fixture
- [ ] Cross-check aggregate results against `rankings.json` (ground truth from v1)
- [ ] Raw/derived split + `parserVersion` + `warnings[]` + sanity-check invariants

### Phase 2 — Ingestion v2
- [ ] `submitGame` Cloud Function (shared-secret auth, parses, writes `games/{id}`)
- [ ] Content-hash based dedupe (replaces the 95%-line-overlap heuristic)
- [ ] Tampermonkey userscript (port of `bookmark_game_entry.js`) with `@updateURL` on GitHub
- [ ] Discord webhook from the function (recap text + link to the game's page; images optional)
- [ ] One-time migration script: import all 345 existing gamelogs into Firestore

### Phase 3 — Admin web UI
- [ ] Games list (admin-only), per-game detail page with charts (Recharts/Chart.js ports of
      each existing `plot_*`)
- [ ] Combined/career stats page (rankings pie+heatmap equivalent, dev card usage, etc.)
- [ ] Player alias management UI
- [ ] Reprocess action (bump parserVersion, re-derive stats for stale/flagged games)

### Phase 4 — Sharing
- [ ] `shares` collection + `resolveShare` callable function
- [ ] Public `/shared/:shareId` route (read-only view, no auth)
- [ ] "Share this game" / "share this combined view" actions in admin UI

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

## 6. Open questions (resurface before/at the relevant phase)

- Single shared-secret for `submitGame` acceptable long-term, or move to real Auth once more
  than one person might submit games?
- Any appetite for capturing board layout (tile resources/numbers, robber position over time)
  to unlock "luck" stats? Would mean extending the userscript's scrape, not just the parser.
- Keep generating Discord images (needs a render step somewhere — function-side matplotlib or
  headless chart rendering) or switch Discord posts to text recap + link only?

## 7. Progress log

- 2026-08-18: Repo scaffolded (`catan-live/`), v1 reviewed end-to-end, architecture + sharing
  model decided, this doc written. No code written yet.
