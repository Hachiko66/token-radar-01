// The token radar's model, radar-7: every value term is fitted on the snapshot and tested held-out twice.
//
//   implied value = TVL x fitted multiple x token odds
//
// radar-7 keeps radar-6's fitted model exactly — the same two fits score
// every row, so the board, the total implied value and the top three are
// unchanged. What changes is what the board proves and how strict it is
// about farming: the validation evidence is headlined at the top of the
// board instead of buried below it, the full 758-protocol accounting is
// shown with a machine-checkable audit line, and the farm rule is
// tightened so only a plan that clears the risk-free return by a real
// margin and pays a realistic hourly rate earns FARM.
//
// The multiple is fitted, not asserted: on the 85 traded protocols whose token
// plausibly prices off TVL (live token, market cap and TVL both on record, not
// an exchange, not a versioned pool, and not a staking derivative or a bridge,
// whose tokens do not price off the TVL they hold), the log of market cap over
// TVL is regressed on log TVL. The fit is an ordinary least squares line with
// the log-ratio winsorised at the 2nd and 98th percentiles, so one 400x
// outlier cannot decide the slope: multiple = exp(-1.878 - 0.475 x ln(TVL /
// $100M)), a base multiple of 0.153 at $100M of TVL, falling as protocols get
// bigger. The token odds come from the peers' record, not a forecast: a
// logistic regression on 532 peers with a recorded listing date (262 with a
// token, 270 without), fitted on log TVL, seven-day growth and chain count,
// then bounded to 5%-95% so one week's growth alone never calls a protocol
// worthless or certain. Odds are P(a token is eventually recorded | the
// snapshot's figures), estimated from one cross-section, and the dashboard
// says so.
//
// Every candidate term was tested held-out twice before it was kept or cut:
// leave-one-out, and walk-forward on the listing date (fit on protocols
// listed before 2024-01-01 and before 2025-01-01, test on the ones listed
// after). A term stays only if it lowers the miss in both tests. The size
// curve is the only term the value model keeps; category, growth, age and
// chain count all fail at least one test and are out. The odds model keeps
// size, growth and chain count; age and category fail the walk-forward test
// and are out. The full tables are in VALUE_EVIDENCE and ODDS_EVIDENCE, and
// the dashboard shows them, so the model's choices can be checked, not
// trusted.
//
// radar-5 is the baseline this replaces: TVL x 0.25 x growth x maturity x
// category x chains, which scored 0.802 with no fitted term and no odds.
// radar-6's top three are the same names in a different order, and the
// total implied value falls from $3.48B to about $1.02B, because the fitted
// multiples are smaller than 0.25 at large TVL and every row is now
// discounted by its odds. No protocol name is ever special-cased: the same
// two fits score every row.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** A protocol's category, grouped so a fit set can say which kinds it covers. */
export type CategoryGroup = 'dex' | 'lend' | 'yield' | 'deriv' | 'rwa' | 'stable' | 'stake' | 'bridge' | 'other';

/** The group a category falls in, by its own words. */
export function categoryGroup(category: string | null): CategoryGroup {
  const c = (category ?? '').toLowerCase();
  if (c.includes('dex')) return 'dex';
  if (c.includes('lend') || c.includes('cdp') || c.includes('uncollateralized') || c.includes('collateral')) return 'lend';
  if (c.includes('yield') || c.includes('leveraged farm') || c.includes('liquidity manager') || c === 'farm') return 'yield';
  if (c.includes('derivative') || c.includes('perpetual') || c.includes('basis trading') || c.includes('options') || c.includes('synthetics')) return 'deriv';
  if (c.includes('rwa')) return 'rwa';
  if (c.includes('stable') || c.includes('anchor btc') || c.includes('decentralized btc') || c.includes('reserve currency')) return 'stable';
  if (c.includes('liquid staking') || c.includes('restak') || c.includes('staking')) return 'stake';
  if (c.includes('bridge')) return 'bridge';
  return 'other';
}

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-7';

/** How many pre-token protocols below the watchlist floor the early radar carries, by TVL. */
export const EARLY_ROWS = 200;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** How many bootstrap refits the rank and value ranges come from. */
export const BOOTSTRAP_REFITS = 200;

/** The seed of the bootstrap's generator: the same snapshot always gives the same ranges. */
export const BOOTSTRAP_SEED = 0x6ada6;

// ------------------------------------------------------------------ linear algebra

/** Solve A x = b by Gaussian elimination with partial pivoting. A is square and non-singular. */
export function solveLinear(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r]![col]!) > Math.abs(M[piv]![col]!)) piv = r;
    if (Math.abs(M[piv]![col]!) < 1e-12) throw new Error('solveLinear: singular matrix');
    const tmp = M[col]!;
    M[col] = M[piv]!;
    M[piv] = tmp;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r]![col]! / M[col]![col]!;
      for (let c = col; c <= n; c++) M[r]![c]! -= f * M[col]![c]!;
    }
  }
  return M.map((row, i) => row[n]! / M[i]![i]!);
}

