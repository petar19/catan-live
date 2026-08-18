# Catan Live userscript

Replaces v1's `bookmark_game_entry.js` bookmarklet. Install once in Tampermonkey;
it self-updates from this repo's raw GitHub URL (`@updateURL`/`@downloadURL` in
the metadata block), so future fixes don't require reinstalling.

## Setup

1. Deploy the `submitGame` Cloud Function (blocked until the Firebase project
   exists — see CLAUDE.md task list).
2. Set a secret: `firebase functions:secrets:set SUBMIT_GAME_SECRET`.
3. Edit `CONFIG` at the top of `catan-live.user.js`:
   - `SUBMIT_URL` → the deployed function's URL.
   - `SUBMIT_SECRET` → the same value you set in step 2.
4. Commit + push. Tampermonkey picks up updates automatically after that;
   for the very first install, open the raw file URL in a browser with
   Tampermonkey installed and it'll offer to install it.

## Use

On a colonist.io game page (mid-game or after it ends), click the "Submit to
Catan Live" button in the bottom-right corner. It scrolls the game log to force
every message to render, extracts it to plain text lines client-side (no more
round-tripping HTML through a server for parsing — see CLAUDE.md §2.4.6), and
POSTs to the `submitGame` function. Submitting the same game twice is harmless —
the function content-hashes the lines and no-ops on an exact repeat.
