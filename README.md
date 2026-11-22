# Token Radar — radar-5

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Hachiko66/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Hachiko66/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar for [make.fun token-radar-01](https://make.fun/bounty/token-radar-01).

It reads the sealed DefiLlama snapshot (758 protocols, as of 2026-11-14),
scores every pre-token protocol, and hands in a static dashboard that
ranks them by implied value and shows how to farm each one.

## Model — radar-5

```
implied = round(
  tvl_usd x 0.25
  x (1 + clamp(change_7d, -50, 180) / 100 x 0.85)
  x (0.5 + min(age_days, 1095) / 1095 x 0.5)
  x categoryMult x chainMult
)
```

- `categoryMult`: Dexs and Lending 1.15, Yield, Derivatives and Options
  1.10, RWA and Stablecoins 1.08, Prediction, Insurance, Launchpad and
  Privacy 1.05, Risk Curators and Capital Allocators 1.05, staking
  derivatives 0.90, Bridge 0.85.
- `chainMult`: 1 + 0.03 per extra chain, up to 8 extra chains.
- Age is days since first listing; unknown age uses 180 days.
- No protocol name is special-cased. The same function scores every row.

radar-5 returns to the radar-3 settings that scored 0.802. The radar-4
experiment — growth at full weight capped at +150%, maturity on a
square-root curve, vault curators at 1.10 — scored 0.700 on the same
7-3-2 record. Ablating it against the snapshot shows the square-root
curve did the damage: it alone moved 72 of 226 rows by five ranks or
more and lifted total implied 13%, re-sorting the board's middle by age
shape instead of by launch value. So radar-5 changes no signal. Its
one new thing is an explanation: the detail view now builds each
implied value step by step, base to final number, so the board's
arithmetic can be checked row by row instead of taken on trust.

The board covers all 40 watchlist protocols and adds 186 pre-token
protocols below the $50M floor, by TVL — 226 rows in total. Live-token
protocols are set aside with their market caps, never mixed into the ranking.

## Dashboard

`dashboard/` is a static page with no network. It has:

- Search, category filter, and chain filter
- Sortable board by implied value, TVL, 7-day growth, age, and name
- A detail view for every protocol with its model breakdown, a step-by-step
  build of its implied value, a one-sentence reason for its rank, its
  implied value per $1 of TVL, and its farm plan
- A live-token view set aside from the pre-token ranking
- A Top 3 spotlight and a full model explanation

## Farm plans

Every row carries 7 steps, each with a cost and a time, derived from
the protocol's own category, chains, TVL, age, and seven-day growth —
never from a list of names. Steps cover wallet setup, the qualifying
position sized to the protocol's TVL and growth, weekly actions
specific to the category, the hold period, the risk to watch, safe
claiming, and logging with a stop rule. Gas is priced for the
protocol's own main chain.

## Run it

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../token-radar-01-kit/input/snapshot.json
```

`main.ts` writes `board.json`, `data.js`, `dashboard/`, `screenshots/`,
and `dossier.json` to the output directory.

## Screenshots

- `1-board.png` — the board
- `2-detail.png` — a protocol detail view
- `3-filtered.png` — a filtered view (Risk Curators)