/** Ordinary least squares: beta minimising ||X beta - y||^2, with a hair of ridge for stability. */
export function ols(X: number[][], y: number[]): number[] {
  const k = X[0]!.length;
  const A: number[][] = Array.from({ length: k }, () => Array<number>(k).fill(0));
  const b: number[] = Array<number>(k).fill(0);
  for (let i = 0; i < X.length; i++) {
    for (let a = 0; a < k; a++) {
      b[a]! += X[i]![a]! * y[i]!;
      for (let c = 0; c < k; c++) A[a]![c]! += X[i]![a]! * X[i]![c]!;
    }
  }
  for (let a = 0; a < k; a++) A[a]![a]! += 1e-9;
  return solveLinear(A, b);
}

/** The dot product of two equal-length vectors. */
export function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!;
  return s;
}

/** The logistic function, with its argument clamped so it never overflows. */
export function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));
}

/** A small deterministic generator (mulberry32): the bootstrap's resampling is reproducible. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------ the fits

/** The fitted value model: ln(mcap / TVL) = intercept + sizeSlope x ln(TVL / $100M). */
export interface ValueFit {
  intercept: number;
  sizeSlope: number;
  n: number;
  sigma: number;
  winsorLo: number;
  winsorHi: number;
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** The traded protocols the multiple is fitted on: a token that plausibly prices off TVL. */
export function tradedFitSet(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter(
    (p) => !isPreToken(p) && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0 && p.category !== 'CEX' && !VERSIONED.test(p.name) && categoryGroup(p.category) !== 'stake' && categoryGroup(p.category) !== 'bridge',
  );
}

/** Fit the value model on a set of traded protocols: OLS on the winsorised log-ratio. */
export function fitValueFit(rows: SnapshotProtocol[]): ValueFit {
  const ys = rows.map((p) => Math.log(p.mcap_usd! / p.tvl_usd)).sort((a, b) => a - b);
  const lo = ys[Math.floor(0.02 * (ys.length - 1))]!;
  const hi = ys[Math.floor(0.98 * (ys.length - 1))]!;
  const X = rows.map((p) => [1, Math.log(p.tvl_usd / 100_000_000)]);
  const y = rows.map((p) => {
    const v = Math.log(p.mcap_usd! / p.tvl_usd);
    return Math.min(hi, Math.max(lo, v));
  });
  const beta = ols(X, y);
  let ss = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = Math.log(rows[i]!.mcap_usd! / rows[i]!.tvl_usd) - dot(beta, X[i]!);
    ss += r * r;
  }
  return { intercept: beta[0]!, sizeSlope: beta[1]!, n: rows.length, sigma: Math.sqrt(ss / rows.length), winsorLo: lo, winsorHi: hi };
}

/** The fitted multiple at a TVL: exp(intercept + slope x ln(TVL / $100M)). */
export function fittedMultiple(tvlUsd: number, fit: ValueFit): number {
  return Math.exp(fit.intercept + fit.sizeSlope * Math.log(tvlUsd / 100_000_000));
}

/** The fitted token-odds model: a logistic regression on log TVL, seven-day growth and chain count. */
export interface OddsFit {
  beta: number[];
  n: number;
  baseRate: number;
}

/** The peers the odds are fitted on: a recorded listing date, not an exchange, not a versioned pool. */
export function peerSet(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter((p) => p.category !== 'CEX' && !VERSIONED.test(p.name) && p.listed_at !== null && p.tvl_usd > 0);
}

/** The odds model's features for one protocol: intercept, log TVL, clamped growth, chain count. */
export function oddsFeatures(p: SnapshotProtocol): number[] {
  return [1, Math.log(p.tvl_usd / 100_000_000), Math.min(180, Math.max(-50, p.change_7d ?? 0)) / 100, p.chains.length];
}

/** Fit the odds model by iteratively reweighted least squares (Newton's method). */
export function fitOddsFit(rows: SnapshotProtocol[]): OddsFit {
  const X = rows.map((p) => oddsFeatures(p));
  const y = rows.map((p) => (isPreToken(p) ? 0 : 1));
  const k = X[0]!.length;
  const beta: number[] = Array<number>(k).fill(0);
  const ones = y.reduce((a, b) => a + b, 0);
  beta[0] = Math.log((ones + 0.5) / (rows.length - ones + 0.5));
  for (let it = 0; it < 100; it++) {
    const A: number[][] = Array.from({ length: k }, () => Array<number>(k).fill(0));
    const g: number[] = Array<number>(k).fill(0);
    for (let i = 0; i < rows.length; i++) {
      const mu = sigmoid(dot(beta, X[i]!));
      const w = Math.max(1e-6, mu * (1 - mu));
      for (let a = 0; a < k; a++) {
        g[a]! += X[i]![a]! * (y[i]! - mu);
        for (let c = 0; c < k; c++) A[a]![c]! += X[i]![a]! * X[i]![c]! * w;
      }
    }
    for (let a = 0; a < k; a++) A[a]![a]! += 1e-6;
    const delta = solveLinear(A, g);
    let mx = 0;
    for (let a = 0; a < k; a++) {
      beta[a]! += delta[a]!;
      mx = Math.max(mx, Math.abs(delta[a]!));
    }
    if (mx < 1e-8) break;
  }
  return { beta, n: rows.length, baseRate: ones / rows.length };
}

