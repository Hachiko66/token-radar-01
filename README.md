# Token Radar — radar-2

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Hachiko66/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Hachiko66/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar for [make.fun token-radar-01](https://make.fun/bounty/token-radar-01).

It reads the sealed DefiLlama snapshot (758 protocols, as of 2026-11-14),
scores every pre-token protocol, and hands in a static dashboard that
ranks them by implied value and shows how to farm each one.

## Model — radar-2

```
implied = round(
  tvl_usd x 0.25
  x (1 + clamp(change_7d, -60, 120) / 100 x 0.6)
  x (0.6 + min(age_days, 1095) / 1095 x 0.4)
  x categoryMult x chainMult
)
```

- `categoryMult`: Dexs and Lending 1.15, Yield and Derivatives 1.10,
  RWA 1.08, Risk Curators 1.05, staking derivatives 0.90, Bridge 0.85.
- `chainMult`: 1 + 0.025 per extra chain, up to 8 extra chains.
- Age is days since first listing; unknown age uses 365 days.
- No protocol name is special-cased. The same function scores every row.

The board covers all 40 watchlist protocols and adds 186 pre-token
protocols below the $50M floor, by TVL — 226 rows in total. Live-token
protocols are set aside with their market caps, never mixed into the ranking.

## Dashboard

`dashboard/` is a static page with no network. It has:

- Search, category filter, and chain filter
- Sortable board by implied value, TVL, 7-day growth, age, and name
- A detail view for every protocol with its model breakdown and farm plan
- A live-token view set aside from the pre-token ranking
- A Top 3 spotlight and a full model explanation

## Farm plans

Every row carries 6 steps, each with a cost and a time, derived from
the protocol's own category, chains, TVL, and age — never from a list
of names. Steps cover wallet setup, the qualifying position, weekly
actions specific to the category, the hold period, safe claiming, and
logging with a stop rule.

## Run it

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

`main.ts` writes `board.json`, `data.js`, `dashboard/`, `screenshots/`,
and `dossier.json` to the output directory.

## Screenshots

- `1-board.png` — the board
- `2-detail.png` — a protocol detail view
- `3-filtered.png` — a filtered view (Risk Curators)
