# Catan Live userscript

Replaces v1's `bookmark_game_entry.js` bookmarklet. Install once in Tampermonkey;
it self-updates from this repo's raw GitHub URL (`@updateURL`/`@downloadURL` in
the metadata block), so future fixes don't require reinstalling.

## Install

Open the raw file URL in a browser with Tampermonkey installed and it'll offer
to install it: https://raw.githubusercontent.com/petar19/catan-live/main/userscript/catan-live.user.js
(requires the repo to actually be pushed to that path — see the open hosting
question in CLAUDE.md if it isn't yet). Tampermonkey then self-updates from the
same URL, so future fixes to this file don't require reinstalling.

## Use

On a colonist.io game page (mid-game or after it ends), click the "Submit to
Catan Live" button in the bottom-right corner. The first time, it'll prompt for
the submit secret (ask the admin) and remember it from then on via Tampermonkey's
own storage — it's never hardcoded in this file, since the file itself is public,
self-updating code. It scrolls the game log to force every message to render,
extracts it to plain text lines client-side (no more round-tripping HTML through
a server for parsing — see CLAUDE.md §2.4.6), and POSTs to the `submitGame`
function, then offers to open the game's page. Submitting the same game twice is
harmless — the function content-hashes the lines and no-ops on an exact repeat.