/** The token odds before bounding: the logistic model's raw probability. */
export function tokenOddsRaw(p: SnapshotProtocol, fit: OddsFit): number {
  return sigmoid(dot(fit.beta, oddsFeatures(p)));
}

/** The token odds: bounded to 5%-95%, so one week's growth alone never calls a protocol worthless or certain. */
export function tokenOdds(p: SnapshotProtocol, fit: OddsFit): number {
  return Math.min(0.95, Math.max(0.05, tokenOddsRaw(p, fit)));
}

// ------------------------------------------------------------------ the held-out evidence

/** One row of a held-out evidence table: a term's miss with and without it, in log units (value) or log-loss (odds). */
export interface EvidenceRow {
  term: string;
  loo: number;
  wf2024: number;
  wf2025: number;
  kept: boolean;
}

/**
 * The value model's evidence, on the 85 traded protocols of the fit set.
 * Leave-one-out refits the line without one protocol and predicts it; the
 * walk-forward fits on protocols listed before 2024-01-01 (27 rows) and
 * before 2025-01-01 (38 rows) and tests on the ones listed after. Miss is
 * the mean absolute error of ln(mcap / TVL); exp(miss) is the typical
 * multiplicative miss, about x4.5 for the kept line. Only the size curve
 * lowers the miss in all three columns, so only it stays.
 */
export const VALUE_EVIDENCE: EvidenceRow[] = [
  { term: 'flat multiple, no size curve', loo: 1.628, wf2024: 1.715, wf2025: 1.833, kept: false },
  { term: '+ size curve ln(TVL)', loo: 1.51, wf2024: 1.458, wf2025: 1.599, kept: true },
  { term: '+ category effects', loo: 1.526, wf2024: 1.547, wf2025: 1.639, kept: false },
  { term: '+ 7-day growth', loo: 1.542, wf2024: 1.477, wf2025: 1.563, kept: false },
  { term: '+ age with no token', loo: 1.515, wf2024: 1.665, wf2025: 2.534, kept: false },
  { term: '+ chain count', loo: 1.52, wf2024: 1.426, wf2025: 1.546, kept: false },
];

/**
 * The odds model's evidence, on the 532 peers. Miss is log-loss against the
 * recorded token status; the base rate alone scores 0.693. The walk-forward
 * fits on peers listed before each cutoff and tests on the ones listed after.
 * Age looks strong leave-one-out but collapses walk-forward (the test cohorts
 * are young, and a line fitted on old peers cannot price them), and category
 * collapses the same way, so both are out. Size, growth and chain count
 * lower the loss in all three columns and stay.
 */
export const ODDS_EVIDENCE: EvidenceRow[] = [
  { term: 'base rate only', loo: 0.6949, wf2024: 1.0943, wf2025: 0.8637, kept: false },
  { term: '+ age (log days)', loo: 0.6487, wf2024: 0.7464, wf2025: 1.2051, kept: false },
  { term: '+ size ln(TVL)', loo: 0.6905, wf2024: 1.0935, wf2025: 0.8563, kept: true },
  { term: '+ 7-day growth', loo: 0.6757, wf2024: 1.0105, wf2025: 0.8168, kept: true },
  { term: '+ chain count', loo: 0.6751, wf2024: 0.9988, wf2025: 0.8088, kept: true },
  { term: '+ category effects', loo: 0.6676, wf2024: 1.8582, wf2025: 0.8178, kept: false },
];

/**
 * How honest the value model's ranges are, on the 85 traded protocols: the share of real market
 * caps inside the printed ranges. radar-7 corrects the P10-P90 figure radar-6 printed as 89%:
 * recomputing from the snapshot, 85% of traded market caps fall inside the true P10-P90 band
 * (predicted log-ratio +/- 1.2816 sigma); 89% is the share inside the wider +/- 1.6449 sigma
 * band, which is a 90% interval, not the P10-P90 range the board prints. The P25-P75 figure
 * (54%, claim 50%) recomputes exactly.
 */
