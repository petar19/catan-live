# Fixtures

- `gamelogs/*.txt` — the 345 real historical game logs, copied verbatim from
  `../catan/gamelogs/` (v1's data directory). These are v1's raw captured lines
  (pre-filter — `filterLines()`/`filter_lines()` is applied on read, not on save).
- `rankings.json` — v1's aggregate rankings output, copied verbatim from
  `../catan/rankings.json`, kept for reference/spot-checking.
- `ground_truth/*.json` — one file per fixture in `gamelogs/`, **but only for the
  254 games where v1's `catan2.py process_game()` actually completed without
  crashing**. Generated once by `generate_ground_truth.py`, which imports v1's
  real `catan2.py` and dumps its output as JSON. This is the parity baseline
  `packages/parser/test/fixtures.test.ts` checks the TS port against.
- The other 91 games have no `ground_truth` entry because **v1 crashes on them**
  (a `KeyError` — see the `LONGEST_PASSED_RE`/`LARGEST_PASSED_RE` comments in
  `packages/parser/src/processGame.ts` for why: colonist.io changed the
  "longest road passed" wording several times and v1's regex only ever matched
  the original wording). The TS port fixes this, so for these 91 the test suite
  only asserts "parses without throwing and lands on a real player as winner" —
  there's no v1 output to compare against.

## Regenerating ground_truth

You shouldn't need to — it's a frozen snapshot of v1's actual behavior, used to
prove the TS port is a faithful translation. Only regenerate it if you
deliberately want to re-baseline against v1 itself (not against v2's own
output — that would defeat the point).

Requires a checkout of v1 (`../catan` relative to this repo) with its Python
deps installed (`beautifulsoup4`, `matplotlib`, `numpy`):

```bash
python3 fixtures/generate_ground_truth.py
```
