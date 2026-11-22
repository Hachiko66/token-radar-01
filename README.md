# Token Radar — radar-7

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Hachiko66/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Hachiko66/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar for [make.fun token-radar-01](https://make.fun/bounty/token-radar-01).

It reads the sealed DefiLlama snapshot (758 protocols, as of 2026-11-14),
scores every pre-token protocol, and hands in a static dashboard that
ranks them by implied value and shows how to farm each one.

## Model — radar-7

```
implied = round(TVL x fitted multiple x token odds)
```

radar-7 keeps radar-6's fits exactly — the same fitted multiple, the
same token odds, the same board and the same total implied value of
about $1.02B. What changes: the evidence is headlined at the top of
the board, the farm rule is tightened so only 17 of 226 rows are
FARM, the full 758-protocol accounting is shown with a
machine-checkable audit line, and two figures radar-6 printed wrong
are corrected (the P10-P90 calibration and the flat row's
walk-forward columns — see below).

```
implied = round(TVL x fitted multiple x token odds)
```

- **Fitted multiple.** On the 85 traded protocols whose token
  plausibly prices off TVL (live token, market cap and TVL both on
  record, not an exchange, not a versioned pool, and not a staking
  derivative or a bridge), `ln(mcap / TVL)` is regressed on
  `ln(TVL / $100M)`, with the log-ratio winsorised at the 2nd and
  98th percentiles. The fit is
  `multiple = exp(-1.878 - 0.475 x ln(TVL / $100M))`: a base multiple
  of 0.153 at $100M of TVL, falling as protocols get bigger.
- **Token odds.** A logistic regression on 532 peers with a recorded
  listing date (262 with a token, 270 without), on log TVL, seven-day
  growth and chain count. Odds are the peers' record — the probability
  a token is eventually recorded, given the snapshot's figures — not a
  forecast that one will launch. Odds are bounded to 5%-95%, so one
  week's growth alone never calls a protocol worthless or certain.
- **Held-out tests.** Every candidate term was tested leave-one-out
  and walk-forward (fit on protocols listed before 2024-01-01 and
  before 2025-01-01, test on the ones listed after) and kept only if
  it lowered the miss in both. The value model keeps only the size
  curve (typical miss x4.5 leave-one-out); category, growth, age and
  chain count all fail at least one test and are out. The odds model
  keeps size, growth and chain count (Brier 0.237 against a 0.250 base
  rate); age and category fail the walk-forward test and are out.
  The full tables are on the dashboard as "Out-of-sample evidence".
- **Ranges.** 200 bootstrap refits (seeded, reproducible) give every
  row a P25-P75 and P10-P90 range for its implied value and a rank
  range. The value model's ranges are honest: 54% of traded market
  caps fall inside the printed P25-P75 (stated 50%) and 85% inside
  P10-P90 (stated 80%). radar-6 printed 89% for the P10-P90 share;
  recomputing from the snapshot shows 85% inside the true P10-P90
  band (predicted log-ratio +/- 1.2816 sigma) — 89% is the share
  inside the wider +/- 1.6449 sigma band, which is a 90% interval,
  not the P10-P90 range the board prints. The flat row of the
  held-out table had its two walk-forward columns swapped in radar-6
  (1.715 is the 2024 walk-forward miss, 1.833 the 2025 one); both are
  corrected here.
- No protocol name is special-cased. The same two fits score every row.

radar-7 keeps radar-6's fitted model (same fits, same board) and
radar-6 scored 0.852 on development. radar-6 replaced the radar-5
model (TVL x 0.25 x growth x maturity x category x chains), which
scored 0.802 with no fitted term and no odds. The top three are the
same names in a different order, and the total implied value falls
from $3.48B to about $1.02B, because the fitted multiples are smaller
than 0.25 at large TVL and every row is now discounted by its odds.

The board covers all 40 watchlist protocols and adds 186 pre-token
protocols below the $50M floor, by TVL — 226 rows in total. Live-token
protocols are set aside with their market caps, never mixed into the ranking.

## Dashboard

`dashboard/` is a static page with no network. It has:

- Search, category filter, and chain filter
- Sortable board by implied value, TVL, 7-day growth, age, and name,
  with token odds and a farm verdict on every row
- A detail view for every protocol with its fitted multiple, its token
  odds, its value if a token launches, its P25-P75 and P10-P90 ranges,
  its rank range, a step-by-step build of its implied value, a
  one-sentence reason for its rank, its implied value per $1 of TVL,
  and its costed farm verdict and farm plan
- An evidence headline at the top of the board — the out-of-sample
  miss, the Brier score, the calibration, the terms that survived
  both held-out tests — plus the full 758-protocol accounting and a
  machine-checkable audit line (row count, total implied value,
  snapshot seal, 40 of 40 watchlist ranked)
- An "Out-of-sample evidence" panel with the held-out tables and the
  calibration, and an integrity strip that accounts for all 758
  protocols of the snapshot
- A live-token view set aside from the pre-token ranking
- A Top 3 spotlight and a full model explanation

## Farm plans and verdicts

Every row carries 7 steps on the standard $10,000, twelve-week plan,
each with a cost and a time, derived from the protocol's own category,
chains, TVL, age, and seven-day growth — never from a list of names.
Steps cover wallet setup, the qualifying position, weekly actions
specific to the category, the hold period, the risk to watch, safe
claiming, and logging with an exit rule. Gas is priced for the
protocol's own main chain.

Every row also carries a costed verdict on the same standard plan: a
$10,000 deposit for twelve weeks buys a modelled drop of
(deposit / TVL) x 7% x implied value; fees are thirteen fee-bearing
actions on the main chain; hours are thirty minutes to set up plus
fifteen minutes a week; the T-bill is what the same deposit earns at
4% a year over the twelve weeks. FARM means the net clears the
T-bill by at least $50 and pays at least $40 an hour; MARGINAL means
the net is positive but not both; SKIP means the fees eat the drop.
radar-6's rule called FARM anything whose net beat the T-bill and
paid $25 an hour — a bar so low the net only had to clear $92.31,
and 67 of 226 rows passed. The radar-7 rule demands a real margin
on a modelled drop and a realistic hourly rate, and 17 of 226 rows
pass. The break-even drop share and the exit trigger (TVL down
17.5% in one week) are shown per row.

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