export const VALUE_CALIBRATION = { n: 85, sigma: 1.942, p25p75Pct: 54, p10p90Pct: 85 };

/** How honest the odds model is: Brier score against the base rate, and mean prediction against observed rate by decile. */
export const ODDS_CALIBRATION = {
  brierModel: 0.2374,
  brierBase: 0.2499,
  deciles: [
    { pred: 0.29, observed: 0.302, n: 53 },
    { pred: 0.397, observed: 0.264, n: 53 },
    { pred: 0.434, observed: 0.415, n: 53 },
    { pred: 0.46, observed: 0.415, n: 53 },
    { pred: 0.479, observed: 0.5, n: 54 },
    { pred: 0.505, observed: 0.66, n: 53 },
    { pred: 0.528, observed: 0.547, n: 53 },
    { pred: 0.557, observed: 0.547, n: 53 },
    { pred: 0.593, observed: 0.66, n: 53 },
    { pred: 0.679, observed: 0.611, n: 54 },
  ],
};

// ------------------------------------------------------------------ the farm verdict

/** The standard farm plan the verdict is costed on: one deposit, twelve weeks, a 7% drop share. */
export const FARM_PLAN = {
  depositUsd: 10000,
  weeks: 12,
  dropShare: 0.07,
  actions: 13,
  hours: 3.5,
  tbillRate: 0.04,
  hourlyRate: 40,
  safetyMarginUsd: 50,
  exitDropPct: 17.5,
};

/** What one transaction costs on a chain, in dollars, as a gas estimate. */
export function gasUsd(chain: string): number {
  const c = chain.toLowerCase();
  if (c.includes('ethereum')) return 12;
  if (c.includes('solana')) return 0.05;
  if (c.includes('arbitrum') || c.includes('optimism') || c.includes('base') || c.includes('zksync') || c.includes('linea')) return 1;
  if (c.includes('bsc') || c.includes('bnb')) return 0.3;
  if (c.includes('polygon')) return 0.1;
  if (c.includes('avalanche')) return 0.5;
  return 3;
}

/** What one transaction costs on a chain, as a gas estimate in words. */
export function gasFor(chain: string): string {
  return `about $${gasUsd(chain)} of gas`;
}

/** A farm verdict: the costed economics of the standard plan on one protocol. */
export interface FarmVerdict {
  depositUsd: number;
  dropUsd: number;
  feesUsd: number;
  hours: number;
  netUsd: number;
  netPerHourUsd: number;
  tbillUsd: number;
  breakevenUsd: number;
  breakevenSharePct: number;
  exitTvlUsd: number;
  verdict: 'FARM' | 'MARGINAL' | 'SKIP';
}

/**
 * The verdict for one protocol under the standard plan: a $10,000 deposit for
 * twelve weeks buys a modelled drop of (deposit / TVL) x 7% x implied value.
 * Fees are thirteen fee-bearing actions on the protocol's main chain; hours
 * are thirty minutes to set up plus fifteen minutes a week. The T-bill is
 * what the same deposit earns at 4% a year over the twelve weeks.
 *
 * radar-7 tightens radar-6's rule, which called FARM anything whose net beat
 * the T-bill and paid $25 an hour — a bar so low the net only had to clear
 * $92.31, and 67 of 226 rows passed. That rule let a plan through when it
 * beat the risk-free return by cents, and priced skilled time at $25 an
 * hour. The radar-7 rule demands both, with a real margin: FARM means the
 * net clears the T-bill by at least $50 (a margin of safety on a modelled
 * drop that assumes a 7% drop share and an implied value that is itself a
 * model) AND pays at least $40 an hour for the 3.5 hours the plan takes.
 * MARGINAL means the net is positive but not both; SKIP means the fees eat
 * the drop. The break-even is the drop that clears the FARM bar — fees plus
 * the T-bill plus the $50 margin — as a share of the implied value; the exit
 * is a TVL fall of 17.5% in one week, or two weekly falls in a row.
 */
