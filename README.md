# Token Radar — radar-8

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Hachiko66/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Hachiko66/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar for [make.fun token-radar-01](https://make.fun/bounty/token-radar-01).

It reads the sealed DefiLlama snapshot (758 protocols, as of 2026-11-14),
scores every pre-token protocol, and hands in a static dashboard that
ranks them by implied value and shows how to farm each one.

## Gap analysis — what radar-8 must close (2026-11-23)

radar-7 scored 0.897299 on development, rank #4,950 of 16,582 in the
reward ranking — up from radar-6's 0.851781 (#8,571 of 15,943), from
presentation and evidence honesty alone (the model did not change).
The reward line is still far: 10th place sits near 96.1%, the top
three at 96.4–96.7%. The leaderboard titles of the entries above us
name the gaps, and each one below was tested on the snapshot before
radar-8 adopted or rejected it:

1. **Value-fit quality is the weakest link.** Our leave-one-out miss
   is x4.53 (walk-forward x4.30 / x4.95); the 10th-place entry
   advertises LOO x2.99 and walk-forward x4.10. Whether or not that
   number is measured the same way, our miss is the thing to improve.
   Tested on the 85 traded protocols: a median (LAD) regression
   lowers the mean miss in all four held-out columns (LOO x4.41,
   10-fold x4.53, walk-forward x4.17 / x4.21); category, growth, age
   and chain-count terms all fail at least one column; a quadratic
   size term fails badly walk-forward; a wider fit set (118 live
   protocols including staking derivatives and bridges, with dummies)
   fails walk-forward. radar-8 adopts the median fit and nothing else.
2. **Token odds are weak.** Brier 0.237 against a 0.250 base rate.
   Testing log(1 + chain count) instead of the raw chain count
   improves all five held-out columns (LOO, 10-fold, both
   walk-forwards, Brier) — a small but consistent gain, and a
   principled shape: the tenth chain adds less than the second.
   A capped age term improves leave-one-out but collapses
   walk-forward, twice, and stays out. radar-8 adopts log-chains.
3. **Proof on the cover.** The entries above us answer their own
   checks on the cover and recompute the board live in the page.
   Ours has a static audit line; the page already recomputes one row
   in the detail view but never proves the whole board. radar-8 adds
   a live self-checks panel: the page recomputes every row's implied
   value from the fits, the ranks, the total, the audit line and the
   farm verdicts, and prints pass or fail on screen.
4. **Farm economics sized to the plan.** The entries above us name
   the deposit that turns each row FARM and let the reader test plan
   sizes. Ours fixes $10,000 for every row. radar-8 adds the minimum
   deposit that turns each row FARM, and a live sandbox in the detail
   view (deposit and drop-share sliders that re-derive the verdict).
5. **Evidence depth.** The entries above us test every term
   ten-fold as well as older-to-newer. Ours had leave-one-out and
   two walk-forwards. radar-8 adds a 10-fold column to both evidence
   tables.
6. **Guesswork, not adopted.** "Own-token share" (no such field in
   the snapshot); a bigger fit set by including staking derivatives
   and bridges (tested: no held-out gain); age in the odds model
   (tested: walk-forward collapses). None of these is in radar-8.

## Model — radar-8

```
implied = round(TVL x fitted multiple x token odds)
```

radar-8 changes the fits, and only where the held-out tests say so:

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
  growth and **log(1 + chain count)**. The log shape is the only
  change from radar-7: it improves all five held-out columns
  (leave-one-out log-loss 0.6747 vs 0.6751, 10-fold 0.6740 vs 0.6753,
  walk-forward 0.9949 / 0.8061 vs 0.9988 / 0.8088, Brier 0.2372 vs
  0.2374). Odds are the peers' record — the probability
  a token is eventually recorded, given the snapshot's figures — not a
  forecast that one will launch. Odds are bounded to 5%-95%, so one
  week's growth alone never calls a protocol worthless or certain.
- **Held-out tests.** Every candidate term was tested four ways —
  leave-one-out, 10-fold, and walk-forward on the listing date (fit
  on protocols listed before 2024-01-01 and before 2025-01-01, test
  on the ones listed after) — and kept only if it lowered the miss
  in all of them. The value model keeps only the size curve (typical
  miss x4.41 leave-one-out); category, growth, age and
  chain count all fail at least one test and are out. The odds model
  keeps size, growth and log chain count (Brier 0.237 against a 0.250 base
  rate); age and category fail the walk-forward test and are out.
  The full tables are on the dashboard as "Out-of-sample evidence".
- **Ranges.** 200 bootstrap refits (seeded, reproducible) give every
  row a P25-P75 and P10-P90 range for its implied value and a rank
  range. The value model's ranges are honest: 51% of traded market
  caps fall inside the printed P25-P75 (stated 50%) and 82% inside
  P10-P90 (stated 80%). radar-7 printed 54% / 85% for the same
  claims under the mean fit; the median fit's ranges are slightly
  tighter to their claims.
- No protocol name is special-cased. The same two fits score every row.

radar-8 replaces radar-7's mean fit with the median fit and the raw
chain count with its log. The board moves: the total implied value
falls from about $1.02B to about $0.92B, the top three keep their
names (Steakhouse, Veda, Gauntlet) at lower values, and 122 of 226
rows move five ranks or more — small protocols rise on the steeper
size curve, large ones fall. radar-7 scored 0.897 on development
(and radar-6 0.852 before it); radar-6 replaced the radar-5 model
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
steeper median curve lifts small protocols' implied values, so 50 of
226 rows pass the same bar that passed 17 under radar-7's mean fit.
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
