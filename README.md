# Token Radar — radar-9

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Hachiko66/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Hachiko66/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar for [make.fun token-radar-01](https://make.fun/bounty/token-radar-01).

It reads the sealed DefiLlama snapshot (758 protocols, as of 2026-11-14),
scores every pre-token protocol, and hands in a static dashboard that
ranks them by implied value and shows how to farm each one.

## Gap analysis — what radar-9 found (2026-11-23)

radar-7 scored 0.897299 on development, rank #4,950 of 16,582 in the
reward ranking — up from radar-6's 0.851781 (#8,571 of 15,943), from
presentation and evidence honesty alone (the model did not change).
radar-8 was built and verified but never scored: the account's
submission cap was spent when it was ready. The reward line is still
far: 10th place sits near 96.1%, the top three at 96.4–96.7%. radar-9
attacked the measured bottleneck — value-fit quality — structurally,
and tested one new data source. The findings:

1. **The value model is maxed out on this snapshot.** The median
   (LAD) size curve's leave-one-out miss is x4.41 (10-fold x4.53,
   walk-forward x4.17 / x4.21). Every structural candidate tested
   against it fails at least one held-out column: a size slope per
   category (LOO x4.35, walk-forward x5.08 / x4.83), size x chains
   (x4.48), size x age (LOO x4.31, walk-forward 2024 x13.2), size x
   growth (x4.56), a quadratic size curve (x4.52), a hinge and a
   spline in log TVL, median per TVL bin, Theil-Sen, Huber, other
   quantiles, least-trimmed-squares, recency-weighted fits, and wider
   fit sets (118 and 128 traded protocols — the "128 traded tokens"
   in competitors' titles grades worse on the 85 in every column).
   The error concentrates where the board lives: the board's TVL
   quartiles are $9.7M / $19.1M / $40.1M, and the miss there is
   x4.1–x4.9, against x2.8 above $200M. radar-9 keeps the size
   curve and nothing else.
2. **Competitors' advertised numbers do not reproduce.** The best
   in-sample miss on the 85 traded protocols is x4.28 and the best
   winsorised leave-one-out x4.15, against a claimed LOO x2.99 and
   an "OOS x2.01" elsewhere. Only a high-TVL subset (TVL >= $200M,
   n=8) gets near the claim (x2.84). Whatever those numbers measure,
   it is not the four-way held-out miss on the board's population.
3. **Fees do not price the multiple, but they do predict the token.**
   From DefiLlama's daily fees history, the 30-day fees ending
   2026-11-14 correlate only 0.106 with log(mcap / TVL) (n=44
   traded protocols with fees), and a two-tier size + log(fees /
   TVL) fit is worse in three of four columns (LOO x4.51). But a
   binary flag — whether the protocol recorded any fees at all in
   those 30 days — improves the token odds in all four held-out
   columns (leave-one-out log-loss 0.6699 vs 0.6747, 10-fold 0.6710
   vs 0.6740 and better on two further seeds, walk-forward 0.9792 /
   0.7974 vs 0.9949 / 0.8061) and the Brier (0.2342 vs 0.2372).
   The amount does not help — a continuous log(fees / TVL) term
   fails the 2025 walk-forward — only the fact of charging fees
   does. radar-9 adopts the flag. The flag covers 325 of the 532
   peers and 117 of the 226 board rows.
4. **The board moves on the flag alone.** 184 of 226 rows move five
   ranks or more against radar-8, the top three keep their names at
   slightly higher values (Steakhouse, Veda, Gauntlet), the total
   falls from $920.4M to $913.4M, and the farm count falls from 50
   to 47 on the same bar — the flag lowers the odds of the rows
   that record no fees.

## Model — radar-9

```
implied = round(TVL x fitted multiple x token odds)
```

radar-9 changes one thing, and only where the held-out tests say so:

- **Fitted multiple.** On the 85 traded protocols whose token
  plausibly prices off TVL (live token, market cap and TVL both on
  record, not an exchange, not a versioned pool, and not a staking
  derivative or a bridge), `ln(mcap / TVL)` is fitted on
  `ln(TVL / $100M)` by a **median regression** (least absolute
  deviations, solved by iteratively reweighted least squares on the
  log-ratio winsorised at the 2nd and 98th percentiles). The miss the
  evidence tables grade is the mean absolute log error, so the fit
  that minimises that error — the conditional median, not the
  conditional mean — is the honest estimator: it lowers the miss in
  all four held-out columns (leave-one-out 1.485 vs 1.510 for OLS,
  10-fold 1.510 vs 1.533, walk-forward 2024 1.427 vs 1.458,
  walk-forward 2025 1.438 vs 1.599). The fit is
  `multiple = exp(-2.065 - 0.674 x ln(TVL / $100M))`: a base multiple
  of 0.127 at $100M of TVL, falling faster with size than radar-7's
  mean fit (0.153, slope -0.475). The median miss is worse than the
  mean fit's (x3.79 vs x3.29 leave-one-out) — the median fit trades
  typical accuracy for fewer large errors, and the tables print both
  so the trade is visible.
- **Token odds.** A logistic regression on 532 peers with a recorded
  listing date (262 with a token, 270 without), on log TVL, seven-day
  growth, **log(1 + chain count)** and a **fees flag** — 1 when the
  protocol recorded any fees in the 30 days ending 2026-11-14
  (DefiLlama daily fees history, vendored in `lib/fees.ts`: 327 of
  the 543 checked slugs recorded fees, 202 have no fees adapter).
  The flag is radar-9's only change: it improves all four held-out
  columns (leave-one-out log-loss 0.6699 vs 0.6747, 10-fold 0.6710
  vs 0.6740 and better on two further seeds, walk-forward 0.9792 /
  0.7974 vs 0.9949 / 0.8061) and the Brier (0.2342 vs 0.2372).
  Its coefficient is +0.49, about 1.6x the odds of a token for a
  protocol that charges fees. The amount does not help — a
  continuous log(fees / TVL) term fails the 2025 walk-forward —
  only the fact of charging fees does. Odds are the peers' record —
  the probability a token is eventually recorded, given the
  snapshot's figures — not a forecast that one will launch. Odds
  are bounded to 5%-95%, so one week's growth alone never calls a
  protocol worthless or certain.
- **Held-out tests.** Every candidate term was tested four ways —
  leave-one-out, 10-fold, and walk-forward on the listing date (fit
  on protocols listed before 2024-01-01 and before 2025-01-01, test
  on the ones listed after) — and kept only if it lowered the miss
  in all of them. The value model keeps only the size curve (typical
  miss x4.41 leave-one-out); category, growth, age and
  chain count all fail at least one test and are out, and radar-9's
  structural attack — interactions, curves, other estimators, wider
  fit sets, fees in the value — adds nothing. The odds model
  keeps size, growth, log chain count and the fees flag (Brier 0.234
  against a 0.250 base rate); age and category fail the walk-forward
  test and are out.
  The full tables are on the dashboard as "Out-of-sample evidence".
- **Ranges.** 200 bootstrap refits (seeded, reproducible) give every
  row a P25-P75 and P10-P90 range for its implied value and a rank
  range. The value model's ranges are honest: 51% of traded market
  caps fall inside the printed P25-P75 (stated 50%) and 82% inside
  P10-P90 (stated 80%). radar-7 printed 54% / 85% for the same
  claims under the mean fit; the median fit's ranges are slightly
  tighter to their claims.
- No protocol name is special-cased. The same two fits score every row.

radar-9 keeps radar-8's median size curve and log chain count and adds
the fees flag to the odds. The board moves on the flag alone: the
total implied value falls from $920.4M to $913.4M, the top three keep
their names at slightly higher values (Steakhouse $25.5M, Veda $22.4M,
Gauntlet $19.3M), and 184 of 226 rows move five ranks or more.
radar-7 scored 0.897 on development (and radar-6 0.852 before it);
radar-8 was never scored. radar-6 replaced the radar-5 model
(TVL x 0.25 x growth x maturity x category x chains), which scored
0.802 with no fitted term and no odds.

The board covers all 40 watchlist protocols and adds 186 pre-token
protocols below the $50M floor, by TVL — 226 rows in total. Live-token
protocols are set aside with their market caps, never mixed into the ranking.

## Dashboard

`dashboard/` is a static page with no network. It has:

- Search, category filter, chain filter, and a watchlist-only toggle
- Sortable board by implied value, TVL, 7-day growth, age, and name,
  with token odds and a farm verdict on every row
- A live self-checks panel: the page recomputes every row's implied
  value from the fits, the ranks, the total, the audit line and the
  farm verdicts, and prints pass or fail for each check on screen
- A detail view for every protocol with its fitted multiple, its token
  odds, its value if a token launches, its P25-P75 and P10-P90 ranges,
  its rank range, a step-by-step build of its implied value, a
  one-sentence reason for its rank (with each factor set against the
  board median), its implied value per $1 of TVL, and its costed farm
  verdict and farm plan — plus the minimum deposit that turns the row
  FARM and a live sandbox (deposit and drop-share sliders that
  re-derive the verdict for that row)
- An evidence headline at the top of the board — the out-of-sample
  miss, the Brier score, the calibration, the terms that survived
  all four held-out tests — plus the full 758-protocol accounting and a
  machine-checkable audit line (row count, total implied value,
  snapshot seal, 40 of 40 watchlist ranked)
- An "Out-of-sample evidence" panel with the held-out tables (now
  with a 10-fold column) and the calibration, and an integrity strip
  that accounts for all 758 protocols of the snapshot
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
The rule is unchanged from radar-7, but the count moves: the
fees flag lowers the odds — and the implied values — of the rows
that record no fees, so 47 of 226 rows pass the same bar that
passed 50 under radar-8 and 17 under radar-7's mean fit.
The bar did not move; the model did. Every row also names the
minimum deposit that turns it FARM (solving both bars at once), or
says no deposit size clears the bar, so a SKIP row is a deposit
question, not a dead end. The break-even drop share and the exit
trigger (TVL down 17.5% in one week) are shown per row.

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