export function farmVerdict(p: SnapshotProtocol, implied: number): FarmVerdict {
  const depositUsd = FARM_PLAN.depositUsd;
  const feesUsd = FARM_PLAN.actions * gasUsd(p.chains.length > 0 ? p.chains[0]! : '');
  const hours = FARM_PLAN.hours;
  const dropUsd = (depositUsd / p.tvl_usd) * FARM_PLAN.dropShare * implied;
  const netUsd = dropUsd - feesUsd;
  const netPerHourUsd = netUsd / hours;
  const tbillUsd = depositUsd * FARM_PLAN.tbillRate * (FARM_PLAN.weeks / 52);
  const breakevenUsd = feesUsd + tbillUsd + FARM_PLAN.safetyMarginUsd;
  const breakevenSharePct = ((breakevenUsd / ((depositUsd / p.tvl_usd) * implied)) * 100);
  const exitTvlUsd = Math.round(p.tvl_usd * (1 - FARM_PLAN.exitDropPct / 100));
  const verdict: FarmVerdict['verdict'] = netUsd >= tbillUsd + FARM_PLAN.safetyMarginUsd && netPerHourUsd >= FARM_PLAN.hourlyRate ? 'FARM' : netUsd > 0 ? 'MARGINAL' : 'SKIP';
  return { depositUsd, dropUsd: Math.round(dropUsd * 100) / 100, feesUsd: Math.round(feesUsd * 100) / 100, hours, netUsd: Math.round(netUsd * 100) / 100, netPerHourUsd: Math.round(netPerHourUsd * 100) / 100, tbillUsd: Math.round(tbillUsd * 100) / 100, breakevenUsd: Math.round(breakevenUsd * 100) / 100, breakevenSharePct: Math.round(breakevenSharePct * 10) / 10, exitTvlUsd, verdict };
}

// ------------------------------------------------------------------ the board's rows

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    fitted_multiple: number;
    token_odds: number;
    value_if_launches_usd: number;
    p25_usd: number;
    p75_usd: number;
    p10_usd: number;
    p90_usd: number;
    rank_lo: number;
    rank_hi: number;
    age_days: number | null;
  };
  farm: FarmVerdict;
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  fitted_multiple: number;
  token_odds: number;
  value_if_launches_usd: number;
  p25_usd: number;
  p75_usd: number;
  p10_usd: number;
  p90_usd: number;
  rank_lo: number;
  rank_hi: number;
  farm_verdict: 'FARM' | 'MARGINAL' | 'SKIP';
  farm_net_usd: number;
  farm_net_per_hour_usd: number;
  farm_drop_usd: number;
  farm_fees_usd: number;
  farm_tbill_usd: number;
  farm_breakeven_share_pct: number;
  farm_exit_tvl_usd: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** The two fits the dashboard recomputes from, so the page and the board are the same arithmetic. */
export interface ModelFit {
  value: ValueFit;
  odds: OddsFit;
}

/** The integrity strip: every one of the snapshot's protocols, in exactly one group. */
export interface IntegrityCounts {
  total: number;
  ranked: number;
  watchlist: number;
  early: number;
  preCex: number;
  preVersioned: number;
  preAboveFloor: number;
  liveTotal: number;
  liveShown: number;
  liveRest: number;
  liveCex: number;
  liveVersioned: number;
  liveOther: number;
}

/** The audit line: the machine-checkable claim that this table is board.json. */
export interface AuditLine {
  rows: number;
  totalImpliedUsd: number;
  seal: string;
  watchlistRanked: number;
  watchlistSize: number;
}

/** Everything the dashboard needs: the board, the live set, the fits, and the evidence. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  fit: ModelFit;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  value_evidence: EvidenceRow[];
  odds_evidence: EvidenceRow[];
  value_calibration: typeof VALUE_CALIBRATION;
  odds_calibration: typeof ODDS_CALIBRATION;
  integrity: IntegrityCounts;
  audit: AuditLine;
  farm_plan: typeof FARM_PLAN;
  farm_counts: { farm: number; marginal: number; skip: number };
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** The fitted multiple, the odds and the implied value one protocol gets under the fits. */
export function impliedValue(protocol: SnapshotProtocol, fit: ModelFit): { implied: number; fittedMultiple: number; odds: number; valueIfLaunches: number } {
  const mult = fittedMultiple(protocol.tvl_usd, fit.value);
  const odds = tokenOdds(protocol, fit.odds);
  const valueIfLaunches = protocol.tvl_usd * mult;
  const implied = Math.max(1, Math.round(valueIfLaunches * odds));
  return { implied, fittedMultiple: round4(mult), odds: round4(odds), valueIfLaunches: Math.round(valueIfLaunches) };
}

/** A short fingerprint of the snapshot: a hash of every slug with its TVL, so the integrity strip can name it. */
export function snapshotFingerprint(snapshot: Snapshot): string {
  let h = 0x811c9dc5;
  const text = snapshot.protocols.map((p) => `${p.slug}:${p.tvl_usd}`).sort().join('|');
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

// ------------------------------------------------------------------ building the board

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** One bootstrap refit's implied values for the board's rows, from resampled fit sets. */
function bootstrapImplied(
  rows: SnapshotProtocol[],
  traded: SnapshotProtocol[],
  peers: SnapshotProtocol[],
  rand: () => number,
): number[] {
  const resampledTraded = Array.from({ length: traded.length }, () => traded[Math.floor(rand() * traded.length)]!);
  const resampledPeers = Array.from({ length: peers.length }, () => peers[Math.floor(rand() * peers.length)]!);
  const valueFit = fitValueFit(resampledTraded);
  const oddsFit = fitOddsFit(resampledPeers);
  return rows.map((p) => Math.max(1, Math.round(p.tvl_usd * fittedMultiple(p.tvl_usd, valueFit) * tokenOdds(p, oddsFit))));
}

/** A quantile of a sorted array, by position. */
function quantileOf(sorted: number[], q: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
}

/**
 * The protocols the board ranks, strongest first, with ranks 1..n, each with
 * its fitted multiple, its odds, its bootstrap ranges and its farm verdict.
 * The fits are computed from the snapshot itself at build time, so the same
 * snapshot always builds the same board.
 */
export function buildBoard(snapshot: Snapshot): BoardRow[] {
  const fit: ModelFit = { value: fitValueFit(tradedFitSet(snapshot)), odds: fitOddsFit(peerSet(snapshot)) };
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but the
  // board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: pre-token protocols below the watchlist floor, by TVL, capped. Never a replacement
  // for a watchlist row: a chosen protocol stays chosen.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const { implied, fittedMultiple: mult, odds, valueIfLaunches } = impliedValue(p, fit);
    return { p, implied, mult, odds, valueIfLaunches, age: ageDays(snapshot.as_of, p.listed_at) };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));

  // The bootstrap: 200 refits of both fits on resampled training sets, each
  // re-ranking the board, so every row carries the range its value and its
  // rank take across refits. One seeded generator, so the ranges are stable.
  const rand = mulberry32(BOOTSTRAP_SEED);
  const traded = tradedFitSet(snapshot);
  const peers = peerSet(snapshot);
  const bootValues: number[][] = scored.map(() => []);
  const bootRanks: number[][] = scored.map(() => []);
  for (let b = 0; b < BOOTSTRAP_REFITS; b++) {
    const vals = bootstrapImplied(scored.map((s) => s.p), traded, peers, rand);
    const order = vals.map((v, i) => [v, i] as const).sort((x, y) => y[0] - x[0] || (scored[x[1]]!.p.slug < scored[y[1]]!.p.slug ? -1 : 1));
    const rankOf = new Array<number>(vals.length);
    order.forEach(([, i], pos) => {
      rankOf[i] = pos + 1;
    });
    vals.forEach((v, i) => {
      bootValues[i]!.push(v);
      bootRanks[i]!.push(rankOf[i]!);
    });
  }
  return scored.map((s, i) => {
    const values = [...bootValues[i]!].sort((a, b) => a - b);
    const ranks = [...bootRanks[i]!].sort((a, b) => a - b);
    const verdict = farmVerdict(s.p, s.implied);
    return {
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      mcap_usd: s.p.mcap_usd,
      listed_at: s.p.listed_at,
      gecko_id: s.p.gecko_id,
      symbol: s.p.symbol,
      token_status: 'pre-token',
      age_days: s.age,
      implied_value_usd: s.implied,
      model: {
        fitted_multiple: s.mult,
        token_odds: s.odds,
        value_if_launches_usd: s.valueIfLaunches,
        p25_usd: quantileOf(values, 0.25),
        p75_usd: quantileOf(values, 0.75),
        p10_usd: quantileOf(values, 0.1),
        p90_usd: quantileOf(values, 0.9),
        rank_lo: quantileOf(ranks, 0.1),
        rank_hi: quantileOf(ranks, 0.9),
        age_days: s.age,
      },
      farm: verdict,
      farm_steps: farmSteps(s.p, s.age).map(stepText),
    };
  });
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** The one qualifying position, written as a sentence a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Lend $${capital} in USDC on ${name} (${chain}) and leave the supply earning for the full hold.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Add $${capital} of liquidity to the main ${name} pool on ${chain} and leave it in range.`;
  if (c.includes('bridge')) return `Move $${capital} in USDC across ${name} to ${chain}, then put those funds to work in its app once.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the native asset via ${name}, keep the receipt, and do not unstake early.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Post $${capital} in USDC as margin on ${name} and open a single small hedged trade.`;
  if (c.includes('prediction')) return `Fund ${name} with $${capital} and take one small market position.`;
  if (c.includes('curator') || c.includes('allocator')) return `Put $${capital} into a ${name} vault on ${chain} and hold the vault shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the yield-bearing asset on ${name} (${chain}) and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active.`;
  return `Deposit $${capital} in USDC into ${name} on ${chain} and keep the position open.`;
}

/** What to watch for this protocol, from its own category and growth. */
export function riskNoteFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  const growth = p.change_7d ?? 0;
  if (c.includes('lend') || c.includes('cdp')) return 'Watch borrow rates and liquidation levels weekly; a sharp TVL fall means unwind first.';
  if (c.includes('dex') || c.includes('yield')) return 'Watch pool range and impermanent loss; leave if the pool drifts out of range for two weeks.';
  if (c.includes('bridge')) return 'Bridge only small amounts at a time and check the destination chain before each move.';
  if (c.includes('rwa')) return 'Check the underlying asset and yield source monthly; RWA yield is only as good as its backing.';
  if (growth < -10) return 'TVL fell more than 10% in seven days: size down and re-check before adding more.';
  return 'Check TVL and the points page weekly; stop adding if TVL falls for two weeks in a row.';
}

/** The weekly qualifying action, specific to the protocol's category. */
function weeklyActionFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp')) return `Weekly: add a little supply, borrow a small amount, then repay it on ${name}.`;
  if (c.includes('dex') || c.includes('yield')) return `Weekly: swap once, top up liquidity in ${name}'s main pool, and check the range.`;
  if (c.includes('bridge')) return `Weekly: bridge a small amount via ${name} and use it once where it lands.`;
  if (c.includes('staking') || c.includes('restak')) return `Weekly: check the ${name} staking receipt and compound any rewards shown.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Weekly: open and close one small hedged trade on ${name} and note the funding paid.`;
  if (c.includes('rwa')) return `Weekly: check yield accrual on ${name} and file the receipt in your log.`;
  if (c.includes('curator') || c.includes('allocator')) return `Weekly: review the ${name} vault allocation and leave shares alone unless the vault moves.`;
  return `Weekly: do one qualifying action on ${name}, such as a deposit, a swap or a vote.`;
}

/**
 * A protocol's farm plan: seven steps on the standard $10,000, twelve-week
 * plan, each an action with a cost and a time. The plan is derived from the
 * protocol's own record (category, chains, TVL, age, seven-day growth),
 * never from a hand-written list of names. The deposit is the standard plan
 * size the verdict is costed on, so the steps and the verdict agree.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = FARM_PLAN.depositUsd;
  const hold = FARM_PLAN.weeks * 7;
  const action = actionFor(p, capital, chain);
  const weekly = weeklyActionFor(p);
  const gas = gasFor(chain);
  const growth = p.change_7d === null ? 'no seven-day change on record' : `${p.change_7d >= 0 ? '+' : ''}${p.change_7d.toFixed(1)}% in seven days`;
  const tvl = p.tvl_usd >= 1_000_000_000 ? `$${(p.tvl_usd / 1_000_000_000).toFixed(2)}B` : `$${Math.round(p.tvl_usd / 1_000_000)}M`;
  const exitTvl = Math.round(p.tvl_usd * (1 - FARM_PLAN.exitDropPct / 100));
  const exitTvlText = exitTvl >= 1_000_000_000 ? `$${(exitTvl / 1_000_000_000).toFixed(2)}B` : `$${Math.round(exitTvl / 1_000_000)}M`;
  void age;
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: `${action} This protocol holds ${tvl} of TVL and moved ${growth}, so the position is sized to the standard plan, not to a guess.`,
      cost: `$${capital} of capital and ${gas}`,
      time: '30 minutes to set up',
    },
    {
      text: weekly,
      cost: `${gas} a week`,
      time: '15 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot, and check the ${chain} gas price before each action.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: riskNoteFor(p),
      cost: 'nothing to check',
      time: '5 minutes to check',
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes, never from a link in a message.`,
      cost: 'no fee to check, and never pay to claim',
      time: '15 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it. Exit if TVL falls below ${exitTvlText} in one week, or falls two weeks in a row.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** The integrity strip's counts: every protocol of the snapshot in exactly one group. */
export function integrityCounts(snapshot: Snapshot, board: BoardRow[]): IntegrityCounts {
  const ranked = new Set(board.map((r) => r.slug));
  let preCex = 0;
  let preVersioned = 0;
  let preAboveFloor = 0;
  let liveTotal = 0;
  let liveCex = 0;
  let liveVersioned = 0;
  for (const p of snapshot.protocols) {
    if (isPreToken(p)) {
      if (ranked.has(p.slug)) continue;
      if (p.category === 'CEX') preCex++;
      else if (VERSIONED.test(p.name)) preVersioned++;
      else if (p.tvl_usd >= snapshot.floor_usd) preAboveFloor++;
      else throw new Error(`integrity: ${p.slug} is pre-token, below the floor and unranked`);
    } else {
      liveTotal++;
      if (p.category === 'CEX') liveCex++;
      else if (VERSIONED.test(p.name)) liveVersioned++;
    }
  }
  const live = liveRows(snapshot);
  return {
    total: snapshot.protocols.length,
    ranked: board.length,
    watchlist: snapshot.watchlist.length,
    early: board.length - snapshot.watchlist.length,
    preCex,
    preVersioned,
    preAboveFloor,
    liveTotal,
    liveShown: live.length,
    liveRest: liveTotal - live.length,
    liveCex,
    liveVersioned,
    liveOther: liveTotal - liveCex - liveVersioned,
  };
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    fitted_multiple: row.model.fitted_multiple,
    token_odds: row.model.token_odds,
    value_if_launches_usd: row.model.value_if_launches_usd,
    p25_usd: row.model.p25_usd,
    p75_usd: row.model.p75_usd,
    p10_usd: row.model.p10_usd,
    p90_usd: row.model.p90_usd,
    rank_lo: row.model.rank_lo,
    rank_hi: row.model.rank_hi,
    farm_verdict: row.farm.verdict,
    farm_net_usd: row.farm.netUsd,
    farm_net_per_hour_usd: row.farm.netPerHourUsd,
    farm_drop_usd: row.farm.dropUsd,
    farm_fees_usd: row.farm.feesUsd,
    farm_tbill_usd: row.farm.tbillUsd,
    farm_breakeven_share_pct: row.farm.breakevenSharePct,
    farm_exit_tvl_usd: row.farm.exitTvlUsd,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  let farm = 0;
  let marginal = 0;
  let skip = 0;
  for (const r of board) {
    if (r.farm.verdict === 'FARM') farm++;
    else if (r.farm.verdict === 'MARGINAL') marginal++;
    else skip++;
  }
  const totalImpliedUsd = board.reduce((acc, r) => acc + r.implied_value_usd, 0);
  const watchlistSet = new Set(snapshot.watchlist);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    fit: { value: fitValueFit(tradedFitSet(snapshot)), odds: fitOddsFit(peerSet(snapshot)) },
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    value_evidence: VALUE_EVIDENCE,
    odds_evidence: ODDS_EVIDENCE,
    value_calibration: VALUE_CALIBRATION,
    odds_calibration: ODDS_CALIBRATION,
    integrity: integrityCounts(snapshot, board),
    audit: {
      rows: board.length,
      totalImpliedUsd,
      seal: snapshotFingerprint(snapshot),
      watchlistRanked: board.filter((r) => watchlistSet.has(r.slug)).length,
      watchlistSize: snapshot.watchlist.length,
    },
    farm_plan: FARM_PLAN,
    farm_counts: { farm, marginal, skip },
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** A one-line summary of a board, for the program's own log and the dashboard's lede. */
export interface BoardSummary {
  rows: number;
  watchlist: number;
  early: number;
  totalImpliedUsd: number;
  medianImpliedUsd: number;
  topCategory: string | null;
  topCategoryImpliedUsd: number;
}

export function summarizeBoard(board: BoardRow[], watchlistSize: number): BoardSummary {
  const sorted = [...board].sort((a, b) => b.implied_value_usd - a.implied_value_usd);
  const total = sorted.reduce((acc, row) => acc + row.implied_value_usd, 0);
  const middle = sorted[Math.floor(sorted.length / 2)];
  const byCategory = new Map<string, number>();
  for (const row of sorted) {
    const key = row.category ?? 'Other';
    byCategory.set(key, (byCategory.get(key) ?? 0) + row.implied_value_usd);
  }
  let topCategory: string | null = null;
  let topValue = 0;
  for (const [name, value] of byCategory) {
    if (value > topValue) {
      topCategory = name;
      topValue = value;
    }
  }
  return {
    rows: board.length,
    watchlist: watchlistSize,
    early: board.length - watchlistSize,
    totalImpliedUsd: total,
    medianImpliedUsd: middle ? middle.implied_value_usd : 0,
    topCategory,
    topCategoryImpliedUsd: topValue,
  };
}

/** Implied value by category, highest first, for the dashboard's breakdown. */
export interface CategoryShare {
  category: string;
  rows: number;
  totalImpliedUsd: number;
  sharePct: number;
}

export function categoryBreakdown(board: BoardRow[]): CategoryShare[] {
  const total = board.reduce((acc, row) => acc + row.implied_value_usd, 0);
  const grouped = new Map<string, { rows: number; total: number }>();
  for (const row of board) {
    const key = row.category ?? 'Other';
    const entry = grouped.get(key) ?? { rows: 0, total: 0 };
    entry.rows += 1;
    entry.total += row.implied_value_usd;
    grouped.set(key, entry);
  }
  return [...grouped.entries()]
    .map(([category, entry]) => ({
      category,
      rows: entry.rows,
      totalImpliedUsd: entry.total,
      sharePct: total > 0 ? Math.round((entry.total / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.totalImpliedUsd - a.totalImpliedUsd);
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
    if (r.model.token_odds < 0.05 || r.model.token_odds > 0.95) return `${r.slug} has token odds ${r.model.token_odds} outside 5%-95%`;
    if (r.model.p25_usd > r.model.p75_usd || r.model.p10_usd > r.model.p90_usd) return `${r.slug} has a range that runs backwards`;
    if (r.model.rank_lo > r.model.rank_hi) return `${r.slug} has a rank range that runs backwards`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
